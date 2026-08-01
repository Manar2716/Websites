/* ═══════════════════════════════════════════════════════════
   film.js — the nine acts, on one number.

     0.000  DROP       black. one droplet falls. the screen ripples.
     0.078  FOG        fog blooms out of the impact; the moon arrives
     0.170  CROSSING   flying low over the swell, moon streak running
     0.290  THE RISE   the pail breaks the surface, water sheeting off
     0.400  ORBIT      the camera circles it; steam; the wordmark
     0.520  BREAK      the pail comes apart, the boil hangs in the air
     0.640  DRIFT      lobster past the lens, garlic at the lens
     0.770  REFORM     the whole boil collapses onto the platter
     0.880  DESCENT    the camera lifts; the scene sinks; moonlight closes

   Hand `update` a t of 0.42 and you get the frame at 0.42 —
   scrolled there, jumped there, or holding still. That property
   is the reason the film can be scrubbed backwards at speed
   without falling apart, and it is worth the discipline it costs:
   nothing in here integrates scroll, and nothing remembers which
   way it was going.

   The exceptions are deliberate and there are three. The springs
   that carry the ingredients between their act positions, the
   particle pool, and the flicker on the boil all integrate real
   time. Those are *texture*, not choreography — if you scrub to
   0.42 and wait a beat they settle to the same frame, which is
   what makes them safe to be stateful.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  var M = SHRIMP.M, Geo = SHRIMP.Geo;
  var v3 = M.v3, quat = M.quat;
  var sat = M.sat, lerp = M.lerp, range = M.range;
  var smoothstep = M.smoothstep, smootherstep = M.smootherstep;
  var TAU = M.TAU;

  var ACT = {
    DROP: 0.000, FOG: 0.078, CROSSING: 0.170, RISE: 0.290, ORBIT: 0.400,
    BREAK: 0.520, DRIFT: 0.640, REFORM: 0.770, DESCENT: 0.880
  };

  /* ── the palette ─────────────────────────────────────────────
     Two lights, and every albedo below is chosen for how it sits
     between them. The shell reds go orange under the boil and
     violet under the moon, which is the whole reason the same
     shrimp reads as appetising in act five and as wreckage in act
     nine without a single value changing. */

  /* The lights carry more chroma than before: the moon is bluer
     and the boil is a harder orange, so the two ends of every
     surface are further apart and the food has something to be
     colourful *against*. The rule is unchanged — still two
     lights, still nothing else — it is turned up. */
  var MOON = [0.46, 0.70, 1.00];
  var BOIL = [1.00, 0.36, 0.055];
  var FOG  = [0.030, 0.072, 0.125];
  var DEEP = [0.008, 0.032, 0.070];

  /* Albedos pushed well clear of grey. These had been chosen for a
     restrained frame and the frame is no longer restrained: the
     shrimp are a real coral, the corn is a real yellow, the herb
     is a real green. Nothing here exceeds 1.0 — a diffuse albedo
     above one is a surface reflecting more light than it
     receives, and it turns the tonemap into a bleach filter. */
  var ALBEDO = {
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
    steel:   [0.415, 0.455, 0.520]
  };

  /* ── the swell, transcribed from the vertex shader ───────────
     The pail has to float on the same water the GPU is drawing.
     There is no way to read the surface back, so the four Gerstner
     waves exist twice, and the two copies have to be kept in step
     by hand. Every constant here is checked against SWELL in
     shaders.js. */

  var WA = [0.062, 0.040, 0.026, 0.015];
  var WL = [9.10, 5.30, 3.10, 1.70];
  var WS = [0.70, 0.94, 1.28, 1.75];
  var WD = [[1.000, 0.000], [0.760, -0.650], [0.420, 0.907], [-0.300, 0.954]];

  function swellHeight(x, z, t, amp) {
    var y = 0;
    for (var i = 0; i < 4; i++) {
      var k = TAU / WL[i];
      var ph = k * (WD[i][0] * x + WD[i][1] * z) - t * WS[i] * k * 1.6;
      y += WA[i] * amp * Math.sin(ph);
    }
    return y;
  }

  /* ── a non-uniform Catmull-Rom through camera keys ───────────
     The camera is one curve through the whole film rather than
     nine shots cut together, which is what makes the transitions
     between acts read as camera moves instead of edits. Keys are
     placed at the t values that matter and the curve does the
     rest; a uniform spline would drag the slow acts and rush the
     fast ones. */

  function curve(keys, t, o) {
    var n = keys.length;
    if (t <= keys[0][0]) { v3.copy(o, keys[0][1]); return o; }
    if (t >= keys[n - 1][0]) { v3.copy(o, keys[n - 1][1]); return o; }
    var i = 0;
    while (i < n - 2 && keys[i + 1][0] < t) i++;
    var t0 = keys[i][0], t1 = keys[i + 1][0];
    var f = smootherstep(t0, t1, t);
    var p0 = keys[Math.max(i - 1, 0)][1], p1 = keys[i][1];
    var p2 = keys[i + 1][1], p3 = keys[Math.min(i + 2, n - 1)][1];
    var f2 = f * f, f3 = f2 * f;
    for (var k = 0; k < 3; k++) {
      o[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
    }
    return o;
  }

  function scalarAt(keys, t) {
    var n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    var i = 0;
    while (i < n - 2 && keys[i + 1][0] < t) i++;
    return lerp(keys[i][1], keys[i + 1][1], smootherstep(keys[i][0], keys[i + 1][0], t));
  }

  /* ═══════════════════════════════════════════════════════════
     the ingredients
     ═══════════════════════════════════════════════════════════

     Every solid thing in the boil is one entry in a flat list.
     Each carries five positions it can be in — packed in the
     pail, suspended in the break, drifting past the lens, laid on
     the platter, sinking — and a spring that takes it between
     them. The acts do not teleport anything; they change where
     the springs are pulling, and the lag between the pull and the
     arrival is most of what makes the motion feel like mass.  */

  var KINDS = [
    { name: 'shrimp',  mesh: 'shrimp',  material: 'shell', albedo: ALBEDO.shrimp,  size: 0.155, share: 0.34, band: 1.00 },
    { name: 'crab',    mesh: 'crab',    material: 'shell', albedo: ALBEDO.crab,    size: 0.135, share: 0.13, band: 0.55 },
    { name: 'mussel',  mesh: 'mussel',  material: 'shell', albedo: ALBEDO.mussel,  size: 0.135, share: 0.13, band: 0.00 },
    { name: 'corn',    mesh: 'corn',    material: 'veg',   albedo: ALBEDO.corn,    size: 0.145, share: 0.07, band: 0.00 },
    { name: 'potato',  mesh: 'potato',  material: 'veg',   albedo: ALBEDO.potato,  size: 0.145, share: 0.08, band: 0.00 },
    { name: 'sausage', mesh: 'sausage', material: 'veg',   albedo: ALBEDO.sausage, size: 0.135, share: 0.07, band: 0.00 },
    { name: 'lemon',   mesh: 'lemon',   material: 'citrus',albedo: ALBEDO.lemon,   size: 0.125, share: 0.06, band: 0.00 },
    { name: 'garlic',  mesh: 'garlic',  material: 'veg',   albedo: ALBEDO.garlic,  size: 0.125, share: 0.07, band: 0.00 },
    { name: 'herb',    mesh: 'herb',    material: 'herb',  albedo: ALBEDO.herb,    size: 0.150, share: 0.05, band: 0.00 }
  ];

  /* No two prawns out of the same pot are the same colour. One
     took more of the boil than its neighbour, one sat at the top
     and stayed pale, one caught the bottom of the pan. Handing
     every instance of a kind the identical albedo is the single
     thing that makes a render of food read as a render, so each
     piece gets its own value and its own chroma around the base.
     The variation is per-piece and fixed at build time, not per
     frame — a prawn that changes colour as it tumbles is worse
     than two hundred identical ones. */
  function vary(base, rnd) {
    var v = 0.68 + rnd() * 0.40;   /* how far it cooked   */
    var c = 0.80 + rnd() * 0.42;   /* how much colour took */
    var l = (base[0] + base[1] + base[2]) / 3;
    return [
      M.clamp((l + (base[0] - l) * c) * v, 0, 1),
      M.clamp((l + (base[1] - l) * c) * v, 0, 1),
      M.clamp((l + (base[2] - l) * c) * v, 0, 1)
    ];
  }

  function buildItems(count, seed) {
    var rnd = M.rng(seed);
    var items = [];
    var kindIndex = [];
    var i, k;
    for (k = 0; k < KINDS.length; k++) {
      var n = Math.max(1, Math.round(count * KINDS[k].share));
      for (i = 0; i < n; i++) kindIndex.push(k);
    }
    /* shuffle, so the packing does not put all the corn on one
       side of the pail */
    for (i = kindIndex.length - 1; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0;
      var tmp = kindIndex[i]; kindIndex[i] = kindIndex[j]; kindIndex[j] = tmp;
    }

    for (i = 0; i < kindIndex.length; i++) {
      k = kindIndex[i];
      var kind = KINDS[k];
      var u = i / kindIndex.length;

      /* PACKED — inside the pail. Rejection-sample the interior
         of the lathe profile so nothing sits in the wall, and bias
         the fill downward so the pile has a heap shape rather than
         a uniform cloud. */
      var packed = [0, 0, 0];
      var ph = rnd() * TAU;
      var rr = Math.sqrt(rnd());
      /* Biased *up*, not down. A uniform fill leaves the top third
         of the pail visibly empty, and the hero shot of this film
         is a pail that is overflowing. */
      var hh = Math.pow(rnd(), 0.42);
      var wallR = 0.56 + hh * 0.20;
      packed[0] = Math.cos(ph) * rr * (wallR - 0.13);
      packed[2] = Math.sin(ph) * rr * (wallR - 0.13);
      packed[1] = 0.16 + hh * 0.92;
      /* The top of the heap crowns above the rim — but only just.
         An earlier version let the crown run to 2.15, which put a
         third of the boil in the air above an empty pail and read
         as a mistake rather than as a heap. The rim is at 1.12;
         the crown tops out a shade over it. */
      if (u > 0.58) {
        var cu = (u - 0.58) / 0.42;
        packed[1] = 1.02 + cu * 0.46 + rnd() * 0.07;
        var cr = (1 - cu * 0.66) * 0.58;
        var ca = rnd() * TAU;
        packed[0] = Math.cos(ca) * cr * Math.sqrt(rnd());
        packed[2] = Math.sin(ca) * cr * Math.sqrt(rnd());
      }

      /* SUSPENDED — the break. A shell around the pail's centre,
         on inclined orbits, so the cloud turns as a body instead
         of jittering in place. */
      var orbR = 1.15 + Math.pow(rnd(), 0.7) * 2.35;
      var orbPhase = rnd() * TAU;
      var orbIncl = (rnd() - 0.5) * 1.30;
      var orbSpeed = (0.10 + rnd() * 0.22) * (rnd() < 0.5 ? -1 : 1);

      /* DRIFT — a lane the item flies down, past the lens. The
         lanes are seeded across the frame so the pass is a stream
         rather than a queue. */
      var lane = [(rnd() - 0.5) * 5.0, (rnd() - 0.5) * 3.4 + 0.6, 0];
      var laneT = rnd();

      /* PLATTER — laid out in a shallow ring, sorted by kind so
         the reform lands as a composed dish and not as a pile. */
      var pa = (i * 2.399963) % TAU;
      var pr = 0.30 + Math.sqrt(u) * 1.62;
      var platter = [Math.cos(pa) * pr, 0.10 + Math.sin(i * 1.7) * 0.05 + (1 - u) * 0.10, Math.sin(pa) * pr];

      var q = quat.make();
      quat.fromEuler(q, rnd() * TAU, rnd() * TAU, rnd() * TAU);
      var stiff = 26 + rnd() * 22;

      items.push({
        kind: k,
        mesh: kind.mesh,
        packed: packed,
        orbR: orbR, orbPhase: orbPhase, orbIncl: orbIncl, orbSpeed: orbSpeed,
        lane: lane, laneT: laneT,
        platter: platter,
        pos: [packed[0], packed[1] - 6, packed[2]],
        vel: [0, 0, 0],
        quat: q,
        spinAxis: v3.norm([0, 0, 0], [rnd() - .5, rnd() - .5, rnd() - .5]),
        spin: 0,
        spinRate: (rnd() - 0.5) * 2.2,
        scale: kind.size * (0.78 + rnd() * 0.50),
        albedo: vary(kind.albedo, rnd),
        seed: rnd() * 10,
        wobble: rnd() * TAU,
        stiff: stiff,
        /* Critical damping for this stiffness is 2·√k. The damping
           argument is a coefficient, not a ratio — passing 0.86
           because it looked like one leaves the system at about
           ζ=0.08, and two hundred ingredients then ring around
           their targets forever instead of arriving at them.
           Slightly under critical keeps the overshoot that makes
           the motion read as weight. */
        damp: 2 * Math.sqrt(stiff) * 0.82
      });
    }
    return items;
  }

  /* ═══════════════════════════════════════════════════════════
     the particle pool
     ═══════════════════════════════════════════════════════════

     Four kinds share one buffer, because they share a draw call:

       0  mote     fog dust, drifting forever, always present
       1  spray    thrown off the pail as it breaks surface
       2  ember    lifted off the boil, warm, short-lived
       3  plankton cold pinpricks below the waterline

     Respawn is in place — a dead particle is re-seeded rather
     than removed — so the buffer never compacts and the upload is
     one contiguous write. */

  function ParticlePool(max) {
    this.max = max;
    this.data = new Float32Array(max * 12);
    this.p = [];
    var rnd = M.rng(20260731);
    for (var i = 0; i < max; i++) {
      this.p.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, max: 1, size: 0.02, kind: 0, spin: rnd() * TAU,
        seed: rnd(), born: -1
      });
    }
    this.rnd = rnd;
    this.count = 0;
  }

  ParticlePool.prototype.seed = function (o, kind, s) {
    var r = this.rnd;
    o.kind = kind;
    o.spin = r() * TAU;
    o.seed = r();
    if (kind === 0) {
      /* motes live in a box that follows the camera, so the fog
         is always populated wherever the film happens to be */
      o.x = s.camera.pos[0] + (r() - .5) * 22;
      o.y = s.waterLine + r() * 7.5 - 0.5;
      o.z = s.camera.pos[2] + (r() - .5) * 22;
      o.vx = (r() - .5) * 0.05; o.vy = 0.02 + r() * 0.05; o.vz = (r() - .5) * 0.05;
      o.size = 0.010 + r() * 0.036;
      o.max = 9 + r() * 9;
    } else if (kind === 1) {
      var a = r() * TAU, rr = 0.30 + r() * 0.62;
      o.x = Math.cos(a) * rr; o.z = Math.sin(a) * rr;
      o.y = s.bucketY + 0.15 + r() * 0.5;
      var out = 0.7 + r() * 2.3;
      o.vx = Math.cos(a) * out; o.vz = Math.sin(a) * out;
      o.vy = 1.4 + r() * 3.4;
      o.size = 0.008 + r() * 0.030;
      o.max = 1.0 + r() * 1.3;
    } else if (kind === 2) {
      var ea = r() * TAU, er = r() * 0.55;
      o.x = Math.cos(ea) * er; o.z = Math.sin(ea) * er;
      o.y = s.bucketY + 0.9 + r() * 0.4;
      o.vx = (r() - .5) * 0.30; o.vz = (r() - .5) * 0.30;
      o.vy = 0.55 + r() * 0.95;
      o.size = 0.006 + r() * 0.016;
      o.max = 1.6 + r() * 2.0;
    } else {
      o.x = s.camera.pos[0] + (r() - .5) * 16;
      o.y = s.waterLine - 0.4 - r() * 5.0;
      o.z = s.camera.pos[2] + (r() - .5) * 16;
      o.vx = (r() - .5) * 0.06; o.vy = 0.05 + r() * 0.10; o.vz = (r() - .5) * 0.06;
      o.size = 0.008 + r() * 0.020;
      o.max = 7 + r() * 7;
    }
    o.life = 0;
  };

  /* ═══════════════════════════════════════════════════════════
     the film
     ═══════════════════════════════════════════════════════════ */

  function create(stage, tier) {
    var counts = tier.counts;

    /* ── meshes ──────────────────────────────────────────────── */
    var seg = tier.segments;
    var meshes = {
      shrimp:  stage.crowdMesh(Geo.shrimp(seg.hi, seg.hi + 8).finish(), counts.items),
      crab:    stage.crowdMesh(Geo.crabLeg(seg.md, seg.hi).finish(), counts.items),
      mussel:  stage.crowdMesh(Geo.mussel(seg.md, seg.md).finish(), counts.items),
      corn:    stage.crowdMesh(Geo.corn(seg.md + 10, seg.hi + 14).finish(), counts.items),
      potato:  stage.crowdMesh(Geo.potato(seg.md, seg.md, 11).finish(), counts.items),
      sausage: stage.crowdMesh(Geo.sausage(seg.md, seg.md).finish(), counts.items),
      lemon:   stage.crowdMesh(Geo.lemonWedge(seg.md, seg.md).finish(), counts.items),
      garlic:  stage.crowdMesh(Geo.garlic(seg.md, seg.md).finish(), counts.items),
      herb:    stage.crowdMesh(Geo.herb(seg.lo, seg.lo).finish(), counts.items)
    };

    var bucketMesh = stage.mesh(Geo.bucket(seg.bucket).finish());
    var handleMesh = stage.mesh(Geo.bucketHandle(8, 42).finish());
    var dropMesh = stage.mesh(Geo.droplet(seg.md, seg.md).finish());
    var platterMesh = stage.mesh(Geo.lathe([
      [0.00, 0.000], [1.70, 0.000], [1.86, 0.012], [1.98, 0.048],
      [2.04, 0.098], [2.02, 0.116], [1.92, 0.086], [1.78, 0.046],
      [1.60, 0.030], [0.00, 0.026]
    ], seg.bucket).finish());

    /* Three claws, built at three openings. Animating the hinge
       would mean rebuilding the buffer every frame for an object
       that is on screen for eleven seconds; three static poses
       shuffled between instances reads as variety and costs
       nothing. */
    var clawMeshes = [
      stage.crowdMesh(Geo.lobsterClaw(0.06, seg.md, seg.md).finish(), 8),
      stage.crowdMesh(Geo.lobsterClaw(0.34, seg.md, seg.md).finish(), 8),
      stage.crowdMesh(Geo.lobsterClaw(0.62, seg.md, seg.md).finish(), 8)
    ];

    /* ── crowds ──────────────────────────────────────────────── */
    var items = buildItems(counts.items, 424242);
    var crowds = [];
    var crowdByKind = {};
    var k;
    for (k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k];
      var c = {
        mesh: meshes[kind.mesh],
        material: kind.material,
        count: 0,
        data: new Float32Array(counts.items * 16),
        twoSided: kind.name === 'herb' || kind.name === 'mussel'
      };
      crowds.push(c);
      crowdByKind[k] = c;
    }
    var clawCrowds = [];
    for (k = 0; k < 3; k++) {
      clawCrowds.push({ mesh: clawMeshes[k], material: 'claw', count: 0, data: new Float32Array(8 * 16) });
      crowds.push(clawCrowds[k]);
    }

    /* Three lobster claws with their own choreography — they are
       the only ingredients that get a named move, because they are
       the only ones big enough to carry one. */
    var claws = [];
    var crnd = M.rng(99);
    for (k = 0; k < 3; k++) {
      claws.push({
        pose: k,
        pos: [0, -6, 0], vel: [0, 0, 0],
        quat: quat.make(), spin: crnd() * TAU,
        packed: [Math.cos(k * 2.1) * 0.30, 1.02 + k * 0.16, Math.sin(k * 2.1) * 0.30],
        orbR: 1.9 + k * 0.75, orbPhase: k * 2.4, orbIncl: (k - 1) * 0.44,
        platter: [Math.cos(k * 2.094) * 1.15, 0.16, Math.sin(k * 2.094) * 1.15],
        scale: 0.150 + k * 0.016, seed: crnd() * 10
      });
      quat.fromEuler(claws[k].quat, crnd(), crnd(), crnd());
    }

    /* ── bodies ──────────────────────────────────────────────── */
    var bucket = {
      mesh: bucketMesh, material: 'steel', albedo: ALBEDO.steel,
      pos: [0, -6, 0], quat: quat.make(), scale: [1, 1, 1],
      tint: ALBEDO.steel, wet: 1, emissive: 0, dissolve: 0, seed: 2.5,
      twoSided: true
    };
    var handle = {
      mesh: handleMesh, material: 'steel', pos: [0, -6, 0], quat: quat.make(), scale: [1, 1, 1],
      tint: ALBEDO.steel, wet: 1, emissive: 0, dissolve: 0, seed: 3.5
    };
    var drop = {
      mesh: dropMesh, material: 'liquid', pos: [0, 6, 0], quat: quat.make(), scale: [0.05, 0.05, 0.05],
      tint: [0.42, 0.62, 0.86], wet: 1, emissive: 0.5, dissolve: 0, seed: 1, noShadow: true
    };
    var platter = {
      mesh: platterMesh, material: 'steel', pos: [0, -6, 0], quat: quat.make(), scale: [1, 1, 1],
      tint: [0.30, 0.33, 0.38], wet: 0.4, emissive: 0, dissolve: 0, seed: 6, twoSided: true
    };

    var bodies = [drop, bucket, handle, platter];

    /* ── particles ───────────────────────────────────────────── */
    var pool = new ParticlePool(counts.particles);

    /* ── camera keys ─────────────────────────────────────────────
       Placed in world units, with the pail at the origin and the
       ocean at y=0. The eye never quite stops moving, including
       in the acts where nothing else does — a locked-off camera
       on a still frame is what makes CG look like CG. */

    var EYE_KEYS = [
      [0.000, [0.00, 0.62, 3.20]],
      [0.078, [0.00, 0.40, 2.60]],
      [0.170, [-2.20, 0.34, 9.00]],
      [0.240, [-0.90, 0.30, 5.40]],
      [0.290, [0.10, 0.46, 4.30]],
      [0.360, [0.60, 1.05, 3.70]],
      [0.400, [2.35, 1.35, 2.90]],
      [0.460, [3.30, 1.55, -1.40]],
      [0.520, [1.00, 1.95, -3.70]],
      [0.580, [-2.60, 1.70, -2.40]],
      [0.640, [-3.40, 1.30, 1.60]],
      [0.700, [-1.30, 0.95, 3.55]],
      [0.770, [0.00, 1.55, 4.10]],
      [0.830, [0.00, 2.70, 3.60]],
      [0.880, [0.00, 4.60, 4.20]],
      [1.000, [0.00, 12.00, 8.60]]
    ];

    var TARGET_KEYS = [
      [0.000, [0.00, 0.10, 0.00]],
      [0.078, [0.00, 0.02, 0.00]],
      [0.170, [-1.20, 0.06, 2.00]],
      [0.240, [0.00, 0.10, 0.00]],
      [0.290, [0.00, 0.42, 0.00]],
      [0.360, [0.00, 0.72, 0.00]],
      [0.400, [0.00, 0.86, 0.00]],
      [0.460, [0.00, 0.92, 0.00]],
      [0.520, [0.00, 1.00, 0.00]],
      [0.580, [0.00, 1.00, 0.00]],
      [0.640, [0.00, 0.80, 0.00]],
      [0.700, [0.00, 0.55, 0.00]],
      [0.770, [0.00, 0.28, 0.00]],
      [0.830, [0.00, 0.16, 0.00]],
      [0.880, [0.00, 0.05, 0.00]],
      [1.000, [0.00, -0.60, 0.00]]
    ];

    var FOV_KEYS = [
      [0.000, 0.62], [0.078, 0.78], [0.170, 0.98], [0.290, 0.86],
      [0.400, 0.74], [0.520, 0.90], [0.640, 1.14], [0.770, 0.82],
      [0.880, 0.74], [1.000, 0.66]
    ];

    /* ── the state handed to the renderer ────────────────────── */

    var state = {
      time: 0,
      camera: { pos: [0, 0, 3], target: [0, 0, 0], fov: 0.8, roll: 0 },
      moon: { dir: v3.norm([0, 0, 0], [-0.34, 0.46, -0.82]), color: [0, 0, 0], size: 0.016 },
      boil: { pos: [0, 0.9, 0], color: [0, 0, 0], power: 0 },
      fog: { color: FOG.slice(), density: 0.055 },
      deep: DEEP.slice(),
      waterLine: 0,
      bucketY: -6,
      oceanAmp: 1,
      oceanAmount: 0,
      skyAmount: 0,
      stars: 1,
      ripple: { at: [0, 0], age: 0, strength: 0 },
      shadowFocus: [0, 0.9, 0],
      shadowExtent: 4.2,
      shadowStrength: 1,
      steam: { origin: [0, 0.9, 0], radius: 0.7, height: 2.6, strength: 0 },
      bodies: bodies,
      crowds: crowds,
      particles: pool.data,
      particleCount: 0,
      post: {
        exposure: 1.0, bloom: 0.28, bloomThreshold: 1.45, shafts: 0.5,
        aberration: 0.14, vignette: 0.62, grain: 0.030, fade: 1,
        warp: 0, warpAt: [0.5, 0.55],
        lift: [0.010, 0.020, 0.036], gain: [1.00, 0.96, 0.94],
        saturation: 1.18, contrast: 1.16
      },
      /* read by the page, not by the renderer */
      act: 'DROP', actProgress: 0, wordmark: 0
    };

    /* ── the spring integrator ───────────────────────────────
       `springV3` is explicit Euler, which is stable only while
       stiffness·dt² stays under about 4 and damping·dt under 2.
       The packed pail runs an order of magnitude stiffer than
       the break, and on a 13 fps frame — a slow machine, or the
       first frame after a background tab — both limits are
       exceeded at once and two hundred ingredients leave the
       frame at speed, permanently.

       Substepping at a fixed 1/120 keeps the integrator inside
       its stability region no matter what the display is doing,
       and eight substeps of a three-multiply spring across two
       hundred items is not a cost worth optimising. */
    var SUB = 1 / 120;

    function spring(pos, vel, target, k, dt) {
      var steps = Math.min(8, Math.max(1, Math.ceil(dt / SUB)));
      var sdt = dt / steps;
      var c = 2 * Math.sqrt(k) * 0.82;
      for (var q = 0; q < steps; q++) M.springV3(pos, vel, target, k, c, sdt, 0);
    }

    /* ── scratch ─────────────────────────────────────────────── */
    var tgt = [0, 0, 0], tmpq = quat.make(), axisq = quat.make();
    var eyeTmp = [0, 0, 0], tgtTmp = [0, 0, 0];
    var mouse = [0, 0];

    function setMouse(x, y) { mouse[0] = x; mouse[1] = y; }

    /* ── the frame ───────────────────────────────────────────── */

    function update(t, dt, clock) {
      t = sat(t);
      state.time = clock;

      /* ── act mixes. Every one of these is a smoothstep of t, and
         several overlap on purpose — an act is a crossfade of
         intent, not a switch. ── */
      var fog      = smoothstep(ACT.DROP + 0.020, ACT.FOG + 0.030, t);
      var crossing = smoothstep(ACT.FOG, ACT.CROSSING, t);
      var rising   = smoothstep(ACT.RISE - 0.045, ACT.RISE + 0.075, t);
      var orbiting = smoothstep(ACT.ORBIT - 0.030, ACT.ORBIT + 0.060, t);
      var breaking = smoothstep(ACT.BREAK - 0.010, ACT.BREAK + 0.090, t);
      var drifting = smoothstep(ACT.DRIFT - 0.020, ACT.DRIFT + 0.080, t);
      var reformed = smoothstep(ACT.REFORM - 0.010, ACT.REFORM + 0.080, t);
      var descent  = smoothstep(ACT.DESCENT, 1.0, t);

      /* ── the drop ────────────────────────────────────────────
         Falls under gravity from 4.2 m, hits at t = 0.055. The
         fall is timed backwards from the impact so the impact
         lands exactly on the scroll position the ripple is keyed
         to, rather than nearly on it. */
      var IMPACT = 0.055;
      var fall = range(t, 0.006, IMPACT);
      drop.hidden = t > IMPACT || t < 0.004;
      drop.pos[0] = 0; drop.pos[2] = 0;
      drop.pos[1] = lerp(4.2, 0.02, fall * fall);
      /* Stretched along its fall by its own speed, which is the
         only reason a 5 cm object reads as moving at all at this
         distance — a round drop at 60 Hz is a stationary dot. */
      var stretch = 0.9 + fall * 2.9;
      drop.scale[0] = 0.052 / Math.sqrt(stretch);
      drop.scale[1] = 0.052 * stretch;
      drop.scale[2] = 0.052 / Math.sqrt(stretch);
      quat.fromEuler(drop.quat, 0, clock * 0.4, 0);
      drop.emissive = 1.6 + fall * 2.0;

      var age = Math.max(0, (t - IMPACT)) * 30;
      state.ripple.at[0] = 0; state.ripple.at[1] = 0;
      state.ripple.age = age;
      state.ripple.strength = t < IMPACT ? 0 : 0.30 * Math.exp(-age * 0.16);
      state.post.warp = t < IMPACT ? 0 : Math.max(0, 1 - (t - IMPACT) * 14) * 1.5 + age * 0.06 * Math.exp(-age * 0.5);

      /* ── light ───────────────────────────────────────────────
         The moon arrives on the fog and never leaves. The boil is
         lit the instant the pail breaks surface and is the only
         warm thing in the film until the platter. */
      var moonUp = lerp(0.10, 1.0, smoothstep(0.010, 0.20, t));
      var moonI = 0.30 + moonUp * 1.55;
      state.moon.color[0] = MOON[0] * moonI;
      state.moon.color[1] = MOON[1] * moonI;
      state.moon.color[2] = MOON[2] * moonI;
      state.moon.size = lerp(0.010, 0.026, smoothstep(0.10, 0.55, t));
      state.stars = smoothstep(0.03, 0.22, t) * (1 - descent * 0.35);

      var boilI = smoothstep(ACT.RISE - 0.02, ACT.RISE + 0.10, t) * (1 - descent * 0.88);
      state.boil.color[0] = BOIL[0] * 1.55;
      state.boil.color[1] = BOIL[1] * 1.55;
      state.boil.color[2] = BOIL[2] * 1.55;
      state.boil.power = boilI * 0.58;

      var fogI = fog * (1 - crossing * 0.18);
      state.fog.color[0] = FOG[0] * (0.35 + fogI * 1.5);
      state.fog.color[1] = FOG[1] * (0.35 + fogI * 1.5);
      state.fog.color[2] = FOG[2] * (0.35 + fogI * 1.5);
      /* the fog thins as the camera commits to the pail and
         thickens again as it leaves — density is the depth cue
         doing the emotional work in the last act */
      state.fog.density = lerp(0.100, 0.018, smoothstep(0.10, 0.42, t)) +
                          descent * 0.060;

      state.skyAmount = smoothstep(0.004, 0.10, t);
      state.oceanAmount = smoothstep(0.000, 0.030, t) * (1 - smoothstep(0.86, 0.98, t) * 0.0);
      state.oceanAmp = lerp(0.25, 1.0, smoothstep(0.03, 0.22, t)) * (1 - orbiting * 0.30 + descent * 0.55);

      /* ── the pail ────────────────────────────────────────────
         It rises out of the water on a curve that decelerates
         hard at the top — the whole beat is the last 20 cm, and a
         linear rise throws it away. */
      var riseE = M.E.outQuart(rising);
      var bucketY = lerp(-2.35, 0.30, riseE);
      /* it rides the swell once it is up, and stops riding it
         once the camera has left the sea behind */
      var ride = swellHeight(0, 0, clock, state.oceanAmp) * (1 - orbiting * 0.55) * rising;
      bucketY += ride;
      /* and sinks again in the last act */
      bucketY = lerp(bucketY, -3.4, M.E.inCubic(descent));
      state.bucketY = bucketY;
      state.waterLine = 0;

      bucket.pos[1] = bucketY;
      handle.pos[1] = bucketY;
      quat.fromAxisAngle(bucket.quat, 0, 1, 0, clock * 0.055 + orbiting * 0.4);
      quat.fromAxisAngle(handle.quat, 0, 1, 0, clock * 0.055 + orbiting * 0.4);
      bucket.wet = M.clamp(1.6 - (t - ACT.RISE) * 4.0, 0.35, 1.6);
      handle.wet = bucket.wet;
      /* the pail dissolves in the break — a noise-thresholded
         erase with a hot edge, so it comes apart along a front
         rather than fading out */
      bucket.dissolve = smoothstep(ACT.BREAK - 0.005, ACT.BREAK + 0.065, t) * (1 - reformed * 0.0);
      handle.dissolve = bucket.dissolve;
      bucket.hidden = bucket.dissolve > 0.999 || t < 0.02;
      handle.hidden = bucket.hidden;

      /* the boil light sits inside the pail and follows it, then
         drops to the platter when the pail is gone */
      state.boil.pos[0] = 0;
      state.boil.pos[1] = lerp(bucketY + 0.85, 0.24, reformed);
      state.boil.pos[2] = 0;

      /* ── the platter ─────────────────────────────────────── */
      platter.hidden = reformed < 0.02;
      platter.pos[1] = lerp(-1.6, 0.0, M.E.outQuint(reformed)) - descent * 3.0;
      quat.fromAxisAngle(platter.quat, 0, 1, 0, clock * 0.045);
      platter.wet = 0.5;

      /* ── steam ───────────────────────────────────────────────
         Off the pail while there is a pail, off the platter after.
         It never stops once it starts, because the moment steam
         stops the food stops being hot. */
      var steamOn = smoothstep(ACT.RISE + 0.005, ACT.RISE + 0.085, t);
      state.steam.origin[1] = lerp(bucketY + 0.95, 0.20, reformed);
      state.steam.radius = lerp(0.82, 1.70, reformed) * lerp(1, 1.8, breaking * (1 - reformed));
      state.steam.height = lerp(2.5, 3.4, reformed);
      state.steam.strength = steamOn * lerp(1.0, 0.55, descent) *
                             (0.9 + 0.25 * Math.sin(clock * 0.4));

      /* ── the ingredients ─────────────────────────────────────
         One target per item per frame, mixed across the acts, and
         a spring that chases it. */
      var i, it, c;
      for (i = 0; i < crowds.length; i++) crowds[i].count = 0;

      var orbitPhase = clock * 0.22 + breaking * 1.4;

      for (i = 0; i < items.length; i++) {
        it = items[i];

        /* PACKED — the item's home, riding with the pail */
        tgt[0] = it.packed[0];
        tgt[1] = it.packed[1] + bucketY;
        tgt[2] = it.packed[2];

        if (breaking > 0.001) {
          /* SUSPENDED — an inclined orbit around the pail's
             centre, the radius easing out as the break lands */
          var a = it.orbPhase + orbitPhase * it.orbSpeed * 4.0;
          var rr = it.orbR * (0.45 + breaking * 0.55);
          var ox = Math.cos(a) * rr;
          var oz = Math.sin(a) * rr;
          var oy = Math.sin(a * 0.8 + it.orbIncl * 3) * rr * 0.42 * Math.cos(it.orbIncl);
          var mixB = breaking * (1 - drifting);
          tgt[0] = lerp(tgt[0], ox, mixB);
          tgt[1] = lerp(tgt[1], bucketY + 1.05 + oy, mixB);
          tgt[2] = lerp(tgt[2], oz, mixB);
        }

        if (drifting > 0.001) {
          /* DRIFT — down a lane toward and past the camera. The
             lane is walked by a *phase*, not by integration, so
             scrubbing back sends everything back up the lane. */
          var lt = (it.laneT + t * 5.2) % 1;
          var lz = lerp(-7.0, 6.2, lt);
          var lx = it.lane[0] * (0.35 + lt * 1.25);
          var ly = bucketY + 1.0 + it.lane[1] * (0.35 + lt * 0.9);
          var mixD = drifting * (1 - reformed);
          tgt[0] = lerp(tgt[0], lx, mixD);
          tgt[1] = lerp(tgt[1], ly, mixD);
          tgt[2] = lerp(tgt[2], lz, mixD);
        }

        if (reformed > 0.001) {
          tgt[0] = lerp(tgt[0], it.platter[0], reformed);
          tgt[1] = lerp(tgt[1], it.platter[1] + platter.pos[1], reformed);
          tgt[2] = lerp(tgt[2], it.platter[2], reformed);
        }

        if (descent > 0.001) {
          tgt[1] -= M.E.inCubic(descent) * 4.2;
          tgt[0] *= 1 + descent * 0.25;
          tgt[2] *= 1 + descent * 0.25;
        }

        /* a small permanent float, so nothing is ever truly still */
        tgt[1] += Math.sin(clock * 0.9 + it.wobble) * 0.012 * (0.4 + breaking);

        /* Stiffness by act. Food packed in a pail is *in the
           pail* — it does not lag behind it, and a soft spring
           there reads as the boil sinking through the bottom
           whenever the scroll moves quickly. The spring is what
           the break needs, not what the pack needs, so the pack
           runs an order of magnitude stiffer and the two blend
           across the moment the pail comes apart. */
        var loose = Math.max(breaking * (1 - reformed), drifting * (1 - reformed));
        spring(it.pos, it.vel, tgt, it.stiff * lerp(7, 1, loose), dt);

        /* spin: fast while suspended, settling as it lands */
        var spinScale = 0.25 + breaking * 2.2 + drifting * 1.6 - reformed * 1.5;
        it.spin += it.spinRate * dt * Math.max(spinScale, 0.06);
        quat.fromAxisAngle(it.quat, it.spinAxis[0], it.spinAxis[1], it.spinAxis[2], it.spin);

        c = crowdByKind[it.kind];
        var o = c.count * 16;
        var d = c.data;
        d[o] = it.pos[0]; d[o + 1] = it.pos[1]; d[o + 2] = it.pos[2]; d[o + 3] = it.scale;
        d[o + 4] = it.quat[0]; d[o + 5] = it.quat[1]; d[o + 6] = it.quat[2]; d[o + 7] = it.quat[3];
        var alb = it.albedo;
        d[o + 8] = alb[0]; d[o + 9] = alb[1]; d[o + 10] = alb[2];
        d[o + 11] = KINDS[it.kind].band;
        /* wetness: soaking as it comes out of the pail, drying a
           little on the platter, and never fully dry */
        d[o + 12] = M.clamp(1.5 - (t - ACT.RISE) * 2.2, 0.55, 1.5);
        d[o + 13] = 0;
        d[o + 14] = 0;
        d[o + 15] = it.seed;
        c.count++;
      }

      /* ── the claws ───────────────────────────────────────────
         Three of them, and the only ingredients with a named
         move: they swing wide on the break and come back in low
         across the lens before landing on the platter. */
      for (i = 0; i < 3; i++) {
        var cl = claws[i];
        tgt[0] = cl.packed[0];
        tgt[1] = cl.packed[1] + bucketY;
        tgt[2] = cl.packed[2];

        if (breaking > 0.001) {
          var ca = cl.orbPhase + orbitPhase * 0.55;
          var cr2 = cl.orbR * (0.5 + breaking * 0.7);
          tgt[0] = lerp(tgt[0], Math.cos(ca) * cr2, breaking * (1 - drifting));
          tgt[1] = lerp(tgt[1], bucketY + 1.2 + Math.sin(ca * 0.7) * cr2 * 0.4, breaking * (1 - drifting));
          tgt[2] = lerp(tgt[2], Math.sin(ca) * cr2, breaking * (1 - drifting));
        }
        if (drifting > 0.001) {
          /* the pass: right to left, close, at eye height */
          var pt = sat((t - ACT.DRIFT) / 0.11 + i * 0.22);
          var mixC = drifting * (1 - reformed);
          tgt[0] = lerp(tgt[0], lerp(4.6, -4.6, pt), mixC);
          tgt[1] = lerp(tgt[1], bucketY + 1.35 + Math.sin(pt * Math.PI) * 0.5, mixC);
          tgt[2] = lerp(tgt[2], lerp(-1.6, 2.6, pt), mixC);
        }
        if (reformed > 0.001) {
          tgt[0] = lerp(tgt[0], cl.platter[0], reformed);
          tgt[1] = lerp(tgt[1], cl.platter[1] + platter.pos[1], reformed);
          tgt[2] = lerp(tgt[2], cl.platter[2], reformed);
        }
        if (descent > 0.001) tgt[1] -= M.E.inCubic(descent) * 4.2;

        var cloose = Math.max(breaking * (1 - reformed), drifting * (1 - reformed));
        spring(cl.pos, cl.vel, tgt, (20 + i * 4) * lerp(7, 1, cloose), dt);
        cl.spin += dt * (0.20 + breaking * 0.75 + drifting * 0.55);
        quat.fromEuler(cl.quat, Math.sin(cl.spin * 0.7) * 0.5, cl.spin, Math.cos(cl.spin * 0.5) * 0.35);

        var cc = clawCrowds[cl.pose];
        var co = cc.count * 16, cd = cc.data;
        cd[co] = cl.pos[0]; cd[co + 1] = cl.pos[1]; cd[co + 2] = cl.pos[2]; cd[co + 3] = cl.scale;
        cd[co + 4] = cl.quat[0]; cd[co + 5] = cl.quat[1]; cd[co + 6] = cl.quat[2]; cd[co + 7] = cl.quat[3];
        cd[co + 8] = ALBEDO.claw[0]; cd[co + 9] = ALBEDO.claw[1]; cd[co + 10] = ALBEDO.claw[2]; cd[co + 11] = 0.35;
        cd[co + 12] = 1.35; cd[co + 13] = 0; cd[co + 14] = 0; cd[co + 15] = cl.seed;
        cc.count++;
      }

      /* ── camera ──────────────────────────────────────────────
         The curve, plus a slow handheld drift, plus the pointer.
         The handheld is two sines at incommensurate rates, which
         never repeats and never reads as a loop. */
      curve(EYE_KEYS, t, eyeTmp);
      curve(TARGET_KEYS, t, tgtTmp);

      var breathe = 1 - descent * 0.5;
      eyeTmp[0] += (Math.sin(clock * 0.23) * 0.052 + Math.sin(clock * 0.41) * 0.021) * breathe;
      eyeTmp[1] += (Math.cos(clock * 0.19) * 0.038 + Math.sin(clock * 0.53) * 0.014) * breathe;
      eyeTmp[2] += Math.sin(clock * 0.13) * 0.036 * breathe;

      /* the orbit act adds a real circle on top of the curve, so
         the pail is seen from every side without the key list
         having to spell out a circle in fifteen points */
      var orbAmt = smoothstep(ACT.ORBIT - 0.02, ACT.ORBIT + 0.05, t) *
                   (1 - smoothstep(ACT.BREAK, ACT.BREAK + 0.09, t));
      if (orbAmt > 0.001) {
        var oa = (t - ACT.ORBIT) * 13.0 + clock * 0.045;
        var orad = 3.15;
        eyeTmp[0] = lerp(eyeTmp[0], Math.sin(oa) * orad, orbAmt);
        eyeTmp[2] = lerp(eyeTmp[2], Math.cos(oa) * orad, orbAmt);
        eyeTmp[1] = lerp(eyeTmp[1], 1.28 + Math.sin(oa * 0.5) * 0.28, orbAmt);
      }

      /* pointer parallax: an offset in the camera's own right/up,
         eased so a flick of the mouse does not snap the frame */
      var par = 0.30 * (1 - descent * 0.7);
      eyeTmp[0] += mouse[0] * par;
      eyeTmp[1] += mouse[1] * par * 0.62;
      tgtTmp[0] += mouse[0] * par * 0.22;
      tgtTmp[1] += mouse[1] * par * 0.14;

      v3.damp(state.camera.pos, state.camera.pos, eyeTmp, 22, dt);
      v3.damp(state.camera.target, state.camera.target, tgtTmp, 22, dt);
      state.camera.fov = scalarAt(FOV_KEYS, t);
      /* a whisper of roll through the break — enough to feel, not
         enough to notice */
      state.camera.roll = Math.sin(clock * 0.17) * 0.010 +
                          breaking * (1 - reformed) * 0.035 +
                          mouse[0] * 0.012;

      state.shadowFocus[1] = lerp(bucketY + 0.8, 0.4, reformed);
      state.shadowExtent = lerp(2.4, 5.4, breaking) * (reformed > 0.5 ? 1.15 : 1);
      state.shadowStrength = 0.55 + orbiting * 0.35;

      /* ── particles ───────────────────────────────────────────
         The pool is sized by tier and split between kinds by the
         act. Motes are always on; spray only exists while water
         is leaving the pail; embers only while there is a boil. */
      var wantSpray = Math.round(counts.particles * 0.34 *
        smoothstep(ACT.RISE - 0.03, ACT.RISE + 0.02, t) *
        (1 - smoothstep(ACT.RISE + 0.05, ACT.RISE + 0.14, t)));
      var wantEmber = Math.round(counts.particles * 0.14 * boilI);
      var wantPlank = Math.round(counts.particles * 0.16 * (1 - orbiting) * fog);
      var wantMote = counts.particles - wantSpray - wantEmber - wantPlank;

      var pc = 0, pd = pool.data;
      var quota = [wantMote, wantSpray, wantEmber, wantPlank];
      var used = [0, 0, 0, 0];
      var gravity = -3.4;

      for (i = 0; i < pool.p.length; i++) {
        var pp = pool.p[i];
        /* assign this slot a kind by walking the quotas — cheap,
           stable frame to frame, and it means changing the mix
           does not restart every particle */
        var want = pp.kind;
        if (used[want] >= quota[want]) {
          want = 0;
          for (var kk = 0; kk < 4; kk++) if (used[kk] < quota[kk]) { want = kk; break; }
          if (used[want] >= quota[want]) continue;
          if (want !== pp.kind) { pp.kind = want; pool.seed(pp, want, state); }
        }
        used[want]++;

        pp.life += dt;
        if (pp.life > pp.max) pool.seed(pp, pp.kind, state);

        if (pp.kind === 1) { pp.vy += gravity * dt; pp.vx *= 0.985; pp.vz *= 0.985; }
        else if (pp.kind === 2) { pp.vy += 0.35 * dt; pp.vx += (pool.rnd() - .5) * 0.9 * dt; pp.vz += (pool.rnd() - .5) * 0.9 * dt; }
        pp.x += pp.vx * dt; pp.y += pp.vy * dt; pp.z += pp.vz * dt;
        pp.spin += dt * 0.5;

        /* spray dies on the water rather than falling through it */
        if (pp.kind === 1 && pp.y < state.waterLine - 0.05) pool.seed(pp, 1, state);

        var lifeT = pp.life / pp.max;
        var fadeIn = smoothstep(0, 0.12, lifeT);
        var fadeOut = 1 - smoothstep(0.62, 1, lifeT);
        var a = fadeIn * fadeOut;

        var cr, cg, cb, streak = 0, kindf = 0;
        if (pp.kind === 0) {
          cr = MOON[0] * 0.30; cg = MOON[1] * 0.34; cb = MOON[2] * 0.42;
          a *= 0.32 * fogI;
        } else if (pp.kind === 1) {
          cr = MOON[0] * 1.15 + BOIL[0] * 0.30;
          cg = MOON[1] * 1.15 + BOIL[1] * 0.30;
          cb = MOON[2] * 1.15 + BOIL[2] * 0.30;
          a *= 0.90; streak = M.clamp(Math.abs(pp.vy) * 0.35, 0, 2.2); kindf = 1;
        } else if (pp.kind === 2) {
          cr = BOIL[0] * 2.1; cg = BOIL[1] * 1.7; cb = BOIL[2] * 1.2;
          a *= 0.62;
        } else {
          cr = MOON[0] * 0.55; cg = MOON[1] * 0.70; cb = MOON[2] * 0.95;
          a *= 0.30;
        }

        var po = pc * 12;
        pd[po] = pp.x; pd[po + 1] = pp.y; pd[po + 2] = pp.z; pd[po + 3] = pp.size;
        pd[po + 4] = cr; pd[po + 5] = cg; pd[po + 6] = cb; pd[po + 7] = a * (1 - descent * 0.35);
        pd[po + 8] = pp.spin; pd[po + 9] = streak; pd[po + 10] = kindf; pd[po + 11] = pp.seed;
        pc++;
        if (pc >= pool.max) break;
      }
      state.particleCount = pc;

      /* ── grade and post ──────────────────────────────────────
         Exposure is pulled down through the black opening and
         pushed as the boil arrives, which is the difference
         between a dark frame and an underexposed one. */
      var po2 = state.post;
      /* Brighter overall, and the saturation eases up as the boil
         arrives — the opening is meant to be near-monochrome
         water, and the colour is the payoff for having waited. */
      po2.exposure = lerp(0.60, 1.34, smoothstep(0.008, 0.20, t)) *
                     lerp(1, 1.20, orbiting) * lerp(1, 0.86, descent);
      po2.saturation = lerp(1.04, 1.20, smoothstep(0.10, 0.34, t));
      po2.contrast = 1.16;
      /* Bloom is for the handful of pixels that are genuinely
         brighter than the frame can hold — the moon path, the
         boil, a specular hit on wet shell. Run wide and low it
         becomes a veil that lifts the blacks and softens every
         edge, which is exactly the difference between a render
         that looks photographed and one that looks lit by a
         screensaver. */
      po2.bloom = lerp(0.16, 0.30, smoothstep(0.05, 0.36, t)) + breaking * 0.06;
      po2.bloomThreshold = lerp(1.05, 1.60, smoothstep(0.02, 0.30, t));
      po2.shafts = lerp(0.15, 0.62, smoothstep(0.05, 0.30, t)) * (1 - orbiting * 0.45) + descent * 0.35;
      /* Aberration scales with how much is in frame, not with how
         dramatic the act is. The break puts two hundred small
         bright objects on screen at once and every one of them
         gets its own red and cyan edge — what reads as a lens on
         a single pail reads as a broken display on a cloud. */
      po2.aberration = 0.028 + breaking * 0.030 + drifting * 0.024;
      po2.vignette = lerp(0.80, 0.40, smoothstep(0.02, 0.28, t)) + descent * 0.18;
      po2.grain = 0.030 + (1 - smoothstep(0.0, 0.16, t)) * 0.020;
      /* the film opens and closes on black, and both are the same
         two lines */
      po2.fade = smoothstep(0.0, 0.014, t) * (1 - smoothstep(0.965, 1.0, t) * 0.92);

      /* grade: shadows to the ocean, highlights to the boil */
      var warmth = smoothstep(ACT.RISE, ACT.ORBIT, t) * (1 - descent);
      po2.lift[0] = 0.006 + warmth * 0.012;
      po2.lift[1] = 0.016 + warmth * 0.004;
      po2.lift[2] = 0.034 - warmth * 0.010 + descent * 0.020;
      po2.gain[0] = 1.00 + warmth * 0.10;
      po2.gain[1] = 0.965 + warmth * 0.010;
      po2.gain[2] = 0.945 - warmth * 0.035 + descent * 0.075;

      /* ── what the page reads ─────────────────────────────── */
      state.wordmark = smoothstep(ACT.ORBIT - 0.020, ACT.ORBIT + 0.045, t) *
                       (1 - smoothstep(ACT.BREAK - 0.030, ACT.BREAK + 0.020, t));
      var names = ['DROP', 'FOG', 'CROSSING', 'RISE', 'ORBIT', 'BREAK', 'DRIFT', 'REFORM', 'DESCENT'];
      var bounds = [ACT.DROP, ACT.FOG, ACT.CROSSING, ACT.RISE, ACT.ORBIT, ACT.BREAK, ACT.DRIFT, ACT.REFORM, ACT.DESCENT, 1];
      for (i = 0; i < names.length; i++) {
        if (t >= bounds[i] && t < bounds[i + 1]) {
          state.act = names[i];
          state.actProgress = range(t, bounds[i], bounds[i + 1]);
          break;
        }
      }

      return state;
    }

    return {
      update: update,
      state: state,
      setMouse: setMouse,
      ACT: ACT,
      itemCount: items.length
    };
  }

  SHRIMP.Film = { create: create, ACT: ACT, ALBEDO: ALBEDO, MOON: MOON, BOIL: BOIL, FOG: FOG, DEEP: DEEP };

})(window);
