/* ==========================================================================
   Interactions — the things the page does under the pointer.

   Every effect here writes only `transform` and `opacity`, reads layout at
   most once per pointer-enter, and rides the shared clock from motion.js.
   Anything that needs a mouse is gated on a fine pointer, and everything is
   gated on prefers-reduced-motion.
   ========================================================================== */

import { onFrame, onResize, inView, caps, damp, clamp, pointer, round, easeOut } from './motion.js';

/* ------------------------------------------------------------- magnetic -- */

const magnets = new Set();
let magnetFrame = null;

/**
 * Magnetic buttons: the element leans toward the cursor while it is near,
 * and springs back when it leaves. The rect is measured on enter — never in
 * the frame — and the whole set shares one subscription that unsubscribes
 * itself once nothing is being hovered.
 */
export function magnetic(el, { strength = 0.34, radius = 1.6, label = true } = {}) {
  if (!caps.finePointer || caps.reduced) return;

  const state = { x: 0, y: 0, tx: 0, ty: 0, rect: null, near: false };
  magnets.add(state);
  state.el = el;
  el.classList.add('is-magnetic');

  const inner = label ? el.querySelector('[data-magnet-label]') : null;

  const measure = () => { state.rect = el.getBoundingClientRect(); };

  el.addEventListener('pointerenter', () => {
    measure();
    state.near = true;
    ensureFrame();
  });

  el.addEventListener('pointermove', (e) => {
    if (!state.rect) measure();
    const r = state.rect;
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > radius) { state.tx = 0; state.ty = 0; return; }
    state.tx = dx * strength * (r.width / 2);
    state.ty = dy * strength * (r.height / 2);
  });

  el.addEventListener('pointerleave', () => {
    state.near = false;
    state.tx = 0;
    state.ty = 0;
  });

  state.apply = (dt) => {
    state.x = damp(state.x, state.tx, 14, dt);
    state.y = damp(state.y, state.ty, 14, dt);
    const settled = Math.abs(state.x - state.tx) < 0.05 && Math.abs(state.y - state.ty) < 0.05;
    if (settled && !state.near) {
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
      if (inner) inner.style.removeProperty('transform');
      return false;
    }
    el.style.setProperty('--mx', `${round(state.x, 2)}px`);
    el.style.setProperty('--my', `${round(state.y, 2)}px`);
    // The label trails the button a little, which reads as weight.
    if (inner) inner.style.transform = `translate3d(${round(state.x * 0.32, 2)}px, ${round(state.y * 0.32, 2)}px, 0)`;
    return true;
  };

  onResize(() => { state.rect = null; });
  ensureFrame();
}

function ensureFrame() {
  if (magnetFrame) return;
  magnetFrame = onFrame((dt) => {
    let busy = false;
    for (const state of magnets) {
      if (!state.el.isConnected) { magnets.delete(state); continue; }
      if (state.apply(dt)) busy = true;
    }
    if (!busy) { magnetFrame(); magnetFrame = null; }
  });
}

/** Binds every `[data-magnetic]` in a subtree that is not already bound. */
export function magneticAll(root = document) {
  for (const el of root.querySelectorAll('[data-magnetic]:not([data-magnetic-bound])')) {
    el.dataset.magneticBound = '';
    magnetic(el, { strength: Number(el.dataset.magnetic) || 0.34 });
  }
}

/* --------------------------------------------------------------- ripple -- */

/**
 * Click ripple, delegated from the document so it costs one listener no
 * matter how many buttons exist — including ones rendered later.
 */
export function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const host = e.target.closest('.btn, .choice, .slot, .cal-day, .sidebar-link, [data-ripple]');
    if (!host || host.disabled || caps.reduced) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ink = document.createElement('span');
    ink.className = 'ripple-ink';
    ink.style.width = `${size}px`;
    ink.style.height = `${size}px`;
    ink.style.left = `${e.clientX - rect.left - size / 2}px`;
    ink.style.top = `${e.clientY - rect.top - size / 2}px`;
    host.append(ink);
    ink.addEventListener('animationend', () => ink.remove(), { once: true });
    setTimeout(() => ink.remove(), 900);
  }, { passive: true });
}

