/* The match runtime.
 *
 * Everything that happens between the countdown and the results screen is
 * driven from here: the fixed-step input loop that feeds prediction, the
 * snapshot handler that reconciles it, the event handler that turns the
 * server's account of what happened into things you can see and hear, and
 * the frame that draws it.
 *
 * The loop is deliberately two clocks. Simulation runs on a fixed 60 Hz
 * accumulator because it must match the server's step exactly; rendering
 * runs on whatever the display gives it. On a 120 Hz phone that means two
 * frames per simulation tick, both drawn from the same interpolated state,
 * which is smooth without pretending to simulate faster than the server.
 */

import { TICK_DT, TICK_HZ, BTN, EV, GAME_STATE, TEAM, PLAYER_HEIGHT, RESPAWN_MS } from '../../../shared/constants.js';
import { getMap } from '../../../shared/maps/index.js';
import { getMode } from '../../../shared/sim/modes.js';
import { getWeapon, loadoutWeapons, WEAPON_IDS } from '../../../shared/weapons.js';
import { weaponFromIndex, FLAG, teamOf } from '../../../shared/protocol.js';
import { pelletDir } from '../../../shared/sim/combat.js';
import { raycastWorld, floorUnder } from '../../../shared/maps/builder.js';
import { clamp, damp, angleDelta } from '../../../shared/math.js';

import { Renderer, PRESETS } from '../engine/renderer.js';
import { Effects } from './effects.js';
import { ViewModel } from './viewmodel.js';
import { pushAvatar, pushBlobShadow, avatarColours, stepAnim, TEAM_COLOURS } from './avatar.js';
import { Prediction } from './prediction.js';
import { RemoteEntities } from './interpolation.js';
import { spatialise } from '../audio/audio.js';

const SEND_REDUNDANCY = 3;

/* Camera-space viewmodel muzzle -> world space, so tracers, shells and the
   flash all leave the barrel you can see rather than your forehead. The
   viewmodel is drawn with its own near projection, so its depth is scaled
   out to roughly where the barrel reads as ending in the world. */
const MUZZLE_REACH = 1.25;
export function muzzleToWorld(m, cam, out = { x: 0, y: 0, z: 0 }) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const rx = cy, rz = -sy;                      // right
  const ux = sy * sp, uy = cp, uz = cy * sp;    // up
  const fx = -sy * cp, fy = sp, fz = -cy * cp;  // forward
  const reach = -m.z * MUZZLE_REACH;
  out.x = cam.x + rx * m.x + ux * m.y + fx * reach;
  out.y = cam.y + uy * m.y + fy * reach;
  out.z = cam.z + rz * m.x + uz * m.y + fz * reach;
  return out;
}

export class Game {
  constructor(ctx) {
    this.ctx = ctx;                         // { net, audio, hud, settings, input, renderer }
    this.renderer = ctx.renderer;
    this.audio = ctx.audio;
    this.hud = ctx.hud;
    this.settings = ctx.settings;
    this.net = ctx.net;

    this.effects = new Effects(1200);
    this.viewmodel = new ViewModel();
    this.remotes = new RemoteEntities();
    this.prediction = null;
    this.world = null;
    this.mode = getMode('ffa');
    this.active = false;
    this.selfId = 0;
    this.roster = new Map();

    this.accum = 0;
    this.unsent = [];
    this.matchState = GAME_STATE.COUNTDOWN;
    this.timeLeft = 0;
    this.scoreA = 0; this.scoreB = 0;
    this.selfScore = 0; this.selfKills = 0; this.selfDeaths = 0;
    this.respawnIn = 0;
    this.alive = false;
    this.wasAlive = false;
    this.lastKiller = null;

    this.shake = 0;
    this.shakeSeed = Math.random() * 1000;
    this.camera = { x: 0, y: 2, z: 0, yaw: 0, pitch: 0, fov: 1.6, roll: 0 };
    this.stepTimer = 0;
    this.lastFootAt = 0;
    this.aimAssistTarget = null;
    this.countdownShown = -1;
    this.onMatchEnd = null;
    this.onExit = null;
    this._proj = { x: 0, y: 0, depth: 0 };
    this._plates = [];
    this._muzzleCam = { x: 0, y: 0, z: 0 };
    this.stats = { frames: 0, fps: 60, frameMs: 16 };
  }

