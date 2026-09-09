/* ═══════════════════════════════════════════════════════════
   flightdeck.js — the aircraft, the flight deck inside it, and
   the world it is moving through.

   The critical property of this stage is that there is no
   backdrop. The terrain, the ocean, the clouds, the runway and
   the cities are one scene in world coordinates; the aircraft is
   a body moving through it; and the flight deck is bolted to the
   nose of that body. Look out of the window and the ground is
   going past because the aircraft's position changed, not
   because a texture is scrolling.

   The windows themselves are holes. The fuselage is a
   single-sided surface, so from the inside it is simply not
   drawn — which means the view out of the flight deck is the
   same scene, at the same time, from where the pilot's eyes are.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { Stage, attachSky, claimSky, sky, renderer, post } from './world.js';
import { makeTerrain, makeOcean, makeClouds, makeCity, makeAirport, groundHeight } from './scenery.js';
import { buildAircraft } from './build.js';
import { buildCockpit } from './cockpit.js';
import { FlightModel, KT, FT, DETENTS } from './sim.js';
import { PFD, ND, EWD, SD } from './displays.js';
import { MCDU } from './mcdu.js';
import { byId } from './fleet.js';
import { audio } from './audio.js';
import { $, $$, magnetise, toast, cursor } from './ui.js';
import { loop, bus, clamp, lerp, damp, dampAngle, pointer, env, quality, deg, rad2deg, pad, fmt } from './core.js';

const VIEWS = ['pilot', 'mcdu', 'overhead', 'pedestal', 'chase', 'wing'];

export class FlightStage extends Stage {
  constructor(app) {
    super('flight');
    this.app = app;
    this.typeId = 'a320';
    this.view = 'pilot';
    this.grade = { bloom: 0.20, grain: 0.04, vignette: 0.30, dof: 0, focus: 30, range: 90, exposure: 1.05 };
    this.shake = new THREE.Vector3();
    this.pending = null;
  }

  /* ── construction ──────────────────────────────────────── */

  build() {
    const type = byId(this.typeId);
    this.fm = new FlightModel(type);

    attachSky(this, { hour: 9.2 });
    sky.setTime(9.2);
    this.scene.environment = sky.environment();

    this.terrain = makeTerrain({});
    this.ocean = makeOcean({});
    this.scene.add(this.ocean.mesh, this.terrain.mesh);

    /* three decks of cloud so climbing through them means
       something: scattered low cumulus, a mid layer, and thin
       cirrus that only shows up near the top of the climb */
    this.cloudLow = makeClouds({ count: quality.clouds, base: 1150, spread: 30000, thickness: 700, seed: 3 });
    this.cloudMid = makeClouds({ count: Math.round(quality.clouds * 0.6), base: 3400, spread: 48000, thickness: 900, seed: 17 });
    this.cloudHigh = makeClouds({ count: Math.round(quality.clouds * 0.35), base: 9200, spread: 90000, thickness: 1400, seed: 29 });
    this.cloudHigh.uniforms.uOpacity.value = 0.42;
    this.scene.add(this.cloudLow.mesh, this.cloudMid.mesh, this.cloudHigh.mesh);

    this.airport = makeAirport();
    this.scene.add(this.airport);

    /* two cities either side of the departure track, so there is
       something to fly over rather than only terrain */
    this.scene.add(makeCity({ centre: new THREE.Vector3(-16000, 0, -9000), radius: 3600, seed: 11 }));
    this.scene.add(makeCity({ centre: new THREE.Vector3(21000, 0, 12500), radius: 4400, seed: 23 }));

    /* ── the aircraft ───────────────────────────────────── */
    this.carrier = new THREE.Group();
    this.scene.add(this.carrier);
    this._loadAircraft(type);

    this.camera.near = 0.16;
    this.camera.far = 220000;
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();

    this.raycaster = new THREE.Raycaster();
    this._bindUI();
    this._bindKeys();
    this._bind3D();


  }

  _loadAircraft(type) {
    if (this.ac) { this.carrier.remove(this.ac.group); }
    this.ac = buildAircraft(type);
    this.carrier.add(this.ac.group);

    /* screens and the two MCDUs, then the deck they sit in */
    if (!this.screens) {
      const S = quality.tier === 2 ? 512 : 384;
      this.screens = {
        pfdL: new PFD(S), pfdR: new PFD(S),
        ndL: new ND(S), ndR: new ND(S),
        ewd: new EWD(S), sd: new SD(S)
      };
      this.mcdus = [new MCDU(this.fm, 384), new MCDU(this.fm, 384)];
      this.mcdus[0].onPlan = (plan) => { this.plan = plan; };
      this.plan = this.mcdus[0].plan;
    }
    for (const m of this.mcdus) m.fm = this.fm;

    if (this.deck) this.ac.group.remove(this.deck.group);
    this.deck = buildCockpit(this.fm, this.screens, this.mcdus);

    const geo = type.geo, L = type.spec.length;
    const zAt = (f) => (f - 0.5) * L;
    const RH = geo.fuseH / 2;
    this.deck.group.position.set(0, -RH * (geo.decks === 2 ? 0.06 : 0.36) - 0.02, zAt(geo.noseLen * 0.62));
    this.ac.group.add(this.deck.group);

    this.fm.setType(type);
    this.fm.reset();
    this.ac.target.gear = 1;
    this.ac.update(1, { instant: true });
    $('#deck-type').textContent = type.name;
  }

  /* ── wiring ────────────────────────────────────────────── */

  _bindUI() {
    const ui = $('#deck-ui');
    magnetise(ui);

    for (const b of $$('#deck-views button')) {
      b.addEventListener('click', () => this.setView(b.dataset.view));
    }
    $('#deck-exit').addEventListener('click', () => bus.emit('nav', 'hangar'));

    const thr = $('#c-throttle');
    thr.addEventListener('input', () => { this.fm.setThrottle(+thr.value / 100); });
    $('#c-gear').addEventListener('click', () => this.fm.toggleGear());
    $('#c-flap-dn').addEventListener('click', () => this.fm.setFlapDetent(this.fm.detent - 1));
    $('#c-flap-up').addEventListener('click', () => this.fm.setFlapDetent(this.fm.detent + 1));
    $('#c-brake').addEventListener('click', () => this.fm.toggleBrake());
    $('#c-ap').addEventListener('click', () => this.fm.toggleAP());
    $('#c-quick').addEventListener('click', () => {
      this.fm.quickStart();
      audio.chime('ok');
      toast('ENGINES RUNNING · BRAKE RELEASED · FLAPS 1 — PUSH THE THROTTLE UP', 5200);
    });
    $('#c-spd').addEventListener('change', (e) => { this.fm.ap.spd = clamp(+e.target.value, 100, 350); });
    $('#c-hdg').addEventListener('change', (e) => { this.fm.ap.hdg = ((+e.target.value % 360) + 360) % 360; });
    $('#c-altsel').addEventListener('change', (e) => { this.fm.ap.alt = clamp(+e.target.value, 0, 43000); });
  }

  _bindKeys() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target.matches('input, textarea')) return;
      this.keys.add(e.code);
      const fm = this.fm;
      switch (e.code) {
        case 'KeyG': fm.toggleGear(); break;
        case 'KeyF': fm.setFlapDetent(fm.detent + 1); break;
        case 'KeyV': fm.setFlapDetent(fm.detent - 1); break;
        case 'KeyB': fm.toggleBrake(); break;
        case 'KeyP': fm.toggleAP(); break;
        case 'Space':
          fm.spoilerTarget = fm.spoilerTarget > 0.5 ? 0 : 1;
          audio.servo(1.4, 260, 900);
          e.preventDefault();
          break;
        case 'KeyC': {
          const i = VIEWS.indexOf(this.view);
          this.setView(VIEWS[(i + 1) % VIEWS.length]);
          break;
        }
        case 'KeyR': fm.revTarget = fm.revTarget ? 0 : 1; break;
        default: break;
      }
      if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /* Clicking a control in the flight deck raycasts for the
     nearest object carrying a `ctrl`, then hands it the UV so a
     keypad can work out which key was hit. Dragging a lever
     keeps sending deltas until the pointer is released. */
  _bind3D() {
    const dom = renderer.domElement;
    let dragging = null, lx = 0, ly = 0, moved = 0;

    const hitCtrl = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -((e.clientY / window.innerHeight) * 2 - 1);
      this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
      const hits = this.raycaster.intersectObject(this.deck.group, true);
      for (const h of hits) {
        let o = h.object;
        while (o && !o.userData.ctrl) o = o.parent;
        if (o) return { ctrl: o.userData.ctrl, uv: h.uv, point: h.point };
      }
      return null;
    };

    dom.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      const h = hitCtrl(e);
      if (!h) return;
      dragging = h; lx = e.clientX; ly = e.clientY; moved = 0;
      dom.setPointerCapture?.(e.pointerId);
    });

    dom.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (dragging) {
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        dragging.ctrl.onDrag?.(dx, dy);
        return;
      }
      const h = hitCtrl(e);
      if (h) cursor.hot(h.ctrl.label);
      else cursor.cool();
      this._hover = h?.ctrl || null;
    });

    const up = (e) => {
      if (!dragging) return;
      if (moved < 6) {
        /* a click on the left half of a knob turns it down, the
           right half up — which is how you turn a knob you cannot
           actually grip */
        let dir = 1;
        if (dragging.ctrl.type === 'knob' || dragging.ctrl.type === 'slide' || dragging.ctrl.type === 'lever') {
          const r = renderer.domElement.getBoundingClientRect();
          dir = (e.clientX - r.left) / r.width > 0.5 ? 1 : -1;
          if (dragging.ctrl.type === 'lever' || dragging.ctrl.type === 'slide') {
            dir = e.shiftKey ? -1 : dir;
          }
        }
        dragging.ctrl.press(dir, dragging.uv);
      }
      dragging = null;
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', () => { dragging = null; });

    /* touch: a virtual sidestick on the right */
    const pad = $('#stick-pad');
    if (pad) {
      const knob = pad.querySelector('i');
      let id = null, ox = 0, oy = 0;
      const R = 48;
      pad.addEventListener('pointerdown', (e) => {
        id = e.pointerId; pad.setPointerCapture(id);
        const r = pad.getBoundingClientRect();
        ox = r.left + r.width / 2; oy = r.top + r.height / 2;
      });
      pad.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        let dx = e.clientX - ox, dy = e.clientY - oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        this.fm.stick.roll = dx / R;
        this.fm.stick.pitch = -dy / R;
        if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        this.fm.stick.roll = this.fm.stick.pitch = 0;
        if (knob) knob.style.transform = '';
      };
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
    }
  }

  setView(v) {
    if (!VIEWS.includes(v)) return;
    this.view = v;
    for (const b of $$('#deck-views button')) b.classList.toggle('on', b.dataset.view === v);
    audio.click(1.1, 0.2);
    this._viewT = 0;
    this._snap = true;
  }

  /* ── lifecycle ─────────────────────────────────────────── */

  enter(opts = {}) {
    const wanted = opts.type || this.pending?.type;
    if (wanted && wanted !== this.typeId) {
      this.typeId = wanted;
      this._loadAircraft(byId(wanted));
    }
    claimSky(this);
    if (this.sun?.shadow) {
      const c = this.sun.shadow.camera;
      c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.far = 620;
      c.updateProjectionMatrix();
    }
    $('#deck-ui').hidden = false;
    $('#stick-pad').hidden = !env.touch;
    const mode = opts.mode || this.pending?.mode || 'explore';
    this.pending = null;

    if (mode === 'fly') {
      this.fm.quickStart();
      this.fm.x = 180;
      this.fm.psi = Math.PI / 2 * 0 + Math.PI / 2;   /* lined up on 09 */
      this.fm.psi = 0;                                /* heading 090, down the runway */
      toast('LINED UP ON RUNWAY 09 — PUSH THE THROTTLE FORWARD', 5200);
    } else {
      toast('CLICK ANYTHING IN THE FLIGHT DECK · QUICK START GETS YOU MOVING', 5200);
    }
    this.setView('pilot');
    this._snap = true;
    audio.engine();
    audio.wind();
  }

  exit() {
    $('#deck-ui').hidden = true;
    audio.beds.engine?.set(0, 0);
    audio.beds.wind?.set(0, 0);
    cursor.cool();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ── frame ─────────────────────────────────────────────── */

  update(dt, time) {
    const fm = this.fm;

    this._input(dt);
    fm.update(dt);
    this._pose();
    /* The camera reads the deck's world matrix in the same frame
       the body was moved, so the chain has to be brought up to
       date here rather than waiting for the renderer. Without it
       the view is always one frame — at cruise, a hundred and
       thirty metres — behind the aircraft. */
    this.carrier.updateMatrixWorld(true);
    this._world(dt, time);
    this._camera(dt, time);
    this._screens(dt);
    this._hud();
    this._sound();

    this.deck.update(dt);
    this.ac.update(dt);
  }

  _input(dt) {
    const fm = this.fm, k = this.keys;
    const rate = 2.6;

    let p = 0, r = 0, y = 0;
    if (k.has('KeyW')) p += 1;
    if (k.has('KeyS')) p -= 1;
    if (k.has('KeyA')) r -= 1;
    if (k.has('KeyD')) r += 1;
    if (k.has('KeyQ')) y -= 1;
    if (k.has('KeyE')) y += 1;

    if (p || !env.touch) fm.stick.pitch = damp(fm.stick.pitch, p, rate, dt);
    if (r || !env.touch) fm.stick.roll = damp(fm.stick.roll, r, rate, dt);
    fm.stick.yaw = damp(fm.stick.yaw, y, rate, dt);

    if (k.has('ArrowUp')) fm.setThrottle(fm.throttle + dt * 0.55);
    if (k.has('ArrowDown')) fm.setThrottle(fm.throttle - dt * 0.55);
    fm.brakes = k.has('KeyB') ? 1 : (fm.onGround && fm.autobrake && fm.phase === 9 ? fm.autobrake / 3 : 0);
  }

  /* The aircraft's attitude in the world. Heading is measured
     clockwise from north and the scene's north is −Z, which is
     why the yaw term is what it is. */
  _pose() {
    const fm = this.fm;
    this.carrier.position.set(fm.x, fm.alt, fm.z);
    this.carrier.rotation.set(0, 0, 0);
    this.carrier.rotateY(fm.psi - Math.PI / 2);
    this.carrier.rotateX(-fm.theta);
    this.carrier.rotateZ(-fm.phi);

    const ac = this.ac;
    ac.target.gear = fm.gearTarget;
    ac.target.flap = fm.flap;
    ac.target.slat = fm.slat;
    ac.target.spoiler = fm.spoiler;
    ac.target.n1 = fm.n1;
    ac.target.reverse = fm.reverse;
    ac.target.aileron = -fm.stick.roll;
    ac.target.elevator = -fm.stick.pitch;
    ac.target.rudder = fm.stick.yaw;
    ac.target.flex = fm.onGround ? 0.1 : clamp(fm.gLoad, 0, 2) * 0.7;
    ac.anim.compression = fm.compression;
    ac.anim.wheelSpin = fm.wheelSpin;
  }

  _world(dt, time) {
    const fm = this.fm;
    const cx = fm.x, cz = fm.z;

    this.terrain.follow(cx, cz);
    this.ocean.follow(cx, cz);
    this.cloudLow.follow(cx, cz);
    this.cloudMid.follow(cx, cz);
    this.cloudHigh.follow(cx, cz);

    /* Aerial perspective thins with altitude — that is most of
       what makes flight level thirty-five look like flight level
       thirty-five rather than like three thousand feet. */
    const haze = lerp(0.000026, 0.0000045, clamp(fm.alt / 11000, 0, 1));
    const horizon = sky.uniforms.uHorizon.value;
    for (const o of [this.terrain, this.ocean]) {
      o.uniforms.uFogDensity.value = haze;
      o.uniforms.uFog.value.copy(horizon);
      o.uniforms.uSun.value.copy(sky.uniforms.uSun.value);
      o.uniforms.uSunColor.value.copy(sky.light.color);
    }
    this.terrain.uniforms.uSky.value.copy(horizon);
    this.terrain.uniforms.uTime.value = time;
    this.ocean.uniforms.uTime.value = time;

    for (const c of [this.cloudLow, this.cloudMid, this.cloudHigh]) {
      c.uniforms.uSun.value.copy(sky.uniforms.uSun.value);
      c.uniforms.uSunColor.value.copy(sky.light.color);
      c.uniforms.uSky.value.copy(horizon);
      c.uniforms.uFog.value.copy(horizon);
    }

    /* the sun follows the aircraft so the shadow frustum is
       always around it rather than over the departure field */
    this.sun.position.copy(sky.uniforms.uSun.value).multiplyScalar(400).add(this.carrier.position);
    this.sun.target.position.copy(this.carrier.position);

    /* airport lighting comes on when the sun goes down */
    const night = sky.uniforms.uNight.value;
    this.ac.materials.skin.emissiveIntensity = night * 0.85;
  }

  _camera(dt, time) {
    const fm = this.fm;
    const v = this.view;
    this._viewT = Math.min(1, (this._viewT ?? 1) + dt * 1.6);

    /* Vibration: on the ground it comes from the runway surface
       and scales with speed; in the air it comes from turbulence
       and thrust. Both are small — the point is that the frame is
       never perfectly still while the aircraft is working. */
    const shakeAmp = fm.turbulence * (v === 'pilot' ? 0.010 : 0.006);
    this.shake.set(
      (Math.sin(time * 37.1) + Math.sin(time * 23.3)) * shakeAmp,
      (Math.sin(time * 41.7) + Math.sin(time * 19.1)) * shakeAmp,
      Math.sin(time * 29.3) * shakeAmp * 0.5
    );

    if (v === 'chase' || v === 'wing') {
      const L = this.ac.L;
      const local = v === 'chase'
        ? new THREE.Vector3(L * 0.30, L * 0.14, L * 0.80)
        : new THREE.Vector3(this.ac.semi * 0.10, this.ac.geo.fuseH * 0.25, -L * 0.03);
      const look = v === 'chase'
        ? new THREE.Vector3(0, 0, -L * 0.10)
        : new THREE.Vector3(this.ac.semi * 0.95, -this.ac.semi * 0.06, this.ac.L * 0.06);

      const wp = local.clone().applyMatrix4(this.carrier.matrixWorld);
      const wl = look.clone().applyMatrix4(this.carrier.matrixWorld);
      this._look = this._look || wl.clone();
      if (this._snap) { this.camera.position.copy(wp); this._look.copy(wl); this._snap = false; }
      else {
        this.camera.position.lerp(wp, 1 - Math.exp(-6 * dt));
        this._look.lerp(wl, 1 - Math.exp(-6 * dt));
      }
      this.camera.lookAt(this._look);
      this.camera.fov = damp(this.camera.fov, v === 'chase' ? 46 : 62, 5, dt);
      this.camera.updateProjectionMatrix();
      this.grade.dof = 0;
      this.grade.vignette = 0.30;
      return;
    }

    const cfg = this.deck.views[v] || this.deck.views.pilot;
    const eye = new THREE.Vector3(...cfg.pos);
    const look = new THREE.Vector3(...cfg.look);

    /* the pilot's head moves a little with the pointer, which is
       what makes a fixed seat feel like a seat */
    if (!env.reduced && v === 'pilot') {
      eye.x += pointer.sx * 0.075;
      eye.y += pointer.sy * 0.045;
      look.x += pointer.sx * 0.85;
      look.y += pointer.sy * 0.60;
    }
    eye.add(this.shake);

    this.deck.group.localToWorld(eye);
    this.deck.group.localToWorld(look);
    /* The first frame in a view snaps. Interpolating from
       wherever the camera happened to be — which after a stage
       change is the world origin, eighty metres behind the
       aircraft — spends the first second of every arrival
       flying up the runway backwards. */
    const k = this._viewT < 1 ? 6 : 14;
    this._look = this._look || look.clone();
    if (this._snap) {
      this.camera.position.copy(eye);
      this._look.copy(look);
      this._snap = false;
    } else {
      this.camera.position.lerp(eye, 1 - Math.exp(-k * dt));
      this._look.lerp(look, 1 - Math.exp(-k * dt));
    }
    this.camera.lookAt(this._look);
    this.camera.fov = damp(this.camera.fov, cfg.fov, 5, dt);
    this.camera.updateProjectionMatrix();

    this.grade.dof = v === 'pilot' ? 0 : 0.35;
    this.grade.focus = 0.7;
    this.grade.range = 2.4;
    this.grade.vignette = v === 'pilot' ? 0.42 : 0.32;
  }

  _screens(dt) {
    this._acc = (this._acc || 0) + dt;
    if (this._acc < 0.05) return;
    this._acc = 0;
    const fm = this.fm;
    this.screens.pfdL.draw(fm);
    this.screens.pfdR.draw(fm);
    this.screens.ndL.push(fm);
    this.screens.ndL.draw(fm, this.plan);
    this.screens.ndR.range = this.screens.ndL.range;
    this.screens.ndR.draw(fm, this.plan);
    this.screens.ewd.draw(fm);
    this.screens.sd.draw(fm);
    for (const m of this.mcdus) m.draw();
  }

  _hud() {
    const fm = this.fm;
    const set = (id, v) => { const e = $(id); if (e && e.textContent !== v) e.textContent = v; };
    set('#r-ias', String(Math.round(fm.ias)));
    set('#r-alt', fmt(Math.round(fm.altFt)));
    set('#r-hdg', pad(fm.hdgDeg, 3));
    set('#r-vs', String(Math.round(fm.vsFpm / 10) * 10));
    set('#r-n1', (fm.n1 * 100).toFixed(0));
    set('#r-flap', DETENTS[fm.detent].name);
    set('#r-gear', fm.gear > 0.9 ? 'DN' : fm.gear < 0.1 ? 'UP' : '···');
    set('#deck-phase', fm.phaseName);

    const g = $('#c-gear'); if (g) g.querySelector('b').textContent = fm.gearTarget > 0.5 ? 'DOWN' : 'UP';
    const b = $('#c-brake');
    if (b) { b.querySelector('b').textContent = fm.parkBrake ? 'ON' : 'OFF'; b.classList.toggle('pill-warn', fm.parkBrake); }
    const a = $('#c-ap');
    if (a) { a.querySelector('b').textContent = fm.ap.on ? 'ON' : 'OFF'; a.classList.toggle('on', fm.ap.on); }
    const t = $('#c-throttle');
    if (t && document.activeElement !== t) t.value = String(Math.round(fm.throttle * 100));
    const o = $('#c-throttle-o');
    if (o) o.textContent = fm.throttle < 0.03 ? 'IDLE' : fm.throttle > 0.95 ? 'TOGA' : `${Math.round(fm.throttle * 100)}%`;
    const spd = $('#c-spd'), hdg = $('#c-hdg'), alt = $('#c-altsel');
    if (spd && document.activeElement !== spd) spd.value = String(Math.round(fm.ap.spd));
    if (hdg && document.activeElement !== hdg) hdg.value = String(Math.round(fm.ap.hdg));
    if (alt && document.activeElement !== alt) alt.value = String(Math.round(fm.ap.alt));
  }

  _sound() {
    const fm = this.fm;
    const eng = audio.beds.engine, wind = audio.beds.wind;
    if (eng) eng.set(fm.n1, this.view === 'pilot' || this.view === 'mcdu' ? 0.55 : 1);
    if (wind) wind.set(fm.ias, clamp(fm.ias / 300, 0, 1) * (this.view === 'wing' ? 1 : 0.6));
  }
}
