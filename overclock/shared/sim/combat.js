/* Hit resolution.
 *
 * Three things make this more than "cast a ray":
 *
 * 1. Lag compensation. The server rewinds every other player to where the
 *    shooter's screen showed them — their own latency plus the client's
 *    interpolation delay — before testing the ray. Without it, hitting a
 *    strafing target at 80 ms of ping requires leading them by most of a
 *    body width. With it, "I put the crosshair on them" is the rule.
 *    The rewind is capped: past MAX_REWIND_MS a high-ping shooter would be
 *    killing people who have been behind cover for a quarter of a second.
 *
 * 2. Deterministic spread. The cone offset for every pellet comes from a
 *    hash of (shooter, shot number, pellet), so the client draws exactly
 *    the tracer the server resolved. The alternative — server rolls, client
 *    guesses — means visible tracers that miss things you hit.
 *
 * 3. The world is tested too, and the nearest hit wins, so you cannot
 *    shoot through a wall by aiming at somebody standing behind it.
 */

import { MAX_REWIND_MS, HISTORY_MS, INTERP_DELAY_MS, PLAYER_RADIUS } from '../constants.js';
import { raycastWorld } from '../maps/builder.js';
import { makeRandom, clamp } from '../math.js';
import { damageAtRange } from '../weapons.js';
import { hitBox, zoneAt, zoneMul, applyDamage, playerEyeY } from './player.js';

const DEG = Math.PI / 180;

export function recordHistory(p, now) {
  p.history.push({ t: now, x: p.ph.pos.x, y: p.ph.pos.y, z: p.ph.pos.z, h: p.ph.height, alive: p.alive });
  while (p.history.length > 2 && now - p.history[0].t > HISTORY_MS) p.history.shift();
}

/* Where a player was at time `t`, interpolated between recorded samples. */
export function rewind(p, t) {
  const H = p.history;
  if (!H.length) return { x: p.ph.pos.x, y: p.ph.pos.y, z: p.ph.pos.z, h: p.ph.height, alive: p.alive };
  if (t >= H[H.length - 1].t) return H[H.length - 1];
  if (t <= H[0].t) return H[0];
  let lo = 0, hi = H.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (H[mid].t <= t) lo = mid; else hi = mid; }
  const a = H[lo], b = H[hi];
  const f = (t - a.t) / Math.max(1e-3, b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, h: a.h + (b.h - a.h) * f, alive: a.alive };
}

/* The cone direction for one pellet. Both ends compute this identically. */
export function pelletDir(yaw, pitch, spreadDeg, shooterId, shotSeq, pellet) {
  const seed = (shooterId * 73856093) ^ (shotSeq * 19349663) ^ ((pellet + 1) * 83492791);
  const rnd = makeRandom(seed >>> 0);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  if (spreadDeg <= 0.0001) return { x: fx, y: fy, z: fz };
  // Right and up vectors for the aim frame.
  const rx = cy, ry = 0, rz = -sy;
  const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
  // sqrt() keeps the distribution uniform over the disc rather than
  // bunching every shot into the middle of the cone.
  const r = Math.tan(spreadDeg * DEG) * Math.sqrt(rnd());
  const a = rnd() * Math.PI * 2;
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  let dx = fx + rx * ox + ux * oy;
  let dy = fy + ry * ox + uy * oy;
  let dz = fz + rz * ox + uz * oy;
  const l = Math.hypot(dx, dy, dz);
  return { x: dx / l, y: dy / l, z: dz / l };
}