  /* ── Lifecycle ─────────────────────────────────────────────────── */
  start(info) {
    const cfg = info.config;
    this.mode = getMode(cfg.mode);
    this.world = getMap(cfg.mapId);
    this.renderer.setMap(this.world);
    this.selfId = info.you;
    this.matchState = GAME_STATE.COUNTDOWN;
    this.countdownShown = -1;
    this.countdownEnd = performance.now() + (info.countdownMs || 0);
    this.config = cfg;
    this.scores = null;

    this.prediction = new Prediction(this.world);
    const weapons = this.mode.id === 'gungame'
      ? this.mode.loadout({ ladderRung: 0 })
      : loadoutWeapons(this.settings.loadout);
    this.prediction.reset({ x: 0, y: 2, z: 0, yaw: 0 }, weapons);

    this.remotes.clear();
    this.roster.clear();
    this.setRoster(info.roster);
    this.effects.clear();
    this.effects.setBudget(PRESETS[this.settings.quality].particles);
    this.viewmodel = new ViewModel();
    this.viewmodel.setWeapon(weapons[0]);
    this.accum = 0;
    this.unsent.length = 0;
    this.active = true;
    this.alive = false;
    this.wasAlive = false;
    this.hud.show(true);
    this.hud.hideDeath();
    this.hud.applySettings();
    this.audio.ambience(this.world.theme);
  }

  stop() {
    this.active = false;
    this.hud.show(false);
    this.hud.scoreboard(false);
    this.hud.hideDeath();
    this.audio.stopAmbience();
  }

  setRoster(list) {
    if (!list) return;
    for (const r of list) {
      this.roster.set(r.id, r);
      this.remotes.meta(r.id, { name: r.name, bot: !!r.bot, team: r.team, skin: r.skin || 0 });
    }
  }

  /* ── Network in ────────────────────────────────────────────────── */
  onSnapshot(snap) {
    if (!this.active || !this.prediction) return;
    this.matchState = snap.state;
    this.timeLeft = snap.timeLeft >= 65535 ? Infinity : snap.timeLeft;
    this.scoreA = snap.scoreA;
    this.scoreB = snap.scoreB;
    this.selfScore = snap.self.score;
    this.selfKills = snap.self.kills;
    this.selfDeaths = snap.self.deaths;
    this.respawnIn = snap.self.respawnIn;

    this.remotes.ingest(snap);

    const self = snap.players.find((p) => p.id === this.selfId);
    if (self) {
      const alive = (self.flags & FLAG.ALIVE) !== 0;
      if (alive) {
        this.prediction.reconcile({
          x: self.x, y: self.y, z: self.z,
          vx: snap.self.vx, vy: snap.self.vy, vz: snap.self.vz,
          height: snap.self.height,
          onGround: (self.flags & FLAG.GROUND) !== 0,
        }, snap.ackSeq, snap.serverTime);
        this.prediction.syncAmmo(snap.self.mag, snap.self.reserve);
        /* A weapon the server switched for us — Gun Game promotion, or a
           respawn loadout — has to be reflected locally or the viewmodel
           and the ammo counter describe different guns. */
        const serverWeapon = weaponFromIndex(self.weapon);
        const p = this.prediction.player;
        if (p.weapons[p.slot] !== serverWeapon) {
          const idx = p.weapons.indexOf(serverWeapon);
          if (idx >= 0) p.slot = idx;
          else { p.weapons = [serverWeapon, ...p.weapons.slice(1)]; p.slot = 0; }
          this.viewmodel.setWeapon(serverWeapon);
        }
        this.prediction.player.health = self.health;
        this.prediction.player.armour = self.armour;
      }
      if (alive && !this.alive) this.onSelfSpawned(self);
      this.alive = alive;
    }
  }

  onSelfSpawned(self) {
    this.hud.hideDeath();
    this.prediction.reset({ x: self.x, y: self.y, z: self.z, yaw: self.yaw }, this.prediction.player.weapons);
    this.ctx.input.yaw = self.yaw;
    this.ctx.input.pitch = 0;
    this.viewmodel = new ViewModel();
    this.viewmodel.setWeapon(this.prediction.player.weapons[this.prediction.player.slot]);
    this.shake = 0;
  }

