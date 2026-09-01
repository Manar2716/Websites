/* Sprites: muzzle flashes, tracers, impact sparks, blood, smoke.
 *
 * One instanced quad, three shapes chosen per instance:
 *   0  soft round billboard   — flashes, sparks, smoke
 *   1  stretched along an axis — tracers and streaks
 *   2  hard-edged billboard   — debris flecks and shell casings
 *   3  oriented quad          — impact decals, laid flat on the surface
 *
 * Two batches rather than one, because additive glow and alpha-blended
 * smoke want different blend modes and sorting them per-frame would cost
 * more than the second draw call.
 */

import { compile, buffer } from './gl.js';

export const SPRITE_FLOATS = 13;
// 0..2 pos   3..5 dir   6 width   7 length   8 mode   9..12 rgba

const QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
const QUAD_IDX = new Uint16Array([0, 1, 2, 0, 2, 3]);

const VS = `
precision highp float;
attribute vec2 aCorner;
attribute vec3 iPos;
attribute vec3 iDir;
attribute vec3 iShape;    // width, length, mode
attribute vec4 iColour;

uniform mat4 uViewProj;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uEye;

varying vec2 vUV;
varying vec4 vColour;
varying float vMode;

void main() {
  vUV = aCorner;
  vColour = iColour;
  vMode = iShape.z;
  vec3 world;
  if (iShape.z > 2.5) {
    // Decal: lie in the plane of the surface we hit.
    vec3 n = normalize(iDir);
    vec3 t = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(cross(n, vec3(0.0, 1.0, 0.0)));
    vec3 bt = cross(n, t);
    world = iPos + t * aCorner.x * iShape.x + bt * aCorner.y * iShape.y;
  } else if (iShape.z > 0.5 && iShape.z < 1.5) {
    // Stretched: the quad runs along iDir and is widened perpendicular to
    // it in screen space, which is what makes a tracer read as a line
    // regardless of the angle you see it from.
    vec3 axis = normalize(iDir);
    vec3 toEye = normalize(uEye - iPos);
    vec3 side = normalize(cross(axis, toEye));
    world = iPos + axis * (aCorner.y * 0.5 + 0.5) * iShape.y + side * aCorner.x * iShape.x;
  } else {
    world = iPos + uRight * aCorner.x * iShape.x + uUp * aCorner.y * iShape.y;
  }
  gl_Position = uViewProj * vec4(world, 1.0);
}`;

const FS = `
precision mediump float;
varying vec2 vUV;
varying vec4 vColour;
varying float vMode;

void main() {
  float a = vColour.a;
  if (vMode > 1.5 && vMode < 2.5) {
    if (max(abs(vUV.x), abs(vUV.y)) > 0.92) discard;   // debris: hard edged
  } else if (vMode > 0.5 && vMode < 1.5) {
    a *= 1.0 - abs(vUV.x) * 0.55;                      // tracer: soft sides
  } else {
    float d = length(vUV);                             // round: flashes, decals
    a *= 1.0 - smoothstep(0.3, 1.0, d);
    a *= a;
  }
  if (a <= 0.004) discard;
  gl_FragColor = vec4(vColour.rgb * a, a);
}`;

export class SpriteRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = compile(gl, VS, FS, 'sprites');
    this.quad = buffer(gl, gl.ARRAY_BUFFER, QUAD);
    this.idx = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, QUAD_IDX);
  }

  setScene(scene) {
    const gl = this.gl, p = this.program;
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uViewProj, false, scene.viewProj);
    gl.uniform3fv(p.u.uRight, scene.right);
    gl.uniform3fv(p.u.uUp, scene.up);
    gl.uniform3fv(p.u.uEye, scene.eye);
  }

  draw(batch) {
    const gl = this.gl, p = this.program;
    if (!batch.count) return;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    if (p.a.aCorner >= 0) {
      gl.enableVertexAttribArray(p.a.aCorner);
      gl.vertexAttribPointer(p.a.aCorner, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(p.a.aCorner, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
    const S = SPRITE_FLOATS * 4;
    at(gl, p.a.iPos, 3, S, 0);
    at(gl, p.a.iDir, 3, S, 12);
    at(gl, p.a.iShape, 3, S, 24);
    at(gl, p.a.iColour, 4, S, 36);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idx);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, batch.count);
    for (const a of [p.a.iPos, p.a.iDir, p.a.iShape, p.a.iColour]) if (a >= 0) gl.vertexAttribDivisor(a, 0);
  }
}

function at(gl, loc, size, stride, offset) {
  if (loc < 0) return;
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  gl.vertexAttribDivisor(loc, 1);
}

export class SpriteBatch {
  constructor(gl, capacity = 512) {
    this.gl = gl;
    this.capacity = capacity;
    this.data = new Float32Array(capacity * SPRITE_FLOATS);
    this.count = 0;
    this.vbo = gl.createBuffer();
    this.uploaded = 0;
  }
  reset() { this.count = 0; }
  push(x, y, z, dx, dy, dz, w, len, mode, r, g, b, a) {
    /* An over-full frame of sparks looks the same whichever ones are
       dropped, so the newest go rather than shifting the buffer. */
    if (this.count >= this.capacity) return;
    const o = this.count * SPRITE_FLOATS, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = dx; d[o + 4] = dy; d[o + 5] = dz;
    d[o + 6] = w; d[o + 7] = len; d[o + 8] = mode;
    d[o + 9] = r; d[o + 10] = g; d[o + 11] = b; d[o + 12] = a;
    this.count++;
  }
  dispose() { this.gl.deleteBuffer(this.vbo); }
  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (this.uploaded < this.capacity) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
      this.uploaded = this.capacity;
    } else if (this.count) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * SPRITE_FLOATS));
    }
  }
}
