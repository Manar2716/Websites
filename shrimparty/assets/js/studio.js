/* ═══════════════════════════════════════════════════════════
   studio.js — the signature dishes, on a turntable.

   A second, smaller Stage on its own canvas. Seven dishes, one on
   screen at a time; scroll walks between them and the pointer
   pushes the camera around.

   ── why a second live context rather than baked frames ──────

   The obvious cheap approach is to render a turntable of each
   dish once at boot and scrub the frames. It costs nothing per
   frame and it is what the sibling project in this repository
   does for its product shots. It is wrong here, for two reasons:
   the brief for this section is *interactive* camera movement,
   which pre-baked frames cannot give you off the turntable axis;
   and seven dishes at twenty-four frames each is a two-second
   stall at boot on a phone, spent before the visitor has scrolled
   past the film.

   The cost of the live context is managed rather than paid: this
   stage and the film stage are never drawing in the same frame.
   Each culls itself when its own section is off screen, and the
   two sections cannot both be on screen because there is a whole
   menu between them. The GPU only ever has one of these running.

   ── the transition between dishes ───────────────────────────

   Dishes do not cross-fade. The outgoing dish sinks and dissolves
   from its noise threshold while the incoming one rises through
   the same threshold in reverse — so for about a fifth of a
   second both exist, half-eaten by the same noise field, and the
   change reads as one dish becoming another rather than as a cut.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  var M = SHRIMP.M, Geo = SHRIMP.Geo;
  var v3 = M.v3, quat = M.quat;
  var sat = M.sat, lerp = M.lerp, smoothstep = M.smoothstep, damp = M.damp;
  var TAU = M.TAU;

  /* Kept in step with film.js by hand — the two scenes share the
     lighting rule and have to share the palette, or a dish looks
     like a different dish on its own page. */
  var SUN  = [1.00, 0.815, 0.590];
  var BOIL = [1.00, 0.36, 0.055];
  /* Same haze and same water as the film, so a dish shot on its
     own page is standing in the same weather as the pail. What
     differs is `skyDim` below: the light is identical, the
     backdrop is flagged down so a plate has something dark to sit
     against and the white page chrome stays readable. */
  var HAZE = [0.700, 0.790, 0.880];
  var DEEP = [0.013, 0.072, 0.108];

  var A = {
    shrimp:  [0.99, 0.26, 0.115],
    crab:    [1.00, 0.34, 0.170],
    claw:    [0.94, 0.145, 0.085],
    mussel:  [0.078, 0.082, 0.118],
    corn:    [1.00, 0.72, 0.075],
    lemon:   [0.98, 0.855, 0.205],
    garlic:  [0.96, 0.92, 0.815],
    potato:  [0.83, 0.585, 0.265],
    herb:    [0.082, 0.228, 0.076],
    sausage: [0.60, 0.135, 0.075],
    salmon:  [1.00, 0.40, 0.225],
    pasta:   [1.00, 0.735, 0.415],
    cream:   [0.99, 0.91, 0.685],
    stock:   [0.615, 0.150, 0.042],
    steel:   [0.340, 0.385, 0.460],
    stone:   [0.205, 0.195, 0.190],
    clay:    [0.52, 0.21, 0.115]
  };

  /* Per-piece colour variation, same rule as film.js: a value and
     a chroma jitter around the base, fixed at build time. */
  function vary(base, rnd) {
    var v = 0.68 + rnd() * 0.40;
    var c = 0.80 + rnd() * 0.42;
    var l = (base[0] + base[1] + base[2]) / 3;
    return [
      M.clamp((l + (base[0] - l) * c) * v, 0, 1),
      M.clamp((l + (base[1] - l) * c) * v, 0, 1),
      M.clamp((l + (base[2] - l) * c) * v, 0, 1)
    ];
  }

  /* ── the seven ───────────────────────────────────────────────
     Each dish is a vessel, a scatter recipe, and a camera. The
     scatter recipe is a list of {kind, count, ring, height,
     scale} — enough to compose a plate without spelling out two
     hundred positions by hand, and seeded so the same dish is the
     same dish on every load. */

  var DISHES = [
    {
      name: 'bucket', vessel: 'bucket', fit: 1.00, vy: -0.55, camR: 3.4, camY: 1.5, look: 0.85, steam: [0.85, 2.6, 1.0],
      scatter: [
        { kind: 'shrimp', n: 26, r0: 0.05, r1: 0.50, y0: 0.55, y1: 1.35, s: 0.17 },
        { kind: 'crab',   n: 10, r0: 0.05, r1: 0.48, y0: 0.60, y1: 1.30, s: 0.15 },
        { kind: 'mussel', n: 12, r0: 0.05, r1: 0.50, y0: 0.50, y1: 1.20, s: 0.15 },
        { kind: 'corn',   n: 5,  r0: 0.05, r1: 0.40, y0: 0.70, y1: 1.25, s: 0.16 },
        { kind: 'potato', n: 5,  r0: 0.05, r1: 0.44, y0: 0.55, y1: 1.10, s: 0.15 },
        { kind: 'sausage',n: 5,  r0: 0.05, r1: 0.42, y0: 0.65, y1: 1.15, s: 0.15 },
        { kind: 'lemon',  n: 4,  r0: 0.10, r1: 0.46, y0: 0.90, y1: 1.32, s: 0.14 },
        { kind: 'herb',   n: 6,  r0: 0.05, r1: 0.44, y0: 0.95, y1: 1.35, s: 0.16 }
      ]
    },
    {
      name: 'shrimpbucket', vessel: 'bucket', fit: 1.00, vy: -0.55, camR: 3.2, camY: 1.4, look: 0.85, steam: [0.80, 2.5, 1.0],
      scatter: [
        { kind: 'shrimp', n: 52, r0: 0.04, r1: 0.52, y0: 0.50, y1: 1.42, s: 0.175 },
        { kind: 'garlic', n: 8,  r0: 0.08, r1: 0.46, y0: 0.60, y1: 1.20, s: 0.13 },
        { kind: 'lemon',  n: 4,  r0: 0.12, r1: 0.46, y0: 0.95, y1: 1.36, s: 0.145 },
        { kind: 'herb',   n: 5,  r0: 0.06, r1: 0.44, y0: 1.00, y1: 1.38, s: 0.16 }
      ]
    },
    {
      name: 'salmon', vessel: 'plate', fit: 0.56, vy: -0.22, camR: 2.9, camY: 1.30, look: 0.16, steam: [0.65, 1.5, 0.55],
      hero: { mesh: 'salmon', tint: A.salmon, material: 'shell', scale: 0.52, y: 0.34, tilt: 0.10 },
      scatter: [
        { kind: 'lemon',  n: 3, r0: 0.85, r1: 1.25, y0: 0.24, y1: 0.30, s: 0.19 },
        { kind: 'herb',   n: 4, r0: 0.55, r1: 1.30, y0: 0.24, y1: 0.32, s: 0.14 },
        { kind: 'garlic', n: 3, r0: 0.70, r1: 1.20, y0: 0.24, y1: 0.28, s: 0.13 }
      ]
    },
    {
      name: 'thermidor', vessel: 'plate', fit: 0.56, vy: -0.22, camR: 2.8, camY: 1.36, look: 0.18, steam: [0.55, 1.4, 0.62],
      hero: { mesh: 'claw', tint: A.claw, material: 'claw', scale: 0.40, y: 0.44, tilt: 0.55 },
      pool: { r: 0.72, y: 0.30, tint: A.cream, emissive: 0.05 },
      scatter: [
        { kind: 'shrimp', n: 5, r0: 0.55, r1: 1.05, y0: 0.28, y1: 0.40, s: 0.155 },
        { kind: 'herb',   n: 4, r0: 0.70, r1: 1.25, y0: 0.26, y1: 0.32, s: 0.13 },
        { kind: 'lemon',  n: 2, r0: 0.95, r1: 1.30, y0: 0.26, y1: 0.30, s: 0.17 }
      ]
    },
    {
      name: 'pasta', vessel: 'bowl', fit: 0.76, vy: -0.42, camR: 2.9, camY: 1.42, look: 0.40, steam: [0.72, 1.9, 0.85],
      hero: { mesh: 'pasta', tint: A.pasta, material: 'veg', scale: 0.62, y: 0.68, tilt: 0 },
      scatter: [
        { kind: 'shrimp', n: 8,  r0: 0.20, r1: 0.72, y0: 0.72, y1: 0.94, s: 0.15 },
        { kind: 'mussel', n: 7,  r0: 0.25, r1: 0.80, y0: 0.68, y1: 0.90, s: 0.15 },
        { kind: 'herb',   n: 5,  r0: 0.15, r1: 0.72, y0: 0.80, y1: 0.98, s: 0.16 },
        { kind: 'garlic', n: 4,  r0: 0.20, r1: 0.66, y0: 0.70, y1: 0.86, s: 0.12 }
      ]
    },
    {
      name: 'tagine', vessel: 'tagine', fit: 0.72, vy: -0.42, camR: 3.0, camY: 1.32, look: 0.42, steam: [0.62, 2.2, 0.80],
      scatter: [
        { kind: 'shrimp', n: 16, r0: 0.10, r1: 0.85, y0: 0.50, y1: 0.68, s: 0.155 },
        { kind: 'lemon',  n: 5,  r0: 0.30, r1: 0.90, y0: 0.50, y1: 0.62, s: 0.14 },
        { kind: 'garlic', n: 6,  r0: 0.20, r1: 0.80, y0: 0.50, y1: 0.60, s: 0.12 },
        { kind: 'herb',   n: 6,  r0: 0.15, r1: 0.88, y0: 0.54, y1: 0.70, s: 0.16 }
      ]
    },
    {
      name: 'soup', vessel: 'bowl', fit: 0.76, vy: -0.42, camR: 2.8, camY: 1.46, look: 0.42, steam: [0.80, 2.1, 1.0],
      /* The bowl's inner wall is at r≈1.107 where y=0.82, so the
         surface has to stop short of that or the soup overhangs
         its own bowl. */
      pool: { r: 1.062, y: 0.82, tint: A.stock, emissive: 0.10 },
      scatter: [
        { kind: 'shrimp', n: 6, r0: 0.15, r1: 0.72, y0: 0.80, y1: 0.90, s: 0.135 },
        { kind: 'mussel', n: 5, r0: 0.20, r1: 0.78, y0: 0.79, y1: 0.88, s: 0.135 },
        { kind: 'herb',   n: 4, r0: 0.10, r1: 0.66, y0: 0.83, y1: 0.92, s: 0.14 }
      ]
    }
  ];

  var MAT_OF = {
    shrimp: 'shell', crab: 'shell', mussel: 'shell', corn: 'veg', potato: 'veg',
    sausage: 'veg', lemon: 'citrus', garlic: 'veg', herb: 'herb'
  };
  var BAND_OF = { shrimp: 1.0, crab: 0.55 };

  function create(canvas, tier, reduced) {
    if (!canvas) return null;
    var stage = SHRIMP.Stage.create(canvas, {
      shadowSize: Math.min(tier.shadowSize, 768),
      /* the studio never shows the sea, so the ocean mesh is
         built at its smallest legal size rather than skipped —
         one tiny buffer is cheaper than a branch in the renderer */
      oceanRings: 4, oceanSpokes: 6,
      maxParticles: Math.min(tier.counts.particles, 900)
    });
    if (!stage) return null;

    var seg = tier.segments;

    /* ── meshes ──────────────────────────────────────────────── */
    var MAXI = 96;
    var crowdMesh = {
      shrimp:  stage.crowdMesh(Geo.shrimp(seg.hi, seg.hi + 8).finish(), MAXI),
      crab:    stage.crowdMesh(Geo.crabLeg(seg.md, seg.hi).finish(), MAXI),
      mussel:  stage.crowdMesh(Geo.mussel(seg.md, seg.md).finish(), MAXI),
      corn:    stage.crowdMesh(Geo.corn(seg.md + 10, seg.hi + 14).finish(), MAXI),
      potato:  stage.crowdMesh(Geo.potato(seg.md, seg.md, 11).finish(), MAXI),
      sausage: stage.crowdMesh(Geo.sausage(seg.md, seg.md).finish(), MAXI),
      lemon:   stage.crowdMesh(Geo.lemonWedge(seg.md, seg.md).finish(), MAXI),
      garlic:  stage.crowdMesh(Geo.garlic(seg.md, seg.md).finish(), MAXI),
      herb:    stage.crowdMesh(Geo.herb(seg.lo, seg.lo).finish(), MAXI)
    };

    var vesselMesh = {
      bucket: stage.mesh(Geo.bucket(seg.bucket).finish()),
      handle: stage.mesh(Geo.bucketHandle(8, 40).finish()),
      plate:  stage.mesh(Geo.plate(seg.bucket).finish()),
      bowl:   stage.mesh(Geo.bowl(seg.bucket).finish()),
      tagineB:stage.mesh(Geo.tagineBase(seg.bucket).finish()),
      tagineC:stage.mesh(Geo.tagineCone(seg.bucket).finish())
    };
    var heroMesh = {
      salmon: stage.mesh(Geo.salmonFillet(seg.md + 4, seg.hi + 6).finish()),
      pasta:  stage.mesh(Geo.pastaNest(seg.hi + 10, seg.hi + 6).finish()),
      claw:   stage.mesh(Geo.lobsterClaw(0.30, seg.md, seg.md).finish())
    };
    var poolMesh = stage.mesh(Geo.liquidDisc(1, 48, 0.03).finish());

    /* ── bake each dish's scatter once ───────────────────────── */
    var baked = DISHES.map(function (d, di) {
      var rnd = M.rng(9001 + di * 137);
      var items = [];
      d.scatter.forEach(function (sc) {
        for (var i = 0; i < sc.n; i++) {
          var a = rnd() * TAU;
          var r = lerp(sc.r0, sc.r1, Math.sqrt(rnd()));
          var q = quat.make();
          quat.fromEuler(q, rnd() * TAU, rnd() * TAU, rnd() * TAU);
          items.push({
            kind: sc.kind,
            x: Math.cos(a) * r, z: Math.sin(a) * r,
            y: lerp(sc.y0, sc.y1, rnd()),
            s: sc.s * (0.82 + rnd() * 0.36),
            quat: q,
            spinAxis: v3.norm([0, 0, 0], [rnd() - .5, rnd() - .5, rnd() - .5]),
            spin: rnd() * TAU,
            rate: (rnd() - 0.5) * 0.32,
            bob: rnd() * TAU,
            /* same reason as the film: a garnish where every piece
               is the identical colour is the tell that gives a
               render away */
            albedo: vary(A[sc.kind], rnd),
            seed: rnd() * 10
          });
        }
      });
      return items;
    });

    /* ── crowds, one per kind, refilled every frame ──────────── */
    var crowds = [], byKind = {};
    Object.keys(crowdMesh).forEach(function (k) {
      var c = {
        mesh: crowdMesh[k], material: MAT_OF[k], count: 0,
        data: new Float32Array(MAXI * 16),
        twoSided: k === 'herb' || k === 'mussel'
      };
      crowds.push(c);
      byKind[k] = c;
    });

    /* ── singleton bodies, reused across dishes ──────────────── */
    function body(mesh, material, tint) {
      return {
        mesh: mesh, material: material, tint: tint,
        pos: [0, 0, 0], quat: quat.make(), scale: [1, 1, 1],
        matBlend: 0, wet: 1.1, emissive: 0, dissolve: 0, seed: 3,
        hidden: true, twoSided: true
      };
    }
    var vessels = {
      bucket: body(vesselMesh.bucket, 'steel', A.steel),
      handle: body(vesselMesh.handle, 'steel', A.steel),
      plate:  body(vesselMesh.plate, 'stone', A.stone),
      bowl:   body(vesselMesh.bowl, 'stone', A.stone),
      tagineB:body(vesselMesh.tagineB, 'stone', A.clay),
      tagineC:body(vesselMesh.tagineC, 'stone', A.clay)
    };
    var heroes = {
      salmon: body(heroMesh.salmon, 'shell', A.salmon),
      pasta:  body(heroMesh.pasta, 'veg', A.pasta),
      claw:   body(heroMesh.claw, 'claw', A.claw)
    };
    var pool = body(poolMesh, 'liquid', A.stock);
    pool.wet = 1.4;

    var bodies = [];
    Object.keys(vessels).forEach(function (k) { bodies.push(vessels[k]); });
    Object.keys(heroes).forEach(function (k) { bodies.push(heroes[k]); });
    bodies.push(pool);

    /* ── particles: a light ember drift, nothing more ────────── */
    var PN = Math.min(tier.counts.particles >> 2, 380);
    var pdata = new Float32Array(PN * 12);
    var prnd = M.rng(4242);
    var parts = [];
    for (var i = 0; i < PN; i++) {
      parts.push({
        a: prnd() * TAU, r: prnd(), y: prnd(),
        sp: 0.12 + prnd() * 0.34, w: prnd() * TAU,
        size: 0.005 + prnd() * 0.018, warm: prnd() < 0.45
      });
    }

    /* ── state ───────────────────────────────────────────────── */
    var state = {
      time: 0,
      camera: { pos: [0, 1.6, 3.4], target: [0, 0.7, 0], fov: 0.72, roll: 0 },
      sun: { dir: v3.norm([0, 0, 0], [-0.58, 0.63, 0.52]), color: [0, 0, 0], size: 0.014 },
      boil: { pos: [0, 0.6, 0], color: [0, 0, 0], power: 0.55 },
      /* The sky shader is on here even though there is no sea:
         it is the backdrop the plate sits against and the thing
         every wet surface reflects. Clearing to a flat colour
         instead leaves the dish floating in a void, and a void
         reads as an asset on a transparent background rather
         than as a place. */
      fog: { color: HAZE.slice(), density: 0.020 },
      deep: DEEP.slice(),
      waterLine: -99,
      oceanAmp: 1, oceanAmount: 0, skyAmount: 1, skyDim: 0.20, stars: 0,
      ripple: { at: [0, 0], age: 0, strength: 0 },
      shadowFocus: [0, 0.5, 0], shadowExtent: 2.6, shadowStrength: 0.85,
      steam: { origin: [0, 0.8, 0], radius: 0.8, height: 2.2, strength: 0 },
      bodies: bodies, crowds: crowds,
      particles: pdata, particleCount: 0,
      post: {
        exposure: 0.42, bloom: 0.20, bloomThreshold: 2.6, shafts: 0.05,
        aberration: 0.030, vignette: 0.28, grain: 0.020, fade: 1,
        warp: 0, warpAt: [0.5, 0.5],
        lift: [0.010, 0.018, 0.032], gain: [1.02, 0.975, 0.945],
        saturation: 1.12, contrast: 1.13
      }
    };

    var W = 1, H = 1;
    var yaw = 0, yawV = 0, mx = 0, my = 0, mxs = 0, mys = 0;
    var camPos = [0, 1.6, 3.4], camTgt = [0, 0.7, 0];
    var eyeT = [0, 0, 0], tgtT = [0, 0, 0];
    var axisq = quat.make();

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(2, r.width); H = Math.max(2, r.height);
      var dpr = Math.min(global.devicePixelRatio || 1, tier.maxScale);
      stage.resize(W, H, dpr);
    }

    /* ── place one dish, at a given presence ──────────────────
       `presence` in 0..1 is how much of this dish exists right
       now. It drives the dissolve, the rise, and the steam, so a
       dish at 0.3 is a third assembled and two thirds noise. */

    function place(di, presence, clock, dt) {
      var d = DISHES[di];
      var pr = sat(presence);
      /* The dissolve trails the movement: by the time the noise
         has taken half the object it is already well down and
         well away, so the lace is never the main event. */
      var dissolve = sat((1 - pr) * 1.30 - 0.12);
      var rise = (1 - M.E.outQuint(pr)) * -1.35;
      var shrink = lerp(0.62, 1, M.E.outQuint(pr));
      /* One camera rig serves all seven dishes, and the vessels
         are nothing like the same size — a pail is 0.8 across and
         a plate is 2.0. Rather than seven camera rigs, each dish
         carries the scale that brings it to the same apparent
         size, and it is applied to *everything* the dish owns:
         the vessel, its contents, its pool, its steam and its
         shadow. Scaling only the vessel is the trap — the food
         then floats above a plate it no longer fits. */
      var fit = d.fit || 1;

      /* the vessel */
      var vs = [];
      if (d.vessel === 'bucket') vs = [vessels.bucket, vessels.handle];
      else if (d.vessel === 'plate') vs = [vessels.plate];
      else if (d.vessel === 'bowl') vs = [vessels.bowl];
      else if (d.vessel === 'tagine') vs = [vessels.tagineB, vessels.tagineC];

      for (var i = 0; i < vs.length; i++) {
        var v = vs[i];
        v.hidden = false;
        v.pos[0] = 0; v.pos[1] = (d.vy + rise) * fit * shrink; v.pos[2] = 0;
        v.scale[0] = v.scale[1] = v.scale[2] = fit * shrink;
        v.dissolve = dissolve;
        quat.fromAxisAngle(v.quat, 0, 1, 0, yaw);
        /* The tagine cone lifts off as its dish comes fully in —
           the one gesture in this section that is a *reveal*
           rather than an arrival, because that is what a tagine
           does at the table. */
        if (v === vessels.tagineC) {
          v.pos[1] += (0.44 + M.E.outQuint(sat(presence)) * 1.35) * fit;
          v.dissolve = Math.max(dissolve, sat(presence * 1.4 - 0.55));
        }
      }

      /* the pool of sauce or stock */
      if (d.pool) {
        pool.hidden = false;
        pool.pos[1] = (d.pool.y + rise) * fit * shrink;
        pool.scale[0] = pool.scale[1] = pool.scale[2] = d.pool.r * fit * shrink;
        pool.tint = d.pool.tint;
        pool.emissive = d.pool.emissive;
        pool.dissolve = dissolve;
        quat.fromAxisAngle(pool.quat, 0, 1, 0, yaw);
      }

      /* the hero object */
      if (d.hero) {
        var hb = heroes[d.hero.mesh];
        hb.hidden = false;
        hb.tint = d.hero.tint;
        hb.material = d.hero.material;
        hb.matBlend = 0;
        hb.pos[0] = 0; hb.pos[1] = (d.hero.y + rise) * fit * shrink; hb.pos[2] = 0;
        hb.scale[0] = hb.scale[1] = hb.scale[2] = d.hero.scale * fit * shrink;
        hb.dissolve = dissolve;
        quat.fromEuler(hb.quat, d.hero.tilt, yaw + 0.4, 0);
      }

      /* the scatter */
      var items = baked[di];
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        var c = byKind[it.kind];
        if (c.count >= MAXI) continue;
        var o = c.count * 16, dd = c.data;

        /* everything turns with the dish, and drifts a little on
           its own — a still plate looks like a still render */
        var ca = Math.cos(yaw), sa = Math.sin(yaw);
        var wx = it.x * ca + it.z * sa;
        var wz = -it.x * sa + it.z * ca;
        var bobY = Math.sin(clock * 0.7 + it.bob) * 0.010;

        it.spin += it.rate * dt;

        dd[o] = wx * fit * shrink;
        dd[o + 1] = (it.y + rise + bobY) * fit * shrink;
        dd[o + 2] = wz * fit * shrink;
        dd[o + 3] = it.s * fit * shrink;
        quat.fromAxisAngle(axisq, it.spinAxis[0], it.spinAxis[1], it.spinAxis[2], it.spin + yaw * 0.35);
        dd[o + 4] = axisq[0]; dd[o + 5] = axisq[1]; dd[o + 6] = axisq[2]; dd[o + 7] = axisq[3];
        var alb = it.albedo;
        dd[o + 8] = alb[0]; dd[o + 9] = alb[1]; dd[o + 10] = alb[2];
        dd[o + 11] = BAND_OF[it.kind] || 0;
        dd[o + 12] = 1.25;
        dd[o + 13] = 0;
        dd[o + 14] = dissolve;
        dd[o + 15] = it.seed;
        c.count++;
      }

      return d;
    }

    /* ── the frame ───────────────────────────────────────────── */
    var lastVisible = false;

    function frame(prog, dt, clock, visible, pmx, pmy) {
      if (!visible) { lastVisible = false; return; }
      if (!lastVisible) { lastVisible = true; }

      state.time = clock;
      mx = pmx; my = pmy;
      mxs = damp(mxs, mx, 4.5, dt);
      mys = damp(mys, my, 4.5, dt);

      /* Map the track so progress 0 is the *centre* of the first
         dish and progress 1 the centre of the last, not the edges
         of their slices. `prog * n - 0.5` puts both ends half a
         slice out, which leaves the first and last dishes sitting
         permanently at presence zero — fully eaten by their own
         dissolve, for the whole time they are the dish on screen. */
      var n = DISHES.length;
      var pos = prog * (n - 1);            /* which dish, fractionally */
      var idx = M.clamp(Math.round(pos), 0, n - 1);
      var frac = pos - idx;                /* -0.5 … 0.5 within the dish */

      /* Presence: a dish is fully present across almost all of its
         slice and hands over in a narrow band at the edge.

         The first version handed over across a third of the
         slice, and it was a mistake for a reason worth writing
         down: a noise dissolve applied to every object at once
         turns the whole dish into lace, and a third of the
         section's scroll was spent looking at lace. The
         handover is now short, and most of the distance between
         two dishes is covered by the departing one *sinking and
         shrinking* — motion the eye reads as an exit, rather than
         an effect it reads as a glitch. */
      var here = sat(1 - (Math.abs(frac) - 0.40) / 0.10);
      var other = frac > 0 ? idx + 1 : idx - 1;

      /* clear the crowds, then fill from up to two dishes */
      var i;
      for (i = 0; i < crowds.length; i++) crowds[i].count = 0;
      for (i = 0; i < bodies.length; i++) bodies[i].hidden = true;
      pool.hidden = true;

      /* the turntable: a steady rotation plus the pointer's push,
         and it keeps turning through the handover so the two
         dishes are on the same axis */
      var yawTarget = prog * TAU * 1.35 + mxs * 0.85;
      yaw = damp(yaw, yawTarget, 5.5, dt);
      if (reduced) yaw = yawTarget;

      var d = place(idx, here, clock, dt);
      if (other >= 0 && other < n && here < 0.999) {
        place(other, 1 - here, clock, dt);
      }

      /* ── camera ──
         Framed on the dish the section is nearest to, easing
         between the two framings across the handover. */
      var dOther = (other >= 0 && other < n) ? DISHES[other] : d;
      var camR = lerp(dOther.camR, d.camR, here);
      var camY = lerp(dOther.camY, d.camY, here);
      var look = lerp(dOther.look, d.look, here);

      var orbit = prog * 0.9 + clock * 0.035;
      eyeT[0] = Math.sin(orbit) * camR * 0.30 + mxs * 0.55;
      eyeT[1] = camY + mys * 0.42 + Math.sin(clock * 0.21) * 0.045;
      eyeT[2] = camR;
      tgtT[0] = mxs * 0.10;
      tgtT[1] = look;
      tgtT[2] = 0;
      v3.damp(camPos, camPos, eyeT, 14, dt);
      v3.damp(camTgt, camTgt, tgtT, 14, dt);
      v3.copy(state.camera.pos, camPos);
      v3.copy(state.camera.target, camTgt);
      state.camera.roll = Math.sin(clock * 0.16) * 0.008 + mxs * 0.010;

      /* ── light ──
         Same two lights as the film, and the same rule: the boil
         is inside the vessel, the moon is high and behind. */
      var sunI = 3.10;
      state.sun.color[0] = SUN[0] * sunI;
      state.sun.color[1] = SUN[1] * sunI;
      state.sun.color[2] = SUN[2] * sunI;
      /* A close-up needs a fraction of the light a wide shot
          does: the same lamp that reads as a boil across four
          metres of ocean is a blowtorch at half a metre. */
      state.boil.color[0] = BOIL[0] * 1.25;
      state.boil.color[1] = BOIL[1] * 1.25;
      state.boil.color[2] = BOIL[2] * 1.25;
      var fit = d.fit || 1;
      state.boil.pos[1] = (d.vy + d.steam[0] * 0.5) * fit;
      state.boil.power = 0.18;

      state.shadowFocus[1] = (d.vy + 0.5) * fit;
      state.shadowExtent = 2.4 * fit + 0.5;

      state.steam.origin[1] = (d.vy + d.steam[0]) * fit;
      state.steam.radius = d.steam[0] * fit;
      state.steam.height = d.steam[1] * fit;
      state.steam.strength = d.steam[2] * here * (0.9 + 0.2 * Math.sin(clock * 0.5));

      /* ── particles ── */
      var pc = 0;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        var py = ((p.y + clock * p.sp * 0.14) % 1);
        var pr2 = 0.25 + p.r * 1.35;
        var pa = p.a + clock * 0.06 + Math.sin(clock * 0.4 + p.w) * 0.12;
        var o = pc * 12;
        pdata[o] = Math.cos(pa) * pr2 * fit;
        pdata[o + 1] = (d.vy + 0.5 + py * d.steam[1] * 0.9) * fit;
        pdata[o + 2] = Math.sin(pa) * pr2 * fit;
        pdata[o + 3] = p.size;
        var fade = Math.sin(py * Math.PI) * here;
        if (p.warm) {
          pdata[o + 4] = BOIL[0] * 2.0; pdata[o + 5] = BOIL[1] * 1.5; pdata[o + 6] = BOIL[2] * 1.0;
          pdata[o + 7] = fade * 0.42;
        } else {
          pdata[o + 4] = SUN[0] * 0.8; pdata[o + 5] = SUN[1] * 0.9; pdata[o + 6] = SUN[2] * 1.0;
          pdata[o + 7] = fade * 0.20;
        }
        pdata[o + 8] = p.w; pdata[o + 9] = 0; pdata[o + 10] = 0; pdata[o + 11] = p.r;
        pc++;
      }
      state.particleCount = pc;

      stage.render(state);
    }

    resize();

    return { resize: resize, frame: frame, count: DISHES.length };
  }

  SHRIMP.Studio = { create: create, DISHES: DISHES };

})(window);
