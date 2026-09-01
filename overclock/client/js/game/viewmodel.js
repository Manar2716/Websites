/* The gun in your hands.
 *
 * Drawn after the world with the depth buffer cleared and its own narrow
 * projection, so it can never clip through a wall you are standing against
 * — the standard trick, and the reason the viewmodel lives in camera space
 * rather than world space.
 *
 * Most of the feel of a shooter is in this file rather than in the damage
 * numbers. Sway lags the camera, the walk bob is a figure of eight rather
 * than a bounce, recoil kicks the model back and up and settles on a
 * spring, and sighting in moves the whole model to put the rear sight on
 * the screen centre instead of just changing the FOV.
 */

import { getWeapon } from '../../../shared/weapons.js';
import { parseColour } from '../engine/gl.js';
import { damp, clamp } from '../../../shared/math.js';

const C = {
  body: '#33383f', bodyLight: '#454b54', metal: '#585f68', grip: '#2a2d33',
  accent: '#c8792f', sight: '#1c1f24', barrel: '#22262b', mag: '#3d434b',
  glass: '#7fc9e0', wood: '#6b5138',
};

/* Each weapon is a short parts list in gun space: +X right, +Y up, and
   the barrel pointing down -Z. Adding a weapon is adding a list. */
const SHAPES = {
  rift7: [
    [0, 0, 0, 0.045, 0.055, 0.20, C.body],
    [0, 0.005, -0.30, 0.020, 0.022, 0.16, C.barrel],
    [0, 0.062, -0.06, 0.036, 0.012, 0.16, C.bodyLight],
    [0, 0.075, -0.16, 0.010, 0.022, 0.012, C.sight],
    [0, 0.075, 0.06, 0.014, 0.024, 0.012, C.sight],
    [0, -0.085, 0.02, 0.030, 0.055, 0.045, C.mag],
    [0, -0.075, 0.13, 0.026, 0.070, 0.035, C.grip],
    [0, -0.01, 0.20, 0.032, 0.048, 0.09, C.bodyLight],
    [0, 0.02, -0.19, 0.030, 0.020, 0.06, C.accent],
  ],
  triad: [
    [0, 0, 0, 0.042, 0.052, 0.21, C.body],
    [0, 0.004, -0.31, 0.018, 0.020, 0.15, C.barrel],
    [0, 0.060, -0.10, 0.030, 0.014, 0.22, C.bodyLight],
    [0, 0.082, -0.17, 0.009, 0.024, 0.011, C.sight],
    [0, 0.082, 0.04, 0.013, 0.026, 0.011, C.sight],
    [0, -0.082, 0.00, 0.028, 0.052, 0.040, C.mag],
    [0, -0.072, 0.14, 0.025, 0.068, 0.034, C.grip],
    [0, -0.005, 0.21, 0.030, 0.044, 0.085, C.body],
  ],
  wasp: [
    [0, 0, 0, 0.040, 0.050, 0.13, C.body],
    [0, 0.002, -0.20, 0.017, 0.018, 0.09, C.barrel],
    [0, 0.056, -0.04, 0.028, 0.010, 0.12, C.bodyLight],
    [0, 0.072, -0.11, 0.009, 0.020, 0.010, C.sight],
    [0, 0.072, 0.03, 0.012, 0.022, 0.010, C.sight],
    [0, -0.090, 0.00, 0.026, 0.070, 0.036, C.mag],
    [0, -0.070, 0.10, 0.024, 0.064, 0.032, C.grip],
    [0, 0.0, 0.15, 0.028, 0.040, 0.06, C.body],
    [0.0, 0.02, -0.13, 0.026, 0.018, 0.05, C.accent],
  ],
  needle: [
    [0, 0, 0, 0.036, 0.046, 0.12, C.body],
    [0, 0.002, -0.19, 0.015, 0.016, 0.10, C.barrel],
    [0, 0.052, -0.05, 0.026, 0.010, 0.14, C.bodyLight],
    [0, 0.068, -0.12, 0.008, 0.019, 0.010, C.sight],
    [0, 0.068, 0.02, 0.011, 0.021, 0.010, C.sight],
    [0, -0.098, 0.01, 0.024, 0.078, 0.032, C.mag],
    [0, -0.066, 0.09, 0.023, 0.060, 0.030, C.grip],
    [0.0, 0.015, -0.11, 0.022, 0.016, 0.04, C.accent],
  ],
  breaker: [
    [0, 0, 0, 0.052, 0.058, 0.24, C.body],
    [0, 0.015, -0.34, 0.026, 0.026, 0.16, C.barrel],
    [0, -0.032, -0.30, 0.024, 0.020, 0.14, C.metal],
    [0, 0.068, -0.10, 0.014, 0.012, 0.22, C.bodyLight],
    [0, 0.082, -0.24, 0.008, 0.018, 0.010, C.sight],
    [0, -0.075, 0.16, 0.028, 0.062, 0.038, C.grip],
    [0, -0.01, 0.24, 0.038, 0.052, 0.10, C.wood],
    [0, -0.030, -0.14, 0.030, 0.022, 0.10, C.wood],
  ],
  kestrel: [
    [0, 0, 0, 0.040, 0.052, 0.26, C.body],
    [0, 0.002, -0.44, 0.017, 0.017, 0.22, C.barrel],
    [0, 0.088, -0.10, 0.032, 0.036, 0.13, C.sight],
    [0, 0.088, -0.10, 0.026, 0.030, 0.135, C.glass],
    [0, 0.052, -0.04, 0.014, 0.024, 0.20, C.metal],
    [0, -0.080, 0.02, 0.026, 0.050, 0.045, C.mag],
    [0, -0.076, 0.18, 0.026, 0.064, 0.036, C.grip],
    [0, -0.005, 0.28, 0.034, 0.056, 0.12, C.wood],
    [0.052, 0.02, 0.06, 0.030, 0.012, 0.012, C.metal],
  ],
  verdict: [
    [0, 0, 0, 0.042, 0.054, 0.22, C.body],
    [0, 0.002, -0.36, 0.017, 0.018, 0.17, C.barrel],
    [0, 0.078, -0.06, 0.026, 0.028, 0.10, C.sight],
    [0, 0.078, -0.06, 0.020, 0.022, 0.105, C.glass],
    [0, 0.056, -0.02, 0.014, 0.018, 0.18, C.metal],
    [0, -0.080, 0.02, 0.026, 0.052, 0.042, C.mag],
    [0, -0.074, 0.16, 0.026, 0.062, 0.035, C.grip],
    [0, -0.005, 0.24, 0.032, 0.050, 0.10, C.bodyLight],
  ],
  havoc: [
    [0, 0, 0, 0.052, 0.060, 0.26, C.body],
    [0, 0.004, -0.40, 0.020, 0.021, 0.18, C.barrel],
    [0, 0.070, -0.10, 0.034, 0.014, 0.20, C.bodyLight],
    [0, 0.088, -0.20, 0.010, 0.022, 0.012, C.sight],
    [0, -0.105, 0.02, 0.052, 0.062, 0.075, C.mag],
    [0, -0.080, 0.18, 0.028, 0.066, 0.038, C.grip],
    [0, -0.005, 0.26, 0.036, 0.054, 0.10, C.body],
    [0, -0.055, -0.24, 0.020, 0.030, 0.08, C.metal],
  ],
  talon: [
    [0, 0, 0, 0.030, 0.042, 0.09, C.body],
    [0, 0.006, -0.14, 0.014, 0.016, 0.06, C.barrel],
    [0, 0.046, -0.02, 0.022, 0.010, 0.10, C.bodyLight],
    [0, 0.060, -0.08, 0.007, 0.015, 0.009, C.sight],
    [0, 0.060, 0.05, 0.010, 0.016, 0.009, C.sight],
    [0, -0.070, 0.05, 0.022, 0.062, 0.030, C.grip],
    [0, -0.058, 0.048, 0.018, 0.050, 0.024, C.mag],
  ],
  hush: [
    [0, 0, 0, 0.030, 0.042, 0.10, C.body],
    [0, 0.006, -0.20, 0.024, 0.026, 0.12, C.metal],
    [0, 0.046, -0.02, 0.022, 0.010, 0.11, C.bodyLight],
    [0, 0.062, -0.09, 0.007, 0.016, 0.009, C.sight],
    [0, 0.062, 0.05, 0.010, 0.017, 0.009, C.sight],
    [0, -0.072, 0.05, 0.022, 0.064, 0.030, C.grip],
  ],
  shiv: [
    [0.01, -0.02, -0.10, 0.010, 0.036, 0.13, C.metal],
    [0.01, -0.02, -0.22, 0.008, 0.018, 0.05, C.metal],
    [0.01, -0.05, 0.03, 0.018, 0.028, 0.05, C.grip],
    [0.01, -0.02, -0.01, 0.024, 0.008, 0.014, C.accent],
  ],
};

