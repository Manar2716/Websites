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
    /* camera state: current zoom, and the damped point it orbits */
    var lastZoom = 1;
    var focus = { x: null, y: null };

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
      ctx.lineWidth = 1 / lastZoom;
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

      ctx.lineWidth = 1 / lastZoom;
      /* the slicer preview is context, and context is exactly what a
         close-up is not about — fade it as the camera pushes in */
      var a = 0.20 * U.clamp((3.2 - lastZoom) / 2.0, 0, 1);
      if (a <= 0.005) return;
      ctx.strokeStyle = 'rgba(74,122,46,' + a.toFixed(3) + ')';
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
      ctx.lineWidth = 1.4 / lastZoom;
      ctx.beginPath();
      ctx.moveTo(sx, sy - scale * 0.9);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      /* hot tip */
      ctx.globalCompositeOperation = 'lighter';
      var gr = 16 / lastZoom;
      var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
      glow.addColorStop(0, 'rgba(216,239,160,0.85)');
      glow.addColorStop(0.35, 'rgba(166,204,92,0.35)');
      glow.addColorStop(1, 'rgba(166,204,92,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, gr, 0, 6.2832);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle = '#d8efa0';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.9 / lastZoom, 0, 6.2832);
      ctx.fill();
    }

    /* ── the camera ──
       Scroll doesn't just print the object, it moves the view: the
       shot pushes in until the nozzle fills the frame while the
       first layers go down, holds there through the detail, then
       pulls back out as the part gets tall enough to need the room.
       Returns a zoom factor; the focus point is the nozzle itself. */
    function camera(p) {
      if (p < 0.08) return U.lerp(1, 1.3, U.ease(p / 0.08));            /* ease off the wide */
      if (p < 0.24) return U.lerp(1.3, 3.0, U.ease((p - 0.08) / 0.16));  /* push in */
      if (p < 0.44) return 3.0;                                          /* hold the close-up */
      if (p < 0.72) return U.lerp(3.0, 1.12, U.ease((p - 0.44) / 0.28)); /* pull out */
      return U.lerp(1.12, 0.98, U.ease((p - 0.72) / 0.28));              /* settle wide */
    }

    /* where the nozzle is right now, in screen space */
    function nozzlePoint(layer, phase) {
      var z = layer / (LAYERS - 1);
      var R = profile(z);
      var twist = z * TWIST;
      var ang = phase * Math.PI * 2;
      var r = R * (1 + 0.10 * Math.cos(FLUTES * (ang + twist)));
      var x = r * Math.cos(ang), y = r * Math.sin(ang);
      var cw = Math.cos(twist), sw = Math.sin(twist);
      var rx = x * cw - y * sw, ry = x * sw + y * cw;
      return { x: px(rx, ry), y: py(rx, ry, z * Z_TOTAL) };
    }

    /* ── main draw ──
       Layers are grouped into bands and filled as one compound
       path, so 480 slices cost ~40 fills instead of 480. */
    function draw(progress, phase) {
      var done = Math.floor(progress * (LAYERS - 1));

      ctx.clearRect(0, 0, w, h);

      /* Scale about the nozzle so it stays pinned in frame while
         the world grows around it. Damped, or the focus point jumps
         every time the nozzle crosses the seam of a layer. */
      var zoom = camera(progress);
      var np = nozzlePoint(done, phase);
      if (focus.x === null) { focus.x = np.x; focus.y = np.y; }
      else {
        focus.x = U.lerp(focus.x, np.x, 0.12);
        focus.y = U.lerp(focus.y, np.y, 0.12);
      }

      ctx.save();
      if (zoom !== 1) {
        var ax = w / 2 + (focus.x - w / 2) * 0.85;
        var ay = h / 2 + (focus.y - h / 2) * 0.85;
        ctx.translate(ax, ay);
        ctx.scale(zoom, zoom);
        ctx.translate(-ax, -ay);
      }
      lastZoom = zoom;

      /* Zoomed in, the frame should be the build front: the last
         few millimetres of wall, the bead, the nozzle. Rendering the
         whole body at 3x just fills the canvas with solid mass, so
         cull to the active zone and drop the plate and the preview. */
      var close = lastZoom > 1.9;
      var floor = close ? Math.max(0, done - 88) : 0;

      if (!close) { plate(); ghost(done); }

      /* bands, bottom to top — painter's order gives free occlusion */
      for (var b = floor; b <= done; b += BAND) {
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

      /* Layer lines, batched into a single stroke. Zoomed in, every
         layer is drawn and the stroke is scaled back down so it
         stays a hairline instead of thickening with the camera —
         that's what sells the close-up as real detail. */
      if (done > 0) {
        var step = close ? 1 : LINE_EVERY;
        var lines = new Path2D();
        for (var l2 = floor; l2 <= done; l2 += step) contour(lines, l2);
        ctx.lineWidth = 1 / lastZoom;
        ctx.strokeStyle = 'rgba(127,168,63,' + (close ? 0.5 : 0.42) + ')';
        ctx.stroke(lines);
      }

      /* the freshly-laid bead reads hottest */
      var recent = new Path2D();
      for (var l3 = Math.max(0, done - 3); l3 <= done; l3++) contour(recent, l3);
      ctx.lineWidth = 1.4 / lastZoom;
      ctx.strokeStyle = 'rgba(216,239,160,0.85)';
      ctx.stroke(recent);

      if (progress > 0.002 && progress < 0.999) nozzle(done, phase);

      ctx.restore();

      lastDrawn = done;
      lastPhase = phase;
    }

    resize();
    CORE.onResize(resize);

    return {
      layers: LAYERS,
      resize: resize,
      draw: draw,
      zoom: function () { return lastZoom; },
      /* skip the frame entirely if nothing moved */
      needsDraw: function (progress, phase) {
        var done = Math.floor(progress * (LAYERS - 1));
        return done !== lastDrawn || Math.abs(phase - lastPhase) > 0.004;
      }
    };
  }

  global.PRINTJOB = { PrintJob: PrintJob, LAYERS: LAYERS, Z_TOTAL: Z_TOTAL };
})(window);