  onEvents(events) {
    if (!this.active) return;
    for (const e of events) {
      switch (e.t) {
        case EV.SHOT: this.onShot(e); break;
        case EV.HIT: this.onHit(e); break;
        case EV.DAMAGE: this.onDamage(e); break;
        case EV.KILL: this.onKill(e); break;
        case EV.RESPAWN: this.onRespawn(e); break;
        case EV.JUMP: this.onRemoteJump(e); break;
        case EV.MODE_MESSAGE: this.hud.banner(e.text); this.audio.kill(); break;
        case EV.WEAPON_SWITCH:
          if (e.id === this.selfId) this.viewmodel.setWeapon(e.weapon);
          break;
        default: break;
      }
    }
  }

  /* A shot is the one event the client expands rather than replays: the
     server sends the shooter, the angles and the spread, and the client
     resolves the pellets itself with the identical deterministic
     function. Nine shotgun pellets cost nothing on the wire. */
  onShot(e) {
    const w = getWeapon(e.weapon);
    const mine = e.id === this.selfId;
    const q = this.settings.effectsLevel;

    if (!mine) {
      const track = this.remotes.latest(e.id);
      if (track) { const tr = this.remotes.get(e.id); tr.muzzleAt = performance.now(); }
    }

    const pellets = w.melee ? 0 : (w.pellets || 1);
    for (let i = 0; i < pellets && q > 0; i++) {
      const d = pelletDir(e.yaw, e.pitch, e.spread, e.id, e.seq, i);
      const hit = raycastWorld(this.world, e.x, e.y, e.z, d.x, d.y, d.z, 260);
      const range = hit ? hit.dist : 260;
      /* Your own tracers start at the muzzle of the model you can see,
         not at the eye the server shot from — otherwise every shot looks
         like it comes out of your forehead. */
      let ox = e.x, oy = e.y, oz = e.z;
      if (mine) {
        const m = this.muzzleWorld();
        ox = m.x; oy = m.y; oz = m.z;
      }
      if (w.tracer && (q > 1 || i === 0)) {
        this.effects.tracer(ox, oy, oz, d.x, d.y, d.z, Math.max(1, range - 0.1));
      }
      if (hit && q > 0) {
        this.effects.impact(
          e.x + d.x * hit.dist, e.y + d.y * hit.dist, e.z + d.z * hit.dist,
          hit.normal.x, hit.normal.y, hit.normal.z, hit.brush.color, q
        );
        if (!mine) {
          const sp = spatialise(this.camera, this.camera.yaw, e.x + d.x * hit.dist, e.y + d.y * hit.dist, e.z + d.z * hit.dist, 55);
          if (sp && i === 0) this.audio.impact(sp.pan, sp.distance);
        }
      }
    }

    if (mine) {
      this.viewmodel.onFire(w);
      this.shake += (w.recoil.kick || 1) * 0.16 * this.settings.cameraShake;
      const m = this.muzzleWorld();
      const fwd = this.forward();
      this.effects.muzzle(m.x, m.y, m.z, fwd.x, fwd.y, fwd.z, 1, this.settings.effectsLevel);
      if (w.shell) {
        const r = this.right();
        this.effects.shell(m.x + r.x * 0.1, m.y - 0.06, m.z + r.z * 0.1,
          r.x * 2.6 + (Math.random() - 0.5), 1.8 + Math.random(), r.z * 2.6 + (Math.random() - 0.5));
      }
      this.audio.shot(w.sound, { own: true, pan: 0, distance: 0, volume: 1, reverb: this.world.theme.outdoor ? 0.2 : 0.8 });
    } else {
      const sp = spatialise(this.camera, this.camera.yaw, e.x, e.y, e.z, 130);
      if (sp) {
        this.audio.shot(w.sound, { pan: sp.pan, distance: sp.distance, volume: 1, reverb: this.world.theme.outdoor ? 0.15 : 0.6 });
        const fwd = { x: -Math.sin(e.yaw) * Math.cos(e.pitch), y: Math.sin(e.pitch), z: -Math.cos(e.yaw) * Math.cos(e.pitch) };
        if (this.settings.effectsLevel > 0) {
          this.effects.muzzle(e.x + fwd.x * 0.45, e.y + fwd.y * 0.45 - 0.12, e.z + fwd.z * 0.45, fwd.x, fwd.y, fwd.z, 0.9, this.settings.effectsLevel);
        }
      }
    }
  }

