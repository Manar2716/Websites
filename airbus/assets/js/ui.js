/* ═══════════════════════════════════════════════════════════
   ui.js — the chrome: cursor, navigation, panels, counters,
   the boot sequence, and the split-text reveals.

   All of it is driven from the shared frame loop rather than
   from its own timers, so a hover, a magnet pull and a camera
   move are all computed against the same delta and stay in step.
   ═══════════════════════════════════════════════════════════ */

import { loop, bus, pointer, damp, clamp, lerp, env, easeOutExpo, fmt } from './core.js';
import { audio } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ── cursor ──────────────────────────────────────────────── */

class Cursor {
  constructor() {
    this.el = $('#cursor');
    this.label = $('#cursor em');
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.enabled = !env.touch;
    if (!this.enabled) { this.el.style.display = 'none'; return; }

    loop.add((dt) => {
      /* The dot leads and the ring lags, which is the whole
         trick: one number, two rates. */
      this.x = damp(this.x, pointer.px, 22, dt);
      this.y = damp(this.y, pointer.py, 22, dt);
      this.el.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
    }, 60);

    document.addEventListener('pointerdown', () => document.body.classList.add('cursor-down'));
    document.addEventListener('pointerup', () => document.body.classList.remove('cursor-down'));
  }

  hot(text = '') {
    if (!this.enabled) return;
    document.body.classList.add('cursor-hot');
    this.label.textContent = text;
  }
  cool() {
    if (!this.enabled) return;
    document.body.classList.remove('cursor-hot');
    this.label.textContent = '';
  }
}

export const cursor = new Cursor();

/* ── magnetic buttons ────────────────────────────────────── */

/* Elements marked `data-magnet` lean toward the pointer while it
   is near them and spring back when it leaves. The pull is
   computed from the element's own box so a wide button pulls
   further than a small one, and everything runs off the shared
   loop rather than a listener per element. */
const magnets = [];

export function magnetise(root = document) {
  for (const el of $$('[data-magnet]', root)) {
    if (el.__magnet) continue;
    el.__magnet = true;
    const m = { el, x: 0, y: 0, tx: 0, ty: 0, near: false, label: el.dataset.cursor || '' };
    magnets.push(m);

    el.addEventListener('pointerenter', () => {
      m.near = true;
      cursor.hot(m.label);
      audio.click(1.7, 0.06);
    });
    el.addEventListener('pointerleave', () => { m.near = false; cursor.cool(); });
    el.addEventListener('click', () => audio.click(1.0, 0.24));
  }
}

loop.add((dt) => {
  if (env.touch || env.reduced) return;
  for (const m of magnets) {
    if (m.near) {
      const r = m.el.getBoundingClientRect();
      if (!r.width) { m.near = false; continue; }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const pull = clamp(Math.max(r.width, r.height) / 90, 0.18, 0.42);
      m.tx = (pointer.px - cx) * pull;
      m.ty = (pointer.py - cy) * pull * 0.7;
    } else { m.tx = 0; m.ty = 0; }
    m.x = damp(m.x, m.tx, 9, dt);
    m.y = damp(m.y, m.ty, 9, dt);
    if (Math.abs(m.x) > 0.02 || Math.abs(m.y) > 0.02 || m.near) {
      m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
    } else if (m.el.style.transform) {
      m.el.style.transform = '';
    }
  }
}, 62);

/* ── split text ──────────────────────────────────────────── */

export function splitText(root = document) {
  for (const el of $$('[data-split]', root)) {
    if (el.__split) continue;
    el.__split = true;
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      const inner = document.createElement('i');
      inner.textContent = w;
      span.append(inner);
      el.append(span);
      if (i < words.length - 1) el.append(' ');
    });
  }
}

/* ── reveal on scroll ────────────────────────────────────── */

const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        if (e.target.dataset.count !== undefined) countUp(e.target);
        io.unobserve(e.target);
      }
    }, { threshold: 0.24, rootMargin: '0px 0px -8% 0px' })
  : null;

export function observe(root = document) {
  if (!io) {
    for (const el of $$('[data-split], .reveal, [data-count]', root)) el.classList.add('in');
    return;
  }
  for (const el of $$('[data-split], .reveal, [data-count]', root)) io.observe(el);
}

/* Counters ease out rather than running linearly, because a
   number that decelerates into place reads as arriving and a
   linear one reads as a spinner. */
function countUp(el) {
  const target = parseFloat(String(el.dataset.count).replace(/[^\d.\-−]/g, '').replace('−', '-'));
  const suffix = el.dataset.suffix || '';
  const neg = String(el.dataset.count).startsWith('−');
  const dec = String(el.dataset.count).includes('.') ? 1 : 0;
  if (Number.isNaN(target)) return;
  if (env.reduced) { el.textContent = (neg ? '−' : '') + fmt(Math.abs(target), dec) + suffix; return; }

  const dur = 1.5;
  let t = 0;
  const stop = loop.add((dt) => {
    t = Math.min(1, t + dt / dur);
    const v = easeOutExpo(t) * Math.abs(target);
    el.textContent = (neg ? '−' : '') + fmt(v, dec) + suffix;
    if (t >= 1) stop();
  }, 61);
}

