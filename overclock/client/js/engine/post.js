/* Post-processing: anti-aliasing, bloom and a filmic curve.
 *
 * The scene renders into a texture instead of straight to the canvas, and
 * this composites it. Three things happen, in the order they matter for a
 * game made of hard-edged boxes:
 *
 *   Anti-aliasing. Low-poly geometry is nothing but long straight edges at
 *   shallow angles, which is the worst case for aliasing and the single
 *   most visible cheap win available. FXAA runs on the final image for
 *   roughly the cost of one fullscreen pass, and unlike MSAA it costs the
 *   same whether the scene has four hundred boxes or four thousand.
 *
 *   Bloom. A bright-pass, two separable blurs at quarter resolution, added
 *   back. This is what makes emissive strips, muzzle flashes and sunlit
 *   surfaces read as light rather than as pale paint.
 *
 *   A highlight roll-off. Only above a knee, and only to catch what the
 *   bloom add pushes past the ceiling. The scene arrives here already
 *   exposed and clamped by the box shader, so a full tone curve at this
 *   stage would be mapping display-referred colour a second time - see the
 *   note at the composite for why that is what greys out a high-key
 *   palette.
 *
 * All of it is off on the low preset: a phone that is struggling wants its
 * fill rate spent on the scene, not on three more fullscreen passes.
 */

import { compile, buffer } from './gl.js';

const FS_QUAD = new Float32Array([-1, -1, 3, -1, -1, 3]);

const VS = `
precision highp float;
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* Everything above the threshold, softened at the knee so a surface that
   drifts across it does not pop. */
const BRIGHT_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = texture2D(uScene, vUV).rgb;
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp((b - uThreshold + uKnee) / (2.0 * uKnee), 0.0, 1.0);
  float w = max(soft * soft * uKnee, b - uThreshold) / max(b, 0.0001);
  gl_FragColor = vec4(c * w, 1.0);
}`;

/* A separable nine-tap blur, run twice. The offsets are the standard
   linear-sampling trick: five texture fetches cover nine taps because the
   hardware interpolates between neighbouring texels for free. */