/* Ray against a player box. Returns entry distance or -1. */
function rayBox(ox, oy, oz, dx, dy, dz, b, maxD) {
  let tmin = 0, tmax = maxD;
  const ax = [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = ax[i];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    const inv = 1 / d;
    let t1 = (lo - o) * inv, t2 = (hi - o) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/* Resolve one shot. `ctx` supplies the world, the player list, the current
   time and the shooter's rewind offset. Returns an array of hit records
   plus where the tracer should end. */
export function resolveShot(ctx, shooter, opts = {}) {
  const { world, players, now } = ctx;
  const w = opts.weapon;
  const spread = opts.spread;
  const seq = opts.seq;
  const yaw = opts.yaw, pitch = opts.pitch;
  const ox = shooter.ph.pos.x, oy = playerEyeY(shooter), oz = shooter.ph.pos.z;

  /* How far back to look. The client's own view is behind the server by
     roughly half its round trip plus the interpolation buffer. */
  const rewindMs = clamp((shooter.ping || 0) * 0.5 + INTERP_DELAY_MS, 0, MAX_REWIND_MS);
  const at = now - (shooter.isBot ? 0 : rewindMs);

  const pellets = w.melee ? 1 : (w.pellets || 1);
  const maxDist = w.melee ? w.meleeRange : 400;
  const results = [];

  for (let i = 0; i < pellets; i++) {
    const d = w.melee ? pelletDir(yaw, pitch, 0, shooter.id, seq, i)
                      : pelletDir(yaw, pitch, spread, shooter.id, seq, i);
    const wallHit = raycastWorld(world, ox, oy, oz, d.x, d.y, d.z, maxDist);
    let limit = wallHit ? wallHit.dist : maxDist;

    let best = null, bestDist = limit;
    for (const p of players) {
      if (p === shooter || !p.alive) continue;
      const s = rewind(p, at);
      if (!s.alive) continue;
      const box = hitBox(s.x, s.y, s.z, s.h);
      // A cheap sphere reject before the slab test; most players in a
      // 16-player match are nowhere near any given ray.
      const t = rayBox(ox, oy, oz, d.x, d.y, d.z, box, bestDist);
      if (t < 0 || t >= bestDist) continue;
      bestDist = t; best = { player: p, sample: s, dist: t };
    }

    if (best) {
      const hy = oy + d.y * best.dist;
      const zone = zoneAt(hy, best.sample.y, best.sample.h);
      results.push({
        pellet: i, target: best.player, zone, dist: best.dist,
        point: { x: ox + d.x * best.dist, y: hy, z: oz + d.z * best.dist },
        dir: d,
      });
    } else {
      results.push({
        pellet: i, target: null, dist: limit,
        point: { x: ox + d.x * limit, y: oy + d.y * limit, z: oz + d.z * limit },
        normal: wallHit ? wallHit.normal : null,
        surface: wallHit ? wallHit.brush.color : null,
        dir: d,
      });
    }
  }
  return { origin: { x: ox, y: oy, z: oz }, results, rewindMs };
}

/* Turn a resolved hit into damage. Kept separate so game modes can veto
   (friendly fire off, spawn protection) without duplicating the maths. */
export function damageFor(w, hit, shooter, target) {
  let dmg = damageAtRange(w, hit.dist) * zoneMul(hit.zone);
  if (w.melee && w.backstabMul) {
    // Behind the target, in their own facing frame.
    const ty = target.ph.yaw;
    const fx = -Math.sin(ty), fz = -Math.cos(ty);
    const rx = target.ph.pos.x - shooter.ph.pos.x, rz = target.ph.pos.z - shooter.ph.pos.z;
    const rl = Math.hypot(rx, rz) || 1;
    if ((rx / rl) * fx + (rz / rl) * fz > 0.55) dmg *= w.backstabMul;
  }
  return dmg;
}

export function applyHit(target, dmg, now) {
  return applyDamage(target, dmg, now);
}

/* Straight line-of-sight between two players' eye points, ignoring other
   players. Bots use it constantly, so it is deliberately the cheap path. */
export function canSee(world, from, to, fromEyeY, toEyeY) {
  const dx = to.x - from.x, dy = toEyeY - fromEyeY, dz = to.z - from.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.4) return true;
  return !raycastWorld(world, from.x, fromEyeY, from.z, dx / d, dy / d, dz / d, d - 0.25);
}

export const HIT_RADIUS = PLAYER_RADIUS;
