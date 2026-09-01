/* The box batch — effectively the entire renderer.
 *
 * Every solid thing in this game is a box: map brushes, player limbs, the
 * weapon in your hands, the crates. So there is one unit cube in video
 * memory and one instance buffer describing where the copies go, and the
 * whole map draws in a single call. Adding detail to a map costs an entry
 * in an array, not a draw call, which is what lets a phone hold 60 FPS
 * with four hundred brushes on screen.
 *
 * Shaders are written in GLSL ES 1.00 deliberately: WebGL2 accepts them
 * and WebGL1 requires them, so there is one source rather than two.
 */

import { compile, buffer } from './gl.js';

export const FLOATS_PER_INSTANCE = 14;
//  0..2  centre        3..5  half extents      6..7  yaw, pitch
//  8..10 colour       11     emissive         12     alpha   13  tint/shade

const CUBE_POS = [];
const CUBE_NRM = [];
const CUBE_LOC = [];
const CUBE_IDX = [];
(function buildCube() {
  const faces = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  let v = 0;
  for (const [n, quad] of faces) {
    for (const p of quad) {
      CUBE_POS.push(p[0], p[1], p[2]);
      CUBE_NRM.push(n[0], n[1], n[2]);
      CUBE_LOC.push(p[0], p[1], p[2]);
    }
    CUBE_IDX.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
})();

const VS = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aLocal;
attribute vec3 iCentre;
attribute vec3 iHalf;
attribute vec2 iRot;
attribute vec3 iColour;
attribute vec3 iParams;      // emissive, alpha, shade

uniform mat4 uViewProj;
uniform vec3 uEye;

varying vec3 vNormal;
varying vec3 vColour;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vParams;
varying float vDepth;

void main() {
  float cy = cos(iRot.x), sy = sin(iRot.x);
  float cp = cos(iRot.y), sp = sin(iRot.y);
  // Pitch about X then yaw about Y. Boxes never roll, so two angles is
  // the whole rotation model and it costs four trig calls per instance.
  vec3 p = aPos * iHalf;
  vec3 n = aNormal;
  vec3 p1 = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  vec3 n1 = vec3(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp);
  vec3 p2 = vec3(p1.x * cy + p1.z * sy, p1.y, -p1.x * sy + p1.z * cy);
  vec3 n2 = vec3(n1.x * cy + n1.z * sy, n1.y, -n1.x * sy + n1.z * cy);

  vec3 world = iCentre + p2;
  vWorld = world;
  vNormal = n2;
  vColour = iColour;
  vLocal = aLocal;
  vParams = iParams;
  vec4 clip = uViewProj * vec4(world, 1.0);
  vDepth = length(world - uEye);
  gl_Position = clip;
}`;

const FS = (maxLights, detail) => `
precision highp float;
varying vec3 vNormal;
varying vec3 vColour;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vParams;
varying float vDepth;

uniform vec3 uSunDir;
uniform vec3 uSunColour;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform vec3 uFogColour;
uniform vec2 uFogRange;
uniform float uExposure;
uniform float uSaturation;
#if ${maxLights} > 0
uniform vec4 uLightPos[${Math.max(1, maxLights)}];   // xyz + radius
uniform vec4 uLightCol[${Math.max(1, maxLights)}];   // rgb + intensity
uniform int uLightCount;
#endif

void main() {
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, -uSunDir), 0.0);
  // A little wrap on the sun keeps unlit faces readable instead of black.
  float wrapped = max((dot(n, -uSunDir) + 0.35) / 1.35, 0.0);
  vec3 light = uSunColour * (ndl * 0.72 + wrapped * 0.28);
  light += mix(uAmbientGround, uAmbientSky, n.y * 0.5 + 0.5);

#if ${maxLights} > 0
  for (int i = 0; i < ${Math.max(1, maxLights)}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i].xyz - vWorld;
    float dist = length(d);
    float r = uLightPos[i].w;
    if (dist < r) {
      float atten = 1.0 - dist / r;
      atten *= atten;
      light += uLightCol[i].rgb * uLightCol[i].w * atten * max(dot(n, d / max(dist, 0.001)), 0.0);
    }
  }
