/* The match.
 *
 * One authoritative simulation of one round. The server owns one of these
 * per room; an offline client owns one in a worker and talks to it through
 * the same message protocol, which is why nothing in this file imports
 * anything from node or the DOM.
 *
 * The anti-cheat story is mostly structural rather than a list of checks.
 * The client never sends a position, a health value, an ammo count or a
 * hit — it sends buttons and view angles, and this file simulates the
 * consequences. A fixed step is used for every command regardless of what
 * the client claims elapsed, so there is no dt to inflate. What is left to
 * validate is small and explicit, and lives in `sanitiseCommand`.
 */

import {
  TICK_DT, TICK_HZ, GAME_STATE, EV, TEAM, BTN, RESPAWN_MS, MAX_PLAYERS,
} from '../constants.js';
import { getMap } from '../maps/index.js';
import { getMode } from './modes.js';
import { getWeapon, WEAPONS } from '../weapons.js';
import {
  createPlayer, spawnPlayer, killPlayer, stepWeapon, stepPlayerMovement,
  currentSpread, curWeapon, curAmmo, setWeapons, playerEyeY, MAX_HEALTH,
} from './player.js';
import { resolveShot, recordHistory, damageFor, applyHit, canSee } from './combat.js';
import { makeRandom, clamp } from '../math.js';
import { fitsAt } from '../maps/builder.js';
import { thinkBot, attachBrain, botName, hearShot, DIFFICULTIES } from './bots.js';

const MAX_QUEUED_INPUTS = 12;
const INPUT_TIMEOUT_MS = 900;
const VALID_BUTTONS = Object.values(BTN).reduce((a, b) => a | b, 0);

export class Match {
  constructor(config = {}) {
    const mode = getMode(config.mode);
    const d = mode.defaults;
    this.config = {
      mapId: config.mapId || 'foundry',
      mode: mode.id,
      duration: config.duration !== undefined ? config.duration : d.duration,
      scoreLimit: config.scoreLimit !== undefined ? config.scoreLimit : d.scoreLimit,
      friendlyFire: config.friendlyFire !== undefined ? !!config.friendlyFire : d.friendlyFire,
      respawn: config.respawn !== undefined ? !!config.respawn : d.respawn,
      botCount: config.botCount || 0,
      botDifficulty: config.botDifficulty || 'normal',
      seed: config.seed || ((Math.random() * 0x7fffffff) | 0),
    };
    this.mode = mode;
    this.world = getMap(this.config.mapId);
    this.players = [];
    this.byId = new Map();
    this.teamScore = { [TEAM.ALPHA]: 0, [TEAM.BRAVO]: 0 };
    this.time = 0;                       // ms of simulated match time
    this.state = GAME_STATE.COUNTDOWN;
    this.countdownMs = 3600;
    this.events = [];
    this.tickCount = 0;
    this.random = makeRandom(this.config.seed);
    this.endInfo = null;
    this.onEvent = null;                 // optional immediate sink
    this._shotOut = [];
  }

  get elapsed() { return this.time / 1000; }
  get remaining() {
    if (!this.config.duration) return Infinity;
    return Math.max(0, this.config.duration - this.elapsed);
  }

  /* ── Roster ─────────────────────────────────────────────────────── */
  addPlayer(opts = {}) {
    if (this.players.length >= MAX_PLAYERS + this.config.botCount) return null;
    const p = createPlayer(opts);
    if (this.mode.teams && !p.team) p.team = this.pickTeam();
    if (!this.mode.teams) p.team = TEAM.NONE;
    p.inputQueue = [];
    p.lastCmd = null;
    p.inputBudget = 0;
    p.pendingRespawn = true;
    this.players.push(p);
    this.byId.set(p.id, p);
    return p;
  }

  /* Bots join the roster like anybody else — same entity, same loop, same
     rules. The only difference is where their commands come from. */
  addBots(count, difficulty = this.config.botDifficulty) {
    const added = [];
    for (let i = 0; i < count; i++) {
      const p = this.addPlayer({ name: botName(this.players.filter((q) => q.isBot).length), isBot: true, difficulty });
      if (!p) break;
      attachBrain(p, DIFFICULTIES[difficulty] ? difficulty : 'normal', this.config.seed + i * 977);
      added.push(p);
    }
    return added;
  }

