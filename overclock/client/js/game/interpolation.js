/* Everyone else.
 *
 * Snapshots arrive twenty times a second and the screen redraws sixty or
 * more, so remote players are drawn at a deliberately stale time — far
 * enough behind that there are always two snapshots to interpolate between
 * even when one is dropped. That delay is the price of smooth motion, and
 * the server's lag compensation is what refunds it: it rewinds targets to
 * the position you actually saw before deciding whether you hit.
 *
 * The alternative, extrapolating forward to hide the delay, guesses wrong
 * every time somebody changes direction, and a player who snaps back a
 * body-width mid-strafe is far worse to shoot at than one drawn 110 ms
 * late.
 */

import { INTERP_DELAY_MS, PLAYER_HEIGHT, PLAYER_CROUCH_HEIGHT } from '../../../shared/constants.js';
import { FLAG, teamOf, weaponFromIndex } from '../../../shared/protocol.js';
import { angleDelta, damp } from '../../../shared/math.js';

const BUFFER = 24;

class Track {
  constructor(id) {
    this.id = id;
    this.samples = [];
    this.anim = { phase: 0, speed: 0, air: 0, crouch: 0 };
    this.height = PLAYER_HEIGHT;
    this.lastSeen = 0;
    this.dead = false;
    this.deathAt = 0;
    this.muzzleAt = -1e9;
    this.name = '';
    this.team = 0;
    this.bot = false;
    this.skin = 0;
  }
  push(s) {
    const n = this.samples;
    if (n.length && s.t <= n[n.length - 1].t) return;   // out of order: drop
    n.push(s);
    if (n.length > BUFFER) n.shift();
  }
}

export class RemoteEntities {
  constructor() {
    this.tracks = new Map();
    this.serverClock = 0;
    this.clockSet = false;
    this.out = [];
  }

  clear() { this.tracks.clear(); this.clockSet = false; }

  meta(id, info) {
    const t = this.get(id);
    Object.assign(t, info);
  }

  get(id) {
    let t = this.tracks.get(id);
    if (!t) { t = new Track(id); this.tracks.set(id, t); }
    return t;
  }

  /* Nudge the local estimate of server time toward what just arrived. A
     hard set on every snapshot makes remote motion stutter with jitter;
     drifting toward it keeps the playback clock smooth. */
  ingest(snap) {
    const t = snap.serverTime;
    if (!this.clockSet) { this.serverClock = t; this.clockSet = true; }
    else {
      const drift = t - this.serverClock;
      // A big jump is a new match or a long stall: accept it outright.
      if (Math.abs(drift) > 900) this.serverClock = t;
      else this.serverClock += drift * 0.14;
    }
    for (const p of snap.players) {
      const tr = this.get(p.id);
      tr.lastSeen = t;
      tr.team = teamOf(p.flags);
      tr.push({
        t, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
        flags: p.flags, health: p.health, armour: p.armour,
        weapon: weaponFromIndex(p.weapon),
      });
    }
  }

  advance(dtMs) { if (this.clockSet) this.serverClock += dtMs; }

  get renderTime() { return this.serverClock - INTERP_DELAY_MS; }

  /* Interpolated view of everyone at the render time. `skipId` leaves out
     the local player, who is predicted rather than interpolated. */
  sample(skipId, dt) {
    const rt = this.renderTime;
    const out = this.out;
    out.length = 0;
    for (const tr of this.tracks.values()) {
      if (tr.id === skipId) continue;
      const s = tr.samples;
      if (!s.length) continue;
      if (this.serverClock - tr.lastSeen > 2500) { this.tracks.delete(tr.id); continue; }

      let a = s[0], b = s[s.length - 1];
      if (rt <= s[0].t) { a = b = s[0]; }
      else if (rt >= s[s.length - 1].t) { a = b = s[s.length - 1]; }
      else {
        for (let i = s.length - 1; i > 0; i--) {
          if (s[i - 1].t <= rt) { a = s[i - 1]; b = s[i]; break; }
        }
      }
      const span = b.t - a.t;
      const f = span > 0.001 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 0;

      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      const z = a.z + (b.z - a.z) * f;
      const yaw = a.yaw + angleDelta(a.yaw, b.yaw) * f;
      const pitch = a.pitch + (b.pitch - a.pitch) * f;

      const flags = f < 0.5 ? a.flags : b.flags;
      const alive = (flags & FLAG.ALIVE) !== 0;
      const crouch = (flags & FLAG.CROUCH) !== 0;

      /* Height is not on the wire — only the crouch bit is — so it is
         reproduced here with the same time constant the server uses. */
      tr.height = damp(tr.height, crouch ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT, 11, dt);

      // Speed for the walk cycle, from the samples we are between.
      const vspan = Math.max(0.001, (b.t - a.t) / 1000);
      const speed = Math.hypot(b.x - a.x, b.z - a.z) / vspan;

      if (!alive && !tr.dead) { tr.dead = true; tr.deathAt = this.serverClock; }
      if (alive && tr.dead) { tr.dead = false; }

      out.push({
        id: tr.id, track: tr, x, y, z, yaw, pitch,
        alive, crouch, height: tr.height,
        onGround: (flags & FLAG.GROUND) !== 0,
        ads: (flags & FLAG.ADS) !== 0,
        reloading: (flags & FLAG.RELOAD) !== 0,
        sprinting: (flags & FLAG.SPRINT) !== 0,
        team: teamOf(flags),
        health: f < 0.5 ? a.health : b.health,
        armour: f < 0.5 ? a.armour : b.armour,
        weapon: (f < 0.5 ? a : b).weapon,
        speed,
        name: tr.name, bot: tr.bot, skin: tr.skin,
        deathFor: tr.dead ? this.serverClock - tr.deathAt : 0,
      });
    }
    return out;
  }

  /* Latest known position of one player, for effects that must originate
     at somebody — a muzzle flash for a shot that just happened. */
  latest(id) {
    const tr = this.tracks.get(id);
    if (!tr || !tr.samples.length) return null;
    return tr.samples[tr.samples.length - 1];
  }
}
