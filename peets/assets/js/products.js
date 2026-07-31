/* ═══════════════════════════════════════════════════════════
   products.js — the menu, in three dimensions.

   Every product on this site was first drawn flat, on a 2D
   canvas, and under a film rendered with a real PBR pipeline the
   whole page read as clipart. Flat vector illustration is not a
   cheaper version of a product shot; it is a different thing, and
   putting one under the other makes both look worse.

   So the menu is modelled and lit by the same renderer as the
   film: the same GGX lighting, the same analytic café for
   reflections, the same shadow map, the same bloom, the same ACES
   composite. A latte is a lathed ceramic vessel with a liquid
   surface running the film's crema shader; a bag is a swept pouch
   with a printed label; a croissant is a tube swept along an arc
   with laminated lobes cut into its radius.

   Nothing here is a model file. Every shape in this file is
   parametric — a profile revolved, a section swept, or a surface
   displaced — which is the same constraint the film runs under
   and the reason 34 products cost about 25 KB.

   `Studio` renders one product at a time into a single offscreen
   canvas and blits the result into the card's own canvas. That
   keeps one WebGL2 context for the whole menu instead of 34, and
   the context is released once the last card has been drawn.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  var M = PEET.M, GL = PEET.GL, Geo = PEET.Geo, SH = PEET.SH, Tex = PEET.Tex;
  var m4 = M.m4, TAU = Math.PI * 2;

  /* ══════════════════════════════════════════════════════════
     MATERIALS

     Base colours are linear, not sRGB — everything up to the
     composite is linear light. A "cream" ceramic at 0.86 here is
     not 0.86 on screen.
     ══════════════════════════════════════════════════════════ */

  var MAT = {
    ceramic:   { base: [0.855, 0.840, 0.810], rough: 0.15, metal: 0, mat: 1 },
    ceramicDk: { base: [0.052, 0.048, 0.045], rough: 0.19, metal: 0, mat: 1 },
    ceramicWm: { base: [0.780, 0.720, 0.640], rough: 0.20, metal: 0, mat: 1 },
    glass:     { base: [0.52, 0.56, 0.60],    rough: 0.03, metal: 0, mat: 7, alpha: 0.50 },
    ice:       { base: [0.70, 0.78, 0.86],    rough: 0.05, metal: 0, mat: 7, alpha: 0.62 },
    steel:     { base: [0.855, 0.865, 0.875], rough: 0.26, metal: 1, mat: 3 },
    bean:      { base: [0.150, 0.062, 0.030], rough: 0.42, metal: 0, mat: 6, detail: 1 },
    wood:      { base: [0.105, 0.055, 0.028], rough: 0.44, metal: 0, mat: 5 },
    film:      { base: [0.058, 0.050, 0.046], rough: 0.34, metal: 0, mat: 0 },
    label:     { base: [0.90, 0.86, 0.78],    rough: 0.58, metal: 0, mat: 9 },
    paper:     { base: [0.30, 0.22, 0.15],    rough: 0.80, metal: 0, mat: 0 },
    straw:     { base: [0.28, 0.11, 0.045],   rough: 0.34, metal: 0, mat: 0 },

    crust:     { base: [0.44, 0.215, 0.078],  rough: 0.52, metal: 0, mat: 10, detail: 0.55 },
    crustPale: { base: [0.58, 0.36, 0.165],   rough: 0.58, metal: 0, mat: 10, detail: 0.50 },
    crustDark: { base: [0.20, 0.085, 0.032],  rough: 0.48, metal: 0, mat: 10, detail: 0.60 },
    crumb:     { base: [0.50, 0.31, 0.145],   rough: 0.76, metal: 0, mat: 10, detail: 0.75 },
    choc:      { base: [0.055, 0.024, 0.012], rough: 0.22, metal: 0, mat: 0 },
    icing:     { base: [0.90, 0.86, 0.78],    rough: 0.16, metal: 0, mat: 0 },
    almond:    { base: [0.66, 0.55, 0.36],    rough: 0.55, metal: 0, mat: 0 },
    berry:     { base: [0.055, 0.040, 0.115], rough: 0.20, metal: 0, mat: 0 },
    sugar:     { base: [0.92, 0.90, 0.86],    rough: 0.30, metal: 0, mat: 0 }
  };

  /* The liquid ramps. Each is deep → crema → highlight → the
     colour the latte art is drawn in. */
  var LIQ = {
    espresso: { deep: [0.055, 0.021, 0.010], crema: [0.62, 0.34, 0.135], cremaHi: [0.86, 0.59, 0.30], milk: [0.93, 0.87, 0.775] },
    coffee:   { deep: [0.040, 0.017, 0.009], crema: [0.34, 0.17, 0.070], cremaHi: [0.60, 0.36, 0.17],  milk: [0.93, 0.87, 0.775] },
    latte:    { deep: [0.175, 0.085, 0.038], crema: [0.56, 0.36, 0.185], cremaHi: [0.80, 0.60, 0.36],  milk: [0.95, 0.90, 0.82] },
    foam:     { deep: [0.30, 0.185, 0.090],  crema: [0.86, 0.79, 0.68],  cremaHi: [0.97, 0.93, 0.86],  milk: [0.96, 0.92, 0.85] },
    mocha:    { deep: [0.045, 0.020, 0.012], crema: [0.30, 0.15, 0.085], cremaHi: [0.58, 0.36, 0.22],  milk: [0.94, 0.88, 0.79] },
    caramel:  { deep: [0.22, 0.115, 0.045],  crema: [0.66, 0.42, 0.175], cremaHi: [0.88, 0.64, 0.32],  milk: [0.95, 0.90, 0.80] },
    matcha:   { deep: [0.105, 0.170, 0.055], crema: [0.36, 0.50, 0.19],  cremaHi: [0.58, 0.72, 0.36],  milk: [0.94, 0.94, 0.86] },
    chai:     { deep: [0.245, 0.135, 0.062], crema: [0.60, 0.40, 0.21],  cremaHi: [0.82, 0.62, 0.38],  milk: [0.95, 0.91, 0.82] },
    black:    { deep: [0.140, 0.048, 0.014], crema: [0.42, 0.18, 0.055], cremaHi: [0.72, 0.38, 0.14],  milk: [0.92, 0.87, 0.78] },
    green:    { deep: [0.135, 0.180, 0.062], crema: [0.34, 0.42, 0.17],  cremaHi: [0.58, 0.66, 0.32],  milk: [0.92, 0.93, 0.84] },
    herbal:   { deep: [0.290, 0.185, 0.045], crema: [0.66, 0.48, 0.16],  cremaHi: [0.88, 0.72, 0.34],  milk: [0.94, 0.90, 0.80] },
    mint:     { deep: [0.115, 0.165, 0.080], crema: [0.32, 0.44, 0.22],  cremaHi: [0.54, 0.66, 0.38],  milk: [0.92, 0.94, 0.86] }
  };

  /* ══════════════════════════════════════════════════════════
     GEOMETRY

     Each builder returns a finished mesh description. They are
     cached by key, so twelve drinks that share a mug build one.
     ══════════════════════════════════════════════════════════ */

  /* ── vessels ──────────────────────────────────────────────────
     One profile generator covers the demitasse, the mug, the
     cappuccino bowl and the teacup. A cup is a *shell*: the lathe
     runs up the outside, over the rim, and back down the inside
     to the floor, so the wall has a real thickness and the rim
     has a real edge to catch a highlight. Cups modelled as a
     single surface look like paper, because that is what a
     zero-thickness rim is. */

  function vesselProfile(o) {
    var rim = o.rim, base = o.base, h = o.h, wall = o.wall;
    var belly = o.belly === undefined ? 0.5 : o.belly;
    var pts = [];
    var i, t, r, y;

    /* the foot */
    pts.push([0, 0]);
    pts.push([base * 0.82, 0]);
    pts.push([base, 0.006 * h]);
    pts.push([base * 1.005, 0.028 * h]);
    pts.push([base * 0.965, 0.052 * h]);

    /* the outside wall: base to rim, with the belly pushed out
       between them by `belly` */
    var N = 16;
    for (i = 0; i <= N; i++) {
      t = i / N;
      y = 0.052 * h + (h - 0.052 * h) * t;
      r = base * 0.965 + (rim - base * 0.965) * Math.pow(t, o.taper || 0.82);
      r += Math.sin(t * Math.PI) * belly * (rim - base) * 0.34;
      pts.push([r, y]);
    }

    /* over the rim: four points, because a rim rendered with two
       is a crease and a rim rendered with eight is a tube */
    pts.push([rim + wall * 0.16, h + wall * 0.10]);
    pts.push([rim + wall * 0.10, h + wall * 0.18]);
    pts.push([rim - wall * 0.34, h + wall * 0.20]);

    /* and back down the inside */
    for (i = 0; i <= N; i++) {
      t = 1 - i / N;
      y = 0.052 * h + (h - 0.052 * h) * t;
      r = base * 0.965 + (rim - base * 0.965) * Math.pow(t, o.taper || 0.82);
      r += Math.sin(t * Math.PI) * belly * (rim - base) * 0.34;
      r -= wall * (0.72 + 0.5 * (1 - t));      /* the wall thickens toward the foot */
      pts.push([Math.max(r, 0.02), Math.max(y, wall * 1.5)]);
    }
    pts.push([base * 0.4, wall * 1.35]);
    pts.push([0, wall * 1.3]);
    return pts;
  }

  function vessel(o, segs) {
    var prof = vesselProfile(o);
    var b = Geo.lathe(prof, segs || 96);

    if (o.handle !== false) {
      /* the handle has to start and end *on* the wall, at whatever
         radius the profile actually has at that height */
      var outer = [];
      for (var i = 0; i < prof.length; i++) {
        if (i > 0 && prof[i][1] < prof[i - 1][1]) break;   /* stop at the rim */
        outer.push(prof[i]);
      }
      function radiusAt(y) {
        var best = outer[0][0];
        for (var k = 0; k < outer.length - 1; k++) {
          var a = outer[k], c = outer[k + 1];
          if (y >= a[1] && y <= c[1]) {
            var t = (y - a[1]) / ((c[1] - a[1]) || 1e-6);
            return a[0] + (c[0] - a[0]) * t;
          }
          best = c[0];
        }
        return best;
      }
      var hTop = o.h * (o.handleTop || 0.82);
      var hBot = o.h * (o.handleBot || 0.28);
      b.merge(Geo.handle(radiusAt, hTop, hBot,
        o.handleOut || o.rim * 0.52, o.handleTube || o.rim * 0.115, 0.68, 22, 34));
    }
    return b.finish();
  }

  /* a tumbler: same shell idea, no handle, straight-sided */
  function tumbler(o, segs) {
    return Geo.lathe(vesselProfile(o), segs || 96).finish();
  }

  /* A note that cost an hour: `Geo.parametric` winds its quads the
     opposite way round from `Geo.lathe`. Build a surface of
     revolution with parametric using the same
     (cos a, y, sin a) mapping a lathe uses and it comes out
     inside-out — back-face culling then keeps the far wall and
     throws away the near one, so the object renders as a hollow
     shell you can see straight into. The fix is to run the angle
     backwards, which flips the winding and costs nothing.
     Everything below that is a surface of revolution does this. */
  function ang(u) { return -u * TAU; }

  /* ── the bag ──────────────────────────────────────────────────
     A stand-up pouch is not a box and it is not a cylinder. The
     cross-section is a superellipse that starts almost
     rectangular at the sealed top and rounds out through the
     body, and the whole thing tapers in toward the base where the
     gusset folds under. A box with rounded corners reads as a
     box; this reads as something with coffee in it. */

  function pouch(o) {
    var W = o.w, D = o.d, H = o.h;
    return Geo.parametric(function (u, v, out) {
      var a = ang(u);
      var ca = Math.cos(a), sa = Math.sin(a);

      /* v: 0 at the base, 1 at the seal */
      var top = Math.pow(v, 1.6);
      var e = 2.0 + top * 4.5;                       /* superellipse exponent */
      var sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
      var sz = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);

      /* the silhouette: wide through the belly, pinched at the
         seal, and drawn in at the foot where the gusset is */
      var swell = 1
        - Math.pow(Math.max(0, v - 0.62) / 0.38, 2.0) * 0.30     /* to the seal */
        - Math.pow(Math.max(0, 0.20 - v) / 0.20, 1.8) * 0.22;    /* to the foot */

      /* the pouch is deeper in the middle than at the edges: this
         is what makes it read as filled rather than flat */
      var depth = 1 - Math.pow(Math.max(0, v - 0.55) / 0.45, 1.7) * 0.62;

      var y = v * H;
      /* the top seal is a flat crimp, so the last sliver collapses */
      /* the crimp has to reach zero depth, not 0.14 of it: front
         and back only meet — and the pouch only closes — when the
         two halves land on the same plane */
      if (v > 0.94) {
        var k = (v - 0.94) / 0.06;
        depth *= 1 - k;
        swell *= 1 - k * 0.06;
      }
      /* and the gusset shuts under the base the same way */
      if (v < 0.05) {
        var k2 = 1 - v / 0.05;
        depth *= 1 - k2;
        swell *= 1 - k2 * 0.35;
      }

      out[0] = sx * W * 0.5 * swell;
      out[1] = y;
      out[2] = sz * D * 0.5 * swell * depth;

      /* the gusset crease down each side, and the soft vertical
         wrinkles a filled pouch always has */
      var side = Math.pow(Math.abs(sz), 3.0);
      out[0] *= 1 - side * 0.06;
      var wr = Math.sin(a * 6.0) * 0.006 * Math.sin(v * Math.PI) * (1 - side);
      out[0] += wr * W;
      out[2] += Math.cos(a * 5.0) * 0.005 * Math.sin(v * Math.PI) * D;
    }, 80, 44, true);
  }

  /* ── pastry ───────────────────────────────────────────────────
     The croissant is the one that has to be right: it is the most
     recognisable object on the menu and the easiest to get
     obviously wrong. It is a tube swept along an arc, with the
     laminated lobes cut into the *radius* as a function of the
     distance along that arc, tapering to points at both tips.
     Drawing lobes as surface detail instead of as silhouette is
     what makes a croissant read as a brown banana. */

  function croissant(o) {
    var lobes = o.lobes || 7;
    var R = 1.0;
    return Geo.parametric(function (u, v, out) {
      /* v along the crescent, u around the section */
      var spanA = Math.PI * 1.30;
      var ang = -spanA / 2 + spanA * v;

      /* the centre line of the crescent */
      var cx = Math.sin(ang) * R;
      var cz = -Math.cos(ang) * R * 0.66;

      /* taper: fat in the middle, pointed at both ends */
      var bulk = Math.pow(Math.sin(Math.PI * v), 0.62);

      /* the lobes, and the deep score between each pair */
      var lp = v * lobes * Math.PI;
      var lobe = 0.82 + 0.18 * Math.abs(Math.sin(lp));
      var score = Math.pow(Math.abs(Math.cos(lp)), 6.0);
      var rad = o.tube * bulk * lobe * (1 - score * 0.22);

      var a = u * TAU;
      /* the section is an ellipse, wider than tall, and it sits
         slightly proud on top where the dough rose */
      var sy = Math.sin(a);
      var rise = 1 + Math.max(0, sy) * 0.24;

      /* tangent of the centre line, so the section stays square to it */
      var tx = Math.cos(ang), tz = Math.sin(ang) * 0.66;
      var tl = Math.hypot(tx, tz) || 1;
      var nx = -tz / tl, nz = tx / tl;

      var rr = rad * (1 + Math.cos(a) * 0.0);
      out[0] = cx + nx * Math.cos(a) * rr * 1.06;
      out[1] = sy * rad * rise * 0.86 + rad * 0.10;
      out[2] = cz + nz * Math.cos(a) * rr * 1.06;

      /* the ends curl in and down, the way the tips of a rolled
         croissant do */
      var tipIn = Math.pow(Math.max(0, Math.abs(v - 0.5) * 2 - 0.72) / 0.28, 2);
      out[0] *= 1 - tipIn * 0.16;
      out[1] -= tipIn * o.tube * 0.55;
    }, 26, 150, true);
  }

  /* pain au chocolat: a laminated rectangular block with the folds
     running across it and the ends tucked under */
  function batard(o) {
    return Geo.parametric(function (u, v, out) {
      var a = u * TAU;
      var ca = Math.cos(a), sa = Math.sin(a);
      /* a superellipse section, flatter than it is wide */
      var e = 3.4;
      var sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
      var sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);

      /* v runs the length of the loaf; the ends round off */
      var t = v * 2 - 1;
      var len = Math.pow(Math.max(0, 1 - t * t * t * t), 0.30);

      /* the folds: five ridges across the top */
      var fold = Math.sin(v * Math.PI * 5.0);
      var ridge = 1 + Math.max(0, sy) * fold * 0.10;

      out[0] = t * o.len * 0.5;
      out[1] = sy * o.h * 0.5 * len * ridge + o.h * 0.5;
      out[2] = sx * o.w * 0.5 * len;
      /* the seam down the middle of the top */
      out[1] -= Math.max(0, sy) * Math.exp(-Math.pow(sx * 3.2, 2)) * o.h * 0.10;
    }, 44, 90, true);
  }

  /* A muffin is two objects, not one: a fluted paper case and a
     crown that overhangs it. Modelling both in a single surface
     and then collapsing the crown to nothing to get the case on
     its own leaves a degenerate pole at the top and renders as a
     flying saucer with spikes, which is exactly what the first
     version of this did. */
  function muffinCase(o) {
    return Geo.parametric(function (u, v, out) {
      var a = ang(u);
      /* the first slice of v is the closed base, so the case is a
         cup rather than a pipe */
      var t = Math.max(0, (v - 0.10) / 0.90);
      var r = (o.baseR + (o.caseR - o.baseR) * t) * Math.min(1, v / 0.10);
      r *= 1 + Math.sin(a * 18) * 0.030;            /* flutes */
      out[0] = Math.cos(a) * r;
      out[1] = t * o.caseH;
      out[2] = Math.sin(a) * r;
    }, 72, 24, true);
  }

  function muffinCrown(o) {
    return Geo.parametric(function (u, v, out) {
      var a = ang(u);
      /* v: 0 at the overhanging lip, 1 at the top of the dome */
      var dome = Math.cos(v * Math.PI * 0.5);
      var r = o.crownR * Math.pow(dome, 0.40);
      var y = Math.sin(v * Math.PI * 0.5) * o.crownH;
      /* the lip tucks back under toward the case */
      var tuck = Math.pow(Math.max(0, 0.16 - v) / 0.16, 1.5);
      r -= tuck * o.crownR * 0.30;
      y -= tuck * o.crownH * 0.30;
      /* a risen crown is never a clean dome */
      r *= 1 + Math.sin(a * 3.2 + v * 5.0) * 0.055 * (1 - v * 0.6);
      y += Math.sin(a * 2.6 + 1.1) * o.crownH * 0.05 * (1 - v);
      out[0] = Math.cos(a) * r;
      out[1] = o.caseH * 0.86 + y;
      out[2] = Math.sin(a) * r;
    }, 72, 40, true);
  }

  /* a slice of loaf: a domed top, a flat cut face toward the lens */
  function loafSlice(o) {
    return Geo.parametric(function (u, v, out) {
      var a = u * TAU;
      var ca = Math.cos(a), sa = Math.sin(a);
      var e = 5.0;
      var sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
      var sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
      /* v is the thickness of the slice */
      var t = v * 2 - 1;
      var thick = Math.pow(Math.max(0, 1 - Math.pow(t, 8)), 0.25);
      /* Collapsing only z at the ends flattens the cross-section
         onto a plane but keeps its width — which is an outline
         with a hole in it, not a cap. The section itself has to
         close, so x and y shrink too, over the last few per cent
         of the sweep where it reads as a cut edge rather than a
         rounded loaf. */
      var shut = Math.pow(Math.max(0, 1 - Math.pow(t, 12)), 0.16);
      var dome = Math.max(0, sy);
      var split = Math.exp(-Math.pow(sx * 2.4, 2));
      out[0] = sx * o.w * 0.5 * shut;
      out[1] = (sy * o.h * 0.5 * (1 + dome * 0.34) - dome * split * o.h * 0.11) * shut + o.h * 0.5;
      out[2] = -t * o.d * 0.5 * thick;
    }, 56, 34, true);
  }

  /* a cinnamon roll: a tube swept along an Archimedean spiral,
     which is what a rolled bun actually is */
  function spiralRoll(o) {
    var turns = 2.35;
    return Geo.parametric(function (u, v, out) {
      var ang = v * TAU * turns;
      var rad = o.r0 + (o.r1 - o.r0) * v;
      var a = -u * TAU;
      /* the section is squashed: a bun spreads as it proves */
      var tube = o.tube * (0.82 + 0.30 * v);
      var cx = Math.cos(ang) * rad;
      var cz = Math.sin(ang) * rad;
      /* the section's outward normal in the plane */
      var nx = Math.cos(ang), nz = Math.sin(ang);
      out[0] = cx + nx * Math.cos(a) * tube;
      out[1] = o.tube * 0.92 + Math.sin(a) * tube * 0.78;
      out[2] = cz + nz * Math.cos(a) * tube;
    }, 22, 210, true);
  }

  /* a cookie: a disc with a torn edge and a blistered top */
  function cookie(o) {
    return Geo.parametric(function (u, v, out) {
      var a = ang(u);
      /* the outline wobbles — a perfect circle is a button */
      var edge = 1 + Math.sin(a * 3.1 + 1.2) * 0.035 + Math.sin(a * 5.7) * 0.022
        + Math.sin(a * 9.3 + 2.0) * 0.013;
      var t = v * Math.PI;
      /* an ellipsoid squashed flat, then flattened again underneath */
      var r = Math.sin(t) * o.r * edge;
      var y = Math.cos(t) * o.h;
      if (y < 0) y *= 0.34;
      /* the crackled dome */
      y += Math.sin(a * 4.0 + r * 9.0) * o.h * 0.07 * Math.max(0, Math.cos(t));
      out[0] = Math.cos(a) * r;
      out[1] = y + o.h * 0.34;
      out[2] = Math.sin(a) * r;
    }, 72, 40, true);
  }

  /* ══════════════════════════════════════════════════════════
     THE MENU

     Keyed by the product's name as it appears on the card, so the
     markup carries the words and this file carries the object.
     Everything is in the film's units: the mug is 12 cm across.
     ══════════════════════════════════════════════════════════ */

  var V = {
    demitasse: { rim: 0.30, base: 0.205, h: 0.30, wall: 0.030, belly: 0.30, taper: 0.72,
                 handleTop: 0.78, handleBot: 0.26, handleOut: 0.20, handleTube: 0.038 },
    mug:       { rim: 0.395, base: 0.315, h: 0.52, wall: 0.028, belly: 0.18, taper: 0.85,
                 handleTop: 0.80, handleBot: 0.24, handleOut: 0.24, handleTube: 0.050 },
    bowl:      { rim: 0.500, base: 0.250, h: 0.355, wall: 0.024, belly: 0.42, taper: 0.62,
                 handleTop: 0.74, handleBot: 0.24, handleOut: 0.22, handleTube: 0.044 },
    teacup:    { rim: 0.455, base: 0.205, h: 0.295, wall: 0.019, belly: 0.52, taper: 0.55,
                 handleTop: 0.76, handleBot: 0.26, handleOut: 0.22, handleTube: 0.036 },
    tall:      { rim: 0.315, base: 0.275, h: 0.80, wall: 0.017, belly: 0.06, taper: 0.94,
                 handle: false }
  };

  /* the inside wall, read off the same profile the lathe uses, so
     the liquid disc always meets the ceramic exactly — a surface
     that floats free of the wall is the most obvious tell there is */
  function innerAt(o, y) {
    var t = M.sat((y - 0.052 * o.h) / (o.h - 0.052 * o.h));
    var r = o.base * 0.965 + (o.rim - o.base * 0.965) * Math.pow(t, o.taper || 0.82);
    r += Math.sin(t * Math.PI) * (o.belly === undefined ? 0.5 : o.belly) * (o.rim - o.base) * 0.34;
    return Math.max(r - o.wall * (0.72 + 0.5 * (1 - t)), 0.02);
  }

  function drink(v, liq, o) {
    o = o || {};
    return {
      kind: 'vessel', v: v, liq: liq,
      fill: o.fill === undefined ? 0.80 : o.fill,
      crema: o.crema === undefined ? 0.6 : o.crema,
      art: o.art || 0, saucer: o.saucer !== false,
      glaze: o.glaze, beans: o.beans, spoon: o.spoon,
      steam: o.steam !== false
    };
  }

  var MENU = {
    /* ── the bar ── */
    'Espresso':        drink('demitasse', 'espresso', { fill: 0.60, crema: 1.0 }),
    'Americano':       drink('mug', 'coffee', { fill: 0.84, crema: 0.42 }),
    'Cappuccino':      drink('bowl', 'foam', { fill: 0.90, crema: 1.0, art: 0.22 }),
    'Latte':           drink('mug', 'latte', { fill: 0.86, crema: 0.55, art: 1.0 }),
    'Mocha':           drink('mug', 'mocha', { fill: 0.85, crema: 0.72, art: 0.85 }),
    'Flat White':      drink('bowl', 'latte', { fill: 0.88, crema: 0.40, art: 0.95 }),
    'Cold Brew':       { kind: 'glass', liq: 'coffee', fill: 0.80, ice: 6, straw: false, steam: false },
    'Iced Latte':      { kind: 'glass', liq: 'latte', fill: 0.82, ice: 6, straw: true, steam: false, layered: true },
    'Vanilla Latte':   drink('mug', 'caramel', { fill: 0.86, crema: 0.48, art: 1.0 }),
    'Caramel Latte':   drink('mug', 'caramel', { fill: 0.86, crema: 0.62, art: 0.55 }),
    'Matcha Latte':    drink('bowl', 'matcha', { fill: 0.88, crema: 0.50, art: 0.9 }),
    'Chai Latte':      drink('mug', 'chai', { fill: 0.86, crema: 0.58, art: 0.35 }),

    /* ── tea ── */
    'Earl Grey':          drink('teacup', 'black', { fill: 0.86, crema: 0.10, saucer: true }),
    'English Breakfast':  drink('teacup', 'black', { fill: 0.86, crema: 0.14 }),
    'Green Tea':          drink('teacup', 'green', { fill: 0.86, crema: 0.08, glaze: true }),
    'Chamomile':          drink('teacup', 'herbal', { fill: 0.86, crema: 0.10 }),
    'Mint Tea':           drink('teacup', 'mint', { fill: 0.86, crema: 0.08, glaze: true }),
    'Chai Tea':           drink('teacup', 'chai', { fill: 0.86, crema: 0.34 }),

    /* ── whole bean ── */
    "Major Dickason's Blend": bag('#3a1c0c', 'Dark Roast'),
    'French Roast':           bag('#25120a', 'Darkest Roast'),
    'Big Bang':               bag('#8a4a24', 'Medium Roast'),
    'Espresso Forte':         bag('#43220f', 'Dark Roast'),
    'House Blend':            bag('#5c3018', 'Medium-Dark'),
    'Colombia Luminosa':      bag('#a8703c', 'Light Roast'),
    'Café Domingo':      bag('#6f3c1e', 'Medium Roast'),
    'Decaf House Blend':      bag('#54290f', 'Medium-Dark'),

    /* ── bakery ── */
    'Butter Croissant':   { kind: 'pastry', form: 'croissant', mat: 'crust' },
    'Chocolate Croissant':{ kind: 'pastry', form: 'batard', mat: 'crust' },
    'Almond Croissant':   { kind: 'pastry', form: 'croissant', mat: 'crustPale', almond: true, sugar: true },
    'Blueberry Muffin':   { kind: 'pastry', form: 'muffin', mat: 'crustPale', berry: true },
    'Chocolate Muffin':   { kind: 'pastry', form: 'muffin', mat: 'crustDark', chips: true },
    'Banana Bread':       { kind: 'pastry', form: 'loaf', mat: 'crumb' },
    'Cinnamon Roll':      { kind: 'pastry', form: 'roll', mat: 'crustPale', icing: true },
    'Chocolate Cookie':   { kind: 'pastry', form: 'cookie', mat: 'crust', chips: true }
  };

  function bag(roast, label) {
    return { kind: 'bag', roast: roast, label: label };
  }

  /* ══════════════════════════════════════════════════════════
     SCENES

     Turn one menu entry into the parts list the studio draws.
     Meshes are asked for by key, so the twelve drinks that share a
     mug upload one buffer.
     ══════════════════════════════════════════════════════════ */

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hex2lin(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    /* the shader works in linear light; a hex from a stylesheet is sRGB */
    for (var i = 0; i < 3; i++) c[i] = Math.pow(c[i], 2.2);
    return c;
  }

  function labelCanvas(name, roastWord, roastHex) {
    var c = doc().createElement('canvas');
    c.width = 512; c.height = 512;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    /* the sheet's v runs up the bag and the texture's runs down it */
    g.translate(0, 512); g.scale(1, -1);

    /* The panel fills the canvas, because the mesh it is mapped to
       *is* the panel. Insetting the print inside the texture and
       then mapping that texture onto a mesh the size of the print
       shrinks it twice. */
    g.fillStyle = '#efe4d2';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(58,32,16,.30)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 506);

    g.fillStyle = '#3a2010';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.fillText("P E E T ' S", 256, 86);

    g.beginPath();
    g.moveTo(96, 132); g.lineTo(416, 132);
    g.strokeStyle = 'rgba(58,32,16,.45)'; g.lineWidth = 3; g.stroke();

    /* the name, wrapped to the panel and pulled in until it fits */
    var words = String(name).split(' ');
    var size = 74, lines, cur, i;
    do {
      g.font = '400 ' + size + 'px Georgia, ui-serif, serif';
      lines = []; cur = '';
      for (i = 0; i < words.length; i++) {
        var probe = cur ? cur + ' ' + words[i] : words[i];
        if (g.measureText(probe).width > 384 && cur) { lines.push(cur); cur = words[i]; }
        else cur = probe;
      }
      if (cur) lines.push(cur);
      size -= 5;
    } while (lines.length > 3 && size > 28);

    g.fillStyle = '#2a1408';
    for (i = 0; i < lines.length; i++) {
      g.fillText(lines[i], 256, 262 + i * (size + 14) - (lines.length - 1) * (size + 14) / 2);
    }

    g.font = '600 27px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.fillStyle = 'rgba(58,32,16,.70)';
    g.fillText(String(roastWord).toUpperCase(), 256, 404);

    g.fillStyle = roastHex;
    g.fillRect(176, 438, 160, 20);
    return c;
  }

  function doc() { return global.document; }

  /* ── build ── */

  function build(studio, name) {
    var spec = MENU[name];
    if (!spec) return null;
    var st = studio.defaultState();
    var parts = [];
    var r = rng(hash(name));

    /* the counter, always. It is what the shadow lands on, and a
       product with no surface under it is a sticker. */
    parts.push({
      mesh: studio.mGround, mat: MAT.wood,
      pos: [0, 0, 0], scale: 1
    });

    if (spec.kind === 'vessel') buildVessel(studio, spec, parts, st, r);
    else if (spec.kind === 'glass') buildGlass(studio, spec, parts, st, r);
    else if (spec.kind === 'bag') buildBag(studio, spec, parts, st, r, name);
    else buildPastry(studio, spec, parts, st, r);

    return { state: st, parts: parts };
  }

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function buildVessel(studio, spec, parts, st, r) {
    var o = V[spec.v];
    var key = 'v:' + spec.v;
    var mesh = studio.mesh(key, function () { return vessel(o, 96); });

    if (spec.saucer) {
      parts.push({
        mesh: studio.mesh('saucer', function () { return Geo.saucer(1, 88); }),
        mat: MAT.ceramic, pos: [0, 0, 0], scale: o.rim * 1.45
      });
    }

    var lift = spec.saucer ? 0.055 * o.rim * 1.62 / 0.07 * 0.07 : 0;
    lift = spec.saucer ? 0.062 * (o.rim * 1.45) : 0;
    parts.push({
      mesh: mesh, mat: spec.glaze ? MAT.ceramicDk : MAT.ceramic,
      pos: [0, lift, 0], ry: 0.55
    });

    /* the liquid */
    var y = o.h * spec.fill;
    var lr = innerAt(o, y) * 0.995;
    parts.push({
      mesh: studio.mesh('liquid', function () { return Geo.disc(1, 96, 0.004); }),
      mat: { base: LIQ[spec.liq].deep, rough: 0.18, metal: 0, mat: 2, liq: LIQ[spec.liq] },
      pos: [0, lift + y, 0], scale: [lr, 1, lr], ry: 0.4,
      noShadow: true,
      liquid: {
        crema: spec.crema,
        swirl: 0.7 + r() * 2.2,
        artReveal: spec.art > 0 ? 1 : 0,
        artOpacity: spec.art,
        tex: spec.art > 0 ? studio.texture('art', function () { return Tex.latteArt(512); }) : null
      }
    });

    /* a couple of beans on the saucer, for scale and for something
       to catch a specular that is not ceramic */
    if (spec.saucer && spec.v !== 'teacup') {
      var bm = studio.mesh('bean', function () { return Geo.bean(30, 20); });
      for (var i = 0; i < 2; i++) {
        var a = 2.1 + i * 0.9 + r() * 0.5;
        var d = o.rim * (1.10 + r() * 0.22);
        parts.push({
          mesh: bm, mat: MAT.bean,
          pos: [Math.cos(a) * d, lift + 0.012, Math.sin(a) * d],
          scale: 0.030, ry: r() * 3, rz: 1.57
        });
      }
    }

    /* the saucer is the widest thing in shot, not the cup */
    var wide = spec.saucer ? o.rim * 1.45 * 2.2 : o.rim * 2.4;
    st.shadowExtent = Math.max(wide * 0.75, 0.9);
    studio.frame(st, o.h + lift + 0.03, wide, {
      fill: 0.60,
      pitch: spec.v === 'bowl' || spec.v === 'teacup' ? 0.44 : 0.34,
      yaw: 0.50, aim: 0.52, fov: 0.46
    });
  }

  function buildGlass(studio, spec, parts, st, r) {
    var o = V.tall;
    var mesh = studio.mesh('v:tall', function () { return tumbler(o, 96); });

    var y = o.h * spec.fill;
    var lr = innerAt(o, o.h * 0.5) * 0.99;

    /* the drink is a solid column inside the glass, capped by a
       surface disc — a tumbler filled with a single translucent
       body has no top and reads as an empty glass with a tint */
    parts.push({
      mesh: studio.mesh('col', function () { return Geo.cylinder(1, 1, 96, false); }),
      mat: { base: LIQ[spec.liq].deep, rough: 0.10, metal: 0, mat: 0 },
      pos: [0, 0.020, 0], scale: [lr, y - 0.020, lr], noShadow: true
    });
    parts.push({
      mesh: studio.mesh('liquid', function () { return Geo.disc(1, 96, 0.004); }),
      mat: { base: LIQ[spec.liq].deep, rough: 0.14, metal: 0, mat: 2, liq: LIQ[spec.liq] },
      pos: [0, y, 0], scale: [lr, 1, lr],
      noShadow: true,
      liquid: { crema: spec.layered ? 0.62 : 0.30, swirl: 1.4, artReveal: 0, artOpacity: 0 }
    });

    /* ice */
    var im = studio.mesh('ice', function () { return Geo.roundedBox(1, 1, 1, 0.22, 16, 12); });
    for (var i = 0; i < spec.ice; i++) {
      var a = r() * 6.28;
      var d = lr * 0.42 * r();
      parts.push({
        mesh: im, mat: MAT.ice,
        pos: [Math.cos(a) * d, 0.10 + r() * (y - 0.18), Math.sin(a) * d],
        scale: lr * (0.42 + r() * 0.16),
        rx: r() * 3, ry: r() * 3, rz: r() * 3, noShadow: true
      });
    }

    parts.push({ mesh: mesh, mat: MAT.glass, pos: [0, 0, 0], noShadow: true });

    if (spec.straw) {
      parts.push({
        mesh: studio.mesh('straw', function () { return Geo.cylinder(1, 1, 20, true); }),
        mat: MAT.straw,
        pos: [o.rim * 0.34, o.h * 0.62, -o.rim * 0.14],
        scale: [0.022, o.h * 0.82, 0.022], rz: 0.24, noShadow: true
      });
    }

    st.shadowExtent = 0.9;
    studio.frame(st, o.h, o.rim * 2.2, { fill: 0.52, pitch: 0.20, yaw: 0.42, aim: 0.48, fov: 0.44 });
  }

  function buildBag(studio, spec, parts, st, r, name) {
    var o = { w: 0.60, d: 0.30, h: 0.86 };
    parts.push({
      mesh: studio.mesh('pouch', function () { return pouch(o); }),
      mat: MAT.film, pos: [0, 0, 0], ry: -0.30
    });

    /* the printed panel, sitting just proud of the front face and
       curved with it, so the print bends where the pouch bends */
    var lm = studio.mesh('label', function () {
      return Geo.parametric(function (u, v, out) {
        var x = (u - 0.5);
        var y = 0.20 + v * 0.46;
        /* Follow the pouch's own surface, swell included, or the
           print sinks into the bag at the foot and the gusset
           comes through the middle of it. The panel is kept
           narrow and the wrap gentle so the whole name stays on
           the side facing the lens. */
        var depth = 1 - Math.pow(Math.max(0, y - 0.55) / 0.45, 1.7) * 0.62;
        var swell = 1
          - Math.pow(Math.max(0, y - 0.62) / 0.38, 2.0) * 0.30
          - Math.pow(Math.max(0, 0.20 - y) / 0.20, 1.8) * 0.22;
        out[0] = x * o.w * 0.62 * swell;
        out[1] = y * o.h;
        out[2] = (o.d * 0.5 * depth * swell) * Math.pow(Math.max(0.001, Math.cos(x * 1.25)), 0.6) + 0.012;
      }, 30, 30, false);
    });
    parts.push({
      mesh: lm,
      mat: { base: MAT.label.base, rough: MAT.label.rough, metal: 0, mat: 9 },
      pos: [0, 0, 0], ry: -0.30, noShadow: true,
      decal: studio.texture('lab:' + name, function () {
        return labelCanvas(name, spec.label, spec.roast);
      })
    });

    /* the roast band, wrapped round the pouch */
    parts.push({
      mesh: studio.mesh('band', function () {
        return Geo.parametric(function (u, v, out) {
          var a = ang(u);
          var ca = Math.cos(a), sa = Math.sin(a);
          var e = 2.6;
          var sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
          var sz = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
          out[0] = sx * o.w * 0.5 * 1.004;
          out[1] = 0.735 + v * 0.050;
          out[2] = sz * o.d * 0.5 * 0.80 * 1.004;
        }, 64, 3, true);
      }),
      mat: { base: hex2lin(spec.roast), rough: 0.44, metal: 0, mat: 0 },
      pos: [0, 0, 0], ry: -0.30, noShadow: true
    });

    /* beans spilled at the foot */
    var bm = studio.mesh('bean', function () { return Geo.bean(30, 20); });
    for (var i = 0; i < 9; i++) {
      var a2 = r() * 6.28;
      var d2 = 0.34 + r() * 0.30;
      parts.push({
        mesh: bm, mat: MAT.bean,
        pos: [Math.cos(a2) * d2, 0.014, Math.sin(a2) * d2 * 0.7],
        scale: 0.030, ry: r() * 3, rz: 1.4 + r() * 0.4
      });
    }

    st.shadowExtent = 0.9;
    st.env.ambient = [1.35, 1.35, 1.35];
    st.sun.color = [2.9, 2.35, 1.80];
    studio.frame(st, o.h, o.w * 1.6, { fill: 0.56, pitch: 0.18, yaw: 0.30, aim: 0.50, fov: 0.46 });
  }

  function buildPastry(studio, spec, parts, st, r) {
    var mat = MAT[spec.mat] || MAT.crust;
    var mesh, h, w;

    if (spec.form === 'croissant') {
      mesh = studio.mesh('croissant', function () { return croissant({ tube: 0.205, lobes: 7 }); });
      h = 0.26; w = 0.80;
      parts.push({ mesh: mesh, mat: mat, pos: [0, 0.02, 0], scale: 0.50, ry: 0.42 });
    } else if (spec.form === 'batard') {
      mesh = studio.mesh('batard', function () { return batard({ len: 0.92, w: 0.40, h: 0.30 }); });
      h = 0.30; w = 0.92;
      parts.push({ mesh: mesh, mat: mat, pos: [0, 0, 0], scale: 0.62, ry: 0.34 });
    } else if (spec.form === 'muffin') {
      var mo = { baseR: 0.24, caseR: 0.32, caseH: 0.34, crownR: 0.42, crownH: 0.30 };
      h = 0.52; w = 0.72;
      parts.push({
        mesh: studio.mesh('case', function () { return muffinCase(mo); }),
        mat: MAT.paper, pos: [0, 0, 0], scale: 0.86
      });
      parts.push({
        mesh: studio.mesh('crown', function () { return muffinCrown(mo); }),
        mat: mat, pos: [0, 0, 0], scale: 0.86, ry: 0.4
      });
    } else if (spec.form === 'loaf') {
      mesh = studio.mesh('loaf', function () { return loafSlice({ w: 0.62, h: 0.50, d: 0.26 }); });
      h = 0.55; w = 0.66;
      parts.push({ mesh: mesh, mat: mat, pos: [0, 0, 0], scale: 0.86, ry: 0.22 });
    } else if (spec.form === 'roll') {
      mesh = studio.mesh('roll', function () { return spiralRoll({ r0: 0.055, r1: 0.36, tube: 0.115 }); });
      h = 0.26; w = 0.86;
      parts.push({ mesh: mesh, mat: mat, pos: [0, 0, 0], scale: 0.72, ry: 0.3 });
      if (spec.icing) {
        /* icing is a second, slightly larger spiral sitting on top
           of the first and only over the upper half of the tube */
        parts.push({
          mesh: studio.mesh('icing', function () {
            return spiralRoll({ r0: 0.055, r1: 0.36, tube: 0.052 });
          }),
          mat: MAT.icing, pos: [0, 0.088, 0], scale: [0.72, 0.42, 0.72], ry: 0.3, noShadow: true
        });
      }
    } else {
      mesh = studio.mesh('cookie', function () { return cookie({ r: 0.44, h: 0.10 }); });
      h = 0.22; w = 0.88;
      parts.push({ mesh: mesh, mat: mat, pos: [0, 0, 0], scale: 0.86, ry: 0.5 });
    }

    /* garnish */
    var i, a, d;
    if (spec.chips) {
      var cm = studio.mesh('chip', function () { return Geo.roundedBox(1, 1, 1, 0.30, 12, 8); });
      for (i = 0; i < 9; i++) {
        a = r() * 6.28; d = w * 0.20 * Math.sqrt(r());
        parts.push({
          mesh: cm, mat: MAT.choc,
          pos: [Math.cos(a) * d, h * (spec.form === 'cookie' ? 0.42 : 0.86) + r() * 0.02, Math.sin(a) * d],
          scale: 0.035 + r() * 0.016, rx: r() * 3, ry: r() * 3, noShadow: true
        });
      }
    }
    if (spec.berry) {
      var sm = studio.mesh('berry', function () { return Geo.sphere(1, 20, 14); });
      for (i = 0; i < 8; i++) {
        a = r() * 6.28; d = w * 0.17 * Math.sqrt(r());
        parts.push({
          mesh: sm, mat: MAT.berry,
          pos: [Math.cos(a) * d, h * 0.88 + r() * 0.01, Math.sin(a) * d],
          scale: 0.030 + r() * 0.008, noShadow: true
        });
      }
    }
    if (spec.almond) {
      var am = studio.mesh('flake', function () { return Geo.roundedBox(1, 0.16, 0.6, 0.4, 12, 8); });
      for (i = 0; i < 20; i++) {
        a = r() * 6.28; d = w * 0.26 * Math.sqrt(r());
        parts.push({
          mesh: am, mat: MAT.almond,
          pos: [Math.cos(a) * d, h * 0.72 + r() * 0.04, Math.sin(a) * d * 0.55],
          scale: 0.052 + r() * 0.016, rx: r() * 0.4, ry: r() * 3, noShadow: true
        });
      }
    }

    st.shadowExtent = w * 0.9;
    studio.frame(st, h, w, { fill: 0.62, pitch: 0.40, yaw: 0.38, aim: 0.50, fov: 0.46 });
  }

  PEET.Products = {
    MAT: MAT, LIQ: LIQ, MENU: MENU,
    vessel: vessel, vesselProfile: vesselProfile, tumbler: tumbler,
    pouch: pouch, croissant: croissant, batard: batard,
    muffinCase: muffinCase, muffinCrown: muffinCrown, loafSlice: loafSlice, spiralRoll: spiralRoll, cookie: cookie,
    build: build, has: function (n) { return !!MENU[n]; }
  };

})(window);
