/* The wire format.
 *
 * Two channels, split by what they cost:
 *
 *   Binary, every tick or every snapshot — inputs and player state. These
 *   are the only messages whose size matters, so they are packed by hand.
 *   A snapshot of sixteen players is about 300 bytes, twenty times a
 *   second: roughly 6 KB/s down, which a phone on mobile data can carry.
 *
 *   JSON, occasionally — lobby state, match results, kill feed, chat.
 *   These are rare enough that hand-packing them would be effort spent
 *   where nobody can measure it.
 *
 * One deliberate omission: the server does not send bullet impact points.
 * The client already has the map, the shooter's angles and the same
 * deterministic spread function, so it resolves the pellets itself for
 * visuals. That turns a nine-pellet shotgun blast from nine messages into
 * none.
 */

import { MSG, PROTOCOL_VERSION } from './constants.js';
import { WEAPON_IDS } from './weapons.js';

export const weaponIndex = (id) => { const i = WEAPON_IDS.indexOf(id); return i < 0 ? 0 : i; };
export const weaponFromIndex = (i) => WEAPON_IDS[i] || WEAPON_IDS[0];

const POS_SCALE = 128;          // ±256 units at ~8 mm resolution
const ANG_SCALE = 10430.0;      // u16 over a full turn
const PITCH_SCALE = 20000.0;    // i16 over ±1.57 rad

const clampI16 = (v) => (v < -32768 ? -32768 : v > 32767 ? 32767 : v) | 0;

/* ── Input: client -> server ────────────────────────────────────────
 * Commands are sent in small redundant batches. Each carries its own
 * sequence number and the server ignores any it has already applied, so a
 * dropped packet costs nothing as long as the next one arrives. */
export const INPUT_BYTES = 13;

export function encodeInput(cmds, clientTime) {
  const n = Math.min(cmds.length, 24);
  const buf = new ArrayBuffer(6 + n * INPUT_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, MSG.INPUT);
  v.setUint8(1, n);
  v.setUint32(2, clientTime >>> 0);
  let o = 6;
  for (let i = cmds.length - n; i < cmds.length; i++) {
    const c = cmds[i];
    v.setUint32(o, c.seq >>> 0); o += 4;
    v.setInt8(o++, Math.round(c.moveX * 127));
    v.setInt8(o++, Math.round(c.moveZ * 127));
    v.setUint16(o, c.buttons & 0xffff); o += 2;
    v.setUint16(o, Math.round((((c.yaw % 6.283185) + 6.283185) % 6.283185) * ANG_SCALE) & 0xffff); o += 2;
    v.setInt16(o, clampI16(Math.round(c.pitch * PITCH_SCALE))); o += 2;
    v.setUint8(o++, 0);           // reserved: keeps the record 13 bytes
  }
  return buf;
}

export function decodeInput(buf) {
  const v = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
  if (v.getUint8(0) !== MSG.INPUT) return null;
  const n = v.getUint8(1);
  if (v.byteLength < 6 + n * INPUT_BYTES) return null;
  const clientTime = v.getUint32(2);
  const cmds = [];
  let o = 6;
  for (let i = 0; i < n; i++) {
    cmds.push({
      seq: v.getUint32(o),
      moveX: v.getInt8(o + 4) / 127,
      moveZ: v.getInt8(o + 5) / 127,
      buttons: v.getUint16(o + 6),
      yaw: v.getUint16(o + 8) / ANG_SCALE,
      pitch: v.getInt16(o + 10) / PITCH_SCALE,
    });
    o += INPUT_BYTES;
  }
  return { clientTime, cmds };
}

/* ── Snapshot: server -> client ─────────────────────────────────────
 * Fixed layout, one record per player, plus a block of fields that only
 * matter for the receiving player (their own ammo, their own score). */
const PLAYER_BYTES = 16;   // id2 flags1 xyz6 yaw2 pitch2 hp1 armour1 weapon1
const HEADER_BYTES = 22;   // type1 state1 time4 ack4 clientTime4 self2 left2 a2 b2
const SELF_BYTES = 21;     // mag2 reserve2 ads1 spread2 score2 k1 d1 respawn2 rung1 vel6 height1
const COUNT_BYTES = 1;

export const FLAG = {
  ALIVE: 1, CROUCH: 2, SPRINT: 4, GROUND: 8, ADS: 16, RELOAD: 32,
};
export const teamOf = (flags) => (flags >> 6) & 3;
export const withTeam = (flags, team) => (flags & 0x3f) | ((team & 3) << 6);

