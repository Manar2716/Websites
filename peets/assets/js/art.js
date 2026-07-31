/* ═══════════════════════════════════════════════════════════
   art.js — every product on the page, drawn at runtime.

   There is not one image file in this project, and the menu is
   the reason that constraint is worth keeping: thirty-four
   products drawn from about ten parametric forms stay sharp on a
   4K panel, weigh nothing, and can all be re-lit by changing one
   number. A photograph of a latte and a photograph of a flat
   white are two different photographs; here they are the same
   vessel with a different foam depth, which is also the truth.

   Everything is drawn in a 1000×1000 space and scaled to the
   canvas, so a card can ask for any size it likes.

   The light is the same light as the film: a warm key from the
   upper left, a cooler window bounce down the right edge, and a
   contact shadow that is wider and softer than the object that
   casts it. Nothing here is symmetric — a cup lit from the left
   that is bright on both sides reads as a sticker.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  var U = 1000;                       /* the drawing square */
  var TAU = Math.PI * 2;

  /* ── palette ──────────────────────────────────────────────── */
  var C = {
    espresso: '#2b1206',
    coffee:   '#4a2410',
    crema:    '#c2814a',
    cremaLit: '#e0a468',
    milk:     '#f6ecdc',
    foam:     '#fbf4e8',
    caramel:  '#b9743a',
    choc:     '#3a2114',
    matcha:   '#7f9c53',
    matchaLit:'#a8c078',
    chai:     '#b98552',
    tea:      '#9a5a22',
    green:    '#a8b96a',
    herbal:   '#d9b45c',
    mint:     '#8fae72',
    ceramic:  '#efe6d7',
    ceramicSh:'#a89684',
    glaze:    '#1a1512',
    pastry:   '#d9a45f',
    pastryLit:'#f0c88a',
    pastryDk: '#a86a2c',
    crust:    '#8a4f22',
    sugar:    '#fff6e8',
    berry:    '#4a3a6b',
    wood:     '#5a3a22',
    kraft:    '#d8c4a6',
    shadow:   'rgba(24,12,6,.40)'
  };

  /* ── small helpers ────────────────────────────────────────── */

  function grad(g, x0, y0, x1, y1, stops) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    return gr;
  }

  function rgrad(g, x, y, r0, r1, stops) {
    var gr = g.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
    return gr;
  }

  /* mulberry — the same tiny PRNG the rest of the project uses, so
     a blueberry muffin has the same blueberries on every reload */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ellipse(g, x, y, rx, ry) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
  }

  function roundRect(g, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  /* The contact shadow is the only thing anchoring a floating
     object to a surface. It is wider than the object, darkest
     directly under it, and it is drawn before anything else. */
  function contact(g, x, y, rx, ry, strength) {
    g.save();
    g.fillStyle = rgrad(g, x, y, 0, rx, [
      [0, 'rgba(26,12,5,' + (0.52 * (strength || 1)).toFixed(3) + ')'],
      [0.45, 'rgba(26,12,5,' + (0.26 * (strength || 1)).toFixed(3) + ')'],
      [1, 'rgba(26,12,5,0)']
    ]);
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.translate(-x, -y);
    ellipse(g, x, y, rx, rx);
    g.fill();
    g.restore();
  }

  /* ── steam ────────────────────────────────────────────────────
     Blobs along a wandering path, not strokes along it. A stroked
     bezier — even a tapered, gradient-filled one — has two hard
     edges running its whole length, and three of them over a cup
     do not read as vapour, they read as pipework. A radial
     gradient has no edge at all, so a plume built out of eighty
     of them at two per cent alpha is soft by construction and
     needs no blur filter to rescue it.

     Drawn once, into the card's canvas. The card animates the
     whole layer instead — a redrawn plume on thirty-four cards is
     thirty-four canvases repainting every frame for something a
     CSS transform gives away for nothing. */
  function steam(g, x, y, w, h, amt) {
    if (!amt) return;
    var r = rng(7);
    g.save();
    g.globalCompositeOperation = 'lighter';

    for (var i = 0; i < 3; i++) {
      /* each wisp gets its own lean and its own wander, so they
         separate as they rise instead of tracking each other */
      var ox = x + (i - 1) * w * 0.22 + (r() - 0.5) * w * 0.1;
      var lean = (r() - 0.5) * 1.7;
      var swing = 0.7 + r() * 0.9;
      var top = h * (0.72 + r() * 0.42);
      var puffs = 26;

      for (var k = 0; k < puffs; k++) {
        var t = k / (puffs - 1);
        /* the plume widens and fades as it rises and cools */
        var px = ox + Math.sin(t * Math.PI * swing * 2.1 + i * 2.0) * w * 0.16 * t
          + lean * w * 0.20 * t * t;
        var py = y - top * t;
        var rad = w * (0.055 + t * 0.16) * (0.72 + r() * 0.5);
        var a = amt * 0.055 * (1 - t * 0.15) * Math.sin(Math.min(t * 3.4, 1) * Math.PI * 0.5);

        var gr = g.createRadialGradient(px, py, 0, px, py, rad);
        gr.addColorStop(0, 'rgba(255,247,234,' + a.toFixed(4) + ')');
        gr.addColorStop(0.45, 'rgba(246,232,212,' + (a * 0.42).toFixed(4) + ')');
        gr.addColorStop(1, 'rgba(238,222,198,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(px, py, rad * (0.9 + r() * 0.4), rad * (0.8 + r() * 0.4), 0, 0, TAU);
        g.fill();
      }
    }
    g.restore();
  }

  /* ── the liquid surface ───────────────────────────────────────
     A drink is read almost entirely off this ellipse: the colour,
     the crema ring at the wall, and whatever is drawn on top. The
     ring matters more than the fill — it is the thin lighter band
     against the ceramic that says "full to the rim". */
  function surface(g, cx, cy, rx, ry, o) {
    var body = o.liquid || C.coffee;
    var top = o.liquidLit || body;

    ellipse(g, cx, cy, rx, ry);
    g.fillStyle = rgrad(g, cx - rx * 0.28, cy - ry * 0.34, ry * 0.1, rx * 1.25, [
      [0, top], [0.55, body], [1, o.liquidEdge || body]
    ]);
    g.fill();

    /* crema: a ring, not a wash */
    if (o.crema) {
      g.save();
      ellipse(g, cx, cy, rx, ry); g.clip();
      ellipse(g, cx, cy, rx, ry);
      g.strokeStyle = 'rgba(230,180,120,' + (0.55 * o.crema).toFixed(2) + ')';
      g.lineWidth = rx * 0.16;
      g.stroke();
      /* tiger-striping, pulled toward one side by the pour */
      var r = rng(o.seed || 3);
      for (var i = 0; i < 5; i++) {
        var a = r() * TAU;
        var d = rx * (0.15 + r() * 0.5);
        ellipse(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * (ry / rx), rx * (0.10 + r() * 0.16), ry * (0.10 + r() * 0.16));
        g.fillStyle = 'rgba(226,172,108,' + (0.22 * o.crema).toFixed(2) + ')';
        g.fill();
      }
      g.restore();
    }

    if (o.foam) drawFoam(g, cx, cy, rx, ry, o);
    if (o.art === 'rosetta') rosetta(g, cx, cy, rx, ry, o);
    else if (o.art === 'heart') heart(g, cx, cy, rx, ry, o);
    else if (o.art === 'dot') {
      ellipse(g, cx, cy, rx * 0.34, ry * 0.34);
      g.fillStyle = o.artColor || C.foam;
      g.fill();
    }

    if (o.dust) dusting(g, cx, cy, rx, ry, o);

    /* the inside wall opposite the key, which is what gives the
       surface a cup around it rather than a hole */
    g.save();
    ellipse(g, cx, cy, rx, ry); g.clip();
    ellipse(g, cx, cy - ry * 0.06, rx * 1.02, ry * 1.02);
    g.strokeStyle = 'rgba(20,10,4,.34)';
    g.lineWidth = rx * 0.10;
    g.stroke();
    g.restore();
  }

  function drawFoam(g, cx, cy, rx, ry, o) {
    var f = o.foam;
    g.save();
    ellipse(g, cx, cy, rx, ry); g.clip();
    ellipse(g, cx, cy + ry * 0.04, rx * (0.78 + f * 0.2), ry * (0.78 + f * 0.2));
    g.fillStyle = rgrad(g, cx - rx * 0.3, cy - ry * 0.4, 0, rx, [
      [0, 'rgba(255,250,240,' + (0.95 * f).toFixed(2) + ')'],
      [0.7, 'rgba(246,236,220,' + (0.85 * f).toFixed(2) + ')'],
      [1, 'rgba(226,206,180,' + (0.55 * f).toFixed(2) + ')']
    ]);
    g.fill();
    /* microfoam is not flat — a few soft cells catch the key */
    var r = rng(11);
    for (var i = 0; i < 7; i++) {
      var a = r() * TAU, d = rx * r() * 0.62;
      ellipse(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * (ry / rx), rx * 0.07 * (0.5 + r()), ry * 0.07 * (0.5 + r()));
      g.fillStyle = 'rgba(255,255,250,' + (0.30 * f * r()).toFixed(3) + ')';
      g.fill();
    }
    g.restore();
  }

  /* Latte art is a *drawn* thing: it has stroke order, each leaf
     is punched into what is already there, and what makes it
     legible is the thin line of crema left between one leaf and
     the next — not the milk. */
  function rosetta(g, cx, cy, rx, ry, o) {
    var col = o.artColor || C.foam;
    g.save();
    ellipse(g, cx, cy, rx * 0.96, ry * 0.96); g.clip();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.rotate(o.artRot || -0.22);

    var n = 6, span = rx * 0.80;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      var y = -span * 0.62 + span * 1.18 * t;
      var w = span * (0.72 - t * 0.44);
      /* halo first: the crema line between leaves */
      leaf(g, 0, y, w, span * 0.30, 'rgba(58,28,12,.55)', 1.18);
      leaf(g, 0, y, w, span * 0.30, col, 1.0);
    }
    /* the stem, pulled through at the end */
    g.beginPath();
    g.moveTo(0, -span * 0.78);
    g.quadraticCurveTo(span * 0.04, 0, 0, span * 0.72);
    g.strokeStyle = col;
    g.lineWidth = span * 0.07;
    g.lineCap = 'round';
    g.stroke();
    g.restore();
  }

  function leaf(g, x, y, w, h, fill, scale) {
    g.beginPath();
    g.moveTo(x - w * scale, y);
    g.quadraticCurveTo(x, y - h * scale, x + w * scale, y);
    g.quadraticCurveTo(x, y + h * scale * 0.72, x - w * scale, y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  function heart(g, cx, cy, rx, ry, o) {
    var col = o.artColor || C.foam;
    g.save();
    ellipse(g, cx, cy, rx * 0.96, ry * 0.96); g.clip();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    var s = rx * 0.62;
    g.beginPath();
    g.moveTo(0, s * 0.86);
    g.bezierCurveTo(-s * 1.5, -s * 0.2, -s * 0.62, -s * 1.15, 0, -s * 0.42);
    g.bezierCurveTo(s * 0.62, -s * 1.15, s * 1.5, -s * 0.2, 0, s * 0.86);
    g.fillStyle = 'rgba(58,28,12,.5)';
    g.save(); g.scale(1.1, 1.1); g.fill(); g.restore();
    g.fillStyle = col;
    g.fill();
    g.restore();
  }

  function dusting(g, cx, cy, rx, ry, o) {
    var r = rng(o.seed || 5);
    g.save();
    ellipse(g, cx, cy, rx * 0.97, ry * 0.97); g.clip();
    for (var i = 0; i < 90; i++) {
      var a = r() * TAU, d = Math.sqrt(r()) * rx * 0.9;
      ellipse(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * (ry / rx), rx * 0.012 * (0.5 + r()), rx * 0.012 * (0.5 + r()));
      g.fillStyle = o.dust;
      g.globalAlpha = 0.3 + r() * 0.5;
      g.fill();
    }
    g.restore();
  }

  /* ── ceramic vessels ──────────────────────────────────────────
     One profile function covers the demitasse, the mug, the
     cappuccino bowl and the teacup: the difference between them
     is the ratio of rim to base and how far down the belly sits.
     Saucer, handle and wall thickness follow from that. */

  function cup(g, o) {
    var cx = U / 2;
    var topR = o.topR, botR = o.botR;
    var top = o.top, bot = o.bot;
    var h = bot - top;

    contact(g, cx + h * 0.05, bot + (o.saucer ? h * 0.20 : h * 0.04), topR * (o.saucer ? 1.85 : 1.30), topR * 0.30, o.shadow || 1);

    if (o.saucer) {
      var sr = topR * 1.62, sy = bot + h * 0.06;
      ellipse(g, cx, sy + h * 0.045, sr, sr * 0.24);
      g.fillStyle = C.ceramicSh; g.fill();
      ellipse(g, cx, sy, sr, sr * 0.24);
      g.fillStyle = grad(g, cx - sr, sy, cx + sr, sy, [
        [0, '#cbbca8'], [0.32, C.ceramic], [0.62, '#e4d8c6'], [1, '#b7a795']
      ]);
      g.fill();
      ellipse(g, cx, sy, sr * 0.66, sr * 0.16);
      g.strokeStyle = 'rgba(120,100,80,.30)'; g.lineWidth = U * 0.004; g.stroke();
    }

    /* handle behind the body, so the join disappears into the wall */
    if (o.handle) {
      g.save();
      var hy = top + h * (o.handleY || 0.44);
      var hr = h * (o.handleR || 0.30);
      g.beginPath();
      g.arc(cx + topR * 0.82, hy, hr, -Math.PI * 0.62, Math.PI * 0.62);
      g.lineWidth = h * 0.115;
      g.lineCap = 'round';
      g.strokeStyle = grad(g, cx + topR * 0.6, hy - hr, cx + topR * 0.6 + hr * 2, hy + hr, [
        [0, '#f2e8d9'], [0.5, '#d3c3ad'], [1, '#9d8b78']
      ]);
      g.stroke();
      g.restore();
    }

    /* body */
    g.beginPath();
    g.moveTo(cx - topR, top);
    g.bezierCurveTo(cx - topR * 1.02, top + h * 0.52, cx - botR * 1.12, bot - h * 0.22, cx - botR, bot);
    g.quadraticCurveTo(cx, bot + h * 0.11, cx + botR, bot);
    g.bezierCurveTo(cx + botR * 1.12, bot - h * 0.22, cx + topR * 1.02, top + h * 0.52, cx + topR, top);
    g.closePath();
    g.fillStyle = grad(g, cx - topR, top, cx + topR, bot, o.glaze ? [
      [0, '#241d18'], [0.22, '#4a3d33'], [0.42, '#2a221c'], [0.78, '#15100c'], [1, '#3a2a1e']
    ] : [
      [0, '#b3a290'], [0.20, C.ceramic], [0.46, '#fdf7ec'], [0.74, '#cfc0ab'], [1, '#8f7f6d']
    ]);
    g.fill();

    /* the window bounce down the shaded edge — one cool line on a
       warm object, which is what stops it reading as a cutout */
    g.save();
    g.beginPath();
    g.moveTo(cx + topR * 0.92, top + h * 0.06);
    g.bezierCurveTo(cx + topR * 0.95, top + h * 0.5, cx + botR * 1.0, bot - h * 0.24, cx + botR * 0.86, bot - h * 0.02);
    g.strokeStyle = o.glaze ? 'rgba(200,180,160,.42)' : 'rgba(255,250,240,.55)';
    g.lineWidth = U * 0.010;
    g.lineCap = 'round';
    g.stroke();
    g.restore();

    /* rim ring, then what is in it */
    var wall = topR * (o.wall || 0.085);
    ellipse(g, cx, top, topR, topR * 0.28);
    g.fillStyle = o.glaze ? '#54453a' : '#f7f0e4';
    g.fill();
    surface(g, cx, top + topR * 0.012, topR - wall, (topR - wall) * 0.28, o);

    if (o.steam) steam(g, cx, top - topR * 0.34, topR * 1.5, h * (o.steamH || 1.5), o.steam);
  }

  /* ── glassware ────────────────────────────────────────────────
     Glass is the inverse problem: the object is what is *behind*
     it, so the fill is nearly nothing and the read is all edges —
     two bright verticals, a bright meniscus, and a dark base
     where the wall doubles back on itself. */

  function glass(g, o) {
    var cx = U / 2;
    var topR = o.topR, botR = o.botR;
    var top = o.top, bot = o.bot, h = bot - top;

    contact(g, cx + h * 0.03, bot + h * 0.03, topR * 1.45, topR * 0.26, 0.9);

    function bodyPath() {
      g.beginPath();
      g.moveTo(cx - topR, top);
      g.bezierCurveTo(cx - topR, top + h * 0.5, cx - botR * 1.04, bot - h * 0.16, cx - botR, bot);
      g.quadraticCurveTo(cx, bot + h * 0.05, cx + botR, bot);
      g.bezierCurveTo(cx + botR * 1.04, bot - h * 0.16, cx + topR, top + h * 0.5, cx + topR, top);
      g.closePath();
    }

    /* the glass itself */
    bodyPath();
    g.fillStyle = grad(g, cx - topR, top, cx + topR, top, [
      [0, 'rgba(240,236,228,.30)'], [0.14, 'rgba(255,252,246,.12)'],
      [0.5, 'rgba(210,200,188,.06)'], [0.86, 'rgba(255,252,246,.14)'],
      [1, 'rgba(230,224,214,.32)']
    ]);
    g.fill();

    /* the drink, clipped inside */
    g.save();
    bodyPath(); g.clip();
    var ly = top + h * (o.fill === undefined ? 0.16 : o.fill);
    g.fillStyle = o.layers
      ? grad(g, cx, ly, cx, bot, o.layers)
      : grad(g, cx - topR, ly, cx + topR, bot, [[0, o.liquidEdge || o.liquid], [0.4, o.liquid], [1, o.liquidEdge || o.liquid]]);
    g.fillRect(cx - topR * 1.2, ly, topR * 2.4, bot - ly + h * 0.1);

    if (o.ice) ice(g, cx, top + h * 0.10, topR * 0.92, bot - h * 0.06, o.seed || 4);

    /* condensation: only on the lit half, or it is just noise */
    if (o.cold) {
      var r = rng((o.seed || 4) + 31);
      for (var i = 0; i < 46; i++) {
        var x = cx - topR + r() * topR * 2;
        var y = top + h * 0.08 + r() * h * 0.86;
        var rad = topR * 0.020 * (0.4 + r() * 1.3);
        ellipse(g, x, y, rad, rad * 1.25);
        g.fillStyle = 'rgba(255,252,246,' + (0.10 + r() * 0.30).toFixed(2) + ')';
        g.fill();
      }
    }
    g.restore();

    /* meniscus */
    ellipse(g, cx, ly, topR * 0.97, topR * 0.26);
    g.fillStyle = o.foamTop || 'rgba(255,250,240,.22)';
    g.fill();
    ellipse(g, cx, ly, topR * 0.97, topR * 0.26);
    g.strokeStyle = 'rgba(255,250,240,.40)';
    g.lineWidth = U * 0.006;
    g.stroke();

    /* edges last, over everything */
    g.save();
    bodyPath();
    g.strokeStyle = 'rgba(255,250,242,.42)';
    g.lineWidth = U * 0.009;
    g.stroke();
    g.restore();

    ellipse(g, cx, bot, botR * 0.94, botR * 0.24);
    g.fillStyle = 'rgba(28,18,10,.42)';
    g.fill();

    if (o.straw) {
      g.save();
      g.translate(cx + topR * 0.34, top + h * 0.1);
      g.rotate(0.24);
      roundRect(g, -topR * 0.09, -h * 0.30, topR * 0.18, h * 1.05, topR * 0.09);
      g.fillStyle = grad(g, -topR * 0.09, 0, topR * 0.09, 0, [
        [0, '#7a4526'], [0.4, '#b8763f'], [1, '#5e3319']
      ]);
      g.fill();
      g.restore();
    }
  }

  function ice(g, cx, top, r, bot, seed) {
    var rnd = rng(seed);
    for (var i = 0; i < 6; i++) {
      var x = cx + (rnd() - 0.5) * r * 1.5;
      var y = top + rnd() * (bot - top) * 0.9;
      var s = r * (0.34 + rnd() * 0.22);
      g.save();
      g.translate(x, y);
      g.rotate((rnd() - 0.5) * 1.1);
      roundRect(g, -s / 2, -s / 2, s, s * 0.86, s * 0.16);
      g.fillStyle = 'rgba(246,250,255,.24)';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.34)';
      g.lineWidth = U * 0.005;
      g.stroke();
      g.beginPath();
      g.moveTo(-s * 0.30, -s * 0.24); g.lineTo(s * 0.10, -s * 0.30);
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = U * 0.007;
      g.stroke();
      g.restore();
    }
  }

  /* ── bakery ───────────────────────────────────────────────────
     A croissant is not a crescent outline — it is a stack of
     lobes along an arc, each one lit on its own, which is what
     makes the laminated layers read at any size. */

  function croissant(g, o) {
    var cx = U / 2, cy = U * 0.56;
    var R = U * 0.30;
    contact(g, cx, cy + R * 0.62, R * 1.35, R * 0.30, 0.95);

    var n = 9, spanA = Math.PI * 1.02, a0 = Math.PI * 0.99;
    var i, a, x, y, w, hgt;
    for (i = 0; i < n; i++) {
      var t = i / (n - 1);
      a = a0 + spanA * t;
      x = cx + Math.cos(a) * R * 0.92;
      y = cy + Math.sin(a) * R * 0.52;
      /* the middle lobes are the fattest; the tips taper to points */
      var bulk = Math.sin(t * Math.PI);
      w = R * (0.16 + bulk * 0.30);
      hgt = R * (0.16 + bulk * 0.34);
      g.save();
      g.translate(x, y);
      g.rotate(Math.sin(a) * 0.5);
      ellipse(g, 0, 0, w, hgt);
      g.fillStyle = grad(g, -w, -hgt, w * 0.7, hgt, [
        [0, C.pastryLit], [0.36, C.pastry], [0.72, C.pastryDk], [1, C.crust]
      ]);
      g.fill();
      /* the score line between one layer and the next */
      g.beginPath();
      g.ellipse(0, 0, w * 0.98, hgt * 0.98, 0, -Math.PI * 0.75, -Math.PI * 0.05);
      g.strokeStyle = 'rgba(112,58,20,.42)';
      g.lineWidth = U * 0.007;
      g.stroke();
      /* egg wash */
      ellipse(g, -w * 0.24, -hgt * 0.34, w * 0.34, hgt * 0.22);
      g.fillStyle = 'rgba(255,226,178,.42)';
      g.fill();
      g.restore();
    }

    if (o.almond) {
      var r = rng(9);
      for (i = 0; i < 26; i++) {
        var t2 = r();
        a = a0 + spanA * t2;
        x = cx + Math.cos(a) * R * (0.72 + r() * 0.34);
        y = cy + Math.sin(a) * R * (0.34 + r() * 0.30) - R * 0.12;
        g.save();
        g.translate(x, y);
        g.rotate(r() * TAU);
        ellipse(g, 0, 0, R * 0.075, R * 0.035);
        g.fillStyle = r() > 0.4 ? '#e8cfa4' : '#c9a877';
        g.fill();
        g.restore();
      }
      powder(g, cx, cy, R * 1.25, 11);
    }
    if (o.dark) {
      /* a chocolate croissant is a block, not a crescent — this is
         the one place the form changes rather than the garnish */
    }
  }

  function chocBatard(g) {
    var cx = U / 2, cy = U * 0.54;
    var w = U * 0.50, h = U * 0.26;
    contact(g, cx, cy + h * 0.78, w * 0.72, h * 0.34, 0.95);

    /* body: a laminated block, slightly proud in the middle */
    g.save();
    g.translate(cx, cy);
    g.beginPath();
    g.moveTo(-w / 2, -h * 0.18);
    g.quadraticCurveTo(0, -h * 0.72, w / 2, -h * 0.18);
    g.quadraticCurveTo(w / 2 + h * 0.10, h * 0.34, w / 2 - h * 0.06, h * 0.5);
    g.lineTo(-w / 2 + h * 0.06, h * 0.5);
    g.quadraticCurveTo(-w / 2 - h * 0.10, h * 0.34, -w / 2, -h * 0.18);
    g.closePath();
    g.fillStyle = grad(g, -w / 2, -h, w * 0.3, h, [
      [0, C.pastryLit], [0.34, C.pastry], [0.76, C.pastryDk], [1, C.crust]
    ]);
    g.fill();

    /* The folds, running across the loaf. These do the work the
       shape cannot: a rounded rectangle with two dark rectangles
       at its ends reads as a bench with holes in it, which is
       what the first version of this was. Ridges with a lit top
       and a shaded underside are what say "laminated dough". */
    for (var i = 1; i < 5; i++) {
      var x = -w / 2 + (w * i) / 5;
      var dip = Math.abs(i - 2.5) * h * 0.09;
      g.beginPath();
      g.moveTo(x, -h * 0.50 + dip);
      g.quadraticCurveTo(x + h * 0.06, 0, x - h * 0.02, h * 0.46);
      g.strokeStyle = 'rgba(110,56,18,.46)';
      g.lineWidth = U * 0.009;
      g.stroke();
      /* the lit shoulder just left of each seam */
      g.beginPath();
      g.moveTo(x - h * 0.07, -h * 0.48 + dip);
      g.quadraticCurveTo(x - h * 0.01, 0, x - h * 0.09, h * 0.44);
      g.strokeStyle = 'rgba(255,222,166,.26)';
      g.lineWidth = U * 0.010;
      g.stroke();
    }

    /* One seam of chocolate that has come up through the fold in
       the oven, at the centre where the dough actually opens —
       not two blocks sitting in the cut ends. */
    g.beginPath();
    g.moveTo(-w * 0.10, -h * 0.44);
    g.quadraticCurveTo(0, -h * 0.30, w * 0.09, -h * 0.42);
    g.quadraticCurveTo(w * 0.02, -h * 0.16, -w * 0.10, -h * 0.44);
    g.closePath();
    g.fillStyle = grad(g, -w * 0.1, -h * 0.44, w * 0.1, -h * 0.16, [
      [0, '#54301c'], [0.5, C.choc], [1, '#1d0f07']
    ]);
    g.fill();

    ellipse(g, -w * 0.22, -h * 0.38, w * 0.18, h * 0.13);
    g.fillStyle = 'rgba(255,226,178,.34)';
    g.fill();
    g.restore();
  }

  function muffin(g, o) {
    var cx = U / 2, cy = U * 0.60;
    var R = U * 0.24;
    contact(g, cx, cy + R * 1.02, R * 1.42, R * 0.30, 1);

    /* the paper case: a fluted trapezoid */
    g.beginPath();
    g.moveTo(cx - R * 0.94, cy - R * 0.02);
    g.lineTo(cx - R * 0.66, cy + R * 0.92);
    g.quadraticCurveTo(cx, cy + R * 1.06, cx + R * 0.66, cy + R * 0.92);
    g.lineTo(cx + R * 0.94, cy - R * 0.02);
    g.closePath();
    g.fillStyle = grad(g, cx - R, cy, cx + R, cy, [
      [0, '#7a5a3c'], [0.26, '#a98460'], [0.52, '#c19a72'], [1, '#6d4f34']
    ]);
    g.fill();
    for (var f = -3; f <= 3; f++) {
      g.beginPath();
      g.moveTo(cx + f * R * 0.26, cy);
      g.lineTo(cx + f * R * 0.19, cy + R * 0.96);
      g.strokeStyle = 'rgba(48,30,16,.26)';
      g.lineWidth = U * 0.006;
      g.stroke();
    }

    /* the crown, which overhangs the case on both sides */
    g.beginPath();
    g.moveTo(cx - R * 1.16, cy + R * 0.06);
    g.bezierCurveTo(cx - R * 1.22, cy - R * 0.86, cx - R * 0.40, cy - R * 1.16, cx - R * 0.06, cy - R * 0.98);
    g.bezierCurveTo(cx + R * 0.44, cy - R * 1.22, cx + R * 1.24, cy - R * 0.78, cx + R * 1.16, cy + R * 0.06);
    g.quadraticCurveTo(cx, cy + R * 0.30, cx - R * 1.16, cy + R * 0.06);
    g.closePath();
    g.fillStyle = grad(g, cx - R, cy - R, cx + R * 0.6, cy + R * 0.4, o.cocoa ? [
      [0, '#6b4326'], [0.34, '#4e2c17'], [0.78, '#33190c'], [1, '#221107']
    ] : [
      [0, '#e8bd7f'], [0.32, '#cf9b58'], [0.74, '#a8703a'], [1, '#7d4d24']
    ]);
    g.fill();

    /* the crack across a risen crown */
    g.beginPath();
    g.moveTo(cx - R * 0.72, cy - R * 0.52);
    g.bezierCurveTo(cx - R * 0.2, cy - R * 0.78, cx + R * 0.24, cy - R * 0.34, cx + R * 0.78, cy - R * 0.60);
    g.strokeStyle = 'rgba(60,32,12,.34)';
    g.lineWidth = U * 0.010;
    g.stroke();

    var r = rng(o.seed || 6);
    for (var i = 0; i < (o.bits || 0); i++) {
      var a = r() * Math.PI - Math.PI * 0.9;
      var d = R * (0.2 + r() * 0.78);
      var x = cx + Math.cos(a) * d, y = cy - R * 0.36 + Math.sin(a) * d * 0.52;
      if (o.berry) {
        ellipse(g, x, y, R * 0.085, R * 0.075);
        g.fillStyle = ['#3f2f5e', '#4c3a72', '#2e2247'][Math.floor(r() * 3)];
        g.fill();
        ellipse(g, x - R * 0.026, y - R * 0.026, R * 0.026, R * 0.020);
        g.fillStyle = 'rgba(200,190,230,.5)';
        g.fill();
      } else {
        g.save();
        g.translate(x, y); g.rotate(r() * TAU);
        roundRect(g, -R * 0.06, -R * 0.05, R * 0.12, R * 0.10, R * 0.03);
        g.fillStyle = ['#2a1608', '#3b2010', '#1d0f06'][Math.floor(r() * 3)];
        g.fill();
        g.restore();
      }
    }
  }

  function loaf(g) {
    var cx = U / 2, cy = U * 0.56;
    var w = U * 0.40, h = U * 0.32;
    contact(g, cx, cy + h * 0.62, w * 0.80, h * 0.28, 1);

    /* a cut slice: crumb face toward the light, crust around it */
    g.save();
    g.translate(cx, cy);
    g.beginPath();
    g.moveTo(-w / 2, h * 0.42);
    g.lineTo(-w / 2, -h * 0.10);
    g.quadraticCurveTo(-w * 0.28, -h * 0.66, 0, -h * 0.52);
    g.quadraticCurveTo(w * 0.30, -h * 0.68, w / 2, -h * 0.08);
    g.lineTo(w / 2, h * 0.42);
    g.closePath();
    g.fillStyle = grad(g, -w / 2, -h / 2, w * 0.4, h * 0.5, [
      [0, '#e0b47c'], [0.4, '#c9915a'], [1, '#a26c38']
    ]);
    g.fill();

    /* crust: darker, and only on the top and the two cut edges */
    g.beginPath();
    g.moveTo(-w / 2, -h * 0.10);
    g.quadraticCurveTo(-w * 0.28, -h * 0.66, 0, -h * 0.52);
    g.quadraticCurveTo(w * 0.30, -h * 0.68, w / 2, -h * 0.08);
    g.strokeStyle = '#7c4a20';
    g.lineWidth = U * 0.026;
    g.lineJoin = 'round';
    g.stroke();

    /* crumb, and the walnut pieces in it */
    var r = rng(13);
    for (var i = 0; i < 60; i++) {
      var x = (r() - 0.5) * w * 0.9, y = (r() - 0.4) * h * 0.8;
      ellipse(g, x, y, w * 0.012 * (0.5 + r()), w * 0.010 * (0.5 + r()));
      g.fillStyle = 'rgba(120,74,32,' + (0.14 + r() * 0.22).toFixed(2) + ')';
      g.fill();
    }
    for (var k = 0; k < 7; k++) {
      var bx = (r() - 0.5) * w * 0.72, by = (r() - 0.3) * h * 0.6;
      g.save(); g.translate(bx, by); g.rotate(r() * TAU);
      ellipse(g, 0, 0, w * 0.035, w * 0.026);
      g.fillStyle = '#6d4423'; g.fill();
      g.restore();
    }
    g.restore();
  }

  function cinnamonRoll(g) {
    var cx = U / 2, cy = U * 0.54;
    var R = U * 0.27;
    contact(g, cx, cy + R * 0.92, R * 1.30, R * 0.30, 1);

    /* seen from above and slightly in front: an ellipse, spiralled */
    ellipse(g, cx, cy, R, R * 0.80);
    g.fillStyle = grad(g, cx - R, cy - R, cx + R * 0.6, cy + R, [
      [0, '#e3b078'], [0.38, '#c68c50'], [0.8, '#9c6229'], [1, '#7b4a1d']
    ]);
    g.fill();

    /* the spiral: cinnamon in the seam, dough either side */
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.80);
    for (var pass = 0; pass < 2; pass++) {
      g.beginPath();
      for (var a = 0; a < TAU * 2.6; a += 0.08) {
        var rr = R * (0.14 + (a / (TAU * 2.6)) * 0.82);
        var x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = pass === 0 ? 'rgba(88,44,14,.85)' : 'rgba(226,178,124,.55)';
      g.lineWidth = pass === 0 ? U * 0.020 : U * 0.010;
      g.lineCap = 'round';
      g.stroke();
      g.translate(U * 0.006, -U * 0.008);
    }
    g.restore();

    /* Icing, drizzled. The first version of this was one large
       bezier across the middle and it read as a leaf lying on the
       bun — a single smooth outline is never icing. This is a
       run of overlapping blobs following the top of the roll,
       which gives a lumpy edge for free, plus three drips heading
       for the plate. */
    g.save();
    ellipse(g, cx, cy, R * 0.99, R * 0.79); g.clip();
    var ic = rng(29);
    var band = grad(g, cx, cy - R, cx, cy + R * 0.6, [
      [0, '#fffcf6'], [0.55, '#f7ecd9'], [1, '#dcc7a4']
    ]);
    g.fillStyle = band;
    for (var b = 0; b < 16; b++) {
      var bt = b / 15;
      var bx = cx + (bt - 0.5) * R * 1.72;
      var by = cy - R * 0.30 + Math.sin(bt * Math.PI * 1.6 + 0.6) * R * 0.20 + (ic() - 0.5) * R * 0.06;
      ellipse(g, bx, by, R * (0.13 + ic() * 0.09), R * (0.085 + ic() * 0.06));
      g.fill();
    }
    for (var dr = 0; dr < 3; dr++) {
      var dx2 = cx + (dr - 1) * R * 0.52 + (ic() - 0.5) * R * 0.2;
      var dl = R * (0.24 + ic() * 0.26);
      g.beginPath();
      g.moveTo(dx2 - R * 0.055, cy - R * 0.22);
      g.quadraticCurveTo(dx2, cy - R * 0.22 + dl * 1.1, dx2 + R * 0.055, cy - R * 0.22);
      g.closePath();
      g.fill();
      ellipse(g, dx2, cy - R * 0.22 + dl, R * 0.055, R * 0.05);
      g.fill();
    }
    /* the sheen along the top of the pour */
    g.globalAlpha = 0.55;
    g.fillStyle = '#fffef9';
    for (var s2 = 0; s2 < 10; s2++) {
      var st = s2 / 9;
      ellipse(g, cx + (st - 0.5) * R * 1.5,
        cy - R * 0.40 + Math.sin(st * Math.PI * 1.6 + 0.6) * R * 0.18,
        R * 0.07, R * 0.025);
      g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  function cookie(g) {
    var cx = U / 2, cy = U * 0.52;
    var R = U * 0.27;
    contact(g, cx, cy + R * 0.86, R * 1.24, R * 0.24, 0.95);

    /* the edge is irregular — a perfect circle reads as a button */
    var r = rng(17);
    g.beginPath();
    for (var a = 0; a <= TAU + 0.01; a += 0.16) {
      var rr = R * (0.96 + Math.sin(a * 3.1 + 1.2) * 0.030 + Math.sin(a * 5.7) * 0.020);
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.90;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = grad(g, cx - R, cy - R, cx + R * 0.5, cy + R, [
      [0, '#c9995f'], [0.34, '#ab7439'], [0.76, '#7f4d20'], [1, '#5e3714']
    ]);
    g.fill();

    /* crackle */
    for (var i = 0; i < 9; i++) {
      var a0 = r() * TAU, d0 = r() * R * 0.7;
      g.beginPath();
      g.moveTo(cx + Math.cos(a0) * d0, cy + Math.sin(a0) * d0 * 0.9);
      g.lineTo(cx + Math.cos(a0 + 0.6) * (d0 + R * 0.24), cy + Math.sin(a0 + 0.6) * (d0 + R * 0.24) * 0.9);
      g.strokeStyle = 'rgba(70,38,12,.30)';
      g.lineWidth = U * 0.006;
      g.stroke();
    }

    /* chunks, not chips — proud of the surface, with their own shadow */
    for (var c = 0; c < 11; c++) {
      var a2 = r() * TAU, d2 = Math.sqrt(r()) * R * 0.78;
      var x2 = cx + Math.cos(a2) * d2, y2 = cy + Math.sin(a2) * d2 * 0.9;
      var s = R * (0.11 + r() * 0.07);
      g.save();
      g.translate(x2, y2); g.rotate(r() * TAU);
      roundRect(g, -s / 2, -s / 2 + s * 0.10, s, s * 0.8, s * 0.18);
      g.fillStyle = 'rgba(30,14,4,.5)'; g.fill();
      roundRect(g, -s / 2, -s / 2, s, s * 0.8, s * 0.18);
      g.fillStyle = grad(g, -s / 2, -s / 2, s / 2, s / 2, [[0, '#4a2a17'], [0.5, '#2e1809'], [1, '#180b04']]);
      g.fill();
      g.restore();
    }
  }

  function powder(g, cx, cy, R, seed) {
    var r = rng(seed);
    for (var i = 0; i < 120; i++) {
      var a = r() * TAU, d = Math.sqrt(r()) * R;
      ellipse(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, R * 0.010 * (0.4 + r()), R * 0.010 * (0.4 + r()));
      g.fillStyle = 'rgba(255,250,242,' + (0.25 + r() * 0.55).toFixed(2) + ')';
      g.fill();
    }
  }

  /* ── the bag ──────────────────────────────────────────────────
     A stand-up pouch with a tin tie: two creased faces, a roast
     band whose colour is the only thing that changes between the
     eight blends, and a few beans at the foot for scale. */

  function bag(g, o) {
    var cx = U / 2;
    var w = U * 0.50, h = U * 0.70;
    var top = U * 0.12, bot = top + h;

    contact(g, cx, bot + U * 0.02, w * 0.86, U * 0.045, 1);

    /* beans at the foot, drawn first so the bag stands in front */
    var r = rng(o.seed || 21);
    for (var i = 0; i < 9; i++) {
      var bx = cx + (r() - 0.5) * w * 2.0;
      var by = bot - U * 0.005 + r() * U * 0.030;
      if (Math.abs(bx - cx) < w * 0.52) continue;
      bean(g, bx, by, U * 0.026 * (0.8 + r() * 0.5), r() * TAU, o.roast);
    }

    /* body */
    /* Matte black film, not a black hole. The first pass of this
       bag was a near-black rectangle on a near-black card and it
       disappeared: a matte surface still has a broad, dim
       highlight running down the face nearest the key, and
       without it there is no way to tell a bag from a gap. */
    roundRect(g, cx - w / 2, top, w, h, U * 0.018);
    g.fillStyle = grad(g, cx - w / 2, top, cx + w / 2, bot, [
      [0, '#241a16'], [0.14, '#443831'], [0.46, '#57483f'], [0.72, '#33261f'], [1, '#150f0c']
    ]);
    g.fill();

    /* the crease down the gusset */
    g.beginPath();
    g.moveTo(cx + w * 0.20, top + U * 0.01);
    g.lineTo(cx + w * 0.20, bot - U * 0.01);
    g.strokeStyle = 'rgba(255,240,220,.10)';
    g.lineWidth = U * 0.012;
    g.stroke();

    /* tin tie */
    roundRect(g, cx - w / 2 - U * 0.008, top - U * 0.026, w + U * 0.016, U * 0.040, U * 0.008);
    g.fillStyle = grad(g, 0, top - U * 0.026, 0, top + U * 0.014, [
      [0, '#4c4038'], [0.5, '#2a221d'], [1, '#151110']
    ]);
    g.fill();

    /* the roast band — the one thing that differs bag to bag */
    var by2 = top + h * 0.30;
    g.fillStyle = o.roast;
    g.fillRect(cx - w / 2, by2, w, h * 0.075);
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillRect(cx - w / 2, by2, w, h * 0.018);

    /* label block: cream panel with the blend actually set on it.
       A bag with a greeked label reads as a placeholder from two
       metres away; the name is the one piece of information the
       object is carrying, so it is typeset rather than ruled in. */
    var lx = cx - w * 0.34, ly = top + h * 0.42, lw = w * 0.68, lh = h * 0.34;
    roundRect(g, lx, ly, lw, lh, U * 0.008);
    g.fillStyle = 'rgba(243,232,214,.95)';
    g.fill();
    g.strokeStyle = 'rgba(58,32,16,.30)';
    g.lineWidth = U * 0.002;
    g.stroke();

    var mx = lx + lw / 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    g.fillStyle = 'rgba(58,32,16,.70)';
    g.font = '500 ' + (lw * 0.088).toFixed(1) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.fillText("P E E T ' S", mx, ly + lh * 0.16);

    g.beginPath();
    g.moveTo(lx + lw * 0.22, ly + lh * 0.245);
    g.lineTo(lx + lw * 0.78, ly + lh * 0.245);
    g.strokeStyle = 'rgba(58,32,16,.34)';
    g.lineWidth = U * 0.0018;
    g.stroke();

    /* the name, wrapped to the panel rather than clipped by it */
    var words = String(o.name || '').split(' ');
    var size = lw * 0.145;
    g.fillStyle = 'rgba(42,20,9,.94)';
    var lines = [], cur = '';
    for (var wi = 0; wi < words.length; wi++) {
      g.font = '400 ' + size.toFixed(1) + 'px Georgia, ui-serif, serif';
      var probe = cur ? cur + ' ' + words[wi] : words[wi];
      if (g.measureText(probe).width > lw * 0.84 && cur) { lines.push(cur); cur = words[wi]; }
      else cur = probe;
    }
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines = lines.slice(0, 3); }
    size = Math.min(size, lw * 0.145 * (3 / Math.max(lines.length, 2)));
    g.font = '400 ' + size.toFixed(1) + 'px Georgia, ui-serif, serif';
    for (var li = 0; li < lines.length; li++) {
      g.fillText(lines[li], mx, ly + lh * (0.42 + li * 0.165));
    }

    g.font = '500 ' + (lw * 0.072).toFixed(1) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.fillStyle = 'rgba(58,32,16,.62)';
    g.fillText(String(o.roastLabel || 'DARK ROAST').toUpperCase(), mx, ly + lh * 0.88);

    g.fillStyle = o.roast;
    g.fillRect(mx - lw * 0.16, ly + lh * 0.955, lw * 0.32, lh * 0.030);
    g.textAlign = 'start';
    g.textBaseline = 'alphabetic';

    /* the specular running down the front face */
    g.save();
    roundRect(g, cx - w / 2, top, w, h, U * 0.018); g.clip();
    g.beginPath();
    g.moveTo(cx - w * 0.42, top);
    g.lineTo(cx - w * 0.18, top);
    g.lineTo(cx - w * 0.30, bot);
    g.lineTo(cx - w * 0.46, bot);
    g.closePath();
    g.fillStyle = 'rgba(255,244,226,.07)';
    g.fill();
    g.restore();
  }

  /* a roasted bean: an ellipsoid with one flat face and a crease
     down the middle of it — the crease is the whole read */
  function bean(g, x, y, r, rot, col) {
    g.save();
    g.translate(x, y);
    g.rotate(rot || 0);
    ellipse(g, 0, 0, r * 0.72, r);
    g.fillStyle = grad(g, -r * 0.7, -r, r * 0.5, r, [
      [0, col ? col : '#6b3a1c'], [0.42, '#4a2410'], [1, '#201006']
    ]);
    g.fill();
    g.beginPath();
    g.moveTo(0, -r * 0.86);
    g.quadraticCurveTo(r * 0.16, 0, 0, r * 0.86);
    g.strokeStyle = 'rgba(18,8,3,.80)';
    g.lineWidth = r * 0.16;
    g.lineCap = 'round';
    g.stroke();
    ellipse(g, -r * 0.26, -r * 0.34, r * 0.20, r * 0.30);
    g.fillStyle = 'rgba(255,214,168,.22)';
    g.fill();
    g.restore();
  }

  /* ── the forms, by name ───────────────────────────────────────
     Each entry sets the vessel proportions and what is in it. The
     twelve drinks are four vessels; what separates a latte from a
     flat white here is the foam depth and the rim ratio, which is
     what separates them on a bench too. */

  var FORMS = {
    demitasse: function (g, o) {
      cup(g, {
        topR: U * 0.150, botR: U * 0.108, top: U * 0.400, bot: U * 0.590,
        saucer: true, handle: true, wall: 0.10,
        liquid: o.liquid, liquidLit: o.liquidLit, liquidEdge: o.liquidEdge,
        crema: o.crema, foam: o.foam, art: o.art, artColor: o.artColor,
        dust: o.dust, steam: o.steam, seed: o.seed, steamH: 2.2
      });
    },
    mug: function (g, o) {
      cup(g, {
        topR: U * 0.205, botR: U * 0.160, top: U * 0.310, bot: U * 0.650,
        saucer: o.saucer !== false, handle: true, wall: 0.075,
        liquid: o.liquid, liquidLit: o.liquidLit, liquidEdge: o.liquidEdge,
        crema: o.crema, foam: o.foam, art: o.art, artColor: o.artColor,
        dust: o.dust, steam: o.steam, seed: o.seed
      });
    },
    bowl: function (g, o) {
      cup(g, {
        topR: U * 0.245, botR: U * 0.140, top: U * 0.350, bot: U * 0.610,
        saucer: true, handle: true, wall: 0.062, handleY: 0.40, handleR: 0.34,
        liquid: o.liquid, liquidLit: o.liquidLit, liquidEdge: o.liquidEdge,
        crema: o.crema, foam: o.foam, art: o.art, artColor: o.artColor,
        dust: o.dust, steam: o.steam, seed: o.seed
      });
    },
    teacup: function (g, o) {
      cup(g, {
        topR: U * 0.225, botR: U * 0.115, top: U * 0.380, bot: U * 0.580,
        saucer: true, handle: true, wall: 0.050, handleY: 0.38, handleR: 0.30,
        glaze: o.glaze,
        liquid: o.liquid, liquidLit: o.liquidLit, liquidEdge: o.liquidEdge,
        foam: o.foam, art: o.art, artColor: o.artColor,
        dust: o.dust, steam: o.steam, seed: o.seed
      });
    },
    tall: function (g, o) {
      glass(g, {
        topR: U * 0.165, botR: U * 0.140, top: U * 0.230, bot: U * 0.740,
        liquid: o.liquid, liquidEdge: o.liquidEdge, layers: o.layers,
        ice: o.ice !== false, cold: true, straw: o.straw, fill: o.fill,
        foamTop: o.foamTop, seed: o.seed
      });
    },
    croissant: croissant,
    batard: chocBatard,
    muffin: muffin,
    loaf: loaf,
    roll: cinnamonRoll,
    cookie: cookie,
    bag: bag
  };

  /* ── entry point ──────────────────────────────────────────────
     Draws `spec` into `canvas` at its CSS size × dpr. Called once
     per product when the card first comes near the viewport, and
     again only if the card is resized past a threshold. */

  function draw(canvas, spec, cssW, cssH, dpr) {
    var f = FORMS[spec.form];
    if (!f) return false;
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    canvas.width = w; canvas.height = h;

    var g = canvas.getContext('2d');
    if (!g) return false;
    g.clearRect(0, 0, w, h);

    /* the square is fitted to the shorter side and centred, so a
       wide card gets a centred object rather than a stretched one */
    var s = Math.min(w, h) / U;
    g.setTransform(s, 0, 0, s, (w - U * s) / 2, (h - U * s) / 2);

    f(g, spec);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  }

  PEET.Art = { draw: draw, bean: bean, C: C, U: U };

})(window);
