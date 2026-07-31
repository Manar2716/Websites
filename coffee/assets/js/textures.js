/* ═══════════════════════════════════════════════════════════
   textures.js — the two images in this film, both drawn at
   runtime on a 2D canvas.

   The latte art is a rosetta built from bezier crescents rather
   than a shader function, because a rosetta is a *drawn* thing —
   it has stroke order, overlap and a pulled stem, and trying to
   express that as an SDF gets you a flower, not latte art.

   Typography goes through the same pipe: text is rasterised once,
   used as a mask by the steam shader, and sampled into a point
   cloud that droplets fly toward.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var NOC = (global.NOC = global.NOC || {});
  var M = NOC.M;

  function surface(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* ── latte art ───────────────────────────────────────────────
     Channels, packed for the liquid shader:
       R  milk coverage
       G  stroke order 0→1, so the shader can reveal it in the
          order a barista actually pulls it
       B  edge relief, for the normal perturbation that makes
          milk sit *on* the crema rather than in it
  */

  function latteArt(size) {
    size = size || 512;
    var c = surface(size, size);
    var g = c.getContext('2d');
    var S = size;

    /* work in a -1..1 art space with +x as the pull direction */
    function X(x) { return (x * 0.5 + 0.5) * S; }
    function Y(y) { return (y * 0.5 + 0.5) * S; }

    g.clearRect(0, 0, S, S);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineJoin = 'round';
    g.lineCap = 'round';

    var rnd = M.rng(7);

    /* the base pool: where the pitcher first breaks the crema */
    g.beginPath();
    g.ellipse(X(-0.60), Y(0), S * 0.085, S * 0.155, 0, 0, Math.PI * 2);
    g.fill();

    /* The leaves. Each wiggle of the pitcher lays one crescent that
       laps over the last, and what makes the stack legible is not
       the milk — it is the thin line of crema left between one leaf
       and the next. So each leaf is punched out of what is already
       there with a halo, and then filled: the halo is the gap. */
    var N = 11;
    var gap = Math.max(2, S * 0.011);

    function leafPath(x, w, lead, thick) {
      var trail = lead * 0.34;
      g.beginPath();
      g.moveTo(X(x), Y(-w));
      g.bezierCurveTo(X(x + lead), Y(-w * 0.45), X(x + lead), Y(w * 0.45), X(x), Y(w));
      g.lineTo(X(x - thick), Y(w * 0.92));
      g.bezierCurveTo(X(x - thick + trail), Y(w * 0.42), X(x - thick + trail), Y(-w * 0.42), X(x - thick), Y(-w * 0.92));
      g.closePath();
    }

    g.lineJoin = 'round';
    g.lineCap = 'round';

    for (var i = 0; i < N; i++) {
      var s = i / (N - 1);
      var x = -0.60 + s * 1.16;
      var w = (0.050 + 0.42 * Math.pow(1 - s, 0.86)) * (1 + (rnd() - .5) * 0.06);
      var lead = 0.115 + 0.055 * (1 - s);
      var thick = 0.070 * (1 - s * 0.42);

      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = gap * 2;
      leafPath(x, w, lead, thick);
      g.fill(); g.stroke();

      g.globalCompositeOperation = 'source-over';
      leafPath(x, w, lead, thick);
      g.fill();
    }

    /* the stem: the final straight pull back through the middle,
       tapering as the pitcher lifts away */
    g.beginPath();
    for (var t = 0; t <= 1.0001; t += 1 / 48) {
      var sx = -0.70 + t * 1.42;
      var sw = 0.055 * (1 - t * 0.92) + 0.006;
      if (t === 0) g.moveTo(X(sx), Y(-sw)); else g.lineTo(X(sx), Y(-sw));
    }
    for (var t2 = 1; t2 >= -0.0001; t2 -= 1 / 48) {
      var sx2 = -0.70 + t2 * 1.42;
      var sw2 = 0.055 * (1 - t2 * 0.92) + 0.006;
      g.lineTo(X(sx2), Y(sw2));
    }
    g.closePath();
    g.fill();

    /* the tip flick */
    g.beginPath();
    g.moveTo(X(0.70), Y(0));
    g.lineTo(X(0.60), Y(-0.030));
    g.lineTo(X(0.60), Y(0.030));
    g.closePath();
    g.fill();

    /* feather the boundary — milk edges into crema, it does not
       cut against it */
    if (typeof g.filter === 'string') {
      var soft = surface(S, S);
      var sg = soft.getContext('2d');
      sg.filter = 'blur(' + Math.max(1, S / 340) + 'px)';
      sg.drawImage(c, 0, 0);
      g.clearRect(0, 0, S, S);
      g.filter = 'none';
      g.drawImage(soft, 0, 0);
    }

    /* pack the channels */
    var img = g.getImageData(0, 0, S, S);
    var d = img.data;
    var cov = new Float32Array(S * S);
    var p, i2;
    for (p = 0; p < S * S; p++) cov[p] = d[p * 4 + 3] / 255;

    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        i2 = y * S + x;
        var ax = (x / S) * 2 - 1;
        var ay = (y / S) * 2 - 1;

        /* stroke order runs along the pull axis, with a little
           noise so the reveal edge is a wavering front rather
           than a wipe */
        var order = M.sat((ax + 0.78) / 1.55 + M.noise3(ax * 4, ay * 4, 0) * 0.06);

        var l = cov[i2 - 1 < 0 ? i2 : i2 - 1];
        var r = cov[i2 + 1 >= S * S ? i2 : i2 + 1];
        var u = cov[i2 - S < 0 ? i2 : i2 - S];
        var dn = cov[i2 + S >= S * S ? i2 : i2 + S];
        var edge = M.sat(Math.abs(r - l) * 3.2 + Math.abs(dn - u) * 3.2);

        d[i2 * 4]     = Math.round(cov[i2] * 255);
        d[i2 * 4 + 1] = Math.round(order * 255);
        d[i2 * 4 + 2] = Math.round(edge * 255);
        d[i2 * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ── typography ──────────────────────────────────────────────
     Rendered at the film's aspect so the steam mask lines up with
     the screen, and returned with a point cloud sampled from the
     glyph interiors. The same canvas therefore serves as both the
     shape the steam condenses into and the destination droplets
     fly to. */

  function typography(opts) {
    var w = opts.width || 1024;
    var h = opts.height || 512;
    var c = surface(w, h);
    var g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    var lines = opts.lines || [];
    var total = lines.length;
    var blockH = h * (opts.blockHeight || 0.44);
    var lineH = blockH / Math.max(total, 1);
    var top = h * (opts.centerY || 0.5) - blockH / 2 + lineH / 2;

    var family = opts.family || '"Helvetica Neue", Helvetica, Arial, sans-serif';
    var fit = opts.fit || 0.86;

    /* Measure the set line, tracking included, and pull the size in
       until it fits the box. Without this a long word silently
       overruns the canvas and is clipped at both ends — which, once
       it is sampled into a point cloud, is not a wordmark made of
       droplets, it is a solid bar of them. */
    function measure(text, size, tracking) {
      g.font = (arguments[3] || 300) + ' ' + size + 'px ' + family;
      var tw = 0;
      for (var k = 0; k < text.length; k++) tw += g.measureText(text[k]).width + tracking;
      return tw - tracking;
    }

    for (var i = 0; i < total; i++) {
      var ln = lines[i];
      var weight = ln.weight || 300;
      var size = Math.round(lineH * (ln.scale || 0.62));
      var text = ln.text;
      var tracking = (ln.tracking || 0) * size;

      var tw = measure(text, size, tracking, weight);
      var room = w * fit;
      if (tw > room) {
        size = Math.max(8, Math.floor(size * room / tw));
        tracking = (ln.tracking || 0) * size;
        tw = measure(text, size, tracking, weight);
      }

      g.font = weight + ' ' + size + 'px ' + family;
      var x = w / 2 - tw / 2;
      for (var k2 = 0; k2 < text.length; k2++) {
        var cw = g.measureText(text[k2]).width;
        g.fillText(text[k2], x + cw / 2, top + i * lineH);
        x += cw + tracking;
      }
    }

    return c;
  }

  /* Reservoir-sample glyph interiors into a point cloud, in the
     -1..1 / aspect-corrected space the droplets live in. */
  function samplePixels(canvas, count, seed, aspect) {
    var g = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var d = g.getImageData(0, 0, w, h).data;
    var rnd = M.rng(seed || 3);
    var out = new Float32Array(count * 3);

    /* collect candidate indices first so the sample is uniform
       across the glyphs rather than biased by scan order */
    var hits = [];
    for (var i = 0; i < w * h; i++) if (d[i * 4 + 3] > 140) hits.push(i);
    if (!hits.length) return { pos: out, count: count, found: 0 };

    for (var n = 0; n < count; n++) {
      var idx = hits[(rnd() * hits.length) | 0];
      var px = idx % w, py = (idx / w) | 0;
      /* jitter within the pixel so the cloud is not a lattice */
      var u = ((px + rnd()) / w) * 2 - 1;
      var v = 1 - ((py + rnd()) / h) * 2;
      out[n * 3] = u * (aspect || 1);
      out[n * 3 + 1] = v;
      out[n * 3 + 2] = (rnd() - .5) * 0.06;
    }
    return { pos: out, count: count, found: hits.length };
  }

  NOC.Tex = {
    surface: surface,
    latteArt: latteArt,
    typography: typography,
    samplePixels: samplePixels
  };

})(window);
