/* ═══════════════════════════════════════════════════════════
   site.js — everything below the film.

   The film has a GPU. The page does not, and it still has to
   feel like the same piece of work: objects that arrive from
   inside the scene rather than fading in, steam that carries one
   section into the next, products that float and turn, and a map
   you can push around with a finger.

   The rules are the ones the rest of the repository runs on:

     · scroll, pointer and resize handlers park a number and
       return — they never read layout
     · every element offset is measured once, on load and on
       resize, into a table the loop reads from
     · one requestAnimationFrame drives everything, and it stops
       itself the moment nothing on screen is moving
     · only transform, opacity and custom properties are written

   Nothing in here is required to read the page. With scripting
   off, none of it runs and the sections are a plain column.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  var doc = document;

  function sat(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function arc(t) { return Math.sin(sat(t) * Math.PI); }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ══════════════════════════════════════════════════════════
     THE VEILS — steam and espresso between sections

     Painted once each, at a quarter of their display size,
     because a plume has no detail to lose and a 480×160 canvas
     stretched over 1800 CSS pixels is exactly the softness the
     effect wants anyway. After that they are transformed and
     nothing repaints.
     ══════════════════════════════════════════════════════════ */

  function paintPlume(canvas, seed) {
    var w = 480, h = 170;
    canvas.width = w; canvas.height = h;
    var g = canvas.getContext('2d');
    if (!g) return;
    var r = rng(seed);

    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 26; i++) {
      var x = w * (0.08 + r() * 0.84);
      /* thickest at the seam, thinning upward — the plume is
         leaving the section below, not arriving from nowhere */
      var t = r();
      var y = h * (0.98 - t * 0.92);
      var rad = w * (0.045 + (1 - t) * 0.085 + r() * 0.03);
      var a = (0.052 + r() * 0.05) * (1 - t * 0.55);
      var gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(238,222,200,' + a.toFixed(3) + ')');
      gr.addColorStop(0.5, 'rgba(226,204,178,' + (a * 0.45).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(210,186,158,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, rad * (1 + r() * 0.5), rad * (0.72 + r() * 0.5), (r() - 0.5) * 0.8, 0, Math.PI * 2);
      g.fill();
    }
  }

  /* An espresso splash: a crown of liquid with the droplets that
     left it still in the air above. It reads at a glance and it
     is eight beziers and forty circles. */
  function paintSplash(canvas, seed) {
    var w = 480, h = 170;
    canvas.width = w; canvas.height = h;
    var g = canvas.getContext('2d');
    if (!g) return;
    var r = rng(seed);
    var cx = w / 2, base = h * 0.92;

    var body = g.createLinearGradient(0, h * 0.2, 0, base);
    body.addColorStop(0, 'rgba(201,138,75,.50)');
    body.addColorStop(0.45, 'rgba(122,64,28,.46)');
    body.addColorStop(1, 'rgba(42,21,9,.40)');

    /* the crown */
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(cx - w * 0.34, base);
    var spikes = 9;
    for (var i = 0; i <= spikes; i++) {
      var t = i / spikes;
      var x = cx - w * 0.34 + w * 0.68 * t;
      var peak = base - h * (0.20 + Math.sin(t * Math.PI) * 0.52 * (0.6 + r() * 0.7));
      g.quadraticCurveTo(x - w * 0.018, (base + peak) / 2, x, peak);
      g.quadraticCurveTo(x + w * 0.018, (base + peak) / 2, x + w * 0.034, base);
    }
    g.lineTo(cx + w * 0.36, base + h * 0.1);
    g.lineTo(cx - w * 0.36, base + h * 0.1);
    g.closePath();
    g.fill();

    /* what left the crown and has not landed yet */
    for (var d = 0; d < 42; d++) {
      var dx = cx + (r() - 0.5) * w * 0.86;
      var dy = base - h * (0.15 + Math.pow(r(), 1.5) * 0.92);
      var rad = w * 0.006 * (0.5 + r() * 2.2);
      g.beginPath();
      g.ellipse(dx, dy, rad, rad * (1 + r() * 0.5), 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(' + [201, 138, 75].join(',') + ',' + (0.20 + r() * 0.45).toFixed(2) + ')';
      g.fill();
    }
  }

  /* ══════════════════════════════════════════════════════════
     THE MAP — a city block, in three dimensions, on a canvas

     Not a tile server and not a picture of one. It is a grid of
     extruded blocks and five pins, projected by hand, sorted
     back to front and drawn. Drag turns it; letting go leaves it
     turning and lets the drag decay.
     ══════════════════════════════════════════════════════════ */

  function Map3(canvas, stores) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.ok = !!this.g;
    if (!this.ok) return;

    this.yaw = -0.62; this.yawVel = 0;
    /* 0.86 rad was almost plan view: the blocks read as tiles
       lying on the ground rather than as anything standing up on
       it. At 0.58 the camera is low enough to see two walls of
       every block, which is where the extrusion starts to read. */
    this.pitch = 0.58;
    this.drag = null;
    this.sel = 0;
    this.selT = 0;
    this.T = 0;
    this.w = 1; this.h = 1; this.dpr = 1;
    this.stores = stores;

    this.blocks = this.build();
  }

  /* The city is generated once from a seeded PRNG, so it is the
     same city on every load — a map that reshuffles itself when
     you resize the window is not a map. */
  Map3.prototype.build = function () {
    var r = rng(1966);
    var out = [];
    var N = 7;
    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
        var x = (i - (N - 1) / 2) * 1.34;
        var z = (j - (N - 1) / 2) * 1.34;
        /* the bay takes the far corner out */
        if (x + z < -4.4) continue;
        var d = Math.hypot(x, z);
        var tall = Math.max(0, 1 - d / 5.4);
        out.push({
          x: x, z: z,
          w: 0.52 + r() * 0.42,
          d: 0.52 + r() * 0.42,
          h: 0.24 + tall * (0.45 + r() * 2.0) * (r() > 0.82 ? 1.9 : 1),
          lit: r()
        });
      }
    }
    return out;
  };

  Map3.prototype.resize = function (w, h, dpr) {
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
  };

  /* world → screen. One rotation about Y, one pitch, one
     perspective divide. The camera never moves; the city turns
     under it, which is cheaper and reads the same. */
  Map3.prototype.project = function (x, y, z, out) {
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    var rx = x * cy - z * sy;
    var rz = x * sy + z * cy;
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var ry2 = y * cp - rz * sp;
    var rz2 = y * sp + rz * cp;

    var dist = 11.5;
    var d = rz2 + dist;
    if (d < 0.35) d = 0.35;
    var f = (Math.min(this.w, this.h * 1.55) * 0.92) / d;
    out[0] = this.w / 2 + rx * f;
    out[1] = this.h * 0.56 - ry2 * f;
    out[2] = d;
    return out;
  };

  Map3.prototype.update = function (dt) {
    this.T += dt;
    if (this.drag) {
      this.yaw = this.drag.yaw0 + (this.drag.x - this.drag.x0) * 0.006;
      this.yawVel = (this.yaw - (this._lastYaw || this.yaw)) / Math.max(dt, 1e-3);
    } else {
      /* let the throw decay, then settle into a slow idle turn */
      this.yawVel += (0.055 - this.yawVel) * (1 - Math.exp(-0.9 * dt));
      this.yaw += this.yawVel * dt;
    }
    this._lastYaw = this.yaw;
    this.selT += (this.sel - this.selT) * (1 - Math.exp(-9 * dt));
  };

  Map3.prototype.render = function () {
    var g = this.g, w = this.w, h = this.h;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    /* the ground, and the bay it stops at */
    var ground = g.createRadialGradient(w * 0.5, h * 0.56, 0, w * 0.5, h * 0.56, Math.max(w, h) * 0.7);
    ground.addColorStop(0, '#1c1209');
    ground.addColorStop(0.55, '#120b06');
    ground.addColorStop(1, '#080504');
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);

    var p = [0, 0, 0], q = [0, 0, 0];
    var i;

    /* street grid, drawn flat on the ground plane */
    g.strokeStyle = 'rgba(201,138,75,.13)';
    g.lineWidth = 1;
    for (i = -4; i <= 4; i++) {
      g.beginPath();
      this.project(i * 1.34, 0, -5.4, p); g.moveTo(p[0], p[1]);
      this.project(i * 1.34, 0, 5.4, q); g.lineTo(q[0], q[1]);
      g.stroke();
      g.beginPath();
      this.project(-5.4, 0, i * 1.34, p); g.moveTo(p[0], p[1]);
      this.project(5.4, 0, i * 1.34, q); g.lineTo(q[0], q[1]);
      g.stroke();
    }

    /* everything with depth goes into one list and is sorted
       back to front — blocks and pins together, or a pin behind a
       tower draws on top of it */
    var items = [];
    for (i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      this.project(b.x, 0, b.z, p);
      items.push({ d: p[2], b: b });
    }
    var S = this.stores;
    for (i = 0; i < S.length; i++) {
      this.project(S[i].x, 0, S[i].z, p);
      items.push({ d: p[2] - 0.15, s: S[i], i: i });
    }
    items.sort(function (a, c) { return c.d - a.d; });

    /* Labels come out of the painter's order and go in a pass of
       their own at the end. Sorted properly, a pin at the back of
       the city has the whole city painted over its name, which is
       correct occlusion and useless as a map. */
    this._labels = [];
    for (i = 0; i < items.length; i++) {
      if (items[i].b) this.drawBlock(items[i].b);
      else this.drawPin(items[i].s, items[i].i);
    }
    for (i = 0; i < this._labels.length; i++) this.drawLabel(this._labels[i]);

    /* the vignette that puts the edges of the plate into shadow */
    var vg = g.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.28, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,3,2,.72)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  };

  Map3.prototype.drawBlock = function (b) {
    var g = this.g;
    var hw = b.w / 2, hd = b.d / 2;
    var p = [0, 0, 0];
    var top = [], bot = [];
    var cs = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (var i = 0; i < 4; i++) {
      this.project(b.x + cs[i][0], b.h, b.z + cs[i][1], p); top.push([p[0], p[1]]);
      this.project(b.x + cs[i][0], 0, b.z + cs[i][1], p); bot.push([p[0], p[1]]);
    }

    /* the two walls that face the camera, picked by winding —
       drawing all four is four times the fill for no pixels */
    for (var f = 0; f < 4; f++) {
      var a = f, c = (f + 1) % 4;
      var ax = top[c][0] - top[a][0], ay = top[c][1] - top[a][1];
      var bx = bot[a][0] - top[a][0], by = bot[a][1] - top[a][1];
      if (ax * by - ay * bx <= 0) continue;
      g.beginPath();
      g.moveTo(top[a][0], top[a][1]);
      g.lineTo(top[c][0], top[c][1]);
      g.lineTo(bot[c][0], bot[c][1]);
      g.lineTo(bot[a][0], bot[a][1]);
      g.closePath();
      /* the two visible walls are lit differently, and both are
         well under the roof — a block whose sides match its top
         is a flat shape with an outline on it */
      g.fillStyle = f % 2 ? 'rgba(46,28,17,1)' : 'rgba(24,14,9,1)';
      g.fill();
    }

    g.beginPath();
    g.moveTo(top[0][0], top[0][1]);
    for (var k = 1; k < 4; k++) g.lineTo(top[k][0], top[k][1]);
    g.closePath();
    g.fillStyle = 'rgba(86,58,36,1)';
    g.fill();
    g.strokeStyle = 'rgba(201,138,75,' + (0.10 + b.lit * 0.16).toFixed(2) + ')';
    g.lineWidth = 1;
    g.stroke();
  };

  Map3.prototype.drawPin = function (s, i) {
    var g = this.g;
    var on = 1 - Math.min(1, Math.abs(this.selT - i));
    var hgt = s.h * (1 + on * 0.34);
    var p = [0, 0, 0], q = [0, 0, 0];
    this.project(s.x, 0, s.z, p);
    this.project(s.x, hgt, s.z, q);

    /* the pool of light it stands in */
    var pr = (this.w * 0.055) * (11.5 / p[2]) * (0.6 + on * 0.9);
    var pool = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], pr);
    pool.addColorStop(0, 'rgba(201,138,75,' + (0.30 + on * 0.34).toFixed(2) + ')');
    pool.addColorStop(1, 'rgba(201,138,75,0)');
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(p[0], p[1], pr, pr * 0.42, 0, 0, Math.PI * 2);
    g.fill();

    g.beginPath();
    g.moveTo(p[0], p[1]);
    g.lineTo(q[0], q[1]);
    g.strokeStyle = 'rgba(232,214,189,' + (0.32 + on * 0.5).toFixed(2) + ')';
    g.lineWidth = 1 + on;
    g.stroke();

    /* the head is a bean, turning, and it bobs when selected */
    var scale = (this.w * 0.022) * (11.5 / q[2]) * (0.8 + on * 0.7);
    var bob = on * Math.sin(this.T * 2.2) * scale * 0.18;
    PEET.Art.bean(g, q[0], q[1] + bob, scale, this.T * 0.9 + i, on > 0.5 ? '#c98a4b' : '#7c3f1c');

    if (on > 0.02) this._labels.push({ x: q[0], y: q[1] - scale * 2.1, on: on, text: s.label });
  };

  /* The label carries its own shade, the same way the film's
     captions do, because it sits over a city and not over a
     background. It is also kept inside the plate: a name that
     runs off the edge of the map is not a label. */
  Map3.prototype.drawLabel = function (L) {
    var g = this.g;
    g.font = '500 ' + Math.round(12 * (0.9 + L.on * 0.3)) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    var tw = g.measureText(L.text).width;
    var x = Math.min(Math.max(L.x, tw / 2 + 14), this.w - tw / 2 - 14);
    var y = Math.max(L.y, 22);

    g.globalAlpha = L.on * 0.78;
    g.fillStyle = '#0b0705';
    g.beginPath();
    if (g.roundRect) g.roundRect(x - tw / 2 - 9, y - 14, tw + 18, 21, 3);
    else g.rect(x - tw / 2 - 9, y - 14, tw + 18, 21);
    g.fill();
    g.globalAlpha = L.on * 0.5;
    g.strokeStyle = '#c98a4b';
    g.lineWidth = 1;
    g.stroke();

    g.globalAlpha = L.on;
    g.fillStyle = '#f4ece1';
    g.fillText(L.text, x, y);
    g.globalAlpha = 1;
    g.textAlign = 'start';
  };

  /* ══════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════ */

  function boot() {
    var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);

    /* ── the parked numbers ── */
    var scrollY = global.scrollY || global.pageYOffset || 0;
    var vh = global.innerHeight;
    var vw = global.innerWidth;

    /* ── nav ────────────────────────────────────────────────── */
    var nav = doc.getElementById('nav');
    var navToggle = doc.getElementById('navtoggle');
    var navLinks = [].slice.call(doc.querySelectorAll('.nav__link'));
    var sections = navLinks
      .map(function (a) {
        var id = a.getAttribute('href').slice(1);
        return { link: a, el: doc.getElementById(id), top: 0 };
      })
      .filter(function (s) { return s.el; });

    if (navToggle && nav) {
      navToggle.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) {
          nav.classList.remove('is-open');
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.focus();
        }
      });
      [].slice.call(doc.querySelectorAll('.nav__links a')).forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('is-open');
          navToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    /* ── reveals ──────────────────────────────────────────────
       An IntersectionObserver alone is not enough here, and the
       reason is worth writing down: it only notifies on a
       *threshold crossing*. Jump from the film straight to
       #bakery — which every link in the nav does — and the four
       sections in between go from "below the viewport, not
       intersecting" to "above the viewport, not intersecting"
       without ever crossing 0.06. No entry is delivered, and they
       stay at opacity 0 until something else moves.

       So the observer handles ordinary scrolling, and a sweep
       handles jumps: any time the scroll position moves more than
       three quarters of a viewport between frames, everything not
       yet revealed gets its box measured once and anything at or
       above the fold is let in. Normal scrolling never triggers
       it; nothing else in the loop reads layout. */
    var waiting = [].slice.call(doc.querySelectorAll('[data-reveal],[data-stagger]'));

    [].slice.call(doc.querySelectorAll('[data-stagger]')).forEach(function (el) {
      /* the stagger is a custom property per child, so the whole
         group is one observed element and one class write, not
         one observer per card */
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) {
        kids[i].style.setProperty('--d', (i * 0.075).toFixed(3) + 's');
      }
    });

    var io = null;

    function reveal(el) {
      var at = waiting.indexOf(el);
      if (at < 0) return;
      waiting.splice(at, 1);
      el.classList.add('is-in');
      if (io) io.unobserve(el);
      /* drop the compositor hint once the move is over */
      setTimeout(function () { el.classList.add('is-done'); }, 1800);
    }

    function sweep() {
      for (var i = waiting.length - 1; i >= 0; i--) {
        if (waiting[i].getBoundingClientRect().top < vh * 0.88) reveal(waiting[i]);
      }
    }

    if (global.IntersectionObserver) {
      io = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) reveal(e.target); });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });
      waiting.slice().forEach(function (el) { io.observe(el); });
    } else {
      waiting.slice().forEach(function (el) { el.classList.add('is-in', 'is-done'); });
      waiting.length = 0;
    }

    /* ── the product art ─────────────────────────────────────
       Drawn once, when the card first comes within a screen of
       the viewport, and redrawn only if the card's box changes
       size by more than a third. */
    var figures = [].slice.call(doc.querySelectorAll('[data-art]')).map(function (card) {
      var spec;
      try { spec = JSON.parse(card.getAttribute('data-art')); }
      catch (err) { spec = null; }
      return { card: card, spec: spec, canvas: card.querySelector('.card__c'), drawn: 0 };
    }).filter(function (f) { return f.spec && f.canvas; });

    function drawFigure(f) {
      var box = f.canvas.getBoundingClientRect();
      var w = box.width || 240, h = box.height || 240;
      if (f.drawn && Math.abs(w - f.drawn) / f.drawn < 0.34) return;
      if (PEET.Art.draw(f.canvas, f.spec, w, h, dpr)) f.drawn = w;
    }

    var artIO = null;
    if (global.IntersectionObserver) {
      artIO = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) drawFigure(e.target.__fig);
        });
      }, { rootMargin: '100% 0px' });
      figures.forEach(function (f) { f.card.__fig = f; artIO.observe(f.card); });
    } else {
      figures.forEach(drawFigure);
    }

    /* ── floating cards ──────────────────────────────────────
       Every product drifts on its own phase — a slow vertical
       bob and a fraction of a degree of roll. It is written as
       two custom properties so the hover scale and the Z offset
       stay in the stylesheet where they belong. */
    var floaters = [];
    if (!reduced && global.IntersectionObserver) {
      var floatIO = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var f = e.target.__fig;
          if (!f) return;
          var at = floaters.indexOf(f);
          if (e.isIntersecting && at < 0) { floaters.push(f); kick(); }
          else if (!e.isIntersecting && at >= 0) {
            floaters.splice(at, 1);
            f.canvas.style.removeProperty('--fy');
            f.canvas.style.removeProperty('--fr');
          }
        });
      }, { rootMargin: '10% 0px' });
      figures.forEach(function (f, i) { f.phase = i * 1.37; floatIO.observe(f.card); });
    }

    /* ── pointer tilt ────────────────────────────────────────
       The rect is read once, on enter. Moves after that are
       arithmetic on a cached box — a getBoundingClientRect per
       pointermove is a forced layout per pointermove. */
    var tilted = null;
    var cards = [].slice.call(doc.querySelectorAll('[data-card]'));
    if (!reduced && global.matchMedia('(pointer: fine)').matches) {
      cards.forEach(function (card) {
        card.addEventListener('pointerenter', function () {
          card.__box = card.getBoundingClientRect();
          tilted = card;
        });
        card.addEventListener('pointermove', function (e) {
          var b = card.__box;
          if (!b) return;
          var nx = (e.clientX - b.left) / b.width - 0.5;
          var ny = (e.clientY - b.top) / b.height - 0.5;
          card.style.setProperty('--ry', (nx * 11).toFixed(2) + 'deg');
          card.style.setProperty('--rx', (-ny * 9).toFixed(2) + 'deg');
          card.style.setProperty('--ty', (-4).toFixed(0) + 'px');
        });
        card.addEventListener('pointerleave', function () {
          card.style.setProperty('--ry', '0deg');
          card.style.setProperty('--rx', '0deg');
          card.style.setProperty('--ty', '0px');
          card.__box = null;
          if (tilted === card) tilted = null;
        });
      });
    }

    /* the rewards card leans toward the pointer across the whole
       section, which is the only element on the page that reacts
       to a pointer it is not under */
    var rcard = doc.querySelector('.rcard__face');
    var rsec = doc.getElementById('rewards');
    if (rcard && rsec && !reduced) {
      rsec.addEventListener('pointermove', function (e) {
        var b = rsec.getBoundingClientRect();
        var nx = (e.clientX - b.left) / b.width - 0.5;
        var ny = (e.clientY - b.top) / b.height - 0.5;
        rcard.style.setProperty('--ry', (-14 + nx * 16).toFixed(2) + 'deg');
        rcard.style.setProperty('--rx', (8 - ny * 12).toFixed(2) + 'deg');
      });
    }

    /* ── the veils ───────────────────────────────────────────── */
    var veils = [].slice.call(doc.querySelectorAll('.veil')).map(function (el, i) {
      var canvas = el.querySelector('.veil__c');
      var splash = el.classList.contains('veil--splash');
      if (canvas) (splash ? paintSplash : paintPlume)(canvas, 100 + i * 7);
      return { el: el, top: 0, splash: splash };
    });

    /* ── the map ─────────────────────────────────────────────── */
    var mapEl = doc.querySelector('.map');
    var mapCanvas = doc.getElementById('map');
    var storeEls = [].slice.call(doc.querySelectorAll('.store'));
    var map = null;

    if (mapCanvas) {
      map = new Map3(mapCanvas, [
        { x: -1.9, z: -1.2, h: 2.5, label: 'Walnut & Vine' },
        { x: 1.7, z: 1.9, h: 1.6, label: 'Mission & 22nd' },
        { x: -2.6, z: 1.4, h: 1.7, label: 'Shattuck Ave' },
        { x: 2.4, z: -2.1, h: 1.8, label: 'Ferry Building' },
        { x: 0.4, z: 2.9, h: 1.5, label: 'Grand Lake' }
      ]);
      if (!map.ok) map = null;
    }

    function selectStore(i) {
      if (!map) return;
      map.sel = i;
      storeEls.forEach(function (el, k) { el.classList.toggle('is-on', k === i); });
      kick();
    }

    storeEls.forEach(function (el, i) {
      el.addEventListener('mouseenter', function () { selectStore(i); });
      el.addEventListener('click', function () { selectStore(i); });
    });

    if (mapEl && map) {
      mapEl.addEventListener('pointerdown', function (e) {
        map.drag = { x0: e.clientX, x: e.clientX, yaw0: map.yaw };
        mapEl.setPointerCapture(e.pointerId);
        kick();
      });
      mapEl.addEventListener('pointermove', function (e) {
        if (map.drag) { map.drag.x = e.clientX; kick(); }
      });
      function endDrag() { map.drag = null; }
      mapEl.addEventListener('pointerup', endDrag);
      mapEl.addEventListener('pointercancel', endDrag);
    }

    var mapVisible = false;
    if (mapEl && global.IntersectionObserver) {
      new global.IntersectionObserver(function (entries) {
        mapVisible = entries[0].isIntersecting;
        if (mapVisible) kick();
      }, { rootMargin: '15% 0px' }).observe(mapEl);
    } else {
      mapVisible = true;
    }

    /* ══ measure ══
       Every offset the loop needs, read here and nowhere else. */
    function measure() {
      vh = global.innerHeight;
      vw = global.innerWidth;
      var y = global.scrollY || global.pageYOffset || 0;
      var i;
      for (i = 0; i < sections.length; i++) {
        sections[i].top = sections[i].el.getBoundingClientRect().top + y;
      }
      for (i = 0; i < veils.length; i++) {
        veils[i].top = veils[i].el.getBoundingClientRect().top + y;
      }
      if (map && mapEl) {
        var b = mapEl.getBoundingClientRect();
        map.resize(b.width, b.height, dpr);
      }
      /* only ones already on screen: the rest are drawn by their
         own observer when they get near, and redrawing all
         thirty-four here would put thirty-four canvas repaints
         into the same frame as the WebGL context coming up */
      for (i = 0; i < figures.length; i++) if (figures[i].drawn) drawFigure(figures[i]);
      kick();
    }

    global.addEventListener('scroll', function () {
      scrollY = global.scrollY || global.pageYOffset || 0;
      kick();
    }, { passive: true });

    var rt = 0;
    global.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(measure, 140);
    }, { passive: true });

    /* ══ the loop ══
       It genuinely stops. Anything that could start something
       moving — a scroll, a pointer, a resize, an observer firing
       — calls kick(), and the loop shuts itself down again half a
       second after the last frame that had work in it. On the
       film, where none of this is on screen, that is a page doing
       nothing at all while the WebGL loop has the machine to
       itself. */
    var last = 0, T = 0, pending = false, hidden = false;
    var quietFor = 0;
    var navPrev = 0, actIdx = -1, sweepY = -1e9;

    function kick() {
      quietFor = 0;                  /* even if a frame is already booked */
      if (pending || hidden) return;
      pending = true;
      last = 0;                      /* a restart must not see a huge dt */
      global.requestAnimationFrame(frame);
    }

    function frame(ms) {
      pending = false;

      var dt = last ? (ms - last) / 1000 : 0.016;
      last = ms;
      if (dt > 0.1) dt = 0.1;

      var moving = false;
      T += dt;

      /* a jump, not a scroll: catch up anything the observer's
         thresholds were skipped over */
      if (waiting.length && Math.abs(scrollY - sweepY) > vh * 0.75) {
        sweepY = scrollY;
        sweep();
      }

      /* ── nav state ── */
      if (nav) {
        var solid = scrollY > vh * 0.35;
        if (solid !== frame.__solid) { nav.classList.toggle('is-solid', solid); frame.__solid = solid; }
        /* hide going down, show coming up — but never over the
           opening of the film, where it is transparent anyway */
        var away = scrollY > vh * 1.2 && scrollY > navPrev + 4 && !nav.classList.contains('is-open');
        if (scrollY < navPrev - 4 || scrollY < vh) away = false;
        if (away !== frame.__away) { nav.classList.toggle('is-away', away); frame.__away = away; }
        navPrev = scrollY;
      }

      /* ── current section ── */
      var probe = scrollY + vh * 0.42;
      var act = 0;
      for (var i = 0; i < sections.length; i++) if (probe >= sections[i].top) act = i;
      if (act !== actIdx) {
        actIdx = act;
        for (var k = 0; k < sections.length; k++) sections[k].link.classList.toggle('is-on', k === act);
      }

      /* ── veils ──
         One number in, two composited properties out. The plume
         rises through its own seam as the seam crosses the
         viewport; the splash is thrown the other way. */
      for (var v = 0; v < veils.length; v++) {
        var ve = veils[v];
        var rel = (scrollY + vh - ve.top) / (vh * 1.1);
        var a = arc(sat(rel));
        if (a < 0.004 && ve.__a === 0) continue;
        ve.__a = a < 0.004 ? 0 : a;
        var rise = ve.splash ? (1 - rel) * 34 : (0.5 - rel) * 120;
        var sc = ve.splash ? lerp(0.86, 1.14, sat(rel)) : lerp(1.22, 0.82, sat(rel));
        ve.el.style.opacity = (a * (ve.splash ? 0.72 : 0.95)).toFixed(3);
        ve.el.style.transform =
          'translate(-50%,' + (-46 + rise * 0.12).toFixed(2) + '%) scale(' + sc.toFixed(3) + ')';
      }

      /* ── floating products ── */
      for (var f = 0; f < floaters.length; f++) {
        var fl = floaters[f];
        var ph = fl.phase;
        fl.canvas.style.setProperty('--fy', (Math.sin(T * 0.62 + ph) * 5.5).toFixed(2) + 'px');
        fl.canvas.style.setProperty('--fr', (Math.sin(T * 0.41 + ph * 1.7) * 1.35).toFixed(2) + 'deg');
      }
      if (floaters.length) moving = true;

      /* ── the map ── */
      if (map && mapVisible) {
        map.update(dt);
        map.render();
        moving = true;
      }

      /* Idle out. Half a second of frames with nothing moving in
         them and the loop stops asking for more — the page on the
         film, or parked in the footer, costs nothing. Anything
         that could start motion calls kick() and it comes back. */
      quietFor = moving ? 0 : quietFor + dt;
      if (quietFor < 0.5 && !hidden) {
        pending = true;
        global.requestAnimationFrame(frame);
      }
    }

    doc.addEventListener('visibilitychange', function () {
      hidden = doc.hidden;
      if (!hidden) kick();
    });

    measure();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
    /* the grid reflows as the cards' own reveal transition runs */
    setTimeout(measure, 900);
    global.addEventListener('load', measure);

    kick();
  }

  PEET.Site = { boot: boot, Map3: Map3 };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
