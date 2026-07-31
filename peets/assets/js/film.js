/* ═══════════════════════════════════════════════════════════
   film.js — the opening film.

   Nine acts on one continuous scroll. Everything here is a pure
   function of a single normalised number: hand `update` a t of
   0.42 and you get the exact frame at 0.42, whether you scrolled
   there, jumped there, or are holding still. Nothing accumulates
   except the physics, which is what gives the film memory —
   beans arriving at the cup carry the speed they had in the
   swarm, and droplets that were flung outward are still slowing
   down when the camera catches them.

     0  EMBER      one bean, one light, nothing else
     1  SWARM      the crowd arrives and orbits the lens
     2  VESSEL     the crowd becomes the cup
     3  POUR       espresso, crema, the level rising
     4  MILK       the rosetta drawn on the surface
     5  STEAM      up through the plume, into the words
     6  BENCH      the machine assembles out of the air
     7  SPLASH     frozen mid-air, then pulled into letterforms
     8  CODA       the room, holding
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  var M = PEET.M;
  var E = M.E, r = M.range, ss = M.smootherstep, lerp = M.lerp, sat = M.sat;

  var ACT = {
    ember:  [0.000, 0.072],
    swarm:  [0.072, 0.188],
    vessel: [0.188, 0.300],
    pour:   [0.300, 0.432],
    milk:   [0.432, 0.546],
    steam:  [0.546, 0.648],
    bench:  [0.648, 0.800],
    splash: [0.800, 0.896],
    coda:   [0.896, 1.000]
  };

  /* ── camera keys ─────────────────────────────────────────────
     Positions are metres-ish; the cup is 12 cm across and sits at
     the origin. Interpolation is Catmull-Rom through the key
     positions with linear time inside each segment, which keeps
     the move continuous through the keys rather than settling at
     every one — `ease` is only set where a beat wants to land. */

  var KEYS = [
    /* EMBER — held on one bean in a lot of empty darkness */
    { t: 0.000, pos: [0.16, 0.962, 1.02], tgt: [0, 0.95, 0], fov: 0.46 },
    { t: 0.040, pos: [-0.30, 0.995, 1.10], tgt: [0, 0.95, 0], fov: 0.50 },
    { t: 0.072, pos: [-0.62, 1.03, 1.32], tgt: [0, 0.95, 0], fov: 0.62 },

    /* SWARM — the shell contracts around a slowly rising lens */
    { t: 0.110, pos: [-0.30, 1.12, 1.55], tgt: [0, 0.98, 0], fov: 0.92 },
    { t: 0.150, pos: [0.62, 1.24, 2.10], tgt: [0, 0.95, 0], fov: 1.02 },
    { t: 0.188, pos: [1.35, 1.30, 2.05], tgt: [0, 0.86, 0], fov: 0.92 },

    /* VESSEL — crane down onto the bench as the cup forms.
       Distances here are measured from the cup centre, not from
       the camera target: on a low angle the near rim is a metre
       closer than the thing being aimed at, and a framing that
       looks right on paper puts the lens inside the ceramic. */
    { t: 0.240, pos: [1.70, 1.20, 2.25], tgt: [0, 0.55, 0], fov: 0.74 },
    { t: 0.300, pos: [1.35, 0.86, 2.00], tgt: [0, 0.42, 0], fov: 0.62, ease: E.inOutSine },

    /* POUR — low three-quarter, then up and over the rim */
    { t: 0.348, pos: [1.30, 0.72, 2.05], tgt: [0, 0.46, 0], fov: 0.56 },
    { t: 0.392, pos: [1.00, 1.30, 1.72], tgt: [0, 0.52, 0], fov: 0.54 },
    { t: 0.432, pos: [0.52, 2.05, 1.28], tgt: [0, 0.50, 0], fov: 0.56 },

    /* MILK — nearly plan view, orbiting slowly */
    { t: 0.482, pos: [-0.28, 2.32, 0.85], tgt: [0, 0.46, 0], fov: 0.54 },
    { t: 0.546, pos: [-0.95, 2.15, -0.62], tgt: [0, 0.46, 0], fov: 0.58 },

    /* STEAM — crane up through the plume, pitch to horizontal */
    { t: 0.592, pos: [-0.86, 2.36, -0.10], tgt: [0, 1.05, 0], fov: 0.74 },
    { t: 0.624, pos: [-0.60, 1.94, 1.30], tgt: [0, 0.86, 0], fov: 0.82 },
    { t: 0.648, pos: [-0.10, 1.62, 2.55], tgt: [-0.15, 0.74, 0], fov: 0.84 },

    /* BENCH — a long orbit around the assembling machine */
    { t: 0.690, pos: [2.10, 1.46, 3.30], tgt: [-0.25, 0.76, 0], fov: 0.78 },
    { t: 0.726, pos: [-0.40, 1.92, 4.05], tgt: [-0.65, 0.82, 0], fov: 0.72 },
    { t: 0.762, pos: [-3.15, 1.34, 2.55], tgt: [-1.40, 0.72, 0.20], fov: 0.66 },
    { t: 0.800, pos: [-2.30, 0.86, 1.42], tgt: [-1.52, 0.58, 0.62], fov: 0.54, ease: E.inOutSine },

    /* SPLASH — back to the cup, then a slow arc around what hangs */
    { t: 0.836, pos: [1.45, 1.05, 2.20], tgt: [0, 0.62, 0], fov: 0.60 },
    { t: 0.866, pos: [-0.95, 1.20, 2.45], tgt: [0, 0.78, 0], fov: 0.64 },
    { t: 0.896, pos: [0.02, 1.02, 2.42], tgt: [0, 0.96, 0], fov: 0.70 },

    /* CODA — pull back into the room and hold */
    { t: 0.944, pos: [0.62, 1.24, 3.25], tgt: [-0.18, 0.86, 0], fov: 0.74 },
    { t: 1.000, pos: [-0.34, 1.52, 4.45], tgt: [-0.30, 0.92, 0], fov: 0.78 }
  ];

  /* ── palette ─────────────────────────────────────────────────
     The film has one colour idea: everything that emits or
     reflects light in it is a coffee colour — the ramp runs from
     the near-black of a dark roast up through roast, cinnamon and
     crema to milk. The only cool value in the project is the
     daylight coming through the café window, and it exists so the
     warm side has something to be warm against.

     The room end of the ramp is a Peet's café rather than a
     neutral one: the ceiling carries brown, and the bounce is the
     colour of light coming back off an oiled walnut counter, which
     is the warmest thing in the frame after the coffee itself. */

  var P = {
    voidTop:   [0.0075, 0.0058, 0.0050],
    voidFloor: [0.0032, 0.0024, 0.0020],
    voidWin:   [0.62, 0.34, 0.14],
    voidBounce:[0.010, 0.006, 0.004],

    roomTop:   [0.074, 0.058, 0.050],
    roomFloor: [0.032, 0.021, 0.014],
    roomWin:   [2.34, 1.88, 1.40],
    roomBounce:[0.140, 0.080, 0.042],

    /* The ember key is deliberately weak. Act zero is a bean in
       the dark, and the read is the *falloff* — most of the bean
       should be unlit, with one moving band of light finding the
       crease. A brighter key turns it into a glowing orange stone. */
    sunEmber:  [1.30, 0.55, 0.19],
    sunRoom:   [2.35, 1.86, 1.36],

    rimEmber:  [0.42, 0.18, 0.06],
    rimRoom:   [0.30, 0.21, 0.14]
  };

  function mix3(out, a, b, t) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  }

  /* ══════════════════════════════════════════════════════════ */

  function Timeline(stage, reduced) {
    this.stage = stage;
    this.reduced = !!reduced;
    this.T = 0;                 /* wall clock for anything that idles */
    this.t = 0;
    this.vel = 0;

    this.raw = { pos: [0, 0, 0], target: [0, 0, 0], fov: 0.6, roll: 0 };
    this.lag = [0, 0, 0];
    this.edges = {};

    this.floaters = [];
    for (var i = 0; i < 4; i++) {
      this.floaters.push({
        pos: [0, 0, 0], rot: i * 1.9, rotVel: 0, tilt: 0, tiltVel: 0,
        scale: 0.62 + i * 0.11, fade: 0, phase: i * 1.7,
        home: [[-0.30, 1.02, 1.35], [0.92, 1.34, 0.35], [-1.15, 0.86, 0.95], [0.28, 0.72, -0.80]][i],
        dark: i === 1 || i === 3
      });
    }

    this.tmpM = M.m4.make();
    this.tmpV = [0, 0, 0];
    this.buildText();
  }

  /* Two wordmarks, drawn on a canvas at boot and used twice each:
     the steam shader masks against them in screen space, and the
     droplet crowd flies to a point cloud sampled from the same
     glyphs. "HANDCRAFTED" is set two sizes down from "SINCE 1966"
     because the second line is the claim and the first is the
     qualifier — steam holds a short heavy line far better than a
     long light one. */
  Timeline.prototype.buildText = function () {
    this.stage.addText('craft', [
      { text: 'HANDCRAFTED', scale: 0.40, weight: 200, tracking: 0.40 },
      { text: 'SINCE 1966', scale: 0.72, weight: 300, tracking: 0.08 }
    ]);
    this.stage.addText('mark', [
      { text: "PEET'S", scale: 0.86, weight: 300, tracking: 0.14 }
    ]);
  };

  /* fire once on a rising edge, re-arm when scrolled back past it */
  Timeline.prototype.edge = function (key, cond) {
    var was = this.edges[key];
    this.edges[key] = cond;
    return cond && !was;
  };

  /* ── camera ──────────────────────────────────────────────── */

  function catmull(out, keys, i, f, field) {
    var n = keys.length;
    var p0 = keys[Math.max(i - 1, 0)][field];
    var p1 = keys[i][field];
    var p2 = keys[Math.min(i + 1, n - 1)][field];
    var p3 = keys[Math.min(i + 2, n - 1)][field];
    var f2 = f * f, f3 = f2 * f;
    for (var k = 0; k < 3; k++) {
      out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
    }
    return out;
  }

  Timeline.prototype.camAt = function (t, out) {
    var K = KEYS, n = K.length, i = 0;
    while (i < n - 2 && t > K[i + 1].t) i++;
    var span = Math.max(K[i + 1].t - K[i].t, 1e-6);
    var f = sat((t - K[i].t) / span);
    if (K[i + 1].ease) f = K[i + 1].ease(f);
    catmull(out.pos, K, i, f, 'pos');
    catmull(out.target, K, i, f, 'tgt');
    out.fov = lerp(K[i].fov, K[i + 1].fov, f);
    out.roll = lerp(K[i].roll || 0, K[i + 1].roll || 0, f);
    return out;
  };

  /* ── the frame ───────────────────────────────────────────── */

  Timeline.prototype.update = function (t, dt, vel) {
    this.t = t;
    this.vel = vel;
    this.T += dt;
    var s = this.stage.state;
    var T = this.T;

    /* ═══ camera ═══ */
    this.camAt(t, this.raw);
    var cam = s.cam;

    /* handheld: two slow sines an octave apart, scaled by focal
       length so a long lens shakes more, exactly as it would */
    var hh = this.reduced ? 0 : (0.5 / Math.max(this.raw.fov, 0.2)) * 0.010;
    var bx = Math.sin(T * 0.47) * 0.6 + Math.sin(T * 1.13 + 1.2) * 0.4;
    var by = Math.cos(T * 0.39) * 0.6 + Math.sin(T * 0.97 + 2.4) * 0.4;

    /* inertia: the rig lags the move, and leans into a fast scroll
       — the camera has mass, so it arrives a beat late */
    var leanK = this.reduced ? 0 : M.clamp(vel * 2.4, -0.10, 0.10);
    var tgtPos = [
      this.raw.pos[0] + bx * hh,
      this.raw.pos[1] + by * hh,
      this.raw.pos[2] + leanK
    ];
    var k = this.reduced ? 1 : (1 - Math.exp(-11 * dt));
    cam.pos[0] += (tgtPos[0] - cam.pos[0]) * k;
    cam.pos[1] += (tgtPos[1] - cam.pos[1]) * k;
    cam.pos[2] += (tgtPos[2] - cam.pos[2]) * k;
    var k2 = this.reduced ? 1 : (1 - Math.exp(-14 * dt));
    cam.target[0] += (this.raw.target[0] - cam.target[0]) * k2;
    cam.target[1] += (this.raw.target[1] - cam.target[1]) * k2;
    cam.target[2] += (this.raw.target[2] - cam.target[2]) * k2;
    cam.fov += (this.raw.fov - cam.fov) * k2;
    cam.roll += (this.raw.roll + (this.reduced ? 0 : Math.sin(T * 0.31) * 0.006) - cam.roll) * k2;

    /* ═══ light ═══
       Darkness is the ground state. The room does not fade up, it
       is *let in*: first a little as the cup forms, then fully
       when the camera clears the steam and finds the window. */
    var dawn = ss(0.196, 0.318, t);
    var reveal = ss(0.560, 0.646, t);
    var lit = dawn * 0.42 + reveal * 0.58;

    mix3(s.env.top, P.voidTop, P.roomTop, lit);
    mix3(s.env.floor, P.voidFloor, P.roomFloor, lit);
    mix3(s.env.window, P.voidWin, P.roomWin, lit);
    mix3(s.env.bounce, P.voidBounce, P.roomBounce, lit);
    mix3(s.sun.color, P.sunEmber, P.sunRoom, lit);
    mix3(s.env.rim, P.rimEmber, P.rimRoom, lit);
    s.env.ambient[0] = s.env.ambient[1] = s.env.ambient[2] = lerp(0.55, 1.05, lit);

    /* The swarm happens before the room exists, so the only thing
       lighting two thousand beans is the ember key — and one weak
       key across a crowd that far from the lens renders a black
       frame. The key is lifted across acts one and two and taken
       away again, which reads as the beans catching a light rather
       than as the room coming up early. */
    var glow = M.arc(r(0.052, 0.312, t));
    if (glow > 0) {
      var g2 = 1 + glow * 2.35;
      s.sun.color[0] *= g2; s.sun.color[1] *= g2; s.sun.color[2] *= g2;
      s.env.ambient[0] = s.env.ambient[1] = s.env.ambient[2] += glow * 0.42;
      s.env.rim[0] += glow * 0.50; s.env.rim[1] += glow * 0.24; s.env.rim[2] += glow * 0.09;
      s.env.window[0] += glow * 0.55; s.env.window[1] += glow * 0.30; s.env.window[2] += glow * 0.12;
    }

    /* the key swings round as the room opens up, so the shadow on
       the bench travels across the film rather than sitting still */
    var sa = lerp(-0.35, 0.62, lit);
    s.sun.dir[0] = Math.cos(sa) * 0.62;
    s.sun.dir[1] = lerp(0.74, 0.52, lit);
    s.sun.dir[2] = Math.sin(sa) * 0.60 + 0.30;
    var sl = Math.hypot(s.sun.dir[0], s.sun.dir[1], s.sun.dir[2]);
    s.sun.dir[0] /= sl; s.sun.dir[1] /= sl; s.sun.dir[2] /= sl;

    s.room = lerp(0.20, 1.0, lit);
    s.haze.amt = lerp(0.010, 0.020, lit);
    mix3(s.haze.color, [0.055, 0.030, 0.018], [0.10, 0.070, 0.050], lit);
    s.shadow = lerp(0.25, 0.92, dawn);

    /* ═══ what exists ═══ */
    var sh = s.show;
    sh.table = ss(0.198, 0.268, t);
    sh.saucer = ss(0.228, 0.290, t);
    sh.cup = ss(0.244, 0.300, t);
    sh.solo = (1 - ss(0.058, 0.098, t));
    sh.machine = ss(0.650, 0.688, t);
    sh.dust = lerp(0.35, 1.0, lit);

    /* ═══ 0 · EMBER ═══
       One bean, turning under a single hard key. The camera is
       close enough that the crease catches the light and loses it
       again once per turn, which is the whole shot. */
    s.solo.pos[1] = 0.95 + Math.sin(T * 0.5) * 0.006;
    s.solo.rot = 0.5 + T * 0.26;
    s.solo.tilt = 0.34 + Math.sin(T * 0.33) * 0.05;
    s.solo.scale = 0.098;

    /* ═══ 1–2 · SWARM → VESSEL ═══ */
    var arrive = ss(0.074, 0.150, t);           /* the crowd appears */
    var contract = ss(0.100, 0.214, t);         /* the shell closes in */
    var asm = ss(0.196, 0.286, t);              /* and becomes a cup */
    var become = ss(0.252, 0.302, t);           /* ceramic takes over */

    /* act 7 briefly borrows the beans back for the explosion */
    var burst = r(0.802, 0.842, t);
    var reform = ss(0.836, 0.872, t);

    var beansAlpha = (1 - become) * (1 - ss(0.300, 0.330, t));
    /* the beans clear the frame before the droplets spell anything —
       two crowds saying different things at once says neither */
    beansAlpha = Math.max(beansAlpha, ss(0.802, 0.818, t) * (1 - ss(0.854, 0.878, t)));

    if (this.edge('burst', t > 0.806 && t < 0.878)) {
      this.stage.beans.impulse([0, 0.45, 0], 7.4, 1.6, 12);
      this.stage.drops.impulse([0, 0.50, 0], 5.2, 1.1, 13);
    }

    var swarmAsm = Math.max(asm, reform * 0.92);

    this.stage.beans.update(dt, {
      time: T,
      orbitCenter: [0, 0.95, 0],
      assemble: swarmAsm,
      assembleStagger: 0.42,
      spring: lerp(7.5, 40, swarmAsm),
      damp: lerp(2.6, 9.0, swarmAsm),
      /* the swirl does not stop when they arrive, it is *absorbed*
         by the spring — beans wind into the cup, they do not land */
      swirl: lerp(2.6, 0.0, swarmAsm) * (1 + burst * 2.2),
      radial: lerp(-0.35, 0, swarmAsm) + burst * 1.4,
      turb: lerp(0.55, 0.05, swarmAsm),
      turbFreq: 1.05,
      drag: lerp(0.55, 1.5, swarmAsm),
      gravity: -0.25 * (1 - swarmAsm),
      radiusMul: lerp(1.20, 0.32, contract),
      orbitSpeed: lerp(0.55, 1.5, contract),
      bob: 0.22,
      spinMul: lerp(1.0, 0.25, swarmAsm),
      scaleMul: lerp(1.0, 0.58, swarmAsm),
      alpha: beansAlpha,
      reveal: Math.max(arrive, 0.02),
      revealSoft: 0.55
    });
    sh.beans = beansAlpha > 0.004 ? 1 : 0;

    /* ═══ 3 · POUR ═══ */
    var pourIn = ss(0.306, 0.336, t);
    var pourOut = 1 - ss(0.404, 0.428, t);
    var pouring = pourIn * pourOut;
    var fill = ss(0.312, 0.416, t);

    sh.espresso = pouring;
    s.espresso.pos[0] = 0; s.espresso.pos[1] = 1.52; s.espresso.pos[2] = 0;
    s.espresso.len = 1.52 - (0.10 + fill * 0.34);
    s.espresso.radius = 0.030 + 0.016 * M.arc(pouring);
    s.espresso.deform[1] = 0.22 + 0.16 * Math.sin(T * 0.8);
    s.espresso.deform[2] = 0.85;
    s.espresso.deform[3] = T * 0.55;

    /* ═══ 4 · MILK ═══ */
    var milkIn = ss(0.438, 0.470, t);
    var milkOut = 1 - ss(0.514, 0.538, t);
    var milking = milkIn * milkOut;
    sh.milk = milking;
    s.milk.pos[0] = -0.10 + Math.sin(T * 0.9) * 0.05;
    s.milk.pos[1] = 1.34;
    s.milk.pos[2] = 0.06 + Math.cos(T * 0.7) * 0.04;
    s.milk.len = 1.34 - (0.10 + fill * 0.34) - 0.02;
    s.milk.radius = 0.026 + 0.014 * M.arc(milking);
    s.milk.deform[1] = 0.42;
    s.milk.deform[2] = 1.9;
    s.milk.deform[3] = T * 1.3;

    /* ═══ the liquid ═══ */
    var lq = s.liquid;
    sh.liquid = ss(0.306, 0.330, t);
    lq.y = 0.098 + fill * 0.345;
    lq.crema = ss(0.330, 0.408, t);
    /* the surface keeps turning long after the pour stops, slowing
       the way a real cup does */
    this._swirl = (this._swirl || 0) + dt * (0.35 + pouring * 2.6 + milking * 1.9 +
      Math.max(0, 1.4 - (t - 0.52) * 14) * 0.4);
    lq.swirl = this._swirl * 0.55;
    lq.artReveal = ss(0.452, 0.526, t);
    lq.artOpacity = ss(0.448, 0.478, t) * (1 - ss(0.808, 0.840, t) * 0.75);
    lq.pour[0] = Math.sin(T * 0.8) * 0.10;
    lq.pour[1] = Math.cos(T * 0.65) * 0.10;
    lq.pourAmt = pouring * 0.9 + milking * 0.55;

    /* ═══ 5 · STEAM ═══ */
    var st = s.steam;
    /* The plume peaks hard enough to take the frame, but only for
       about a fortieth of the scroll. An earlier balance held a
       1.75 plume across four times that window and blew a third of
       every pixel to white — a whiteout is a cut, and a cut that
       lasts is just an overexposed shot. */
    var plume = ss(0.336, 0.400, t) * 0.50
      + ss(0.552, 0.598, t) * 1.05
      - ss(0.620, 0.658, t) * 1.05
      /* the cup keeps steaming through the bench, but the plume
         thins for the wordmark — steam over letterforms is fog
         over a sign */
      - ss(0.798, 0.845, t) * 0.40;
    st.amt = Math.max(0, plume) + ss(0.900, 0.960, t) * 0.42;
    st.origin[0] = 0; st.origin[1] = 0.10 + lq.y * 0.9; st.origin[2] = 0;
    st.height = lerp(0.95, 2.8, ss(0.548, 0.616, t));
    st.radius = lerp(0.20, 0.62, ss(0.548, 0.616, t));
    st.rise = 1.0 + ss(0.548, 0.620, t) * 0.9;
    /* the plume closes over the lens, then opens onto the room */
    st.wrap = ss(0.578, 0.606, t) * 0.62 * (1 - ss(0.610, 0.642, t));
    st.density = 1;
    /* and on the way out it is asked to hold a shape — placed on
       the falling edge of the whiteout, where there is contrast
       left to spell anything with */
    st.textAmt = ss(0.602, 0.626, t) * (1 - ss(0.634, 0.654, t));
    st.textKey = t < 0.79 ? 'craft' : 'mark';
    mix3(st.tint, [0.62, 0.50, 0.42], [0.88, 0.80, 0.72], lit);
    mix3(st.tintDeep, [0.055, 0.038, 0.030], [0.115, 0.088, 0.074], lit);

    /* ═══ 6 · BENCH ═══ */
    /* the machine is finished with a third of the act still to run,
       so the shot that follows is of a machine, not of a machine
       arriving */
    var build = ss(0.652, 0.734, t);
    var mach = this.stage.machine;
    var mp = {
      time: T, orbitCenter: [-0.2, 1.0, 0],
      assemble: build, assembleStagger: 0.55, settleAngle: true,
      spring: lerp(11, 62, build), damp: lerp(3.4, 12.5, build),
      swirl: lerp(1.2, 0, build), turb: lerp(0.30, 0, build), turbFreq: 0.9,
      drag: lerp(0.5, 1.8, build), gravity: -0.5 * (1 - build),
      radiusMul: lerp(1.6, 1.0, build), orbitSpeed: 0.7, bob: 0.3,
      spinMul: 1, alpha: 1, reveal: 1, revealSoft: 0.3
    };
    mach.boxSteel.update(dt, mp);
    mach.boxDark.update(dt, mp);
    mach.cylSteel.update(dt, mp);
    mach.cylDark.update(dt, mp);
    mach.cylBrass.update(dt, mp);

    /* ═══ 7 · SPLASH ═══ */
    var dropIn = ss(0.804, 0.822, t);
    var freeze = ss(0.826, 0.848, t) * (1 - ss(0.856, 0.872, t));
    var pull = ss(0.862, 0.896, t);
    var dropOut = 1 - ss(0.900, 0.930, t);
    sh.droplets = dropIn * dropOut;

    if (pull > 0.001) {
      /* park the letterform cloud in front of the lens, sized to
         the frame — the words are always legible because they are
         built in camera space, not placed in the world and hoped for */
      var txt = this.stage.texts.mark;
      if (txt) {
        /* Sized so a droplet is narrower than a letter stroke.
           At the previous scale each drop was about three times the
           width of the stem of an N, and two thousand of them
           filled the word's bounding box into a solid bar. */
        this.placeInFront(this.tmpM, 2.60, 0.60);
        this.stage.drops.cloudFlat(txt.cloud.pos, txt.cloud.count, this.tmpM);
      }
    }

    this.stage.drops.update(dt, {
      time: T,
      orbitCenter: [0, 0.62, 0],
      assemble: pull,
      assembleStagger: 0.35,
      spring: lerp(2.0, 30, pull),
      damp: lerp(1.6, 9.5, pull),
      swirl: 0.6 * (1 - pull),
      turb: 0.25 * (1 - pull) * (1 - freeze),
      drag: lerp(0.35, 1.4, pull),
      gravity: -2.6 * (1 - freeze) * (1 - pull),
      radiusMul: 1.1, orbitSpeed: 0.9, bob: 0.1,
      spinMul: 1.4, freeze: freeze * 0.97,
      scaleMul: lerp(1, 0.46, pull),
      alpha: sh.droplets, reveal: dropIn, revealSoft: 0.4
    });

    /* ═══ powders ═══ */
    sh.powder = ss(0.446, 0.486, t) * (1 - ss(0.540, 0.570, t)) * 0.9
      + ss(0.700, 0.740, t) * (1 - ss(0.786, 0.810, t)) * 0.8;
    sh.grounds = ss(0.664, 0.700, t) * (1 - ss(0.776, 0.800, t));

    this.stage.dust.update(dt, {
      time: T, orbitCenter: [0, 1.0, 0], assemble: 0,
      spring: 1.2, damp: 1.4, swirl: 0.10, turb: 0.06, turbFreq: 0.35,
      drag: 0.9, gravity: 0.010, radiusMul: 1, orbitSpeed: 0.5, bob: 0.5,
      spinMul: 0.3, alpha: 1, reveal: 1
    });
    this.stage.powder.update(dt, {
      time: T, orbitCenter: [0, 1.25, 0], assemble: 0,
      spring: 0.8, damp: 1.1, swirl: 0.55, turb: 0.30, turbFreq: 1.4,
      drag: 1.5, gravity: -0.16, radiusMul: 0.9, orbitSpeed: 1.1, bob: 0.3,
      spinMul: 2.0, alpha: 1, reveal: 1
    });
    this.stage.grounds.update(dt, {
      time: T, orbitCenter: [1.2, 0.9, 0.1], assemble: 0,
      spring: 0.7, damp: 1.0, swirl: 0.9, turb: 0.45, turbFreq: 1.9,
      drag: 1.3, gravity: -0.34, radiusMul: 0.8, orbitSpeed: 1.4, bob: 0.2,
      spinMul: 3.0, alpha: 1, reveal: 1
    });

    /* ═══ 8 · CODA ═══
       Cups turning on their own momentum. Nothing drives the
       rotation once it is set going — it is a nudge and then
       drag, which is why they never quite agree with each other. */
    var codaIn = ss(0.898, 0.936, t);
    if (this.edge('coda', t > 0.900)) {
      for (var fi = 0; fi < this.floaters.length; fi++) {
        this.floaters[fi].rotVel = 0.55 + fi * 0.22;
        this.floaters[fi].tiltVel = (fi % 2 ? 1 : -1) * 0.35;
      }
    }
    var out = s.floatCups;
    out.length = 0;
    for (var f = 0; f < this.floaters.length; f++) {
      var fl = this.floaters[f];
      fl.rotVel *= Math.exp(-0.42 * dt);
      fl.rot += fl.rotVel * dt;
      fl.tiltVel *= Math.exp(-0.75 * dt);
      fl.tilt += fl.tiltVel * dt;
      fl.tilt += (0 - fl.tilt) * (1 - Math.exp(-0.8 * dt));   /* rights itself */
      fl.fade = codaIn;
      fl.pos[0] = fl.home[0] + Math.sin(T * 0.31 + fl.phase) * 0.045;
      fl.pos[1] = fl.home[1] + Math.sin(T * 0.44 + fl.phase * 1.7) * 0.055;
      fl.pos[2] = fl.home[2] + Math.cos(T * 0.27 + fl.phase) * 0.045;
      if (fl.fade > 0.004) out.push(fl);
    }
    sh.floatCups = codaIn;

    /* the hero cup drifts up and turns as the room takes over */
    s.cup.pos[1] = ss(0.900, 0.980, t) * 0.30;
    s.cup.spin = ss(0.860, 1.0, t) * 0.9 + Math.sin(T * 0.2) * 0.02;
    s.cup.tilt = ss(0.900, 0.985, t) * 0.10;

    /* ═══ grade ═══ */
    var post = s.post;
    post.exposure = lerp(1.05, 0.80, lit) * (1 + M.arc(r(0.596, 0.640, t)) * 0.10);
    post.bloom = lerp(0.48, 0.40, lit) + st.amt * 0.05;
    post.rays = lerp(0.10, 0.85, reveal);
    post.vignette = lerp(0.62, 0.40, lit);
    post.grain = lerp(0.055, 0.030, lit);
    post.aberration = 0.0022 + Math.abs(vel) * 0.02 + r(0.586, 0.626, t) * 0.004;
    post.warmth = lerp(0.55, 0.30, lit);
    /* the only cut in the film: black on either end of the reel */
    post.fade = (1 - ss(0.0, 0.010, t)) * 0.0 + ss(0.992, 1.0, t) * 0.22;
  };

  /* Build a matrix that maps the -aspect..aspect × -1..1 text plane
     into world space, centred `dist` in front of the camera and
     facing it. */
  Timeline.prototype.placeInFront = function (out, dist, scale) {
    var s = this.stage.state, m = this.stage._m;
    var right = [m.view[0], m.view[4], m.view[8]];
    var up = [m.view[1], m.view[5], m.view[9]];
    var fwd = [-m.view[2], -m.view[6], -m.view[10]];
    var o = [
      s.cam.pos[0] + fwd[0] * dist,
      s.cam.pos[1] + fwd[1] * dist,
      s.cam.pos[2] + fwd[2] * dist
    ];
    out[0] = right[0] * scale; out[1] = right[1] * scale; out[2] = right[2] * scale; out[3] = 0;
    out[4] = up[0] * scale; out[5] = up[1] * scale; out[6] = up[2] * scale; out[7] = 0;
    out[8] = fwd[0] * scale; out[9] = fwd[1] * scale; out[10] = fwd[2] * scale; out[11] = 0;
    out[12] = o[0]; out[13] = o[1]; out[14] = o[2]; out[15] = 1;
    return out;
  };

  Timeline.ACT = ACT;
  PEET.Timeline = Timeline;

})(window);
