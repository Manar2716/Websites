/* Headless checks for the shared simulation.
 *
 *   node tools/test-sim.js
 *
 * These run the real match loop, not a mock of it, because the bugs worth
 * catching here are the ones where two correct-looking modules disagree.
 */

import { ALL_MAP_IDS, getMap } from '../shared/maps/index.js';
import { validateMap } from '../shared/sim/validate.js';
import { Match } from '../shared/sim/match.js';
import { TICK_DT, BTN, GAME_STATE, EV } from '../shared/constants.js';
import { createPlayer, spawnPlayer, stepWeapon, curAmmo } from '../shared/sim/player.js';
import { WEAPONS, GUN_GAME_LADDER } from '../shared/weapons.js';

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  — ' + detail : '')); }
};
const section = (s) => console.log('\n' + s);
const run = (m, ticks) => { for (let i = 0; i < ticks; i++) m.tick(TICK_DT * 1000); };

/* ── Maps ─────────────────────────────────────────────────────────── */
section('maps');
for (const id of ALL_MAP_IDS) {
  const r = validateMap(getMap(id));
  ok(r.ok, `${id}: ${r.nodes} nav nodes, ${(r.frac * 100).toFixed(0)}% reachable, ${r.brushes} brushes`, r.issues.join('; '));
}

/* ── Weapons ──────────────────────────────────────────────────────── */
section('weapons');
for (const w of Object.values(WEAPONS)) {
  const finite = ['damage', 'rpm', 'adsMs'].every((k) => Number.isFinite(w[k]));
  ok(finite && w.name && w.cls, `${w.name} is fully specified`);
}
ok(GUN_GAME_LADDER.every((id) => WEAPONS[id]), 'every rung of the Gun Game ladder is a real weapon');
ok(GUN_GAME_LADDER[GUN_GAME_LADDER.length - 1] === 'shiv', 'the ladder ends on the knife');

/* ── A duel resolves ──────────────────────────────────────────────── */
section('combat');
{
  const m = new Match({ mapId: 'range', mode: 'ffa', duration: 120, scoreLimit: 5 });
  const a = m.addPlayer({ name: 'A' }), b = m.addPlayer({ name: 'B' });
  run(m, 240);
  a.ph.pos = { x: 0, y: 0.6, z: 24 }; b.ph.pos = { x: 0, y: 0, z: 8 };
  a.spawnProtectUntil = 0; b.spawnProtectUntil = 0;
  let seq = 1, ticks = 0;
  while (ticks < 900 && a.kills === 0) {
    m.queueInput(a.id, [{ seq: seq++, moveX: 0, moveZ: 0, buttons: BTN.FIRE, yaw: 0, pitch: -0.02 }]);
    m.tick(TICK_DT * 1000); ticks++;
  }
  ok(a.kills === 1, `a rifle duel at 16m resolves (${ticks} ticks, ${a.shotsFired} shots, ${a.shotsHit} hit)`);
  ok(b.deaths === 1 && !b.alive, 'the loser is dead and credited with a death');
  ok(m.events.some((e) => e.t === EV.KILL), 'a kill event was emitted for the feed');
  const before = b.ph.pos.z;
  run(m, 260);
  ok(b.alive && b.health === 100, 'the loser respawns at full health');
  ok(Math.hypot(b.ph.pos.x - a.ph.pos.x, b.ph.pos.z - a.ph.pos.z) > 4, 'the respawn is not on top of the killer');
}

