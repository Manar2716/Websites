/* ═══════════════════════════════════════════════════════════════════
   aircraft.js — the fleet, as parameters rather than pictures.

   There is not a single image file in this project. Every aircraft on
   the page is generated from a parameter set: fuselage length, span,
   sweep, chord distribution, nacelle stations. Two consequences, and
   both of them are the point:

   1. Because all four types share one topology — same control points,
      same order — you can linearly interpolate between two parameter
      sets and regenerate the path. That is a true morph, not a
      cross-fade. An A220 grows into an A380 through shapes that are
      themselves plausible aircraft.

   2. Because the geometry is authored in metres and drawn into one
      shared viewBox, the fleet comparison is literally to scale. The
      A380 is not "drawn bigger", it is 79.75 m across next to an
      A220's 35.10 m.

   Dimensions are published figures for each type, rounded. The drawing
   is an original schematic: generic swept-wing transport geometry, not
   a trace of any manufacturer artwork.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var U = global.AX.U;

  function n(v) { return Math.round(v * 100) / 100; }
  var PI180 = Math.PI / 180;

  /* ───────────────────────── the parameter sets ─────────────────────────
     Every field must exist on every type and be a number, or the morph
     silently drops it. Order is irrelevant; presence is not. */

  var TYPES = [
    {
      id: 'a220', name: 'A220-300', role: 'Regional / short-haul',
      hue: '#3494DC',
      tagline: 'The small one that behaves like a big one.',
      blurb: 'A clean-sheet narrowbody sized for routes that never justified a full single-aisle. Fly-by-wire, a five-abreast cabin with a genuinely wide middle seat, and a wing that is far more efficient than its size suggests.',
      specs: {
        length: 38.71, span: 35.10, height: 11.50,
        mtow: 70900, range_km: 6390, range_nm: 3450,
        seats: 145, seatsMax: 160, mach: 0.78, ceiling: 41000,
        engines: 2, thrust: 103, fuel: 21805
      },
      g: {
        len: 38.71, span: 35.10, fuseW: 3.70,
        noseF: 0.115, tailStart: 0.745, tailTipW: 0.13, tailLift: 0.9,
        wingX: 0.405, rootChord: 5.90, kinkFrac: 0.36, kinkChord: 3.60, tipChord: 1.42,
        sweep: 26.0, rake: 0.55,
        htSpan: 11.60, htX: 0.885, htRoot: 3.30, htTip: 1.20, htSweep: 30,
        finRoot: 5.60, finX: 0.775, finW: 0.42,
        eng: [
          { y: 0.345, dia: 2.05, len: 4.10, on: 1 },
          { y: 0.560, dia: 1.90, len: 3.70, on: 0 }
        ],
        decks: 1, windowRows: 1, doors: 4
      }
    },
    {
      id: 'a321', name: 'A321neo', role: 'Single-aisle / transcontinental',
      hue: '#C87524',
      tagline: 'A short-haul airframe that kept going.',
      blurb: 'The stretch that turned a continental workhorse into a thin long-haul tool. New-generation engines, sharklets and centre tanks push it across oceans that used to require twice the aeroplane.',
      specs: {
        length: 44.51, span: 35.80, height: 11.76,
        mtow: 97000, range_km: 7400, range_nm: 4000,
        seats: 200, seatsMax: 244, mach: 0.78, ceiling: 39800,
        engines: 2, thrust: 147, fuel: 32940
      },
      g: {
        len: 44.51, span: 35.80, fuseW: 3.95,
        noseF: 0.100, tailStart: 0.760, tailTipW: 0.12, tailLift: 0.95,
        wingX: 0.385, rootChord: 6.80, kinkFrac: 0.35, kinkChord: 3.95, tipChord: 1.50,
        sweep: 27.0, rake: 0.45,
        htSpan: 12.45, htX: 0.888, htRoot: 3.70, htTip: 1.25, htSweep: 31,
        finRoot: 6.20, finX: 0.780, finW: 0.45,
        eng: [
          { y: 0.340, dia: 2.30, len: 4.60, on: 1 },
          { y: 0.560, dia: 2.05, len: 4.00, on: 0 }
        ],
        decks: 1, windowRows: 1, doors: 4
      }
    },
    {
      id: 'a350', name: 'A350-1000', role: 'Widebody / long-haul',
      hue: '#17AD7E',
      tagline: 'Composite airframe, continental range.',
      blurb: 'A carbon-fibre fuselage and a wing whose trailing edge changes shape in flight, adapting its camber to weight and speed as fuel burns off. The efficiency case that made ultra-long thin routes work.',
      specs: {
        length: 73.79, span: 64.75, height: 17.08,
        mtow: 319000, range_km: 16100, range_nm: 8700,
        seats: 370, seatsMax: 410, mach: 0.85, ceiling: 43100,
        engines: 2, thrust: 431, fuel: 166488
      },
      g: {
        len: 73.79, span: 64.75, fuseW: 5.96,
        noseF: 0.088, tailStart: 0.755, tailTipW: 0.11, tailLift: 1.0,
        wingX: 0.360, rootChord: 12.40, kinkFrac: 0.34, kinkChord: 6.40, tipChord: 2.05,
        sweep: 31.9, rake: 0.20,
        htSpan: 20.50, htX: 0.895, htRoot: 6.10, htTip: 1.90, htSweep: 34,
        finRoot: 9.80, finX: 0.760, finW: 0.62,
        eng: [
          { y: 0.315, dia: 3.35, len: 7.10, on: 1 },
          { y: 0.545, dia: 2.90, len: 6.20, on: 0 }
        ],
        decks: 1, windowRows: 1, doors: 5
      }
    },
    {
      id: 'a380', name: 'A380-800', role: 'Widebody / full double deck',
      hue: '#9A6BE0',
      tagline: 'The largest passenger aircraft ever flown.',
      blurb: 'Two full-length decks, four engines and a wing built to a span limit rather than a drag optimum. An airframe designed around the assumption that the busiest routes would only ever get busier.',
      specs: {
        length: 72.72, span: 79.75, height: 24.09,
        mtow: 575000, range_km: 14800, range_nm: 8000,
        seats: 525, seatsMax: 853, mach: 0.85, ceiling: 43000,
        engines: 4, thrust: 4 * 311 / 4 * 4 / 4, /* placeholder, overwritten below */
        fuel: 320000
      },
      g: {
        len: 72.72, span: 79.75, fuseW: 7.14,
        noseF: 0.078, tailStart: 0.770, tailTipW: 0.14, tailLift: 0.85,
        wingX: 0.330, rootChord: 17.70, kinkFrac: 0.33, kinkChord: 8.10, tipChord: 2.70,
        sweep: 33.5, rake: 0.12,
        htSpan: 30.40, htX: 0.900, htRoot: 8.40, htTip: 2.60, htSweep: 35,
        finRoot: 12.60, finX: 0.745, finW: 0.80,
        eng: [
          { y: 0.260, dia: 3.30, len: 7.30, on: 1 },
          { y: 0.455, dia: 3.30, len: 7.30, on: 1 }
        ],
        decks: 2, windowRows: 2, doors: 5
      }
    }
  ];
  TYPES[3].specs.thrust = 4 * 311; /* 4 × ~311 kN */

  var BY_ID = {};
  for (var t = 0; t < TYPES.length; t++) BY_ID[TYPES[t].id] = TYPES[t];

  /* ───────────────────────── parameter morphing ───────────────────────── */

  function lerpG(a, b, k) {
    var out = {}, key;
    for (key in a) {
      if (key === 'eng') continue;
      out[key] = U.lerp(a[key], b[key], k);
    }
    out.eng = [];
    for (var i = 0; i < a.eng.length; i++) {
      out.eng.push({
        y: U.lerp(a.eng[i].y, b.eng[i].y, k),
        dia: U.lerp(a.eng[i].dia, b.eng[i].dia, k),
        len: U.lerp(a.eng[i].len, b.eng[i].len, k),
        /* the outer nacelle does not pop — it scales away */
        on: U.lerp(a.eng[i].on, b.eng[i].on, k)
      });
    }
    return out;
  }

  function lerpSpecs(a, b, k) {
    var out = {}, key;
    for (key in a) out[key] = U.lerp(a[key], b[key], k);
    return out;
  }

  /* ──────────────────────────── plan view ────────────────────────────
     Origin at the nose, +x aft, +y starboard. Everything in metres. */

  function chordAt(g, y) {
    var hw = g.fuseW / 2;
    var b = g.span / 2;
    var yk = U.lerp(hw, b, g.kinkFrac);
    if (y <= yk) return U.lerp(g.rootChord, g.kinkChord, U.norm(y, hw, yk));
    return U.lerp(g.kinkChord, g.tipChord, U.norm(y, yk, b));
  }

  function leAt(g, y) {
    var hw = g.fuseW / 2;
    var b = g.span / 2;
    var base = g.wingX * g.len + (y - hw) * Math.tan(g.sweep * PI180);
    /* raked tip: the outboard 12% of span picks up extra sweep, which
       is what gives modern wings their scythe-like tip */
    var rk = U.norm(y, b * 0.88, b);
    return base + rk * rk * g.rake * b * 0.16;
  }

  function wingPath(g, side) {
    var hw = g.fuseW / 2;
    var b = g.span / 2;
    var s = side;
    var steps = 16;
    var d = '', i, y;

    /* leading edge, root -> tip */
    for (i = 0; i <= steps; i++) {
      y = U.lerp(hw * 0.92, b, i / steps);
      d += (i ? 'L' : 'M') + n(leAt(g, y)) + ' ' + n(y * s) + ' ';
    }
    /* trailing edge, tip -> root */
    for (i = steps; i >= 0; i--) {
      y = U.lerp(hw * 0.92, b, i / steps);
      d += 'L' + n(leAt(g, y) + chordAt(g, y)) + ' ' + n(y * s) + ' ';
    }
    return d + 'Z';
  }

  function htailPath(g, side) {
    var hw = g.fuseW / 2 * 0.55;
    var b = g.htSpan / 2;
    var x0 = g.htX * g.len;
    var steps = 8, d = '', i, y, le, ch;
    for (i = 0; i <= steps; i++) {
      y = U.lerp(hw, b, i / steps);
      le = x0 + (y - hw) * Math.tan(g.htSweep * PI180);
      d += (i ? 'L' : 'M') + n(le) + ' ' + n(y * side) + ' ';
    }
    for (i = steps; i >= 0; i--) {
      y = U.lerp(hw, b, i / steps);
      le = x0 + (y - hw) * Math.tan(g.htSweep * PI180);
      ch = U.lerp(g.htRoot, g.htTip, i / steps);
      d += 'L' + n(le + ch) + ' ' + n(y * side) + ' ';
    }
    return d + 'Z';
  }

  function fusePath(g) {
    var hw = g.fuseW / 2;
    var L = g.len;
    var nose = g.noseF * L;
    var ts = g.tailStart * L;
    var tw = hw * g.tailTipW;
    /* upper half nose->tail, then mirrored back along the bottom */
    return 'M0 0 ' +
      'C' + n(nose * 0.30) + ' ' + n(-hw * 0.62) + ' ' + n(nose * 0.70) + ' ' + n(-hw) + ' ' + n(nose) + ' ' + n(-hw) + ' ' +
      'L' + n(ts) + ' ' + n(-hw) + ' ' +
      'C' + n(ts + (L - ts) * 0.45) + ' ' + n(-hw * 0.94) + ' ' + n(L - (L - ts) * 0.18) + ' ' + n(-tw * 1.8) + ' ' + n(L) + ' ' + n(-tw) + ' ' +
      'L' + n(L) + ' ' + n(tw) + ' ' +
      'C' + n(L - (L - ts) * 0.18) + ' ' + n(tw * 1.8) + ' ' + n(ts + (L - ts) * 0.45) + ' ' + n(hw * 0.94) + ' ' + n(ts) + ' ' + n(hw) + ' ' +
      'L' + n(nose) + ' ' + n(hw) + ' ' +
      'C' + n(nose * 0.70) + ' ' + n(hw) + ' ' + n(nose * 0.30) + ' ' + n(hw * 0.62) + ' 0 0 Z';
  }

  /* the fin, seen from above: a narrow blade on the centreline */
  function finPath(g) {
    var x0 = g.finX * g.len;
    var w = g.finW / 2;
    return 'M' + n(x0) + ' ' + n(-w) + ' L' + n(x0 + g.finRoot) + ' ' + n(-w * 0.35) +
      ' L' + n(x0 + g.finRoot) + ' ' + n(w * 0.35) + ' L' + n(x0) + ' ' + n(w) + ' Z';
  }

  function nacellePaths(g) {
    var out = [];
    var b = g.span / 2;
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 0; i < g.eng.length; i++) {
        var e = g.eng[i];
        if (e.on < 0.02) { out.push(null); continue; }
        var y = e.y * b;
        var le = leAt(g, y);
        var dia = e.dia * e.on;
        var x0 = le - e.len * 0.62;
        var x1 = le + e.len * 0.38;
        var r = dia / 2;
        out.push({
          d: 'M' + n(x0 + r * 0.5) + ' ' + n((y - r) * side) +
             ' L' + n(x1 - r * 0.35) + ' ' + n((y - r) * side) +
             ' Q' + n(x1) + ' ' + n((y - r) * side) + ' ' + n(x1) + ' ' + n(y * side) +
             ' Q' + n(x1) + ' ' + n((y + r) * side) + ' ' + n(x1 - r * 0.35) + ' ' + n((y + r) * side) +
             ' L' + n(x0 + r * 0.5) + ' ' + n((y + r) * side) +
             ' Q' + n(x0) + ' ' + n((y + r) * side) + ' ' + n(x0) + ' ' + n(y * side) +
             ' Q' + n(x0) + ' ' + n((y - r) * side) + ' ' + n(x0 + r * 0.5) + ' ' + n((y - r) * side) + ' Z',
          o: e.on
        });
      }
    }
    return out;
  }

  /* the cabin windows, as one dashed line per deck */
  function windowLine(g, deck) {
    var L = g.len;
    var x0 = g.noseF * L * 1.55;
    var x1 = g.tailStart * L + (L - g.tailStart * L) * 0.35;
    var off = g.decks > 1.5 ? (deck === 0 ? -g.fuseW * 0.17 : g.fuseW * 0.17) : 0;
    return 'M' + n(x0) + ' ' + n(off) + ' L' + n(x1) + ' ' + n(off);
  }

  function plan(g) {
    return {
      fuse: fusePath(g),
      wingL: wingPath(g, -1),
      wingR: wingPath(g, 1),
      htL: htailPath(g, -1),
      htR: htailPath(g, 1),
      fin: finPath(g),
      nacelles: nacellePaths(g),
      win0: windowLine(g, 0),
      win1: windowLine(g, 1),
      decks: g.decks,
      len: g.len,
      span: g.span
    };
  }

  /* ──────────────────────────── side profile ────────────────────────────
     Used for the hero. Origin at the nose, +x aft, +y DOWN (screen
     convention), so the cabin floor is around y = 0 and the belly is
     positive. Drawn as a stack: far wing, fuselage, near wing, tail. */

  function profile(g) {
    var L = g.len;
    var h = g.fuseW;          /* side view height ≈ fuselage diameter */
    var r = h / 2;
    var nose = g.noseF * L;
    var ts = g.tailStart * L;
    var lift = g.tailLift;

    /* fuselage: flat-ish crown, curved nose, upswept tail cone */
    var fuse =
      'M' + n(nose * 0.06) + ' ' + n(r * 0.30) + ' ' +
      'C' + n(nose * 0.22) + ' ' + n(-r * 0.55) + ' ' + n(nose * 0.62) + ' ' + n(-r) + ' ' + n(nose) + ' ' + n(-r) + ' ' +
      'L' + n(ts) + ' ' + n(-r) + ' ' +
      'C' + n(ts + (L - ts) * 0.42) + ' ' + n(-r * 0.96) + ' ' + n(L - (L - ts) * 0.22) + ' ' + n(-r * 0.72 - r * lift * 0.30) + ' ' + n(L) + ' ' + n(-r * 0.30 - r * lift * 0.42) + ' ' +
      'L' + n(L - (L - ts) * 0.06) + ' ' + n(-r * 0.02 - r * lift * 0.30) + ' ' +
      'C' + n(L - (L - ts) * 0.40) + ' ' + n(r * 0.62) + ' ' + n(ts + (L - ts) * 0.20) + ' ' + n(r) + ' ' + n(ts * 0.96) + ' ' + n(r) + ' ' +
      'L' + n(nose * 1.05) + ' ' + n(r) + ' ' +
      'C' + n(nose * 0.55) + ' ' + n(r) + ' ' + n(nose * 0.20) + ' ' + n(r * 0.86) + ' ' + n(nose * 0.06) + ' ' + n(r * 0.30) + ' Z';

    /* the fin, in elevation: swept blade with a small fillet */
    var fx = g.finX * L;
    var fin =
      'M' + n(fx) + ' ' + n(-r * 0.92) + ' ' +
      'C' + n(fx + g.finRoot * 0.30) + ' ' + n(-r - g.finRoot * 0.42) + ' ' + n(fx + g.finRoot * 0.58) + ' ' + n(-r - g.finRoot * 0.90) + ' ' + n(fx + g.finRoot * 0.86) + ' ' + n(-r - g.finRoot * 1.06) + ' ' +
      'L' + n(fx + g.finRoot * 1.16) + ' ' + n(-r - g.finRoot * 1.02) + ' ' +
      'L' + n(fx + g.finRoot * 1.30) + ' ' + n(-r * 0.92) + ' Z';

    /* horizontal stabiliser, foreshortened */
    var hx = g.htX * L;
    var ht =
      'M' + n(hx) + ' ' + n(-r * 0.34 - r * lift * 0.24) + ' ' +
      'L' + n(hx + g.htRoot * 1.30) + ' ' + n(-r * 0.62 - r * lift * 0.34) + ' ' +
      'L' + n(hx + g.htRoot * 1.42) + ' ' + n(-r * 0.50 - r * lift * 0.34) + ' ' +
      'L' + n(hx + g.htRoot * 0.66) + ' ' + n(-r * 0.20 - r * lift * 0.22) + ' Z';

    /* wings in elevation are mostly edge-on: a slim swept sliver.
       The near one runs down-and-aft, the far one up-and-aft. */
    function wingSliver(dir) {
      var x0 = g.wingX * L;
      var b = g.span / 2;
      var reach = b * 0.52;                       /* foreshortening */
      var drop = dir * b * 0.062;
      var tipX = x0 + reach * Math.tan(g.sweep * PI180) + g.rootChord * 0.30;
      return 'M' + n(x0) + ' ' + n(r * 0.34 * dir) + ' ' +
        'L' + n(tipX) + ' ' + n(drop + r * 0.34 * dir) + ' ' +
        'L' + n(tipX + g.tipChord * 1.15) + ' ' + n(drop + r * 0.46 * dir) + ' ' +
        'L' + n(x0 + g.rootChord) + ' ' + n(r * 0.62 * dir) + ' Z';
    }

    /* nacelle in elevation, slung below and ahead of the wing */
    function nac(i, dir) {
      var e = g.eng[i];
      if (e.on < 0.02) return null;
      var b = g.span / 2;
      var frac = e.y / 0.34;
      var x0 = g.wingX * L + b * 0.52 * frac * 0.42 * Math.tan(g.sweep * PI180) - e.len * 0.30;
      var y0 = r * 0.52 + dir * b * 0.055 * frac + e.dia * 0.22;
      var w = e.len * e.on, hh = e.dia * 0.5 * e.on;
      return {
        d: 'M' + n(x0) + ' ' + n(y0 - hh) + ' L' + n(x0 + w * 0.80) + ' ' + n(y0 - hh * 0.86) +
           ' Q' + n(x0 + w) + ' ' + n(y0 - hh * 0.5) + ' ' + n(x0 + w) + ' ' + n(y0 + hh * 0.30) +
           ' L' + n(x0 + w * 0.16) + ' ' + n(y0 + hh) +
           ' Q' + n(x0 - hh * 0.28) + ' ' + n(y0 + hh * 0.6) + ' ' + n(x0) + ' ' + n(y0 - hh) + ' Z',
        /* the pylon that carries it */
        pylon: 'M' + n(x0 + w * 0.52) + ' ' + n(y0 - hh) + ' L' + n(x0 + w * 0.74) + ' ' + n(r * 0.40 + dir * b * 0.05 * frac) +
               ' L' + n(x0 + w * 1.00) + ' ' + n(r * 0.40 + dir * b * 0.05 * frac) + ' L' + n(x0 + w * 0.86) + ' ' + n(y0 - hh * 0.72) + ' Z',
        o: e.on
      };
    }

    var win = [];
    var wx0 = nose * 1.5, wx1 = ts + (L - ts) * 0.30;
    var rows = Math.round(g.decks);
    for (var d = 0; d < rows; d++) {
      var yy = rows > 1 ? (d === 0 ? -r * 0.42 : r * 0.18) : -r * 0.18;
      win.push('M' + n(wx0) + ' ' + n(yy) + ' L' + n(wx1) + ' ' + n(yy));
    }

    return {
      fuse: fuse, fin: fin, ht: ht,
      wingFar: wingSliver(-1), wingNear: wingSliver(1),
      nacFar: nac(0, -1), nacNear: nac(0, 1),
      nacFar2: nac(1, -1), nacNear2: nac(1, 1),
      windows: win,
      /* the flight-deck glazing — small, but it is what makes the nose
         read as a nose rather than a cone */
      cockpit: 'M' + n(nose * 0.30) + ' ' + n(-r * 0.52) + ' L' + n(nose * 0.86) + ' ' + n(-r * 0.72) +
               ' L' + n(nose * 0.92) + ' ' + n(-r * 0.44) + ' L' + n(nose * 0.42) + ' ' + n(-r * 0.24) + ' Z',
      len: L, height: h
    };
  }

  global.AX.fleet = {
    TYPES: TYPES,
    byId: function (id) { return BY_ID[id]; },
    lerpG: lerpG,
    lerpSpecs: lerpSpecs,
    plan: plan,
    profile: profile
  };

})(window);
