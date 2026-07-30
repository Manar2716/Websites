/* ═══════════════════════════════════════════════════════════
   printjob.js — the centrepiece: scrolling *is* the print job.
   A parametric vase is sliced into 480 layers and rendered in
   isometric projection. Scroll down and the machine lays layers
   down; scroll up and it un-prints. Nothing is pre-baked — the
   geometry is evaluated live, which is why it stays crisp at
   any canvas resolution.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CORE = global.CORE, U = CORE.U;

  var LAYERS   = 480;   /* total slices — matches the HUD readout */
  var SIDES    = 34;    /* points per contour */
  var BAND     = 12;    /* layers filled per batched path */
  var LINE_EVERY = 4;   /* stroke every Nth layer for layer-line texture */
  var Z_TOTAL  = 2.0;   /* model height in radius-units */
  var TWIST    = 1.55;  /* radians of twist across full height */
  var FLUTES   = 6;

  var COS30 = Math.cos(Math.PI / 6);
  var SIN30 = 0.5;

  /* vase profile: radius at normalised height z (0 = plate) */
  function profile(z) {
    var bulge = 0.26 * Math.exp(-Math.pow((z - 0.33) / 0.30, 2));
    var lip   = 0.09 * Math.exp(-Math.pow((z - 0.96) / 0.10, 2));
    return 0.30 + bulge + lip;
  }

  function PrintJob(canvas, opts) {
    var ctx = canvas.getContext('2d', { alpha: true });
    var dpr = 1, w = 0, h = 0, scale = 1, cx = 0, cy = 0;
    var lastDrawn = -1, lastPhase = -1;

    /* precompute the unit circle once — the hot loop is pure
       multiplication after this */
    var cosT = new Float32Array(SIDES + 1);
    var sinT = new Float32Array(SIDES + 1);
    for (var i = 0; i <= SIDES; i++) {
      var t = (i / SIDES) * Math.PI * 2;
      cosT[i] = Math.cos(t);
      sinT[i] = Math.sin(t);
    }

    function resize() {
      /* 2.5x on high-density panels: this is the hero visual, it
         earns the pixels */
      dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      w = canvas.clientWidth || 1;
      h = canvas.clientHeight || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var spanX = 2 * COS30 * Math.SQRT2 * 0.72;
      var spanY = 2 * SIN30 * Math.SQRT2 * 0.72 + Z_TOTAL;
      scale = Math.min(w / spanX, h / spanY) * 0.80;
      cx = w / 2;
      cy = h / 2 + (Z_TOTAL * scale) / 2 - h * 0.04;
      lastDrawn = -1; /* force a repaint */
    }

    /* project a model point to screen space */
    function px(x, y) { return cx + (x - y) * COS30 * scale; }
    function py(x, y, z) { return cy + (x + y) * SIN30 * scale - z * scale; }

    /* append one layer's contour to a path */
    function contour(path, layer) {
      var z = layer / (LAYERS - 1);
      var R = profile(z);
      var twist = z * TWIST;
      var zz = z * Z_TOTAL;

      for (var i = 0; i <= SIDES; i++) {
        var ang = (i / SIDES) * Math.PI * 2;
        var r = R * (1 + 0.10 * Math.cos(FLUTES * (ang + twist)));
        var x = r * cosT[i], y = r * sinT[i];
        /* rotate the contour by the twist */
        var cw = Math.cos(twist), sw = Math.sin(twist);
        var rx = x * cw - y * sw, ry = x * sw + y * cw;
        var sx = px(rx, ry), sy = py(rx, ry, zz);
        if (i === 0) path.moveTo(sx, sy); else path.lineTo(sx, sy);
      }
      path.closePath();
    }

    /* the build plate: an isometric grid diamond */
    function plate() {
      var e = 1.05;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(166,204,92,0.10)';
      var n = 8;
      var p = new Path2D();
      for (var g = 0; g <= n; g++) {
        var f = -e + (2 * e * g) / n;
        p.moveTo(px(f, -e), py(f, -e, 0));
        p.lineTo(px(f,  e), py(f,  e, 0));
        p.moveTo(px(-e, f), py(-e, f, 0));
        p.lineTo(px( e, f), py( e, f, 0));
      }
      ctx.stroke(p);

      /* plate edge */
      ctx.strokeStyle = 'rgba(166,204,92,0.30)';
      var o = new Path2D();
      o.moveTo(px(-e, -e), py(-e, -e, 0));
      o.lineTo(px( e, -e), py( e, -e, 0));
      o.lineTo(px( e,  e), py( e,  e, 0));
      o.lineTo(px(-e,  e), py(-e,  e, 0));
      o.closePath();
      ctx.stroke(o);
    }

    /* What hasn't printed yet, as a slicer preview: widely spaced
       rings tied together by vertical seams. Sampling every 24
       layers just looked like scribble — this reads as geometry. */
    function ghost(from) {
      if (from >= LAYERS - 1) return;
      var p = new Path2D();

      var step = 48;
      var first = Math.ceil(from / step) * step;
      for (var l = first; l < LAYERS; l += step) contour(p, l);
      contour(p, LAYERS - 1);

      /* six vertical seams up the remaining height */
      for (var s = 0; s < 6; s++) {
        var ang = (s / 6) * Math.PI * 2;
        var started = false;
        for (var z = from; z < LAYERS; z += 12) {
          var zn = z / (LAYERS - 1);
          var tw = zn * TWIST;
          var rr = profile(zn) * (1 + 0.10 * Math.cos(FLUTES * (ang + tw)));
          var xx = rr * Math.cos(ang), yy = rr * Math.sin(ang);
          var cw = Math.cos(tw), sw = Math.sin(tw);
          var rx = xx * cw - yy * sw, ry = xx * sw + yy * cw;
          var sx = px(rx, ry), sy = py(rx, ry, zn * Z_TOTAL);
          if (!started) { p.moveTo(sx, sy); started = true; } else p.lineTo(sx, sy);
        }
      }

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(74,122,46,0.20)';
      ctx.stroke(p);
    }

    /* the nozzle riding the perimeter of the active layer */
    function nozzle(layer, phase) {
      var z = layer / (LAYERS - 1);
      var R = profile(z);
      var twist = z * TWIST;
      var zz = z * Z_TOTAL;
      var ang = phase * Math.PI * 2;
      var r = R * (1 + 0.10 * Math.cos(FLUTES * (ang + twist)));
      var x = r * Math.cos(ang), y = r * Math.sin(ang);
      var cw = Math.cos(twist), sw = Math.sin(twist);
      var rx = x * cw - y * sw, ry = x * sw + y * cw;
      var sx = px(rx, ry), sy = py(rx, ry, zz);

      /* filament coming down from off-frame */
      var g = ctx.createLinearGradient(sx, sy - scale * 0.9, sx, sy);
      g.addColorStop(0, 'rgba(216,239,160,0)');
      g.addColorStop(1, 'rgba(216,239,160,0.55)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy - scale * 0.9);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      /* hot tip */
      ctx.globalCompositeOperation = 'lighter';
      var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
      glow.addColorStop(0, 'rgba(216,239,160,0.85)');
      glow.addColorStop(0.35, 'rgba(166,204,92,0.35)');
      glow.addColorStop(1, 'rgba(166,204,92,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 16, 0, 6.2832);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle = '#d8efa0';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.9, 0, 6.2832);
      ctx.fill();
    }

    /* ── main draw ──
       Layers are grouped into bands and filled as one compound
       path, so 480 slices cost ~40 fills instead of 480. */
    function draw(progress, phase) {
      var done = Math.floor(progress * (LAYERS - 1));

      ctx.clearRect(0, 0, w, h);
      plate();
      ghost(done);

      /* bands, bottom to top — painter's order gives free occlusion */
      for (var b = 0; b <= done; b += BAND) {
        var top = Math.min(b + BAND - 1, done);
        var mid = (top / (LAYERS - 1));

        var path = new Path2D();
        for (var l = b; l <= top; l++) contour(path, l);

        /* one hue, walked up the ramp by height — the object has to
           read as solid mass, not as a stack of outlines */
        var light = 11 + mid * 23;
        ctx.fillStyle = 'hsl(96 32% ' + light.toFixed(1) + '%)';
        ctx.fill(path);
      }

      /* layer lines, batched into a single stroke */
      if (done > 0) {
        var lines = new Path2D();
        for (var l2 = 0; l2 <= done; l2 += LINE_EVERY) contour(lines, l2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(127,168,63,0.42)';
        ctx.stroke(lines);
      }

      /* the freshly-laid bead reads hottest */
      var recent = new Path2D();
      for (var l3 = Math.max(0, done - 3); l3 <= done; l3++) contour(recent, l3);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(216,239,160,0.85)';
      ctx.stroke(recent);

      if (progress > 0.002 && progress < 0.999) nozzle(done, phase);

      lastDrawn = done;
      lastPhase = phase;
    }

    resize();
    CORE.onResize(resize);

    return {
      layers: LAYERS,
      resize: resize,
      draw: draw,
      /* skip the frame entirely if nothing moved */
      needsDraw: function (progress, phase) {
        var done = Math.floor(progress * (LAYERS - 1));
        return done !== lastDrawn || Math.abs(phase - lastPhase) > 0.004;
      }
    };
  }

  global.PRINTJOB = { PrintJob: PrintJob, LAYERS: LAYERS, Z_TOTAL: Z_TOTAL };
})(window);
