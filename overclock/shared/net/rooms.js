/* Rooms.
 *
 * This file lives under shared/ rather than server/ because it has no
 * dependency on node: the browser runs exactly this code to host an
 * offline match against bots, and the dedicated server runs it to host
 * sixteen people. Only the transport differs.
 *
 * A room is a lobby that owns at most one match. Everything the pre-match
 * setup screen configures lives in `room.config`, and only the host may
 * change it. When the host starts, the room builds a Match, seats every
 * connected client in it, fills the rest with bots and runs the 3-2-1.
 *
 * Reconnection is handled by identity rather than by socket: a client
 * carries a token, and a returning token is re-seated in its old player
 * with its score intact, as long as the match is still running.
 */

import { Match } from '../sim/match.js';
import { getMode, MODE_IDS } from '../sim/modes.js';
import { MAP_IDS, MAP_INFO } from '../maps/index.js';
import { DIFFICULTY_IDS } from '../sim/bots.js';
import {
  MSG, EV, GAME_STATE, TEAM, MAX_PLAYERS, MAX_BOTS, SNAPSHOT_DT, TICK_DT,
} from '../constants.js';
import {
  encodeSnapshot, encodeJson, FLAG, withTeam, weaponIndex,
} from '../protocol.js';
import { curAmmo, currentSpread } from '../sim/player.js';

/* No 0/O or 1/I: room codes get read aloud and typed on phone keyboards. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_GRACE_MS = 45000;
const EMPTY_ROOM_TTL_MS = 60000;

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return s;
}

export function defaultConfig(over = {}) {
  const mode = getMode(over.mode);
  return {
    mode: mode.id,
    mapId: MAP_IDS.includes(over.mapId) ? over.mapId : 'foundry',
    botCount: clampInt(over.botCount, 0, MAX_BOTS, 4),
    botDifficulty: DIFFICULTY_IDS.includes(over.botDifficulty) ? over.botDifficulty : 'normal',
    duration: clampInt(over.duration, 0, 3600, mode.defaults.duration),
    scoreLimit: clampInt(over.scoreLimit, 0, 999, mode.defaults.scoreLimit),
    friendlyFire: over.friendlyFire === undefined ? mode.defaults.friendlyFire : !!over.friendlyFire,
    respawn: over.respawn === undefined ? mode.defaults.respawn : !!over.respawn,
    maxPlayers: clampInt(over.maxPlayers, 2, MAX_PLAYERS, 12),
    private: !!over.private,
    name: sanitiseName(over.name, 'MATCH'),
  };
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

/* Names are echoed to every other player, so control characters and
   angle brackets never leave this function alive. */