/* ---------------------------------------------------------- cursor glow -- */

/**
 * A soft light that follows the mouse, brightening over anything
 * interactive. Desktop only, and skipped entirely on modest hardware —
 * it is decoration, and decoration should never be what drops a frame.
 */
export function initCursorGlow() {
  if (!caps.rich) return () => {};

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.append(glow);

  let scale = 1;
  let target = 1;

  document.addEventListener('pointerover', (e) => {
    target = e.target.closest('a, button, .choice, .slot, input, textarea, select, .gallery-item')
      ? 1.85 : 1;
  }, { passive: true });

  document.addEventListener('pointerleave', () => { target = 0; }, { passive: true });
  document.addEventListener('pointerenter', () => { target = 1; }, { passive: true });

  return onFrame((dt) => {
    scale = damp(scale, target, 10, dt);
    glow.style.transform =
      `translate3d(${round(pointer.smoothX, 1)}px, ${round(pointer.smoothY, 1)}px, 0) `
      + `translate(-50%, -50%) scale(${round(scale, 3)})`;
    glow.style.opacity = pointer.active ? round(clamp(scale, 0, 1), 3) : 0;
  });
}

/* ----------------------------------------------------------------- tilt -- */

/** Card tilt toward the cursor. Cheap: two CSS variables, no layout reads
 *  after the pointer enters. */
export function tilt(el, { max = 7, glare = true } = {}) {
  if (!caps.finePointer || caps.reduced) return;

  let rect = null;
  let rx = 0; let ry = 0; let trx = 0; let tRy = 0; let gx = 50; let gy = 50;
  let stop = null;

  el.classList.add('is-tiltable');

  el.addEventListener('pointerenter', () => {
    rect = el.getBoundingClientRect();
    if (stop) return;
    stop = onFrame((dt) => {
      rx = damp(rx, trx, 13, dt);
      ry = damp(ry, tRy, 13, dt);
      el.style.setProperty('--rx', `${round(rx, 2)}deg`);
      el.style.setProperty('--ry', `${round(ry, 2)}deg`);
      if (glare) {
        el.style.setProperty('--gx', `${round(gx, 1)}%`);
        el.style.setProperty('--gy', `${round(gy, 1)}%`);
      }
      if (Math.abs(rx - trx) < 0.01 && Math.abs(ry - tRy) < 0.01 && trx === 0 && tRy === 0) {
        el.style.removeProperty('--rx');
        el.style.removeProperty('--ry');
        stop();
        stop = null;
      }
    });
  });

  el.addEventListener('pointermove', (e) => {
    if (!rect) rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    tRy = (px - 0.5) * 2 * max;
    trx = -(py - 0.5) * 2 * max;
    gx = px * 100;
    gy = py * 100;
  });

  el.addEventListener('pointerleave', () => { trx = 0; tRy = 0; });
  onResize(() => { rect = null; });
}

export function tiltAll(root = document) {
  for (const el of root.querySelectorAll('[data-tilt]:not([data-tilt-bound])')) {
    el.dataset.tiltBound = '';
    tilt(el, { max: Number(el.dataset.tilt) || 7 });
  }
}

/* ------------------------------------------------------------ text split */

/**
 * Splits text into per-word spans for a masked reveal. The original string
 * is kept as the element's accessible name and the pieces are hidden from
 * assistive tech, so a screen reader hears one sentence rather than
 * twenty-three fragments.
 */
export function splitWords(el, { lines = false } = {}) {
  if (el.dataset.split) return el;
  const text = el.textContent.trim();
  if (!text) return el;

  el.dataset.split = '';
  el.setAttribute('aria-label', text);

  const frag = document.createDocumentFragment();
  const chunks = lines ? text.split(/\n+/) : text.split(/\s+/);

  chunks.forEach((chunk, i) => {
    const word = document.createElement('span');
    word.className = 'word';
    word.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.className = 'word-in';
    inner.style.setProperty('--i', String(i));
    inner.textContent = chunk;
    word.append(inner);
    frag.append(word);
    if (!lines && i < chunks.length - 1) frag.append(document.createTextNode(' '));
  });

  el.textContent = '';
  el.append(frag);
  return el;
}

