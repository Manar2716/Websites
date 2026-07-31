/* ═══════════════════════════════════════════════════════════
   art.js — the menu illustrations, drawn on a 2D canvas.

   Seven dishes, seen from almost directly above. Overhead is the
   choice that makes this section possible at all: a
   three-quarter view of food needs a renderer, and there is one
   in this project, but it is busy — running a third WebGL context
   for seven thumbnails would cost more than the entire film.
   From overhead a prawn is a curl, a mussel is a teardrop, a
   lemon is a wheel, and all of it is Bézier work.

   Everything below is drawn in a 0…1 space and scaled to whatever
   the panel turns out to be, so the art is resolution-independent
   and is simply redrawn on resize rather than stretched.

   The palette is the page's: cold moon from the upper left, warm
   boil from below. Every piece gets a cool rim on one side and a
   warm bounce on the other, which is what stops flat vector food
   from reading as clip art.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  var M = SHRIMP.M;
  var TAU = Math.PI * 2;

  var C = {
    shell:   '#E4703F',
    shellHi: '#F9A272',
    shellLo: '#8E3418',
    band:    '#B84A22',
    crab:    '#EE8451',
    mussel:  '#25293A',
    musselHi:'#4A5372',
    pearl:   '#C9B79E',
    corn:    '#E9B441',
    cornHi:  '#F7DA8B',
    lemon:   '#E4CE4A',
    lemonHi: '#F6EDA0',
    garlic:  '#E8E1D2',
    potato:  '#B08A56',
    herb:    '#4C7B3A',
    herbHi:  '#7FB05E',
    sausage: '#7A2C1E',
    salmon:  '#E9765A',
    salmonHi:'#FBB196',
    pasta:   '#E2C489',
    cream:   '#EFE0BE',
    stock:   '#B4491C',
    steel:   '#5A626E',
    steelHi: '#96A1B2',
    clay:    '#7A4028',
    stone:   '#2A2E34',
    moon:    'rgba(150,190,240,',
    boil:    'rgba(242,121,43,'
  };

  /* ── helpers ─────────────────────────────────────────────── */

  function ctxOf(canvas, dpr) {
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  /* Light every piece the same way: a cool edge on the upper
     left, a warm bounce on the lower right. Applied as two thin
     strokes rather than as a gradient fill, because a stroke
     survives being scaled down to 90 px and a subtle gradient
     does not. */
  function relight(ctx, path, cool, warm) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.moon + (cool || 0.5) + ')';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.stroke(path);
    ctx.restore();
    ctx.save();
    ctx.translate(0.8, 1.4);
    ctx.strokeStyle = C.boil + (warm || 0.32) + ')';
    ctx.lineWidth = 1.2;
    ctx.stroke(path);
    ctx.restore();
  }

  /* A prawn from above: a comma with a banded back and a fan. */
  function prawn(ctx, x, y, s, rot, tint) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);

    var p = new Path2D();
    /* the outer curve of the curl, then back along the inner */
    p.moveTo(26, -14);
    p.bezierCurveTo(6, -30, -22, -20, -26, 2);
    p.bezierCurveTo(-29, 22, -10, 34, 8, 30);
    p.bezierCurveTo(20, 27, 26, 18, 24, 10);
    p.bezierCurveTo(22, 3, 14, 0, 8, 3);
    p.bezierCurveTo(2, 6, 1, 13, 5, 17);
    p.bezierCurveTo(-2, 19, -10, 14, -11, 5);
    p.bezierCurveTo(-12, -7, -2, -16, 10, -14);
    p.bezierCurveTo(16, -13, 21, -10, 24, -6);
    p.closePath();

    var g = ctx.createLinearGradient(-26, -22, 20, 30);
    g.addColorStop(0, C.shellHi);
    g.addColorStop(0.5, tint || C.shell);
    g.addColorStop(1, C.shellLo);
    ctx.fillStyle = g;
    ctx.fill(p);

    /* the plates: six arcs across the back of the curl */
    ctx.save();
    ctx.clip(p);
    ctx.strokeStyle = 'rgba(142,52,24,.55)';
    ctx.lineWidth = 2.1;
    for (var i = 0; i < 6; i++) {
      var a = -1.5 + i * 0.52;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8 + 4);
      ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30 + 4);
      ctx.stroke();
    }
    ctx.restore();

    /* the tail fan */
    var f = new Path2D();
    f.moveTo(26, -14);
    f.lineTo(41, -25);
    f.lineTo(43, -14);
    f.lineTo(41, -4);
    f.closePath();
    ctx.fillStyle = 'rgba(249,162,114,.86)';
    ctx.fill(f);

    relight(ctx, p, 0.42, 0.30);
    ctx.restore();
  }

  function mussel(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    var p = new Path2D();
    p.moveTo(-26, 0);
    p.bezierCurveTo(-16, -16, 12, -18, 26, -4);
    p.bezierCurveTo(14, 14, -12, 16, -26, 0);
    p.closePath();
    var g = ctx.createLinearGradient(-26, -16, 26, 16);
    g.addColorStop(0, C.musselHi);
    g.addColorStop(1, C.mussel);
    ctx.fillStyle = g;
    ctx.fill(p);
    /* growth rings, and the pearl of meat showing at the crack */
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = 'rgba(200,215,245,.22)';
    ctx.lineWidth = 1.1;
    for (var i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(-26, 0, i * 9, i * 6.2, 0, -1.1, 1.1);
      ctx.stroke();
    }
    ctx.fillStyle = C.pearl;
    ctx.globalAlpha = .85;
    ctx.beginPath();
    ctx.ellipse(6, -1, 13, 6, -0.15, 0, TAU);
    ctx.fill();
    ctx.restore();
    relight(ctx, p, 0.55, 0.20);
    ctx.restore();
  }

  function cornRound(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    var p = new Path2D();
    p.moveTo(-30, -11);
    p.bezierCurveTo(-34, -2, -34, 2, -30, 11);
    p.lineTo(30, 11);
    p.bezierCurveTo(34, 2, 34, -2, 30, -11);
    p.closePath();
    ctx.fillStyle = C.corn;
    ctx.fill(p);
    ctx.save(); ctx.clip(p);
    /* kernels in staggered rows, same arrangement as the 3D one */
    for (var r = 0; r < 3; r++) {
      for (var k = -4; k <= 4; k++) {
        var kx = k * 7.4 + (r % 2 ? 3.7 : 0);
        var ky = -7 + r * 7;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 3.4, 3.1, 0, 0, TAU);
        ctx.fillStyle = r === 0 ? C.cornHi : C.corn;
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,80,16,.35)';
        ctx.lineWidth = .8;
        ctx.stroke();
      }
    }
    ctx.restore();
    relight(ctx, p, 0.40, 0.34);
    ctx.restore();
  }

  function lemon(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    var p = new Path2D();
    p.arc(0, 0, 20, 0, TAU);
    ctx.fillStyle = C.lemon;
    ctx.fill(p);
    ctx.beginPath(); ctx.arc(0, 0, 16.5, 0, TAU);
    ctx.fillStyle = C.lemonHi; ctx.fill();
    /* eight segments, drawn as wedges with a gap at the pith */
    ctx.save();
    for (var i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 14.5, -0.34, 0.34);
      ctx.closePath();
      ctx.fillStyle = 'rgba(232,206,74,.82)';
      ctx.fill();
    }
    ctx.restore();
    relight(ctx, p, 0.48, 0.26);
    ctx.restore();
  }

  function herb(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.strokeStyle = C.herb;
    ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-22, 6); ctx.quadraticCurveTo(0, -2, 22, -8); ctx.stroke();
    for (var i = 0; i < 5; i++) {
      var t = i / 4;
      var lx = -22 + t * 44, ly = 6 - t * 14 + Math.sin(t * 3) * 1.5;
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        ctx.beginPath();
        ctx.ellipse(lx + 2, ly + sgn * 5, 7.5, 3.1, sgn * 0.6 - 0.2, 0, TAU);
        ctx.fillStyle = sgn < 0 ? C.herbHi : C.herb;
        ctx.globalAlpha = .92;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function garlicClove(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    var p = new Path2D();
    p.moveTo(0, -16);
    p.bezierCurveTo(9, -6, 11, 8, 0, 15);
    p.bezierCurveTo(-11, 8, -9, -6, 0, -16);
    p.closePath();
    ctx.fillStyle = C.garlic; ctx.fill(p);
    ctx.strokeStyle = 'rgba(150,138,116,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 13); ctx.stroke();
    relight(ctx, p, 0.34, 0.22);
    ctx.restore();
  }

  function crabLeg(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    var p = new Path2D();
    p.moveTo(-38, 6);
    p.bezierCurveTo(-16, -6, 10, -8, 36, -2);
    p.lineTo(38, 3);
    p.bezierCurveTo(10, 4, -16, 4, -38, 13);
    p.closePath();
    var g = ctx.createLinearGradient(-38, -8, 38, 12);
    g.addColorStop(0, C.crab); g.addColorStop(1, C.shellLo);
    ctx.fillStyle = g; ctx.fill(p);
    /* the three knuckles */
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = 'rgba(120,40,16,.55)'; ctx.lineWidth = 2.4;
    for (var i = 0; i < 3; i++) {
      var kx = -22 + i * 22;
      ctx.beginPath(); ctx.moveTo(kx, -10); ctx.lineTo(kx - 3, 14); ctx.stroke();
    }
    ctx.restore();
    relight(ctx, p, 0.42, 0.28);
    ctx.restore();
  }

  function sausageRound(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    var p = new Path2D();
    p.ellipse(0, 0, 15, 12, 0, 0, TAU);
    ctx.fillStyle = C.sausage; ctx.fill(p);
    ctx.fillStyle = 'rgba(190,90,58,.5)';
    for (var i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(Math.cos(i * 2.4) * 7, Math.sin(i * 2.4) * 5.5, 1.8, 0, TAU);
      ctx.fill();
    }
    relight(ctx, p, 0.30, 0.30);
    ctx.restore();
  }

  function potatoHalf(ctx, x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    var p = new Path2D();
    p.ellipse(0, 0, 19, 15, 0, 0, TAU);
    ctx.fillStyle = C.potato; ctx.fill(p);
    ctx.fillStyle = 'rgba(232,214,176,.85)';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 11.5, 0, 0, TAU); ctx.fill();
    relight(ctx, p, 0.30, 0.28);
    ctx.restore();
  }

  /* ── vessels, from above ─────────────────────────────────── */

  function vesselRound(ctx, cx, cy, r, rim, fill, rimCol) {
    var g = ctx.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
    g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = rimCol; ctx.lineWidth = rim;
    ctx.beginPath(); ctx.arc(cx, cy, r - rim * .5, 0, TAU); ctx.stroke();
    /* the inner shadow that gives the vessel a wall */
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r - rim, 0, TAU); ctx.clip();
    var ig = ctx.createRadialGradient(cx, cy, r * .55, cx, cy, r);
    ig.addColorStop(0, 'rgba(0,0,0,0)');
    ig.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = ig;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  /* ── the ground every dish sits on ───────────────────────── */

  function ground(ctx, w, h) {
    var g = ctx.createRadialGradient(w * .5, h * .58, 0, w * .5, h * .58, Math.max(w, h) * .72);
    g.addColorStop(0, 'rgba(36,22,14,1)');
    g.addColorStop(.55, 'rgba(12,14,20,1)');
    g.addColorStop(1, 'rgba(5,7,11,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* the boil, glowing up through the dish from below */
    var bg = ctx.createRadialGradient(w * .5, h * .62, 0, w * .5, h * .62, w * .48);
    bg.addColorStop(0, 'rgba(242,121,43,.30)');
    bg.addColorStop(1, 'rgba(242,121,43,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    /* moonlight from the upper left */
    var mg = ctx.createLinearGradient(0, 0, w * .8, h);
    mg.addColorStop(0, 'rgba(120,170,235,.16)');
    mg.addColorStop(.6, 'rgba(120,170,235,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, w, h);
  }

  /* the cast shadow under a vessel — one ellipse, blurred by
     being drawn three times at falling alpha, which is cheaper
     than a canvas filter and works everywhere */
  function castShadow(ctx, cx, cy, rx, ry) {
    for (var i = 3; i >= 1; i--) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.10 * i) + ')';
      ctx.beginPath();
      ctx.ellipse(cx + i * 1.5, cy + i * 3.5, rx + i * 5, ry + i * 4, 0, 0, TAU);
      ctx.fill();
    }
  }

  /* ── the seven compositions ──────────────────────────────── */

  var COMPOSE = {
    bucket: function (ctx, w, h, rnd) {
      var cx = w * .5, cy = h * .56, r = Math.min(w, h) * .40;
      castShadow(ctx, cx, cy + r * .18, r * .92, r * .40);
      vesselRound(ctx, cx, cy, r, r * .11, ['#7C8797', '#3C434E'], C.steelHi);
      var n = 15;
      for (var i = 0; i < n; i++) {
        var a = rnd() * TAU, rr = Math.sqrt(rnd()) * r * .70;
        var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * .92;
        var s = r * .0155 * (.8 + rnd() * .5);
        var rot = rnd() * TAU;
        var pick = i % 7;
        if (pick === 0 || pick === 3) prawn(ctx, x, y, s, rot);
        else if (pick === 1) crabLeg(ctx, x, y, s * .9, rot);
        else if (pick === 2) mussel(ctx, x, y, s, rot);
        else if (pick === 4) cornRound(ctx, x, y, s * .9, rot);
        else if (pick === 5) sausageRound(ctx, x, y, s, rot);
        else potatoHalf(ctx, x, y, s * .9, rot);
      }
      lemon(ctx, cx + r * .48, cy - r * .42, r * .014, 0);
      herb(ctx, cx - r * .42, cy + r * .40, r * .014, -.4);
    },

    shrimp: function (ctx, w, h, rnd) {
      var cx = w * .5, cy = h * .56, r = Math.min(w, h) * .40;
      castShadow(ctx, cx, cy + r * .18, r * .92, r * .40);
      vesselRound(ctx, cx, cy, r, r * .11, ['#7C8797', '#3C434E'], C.steelHi);
      for (var i = 0; i < 13; i++) {
        var a = rnd() * TAU, rr = Math.sqrt(rnd()) * r * .70;
        prawn(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .92,
              r * .0165 * (.85 + rnd() * .4), rnd() * TAU);
      }
      garlicClove(ctx, cx - r * .50, cy + r * .34, r * .016, .5);
      garlicClove(ctx, cx + r * .44, cy + r * .46, r * .014, -.8);
      lemon(ctx, cx + r * .52, cy - r * .34, r * .015, 0);
      herb(ctx, cx - r * .34, cy - r * .50, r * .013, .35);
    },

    salmon: function (ctx, w, h, rnd) {
      var cx = w * .5, cy = h * .56, r = Math.min(w, h) * .42;
      castShadow(ctx, cx, cy + r * .16, r * .94, r * .36);
      vesselRound(ctx, cx, cy, r, r * .07, ['#33383F', '#191C21'], '#4A515C');

      /* the fillet: a lozenge with the flake lines across it and a
         charred edge on the skin side only */
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(-.30);
      var p = new Path2D();
      p.moveTo(-r * .62, -r * .20);
      p.bezierCurveTo(-r * .20, -r * .34, r * .30, -r * .28, r * .60, -r * .10);
      p.bezierCurveTo(r * .34, r * .16, -r * .18, r * .30, -r * .60, r * .16);
      p.closePath();
      var g = ctx.createLinearGradient(-r * .6, -r * .3, r * .6, r * .3);
      g.addColorStop(0, C.salmonHi); g.addColorStop(1, C.salmon);
      ctx.fillStyle = g; ctx.fill(p);
      ctx.save(); ctx.clip(p);
      ctx.strokeStyle = 'rgba(255,222,206,.55)'; ctx.lineWidth = r * .022;
      for (var i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * .13, -r * .34);
        ctx.quadraticCurveTo(i * r * .13 + r * .05, 0, i * r * .13, r * .32);
        ctx.stroke();
      }
      /* the char, on the lower edge */
      ctx.fillStyle = 'rgba(28,16,12,.72)';
      ctx.beginPath();
      ctx.moveTo(-r * .62, r * .06);
      ctx.bezierCurveTo(-r * .18, r * .28, r * .34, r * .14, r * .62, -r * .10);
      ctx.lineTo(r * .62, r * .34); ctx.lineTo(-r * .62, r * .34);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      relight(ctx, p, .5, .3);
      ctx.restore();

      lemon(ctx, cx + r * .52, cy + r * .42, r * .016, 0);
      lemon(ctx, cx - r * .56, cy - r * .40, r * .012, .6);
      herb(ctx, cx + r * .12, cy - r * .52, r * .016, -.3);
      herb(ctx, cx - r * .30, cy + r * .54, r * .013, .5);
    },

    thermidor: function (ctx, w, h, rnd) {
      var cx = w * .5, cy = h * .56, r = Math.min(w, h) * .42;
      castShadow(ctx, cx, cy + r * .16, r * .94, r * .36);
      vesselRound(ctx, cx, cy, r, r * .07, ['#33383F', '#191C21'], '#4A515C');

      /* half a shell, filled and blistered */
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(.18);
      var sh = new Path2D();
      sh.ellipse(0, 0, r * .58, r * .30, 0, 0, TAU);
      ctx.fillStyle = C.shellLo; ctx.fill(sh);
      var fill = new Path2D();
      fill.ellipse(0, 0, r * .50, r * .23, 0, 0, TAU);
      var g = ctx.createLinearGradient(-r * .5, -r * .2, r * .5, r * .2);
      g.addColorStop(0, C.cream); g.addColorStop(1, '#D2A55E');
      ctx.fillStyle = g; ctx.fill(fill);
      /* the blistering: darker spots where the grill caught it */
      ctx.save(); ctx.clip(fill);
      for (var i = 0; i < 16; i++) {
        ctx.fillStyle = 'rgba(120,66,20,' + (0.16 + rnd() * 0.3).toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse((rnd() - .5) * r, (rnd() - .5) * r * .46, r * (.02 + rnd() * .04), r * (.015 + rnd() * .03), rnd(), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      relight(ctx, sh, .5, .3);
      ctx.restore();

      /* the claw, laid across the plate */
      ctx.save();
      ctx.translate(cx - r * .44, cy - r * .40); ctx.rotate(-.7); ctx.scale(r * .017, r * .017);
      var cl = new Path2D();
      cl.ellipse(0, 0, 24, 15, 0, 0, TAU);
      ctx.fillStyle = C.crab; ctx.fill(cl);
      ctx.beginPath();
      ctx.moveTo(20, -5); ctx.lineTo(48, -13); ctx.lineTo(48, -6); ctx.lineTo(21, 0); ctx.closePath();
      ctx.fillStyle = C.shell; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(20, 4); ctx.lineTo(47, 6); ctx.lineTo(46, 13); ctx.lineTo(20, 9); ctx.closePath();
      ctx.fill();
      relight(ctx, cl, .45, .28);
      ctx.restore();

      herb(ctx, cx + r * .28, cy + r * .50, r * .014, -.4);
      lemon(ctx, cx + r * .56, cy - r * .34, r * .013, 0);
    },

    pasta: function (ctx, w, h, rnd) {
      var cx = w * .5, cy = h * .56, r = Math.min(w, h) * .42;
      castShadow(ctx, cx, cy + r * .16, r * .90, r * .38);
      vesselRound(ctx, cx, cy, r, r * .09, ['#33383F', '#191C21'], '#4A515C');

      /* the nest: overlapping arcs at varying radii. Drawing
         strands individually is the whole illustration here —
         there is no shortcut that reads as pasta. */
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r * .78, 0, TAU); ctx.clip();
      ctx.lineCap = 'round';
      for (var i = 0; i < 46; i++) {
        var rr = r * (.12 + rnd() * .52);
        var a0 = rnd() * TAU, sweep = 1.4 + rnd() * 3.4;
        var ox = (rnd() - .5) * r * .34, oy = (rnd() - .5) * r * .30;
        ctx.strokeStyle = i % 3 === 0 ? '#F0DCA9' : (i % 3 === 1 ? C.pasta : '#C7A469');
        ctx.lineWidth = r * .036;
        ctx.beginPath();
        ctx.ellipse(cx + ox, cy + oy, rr, rr * .74, rnd() * TAU, a0, a0 + sweep);
        ctx.stroke();
      }
      /* the stock, pooled and catching the light */
      ctx.globalAlpha = .30;
      ctx.fillStyle = C.stock;
      ctx.beginPath(); ctx.ellipse(cx, cy + r * .28, r * .62, r * .22, 0, 0, TAU); ctx.fill();
      ctx.restore();

      prawn(ctx, cx + r * .30, cy - r * .26, r * .016, -.5);
      prawn(ctx, cx - r * .34, cy + r * .16, r * .014, 2.1);
      mussel(ctx, cx + r * .06, cy + r * .44, r * .014, .3);
      mussel(ctx, cx - r * .46, cy - r * .30, r * .012, -.6);
      herb(ctx, cx + r * .38, cy + r * .44, r * .012, -.2);
    },

    tagine: function (ctx, w, h, rnd) {
      var cx = w * .5, cy = h * .58, r = Math.min(w, h) * .40;
      castShadow(ctx, cx, cy + r * .18, r * .96, r * .40);
      vesselRound(ctx, cx, cy, r, r * .13, ['#8E5233', '#4A2617'], '#B57A4C');

      /* the glaze rings a tagine is decorated with */
      ctx.strokeStyle = 'rgba(216,162,74,.42)';
      ctx.lineWidth = r * .018;
      for (var k = 1; k <= 2; k++) {
        ctx.beginPath(); ctx.arc(cx, cy, r * (.80 + k * .055), 0, TAU); ctx.stroke();
      }

      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * TAU + .3, rr = r * (.24 + (i % 3) * .16);
        prawn(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .9,
              r * .0145 * (.9 + rnd() * .25), a + 1.6);
      }
      lemon(ctx, cx - r * .40, cy - r * .34, r * .013, 0);
      lemon(ctx, cx + r * .42, cy + r * .30, r * .011, .8);
      /* green olives — the one colour on this page that is neither
         moon nor boil, and it earns its place by being the only
         one */
      for (var o = 0; o < 5; o++) {
        var oa = rnd() * TAU, orr = Math.sqrt(rnd()) * r * .60;
        ctx.fillStyle = '#6E7C36';
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(oa) * orr, cy + Math.sin(oa) * orr * .9, r * .038, r * .030, oa, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,190,240,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      herb(ctx, cx + r * .04, cy + r * .52, r * .013, -.25);
    },

    soup: function (ctx, w, h, rnd) {
      var cx = w * .5, cy = h * .56, r = Math.min(w, h) * .40;
      castShadow(ctx, cx, cy + r * .18, r * .88, r * .38);
      vesselRound(ctx, cx, cy, r, r * .12, ['#33383F', '#191C21'], '#4A515C');

      /* the surface: a bisque with the cream swirled in, drawn as
         two offset radial gradients rather than as a texture */
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r * .80, 0, TAU); ctx.clip();
      var g = ctx.createRadialGradient(cx - r * .2, cy - r * .25, r * .05, cx, cy, r * .85);
      g.addColorStop(0, '#D8642A'); g.addColorStop(1, '#8C3413');
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

      ctx.strokeStyle = 'rgba(239,224,190,.72)';
      ctx.lineWidth = r * .045; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r * .48, cy + r * .10);
      ctx.bezierCurveTo(cx - r * .10, cy - r * .38, cx + r * .28, cy + r * .34, cx + r * .52, cy - r * .06);
      ctx.stroke();
      ctx.globalAlpha = .5;
      ctx.lineWidth = r * .022;
      ctx.beginPath();
      ctx.moveTo(cx - r * .40, cy + r * .38);
      ctx.bezierCurveTo(cx, cy + r * .10, cx + r * .10, cy + r * .48, cx + r * .44, cy + r * .26);
      ctx.stroke();
      ctx.restore();

      prawn(ctx, cx - r * .16, cy - r * .12, r * .0145, .9);
      mussel(ctx, cx + r * .30, cy + r * .14, r * .013, -.4);
      herb(ctx, cx + r * .02, cy + r * .42, r * .012, -.2);
      /* the flick of chilli oil that says this one is hot */
      for (var i = 0; i < 7; i++) {
        var a2 = rnd() * TAU, rr2 = Math.sqrt(rnd()) * r * .62;
        ctx.fillStyle = 'rgba(255,74,43,.55)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a2) * rr2, cy + Math.sin(a2) * rr2 * .92, r * (.012 + rnd() * .016), 0, TAU);
        ctx.fill();
      }
    }
  };

  /* ── entry point ─────────────────────────────────────────── */

  function draw(canvas, name, dpr) {
    var fn = COMPOSE[name];
    if (!fn) return;
    var ctx = ctxOf(canvas, dpr);
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* Seeded per dish, so the scatter is the same drawing every
       time the panel is resized — a menu item that rearranges
       itself when the window changes width reads as a bug. */
    var rnd = M.rng(name.length * 7919 + name.charCodeAt(0) * 131);
    ground(ctx, w, h);
    ctx.save();
    fn(ctx, w, h, rnd);
    ctx.restore();

    /* a soft vignette to seat the dish in the panel */
    var vg = ctx.createRadialGradient(w * .5, h * .5, Math.min(w, h) * .25, w * .5, h * .5, Math.max(w, h) * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  SHRIMP.Art = { draw: draw, dishes: Object.keys(COMPOSE) };

})(window);