  onHit(e) {
    this.hud.hit(!!e.head, !!e.kill);
    this.audio.hitmarker(!!e.head);
    const t = this.remotes.latest(e.target);
    if (t) {
      const p = this.renderer.project(t.x, t.y + 1.3, t.z, this._proj);
      if (p) this.hud.damageNumber(p.x, p.y, e.dmg, !!e.head);
      this.effects.blood(t.x, t.y + 1.2, t.z, 0, 0.4, 0);
    }
  }

  onDamage(e) {
    const self = this.prediction ? this.prediction.ph.pos : this.camera;
    const ang = Math.atan2(-(e.x - self.x), -(e.z - self.z));
    this.hud.tookDamage(angleDelta(this.camera.yaw, ang), e.dmg);
    this.audio.hurt(e.dmg);
    this.shake += Math.min(0.5, e.dmg / 90) * this.settings.cameraShake;
  }

  onKill(e) {
    const killer = this.roster.get(e.killer);
    const victim = this.roster.get(e.victim);
    const mine = e.killer === this.selfId;
    this.hud.killFeed(
      killer ? killer.name : null, victim ? victim.name : '?',
      e.weapon, false, mine || e.victim === this.selfId,
      killer ? killer.team : 0, victim ? victim.team : 0
    );
    if (mine) {
      this.audio.kill();
      if (e.streak === 3) this.hud.banner('TRIPLE');
      else if (e.streak === 5) this.hud.banner('RAMPAGE');
      else if (e.streak >= 8) this.hud.banner(e.streak + ' STREAK');
    }
    if (e.victim === this.selfId) {
      this.alive = false;
      this.lastKiller = { name: killer ? killer.name : null, weapon: e.weapon };
      this.hud.death(this.lastKiller.name, e.weapon, RESPAWN_MS / 1000);
      this.audio.death();
      this.shake += 0.6 * this.settings.cameraShake;
    }
    const t = this.remotes.latest(e.victim);
    if (t && this.settings.effectsLevel > 0) this.effects.blood(t.x, t.y + 1, t.z, 0, 1, 0);
  }

