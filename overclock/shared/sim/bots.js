/* Bot AI.
 *
 * Bots produce exactly the same command structure a human client sends —
 * two movement axes, a button field and a view angle — and are stepped by
 * the same match loop. That is deliberate: a bot cannot do anything a
 * player could not do, cannot see through walls unless the same raycast
 * says it can, and shows up in the anti-cheat's world as an ordinary
 * participant. It also means "make bots better" is a tuning problem
 * rather than a rewrite.
 *
 * The behaviour that reads as competent, roughly in order of how much it
 * matters: reacting late rather than instantly, missing in a way that
 * drifts rather than jitters, breaking off when hurt, and reloading in
 * cover instead of in the open.
 */

import { BTN, TICK_DT, PLAYER_RADIUS } from '../constants.js';
import { buildNav, nearestNode, findPath, smoothPath } from './navmesh.js';
import { canSee } from './combat.js';
import { curWeapon, curAmmo, currentSpread, playerEyeY, MAX_HEALTH } from './player.js';
import { angleDelta, clamp, makeRandom, damp } from '../math.js';
import { traceClear } from '../maps/builder.js';

export const DIFFICULTIES = {
  easy: {
    label: 'Easy', reactionMs: 520, aimError: 6.5, aimSpeed: 4.2, lead: 0.10,
    fov: 105, sight: 42, burstMin: 3, burstMax: 7, restMin: 420, restMax: 900,
    strafe: 0.35, jumpiness: 0.05, coverAt: 0.45, fireTolerance: 1.7, hearing: 26,
  },
  normal: {
    label: 'Normal', reactionMs: 320, aimError: 3.2, aimSpeed: 6.5, lead: 0.40,
    fov: 130, sight: 62, burstMin: 4, burstMax: 9, restMin: 280, restMax: 620,
    strafe: 0.55, jumpiness: 0.12, coverAt: 0.38, fireTolerance: 1.15, hearing: 34,
  },
  hard: {
    label: 'Hard', reactionMs: 195, aimError: 1.6, aimSpeed: 9.5, lead: 0.75,
    fov: 152, sight: 92, burstMin: 5, burstMax: 12, restMin: 190, restMax: 420,
    strafe: 0.75, jumpiness: 0.2, coverAt: 0.32, fireTolerance: 0.8, hearing: 44,
  },
  insane: {
    label: 'Insane', reactionMs: 105, aimError: 0.75, aimSpeed: 14, lead: 1.0,
    fov: 176, sight: 130, burstMin: 7, burstMax: 16, restMin: 120, restMax: 260,
    strafe: 0.9, jumpiness: 0.28, coverAt: 0.26, fireTolerance: 0.55, hearing: 58,
  },
};

export const DIFFICULTY_IDS = ['easy', 'normal', 'hard', 'insane'];

/* Callsigns. Deliberately not human first names — a bot should never be
   mistaken for a player, and the UI tags them as well. */
const CALLSIGNS = [
  'ORBIT', 'VESPER', 'HALCYON', 'KILO', 'MERIDIAN', 'ZEPHYR', 'CINDER', 'ATLAS',
  'NOVA', 'RAMPART', 'ECHO', 'TUNDRA', 'PIVOT', 'QUARTZ', 'SABLE', 'VECTOR',
  'ONYX', 'DELTA', 'HOLLOW', 'MIRAGE',
];
export function botName(i) { return CALLSIGNS[i % CALLSIGNS.length] + (i >= CALLSIGNS.length ? '-' + (1 + ((i / CALLSIGNS.length) | 0)) : ''); }

const STATE = { ROAM: 0, ENGAGE: 1, HUNT: 2, COVER: 3 };

