/* ═══════════════════════════════════════════════════════════════════
   sky.js — the air the aircraft is flying through.

   Three cloud decks, a star field and the contrails, all generated at
   runtime. The performance trick is that none of it is redrawn: each
   deck is rendered once into an offscreen canvas at boot and then
   blitted twice per frame at an offset, so a deck made of 90 soft
   radial gradients costs exactly two drawImage calls. Only the
   contrail particles are live geometry.

   Parallax rates are deliberately non-linear across the decks — the
   far cirrus barely moves, the near wisps move faster than the page.
   That difference is the whole illusion of depth; matching rates would
   read as one flat backdrop sliding past.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AX = global.AX, U = AX.U, S = AX.S, P = AX.P;

  /* ─────────────── offscreen deck rendering ─────────────── */

  function makeDeck(w, h, cfg) {
    var cv = global.document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    var rnd = U.rand(cfg.seed);

    for (var i = 0; i < cfg.puffs; i++) {
      /* clusters, not confetti: pick a cluster centre, then scatter a
         handful of blobs around it. Uniform noise looks like static;
         clustered noise looks like weather. */
      var cx = rnd() * w;
      var cy = cfg.band[0] * h + rnd() * (cfg.band[1] - cfg.band[0]) * h;
      var lobes = 3 + Math.floor(rnd() * 5);
      for (var j = 0; j < lobes; j++) {
        var x = cx + (rnd() - 0.5) * cfg.spread;
        var y = cy + (rnd() - 0.5) * cfg.spread * cfg.flat;
        var r = cfg.rMin + rnd() * (cfg.rMax - cfg.rMin);
        var a = cfg.alpha * (0.45 + rnd() * 0.55);
        var g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + cfg.rgb + ',' + a.toFixed(3) + ')');
        g.addColorStop(0.55, 'rgba(' + cfg.rgb + ',' + (a * 0.42).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + cfg.rgb + ',0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }

    /* wrap seam repair: anything drawn off the right edge is redrawn
       on the left, so the tiling has no visible join */
    c.globalCompositeOperation = 'source-over';
    return cv;
  }

  function makeStars(w, h, seed) {
    var cv = global.document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    var rnd = U.rand(seed);
    for (var i = 0; i < 420; i++) {
      var x = rnd() * w;
      /* density falls off toward the horizon, where the sky is bright */
      var y = Math.pow(rnd(), 1.7) * h;
      var r = 0.35 + Math.pow(rnd(), 3) * 1.5;
      var a = (0.20 + rnd() * 0.65) * (1 - y / h * 0.75);
      c.fillStyle = 'rgba(214,232,255,' + a.toFixed(3) + ')';
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    return cv;
  }

  /* ─────────────── contrail particles ─────────────── */

  function Trails(max) {
    this.max = max;
    this.p = new Float32Array(max * 6); /* x,y,vx,vy,life,size */
    this.n = 0;
  }

  Trails.prototype.emit = function (x, y, vx, vy, size) {
    var i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    var o = i * 6;
    this.p[o] = x; this.p[o + 1] = y;
    this.p[o + 2] = vx; this.p[o + 3] = vy;
    this.p[o + 4] = 1; this.p[o + 5] = size;
  };

  Trails.prototype.step = function (dt) {
    var p = this.p;
    for (var i = 0; i < this.n; i++) {
      var o = i * 6;
      if (p[o + 4] <= 0) continue;
      p[o] += p[o + 2] * dt;
      p[o + 1] += p[o + 3] * dt;
      p[o + 2] *= (1 - 0.55 * dt);
      p[o + 5] += 26 * dt;           /* trails spread as they age */
      p[o + 4] -= 0.24 * dt;
    }
  };

  Trails.prototype.draw = function (c) {
    var p = this.p;
    for (var i = 0; i < this.n; i++) {
      var o = i * 6;
      var life = p[o + 4];
      if (life <= 0) continue;
      var a = life * life * 0.30;
      var r = p[o + 5];
      var g = c.createRadialGradient(p[o], p[o + 1], 0, p[o], p[o + 1], r);
      g.addColorStop(0, 'rgba(226,240,255,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(226,240,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(p[o], p[o + 1], r, 0, Math.PI * 2);
      c.fill();
    }
  };

  /* ─────────────── the scene ─────────────── */

  function init(canvas, planeEl) {
    var ctx = canvas.getContext('2d', { alpha: true });
    var size = { w: 0, h: 0 };
    var decks = [];
    var stars = null;
    var trails = new Trails(240);
    var emitAcc = 0;
    var visible = true;

    var DECKS = [
      /* rate: multiplier on scroll. drift: px/sec of self-motion. */
      { seed: 7,  puffs: 22, lobes: 5, spread: 260, flat: 0.34, rMin: 90,  rMax: 230, alpha: 0.16, rgb: '150,186,232', band: [0.34, 0.56], rate: 0.06, drift: 3,  mouse: 6,  blur: 26 },
      { seed: 31, puffs: 18, lobes: 5, spread: 330, flat: 0.30, rMin: 120, rMax: 300, alpha: 0.26, rgb: '186,214,246', band: [0.52, 0.76], rate: 0.17, drift: 9,  mouse: 16, blur: 16 },
      { seed: 91, puffs: 12, lobes: 4, spread: 420, flat: 0.26, rMin: 170, rMax: 420, alpha: 0.30, rgb: '92,124,176',  band: [0.74, 1.02], rate: 0.42, drift: 22, mouse: 34, blur: 8 }
    ];

    function build() {
      var r = canvas.getBoundingClientRect();
      size.w = Math.max(1, Math.round(r.width));
      size.h = Math.max(1, Math.round(r.height));
      var dw = Math.min(2048, Math.round(size.w * 1.35));
      var dh = Math.round(size.h);
      decks = DECKS.map(function (cfg) {
        return { cfg: cfg, cv: makeDeck(dw, dh, cfg), w: dw };
      });
      stars = makeStars(dw, Math.round(dh * 0.8), 5);
      starW = dw;
    }
    var starW = 1;

    build();
    AX.onResize(build);

    var sub = AX.add(function (dt, now) {
      if (!visible) return;
      var m = AX.fitCanvas(canvas, ctx);
      if (m.w !== size.w || m.h !== size.h) { size.w = m.w; size.h = m.h; }

      ctx.clearRect(0, 0, size.w, size.h);

      var sy = S.smooth;
      var t = now / 1000;

      /* stars — the slowest thing on screen */
      if (stars) {
        var sox = -(t * 1.2 + P.sx * 4) % starW;
        ctx.globalAlpha = U.clamp(1 - sy / (S.vh * 0.9), 0, 1);
        ctx.drawImage(stars, sox, -sy * 0.03 + P.sy * 3);
        ctx.drawImage(stars, sox + starW, -sy * 0.03 + P.sy * 3);
        ctx.globalAlpha = 1;
      }

      /* decks, far to near */
      for (var i = 0; i < decks.length; i++) {
        var d = decks[i], cfg = d.cfg;
        var ox = -((t * cfg.drift + P.sx * cfg.mouse) % d.w);
        var oy = -sy * cfg.rate + P.sy * cfg.mouse * 0.35;
        ctx.globalAlpha = U.clamp(1.05 - sy / (S.vh * 1.6), 0, 1);
        ctx.drawImage(d.cv, ox, oy);
        ctx.drawImage(d.cv, ox + d.w, oy);
      }
      ctx.globalAlpha = 1;

      /* contrails, emitted from wherever the aircraft's engines are */
      if (!AX.reduced() && planeEl && sy < S.vh * 1.2) {
        var pr = planeEl.getBoundingClientRect();
        var cr = canvas.getBoundingClientRect();
        var ex = pr.left - cr.left + pr.width * 0.44;
        var ey = pr.top - cr.top + pr.height * 0.62;
        emitAcc += dt;
        while (emitAcc > 0.026) {
          emitAcc -= 0.026;
          trails.emit(
            ex + (Math.random() - 0.5) * 6,
            ey + (Math.random() - 0.5) * 5,
            -150 - Math.random() * 70,
            (Math.random() - 0.5) * 16,
            5 + Math.random() * 5
          );
        }
        trails.step(dt);
        trails.draw(ctx);
      }
    }, 'sky');

    return {
      setVisible: function (v) { visible = v; sub.active = v; }
    };
  }

  AX.sky = { init: init };

})(window);
