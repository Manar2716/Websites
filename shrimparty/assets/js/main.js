/* ═══════════════════════════════════════════════════════════
   main.js — boot, the scroll store, one clock.

   The rules the whole repository runs on:

     · scroll, pointer and resize handlers park a number and
       return; they never read layout
     · every measurement happens once, on load and on resize, into
       a table the loop reads from
     · one requestAnimationFrame drives everything, and it stops
       when the tab is hidden
     · only transform, opacity and custom properties are written

   ── on smooth scrolling ────────────────────────────────────

   The momentum scroll here drives the *real* scroll position
   rather than translating a wrapper element. Wheel and key input
   are captured, integrated into a target, and the page is eased
   toward it — so `position: sticky` still works, the scrollbar is
   still the scrollbar, anchors still land, and find-in-page still
   scrolls to the match. A transformed wrapper gets the same feel
   and breaks all four.

   It turns itself off for a coarse pointer, where the platform's
   own inertia is better than anything that can be done in JS, and
   for anyone who has asked for reduced motion.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = global.SHRIMP;
  var M = SHRIMP.M;
  var doc = document, root = doc.documentElement;

  function now() { return global.performance ? global.performance.now() : Date.now(); }

  /* ── capability tiers ────────────────────────────────────────
     Measured off the device once, then adjusted at runtime by the
     frame timer. The counts below are the only thing separating a
     phone from a workstation — it is the same film, drawn with
     fewer shrimp in it. */

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

    if (score >= 4) return {
      name: 'high',
      counts: { items: 210, particles: 2600 },
      segments: { lo: 8, md: 14, hi: 22, bucket: 72 },
      shadowSize: 1024, oceanRings: 150, oceanSpokes: 168,
      maxScale: Math.min(dpr, 1.6)
    };
    if (score >= 2) return {
      name: 'mid',
      counts: { items: 140, particles: 1500 },
      segments: { lo: 7, md: 11, hi: 16, bucket: 56 },
      shadowSize: 768, oceanRings: 110, oceanSpokes: 128,
      maxScale: Math.min(dpr, 1.3)
    };
    return {
      name: 'low',
      counts: { items: 78, particles: 700 },
      segments: { lo: 6, md: 9, hi: 12, bucket: 40 },
      shadowSize: 512, oceanRings: 74, oceanSpokes: 92,
      maxScale: Math.min(dpr, 1.05)
    };
  }

  /* ═══ momentum scroll ═══════════════════════════════════════ */

  function MomentumScroll(reduced) {
    var target = global.scrollY || 0;
    var current = target;
    var active = false;
    var enabled = !reduced && !global.matchMedia('(pointer: coarse)').matches;
    var maxY = 0;
    var touchY = 0, touchV = 0, touchLast = 0;

    function measure() {
      maxY = Math.max(0, doc.body.scrollHeight - global.innerHeight);
    }

    function clampTarget() {
      if (target < 0) target = 0;
      if (target > maxY) target = maxY;
    }

    if (enabled) {
      global.addEventListener('wheel', function (e) {
        if (e.ctrlKey) return;                 /* pinch zoom is not scroll */
        e.preventDefault();
        /* deltaMode 1 is lines, 2 is pages — Firefox uses lines */
        var d = e.deltaY * (e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? global.innerHeight : 1);
        if (!active) { current = global.scrollY; target = current; active = true; }
        target += d;
        clampTarget();
      }, { passive: false });

      global.addEventListener('keydown', function (e) {
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
        var vh = global.innerHeight, d = null;
        if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) d = vh * 0.86;
        else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) d = -vh * 0.86;
        else if (e.key === 'ArrowDown') d = 118;
        else if (e.key === 'ArrowUp') d = -118;
        else if (e.key === 'Home') { target = 0; active = true; e.preventDefault(); return; }
        else if (e.key === 'End') { target = maxY; active = true; e.preventDefault(); return; }
        if (d === null) return;
        e.preventDefault();
        if (!active) { current = global.scrollY; target = current; active = true; }
        target += d;
        clampTarget();
      });
    }

    /* Anything that is not us — the scrollbar, a trackpad
       two-finger drag on a platform that does not send wheel, an
       anchor jump — resets our target to reality rather than
       fighting it. */
    global.addEventListener('scroll', function () {
      if (!active) { current = target = global.scrollY; }
    }, { passive: true });

    return {
      measure: measure,
      /* Returns nothing; writes window.scrollY. Called once a
         frame, after all reads. */
      step: function (dt) {
        if (!enabled || !active) return;
        clampTarget();
        current = M.damp(current, target, 9.2, dt);
        if (Math.abs(current - target) < 0.06) { current = target; active = false; }
        global.scrollTo(0, current);
      },
      isActive: function () { return active; }
    };
  }

  /* ═══ boot ══════════════════════════════════════════════════ */

  function boot() {
    var canvas = doc.getElementById('gl');
    var film = doc.getElementById('film');
    var bootEl = doc.getElementById('boot');
    if (!canvas || !film) return;

    var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var tier = detectTier();
    var debug = /[?&]debug/.test(global.location.search);

    var stage = SHRIMP.Stage.create(canvas, {
      shadowSize: tier.shadowSize,
      oceanRings: tier.oceanRings,
      oceanSpokes: tier.oceanSpokes,
      maxParticles: tier.counts.particles
    });

    /* ── the page without a GPU ──────────────────────────────
       No WebGL2, or the film failed to build. The sections below
       the film are ordinary markup and the film's container falls
       back to a painted gradient — but the DOM layer still needs
       a clock, because every reveal on the page starts at opacity
       zero and is brought back by the frame loop. Initialising
       the site and then returning without one leaves a correct,
       fully populated, completely invisible page. */
    function bootWithoutGL(err) {
      root.classList.add('no-gl');
      root.classList.remove('is-booting');
      if (bootEl) bootEl.classList.add('is-done');
      if (debug && err) console.error(err);
      if (!SHRIMP.Site) return;

      var site = SHRIMP.Site.init({ reduced: reduced, tier: tier, film: null });
      var momentum = MomentumScroll(reduced);
      var last = 0, clock = 0, alive = true;

      function measure() { momentum.measure(); site.measure(); }
      var rt = 0;
      global.addEventListener('resize', function () {
        clearTimeout(rt); rt = setTimeout(measure, 120);
      }, { passive: true });
      global.addEventListener('pointermove', function (e) {
        site.pointer(e.clientX, e.clientY);
      }, { passive: true });
      doc.addEventListener('visibilitychange', function () {
        if (doc.hidden) alive = false;
        else if (!alive) { alive = true; last = 0; global.requestAnimationFrame(tick); }
      });

      function tick(ts) {
        if (!alive) return;
        global.requestAnimationFrame(tick);
        var dt = last ? (ts - last) / 1000 : 0.016;
        last = ts;
        if (dt > 0.1) dt = 0.1;
        momentum.step(dt);
        clock += reduced ? 0 : dt;
        site.frame(global.scrollY || 0, dt, clock);
      }

      measure();
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
      global.requestAnimationFrame(tick);
    }

    if (!stage) { bootWithoutGL(); return; }
    root.classList.add('has-gl');

    var filmCtl;
    try {
      filmCtl = SHRIMP.Film.create(stage, tier);
    } catch (err) {
      bootWithoutGL(err);
      return;
    }

    /* ── the scroll store ────────────────────────────────────── */
    var scrollY = global.scrollY || 0;
    var vh = global.innerHeight;
    var filmTop = 0, filmRange = 1;
    var raw = 0, smooth = 0;
    var renderScale = tier.maxScale, scaleTarget = renderScale;
    var momentum = MomentumScroll(reduced);

    var site = SHRIMP.Site ? SHRIMP.Site.init({
      reduced: reduced, tier: tier, film: filmCtl
    }) : null;

    function measure() {
      vh = global.innerHeight;
      var box = film.getBoundingClientRect();
      filmTop = box.top + (global.scrollY || 0);
      filmRange = Math.max(film.offsetHeight - vh, 1);
      stage.resize(global.innerWidth, vh, renderScale);
      momentum.measure();
      if (site) site.measure();
    }

    global.addEventListener('scroll', function () {
      scrollY = global.scrollY || 0;
    }, { passive: true });

    var resizeTimer = 0;
    global.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 120);
    }, { passive: true });

    /* pointer, parked as a normalised number and read once a frame */
    var mx = 0, my = 0, mxs = 0, mys = 0;
    global.addEventListener('pointermove', function (e) {
      mx = (e.clientX / global.innerWidth) * 2 - 1;
      my = -((e.clientY / global.innerHeight) * 2 - 1);
      if (site) site.pointer(e.clientX, e.clientY);
    }, { passive: true });

    /* ── frame budget ────────────────────────────────────────
       The measured average, not a target. If the machine cannot
       hold the frame, resolution comes down before anything else
       does — a slightly softer image at rate beats a sharp one
       that stutters. */
    var emaMs = 16.7, lastScaleChange = 0, frames = 0, fpsAcc = 0, fps = 0;
    var last = 0, running = true, clock = 0;

    function frame(ts) {
      if (!running) return;
      global.requestAnimationFrame(frame);

      var dt = last ? (ts - last) / 1000 : 0.016;
      last = ts;
      if (dt > 0.1) dt = 0.1;              /* returning from a background tab */
      var t0 = now();

      momentum.step(dt);
      scrollY = global.scrollY || 0;
      clock += reduced ? 0 : dt;

      /* the DOM layer runs whether the film is on screen or not */
      if (site) site.frame(scrollY, dt, clock);

      /* ── cull the film when it is off screen ──
         The stage is sticky inside `.film`, so it is visible for
         scroll positions from one viewport above the container to
         the end of its track. Outside that the loop still turns —
         it is what reads the scroll — but nothing is drawn and
         the simulation is not stepped, so the film is exactly
         where it was when you come back up to it. */
      var offscreen = scrollY > filmTop + filmRange + vh * 0.6 ||
                      scrollY < filmTop - vh * 1.2;
      if (offscreen) {
        if (!frame.__idle) { frame.__idle = true; emaMs = 16.7; }
        return;
      }
      frame.__idle = false;

      raw = M.sat((scrollY - filmTop) / filmRange);
      /* damped, so a flicked trackpad does not jump three acts */
      smooth = reduced ? raw : M.damp(smooth, raw, 9.0, dt);

      mxs = M.damp(mxs, mx, 5.0, dt);
      mys = M.damp(mys, my, 5.0, dt);
      filmCtl.setMouse(mxs, mys);

      var state = filmCtl.update(smooth, reduced ? 1 / 60 : dt, reduced ? 4.2 : clock);
      stage.render(state);
      if (site) site.filmState(state, smooth);

      var ms = now() - t0;
      emaMs = emaMs * 0.94 + ms * 0.06;
      frames++; fpsAcc += dt;
      if (fpsAcc >= 0.5) { fps = Math.round(frames / fpsAcc); frames = 0; fpsAcc = 0; if (hud) writeHud(); }

      if (ts - lastScaleChange > 1400) {
        if (emaMs > 19 && scaleTarget > 0.55) { scaleTarget = Math.max(0.55, scaleTarget - 0.12); lastScaleChange = ts; }
        else if (emaMs < 9.5 && scaleTarget < tier.maxScale) { scaleTarget = Math.min(tier.maxScale, scaleTarget + 0.08); lastScaleChange = ts; }
        if (Math.abs(scaleTarget - renderScale) > 0.02) {
          renderScale = scaleTarget;
          stage.resize(global.innerWidth, global.innerHeight, renderScale);
        }
      }
    }

    /* ── optional readout, on ?debug ─────────────────────────── */
    var hud = null;
    function writeHud() {
      hud.textContent = tier.name + ' · ' + fps + ' fps · ' + emaMs.toFixed(1) + ' ms · ' +
        renderScale.toFixed(2) + '× · ' + filmCtl.state.act + ' ' +
        filmCtl.state.actProgress.toFixed(2) + ' · t ' + smooth.toFixed(3) + ' · ' +
        filmCtl.state.particleCount + ' parts';
    }
    if (debug) {
      hud = doc.createElement('div');
      hud.className = 'hud mono';
      doc.body.appendChild(hud);
      /* handles for poking at the film from a console — gated, so
         the ordinary page exposes nothing on window but SHRIMP */
      global.__film = {
        stage: stage, film: filmCtl, tier: tier,
        seek: function (target) { global.scrollTo(0, filmTop + filmRange * target); },
        /* Jump the damped value straight to a mark and run the
           simulation forward in fixed steps, so a frame grab lands
           on an exact t with the springs settled rather than
           wherever the machine got to in real time. */
        settle: function (target, steps) {
          if (target !== undefined) { raw = smooth = M.sat(target); }
          for (var i = 0; i < (steps || 140); i++) filmCtl.update(smooth, 1 / 60, 4.2);
          stage.render(filmCtl.state);
        }
      };
    }

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) running = false;
      else if (!running) { running = true; last = 0; global.requestAnimationFrame(frame); }
    });

    measure();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);

    /* Prime the springs so the first painted frame is the film
       rather than two hundred ingredients falling into place. */
    raw = smooth = M.sat((scrollY - filmTop) / filmRange);
    for (var w = 0; w < 110; w++) filmCtl.update(smooth, 1 / 60, 4.2);
    stage.render(filmCtl.update(smooth, 1 / 60, 4.2));

    global.requestAnimationFrame(frame);

    root.classList.remove('is-booting');
    if (bootEl) {
      bootEl.classList.add('is-done');
      setTimeout(function () { if (bootEl.parentNode) bootEl.remove(); }, 1600);
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
