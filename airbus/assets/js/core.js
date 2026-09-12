/* ═══════════════════════════════════════════════════════════════════
   core.js — one clock, one scroll store, one reveal observer.

   Everything that moves on this page subscribes to a single
   requestAnimationFrame loop. Event handlers never read layout; they
   park a number and return. All reads happen once per frame, all
   writes after. That is the entire reason the page holds frame rate
   with a canvas globe, a particle sky and four parallax decks running
   at the same time.

   Note on "smooth scroll": this page does NOT hijack the wheel. Native
   scrolling stays native — trackpad inertia, keyboard paging, find-in-
   page and screen readers all behave normally. What is smoothed is a
   *derived* value (S.smooth) that the animations read instead of
   scrollY. You get the cinematic lag without taking the scrollbar away
   from the user.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var doc = global.document;
  var mqReduce = global.matchMedia('(prefers-reduced-motion: reduce)');

  /* ─────────────────────────── maths ─────────────────────────── */
  var U = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /* frame-rate independent smoothing — identical feel at 60 or 240 Hz */
    damp: function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    /* remap v from [i0,i1] into [0,1], clamped */
    norm: function (v, i0, i1) { return U.clamp((v - i0) / ((i1 - i0) || 1), 0, 1); },
    mix: function (a, b, t) { return a + (b - a) * t; },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    easeInOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    /* the one used for UI transitions — slow in, long tail out */
    easeAir: function (t) { return 1 - Math.pow(1 - t, 4); },
    round: function (v, p) { var m = Math.pow(10, p || 0); return Math.round(v * m) / m; },
    pad: function (n, len) {
      var s = String(Math.max(0, Math.floor(n)));
      while (s.length < len) s = '0' + s;
      return s;
    },
    /* 12345 -> "12 345" — thin-space grouping reads better in mono */
    group: function (n) {
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    },
    rand: function (seed) {
      /* deterministic PRNG: the sky looks the same on every reload,
         which makes visual regressions actually visible */
      var s = seed || 1;
      return function () {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    }
  };

  /* ─────────────────────────── the loop ─────────────────────────── */
  var subs = [];
  var last = 0;
  var running = false;
  var perf = { fps: 0, ms: 0 };
  var acc = 0, frames = 0;

  function frame(now) {
    var dt = last ? (now - last) / 1000 : 0.016;
    last = now;
    /* a backgrounded tab returns a huge dt — clamp it so nothing
       springs across the screen when you come back */
    if (dt > 0.1) dt = 0.1;

    updateScroll(dt);

    for (var i = 0; i < subs.length; i++) {
      if (subs[i].active) subs[i].fn(dt, now);
    }

    frames++; acc += dt;
    if (acc >= 0.5) {
      perf.fps = Math.round(frames / acc);
      perf.ms = U.round((acc / frames) * 1000, 2);
      frames = 0; acc = 0;
    }

    if (running) global.requestAnimationFrame(frame);
  }

  function add(fn, name) {
    var sub = { fn: fn, active: true, name: name || '' };
    subs.push(sub);
    return sub;
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    global.requestAnimationFrame(frame);
  }

  /* stop the clock entirely when nobody is looking */
  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden) running = false;
    else start();
  });

  /* ───────────────────── scroll + viewport store ───────────────────── */
  var S = {
    y: global.scrollY || 0,
    smooth: global.scrollY || 0,
    progress: 0,
    max: 1,
    vh: global.innerHeight,
    vw: global.innerWidth,
    dir: 1,
    velocity: 0,
    dpr: Math.min(global.devicePixelRatio || 1, 2)
  };

  function measure() {
    S.vh = global.innerHeight;
    S.vw = global.innerWidth;
    S.dpr = Math.min(global.devicePixelRatio || 1, 2);
    S.max = Math.max(1, doc.documentElement.scrollHeight - S.vh);
  }

  function updateScroll(dt) {
    var prev = S.smooth;
    /* reduced motion gets the raw value — no lag, no drift */
    S.smooth = reduced() ? S.y : U.damp(S.smooth, S.y, 9, dt);
    S.velocity = (S.smooth - prev) / (dt || 0.016);
    S.progress = U.clamp(S.smooth / S.max, 0, 1);
  }

  global.addEventListener('scroll', function () {
    var y = global.scrollY;
    S.dir = y > S.y ? 1 : (y < S.y ? -1 : S.dir);
    S.y = y;
  }, { passive: true });

  var rzT;
  global.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () {
      measure();
      for (var i = 0; i < resizeSubs.length; i++) resizeSubs[i]();
    }, 120);
  }, { passive: true });

  var resizeSubs = [];
  function onResize(fn) { resizeSubs.push(fn); }

  /* ───────────────────────── pointer store ───────────────────────── */
  /* normalised to [-1,1] from centre, damped. Used for the parallax
     tilt in the hero and the reticle. Never read during the event. */
  var P = { x: 0, y: 0, sx: 0, sy: 0, inside: false, down: false };

  global.addEventListener('pointermove', function (e) {
    P.x = (e.clientX / S.vw) * 2 - 1;
    P.y = (e.clientY / S.vh) * 2 - 1;
    P.cx = e.clientX; P.cy = e.clientY;
    P.inside = true;
  }, { passive: true });

  global.addEventListener('pointerleave', function () { P.inside = false; }, { passive: true });

  add(function (dt) {
    var t = reduced() ? 1 : 1 - Math.exp(-6 * dt);
    P.sx += (P.x - P.sx) * t;
    P.sy += (P.y - P.sy) * t;
  }, 'pointer');

  /* ──────────────────────── scroll scenes ────────────────────────
     A "scene" is an element whose progress through the viewport we
     care about. Progress 0 = the element's top hits the bottom of the
     viewport (or, for sticky tracks, the track top hits the viewport
     top); 1 = it has fully passed. Scenes cull themselves: a scene
     that is nowhere near the viewport costs one rect read per frame
     and nothing else.
     ──────────────────────────────────────────────────────────────── */
  var scenes = [];

  function scene(el, fn, opts) {
    opts = opts || {};
    var s = {
      el: el,
      fn: fn,
      mode: opts.mode || 'through',   /* 'through' | 'sticky' */
      pad: opts.pad || 0,
      p: 0,
      visible: false
    };
    scenes.push(s);
    return s;
  }

  add(function (dt, now) {
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i];
      var r = s.el.getBoundingClientRect();
      var vis = r.bottom > -S.vh * 0.5 && r.top < S.vh * 1.5;

      if (vis !== s.visible) {
        s.visible = vis;
        if (s.fn.visibility) s.fn.visibility(vis);
      }
      if (!vis) continue;

      var p;
      if (s.mode === 'sticky') {
        /* progress across the scrollable length of a sticky track */
        var travel = Math.max(1, r.height - S.vh);
        p = U.clamp(-r.top / travel, 0, 1);
      } else {
        p = U.clamp((S.vh - r.top) / (S.vh + r.height), 0, 1);
      }
      s.p = p;
      s.fn(p, r, dt, now);
    }
  }, 'scenes');

  /* ───────────────────────── reveal on enter ─────────────────────────
     One IntersectionObserver for the whole document. Elements carrying
     [data-reveal] get .is-in when they cross in; children with
     [data-stagger] receive an incremental --i so CSS can cascade them.
     Nothing here animates in JS — CSS owns the transition, this just
     flips the flag. */
  var io = null;

  function initReveal() {
    var nodes = doc.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in global)) {
      for (var i = 0; i < nodes.length; i++) nodes[i].classList.add('is-in');
      return;
    }
    io = new global.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var el = entries[i].target;
        el.classList.add('is-in');
        io.unobserve(el);
        if (el.dataset.revealFire) {
          var ev = new global.CustomEvent('reveal:' + el.dataset.revealFire);
          doc.dispatchEvent(ev);
        }
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      var kids = el.querySelectorAll('[data-stagger]');
      for (var k = 0; k < kids.length; k++) kids[k].style.setProperty('--i', k);
      io.observe(el);
    }
  }

  /* ───────────────── canvas sizing that respects DPR ───────────────── */
  function fitCanvas(cv, ctx) {
    var r = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width));
    var h = Math.max(1, Math.round(r.height));
    var d = S.dpr;
    if (cv.width !== w * d || cv.height !== h * d) {
      cv.width = w * d;
      cv.height = h * d;
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { w: w, h: h };
  }

  function reduced() { return mqReduce.matches; }
  mqReduce.addEventListener('change', function () {
    doc.documentElement.classList.toggle('reduced', mqReduce.matches);
  });
  if (mqReduce.matches) doc.documentElement.classList.add('reduced');

  measure();
  start();

  global.AX = {
    U: U, S: S, P: P, perf: perf,
    add: add, scene: scene, onResize: onResize, measure: measure,
    initReveal: initReveal, fitCanvas: fitCanvas, reduced: reduced
  };

})(window);