#endif

  vec3 base = vColour;
${detail ? `
  // Panel lines, derived from world position on whichever plane the face
  // faces. Cheaper than a texture and it never has to be downloaded.
  vec2 uv = abs(n.y) > 0.5 ? vWorld.xz : (abs(n.x) > 0.5 ? vWorld.zy : vWorld.xy);
  vec2 g = abs(fract(uv * 0.5 + 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
  base *= 1.0 - line * 0.10;
  // Very low frequency mottling so large flat slabs are not perfectly flat.
  float h = fract(sin(dot(floor(vWorld.xz * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
  base *= 0.965 + h * 0.07;
` : ''}
  // Contact darkening toward the underside of every box: cheap grounding
  // that stands in for the shadow map this renderer deliberately omits.
  // Kept light — on a high-key palette a heavy version reads as grime.
  base *= 0.87 + 0.13 * smoothstep(-1.0, -0.2, vLocal.y);

  vec3 col = base * light * uExposure;

  /* Flat-lit low-poly loses chroma the moment several light terms are
     summed, and the result is a bright picture made of greys. Pushing
     saturation back up after lighting is what keeps the palette reading
     as the colours the map actually specifies. */
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uSaturation);

  col = mix(col, base * 1.45 + vec3(0.14), vParams.x);      // emissive

  float fog = clamp((vDepth - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);
  fog *= fog * (3.0 - 2.0 * fog);
  col = mix(col, uFogColour, fog * (1.0 - vParams.x * 0.85));

  gl_FragColor = vec4(col, vParams.y);
}`;

export class BoxRenderer {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.maxLights = opts.maxLights === undefined ? 8 : opts.maxLights;
    this.detail = opts.detail !== false;
    this.program = compile(gl, VS, FS(this.maxLights, this.detail), 'boxes');

    this.vboPos = buffer(gl, gl.ARRAY_BUFFER, new Float32Array(CUBE_POS));
    this.vboNrm = buffer(gl, gl.ARRAY_BUFFER, new Float32Array(CUBE_NRM));
    this.vboLoc = buffer(gl, gl.ARRAY_BUFFER, new Float32Array(CUBE_LOC));
    this.ibo = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(CUBE_IDX));
    this.indexCount = CUBE_IDX.length;
  }

  /* Rebuild the shader when the quality preset changes the light budget
     or turns surface detail off. */
  reconfigure(maxLights, detail) {
    if (maxLights === this.maxLights && detail === this.detail) return;
    this.maxLights = maxLights;
    this.detail = detail;
    this.gl.deleteProgram(this.program);
    this.program = compile(this.gl, VS, FS(maxLights, detail), 'boxes');
  }

  setScene(scene) {
    const gl = this.gl, p = this.program;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uViewProj, false, scene.viewProj);
    gl.uniform3fv(p.u.uEye, scene.eye);
    gl.uniform3fv(p.u.uSunDir, scene.sunDir);
    gl.uniform3fv(p.u.uSunColour, scene.sunColour);
    gl.uniform3fv(p.u.uAmbientSky, scene.ambientSky);
    gl.uniform3fv(p.u.uAmbientGround, scene.ambientGround);
    gl.uniform3fv(p.u.uFogColour, scene.fogColour);
    gl.uniform2fv(p.u.uFogRange, scene.fogRange);
    gl.uniform1f(p.u.uExposure, scene.exposure);
    gl.uniform1f(p.u.uSaturation, scene.saturation === undefined ? 1 : scene.saturation);
    if (this.maxLights > 0) {
      const n = Math.min(this.maxLights, scene.lightCount | 0);
      gl.uniform1i(p.u.uLightCount, n);
      if (n > 0) {
        gl.uniform4fv(p.u.uLightPos, scene.lightPos.subarray(0, n * 4));
        gl.uniform4fv(p.u.uLightCol, scene.lightCol.subarray(0, n * 4));
      }
    }
  }

  /* `batch` is a Batch below. Attributes are bound per draw rather than
     through a VAO so the same path works on WebGL1 without the vertex
     array object extension. */
  draw(batch, count) {
    const gl = this.gl, p = this.program;
    const n = count === undefined ? batch.count : count;
    if (!n) return;
    gl.useProgram(p);
    bindVec3(gl, p.a.aPos, this.vboPos, 0);
    bindVec3(gl, p.a.aNormal, this.vboNrm, 0);
    bindVec3(gl, p.a.aLocal, this.vboLoc, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
    const S = FLOATS_PER_INSTANCE * 4;
    attrib(gl, p.a.iCentre, 3, S, 0, 1);
    attrib(gl, p.a.iHalf, 3, S, 12, 1);
    attrib(gl, p.a.iRot, 2, S, 24, 1);
    attrib(gl, p.a.iColour, 3, S, 32, 1);
    attrib(gl, p.a.iParams, 3, S, 44, 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, n);

    // Leave the divisors clean for anything else that draws non-instanced.
    for (const a of [p.a.iCentre, p.a.iHalf, p.a.iRot, p.a.iColour, p.a.iParams]) {
      if (a >= 0) gl.vertexAttribDivisor(a, 0);
    }
  }
}

function bindVec3(gl, loc, vbo) {
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(loc, 0);
}

function attrib(gl, loc, size, stride, offset, divisor) {
  if (loc < 0) return;
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  gl.vertexAttribDivisor(loc, divisor);
}

/* A growable instance buffer. Static batches are filled once; dynamic
   ones are refilled every frame, which is why `reset`/`push`/`upload`
   never allocate after the first growth. */
export class Batch {
  constructor(gl, capacity = 256, dynamic = true) {
    this.gl = gl;
    this.dynamic = dynamic;
    this.capacity = capacity;
    this.data = new Float32Array(capacity * FLOATS_PER_INSTANCE);
    this.count = 0;
    this.vbo = gl.createBuffer();
    this.uploaded = 0;
  }

  reset() { this.count = 0; }

  grow(need) {
    if (need <= this.capacity) return;
    let cap = this.capacity;
    while (cap < need) cap *= 2;
    const next = new Float32Array(cap * FLOATS_PER_INSTANCE);
    next.set(this.data.subarray(0, this.count * FLOATS_PER_INSTANCE));
    this.data = next;
    this.capacity = cap;
    this.uploaded = 0;
  }

  push(cx, cy, cz, hx, hy, hz, yaw, pitch, r, g, b, emissive = 0, alpha = 1, shade = 1) {
    this.grow(this.count + 1);
    const o = this.count * FLOATS_PER_INSTANCE;
    const d = this.data;
    d[o] = cx; d[o + 1] = cy; d[o + 2] = cz;
    d[o + 3] = hx; d[o + 4] = hy; d[o + 5] = hz;
    d[o + 6] = yaw; d[o + 7] = pitch;
    d[o + 8] = r * shade; d[o + 9] = g * shade; d[o + 10] = b * shade;
    d[o + 11] = emissive; d[o + 12] = alpha; d[o + 13] = 0;
    this.count++;
    return this.count - 1;
  }

  /* A brush from the map format: min corner plus size. */
  pushBrush(b, colour, emissive, alpha) {
    return this.push(
      b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2,
      b.w / 2, b.h / 2, b.d / 2, 0, 0,
      colour[0], colour[1], colour[2],
      emissive === undefined ? b.glow : emissive,
      alpha === undefined ? b.alpha : alpha
    );
  }

  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const used = this.count * FLOATS_PER_INSTANCE;
    if (this.uploaded < this.capacity) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data, this.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      this.uploaded = this.capacity;
    } else if (used) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, used));
    }
  }

  dispose() { this.gl.deleteBuffer(this.vbo); }
}