export function encodeSnapshot(s) {
  const n = s.players.length;
  const buf = new ArrayBuffer(HEADER_BYTES + SELF_BYTES + COUNT_BYTES + n * PLAYER_BYTES);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, MSG.SNAPSHOT);
  v.setUint8(o++, s.state & 0xff);
  v.setUint32(o, s.serverTime >>> 0); o += 4;
  v.setUint32(o, s.ackSeq >>> 0); o += 4;
  v.setUint32(o, s.clientTime >>> 0); o += 4;      // echoed for RTT
  v.setUint16(o, s.selfId & 0xffff); o += 2;
  v.setUint16(o, Math.max(0, Math.min(65535, Math.round(s.timeLeft)))); o += 2;
  v.setUint16(o, s.scoreA & 0xffff); o += 2;
  v.setUint16(o, s.scoreB & 0xffff); o += 2;

  // Self block.
  v.setUint16(o, s.self.mag & 0xffff); o += 2;
  v.setUint16(o, s.self.reserve & 0xffff); o += 2;
  v.setUint8(o++, Math.round(s.self.ads * 255));
  v.setUint16(o, Math.round(s.self.spread * 100) & 0xffff); o += 2;
  v.setUint16(o, s.self.score & 0xffff); o += 2;
  v.setUint8(o++, Math.min(255, s.self.kills));
  v.setUint8(o++, Math.min(255, s.self.deaths));
  v.setUint16(o, Math.max(0, Math.min(65535, Math.round(s.self.respawnIn)))); o += 2;
  v.setUint8(o++, s.self.rung & 0xff);
  /* Velocity and the current (crouch-interpolated) height are for your own
     player only, and they are the difference between prediction replay
     that converges and prediction replay that fights the server. */
  v.setInt16(o, clampI16(Math.round(s.self.vx * 256))); o += 2;
  v.setInt16(o, clampI16(Math.round(s.self.vy * 256))); o += 2;
  v.setInt16(o, clampI16(Math.round(s.self.vz * 256))); o += 2;
  v.setUint8(o++, Math.max(0, Math.min(255, Math.round(s.self.height * 100))));

  v.setUint8(o++, Math.min(255, n));
  for (const p of s.players) {
    v.setUint16(o, p.id & 0xffff); o += 2;
    v.setUint8(o++, p.flags & 0xff);
    v.setInt16(o, clampI16(Math.round(p.x * POS_SCALE))); o += 2;
    v.setInt16(o, clampI16(Math.round(p.y * POS_SCALE))); o += 2;
    v.setInt16(o, clampI16(Math.round(p.z * POS_SCALE))); o += 2;
    v.setUint16(o, Math.round((((p.yaw % 6.283185) + 6.283185) % 6.283185) * ANG_SCALE) & 0xffff); o += 2;
    v.setInt16(o, clampI16(Math.round(p.pitch * PITCH_SCALE))); o += 2;
    v.setUint8(o++, Math.max(0, Math.min(255, Math.round(p.health))));
    v.setUint8(o++, Math.max(0, Math.min(255, Math.round(p.armour))));
    v.setUint8(o++, p.weapon & 0xff);
  }
  return buf;
}

export function decodeSnapshot(buf) {
  const v = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
  if (v.getUint8(0) !== MSG.SNAPSHOT) return null;
  let o = 1;
  const state = v.getUint8(o++);
  const serverTime = v.getUint32(o); o += 4;
  const ackSeq = v.getUint32(o); o += 4;
  const clientTime = v.getUint32(o); o += 4;
  const selfId = v.getUint16(o); o += 2;
  const timeLeft = v.getUint16(o); o += 2;
  const scoreA = v.getUint16(o); o += 2;
  const scoreB = v.getUint16(o); o += 2;

  const self = {
    mag: v.getUint16(o), reserve: v.getUint16(o + 2), ads: v.getUint8(o + 4) / 255,
    spread: v.getUint16(o + 5) / 100, score: v.getUint16(o + 7),
    kills: v.getUint8(o + 9), deaths: v.getUint8(o + 10),
    respawnIn: v.getUint16(o + 11), rung: v.getUint8(o + 13),
    vx: v.getInt16(o + 14) / 256, vy: v.getInt16(o + 16) / 256, vz: v.getInt16(o + 18) / 256,
    height: v.getUint8(o + 20) / 100,
  };
  o += SELF_BYTES;

  const n = v.getUint8(o++);
  const players = new Array(n);
  for (let i = 0; i < n; i++) {
    players[i] = {
      id: v.getUint16(o),
      flags: v.getUint8(o + 2),
      x: v.getInt16(o + 3) / POS_SCALE,
      y: v.getInt16(o + 5) / POS_SCALE,
      z: v.getInt16(o + 7) / POS_SCALE,
      yaw: v.getUint16(o + 9) / ANG_SCALE,
      pitch: v.getInt16(o + 11) / PITCH_SCALE,
      health: v.getUint8(o + 13),
      armour: v.getUint8(o + 14),
      weapon: v.getUint8(o + 15),
    };
    o += PLAYER_BYTES;
  }
  return { state, serverTime, ackSeq, clientTime, selfId, timeLeft, scoreA, scoreB, self, players };
}

/* ── JSON channel ───────────────────────────────────────────────────── */
export function encodeJson(type, payload) {
  return JSON.stringify({ t: type, v: PROTOCOL_VERSION, d: payload });
}

export function decodeJson(text) {
  try {
    const m = JSON.parse(text);
    if (!m || typeof m.t !== 'number') return null;
    return m;
  } catch { return null; }
}

export const isBinary = (data) => data instanceof ArrayBuffer || ArrayBuffer.isView(data);