export function sanitiseName(v, dflt = 'PLAYER') {
  if (typeof v !== 'string') return dflt;
  const s = v.replace(/[\x00-\x1f\x7f<>&"']/g, '').trim().slice(0, 16);
  return s.length >= 1 ? s : dflt;
}

export class Room {
  constructor(manager, config, host) {
    this.manager = manager;
    this.code = manager.freeCode();
    this.config = config;
    this.clients = [];
    this.host = host;
    this.match = null;
    this.state = 'lobby';
    this.createdAt = Date.now();
    this.emptySince = 0;
    this.accum = 0;
    this.snapAccum = 0;
    this.scoreAccum = 0;
    this.endsAt = 0;
  }

  get playerCount() { return this.clients.length; }
  get full() { return this.clients.length >= this.config.maxPlayers; }
  get joinable() { return !this.full && (this.state === 'lobby' || this.state === 'live'); }

  add(client) {
    if (this.clients.includes(client)) return;
    this.clients.push(client);
    client.room = this;
    client.ready = false;
    if (!this.host || !this.clients.includes(this.host)) this.host = client;
    /* Joining mid-match is allowed: an eight-minute deathmatch that
       refuses latecomers is an eight-minute empty server. */
    if (this.match && this.state === 'live') {
      this.seat(client);
      client.send(encodeJson(MSG.MATCH_START, this.matchStartPayload(client)));
    }
    this.emptySince = 0;
    this.broadcastLobby();
  }

  remove(client) {
    const i = this.clients.indexOf(client);
    if (i < 0) return;
    this.clients.splice(i, 1);
    client.room = null;
    if (client.player) {
      client.player.connected = false;
      client.player.dcAt = Date.now();
      /* The entity stays in the match for the grace period so a dropped
         phone can come back to its own score rather than a fresh one. */
      if (!this.match || this.state !== 'live') {
        if (this.match) this.match.removePlayer(client.player.id);
        client.player = null;
      }
    }
    if (this.host === client) this.host = this.clients[0] || null;
    if (!this.clients.length) this.emptySince = Date.now();
    this.broadcastLobby();
  }

  /* A returning token gets its old entity back, score and all. */
  reseat(client) {
    if (!this.match) return null;
    const old = this.match.players.find((p) => !p.isBot && p.token && p.token === client.token);
    if (!old) return null;
    old.connected = true;
    old.dcAt = 0;
    old.name = client.name;
    client.player = old;
    return old;
  }

  seat(client) {
    if (!this.match) return null;
    const back = this.reseat(client);
    if (back) return back;
    const p = this.match.addPlayer({
      name: client.name,
      loadout: client.loadout,
      skin: client.skin,
      team: this.match.mode.teams ? 0 : TEAM.NONE,
    });
    if (!p) return null;
    p.token = client.token;
    client.player = p;
    if (this.match.mode.teams) this.balanceTeams();
    return p;
  }

  setConfig(patch) {
    if (this.state !== 'lobby') return;
    const merged = { ...this.config, ...patch };
    /* Changing mode resets the fields whose sensible value depends on it,
       unless the same message set them explicitly. */
    if (patch.mode && patch.mode !== this.config.mode) {
      const d = getMode(patch.mode).defaults;
      if (patch.duration === undefined) merged.duration = d.duration;
      if (patch.scoreLimit === undefined) merged.scoreLimit = d.scoreLimit;
      if (patch.friendlyFire === undefined) merged.friendlyFire = d.friendlyFire;
      if (patch.respawn === undefined) merged.respawn = d.respawn;
    }
    this.config = defaultConfig(merged);
    for (const c of this.clients) c.ready = false;
    this.broadcastLobby();
  }

  start() {
    if (this.state === 'live') return;
    this.match = new Match({ ...this.config, seed: (Math.random() * 0x7fffffff) | 0 });
    this.state = 'live';
    this.endsAt = 0;
    for (const c of this.clients) { c.player = null; }
    for (const c of this.clients) this.seat(c);
    this.match.addBots(this.config.botCount, this.config.botDifficulty);
    if (this.match.mode.teams) this.balanceTeams();
    for (const c of this.clients) {
      c.ready = false;
      c.send(encodeJson(MSG.MATCH_START, this.matchStartPayload(c)));
    }
  }

  matchStartPayload(client) {
    return {
      config: this.config,
      seed: this.match.config.seed,
      you: client.player ? client.player.id : 0,
      countdownMs: this.match.countdownMs,
      serverTime: this.match.time,
      roster: this.roster(),
      code: this.code,
    };
  }

  balanceTeams() {
    const ps = this.match.players;
    const a = ps.filter((p) => p.team === TEAM.ALPHA);
    const b = ps.filter((p) => p.team === TEAM.BRAVO);
    const un = ps.filter((p) => p.team !== TEAM.ALPHA && p.team !== TEAM.BRAVO);
    for (const p of un) { if (a.length <= b.length) { p.team = TEAM.ALPHA; a.push(p); } else { p.team = TEAM.BRAVO; b.push(p); } }
    // Move players across until the sides are within one of each other.
    while (a.length - b.length > 1) { const p = a.pop(); p.team = TEAM.BRAVO; b.push(p); }
    while (b.length - a.length > 1) { const p = b.pop(); p.team = TEAM.ALPHA; a.push(p); }
  }

  roster() {
    const list = [];
    for (const c of this.clients) {
      list.push({
        id: c.player ? c.player.id : 0, name: c.name, bot: 0,
        team: c.player ? c.player.team : 0, ping: c.ping, ready: !!c.ready,
        host: c === this.host ? 1 : 0, skin: c.skin,
      });
    }
    if (this.match) {
      for (const p of this.match.players) {
        if (!p.isBot) continue;
        list.push({ id: p.id, name: p.name, bot: 1, team: p.team, ping: 0, ready: true, host: 0, difficulty: p.difficulty });
      }
    }
    return list;
  }

  lobbyPayload() {
    return {
      code: this.code, config: this.config, state: this.state,
      roster: this.roster(),
      hostId: this.host ? this.host.id : 0,
      canStart: this.clients.length >= 1,
      maps: MAP_INFO, modes: MODE_IDS, difficulties: DIFFICULTY_IDS,
    };
  }

  broadcastLobby() {
    const base = this.lobbyPayload();
    for (const c of this.clients) c.send(encodeJson(MSG.LOBBY_STATE, { ...base, you: c.id, isHost: c === this.host }));
  }

  broadcastJson(type, payload) {
    const msg = encodeJson(type, payload);
    for (const c of this.clients) c.send(msg);
  }

  /* ── Simulation ─────────────────────────────────────────────────── */
  update(dtMs) {
    if (this.state !== 'live' || !this.match) {
      if (!this.clients.length && this.emptySince && Date.now() - this.emptySince > EMPTY_ROOM_TTL_MS) this.manager.destroy(this);
      return;
    }

    // Drop players who dropped and did not come back.
    for (const p of this.match.players) {
      if (p.isBot || p.connected) continue;
      if (p.dcAt && Date.now() - p.dcAt > RECONNECT_GRACE_MS) this.match.removePlayer(p.id);
    }

    this.accum += dtMs;
    const step = TICK_DT * 1000;
    /* Bounded catch-up. If the host process stalls, the match must not
       try to simulate the whole stall in one pass and stall again. */
    let steps = 0;
    while (this.accum >= step && steps < 8) { this.match.tick(step); this.accum -= step; steps++; }
    if (this.accum > step * 8) this.accum = 0;

    this.snapAccum += dtMs;
    if (this.snapAccum >= SNAPSHOT_DT * 1000) {
      this.snapAccum = 0;
      this.sendSnapshots();
    }

    /* The full scoreboard is far too big for a snapshot and nobody needs
       it twenty times a second — once a second is faster than anyone can
       read it. */
    this.scoreAccum += dtMs;
    if (this.scoreAccum >= 1000) {
      this.scoreAccum = 0;
      this.broadcastJson(MSG.SCORES, { rows: this.match.scoreboard(), teamScore: this.match.teamScore });
    }

    if (this.match.state === GAME_STATE.ENDED && !this.endsAt) {
      this.endsAt = Date.now();
      this.state = 'ended';
      this.broadcastJson(MSG.MATCH_END, {
        ...this.match.endInfo,
        mode: this.config.mode, mapId: this.config.mapId,
        duration: this.match.elapsed,
      });
    }
    if (this.endsAt && Date.now() - this.endsAt > 1500 && this.state === 'ended') this.returnToLobby();
  }

  returnToLobby() {
    this.state = 'lobby';
    this.match = null;
    this.endsAt = 0;
    for (const c of this.clients) { c.player = null; c.ready = false; }
    this.broadcastLobby();
  }

  sendSnapshots() {
    const m = this.match;
    const events = m.flushEvents();
    const shared = events.filter(isBroadcastEvent);

    const rows = m.players.map((p) => ({
      id: p.id,
      flags: withTeam(
        (p.alive ? FLAG.ALIVE : 0) | (p.ph.crouching ? FLAG.CROUCH : 0) |
        (p.ph.sprinting ? FLAG.SPRINT : 0) | (p.ph.onGround ? FLAG.GROUND : 0) |
        (p.ads > 0.5 ? FLAG.ADS : 0) | (p.reloadUntil > m.time ? FLAG.RELOAD : 0),
        p.team),
      x: p.ph.pos.x, y: p.ph.pos.y, z: p.ph.pos.z,
      yaw: p.ph.yaw, pitch: p.ph.pitch,
      health: p.health, armour: p.armour,
      weapon: weaponIndex(p.weapons[p.slot]),
    }));

    const timeLeft = m.config.duration ? Math.max(0, Math.round(m.remaining)) : 65535;
    for (const c of this.clients) {
      const p = c.player;
      const ammo = p ? curAmmo(p) : null;
      c.send(encodeSnapshot({
        state: m.state,
        serverTime: Math.round(m.time),
        ackSeq: p ? p.lastCmdSeq : 0,
        clientTime: c.lastClientTime || 0,
        selfId: p ? p.id : 0,
        timeLeft,
        scoreA: m.teamScore[TEAM.ALPHA] || 0,
        scoreB: m.teamScore[TEAM.BRAVO] || 0,
        self: {
          mag: ammo ? Math.min(65535, ammo.mag) : 0,
          reserve: ammo ? Math.min(65535, ammo.reserve) : 0,
          ads: p ? p.ads : 0,
          spread: p ? currentSpread(p) : 0,
          score: p ? p.score : 0,
          kills: p ? p.kills : 0,
          deaths: p ? p.deaths : 0,
          respawnIn: p && !p.alive && p.respawnAt ? Math.max(0, Math.round(p.respawnAt - m.time)) : 0,
          rung: p ? (p.ladderRung || 0) : 0,
          vx: p ? p.ph.vel.x : 0, vy: p ? p.ph.vel.y : 0, vz: p ? p.ph.vel.z : 0,
          height: p ? p.ph.height : 1.78,
        },
        players: rows,
      }));

      const mine = events.filter((e) => isPrivateEvent(e) && e.id === (p ? p.id : -1));
      const all = mine.length ? shared.concat(mine) : shared;
      if (all.length) c.send(encodeJson(MSG.EVENT, all));
    }
  }
}

/* Events everybody needs: they drive other people's tracers, the kill
   feed and the respawn effects. */
function isBroadcastEvent(e) {
  return e.t === EV.SHOT || e.t === EV.KILL || e.t === EV.RESPAWN ||
         e.t === EV.WEAPON_SWITCH || e.t === EV.JUMP;
}
/* Events only their subject needs. Sending someone else's damage numbers
   is both wasted bandwidth and a wallhack. */
function isPrivateEvent(e) {
  return e.t === EV.HIT || e.t === EV.DAMAGE || e.t === EV.MODE_MESSAGE || e.t === EV.RELOAD;
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  freeCode() {
    for (let i = 0; i < 200; i++) { const c = makeCode(); if (!this.rooms.has(c)) return c; }
    return makeCode() + ((Math.random() * 9) | 0);
  }

  create(client, config) {
    const room = new Room(this, defaultConfig(config), client);
    this.rooms.set(room.code, room);
    room.add(client);
    return room;
  }

  get(code) { return this.rooms.get(String(code || '').toUpperCase().trim()); }

  /* Quick play prefers a room that is already in its lobby, so joining
     lands you in a setup screen rather than mid-round. */
  quickPlay(client, prefs = {}) {
    const wanted = MODE_IDS.includes(prefs.mode) ? prefs.mode : null;
    const open = [...this.rooms.values()].filter((r) => !r.config.private && r.joinable && (!wanted || r.config.mode === wanted));
    open.sort((a, b) => {
      const sa = (a.state === 'lobby' ? 100 : 0) + a.playerCount;
      const sb = (b.state === 'lobby' ? 100 : 0) + b.playerCount;
      return sb - sa;
    });
    if (open.length) { open[0].add(client); return open[0]; }
    return this.create(client, { ...prefs, name: sanitiseName(client.name) + " MATCH" });
  }

  list() {
    return [...this.rooms.values()]
      .filter((r) => !r.config.private)
      .map((r) => ({
        code: r.code, name: r.config.name, mode: r.config.mode, mapId: r.config.mapId,
        players: r.playerCount, bots: r.config.botCount, max: r.config.maxPlayers,
        state: r.state, difficulty: r.config.botDifficulty,
      }))
      .sort((a, b) => b.players - a.players);
  }

  destroy(room) {
    for (const c of [...room.clients]) room.remove(c);
    this.rooms.delete(room.code);
  }

  update(dtMs) {
    for (const room of [...this.rooms.values()]) room.update(dtMs);
  }
}
