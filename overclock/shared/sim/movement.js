/* Movement.
 *
 * This module is the reason the client and server share a folder. The
 * client runs it immediately on the local player so the game responds to
 * the key before the network does; the server runs it as the truth; and
 * the client runs it again over its unacknowledged inputs whenever the
 * server disagrees. If the two ever diverge — a different constant, a
 * different order of operations, a Math.random anywhere — the player sees
 * rubber-banding, so everything here is a pure function of (state, cmd).
 *
 * The model is the Quake lineage: separate ground and air acceleration,
 * friction only on the ground, and a hard cap on air speed rather than on
 * air control. It is not realistic and that is the point — it lets you
 * change direction in the air enough to dodge, but not enough to fly.
 */

import { MOVE, PLAYER_RADIUS, PLAYER_HEIGHT, PLAYER_CROUCH_HEIGHT, STEP_HEIGHT, BTN } from '../constants.js';
import { queryBox } from '../maps/builder.js';

const _boxes = [];

/* Resolve one axis of motion, then push the box back out of anything it
   ended up inside. Because the axes are done one at a time from a
   non-overlapping start, the push-out direction is never ambiguous. */
function slideAxis(world, p, r, h, axis, delta) {
  if (delta === 0) return false;
  p[axis] += delta;
  const boxes = queryBox(world, p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r, _boxes);
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (axis === 'x') {
      if (p.x + r <= b.x || p.x - r >= b.x + b.w) continue;
      if (p.y >= b.y + b.h || p.y + h <= b.y) continue;
      if (p.z + r <= b.z || p.z - r >= b.z + b.d) continue;
      p.x = delta > 0 ? b.x - r : b.x + b.w + r;
    } else if (axis === 'z') {
      if (p.z + r <= b.z || p.z - r >= b.z + b.d) continue;
      if (p.y >= b.y + b.h || p.y + h <= b.y) continue;
      if (p.x + r <= b.x || p.x - r >= b.x + b.w) continue;
      p.z = delta > 0 ? b.z - r : b.z + b.d + r;
    } else {
      if (p.y + h <= b.y || p.y >= b.y + b.h) continue;
      if (p.x + r <= b.x || p.x - r >= b.x + b.w) continue;
      if (p.z + r <= b.z || p.z - r >= b.z + b.d) continue;
      p.y = delta > 0 ? b.y - h : b.y + b.h;
    }
    hit = true;
  }
  return hit;
}

function overlaps(world, x, y, z, r, h) {
  return queryBox(world, x - r, y + 0.01, z - r, x + r, y + h - 0.01, z + r, _boxes).length > 0;
}

/* Horizontal motion with a step-up retry. Without the retry, a 0.3-unit
   kerb stops a sprint dead, which reads as the map being sticky. */
function moveHorizontal(world, p, r, h, dx, dz) {
  const sx = p.x, sy = p.y, sz = p.z;
  const hitX = slideAxis(world, p, r, h, 'x', dx);
  const hitZ = slideAxis(world, p, r, h, 'z', dz);
  if (!hitX && !hitZ) return false;

  // Retry the same motion from a step higher, then settle back down.
  const ux = p.x, uy = p.y, uz = p.z;
  p.x = sx; p.y = sy + STEP_HEIGHT; p.z = sz;
  if (!overlaps(world, p.x, p.y, p.z, r, h)) {
    slideAxis(world, p, r, h, 'x', dx);
    slideAxis(world, p, r, h, 'z', dz);
    const gained = Math.hypot(p.x - sx, p.z - sz);
    if (gained > Math.hypot(ux - sx, uz - sz) + 1e-4) {
      slideAxis(world, p, r, h, 'y', -STEP_HEIGHT);   // drop onto the step
      return true;
    }
  }
  p.x = ux; p.y = uy; p.z = uz;
  return true;
}

export function createPlayerPhysics() {
  return {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    onGround: false,
    height: PLAYER_HEIGHT,
    crouching: false,
    /* Set on the tick a landing happens, for the footstep/land sound and
       the camera dip. Consumed by the caller. */
    landedHard: 0,
    steppedOn: null,
  };
}

/* One fixed step. `cmd` carries the movement axes, look angles and the
   button bitfield; `speedMul` folds in the weapon's movement penalty and
   whatever the game mode wants. Returns the physics state, mutated. */