export function attachBrain(player, difficulty, seed) {
  player.brain = {
    d: DIFFICULTIES[difficulty] || DIFFICULTIES.normal,
    rnd: makeRandom((seed ^ (player.id * 2654435761)) >>> 0),
    state: STATE.ROAM,
    target: null,
    targetSeenAt: -1e9,
    targetFirstSeenAt: -1e9,
    lastKnown: null,
    scanAt: 0,
    path: null, pathIdx: 0, pathAt: -1e9, goal: null,
    aimYaw: player.ph.yaw, aimPitch: 0,
    errYaw: 0, errPitch: 0, errAt: 0,
    burstLeft: 0, restUntil: 0,
    strafeDir: 1, strafeUntil: 0,
    stuckFor: 0, lastPos: { x: 0, z: 0 },
    jumpUntil: 0, crouchUntil: 0,
    heardAt: -1e9, heardPos: null,
  };
  return player.brain;
}

/* Called once per tick per bot. Returns a command. */
export function thinkBot(match, p, dt) {
  const b = p.brain || attachBrain(p, match.config.botDifficulty, match.config.seed);
  const d = b.d;
  const now = match.time;
  const world = match.world;
  const nav = buildNav(world);

  /* Perception, on a stagger so twenty bots do not all raycast on the
     same tick. */
  if (now >= b.scanAt) {
    b.scanAt = now + 90 + b.rnd() * 70;
    perceive(match, p, b, now);
  }

  const engaged = b.target && b.target.alive && now - b.targetSeenAt < 900;
  const hp = (p.health + p.armour) / MAX_HEALTH;
  const ammo = curAmmo(p);
  const w = curWeapon(p);
  const dry = ammo && ammo.mag === 0 && ammo.reserve > 0;

  if (engaged && now - b.targetFirstSeenAt >= d.reactionMs) {
    b.state = (hp < d.coverAt || dry) ? STATE.COVER : STATE.ENGAGE;
  } else if (b.lastKnown && now - b.targetSeenAt < 5200) {
    b.state = STATE.HUNT;
  } else if (b.heardPos && now - b.heardAt < 3500) {
    b.state = STATE.HUNT;
    b.lastKnown = b.heardPos;
  } else {
    b.state = STATE.ROAM;
  }

  const cmd = { seq: 0, moveX: 0, moveZ: 0, buttons: 0, yaw: b.aimYaw, pitch: b.aimPitch };

  /* ── Aim ───────────────────────────────────────────────────────── */
  let aimAt = null;
  if (b.target && (engaged || b.state === STATE.COVER)) {
    aimAt = aimPoint(match, p, b, d, now);
  } else if (b.lastKnown && b.state === STATE.HUNT) {
    aimAt = { x: b.lastKnown.x, y: b.lastKnown.y + 1.3, z: b.lastKnown.z };
  }

  if (aimAt) {
    const dx = aimAt.x - p.ph.pos.x, dy = aimAt.y - playerEyeY(p), dz = aimAt.z - p.ph.pos.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    /* Turn at a bounded rate. Snapping the view is the single most
       obvious tell that something is not a person. */
    const rate = d.aimSpeed * (b.state === STATE.ENGAGE ? 1 : 0.55);
    b.aimYaw += clamp(angleDelta(b.aimYaw, wantYaw), -rate * dt, rate * dt);
    b.aimPitch += clamp(wantPitch - b.aimPitch, -rate * dt, rate * dt);
  } else {
    // Look where you are going.
    const wp = currentWaypoint(b);
    if (wp) {
      const wantYaw = Math.atan2(-(wp.x - p.ph.pos.x), -(wp.z - p.ph.pos.z));
      b.aimYaw += clamp(angleDelta(b.aimYaw, wantYaw), -3.4 * dt, 3.4 * dt);
    }
    b.aimPitch = damp(b.aimPitch, 0, 4, dt);
  }
  b.aimPitch = clamp(b.aimPitch, -1.4, 1.4);
  cmd.yaw = b.aimYaw;
  cmd.pitch = b.aimPitch;

  /* ── Navigation goal ───────────────────────────────────────────── */
  let goal = null;
  if (b.state === STATE.ENGAGE && b.target) {
    goal = engageGoal(match, p, b, d, nav, now);
  } else if (b.state === STATE.COVER && b.target) {
    goal = coverGoal(match, p, b, nav);
  } else if (b.state === STATE.HUNT && b.lastKnown) {
    goal = b.lastKnown;
  } else {
    goal = roamGoal(match, p, b, nav, now);
  }
  if (goal) followPath(match, p, b, nav, goal, cmd, dt, now);

  /* ── Firing ────────────────────────────────────────────────────── */
  if (dry || (ammo && ammo.mag / Math.max(1, w.mag) < 0.22 && !engaged && ammo.reserve > 0)) {
    cmd.buttons |= BTN.RELOAD;
  } else if (b.state === STATE.ENGAGE && b.target && now - b.targetFirstSeenAt >= d.reactionMs) {
    const t = b.target;
    const dist = Math.hypot(t.ph.pos.x - p.ph.pos.x, t.ph.pos.z - p.ph.pos.z);
    // Only pull the trigger once the crosshair is actually near them.
    const eyeDx = t.ph.pos.x - p.ph.pos.x, eyeDz = t.ph.pos.z - p.ph.pos.z;
    const eyeDy = playerEyeY(t) - playerEyeY(p);
    const wantYaw = Math.atan2(-eyeDx, -eyeDz);
    const wantPitch = Math.atan2(eyeDy, Math.hypot(eyeDx, eyeDz));
    /* Both axes, not just yaw. Checking yaw alone lets a bot empty a
       magazine into the floor while perfectly lined up left to right. */
    const off = Math.hypot(angleDelta(b.aimYaw, wantYaw), b.aimPitch - wantPitch);
    /* How lined up a bot insists on being before it pulls. This, more
       than aim error, is what separates the tiers: a loose tolerance
       means firing during the swing and missing most of the burst. */
    const tolerance = (Math.atan2(PLAYER_RADIUS * 1.5, Math.max(2, dist)) +
      currentSpread(p) * 0.5 * Math.PI / 180) * d.fireTolerance;
    const inRange = dist < (w.melee ? w.meleeRange * 0.8 : d.sight);
    if (off < tolerance && inRange && canSee(match.world, p.ph.pos, t.ph.pos, playerEyeY(p), playerEyeY(t))) {
      if (now >= b.restUntil) {
        if (b.burstLeft <= 0) b.burstLeft = d.burstMin + Math.floor(b.rnd() * (d.burstMax - d.burstMin));
        cmd.buttons |= BTN.FIRE;
        b.burstLeft--;
        if (b.burstLeft <= 0) b.restUntil = now + d.restMin + b.rnd() * (d.restMax - d.restMin);
      }
      // Sights up at range, hip fire up close — same trade a player makes.
      if (dist > 16 && !w.melee) cmd.buttons |= BTN.ADS;
    }
  }

  /* ── Posture ───────────────────────────────────────────────────── */
  if (now < b.jumpUntil) cmd.buttons |= BTN.JUMP;
  if (now < b.crouchUntil) cmd.buttons |= BTN.CROUCH;
  if (b.state === STATE.ENGAGE && b.rnd() < d.jumpiness * dt * 4 && p.ph.onGround) b.jumpUntil = now + 60;
  if (b.state === STATE.ENGAGE && b.target) {
    const dist = Math.hypot(b.target.ph.pos.x - p.ph.pos.x, b.target.ph.pos.z - p.ph.pos.z);
    if (dist > 26 && b.rnd() < 0.02) b.crouchUntil = now + 900 + b.rnd() * 900;
  }
  if (b.state === STATE.ROAM || b.state === STATE.HUNT) cmd.buttons |= BTN.SPRINT;

  p.botCmd = cmd;
  return cmd;
}

