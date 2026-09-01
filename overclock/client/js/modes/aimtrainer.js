/* Aim training.
 *
 * Runs entirely on the client with no server and no bots: the RANGE map,
 * your real weapon with its real recoil and spread, and targets that exist
 * only here. That matters — practising against a simplified gun teaches
 * you the wrong gun.
 *
 * Four drills, because they train different things:
 *   FLICK      one target at a time, somewhere new — target acquisition
 *   TRACKING   one target that keeps moving — smooth pursuit
 *   SPRAY      a wall of targets — recoil control under sustained fire
 *   REACTION   targets appear after a random delay — pure reaction time
 */

import { getMap } from '../../../shared/maps/index.js';
import { TICK_DT, BTN, PLAYER_HEIGHT } from '../../../shared/constants.js';
import { createPlayer, spawnPlayer, stepPlayerMovement, stepWeapon, curWeapon, curAmmo, currentSpread, setWeapons } from '../../../shared/sim/player.js';
import { pelletDir } from '../../../shared/sim/combat.js';
import { raycastWorld } from '../../../shared/maps/builder.js';
import { loadoutWeapons, getWeapon } from '../../../shared/weapons.js';
import { Effects } from '../game/effects.js';
import { ViewModel } from '../game/viewmodel.js';
import { muzzleToWorld } from '../game/game.js';
import { clamp, damp, makeRandom } from '../../../shared/math.js';
import { PRESETS } from '../engine/renderer.js';

export const DRILLS = {
  flick: { id: 'flick', name: 'FLICK', blurb: 'One target at a time. Find it, hit it, next.', targets: 1, moving: false, respawnMs: 0 },
  tracking: { id: 'tracking', name: 'TRACKING', blurb: 'One target that will not hold still. Stay on it.', targets: 1, moving: true, respawnMs: 0, persistent: true },
  spray: { id: 'spray', name: 'SPRAY CONTROL', blurb: 'Six targets. Empty the magazine into all of them.', targets: 6, moving: false, respawnMs: 700 },
  reaction: { id: 'reaction', name: 'REACTION', blurb: 'Targets appear when they feel like it. Measure yourself.', targets: 1, moving: false, delayMs: [400, 2200] },
};

export const DRILL_IDS = ['flick', 'tracking', 'spray', 'reaction'];
const BEST_KEY = 'overclock.aimbest.v1';

export class AimTrainer {
  constructor(ctx) {
    this.ctx = ctx;
    this.renderer = ctx.renderer;
    this.audio = ctx.audio;
    this.settings = ctx.settings;
    this.hud = ctx.hud;
    this.world = getMap('range');
    this.effects = new Effects(600);
    this.viewmodel = new ViewModel();
    this.active = false;
    this.targets = [];
    this.rnd = makeRandom(Date.now() & 0x7fffffff);
    this.camera = { x: 0, y: 2, z: 0, yaw: 0, pitch: 0, fov: 1.6, roll: 0 };
    this.accum = 0;
    this.shake = 0;
    this.onFinish = null;
    this._proj = { x: 0, y: 0, depth: 0 };
    this._muzzle = { x: 0, y: 0, z: 0 };
  }

