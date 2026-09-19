/* ═══════════════════════════════════════════════════════════════════
   deck.js — the run of show.

   The deck is a flat list of BEATS, not a list of slides. Each beat is
   one press of the clicker, which is what lets the script's [CLICK]
   markers line up one-to-one with the deck.

   Every slide exposes ONE function, apply(n), which paints the slide
   as it should look at beat n — from scratch, every time. Nothing is
   incremental. That is the single decision that makes stepping
   backwards work: going back is just apply(n-1), not an undo log.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var U = global.KN.U;
  var doc = document;

  function q(sel, root) { return (root || doc).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }

  /* ── stage wiring ── */
  var rigNode   = q('#phoneRig');
  var altNode   = q('#altRig');
  var shadow    = q('#phoneShadow');
  var keyLight  = q('#key');
  var bloom     = q('#bloom');

  var P    = global.KN.Phone.build(rigNode);      /* the hero device */
  var Palt = global.KN.Phone.build(altNode);      /* the previous generation */
  var rig  = global.KN.Phone.Rig(rigNode, shadow);
  var altRig = global.KN.Phone.Rig(altNode, null);

  var plates = global.KN.Plates.mount(q('#plates'));
  var timers = global.KN.Timers();

  var slides = {};
  qa('.slide').forEach(function (s) { slides[s.id] = s; });

  /* ── helpers ────────────────────────────────────────────────────── */

  function live(id) {
    for (var k in slides) if (slides.hasOwnProperty(k)) {
      slides[k].classList.toggle('is-live', k === id);
    }
  }

  /* Reveal every .beat whose data-b is <= n. Beats above n are pulled
     back to their hidden state, which is what makes apply() idempotent
     in both directions. */
  function upTo(slideEl, n, dimPast) {
    qa('.beat', slideEl).forEach(function (b) {
      var i = +b.dataset.b;
      b.classList.toggle('is-in', i <= n);
      b.classList.toggle('is-past', !!dimPast && i < n);
    });
  }

  /* Show exactly one of a set and hide the rest. Used wherever beats
     replace each other rather than accumulate — three lens call-outs
     in one corner of the frame, for instance. */
  function exclusive(sel, attr, i) {
    qa(sel).forEach(function (n) {
      n.classList.toggle('is-in', +n.dataset[attr] === i);
    });
  }

  function lit(on, x, y) {
    keyLight.classList.toggle('is-lit', !!on);
    if (x != null) keyLight.style.setProperty('--kx', x + '%');
    if (y != null) keyLight.style.setProperty('--ky', y + '%');
  }

  function wallpaper(on) { P.paper.style.setProperty('--wall', on ? 1 : 0); }

  function callLens(which) {
    P.plateau.classList.toggle('is-isolating', !!which);
    ['wide', 'ultra', 'tele'].forEach(function (k) {
      P.lenses[k].node.classList.toggle('is-called', k === which);
    });
  }

  function iris(scale) {
    P.lenses.wide.iris.style.setProperty('--iris', scale);
  }

  /* Pose that brings the lens cluster to the centre of frame at a
     given scale. Measured from the live DOM rather than hard-coded, so
     it stays correct at every breakpoint. */
  function lensPose(scale) {
    var W = P.phone.offsetWidth, H = P.phone.offsetHeight;
    var pl = P.plateau, xs = 0, ys = 0;
    ['wide', 'ultra', 'tele'].forEach(function (k) {
      var l = P.lenses[k].node;
      xs += pl.offsetLeft + l.offsetLeft + l.offsetWidth / 2;
      ys += pl.offsetTop + l.offsetTop + l.offsetHeight / 2;
    });
    var cx = xs / 3, cy = ys / 3;
    var dx = cx - W / 2, dy = cy - H / 2;
    /* Two mirrors, not one. The lenses sit on the back face, which is
       itself turned 180° inside the body, and then the whole body is
       turned 180° to face us. The two flips cancel, so a lens sitting
       left-of-centre on the back panel ends up left-of-centre on
       screen — and the translation that centres it is -dx, not +dx.
       Getting this backwards puts the cluster off frame by 2·dx·scale. */
    return { x: -dx * scale, y: -dy * scale, s: scale, ry: 180 };
  }

  /* shift a measured pose sideways without losing the rest of it */
  function nudge(pose, dx) { pose.x += dx; return pose; }

  var vw = function (f) { return global.innerWidth * f; };
  var vh = function (f) { return global.innerHeight * f; };

  /* ── plate captions ─────────────────────────────────────────────── */
  var capH = q('#plateCapH'), capP = q('#plateCapP'),
      capBox = q('#plateCap'), renderNote = q('#renderNote'),
      capScrim = q('#plateScrim');

  var SCENES = [
    ['sun', 'Bright sun',
     'Hard light, deep shadow. Stopping the aperture down to ƒ/4 holds the bright side back from washing out.'],
    ['indoor', 'Indoors',
     'One window, and not much of it. Opening up to ƒ/1.48 takes in about one and a half times the light of the fixed ƒ/1.78 before it.'],
    ['night', 'After dark',
     'More light reaching the sensor means less time held open — so less of your own movement ends up in the frame.'],
    ['far', 'A long way off',
     '4× optically, and 8× at 12 megapixels. Reach, without cropping into the picture afterwards.'],
    ['portrait', 'A person',
     'Wide open at ƒ/1.48 the background genuinely falls away — and Portrait mode can take it further.'],
    ['motion', 'Moving',
     'Dual Capture runs the front and back cameras at once: the scene, and the person watching it, in one take.']
  ];

  function scene(i) {
    if (i < 0) {
      plates.show(null);
      capBox.classList.remove('is-in');
      capScrim.classList.remove('is-in');
      renderNote.classList.remove('is-in');
      return;
    }
    var s = SCENES[i];
    plates.show(s[0]);
    capH.textContent = s[1];
    capP.textContent = s[2];
    capBox.classList.add('is-in');
    capScrim.classList.add('is-in');
    renderNote.classList.add('is-in');
  }

  /* ── camera comparison copy ─────────────────────────────────────── */
  var camA = q('#camA'), camB = q('#camB'),
      camAN = q('#camAN'), camBN = q('#camBN'), camLabel = q('#camLabel');

  var CAM_DIFFS = [
    ['Aperture',
     'ƒ/1.78, fixed', 'One opening. Always the same size.',
     'ƒ/1.48 – ƒ/4',  'Six blades that physically move behind the lens.'],
    ['Control',
     'Automatic',     'Exposure decided for you.',
     'Manual',        'Aperture, shutter speed, white balance — and a live histogram.'],
    ['And what has not changed',
     '48 MP × 3',     'Wide, Ultra Wide, Telephoto.',
     '48 MP × 3',     'The same three sensors. The new part is the aperture in front of one of them.']
  ];

  function camDiff(i) {
    var box = q('#camDiffs');
    if (i < 0) { box.style.opacity = 0; return; }
    var d = CAM_DIFFS[i];
    /* fade the pair out, swap the copy, fade it back — one highlight
       leaves before the next arrives, never both at once */
    box.style.transition = 'opacity 260ms cubic-bezier(.4,0,.2,1)';
    box.style.opacity = 0;
    camLabel.style.opacity = 0;
    timers.after(270, function () {
      camLabel.textContent = d[0];
      camA.textContent = d[1]; camAN.textContent = d[2];
      camB.textContent = d[3]; camBN.textContent = d[4];
      box.style.opacity = 1;
      camLabel.style.opacity = 1;
    });
  }

  /* ── slide 8 feature chain ──────────────────────────────────────── */
  function feature(i) {
    qa('.feat', slides.s8).forEach(function (f) {
      var k = +f.dataset.f;
      f.classList.toggle('is-on', k === i);
      f.classList.toggle('is-gone', k < i);
    });
  }

  /* ── slide 9 day marks ──────────────────────────────────────────── */
  function dayTo(i) {
    qa('.day__m', slides.s9).forEach(function (m) {
      var k = +m.dataset.d;
      m.classList.toggle('is-in', k <= i);
      m.classList.toggle('is-past', k < i);
    });
    q('#daySun').style.setProperty('--sun', i >= 0 ? 1 : 0);
  }

  /* ═══════════════════ THE RUN OF SHOW ═══════════════════ */

  var SHOW = [

    /* ── 0 · COLD OPEN ─────────────────────────────────────────────
       Black, then one light, then the device. Six presses, because a
       reveal that the presenter cannot pause is a reveal that will be
       rushed on the day. */
    { id: 's0', beats: 6, apply: function (n) {
        upTo(slides.s0, n - 5);
        bloom.classList.toggle('is-on',  n === 1 || n === 2);
        bloom.classList.toggle('is-out', n >= 3);
        lit(n >= 3, 50, 44);
        wallpaper(n >= 3 && n < 4);
        callLens(null); iris(1);

        if (n === 0) { rig.set({ o: 0, s: .62, ry: -30, rx: 8, x: 0, y: 0 }); }
        /* the light, alone */
        if (n === 1) { rig.set({ o: 0, s: .62, ry: -30, rx: 8 }); }
        /* the silhouette: barely there, and still turned away */
        if (n === 2) { rig.set({ o: .34, s: .78, ry: -30, rx: 8 }, 1.1); }
        /* forward, and around to the front */
        if (n === 3) { rig.set({ o: 1, s: 1, ry: 0, rx: 0, x: 0, y: 0 }, 1.0); }
        /* over to the back */
        if (n === 4) { rig.set({ o: 1, s: 1.04, ry: 180, rx: 0 }, 1.3); }
        /* and in to the cameras */
        if (n === 5) { rig.set(lensPose(2.7), 1.5); }
      } },

    /* ── 1 · THE PRODUCT ─────────────────────────────────────────── */
    { id: 's1', beats: 2, apply: function (n) {
        upTo(slides.s1, n);
        lit(true, 66, 46);
        bloom.classList.remove('is-on', 'is-out');
        wallpaper(true); callLens(null); iris(1);
        rig.set({ o: n >= 1 ? 1 : 0, s: n >= 1 ? 1 : .94,
                  x: vw(.26), y: 0, ry: -16, rx: 2, rz: 0 }, 1.6);
      } },

    /* ── 2 · THE QUESTION ────────────────────────────────────────── */
    { id: 's2', beats: 3, apply: function (n) {
        upTo(slides.s2, n);
        lit(true, 50, 50);
        /* the device steps back and out of the way; the words are the
           slide */
        rig.set({ o: .07, s: 1.5, x: 0, y: 0, ry: -14, rx: 0 }, 1.2);
        wallpaper(false);
      } },

    /* ── 3 · BATTERY ─────────────────────────────────────────────── */
    { id: 's3', beats: 8, apply: function (n) {
        upTo(slides.s3, n);
        lit(true, 30, 40);
        rig.set({ o: 0, s: 1.5 }, 2.2);

        var batt = q('#batt'), fill = q('#battFill');

        /* 0–1: the glyph, low.   2: it fills.   3+: it becomes a day. */
        var morphed = n >= 3;
        batt.style.setProperty('--bw', morphed ? '100%' : 'clamp(180px,22vw,300px)');
        batt.style.setProperty('--bh', morphed ? 'clamp(26px,3.4vh,34px)' : 'clamp(80px,11vh,120px)');
        batt.style.setProperty('--br', morphed ? '17px' : '26px');
        batt.style.setProperty('--nub', morphed ? 0 : 1);
        batt.classList.toggle('is-low', n < 2);

        /* Charge remaining at each beat. It fills to full, then spends
           the day — ending with something still in it, which is the
           entire point of the slide. These are an illustration of a
           day's shape, not an Apple measurement, and the script says
           so out loud when it gets here. */
        var level = [9, 9, 100, 100, 100, 78, 52, 28][n];
        fill.style.setProperty('--level', level + '%');
        fill.style.setProperty('--fr', morphed ? '11px' : '18px');

        /* The timeline is carried by the four labelled columns below,
           which light up in order; the bar overhead is doing one job
           only, which is emptying. */
      } },

    /* ── 4 · CAMERA ──────────────────────────────────────────────── */
    { id: 's4', beats: 6, apply: function (n) {
        lit(true, 58, 42);
        wallpaper(false);
        scene(n >= 5 ? 0 : -1);

        /* the headline owns the frame for one beat, then gets out of
           the way of the call-outs */
        q('#s4Head').classList.toggle('is-out', n >= 1);
        exclusive('#s4Calls .callout', 'c', n >= 2 && n <= 4 ? n - 2 : -1);

        if (n === 0) rig.set({ o: 1, s: .96, x: vw(.26), y: 0, ry: 180, rx: 0 }, 1.5);
        if (n === 1) rig.set(nudge(lensPose(2.0), vw(.22)), 1.4);
        if (n >= 2 && n <= 4) rig.set(nudge(lensPose(2.4), vw(.24)), 1.4);
        if (n === 5) rig.set({ o: 0, s: 3.0 }, 1.8);

        callLens(n === 2 ? 'wide' : n === 3 ? 'ultra' : n === 4 ? 'tele' : null);
        /* the iris closes on the main-camera beat, so the one genuinely
           moving part of this camera is seen moving */
        iris(n === 2 ? .52 : 1);
      } },

    /* ── 5 · IN REAL LIFE ────────────────────────────────────────── */
    { id: 's5', beats: 6, apply: function (n) {
        lit(false);
        rig.set({ o: 0 }, 2.4);
        scene(n);
      } },

    /* ── 6 · CAMERA, COMPARED ────────────────────────────────────── */
    { id: 's6', beats: 5, apply: function (n) {
        upTo(slides.s6, n);
        lit(true, 50, 30);
        scene(-1);
        wallpaper(false);

        /* both devices, turned to show their backs, held at the top of
           frame so the copy has the lower half to itself */
        var y = -vh(.17), s = .70;
        altRig.set({ o: n >= 0 ? .92 : 0, s: s, x: -vw(.22), y: y, ry: 180, rx: 4 }, 1.4);
        rig.set(   { o: n >= 1 ? 1 : 0,  s: s, x:  vw(.22), y: y, ry: 180, rx: 4 }, 1.4);

        /* the previous generation has one fixed opening; freeze its
           iris so the difference is visible on the device itself */
        Palt.lenses.wide.iris.style.setProperty('--iris', 1);
        iris(n === 2 ? .5 : 1);

        camDiff(n >= 2 ? n - 2 : -1);
      } },

    /* ── 7 · BATTERY, COMPARED ───────────────────────────────────── */
    { id: 's7', beats: 3, apply: function (n) {
        upTo(slides.s7, n);
        lit(true, 50, 36);
        rig.set({ o: 0 }, 2.2); altRig.set({ o: 0 }, 2.2);
        q('#bar17').classList.toggle('is-in', n >= 0);
        q('#bar18').classList.toggle('is-in', n >= 1);
      } },

    /* ── 8 · EVERYTHING ELSE ─────────────────────────────────────── */
    { id: 's8', beats: 6, apply: function (n) {
        lit(true, 50, 46);
        rig.set({ o: 0 }, 2.6); altRig.set({ o: 0 }, 2.6);
        feature(n);
      } },

    /* ── 9 · A DAY ───────────────────────────────────────────────── */
    { id: 's9', beats: 7, apply: function (n) {
        upTo(slides.s9, n === 6 ? 6 : 0);
        lit(true, 50, 24);
        dayTo(n - 1);
        /* The device physically walks the timeline, one stop per press.
           Lane positions are measured off the marks themselves rather
           than guessed as fractions of the viewport — the day block is
           max-width capped, so a vw fraction drifts out of alignment on
           a wide screen. */
        var i = U.clamp(n - 1, 0, 4);
        var mark = qa('.day__m', slides.s9)[i];
        var mx = 0;
        if (mark) {
          var r = mark.getBoundingClientRect();
          mx = (r.left + r.width / 2) - global.innerWidth / 2;
        }
        rig.set({
          o: n >= 1 ? 1 : 0,
          s: .28,
          x: mx,
          y: -vh(.22),
          ry: -10 + i * 5, rx: 0
        }, 1.5);
      } },

    /* ── 10 · THE BIG PICTURE ────────────────────────────────────── */
    { id: 's10', beats: 4, apply: function (n) {
        upTo(slides.s10, n);
        lit(true, 50, 50);
        wallpaper(true);
        /* the words step aside so the device can have the frame */
        q('#s10Body').classList.toggle('is-cleared', n >= 3);
        rig.set({ o: n >= 3 ? 1 : 0, s: n >= 3 ? .92 : .8,
                  x: 0, y: 0, ry: 0, rx: 0 }, 1.0);
      } },

    /* ── 11 · FINAL ──────────────────────────────────────────────── */
    { id: 's11', beats: 5, apply: function (n) {
        upTo(slides.s11, n);
        bloom.classList.toggle('is-on',  n === 1);
        bloom.classList.toggle('is-out', n >= 2);
        lit(n >= 2, 50, 46);
        wallpaper(n >= 2);
        rig.set({
          o: n === 0 ? 0 : n === 1 ? .16 : 1,
          s: n >= 2 ? .82 : .68,
          x: 0,
          /* rises to make room for the name once it arrives */
          y: n >= 3 ? -vh(.17) : -vh(.04),
          ry: 0, rx: 0
        }, n >= 2 ? 1.0 : 1.6);
      } }
  ];

  /* ── flatten to a single list of clicker presses ─────────────────── */
  var STEPS = [];
  SHOW.forEach(function (sl, si) {
    for (var b = 0; b < sl.beats; b++) STEPS.push({ slide: si, beat: b });
  });

  var at = 0;

  function render(i, instant) {
    at = U.clamp(i, 0, STEPS.length - 1);
    var st = STEPS[at];
    var sl = SHOW[st.slide];

    timers.clear();
    live(sl.id);
    sl.apply(st.beat);

    /* A jump of more than one slide is navigation, not choreography —
       land the device rather than flying it across the deck. */
    if (instant) rig.snap({});

    var pct = (at / (STEPS.length - 1)) * 100;
    q('#progF').style.width = pct + '%';

    qa('.pip').forEach(function (p, k) {
      p.classList.toggle('is-here', k === st.slide);
      p.classList.toggle('is-done', k < st.slide);
    });
    doc.title = (st.slide === 0 || st.slide === 11)
      ? 'iPhone 18 Pro Max — More of what matters'
      : 'iPhone 18 Pro Max — ' + (st.slide) + '/' + (SHOW.length - 1);
  }

  function next() { if (at < STEPS.length - 1) render(at + 1); }
  function prev() { if (at > 0) render(at - 1); }
  function toSlide(si) {
    var i = 0;
    for (var k = 0; k < STEPS.length; k++) if (STEPS[k].slide === si) { i = k; break; }
    render(i, true);
  }

  /* ── pips ───────────────────────────────────────────────────────── */
  var pips = q('#pips');
  SHOW.forEach(function (_, i) {
    var p = doc.createElement('span');
    p.className = 'pip';
    pips.appendChild(p);
  });

  /* ── input ──────────────────────────────────────────────────────── */
  var info = q('#info');
  function toggleInfo(force) {
    var open = force != null ? force : !info.classList.contains('is-open');
    info.classList.toggle('is-open', open);
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
    else if (k === 'End')  { e.preventDefault(); render(STEPS.length - 1, true); }
    else if (k === 'f' || k === 'F') {
      e.preventDefault();
      if (doc.fullscreenElement) doc.exitFullscreen();
      else if (doc.documentElement.requestFullscreen) doc.documentElement.requestFullscreen();
    }
    else if (k >= '0' && k <= '9') { e.preventDefault(); toSlide(+k); }
  });

  q('#tapNext').addEventListener('click', function () { if (!info.classList.contains('is-open')) next(); });
  q('#tapPrev').addEventListener('click', function () { if (!info.classList.contains('is-open')) prev(); });
  info.addEventListener('click', function () { toggleInfo(false); });

  /* touch: swipe horizontally */
  var tx = 0, ty = 0;
  doc.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY;
  }, { passive: true });
  doc.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
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

  /* ── the screen catches the light as the device turns ───────────── */
  global.KN.add(function () {
    var ry = rig.current.ry;
    /* map the facing angle onto the sheen's travel across the glass */
    var t = Math.sin(ry * Math.PI / 180);
    P.glare.style.setProperty('--glare', U.round(t * 44, 2) + '%');
  }, 'glare');

  /* re-measure the poses that are computed from viewport size */
  var rt;
  global.addEventListener('resize', function () {
    global.clearTimeout(rt);
    rt = global.setTimeout(function () { render(at, true); }, 160);
  });

  /* ── go ─────────────────────────────────────────────────────────── */
  global.KN.start();
  render(0);
  stir();

  /* exposed for the console during rehearsal */
  global.KN.deck = { next: next, prev: prev, to: toSlide, steps: STEPS.length };
})(window);