/* ── Perception ────────────────────────────────────────────────────── */
function perceive(match, p, b, now) {
  const d = b.d;
  let best = null, bestScore = -Infinity;
  for (const o of match.players) {
    if (o === p || !o.alive) continue;
    if (match.mode.teams && o.team === p.team) continue;
    if (now < o.spawnProtectUntil) continue;
    const dx = o.ph.pos.x - p.ph.pos.x, dz = o.ph.pos.z - p.ph.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > d.sight) continue;
    const wantYaw = Math.atan2(-dx, -dz);
    const off = Math.abs(angleDelta(b.aimYaw, wantYaw)) * 180 / Math.PI;
    if (off > d.fov / 2) continue;
    if (!canSee(match.world, p.ph.pos, o.ph.pos, playerEyeY(p), playerEyeY(o))) continue;
    // Prefer close and already-hurt targets, and whoever is shooting at us.
    let score = 200 - dist * 2 + (1 - o.health / MAX_HEALTH) * 60;
    if (p.lastDamageFrom === o.id && now - p.lastDamageAt < 3000) score += 120;
    if (o === b.target) score += 45;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  if (best) {
    if (best !== b.target || now - b.targetSeenAt > 1400) b.targetFirstSeenAt = now;
    b.target = best;
    b.targetSeenAt = now;
    b.lastKnown = { x: best.ph.pos.x, y: best.ph.pos.y, z: best.ph.pos.z };
  } else if (b.target && !b.target.alive) {
    b.target = null; b.lastKnown = null;
  }
  /* Being shot at counts as information even with nothing in view. */
  if (now - p.lastDamageAt < 400 && p.lastDamageFrom) {
    const src = match.byId.get(p.lastDamageFrom);
    if (src && src.alive) { b.lastKnown = { x: src.ph.pos.x, y: src.ph.pos.y, z: src.ph.pos.z }; b.targetSeenAt = Math.max(b.targetSeenAt, now - 600); if (!b.target) b.target = src; }
  }
}

