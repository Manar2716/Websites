/* ═══════════════════════════════════════════════════════════════════
   core.js — one clock for the whole deck.

   Same contract as the rest of this repository: a single
   requestAnimationFrame loop, handlers that only park numbers, and
   nothing animated except transform and opacity. The loop stops when
   the tab is hidden, because a keynote left open on a second desktop
   should not be burning a presenter's battery.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var U = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp:  function (a, b, t) { return a + (b - a) * t; },
    /* Frame-rate independent smoothing. The exponential form is what
       makes the phone's travel feel identical on a 60 Hz projector and
       a 120 Hz laptop panel — a plain lerp per frame does not. */
    damp:  function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    norm:  function (v, i0, i1) { return U.clamp((v - i0) / (i1 - i0 || 1), 0, 1); },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    round: function (v, p) { var m = Math.pow(10, p || 0); return Math.round(v * m) / m; }
  };

  var subs = [], last = 0, running = false;

  function frame(now) {
    var dt = last ? (now - last) / 1000 : 0.016;
    last = now;
    /* A backgrounded tab returns an enormous dt on the way back;
       clamping it stops the phone springing across the stage. */
    if (dt > 0.1) dt = 0.1;

    for (var i = 0; i < subs.length; i++) {
      if (subs[i].active) subs[i].fn(dt, now);
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
    running = true; last = 0;
    global.requestAnimationFrame(frame);
  }

  global.document.addEventListener('visibilitychange', function () {
    if (global.document.hidden) { running = false; }
    else { start(); }
  });

  /* A tiny promise-free scheduler used for the timed sub-beats inside
     a cinematic reveal (the cold open, the lens call-outs). Every
     pending timer is cancellable, so jumping backwards through the
     deck never leaves a stale reveal about to fire. */
  function Timers() {
    var ids = [];
    return {
      after: function (ms, fn) {
        if (reduced) { fn(); return; }
        ids.push(global.setTimeout(fn, ms));
      },
      clear: function () {
        for (var i = 0; i < ids.length; i++) global.clearTimeout(ids[i]);
        ids.length = 0;
      }
    };
  }

  global.KN = { U: U, add: add, start: start, reduced: reduced, Timers: Timers };
})(window);
