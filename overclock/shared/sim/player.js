/* The authoritative player entity.
 *
 * Everything that decides an outcome lives here and is stepped by the
 * server: health, ammo, whether the trigger is allowed to break yet. The
 * client keeps its own copy for prediction, but the server's copy is the
 * one that counts, and any field the client could profit from lying about
 * is recomputed rather than accepted.
 */

import {
  BTN, ZONE, PLAYER_RADIUS, PLAYER_HEIGHT, HEAD_HEIGHT, LEG_HEIGHT,
  RESPAWN_MS, SPAWN_PROTECT_MS, TEAM,
} from '../constants.js';
import { getWeapon, loadoutWeapons, shotInterval, WEAPONS } from '../weapons.js';
import { createPlayerPhysics, stepMovement, eyeY } from './movement.js';
import { clamp } from '../math.js';

export const MAX_HEALTH = 100;
export const MAX_ARMOUR = 50;

let nextId = 1;

export function createPlayer(opts = {}) {
  const p = {
    id: opts.id || nextId++,
    name: opts.name || 'PLAYER',
    team: opts.team || TEAM.NONE,
    isBot: !!opts.isBot,
    difficulty: opts.difficulty || 'normal',
    skin: opts.skin || 0,

    ph: createPlayerPhysics(),
    alive: false,
    health: MAX_HEALTH,
    armour: 0,
    respawnAt: 0,
    spawnProtectUntil: 0,
    lastDamageFrom: 0,
    lastDamageAt: 0,

    weapons: loadoutWeapons(opts.loadout),
    slot: 0,
    ammo: [],
    /* Timers are absolute match times in ms, never countdowns — a
       countdown has to be decremented every tick and drifts. */
    nextFireAt: 0,
    reloadUntil: 0,
    reloadSlot: -1,
    switchUntil: 0,
    burstLeft: 0,
    nextBurstAt: 0,
    boltUntil: 0,
    shotSeq: 0,
    triggerWasDown: false,

    ads: 0,
    adsTarget: 0,
    spread: 0,

    kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, bestStreak: 0,
    shotsFired: 0, shotsHit: 0, headshots: 0, damageDealt: 0,
    ladderRung: 0,            // Gun Game progress
    ping: 0,
    /* Rewind buffer: {t, x, y, z, h} samples, newest last. */
    history: [],
    connected: true,
    lastCmdSeq: 0,
    lastCmdAt: 0,
    warnings: 0,
  };
  resetAmmo(p);
  return p;
}

export function resetAmmo(p) {
  p.ammo = p.weapons.map((id) => {
    const w = getWeapon(id);
    return { mag: w.mag, reserve: w.reserve };
  });
}

export const curWeapon = (p) => getWeapon(p.weapons[p.slot]);
export const curAmmo = (p) => p.ammo[p.slot];

export function setWeapons(p, ids) {
  p.weapons = ids.filter((id) => WEAPONS[id]);
  if (!p.weapons.length) p.weapons = loadoutWeapons(null);
  p.slot = Math.min(p.slot, p.weapons.length - 1);
  resetAmmo(p);
  p.reloadUntil = 0; p.reloadSlot = -1; p.burstLeft = 0;
}

export function spawnPlayer(p, spot, now) {
  p.alive = true;
  p.health = MAX_HEALTH;
  p.armour = 0;
  p.ph.pos.x = spot.x; p.ph.pos.y = spot.y; p.ph.pos.z = spot.z;
  p.ph.vel.x = p.ph.vel.y = p.ph.vel.z = 0;
  p.ph.yaw = spot.yaw || 0; p.ph.pitch = 0;
  p.ph.height = PLAYER_HEIGHT;
  p.ph.onGround = false;
  p.spawnProtectUntil = now + SPAWN_PROTECT_MS;
  p.slot = 0;
  p.ads = 0; p.adsTarget = 0; p.spread = 0;
  p.nextFireAt = now; p.reloadUntil = 0; p.reloadSlot = -1;
  p.burstLeft = 0; p.boltUntil = 0; p.switchUntil = 0;
  resetAmmo(p);
  p.history.length = 0;
}