/* Gunfire is loud. Called by the match when a shot is fired. */
export function hearShot(match, shooter) {
  for (const p of match.players) {
    if (!p.isBot || !p.alive || !p.brain || p === shooter) continue;
    if (match.mode.teams && p.team === shooter.team) continue;
    const dist = Math.hypot(shooter.ph.pos.x - p.ph.pos.x, shooter.ph.pos.z - p.ph.pos.z);
    const range = p.brain.d.hearing * (curWeapon(shooter).quiet ? 0.4 : 1);
    if (dist > range) continue;
    p.brain.heardAt = match.time;
    // Deliberately imprecise: a heard direction, not a position.
    const j = (p.brain.rnd() - 0.5) * dist * 0.25;
    p.brain.heardPos = { x: shooter.ph.pos.x + j, y: shooter.ph.pos.y, z: shooter.ph.pos.z - j };
  }
}

/* ── Aiming ────────────────────────────────────────────────────────── */
function aimPoint(match, p, b, d, now) {
  const t = b.target;
  const dist = Math.hypot(t.ph.pos.x - p.ph.pos.x, t.ph.pos.z - p.ph.pos.z);
  /* Lead the target. Bullets are hitscan, so this is compensating for the
     bot's own turn rate rather than for travel time — without it a bot
     tracks permanently behind a strafing player. */
  const lead = d.lead * Math.min(0.32, dist / 90);
  const px = t.ph.pos.x + t.ph.vel.x * lead;
  const pz = t.ph.pos.z + t.ph.vel.z * lead;
  const py = t.ph.pos.y + t.ph.height * (0.62 + d.lead * 0.28) + t.ph.vel.y * lead * 0.4;

  /* Aim error wanders instead of jittering. A per-tick random offset
     looks like a machine having a seizure; a slow drift looks like hands. */
  if (now >= b.errAt) {
    b.errAt = now + 260 + b.rnd() * 340;
    const spread = d.aimError * Math.PI / 180;
    b.errYaw = (b.rnd() - 0.5) * 2 * spread;
    b.errPitch = (b.rnd() - 0.5) * spread;
  }
  const ex = Math.cos(b.errYaw) * dist, ez = Math.sin(b.errYaw) * dist;
  const ux = (px - p.ph.pos.x) / (dist || 1), uz = (pz - p.ph.pos.z) / (dist || 1);
  return {
    x: p.ph.pos.x + ux * ex - uz * ez * 0.35,
    y: py + b.errPitch * dist * 0.35,
    z: p.ph.pos.z + uz * ex + ux * ez * 0.35,
  };
}

