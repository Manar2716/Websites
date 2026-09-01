/* The armory.
 *
 * Every weapon is data. Adding one means adding an entry here and, if you
 * want it to look different, a shape in client/js/game/viewmodel.js — no
 * other file needs to know it exists.
 *
 * A note on the numbers: they are balanced around a 100 HP player with up
 * to 50 armour, and around "shots to kill" rather than raw damage. A body
 * shot that needs four hits at 660 RPM kills in 273 ms; the same four hits
 * at 950 RPM kill in 189 ms but each one is worth less at range. That
 * trade — time-to-kill against forgiveness — is the whole balance model.
 */

export const SLOT = { PRIMARY: 0, SECONDARY: 1, MELEE: 2 };
export const CLASS = { AR: 'Assault Rifle', SMG: 'SMG', SHOTGUN: 'Shotgun', SNIPER: 'Sniper', DMR: 'Marksman', PISTOL: 'Pistol', LMG: 'LMG', MELEE: 'Melee' };

/* Fields, once, so the table below stays readable:
 *
 *   damage        base damage at point blank, before zone and falloff
 *   rpm           rounds per minute; the server enforces the interval
 *   burst         rounds per trigger pull (0 = full auto, 1 = semi)
 *   mag/reserve   magazine and carried ammo
 *   reloadMs      full reload; reloadEmptyMs when the chamber ran dry
 *   adsMs         hip -> sighted transition, both directions
 *   adsFov        multiplier on the player's FOV while sighted
 *   spreadHip     cone half-angle in degrees, standing still, hip fire
 *   spreadAds     the same while sighted
 *   spreadShot    added per shot, decays at spreadRecover per second
 *   recoil        vertical kick per shot and the horizontal wander
 *   falloff       [startRange, endRange, multiplierAtEnd]
 *   moveMul       movement speed multiplier while holding it
 *   pellets       > 1 makes it a shotgun; damage is per pellet
 */
const W = (id, o) => ({
  id, burst: 0, pellets: 1, reserve: 0, spreadShot: 0.35, spreadRecover: 9,
  spreadMove: 2.2, spreadAir: 3.4, moveMul: 1, adsMoveMul: 0.55, headMul: 1,
  falloff: [22, 55, 0.6], tracer: true, shell: true, zoomSway: 1, ...o,
});