export function killPlayer(p, now, respawnMs = RESPAWN_MS) {
  p.alive = false;
  p.health = 0;
  p.deaths++;
  p.streak = 0;
  p.respawnAt = now + respawnMs;
}

/* Damage, after zone and falloff have already been applied by the caller.
   Armour soaks two thirds of what lands and wears down doing it. */
export function applyDamage(p, amount, now) {
  let dmg = amount;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, dmg * 0.66);
    p.armour -= absorbed;
    dmg -= absorbed;
  }
  p.health -= dmg;
  p.lastDamageAt = now;
  return p.health <= 0;
}

/* The collision box used for hits. It is the movement box, so what you
   see and what you can shoot are the same volume. */
export function hitBox(x, y, z, height) {
  return {
    minX: x - PLAYER_RADIUS, maxX: x + PLAYER_RADIUS,
    minY: y, maxY: y + height,
    minZ: z - PLAYER_RADIUS, maxZ: z + PLAYER_RADIUS,
  };
}

/* Which zone a hit at world height `hy` lands in. */
export function zoneAt(hy, footY, height) {
  const rel = hy - footY;
  if (rel >= height - HEAD_HEIGHT) return 'head';
  if (rel <= LEG_HEIGHT) return 'leg';
  return 'body';
}
export const zoneMul = (z) => ZONE[z] || 1;

/* ── Weapon handling ────────────────────────────────────────────────
 * Called once per tick with the player's input. Returns a list of shots
 * to resolve, so the caller (the match) owns hit detection and the events
 * and this file owns only "is the gun allowed to go off".
 */
export function stepWeapon(p, cmd, now, dt, out) {
  const w = curWeapon(p);
  const ammo = curAmmo(p);

  // ADS. Sights come up and down at the weapon's own speed.
  const wantAds = (cmd.buttons & BTN.ADS) !== 0 && !w.melee;
  p.adsTarget = wantAds ? 1 : 0;
  const adsRate = dt / Math.max(0.001, w.adsMs / 1000);
  p.ads = clamp(p.ads + (p.adsTarget ? adsRate : -adsRate * 1.25), 0, 1);

  // Weapon switching.
  const want = (cmd.buttons & BTN.W1) ? 0 : (cmd.buttons & BTN.W2) ? 1 : (cmd.buttons & BTN.W3) ? 2 : -1;
  if (want >= 0 && want < p.weapons.length && want !== p.slot && now >= p.switchUntil) {
    p.slot = want;
    p.switchUntil = now + 320;
    p.reloadUntil = 0; p.reloadSlot = -1; p.burstLeft = 0; p.ads = 0;
    return;
  }

  // Reload completion.
  if (p.reloadUntil && now >= p.reloadUntil) {
    finishReload(p, now);
  }

  const reloading = p.reloadUntil > now;
  const switching = p.switchUntil > now;

  // Manual reload.
  if ((cmd.buttons & BTN.RELOAD) && !reloading && !switching && ammo.mag < w.mag && ammo.reserve > 0) {
    startReload(p, now);
    return;
  }

  if (reloading || switching || now < p.boltUntil) { p.triggerWasDown = (cmd.buttons & BTN.FIRE) !== 0; return; }

  // Spread decays whenever the trigger is not being held down.
  p.spread = Math.max(0, p.spread - w.spreadRecover * dt);

  const trigger = (cmd.buttons & BTN.FIRE) !== 0;
  const semi = w.burst === 1;
  const edge = trigger && !p.triggerWasDown;
  /* Semi-autos need a fresh trigger pull per shot. Burst weapons do not:
     holding the trigger keeps bursting, which matters on a touchscreen
     where re-tapping accurately is far harder than on a mouse. */
  const wantsFire = semi ? edge : trigger;

  // A burst in flight keeps firing whether or not the trigger is held.
  if (p.burstLeft > 0 && now >= p.nextBurstAt) {
    if (ammo.mag > 0) { emitShot(p, w, ammo, now, out); p.burstLeft--; p.nextBurstAt = now + shotInterval(w) * 1000; }
    else p.burstLeft = 0;
    if (p.burstLeft === 0) p.nextFireAt = now + (w.burstDelayMs || 0);
  } else if (wantsFire && now >= p.nextFireAt) {
    if (ammo.mag <= 0) {
      if (ammo.reserve > 0) startReload(p, now);
      else if (edge) out.push({ dry: true });
    } else if (w.burst > 1) {
      p.burstLeft = Math.min(w.burst, ammo.mag);
      p.nextBurstAt = now;
    } else {
      emitShot(p, w, ammo, now, out);
      p.nextFireAt = now + shotInterval(w) * 1000;
      if (w.boltMs) p.boltUntil = now + w.boltMs;
    }
  }
  p.triggerWasDown = trigger;
}

