/* ==========================================================================
   Motion engine — one clock for the whole page.

   Same discipline as the printer site's core.js: every animated thing
   subscribes to a single requestAnimationFrame loop. Scroll, resize and
   pointer handlers never read layout — they park a number, and all work
   happens once per frame against damped values. That is the whole trick
   behind not dropping frames, and it is why adding the twentieth effect
   costs no more listeners than the first.

   Rects are measured once and re-measured on resize, never inside the
   frame. Anything offscreen is skipped. The loop stops entirely when
   nothing is subscribed or the tab is hidden.
   ========================================================================== */

/* ------------------------------------------------------------------ maths */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent smoothing — same feel at 60 Hz or 240 Hz. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const norm = (v, i0, i1) => clamp((v - i0) / (i1 - i0 || 1), 0, 1);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;

/* --------------------------------------------------------- capabilities -- */

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const pointerQuery = matchMedia('(hover: hover) and (pointer: fine)');

export const caps = {
  reduced: motionQuery.matches,
  finePointer: pointerQuery.matches,
  /* Rough proxy for "can this device afford the expensive effects". A phone
     with four cores does not want a mouse-follow blob it cannot even use. */
  get rich() { return !caps.reduced && caps.finePointer && (navigator.hardwareConcurrency || 4) > 4; },
};

motionQuery.addEventListener('change', (e) => {
  caps.reduced = e.matches;
  document.documentElement.classList.toggle('reduced-motion', e.matches);
});
pointerQuery.addEventListener('change', (e) => { caps.finePointer = e.matches; });
document.documentElement.classList.toggle('reduced-motion', caps.reduced);

/* ------------------------------------------------------------- the loop -- */

const subs = new Set();
let running = false;
let last = 0;

function frame(now) {
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 0.016;
  last = now;

  scroll.tick(dt);
  pointer.tick(dt);

  for (const fn of subs) fn(dt, now);

  if (subs.size && !document.hidden) requestAnimationFrame(frame);
  else { running = false; last = 0; }
}

function start() {
  if (running || !subs.size || document.hidden) return;
  running = true;
  last = 0;
  requestAnimationFrame(frame);
}

/** Subscribe to the frame. Returns an unsubscribe function. */
export function onFrame(fn) {
  subs.add(fn);
  start();
  return () => subs.delete(fn);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) start();
});

/* ------------------------------------------------------------ the stores */

export const viewport = { w: innerWidth, h: innerHeight };

export const scroll = {
  y: window.scrollY,
  /** Damped copy of `y`. Effects read this so motion trails the input
   *  slightly instead of snapping, which is most of the "smooth" feel. */
  smooth: window.scrollY,
  velocity: 0,
  direction: 1,
  progress: 0,

  tick(dt) {
    const previous = this.smooth;
    this.smooth = caps.reduced ? this.y : damp(this.smooth, this.y, 12, dt);
    this.velocity = (this.smooth - previous) / (dt || 0.016);
    if (Math.abs(this.velocity) > 4) this.direction = Math.sign(this.velocity);
    const max = Math.max(1, document.documentElement.scrollHeight - viewport.h);
    this.progress = clamp(this.y / max, 0, 1);
  },
};

export const pointer = {
  x: innerWidth / 2,
  y: innerHeight / 2,
  smoothX: innerWidth / 2,
  smoothY: innerHeight / 2,
  /** −1 … 1 from the centre of the viewport, the unit most effects want. */
  nx: 0,
  ny: 0,
  active: false,

  tick(dt) {
    this.smoothX = damp(this.smoothX, this.x, 9, dt);
    this.smoothY = damp(this.smoothY, this.y, 9, dt);
    this.nx = (this.smoothX / viewport.w) * 2 - 1;
    this.ny = (this.smoothY / viewport.h) * 2 - 1;
  },
};

addEventListener('scroll', () => { scroll.y = window.scrollY; start(); }, { passive: true });

addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
  start();
}, { passive: true });

/* Resize is the only place layout is read, and it is debounced to a frame. */
let resizeQueued = false;
const resizeHandlers = new Set();

export function onResize(fn) {
  resizeHandlers.add(fn);
  return () => resizeHandlers.delete(fn);
}

addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    viewport.w = innerWidth;
    viewport.h = innerHeight;
    for (const fn of resizeHandlers) fn();
    start();
  });
}, { passive: true });

/* -------------------------------------------------------------- in view -- */

const inViewCallbacks = new WeakMap();
let inViewObserver = null;

