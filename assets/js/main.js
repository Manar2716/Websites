/* ═══════════════════════════════════════════════════════════
   main.js — wiring. Builds the scenes, subscribes each one to
   the shared clock, and culls anything that isn't on screen.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var doc = global.document;
  var CORE = global.CORE, SCENE = global.SCENE, PRINTJOB = global.PRINTJOB;
  var U = CORE.U, S = CORE.S;
  var $  = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  /* ── BOOT ─────────────────────────────────────────────── */
  (function boot() {
    var el = $('#boot'), label = $('#bootLabel');
    if (!el) return;
    doc.documentElement.classList.add('is-booting');

    if (CORE.reduced) {
      el.classList.add('is-done');
      doc.documentElement.classList.remove('is-booting');
      return;
    }

    var steps = ['CALIBRATING BED', 'HOMING XY', 'HEATING CHAMBER', 'READY'];
    var i = 0;
    var tick = setInterval(function () {
      i++;
      if (i < steps.length) { label.textContent = steps[i]; return; }
      clearInterval(tick);
      el.classList.add('is-done');
      doc.documentElement.classList.remove('is-booting');
      CORE.measure();
      startReveals();
    }, 340);
  })();

  /* ── REVEALS ──────────────────────────────────────────── */
  var revealIO;
  function startReveals() {
    var targets = $$('[data-reveal]');
    targets.forEach(function (el) {
      var d = el.dataset.revealDelay;
      if (d) el.style.setProperty('--d', d);
    });

    if (!('IntersectionObserver' in global)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        revealIO.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    targets.forEach(function (el) { revealIO.observe(el); });
  }

  /* ── COUNTERS ─────────────────────────────────────────── */
  (function counters() {
    var nodes = $$('[data-count]');
    if (!nodes.length) return;

    function run(el) {
      var to = parseFloat(el.dataset.count);
      var sep = el.hasAttribute('data-sep');
      if (CORE.reduced) { el.textContent = fmt(to, sep); return; }
      var t0 = null, dur = 1500;
      function step(now) {
        if (t0 === null) t0 = now;
        var p = U.clamp((now - t0) / dur, 0, 1);
        el.textContent = fmt(to * U.easeOut(p), sep);
        if (p < 1) global.requestAnimationFrame(step);
      }
      global.requestAnimationFrame(step);
    }
    function fmt(v, sep) {
      v = Math.round(v);
      return sep ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : String(v);
    }

    if (!('IntersectionObserver' in global)) { nodes.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        run(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    nodes.forEach(function (n) { io.observe(n); });
  })();

  /* ── NAV ──────────────────────────────────────────────── */
  (function nav() {
    var el = $('#nav');
    CORE.add(function () {
      el.classList.toggle('is-stuck', S.smooth > 40);
    }, { name: 'nav' });
  })();

  /* ── ATMOSPHERE ───────────────────────────────────────── */
  (function atmosphere() {
    var groves = $$('.grove');
    var under = $('#understory');
    function grow() {
      groves.forEach(function (g, i) { SCENE.buildGrove(g, i); });
      if (under) SCENE.buildUnderstory(under);
    }
    grow();
    CORE.onResize(grow);

    var parLayers = $$('[data-par]');
    var cone = $('.atmos__cone');
    var sporeCanvas = $('#spores');
    var spores = sporeCanvas ? SCENE.Spores(sporeCanvas) : null;

    /* pointer parallax, stored as a target and eased in the loop */
    var mTarget = { x: 0, y: 0 }, mNow = { x: 0, y: 0 };
    if (global.matchMedia('(hover:hover)').matches && !CORE.reduced) {
      global.addEventListener('pointermove', function (e) {
        mTarget.x = (e.clientX / S.vw - 0.5) * 2;
        mTarget.y = (e.clientY / S.vh - 0.5) * 2;
      }, { passive: true });
    }

    CORE.add(function (dt, now) {
      mNow.x = U.damp(mNow.x, mTarget.x, 4, dt);
      mNow.y = U.damp(mNow.y, mTarget.y, 4, dt);

      /* the grove drifts for the first three viewports, then holds,
         so a faint forest survives all the way down the page */
      var travel = Math.min(S.smooth, S.vh * 3);

      for (var i = 0; i < parLayers.length; i++) {
        var el = parLayers[i];
        var par = parseFloat(el.dataset.par) || 0;
        var mAmt = parseFloat(el.dataset.mouse) || 0;
        el.style.transform =
          'translate3d(' + (-mNow.x * mAmt).toFixed(2) + 'px,' +
          (-travel * par - mNow.y * mAmt * 0.35).toFixed(2) + 'px,0)';
      }

      /* the spotlight belongs to the hero — let it go as we leave */
      if (cone) {
        cone.style.opacity = U.lerp(1, 0.12, U.norm(S.smooth, 0, S.vh * 1.5)).toFixed(3);
      }

      if (spores && S.smooth < S.vh * 2.4) spores.step(dt, now);
    }, { name: 'atmos' });
  })();

  /* ── THE MACHINES ─────────────────────────────────────── */
  var heroPr = null, orbitPr = null;

  (function machines() {
    var heroMount = $('#heroMachine');
    var orbitMount = $('#orbitMachine');
    if (heroMount) heroPr = SCENE.buildPrinter(heroMount);
    if (orbitMount) orbitPr = SCENE.buildPrinter(orbitMount);

    var heroTrack = heroMount ? CORE.track($('#hero'), { pinned: false }) : null;
    var mTarget = { x: 0, y: 0 }, mNow = { x: 0, y: 0 };
    if (global.matchMedia('(hover:hover)').matches && !CORE.reduced) {
      global.addEventListener('pointermove', function (e) {
        mTarget.x = (e.clientX / S.vw - 0.5) * 2;
        mTarget.y = (e.clientY / S.vh - 0.5) * 2;
      }, { passive: true });
    }

    /* the hero machine idles: slow turn, gantry breathing, and a
       print loop of its own so it's never static */
    CORE.add(function (dt, now) {
      if (!heroPr || !heroTrack || !heroTrack.near(200)) return;
      mNow.x = U.damp(mNow.x, mTarget.x, 3.4, dt);
      mNow.y = U.damp(mNow.y, mTarget.y, 3.4, dt);

      var t = now / 1000;
      var loop = (t % 14) / 14;               /* a 14s print cycle */
      var ry = -26 + Math.sin(t * 0.16) * 9 + mNow.x * 13;
      var rx = -14 + mNow.y * 6;
      /* the head sweeps in X while the beam creeps in Y — the
         actual motion pattern of a CoreXY laying a perimeter */
      var hx = Math.sin(t * 2.1);
      var hz = Math.sin(t * 0.62);
      heroPr.set(rx, ry, loop, hx, loop, hz);
      heroPr.layers(loop);
      if (heroPr.screen) {
        heroPr.screen.textContent = 'L' + U.pad(loop * 480, 4) + ' · ' +
          (loop * 96).toFixed(1) + 'mm';
      }

      var pill = $('#pillLive');
      if (pill) pill.textContent = 'live print · layer ' + U.pad(loop * 480, 4);
    }, { name: 'heroMachine' });
  })();

  /* ── ORBIT SCENE ──────────────────────────────────────── */
  (function orbit() {
    var section = $('[data-scroll-scene="orbit"]');
    if (!section || !orbitPr) return;
    var rail = $('.orbit__rail', section);
    var t = CORE.track(rail);
    var calls = $$('.call', section);
    var deg = $('#orbitDeg');

    CORE.add(function (dt, now) {
      if (!t.near(120)) return;
      var p = t.get();

      /* a full revolution across the track, plus a gentle tilt
         that dips as we pass the midpoint */
      var ry = -30 + p * 360;
      var rx = -16 + Math.sin(p * Math.PI) * 12;
      /* not `t` — that name is the scroll track in this closure, and
         `var` hoisting would leave it undefined at the guard above */
      var clock = now / 1000;
      var hx = Math.sin(clock * 1.7);
      var hz = Math.sin(clock * 0.55);
      orbitPr.set(rx, ry, p, hx, p, hz);
      orbitPr.layers(p);

      /* The housing dissolves once we start talking about what's
         inside it, and closes again at the end — the machine ships
         solid, so it should end the section that way. */
      var open = U.clamp((p - 0.10) / 0.12, 0, 1) * (1 - U.clamp((p - 0.82) / 0.12, 0, 1));
      orbitPr.shell(1 - open * 0.88);
      if (orbitPr.screen) {
        orbitPr.screen.textContent = 'L' + U.pad(p * 480, 4) + ' · ' + (p * 96).toFixed(1) + 'mm';
      }
      if (deg) deg.textContent = U.pad(((ry % 360) + 360) % 360, 3);

      /* callouts hold for a window around their anchor point */
      for (var i = 0; i < calls.length; i++) {
        var at = parseFloat(calls[i].dataset.at);
        var on = p > at - 0.06 && p < at + 0.17;
        if (calls[i]._on !== on) {
          calls[i].classList.toggle('is-on', on);
          calls[i]._on = on;
        }
      }
    }, { name: 'orbit' });
  })();

  /* ── THE PRINT SCENE ──────────────────────────────────── */
  (function print() {
    var section = $('[data-scroll-scene="print"]');
    var canvas = $('#layerCanvas');
    if (!section || !canvas) return;

    var rail = $('.print__rail', section);
    var t = CORE.track(rail);
    var job = PRINTJOB.PrintJob(canvas);

    var elLayer = $('#hudLayer'), elZ = $('#hudZ'), elNozzle = $('#hudNozzle'),
        elSpeed = $('#hudSpeed'), elBar = $('#hudBar'), elZoom = $('#hudZoom');

    var phase = 0;
    var shownSpeed = 0;

    CORE.add(function (dt, now) {
      if (!t.near(60)) return;
      var p = t.get();

      /* the nozzle keeps orbiting the perimeter even when the
         scroll is still — a paused printer still holds position */
      phase = (phase + dt * 0.55) % 1;

      if (job.needsDraw(p, phase)) job.draw(p, phase);

      var layer = Math.floor(p * (PRINTJOB.LAYERS - 1));
      if (elLayer) elLayer.textContent = U.pad(layer, 4) + ' / ' + PRINTJOB.LAYERS;
      if (elZ) elZ.textContent = (p * 96).toFixed(2) + ' mm';
      if (elNozzle) {
        /* temperature wobbles the way a real PID loop does */
        elNozzle.textContent = (268 + Math.sin(now / 700) * 1.6).toFixed(0) + ' °C';
      }
      if (elSpeed) {
        var target = U.clamp(Math.abs(S.velocity) * 0.9, 0, 520);
        shownSpeed = U.damp(shownSpeed, target, 5, dt);
        elSpeed.textContent = Math.round(shownSpeed) + ' mm/s';
      }
      if (elBar) elBar.style.width = (p * 100).toFixed(2) + '%';
      if (elZoom) elZoom.textContent = job.zoom().toFixed(1) + ' ×';
    }, { name: 'print' });
  })();

  /* ── FRAME TELEMETRY ──────────────────────────────────── */
  (function telemetry() {
    var elFps = $('#fps'), elMs = $('#ms'), spark = $('#fpsSpark');
    if (!elFps) return;
    var ctx = null, w = 0, h = 0, dpr = 1;

    if (spark) {
      ctx = spark.getContext('2d');
      var size = function () {
        dpr = Math.min(global.devicePixelRatio || 1, 2);
        w = spark.clientWidth || 1; h = spark.clientHeight || 1;
        spark.width = Math.round(w * dpr); spark.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      size();
      CORE.onResize(size);
    }

    var acc = 0;
    CORE.add(function (dt) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;

      elFps.textContent = CORE.perf.fps || '—';
      if (elMs) elMs.textContent = CORE.perf.ms ? CORE.perf.ms.toFixed(1) : '—';

      if (!ctx) return;
      var s = CORE.perf.samples;
      ctx.clearRect(0, 0, w, h);
      if (s.length < 2) return;

      /* scale against the display's own ceiling, not a fixed 60 */
      var top = Math.max(60, Math.max.apply(null, s)) * 1.1;
      ctx.beginPath();
      for (var i = 0; i < s.length; i++) {
        var x = (i / (s.length - 1)) * w;
        var y = h - (s[i] / top) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(166,204,92,0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = 'rgba(166,204,92,0.10)';
      ctx.fill();
    }, { name: 'telemetry' });
  })();

  /* ── SPOOLS ───────────────────────────────────────────── */
  (function spools() {
    var section = $('[data-scroll-scene="mats"]');
    if (!section) return;
    var discs = SCENE.buildSpools(section);
    var t = CORE.track(section, { pinned: false, lead: 0.8 });

    CORE.add(function () {
      if (!t.near(200)) return;
      var p = t.get();
      for (var i = 0; i < discs.length; i++) {
        var d = discs[i];
        var turn = (p + d.offset) * 420 * d.dir;
        d.el.style.transform = 'rotateX(66deg) rotateZ(' + turn.toFixed(2) + 'deg)';
      }
    }, { name: 'spools' });
  })();

  /* ── GROWTH ───────────────────────────────────────────── */
  (function growth() {
    var svg = $('#growth');
    if (!svg) return;
    var paths = SCENE.buildGrowth(svg);
    var t = CORE.track($('[data-scroll-scene="grow"]'), { pinned: false, lead: 0.9 });

    CORE.add(function () {
      if (!t.near(150)) return;
      var p = U.easeOut(t.get());
      for (var i = 0; i < paths.length; i++) {
        /* stalks stagger so the grove fills in rather than
           snapping into place all at once */
        var stagger = U.clamp((p - (i % 7) * 0.045) / 0.6, 0, 1);
        paths[i].style.strokeDashoffset = (paths[i]._len * (1 - stagger)).toFixed(1);
      }
    }, { name: 'growth' });
  })();

  /* ── RESERVE FORM ─────────────────────────────────────── */
  (function form() {
    var f = $('.reserve__form');
    if (!f) return;
    var note = $('#formNote'), input = $('#email');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input.value || '').trim();
      var ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      note.textContent = ok
        ? '✓ HELD — unit ' + U.pad(Math.floor(Math.random() * 800) + 1, 3) + ' of 800. Check your inbox.'
        : '× THAT ADDRESS DIDN\'T PARSE. TRY AGAIN.';
      note.style.color = ok ? 'var(--leaf)' : 'var(--bamboo)';
      if (ok) input.value = '';
    });
  })();

  /* ── GO ───────────────────────────────────────────────── */
  CORE.measure();
  CORE.start();
  /* if the boot overlay is skipped (reduced motion), reveals still fire */
  if (CORE.reduced) startReveals();

  global.addEventListener('load', function () { CORE.measure(); });
})(window);