/** Splits and reveals every `[data-split]` as it scrolls into view. */
export function splitAll(root = document) {
  for (const el of root.querySelectorAll('[data-split]:not([data-split-bound])')) {
    el.dataset.splitBound = '';
    splitWords(el);
    el.classList.add('split-text');
    inView(el, (visible) => { if (visible) el.classList.add('is-in'); }, { once: true });
  }
}

/* -------------------------------------------------------------- count up */

/** Counts a number up when it arrives. Keeps any prefix or suffix in the
 *  original text ("12k+", "4.9", "22 years") intact. */
export function countUp(el) {
  const raw = el.textContent.trim();
  const match = raw.match(/^([^\d-]*)(-?[\d.,]+)(.*)$/);
  if (!match) return;

  const [, prefix, numberText, suffix] = match;
  const decimals = (numberText.split('.')[1] || '').length;
  const target = Number(numberText.replace(/,/g, ''));
  if (!Number.isFinite(target)) return;

  el.textContent = `${prefix}${(0).toFixed(decimals)}${suffix}`;

  inView(el, (visible) => {
    if (!visible) return;
    if (caps.reduced) { el.textContent = raw; return; }
    let t = 0;
    const stop = onFrame((dt) => {
      t = Math.min(1, t + dt / 1.5);
      const value = target * easeOut(t);
      el.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
      if (t >= 1) { el.textContent = raw; stop(); }
    });
  }, { once: true });
}

export function countAll(root = document) {
  for (const el of root.querySelectorAll('[data-count]:not([data-count-bound])')) {
    el.dataset.countBound = '';
    countUp(el);
  }
}

/* -------------------------------------------------------------- marquee -- */

/**
 * A seamless scrolling row. The track is duplicated once and translated by
 * exactly half its width, so the wrap is invisible. It slows to a stop under
 * the pointer instead of freezing, and only runs while on screen.
 */
export function marquee(el, { speed = 34, direction = -1 } = {}) {
  const track = el.querySelector('[data-marquee-track]');
  if (!track || track.dataset.marqueeBound) return;
  track.dataset.marqueeBound = '';

  const originals = [...track.children];
  if (!originals.length) return;

  for (const child of originals) {
    const copy = child.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    for (const focusable of copy.querySelectorAll('a, button')) focusable.tabIndex = -1;
    track.append(copy);
  }

  let width = track.scrollWidth / 2;
  let offset = 0;
  let rate = 1;
  let visible = false;

  onResize(() => { width = track.scrollWidth / 2; });
  inView(el, (isVisible) => { visible = isVisible; });

  el.addEventListener('pointerenter', () => { rate = 0; });
  el.addEventListener('pointerleave', () => { rate = 1; });
  el.addEventListener('focusin', () => { rate = 0; });
  el.addEventListener('focusout', () => { rate = 1; });

  if (caps.reduced) return;

  let current = 1;
  onFrame((dt) => {
    if (!visible || !width) return;
    current = damp(current, rate, 6, dt);
    offset += direction * speed * current * dt;
    if (offset <= -width) offset += width;
    if (offset >= 0) offset -= width;
    track.style.transform = `translate3d(${round(offset, 2)}px, 0, 0)`;
  });
}

export function marqueeAll(root = document) {
  for (const el of root.querySelectorAll('[data-marquee]')) {
    marquee(el, { speed: Number(el.dataset.marquee) || 34 });
  }
}

/* -------------------------------------------------------- bind them all -- */

/** One call after any render. Every binder is idempotent. */
export function bindInteractions(root = document) {
  magneticAll(root);
  tiltAll(root);
  splitAll(root);
  countAll(root);
  marqueeAll(root);
}
