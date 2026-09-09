/* ═══════════════════════════════════════════════════════════
   hero.js — the opening, and the scroll film that follows it.

   One aircraft, at altitude, above a cloud deck. Scrolling does
   not move the page past the aircraft: it moves the camera
   around it, along a path of keyframes expressed in the
   aircraft's own coordinates. The aircraft is therefore never
   "left behind" by a section — the same object is still there
   at chapter six, seen from a different place.

   Scroll position comes from GSAP's ScrollTrigger, scrubbed, and
   is then damped again in the frame loop, so a trackpad flick
   arrives as a camera move rather than as a jump.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { Stage, attachSky, claimSky, sky } from './world.js';
import { makeClouds } from './scenery.js';
import { buildAircraft } from './build.js';
import { byId } from './fleet.js';
import { loop, clamp, lerp, damp, pointer, env, quality, easeInOutCubic } from './core.js';

/* Camera keyframes in aircraft-local metres, as fractions of the
   aircraft's own length and semi-span, so the same path frames an
   A220 and an A380 equally well. */
const SHOTS = [
  { t: 0.00, pos: [0.92, 0.115, 1.18], look: [0, 0.00, 0.05], fov: 42, grade: { bloom: 0.50, dof: 0.55, focus: 95, range: 130, vignette: 0.40 } },
  { t: 0.17, pos: [0.62, 0.055, -0.06], look: [0.34, -0.01, 0.10], fov: 38, grade: { bloom: 0.42, dof: 0.75, focus: 34, range: 55, vignette: 0.34 } },
  { t: 0.34, pos: [0.44, -0.045, -0.30], look: [0.26, -0.035, -0.20], fov: 34, grade: { bloom: 0.38, dof: 0.85, focus: 20, range: 34, vignette: 0.32 } },
  { t: 0.51, pos: [0.20, 0.055, -0.78], look: [0, 0.020, -0.44], fov: 40, grade: { bloom: 0.46, dof: 0.62, focus: 40, range: 70, vignette: 0.36 } },
  { t: 0.68, pos: [0.55, 0.52, 0.62], look: [0, 0, 0], fov: 44, grade: { bloom: 0.55, dof: 0.35, focus: 110, range: 180, vignette: 0.42 } },
  { t: 0.85, pos: [0.17, 0.010, 0.10], look: [0.10, 0.010, -0.34], fov: 36, grade: { bloom: 0.40, dof: 0.80, focus: 22, range: 38, vignette: 0.30 } },
  { t: 1.00, pos: [1.75, 0.40, 2.10], look: [0, 0, 0], fov: 30, grade: { bloom: 0.62, dof: 0.30, focus: 200, range: 320, vignette: 0.46 } }
];

/* The film runs from first light to dusk. Morning puts the
   sun behind the opening camera, so the aircraft is lit rather
   than a silhouette; the closing wide shot is deliberately the
   other way round. */
const HOURS = [7.5, 8.8, 10.6, 12.8, 15.2, 16.8, 18.1];

function shotAt(t) {
  t = clamp(t, 0, 1);
  let i = 0;
  while (i < SHOTS.length - 2 && t > SHOTS[i + 1].t) i++;
  const a = SHOTS[i], b = SHOTS[i + 1];
  const k = easeInOutCubic(clamp((t - a.t) / (b.t - a.t), 0, 1));
  const mix = (p, q) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)];
  return {
    pos: mix(a.pos, b.pos),
    look: mix(a.look, b.look),
    fov: lerp(a.fov, b.fov, k),
    hour: lerp(HOURS[i], HOURS[i + 1], k),
    grade: {
      bloom: lerp(a.grade.bloom, b.grade.bloom, k),
      dof: lerp(a.grade.dof, b.grade.dof, k),
      focus: lerp(a.grade.focus, b.grade.focus, k),
      range: lerp(a.grade.range, b.grade.range, k),
      vignette: lerp(a.grade.vignette, b.grade.vignette, k)
    }
  };
}

export class HeroStage extends Stage {
  constructor(app) {
    super('hero');
    this.app = app;
    this.progress = 0;
    this.smooth = 0;
    this.typeId = 'a350';
    this.readouts = {
      type: document.getElementById('hero-type'),
      alt: document.getElementById('hero-alt'),
      mach: document.getElementById('hero-mach')
    };
  }

