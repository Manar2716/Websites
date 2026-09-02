/* Sun shadows.
 *
 * One orthographic depth pass over the whole map from the sun's direction,
 * sampled in the main shader with a 3x3 comparison. A map is at most eighty
 * units across, so a single 2048-square map covers all of it at roughly
 * twenty-five texels per unit — no cascades needed, which removes most of
 * the complexity that makes shadow mapping unpleasant.
 *
 * Back faces are rendered rather than front faces. Everything in this game
 * is a closed box, so the far side of an object is a free depth offset and
 * it removes surface acne without the peter-panning that a large constant
 * bias produces.
 *
 * WebGL2 only, and only on the high preset: it is an extra full pass over
 * the scene geometry, which is exactly the thing a phone cannot spare.
 */

import { compile } from './gl.js';
import * as m4 from './mat4.js';

const DEPTH_VS = `
precision highp float;
attribute vec3 aPos;
attribute vec3 iCentre;
attribute vec3 iHalf;
attribute vec2 iRot;
uniform mat4 uLightVP;
void main() {
  float cy = cos(iRot.x), sy = sin(iRot.x);
  float cp = cos(iRot.y), sp = sin(iRot.y);
  vec3 p = aPos * iHalf;
  vec3 p1 = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  vec3 p2 = vec3(p1.x * cy + p1.z * sy, p1.y, -p1.x * sy + p1.z * cy);
  gl_Position = uLightVP * vec4(iCentre + p2, 1.0);
}`;

const DEPTH_FS = `
precision mediump float;
void main() { gl_FragColor = vec4(1.0); }
`;

export class ShadowMap {
  constructor(gl, size = 2048) {
    this.gl = gl;
    this.available = gl.__version === 2;
    this.size = size;
    this.ready = false;
    this.matrix = m4.create();
    this.view = m4.create();
    this.proj = m4.create();
    if (!this.available) return;
    try {
      this.program = compile(gl, DEPTH_VS, DEPTH_FS, 'shadow-depth');
      this._create();
    } catch (err) {
      console.warn('shadow map unavailable:', err.message);
      this.available = false;
    }
  }

  _create() {
    const gl = this.gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.size, this.size, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    this.ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!this.ready) this.available = false;
  }

  /* Frames the whole map in the light's view. Called when the map changes,
     not every frame — the sun does not move and neither does the map. */
  fit(bounds, sunDir) {
    if (!this.available) return;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const r = 0.5 * Math.hypot(
      bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) + 4;
    const d = r + 8;
    m4.lookAlong(this.view, cx - sunDir[0] * d, cy - sunDir[1] * d, cz - sunDir[2] * d,
      sunDir[0], sunDir[1], sunDir[2]);
    m4.ortho(this.proj, -r, r, -r, r, 0.1, d + r + 8);
    m4.multiply(this.matrix, this.proj, this.view);
    this.texelWorld = (2 * r) / this.size;
  }

  begin() {
    if (!this.available || !this.ready) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size, this.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    /* Back faces, not front. On closed geometry this is a free depth
       offset and it removes acne without floating the shadow off its
       caster the way a large constant bias does. */
    gl.cullFace(gl.FRONT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.program.u.uLightVP, false, this.matrix);
    return true;
  }

  end() {
    const gl = this.gl;
    gl.cullFace(gl.BACK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    if (!this.tex) return;
    this.gl.deleteTexture(this.tex);
    this.gl.deleteFramebuffer(this.fbo);
    this.tex = null;
    this.ready = false;
  }
}
