/* ═══════════════════════════════════════════════════════════
   core.js — one clock for the whole page.
   Every animated thing on this site subscribes to a single
   requestAnimationFrame loop. Scroll/resize/pointer handlers
   never do layout work; they only park a number. All reads
   happen once per frame, all writes after. That's the whole
   trick behind not dropping frames.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── maths ── */
  var U = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /* frame-rate independent smoothing: same feel at 60 or 240 Hz */
    damp: function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    /* remap v from [i0,i1] to [0,1], clamped */
    norm: function (v, i0, i1) { return U.clamp((v - i0) / (i1 - i0 || 1), 0, 1); },
    ease: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    round: function (v, p) { var m = Math.pow(10, p || 0); return Math.round(v * m) / m; },
    pad: function (n, len) { n = String(Math.max(0, Math.floor(n))); while (n.length < len) n = '0' + n; return n; }
  };

  /* ── the loop ── */
  var subs = [];
  var last = 0;
  var running = false;

  /* frame telemetry, surfaced in the HUD */
  var perf = { fps: 0, ms: 0, samples: [] };
  var acc = 0, frames = 0;

  function frame(now) {
    var dt = last ? (now - last) / 1000 : 0.016;
    last = now;
    /* a tab that was backgrounded returns a huge dt — clamp it so
       nothing springs across the screen on return */
    if (dt > 0.1) dt = 0.1;

    var t0 = now;

    for (var i = 0; i < subs.length; i++) {
      if (subs[i].active) subs[i].fn(dt, now);
    }

    /* fps over a 500ms window — steadier to read than instantaneous */
    frames++; acc += dt;
    if (acc >= 0.5) {
      perf.fps = Math.round(frames / acc);
      perf.ms = U.round((acc / frames) * 1000, 2);
      perf.samples.push(perf.fps);
      if (perf.samples.length > 60) perf.samples.shift();
      frames = 0; acc = 0;
    }
    perf.work = U.round(global.performance.now() - t0, 2);

    if (running) global.requestAnimationFrame(frame);
  }

  function add(fn, opts) {
    var sub = { fn: fn, active: true, name: (opts && opts.name) || '' };
    subs.push(sub);
    return sub;
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    global.requestAnimationFrame(frame);
  }

  /* pause the clock entirely when the tab is hidden — no point
     burning battery animating a page nobody is looking at */
  global.document.addEventListener('visibilitychange', function () {
    if (global.document.hidden) { running = false; }
    else { start(); }
  });

  /* ── scroll + viewport store ── */
  var S = {
    y: global.scrollY || 0,
    smooth: global.scrollY || 0,
    max: 1,
    vh: global.innerHeight,
    vw: global.innerWidth,
    dir: 1,
    velocity: 0
  };

  function measure() {
    S.vh = global.innerHeight;
    S.vw = global.innerWidth;
    S.max = Math.max(1, global.document.documentElement.scrollHeight - S.vh);
  }

  global.addEventListener('scroll', function () {
    var y = global.scrollY;
    S.dir = y > S.y ? 1 : -1;
    S.y = y;
  }, { passive: true });

  var rzT;
  global.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () {
      measure();
      resizers.forEach(function (f) { f(); });
    }, 120);
  }, { passive: true });

  var resizers = [];
  function onResize(fn) { resizers.push(fn); }

  /* smooth the raw scroll value once, centrally, so every scene
     inherits the same eased motion instead of each doing its own */
  add(function (dt) {
    var prev = S.smooth;
    S.smooth = reduced ? S.y : U.damp(S.smooth, S.y, 12, dt);
    S.velocity = (S.smooth - prev) / (dt || .016);
    S.progress = S.smooth / S.max;
  }, { name: 'scroll' });

  /* ── scene helper: progress of an element through the viewport ──
     returns 0 before the element's track starts, 1 after it ends.
     Uses the smoothed scroll value and a cached rect. */
  function track(el, opts) {
    opts = opts || {};
    var cache = { top: 0, height: 1 };
    function remeasure() {
      var r = el.getBoundingClientRect();
      cache.top = r.top + global.scrollY;
      cache.height = r.height;
    }
    remeasure();
    onResize(remeasure);
    /* late remeasure: fonts and images settle after first paint */
    global.addEventListener('load', remeasure);
    return {
      remeasure: remeasure,
      get: function () {
        var dist = cache.height - (opts.pinned === false ? 0 : S.vh);
        /* `lead` (in viewport heights) starts the track early, so a
           scene can already be moving as it enters the frame rather
           than waiting until its top hits the top of the screen */
        var start = cache.top - (opts.lead || 0) * S.vh;
        return U.clamp((S.smooth - start) / (dist || 1), 0, 1);
      },
      /* is any part of the track near the viewport? cheap cull */
      near: function (pad) {
        pad = pad == null ? S.vh : pad;
        var rel = cache.top - S.smooth;
        return rel < S.vh + pad && rel + cache.height > -pad;
      }
    };
  }

  measure();

  global.CORE = {
    U: U, S: S, perf: perf,
    add: add, start: start, onResize: onResize, track: track,
    measure: measure,
    reduced: reduced
  };
})(window);