/* ── Goals ─────────────────────────────────────────────────────────── */
function engageGoal(match, p, b, d, nav, now) {
  const t = b.target;
  const w = curWeapon(p);
  const dist = Math.hypot(t.ph.pos.x - p.ph.pos.x, t.ph.pos.z - p.ph.pos.z);
  const ideal = w.melee ? 1.2 : w.cls === 'Shotgun' ? 7 : w.cls === 'Sniper' ? 42 : 15;
  if (Math.abs(dist - ideal) < 6 && now < b.strafeUntil) return null;    // hold and strafe
  if (now >= b.strafeUntil) {
    b.strafeUntil = now + 500 + b.rnd() * 900;
    b.strafeDir = b.rnd() < 0.5 ? -1 : 1;
  }
  if (dist > ideal * 1.5) return { x: t.ph.pos.x, y: t.ph.pos.y, z: t.ph.pos.z };
  if (dist < ideal * 0.55) {
    // Back off along the line between us.
    const ux = (p.ph.pos.x - t.ph.pos.x) / (dist || 1), uz = (p.ph.pos.z - t.ph.pos.z) / (dist || 1);
    return { x: p.ph.pos.x + ux * 8, y: p.ph.pos.y, z: p.ph.pos.z + uz * 8 };
  }
  return null;
}

