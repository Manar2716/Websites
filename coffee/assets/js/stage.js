/* ═══════════════════════════════════════════════════════════
   stage.js — the renderer.

   Stage knows how to draw a world; it does not know what happens
   in the film. Every frame it is handed a state object and draws
   exactly that. All authoring lives in timeline.js, which means
   the two can be reasoned about separately: if the cup is in the
   wrong place, that is the timeline; if the cup is the wrong
   material, that is here.

   Pass order, once per frame:
     1  shadow depth      (one directional light, 3×3 PCF)
     2  scene → HDR       (sky, opaque, liquid, transparent)
     3  steam             (raymarched at half res, reads scene depth)
     4  bright → mips     (4 down, 4 up — dual filter bloom)
     5  shafts + streak   (radial blur toward the projected sun)
     6  composite         (aberration, grade, ACES, vignette, grain)
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var NOC = (global.NOC = global.NOC || {});
  var M = NOC.M, GL = NOC.GL, Geo = NOC.Geo, SH = NOC.SH, Tex = NOC.Tex;
  var v3 = M.v3, m4 = M.m4;

  /* ── materials ───────────────────────────────────────────────
     Values are physical-ish and deliberately restrained. Roughness
     below about 0.06 on anything but liquid and glass makes the
     whole frame look like plastic chrome. */

  var MAT = {
    bean:     { base: [0.148, 0.062, 0.030], rough: 0.46, metal: 0.0, mat: 6 },
    beanHero: { base: [0.165, 0.070, 0.034], rough: 0.44, metal: 0.0, mat: 6, detail: 1 },
    beanRaw:  { base: [0.30, 0.24, 0.13],    rough: 0.72, metal: 0.0, mat: 6 },
    ceramic:  { base: [0.86, 0.845, 0.815],  rough: 0.16, metal: 0.0, mat: 1 },
    ceramicD: { base: [0.10, 0.095, 0.092],  rough: 0.22, metal: 0.0, mat: 1 },
    coffee:   { base: [0.055, 0.021, 0.010], rough: 0.20, metal: 0.0, mat: 2 },
    steel:    { base: [0.855, 0.865, 0.875], rough: 0.24, metal: 1.0, mat: 3 },
    steelDim: { base: [0.62, 0.63, 0.645],   rough: 0.42, metal: 1.0, mat: 3 },
    brass:    { base: [0.86, 0.63, 0.31],    rough: 0.26, metal: 1.0, mat: 3 },
    dark:     { base: [0.035, 0.032, 0.030], rough: 0.55, metal: 0.0, mat: 0 },
    rubber:   { base: [0.020, 0.019, 0.018], rough: 0.85, metal: 0.0, mat: 0 },
    table:    { base: [0.115, 0.062, 0.032], rough: 0.45, metal: 0.0, mat: 5 },
    espresso: { base: [0.185, 0.070, 0.028], rough: 0.06, metal: 0.0, mat: 4, alpha: 1 },
    milk:     { base: [0.90, 0.86, 0.79],    rough: 0.08, metal: 0.0, mat: 4, alpha: 1 },
    glass:    { base: [0.85, 0.88, 0.90],    rough: 0.03, metal: 0.0, mat: 7, alpha: 1 }
  };

  /* the cup's inner wall, so the coffee surface always meets the
     ceramic exactly — a liquid disc that floats free of the wall
     is the single most obvious tell in a render like this */
  var INNER = [
    [0.596, 0.700], [0.590, 0.66], [0.572, 0.58], [0.540, 0.44],
    [0.495, 0.30], [0.450, 0.19], [0.420, 0.12], [0.400, 0.095], [0.300, 0.088]
  ];

  function innerRadius(y) {
    if (y >= INNER[0][1]) return INNER[0][0];
    for (var i = 0; i < INNER.length - 1; i++) {
      var a = INNER[i], b = INNER[i + 1];
      if (y <= a[1] && y >= b[1]) {
        var t = (y - b[1]) / ((a[1] - b[1]) || 1e-6);
        return b[0] + (a[0] - b[0]) * t;
      }
    }
    return INNER[INNER.length - 1][0];
  }

  /* ══════════════════════════════════════════════════════════ */

  function Stage(canvas, tier) {
    this.canvas = canvas;
    this.tier = tier;
    this.ok = false;
    this.time = 0;

    var c = GL.context(canvas);
    if (!c) return;
    this.gl = c.gl;
    this.hdr = c.hdr && c.linear16;

    this.state = defaultState();
    this._m = {
      view: m4.make(), proj: m4.make(), viewProj: m4.make(), invViewProj: m4.make(),
      model: m4.make(), normal: new Float32Array(9),
      lightView: m4.make(), lightProj: m4.make(), lightVP: m4.make(),
      tmp: m4.make()
    };
    this._v = { fwd: [0, 0, -1], up: [0, 1, 0], tmp: [0, 0, 0], tmp2: [0, 0, 0] };

    try { this.build(); this.ok = true; }
    catch (e) { this.error = e; if (global.console) console.error(e); }
  }

  function defaultState() {
    return {
      cam: { pos: [0, 0.6, 3.2], target: [0, 0.5, 0], fov: 0.62, roll: 0 },
      sun: { dir: [0.42, 0.62, 0.44], color: [1.9, 1.42, 0.98] },
      env: {
        top: [0.030, 0.024, 0.021], floor: [0.014, 0.009, 0.007],
        window: [1.30, 0.95, 0.62], bounce: [0.10, 0.055, 0.030],
        ambient: [0.9, 0.9, 0.9], rim: [0.34, 0.20, 0.10]
      },
      room: 1, haze: { amt: 0.012, color: [0.09, 0.055, 0.035] },
      fog: [2.4, 0.19],
      shadow: 0.85,
      show: {
        table: 0, saucer: 0, cup: 0, liquid: 0, espresso: 0, milk: 0,
        machine: 0, floatCups: 0, beans: 1, droplets: 0, dust: 1, powder: 0, grounds: 0,
        solo: 1
      },
      solo: { pos: [0, 0.95, 0], scale: 0.115, rot: 0, tilt: 0.3 },
      cup: { pos: [0, 0, 0], scale: 1, tilt: 0, spin: 0 },
      liquid: { y: 0.10, crema: 0, swirl: 0, artReveal: 0, artOpacity: 0, pour: [0, 0], pourAmt: 0 },
      espresso: { pos: [0, 1.5, 0], len: 1, radius: 0.030, deform: [1, 0.35, 0.55, 0] },
      milk: { pos: [0.16, 1.7, 0.05], len: 1.2, radius: 0.026, deform: [1, 0.55, 1.4, 2.1] },
      machine: { pos: [0, 0, 0], rot: 0 },
      floatCups: [],
      steam: {
        amt: 0, origin: [0, 0.72, 0], height: 1.6, radius: 0.34, rise: 1.0,
        wrap: 0, density: 1, textAmt: 0, textKey: 'blank',
        tint: [0.72, 0.62, 0.55], tintDeep: [0.10, 0.075, 0.062]
      },
      post: {
        exposure: 1.0, bloom: 0.62, rays: 0.5, vignette: 0.46,
        grain: 0.045, aberration: 0.0035, fade: 0, warmth: 0.35
      },
      bodies: {}
    };
  }

  /* ── build ───────────────────────────────────────────────── */

  Stage.prototype.build = function () {
    var gl = this.gl, tier = this.tier;

    /* programs */
    var o = SH.obj(false), oi = SH.obj(true), d = SH.depth(false), di = SH.depth(true);
    this.pObj = GL.program(gl, o.vs, o.fs, 'obj');
    this.pObjI = GL.program(gl, oi.vs, oi.fs, 'objInst');
    this.pDepth = GL.program(gl, d.vs, d.fs, 'depth');
    this.pDepthI = GL.program(gl, di.vs, di.fs, 'depthInst');
    this.pSprite = GL.program(gl, SH.sprite.vs, SH.sprite.fs, 'sprite');
    this.pSky = GL.program(gl, SH.fsVS, SH.sky, 'sky');
    this.pSteam = GL.program(gl, SH.fsVS, SH.steam, 'steam');
    this.pBright = GL.program(gl, SH.fsVS, SH.bright, 'bright');
    this.pDown = GL.program(gl, SH.fsVS, SH.down, 'down');
    this.pUp = GL.program(gl, SH.fsVS, SH.up, 'up');
    this.pRays = GL.program(gl, SH.fsVS, SH.rays, 'rays');
    this.pComp = GL.program(gl, SH.fsVS, SH.composite, 'composite');

    this.quad = GL.fullscreen(gl);

    /* ── static geometry ── */
    var beanGeo = Geo.bean(tier.beanSegs, Math.round(tier.beanSegs * 0.66)).finish();
    var cupGeo = Geo.cup(1, tier.cupSegs).finish();
    var saucerGeo = Geo.saucer(1, tier.cupSegs).finish();

    /* The hero bean of act zero gets its own, far denser mesh. It
       is one object filling a third of the frame under a single
       hard light, so the tessellation that is invisible on a bean
       in a crowd of two thousand is a faceted silhouette here. */
    this.mBeanSolo = GL.mesh(gl, Geo.bean(48, 32).finish());
    this.mCup = GL.mesh(gl, cupGeo);
    this.mSaucer = GL.mesh(gl, saucerGeo);
    this.mTable = GL.mesh(gl, Geo.plane(60, 60, 40, 40).finish());
    this.mLiquid = GL.mesh(gl, Geo.disc(1, tier.cupSegs, 0.004).finish());

    this.mEspresso = GL.mesh(gl, Geo.stream(1, function (v) {
      /* a pour is fat at the spout, necks down, then breaks into
         a thread — this is the profile, the wobble is in the shader */
      return 0.020 + 0.016 * Math.exp(-v * 5.5) - 0.006 * v;
    }, 20, 44).finish());
    this.mMilk = GL.mesh(gl, Geo.stream(1, function (v) {
      return 0.026 + 0.020 * Math.exp(-v * 4.0) - 0.008 * v;
    }, 20, 44).finish());

    /* ── instanced pools ── */
    var attribs = [
      { loc: 3, size: 4, offset: 0 },
      { loc: 4, size: 4, offset: 4 },
      { loc: 5, size: 4, offset: 8 },
      { loc: 6, size: 4, offset: 12 }
    ];
    function inst(geo, max) { return GL.mesh(gl, geo).addInstanceAttribs(16, max, attribs); }

    this.mBean = inst(beanGeo, tier.beans);
    this.mDrop = inst(Geo.droplet(12, 9).finish(), tier.drops);

    var quadGeo = Geo.plane(1, 1, 1, 1).rotateX(-Math.PI / 2).finish();
    this.mDust = inst(quadGeo, tier.dust);
    this.mPowder = inst(quadGeo, tier.powder);
    this.mGrounds = inst(quadGeo, tier.powder);

    var partBox = Geo.roundedBox(1, 1, 1, 0.30, 18, 12).finish();
    var partCyl = Geo.cylinder(0.5, 1, 24, true).finish();
    this.mBoxSteel = inst(partBox, 140);
    this.mBoxDark = inst(partBox, 140);
    this.mCylSteel = inst(partCyl, 120);
    this.mCylDark = inst(partCyl, 120);
    this.mCylBrass = inst(partCyl, 60);

    /* ── point clouds: what the crowds assemble into ── */
    this.cupCloud = Geo.samplePoints(cupGeo, 2600, 21);
    this.saucerCloud = Geo.samplePoints(saucerGeo, 900, 22);

    /* ── the crowds ── */
    /* The shell has to bracket the camera, not sit outside it. An
       earlier version ran from 1.6 to 9.5 units with the lens at
       1.6, which put every bean at four metres or further — the
       swarm was mathematically correct and completely invisible,
       a field of sub-pixel specks. Beans now start inside the
       lens's own radius so the crowd passes *through* the shot. */
    this.beans = new NOC.Bodies(tier.beans).shell({
      center: [0, 0, 0], radius: [0.55, 7.0], radiusBias: 0.62,
      height: [-3.2, 4.2], speed: [0.10, 0.42], spin: [0.25, 1.5],
      scale: [0.032, 0.070], reverse: 0.35, seed: 91, jitter: 0.22
    });
    this.beans.cloud(this.cupCloud, 0.026, null);

    this.drops = new NOC.Bodies(tier.drops).shell({
      center: [0, 0.6, 0], radius: [0.2, 2.4], height: [-0.4, 2.2],
      speed: [0.3, 1.1], spin: [1, 4], scale: [0.012, 0.036], seed: 33, jitter: 0.3
    });

    this.dust = new NOC.Bodies(tier.dust, { sprite: true }).shell({
      center: [0, 1.0, 0], radius: [0.3, 7.0], height: [-1.0, 3.6],
      speed: [0.02, 0.13], spin: [0.1, 0.5], scale: [0.006, 0.026], seed: 44
    });
    this.powder = new NOC.Bodies(tier.powder, { sprite: true }).shell({
      center: [0, 1.4, 0], radius: [0.15, 1.5], height: [-0.6, 1.6],
      speed: [0.1, 0.5], spin: [0.4, 2.2], scale: [0.004, 0.016], seed: 55
    });
    this.grounds = new NOC.Bodies(tier.powder, { sprite: true }).shell({
      center: [0, 0.9, 0], radius: [0.2, 2.2], height: [-0.5, 1.4],
      speed: [0.15, 0.7], spin: [0.5, 3.0], scale: [0.004, 0.014], seed: 66
    });

    this.buildMachine();

    /* ── textures ── */
    this.texArt = GL.canvasTexture(gl, Tex.latteArt(tier.artSize));
    this.texts = {};
    this.addText('blank', []);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0, 0, 0, 1);
  };

  /* ── the espresso machine and the grinder ────────────────────
     Roughly 190 parts across five instanced batches. Nothing here
     is a model file: a machine is a stack of boxes and cylinders,
     and the thing that makes it read as machined rather than as
     primitives is the bevel on the box, the bolt heads, the vent
     slots and the brass, all of which are cheap once the parts
     are instanced. */

  Stage.prototype.buildMachine = function () {
    var boxSteel = [], boxDark = [], cylSteel = [], cylDark = [], cylBrass = [];
    var Y = [0, 1, 0], X = [1, 0, 0], Z = [0, 0, 1];
    var i;

    function P(list, x, y, z, sx, sy, sz, axis, ang) {
      list.push({ p: [x, y, z], s: [sx, sy, sz], a: axis || Y, ang: ang || 0 });
    }

    /* ── espresso machine, centred at x = -1.55 ── */
    var MX = -1.55;

    P(boxSteel, MX, 0.62, 0, 1.30, 1.02, 0.96);          /* body */
    P(boxSteel, MX, 1.155, 0, 1.38, 0.06, 1.02);          /* cup-warming deck */
    P(boxSteel, MX - 0.02, 0.70, 0.50, 1.10, 0.66, 0.03); /* front panel */
    P(boxDark,  MX - 0.02, 0.70, 0.516, 0.96, 0.54, 0.02);/* inset */
    P(boxSteel, MX, 0.10, 0, 1.34, 0.10, 1.00);           /* plinth */
    P(boxDark,  MX, 0.175, 0.44, 1.06, 0.05, 0.14);       /* drip tray lip */
    P(boxDark,  MX, 0.20, 0.40, 1.02, 0.10, 0.30);        /* drip tray */

    /* drip grille */
    for (i = 0; i < 13; i++) {
      P(boxSteel, MX - 0.44 + i * 0.073, 0.252, 0.40, 0.040, 0.014, 0.28);
    }
    /* side vents, both flanks */
    for (i = 0; i < 9; i++) {
      P(boxDark, MX - 0.66, 0.44 + i * 0.055, -0.04, 0.02, 0.018, 0.52);
      P(boxDark, MX + 0.66, 0.44 + i * 0.055, -0.04, 0.02, 0.018, 0.52);
    }
    /* rivets around the front bezel */
    for (i = 0; i < 14; i++) {
      var a = (i / 14) * Math.PI * 2;
      P(cylSteel, MX + Math.cos(a) * 0.56, 0.70 + Math.sin(a) * 0.30, 0.53, 0.032, 0.014, 0.032, X, Math.PI / 2);
    }

    /* group head: flange, body, shower screen */
    P(cylSteel, MX, 0.60, 0.60, 0.30, 0.10, 0.30, X, Math.PI / 2);
    P(cylSteel, MX, 0.60, 0.70, 0.24, 0.12, 0.24, X, Math.PI / 2);
    P(cylDark,  MX, 0.60, 0.775, 0.20, 0.03, 0.20, X, Math.PI / 2);

    /* portafilter, locked into the group */
    P(cylSteel, MX, 0.475, 0.775, 0.235, 0.075, 0.235, X, Math.PI / 2);
    P(cylSteel, MX, 0.400, 0.775, 0.205, 0.085, 0.205, X, Math.PI / 2);
    P(cylDark,  MX + 0.235, 0.455, 0.775, 0.055, 0.30, 0.055, Z, Math.PI / 2);
    P(cylDark,  MX + 0.50, 0.455, 0.775, 0.075, 0.075, 0.075, X, Math.PI / 2);
    P(cylSteel, MX - 0.045, 0.335, 0.775, 0.028, 0.075, 0.028);
    P(cylSteel, MX + 0.045, 0.335, 0.775, 0.028, 0.075, 0.028);

    /* steam wand — three segments and a tip */
    P(cylSteel, MX + 0.58, 0.72, 0.42, 0.045, 0.14, 0.045, Z, 0.5);
    P(cylSteel, MX + 0.66, 0.52, 0.42, 0.026, 0.32, 0.026, Z, 0.30);
    P(cylSteel, MX + 0.70, 0.33, 0.42, 0.022, 0.14, 0.022, Z, 0.12);
    P(cylDark,  MX + 0.71, 0.255, 0.42, 0.030, 0.045, 0.030);

    /* pressure gauge and controls */
    P(cylBrass, MX - 0.40, 0.90, 0.53, 0.155, 0.030, 0.155, X, Math.PI / 2);
    P(cylDark,  MX - 0.40, 0.90, 0.545, 0.130, 0.014, 0.130, X, Math.PI / 2);
    P(cylBrass, MX - 0.40, 0.90, 0.556, 0.020, 0.010, 0.020, X, Math.PI / 2);
    for (i = 0; i < 4; i++) {
      P(cylBrass, MX + 0.14 + i * 0.135, 0.92, 0.545, 0.048, 0.024, 0.048, X, Math.PI / 2);
    }
    P(boxDark, MX - 0.02, 1.05, 0.52, 0.42, 0.05, 0.02);   /* nameplate */

    /* cup rail on the warming deck */
    for (i = 0; i < 2; i++) {
      P(cylSteel, MX, 1.215, -0.30 + i * 0.60, 0.022, 1.30, 0.022, Z, Math.PI / 2);
    }
    for (i = 0; i < 4; i++) {
      P(cylSteel, MX - 0.60 + i * 0.40, 1.215, -0.30, 0.020, 0.62, 0.020, X, Math.PI / 2);
    }
    /* feet */
    for (i = 0; i < 4; i++) {
      P(cylDark, MX + (i % 2 ? 0.55 : -0.55), 0.025, (i < 2 ? 0.38 : -0.38), 0.085, 0.05, 0.085);
    }

    /* ── grinder, centred at x = +1.45 ── */
    var GX = 1.45;
    P(cylSteel, GX, 0.045, 0, 0.46, 0.09, 0.46);            /* base */
    P(boxDark,  GX, 0.12, 0.24, 0.40, 0.06, 0.30);          /* tray */
    P(cylSteel, GX, 0.52, 0, 0.30, 0.86, 0.30);             /* column */
    P(cylDark,  GX, 0.30, 0.26, 0.13, 0.34, 0.13, X, 0.35); /* chute */
    P(cylSteel, GX, 0.95, 0, 0.34, 0.10, 0.34);             /* burr housing */
    P(cylBrass, GX, 1.01, 0, 0.355, 0.03, 0.355);           /* adjustment collar */
    for (i = 0; i < 18; i++) {                              /* collar teeth */
      var t = (i / 18) * Math.PI * 2;
      P(cylBrass, GX + Math.cos(t) * 0.355, 1.01, Math.sin(t) * 0.355, 0.028, 0.034, 0.028);
    }
    P(cylDark, GX + 0.34, 0.72, 0.10, 0.05, 0.22, 0.05, Z, 1.15);  /* dosing lever */
    P(cylDark, GX + 0.44, 0.63, 0.10, 0.06, 0.06, 0.06);
    for (i = 0; i < 10; i++) {                              /* body bolts */
      var b = (i / 10) * Math.PI * 2;
      P(cylSteel, GX + Math.cos(b) * 0.30, 0.20, Math.sin(b) * 0.30, 0.030, 0.014, 0.030);
    }

    /* ── the tamper and the knock box, because a bench is not a
       bench with only two machines on it ── */
    P(cylSteel, 0.55, 0.055, -0.75, 0.22, 0.045, 0.22);
    P(cylDark,  0.55, 0.16, -0.75, 0.075, 0.19, 0.075);
    P(cylDark,  0.55, 0.27, -0.75, 0.11, 0.045, 0.11);

    this.machine = {};
    var self = this;
    function pool(list, key) {
      var b = new NOC.Bodies(list.length);
      /* Parts fly in from just outside the frame, not from the far
         side of the room. Scattering them across seven metres is
         physically the same animation and visually an empty shot:
         at the halfway point most of the machine is off-camera and
         the bench looks bare. */
      b.shell({
        center: [-0.6, 0.85, 0], radius: [1.05, 2.3], height: [-0.55, 1.85],
        speed: [0.15, 0.6], spin: [0.8, 3.2], scale: [1, 1], seed: 300 + key.length, jitter: 0
      });
      for (var j = 0; j < list.length; j++) {
        var pt = list[j];
        b.place(j, pt.p, [pt.a[0], pt.a[1], pt.a[2], pt.ang], pt.s, 1);
      }
      self.machine[key] = b;
      return b;
    }
    pool(boxSteel, 'boxSteel');
    pool(boxDark, 'boxDark');
    pool(cylSteel, 'cylSteel');
    pool(cylDark, 'cylDark');
    pool(cylBrass, 'cylBrass');

    this.partCount = boxSteel.length + boxDark.length + cylSteel.length + cylDark.length + cylBrass.length;

    /* the glass hopper is one lathed shell rather than a part, so
       the camera can look through it at the burrs */
    this.mHopper = GL.mesh(this.gl, Geo.lathe([
      [0.055, 0.00], [0.10, 0.05], [0.16, 0.14], [0.24, 0.28],
      [0.30, 0.44], [0.325, 0.60], [0.330, 0.72], [0.315, 0.755]
    ], 40).finish());
  };

  /* ── typography ──────────────────────────────────────────────
     Rebuilt only when the words change: it uploads a texture and
     resamples a point cloud, which is not something to do per
     frame. The steam shader masks against the texture; the
     droplets fly to the cloud. Same image, two consumers. */

  Stage.prototype.addText = function (key, lines) {
    if (this.texts[key]) return this.texts[key];
    var canvas = Tex.typography({
      width: 1024, height: 512, lines: lines,
      family: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    });
    this.texts[key] = {
      canvas: canvas,
      tex: GL.canvasTexture(this.gl, canvas),
      cloud: lines.length
        ? Tex.samplePixels(canvas, this.tier.drops, 7, 2.0)
        : { pos: new Float32Array(3), count: 1 }
    };
    return this.texts[key];
  };

  /* ── sizing ──────────────────────────────────────────────── */

  Stage.prototype.resize = function (cssW, cssH, scale) {
    var gl = this.gl;
    var w = Math.max(2, Math.round(cssW * scale));
    var h = Math.max(2, Math.round(cssH * scale));
    if (this.rtW === w && this.rtH === h) return;
    this.rtW = w; this.rtH = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.aspect = w / h;

    var half = this.hdr;
    var t = this.targets;
    if (t) { for (var k in t) if (t[k] && t[k].dispose) t[k].dispose(); }

    function mk(div, depth) {
      return GL.target(gl, Math.max(2, Math.ceil(w / div)), Math.max(2, Math.ceil(h / div)), { half: half, depth: depth });
    }
    this.targets = {
      main: GL.target(gl, w, h, { half: half, depth: true }),
      steam: mk(this.tier.steamDiv, false),
      bright: mk(2, false),
      d1: mk(4, false), d2: mk(8, false), d3: mk(16, false), d4: mk(32, false),
      u3: mk(16, false), u2: mk(8, false), u1: mk(4, false), u0: mk(2, false),
      rays: mk(4, false)
    };
    if (!this.shadow) this.shadow = GL.shadowTarget(gl, this.tier.shadowSize);
  };

  /* ── camera ──────────────────────────────────────────────── */

  Stage.prototype.updateCamera = function () {
    var s = this.state, m = this._m, v = this._v;
    var up = [0, 1, 0];
    if (s.cam.roll) {
      /* roll about the view axis — a dutch angle, not a scene tilt */
      v3.sub(v.fwd, s.cam.target, s.cam.pos);
      v3.norm(v.fwd, v.fwd);
      v3.cross(v.tmp, v.fwd, [0, 1, 0]);
      v3.norm(v.tmp, v.tmp);
      v3.cross(v.tmp2, v.tmp, v.fwd);
      var c = Math.cos(s.cam.roll), sn = Math.sin(s.cam.roll);
      up = [
        v.tmp2[0] * c + v.tmp[0] * sn,
        v.tmp2[1] * c + v.tmp[1] * sn,
        v.tmp2[2] * c + v.tmp[2] * sn
      ];
    }
    m4.lookAt(m.view, s.cam.pos, s.cam.target, up);
    this.near = 0.03; this.far = 90;
    m4.perspective(m.proj, s.cam.fov, this.aspect, this.near, this.far);
    m4.mul(m.viewProj, m.proj, m.view);
    m4.invert(m.invViewProj, m.viewProj);
    v3.sub(v.fwd, s.cam.target, s.cam.pos);
    v3.norm(v.fwd, v.fwd);

    /* light frustum follows the subject so the shadow map keeps
       its resolution where the film is actually looking */
    var f = s.cam.target;
    var lp = [f[0] + s.sun.dir[0] * 9, f[1] + s.sun.dir[1] * 9, f[2] + s.sun.dir[2] * 9];
    m4.lookAt(m.lightView, lp, f, [0, 1, 0]);
    m4.ortho(m.lightProj, -3.4, 3.4, -3.4, 3.4, 0.6, 20);
    m4.mul(m.lightVP, m.lightProj, m.lightView);
  };

  /* ── uniform blocks shared by every lit draw ─────────────── */

  Stage.prototype.applyLighting = function (p) {
    var s = this.state;
    p.v3('uSunDir', s.sun.dir).v3('uSunColor', s.sun.color)
     .v3('uAmbient', s.env.ambient).v3('uRimColor', s.env.rim)
     .v3('uEnvTop', s.env.top).v3('uEnvFloor', s.env.floor)
     .v3('uEnvWindow', s.env.window).v3('uEnvBounce', s.env.bounce)
     .v3('uCam', s.cam.pos)
     .m4('uViewProj', this._m.viewProj)
     .m4('uShadowMat', this._m.lightVP)
     .f('uShadowStrength', s.shadow)
     .v2('uShadowTexel', 1 / this.tier.shadowSize, 1 / this.tier.shadowSize)
     .tex('uShadowMap', this.shadow.depth, 6)
     /* every sampler the fragment shader declares has to be pointed
        somewhere real on every draw. An unset sampler reads unit 0,
        and unit 0 still holds last frame's scene colour — which is
        the framebuffer being drawn into, i.e. a feedback loop. */
     .tex('uArtTex', this.texArt, 5)
     .v2('uFog', s.fog[0], s.fog[1])
     .f('uTime', this.time);
  };

  Stage.prototype.setMat = function (p, mat, fade, alphaMul) {
    p.v3('uBase', mat.base)
     .f('uRough', mat.rough).f('uMetal', mat.metal)
     .f('uAlpha', (mat.alpha === undefined ? 1 : mat.alpha) * (alphaMul === undefined ? 1 : alphaMul))
     .v3('uEmissive', mat.emissive || [0, 0, 0])
     .i('uMat', mat.mat || 0)
     .f('uFade', fade === undefined ? 1 : fade)
     .f('uDetail', mat.detail || 0)
     .v4('uDeform', 1, 0, 0, 0);
  };

  Stage.prototype.model = function (p, pos, scale, rotY, rotZ) {
    var m = this._m;
    m4.identity(m.model);
    var q = [0, 0, 0, 1];
    if (rotZ) M.quat.fromEuler(q, 0, rotY || 0, rotZ);
    else M.quat.fromAxisAngle(q, 0, 1, 0, rotY || 0);
    var sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
    m4.compose(m.model, pos, q, sc);
    m4.normalMat3(m.normal, m.model);
    p.m4('uModel', m.model).m3('uNormalMat', m.normal);
  };

  /* ── the solid pass, shared by colour and shadow ─────────────
     `shadowPass` swaps the programs but keeps the traversal
     identical, which is the only reliable way to stop shadows
     drifting away from their casters. */

  Stage.prototype.drawSolids = function (shadowPass) {
    var gl = this.gl, s = this.state, sh = s.show;
    var p = shadowPass ? this.pDepth : this.pObj;
    var pi = shadowPass ? this.pDepthI : this.pObjI;
    var self = this;

    p.use();
    if (shadowPass) p.m4('uLightViewProj', this._m.lightVP);
    else this.applyLighting(p);

    function solid(mesh, mat, pos, scale, rotY, rotZ, fade) {
      if (fade !== undefined && fade <= 0.004) return;
      self.model(p, pos, scale, rotY, rotZ);
      if (!shadowPass) self.setMat(p, mat, fade);
      mesh.draw();
    }

    /* the table only exists to receive; it never casts */
    if (!shadowPass && sh.table > 0.004) {
      solid(this.mTable, MAT.table, [0, 0, 0], 1, 0, 0, sh.table);
    }

    if (sh.solo > 0.004) {
      solid(this.mBeanSolo, MAT.beanHero, s.solo.pos, s.solo.scale, s.solo.rot, s.solo.tilt, sh.solo);
    }

    if (sh.saucer > 0.004) solid(this.mSaucer, MAT.ceramic, s.cup.pos, s.cup.scale * 0.82, s.cup.spin, 0, sh.saucer);

    if (sh.cup > 0.004) {
      solid(this.mCup, MAT.ceramic, s.cup.pos, s.cup.scale, s.cup.spin, s.cup.tilt, sh.cup);
    }

    if (sh.machine > 0.004) {
      solid(this.mHopper, MAT.glass, [1.45, 1.02, 0], 1, 0, 0, sh.machine);
    }

    var fc = s.floatCups;
    for (var i = 0; i < fc.length; i++) {
      if (fc[i].fade <= 0.004) continue;
      solid(this.mCup, fc[i].dark ? MAT.ceramicD : MAT.ceramic, fc[i].pos, fc[i].scale, fc[i].rot, fc[i].tilt, fc[i].fade);
    }

    /* ── instanced ── */
    pi.use();
    if (shadowPass) pi.m4('uLightViewProj', this._m.lightVP);
    else { this.applyLighting(pi); }

    function crowd(mesh, bodies, mat, fade) {
      if (fade <= 0.004) return;
      var n = bodies.pack();
      if (!bodies.packed) return;
      mesh.uploadInstances(bodies.buf, n);
      if (!shadowPass) self.setMat(pi, mat, fade);
      mesh.drawInstanced(bodies.packed);
    }

    crowd(this.mBean, this.beans, MAT.bean, sh.beans);

    if (sh.machine > 0.004) {
      crowd(this.mBoxSteel, this.machine.boxSteel, MAT.steel, sh.machine);
      crowd(this.mBoxDark, this.machine.boxDark, MAT.dark, sh.machine);
      crowd(this.mCylSteel, this.machine.cylSteel, MAT.steelDim, sh.machine);
      crowd(this.mCylDark, this.machine.cylDark, MAT.rubber, sh.machine);
      crowd(this.mCylBrass, this.machine.cylBrass, MAT.brass, sh.machine);
    }
  };

  /* ── liquid + transparent ────────────────────────────────── */

  Stage.prototype.drawLiquid = function () {
    var gl = this.gl, s = this.state, sh = s.show;
    if (sh.liquid <= 0.004) return;
    var p = this.pObj;
    p.use();
    this.applyLighting(p);

    var r = innerRadius(s.liquid.y) * s.cup.scale * 0.995;
    var pos = [s.cup.pos[0], s.cup.pos[1] + s.liquid.y * s.cup.scale, s.cup.pos[2]];
    this.model(p, pos, [r, 1, r], s.cup.spin, 0);
    this.setMat(p, MAT.coffee, sh.liquid);
    p.f('uRough', 0.18)
     .v4('uLiquid', 1.0, s.liquid.crema, s.liquid.swirl, s.liquid.artReveal)
     .v4('uPour', s.liquid.pour[0], s.liquid.pour[1], s.liquid.pourAmt, s.liquid.artOpacity)
     .tex('uArtTex', this.texArt, 5);
    this.mLiquid.draw();
  };

  Stage.prototype.drawTransparent = function () {
    var gl = this.gl, s = this.state, sh = s.show;
    var p = this.pObj;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    if (sh.espresso > 0.004 || sh.milk > 0.004) {
      p.use();
      this.applyLighting(p);
      gl.disable(gl.CULL_FACE);

      if (sh.espresso > 0.004) {
        var e = s.espresso;
        this.model(p, e.pos, [e.radius / 0.030, e.len, e.radius / 0.030], 0, 0);
        this.setMat(p, MAT.espresso, sh.espresso);
        p.v4('uDeform', e.deform[0], e.deform[1], e.deform[2], e.deform[3]);
        this.mEspresso.draw();
      }
      if (sh.milk > 0.004) {
        var mk = s.milk;
        this.model(p, mk.pos, [mk.radius / 0.026, mk.len, mk.radius / 0.026], 0, 0);
        this.setMat(p, MAT.milk, sh.milk);
        p.v4('uDeform', mk.deform[0], mk.deform[1], mk.deform[2], mk.deform[3]);
        this.mMilk.draw();
      }
      gl.enable(gl.CULL_FACE);
    }

    /* droplets are solid, but they belong in front of the streams */
    if (sh.droplets > 0.004) {
      gl.depthMask(true);
      var pi = this.pObjI;
      pi.use();
      this.applyLighting(pi);
      var n = this.drops.pack();
      if (this.drops.packed) {
        this.mDrop.uploadInstances(this.drops.buf, n);
        this.setMat(pi, MAT.espresso, sh.droplets);
        pi.i('uMat', 4).f('uRough', 0.05).v4('uDeform', 1, 0, 0, 0);
        this.mDrop.drawInstanced(this.drops.packed);
      }
      gl.depthMask(false);
    }

    /* ── sprites ── */
    var sp = this.pSprite;
    sp.use();
    var m = this._m;
    sp.m4('uViewProj', m.viewProj)
      .v3('uRight', m.view[0], m.view[4], m.view[8])
      .v3('uUp', m.view[1], m.view[5], m.view[9])
      .v3('uSunDir', s.sun.dir).v3('uSunColor', s.sun.color)
      .f('uTime', this.time);

    var self = this;
    function cloudSprites(mesh, bodies, color, fade, kind, soft, additive) {
      if (fade <= 0.004) return;
      var n = bodies.pack();
      if (!bodies.packed) return;
      mesh.uploadInstances(bodies.buf, n);
      gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      sp.v3('uBase', color).f('uFade', fade).i('uKind', kind).f('uSoft', soft);
      mesh.drawInstanced(bodies.packed);
    }

    /* dust is additive — it is light caught in the air, not matter */
    cloudSprites(this.mDust, this.dust, [0.95, 0.72, 0.46], sh.dust, 0, 2.2, true);
    cloudSprites(this.mPowder, this.powder, [0.42, 0.24, 0.11], sh.powder, 1, 1.1, false);
    cloudSprites(this.mGrounds, this.grounds, [0.16, 0.075, 0.038], sh.grounds, 1, 0.9, false);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };

  /* ── frame ───────────────────────────────────────────────── */

  Stage.prototype.render = function (dt) {
    if (!this.ok) return;
    var gl = this.gl, s = this.state, T = this.targets, m = this._m;
    this.time += dt;

    this.updateCamera();

    /* 1 — shadow.
       The shadow map is still bound to its sampler unit from last
       frame's colour pass; leaving it there while writing to its
       own framebuffer is a feedback loop, so release it first. */
    if (s.shadow > 0.001) {
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.shadow.bind();
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      /* front-face culling in the shadow pass pushes acne behind
         the object instead of onto its lit side */
      gl.cullFace(gl.FRONT);
      this.drawSolids(true);
      gl.cullFace(gl.BACK);
    }

    /* 2 — scene */
    T.main.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.pSky.use()
      .m4('uInvViewProj', m.invViewProj)
      .v3('uCam', s.cam.pos).v3('uSunDir', s.sun.dir)
      .v3('uEnvTop', s.env.top).v3('uEnvFloor', s.env.floor)
      .v3('uEnvWindow', s.env.window).v3('uEnvBounce', s.env.bounce)
      .f('uTime', this.time).f('uRoomAmt', s.room)
      .f('uHazeAmt', s.haze.amt).v3('uHazeColor', s.haze.color);
    this.quad.draw();

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    this.drawSolids(false);
    this.drawLiquid();
    this.drawTransparent();

    /* 3 — steam */
    T.steam.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    var st = s.steam;
    this.pSteam.use()
      .m4('uInvViewProj', m.invViewProj)
      .v3('uCam', s.cam.pos).v3('uFwd', this._v.fwd)
      .v3('uSunDir', s.sun.dir).v3('uSunColor', s.sun.color)
      .tex('uDepth', T.main.depth, 0)
      .tex('uTextTex', (this.texts[st.textKey] || this.texts.blank).tex, 1)
      .f('uTime', this.time).f('uNear', this.near).f('uFar', this.far)
      .v3('uOrigin', st.origin)
      .v4('uShape', st.amt, st.height, st.radius, st.rise)
      .v4('uWrap', st.wrap, st.density, st.textAmt, 0)
      .v3('uTint', st.tint).v3('uTintDeep', st.tintDeep)
      .i('uSteps', this.tier.steamSteps);
    this.quad.draw();

    /* 4 — bloom */
    var post = s.post;
    T.bright.bind();
    this.pBright.use()
      .tex('uScene', T.main.color, 0).tex('uSteam', T.steam.color, 1)
      .f('uThreshold', 0.72).f('uKnee', 0.42);
    this.quad.draw();

    var chain = [T.bright, T.d1, T.d2, T.d3, T.d4];
    var i;
    this.pDown.use();
    for (i = 1; i < chain.length; i++) {
      chain[i].bind();
      this.pDown.tex('uTex', chain[i - 1].color, 0)
        .v2('uTexel', 1 / chain[i - 1].w, 1 / chain[i - 1].h);
      this.quad.draw();
    }

    var ups = [T.u3, T.u2, T.u1, T.u0];
    var srcs = [T.d4, T.u3, T.u2, T.u1];
    var prevs = [T.d3, T.d2, T.d1, T.bright];
    this.pUp.use().f('uRadius', 1.15);
    for (i = 0; i < ups.length; i++) {
      ups[i].bind();
      this.pUp.tex('uTex', srcs[i].color, 0).tex('uPrev', prevs[i].color, 1)
        .v2('uTexel', 1 / srcs[i].w, 1 / srcs[i].h);
      this.quad.draw();
    }

    /* 5 — shafts. The sun's screen position drives both the radial
       blur and whether shafts appear at all: behind the camera,
       there is nothing to shaft. */
    var sunW = [s.cam.pos[0] + s.sun.dir[0] * 40, s.cam.pos[1] + s.sun.dir[1] * 40, s.cam.pos[2] + s.sun.dir[2] * 40];
    var sv = [0, 0, 0];
    v3.transformM4(sv, sunW, m.viewProj);
    var sunUv = [sv[0] * 0.5 + 0.5, sv[1] * 0.5 + 0.5];
    var facing = M.sat(v3.dot(this._v.fwd, s.sun.dir) * 2.2);

    T.rays.bind();
    this.pRays.use()
      .tex('uTex', T.d1.color, 0)
      .v2('uSunUv', sunUv[0], sunUv[1])
      .f('uDensity', 0.85).f('uDecay', 0.94).f('uWeight', facing).f('uStreak', 0.55);
    this.quad.draw();

    /* 6 — composite to the screen */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.rtW, this.rtH);
    this.pComp.use()
      .tex('uScene', T.main.color, 0)
      .tex('uSteam', T.steam.color, 1)
      .tex('uBloom', T.u0.color, 2)
      .tex('uRays', T.rays.color, 3)
      .f('uTime', this.time)
      .f('uBloomAmt', post.bloom).f('uRayAmt', post.rays * facing)
      .f('uExposure', post.exposure).f('uVignette', post.vignette)
      .f('uGrain', post.grain).f('uAberration', post.aberration)
      .f('uFadeToBlack', post.fade).f('uWarmth', post.warmth)
      .v2('uRes', this.rtW, this.rtH);
    this.quad.draw();
  };

  Stage.prototype.innerRadius = innerRadius;
  Stage.MAT = MAT;
  NOC.Stage = Stage;

})(window);
