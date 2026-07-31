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
    glass:     { base: [0.86, 0.89, 0.91],    rough: 0.03, metal: 0, mat: 7, alpha: 1 },
    ice:       { base: [0.88, 0.93, 0.97],    rough: 0.05, metal: 0, mat: 7, alpha: 1 },
    steel:     { base: [0.855, 0.865, 0.875], rough: 0.26, metal: 1, mat: 3 },
    bean:      { base: [0.150, 0.062, 0.030], rough: 0.42, metal: 0, mat: 6, detail: 1 },
    wood:      { base: [0.105, 0.055, 0.028], rough: 0.44, metal: 0, mat: 5 },
    film:      { base: [0.022, 0.019, 0.018], rough: 0.38, metal: 0, mat: 0 },
    label:     { base: [0.86, 0.82, 0.74],    rough: 0.62, metal: 0, mat: 9 },
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
      var a = u * TAU;
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
      if (v > 0.955) {
        var k = (v - 0.955) / 0.045;
        depth *= 1 - k * 0.86;
        swell *= 1 - k * 0.05;
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
      var spanA = Math.PI * 1.16;
      var ang = -spanA / 2 + spanA * v;

      /* the centre line of the crescent */
      var cx = Math.sin(ang) * R;
      var cz = -Math.cos(ang) * R * 0.44;

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
      var tx = Math.cos(ang), tz = Math.sin(ang) * 0.44;
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

  /* a muffin: fluted paper case, and a crown that overhangs it */
  function muffin(o) {
    return Geo.parametric(function (u, v, out) {
      var a = u * TAU;
      var r, y;
      if (v < 0.52) {
        /* the case */
        var t = v / 0.52;
        r = o.baseR + (o.caseR - o.baseR) * t;
        y = t * o.caseH;
        r *= 1 + Math.sin(a * 16) * 0.028;          /* flutes */
      } else {
        /* the crown: a dome that starts wider than the case */
        var s = (v - 0.52) / 0.48;
        var dome = Math.cos(s * Math.PI * 0.5);
        r = o.crownR * Math.pow(dome, 0.44);
        y = o.caseH + Math.sin(s * Math.PI * 0.5) * o.crownH;
        /* lumps: a risen crown is never a clean dome */
        r *= 1 + Math.sin(a * 3.2 + s * 5.0) * 0.055 * (1 - s * 0.6);
        y += Math.sin(a * 2.6 + 1.1) * o.crownH * 0.045 * (1 - s);
      }
      out[0] = Math.cos(a) * r;
      out[1] = y;
      out[2] = Math.sin(a) * r;
    }, 72, 56, true);
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
      /* the top is domed and split, the sides are straight */
      var dome = Math.max(0, sy);
      var split = Math.exp(-Math.pow(sx * 2.4, 2));
      out[0] = sx * o.w * 0.5;
      out[1] = sy * o.h * 0.5 * (1 + dome * 0.34) + o.h * 0.5 - dome * split * o.h * 0.11;
      out[2] = t * o.d * 0.5 * thick;
    }, 56, 26, true);
  }

  /* a cinnamon roll: a tube swept along an Archimedean spiral,
     which is what a rolled bun actually is */
  function spiralRoll(o) {
    var turns = 2.35;
    return Geo.parametric(function (u, v, out) {
      var ang = v * TAU * turns;
      var rad = o.r0 + (o.r1 - o.r0) * v;
      var a = u * TAU;
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
      var a = u * TAU;
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

  PEET.Products = {
    MAT: MAT, LIQ: LIQ,
    vessel: vessel, vesselProfile: vesselProfile, tumbler: tumbler,
    pouch: pouch, croissant: croissant, batard: batard,
    muffin: muffin, loafSlice: loafSlice, spiralRoll: spiralRoll, cookie: cookie
  };

})(window);