const BLUR_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  vec3 c = texture2D(uTex, vUV).rgb * 0.2270270270;
  c += texture2D(uTex, vUV + o1).rgb * 0.3162162162;
  c += texture2D(uTex, vUV - o1).rgb * 0.3162162162;
  c += texture2D(uTex, vUV + o2).rgb * 0.0702702703;
  c += texture2D(uTex, vUV - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FS = (fxaa, bloom) => `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uScene;
${bloom ? 'uniform sampler2D uBloom;\nuniform float uBloomStrength;' : ''}
uniform vec2 uTexel;
uniform float uVignette;
uniform float uContrast;
uniform float uSaturate;
uniform float uKnee;

${fxaa ? `
/* FXAA, the console-era version: find the local luma range, bail on flat
   areas, otherwise step along the edge and take a blended sample. Compact
   enough to read, and it removes the crawling on long shallow edges that
   is the characteristic artefact of this kind of geometry. */
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxaa(sampler2D tex, vec2 uv, vec2 texel) {
  vec3 rgbM = texture2D(tex, uv).rgb;
  float lM = luma(rgbM);
  float lNW = luma(texture2D(tex, uv + vec2(-1.0, -1.0) * texel).rgb);
  float lNE = luma(texture2D(tex, uv + vec2( 1.0, -1.0) * texel).rgb);
  float lSW = luma(texture2D(tex, uv + vec2(-1.0,  1.0) * texel).rgb);
  float lSE = luma(texture2D(tex, uv + vec2( 1.0,  1.0) * texel).rgb);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;

  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, -8.0, 8.0) * texel;

  vec3 a = 0.5 * (texture2D(tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb
                + texture2D(tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tex, uv + dir * -0.5).rgb
                           + texture2D(tex, uv + dir * 0.5).rgb);
  float lB = luma(b);
  return (lB < lMin || lB > lMax) ? a : b;
}` : ''}

void main() {
  vec3 col = ${fxaa ? 'fxaa(uScene, vUV, uTexel)' : 'texture2D(uScene, vUV).rgb'};
${bloom ? '  col += texture2D(uBloom, vUV).rgb * uBloomStrength;' : ''}

  /* Roll off the bloom's overshoot, and only that.
     The scene target is an 8-bit LDR texture: the box shader has already
     exposed and clamped, so the image arriving here is display-referred.
     Running a full filmic curve over it a second time is double
     tone-mapping, and on a deliberately high-key palette that is not a
     subtle error - an ACES fit maps 1.0 to 0.80 and squeezes the whole
     0.70-1.00 range, where most of every map sits, into the 0.72-0.80
     band, while lifting 0.15 to 0.22. Bright surfaces stop separating and
     shadows go milky. So the curve applies to the highlights only, above a
     knee, where the sole thing that can exceed the ceiling is the bloom
     added a few lines up. The knee sits above the brightest value any map
     can actually light a surface to - tools/check-lighting.mjs measures
     that and asserts the relationship - so a lit surface passes through
     untouched and only blown highlights are compressed. The roll-off is C1
     at the knee (slope 1 either side), so a surface drifting across it
     does not pop. */
  float peak = max(col.r, max(col.g, col.b));
  if (peak > uKnee) {
    float over = peak - uKnee;
    float head = 1.0 - uKnee;
    col *= (uKnee + head * over / (over + head)) / peak;
  }

  /* Tone mapping of any kind pulls colour toward grey, because it
     compresses the bright channel of a saturated pixel harder than the
     dim ones. Push back by the same small amount it takes away. */
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(grey), col, uSaturate);
  col = (col - 0.5) * uContrast + 0.5;
  col = clamp(col, 0.0, 1.0);

  vec2 d = vUV - 0.5;
  col *= 1.0 - dot(d, d) * uVignette;

  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  constructor(gl) {
    this.gl = gl;
    this.enabled = false;
    this.bloom = false;
    this.fxaa = false;
    this.width = 0;
    this.height = 0;
    this.quad = buffer(gl, gl.ARRAY_BUFFER, FS_QUAD);
    this.scene = null;
    this.bright = null;
    this.blurA = null;
    this.blurB = null;
    this.programs = {};
    this.bloomStrength = 0.55;
    this.vignette = 0.22;
    this.contrast = 1.06;
    this.saturate = 1.12;
    this.knee = 0.94;
    this.available = true;
    try {
      this.progBright = compile(gl, VS, BRIGHT_FS, 'bright');
      this.progBlur = compile(gl, VS, BLUR_FS, 'blur');
    } catch (err) {
      console.warn('post-processing unavailable:', err.message);
      this.available = false;
    }
  }

  configure({ fxaa, bloom }) {
    if (!this.available) { this.enabled = false; return; }
    this.fxaa = !!fxaa;
    this.bloom = !!bloom;
    this.enabled = this.fxaa || this.bloom;
    const key = `${this.fxaa}|${this.bloom}`;
    if (this.enabled && !this.programs[key]) {
      try {
        this.programs[key] = compile(this.gl, VS, COMPOSITE_FS(this.fxaa, this.bloom), 'composite');
      } catch (err) {
        console.warn('composite shader failed:', err.message);
        this.enabled = false;
        return;
      }
    }
    this.progComposite = this.programs[key];
  }

  _target(w, h, depth) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (depth) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    const okStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return okStatus ? { tex, fbo, rb, w, h } : null;
  }

  _free(t) {
    if (!t) return;
    const gl = this.gl;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
    if (t.rb) gl.deleteRenderbuffer(t.rb);
  }

  resize(w, h) {
    if (!this.enabled || (w === this.width && h === this.height && this.scene)) return this.enabled;
    this.width = w; this.height = h;
    for (const t of [this.scene, this.bright, this.blurA, this.blurB]) this._free(t);
    this.scene = this._target(w, h, true);
    if (!this.scene) { this.enabled = false; return false; }
    if (this.bloom) {
      const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
      this.bright = this._target(bw, bh, false);
      this.blurA = this._target(bw, bh, false);
      this.blurB = this._target(bw, bh, false);
      if (!this.bright || !this.blurA || !this.blurB) { this.bloom = false; }
    }
    return this.enabled;
  }

  /* Bind the offscreen target the scene should render into. Returns false
     when post is off or unavailable, and the caller draws to the canvas. */
  begin(w, h) {
    if (!this.enabled) return false;
    if (!this.resize(w, h)) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, w, h);
    return true;
  }

  _blit(program, setup, target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.width, target ? target.h : this.height);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(program.a.aPos);
    gl.vertexAttribPointer(program.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(program.a.aPos, 0);
    setup(program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  end(canvasW, canvasH) {
    if (!this.enabled || !this.scene) return 0;
    const gl = this.gl;
    let calls = 0;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    if (this.bloom && this.bright) {
      this._blit(this.progBright, (p) => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
        gl.uniform1i(p.u.uScene, 0);
        gl.uniform1f(p.u.uThreshold, 0.72);
        gl.uniform1f(p.u.uKnee, 0.22);
      }, this.bright);
      calls++;
      const px = 1 / this.bright.w, py = 1 / this.bright.h;
      this._blit(this.progBlur, (p) => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bright.tex);
        gl.uniform1i(p.u.uTex, 0);
        gl.uniform2f(p.u.uDir, px, 0);
      }, this.blurA);
      this._blit(this.progBlur, (p) => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.blurA.tex);
        gl.uniform1i(p.u.uTex, 0);
        gl.uniform2f(p.u.uDir, 0, py);
      }, this.blurB);
      calls += 2;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);
    this._blit(this.progComposite, (p) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      gl.uniform1i(p.u.uScene, 0);
      if (this.bloom && this.blurB) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blurB.tex);
        gl.uniform1i(p.u.uBloom, 1);
        gl.uniform1f(p.u.uBloomStrength, this.bloomStrength);
      }
      gl.uniform2f(p.u.uTexel, 1 / this.width, 1 / this.height);
      gl.uniform1f(p.u.uVignette, this.vignette);
      gl.uniform1f(p.u.uContrast, this.contrast);
      gl.uniform1f(p.u.uSaturate, this.saturate);
      gl.uniform1f(p.u.uKnee, this.knee);
    }, null);
    calls++;
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
    return calls;
  }

  dispose() {
    for (const t of [this.scene, this.bright, this.blurA, this.blurB]) this._free(t);
    this.scene = this.bright = this.blurA = this.blurB = null;
    this.width = this.height = 0;
  }
}
