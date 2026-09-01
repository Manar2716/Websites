/* The frame.
 *
 * Order: sky, opaque world and players, transparent glass, effects, then
 * the viewmodel on a cleared depth buffer. Because every solid surface in
 * the game is an instanced box, the world and all its players are a single
 * draw call; a full match on FOUNDRY is five calls a frame in total.
 *
 * The map's instance buffer is rebuilt every frame rather than uploaded
 * once. That sounds backwards, but four hundred brushes is a few thousand
 * float writes, and it buys frustum culling and a working render-distance
 * slider — both of which matter far more on a phone than the upload does.
 */

import { createContext, compile, buffer, ResolutionController, parseColour } from './gl.js';
import { BoxRenderer, Batch } from './boxes.js';
import { SpriteRenderer, SpriteBatch } from './sprites.js';
import * as m4 from './mat4.js';

export const PRESETS = {
  low: { detail: false, lights: 0, particles: 220, distance: 75, shadows: false, minScale: 0.45, maxScale: 0.85 },
  medium: { detail: true, lights: 4, particles: 550, distance: 120, shadows: true, minScale: 0.6, maxScale: 1.0 },
  high: { detail: true, lights: 8, particles: 1100, distance: 240, shadows: true, minScale: 0.75, maxScale: 1.0 },
};

/* The ray is built straight from the camera basis and the field of view
   rather than by inverting the view-projection. Inverting a projection by
   hand is easy to get subtly wrong — the first version of this had two
   columns' components transposed, which showed up as a hard vertical seam
   down the middle of the sky — and the basis is already to hand. */
const SKY_VS = `
precision highp float;
attribute vec2 aPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTan;        // tan(fov/2) horizontally and vertically
varying vec3 vRay;
void main() {
  vRay = uForward + uRight * (aPos.x * uTan.x) + uUp * (aPos.y * uTan.y);
  gl_Position = vec4(aPos, 0.999999, 1.0);
}`;