  build() {
    attachSky(this, { hour: 7.5 });
    sky.setTime(7.5);
    this.scene.environment = sky.environment();
    this.scene.fog = new THREE.FogExp2(0xb9cfe6, 0.00018);

    const type = byId(this.typeId);
    this.ac = buildAircraft(type);
    this.ac.target.gear = 0;
    this.ac.target.n1 = 0.86;
    this.ac.target.flex = 1;
    this.ac.update(1, { instant: true });

    /* The aircraft is parented to a carrier that holds the slow
       roll and the pitch bob, so the camera rig can be attached
       to the same carrier and stay framed while the aircraft
       moves inside it. */
    this.carrier = new THREE.Group();
    this.carrier.add(this.ac.group);
    this.scene.add(this.carrier);

    this.clouds = makeClouds({
      count: Math.round(quality.clouds * 1.5), base: -1450, spread: 26000, thickness: 1500, seed: 5
    });
    this.scene.add(this.clouds.mesh);

    this.high = makeClouds({
      count: Math.round(quality.clouds * 0.35), base: 2600, spread: 44000, thickness: 700, seed: 19
    });
    this.high.uniforms.uOpacity.value = 0.55;
    this.scene.add(this.high.mesh);

    /* The sun light needs a target near the aircraft or the
       shadow frustum sits somewhere over the horizon. */
    this.sun.target.position.set(0, 0, 0);
    this.sun.position.copy(sky.uniforms.uSun.value).multiplyScalar(240);

    this.camera.near = 0.4;
    this.camera.far = 90000;
    this.lookTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this._bindScroll();
  }

  /* ScrollTrigger gives the scrubbed 0…1 for the whole story; if
     it is unavailable for any reason the same number is read
     straight off the document, so the film still plays. */
  _bindScroll() {
    const story = document.getElementById('story');
    const gsap = window.gsap, ST = window.ScrollTrigger;
    if (gsap && ST) {
      gsap.registerPlugin(ST);
      this.trigger = ST.create({
        trigger: story,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => { this.progress = self.progress; }
      });
    } else {
      this._fallback = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        this.progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      };
      window.addEventListener('scroll', this._fallback, { passive: true });
      this._fallback();
    }
  }

  enter() {
    claimSky(this);
    document.getElementById('story').hidden = false;
    if (this.readouts.type) this.readouts.type.textContent = this.ac.spec ? byId(this.typeId).name : '—';
    window.ScrollTrigger?.refresh();
  }

  exit() {
    document.getElementById('story').hidden = true;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    window.ScrollTrigger?.refresh();
  }

  update(dt, time) {
    const ac = this.ac;
    /* Damping the scrubbed value a second time is what turns a
       stepped wheel event into a dolly. */
    this.smooth = damp(this.smooth, this.progress, env.reduced ? 40 : 3.4, dt);
    const s = shotAt(this.smooth);

    /* the aircraft's own slow life: a long roll, a slight bob,
       and the wing flexing as it works */
    const roll = Math.sin(time * 0.11) * 0.035 + Math.sin(time * 0.043) * 0.02;
    const pitch = Math.sin(time * 0.077) * 0.012;
    this.carrier.rotation.set(pitch, 0, roll);
    this.carrier.position.y = Math.sin(time * 0.19) * 1.1;
    ac.target.flex = 0.7 + Math.sin(time * 0.23) * 0.3;
    ac.target.aileron = roll * 3.4;
    ac.update(dt);

    /* the world sliding past is what says "this is flying" */
    this.clouds.follow(0, -time * 168, 0);
    this.high.follow(0, -time * 54, 0);

    const L = ac.L, semi = ac.semi;
    const px = s.pos[0] * semi, py = s.pos[1] * L, pz = s.pos[2] * L;
    const lx = s.look[0] * semi, ly = s.look[1] * L, lz = s.look[2] * L;

    /* mouse parallax, scaled by how close the shot already is */
    const near = clamp(1 - (Math.hypot(px, py, pz) / (L * 1.2)), 0, 1);
    const par = env.reduced ? 0 : (1 - near * 0.55);
    this.camPos.set(
      px + pointer.sx * L * 0.035 * par,
      py + pointer.sy * L * 0.022 * par,
      pz
    );
    this.carrier.localToWorld(this.camPos);
    this.camera.position.copy(this.camPos);

    this.lookTarget.set(lx, ly, lz);
    this.carrier.localToWorld(this.lookTarget);
    this.camera.lookAt(this.lookTarget);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();

    sky.setTime(s.hour);
    this.sun.position.copy(sky.uniforms.uSun.value).multiplyScalar(240);
    for (const c of [this.clouds, this.high]) {
      c.uniforms.uSun.value.copy(sky.uniforms.uSun.value);
      c.uniforms.uSunColor.value.copy(sky.light.color);
      c.uniforms.uSky.value.copy(sky.uniforms.uHorizon.value);
      c.uniforms.uFog.value.copy(sky.uniforms.uHorizon.value);
    }
    this.scene.fog.color.copy(sky.uniforms.uHorizon.value);

    Object.assign(this.grade, s.grade, { exposure: 1 });

    /* live readouts, which should read as instruments rather
       than as decoration */
    if (this.readouts.alt) {
      const fl = Math.round((410 - this.smooth * 60 + Math.sin(time * 0.4) * 0.6));
      this.readouts.alt.textContent = 'FL' + fl;
      this.readouts.mach.textContent = (0.85 - this.smooth * 0.04 + Math.sin(time * 0.6) * 0.002).toFixed(3);
    }
  }

  /* Used by the transition into the hangar: the camera pulls
     back and the exposure lifts before the wipe. */
  prepareExit() {
    this.grade.exposure = 1.5;
    this.grade.bloom = 0.8;
  }
}
