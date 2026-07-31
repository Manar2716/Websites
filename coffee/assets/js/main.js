/* ═══════════════════════════════════════════════════════════
   main.js — boot, the scroll store, one clock, and the overlay.

   The rules are the same as everywhere else in this repository:
   scroll and resize handlers park a number and return. All reads
   happen once per frame, all writes after. Nothing here touches
   layout inside the loop.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var NOC = global.NOC;
  var M = NOC.M;
  var doc = document, root = doc.documentElement;

  /* ── capability tiers ────────────────────────────────────────
     Measured off the device, then adjusted at runtime by the
     frame timer. The counts below are the only thing that
     separates a phone from a workstation — the film is the same
     film, it is just drawn with fewer beans. */

  function detectTier() {
    var dpr = global.devicePixelRatio || 1;
    var cores = global.navigator.hardwareConcurrency || 4;
    var mem = global.navigator.deviceMemory || 4;
    var w = global.innerWidth;
    var coarse = global.matchMedia('(pointer: coarse)').matches;

    var score = 0;
    if (cores >= 8) score += 2; else if (cores >= 4) score += 1;
    if (mem >= 8) score += 2; else if (mem >= 4) score += 1;
    if (w >= 1280) score += 1;
    if (coarse) score -= 2;
    if (w < 700) score -= 1;

    if (score >= 4) {
      return {
        name: 'high', beans: 2600, drops: 2200, dust: 900, powder: 700,
        steamSteps: 64, steamDiv: 2, shadowSize: 1024,
        beanSegs: 18, cupSegs: 72, artSize: 512,
        maxScale: Math.min(dpr, 1.65)
      };
    }
    if (score >= 2) {
      return {
        name: 'mid', beans: 1500, drops: 1400, dust: 520, powder: 420,
        steamSteps: 44, steamDiv: 2, shadowSize: 768,
        beanSegs: 14, cupSegs: 56, artSize: 384,
        maxScale: Math.min(dpr, 1.35)
      };
    }
    return {
      name: 'low', beans: 700, drops: 800, dust: 280, powder: 240,
      steamSteps: 26, steamDiv: 3, shadowSize: 512,
      beanSegs: 11, cupSegs: 44, artSize: 256,
      maxScale: Math.min(dpr, 1.1)
    };
  }

  /* ── overlay typography ──────────────────────────────────────
     Captions do not fade and they do not slide. They condense:
     letters arrive from spread-out and slightly deep, each on its
     own delay, while a static-blur copy of the same text burns
     off behind them. On the way out they evaporate upward, which
     is the same gesture as the steam because it is the same
     moment. Only transform and opacity are written — the blur
     radius never changes, so that layer rasterises once. */

  function buildCaptions() {
    var caps = [].slice.call(doc.querySelectorAll('.cap'));
    caps.forEach(function (cap) {
      cap.__from = parseFloat(cap.dataset.from);
      cap.__to = parseFloat(cap.dataset.to);
      cap.__letters = [];
      cap.__vis = -1;

      [].slice.call(cap.querySelectorAll('[data-split]')).forEach(function (el) {
        var text = el.textContent;
        var frag = doc.createDocumentFragment();
        var n = text.length, mid = (n - 1) / 2;
        /* Letters have to be inline-blocks to be transformed one
           at a time, which also lets a line break between any two
           of them — "PICKED NINE TI / MES". Each word gets its own
           nowrap wrapper, so lines still break, but only at spaces. */
        var word = null;
        for (var i = 0; i < n; i++) {
          var ch = text[i];
          if (ch === ' ') { frag.appendChild(doc.createTextNode(' ')); word = null; continue; }
          if (!word) {
            word = doc.createElement('span');
            word.className = 'wd';
            frag.appendChild(word);
          }
          var span = doc.createElement('span');
          span.className = 'lt';
          span.textContent = ch;
          span.__off = (i - mid) / Math.max(mid, 1);
          span.__d = i / Math.max(n, 1);
          word.appendChild(span);
          cap.__letters.push(span);
        }
        el.textContent = '';
        el.appendChild(frag);

        var haze = doc.createElement('span');
        haze.className = 'haze';
        haze.setAttribute('aria-hidden', 'true');
        haze.textContent = text;
        el.appendChild(haze);
        cap.__haze = cap.__haze || [];
        cap.__haze.push(haze);
      });
    });
    return caps;
  }

  function driveCaption(cap, t) {
    var from = cap.__from, to = cap.__to;
    var lead = Math.min((to - from) * 0.34, 0.030);

    var inP = M.range(t, from, from + lead);
    var outP = M.range(t, to - lead, to);
    var live = inP > 0 && outP < 1;

    if (!live) {
      if (cap.__vis !== 0) { cap.style.opacity = '0'; cap.style.visibility = 'hidden'; cap.__vis = 0; }
      return;
    }
    if (cap.__vis !== 1) { cap.style.visibility = 'visible'; cap.__vis = 1; }

    var eIn = M.E.outQuint(inP);
    var eOut = M.E.inCubic(outP);
    cap.style.opacity = String(Math.min(inP * 1.6, 1) * (1 - outP));

    var L = cap.__letters, n = L.length;
    for (var i = 0; i < n; i++) {
      var s = L[i];
      /* per-letter delay, forward on entry and forward again on
         exit, so the line assembles and then leaves left to right */
      var a = M.sat((eIn - s.__d * 0.45) / 0.55);
      var b = M.sat((eOut - s.__d * 0.35) / 0.65);
      var spread = (1 - a) * 26 * s.__off + b * 12 * s.__off;
      var rise = (1 - a) * 16 + b * -34;
      var depth = (1 - a) * -90 + b * 40;
      var rx = (1 - a) * 34 - b * 22;
      s.style.opacity = String(a * (1 - b));
      s.style.transform = 'translate3d(' + spread.toFixed(2) + 'px,' + rise.toFixed(2) + 'px,' +
        depth.toFixed(1) + 'px) rotateX(' + rx.toFixed(2) + 'deg)';
    }

    if (cap.__haze) {
      var h = (1 - eIn) * 0.85 + eOut * 0.7;
      var hy = (1 - eIn) * 10 - eOut * 26;
      for (var j = 0; j < cap.__haze.length; j++) {
        cap.__haze[j].style.opacity = String(h);
        cap.__haze[j].style.transform = 'translate3d(0,' + hy.toFixed(2) + 'px,0) scale(' + (1 + (1 - eIn) * 0.06 + eOut * 0.10).toFixed(3) + ')';
      }
    }
  }

  /* ── boot ────────────────────────────────────────────────── */

  function boot() {
    var canvas = doc.getElementById('gl');
    var film = doc.getElementById('film');
    var bootEl = doc.getElementById('boot');
    if (!canvas || !film) return;

    var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var tier = detectTier();
    var debug = /[?&]debug/.test(global.location.search);

    var stage = new NOC.Stage(canvas, tier);
    if (!stage.ok) {
      root.classList.add('no-gl');
      root.classList.remove('is-booting');
      if (bootEl) bootEl.remove();
      if (debug && stage.error) console.error(stage.error);
      return;
    }
    root.classList.add('has-gl');

    var timeline = new NOC.Timeline(stage, reduced);
    var caps = buildCaptions();
    var rail = [].slice.call(doc.querySelectorAll('.rail__act'));

    /* ── the scroll store ──
       One number, written by the scroll handler, read once a frame. */
    var scrollY = global.scrollY || global.pageYOffset || 0;
    var vh = global.innerHeight;
    var filmTop = 0, filmRange = 1;
    var raw = 0, smooth = 0, prevSmooth = 0;
    var lastMove = 0;

    function measure() {
      vh = global.innerHeight;
      var box = film.getBoundingClientRect();
      filmTop = box.top + (global.scrollY || global.pageYOffset || 0);
      filmRange = Math.max(film.offsetHeight - vh, 1);
      stage.resize(global.innerWidth, vh, renderScale);
    }

    var renderScale = tier.maxScale;
    var scaleTarget = renderScale;

    global.addEventListener('scroll', function () {
      scrollY = global.scrollY || global.pageYOffset || 0;
      lastMove = perfNow();
    }, { passive: true });

    var resizeTimer = 0;
    global.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 120);
    }, { passive: true });

    function perfNow() { return global.performance ? global.performance.now() : Date.now(); }

    /* ── frame budget ──
       The measured average, not a target. If the machine cannot
       hold the frame, resolution comes down before anything else
       does — a slightly softer image at rate beats a sharp one
       that stutters. */
    var emaMs = 16.7, lastScaleChange = 0, frames = 0, fpsAcc = 0, fps = 0;

    var last = 0, running = true;

    function frame(now) {
      if (!running) return;
      global.requestAnimationFrame(frame);

      var dt = last ? (now - last) / 1000 : 0.016;
      last = now;
      if (dt > 0.1) dt = 0.1;      /* returning from a background tab */

      var t0 = perfNow();

      raw = M.sat((scrollY - filmTop) / filmRange);

      /* damped scroll: the film moves at its own pace, so a
         flicked trackpad does not jump three acts */
      smooth = reduced ? raw : M.damp(smooth, raw, 8.5, dt);
      var vel = (smooth - prevSmooth) / Math.max(dt, 1e-4);
      prevSmooth = smooth;

      /* with reduced motion the wall clock is frozen: the film
         still answers the scroll, but nothing moves on its own */
      timeline.update(smooth, reduced ? Math.min(dt, 1 / 60) : dt, reduced ? 0 : vel);
      if (reduced) timeline.T = 0;

      stage.render(dt);

      for (var i = 0; i < caps.length; i++) driveCaption(caps[i], smooth);

      var act = 0;
      for (var a = 0; a < rail.length; a++) {
        var f = parseFloat(rail[a].dataset.from);
        if (smooth >= f) act = a;
      }
      if (act !== frame.__act) {
        frame.__act = act;
        for (var b = 0; b < rail.length; b++) rail[b].classList.toggle('is-on', b === act);
      }

      /* ── telemetry and adaptive scale ── */
      var ms = perfNow() - t0;
      emaMs = emaMs * 0.94 + ms * 0.06;
      frames++; fpsAcc += dt;
      if (fpsAcc >= 0.5) { fps = Math.round(frames / fpsAcc); frames = 0; fpsAcc = 0; if (hud) writeHud(); }

      if (now - lastScaleChange > 1400) {
        if (emaMs > 19 && scaleTarget > 0.58) { scaleTarget = Math.max(0.58, scaleTarget - 0.12); lastScaleChange = now; }
        else if (emaMs < 9.5 && scaleTarget < tier.maxScale) { scaleTarget = Math.min(tier.maxScale, scaleTarget + 0.08); lastScaleChange = now; }
        if (Math.abs(scaleTarget - renderScale) > 0.02) {
          renderScale = scaleTarget;
          stage.resize(global.innerWidth, global.innerHeight, renderScale);
        }
      }
    }

    /* ── optional readout, on ?debug ── */
    var hud = null;
    function writeHud() {
      hud.textContent = tier.name + ' · ' + fps + ' fps · ' + emaMs.toFixed(1) + ' ms · ' +
        (renderScale).toFixed(2) + '× · ' + stage.beans.packed + ' beans · ' + stage.partCount + ' parts';
    }
    if (debug) {
      hud = doc.createElement('div');
      hud.className = 'hud mono';
      doc.body.appendChild(hud);
      /* handles for poking at the film from a console — gated, so
         the normal page exposes nothing on window but NOC */
      global.__film = {
        stage: stage, timeline: timeline, tier: tier,
        scroll: function () {
          return { raw: raw, smooth: smooth, filmTop: filmTop, filmRange: filmRange, y: scrollY, vh: vh };
        },
        seek: function (target) {
          global.scrollTo(0, filmTop + filmRange * target);
        },
        /* Jump the damped value straight to a mark and run the
           simulation forward in fixed steps. Screenshots and frame
           grabs then land on an exact t with the physics settled,
           instead of wherever the machine happened to get to in
           the wall-clock time it was given. */
        settle: function (target, steps) {
          if (target !== undefined) { raw = smooth = prevSmooth = M.sat(target); }
          /* the camera matrices have to advance with the sim: the
             letterform cloud is placed relative to the view, so a
             frozen view matrix settles the droplets into a wordmark
             hung in front of where the camera used to be */
          for (var i = 0; i < (steps || 120); i++) {
            timeline.update(smooth, 1 / 60, 0);
            stage.updateCamera();
          }
          stage.render(1 / 60);
          for (var c = 0; c < caps.length; c++) driveCaption(caps[c], smooth);
        }
      };
    }

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { running = false; }
      else if (!running) { running = true; last = 0; global.requestAnimationFrame(frame); }
    });

    measure();
    /* fonts change nothing in WebGL but they change the caption
       metrics, so remeasure once they land */
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);

    /* prime the physics so the first painted frame is already the
       film rather than a cloud of beans falling into place */
    raw = M.sat((scrollY - filmTop) / filmRange);
    smooth = raw; prevSmooth = raw;
    for (var w = 0; w < 90; w++) timeline.update(smooth, 1 / 60, 0);
    stage.render(1 / 60);

    global.requestAnimationFrame(frame);

    root.classList.remove('is-booting');
    if (bootEl) {
      bootEl.classList.add('is-done');
      setTimeout(function () { bootEl.remove(); }, 1400);
    }

    /* the scroll hint retires the moment it is obeyed */
    var hint = doc.querySelector('.hint');
    if (hint) {
      global.addEventListener('scroll', function once() {
        hint.classList.add('is-gone');
        global.removeEventListener('scroll', once);
      }, { passive: true, once: true });
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