  static loadBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch { return {}; }
  }
  static saveBest(b) { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch {} }

  start(opts) {
    const drill = DRILLS[opts.drill] || DRILLS.flick;
    this.drill = drill;
    this.opts = {
      size: opts.size ?? 0.42,
      speed: opts.speed ?? 4,
      duration: opts.duration ?? 60,
      weapon: opts.weapon || this.settings.loadout.primary,
    };
    this.world = getMap('range');
    this.renderer.setMap(this.world);
    this.effects.clear();
    this.effects.setBudget(PRESETS[this.settings.quality].particles);

    this.player = createPlayer({ id: 1, name: 'you' });
    const stand = this.world.training.stand;
    spawnPlayer(this.player, stand, 0);
    setWeapons(this.player, [this.opts.weapon, this.settings.loadout.secondary, 'shiv']);
    this.player.ammo.forEach((a) => { a.reserve = 99999; });

    this.viewmodel = new ViewModel();
    this.viewmodel.setWeapon(this.opts.weapon);
    this.ctx.input.yaw = stand.yaw;
    this.ctx.input.pitch = 0;

    this.stats = {
      shots: 0, hits: 0, headshots: 0, kills: 0,
      reaction: [], started: performance.now(), elapsed: 0,
      bestReaction: Infinity, score: 0,
    };
    this.targets.length = 0;
    this.nextSpawnAt = 0;
    this.active = true;
    this.finished = false;
    this.accum = 0;
    this.hud.show(true);
    this.hud.hideDeath();
    this.hud.applySettings();
    document.getElementById('minimapWrap').hidden = true;
    this.audio.ambience(this.world.theme);
    for (let i = 0; i < drill.targets; i++) this.spawnTarget(i === 0 ? 0 : this.rnd() * 300);
  }

  stop() {
    this.active = false;
    this.hud.show(false);
    this.audio.stopAmbience();
  }

  spawnTarget(delayMs = 0) {
    const a = this.world.training.area;
    const t = {
      x: a.minX + this.rnd() * (a.maxX - a.minX),
      y: a.minY + this.rnd() * (a.maxY - a.minY),
      z: a.minZ + this.rnd() * (a.maxZ - a.minZ),
      r: this.opts.size,
      vx: 0, vz: 0, vy: 0,
      alive: true,
      shownAt: performance.now() + delayMs,
      pending: delayMs > 0,
      hp: this.drill.persistent ? 400 : 1,
      hitFlash: 0,
    };
    if (this.drill.moving) {
      const ang = this.rnd() * Math.PI * 2;
      t.vx = Math.cos(ang) * this.opts.speed;
      t.vz = Math.sin(ang) * this.opts.speed * 0.35;
      t.vy = (this.rnd() - 0.5) * this.opts.speed * 0.4;
    }
    if (this.drill.delayMs) {
      t.pending = true;
      t.shownAt = performance.now() + this.drill.delayMs[0] + this.rnd() * (this.drill.delayMs[1] - this.drill.delayMs[0]);
    }
    this.targets.push(t);
    return t;
  }

  update(dt) {
    if (!this.active) return;
    const input = this.ctx.input;
    this.accum += dt;
    let steps = 0;
    while (this.accum >= TICK_DT && steps < 5) { this.accum -= TICK_DT; steps++; this.simStep(TICK_DT); }
    if (this.accum > TICK_DT * 5) this.accum = 0;

    const now = performance.now();
    this.stats.elapsed = (now - this.stats.started) / 1000;
    if (this.opts.duration && this.stats.elapsed >= this.opts.duration) { this.finish(); return; }

    const a = this.world.training.area;
    for (const t of this.targets) {
      if (t.pending && now >= t.shownAt) { t.pending = false; t.shownAt = now; }
      if (t.pending || !t.alive) continue;
      t.hitFlash = Math.max(0, t.hitFlash - dt * 5);
      if (!this.drill.moving) continue;
      t.x += t.vx * dt; t.y += t.vy * dt; t.z += t.vz * dt;
      // Bounce inside the training volume rather than wandering out of it.
      if (t.x < a.minX + t.r || t.x > a.maxX - t.r) { t.vx *= -1; t.x = clamp(t.x, a.minX + t.r, a.maxX - t.r); }
      if (t.y < a.minY + t.r || t.y > a.maxY - t.r) { t.vy *= -1; t.y = clamp(t.y, a.minY + t.r, a.maxY - t.r); }
      if (t.z < a.minZ + t.r || t.z > a.maxZ - t.r) { t.vz *= -1; t.z = clamp(t.z, a.minZ + t.r, a.maxZ - t.r); }
    }

    if (this.nextSpawnAt && now >= this.nextSpawnAt) {
      this.nextSpawnAt = 0;
      const need = this.drill.targets - this.targets.filter((t) => t.alive).length;
      for (let i = 0; i < need; i++) this.spawnTarget();
    }
    this.targets = this.targets.filter((t) => t.alive || now - t.diedAt < 400);

    this.effects.update(dt);
    this.updateCamera(dt);
    this.viewmodel.update(dt, {
      yaw: this.camera.yaw, pitch: this.camera.pitch,
      speed: Math.hypot(this.player.ph.vel.x, this.player.ph.vel.z),
      onGround: this.player.ph.onGround, ads: this.player.ads,
    });
    this.updateHud();
  }

  simStep(dt) {
    const input = this.ctx.input;
    input.consumeLook();
    const cmd = {
      seq: 0, moveX: input.moveX, moveZ: input.moveZ,
      buttons: input.buttons, yaw: input.yaw, pitch: input.pitch,
    };
    stepPlayerMovement(this.world, this.player, cmd, dt);
    const out = [];
    const now = performance.now();
    stepWeapon(this.player, cmd, now, dt, out);
    for (const ev of out) {
      if (ev.shot) this.fire(ev.seq, cmd, now);
      else if (ev.dry) this.audio.dryFire();
    }
    if (this.player.reloadUntil > now && !this._reloading) {
      this._reloading = true;
      const w = curWeapon(this.player);
      this.viewmodel.onReload(this.player.reloadUntil - now);
      this.audio.reload(this.player.reloadUntil - now, !!w.reloadPerShell);
    } else if (this.player.reloadUntil <= now) this._reloading = false;
    if (this.player.ph.jumped) this.audio.jump();
    if (this.player.ph.landedHard > 0) this.viewmodel.onLand(this.player.ph.landedHard);
  }

  fire(seq, cmd, now) {
    const w = curWeapon(this.player);
    const spread = currentSpread(this.player);
    const eyeY = this.player.ph.pos.y + this.player.ph.height - 0.14;
    const ox = this.player.ph.pos.x, oz = this.player.ph.pos.z;
    this.stats.shots++;
    this.viewmodel.onFire(w);
    this.shake += (w.recoil.kick || 1) * 0.16 * this.settings.cameraShake;

    const m = this.muzzleWorld();
    const f = this.forward();
    this.effects.muzzle(m.x, m.y, m.z, f.x, f.y, f.z, 1, this.settings.effectsLevel);
    if (w.shell) {
      const r = this.right();
      this.effects.shell(m.x + r.x * 0.1, m.y - 0.06, m.z + r.z * 0.1, r.x * 2.6, 1.8, r.z * 2.6);
    }
    this.audio.shot(w.sound, { own: true, volume: 1, reverb: 0.5 });

    let anyHit = false, anyHead = false;
    const pellets = w.melee ? 1 : (w.pellets || 1);
    for (let i = 0; i < pellets; i++) {
      const d = w.melee ? this.forward() : pelletDir(cmd.yaw, cmd.pitch, spread, 1, seq, i);
      const wall = raycastWorld(this.world, ox, eyeY, oz, d.x, d.y, d.z, 260);
      let limit = wall ? wall.dist : 260;
      let best = null, bestT = limit;
      for (const t of this.targets) {
        if (!t.alive || t.pending) continue;
        const hit = raySphere(ox, eyeY, oz, d.x, d.y, d.z, t.x, t.y, t.z, t.r);
        if (hit >= 0 && hit < bestT) { bestT = hit; best = t; }
      }
      if (best) {
        anyHit = true;
        const hy = eyeY + d.y * bestT;
        // The top third counts as a head, matching the player hit boxes.
        const head = hy > best.y + best.r * 0.36;
        if (head) anyHead = true;
        this.registerHit(best, head, bestT, ox + d.x * bestT, hy, oz + d.z * bestT);
      } else if (wall) {
        this.effects.impact(ox + d.x * wall.dist, eyeY + d.y * wall.dist, oz + d.z * wall.dist,
          wall.normal.x, wall.normal.y, wall.normal.z, wall.brush.color, this.settings.effectsLevel);
      }
      if (w.tracer) this.effects.tracer(m.x, m.y, m.z, d.x, d.y, d.z, Math.max(1, bestT));
    }
    if (anyHit) { this.stats.hits++; if (anyHead) this.stats.headshots++; }
  }

  registerHit(t, head, dist, px, py, pz) {
    const now = performance.now();
    t.hitFlash = 1;
    this.effects.blood(px, py, pz, 0, 0.3, 0);
    this.hud.hit(head, false);
    this.audio.hitmarker(head);
    const p = this.renderer.project(px, py + 0.2, pz, this._proj);
    if (p) this.hud.damageNumber(p.x, p.y, head ? 2 : 1, head);

    if (this.drill.persistent) { this.stats.score += head ? 2 : 1; return; }
    t.hp--;
    if (t.hp > 0) return;
    t.alive = false;
    t.diedAt = now;
    this.stats.kills++;
    this.stats.score += head ? 150 : 100;
    const reaction = now - t.shownAt;
    if (reaction > 40 && reaction < 6000) {
      this.stats.reaction.push(reaction);
      this.stats.bestReaction = Math.min(this.stats.bestReaction, reaction);
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.effects.spark(t.x, t.y, t.z, Math.cos(a) * 5, Math.random() * 4, Math.sin(a) * 5, 0.43, 0.95, 0.78, 0.4, 0.045);
    }
    if (!this.nextSpawnAt) this.nextSpawnAt = now + (this.drill.respawnMs || 90);
  }

  updateCamera(dt) {
    const cam = this.camera;
    const ph = this.player.ph;
    cam.x = ph.pos.x; cam.y = ph.pos.y + ph.height - 0.14; cam.z = ph.pos.z;
    cam.yaw = this.ctx.input.yaw;
    cam.pitch = this.ctx.input.pitch;
    this.shake = damp(this.shake, 0, 7, dt);
    if (this.shake > 0.002) {
      const t = performance.now() * 0.001;
      cam.x += Math.sin(t * 47) * this.shake * 0.03;
      cam.y += Math.sin(t * 61) * this.shake * 0.03;
      cam.roll = Math.sin(t * 31) * this.shake * 0.03;
    } else cam.roll = 0;
    const w = curWeapon(this.player);
    const base = this.settings.fov * Math.PI / 180;
    cam.fov = this.settings.adsFovScale ? base * (1 + (w.adsFov - 1) * this.player.ads) : base;
  }

  updateHud() {
    const s = this.stats;
    const acc = s.shots ? (s.hits / s.shots) * 100 : 0;
    const hs = s.hits ? (s.headshots / s.hits) * 100 : 0;
    const avg = s.reaction.length ? s.reaction.reduce((a, b) => a + b, 0) / s.reaction.length : 0;
    this.hud.setVitals(100, 0);
    const ammo = curAmmo(this.player);
    this.hud.setAmmo(ammo.mag, ammo.reserve, this.player.weapons[this.player.slot], this.player.weapons, this.player.slot);
    this.hud.setSpread(currentSpread(this.player), this.camera.fov);
    this.hud.setMatch(
      { name: this.drill.name, teams: false, scoreLabel: 'SCORE', id: 'aim' },
      Math.max(0, this.opts.duration - s.elapsed), 0, 0, s.score
    );
    this.hud.perf(
      `HITS   ${s.hits}/${s.shots}\nACC    ${acc.toFixed(1)}%\nHEAD   ${hs.toFixed(0)}%\n` +
      (avg ? `REACT  ${avg.toFixed(0)}ms\nBEST   ${Number.isFinite(s.bestReaction) ? s.bestReaction.toFixed(0) : '—'}ms` : '')
    );
    document.getElementById('perfStats').hidden = false;
  }

  render(dt, frameMs) {
    if (!this.active) return;
    this.renderer.render({
      camera: this.camera,
      effects: this.effects,
      viewmodel: this.viewmodel,
      showViewmodel: this.settings.showViewmodel,
      buildEntities: (batch) => this.buildTargets(batch),
    }, dt, frameMs);
  }

  buildTargets(batch) {
    const now = performance.now();
    for (const t of this.targets) {
      if (t.pending) continue;
      let scale = 1, alpha = 1;
      if (!t.alive) {
        const k = Math.min(1, (now - t.diedAt) / 380);
        scale = 1 + k * 0.9; alpha = 1 - k;
      } else {
        // A brief pop-in, so a spawn is unmistakable in peripheral vision.
        const age = (now - t.shownAt) / 130;
        if (age < 1) scale = 0.35 + age * 0.65;
      }
      const r = t.r * scale;
      const flash = t.hitFlash;
      batch.push(t.x, t.y, t.z, r, r, r, 0, 0,
        0.96, 0.22 + flash * 0.7, 0.30 + flash * 0.6, 0.78 + flash * 0.22, alpha);
      // A brighter cap on the upper third, marking the head zone.
      batch.push(t.x, t.y + r * 0.66, t.z, r * 0.66, r * 0.34, r * 0.66, 0, 0,
        1, 0.88, 0.34, 0.92, alpha);
    }
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    const s = this.stats;
    const acc = s.shots ? s.hits / s.shots : 0;
    const avg = s.reaction.length ? s.reaction.reduce((a, b) => a + b, 0) / s.reaction.length : 0;
    const result = {
      drill: this.drill.id, drillName: this.drill.name,
      score: Math.round(s.score), shots: s.shots, hits: s.hits,
      accuracy: acc, headshots: s.headshots,
      headshotRate: s.hits ? s.headshots / s.hits : 0,
      kills: s.kills, avgReaction: avg,
      bestReaction: Number.isFinite(s.bestReaction) ? s.bestReaction : 0,
      duration: s.elapsed,
    };
    const best = AimTrainer.loadBest();
    const prev = best[this.drill.id];
    result.record = !prev || result.score > prev.score;
    if (result.record) { best[this.drill.id] = result; AimTrainer.saveBest(best); }
    this.audio.matchEnd(result.record);
    this.hud.show(false);
    if (this.onFinish) this.onFinish(result);
  }

  muzzleWorld(out = { x: 0, y: 0, z: 0 }) {
    return muzzleToWorld(this.viewmodel.muzzle(this._muzzle), this.camera, out);
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
}

/* Targets are spheres rather than boxes: a cube's corners make the
   hitbox bigger than it looks from an angle, which is exactly the wrong
   lesson for an aim trainer to teach. */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}
