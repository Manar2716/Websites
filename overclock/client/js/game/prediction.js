/* Client-side prediction and reconciliation.
 *
 * The player presses forward. Waiting for the server to confirm it would
 * put a whole round trip between the key and the movement, which at 80 ms
 * is the difference between a game that feels tight and one that feels
 * broken. So the client simulates the move immediately with the same code
 * the server will run, keeps the command, and checks its work when the
 * server's answer arrives.
 *
 * When the answer disagrees — because someone shot you, or you were pushed
 * — the correction is not snapped into place. It is applied to the
 * simulation immediately but faded out of the *camera* over about a tenth
 * of a second, so a small disagreement never reads as a jolt. Only a large
 * one, where hiding it would be lying about where you are, snaps.
 */

import { TICK_DT, BTN, PLAYER_HEIGHT } from '../../../shared/constants.js';
import { createPlayer, spawnPlayer, stepPlayerMovement, stepWeapon, curWeapon, curAmmo, setWeapons, currentSpread } from '../../../shared/sim/player.js';
import { damp } from '../../../shared/math.js';

const MAX_PENDING = 180;               // three seconds at 60 Hz
const SNAP_ERROR = 2.4;                // beyond this, correct visibly

export class Prediction {
  constructor(world) {
    this.world = world;
    this.player = createPlayer({ id: 0, name: 'you' });
    this.pending = [];
    this.seq = 1;
    this.error = { x: 0, y: 0, z: 0 };
    this.lastAck = 0;
    this.enabled = true;
    this.corrections = 0;
    this.worstError = 0;
    this.shotsThisTick = [];
  }

  setWorld(world) { this.world = world; }

  reset(state, weapons) {
    const p = this.player;
    spawnPlayer(p, { x: state.x, y: state.y, z: state.z, yaw: state.yaw || 0 }, 0);
    if (weapons) setWeapons(p, weapons);
    this.pending.length = 0;
    this.error.x = this.error.y = this.error.z = 0;
  }

  /* One tick of local simulation. Returns the command, which the caller
     sends to the server and keeps in the redundancy window. */
  step(input, nowMs, dt) {
    const cmd = {
      seq: this.seq++,
      moveX: input.moveX, moveZ: input.moveZ,
      buttons: input.buttons,
      yaw: input.yaw, pitch: input.pitch,
    };
    const p = this.player;
    this.shotsThisTick.length = 0;
    stepPlayerMovement(this.world, p, cmd, dt);
    stepWeapon(p, cmd, nowMs, dt, this.shotsThisTick);
    cmd.shots = this.shotsThisTick.filter((s) => s.shot).length;
    cmd.dryFire = this.shotsThisTick.some((s) => s.dry);

    this.pending.push(cmd);
    if (this.pending.length > MAX_PENDING) this.pending.shift();

    // The visual error decays toward zero once the correction is applied.
    this.error.x = damp(this.error.x, 0, 13, dt);
    this.error.y = damp(this.error.y, 0, 13, dt);
    this.error.z = damp(this.error.z, 0, 13, dt);
    return cmd;
  }

  /* Server said where we actually are, as of command `ackSeq`. */
  reconcile(self, ackSeq, nowMs) {
    const p = this.player;
    if (!this.enabled) return;

    // Remember where we thought we were, to measure the disagreement.
    const px = p.ph.pos.x, py = p.ph.pos.y, pz = p.ph.pos.z;

    // Drop everything the server has already applied.
    while (this.pending.length && this.pending[0].seq <= ackSeq) this.pending.shift();
    this.lastAck = ackSeq;

    p.ph.pos.x = self.x; p.ph.pos.y = self.y; p.ph.pos.z = self.z;
    p.ph.vel.x = self.vx; p.ph.vel.y = self.vy; p.ph.vel.z = self.vz;
    p.ph.height = self.height || PLAYER_HEIGHT;
    p.ph.onGround = self.onGround;

    // Replay everything the server has not seen yet.
    for (let i = 0; i < this.pending.length; i++) {
      stepPlayerMovement(this.world, p, this.pending[i], TICK_DT);
    }

    const ex = px - p.ph.pos.x, ey = py - p.ph.pos.y, ez = pz - p.ph.pos.z;
    const err = Math.hypot(ex, ey, ez);
    this.worstError = Math.max(this.worstError * 0.995, err);
    if (err > 0.0015) this.corrections++;
    if (err < SNAP_ERROR) {
      /* Carry the disagreement in the camera offset and let it fade. The
         simulation is already correct; only the picture lags. */
      this.error.x += ex; this.error.y += ey; this.error.z += ez;
      const mag = Math.hypot(this.error.x, this.error.y, this.error.z);
      if (mag > SNAP_ERROR) {
        const k = SNAP_ERROR / mag;
        this.error.x *= k; this.error.y *= k; this.error.z *= k;
      }
    } else {
      // Teleport, respawn or a genuine desync: show the truth at once.
      this.error.x = this.error.y = this.error.z = 0;
    }
  }

  /* Ammo the HUD should show: the server's count, minus the shots we have
     fired that it has not seen yet. Without this the counter flickers back
     up every time a snapshot arrives mid-burst. */
  syncAmmo(serverMag, serverReserve) {
    let unacked = 0;
    for (const c of this.pending) unacked += c.shots || 0;
    const ammo = curAmmo(this.player);
    if (!ammo) return;
    ammo.mag = Math.max(0, serverMag - unacked);
    ammo.reserve = serverReserve;
  }

  /* Where the camera goes: the simulated position plus the fading error. */
  cameraPos(out = { x: 0, y: 0, z: 0 }) {
    const p = this.player.ph;
    out.x = p.pos.x + this.error.x;
    out.y = p.pos.y + this.error.y + p.height - 0.14;
    out.z = p.pos.z + this.error.z;
    return out;
  }

  get ph() { return this.player.ph; }
  get weapon() { return curWeapon(this.player); }
  get ammo() { return curAmmo(this.player); }
  get spread() { return currentSpread(this.player); }
}