  onRespawn(e) {
    if (this.settings.effectsLevel > 0) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.effects.spark(e.x, e.y + 0.4, e.z, Math.cos(a) * 3, 3.4, Math.sin(a) * 3, 0.43, 0.95, 0.78, 0.5, 0.05);
      }
    }
  }

  onRemoteJump(e) {
    if (e.id === this.selfId) return;
    const sp = spatialise(this.camera, this.camera.yaw, e.x, e.y, e.z, 34);
    if (sp) this.audio.footstep(sp.pan, 0.5 / (1 + sp.distance * 0.1), true);
  }

  /* ── Frame ─────────────────────────────────────────────────────── */
  update(dt, frameMs) {
    if (!this.active || !this.prediction) return;
    const input = this.ctx.input;

    // Countdown. The server decides when the match actually goes live;
    // this is only the number on screen and the chirp under it.
    if (this.matchState === GAME_STATE.COUNTDOWN) {
      this.setCountdown(this.countdownEnd - performance.now());
      this.tickCountdown();
    } else if (this.countdownShown >= 0) {
      this.setCountdown(0);
    }

    /* Fixed-step simulation. The cap stops a tab that was backgrounded
       for a minute from trying to replay a minute of input at once. */
    /* Interpolate everyone once per frame and share the result. The aim
       assist, the HUD, the minimap and the renderer all want the same
       list, and sampling it four separate times was most of a millisecond
       for nothing. */
    this.frameList = this.remotes.sample(this.selfId, dt);

    this.accum += dt;
    let steps = 0;
    while (this.accum >= TICK_DT && steps < 5) {
      this.accum -= TICK_DT;
      steps++;
      this.simStep(TICK_DT);
    }
    if (this.accum > TICK_DT * 5) this.accum = 0;

    this.remotes.advance(dt * 1000);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.viewmodel.update(dt, {
      yaw: this.camera.yaw, pitch: this.camera.pitch,
      speed: Math.hypot(this.prediction.ph.vel.x, this.prediction.ph.vel.z),
      onGround: this.prediction.ph.onGround,
      ads: this.prediction.player.ads,
    });
    this.updateHud(dt);
  }

  simStep(dt) {
    const input = this.ctx.input;
    const p = this.prediction.player;
    const nowMs = this.remotes.serverClock || performance.now();

    if (!this.alive || this.matchState === GAME_STATE.COUNTDOWN) {
      // Look still works while dead, so you can watch the fight.
      input.consumeLook();
      this.camera.yaw = input.yaw;
      this.camera.pitch = input.pitch;
      return;
    }

    this.applyAimAssist(dt);
    input.consumeLook();

    // Weapon cycling from the scroll wheel or the swap button.
    if (input.pendingSwap || input.wheel) {
      const dir = input.wheel || 1;
      const next = (p.slot + (dir > 0 ? 1 : p.weapons.length - 1)) % p.weapons.length;
      input.set(BTN.W1, next === 0);
      input.set(BTN.W2, next === 1);
      input.set(BTN.W3, next === 2);
      input.pendingSwap = false;
      input.wheel = 0;
    }

    const before = p.weapons[p.slot];
    const cmd = this.prediction.step({
      moveX: input.moveX, moveZ: input.moveZ, buttons: input.buttons,
      yaw: input.yaw, pitch: input.pitch,
    }, nowMs, dt);
    input.set(BTN.W1, false); input.set(BTN.W2, false); input.set(BTN.W3, false);

    if (p.weapons[p.slot] !== before) {
      this.viewmodel.setWeapon(p.weapons[p.slot]);
      this.audio.switchWeapon();
    }
    if (cmd.dryFire) this.audio.dryFire();
    if (p.reloadUntil > nowMs && !this._reloading) {
      this._reloading = true;
      const w = getWeapon(p.weapons[p.slot]);
      this.viewmodel.onReload(p.reloadUntil - nowMs);
      this.audio.reload(p.reloadUntil - nowMs, !!w.reloadPerShell);
    } else if (p.reloadUntil <= nowMs) this._reloading = false;

    if (p.ph.jumped) this.audio.jump();
    if (p.ph.landedHard > 0) { this.audio.land(p.ph.landedHard); this.viewmodel.onLand(p.ph.landedHard); this.shake += p.ph.landedHard * 0.25 * this.settings.cameraShake; }

    this.footsteps(dt);

    this.unsent.push(cmd);
    while (this.unsent.length > SEND_REDUNDANCY) this.unsent.shift();
    this.net.sendInput(this.unsent, performance.now() & 0xffffffff);
  }

  footsteps(dt) {
    const ph = this.prediction.ph;
    const speed = Math.hypot(ph.vel.x, ph.vel.z);
    if (!ph.onGround || speed < 1.4) { this.stepTimer = 0.28; return; }
    this.stepTimer -= dt * (speed / 7.2);
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.42;
      this.audio.footstep(0, ph.crouching ? 0.35 : 0.8, false);
    }
  }

  /* Aim assist slows the look input while the crosshair is crossing a
     target — it never moves the aim for you. Touch only, and only when
     asked for: on a mouse it would be taking the game off the player. */
  applyAimAssist(dt) {
    this.aimAssistTarget = null;
    const s = this.settings;
    if (!s.aimAssist || this.ctx.input.source !== 'touch' || s.aimAssistStrength <= 0) return;
    const eye = this.camera;
    const fwd = this.forward();
    let best = null, bestDot = Math.cos(0.12);
    for (const o of (this.frameList || [])) {
      if (!o.alive) continue;
      if (this.mode.teams && o.team === this.prediction.player.team) continue;
      const dx = o.x - eye.x, dy = (o.y + o.height * 0.6) - eye.y, dz = o.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 60 || d < 1) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      if (dot > bestDot) { bestDot = dot; best = o; }
    }
    if (!best) return;
    this.aimAssistTarget = best;
    const slow = 1 - s.aimAssistStrength * 0.55;
    this.ctx.input.lookDX *= slow;
    this.ctx.input.lookDY *= slow;
  }

  updateCamera(dt) {
    const cam = this.camera;
    const input = this.ctx.input;
    this.prediction.cameraPos(cam);
    cam.yaw = input.yaw;
    cam.pitch = input.pitch;

    this.shake = damp(this.shake, 0, 7, dt);
    if (this.shake > 0.002) {
      const t = performance.now() * 0.001 + this.shakeSeed;
      const k = this.shake * 0.035;
      cam.x += Math.sin(t * 47) * k;
      cam.y += Math.sin(t * 61) * k;
      cam.z += Math.cos(t * 53) * k;
      cam.roll = Math.sin(t * 31) * this.shake * 0.035;
    } else cam.roll = 0;

    // View bob, tied to real speed rather than to a timer.
    const ph = this.prediction.ph;
    const speed = Math.hypot(ph.vel.x, ph.vel.z);
    if (this.settings.viewBob > 0 && ph.onGround) {
      const bobT = performance.now() * 0.001 * (5.5 + speed * 0.55);
      const amp = Math.min(1, speed / 9) * 0.022 * this.settings.viewBob * (1 - this.prediction.player.ads * 0.7);
      cam.y += Math.abs(Math.sin(bobT)) * amp;
      cam.roll += Math.sin(bobT * 0.5) * amp * 0.9;
    }

    const w = this.prediction.weapon;
    const ads = this.prediction.player.ads;
    const baseFov = this.settings.fov * Math.PI / 180;
    const target = this.settings.adsFovScale ? baseFov * (1 + (w.adsFov - 1) * ads) : baseFov;
    cam.fov = target;
  }

  updateHud(dt) {
    const p = this.prediction.player;
    const hud = this.hud;
    hud.setVitals(p.health, p.armour);
    const ammo = this.prediction.ammo;
    hud.setAmmo(ammo ? ammo.mag : 0, ammo ? ammo.reserve : 0, p.weapons[p.slot], p.weapons, p.slot);
    hud.setMatch(this.mode, this.timeLeft, this.scoreA, this.scoreB, this.selfScore);
    hud.setSpread(this.prediction.spread, this.camera.fov);
    hud.tickFeed(performance.now());
    if (!this.alive && this.respawnIn > 0) hud.respawnCount(this.respawnIn / 1000);

    const list = this.frameList || [];
    if (this.settings.minimap) {
      hud.drawMinimap(this.world, {
        x: this.camera.x, y: this.camera.y, z: this.camera.z,
        yaw: this.camera.yaw, team: p.team,
      }, list, this.mode);
    }
    this.updateNameplates(list);
  }

  updateNameplates(list) {
    const plates = this._plates;
    plates.length = 0;
    const teams = this.mode.teams;
    const myTeam = this.prediction.player.team;
    for (const o of list) {
      if (!o.alive) continue;
      /* Teammates only. A name over an enemy is a wallhack with a nice
         font, and there is no game mode here where it would be fair. */
      if (!teams || o.team !== myTeam) continue;
      const p = this.renderer.project(o.x, o.y + o.height + 0.34, o.z, this._proj);
      if (!p || p.depth > 90) continue;
      plates.push({
        id: o.id, x: p.x, y: p.y, name: o.name + (o.bot ? ' ·BOT' : ''),
        colour: TEAM_COLOURS[o.team] || '#c9cdd4',
        health: o.health, showHealth: true,
        alpha: clamp(1.4 - p.depth / 80, 0.15, 1),
      });
    }
    this.hud.updateNameplates(plates);
  }

  tickCountdown() {
    const n = Math.max(0, Math.ceil((this.countdownMs || 0) / 1000));
    if (n !== this.countdownShown) {
      this.countdownShown = n;
      const box = document.getElementById('countdown');
      if (n > 0) {
        box.hidden = false;
        document.getElementById('countdownNum').textContent = String(n);
        document.getElementById('countdownSub').textContent = this.mode.name.toUpperCase();
        this.audio.countdown(n);
      }
    }
  }

  setCountdown(ms) {
    this.countdownMs = Math.max(0, ms);
    if (ms <= 0) {
      const box = document.getElementById('countdown');
      if (!box.hidden && this.countdownShown !== 0) {
        this.countdownShown = 0;
        document.getElementById('countdownNum').textContent = 'GO';
        document.getElementById('countdownSub').textContent = '';
        this.audio.countdown(0);
        setTimeout(() => { box.hidden = true; }, 700);
      }
    }
  }

  /* ── Draw ──────────────────────────────────────────────────────── */
  render(dt, frameMs) {
    if (!this.active) return;
    const list = this.frameList || [];

    this.renderer.render({
      camera: this.camera,
      effects: this.effects,
      viewmodel: this.viewmodel,
      showViewmodel: this.settings.showViewmodel && this.alive,
      buildEntities: (opaque) => this.buildEntities(opaque, list, dt),
      viewmodelSprites: (add) => this.buildMuzzleSprites(add),
    }, dt, frameMs);
  }

  buildEntities(batch, list, dt) {
    for (const o of list) {
      if (!o.alive && o.deathFor > 900) continue;
      const anim = o.track.anim;
      stepAnim(anim, o.speed, o.onGround, dt, 0);
      const colours = avatarColours(o.team, o.skin, o.bot);
      let alpha = 1;
      let y = o.y;
      if (!o.alive) {
        // A short collapse rather than vanishing on the spot.
        const t = Math.min(1, o.deathFor / 900);
        alpha = 1 - t;
        y -= t * 0.5;
      }
      pushAvatar(batch, {
        x: o.x, y, z: o.z, yaw: o.yaw, pitch: o.pitch,
        height: o.height, team: o.team, skin: o.skin, bot: o.bot,
      }, anim, { colours, alpha });

      if (this.renderer.preset.shadows) {
        const ground = floorUnder(this.world, o.x, o.y + 0.3, o.z, 6);
        if (ground !== null) {
          const fall = clamp(1 - (o.y - ground) / 4, 0.15, 1);
          pushBlobShadow(batch, o.x, ground, o.z, 0.42 * fall + 0.1, 0.42 * fall * alpha);
        }
      }
    }
  }

  buildMuzzleSprites(add) {
    // The flash sits on the viewmodel's muzzle, in camera space.
    const p = this.prediction.player;
    if (!p) return;
    const recent = performance.now() - (this._lastFlashAt || 0);
    if (recent > 55) return;
    const m = this.viewmodel.muzzle(this._muzzleCam);
    const s = 0.055 + Math.random() * 0.02;
    add.push(m.x, m.y, m.z - 0.03, 0, 0, 0, s, s, 0, 1, 0.88, 0.6, 0.9);
  }

  muzzleWorld(out = { x: 0, y: 0, z: 0 }) {
    muzzleToWorld(this.viewmodel.muzzle(this._muzzleCam), this.camera, out);
    this._lastFlashAt = performance.now();
    return out;
  }

  forward(out = { x: 0, y: 0, z: 0 }) {
    const cp = Math.cos(this.camera.pitch);
    out.x = -Math.sin(this.camera.yaw) * cp;
    out.y = Math.sin(this.camera.pitch);
    out.z = -Math.cos(this.camera.yaw) * cp;
    return out;
  }
  right(out = { x: 0, y: 0, z: 0 }) {
    out.x = Math.cos(this.camera.yaw); out.y = 0; out.z = -Math.sin(this.camera.yaw);
    return out;
  }

  /* The server sends the whole board once a second; between those the
     local player's own row is kept live from the snapshot, because your
     own kill count updating a second late is the one that gets noticed. */
  onScores(d) {
    this.scores = d.rows || [];
    for (const r of this.scores) this.roster.set(r.id, { ...(this.roster.get(r.id) || {}), ...r });
  }

  scoreboardRows() {
    const rows = (this.scores || []).map((r) => (r.id === this.selfId
      ? { ...r, kills: this.selfKills, deaths: this.selfDeaths, score: this.selfScore }
      : r));
    if (rows.length) return rows;
    return [...this.roster.values()].map((r) => ({
      id: r.id, name: r.name, team: r.team, bot: r.bot ? 1 : 0,
      score: 0, kills: 0, deaths: 0, acc: 0, hs: 0, ping: r.ping || 0, rung: 0,
    }));
  }
}
