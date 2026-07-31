/* ═══════════════════════════════════════════════════════════
   site.js — everything that is not the film.

   The film has a GPU. The page does not, and it still has to feel
   like the same piece of work. The rules are the ones the rest of
   the repository runs on:

     · scroll, pointer and resize handlers park a number and
       return — they never read layout
     · every element offset is measured once, on load and on
       resize, into a table the loop reads from
     · one requestAnimationFrame drives all of it, and it is the
       same one that drives the film
     · only transform, opacity and custom properties are written

   ── ON HAVING A DIFFERENT ANIMATION PER SECTION ────────────

   Each section below arrives by a different mechanism, and the
   mechanisms are not interchangeable — they are chosen for what
   the section is:

     film captions  rise out of the black with a blurred copy
                    burning off behind them
     the legend     a tide sweeps across the block; each
                    character it passes lifts and settles
     headings       letters arrive on a rotateX from below, each
                    on its own delay, and the delay runs from the
                    middle of the line outward
     panels         float on independent phases, tilt toward the
                    pointer on a spring, and cast with the tilt
     dishes         driven directly by the turntable's own
                    progress rather than by their own scroll
     the deep       an underwater canvas whose current is the
                    scroll velocity
     the footer     particles that never stop

   Nothing in here is required to read the page. With scripting
   off none of it runs, every reveal resolves to its finished
   state in CSS, and the sections are a plain column.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  var M = SHRIMP.M;
  var doc = document, root = doc.documentElement;
  var sat = M.sat, lerp = M.lerp, range = M.range, damp = M.damp;
  var smoothstep = M.smoothstep, E = M.E;

  /* ═══ text splitting ════════════════════════════════════════
     Letters have to be inline-blocks to be transformed one at a
     time, which also lets a line break between any two of them —
     "SEV / EN PLATES". Each word gets its own nowrap wrapper, so
     lines still break, but only at spaces. */

  function split(el, store) {
    var text = el.textContent;
    var frag = doc.createDocumentFragment();
    var n = text.length, mid = (n - 1) / 2;
    var word = null;
    var letters = store || [];
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
      span.__off = (i - mid) / Math.max(mid, 1);   /* -1 … 1 across the line */
      span.__d = i / Math.max(n - 1, 1);           /* 0 … 1 along the line */
      /* the delay runs outward from the middle, which reads as the
         line opening rather than as the line being typed */
      span.__c = Math.abs(span.__off);
      word.appendChild(span);
      letters.push(span);
    }
    el.textContent = '';
    el.appendChild(frag);
    return letters;
  }

  function tx(el, s) { el.style.transform = s; }

  /* ═══ init ═════════════════════════════════════════════════ */

  function init(opts) {
    var reduced = opts.reduced;
    var film = opts.film;
    var tier = opts.tier;

    /* ── the table every driver reads from ─────────────────── */
    var vh = global.innerHeight, vw = global.innerWidth;
    var scrollY = 0, prevScroll = 0, scrollVel = 0;

    function box(el) {
      var r = el.getBoundingClientRect();
      var top = r.top + (global.scrollY || 0);
      return { top: top, h: r.height, bottom: top + r.height };
    }

    /* ── collect ───────────────────────────────────────────── */
    var $ = function (s, c) { return [].slice.call((c || doc).querySelectorAll(s)); };

    var caps = $('.cap').map(function (el) {
      var lines = $('[data-split]', el);
      var letters = [];
      var hazes = [];
      lines.forEach(function (line) {
        var t = line.textContent;
        split(line, letters);
        var haze = doc.createElement('span');
        haze.className = 'haze';
        haze.setAttribute('aria-hidden', 'true');
        haze.textContent = t;
        line.appendChild(haze);
        hazes.push(haze);
      });
      return {
        el: el, letters: letters, hazes: hazes, vis: -1,
        from: parseFloat(el.dataset.from), to: parseFloat(el.dataset.to)
      };
    });

    var wordmarkEl = doc.getElementById('wordmark');
    var wordLetters = wordmarkEl ? $('.wordmark__row span', wordmarkEl) : [];
    var wordSub = wordmarkEl ? wordmarkEl.querySelector('.wordmark__sub') : null;
    wordLetters.forEach(function (s, i) {
      s.__d = i / Math.max(wordLetters.length - 1, 1);
      s.__off = (i - (wordLetters.length - 1) / 2) / ((wordLetters.length - 1) / 2 || 1);
    });

    var railItems = $('#rail li');
    var hintEl = doc.getElementById('hint');
    var navEl = doc.getElementById('nav');

    var tides = $('[data-tide]').map(function (el) {
      return { el: el, letters: split(el), m: null };
    });
    var softs = $('[data-tide-soft]').map(function (el) { return { el: el, m: null, at: 0 }; });
    var staggers = $('[data-stagger], [data-split-hold]').map(function (el) {
      return { el: el, letters: split(el), m: null, at: 0, hold: el.hasAttribute('data-split-hold') };
    });
    var counters = $('[data-count]').map(function (el) {
      return { el: el, to: parseFloat(el.dataset.count), at: 0, m: null, fired: false };
    });
    var statItems = $('.stat li').map(function (el) { return { el: el, m: null, at: 0 }; });
    var deepNotes = $('.deep__notes article').map(function (el) { return { el: el, m: null, at: 0 }; });

    var panels = $('[data-panel]').map(function (el, i) {
      return {
        el: el, i: i, m: null,
        drift: parseFloat(el.dataset.drift) || 0,
        art: el.dataset.art,
        canvas: el.querySelector('[data-art-canvas]'),
        /* tilt state: target and spring */
        tx: 0, ty: 0, vx: 0, vy: 0, txT: 0, tyT: 0,
        at: 0, hover: 0
      };
    });

    var dishCards = $('.dish-card').map(function (el) {
      return { el: el, i: parseInt(el.dataset.dish, 10), letters: $('.lt', el) };
    });
    var dishTrack = doc.getElementById('dishTrack');
    var dishBar = doc.getElementById('dishBar');

    var magnets = $('[data-magnetic]').map(function (el) {
      return { el: el, m: null, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, on: 0 };
    });

    /* ── measurement ───────────────────────────────────────── */
    var trackM = null, deepM = null, footM = null, menuM = null;

    function measure() {
      vh = global.innerHeight; vw = global.innerWidth;
      var i;
      for (i = 0; i < tides.length; i++) tides[i].m = box(tides[i].el);
      for (i = 0; i < softs.length; i++) softs[i].m = box(softs[i].el);
      for (i = 0; i < staggers.length; i++) staggers[i].m = box(staggers[i].el);
      for (i = 0; i < counters.length; i++) counters[i].m = box(counters[i].el);
      for (i = 0; i < statItems.length; i++) statItems[i].m = box(statItems[i].el);
      for (i = 0; i < deepNotes.length; i++) deepNotes[i].m = box(deepNotes[i].el);
      for (i = 0; i < panels.length; i++) panels[i].m = box(panels[i].el);
      for (i = 0; i < magnets.length; i++) magnets[i].m = box(magnets[i].el);
      if (dishTrack) trackM = box(dishTrack);
      var deepEl = doc.getElementById('deep');
      if (deepEl) deepM = box(deepEl);
      var footEl = doc.getElementById('foot');
      if (footEl) footM = box(footEl);
      var menuEl = doc.getElementById('menu');
      if (menuEl) menuM = box(menuEl);
      sizeCanvas(deepCv, deepCtx);
      sizeCanvas(footCv, footCtx);
      sizeCanvas(fxCv, fxCtx);
      if (studio) studio.resize();
      drawPanelArt();
    }

    /* ═══ pointer ═══════════════════════════════════════════ */
    var px = -999, py = -999;         /* raw, in client space */
    var cx = -999, cy = -999;         /* the lagging ring */
    var dx = -999, dy = -999;         /* the dot */
    var cursorEl = doc.getElementById('cursor');
    var cursorLabel = cursorEl ? cursorEl.querySelector('.cursor__label') : null;
    var hot = false;

    function pointer(x, y) {
      px = x; py = y;
      if (dx < -900) { cx = dx = x; cy = dy = y; }
      pushRipple(x, y);
    }

    /* hover state on anything interactive, set by delegation so a
       panel added later would still work */
    doc.addEventListener('pointerover', function (e) {
      var t = e.target.closest ? e.target.closest('a,button,input,label,[data-panel]') : null;
      var next = !!t;
      if (next !== hot) {
        hot = next;
        if (cursorEl) cursorEl.classList.toggle('is-hot', hot);
      }
      if (t && cursorLabel) {
        var lab = t.tagName === 'BUTTON' ? 'PRESS' :
                  t.hasAttribute && t.hasAttribute('data-panel') ? 'LOOK' :
                  t.tagName === 'A' ? 'GO' : '';
        cursorLabel.textContent = lab;
      }
    }, { passive: true });

    /* pressing compresses the ring */
    var pressed = 0;
    doc.addEventListener('pointerdown', function () { pressed = 1; }, { passive: true });
    doc.addEventListener('pointerup', function () { pressed = 0; }, { passive: true });

    /* ── the ripple canvas ──
       The cursor leaves rings in the water. They live in a fixed
       pool that is written in place; nothing is allocated per
       ripple and nothing is ever removed from an array. */
    var fxCv = doc.getElementById('cursorfx');
    var fxCtx = fxCv ? fxCv.getContext('2d') : null;
    var RIPPLES = 26;
    var ripples = [];
    for (var ri = 0; ri < RIPPLES; ri++) ripples.push({ x: 0, y: 0, t: 9, s: 1 });
    var rippleHead = 0, lastRippleX = 0, lastRippleY = 0;

    function pushRipple(x, y) {
      if (!fxCtx || reduced) return;
      var d = Math.hypot(x - lastRippleX, y - lastRippleY);
      if (d < 58) return;              /* one ring per 58 px travelled */
      lastRippleX = x; lastRippleY = y;
      var r = ripples[rippleHead];
      rippleHead = (rippleHead + 1) % RIPPLES;
      r.x = x; r.y = y; r.t = 0; r.s = 0.7 + Math.min(d / 260, 1) * 0.9;
    }

    /* ═══ canvases ══════════════════════════════════════════ */
    var deepCv = doc.getElementById('deepCanvas');
    var deepCtx = deepCv ? deepCv.getContext('2d') : null;
    var footCv = doc.getElementById('footCanvas');
    var footCtx = footCv ? footCv.getContext('2d') : null;

    var CDPR = Math.min(global.devicePixelRatio || 1, tier.name === 'low' ? 1 : 1.5);

    function sizeCanvas(cv, ctx) {
      if (!cv || !ctx) return;
      var r = cv.getBoundingClientRect();
      var w = Math.max(2, Math.round(r.width * CDPR));
      var h = Math.max(2, Math.round(r.height * CDPR));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx.setTransform(CDPR, 0, 0, CDPR, 0, 0);
    }

    /* ── the deep: fish, shafts, bubbles ──
       Everything here is seeded once and driven by a phase, so a
       jump in scroll moves the whole population coherently
       instead of restarting it. */
    var drnd = M.rng(70131);
    var FISH = tier.name === 'low' ? 9 : tier.name === 'mid' ? 16 : 26;
    var fish = [];
    for (var fi = 0; fi < FISH; fi++) {
      fish.push({
        depth: drnd(),                        /* 0 near … 1 far */
        y: drnd(),
        phase: drnd(),
        speed: 0.02 + drnd() * 0.055,
        size: 0.5 + drnd() * 0.9,
        dir: drnd() < 0.42 ? -1 : 1,
        wag: drnd() * 6.28,
        kind: drnd() < 0.22 ? 1 : 0           /* 1 = the long ones */
      });
    }
    var BUBBLES = tier.name === 'low' ? 30 : 70;
    var bubbles = [];
    for (var bi = 0; bi < BUBBLES; bi++) {
      bubbles.push({ x: drnd(), y: drnd(), r: 0.6 + drnd() * 2.6, sp: 0.03 + drnd() * 0.09, w: drnd() * 6.28 });
    }
    var MOTES = tier.name === 'low' ? 40 : 110;
    var motes = [];
    for (var mi = 0; mi < MOTES; mi++) {
      motes.push({ x: drnd(), y: drnd(), r: 0.4 + drnd() * 1.5, sp: 0.004 + drnd() * 0.02, w: drnd() * 6.28 });
    }

    function drawFish(ctx, x, y, s, dir, wag, kind, alpha, tint) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir * s, s);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = tint;

      /* Body length in canvas pixels before the depth scale. The
         first pass used 26, which after a 0.5 depth scale put a
         thirteen-pixel fish on a nine-hundred-pixel canvas — the
         school was drawn, correctly, and invisible. */
      var L = kind ? 108 : 62;     /* body length */
      var Hh = kind ? 10 : 17;     /* body depth */

      ctx.beginPath();
      ctx.moveTo(L * 0.62, 0);
      ctx.bezierCurveTo(L * 0.30, -Hh, -L * 0.20, -Hh * 0.92, -L * 0.46, -Hh * 0.30);
      /* the tail is where the life is: it swings, the body does not */
      var sw = Math.sin(wag) * Hh * 0.85;
      ctx.lineTo(-L * 0.72, -Hh * 0.92 + sw);
      ctx.lineTo(-L * 0.66, 0 + sw * 0.55);
      ctx.lineTo(-L * 0.72, Hh * 0.92 + sw);
      ctx.lineTo(-L * 0.46, Hh * 0.30);
      ctx.bezierCurveTo(-L * 0.20, Hh * 0.92, L * 0.30, Hh, L * 0.62, 0);
      ctx.closePath();
      ctx.fill();

      /* dorsal, and a single catchlight — two strokes, and they
         are the difference between a fish and a leaf */
      ctx.beginPath();
      ctx.moveTo(-L * 0.06, -Hh * 0.85);
      ctx.quadraticCurveTo(L * 0.06, -Hh * 1.75, L * 0.24, -Hh * 0.62);
      ctx.closePath();
      ctx.globalAlpha = alpha * 0.75;
      ctx.fill();

      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      ctx.arc(L * 0.40, -Hh * 0.22, Math.max(0.7, Hh * 0.13), 0, 6.283);
      ctx.fillStyle = 'rgba(230,242,255,.9)';
      ctx.fill();
      ctx.restore();
    }

    function paintDeep(clock, prog, vel) {
      if (!deepCtx || !deepCv) return;
      var w = deepCv.width / CDPR, h = deepCv.height / CDPR;
      var ctx = deepCtx;
      ctx.clearRect(0, 0, w, h);

      /* the water column */
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(24,72,116,.42)');
      g.addColorStop(0.45, 'rgba(9,38,66,.30)');
      g.addColorStop(1, 'rgba(3,12,22,.06)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* Shafts from the surface. Drawn as skewed gradient wedges
         with `lighter`, which is what makes them add where they
         cross instead of stacking as flat panels. */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var shafts = tier.name === 'low' ? 4 : 7;
      for (var s = 0; s < shafts; s++) {
        var sp = (s + 0.5) / shafts;
        var sway = Math.sin(clock * 0.11 + s * 1.7) * w * 0.045;
        var x0 = w * (sp * 1.25 - 0.14) + sway;
        var wid = w * (0.045 + 0.035 * Math.sin(s * 2.3));
        var lean = w * 0.20 + Math.sin(clock * 0.07 + s) * w * 0.03;
        var a = (0.055 + 0.035 * Math.sin(clock * 0.23 + s * 2.1)) * (0.35 + prog * 0.8);
        var sg = ctx.createLinearGradient(0, 0, 0, h * 0.92);
        sg.addColorStop(0, 'rgba(150,200,255,' + a.toFixed(4) + ')');
        sg.addColorStop(0.55, 'rgba(90,160,225,' + (a * 0.45).toFixed(4) + ')');
        sg.addColorStop(1, 'rgba(60,120,190,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(x0 - wid, 0);
        ctx.lineTo(x0 + wid, 0);
        ctx.lineTo(x0 + wid * 2.6 + lean, h);
        ctx.lineTo(x0 - wid * 2.6 + lean, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      /* the current: scroll velocity pushes everything sideways */
      var drift = vel * 0.06;
      var i;

      /* motes, behind the fish */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < motes.length; i++) {
        var mo = motes[i];
        var my = ((mo.y - clock * mo.sp) % 1 + 1) % 1;
        var mx = ((mo.x + Math.sin(clock * 0.13 + mo.w) * 0.02 - drift * 0.0006) % 1 + 1) % 1;
        ctx.globalAlpha = 0.10 + 0.14 * Math.sin(clock * 0.7 + mo.w) * 0.5 + 0.08;
        ctx.fillStyle = 'rgba(190,225,255,1)';
        ctx.beginPath();
        ctx.arc(mx * w, my * h, mo.r, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();

      /* fish, far to near */
      var sorted = fish;
      for (i = 0; i < sorted.length; i++) {
        var f = sorted[i];
        var far = f.depth;
        /* phase, not integration: scrubbing sends the school back */
        var ph = (f.phase + clock * f.speed * (0.35 + (1 - far)) + prog * 0.55 * f.dir) % 1;
        var fx = (f.dir > 0 ? ph : 1 - ph) * (w + 260) - 130;
        var fy = f.y * h + Math.sin(clock * 0.5 + f.phase * 9) * (10 + (1 - far) * 22) + drift * (1 - far) * 0.5;
        var sc = (0.30 + (1 - far) * 0.95) * f.size;
        /* Near fish are lit and far ones are silhouettes. Both had
           to come up in value: a mid-blue fish at 0.2 alpha on a
           mid-blue water column is a fish nobody can see, and the
           depth cue has to come from the *difference* between the
           two rather than from both being dim. */
        var al = 0.26 + (1 - far) * 0.44;
        var tint = far > 0.55
          ? 'rgba(96,142,192,1)'
          : 'rgba(168,212,252,1)';
        drawFish(ctx, fx, fy, sc, f.dir, clock * (5 + (1 - far) * 5) + f.wag, f.kind, al, tint);
      }

      /* bubbles, in front of everything */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        var by = ((b.y - clock * b.sp - prog * 0.35) % 1 + 1) % 1;
        var bx = (b.x + Math.sin(clock * 0.55 + b.w) * 0.014) * w;
        var ba = 0.16 * (1 - Math.abs(by - 0.5) * 0.7);
        ctx.globalAlpha = ba;
        ctx.strokeStyle = 'rgba(200,232,255,1)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(bx, by * h, b.r, 0, 6.283);
        ctx.stroke();
        ctx.globalAlpha = ba * 0.6;
        ctx.fillStyle = 'rgba(230,245,255,1)';
        ctx.beginPath();
        ctx.arc(bx - b.r * 0.32, by * h - b.r * 0.32, b.r * 0.30, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ── the footer: the camera lifts, the room goes under ──
       Nothing here ever finishes. That is the point: the last
       thing on the page is the only thing on it that has no end
       state. */
    var frnd = M.rng(51219);
    var FOOTP = tier.name === 'low' ? 40 : 130;
    var footParts = [];
    for (var pi = 0; pi < FOOTP; pi++) {
      footParts.push({
        x: frnd(), y: frnd(), r: 0.4 + frnd() * 1.9,
        sp: 0.008 + frnd() * 0.030, w: frnd() * 6.28,
        warm: frnd() < 0.22
      });
    }

    function paintFoot(clock, prog) {
      if (!footCtx || !footCv) return;
      var w = footCv.width / CDPR, h = footCv.height / CDPR;
      var ctx = footCtx;
      ctx.clearRect(0, 0, w, h);

      /* the surface, seen from below and a long way down */
      var g = ctx.createRadialGradient(w * 0.5, h * 1.15, 0, w * 0.5, h * 1.15, h * 1.5);
      g.addColorStop(0, 'rgba(30,78,122,.30)');
      g.addColorStop(0.5, 'rgba(10,32,54,.14)');
      g.addColorStop(1, 'rgba(3,10,18,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* moonlight on the underside of the water — bands that
         breathe rather than a static caustic texture */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 5; k++) {
        var yy = h * (0.06 + k * 0.055) + Math.sin(clock * 0.24 + k) * 5;
        var a = 0.032 * (1 - k / 5);
        var lg = ctx.createLinearGradient(0, yy - 26, 0, yy + 26);
        lg.addColorStop(0, 'rgba(140,190,250,0)');
        lg.addColorStop(0.5, 'rgba(160,205,255,' + a.toFixed(4) + ')');
        lg.addColorStop(1, 'rgba(140,190,250,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, yy - 26, w, 52);
      }

      for (var i = 0; i < footParts.length; i++) {
        var p = footParts[i];
        var py2 = ((p.y - clock * p.sp) % 1 + 1) % 1;
        var px2 = (p.x + Math.sin(clock * 0.19 + p.w) * 0.018) * w;
        var al = (0.10 + 0.22 * (1 - py2)) * (0.35 + prog * 0.9);
        ctx.globalAlpha = al;
        ctx.fillStyle = p.warm ? 'rgba(242,150,70,1)' : 'rgba(180,215,255,1)';
        ctx.beginPath();
        ctx.arc(px2, py2 * h, p.r, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ═══ the studio (signature dishes) ════════════════════ */
    var studio = null;
    if (SHRIMP.Studio && !root.classList.contains('no-gl')) {
      studio = SHRIMP.Studio.create(doc.getElementById('studio'), tier, reduced);
      if (!studio) root.classList.add('no-gl');
    }

    /* ═══ panel art ════════════════════════════════════════ */
    function drawPanelArt() {
      if (!SHRIMP.Art) return;
      for (var i = 0; i < panels.length; i++) {
        var p = panels[i];
        if (!p.canvas) continue;
        var r = p.canvas.getBoundingClientRect();
        if (r.width < 4) continue;
        var w = Math.round(r.width * CDPR), h = Math.round(r.height * CDPR);
        if (p.canvas.width !== w || p.canvas.height !== h) {
          p.canvas.width = w; p.canvas.height = h;
          SHRIMP.Art.draw(p.canvas, p.art, CDPR);
        } else if (!p.__drawn) {
          SHRIMP.Art.draw(p.canvas, p.art, CDPR);
        }
        p.__drawn = true;
      }
    }

    /* ═══ booking ══════════════════════════════════════════ */
    var heatRow = doc.getElementById('heatRow');
    var heatInk = doc.getElementById('heatInk');
    var heatIdx = 1, heatAt = 1, heatVel = 0;
    if (heatRow) {
      heatRow.addEventListener('change', function (e) {
        if (e.target.name === 'heat') heatIdx = parseInt(e.target.value, 10) - 1;
      });
    }

    var form = doc.getElementById('bookForm');
    var note = doc.getElementById('bookNote');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('.submit');
        var missing = $('input[required]', form).filter(function (i) { return !i.value.trim(); });
        if (missing.length) {
          note.textContent = 'Fill in ' + (missing.length === 1 ? 'one more field' : missing.length + ' more fields') + ' first.';
          note.classList.add('is-warn');
          missing[0].focus();
          /* a shake that is a spring, not a keyframe */
          formShake = 1;
          return;
        }
        note.classList.remove('is-warn');
        note.textContent = 'Nothing was sent anywhere — this page is a design concept and the form is part of the demonstration.';
        btn.classList.add('is-done');
      });
    }
    var formShake = 0;

    /* the "add to the table" buttons acknowledge and reset */
    $('.panel__cta').forEach(function (b) {
      b.addEventListener('click', function () {
        b.classList.add('is-added');
        var was = b.textContent;
        b.textContent = 'On the table';
        setTimeout(function () { b.classList.remove('is-added'); b.textContent = was; }, 1800);
      });
    });

    /* ═══ nav ══════════════════════════════════════════════ */
    var navHidden = false, navSolid = false, navAnchor = 0;

    /* ═══ the frame ════════════════════════════════════════ */
    var clock = 0;

    function frame(sy, dt, wallClock) {
      scrollY = sy;
      clock = wallClock;
      var v = (scrollY - prevScroll) / Math.max(dt, 1e-4);
      prevScroll = scrollY;
      scrollVel = damp(scrollVel, v, 6, dt);

      var i, o, e2;

      /* ── nav: solid once past the film's first screen, hidden
         while scrolling down, back on the way up ── */
      var wantSolid = scrollY > vh * 0.65;
      if (wantSolid !== navSolid) { navSolid = wantSolid; navEl.classList.toggle('is-solid', navSolid); }
      if (scrollVel > 260) navAnchor = Math.max(navAnchor, scrollY);
      var wantHidden = navSolid && scrollVel > 120;
      if (scrollVel < -60) wantHidden = false;
      if (wantHidden !== navHidden) { navHidden = wantHidden; navEl.classList.toggle('is-hidden', navHidden); }

      /* ── the cursor ── */
      if (cursorEl && px > -900) {
        /* the dot is exact; the ring lags, which is the entire
           trick — two elements, one lag, and the pointer suddenly
           has weight */
        dx = damp(dx, px, 42, dt); dy = damp(dy, py, 42, dt);
        cx = damp(cx, px, 13, dt); cy = damp(cy, py, 13, dt);
        var sq = 1 - pressed * 0.28 + (hot ? 0.35 : 0);
        cursorEl.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)';
        var ring = cursorEl.firstElementChild;
        ring.style.transform = 'translate3d(' + (cx - dx).toFixed(1) + 'px,' + (cy - dy).toFixed(1) + 'px,0) scale(' + sq.toFixed(3) + ')';
      }

      /* ── ripples ── */
      if (fxCtx) {
        var fw = fxCv.width / CDPR, fh = fxCv.height / CDPR;
        fxCtx.clearRect(0, 0, fw, fh);
        for (i = 0; i < RIPPLES; i++) {
          var r2 = ripples[i];
          if (r2.t > 1.6) continue;
          r2.t += dt;
          var rt = r2.t / 1.6;
          var rad = 4 + E.outQuart(rt) * 92 * r2.s;
          var ra = (1 - rt) * (1 - rt) * 0.34;
          fxCtx.strokeStyle = 'rgba(170,210,255,' + ra.toFixed(4) + ')';
          fxCtx.lineWidth = Math.max(0.4, 1.6 * (1 - rt));
          fxCtx.beginPath();
          fxCtx.arc(r2.x, r2.y, rad, 0, 6.283);
          fxCtx.stroke();
          /* a second, tighter ring behind the first — capillary
             waves come in pairs and one ring reads as a UI echo */
          if (rt > 0.16) {
            fxCtx.strokeStyle = 'rgba(242,150,70,' + (ra * 0.36).toFixed(4) + ')';
            fxCtx.beginPath();
            fxCtx.arc(r2.x, r2.y, rad * 0.62, 0, 6.283);
            fxCtx.stroke();
          }
        }
      }

      /* ── magnetic elements ──
         The pull is a spring toward a fraction of the offset from
         the element's centre, and it only engages inside a radius
         that scales with the element — a small link should not
         reach across a whole heading to grab the pointer. */
      for (i = 0; i < magnets.length; i++) {
        var mg = magnets[i];
        if (!mg.m) continue;
        /* The page-space centre is measured once and cached; the
           live scroll converts it to client space each frame. A
           getBoundingClientRect per magnet per frame would be a
           forced layout for every link in the nav. */
        if (mg.__px === undefined) {
          var rr = mg.el.getBoundingClientRect();
          mg.__px = rr.left + rr.width / 2;
          mg.__py = mg.m.top + mg.m.h / 2;
          mg.__rad = Math.max(rr.width, mg.m.h) * 1.5 + 34;
        }
        var ddx = px - mg.__px, ddy = py - (mg.__py - scrollY);
        var dist = Math.hypot(ddx, ddy);
        var pull = dist < mg.__rad ? 1 - dist / mg.__rad : 0;
        mg.tx = ddx * pull * 0.34;
        mg.ty = ddy * pull * 0.34;
        var ax = (mg.tx - mg.x) * 190 - mg.vx * 22;
        var ay = (mg.ty - mg.y) * 190 - mg.vy * 22;
        mg.vx += ax * dt; mg.vy += ay * dt;
        mg.x += mg.vx * dt; mg.y += mg.vy * dt;
        if (Math.abs(mg.x) > 0.05 || Math.abs(mg.y) > 0.05 || pull > 0) {
          tx(mg.el, 'translate3d(' + mg.x.toFixed(2) + 'px,' + mg.y.toFixed(2) + 'px,0)');
        }
      }

      /* ── the legend: a tide across the block ──
         The wave front is the scroll position mapped across the
         element plus a margin, so characters at the right edge
         are still waiting while the left is already settled. */
      for (i = 0; i < tides.length; i++) {
        var td = tides[i];
        if (!td.m) continue;
        var p = range(scrollY + vh, td.m.top, td.m.top + td.m.h + vh * 0.55);
        var front = p * 1.35 - 0.18;
        for (var j = 0; j < td.letters.length; j++) {
          var L = td.letters[j];
          var a = sat((front - L.__d * 0.82) / 0.24);
          var ea = E.outQuint(a);
          L.style.opacity = (0.12 + ea * 0.88).toFixed(3);
          tx(L, 'translate3d(0,' + ((1 - ea) * 22).toFixed(2) + 'px,' + ((1 - ea) * -60).toFixed(1) + 'px)' +
                ' rotateX(' + ((1 - ea) * -62).toFixed(2) + 'deg)');
        }
      }

      /* ── soft blocks: rise and clear ── */
      for (i = 0; i < softs.length; i++) {
        o = softs[i];
        if (!o.m) continue;
        var sp2 = range(scrollY + vh * 0.90, o.m.top, o.m.top + Math.min(o.m.h, vh * 0.5));
        o.at = damp(o.at, sp2, 7, dt);
        var se = E.outQuint(o.at);
        o.el.style.opacity = se.toFixed(3);
        tx(o.el, 'translate3d(0,' + ((1 - se) * 30).toFixed(2) + 'px,0)');
      }

      /* ── headings: letters on a rotateX, outward from centre ── */
      for (i = 0; i < staggers.length; i++) {
        o = staggers[i];
        if (!o.m) continue;
        var hp = range(scrollY + vh * 0.86, o.m.top, o.m.top + vh * 0.30);
        o.at = damp(o.at, hp, 8, dt);
        var he = o.at;
        for (var k2 = 0; k2 < o.letters.length; k2++) {
          var Ls = o.letters[k2];
          var la = sat((he - Ls.__c * 0.42) / 0.58);
          var le = E.outQuint(la);
          Ls.style.opacity = le.toFixed(3);
          tx(Ls, 'translate3d(0,' + ((1 - le) * 78).toFixed(2) + 'px,0)' +
                 ' rotateX(' + ((1 - le) * 78).toFixed(2) + 'deg)' +
                 ' scale(' + (0.86 + le * 0.14).toFixed(3) + ')');
        }
      }

      /* ── counters ── */
      for (i = 0; i < counters.length; i++) {
        o = counters[i];
        if (!o.m) continue;
        var cp = range(scrollY + vh * 0.85, o.m.top, o.m.top + vh * 0.22);
        o.at = damp(o.at, cp, 4.5, dt);
        var val = Math.round(o.to * E.outQuint(o.at));
        if (val !== o.__last) { o.el.textContent = val; o.__last = val; }
      }
      for (i = 0; i < statItems.length; i++) {
        o = statItems[i];
        if (!o.m) continue;
        var stp = range(scrollY + vh * 0.88, o.m.top, o.m.top + vh * 0.20);
        o.at = damp(o.at, stp, 7, dt);
        o.el.style.opacity = o.at.toFixed(3);
        tx(o.el, 'translate3d(0,' + ((1 - E.outQuint(o.at)) * 26).toFixed(2) + 'px,0)');
      }
      for (i = 0; i < deepNotes.length; i++) {
        o = deepNotes[i];
        if (!o.m) continue;
        var dp = range(scrollY + vh * 0.88, o.m.top, o.m.top + vh * 0.22);
        o.at = damp(o.at, dp, 6, dt);
        var de = E.outQuint(o.at);
        o.el.style.opacity = o.at.toFixed(3);
        tx(o.el, 'translate3d(0,' + ((1 - de) * 34).toFixed(2) + 'px,0) rotateX(' + ((1 - de) * 12).toFixed(2) + 'deg)');
      }

      /* ── the panels ──
         Three things at once: a reveal on entry, a permanent
         drift on the panel's own phase, and a tilt that chases
         the pointer on a spring. The drift and the tilt compose
         into one transform; writing two would fight. */
      for (i = 0; i < panels.length; i++) {
        var pn = panels[i];
        if (!pn.m) continue;
        var pp = range(scrollY + vh * 0.92, pn.m.top, pn.m.top + vh * 0.30);
        pn.at = damp(pn.at, pp, 6.5, dt);
        var pe = E.outQuint(pn.at);

        /* pointer tilt, from the measured centre */
        if (pn.__px === undefined) {
          var pr = pn.el.getBoundingClientRect();
          pn.__px = pr.left + pr.width / 2;
          pn.__w = pr.width;
        }
        var pcy = pn.m.top + pn.m.h / 2 - scrollY;
        var pdx = (px - pn.__px) / (pn.__w * 0.5 || 1);
        var pdy = (py - pcy) / (pn.m.h * 0.5 || 1);
        var inside = Math.abs(pdx) < 1.15 && Math.abs(pdy) < 1.15;
        pn.hover = damp(pn.hover, inside ? 1 : 0, 8, dt);
        pn.txT = inside ? M.clamp(pdy, -1, 1) * -7.5 : 0;
        pn.tyT = inside ? M.clamp(pdx, -1, 1) * 9.0 : 0;

        var axp = (pn.txT - pn.tx) * 150 - pn.vx * 19;
        var ayp = (pn.tyT - pn.ty) * 150 - pn.vy * 19;
        pn.vx += axp * dt; pn.vy += ayp * dt;
        pn.tx += pn.vx * dt; pn.ty += pn.vy * dt;

        /* the sheen follows the pointer across the glass */
        if (inside) {
          pn.el.style.setProperty('--mx', (50 + pdx * 50).toFixed(1) + '%');
          pn.el.style.setProperty('--my', (50 + pdy * 50).toFixed(1) + '%');
        }

        /* the permanent float: two periods that do not divide */
        var fl = reduced ? 0 : 1;
        var bob = Math.sin(clock * 0.42 + pn.drift * 6.283) * 6.5 * fl +
                  Math.sin(clock * 0.27 + pn.drift * 11.0) * 3.0 * fl;
        var sway = Math.cos(clock * 0.33 + pn.drift * 5.1) * 3.4 * fl;

        pn.el.style.opacity = pn.at.toFixed(3);
        tx(pn.el,
          'perspective(900px)' +
          ' translate3d(' + sway.toFixed(2) + 'px,' + (bob + (1 - pe) * 54).toFixed(2) + 'px,' + (pn.hover * 26).toFixed(1) + 'px)' +
          ' rotateX(' + (pn.tx + (1 - pe) * 8).toFixed(2) + 'deg)' +
          ' rotateY(' + pn.ty.toFixed(2) + 'deg)' +
          ' scale(' + (0.94 + pe * 0.06).toFixed(3) + ')');
      }

      /* ── the dish turntable ── */
      if (trackM && studio) {
        var span = Math.max(trackM.h - vh, 1);
        var dp2 = sat((scrollY - trackM.top) / span);
        var visible = scrollY > trackM.top - vh * 1.1 && scrollY < trackM.bottom + vh * 0.4;
        studio.frame(dp2, dt, clock, visible, (px / vw) * 2 - 1, -((py / vh) * 2 - 1));

        if (dishBar) dishBar.style.height = (dp2 * 100).toFixed(2) + '%';

        /* Each card owns a slice of the track and crossfades with
           its neighbours. The card is not animated by its own
           position on the page — it cannot be, because it never
           moves — so it is driven by the turntable's progress. */
        /* The same mapping the turntable uses: card i is centred on
           progress i/(n-1), so a card is at full strength exactly
           when its dish is. */
        var n = dishCards.length;
        for (i = 0; i < n; i++) {
          var dc = dishCards[i];
          var centre = i / (n - 1);
          var d3 = (dp2 - centre) * (n - 1);       /* -1 … 1 within its slice */
          var vis = sat(1 - Math.abs(d3) * 1.85);
          if (vis <= 0.001) {
            if (dc.__vis !== 0) { dc.el.style.visibility = 'hidden'; dc.el.style.opacity = '0'; dc.__vis = 0; }
            continue;
          }
          if (dc.__vis !== 1) { dc.el.style.visibility = 'visible'; dc.__vis = 1; }
          var ve = E.outQuint(vis);
          dc.el.style.opacity = ve.toFixed(3);
          tx(dc.el, 'translate3d(0,' + (d3 * 46).toFixed(2) + 'px,0)');
          for (var q = 0; q < dc.letters.length; q++) {
            var dl = dc.letters[q];
            var da2 = sat((ve - dl.__d * 0.30) / 0.70);
            dl.style.opacity = da2.toFixed(3);
            tx(dl, 'translate3d(0,' + ((1 - da2) * 40).toFixed(2) + 'px,0) rotateX(' + ((1 - da2) * 58).toFixed(1) + 'deg)');
          }
        }
      }

      /* ── the deep ── */
      if (deepM) {
        var dvis = scrollY > deepM.top - vh * 1.2 && scrollY < deepM.bottom + vh * 0.3;
        if (dvis) {
          var dprog = range(scrollY + vh, deepM.top, deepM.bottom);
          paintDeep(clock, dprog, scrollVel);
        }
      }

      /* ── the footer ── */
      if (footM) {
        var fvis = scrollY > footM.top - vh * 1.2;
        if (fvis) paintFoot(clock, range(scrollY + vh, footM.top, footM.bottom));
      }

      /* ── the heat switch ──
         A spring, not a transition: walking the options with the
         keyboard overshoots and settles the way a physical switch
         would, and holding an arrow key gives one continuous slide
         rather than four separate 300 ms eases fighting each
         other. */
      if (heatInk) {
        var per = vw <= 560 ? 2 : 4;
        var ha = (heatIdx - heatAt) * 260 - heatVel * 26;
        heatVel += ha * dt;
        heatAt += heatVel * dt;
        var col = vw <= 560 ? (heatIdx % 2) : heatIdx;
        var rowY = vw <= 560 ? Math.floor(heatIdx / 2) : 0;
        var shown = vw <= 560 ? col : heatAt;
        tx(heatInk, 'translate3d(' + (shown * 100).toFixed(2) + '%,' + (rowY * 100) + '%,0)');
      }

      /* ── the form shake ── */
      if (formShake > 0.001 && form) {
        formShake = damp(formShake, 0, 7, dt);
        tx(form, 'translate3d(' + (Math.sin(clock * 46) * formShake * 9).toFixed(2) + 'px,0,0)');
        if (formShake < 0.01) { formShake = 0; form.style.transform = ''; }
      }
    }

    /* ═══ film-driven overlays ═════════════════════════════ */

    function driveCaption(cap, t) {
      var from = cap.from, to = cap.to;
      var lead = Math.min((to - from) * 0.34, 0.028);

      /* A caption anchored at the very top of the film has nothing
         to arrive from — the page has not been scrolled yet. It is
         fully in on the first painted frame and only ever leaves,
         which is what makes the opening a title card rather than
         something the visitor has to scroll to find. */
      var inP = from <= 0.001 ? 1 : range(t, from, from + lead);
      var outP = range(t, to - lead, to);
      var live = inP > 0 && outP < 1;

      if (!live) {
        if (cap.vis !== 0) { cap.el.style.opacity = '0'; cap.el.style.visibility = 'hidden'; cap.vis = 0; }
        return;
      }
      if (cap.vis !== 1) { cap.el.style.visibility = 'visible'; cap.vis = 1; }

      var eIn = E.outQuint(inP), eOut = E.inCubic(outP);
      cap.el.style.opacity = String(Math.min(inP * 1.7, 1) * (1 - outP));

      for (var i = 0; i < cap.letters.length; i++) {
        var s = cap.letters[i];
        var a = sat((eIn - s.__d * 0.42) / 0.58);
        var b = sat((eOut - s.__d * 0.30) / 0.70);
        /* in: rises out of the black. out: sinks, which is the
           same gesture the pail makes in the last act. */
        var rise = (1 - a) * 30 + b * 34;
        var depth = (1 - a) * -110 + b * -50;
        var rx = (1 - a) * 46 + b * 26;
        var spread = (1 - a) * 12 * s.__off;
        s.style.opacity = String(a * (1 - b));
        s.style.transform = 'translate3d(' + spread.toFixed(2) + 'px,' + rise.toFixed(2) + 'px,' +
          depth.toFixed(1) + 'px) rotateX(' + rx.toFixed(2) + 'deg)';
      }

      var hz = (1 - eIn) * 0.9 + eOut * 0.75;
      var hy = (1 - eIn) * 14 + eOut * 22;
      for (var j = 0; j < cap.hazes.length; j++) {
        cap.hazes[j].style.opacity = String(hz);
        cap.hazes[j].style.transform = 'translate3d(0,' + hy.toFixed(2) + 'px,0) scale(' +
          (1 + (1 - eIn) * 0.08 + eOut * 0.12).toFixed(3) + ')';
      }
    }

    var railAct = -1, hintGone = false;

    function filmState(state, t) {
      var i;
      for (i = 0; i < caps.length; i++) driveCaption(caps[i], t);

      /* the wordmark is driven by the film's own value, so it
         lands on the beat the camera finishes its circle rather
         than on a scroll number that happens to be near it */
      if (wordmarkEl) {
        var wm = state.wordmark;
        wordmarkEl.style.opacity = String(Math.min(wm * 1.35, 1));
        if (wm > 0.001) {
          if (wordmarkEl.__v !== 1) { wordmarkEl.style.visibility = 'visible'; wordmarkEl.__v = 1; }
          for (i = 0; i < wordLetters.length; i++) {
            var s = wordLetters[i];
            var a = sat((wm - s.__d * 0.34) / 0.66);
            var ea = E.outQuint(a);
            /* the letters come *through* the frame from behind,
               each with its own delay and a little rotation, and
               settle onto the baseline together */
            s.style.opacity = String(ea);
            s.style.transform =
              'translate3d(' + ((1 - ea) * s.__off * 46).toFixed(2) + 'px,' +
              ((1 - ea) * 26).toFixed(2) + 'px,' + ((1 - ea) * -260).toFixed(0) + 'px)' +
              ' rotateY(' + ((1 - ea) * s.__off * -34).toFixed(2) + 'deg)' +
              ' scale(' + (0.82 + ea * 0.18).toFixed(3) + ')';
          }
          if (wordSub) {
            var sa = sat((wm - 0.45) / 0.55);
            wordSub.style.opacity = String(sa);
            wordSub.style.transform = 'translate3d(0,' + ((1 - sa) * 16).toFixed(2) + 'px,0)';
          }
        } else if (wordmarkEl.__v !== 0) {
          wordmarkEl.style.visibility = 'hidden'; wordmarkEl.__v = 0;
        }
      }

      /* the act rail */
      var act = 0;
      for (i = 0; i < railItems.length; i++) {
        if (t >= parseFloat(railItems[i].dataset.from)) act = i;
      }
      if (act !== railAct) {
        railAct = act;
        for (i = 0; i < railItems.length; i++) railItems[i].classList.toggle('is-on', i === act);
      }

      if (!hintGone && t > 0.012 && hintEl) { hintGone = true; hintEl.classList.add('is-gone'); }
    }

    /* ── first paint ───────────────────────────────────────── */
    measure();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);

    return {
      measure: measure,
      frame: frame,
      pointer: pointer,
      filmState: filmState
    };
  }

  SHRIMP.Site = { init: init, split: split };

})(window);