/* ── panels and toast ────────────────────────────────────── */

export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el.__t);
  el.__t = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 400);
  }, ms);
}

export function show(sel, on = true) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (el) el.hidden = !on;
}

/* ── navigation ──────────────────────────────────────────── */

export class Nav {
  constructor(onNavigate) {
    this.el = $('#nav');
    this.buttons = $$('[data-nav]');
    this.onNavigate = onNavigate;
    for (const b of this.buttons) {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        this.onNavigate(b.dataset.nav);
        this.el.classList.remove('open');
        $('#menu').setAttribute('aria-expanded', 'false');
      });
    }
    $('#menu').addEventListener('click', () => {
      const open = this.el.classList.toggle('open');
      $('#menu').setAttribute('aria-expanded', String(open));
      audio.toggle(open);
    });
    $('#mute').addEventListener('click', () => {
      const btn = $('#mute');
      const muted = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!muted));
      btn.title = muted ? 'Sound on' : 'Sound off';
      audio.setMuted(!muted);
      if (muted) audio.chime('ok');
    });
  }

  mark(name) {
    for (const b of this.buttons) {
      if (!b.classList.contains('nav-brand')) {
        b.classList.toggle('on', b.dataset.nav === name);
      }
    }
  }
}

/* ── boot ────────────────────────────────────────────────── */

/* The loading screen is a real progress report — the stages
   register the work they are doing and it counts what has
   actually finished — but it is also on a floor, so the bar
   never sits at 100% waiting for a frame that has not come. */
export class Boot {
  constructor() {
    this.el = $('#boot');
    this.bar = $('#boot .boot-bar i');
    this.pct = $('#boot-pct');
    this.task = $('#boot-task');
    this.enter = $('#boot-enter');
    this.value = 0;
    this.shown = 0;
    this.done = false;
    loop.add((dt) => {
      this.shown = damp(this.shown, this.value, 5, dt);
      this.bar.style.right = `${(1 - this.shown) * 100}%`;
      this.pct.textContent = Math.round(this.shown * 100);
    }, 63);
  }

  step(fraction, label) {
    this.value = clamp(fraction, this.value, 1);
    if (label) this.task.textContent = label;
  }

  /* Resolves when the visitor asks to come in. Reduced motion
     skips the hold, because the point of the hold is the
     animation. */
  finish() {
    this.step(1, 'READY');
    return new Promise((resolve) => {
      const go = () => {
        if (this.done) return;
        this.done = true;
        audio.init();
        this.el.classList.add('gone');
        setTimeout(() => { this.el.hidden = true; }, 950);
        resolve();
      };
      setTimeout(() => {
        this.enter.hidden = false;
        magnetise(this.el);
        this.enter.addEventListener('click', go);
        this.enter.focus({ preventScroll: true });
      }, env.reduced ? 0 : 420);
      /* keyboard: any of the obvious keys also enters */
      const key = (e) => {
        if (['Enter', ' ', 'Escape'].includes(e.key)) { window.removeEventListener('keydown', key); go(); }
      };
      window.addEventListener('keydown', key);
    });
  }
}

/* ── frame counter ───────────────────────────────────────── */

export function perfMeter() {
  const el = $('#perf');
  if (!el) return;
  let acc = 0;
  loop.add((dt) => {
    acc += dt;
    if (acc < 0.5) return;
    acc = 0;
    el.textContent = `${Math.round(loop.fps)} FPS · ${window.innerWidth}×${window.innerHeight}`;
  }, 64);
}

/* ── component information panel ─────────────────────────── */

export class ComponentPanel {
  constructor(defs) {
    this.defs = defs;
    this.el = $('#component');
    this.name = $('#cmp-name');
    this.sub = $('#cmp-sub');
    this.body = $('#cmp-body');
    this.facts = $('#cmp-facts');
    this.action = $('#cmp-action');
    this.onAction = null;
    $('#cmp-close').addEventListener('click', () => this.close());
    this.action.addEventListener('click', () => this.onAction?.(this.current));
    magnetise(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) this.close();
    });
  }

  open(id, onAction) {
    const d = this.defs[id];
    if (!d) return;
    this.current = id;
    this.onAction = onAction;
    this.name.textContent = d.name;
    this.sub.textContent = d.sub;
    this.body.textContent = d.body;
    this.facts.innerHTML = d.facts
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    this.action.querySelector('span').textContent = d.action;
    this.el.hidden = false;
    audio.click(0.8, 0.2);
    bus.emit('panel:open', id);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    audio.click(0.7, 0.12);
    bus.emit('panel:close', this.current);
  }
}

export { $, $$, lerp };