export const WEAPONS = {
  /* ── Assault rifles ─────────────────────────────────────────────── */
  rift7: W('rift7', {
    name: 'RIFT-7', cls: CLASS.AR, slot: SLOT.PRIMARY,
    damage: 24, rpm: 660, mag: 30, reserve: 150,
    reloadMs: 1900, reloadEmptyMs: 2350, adsMs: 205, adsFov: 0.74,
    spreadHip: 2.6, spreadAds: 0.28, spreadShot: 0.30, spreadRecover: 8.5,
    recoil: { up: 0.42, side: 0.20, rise: 46, recover: 7.4, maxUp: 5.2, kick: 0.9 },
    falloff: [26, 64, 0.62], moveMul: 0.97,
    sound: { type: 'crack', pitch: 1.0, punch: 0.85 },
  }),
  triad: W('triad', {
    name: 'TRIAD', cls: CLASS.AR, slot: SLOT.PRIMARY,
    damage: 29, rpm: 820, burst: 3, burstDelayMs: 235, mag: 27, reserve: 135,
    reloadMs: 2000, reloadEmptyMs: 2450, adsMs: 190, adsFov: 0.70,
    spreadHip: 2.2, spreadAds: 0.16, spreadShot: 0.22, spreadRecover: 11,
    recoil: { up: 0.38, side: 0.13, rise: 52, recover: 9.5, maxUp: 3.4, kick: 0.8 },
    falloff: [30, 72, 0.72], moveMul: 0.97,
    sound: { type: 'crack', pitch: 1.12, punch: 0.8 },
  }),

  /* ── SMGs ───────────────────────────────────────────────────────── */
  wasp: W('wasp', {
    name: 'WASP', cls: CLASS.SMG, slot: SLOT.PRIMARY,
    damage: 17, rpm: 960, mag: 32, reserve: 192,
    reloadMs: 1550, reloadEmptyMs: 1950, adsMs: 145, adsFov: 0.82,
    spreadHip: 2.9, spreadAds: 0.55, spreadShot: 0.30, spreadRecover: 10,
    recoil: { up: 0.30, side: 0.26, rise: 44, recover: 8.6, maxUp: 4.4, kick: 0.62 },
    falloff: [14, 38, 0.48], moveMul: 1.06, adsMoveMul: 0.68,
    sound: { type: 'snap', pitch: 1.28, punch: 0.62 },
  }),
  needle: W('needle', {
    name: 'NEEDLE', cls: CLASS.SMG, slot: SLOT.PRIMARY,
    damage: 14, rpm: 1180, mag: 40, reserve: 200,
    reloadMs: 1700, reloadEmptyMs: 2100, adsMs: 135, adsFov: 0.85,
    spreadHip: 3.3, spreadAds: 0.72, spreadShot: 0.26, spreadRecover: 11,
    recoil: { up: 0.22, side: 0.30, rise: 40, recover: 9.4, maxUp: 4.8, kick: 0.5 },
    falloff: [12, 32, 0.44], moveMul: 1.09, adsMoveMul: 0.72,
    sound: { type: 'snap', pitch: 1.42, punch: 0.5 },
  }),

  /* ── Shotgun ────────────────────────────────────────────────────── */
  breaker: W('breaker', {
    name: 'BREAKER', cls: CLASS.SHOTGUN, slot: SLOT.PRIMARY,
    damage: 12, pellets: 9, rpm: 82, burst: 1, mag: 6, reserve: 36,
    reloadMs: 480, reloadPerShell: true, reloadEmptyMs: 620, adsMs: 220, adsFov: 0.88,
    spreadHip: 5.4, spreadAds: 3.6, spreadShot: 0, spreadRecover: 14,
    recoil: { up: 1.9, side: 0.5, rise: 30, recover: 5.0, maxUp: 6.0, kick: 2.6 },
    falloff: [7, 20, 0.16], moveMul: 1.02, adsMoveMul: 0.62, tracer: false,
    sound: { type: 'boom', pitch: 0.8, punch: 1.0 },
  }),

  /* ── Precision ──────────────────────────────────────────────────── */
  kestrel: W('kestrel', {
    name: 'KESTREL', cls: CLASS.SNIPER, slot: SLOT.PRIMARY,
    damage: 101, rpm: 44, burst: 1, mag: 5, reserve: 30,
    reloadMs: 2600, reloadEmptyMs: 3000, adsMs: 300, adsFov: 0.30,
    spreadHip: 7.5, spreadAds: 0.0, spreadShot: 0, spreadRecover: 6,
    recoil: { up: 3.2, side: 0.4, rise: 26, recover: 4.2, maxUp: 7.0, kick: 3.4 },
    falloff: [120, 200, 0.9], moveMul: 0.90, adsMoveMul: 0.34, zoomSway: 2.1,
    boltMs: 900, sound: { type: 'boom', pitch: 0.62, punch: 1.0 },
  }),
  verdict: W('verdict', {
    name: 'VERDICT', cls: CLASS.DMR, slot: SLOT.PRIMARY,
    damage: 46, rpm: 275, burst: 1, mag: 12, reserve: 72,
    reloadMs: 2000, reloadEmptyMs: 2400, adsMs: 235, adsFov: 0.52,
    spreadHip: 3.6, spreadAds: 0.08, spreadShot: 0.5, spreadRecover: 7,
    recoil: { up: 1.05, side: 0.28, rise: 34, recover: 5.6, maxUp: 5.4, kick: 1.5 },
    falloff: [55, 110, 0.85], moveMul: 0.94, adsMoveMul: 0.46, zoomSway: 1.4,
    sound: { type: 'crack', pitch: 0.78, punch: 0.95 },
  }),

  /* ── LMG ────────────────────────────────────────────────────────── */
  havoc: W('havoc', {
    name: 'HAVOC', cls: CLASS.LMG, slot: SLOT.PRIMARY,
    damage: 26, rpm: 700, mag: 75, reserve: 225,
    reloadMs: 3900, reloadEmptyMs: 4400, adsMs: 400, adsFov: 0.78,
    spreadHip: 4.2, spreadAds: 0.34, spreadShot: 0.28, spreadRecover: 6.5,
    recoil: { up: 0.50, side: 0.34, rise: 38, recover: 5.4, maxUp: 6.6, kick: 1.1 },
    falloff: [34, 78, 0.7], moveMul: 0.84, adsMoveMul: 0.38,
    sound: { type: 'boom', pitch: 1.0, punch: 0.9 },
  }),

  /* ── Sidearms ───────────────────────────────────────────────────── */
  talon: W('talon', {
    name: 'TALON', cls: CLASS.PISTOL, slot: SLOT.SECONDARY,
    damage: 28, rpm: 430, burst: 1, mag: 15, reserve: 75,
    reloadMs: 1350, reloadEmptyMs: 1750, adsMs: 130, adsFov: 0.80,
    spreadHip: 2.4, spreadAds: 0.22, spreadShot: 0.55, spreadRecover: 12,
    recoil: { up: 0.85, side: 0.30, rise: 40, recover: 8.5, maxUp: 4.0, kick: 1.2 },
    falloff: [18, 44, 0.55], moveMul: 1.10, adsMoveMul: 0.74,
    sound: { type: 'crack', pitch: 1.2, punch: 0.7 },
  }),
  hush: W('hush', {
    name: 'HUSH', cls: CLASS.PISTOL, slot: SLOT.SECONDARY,
    damage: 34, rpm: 300, burst: 1, mag: 12, reserve: 60,
    reloadMs: 1500, reloadEmptyMs: 1900, adsMs: 150, adsFov: 0.76,
    spreadHip: 2.0, spreadAds: 0.12, spreadShot: 0.45, spreadRecover: 12,
    recoil: { up: 0.70, side: 0.20, rise: 40, recover: 9.0, maxUp: 3.6, kick: 1.0 },
    falloff: [22, 50, 0.6], moveMul: 1.10, adsMoveMul: 0.74, quiet: true,
    sound: { type: 'thud', pitch: 0.9, punch: 0.45 },
  }),

  /* ── Melee. Gun Game's last rung, and always in the third slot. ─── */
  shiv: W('shiv', {
    name: 'SHIV', cls: CLASS.MELEE, slot: SLOT.MELEE,
    damage: 62, rpm: 145, burst: 1, mag: Infinity, reserve: Infinity,
    reloadMs: 0, adsMs: 120, adsFov: 1.0, melee: true, meleeRange: 2.6,
    spreadHip: 0, spreadAds: 0, spreadShot: 0, spreadRecover: 1,
    recoil: { up: 0.4, side: 0.5, rise: 30, recover: 9, maxUp: 2, kick: 0.6 },
    falloff: [2.6, 2.6, 1], moveMul: 1.16, adsMoveMul: 1.0,
    tracer: false, shell: false, backstabMul: 3,
    sound: { type: 'swipe', pitch: 1, punch: 0.4 },
  }),
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const getWeapon = (id) => WEAPONS[id] || WEAPONS.rift7;

/* Seconds between shots, straight from RPM. The server uses this as the
   floor when it validates fire rate, with a tick of slack. */
export const shotInterval = (w) => 60 / w.rpm;

/* Gun Game marches everybody up this ladder, one rung per kill, ending
   on the knife. Order goes forgiving -> awkward -> precise. */
export const GUN_GAME_LADDER = [
  'wasp', 'rift7', 'talon', 'needle', 'breaker', 'triad',
  'havoc', 'verdict', 'hush', 'kestrel', 'shiv',
];

/* What you start a normal round with. Loadouts pick the primary; the
   sidearm and knife are always there. */
export const DEFAULT_LOADOUT = { primary: 'rift7', secondary: 'talon', melee: 'shiv' };

export function loadoutWeapons(loadout) {
  const l = { ...DEFAULT_LOADOUT, ...(loadout || {}) };
  const primary = WEAPONS[l.primary] ? l.primary : DEFAULT_LOADOUT.primary;
  const secondary = WEAPONS[l.secondary] ? l.secondary : DEFAULT_LOADOUT.secondary;
  return [primary, secondary, 'shiv'];
}

/* Damage after range falloff. Linear between the two range stops, which
   is easy to reason about and matches what the range meter in the
   loadout screen draws. */
export function damageAtRange(w, range) {
  const [a, b, m] = w.falloff;
  if (range <= a) return w.damage;
  if (range >= b) return w.damage * m;
  return w.damage * (1 + (m - 1) * ((range - a) / (b - a)));
}

/* Shots-to-kill against 100 HP, used by the loadout UI. */
export function stk(w, hp = 100, zone = 1) {
  const d = w.damage * zone * (w.pellets > 1 ? w.pellets * 0.7 : 1);
  return Math.max(1, Math.ceil(hp / d));
}