/**
 * Calls `fn(isIntersecting, entry)` when the element enters or leaves.
 * One shared observer for the whole page rather than one per effect.
 */
export function inView(el, fn, { once = false, margin = '12% 0px' } = {}) {
  if (!('IntersectionObserver' in window)) { fn(true); return () => {}; }

  if (!inViewObserver) {
    inViewObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const entryFn = inViewCallbacks.get(entry.target);
        if (entryFn) entryFn(entry.isIntersecting, entry);
      }
    }, { rootMargin: margin, threshold: 0 });
  }

  const wrapped = (visible, entry) => {
    fn(visible, entry);
    if (visible && once) {
      inViewObserver.unobserve(el);
      inViewCallbacks.delete(el);
    }
  };

  inViewCallbacks.set(el, wrapped);
  inViewObserver.observe(el);
  return () => { inViewObserver.unobserve(el); inViewCallbacks.delete(el); };
}

/* --------------------------------------------------------------- tracks -- */

/**
 * Scroll progress for one element, 0 → 1 as it crosses the viewport.
 *
 * `from`/`to` are expressed as [elementEdge, viewportEdge] pairs in viewport
 * heights: the default runs from "the element's top hits the bottom of the
 * screen" to "its bottom hits the top". The callback receives an eased and a
 * raw value and runs only while the element is on screen.
 */
export function track(el, onProgress, { from = 0, to = 1, damped = true } = {}) {
  let top = 0;
  let height = 0;
  let visible = false;

  const measure = () => {
    const rect = el.getBoundingClientRect();
    top = rect.top + window.scrollY;
    height = rect.height;
  };

  measure();
  const offResize = onResize(measure);
  const offView = inView(el, (isVisible) => {
    visible = isVisible;
    if (isVisible) measure();
  }, { margin: '30% 0px' });

  const offFrame = onFrame(() => {
    if (!visible) return;
    const y = damped ? scroll.smooth : scroll.y;
    const span = height + viewport.h;
    const raw = norm(y + viewport.h - top, span * from, span * to);
    onProgress(easeOut(raw), raw);
  });

  return () => { offResize(); offView(); offFrame(); };
}

/**
 * Parallax. `speed` is how far the element drifts relative to the scroll,
 * as a fraction of its own travel: 0.15 is subtle, 0.4 is dramatic.
 * Writes a CSS variable rather than `transform` so the element keeps
 * whatever transform its own styles want.
 */
export function parallax(el, { speed = 0.18, axis = 'y', scale = false } = {}) {
  if (caps.reduced) return () => {};
  el.style.willChange = 'transform';

  return track(el, (_eased, raw) => {
    const shift = (raw - 0.5) * speed * 100;
    el.style.setProperty(axis === 'x' ? '--px' : '--py', `${round(shift)}%`);
    if (scale) el.style.setProperty('--pscale', round(1 + (1 - Math.abs(raw - 0.5) * 2) * 0.06, 4));
  }, { damped: true });
}

/* --------------------------------------------------------------- reveal -- */

/**
 * The reveal-on-scroll pass. Adds `is-in` when an element arrives, with a
 * stagger for anything marked as a group. Idempotent: safe to call again
 * after a render, and it only ever observes elements it has not seen.
 */
export function revealAll(root = document) {
  for (const el of root.querySelectorAll('[data-reveal]:not([data-reveal-bound])')) {
    el.dataset.revealBound = '';

    const group = el.closest('[data-stagger]');
    if (group && !group.dataset.staggerBound) {
      group.dataset.staggerBound = '';
      const step = Number(group.dataset.stagger) || 70;
      [...group.children].forEach((child, i) => {
        // Capped so a long list does not leave the last card seconds behind.
        child.style.setProperty('--delay', `${Math.min(i, 9) * step}ms`);
      });
    }

    inView(el, (visible) => { if (visible) el.classList.add('is-in'); }, { once: true });
  }
}

/** Elements that should animate every time they come back into view. */
export function loopInView(root = document) {
  for (const el of root.querySelectorAll('[data-inview]:not([data-inview-bound])')) {
    el.dataset.inviewBound = '';
    inView(el, (visible) => el.classList.toggle('is-in', visible));
  }
}

/* ----------------------------------------------------------------- utils */

/** Waits for the next frame — useful between "insert" and "animate". */
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Runs `fn` when the browser is idle, or soon. For non-urgent decoration. */
export function whenIdle(fn, timeout = 900) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 1);
}