function coverGoal(match, p, b, nav) {
  const t = b.target;
  if (!t) return null;
  const from = nearestNode(nav, p.ph.pos.x, p.ph.pos.y, p.ph.pos.z);
  if (!from) return null;
  /* Look for a nearby node the threat cannot see. Only a sample is tested
     — a full scan of a 1700-node graph every time a bot gets hurt is not
     worth the accuracy. */
  let best = null, bestScore = -Infinity;
  const n = nav.nodes.length;
  for (let i = 0; i < 42; i++) {
    const c = nav.nodes[(b.rnd() * n) | 0];
    const dd = Math.hypot(c.x - p.ph.pos.x, c.z - p.ph.pos.z);
    if (dd > 26 || dd < 3) continue;
    if (traceClear(match.world, t.ph.pos.x, playerEyeY(t), t.ph.pos.z, c.x, c.y + 1.4, c.z)) continue;
    const away = Math.hypot(c.x - t.ph.pos.x, c.z - t.ph.pos.z);
    const score = away - dd * 1.4;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function roamGoal(match, p, b, nav, now) {
  if (b.goal && Math.hypot(b.goal.x - p.ph.pos.x, b.goal.z - p.ph.pos.z) > 3.5 && now - b.pathAt < 12000) return b.goal;
  /* Head somewhere far, biased toward busy parts of the map so bots
     converge on fights rather than patrolling empty corners. */
  let best = null, bestScore = -Infinity;
  const n = nav.nodes.length;
  for (let i = 0; i < 26; i++) {
    const c = nav.nodes[(b.rnd() * n) | 0];
    const dd = Math.hypot(c.x - p.ph.pos.x, c.z - p.ph.pos.z);
    if (dd < 12) continue;
    let score = dd * 0.4 + c.open * 14 + b.rnd() * 25;
    for (const o of match.players) {
      if (o === p || !o.alive) continue;
      const od = Math.hypot(o.ph.pos.x - c.x, o.ph.pos.z - c.z);
      if (od < 30) score += (30 - od) * (match.mode.teams && o.team === p.team ? -0.4 : 1.1);
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/* ── Path following ────────────────────────────────────────────────── */
function currentWaypoint(b) {
  return b.path && b.pathIdx < b.path.length ? b.path[b.pathIdx] : null;
}

function followPath(match, p, b, nav, goal, cmd, dt, now) {
  const needRepath = !b.path || b.pathIdx >= b.path.length || now - b.pathAt > 2200 ||
    (b.goal && Math.hypot(b.goal.x - goal.x, b.goal.z - goal.z) > 5);
  if (needRepath) {
    b.goal = { x: goal.x, y: goal.y !== undefined ? goal.y : p.ph.pos.y, z: goal.z };
    b.pathAt = now;
    const from = nearestNode(nav, p.ph.pos.x, p.ph.pos.y, p.ph.pos.z);
    const to = nearestNode(nav, b.goal.x, b.goal.y, b.goal.z);
    if (from && to) {
      const raw = findPath(nav, from.i, to.i);
      b.path = raw ? smoothPath(match.world, raw, p.ph.pos.x, p.ph.pos.y, p.ph.pos.z) : null;
      b.pathIdx = 0;
    } else b.path = null;
  }

  let wp = currentWaypoint(b);
  while (wp && Math.hypot(wp.x - p.ph.pos.x, wp.z - p.ph.pos.z) < 1.5 && Math.abs(wp.y - p.ph.pos.y) < 2) {
    b.pathIdx++; wp = currentWaypoint(b);
  }

  let wx = 0, wz = 0;
  if (wp) {
    wx = wp.x - p.ph.pos.x; wz = wp.z - p.ph.pos.z;
    const l = Math.hypot(wx, wz) || 1;
    wx /= l; wz /= l;
    // A waypoint above us means the link was a jump or a stair top.
    if (wp.y > p.ph.pos.y + 0.6 && p.ph.onGround && l < 2.6) b.jumpUntil = now + 70;
  } else if (b.state === STATE.ENGAGE) {
    // No path: circle-strafe around the target instead of standing still.
    const t = b.target;
    if (t) {
      const dx = t.ph.pos.x - p.ph.pos.x, dz = t.ph.pos.z - p.ph.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      wx = -dz / l * b.strafeDir; wz = dx / l * b.strafeDir;
    }
  }

  /* Strafe while engaging even when following a path — walking in a
     straight line toward someone shooting at you is how bots die. */
  if (b.state === STATE.ENGAGE && b.d.strafe > 0) {
    const t = b.target;
    if (t) {
      const dx = t.ph.pos.x - p.ph.pos.x, dz = t.ph.pos.z - p.ph.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      wx += (-dz / l) * b.strafeDir * b.d.strafe;
      wz += (dx / l) * b.strafeDir * b.d.strafe;
    }
  }

  const wl = Math.hypot(wx, wz);
  if (wl > 1e-4) {
    wx /= wl; wz /= wl;
    // World direction into the view frame the movement code expects.
    const sy = Math.sin(cmd.yaw), cy = Math.cos(cmd.yaw);
    cmd.moveZ = clamp(-sy * wx - cy * wz, -1, 1);
    cmd.moveX = clamp(cy * wx - sy * wz, -1, 1);
  }

  /* Stuck detection. Bots wedge on door frames and crate corners; a jump
     and a fresh path clears almost all of it. */
  const moved = Math.hypot(p.ph.pos.x - b.lastPos.x, p.ph.pos.z - b.lastPos.z);
  b.lastPos.x = p.ph.pos.x; b.lastPos.z = p.ph.pos.z;
  if ((cmd.moveX || cmd.moveZ) && moved < 0.02) {
    b.stuckFor += dt;
    if (b.stuckFor > 0.45) {
      b.jumpUntil = now + 90;
      b.pathAt = -1e9;
      b.strafeDir = -b.strafeDir;
      b.stuckFor = 0;
    }
  } else b.stuckFor = 0;
}
