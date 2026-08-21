/* ═══════════════════════════════════════════════════════════
   site.js — everything on the page that is not the food.

   The nav, the reveals, the cursor, the menu index, the
   ingredient tags over the stage, the map, the directions panel
   and the booking form.

   One rule runs through all of it, and it is the same rule the
   renderer follows: handlers park a number and return. Scroll,
   pointer and resize never read layout. Every element offset the
   loop needs is measured once — on load, and again on resize —
   into a table it reads from. Nothing in a frame asks the browser
   a question it would have to do work to answer.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = (global.SHRIM = global.SHRIM || {});
  var M = SHRIM.M;
  var doc = global.document, root = doc.documentElement;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return [].slice.call((ctx || doc).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* ── the nav ─────────────────────────────────────────────── */

  function Nav(store) {
    var nav = $('#nav');
    var links = $$('.nav__link');
    var panel = $('#navlinks');
    var toggle = $('#navtoggle');
    var sections = links.map(function (a) { return $(a.getAttribute('href')); });
    var tops = [];
    var stuck = false, current = -1;

    function measure() {
      tops = sections.map(function (s) { return s ? s.offsetTop : 1e9; });
    }

    function open(v) {
      panel.classList.toggle('is-open', v);
      toggle.setAttribute('aria-expanded', v ? 'true' : 'false');
    }

    toggle.addEventListener('click', function () {
      open(panel.classList.contains('is-open') ? false : true);
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('.nav__link')) open(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') open(false);
    });

    return {
      measure: measure,
      frame: function () {
        var y = store.y;
        var want = y > 40;
        if (want !== stuck) { stuck = want; nav.classList.toggle('is-stuck', want); }

        /* The section whose top has most recently passed a third of
           the way down the viewport.

           This used to take the last index that had been passed,
           which quietly assumed the nav's links are in the same
           order as the sections they point at. Here they are not —
           the nav reads Home · Menu · About while the page runs
           home, about, menu — so standing in the menu lit About.
           It is the *nearest* passed top, not the last one. */
        var mark = y + store.vh * 0.34;
        var idx = 0, best = -1e9;
        for (var i = 0; i < tops.length; i++) {
          if (mark >= tops[i] && tops[i] > best) { best = tops[i]; idx = i; }
        }
        if (idx !== current) {
          if (current >= 0) links[current].classList.remove('is-on');
          links[idx].classList.add('is-on');
          current = idx;
        }
      }
    };
  }

  /* ── reveals ─────────────────────────────────────────────────
     An IntersectionObserver alone cannot do this on a page with a
     nav. It only reports a *threshold crossing*: jump from the
     hero straight to #contact — which every link in the nav does —
     and the sections in between go from "below the viewport, not
     intersecting" to "above the viewport, not intersecting"
     without ever crossing the threshold. No entry is delivered and
     they sit at opacity 0 forever.

     So the observer handles ordinary scrolling, and a sweep
     handles jumps: when the scroll moves more than three quarters
     of a viewport between frames, everything not yet revealed is
     measured once and anything at or above the fold is let in. */

  function Reveals(store) {
    var items = $$('.reveal');
    var pending = items.slice();

    /* Siblings arrive in sequence rather than together — three
       cards landing at once reads as a block appearing, three
       landing ninety milliseconds apart reads as three cards. */
    items.forEach(function (n) {
      var p = n.parentNode;
      if (p.__revealN === undefined) p.__revealN = 0;
      n.style.setProperty('--d', (p.__revealN++ * 90) + 'ms');
    });

    function show(n) {
      n.classList.add('is-in');
      var i = pending.indexOf(n);
      if (i >= 0) pending.splice(i, 1);
    }

    var io = null;
    if (global.IntersectionObserver) {
      io = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
      items.forEach(function (n) { io.observe(n); });
    } else {
      items.forEach(show);
    }

    var last = store.y;
    return {
      frame: function () {
        var y = store.y;
        if (Math.abs(y - last) > store.vh * 0.75 && pending.length) {
          var fold = y + store.vh;
          pending.slice().forEach(function (n) {
            var box = n.getBoundingClientRect();
            if (box.top + y < fold) { show(n); if (io) io.unobserve(n); }
          });
        }
        last = y;
      }
    };
  }

  /* ── the cursor ──────────────────────────────────────────────
     A dot that is exactly where the pointer is, and a ring that is
     catching up. The ring is the only thing on this page allowed
     to lag, and it is damped rather than lerped so it feels the
     same at 60 Hz and at 240. */

  function Cursor(store) {
    if (!global.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
    if (root.getAttribute('data-motion') === 'off') return null;

    var node = $('#cursor');
    var ring = $('.cursor__ring', node);
    var dot = $('.cursor__dot', node);
    var label = $('.cursor__label', node);
    var rx = -100, ry = -100, mode = '';

    doc.addEventListener('pointerover', function (e) {
      var t = e.target.closest && e.target.closest('[data-cursor]');
      var want = t ? t.getAttribute('data-cursor') : '';
      if (want === mode) return;
      node.classList.toggle('is-link', want === 'link');
      node.classList.toggle('is-apart', want === 'apart');
      if (want === 'apart') label.textContent = t.getAttribute('data-cursor-label') || 'Take it apart';
      mode = want;
    });
    doc.addEventListener('pointerdown', function () { node.classList.add('is-down'); });
    doc.addEventListener('pointerup', function () { node.classList.remove('is-down'); });

    return {
      frame: function (dt) {
        var px = store.px, py = store.py;
        rx = M.damp(rx, px, 17, dt);
        ry = M.damp(ry, py, 17, dt);
        ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%)';
        label.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%, calc(-50% + 30px))';
        dot.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0) translate(-50%,-50%)';
      },
      setLabel: function (t) { label.textContent = t; }
    };
  }

  /* ── the menu ────────────────────────────────────────────────
     The index, the detail panel, and the tags that sit over the
     stage. This module owns the *page* side of the dish; the plate
     owns the 3D side, and they meet at two numbers: which dish,
     and how far open. */

  function Menu(opt) {
    var plate = opt.plate;
    var canvas = opt.canvas;
    var index = $('#index');
    var detail = $('#detail');
    var tagLayer = $('#dishlabels');
    var apartBtn = $('#apartbtn');
    var hit = $('#dishhit');
    var hint = $('#passhint');
    var dishes = SHRIM.DISHES;

    var cur = 0, wantDish = 0;
    var fade = 1, fadeTo = 1;
    var open = false;
    var rows = [], tags = [], bullets = [];
    var box = { w: 1, h: 1 };
    var projected = [];
    var drag = null, spin = 0, spinV = 0;

    /* ── the index ───────────────────────────────────────── */
    dishes.forEach(function (d, i) {
      var li = el('li');
      var b = el('button', 'dish');
      b.type = 'button';
      b.setAttribute('data-cursor', 'link');
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'dish__no', d.no));
      b.appendChild(el('span', 'dish__name', d.name));
      b.appendChild(el('span', 'dish__price', d.price));
      b.appendChild(el('p', 'dish__line', d.line));
      var heat = el('p', 'dish__heat');
      heat.appendChild(doc.createTextNode(d.serves + ' · Heat '));
      heat.appendChild(el('b', null, d.heat ? '●'.repeat(d.heat) : 'none'));
      b.appendChild(heat);
      b.addEventListener('click', function () { select(i); });
      li.appendChild(b);
      index.appendChild(li);
      rows.push(b);
    });

    /* ── the detail panel ────────────────────────────────── */
    var dInner = el('div', 'detail__inner');
    var dMeta = el('p', 'detail__meta');
    var dCopy = el('p', 'detail__copy');
    var dLabel = el('p', 'detail__label', 'What is in it');
    var dParts = el('ul', 'parts');
    var dAll = el('p', 'detail__allergens');
    dInner.appendChild(dMeta);
    dInner.appendChild(dCopy);
    dInner.appendChild(dLabel);
    dInner.appendChild(dParts);
    dInner.appendChild(dAll);
    detail.appendChild(dInner);

    function paint(d) {
      dMeta.textContent = '';
      [d.sub, d.serves, '£' + d.price].forEach(function (t) {
        dMeta.appendChild(el('span', null, t));
      });
      dCopy.textContent = d.copy;
      dAll.textContent = 'Allergens · ' + d.allergens;

      dParts.textContent = '';
      bullets = d.ingredients.map(function (g) {
        var li = el('li');
        li.appendChild(el('b', null, g.label));
        li.appendChild(el('span', null, ' ' + g.note));
        dParts.appendChild(li);
        return li;
      });

      tagLayer.textContent = '';
      tags = d.ingredients.map(function (g) {
        var t = el('div', 'tag');
        t.appendChild(el('span', 'tag__dot'));
        t.appendChild(el('span', 'tag__rule'));
        t.appendChild(el('span', 'tag__text', g.label));
        tagLayer.appendChild(t);
        return t;
      });
    }

    /* ── selection ───────────────────────────────────────────
       Changing dishes is a cut, not a dissolve: the grade goes to
       black over about a fifth of a second, the plate is rebuilt
       while there is nothing on screen, and it comes back up with
       the camera a few degrees round from where it was. Swapping
       the meshes in view would show every dish momentarily
       inside-out of the last one. */
    function select(i) {
      if (i === cur && fadeTo === 1) { setOpen(!open); return; }
      if (i === wantDish && fade < 1) return;
      wantDish = i;
      fadeTo = 0;
      setOpen(false, true);
      rows.forEach(function (r, k) {
        r.classList.toggle('is-on', k === i);
        r.setAttribute('aria-pressed', k === i ? 'true' : 'false');
      });
    }

    /* "Click" is a thing you do with a mouse. */
    var coarse = global.matchMedia('(pointer: coarse)').matches;
    var VERB = coarse ? 'Tap' : 'Click';

    function setOpen(v, silent) {
      open = !!v;
      plate.setOpen(open ? 1 : 0);
      apartBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
      var lbl = $('.btn__label', apartBtn);
      lbl.textContent = open ? lbl.getAttribute('data-label-on') : lbl.getAttribute('data-label-off');
      hit.setAttribute('data-cursor-label', open ? 'Put it back' : 'Take it apart');
      if (!silent) hint.textContent = open ? VERB + ' to put it back' : (coarse ? 'Swipe to turn' : 'Drag to turn');
      bullets.forEach(function (li, k) {
        li.style.transitionDelay = open ? (60 + k * 70) + 'ms' : '0ms';
        li.classList.toggle('is-in', open);
      });
    }

    apartBtn.addEventListener('click', function () { setOpen(!open); });
    hit.addEventListener('click', function (e) {
      if (hit.__moved) { hit.__moved = false; return; }
      setOpen(!open);
    });

    /* drag to turn — pointer events only, and the throw decays */
    hit.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, moved: 0 };
      hit.setPointerCapture(e.pointerId);
      hit.__moved = false;
    });
    hit.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      drag.x = e.clientX;
      drag.moved += Math.abs(dx);
      if (drag.moved > 6) hit.__moved = true;
      spin -= dx * 0.006;
      spinV = -dx * 0.10;
    });
    function endDrag(e) {
      if (!drag) return;
      drag = null;
      if (e && e.pointerId !== undefined && hit.hasPointerCapture(e.pointerId)) hit.releasePointerCapture(e.pointerId);
    }
    hit.addEventListener('pointerup', endDrag);
    hit.addEventListener('pointercancel', endDrag);

    plate.load(dishes[0]);
    paint(dishes[0]);
    rows[0].classList.add('is-on');
    rows[0].setAttribute('aria-pressed', 'true');

    function measure() {
      var r = canvas.getBoundingClientRect();
      box.w = r.width; box.h = r.height;
    }

    /* ── the tags ────────────────────────────────────────────
       Each is parked at the projected centroid of its ingredient's
       cluster. Two things stop them from being a mess: they are
       clamped inside the frame with a margin, and any two that
       land within a line's height of each other are pushed apart
       vertically. Both run over four to six items once a frame. */
    var order = [];
    function placeTags(openAmt) {
      var live = openAmt > 0.12;
      if (!live) {
        for (var i = 0; i < tags.length; i++) tags[i].classList.remove('is-in');
        return;
      }
      projected = plate.project(projected);
      order.length = 0;
      for (i = 0; i < projected.length; i++) order.push(projected[i]);
      order.sort(function (a, b) { return a.y - b.y; });

      /* No two tags within a line's height of each other. Sorted
         by height, then pushed down in turn — four to six items,
         once a frame. */
      var minGap = 32 / Math.max(box.h, 1);
      var lastY = -1;
      for (i = 0; i < order.length; i++) {
        var pj = order[i];
        pj.py = M.clamp(pj.y, 0.06, 0.92);
        if (lastY >= 0 && pj.py - lastY < minGap) pj.py = lastY + minGap;
        lastY = pj.py;
      }

      for (i = 0; i < projected.length; i++) {
        var q = projected[i];
        var t = tags[q.idx];
        if (!t) continue;
        var left = q.side < 0;
        t.classList.toggle('tag--left', left);
        /* Clamped by the tag's own width, measured once. Clamping
           the anchor to a fixed fraction of the frame instead
           works for "LEMON" and walks "FLAT-LEAF PARSLEY" off the
           edge, because the anchor is one end of the tag rather
           than its middle. */
        if (!t.__w) t.__w = t.offsetWidth || 120;
        var pad = 10;
        var lo = left ? t.__w + pad : pad;
        var hi = left ? box.w - pad : box.w - t.__w - pad;
        var x = M.clamp(q.x * box.w, Math.min(lo, hi), Math.max(lo, hi));
        /* the bar across the bottom of the stage is not something
           to park a label behind */
        var y = M.clamp(q.py * box.h, 18, box.h - 58);
        t.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'
          + ' translate(' + (left ? '-100%' : '0') + ', -50%)';
        t.style.transitionDelay = (i * 55) + 'ms';
        t.classList.add('is-in');
      }
    }

    return {
      measure: measure,
      select: select,
      /* the grade multiplier the plate should be drawn at, plus
         the camera nudge from the drag */
      frame: function (dt) {
        /* the cut between dishes */
        fade = M.damp(fade, fadeTo, 18, dt);
        if (fadeTo === 0 && fade < 0.06) {
          cur = wantDish;
          plate.load(dishes[cur]);
          plate.time = 0;
          paint(dishes[cur]);
          spin += 0.34;
          fadeTo = 1;
        }
        /* the throw decays; nothing snaps back */
        spin += spinV * dt;
        spinV = M.damp(spinV, 0, 3.4, dt);

        placeTags(plate._openV * (fade > 0.9 ? 1 : 0));
        return { fade: fade, azimuth: spin };
      },
      get openAmount() { return plate._openV; }
    };
  }

  /* ── the map ─────────────────────────────────────────────────
     Not a tile server and not a picture of one: a street plan,
     projected and drawn. The city is generated once from a seeded
     generator, because a map that reshuffles itself when you
     resize the window is not a map.

     It is deliberately a *plan* rather than a perspective — a
     restaurant's location page wants to be read, not flown
     through — and the only motion in it is the ring around the
     pin, which fires once when the section arrives. */

  function Map(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var g = canvas.getContext('2d');
    var blocks = [], W = 1, H = 1, dpr = 1;
    var pin = { x: 0.52, y: 0.46 };
    var pulse = 0, alive = false;

    /* the plan, in 0..1 of the frame */
    var rnd = M.rng(1188);
    var roadsV = [0.14, 0.30, 0.52, 0.74, 0.90];
    var roadsH = [0.16, 0.34, 0.46, 0.68, 0.86];

    (function build() {
      for (var i = 0; i < roadsV.length - 1; i++) {
        for (var j = 0; j < roadsH.length - 1; j++) {
          var x0 = roadsV[i] + 0.012, x1 = roadsV[i + 1] - 0.012;
          var y0 = roadsH[j] + 0.012, y1 = roadsH[j + 1] - 0.012;
          /* split some blocks so the grain is not uniform */
          var cuts = 1 + Math.floor(rnd() * 3);
          for (var k = 0; k < cuts; k++) {
            var a = y0 + (y1 - y0) * (k / cuts) + 0.004;
            var b = y0 + (y1 - y0) * ((k + 1) / cuts) - 0.004;
            if (b - a < 0.012) continue;
            blocks.push({ x: x0, y: a, w: x1 - x0, h: b - a, tone: 0.5 + rnd() * 0.5 });
          }
        }
      }
    })();

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = Math.max(2, Math.round(r.width * dpr));
      H = Math.max(2, Math.round(r.height * dpr));
      if (canvas.width === W && canvas.height === H) return;
      canvas.width = W; canvas.height = H;
      draw();
    }

    function draw() {
      if (!W || !H) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);

      var grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#16110f');
      grd.addColorStop(1, '#0d0a09');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      /* the blocks */
      blocks.forEach(function (b) {
        g.fillStyle = 'rgba(52, 38, 30, ' + (0.42 + b.tone * 0.38).toFixed(3) + ')';
        g.fillRect(b.x * W, b.y * H, b.w * W, b.h * H);
      });

      /* the canal, which is the one cool value on this map */
      g.strokeStyle = 'rgba(126, 147, 162, .34)';
      g.lineWidth = 7 * dpr;
      g.beginPath();
      g.moveTo(-0.02 * W, 0.10 * H);
      g.bezierCurveTo(0.34 * W, 0.16 * H, 0.62 * W, 0.02 * H, 1.02 * W, 0.09 * H);
      g.stroke();

      /* the high street, wider than the rest */
      g.strokeStyle = 'rgba(240, 198, 172, .16)';
      g.lineWidth = 9 * dpr;
      g.beginPath();
      g.moveTo(roadsV[2] * W, -0.02 * H);
      g.lineTo(roadsV[2] * W, 1.02 * H);
      g.stroke();

      g.lineWidth = 4 * dpr;
      g.strokeStyle = 'rgba(240, 198, 172, .09)';
      roadsV.forEach(function (x, i) {
        if (i === 2) return;
        g.beginPath(); g.moveTo(x * W, -0.02 * H); g.lineTo(x * W, 1.02 * H); g.stroke();
      });
      roadsH.forEach(function (y) {
        g.beginPath(); g.moveTo(-0.02 * W, y * H); g.lineTo(1.02 * W, y * H); g.stroke();
      });

      /* the pin */
      var px = pin.x * W, py = pin.y * H;
      if (pulse > 0.001) {
        var r = (10 + pulse * 42) * dpr;
        g.strokeStyle = 'rgba(232, 130, 95, ' + (0.5 * (1 - pulse)).toFixed(3) + ')';
        g.lineWidth = 1.4 * dpr;
        g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = '#c24b2a';
      g.beginPath(); g.arc(px, py, 6.5 * dpr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(244, 234, 225, .9)';
      g.lineWidth = 1.6 * dpr;
      g.beginPath(); g.arc(px, py, 11 * dpr, 0, Math.PI * 2); g.stroke();

      /* north, and a scale bar that means something */
      g.fillStyle = 'rgba(238, 212, 192, .62)';
      g.font = (10 * dpr) + 'px ui-monospace, Menlo, monospace';
      g.fillText('N', W - 26 * dpr, 26 * dpr);
      g.beginPath();
      g.moveTo(W - 22 * dpr, 34 * dpr); g.lineTo(W - 22 * dpr, 52 * dpr);
      g.strokeStyle = 'rgba(238, 212, 192, .5)';
      g.lineWidth = 1 * dpr; g.stroke();

      /* bottom right, because the street name sits bottom left */
      var sx = W - 82 * dpr;
      g.beginPath();
      g.moveTo(sx, H - 22 * dpr); g.lineTo(sx + 60 * dpr, H - 22 * dpr);
      g.moveTo(sx, H - 26 * dpr); g.lineTo(sx, H - 18 * dpr);
      g.moveTo(sx + 60 * dpr, H - 26 * dpr); g.lineTo(sx + 60 * dpr, H - 18 * dpr);
      g.stroke();
      g.fillText('100 m', sx, H - 30 * dpr);
    }

    return {
      measure: resize,
      start: function () { if (!alive) { alive = true; pulse = 0.0001; } },
      frame: function (dt) {
        if (!alive || pulse <= 0) return;
        pulse += dt * 0.85;
        if (pulse >= 1) { pulse = 0; alive = false; }
        draw();
      }
    };
  }

  /* ── the directions panel ────────────────────────────────────
     It expands. Height is animated from a measured value to a
     measured value and then released to auto, so the panel can
     reflow afterwards without being stuck at a pixel height it was
     measured at on a different viewport width. */

  function Directions() {
    var btn = $('#directions');
    var panel = $('#directionspanel');
    if (!btn || !panel) return;
    var open = false;

    panel.hidden = false;
    panel.style.height = '0px';

    btn.addEventListener('click', function () {
      open = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      $('.btn__arrow', btn).textContent = open ? '↑' : '↓';
      panel.classList.toggle('is-open', open);
      if (open) {
        panel.style.height = panel.scrollHeight + 'px';
        var done = function () { panel.style.height = 'auto'; panel.removeEventListener('transitionend', done); };
        panel.addEventListener('transitionend', done);
      } else {
        panel.style.height = panel.scrollHeight + 'px';
        /* one frame at the measured height so there is something to
           transition *from* — going straight to 0 from `auto` does
           not animate */
        global.requestAnimationFrame(function () {
          global.requestAnimationFrame(function () { panel.style.height = '0px'; });
        });
      }
    });
  }

  /* ── the booking form ────────────────────────────────────────
     It validates and it says what it is. Nothing is sent anywhere:
     there is no server behind this page, and a form that pretends
     to have booked a table at a restaurant that does not exist is
     a worse thing to build than one that says so. */

  function Book() {
    var form = $('#book');
    if (!form) return;
    var status = $('#bookstatus');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = null;
      $$('input[required]', form).forEach(function (i) {
        var ok = i.value.trim() !== '' && (i.type !== 'email' || /.+@.+\..+/.test(i.value));
        i.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok && !bad) bad = i;
      });
      if (bad) {
        status.className = 'book__status';
        status.textContent = 'That one needs filling in first.';
        bad.focus();
        return;
      }
      var d = new FormData(form);
      status.className = 'book__status is-ok';
      status.textContent = 'Held: ' + d.get('size') + ' at ' + d.get('time') +
        '. This is a design concept — no table has actually been booked.';
      form.querySelector('button[type="submit"]').disabled = true;
    });
  }

  SHRIM.Site = {
    $: $, $$: $$, el: el,
    Nav: Nav, Reveals: Reveals, Cursor: Cursor,
    Menu: Menu, Map: Map, Directions: Directions, Book: Book
  };

})(window);