/* Where the model sits at rest and when sighted, in camera space, with
   the viewmodel projection's 56-degree field of view.
 *
 * The distance matters more than it looks. At z = -0.19 the parts below
 * fill most of the screen; at z = -0.52 the same parts read as a gun held
 * at arm's length, which is what they were drawn for. The sighted pose is
 * not the rest pose slid inward — it puts the rear sight on the screen
 * centre, which is a different y as well as a different x. */
const REST = { x: 0.185, y: -0.155, z: -0.60, yaw: 0.055, pitch: -0.02 };
const ADS_POSE = { x: 0.0, y: -0.083, z: -0.50, yaw: 0, pitch: 0 };

export class ViewModel {
  constructor() {
    this.sway = { x: 0, y: 0 };
    this.bobPhase = 0;
    this.bob = { x: 0, y: 0 };
    this.recoil = { back: 0, up: 0, roll: 0, vBack: 0, vUp: 0, vRoll: 0 };
    this.reload = 0;
    this.reloadPhase = 0;
    this.switch = 0;
    this.land = 0;
    this.ads = 0;
    this.weaponId = 'rift7';
    this.lastYaw = 0;
    this.lastPitch = 0;
  }

  setWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.switch = 1;
  }

  onFire(weapon) {
    const r = weapon.recoil || { kick: 1, up: 0.4, side: 0.2 };
    this.recoil.vBack += 0.34 * (r.kick || 1);
    this.recoil.vUp += 0.9 * (r.kick || 1);
    this.recoil.vRoll += (Math.random() - 0.5) * 1.5 * (r.kick || 1);
  }

  onReload(durationMs) {
    this.reload = 1;
    this.reloadPhase = 0;
    this.reloadDur = Math.max(0.2, durationMs / 1000);
  }

  onLand(strength) { this.land = Math.min(1, this.land + strength); }

  update(dt, st) {
    // Sway lags the camera: the model trails a fast flick and catches up.
    const dYaw = shortestAngle(this.lastYaw, st.yaw);
    const dPitch = st.pitch - this.lastPitch;
    this.lastYaw = st.yaw; this.lastPitch = st.pitch;
    const swayScale = 0.55 * (1 - this.ads * 0.72);
    this.sway.x = damp(this.sway.x, clamp(-dYaw * 9 * swayScale, -0.09, 0.09), 11, dt);
    this.sway.y = damp(this.sway.y, clamp(-dPitch * 7 * swayScale, -0.07, 0.07), 11, dt);

    // Walk bob traces a figure of eight, which reads as steps rather than
    // as the whole gun being on a spring.
    const moving = st.onGround ? Math.min(1, st.speed / 8.5) : 0;
    this.bobPhase += dt * (6.2 + moving * 5.4);
    const amp = moving * 0.020 * (1 - this.ads * 0.75);
    this.bob.x = damp(this.bob.x, Math.sin(this.bobPhase) * amp, 16, dt);
    this.bob.y = damp(this.bob.y, -Math.abs(Math.cos(this.bobPhase)) * amp * 1.15, 16, dt);

    // Recoil settles on a critically damped spring rather than a lerp, so
    // it snaps back without ringing.
    const k = 150, c = 21;
    for (const [pos, vel] of [['back', 'vBack'], ['up', 'vUp'], ['roll', 'vRoll']]) {
      const a = -k * this.recoil[pos] - c * this.recoil[vel];
      this.recoil[vel] += a * dt;
      this.recoil[pos] += this.recoil[vel] * dt;
    }

    if (this.reload > 0) {
      this.reloadPhase += dt / this.reloadDur;
      if (this.reloadPhase >= 1) { this.reload = 0; this.reloadPhase = 0; }
    }
    this.switch = Math.max(0, this.switch - dt * 3.6);
    this.land = Math.max(0, this.land - dt * 4.2);
    this.ads = st.ads;
  }

  /* Emits the model into a batch, in camera space. */
  emit(batch, opts = {}) {
    const shape = SHAPES[this.weaponId] || SHAPES.rift7;
    const a = this.ads;
    const px = REST.x + (ADS_POSE.x - REST.x) * a + this.sway.x + this.bob.x;
    const py = REST.y + (ADS_POSE.y - REST.y) * a + this.sway.y + this.bob.y - this.land * 0.06;
    const pz = REST.z + (ADS_POSE.z - REST.z) * a + this.recoil.back * 0.12;
    let yaw = REST.yaw * (1 - a) + this.sway.x * 2.2;
    let pitch = REST.pitch * (1 - a) + this.recoil.up * 0.10 + this.sway.y * 2.0;

    // Reload: the model tips out of view and comes back.
    if (this.reload > 0) {
      const t = this.reloadPhase;
      const dip = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      pitch -= dip * 0.55;
      yaw += dip * 0.16;
    }
    // Switching weapons drops the model off the bottom of the screen.
    const drop = this.switch * this.switch * 0.32;

    const scale = opts.scale || 1;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    for (const [lx, ly, lz, hx, hy, hz, colour, emissive] of shape) {
      // Local -> gun-space rotation (pitch then yaw), then translate.
      const y1 = ly * cp - lz * sp, z1 = ly * sp + lz * cp;
      const x2 = lx * cy + z1 * sy, z2 = -lx * sy + z1 * cy;
      const c = parseColour(colour);
      batch.push(
        (px + x2) * scale, (py + y1 - drop) * scale, (pz + z2) * scale,
        hx * scale, hy * scale, hz * scale,
        yaw, pitch,
        c[0], c[1], c[2], emissive || 0, 1
      );
    }
  }

  /* Where the muzzle is, in camera space — the flash and the shell both
     need it, and it moves with the recoil. */
  muzzle(out = { x: 0, y: 0, z: 0 }) {
    const shape = SHAPES[this.weaponId] || SHAPES.rift7;
    let far = 0;
    for (const s of shape) far = Math.min(far, s[2] - s[5]);
    const a = this.ads;
    out.x = REST.x + (ADS_POSE.x - REST.x) * a + this.sway.x + this.bob.x;
    out.y = REST.y + (ADS_POSE.y - REST.y) * a + this.sway.y + this.bob.y + 0.01;
    out.z = REST.z + (ADS_POSE.z - REST.z) * a + far;
    return out;
  }
}

function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const weaponShape = (id) => SHAPES[id] || SHAPES.rift7;
export const hasShape = (id) => !!SHAPES[id];
