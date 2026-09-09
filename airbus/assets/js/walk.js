/* ═══════════════════════════════════════════════════════════
   walk.js — the first-person controller.

   Movement is a damped velocity rather than a position set per
   frame, so the walk has weight; the head bobs slightly with
   the step, and the bob amplitude follows the actual speed
   rather than a timer, which is what stops it looking like a
   sine wave bolted on.

   Collision is swept against a small set of primitives — the
   volumes an aircraft actually occupies near the ground, plus
   the hangar shell — rather than against its triangles. There
   is no reason to raycast a wing at chest height when the wing
   is nine metres up, and the primitive test lets a visitor walk
   under the fuselage, which is most of the point of being here.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { clamp, lerp, damp, env, deg } from './core.js';

const EYE = 1.66;
const RADIUS = 0.42;
const WALK = 3.4;
const RUN = 8.2;

export class WalkController {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = false;
    this.locked = false;

    this.pos = new THREE.Vector3(0, EYE, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.bob = 0;
    this.floorY = 0;
    this.crouch = 0;

    this.keys = new Set();
    this.colliders = [];
    this.bounds = null;
    this.touch = { x: 0, y: 0, run: false, active: false };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.sensitivity = 0.0022;

    this._onKey = this._onKey.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onLock = this._onLock.bind(this);
    this._onClick = this._onClick.bind(this);
  }

  attach() {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onLock);
    document.addEventListener('mousemove', this._onMove);
    this.dom.addEventListener('pointerdown', this._onClick);
    if (env.touch) this._bindTouch();
  }

  detach() {
    if (!this.enabled) return;
    this.enabled = false;
    this.keys.clear();
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onLock);
    document.removeEventListener('mousemove', this._onMove);
    this.dom.removeEventListener('pointerdown', this._onClick);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  requestLock() {
    if (env.touch) return;
    this.dom.requestPointerLock?.();
  }

  _onLock() {
    this.locked = document.pointerLockElement === this.dom;
    this.onLockChange?.(this.locked);
  }

  _onClick(e) {
    if (env.touch) return;
    if (!this.locked && e.button === 0 && !e.target.closest('button, a, input')) this.requestLock();
  }

  _onMove(e) {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -1.42, 1.42);
  }

  _onKey(e) {
    if (e.target.matches?.('input, textarea')) return;
    this.keys.add(e.code);
    if (e.code === 'KeyE') this.onInteract?.();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
  }

  _onKeyUp(e) { this.keys.delete(e.code); }

  /* Touch: a virtual stick on the left for movement and a drag
     anywhere on the right half to look. The stick reports a
     normalised vector so the same movement code serves both. */
  _bindTouch() {
    const pad = document.getElementById('touch-move');
    const knob = pad?.querySelector('i');
    if (!pad) return;
    let id = null, ox = 0, oy = 0;
    const R = 44;

    pad.addEventListener('pointerdown', (e) => {
      id = e.pointerId; pad.setPointerCapture(id);
      const r = pad.getBoundingClientRect();
      ox = r.left + r.width / 2; oy = r.top + r.height / 2;
      this.touch.active = true;
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      this.touch.x = dx / R; this.touch.y = dy / R;
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; this.touch.x = this.touch.y = 0; this.touch.active = false;
      if (knob) knob.style.transform = '';
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    document.getElementById('touch-run')?.addEventListener('pointerdown', () => { this.touch.run = !this.touch.run; });
    document.getElementById('touch-act')?.addEventListener('click', () => this.onInteract?.());

    this.dom.addEventListener('pointerdown', (e) => {
      if (e.clientX < window.innerWidth * 0.4) return;
      this.lookTouch.id = e.pointerId;
      this.lookTouch.x = e.clientX; this.lookTouch.y = e.clientY;
    });
    this.dom.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookTouch.id) return;
      this.yaw -= (e.clientX - this.lookTouch.x) * 0.0052;
      this.pitch = clamp(this.pitch - (e.clientY - this.lookTouch.y) * 0.0052, -1.42, 1.42);
      this.lookTouch.x = e.clientX; this.lookTouch.y = e.clientY;
    });
    const lend = (e) => { if (e.pointerId === this.lookTouch.id) this.lookTouch.id = null; };
    this.dom.addEventListener('pointerup', lend);
    this.dom.addEventListener('pointercancel', lend);
  }

  teleport(x, z, yaw = 0, floorY = 0) {
    this.pos.set(x, floorY + EYE, z);
    this.floorY = floorY;
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
  }

  /* Colliders are vertical cylinders and axis-aligned boxes with
     a height range. Anything whose range does not overlap the
     visitor's own 1.7 m is simply not tested, which is how you
     end up standing under a wing. */
  setColliders(list, bounds) {
    this.colliders = list;
    this.bounds = bounds;
  }

  get speed() { return this.vel.length(); }

  update(dt) {
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (this.touch.active) { fx += this.touch.x; fz += this.touch.y; }

    const mag = Math.hypot(fx, fz);
    if (mag > 1) { fx /= mag; fz /= mag; }

    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.touch.run;
    const target = running ? RUN : WALK;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wantX = (fx * cy - fz * sy) * target;
    const wantZ = (fx * sy + fz * cy) * target;

    /* accelerate quickly, coast slowly — the difference between
       feeling like a person and feeling like a cursor */
    const accel = mag > 0.01 ? 11 : 7;
    this.vel.x = damp(this.vel.x, wantX, accel, dt);
    this.vel.z = damp(this.vel.z, wantZ, accel, dt);

    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const resolved = this._resolve(nx, nz);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;

    this.floorY = damp(this.floorY, this.floorTarget ?? this.floorY, 12, dt);

    /* head bob, driven by distance covered rather than by time */
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.bob += sp * dt * 1.9;
    const amp = env.reduced ? 0 : clamp(sp / RUN, 0, 1) * 0.055;
    const bobY = Math.sin(this.bob * 2) * amp;
    const bobX = Math.cos(this.bob) * amp * 0.55;

    this.pos.y = this.floorY + EYE - this.crouch * 0.75 + bobY;

    this.camera.position.copy(this.pos);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(bobX * 0.6 - this.vel.x * 0.0 + (sp > 0.2 ? Math.sin(this.bob) * amp * 0.4 : 0));
  }

  _resolve(x, z) {
    const y0 = this.pos.y - EYE, y1 = this.pos.y + 0.12;
    for (const c of this.colliders) {
      if (c.y1 < y0 || c.y0 > y1) continue;
      if (c.type === 'cyl') {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const r = c.r + RADIUS;
        if (d < r && d > 1e-4) { x = c.x + (dx / d) * r; z = c.z + (dz / d) * r; }
      } else if (c.type === 'box') {
        /* axis-aligned, optionally rotated about Y by c.rot */
        let px = x - c.x, pz = z - c.z;
        if (c.rot) {
          const s = Math.sin(-c.rot), co = Math.cos(-c.rot);
          [px, pz] = [px * co - pz * s, px * s + pz * co];
        }
        const hx = c.hx + RADIUS, hz = c.hz + RADIUS;
        if (Math.abs(px) < hx && Math.abs(pz) < hz) {
          const ox = hx - Math.abs(px), oz = hz - Math.abs(pz);
          if (ox < oz) px = Math.sign(px || 1) * hx; else pz = Math.sign(pz || 1) * hz;
          if (c.rot) {
            const s = Math.sin(c.rot), co = Math.cos(c.rot);
            [px, pz] = [px * co - pz * s, px * s + pz * co];
          }
          x = c.x + px; z = c.z + pz;
        }
      }
    }
    if (this.bounds) {
      x = clamp(x, this.bounds.minX + RADIUS, this.bounds.maxX - RADIUS);
      z = clamp(z, this.bounds.minZ + RADIUS, this.bounds.maxZ - RADIUS);
    }
    return { x, z };
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }
}

export { EYE, deg, lerp };
