/* ═══════════════════════════════════════════════════════════
   core.js — the clock, the numbers, and the honest opinion
   about how much this machine can draw.

   Everything in the site runs off one requestAnimationFrame
   loop. Nothing schedules its own. Input handlers park values;
   the loop is the only place work happens, so motion feels the
   same at 60 Hz and at 240 Hz.
   ═══════════════════════════════════════════════════════════ */

/* ── numbers ─────────────────────────────────────────────── */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const saturate = (v) => clamp(v, 0, 1);
export const deg = Math.PI / 180;
export const rad2deg = 180 / Math.PI;

/* Frame-rate independent exponential approach. `rate` is roughly
   "how many e-foldings per second" — 8 is a quick snap, 1 is a
   long cinematic drift. Without the dt term the same code feels
   twice as fast on a 120 Hz panel, which is the single most
   common way smooth camera work goes wrong. */
export const damp = (current, target, rate, dt) =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

export const dampAngle = (current, target, rate, dt) => {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-rate * dt));
};

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutQuint = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

/* Deterministic value noise — used for terrain, turbulence and
   cloud placement. Seeded so the same world is generated on
   every visit and on every device. */
export function makeRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const hash2 = (x, y) => {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
};

export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, y, octaves = 4, gain = 0.5, lacunarity = 2) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(fx, fy) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity; fy *= lacunarity;
  }
  return sum / norm;
}

/* ── environment ─────────────────────────────────────────── */

const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });

export const reducedMotion = mq('(prefers-reduced-motion: reduce)');
export const coarsePointer = mq('(pointer: coarse)');

export const env = {
  get reduced() { return reducedMotion.matches; },
  get touch() { return coarsePointer.matches || navigator.maxTouchPoints > 0; },
  get mobile() { return window.innerWidth < 760; },
  get tablet() { return window.innerWidth >= 760 && window.innerWidth < 1180; }
};

/* Quality is decided once from what the device admits to, then
   nudged every second by what it actually achieves. The render
   scale is the only thing that moves at runtime: shadow maps and
   geometry detail are baked at startup because rebuilding them
   mid-flight costs more than the frames it would win back. */
export const quality = (() => {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const small = window.innerWidth < 760;

  let tier = 2;                                  /* 0 low · 1 mid · 2 high */
  if (small || mem <= 2 || cores <= 2) tier = 0;
  else if (mem <= 4 || cores <= 4 || window.innerWidth < 1180) tier = 1;

  const dprCap = tier === 2 ? 2 : tier === 1 ? 1.75 : 1.5;

  return {
    tier,
    get dpr() { return Math.min(window.devicePixelRatio || 1, dprCap); },
    scale: 1,                                    /* dynamic resolution, 0.62 … 1 */
    shadows: tier > 0,
    shadowSize: tier === 2 ? 2048 : 1024,
    bloom: tier > 0,
    grain: true,
    anisotropy: tier === 2 ? 8 : 4,
    fuselageSegments: tier === 2 ? 52 : tier === 1 ? 34 : 24,
    radialSegments: tier === 2 ? 40 : tier === 1 ? 26 : 18,
    clouds: tier === 2 ? 340 : tier === 1 ? 180 : 90,
    cityBlocks: tier === 2 ? 2600 : tier === 1 ? 1200 : 500,
    terrainRings: tier === 2 ? 7 : tier === 1 ? 6 : 5
  };
})();

/* ── the loop ────────────────────────────────────────────── */

class Loop {
  constructor() {
    this.tasks = [];
    this.running = false;
    this.last = 0;
    this.time = 0;
    this.frame = 0;
    this.fps = 60;
    this._acc = 0;
    this._frames = 0;
    this._tick = this._tick.bind(this);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  /* Lower order runs first. Simulation (0-40) updates state,
     stages (50) update their scenes, the renderer (100) draws. */
  add(fn, order = 50) {
    this.tasks.push({ fn, order });
    this.tasks.sort((a, b) => a.order - b.order);
    return () => { this.tasks = this.tasks.filter((t) => t.fn !== fn); };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }

  stop() { this.running = false; }

  _tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);

    /* A tab that was backgrounded, or a long GC pause, can hand
       back a multi-second delta. Clamping it stops the aircraft
       teleporting halfway across the terrain on the frame the
       user comes back. */
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    this.frame++;

    this._acc += dt; this._frames++;
    if (this._acc >= 0.5) {
      this.fps = this._frames / this._acc;
      this._acc = 0; this._frames = 0;
      this._adapt();
    }

    for (let i = 0; i < this.tasks.length; i++) this.tasks[i].fn(dt, this.time);
  }

  /* Dynamic resolution. Only moves in small steps and only once
     per half-second, so a single hitch does not visibly drop the
     whole image; sustained load does. */
  _adapt() {
    const q = quality;
    if (this.fps < 45 && q.scale > 0.62) q.scale = Math.max(0.62, q.scale - 0.08);
    else if (this.fps > 58 && q.scale < 1) q.scale = Math.min(1, q.scale + 0.04);
  }
}

export const loop = new Loop();

/* ── a very small event bus ──────────────────────────────── */

class Bus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.map.get(name)?.delete(fn); }
  emit(name, payload) {
    const set = this.map.get(name);
    if (set) for (const fn of Array.from(set)) fn(payload);
  }
}

export const bus = new Bus();

/* ── pointer ─────────────────────────────────────────────── */

/* One shared pointer reading. `x`/`y` are raw normalised device
   coordinates; `sx`/`sy` are damped and are what cameras should
   read, so that no two things drift at slightly different rates. */
export const pointer = {
  x: 0, y: 0, sx: 0, sy: 0, px: 0, py: 0, down: false, inside: false
};

window.addEventListener('pointermove', (e) => {
  pointer.px = e.clientX; pointer.py = e.clientY;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  pointer.inside = true;
}, { passive: true });
window.addEventListener('pointerdown', () => { pointer.down = true; }, { passive: true });
window.addEventListener('pointerup', () => { pointer.down = false; }, { passive: true });
window.addEventListener('pointerleave', () => { pointer.inside = false; }, { passive: true });

loop.add((dt) => {
  const rate = env.reduced ? 30 : 4.5;
  pointer.sx = damp(pointer.sx, pointer.inside ? pointer.x : 0, rate, dt);
  pointer.sy = damp(pointer.sy, pointer.inside ? pointer.y : 0, rate, dt);
}, 0);

/* ── formatting ──────────────────────────────────────────── */

export const pad = (n, w = 2) => String(Math.abs(Math.round(n))).padStart(w, '0');
export const fmt = (n, d = 0) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
