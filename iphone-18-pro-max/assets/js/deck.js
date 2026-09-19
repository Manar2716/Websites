/* ═══════════════════════════════════════════════════════════════════
   deck.js — the run of show.

   A flat list of beats, not a list of slides: one beat is one press of
   the clicker, which is what lets the script's [CLICK] markers line up
   one-to-one with the deck.

   Every scene exposes ONE function, apply(n), which paints that scene
   as it should look at beat n — from scratch, every time. Nothing is
   incremental. That is the single decision that makes stepping
   backwards work: going back is apply(n-1), not an undo log.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var U = global.KN.U;
  var doc = document;
  function q(s, r) { return (r || doc).querySelector(s); }
  function qa(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }

  var rigNode = q('#rig'), shotHost = q('#shots'), shadow = q('#productShadow');
  var keyLight = q('#key'), bloom = q('#bloom');

  var shots  = global.KN.Product.build(shotHost);
  var views  = global.KN.Product.Views(shots);
  var rig    = global.KN.Product.Rig(q('#shots'), shadow);
  var fade   = global.KN.Product.Rig(rigNode, null);   /* opacity only */
  var fields = global.KN.Fields.mount(q('#plates'));
  var timers = global.KN.Timers();

  var slides = {};
  qa('.slide').forEach(function (s) { slides[s.id] = s; });

  /* ── helpers ────────────────────────────────────────────────────── */

  function live(id) {
    for (var k in slides) if (slides.hasOwnProperty(k)) {
      slides[k].classList.toggle('is-live', k === id);
    }
  }

  function upTo(el, n) {
    qa('.beat', el).forEach(function (b) {
      b.classList.toggle('is-in', +b.dataset.b <= n);
    });
  }

  function exclusive(sel, attr, i) {
    qa(sel).forEach(function (n) { n.classList.toggle('is-in', +n.dataset[attr] === i); });
  }

  function lit(on, x, y) {
    keyLight.classList.toggle('is-lit', !!on);
    if (x != null) keyLight.style.setProperty('--kx', x + '%');
    if (y != null) keyLight.style.setProperty('--ky', y + '%');
  }

  /* One call sets what is on screen and where it sits. `h` is the
     requested on-screen height; product.js caps it at whatever the
     photograph can carry without softening. */
  function show(view, h, pose, speed) {
    views.show(view, h);
    if (pose) rig.set(pose, speed);
    fade.set({ o: 1 }, speed || 3);
  }
  function hideProduct(speed) { fade.set({ o: 0 }, speed || 2.6); }

  /* ── one feature at a time ──────────────────────────────────────── */
  function feature(slideEl, i) {
    qa('.feat', slideEl).forEach(function (f) {
      var k = +f.dataset.f;
      f.classList.toggle('is-on', k === i);
      f.classList.toggle('is-gone', k < i);
    });
  }

  /* ── camera sequence copy ───────────────────────────────────────── */
  var capH = q('#plateCapH'), capP = q('#plateCapP'), capBox = q('#plateCap'),
      capScrim = q('#plateScrim'), renderNote = q('#renderNote');

  var SCENES = [
    ['bright', 'Bright outdoors',
     'Hard light, and something always about to wash out to white. Closing the aperture to ƒ/4 lets in less light and holds the bright side back.'],
    ['indoor', 'Indoors',
     'Far less light than your eyes are telling you. Opening up to ƒ/1.48 takes in as much of it as the lens can gather.'],
    ['night', 'After dark',
     'More light reaching the sensor means less time held open — so less of your own movement ends up in the picture.'],
    ['distance', 'A long way off',
     'A telephoto camera at the full 48 megapixels, so reaching across a room still leaves something worth keeping.'],
    ['subject', 'A person',
     'Wide open, the background falls away and the face stays held. That separation is what a wide aperture is for.'],
    ['movement', 'Moving',
     'Video, with the same three cameras and the same control over light.']
  ];

  function scene(i) {
    if (i < 0) {
      fields.show(null);
      capBox.classList.remove('is-in');
      capScrim.classList.remove('is-in');
      renderNote.classList.remove('is-in');
      return;
    }
    var s = SCENES[i];
    fields.show(s[0]);
    capH.textContent = s[1];
    capP.textContent = s[2];
    capBox.classList.add('is-in');
    capScrim.classList.add('is-in');
    renderNote.classList.add('is-in');
  }

  var vw = function (f) { return global.innerWidth * f; };
  var vh = function (f) { return global.innerHeight * f; };

  /* ═══════════════════ THE RUN OF SHOW ═══════════════════ */

  var SHOW = [

    /* ── 0 · COLD OPEN ───────────────────────────────────────────────
       Black, one light, then the product — and then a slow walk around
       it: front, side, back, and in to the cameras. Seven presses,
       because a reveal the presenter cannot pause is a reveal that will
       be rushed on the day. */
    { id: 's0', beats: 7, apply: function (n) {
        bloom.classList.toggle('is-on',  n === 1 || n === 2);
        bloom.classList.toggle('is-out', n >= 3);
        lit(n >= 3, 50, 44);
        views.call(null);

        if (n === 0) { hideProduct(4); views.show('front', 620); rig.set({ s: .74, x: 0, y: 0 }); }
        if (n === 1) { hideProduct(4); }
        /* barely there */
        if (n === 2) { views.show('front', 620); rig.set({ s: .82 }, 1.0); fade.set({ o: .22 }, 1.1); }
        /* forward, and fully lit */
        if (n === 3) { show('front', 660, { s: 1, x: 0, y: 0 }, 1.0); }
        /* around the side */
        if (n === 4) { show('side', 640, { s: 1, x: 0, y: 0 }, 1.2); }
        /* and to the back */
        if (n === 5) { show('back', 560, { s: 1, x: 0, y: 0 }, 1.2); }
        /* in to the camera system */
        if (n === 6) { show('plateau', 300, { s: 1.5, x: 0, y: vh(.04) }, 1.4); }
      } },

    /* ── 1 · THE PRODUCT ─────────────────────────────────────────── */
    { id: 's1', beats: 2, apply: function (n) {
        upTo(slides.s1, n);
        lit(true, 68, 46);
        bloom.classList.remove('is-on', 'is-out');
        views.call(null);
        if (n >= 1) show('front', 650, { s: 1, x: vw(.26), y: 0 }, 1.5);
        else { views.show('front', 650); hideProduct(2); }
      } },

    /* ── 2 · TWO PRIORITIES ──────────────────────────────────────── */
    { id: 's2', beats: 3, apply: function (n) {
        upTo(slides.s2, n);
        lit(true, 50, 50);
        views.show('front', 650);
        rig.set({ s: 1.25, x: 0, y: 0 }, 1.2);
        fade.set({ o: .07 }, 1.4);
      } },

    /* ── 3 · BATTERY ─────────────────────────────────────────────── */
    { id: 's3', beats: 8, apply: function (n) {
        upTo(slides.s3, n);
        lit(true, 30, 40);
        hideProduct(2.2);
        scene(-1);

        var batt = q('#batt'), fill = q('#battFill');
        var morphed = n >= 3;
        batt.style.setProperty('--bw', morphed ? '100%' : 'clamp(180px,22vw,300px)');
        batt.style.setProperty('--bh', morphed ? 'clamp(26px,3.4vh,34px)' : 'clamp(80px,11vh,120px)');
        batt.style.setProperty('--br', morphed ? '17px' : '26px');
        batt.style.setProperty('--nub', morphed ? 0 : 1);
        batt.classList.toggle('is-low', n < 2);

        /* Fills, then spends the day, ending with something still in
           it. These percentages illustrate the shape of a day; they are
           not an Apple measurement, and the script says so out loud. */
        var level = [9, 9, 100, 100, 100, 78, 52, 28][n];
        fill.style.setProperty('--level', level + '%');
        fill.style.setProperty('--fr', morphed ? '11px' : '18px');
      } },

    /* ── 4 · CAMERA ──────────────────────────────────────────────── */
    { id: 's4', beats: 6, apply: function (n) {
        lit(true, 58, 42);
        scene(-1);
        q('#s4Head').classList.toggle('is-out', n >= 1);
        exclusive('#s4Calls .callout', 'c', n >= 2 ? n - 2 : -1);

        if (n === 0) show('back', 540, { s: 1, x: vw(.26), y: 0 }, 1.5);
        if (n === 1) show('plateau', 300, { s: 1.3, x: vw(.24), y: 0 }, 1.4);
        if (n >= 2) show('plateau', 300, { s: 1.6, x: vw(.22), y: 0 }, 1.4);

        views.call(n === 2 ? 'main' : n === 3 ? 'ultra' : n === 4 ? 'tele' : null);
      } },

    /* ── 5 · IN REAL LIFE ────────────────────────────────────────── */
    { id: 's5', beats: 6, apply: function (n) {
        lit(false);
        hideProduct(2.6);
        views.call(null);
        scene(n);
      } },

    /* ── 6 · CAMERA DETAIL ───────────────────────────────────────── */
    { id: 's6', beats: 4, apply: function (n) {
        lit(true, 50, 46);
        scene(-1);
        /* the camera stays on screen behind the words, well back */
        views.show('plateau', 300);
        rig.set({ s: 2.3, x: 0, y: 0 }, 1.2);
        fade.set({ o: .10 }, 1.4);
        views.call(null);
        feature(slides.s6, n);
      } },

    /* ── 7 · DISPLAY ─────────────────────────────────────────────── */
    { id: 's7', beats: 3, apply: function (n) {
        lit(true, 50, 44);
        views.show('front', 640);
        rig.set({ s: 1.3, x: 0, y: 0 }, 1.2);
        fade.set({ o: .12 }, 1.4);
        feature(slides.s7, n);
      } },

    /* ── 8 · PERFORMANCE ─────────────────────────────────────────── */
    { id: 's8', beats: 5, apply: function (n) {
        lit(true, 50, 48);
        hideProduct(2.6);
        feature(slides.s8, n);
      } },

    /* ── 9 · EVERYTHING ELSE ─────────────────────────────────────── */
    { id: 's9', beats: 7, apply: function (n) {
        lit(true, 50, 46);
        hideProduct(2.6);
        feature(slides.s9, n);
        /* the finishes arrive one after the other on the last beat */
        qa('#finishes img').forEach(function (im, i) {
          im.classList.toggle('is-in', n === 6);
          im.style.transitionDelay = (n === 6 ? i * 260 : 0) + 'ms';
        });
      } },

    /* ── 10 · A DAY ──────────────────────────────────────────────── */
    { id: 's10', beats: 6, apply: function (n) {
        upTo(slides.s10, n === 5 ? 6 : 0);
        lit(true, 50, 24);
        scene(-1);

        var i = U.clamp(n - 1, 0, 4);
        qa('.day__m', slides.s10).forEach(function (m) {
          var k = +m.dataset.d;
          m.classList.toggle('is-in', k <= n - 1);
          m.classList.toggle('is-past', k < n - 1);
        });
        q('#daySun').style.setProperty('--sun', n >= 1 ? 1 : 0);

        /* the device walks the timeline, one stop per press. Lane
           positions are measured off the marks rather than guessed as
           viewport fractions: the day block is max-width capped, so a
           vw fraction drifts out of alignment on a wide screen. */
        var mark = qa('.day__m', slides.s10)[i], mx = 0;
        if (mark) {
          var r = mark.getBoundingClientRect();
          mx = (r.left + r.width / 2) - global.innerWidth / 2;
        }
        views.show('front', 640);
        rig.set({ s: .30, x: mx, y: -vh(.24) }, 1.5);
        fade.set({ o: n >= 1 ? 1 : 0 }, 1.6);
      } },

    /* ── 11 · THE BIG PICTURE ────────────────────────────────────── */
    { id: 's11', beats: 4, apply: function (n) {
        upTo(slides.s11, n);
        lit(true, 50, 50);
        /* the words step aside so the device can have the frame */
        q('#s11Body').classList.toggle('is-cleared', n >= 3);
        views.show('front', 640);
        rig.set({ s: n >= 3 ? 1 : .88, x: 0, y: 0 }, 1.0);
        fade.set({ o: n >= 3 ? 1 : 0 }, 1.2);
      } },

    /* ── 12 · FINAL ──────────────────────────────────────────────── */
    { id: 's12', beats: 5, apply: function (n) {
        upTo(slides.s12, n);
        bloom.classList.toggle('is-on',  n === 1);
        bloom.classList.toggle('is-out', n >= 2);
        lit(n >= 2, 50, 46);
        views.show('front', 620);
        rig.set({
          s: n >= 2 ? .92 : .76,
          x: 0,
          y: n >= 3 ? -vh(.15) : -vh(.02)
        }, n >= 2 ? 1.0 : 1.6);
        fade.set({ o: n === 0 ? 0 : n === 1 ? .18 : 1 }, n >= 2 ? 1.1 : 1.6);
      } }
  ];

  /* ── flatten to one list of clicker presses ─────────────────────── */
  var STEPS = [];
  SHOW.forEach(function (sl, si) {
    for (var b = 0; b < sl.beats; b++) STEPS.push({ slide: si, beat: b });
  });

  var at = 0;

  function render(i, instant) {
    at = U.clamp(i, 0, STEPS.length - 1);
    var st = STEPS[at], sl = SHOW[st.slide];

    timers.clear();
    live(sl.id);
    sl.apply(st.beat);
    if (instant) { rig.snap(); fade.snap(); }

    q('#progF').style.width = (at / (STEPS.length - 1)) * 100 + '%';
    qa('.pip').forEach(function (p, k) {
      p.classList.toggle('is-here', k === st.slide);
      p.classList.toggle('is-done', k < st.slide);
    });
  }

  function next() { if (at < STEPS.length - 1) render(at + 1); }
  function prev() { if (at > 0) render(at - 1); }
  function toSlide(si) {
    for (var k = 0; k < STEPS.length; k++) {
      if (STEPS[k].slide === si) { render(k, true); return; }
    }
  }

  var pips = q('#pips');
  SHOW.forEach(function () {
    var p = doc.createElement('span'); p.className = 'pip'; pips.appendChild(p);
  });

  /* ── input ──────────────────────────────────────────────────────── */
  var info = q('#info');
  function toggleInfo(force) {
    info.classList.toggle('is-open', force != null ? force : !info.classList.contains('is-open'));
  }

  doc.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'i' || k === 'I') { e.preventDefault(); toggleInfo(); return; }
    if (info.classList.contains('is-open')) {
      if (k === 'Escape') { e.preventDefault(); toggleInfo(false); }
      return;
    }
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') {
      e.preventDefault(); next();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') {
      e.preventDefault(); prev();
    } else if (k === 'Home') { e.preventDefault(); render(0, true); }
    else if (k === 'End') { e.preventDefault(); render(STEPS.length - 1, true); }
    else if (k === 'f' || k === 'F') {
      e.preventDefault();
      if (doc.fullscreenElement) doc.exitFullscreen();
      else if (doc.documentElement.requestFullscreen) doc.documentElement.requestFullscreen();
    } else if (k >= '0' && k <= '9') {
      e.preventDefault();
      var n = +k + (e.shiftKey ? 10 : 0);
      if (n < SHOW.length) toSlide(n);
    }
  });

  q('#tapNext').addEventListener('click', function () { if (!info.classList.contains('is-open')) next(); });
  q('#tapPrev').addEventListener('click', function () { if (!info.classList.contains('is-open')) prev(); });
  info.addEventListener('click', function () { toggleInfo(false); });

  var tx = 0, ty = 0;
  doc.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY;
  }, { passive: true });
  doc.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  }, { passive: true });

  /* ── idle: hide the cursor and the hint while presenting ────────── */
  var idleT, hint = q('#hint');
  function stir() {
    doc.body.classList.remove('is-idle');
    hint.classList.add('is-on');
    global.clearTimeout(idleT);
    idleT = global.setTimeout(function () {
      doc.body.classList.add('is-idle');
      hint.classList.remove('is-on');
    }, 2600);
  }
  ['mousemove', 'keydown', 'touchstart'].forEach(function (ev) {
    doc.addEventListener(ev, stir, { passive: true });
  });

  var rt;
  global.addEventListener('resize', function () {
    global.clearTimeout(rt);
    rt = global.setTimeout(function () { render(at, true); }, 160);
  });

  global.KN.start();
  render(0);
  stir();
  global.KN.deck = { next: next, prev: prev, to: toSlide, steps: STEPS.length };
})(window);