  removePlayer(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i >= 0) { this.byId.delete(id); this.players.splice(i, 1); }
  }

  pickTeam() {
    let a = 0, b = 0;
    for (const p of this.players) { if (p.team === TEAM.ALPHA) a++; else if (p.team === TEAM.BRAVO) b++; }
    if (a === b) return this.random() < 0.5 ? TEAM.ALPHA : TEAM.BRAVO;
    return a < b ? TEAM.ALPHA : TEAM.BRAVO;
  }

  /* ── Input ──────────────────────────────────────────────────────── */
  queueInput(id, cmds) {
    const p = this.byId.get(id);
    if (!p || p.isBot) return;
    for (const raw of cmds) {
      const cmd = sanitiseCommand(raw);
      if (!cmd) continue;
      if (cmd.seq <= p.lastCmdSeq) continue;         // stale or replayed
      p.lastCmdSeq = cmd.seq;
      p.inputQueue.push(cmd);
    }
    /* A client that floods gains nothing: the queue is bounded, and the
       tick loop consumes at a bounded rate regardless of its length. */
    while (p.inputQueue.length > MAX_QUEUED_INPUTS) p.inputQueue.shift();
    p.lastCmdAt = this.time;
  }

  /* ── Tick ───────────────────────────────────────────────────────── */
  tick(dtMs = TICK_DT * 1000) {
    if (this.state === GAME_STATE.ENDED) return;
    if (this.state === GAME_STATE.COUNTDOWN) {
      this.countdownMs -= dtMs;
      if (this.countdownMs <= 0) {
        this.state = GAME_STATE.LIVE;
        this.countdownMs = 0;
        for (const p of this.players) p.pendingRespawn = true;
      }
      this.tickCount++;
      return;
    }

    this.time += dtMs;
    const now = this.time;
    const dt = dtMs / 1000;

    for (const p of this.players) {
      if (!p.alive) {
        if (p.pendingRespawn || (this.config.respawn && p.respawnAt && now >= p.respawnAt)) {
          this.respawn(p);
        }
        recordHistory(p, now);
        continue;
      }

      const cmd = p.isBot ? thinkBot(this, p, dt) : this.nextCommand(p, now);
      p.lastCmd = cmd;
      stepPlayerMovement(this.world, p, cmd, dt);

      this._shotOut.length = 0;
      stepWeapon(p, cmd, now, dt, this._shotOut);
      for (const ev of this._shotOut) {
        if (ev.shot) this.fire(p, ev.seq, cmd, now);
        else if (ev.dry) this.push({ t: EV.RELOAD, id: p.id, dry: 1 });
      }
      if (p.ph.jumped) this.push({ t: EV.JUMP, id: p.id, x: p.ph.pos.x, y: p.ph.pos.y, z: p.ph.pos.z });
      if (p.ph.fellOut) { p.ph.fellOut = false; this.kill(p, null, null, now); }

      recordHistory(p, now);
    }

    this.checkEnd(now);
    this.tickCount++;
  }

  nextCommand(p, now) {
    /* One command per tick is the default. A short backlog is drained a
       little faster so a client that hiccuped catches up within a few
       ticks, but the budget stops that becoming a speed advantage. */
    p.inputBudget = Math.min(p.inputBudget + 1, 3);
    let cmd = null;
    while (p.inputBudget >= 1 && p.inputQueue.length) {
      cmd = p.inputQueue.shift();
      p.inputBudget -= 1;
      if (p.inputQueue.length <= 3) break;
    }
    if (cmd) return cmd;
    if (p.lastCmd && now - p.lastCmdAt < INPUT_TIMEOUT_MS) {
      /* Hold the last look angles but let go of everything else, so a
         dropped packet does not empty a magazine into a wall. */
      return { seq: p.lastCmd.seq, moveX: 0, moveZ: 0, buttons: p.lastCmd.buttons & BTN.ADS, yaw: p.lastCmd.yaw, pitch: p.lastCmd.pitch };
    }
    return { seq: 0, moveX: 0, moveZ: 0, buttons: 0, yaw: p.ph.yaw, pitch: p.ph.pitch };
  }

  /* ── Shooting ───────────────────────────────────────────────────── */
  fire(shooter, seq, cmd, now) {
    const w = curWeapon(shooter);
    const spread = currentSpread(shooter);
    const res = resolveShot({ world: this.world, players: this.players, now }, shooter, {
      weapon: w, spread, seq, yaw: cmd.yaw, pitch: cmd.pitch,
    });

    this.push({
      t: EV.SHOT, id: shooter.id, seq, weapon: shooter.weapons[shooter.slot],
      x: res.origin.x, y: res.origin.y, z: res.origin.z,
      yaw: cmd.yaw, pitch: cmd.pitch, spread,
      ads: shooter.ads > 0.5 ? 1 : 0,
    });
    hearShot(this, shooter);

    let anyHit = false, headshot = false, killed = null;
    const perTarget = new Map();

    for (const r of res.results) {
      if (!r.target) {
        this.push({ t: EV.IMPACT, x: r.point.x, y: r.point.y, z: r.point.z,
          nx: r.normal ? r.normal.x : 0, ny: r.normal ? r.normal.y : 0, nz: r.normal ? r.normal.z : 0,
          colour: r.surface || '#888888' });
        continue;
      }
      const target = r.target;
      if (!this.canDamage(shooter, target, now)) continue;
      const dmg = damageFor(w, r, shooter, target);
      perTarget.set(target, (perTarget.get(target) || 0) + dmg);
      if (r.zone === 'head') headshot = true;
      anyHit = true;
      this.push({ t: EV.IMPACT, x: r.point.x, y: r.point.y, z: r.point.z, nx: 0, ny: 1, nz: 0, colour: '#c8203a', flesh: 1 });
    }

    if (anyHit) shooter.shotsHit++;
    if (headshot) shooter.headshots++;

    for (const [target, dmg] of perTarget) {
      shooter.damageDealt += Math.min(dmg, target.health + target.armour);
      target.lastDamageFrom = shooter.id;
      const dead = applyHit(target, dmg, now);
      this.push({ t: EV.HIT, id: shooter.id, target: target.id, dmg: Math.round(dmg), head: headshot ? 1 : 0, kill: dead ? 1 : 0 });
      this.push({
        t: EV.DAMAGE, id: target.id, from: shooter.id, dmg: Math.round(dmg),
        x: shooter.ph.pos.x, y: playerEyeY(shooter), z: shooter.ph.pos.z, head: headshot ? 1 : 0,
      });
      if (dead) { this.kill(target, shooter, w.id, now); killed = target; }
    }
    return killed;
  }

  canDamage(shooter, target, now) {
    if (!target.alive) return false;
    if (now < target.spawnProtectUntil) return false;
    if (shooter === target) return false;
    if (this.mode.teams && shooter.team === target.team && !this.config.friendlyFire) return false;
    return true;
  }

  kill(victim, killer, weaponId, now) {
    victim.deathPos = { x: victim.ph.pos.x, y: victim.ph.pos.y, z: victim.ph.pos.z };
    killPlayer(victim, now, this.config.respawn ? RESPAWN_MS : 1e12);
    if (killer) { killer.kills++; killer.streak++; killer.bestStreak = Math.max(killer.bestStreak, killer.streak); }
    this.mode.onKill(this, killer, victim);
    this.push({
      t: EV.KILL, killer: killer ? killer.id : 0, victim: victim.id,
      weapon: weaponId || '', head: 0, streak: killer ? killer.streak : 0,
    });
  }

  promote(p) {
    const ids = this.mode.loadout(p);
    setWeapons(p, ids);
    this.push({ t: EV.WEAPON_SWITCH, id: p.id, weapon: p.weapons[0] });
  }

  emitModeMessage(id, text) { this.push({ t: EV.MODE_MESSAGE, id, text }); }

  /* ── Spawning ───────────────────────────────────────────────────── */
  respawn(p) {
    p.pendingRespawn = false;
    const spot = this.pickSpawn(p);
    spawnPlayer(p, spot, this.time);
    setWeapons(p, this.mode.loadout(p));
    this.push({ t: EV.RESPAWN, id: p.id, x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw });
  }

  /* Spawn choice is the difference between a match and a spawn-trap. Each
     candidate is scored on how far the nearest living enemy is, heavily
     penalised if that enemy can actually see the spot, and mildly
     penalised for being where this player just died. */
  pickSpawn(p) {
    const spawns = this.world.spawns;
    const teamed = this.mode.teams
      ? spawns.filter((s) => s.team === p.team || s.team === TEAM.NONE)
      : spawns;
    const pool = teamed.length >= 4 ? teamed : spawns;
    const enemies = this.players.filter((o) => o !== p && o.alive && (!this.mode.teams || o.team !== p.team));

    let best = null, bestScore = -Infinity;
    for (const s of pool) {
      if (!fitsAt(this.world, s.x, s.y + 0.05, s.z)) continue;
      let score = 0;
      let nearest = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.ph.pos.x - s.x, (e.ph.pos.y - s.y) * 1.5, e.ph.pos.z - s.z);
        nearest = Math.min(nearest, d);
        if (d < 34 && canSee(this.world, e.ph.pos, s, playerEyeY(e), s.y + 1.5)) score -= 260 - d * 4;
        if (d < 12) score -= (12 - d) * 40;
      }
      score += Math.min(nearest, 60) * 3;
      if (p.deathPos) {
        const dd = Math.hypot(p.deathPos.x - s.x, p.deathPos.z - s.z);
        if (dd < 14) score -= (14 - dd) * 8;
      }
      score += this.random() * 45;            // never the same spot twice running
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best || pool[0] || { x: 0, y: 2, z: 0, yaw: 0 };
  }

  /* ── End conditions ─────────────────────────────────────────────── */
  checkEnd(now) {
    if (this.state !== GAME_STATE.LIVE) return;
    let over = false, reason = '';
    if (this.config.duration && this.elapsed >= this.config.duration) { over = true; reason = 'time'; }
    else if (this.config.scoreLimit && this.mode.isOver(this)) { over = true; reason = 'score'; }
    else if (!this.config.respawn) {
      const alive = this.players.filter((p) => p.alive);
      if (this.mode.teams) {
        const teams = new Set(alive.map((p) => p.team));
        if (this.players.length > 1 && teams.size <= 1) { over = true; reason = 'elimination'; }
      } else if (this.players.length > 1 && alive.length <= 1) { over = true; reason = 'elimination'; }
    }
    if (over) this.end(reason);
  }

  end(reason) {
    this.state = GAME_STATE.ENDED;
    this.endInfo = {
      reason,
      winner: this.mode.winner(this),
      teamScore: { ...this.teamScore },
      scoreboard: this.scoreboard(),
    };
  }

  scoreboard() {
    return this.mode.leaders(this).map((p) => ({
      id: p.id, name: p.name, team: p.team, bot: p.isBot ? 1 : 0,
      kills: p.kills, deaths: p.deaths, score: p.score, ping: p.ping,
      streak: p.bestStreak, rung: p.ladderRung || 0,
      shots: p.shotsFired, hits: p.shotsHit, heads: p.headshots,
      damage: Math.round(p.damageDealt),
      acc: p.shotsFired ? p.shotsHit / p.shotsFired : 0,
      hs: p.shotsHit ? p.headshots / p.shotsHit : 0,
      xp: xpFor(p),
    }));
  }

  push(ev) {
    this.events.push(ev);
    if (this.onEvent) this.onEvent(ev);
  }

  flushEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function xpFor(p) {
  return Math.round(p.kills * 100 + p.score * 25 + p.damageDealt * 0.5 + p.headshots * 40 + p.bestStreak * 30);
}

/* The whole of client-supplied input validation. Anything not listed here
   is not accepted from a client at all. */
export function sanitiseCommand(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seq = raw.seq | 0;
  if (seq < 0) return null;
  const yaw = +raw.yaw, pitch = +raw.pitch;
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
  let mx = +raw.moveX, mz = +raw.moveZ;
  if (!Number.isFinite(mx)) mx = 0;
  if (!Number.isFinite(mz)) mz = 0;
  return {
    seq,
    moveX: clamp(mx, -1, 1),
    moveZ: clamp(mz, -1, 1),
    buttons: (raw.buttons | 0) & VALID_BUTTONS,
    yaw: ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    /* Straight up and straight down, and nothing beyond: a client that
       reports a pitch outside this is either broken or aiming through
       its own feet. */
    pitch: clamp(pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001),
  };
}

export { TICK_DT, TICK_HZ };