export function stepMovement(world, ph, cmd, dt, speedMul = 1) {
  const wantCrouch = (cmd.buttons & BTN.CROUCH) !== 0;
  const wantSprint = (cmd.buttons & BTN.SPRINT) !== 0;

  ph.yaw = cmd.yaw;
  ph.pitch = cmd.pitch;

  /* Crouch height is interpolated, not snapped, and standing up is
     refused when there is something overhead. */
  const targetH = wantCrouch ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  if (targetH > ph.height && overlaps(world, ph.pos.x, ph.pos.y, ph.pos.z, PLAYER_RADIUS, targetH)) {
    ph.crouching = true;
  } else {
    const k = 1 - Math.exp(-MOVE.crouchLerp * dt);
    ph.height += (targetH - ph.height) * k;
    if (Math.abs(ph.height - targetH) < 0.005) ph.height = targetH;
    ph.crouching = wantCrouch;
  }
  const crouchFrac = (PLAYER_HEIGHT - ph.height) / (PLAYER_HEIGHT - PLAYER_CROUCH_HEIGHT);

  /* Wish direction, in world space. */
  let mx = cmd.moveX, mz = cmd.moveZ;
  const mlen = Math.hypot(mx, mz);
  if (mlen > 1) { mx /= mlen; mz /= mlen; }
  const sy = Math.sin(ph.yaw), cy = Math.cos(ph.yaw);
  /* Convention, fixed everywhere: moveZ = +1 is forward, moveX = +1 is
     right. At yaw 0 forward is (0,-1) and right is (1,0), matching the
     camera basis in shared/math.js — the input layer and the renderer
     have to agree on this or strafing comes out mirrored. */
  const wishX = -sy * mz + cy * mx;
  const wishZ = -cy * mz - sy * mx;
  const wishLen = Math.hypot(wishX, wishZ);

  /* Sprint only counts when actually running forward and not crouched —
     it is a commitment, not a passive speed bonus. */
  const sprinting = wantSprint && ph.onGround && crouchFrac < 0.2 && cmd.moveZ > 0.4;
  let maxSpeed = sprinting ? MOVE.sprintSpeed : MOVE.walkSpeed;
  maxSpeed = maxSpeed * (1 - crouchFrac) + MOVE.crouchSpeed * crouchFrac;
  maxSpeed *= speedMul;
  ph.sprinting = sprinting;

  if (ph.onGround) {
    // Friction first, so a released key decelerates on the same tick.
    const speed = Math.hypot(ph.vel.x, ph.vel.z);
    if (speed > 0.01) {
      const drop = Math.max(speed, 3.0) * MOVE.frictionGround * dt;
      const scale = Math.max(0, speed - drop) / speed;
      ph.vel.x *= scale; ph.vel.z *= scale;
    } else { ph.vel.x = 0; ph.vel.z = 0; }
    accelerate(ph.vel, wishX, wishZ, wishLen, maxSpeed, MOVE.accelGround, dt);
  } else {
    accelerate(ph.vel, wishX, wishZ, wishLen, maxSpeed * MOVE.airControl, MOVE.accelAir, dt);
    const hs = Math.hypot(ph.vel.x, ph.vel.z);
    if (hs > MOVE.maxAirSpeed) { const k = MOVE.maxAirSpeed / hs; ph.vel.x *= k; ph.vel.z *= k; }
  }

  if ((cmd.buttons & BTN.JUMP) && ph.onGround) {
    ph.vel.y = MOVE.jumpSpeed * (1 - crouchFrac * 0.25);
    ph.onGround = false;
    ph.jumped = true;
  } else ph.jumped = false;

  ph.vel.y -= MOVE.gravity * dt;
  if (ph.vel.y < -55) ph.vel.y = -55;

  const wasAir = !ph.onGround;
  const fallSpeed = ph.vel.y;

  moveHorizontal(world, ph.pos, PLAYER_RADIUS, ph.height, ph.vel.x * dt, ph.vel.z * dt);
  const hitY = slideAxis(world, ph.pos, PLAYER_RADIUS, ph.height, 'y', ph.vel.y * dt);

  if (hitY) {
    if (ph.vel.y <= 0) {
      ph.onGround = true;
      ph.landedHard = wasAir && fallSpeed < -9 ? Math.min(1, -fallSpeed / 26) : 0;
    } else {
      ph.landedHard = 0;                 // hit a ceiling
    }
    ph.vel.y = 0;
  } else {
    ph.landedHard = 0;
    /* Probe just below the feet. Without this, walking down a shallow
       staircase leaves the player airborne every other tick, which turns
       off friction and makes the descent feel like ice. */
    if (ph.onGround && ph.vel.y <= 0) {
      const probe = { x: ph.pos.x, y: ph.pos.y, z: ph.pos.z };
      if (slideAxis(world, probe, PLAYER_RADIUS, ph.height, 'y', -STEP_HEIGHT * 0.9)) {
        ph.pos.y = probe.y; ph.vel.y = 0;
      } else ph.onGround = false;
    } else ph.onGround = false;
  }

  /* Nothing is allowed outside the map, whatever the collision code did. */
  const bb = world.bounds;
  ph.pos.x = Math.min(Math.max(ph.pos.x, bb.minX - 2), bb.maxX + 2);
  ph.pos.z = Math.min(Math.max(ph.pos.z, bb.minZ - 2), bb.maxZ + 2);
  if (ph.pos.y < bb.minY - 12) { ph.pos.y = bb.minY - 12; ph.vel.y = 0; ph.fellOut = true; }
  return ph;
}

function accelerate(vel, wx, wz, wishLen, maxSpeed, accel, dt) {
  if (wishLen < 1e-4) return;
  const nx = wx / wishLen, nz = wz / wishLen;
  const target = maxSpeed * Math.min(1, wishLen);
  const current = vel.x * nx + vel.z * nz;
  const add = target - current;
  if (add <= 0) return;
  const step = Math.min(add, accel * maxSpeed * dt * Math.min(1, wishLen));
  vel.x += nx * step;
  vel.z += nz * step;
}

/* Eye position for a given physics state. */
export function eyeY(ph) { return ph.pos.y + ph.height - 0.14; }

/* Where the movement code says a shot comes from. Both ends compute this
   the same way so the server's rewind matches what the shooter saw. */
export function muzzleOrigin(ph, out = { x: 0, y: 0, z: 0 }) {
  out.x = ph.pos.x; out.y = eyeY(ph); out.z = ph.pos.z;
  return out;
}
