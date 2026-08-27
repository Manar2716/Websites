/* ═══════════════════════════════════════════════════════════
   core.js — the clock, the scroll store, the reveal registry.

   Same rules the rest of this repository runs on:

     · scroll / pointer / resize handlers park a number and
       return. They never read layout.
     · every element offset is measured once — on load, on
       resize — into a table the loop reads from.
     · one requestAnimationFrame drives everything, and it
       parks itself when nothing on screen is moving.
     · only transform, opacity and custom properties are
       written.

   Nothing in here is needed to read the page. With scripting
   off none of it runs, and the document is the same words in
   one column.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = (global.AUREL = global.AUREL || {});
  var doc = global.document, root = doc.documentElement;

  /* ── reduced motion ──────────────────────────────────────
     Read once and watched, because a person can flip the OS
     setting with the page already open. Motion is a data
     attribute rather than a class so CSS can gate on it
     without competing with the state classes. */
  var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mq.matches;
  root.setAttribute('data-motion', reduced ? 'off' : 'on');
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function (e) {
    reduced = e.matches;
    root.setAttribute('data-motion', reduced ? 'off' : 'on');
  });

  /* ── maths ───────────────────────────────────────────── */
  var U = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp:  function (a, b, t) { return a + (b - a) * t; },
    /* frame-rate independent smoothing: identical feel at 60 or 240 Hz */
    damp:  function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    /* remap v from [i0,i1] into [0,1], clamped */
    norm:  function (v, i0, i1) { return U.clamp((v - i0) / (i1 - i0 || 1), 0, 1); },
    /* the one easing this site uses for entrances — a long tail,
       no overshoot. Overshoot is what makes motion read as cheap. */
    out:   function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    round: function (v, p) { var m = Math.pow(10, p || 0); return Math.round(v * m) / m; },
    pad:   function (n) { n = String(Math.max(0, Math.floor(n))); return n.length < 2 ? '0' + n : n; }
  };

  /* ── the loop ────────────────────────────────────────── */
  var subs = [], last = 0, running = false, idle = 0;

  function frame(now) {
    var dt = last ? (now - last) / 1000 : 0.016;
    last = now;
    /* a backgrounded tab returns a huge dt — clamp it, or every
       damped value springs across the screen on return */
    if (dt > 0.1) dt = 0.1;

    var busy = false;
    for (var i = 0; i < subs.length; i++) {
      if (!subs[i].active) continue;
      /* a subscriber returns true while it still has work */
      if (subs[i].fn(dt, now) !== false) busy = true;
    }

    /* Park after half a second of nothing moving. Restarted by
       any of the wake() calls below. A page that is being read
       rather than scrolled should not be burning a frame. */
    idle = busy ? 0 : idle + dt;
    if (idle > 0.5) { running = false; last = 0; return; }
    global.requestAnimationFrame(frame);
  }

  function wake() {
    idle = 0;
    if (running) return;
    running = true; last = 0;
    global.requestAnimationFrame(frame);
  }

  function sub(fn) {
    var s = { fn: fn, active: true };
    subs.push(s);
    wake();
    return s;
  }

  /* ── scroll store ────────────────────────────────────────
     One listener for the whole page. y is the raw offset, sy
     is a damped copy — parallax reads sy so it lags the page
     very slightly, which is what makes it read as depth
     rather than as jitter. */
  var S = { y: 0, sy: 0, vh: 0, vw: 0, dir: 1, top: true };
  var tracks = [];

  function measure() {
    S.vh = global.innerHeight;
    S.vw = global.innerWidth;
    for (var i = 0; i < tracks.length; i++) tracks[i].measure();
  }

  function onScroll() {
    var y = global.scrollY || global.pageYOffset || 0;
    S.dir = y > S.y ? 1 : -1;
    S.y = y;
    S.top = y < 8;
    wake();
  }

  /* ── scroll tracks ───────────────────────────────────────
     A track is an element plus a callback that receives its
     progress through the viewport: 0 as the top edge enters,
     1 as the bottom edge leaves. Offsets are cached, so the
     loop never touches getBoundingClientRect. */
  function track(el, fn, opts) {
    opts = opts || {};
    var t = {
      el: el, top: 0, h: 0,
      measure: function () {
        var r = el.getBoundingClientRect();
        t.top = r.top + S.y;
        t.h = r.height;
      }
    };
    t.measure();
    tracks.push(t);

    var lastP = -1;
    sub(function () {
      /* cull anything more than half a viewport out of frame */
      if (t.top >= S.sy + S.vh * 1.4 || t.top + t.h <= S.sy - S.vh * 0.4) return false;
      var p = U.clamp((S.sy + S.vh - t.top) / (t.h + S.vh || 1), 0, 1);
      if (Math.abs(p - lastP) < 0.0004 && opts.always !== true) return false;
      lastP = p;
      fn(p, t);
      return true;
    });
    return t;
  }

  /* ── reveal ──────────────────────────────────────────────
     IntersectionObserver rather than the loop: entrances fire
     once and then stop costing anything. Elements are staged
     by their data-reveal index so a group arrives in reading
     order instead of all at once. */
  var io = null;

  function reveals(scope) {
    var list = (scope || doc).querySelectorAll('.reveal, [data-reveal]');
    if (!list.length) return;

    if (reduced) {
      for (var i = 0; i < list.length; i++) list[i].classList.add('is-in');
      return;
    }
    if (!io) {
      io = new global.IntersectionObserver(function (entries) {
        for (var j = 0; j < entries.length; j++) {
          if (!entries[j].isIntersecting) continue;
          var node = entries[j].target;
          var n = parseInt(node.getAttribute('data-reveal') || '0', 10);
          node.style.setProperty('--d', (n * 70) + 'ms');
          node.classList.add('is-in');
          io.unobserve(node);
        }
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
    }
    for (var k = 0; k < list.length; k++) {
      if (!list[k].classList.contains('is-in')) io.observe(list[k]);
    }
  }

  /* ── small dom helpers ───────────────────────────────── */
  function el(tag, cls, txt) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ── go ──────────────────────────────────────────────── */
  global.addEventListener('scroll', onScroll, { passive: true });
  global.addEventListener('resize', function () { measure(); wake(); }, { passive: true });
  global.addEventListener('orientationchange', function () { measure(); wake(); });

  measure(); onScroll();
  S.sy = S.y;

  /* damp the scroll copy every frame the loop is awake */
  sub(function (dt) {
    var d = S.y - S.sy;
    if (Math.abs(d) < 0.05) { S.sy = S.y; return false; }
    S.sy = U.damp(S.sy, S.y, 11, dt);
    return true;
  });

  AUREL.U = U;
  AUREL.S = S;
  AUREL.sub = sub;
  AUREL.wake = wake;
  AUREL.track = track;
  AUREL.reveals = reveals;
  AUREL.measure = measure;
  AUREL.el = el;
  AUREL.$ = $;
  AUREL.$$ = $$;
  AUREL.reduced = function () { return reduced; };
})(window);