/* ── Friendly fire and spawn protection are honoured ──────────────── */
{
  const m = new Match({ mapId: 'range', mode: 'tdm', friendlyFire: false });
  const a = m.addPlayer({ name: 'A', team: 1 }), b = m.addPlayer({ name: 'B', team: 1 });
  run(m, 240);
  a.ph.pos = { x: 0, y: 0.6, z: 24 }; b.ph.pos = { x: 0, y: 0, z: 8 };
  a.spawnProtectUntil = 0; b.spawnProtectUntil = 0;
  let seq = 1;
  for (let i = 0; i < 240; i++) { m.queueInput(a.id, [{ seq: seq++, moveX: 0, moveZ: 0, buttons: BTN.FIRE, yaw: 0, pitch: -0.02 }]); m.tick(TICK_DT * 1000); }
  ok(b.health === 100, 'friendly fire off means a team-mate takes nothing');

  const m2 = new Match({ mapId: 'range', mode: 'ffa' });
  const c = m2.addPlayer({ name: 'C' }), d = m2.addPlayer({ name: 'D' });
  run(m2, 240);
  c.ph.pos = { x: 0, y: 0.6, z: 24 }; d.ph.pos = { x: 0, y: 0, z: 8 };
  c.spawnProtectUntil = 0;
  d.spawnProtectUntil = m2.time + 5000;          // still protected throughout
  seq = 1;
  for (let i = 0; i < 120; i++) { m2.queueInput(c.id, [{ seq: seq++, moveX: 0, moveZ: 0, buttons: BTN.FIRE, yaw: 0, pitch: -0.02 }]); m2.tick(TICK_DT * 1000); }
  ok(c.shotsFired > 8, 'the shooter really did fire at them');
  ok(d.health === 100, 'a spawn-protected player takes nothing');
}

/* ── Input validation ─────────────────────────────────────────────── */
section('anti-cheat');
{
  const m = new Match({ mapId: 'range', mode: 'ffa' });
  const p = m.addPlayer({ name: 'P' });
  run(m, 240);
  m.queueInput(p.id, [{ seq: 1, moveX: 900, moveZ: -900, buttons: 0xffff, yaw: NaN, pitch: 99 }]);
  ok(p.inputQueue.length === 0, 'a command with a NaN view angle is rejected outright');
  m.queueInput(p.id, [{ seq: 2, moveX: 900, moveZ: -900, buttons: 0xffff, yaw: 1, pitch: 99 }]);
  const c = p.inputQueue[0];
  ok(c && c.moveX === 1 && c.moveZ === -1, 'movement axes are clamped to the unit range');
  ok(c && Math.abs(c.pitch) < Math.PI / 2, 'pitch is clamped to straight up and down');
  ok(c && (c.buttons & ~2047) === 0, 'unknown button bits are stripped');

  // Flooding gains nothing: the queue is bounded and drained at a bounded rate.
  const flood = [];
  for (let i = 0; i < 400; i++) flood.push({ seq: 100 + i, moveX: 0, moveZ: 1, buttons: BTN.SPRINT, yaw: 0, pitch: 0 });
  m.queueInput(p.id, flood);
  ok(p.inputQueue.length <= 12, `the input queue is bounded (${p.inputQueue.length} held)`);
  const z0 = p.ph.pos.z;
  m.tick(TICK_DT * 1000);
  const moved = Math.abs(p.ph.pos.z - z0);
  ok(moved < 0.4, `one tick moves one tick's worth however many commands arrive (${moved.toFixed(3)} units)`);

  // Replayed sequence numbers are ignored.
  const q = p.inputQueue.length;
  m.queueInput(p.id, [{ seq: 5, moveX: 0, moveZ: 1, buttons: 0, yaw: 0, pitch: 0 }]);
  ok(p.inputQueue.length === q, 'a stale sequence number is dropped');
}

/* ── Modes ────────────────────────────────────────────────────────── */
section('modes');
{
  const m = new Match({ mapId: 'reactor', mode: 'gungame' });
  const a = m.addPlayer({ name: 'A' }), b = m.addPlayer({ name: 'B' });
  run(m, 240);
  ok(a.weapons[0] === GUN_GAME_LADDER[0], 'gun game starts everyone on the first rung');
  m.kill(b, a, 'wasp', m.time);
  ok(a.ladderRung === 1 && a.weapons[0] === GUN_GAME_LADDER[1], 'a kill promotes you up the ladder');
  a.ladderRung = GUN_GAME_LADDER.length;
  ok(m.mode.isOver(m), 'finishing the ladder ends the match');
}
{
  const m = new Match({ mapId: 'reactor', mode: 'tdm', scoreLimit: 3 });
  const a = m.addPlayer({ name: 'A', team: 1 }), b = m.addPlayer({ name: 'B', team: 2 });
  run(m, 240);
  for (let i = 0; i < 3; i++) m.kill(b, a, 'rift7', m.time);
  m.checkEnd(m.time);
  ok(m.state === GAME_STATE.ENDED, 'team deathmatch ends at the score limit');
  ok(m.endInfo.winner.team === 1, 'the winning team is reported');
}
{
  const m = new Match({ mapId: 'reactor', mode: 'ffa', duration: 2 });
  m.addPlayer({ name: 'A' });
  run(m, 240 + 130);
  ok(m.state === GAME_STATE.ENDED && m.endInfo.reason === 'time', 'a match ends when the clock runs out');
}