const SKY_FS = `
precision mediump float;
varying vec3 vRay;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColour;
void main() {
  vec3 d = normalize(vRay);
  float h = d.y;
  vec3 col = h > 0.0
    ? mix(uHorizon, uSky, pow(min(h * 1.5, 1.0), 0.62))
    : mix(uHorizon, uGround, pow(min(-h * 2.4, 1.0), 0.7));
  // A soft bloom around the sun, so outdoor maps have a direction you can
  // feel without a lens-flare budget.
  float s = max(dot(d, -uSunDir), 0.0);
  col += uSunColour * pow(s, 24.0) * 0.55 + uSunColour * pow(s, 4.0) * 0.06;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = createContext(canvas);
    if (!gl) throw new Error('This browser cannot provide a WebGL context.');
    this.gl = gl;
    this.preset = PRESETS[opts.quality] || PRESETS.medium;
    this.res = new ResolutionController(canvas, {
      dynamic: opts.dynamicResolution !== false,
      min: this.preset.minScale, max: this.preset.maxScale,
      scale: opts.resolutionScale || this.preset.maxScale,
      targetMs: opts.targetMs || 16.7,
    });

    this.boxes = new BoxRenderer(gl, { maxLights: this.preset.lights, detail: this.preset.detail });
    this.sprites = new SpriteRenderer(gl);
    this.sky = compile(gl, SKY_VS, SKY_FS, 'sky');
    this.skyQuad = buffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));

    this.opaque = new Batch(gl, 1024);
    this.glass = new Batch(gl, 128);
    this.vm = new Batch(gl, 64);
    this.additive = new SpriteBatch(gl, 900);
    this.alphaSprites = new SpriteBatch(gl, 900);

    this.proj = m4.create();
    this.view = m4.create();
    this.viewProj = m4.create();
    this.vmProj = m4.create();
    this.planes = new Float32Array(24);
    this.lightPos = new Float32Array(8 * 4);
    this.lightCol = new Float32Array(8 * 4);
    this.scene = {
      viewProj: this.viewProj, eye: new Float32Array(3),
      right: new Float32Array(3), up: new Float32Array(3),
      sunDir: new Float32Array(3), sunColour: new Float32Array(3),
      ambientSky: new Float32Array(3), ambientGround: new Float32Array(3),
      fogColour: new Float32Array(3), fogRange: new Float32Array(2),
      exposure: 1, saturation: 1.15,
      lightPos: this.lightPos, lightCol: this.lightCol, lightCount: 0,
    };
    this.stats = { brushes: 0, instances: 0, sprites: 0, calls: 0, viewmodel: 0 };
    this.world = null;
    this.renderDistance = this.preset.distance;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.res.resize(true);
  }

  setQuality(name, opts = {}) {
    const p = PRESETS[name] || PRESETS.medium;
    this.preset = p;
    this.boxes.reconfigure(p.lights, p.detail);
    this.res.min = p.minScale;
    this.res.max = p.maxScale;
    this.res.scale = Math.min(Math.max(opts.resolutionScale || p.maxScale, p.minScale), p.maxScale);
    this.res.enabled = opts.dynamicResolution !== false;
    this.renderDistance = opts.renderDistance || p.distance;
    this.res.resize(true);
  }

  setMap(world) {
    this.world = world;
    const t = world.theme || {};
    this.theme = {
      sky: parseColour(t.sky || '#1b2026'),
      horizon: parseColour(t.horizon || '#2e3238'),
      fog: parseColour(t.fog || '#252a30'),
      sun: t.sun || [0.4, -0.8, 0.3],
      sunColour: parseColour(t.sunColour || '#ffd9b0'),
      ambient: parseColour(t.ambient || '#3d4650'),
      ambientGround: parseColour(t.ambientGround || '#2a2118'),
      fogNear: t.fogNear || 26, fogFar: t.fogFar || 96,
      exposure: t.exposure || 1,
    };
    /* Colours are parsed once per map rather than per brush per frame. */
    this.brushColours = world.brushes.map((b) => parseColour(b.color));
    this.topColours = world.brushes.map((b) => (b.top ? parseColour(b.top) : null));
    this.visibleBrushes = world.brushes.map((b, i) => i).filter((i) => world.brushes[i].visible);
  }

  /* frame: { camera, players, effects, viewmodel, showViewmodel } */
  render(frame, dt, lastFrameMs) {
    const gl = this.gl;
    this.stats.viewmodel = 0;
    this.res.sample(lastFrameMs, dt);
    this.res.resize(false);
    const w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);

    const cam = frame.camera;
    const aspect = w / h;
    m4.perspective(this.proj, cam.fov, aspect, 0.045, Math.max(220, this.renderDistance * 1.4));
    m4.fpsView(this.view, cam.x, cam.y, cam.z, cam.yaw, cam.pitch, cam.roll || 0);
    m4.multiply(this.viewProj, this.proj, this.view);
    m4.frustumFromVP(this.planes, this.viewProj);

    const s = this.scene;
    s.eye[0] = cam.x; s.eye[1] = cam.y; s.eye[2] = cam.z;
    // Camera basis, straight out of the view matrix's rows.
    s.right[0] = this.view[0]; s.right[1] = this.view[4]; s.right[2] = this.view[8];
    s.up[0] = this.view[1]; s.up[1] = this.view[5]; s.up[2] = this.view[9];

    const th = this.theme;
    const sl = Math.hypot(th.sun[0], th.sun[1], th.sun[2]) || 1;
    s.sunDir[0] = th.sun[0] / sl; s.sunDir[1] = th.sun[1] / sl; s.sunDir[2] = th.sun[2] / sl;
    s.sunColour.set(th.sunColour);
    /* High-key by design, but the terms have to sum to about one for a
       fully lit surface. Ambient is a fill and a hue, not a second sun:
       scaled up to match the sun it doubles every surface before exposure
       is applied and the whole map clips to flat colour. These figures are
       checked by tools/check-lighting.mjs. */
    s.ambientSky.set(th.ambient.map((v) => v * 0.42));
    s.ambientGround.set(th.ambientGround.map((v) => v * 0.30));
    s.saturation = th.saturation === undefined ? 1.15 : th.saturation;
    s.fogColour.set(th.fog);
    s.fogRange[0] = Math.min(th.fogNear, this.renderDistance * 0.55);
    s.fogRange[1] = Math.min(th.fogFar, this.renderDistance);
    s.exposure = th.exposure;

    this.collectLights(cam);

    gl.clearColor(th.fog[0], th.fog[1], th.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.drawSky(cam);
    this.buildWorld(cam, frame);
    this.drawOpaque();
    this.drawEffects(frame);
    this.drawGlass();
    if (frame.showViewmodel !== false && frame.viewmodel) this.drawViewmodel(frame, aspect);
  }

  collectLights(cam) {
    const s = this.scene;
    const max = this.preset.lights;
    if (!max || !this.world || !this.world.lights.length) { s.lightCount = 0; return; }
    /* Only the nearest few lights are uploaded. A map may define thirty;
       at any moment a handful are close enough to contribute. */
    const lights = this.world.lights;
    const picked = [];
    for (const l of lights) {
      const d = Math.hypot(l.x - cam.x, l.y - cam.y, l.z - cam.z);
      if (d > l.r + 8) continue;
      picked.push({ l, d });
    }
    picked.sort((a, b) => a.d - b.d);
    const n = Math.min(max, picked.length);
    for (let i = 0; i < n; i++) {
      const { l } = picked[i];
      const c = parseColour(l.color);
      this.lightPos[i * 4] = l.x; this.lightPos[i * 4 + 1] = l.y;
      this.lightPos[i * 4 + 2] = l.z; this.lightPos[i * 4 + 3] = l.r;
      this.lightCol[i * 4] = c[0]; this.lightCol[i * 4 + 1] = c[1];
      this.lightCol[i * 4 + 2] = c[2]; this.lightCol[i * 4 + 3] = l.intensity;
    }
    s.lightCount = n;
  }

  drawSky(cam) {
    const gl = this.gl, p = this.sky;
    gl.useProgram(p);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyQuad);
    gl.enableVertexAttribArray(p.a.aPos);
    gl.vertexAttribPointer(p.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(p.a.aPos, 0);
    const tanY = Math.tan(cam.fov * 0.5);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    gl.uniform3fv(p.u.uRight, this.scene.right);
    gl.uniform3fv(p.u.uUp, this.scene.up);
    gl.uniform3f(p.u.uForward, -this.view[2], -this.view[6], -this.view[10]);
    gl.uniform2f(p.u.uTan, tanY * aspect, tanY);
    gl.uniform3fv(p.u.uSky, this.theme.sky);
    gl.uniform3fv(p.u.uHorizon, this.theme.horizon);
    gl.uniform3fv(p.u.uGround, this.theme.fog);
    gl.uniform3fv(p.u.uSunDir, this.scene.sunDir);
    gl.uniform3fv(p.u.uSunColour, this.theme.sunColour);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    this.stats.calls = 1;
  }

  buildWorld(cam, frame) {
    const opaque = this.opaque, glass = this.glass;
    opaque.reset(); glass.reset();
    const brushes = this.world.brushes;
    const dist = this.renderDistance;
    const d2 = dist * dist;
    let drawn = 0;

    for (let k = 0; k < this.visibleBrushes.length; k++) {
      const i = this.visibleBrushes[k];
      const b = brushes[i];
      const cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.5, cz = b.z + b.d * 0.5;
      const dx = cx - cam.x, dy = cy - cam.y, dz = cz - cam.z;
      const radius = Math.max(b.w, b.h, b.d) * 0.87;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > d2 + radius * radius) continue;
      if (!m4.aabbInFrustum(this.planes, b.x, b.y, b.z, b.x + b.w, b.y + b.h, b.z + b.d)) continue;
      const col = this.brushColours[i];
      const target = b.alpha < 1 ? glass : opaque;
      target.push(cx, cy, cz, b.w * 0.5, b.h * 0.5, b.d * 0.5, 0, 0, col[0], col[1], col[2], b.glow, b.alpha);
      // A distinct top face is drawn as a thin slab rather than needing a
      // per-face colour attribute.
      const top = this.topColours[i];
      if (top && b.h > 0.3) {
        opaque.push(cx, b.y + b.h - 0.04, cz, b.w * 0.5, 0.05, b.d * 0.5, 0, 0, top[0], top[1], top[2], 0, 1);
      }
      drawn++;
    }
    this.stats.brushes = drawn;

    if (frame.buildEntities) frame.buildEntities(opaque, glass);
    this.stats.instances = opaque.count + glass.count;
  }

  drawOpaque() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.boxes.setScene(this.scene);
    this.opaque.upload();
    this.boxes.draw(this.opaque);
    this.stats.calls++;
  }

  drawGlass() {
    if (!this.glass.count) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.boxes.setScene(this.scene);
    this.glass.upload();
    this.boxes.draw(this.glass);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.stats.calls++;
  }

  drawEffects(frame) {
    const gl = this.gl;
    const add = this.additive, alp = this.alphaSprites;
    add.reset(); alp.reset();
    if (frame.effects) frame.effects.emit(add, alp);
    if (frame.buildSprites) frame.buildSprites(add, alp);
    this.stats.sprites = add.count + alp.count;
    if (!add.count && !alp.count) return;

    this.sprites.setScene(this.scene);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    if (alp.count) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      alp.upload();
      this.sprites.draw(alp);
      this.stats.calls++;
    }
    if (add.count) {
      gl.blendFunc(gl.ONE, gl.ONE);
      add.upload();
      this.sprites.draw(add);
      this.stats.calls++;
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawViewmodel(frame, aspect) {
    const gl = this.gl;
    const vm = this.vm;
    vm.reset();
    frame.viewmodel.emit(vm);
    if (frame.buildViewmodelExtras) frame.buildViewmodelExtras(vm);
    this.stats.viewmodel = vm.count;
    if (!vm.count) return;

    /* Its own projection and a cleared depth buffer: the model is drawn in
       camera space, so it cannot intersect the world however close to a
       wall the player stands. */
    gl.clear(gl.DEPTH_BUFFER_BIT);
    m4.perspective(this.vmProj, 0.98, aspect, 0.006, 6);
    const s = this.scene;
    const savedVP = s.viewProj;
    const savedFog = [s.fogRange[0], s.fogRange[1]];
    const savedSun = [s.sunDir[0], s.sunDir[1], s.sunDir[2]];
    s.viewProj = this.vmProj;
    s.fogRange[0] = 900; s.fogRange[1] = 1000;
    // A fixed key light in camera space, so the gun always reads well
    // regardless of which way the map's sun happens to point.
    s.sunDir[0] = 0.35; s.sunDir[1] = -0.55; s.sunDir[2] = 0.75;
    const savedCount = s.lightCount;
    s.lightCount = 0;
    this.boxes.setScene(s);
    vm.upload();
    this.boxes.draw(vm);
    this.stats.calls++;

    if (frame.viewmodelSprites) {
      const add = this.additive;
      add.reset();
      frame.viewmodelSprites(add);
      if (add.count) {
        this.sprites.setScene({ ...s, viewProj: this.vmProj, eye: ZERO3, right: RIGHT3, up: UP3 });
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(false);
        add.upload();
        this.sprites.draw(add);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        this.stats.calls++;
      }
    }

    s.viewProj = savedVP;
    s.fogRange[0] = savedFog[0]; s.fogRange[1] = savedFog[1];
    s.sunDir[0] = savedSun[0]; s.sunDir[1] = savedSun[1]; s.sunDir[2] = savedSun[2];
    s.lightCount = savedCount;
  }

  /* World point -> normalised screen position, for nameplates and damage
     indicators drawn in the DOM. Returns null when behind the camera. */
  project(x, y, z, out = { x: 0, y: 0, depth: 0 }) {
    const m = this.viewProj;
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.001) return null;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    out.x = (cx / cw) * 0.5 + 0.5;
    out.y = 0.5 - (cy / cw) * 0.5;
    out.depth = cw;
    return out;
  }
}

const ZERO3 = new Float32Array([0, 0, 0]);
const RIGHT3 = new Float32Array([1, 0, 0]);
const UP3 = new Float32Array([0, 1, 0]);

