/* ═══════════════════════════════════════════════════════════
   main.js — boot, routing, and the code-splitting boundary.

   Only the hero stage and its aircraft are in the first parse.
   The hangar, the flight deck and the radar globe are dynamic
   imports, fetched the first time someone asks for them, so the
   opening frame does not wait on a flight-management computer
   nobody has looked at yet.
   ═══════════════════════════════════════════════════════════ */

import { loop, bus, env, quality } from './core.js';
import { app } from './world.js';
import { audio } from './audio.js';
import { Boot, Nav, magnetise, splitText, observe, perfMeter, toast, $ } from './ui.js';
import { HeroStage } from './hero.js';

document.documentElement.classList.toggle('touch', env.touch);

const boot = new Boot();
loop.start();

/* Routes that are not stages of their own scroll to a chapter of
   the story instead, so the navigation never lies about where a
   name goes. */
const ANCHORS = { innovation: '#innovation', about: '#about', hero: '#top' };

const LAZY = {
  hangar: () => import('./hangar.js').then((m) => new m.HangarStage(app)),
  flight: () => import('./flightdeck.js').then((m) => new m.FlightStage(app)),
  radar: () => import('./radar.js').then((m) => new m.RadarStage(app))
};

const loaded = new Map();

async function ensure(name) {
  if (app.stages.has(name)) return app.stages.get(name);
  if (loaded.has(name)) return loaded.get(name);
  const p = LAZY[name]().then((stage) => { app.register(stage); return stage; });
  loaded.set(name, p);
  return p;
}

let busy = false;

async function goto(name, opts = {}) {
  if (busy) return;

  if (ANCHORS[name] && !opts.force) {
    const scrollTo = () => {
      const el = document.querySelector(ANCHORS[name]);
      el?.scrollIntoView({ behavior: env.reduced ? 'auto' : 'smooth', block: 'start' });
    };
    if (app.current?.name === 'hero') { nav.mark(name); scrollTo(); return; }
    busy = true;
    app.go('hero');
    await once('stage:entered');
    busy = false;
    nav.mark(name);
    requestAnimationFrame(scrollTo);
    return;
  }

  if (name === 'cockpit' || name === 'flight') {
    busy = true;
    nav.mark(name);
    const stage = await ensure('flight');
    stage.pending = { mode: name === 'flight' ? 'fly' : 'explore', type: opts.type };
    app.go('flight', { mode: name === 'flight' ? 'fly' : 'explore', type: opts.type, force: true });
    busy = false;
    return;
  }

  busy = true;
  nav.mark(name);
  await ensure(name);
  app.go(name, opts);
  busy = false;
}

const once = (evt) => new Promise((res) => { const off = bus.on(evt, (v) => { off(); res(v); }); });

const nav = new Nav(goto);
bus.on('nav', (name) => goto(name));
bus.on('stage:entered', (name) => {
  if (name === 'hero') window.scrollTo({ top: window.__heroScroll || 0, behavior: 'auto' });
  nav.mark(name === 'hero' ? 'hero' : name);
});
bus.on('stage:leaving', (name) => {
  if (name === 'hero') window.__heroScroll = window.scrollY;
});

/* ── first paint ─────────────────────────────────────────── */

async function start() {
  boot.step(0.10, 'COMPILING SHADERS');
  await frame();

  const hero = new HeroStage(app);
  app.register(hero);

  boot.step(0.28, 'LOFTING AIRFRAME');
  await frame();
  hero.build();
  hero.built = true;

  boot.step(0.62, 'PAINTING LIVERY');
  await frame();

  boot.step(0.80, 'BUILDING WEATHER');
  await frame();

  splitText();
  magnetise();
  observe();
  perfMeter();

  boot.step(0.94, 'WARMING PIPELINE');
  app.go('hero');
  await frame(3);

  await boot.finish();

  $('#nav').hidden = false;
  document.getElementById('story').hidden = false;
  nav.mark('hero');

  /* the room tone only starts if the visitor turned sound on */
  bus.on('audio:mute', (m) => { if (m) audio.silenceBeds(); });

  /* Keyboard routing: the number keys jump between the four
     stages, which is faster than the nav for anyone exploring. */
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const map = { '1': 'hero', '2': 'hangar', '3': 'cockpit', '4': 'flight', '5': 'radar' };
    if (map[e.key]) { e.preventDefault(); goto(map[e.key]); }
  });

  if (quality.tier === 0) {
    toast('REDUCED DETAIL — SMALL OR LOW-POWER DEVICE DETECTED', 4200);
  }
}

const frame = (n = 1) => new Promise((res) => {
  let i = 0;
  const tick = () => (++i >= n ? res() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
});

start().catch((err) => {
  console.error(err);
  boot.task.textContent = 'UNABLE TO START';
  toast('WEBGL UNAVAILABLE — THIS EXPERIENCE NEEDS HARDWARE ACCELERATION', 9000);
});

/* expose a little for debugging without a build step */
window.AIRBUS = { app, loop, goto, audio, quality };