/* ── Countdown ────────────────────────────────────────────────────── */
section('match flow');
{
  const m = new Match({ mapId: 'reactor', mode: 'ffa' });
  m.addPlayer({ name: 'A' });
  ok(m.state === GAME_STATE.COUNTDOWN, 'a match opens in the 3-2-1 countdown');
  run(m, 100);
  ok(m.state === GAME_STATE.COUNTDOWN, 'and is still counting down after 1.6s');
  run(m, 140);
  ok(m.state === GAME_STATE.LIVE, 'then goes live');
  ok(m.players[0].alive, 'and everyone is spawned in');
}

/* ── Map metadata survives the build ──────────────────────────────── */
section('map metadata');
{
  const range = getMap('range');
  ok(!!range.training, 'the aim range carries its training volume through the builder');
  ok(range.training && range.training.stand && Number.isFinite(range.training.stand.z),
    'the training stand position is usable');
  const a = range.training.area;
  ok(a && a.maxX > a.minX && a.maxY > a.minY && a.maxZ > a.minZ, 'the target volume is non-degenerate');
  ok(getMap('foundry').training === null, 'a normal map has no training volume');
}

/* ── Bots ─────────────────────────────────────────────────────────── */
section('bots');
{
  const m = new Match({ mapId: 'foundry', mode: 'ffa', duration: 90, scoreLimit: 9999, botDifficulty: 'normal', seed: 99 });
  const bots = m.addBots(8);
  ok(bots.length === 8, 'eight bots joined');
  const start = bots.map((b) => ({ x: b.ph.pos.x, z: b.ph.pos.z }));
  const t0 = Date.now();
  let kills = 0, jumps = 0, reloads = 0;
  for (let i = 0; i < 90 * 60; i++) {
    m.tick(TICK_DT * 1000);
    for (const e of m.flushEvents()) { if (e.t === EV.KILL) kills++; if (e.t === EV.JUMP) jumps++; }
  }
  const ms = Date.now() - t0;
  const travelled = bots.map((b, i) => Math.hypot(b.ph.pos.x - start[i].x, b.ph.pos.z - start[i].z)).sort((a, b) => a - b);
  const shots = bots.reduce((a, b) => a + b.shotsFired, 0);
  ok(kills > 20, `bots fight: ${kills} kills in 90s`);
  ok(shots > 200, `bots shoot: ${shots} rounds fired`);
  ok(jumps > 0, `bots jump: ${jumps} jumps`);
  ok(travelled[1] > 5, `bots move around rather than milling on the spot (2nd-least travelled: ${travelled[1].toFixed(0)} units)`);
  ok(bots.every((b) => b.deaths > 0 || b.kills > 0), 'every bot took part');
  ok(ms < 90000 / 4, `90s of 8 bots simulates in ${ms}ms (${(90000 / ms).toFixed(0)}x real time)`);
  const stuck = bots.filter((b) => b.ph.pos.y < m.world.bounds.minY - 5);
  ok(stuck.length === 0, 'no bot fell out of the world');
}
{
  // Difficulty has to be monotonic, or the picker is decoration.
  const tiers = ['easy', 'normal', 'hard', 'insane'];
  const kd = {};
  const m = new Match({ mapId: 'reactor', mode: 'ffa', duration: 240, scoreLimit: 9999, seed: 4242 });
  tiers.forEach((d, ti) => { for (let i = 0; i < 3; i++) m.addBots(1, d); });
  for (let i = 0; i < 240 * 60; i++) { m.tick(TICK_DT * 1000); if (i % 600 === 0) m.flushEvents(); }
  for (const t of tiers) {
    const g = m.players.filter((p) => p.difficulty === t);
    kd[t] = g.reduce((a, p) => a + p.kills, 0) / Math.max(1, g.reduce((a, p) => a + p.deaths, 0));
  }
  ok(kd.easy < kd.normal && kd.normal < kd.hard && kd.hard < kd.insane,
    `difficulty separates: ${tiers.map((t) => t + ' ' + kd[t].toFixed(2)).join(', ')}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