function emitShot(p, w, ammo, now, out) {
  ammo.mag--;
  p.shotsFired++;
  p.shotSeq = (p.shotSeq + 1) & 0xffff;
  out.push({ shot: true, seq: p.shotSeq, at: now });
  p.spread = Math.min(w.spreadHip * 1.8, p.spread + w.spreadShot);
}

export function startReload(p, now) {
  const w = curWeapon(p);
  const ammo = curAmmo(p);
  if (w.melee || ammo.reserve <= 0 || ammo.mag >= w.mag) return false;
  const empty = ammo.mag === 0;
  p.reloadUntil = now + (empty && w.reloadEmptyMs ? w.reloadEmptyMs : w.reloadMs);
  p.reloadSlot = p.slot;
  p.burstLeft = 0;
  return true;
}

function finishReload(p, now) {
  const slot = p.reloadSlot;
  p.reloadUntil = 0; p.reloadSlot = -1;
  if (slot < 0 || slot >= p.weapons.length) return;
  const w = getWeapon(p.weapons[slot]);
  const ammo = p.ammo[slot];
  if (w.reloadPerShell) {
    // Shell-at-a-time: one round per cycle, and the cycle restarts while
    // there is room, which is what makes cancelling a shotgun reload work.
    if (ammo.mag < w.mag && ammo.reserve > 0) { ammo.mag++; ammo.reserve--; }
    if (ammo.mag < w.mag && ammo.reserve > 0) { p.reloadUntil = now + w.reloadMs; p.reloadSlot = slot; }
    return;
  }
  const need = Math.min(w.mag - ammo.mag, ammo.reserve);
  ammo.mag += need;
  ammo.reserve -= need;
}

/* Total spread cone half-angle in degrees for the next shot. */
export function currentSpread(p) {
  const w = curWeapon(p);
  const base = w.spreadHip + (w.spreadAds - w.spreadHip) * p.ads;
  const speed = Math.hypot(p.ph.vel.x, p.ph.vel.z);
  const moving = Math.min(1, speed / 7) * w.spreadMove * (1 - p.ads * 0.55);
  const air = p.ph.onGround ? 0 : w.spreadAir * (1 - p.ads * 0.3);
  const crouch = p.ph.crouching ? -base * 0.3 : 0;
  return Math.max(0, base + moving + air + crouch + p.spread);
}

/* Movement speed multiplier from the weapon and sighting state. */
export function speedMultiplier(p) {
  const w = curWeapon(p);
  return w.moveMul * (1 + (w.adsMoveMul - 1) * p.ads);
}

export function stepPlayerMovement(world, p, cmd, dt) {
  return stepMovement(world, p.ph, cmd, dt, speedMultiplier(p));
}

export const playerEyeY = (p) => eyeY(p.ph);
