/* ═══════════════════════════════════════════════════════════════════
   site.js — everything the page actually does.

   Sections are wired as independent modules that all subscribe to the
   one clock in core.js. Nothing polls, nothing sets an interval, and
   no module reads layout outside its frame callback.

   The organising idea: the scroll position is a flight. Altitude,
   Mach and phase in the corner readout are computed from scroll
   progress through a real climb/cruise/descent profile, so the number
   in the HUD is never decorative — it is where you are on the page.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AX = global.AX, U = AX.U, S = AX.S, P = AX.P;
  var doc = global.document;
  var fleet = AX.fleet;

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }

  /* ═══════════════ 1. pre-flight boot ═══════════════
     Short, skippable, and gated so that a failed script leaves a
     readable page rather than a permanent overlay. */

  function boot() {
    var el = $('#boot');
    if (!el) return done();
    var label = $('#bootLabel');
    var bar = $('#bootBar');
    var lines = ['FLIGHT CONTROLS', 'HYDRAULICS 1–3', 'FUEL · 84 200 KG', 'NAV DATABASE', 'CABIN READY'];
    var i = 0, t = 0, p = 0;

    var sub = AX.add(function (dt) {
      t += dt;
      p = U.clamp(t / 1.45, 0, 1);
      if (bar) bar.style.transform = 'scaleX(' + p + ')';
      var idx = Math.min(lines.length - 1, Math.floor(p * lines.length));
      if (idx !== i) { i = idx; if (label) label.textContent = lines[i]; }
      if (p >= 1) {
        sub.active = false;
        el.classList.add('is-out');
        done();
        global.setTimeout(function () { el.remove(); }, 900);
      }
    }, 'boot');

    function skip() { t = 1.45; }
    el.addEventListener('click', skip);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') skip(); });
  }

  function done() {
    doc.documentElement.classList.remove('is-booting');
    doc.documentElement.classList.add('is-ready');
  }

  /* ═══════════════ 2. navigation ═══════════════ */

  function nav() {
    var bar = $('#nav');
    var prog = $('#navProg');
    var toggle = $('#navToggle');
    var links = $$('.nav__links a');
    var sections = links.map(function (a) { return $(a.getAttribute('href')); });

    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = bar.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        doc.body.classList.toggle('nav-locked', open);
      });
      links.forEach(function (a) {
        a.addEventListener('click', function () {
          bar.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          doc.body.classList.remove('nav-locked');
        });
      });
    }

    var lastY = 0;
    AX.add(function () {
      var y = S.smooth;
      bar.classList.toggle('is-stuck', y > 40);
      /* hide going down, show going up — but never while the menu is
         open, and never in the first viewport */
      if (!bar.classList.contains('is-open')) {
        bar.classList.toggle('is-hidden', y > S.vh * 0.9 && y > lastY + 4);
      }
      if (Math.abs(y - lastY) > 4) lastY = y;

      if (prog) prog.style.transform = 'scaleX(' + S.progress.toFixed(4) + ')';

      /* active link: the last section whose top is above the fold line */
      var active = -1;
      for (var i = 0; i < sections.length; i++) {
        if (!sections[i]) continue;
        if (sections[i].getBoundingClientRect().top <= S.vh * 0.42) active = i;
      }
      for (var j = 0; j < links.length; j++) {
        links[j].classList.toggle('is-active', j === active);
      }
    }, 'nav');
  }

  /* ═══════════════ 3. flight HUD ═══════════════
     Scroll progress run through a climb profile. Not a decoration:
     these are the real numbers for where you are in the document. */

  function hud() {
    var elPhase = $('#hudPhase');
    var elAlt = $('#hudAlt');
    var elMach = $('#hudMach');
    var elTape = $('#hudTape');
    var host = $('.hud');
    if (!elPhase || !host) return;

    var PHASES = [
      [0.00, 'TAXI'], [0.06, 'ROTATE'], [0.13, 'CLIMB'],
      [0.40, 'CRUISE'], [0.74, 'DESCENT'], [0.90, 'APPROACH']
    ];
    var shownAlt = 0, shownMach = 0, lastPhase = '';

    AX.add(function (dt) {
      var p = S.progress;

      /* altitude: climb to FL380, hold, descend */
      var alt;
      if (p < 0.08) alt = U.norm(p, 0, 0.08) * 1200;
      else if (p < 0.40) alt = U.lerp(1200, 38000, U.easeOut(U.norm(p, 0.08, 0.40)));
      else if (p < 0.74) alt = 38000 + Math.sin(p * 40) * 120;
      else alt = U.lerp(38000, 0, U.easeInOut(U.norm(p, 0.74, 1)));

      var mach;
      if (p < 0.13) mach = U.norm(p, 0, 0.13) * 0.42;
      else if (p < 0.40) mach = U.lerp(0.42, 0.85, U.norm(p, 0.13, 0.40));
      else if (p < 0.74) mach = 0.85 - Math.sin(p * 26) * 0.004;
      else mach = U.lerp(0.85, 0.24, U.norm(p, 0.74, 1));

      shownAlt = U.damp(shownAlt, alt, 6, dt);
      shownMach = U.damp(shownMach, mach, 6, dt);

      elAlt.textContent = U.group(Math.round(shownAlt / 50) * 50);
      elMach.textContent = shownMach.toFixed(2);

      var ph = PHASES[0][1];
      for (var i = 0; i < PHASES.length; i++) if (p >= PHASES[i][0]) ph = PHASES[i][1];
      if (ph !== lastPhase) {
        lastPhase = ph;
        elPhase.textContent = ph;
        elPhase.classList.remove('is-flip');
        void elPhase.offsetWidth;         /* restart the flip */
        elPhase.classList.add('is-flip');
      }
      if (elTape) elTape.style.transform = 'scaleY(' + (shownAlt / 38000).toFixed(4) + ')';

      /* a fixed overlay will eventually sit over something the reader
         wants to click. Rather than reserve a corner of every section
         for it, it simply gets out of the way. */
      if (P.cx != null) {
        var r = host.getBoundingClientRect();
        var near = P.cx < r.right + 40 && P.cy > r.top - 40;
        host.classList.toggle('is-dodging', near);
      }
    }, 'hud');
  }

  /* ═══════════════ 4. hero ═══════════════ */

  function hero() {
    var sec = $('#top');
    if (!sec) return;
    var plane = $('#heroPlane');
    var canvas = $('#skyCanvas');
    var title = $('#heroTitle');
    var sky = null;

    /* split the headline into spans so each word can rise on its own
       delay. Done in JS so the markup stays readable and the page
       still makes sense with scripts off. */
    if (title) {
      var html = title.innerHTML.split(/(<br\s*\/?>)/i).map(function (chunk) {
        if (/^<br/i.test(chunk)) return chunk;
        return chunk.split(/\s+/).filter(Boolean).map(function (w) {
          return '<span class="w"><i>' + w + '</i></span>';
        }).join(' ');
      }).join('');
      title.innerHTML = html;
      $$('.w i', title).forEach(function (el, i) { el.style.setProperty('--d', (i * 62) + 'ms'); });
    }

    if (canvas) sky = AX.sky.init(canvas, plane);

    /* the hero aircraft: a side profile of the widebody, drawn from the
       same parameter set the fleet section uses */
    if (plane) {
      var g = fleet.byId('a350').g;
      var pr = fleet.profile(g);
      plane.setAttribute('viewBox', (-g.len * 0.06) + ' ' + (-g.fuseW * 2.6) + ' ' + (g.len * 1.14) + ' ' + (g.fuseW * 4.6));
      plane.innerHTML = [
        '<g class="pl">',
        '<path class="pl__far" d="' + pr.wingFar + '"/>',
        pr.nacFar ? '<path class="pl__far" d="' + pr.nacFar.pylon + '"/><path class="pl__far" d="' + pr.nacFar.d + '"/>' : '',
        '<path class="pl__body" d="' + pr.fuse + '"/>',
        '<path class="pl__fin" d="' + pr.fin + '"/>',
        '<path class="pl__fin" d="' + pr.ht + '"/>',
        '<path class="pl__wing" d="' + pr.wingNear + '"/>',
        pr.nacNear ? '<path class="pl__pylon" d="' + pr.nacNear.pylon + '"/><path class="pl__nac" d="' + pr.nacNear.d + '"/>' : '',
        '<path class="pl__glass" d="' + pr.cockpit + '"/>',
        pr.windows.map(function (d) { return '<path class="pl__win" d="' + d + '"/>'; }).join(''),
        '</g>'
      ].join('');
    }

    var scrollCue = $('#scrollCue');

    AX.scene(sec, function (p, r, dt, now) {
      var t = now / 1000;
      /* the aircraft floats, banks with the pointer, and climbs out of
         frame as you scroll away */
      if (plane) {
        var bob = Math.sin(t * 0.62) * 1.1 + Math.sin(t * 0.31) * 0.7;
        var bank = P.sx * 2.4;
        var rise = -S.smooth * 0.26;
        var drift = P.sx * 14 - S.smooth * 0.05;
        plane.style.transform =
          'translate3d(' + drift.toFixed(2) + 'px,' + (bob + rise).toFixed(2) + 'px,0)' +
          ' rotate(' + (bank - 1.6).toFixed(2) + 'deg)' +
          ' scale(' + (1 + S.smooth / S.vh * 0.10).toFixed(4) + ')';
      }
      if (scrollCue) {
        scrollCue.style.opacity = U.clamp(1 - S.smooth / (S.vh * 0.35), 0, 1);
      }
    });

    /* cull the sky renderer once it is well off screen */
    AX.add(function () {
      if (!sky) return;
      sky.setVisible(S.smooth < S.vh * 1.6);
    }, 'sky-cull');
  }

  /* ═══════════════ 5. fleet showcase ═══════════════
     The morph. Two parameter sets, one interpolation factor, paths
     regenerated per frame. Specs are interpolated alongside, so the
     numbers travel between aircraft instead of snapping. */

  function fleetShowcase() {
    var root = $('#fleet');
    if (!root) return;

    var svg = $('#planSvg');
    var tabs = $$('[data-type]', root);
    var nameEl = $('#fleetName');
    var roleEl = $('#fleetRole');
    var tagEl = $('#fleetTagline');
    var blurbEl = $('#fleetBlurb');
    /* deliberately document-wide, not scoped to this section: the
       performance panel further down binds the same keys and has to
       travel with the morph too */
    var statEls = $$('[data-stat]');
    var bars = $$('[data-bar]');

    var types = fleet.TYPES;
    var cur = 2;                    /* open on the A350 */
    var from = types[cur], to = types[cur], k = 1;
    var speed = 1 / 0.85;

    var NODES = {};
    function buildSvg() {
      svg.innerHTML =
        '<g id="planG">' +
        '<path class="pv pv--wing" id="pWingL"/>' +
        '<path class="pv pv--wing" id="pWingR"/>' +
        '<path class="pv pv--tail" id="pHtL"/>' +
        '<path class="pv pv--tail" id="pHtR"/>' +
        '<path class="pv pv--body" id="pFuse"/>' +
        '<path class="pv pv--fin"  id="pFin"/>' +
        '<path class="pv pv--nac" id="pN0"/><path class="pv pv--nac" id="pN1"/>' +
        '<path class="pv pv--nac" id="pN2"/><path class="pv pv--nac" id="pN3"/>' +
        '<path class="pv pv--win" id="pW0"/><path class="pv pv--win" id="pW1"/>' +
        '</g>';
      ['planG', 'pWingL', 'pWingR', 'pHtL', 'pHtR', 'pFuse', 'pFin',
        'pN0', 'pN1', 'pN2', 'pN3', 'pW0', 'pW1'].forEach(function (id) {
          NODES[id] = svg.querySelector('#' + id);
        });
    }
    buildSvg();

    /* the reference maxima the bars are scaled against — fixed, so a
       bar length means the same thing whichever aircraft is selected */
    var MAX = { range_km: 16100, seats: 853, mtow: 575000, span: 79.75, length: 73.79, ceiling: 43100 };

    function render(g, specs, hue) {
      var pl = fleet.plan(g);
      NODES.pFuse.setAttribute('d', pl.fuse);
      NODES.pWingL.setAttribute('d', pl.wingL);
      NODES.pWingR.setAttribute('d', pl.wingR);
      NODES.pHtL.setAttribute('d', pl.htL);
      NODES.pHtR.setAttribute('d', pl.htR);
      NODES.pFin.setAttribute('d', pl.fin);
      for (var i = 0; i < 4; i++) {
        var nd = NODES['pN' + i], nac = pl.nacelles[i];
        if (nac) { nd.setAttribute('d', nac.d); nd.style.opacity = nac.o; }
        else { nd.setAttribute('d', ''); nd.style.opacity = 0; }
      }
      NODES.pW0.setAttribute('d', pl.win0);
      NODES.pW1.setAttribute('d', pl.win1);
      NODES.pW1.style.opacity = U.clamp(g.decks - 1, 0, 1);

      /* frame the drawing: the viewBox follows the aircraft, so each
         type fills the panel while the geometry stays true to metres */
      var m = Math.max(g.len, g.span) * 0.07;
      svg.setAttribute('viewBox',
        (-m).toFixed(1) + ' ' + (-(g.span / 2 + m)).toFixed(1) + ' ' +
        (g.len + m * 2).toFixed(1) + ' ' + (g.span + m * 2).toFixed(1));
      svg.style.setProperty('--hue', hue);

      statEls.forEach(function (el) {
        var key = el.dataset.stat;
        var v = specs[key];
        if (v == null) return;
        var dp = parseInt(el.dataset.dp || '0', 10);
        el.textContent = dp ? v.toFixed(dp) : U.group(v);
      });
      bars.forEach(function (el) {
        var key = el.dataset.bar;
        var v = specs[key] != null ? specs[key] : 0;
        el.style.setProperty('--v', U.clamp(v / MAX[key], 0, 1).toFixed(4));
      });
    }

    function mixHue(a, b, t) {
      function rgb(h) {
        h = h.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      var A = rgb(a), B = rgb(b);
      return 'rgb(' + Math.round(U.lerp(A[0], B[0], t)) + ',' +
        Math.round(U.lerp(A[1], B[1], t)) + ',' + Math.round(U.lerp(A[2], B[2], t)) + ')';
    }

    function select(i) {
      if (i === cur && k >= 1) return;
      from = (k < 1) ? { g: fleet.lerpG(from.g, to.g, U.easeInOut(k)), specs: fleet.lerpSpecs(from.specs, to.specs, U.easeInOut(k)), hue: mixHue(from.hue, to.hue, k) } : to;
      to = types[i];
      cur = i;
      k = 0;
      tabs.forEach(function (t, j) {
        t.classList.toggle('is-active', j === i);
        t.setAttribute('aria-selected', String(j === i));
        t.tabIndex = j === i ? 0 : -1;
      });
      /* text swaps at the midpoint of the morph, not the start */
      global.setTimeout(function () {
        if (cur !== i) return;
        [[nameEl, types[i].name], [roleEl, types[i].role],
         [tagEl, types[i].tagline], [blurbEl, types[i].blurb]].forEach(function (pair) {
          if (!pair[0]) return;
          pair[0].classList.add('is-swap');
          global.setTimeout(function () {
            pair[0].textContent = pair[1];
            pair[0].classList.remove('is-swap');
          }, 160);
        });
        root.style.setProperty('--fleet-hue', types[i].hue);
        doc.dispatchEvent(new global.CustomEvent('fleet:change', { detail: types[i] }));
      }, 90);
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = (cur + d + tabs.length) % tabs.length;
        tabs[n].focus();
        select(n);
      });
    });

    AX.add(function (dt) {
      if (k < 1) {
        k = Math.min(1, k + dt * speed);
        var e = U.easeInOut(k);
        render(fleet.lerpG(from.g, to.g, e), fleet.lerpSpecs(from.specs, to.specs, e), mixHue(from.hue, to.hue, e));
      }
    }, 'fleet-morph');

    /* pointer tilt on the drawing — small, and only when it is on screen */
    var stage = $('#planStage');
    if (stage) {
      AX.scene(stage, function () {
        var rx = (-P.sy * 3.2).toFixed(2), ry = (P.sx * 4.6).toFixed(2);
        stage.style.transform = 'perspective(1400px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
      });
    }

    /* the honest scale strip: all four to a single metre scale */
    var strip = $('#spanStrip');
    if (strip) {
      strip.innerHTML = types.map(function (t) {
        return '<div class="span__row" data-stagger>' +
          '<span class="span__name mono">' + t.name + '</span>' +
          '<span class="span__track"><i style="--w:' + (t.specs.span / MAX.span).toFixed(4) + ';--c:' + t.hue + '"></i></span>' +
          '<span class="span__val mono">' + t.specs.span.toFixed(2) + ' m</span>' +
          '</div>';
      }).join('');
    }

    /* paint the initial tab state directly — select() short-circuits when
       asked for the type it already considers current */
    tabs.forEach(function (t, j) {
      t.classList.toggle('is-active', j === cur);
      t.setAttribute('aria-selected', String(j === cur));
      t.tabIndex = j === cur ? 0 : -1;
    });
    render(types[cur].g, types[cur].specs, types[cur].hue);
    root.style.setProperty('--fleet-hue', types[cur].hue);
  }

  /* ═══════════════ 6. anatomy — sticky scroll scene ═══════════════
     The aircraft draws itself in, then five callouts fire at fixed
     offsets with leader lines that extend as they arrive. */

  function anatomy() {
    var track = $('#anatomyTrack');
    if (!track) return;
    var svg = $('#anatomySvg');
    var callouts = $$('.callout', track);

    var g = fleet.byId('a350').g;
    var pr = fleet.profile(g);

    svg.setAttribute('viewBox', (-g.len * 0.05) + ' ' + (-g.fuseW * 2.4) + ' ' + (g.len * 1.12) + ' ' + (g.fuseW * 4.4));
    svg.innerHTML = [
      '<g class="an">',
      '<path class="an__ghost" d="' + pr.wingFar + '"/>',
      pr.nacFar ? '<path class="an__ghost" d="' + pr.nacFar.d + '"/>' : '',
      '<path class="an__fill an__fill--deep" d="' + pr.fuse + '"/>',
      '<path class="an__fill" d="' + pr.fin + '"/>',
      '<path class="an__fill" d="' + pr.ht + '"/>',
      '<path class="an__fill" d="' + pr.wingNear + '"/>',
      pr.nacNear ? '<path class="an__fill an__fill--deep" d="' + pr.nacNear.d + '"/>' : '',
      '<path class="an__line" d="' + pr.fuse + '"/>',
      '<path class="an__line" d="' + pr.fin + '"/>',
      '<path class="an__line" d="' + pr.ht + '"/>',
      '<path class="an__line" d="' + pr.wingNear + '"/>',
      pr.nacNear ? '<path class="an__line" d="' + pr.nacNear.pylon + '"/><path class="an__line" d="' + pr.nacNear.d + '"/>' : '',
      '<path class="an__line" d="' + pr.cockpit + '"/>',
      pr.windows.map(function (d) { return '<path class="an__win" d="' + d + '"/>'; }).join(''),
      '</g>'
    ].join('');

    /* measure every stroke so the draw-on is proportional to its real
       length — short paths do not finish instantly while long ones crawl */
    var strokes = $$('.an__line, .an__win', svg);
    var total = 0;
    strokes.forEach(function (p) {
      var L = 0;
      try { L = p.getTotalLength(); } catch (e) { L = 400; }
      p._len = L || 400;
      total += p._len;
    });
    var acc = 0;
    strokes.forEach(function (p) {
      p._start = acc / total;
      acc += p._len;
      p._end = acc / total;
      p.style.strokeDasharray = p._len;
      p.style.strokeDashoffset = p._len;
    });

    AX.scene(track, function (p) {
      var draw = U.norm(p, 0.02, 0.40);
      strokes.forEach(function (s) {
        var local = U.norm(draw, s._start, s._end);
        s.style.strokeDashoffset = (s._len * (1 - U.easeOut(local))).toFixed(1);
      });
      $$('.an__ghost', svg).forEach(function (el) {
        el.style.opacity = (U.norm(p, 0.30, 0.52) * 0.5).toFixed(3);
      });
      /* the body arrives once the outline has been laid down */
      var body = U.norm(p, 0.34, 0.50);
      $$('.an__fill', svg).forEach(function (el) { el.style.opacity = body.toFixed(3); });

      /* the drawing drifts and eases in as the section runs */
      var scale = U.lerp(0.94, 1.10, U.easeInOut(U.clamp(p, 0, 1)));
      var ty = U.lerp(14, -14, p);
      svg.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0) scale(' + scale.toFixed(3) + ')';

      callouts.forEach(function (c, i) {
        var at = 0.30 + i * 0.132;
        var on = U.norm(p, at, at + 0.042);
        var off = 1 - U.norm(p, at + 0.088, at + 0.124);
        var v = Math.min(on, off);
        c.style.setProperty('--on', v.toFixed(3));
        c.classList.toggle('is-on', v > 0.04);
      });
    }, { mode: 'sticky' });
  }

  /* ═══════════════ 7. performance — payload/range ═══════════════
     A real payload-range diagram: the flat max-payload segment, the
     knee where you start trading payload for fuel, and the ferry tail.
     One measure per axis, one series, direct-labelled, hover crosshair. */

  function performance() {
    var wrap = $('#perfChart');
    if (!wrap) return;
    var cv = $('#perfCanvas');
    var ctx = cv.getContext('2d');
    var readout = $('#perfReadout');
    var titleEl = $('#perfTitle');

    var type = fleet.byId('a350');
    var shown = { hue: type.hue, r: type.specs.range_km, payload: 0, seats: type.specs.seats };
    var target = null;
    var hoverX = -1;
    var W = 0, H = 0;
    var PAD = { l: 56, r: 22, t: 26, b: 38 };

    function payloadOf(t) {
      /* structural payload ≈ passengers at 100 kg all-in, plus belly
         cargo that scales with fuselage volume. Illustrative, and
         labelled as such on the page. */
      return Math.round(t.specs.seats * 100 + t.specs.mtow * 0.055);
    }

    function curve(t) {
      var maxR = t.specs.range_km;
      var maxP = payloadOf(t);
      return [
        { r: 0, p: maxP },
        { r: maxR * 0.56, p: maxP },            /* max payload limit */
        { r: maxR, p: maxP * 0.62 },            /* max fuel limit */
        { r: maxR * 1.20, p: 0 }                /* ferry */
      ];
    }

    function xOf(r, maxR) { return PAD.l + (r / maxR) * (W - PAD.l - PAD.r); }
    function yOf(p, maxP) { return H - PAD.b - (p / maxP) * (H - PAD.t - PAD.b); }

    function draw() {
      var m = AX.fitCanvas(cv, ctx);
      W = m.w; H = m.h;
      ctx.clearRect(0, 0, W, H);
      if (W < 40) return;

      var pts = curve(type);
      var maxR = type.specs.range_km * 1.30;
      var maxP = payloadOf(type) * 1.12;
      var hue = type.hue;

      /* recessive grid — 4 steps, no chartjunk */
      ctx.strokeStyle = 'rgba(150,182,224,0.10)';
      ctx.lineWidth = 1;
      ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(198,218,246,0.46)';
      ctx.textBaseline = 'middle';
      var i, y, x;
      for (i = 0; i <= 4; i++) {
        y = PAD.t + (H - PAD.t - PAD.b) * (i / 4);
        ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxP * (1 - i / 4) / 1000) + 't', PAD.l - 9, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (i = 0; i <= 4; i++) {
        x = PAD.l + (W - PAD.l - PAD.r) * (i / 4);
        ctx.fillText(U.group(Math.round(maxR * i / 4 / 100) * 100), x, H - PAD.b + 10);
      }

      /* the envelope fill */
      var grd = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
      grd.addColorStop(0, hexA(hue, 0.26));
      grd.addColorStop(1, hexA(hue, 0.02));
      ctx.beginPath();
      ctx.moveTo(xOf(0, maxR), yOf(0, maxP));
      pts.forEach(function (pt) { ctx.lineTo(xOf(pt.r, maxR), yOf(pt.p, maxP)); });
      ctx.lineTo(xOf(pts[pts.length - 1].r, maxR), yOf(0, maxP));
      ctx.closePath();
      ctx.fillStyle = grd; ctx.fill();

      /* the boundary: 2px, rounded joins */
      ctx.beginPath();
      pts.forEach(function (pt, j) {
        var px = xOf(pt.r, maxR), py = yOf(pt.p, maxP);
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = hue; ctx.lineWidth = 2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();

      /* the two corners that actually matter, direct-labelled */
      [[1, 'MAX PAYLOAD'], [2, 'MAX FUEL']].forEach(function (pair) {
        var pt = pts[pair[0]];
        var px = xOf(pt.r, maxR), py = yOf(pt.p, maxP);
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0A1120'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = hue; ctx.stroke();
        ctx.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillStyle = 'rgba(212,230,255,0.72)';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(pair[1], px + 8, py - 6);
      });

      /* hover crosshair + readout */
      if (hoverX >= PAD.l && hoverX <= W - PAD.r) {
        var r = (hoverX - PAD.l) / (W - PAD.l - PAD.r) * maxR;
        var p = payloadAt(pts, r);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(200,224,255,0.34)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hoverX, PAD.t); ctx.lineTo(hoverX, H - PAD.b); ctx.stroke();
        ctx.setLineDash([]);
        if (p > 0) {
          var hy = yOf(p, maxP);
          ctx.beginPath(); ctx.arc(hoverX, hy, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = hue; ctx.fill();
          ctx.strokeStyle = '#070C18'; ctx.lineWidth = 2; ctx.stroke();
        }
        if (readout) {
          readout.hidden = false;
          readout.innerHTML =
            '<b>' + U.group(Math.round(r / 10) * 10) + '</b> km &nbsp;·&nbsp; ' +
            '<b>' + (p > 0 ? U.group(Math.round(p / 100) * 100) : '0') + '</b> kg payload' +
            (p > 0 ? ' &nbsp;·&nbsp; ≈ <b>' + Math.round(p / 100) + '</b> pax-equivalent' : ' &nbsp;·&nbsp; beyond range');
        }
      } else if (readout) {
        readout.hidden = true;
      }
    }

    function payloadAt(pts, r) {
      for (var i = 1; i < pts.length; i++) {
        if (r <= pts[i].r) {
          var t = U.norm(r, pts[i - 1].r, pts[i].r);
          return U.lerp(pts[i - 1].p, pts[i].p, t);
        }
      }
      return 0;
    }

    function hexA(hex, a) {
      var h = hex.replace('#', '');
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }

    cv.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      hoverX = e.clientX - r.left;
      dirty = true;
    });
    cv.addEventListener('pointerleave', function () { hoverX = -1; dirty = true; });

    var dirty = true;
    AX.onResize(function () { dirty = true; });
    doc.addEventListener('fleet:change', function (e) {
      type = e.detail;
      dirty = true;
      if (titleEl) titleEl.textContent = type.name;
    });

    var sc = AX.scene(wrap, function () { if (dirty) { draw(); dirty = false; } });
    /* redraw when it first scrolls into view, whatever happened before */
    sc.fn.visibility = function (v) { if (v) dirty = true; };
    if (titleEl) titleEl.textContent = type.name;
    draw();
  }

  /* ═══════════════ 8. network ═══════════════ */

  function network() {
    var sec = $('#network');
    if (!sec) return;
    var cv = $('#globeCanvas');
    var list = $('#routeList');
    var g = AX.globe.init(cv);
    var type = fleet.byId('a350');
    g.setAircraft({ hue: type.hue, range_km: type.specs.range_km, mach: type.specs.mach });

    function paint() {
      list.innerHTML = g.routes.map(function (r, i) {
        var ok = r.km <= type.specs.range_km;
        var bt = g.blockTime(r.km, type.specs.mach);
        return '<button class="route' + (ok ? '' : ' is-out') + '" data-r="' + i + '" type="button">' +
          '<span class="route__code mono">' + r.code + '</span>' +
          '<span class="route__label">' + r.label + '</span>' +
          '<span class="route__km mono">' + U.group(r.km) + ' km</span>' +
          '<span class="route__time mono">' + (ok ? bt.h + 'h ' + U.pad(bt.m, 2) : 'OUT OF RANGE') + '</span>' +
          '</button>';
      }).join('');
    }
    paint();

    list.addEventListener('pointerover', function (e) {
      var b = e.target.closest('.route');
      g.setHover(b ? +b.dataset.r : -1);
    });
    list.addEventListener('pointerleave', function () { g.setHover(-1); });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('.route');
      if (!b) return;
      $$('.route', list).forEach(function (x) { x.classList.remove('is-sel'); });
      b.classList.add('is-sel');
      g.select(+b.dataset.r);
    });
    list.addEventListener('focusin', function (e) {
      var b = e.target.closest('.route');
      if (b) g.setHover(+b.dataset.r);
    });

    doc.addEventListener('fleet:change', function (e) {
      type = e.detail;
      g.setAircraft({ hue: type.hue, range_km: type.specs.range_km, mach: type.specs.mach });
      sec.style.setProperty('--fleet-hue', type.hue);
      var label = $('#netType');
      if (label) label.textContent = type.name;
      paint();
    });

    AX.scene(sec, function () {}, {});
    var sub = AX.add(function () {
      var r = sec.getBoundingClientRect();
      g.setVisible(r.bottom > -200 && r.top < S.vh + 200);
    }, 'globe-cull');
  }

  /* ═══════════════ 9. cabin lighting programme ═══════════════ */

  function cabin() {
    var sec = $('#cabin');
    if (!sec) return;
    var stage = $('#cabinStage');
    var steps = $$('.lite', sec);
    var SCENES = [
      { id: 'boarding', a: '#2A3F66', b: '#6E86B8', c: '#0D1730' },
      { id: 'climb',    a: '#12325C', b: '#3E7FB8', c: '#081428' },
      { id: 'night',    a: '#0B1430', b: '#1E2C56', c: '#04070F' },
      { id: 'sunrise',  a: '#5A2E3C', b: '#C6693A', c: '#150B18' },
      { id: 'arrival',  a: '#1E4250', b: '#58A8A2', c: '#07151C' }
    ];
    var cur = 0, next = 0, k = 1, auto = 0, manual = false;

    function apply(t) {
      var A = SCENES[cur], B = SCENES[next];
      function mix(x, y) {
        function rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
        var p = rgb(x), q = rgb(y);
        return 'rgb(' + Math.round(U.lerp(p[0], q[0], t)) + ',' + Math.round(U.lerp(p[1], q[1], t)) + ',' + Math.round(U.lerp(p[2], q[2], t)) + ')';
      }
      stage.style.setProperty('--ca', mix(A.a, B.a));
      stage.style.setProperty('--cb', mix(A.b, B.b));
      stage.style.setProperty('--cc', mix(A.c, B.c));
      steps.forEach(function (s, i) { s.classList.toggle('is-on', i === (t > 0.5 ? next : cur)); });
    }

    steps.forEach(function (s, i) {
      s.addEventListener('click', function () {
        manual = true; cur = next; next = i; k = 0; auto = 0;
      });
    });

    var visible = false;
    AX.scene(sec, function (p, r) {
      visible = r.top < S.vh * 0.9 && r.bottom > 0;
    });

    AX.add(function (dt) {
      if (!visible) return;
      if (k < 1) { k = Math.min(1, k + dt / 1.1); apply(U.easeInOut(k)); }
      else if (!manual && !AX.reduced()) {
        auto += dt;
        if (auto > 3.4) { auto = 0; cur = next; next = (next + 1) % SCENES.length; k = 0; }
      }
    }, 'cabin');

    apply(1);
  }

  /* ═══════════════ 10. counters ═══════════════ */

  function counters() {
    $$('[data-count]').forEach(function (el) {
      var to = parseFloat(el.dataset.count);
      var dp = parseInt(el.dataset.dp || '0', 10);
      var t = 0, running = false;
      var io = new global.IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { running = true; io.disconnect(); }
      }, { threshold: 0.4 });
      io.observe(el);
      AX.add(function (dt) {
        if (!running || t >= 1) return;
        t = Math.min(1, t + dt / 1.5);
        var v = to * U.easeOut(t);
        el.textContent = dp ? v.toFixed(dp) : U.group(v);
      }, 'count');
    });
  }

  /* ═══════════════ 11. reticle ═══════════════
     A cursor accent, not a cursor replacement — the real pointer stays
     visible, which keeps the page usable. Fine pointers only. */

  function reticle() {
    if (!global.matchMedia('(pointer:fine)').matches || AX.reduced()) return;
    var el = doc.createElement('div');
    el.className = 'reticle';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<i></i><i></i><i></i><i></i>';
    doc.body.appendChild(el);
    var x = 0, y = 0, over = false;

    doc.addEventListener('pointerover', function (e) {
      over = !!(e.target.closest && e.target.closest('a,button,.route,[data-type],.lite,canvas'));
      el.classList.toggle('is-over', over);
    });

    AX.add(function (dt) {
      if (P.cx == null) return;
      x = U.damp(x, P.cx, 26, dt);
      y = U.damp(y, P.cy, 26, dt);
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    }, 'reticle');
  }

  /* ═══════════════ 12. parallax utilities ═══════════════ */

  function parallax() {
    var nodes = $$('[data-par]');
    if (!nodes.length) return;
    nodes.forEach(function (el) {
      var rate = parseFloat(el.dataset.par) || 0.1;
      AX.scene(el.parentElement || el, function (p, r) {
        var centre = (r.top + r.height / 2 - S.vh / 2) / S.vh;
        el.style.transform = 'translate3d(0,' + (-centre * rate * 100).toFixed(2) + 'px,0)';
      });
    });
  }

  /* ═══════════════ boot order ═══════════════ */

  function go() {
    AX.measure();
    boot();
    nav();
    hud();
    hero();
    fleetShowcase();
    anatomy();
    performance();
    network();
    cabin();
    counters();
    parallax();
    reticle();
    AX.initReveal();

    /* year in the footer, so it never goes stale */
    var y = $('#year');
    if (y) y.textContent = new Date().getFullYear();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', go);
  else go();

})(window);
