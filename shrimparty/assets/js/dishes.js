/* ═══════════════════════════════════════════════════════════
   dishes.js — thirty plates, and thirty things they do.

   A plate is a bag of parts. A part is a lump of geometry with
   a material, a resting place, and a spring pulling it towards
   wherever its dish's choreography says it should be right now.
   Nothing here animates a property directly; every act in this
   file works by *moving a target*, and the physics decides how
   the thing gets there. That is why a shrimp lifted out of a
   bucket carries the swing it had on the way up, and why
   letting go of a shell drops it rather than tweening it home.

   The rule the brief insisted on, and the one that shaped the
   file: **no two dishes move the same way.** There are thirty
   acts below and they are thirty functions, not one function
   with a switch. A tagine opens because the lid is a part with
   mass and a hinge. A basket shakes because that is what you do
   with a basket. Soup does not rise, separate or orbit — soup
   sits there and steams, and something moves under the surface.
   The test for each one was: would this motion make sense if
   the dish were on a table in front of you?

   Where a dish would have been better served by *less*, it got
   less. Steamed white rice steams. That is the whole act.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var M = SP.M, F = SP.Forms;
  var m4 = M.m4, quat = M.quat, v3 = M.v3;
  var TAU = Math.PI * 2, PI = Math.PI;
  var D = (SP.Dishes = {});

  /* ══════════════════════════════════════════════════════════
     MATERIALS

     Albedo is linear, so these hex values are converted rather
     than used raw: #E2551F is not 0.886 in the shader. Roughness
     and wetness are the two numbers that actually decide whether
     something looks edible, and they are set per material rather
     than shared, because a boiled shell and a fried shell are
     not the same surface even when they are the same colour.
     ══════════════════════════════════════════════════════════ */

  function mtl(hex, rough, o) {
    var n = parseInt(hex.slice(1), 16);
    var f = function (v) { return Math.pow(v / 255, 2.2); };
    var m = {
      r: f((n >> 16) & 255), g: f((n >> 8) & 255), b: f(n & 255),
      rough: rough, metal: 0, wet: 0, sss: 0, seed: 0, emis: 0, crust: 0, sauce: 0, hi: 0
    };
    if (o) for (var k in o) m[k] = o[k];
    return m;
  }

  /* a copy with overrides — parts mutate `hi` and `seed`, so
     nothing may share a material record */
  function of(base, o) {
    var m = {};
    for (var k in base) m[k] = base[k];
    if (o) for (var j in o) m[j] = o[j];
    return m;
  }
  D.of = of;

  var MTL = D.MTL = {
    /* ── boiled shellfish ── */
    /* `band` is the pale membrane at a shell plate's leading
       lip. It is a property of the shell, not a second material,
       which is why every plate on a shrimp is the same colour. */
    shrimpShell:  mtl('#C4481D', .44, { wet: .62, sss: .18, crust: .13, sauce: .9 }),
    shrimpBand:   mtl('#B84420', .46, { wet: .60, sss: .22, crust: .13, sauce: 1 }),
    shrimpMeat:   mtl('#D8A491', .54, { wet: .44, sss: .70, crust: .08 }),
    shrimpTail:   mtl('#B23718', .34, { wet: .70, sss: .55, sauce: .7 }),
    shrimpLeg:    mtl('#D2895E', .48, { wet: .48, sss: .50 }),
    crabShell:    mtl('#BE3D1A', .40, { wet: .68, sss: .10, crust: .16 }),
    crabJoint:    mtl('#E0BB94', .44, { wet: .62, sss: .25, crust: .10 }),
    lobsterShell: mtl('#AB2B14', .36, { wet: .72, sss: .12, crust: .14 }),
    lobsterMeat:  mtl('#EBCBBB', .46, { wet: .55, sss: .78 }),
    musselOut:    mtl('#241B22', .18, { wet: .88 }),
    musselIn:     mtl('#E7DCE2', .10, { wet: .55, sss: .25 }),
    musselMeat:   mtl('#DE8C42', .34, { wet: .82, sss: .55 }),
    calamari:     mtl('#EFE2CE', .32, { wet: .80, sss: .45 }),

    /* ── fried ── */
    breading:     mtl('#C4802F', .62, { wet: .34, crust: .55 }),
    breadingDark: mtl('#9C5C1E', .58, { wet: .38, crust: .62 }),
    friedShell:   mtl('#D3873A', .55, { wet: .40, crust: .45, sss: .12 }),

    /* ── fish ── */
    fishFlesh:    mtl('#F0E7DB', .48, { wet: .55, sss: .55 }),
    salmon:       mtl('#E5714A', .42, { wet: .68, sss: .60 }),
    salmonSkin:   mtl('#3A3E42', .30, { wet: .70 }),
    seabass:      mtl('#EFE9DF', .46, { wet: .50, sss: .50 }),

    /* ── vegetables and garnish ── */
    potato:       mtl('#DFC188', .60, { wet: .58, sss: .20 }),
    corn:         mtl('#EFC03A', .40, { wet: .74, sss: .35 }),
    lemon:        mtl('#EFCE33', .34, { wet: .55, sss: .90 }),
    lemonPith:    mtl('#F6F0DC', .70, { sss: .55 }),
    herb:         mtl('#3B7530', .46, { wet: .55, sss: .70 }),
    lettuce:      mtl('#77B545', .42, { wet: .62, sss: .88 }),
    romaine:      mtl('#B9D66B', .44, { wet: .58, sss: .90 }),
    parmesan:     mtl('#EFE1BE', .58, { sss: .40 }),
    onion:        mtl('#F2E9DC', .44, { wet: .70, sss: .60 }),
    mint:         mtl('#4E9B3E', .40, { wet: .60, sss: .80 }),

    /* ── sauces, liquids, starch ── */
    sauceRed:     mtl('#98230F', .16, { wet: 1, sauce: 1 }),
    sauceCream:   mtl('#E3C89E', .18, { wet: 1, sauce: 1 }),
    sauceCajun:   mtl('#CE6A1B', .14, { wet: 1, sauce: 1 }),
    sauceCheese:  mtl('#E9BF57', .22, { wet: 1, sauce: 1 }),
    brothCream:   mtl('#DFC499', .13, { wet: 1, sauce: 1 }),
    brothRed:     mtl('#9E2A14', .12, { wet: 1, sauce: 1 }),
    juice:        mtl('#E2820F', .06, { wet: 1, sauce: .6 }),
    mojito:       mtl('#9FCB63', .05, { wet: 1, sauce: .8 }),
    soda:         mtl('#B4442A', .05, { wet: 1, sauce: 1 }),
    tea:          mtl('#8A4A1C', .06, { wet: 1, sauce: .5 }),
    water:        mtl('#C9DDE4', .04, { wet: 1, sauce: .3 }),
    cheeseMelt:   mtl('#EBBE58', .24, { wet: .92, sss: .35 }),
    rice:         mtl('#F2EDE2', .58, { wet: .30, sss: .30 }),
    bread:        mtl('#D5AE76', .70, { crust: .30, sss: .12 }),
    seasoning:    mtl('#7B2A11', .52, { wet: .35 }),
    seasoningPale:mtl('#C08B49', .55, { wet: .30 }),

    /* ── things that are not food ── */
    steel:        mtl('#C2C7CC', .30, { metal: .95 }),
    steelWorn:    mtl('#B4BABF', .42, { metal: .88 }),
    castIron:     mtl('#26241F', .48, { metal: .85 }),
    clay:         mtl('#8E3A20', .42),
    clayGlaze:    mtl('#E8DCC4', .16),
    ceramic:      mtl('#F3F0E9', .14),
    wood:         mtl('#4A2E1B', .58),
    board:        mtl('#4B3120', .60, { wet: .10 }),
    glassMat:     mtl('#D5E4EC', .03, { wet: 1 }),
    canMetal:     mtl('#B9BEC2', .22, { metal: 1 }),
    canLabel:     mtl('#B0331F', .38),
    ice:          mtl('#DCEAF2', .05, { wet: 1, sss: .7 })
  };

  /* ══════════════════════════════════════════════════════════
     GEOMETRY REGISTRY

     Forms are built once, cached here so the CPU side can read
     things like a shell plate's origin, and handed to the stage
     as factories so the GPU side gets the identical mesh.
     ══════════════════════════════════════════════════════════ */

  var cache = Object.create(null);
  function geo(key, make) {
    var g = cache[key];
    if (!g) { g = cache[key] = make(); }
    return g;
  }
  D.geo = geo;

  /* how the shrimp is cut up. Six plates, and the CPU needs
     their origins to assemble one. */
  var PLATES = 6;
  var plateOrigins = [];
  for (var pi = 0; pi < PLATES; pi++) {
    (function (k) {
      var g = geo('shrimpPlate' + k, function () {
        return F.shrimpPlate(k, { seed: 1.7, bend: 2.5, plates: PLATES, open: .15 });
      });
      plateOrigins.push(g.origin);
    })(pi);
  }
  var tailAt = (function () {
    /* the tail joint, in shrimp-local space */
    var a = -0.35 + 2.5, r = 0.62 - 0.09;
    return [Math.cos(a) * r - Math.cos(-0.35) * 0.62,
            Math.sin(a) * r - Math.sin(-0.35) * 0.62, 0];
  })();
  D.plateOrigins = plateOrigins;
  D.tailAt = tailAt;

  D.registerForms = function (stage) {
    var reg = {
      shrimpMeat:    function () { return F.shrimpMeat({ seed: 1.7, bend: 2.5, plates: PLATES }); },
      shrimpHead:    function () { return F.shrimpHead({ seed: 1.7, bend: 2.5 }); },
      shrimpTail:    function () { return F.shrimpTail({ seed: 1.7 }); },
      shrimpLegs:    function () { return F.shrimpLegs({ seed: 1.7, bend: 2.5 }); },
      shrimpAntennae:function () { return F.shrimpAntennae({ seed: 1.7 }); },
      musselShell:   function () { return F.musselShell({ seed: 2.2 }); },
      musselMeat:    function () { return F.musselMeat({ seed: 2.2 }); },
      crabBody:      function () { return F.crabBody({ seed: 3.1 }); },
      crabClaw:      function () { return F.crabClaw({ seed: 3.1 }); },
      crabLeg:       function () { return F.crabLeg({ seed: 3.1 }); },
      lobsterTail:   function () { return F.lobsterTail({ seed: 4.5 }); },
      lobsterCarapace:function(){ return F.lobsterCarapace({ seed: 4.5 }); },
      lobsterClaw:   function () { return F.lobsterClaw({ seed: 4.5 }); },
      potato:        function () { return F.potato({ seed: 5.5 }); },
      potato2:       function () { return F.potato({ seed: 8.1 }); },
      corn:          function () { return F.corn({}); },
      lemon:         function () { return F.lemonWedge({}); },
      herb:          function () { return F.herb({ seed: 6.6 }); },
      herb2:         function () { return F.herb({ seed: 9.2 }); },
      lettuce:       function () { return F.lettuce({ seed: 7.3 }); },
      lettuce2:      function () { return F.lettuce({ seed: 2.9 }); },
      shard:         function () { return F.shard({ seed: 8.8 }); },
      crumb:         function () { return F.crumb({ seed: 1.4 }); },
      fleck:         function () { return F.fleck(2.6); },
      ringSmall:     function () { return F.ring(.16, .045, { crust: .5, seed: 3.3, squash: .25 }); },
      ringPlain:     function () { return F.ring(.15, .042, { crust: .12, seed: 5.9, squash: .3 }); },
      fillet:        function () { return F.fillet({ seed: 4.1 }); },
      filletBreaded: function () { return F.fillet({ seed: 6.2, breaded: true }); },
      fishFinger:    function () { return F.fishFinger({ seed: 3.8 }); },
      fishChunk:     function () { return F.fishChunk({ seed: 7.7 }); },
      bucket:        function () { return F.bucket({}); },
      bucketWide:    function () { return F.bucket({ r: 1.16, h: .78 }); },
      bowl:          function () { return F.bowl({}); },
      plate:         function () { return F.plate({}); },
      basket:        function () { return F.basket({}); },
      tagineBase:    function () { return F.tagineBase({}); },
      tagineLid:     function () { return F.tagineLid({}); },
      sizzlePlate:   function () { return F.sizzlePlate({}); },
      glass:         function () { return F.glass({}); },
      bottle:        function () { return F.bottle({}); },
      can:           function () { return F.can({}); },
      spoon:         function () { return F.spoon({}); },
      bread:         function () { return F.bread({ seed: 2.1 }); },
      rice:          function () { return F.riceGrain(); },
      ice:           function () { return F.ice({ seed: 3.4 }); },
      liquid:        function () { return F.disc(1, 22, 40, {}); },
      table:         function () { return F.table(26, { n: 54 }); },
      board:         function () { return F.slab(2.4, .09, 1.5, { nu: 10, nv: 6, round: .18, crown: 0 }); }
    };
    for (var k = 0; k < PLATES; k++) {
      (function (j) { reg['shrimpPlate' + j] = function () { return geo('shrimpPlate' + j, function () { return F.shrimpPlate(j, { seed: 1.7, bend: 2.5, plates: PLATES, open: .15 }); }); }; })(k);
    }
    for (var key in reg) {
      (function (kk, fn) { stage.form(kk, function () { return geo(kk, fn); }); })(key, reg[key]);
    }
    D.factories = reg;
    D.computeBounds(reg);
  };

  /* Half-extents of every form, measured off the vertices once.

     A part's `radius` is what the ray test picks against — it is
     a hand-set convex approximation and it is deliberately not
     the true size of the object. Framing a shot off it produced
     a camera that thought a bowl and a highball glass were the
     same shape, so anything that needs the real size of a form
     asks here instead. */
  D.bounds = Object.create(null);
  D.computeBounds = function (reg) {
    for (var key in reg) {
      if (D.bounds[key]) continue;
      var g = geo(key, reg[key]);
      var bx = 0, by = 0, bz = 0, lo = 1e9;
      for (var i = 0; i < g.verts.length; i += 8) {
        var x = Math.abs(g.verts[i]), y = g.verts[i + 1], z = Math.abs(g.verts[i + 2]);
        if (x > bx) bx = x;
        if (y > by) by = y;
        if (y < lo) lo = y;
        if (z > bz) bz = z;
      }
      D.bounds[key] = { x: bx, y: by, z: bz, low: lo };
    }
  };

  /* ══════════════════════════════════════════════════════════
     PARTS AND PHYSICS

     One integrator for everything. A part is a mass on a spring
     towards a target, with drag; `weight` is how much of gravity
     it feels once it has been let go of, and it is the number
     that makes a lobster claw fall differently from a flake of
     parmesan.
     ══════════════════════════════════════════════════════════ */

  function Part(key, mat, opt) {
    opt = opt || {};
    this.key = key;
    this.mtl = of(mat, { seed: opt.seed === undefined ? Math.random() * 9 : opt.seed });
    this.home = opt.home || [0, 0, 0];
    this.homeQ = opt.homeQ || [0, 0, 0, 1];
    this.scale = opt.scale || [1, 1, 1];

    this.pos = this.home.slice();
    this.vel = [0, 0, 0];
    this.q = this.homeQ.slice();
    this.spin = opt.spin ? opt.spin.slice() : [0, 0, 0];

    this.target = this.home.slice();
    this.targetQ = this.homeQ.slice();

    this.k = opt.k || 26;            /* spring stiffness */
    this.damp = opt.damp || 7.2;
    this.weight = opt.weight === undefined ? 1 : opt.weight;
    this.radius = opt.radius || .12;
    /* What the ray test picks against, which is not the same
       number as what the collision pass pushes against. A
       shrimp's body is a sixteen-centimetre curve but its
       collision sphere is a third of that, because a bigger one
       would shove the next shrimp out of the bucket. Sharing one
       radius meant you had to click within eight centimetres of
       a shrimp's middle to open it, and the signature interaction
       on the site felt broken rather than fussy. */
    this.pickR = opt.pickR || this.radius;

    this.id = opt.id || null;        /* pickable when set */
    this.label = opt.label || null;  /* what it is, for the ingredient readout */
    this.hover = 0;
    this.sel = 0;
    this.free = 0;                   /* 1 once thrown to gravity */
    this.held = false;
    this.floor = opt.floor === undefined ? null : opt.floor;
    /* Whether the separation pass is allowed to push this part
       around. It defaults to "yes if it is big enough to read",
       but every part of an assembled creature except one anchor
       sets it false: the six shell plates of a shrimp overlap
       its meat *by design*, and letting a collision pass see
       them as sixteen colliding lumps blows the shrimp apart on
       the first frame. Ask how it looked: like the hero shot was
       three times too close. */
    this.solid = opt.solid === undefined ? (this.radius >= .045) : opt.solid;
    this.mat = m4.make();
    this.tq = [0, 0, 0, 1];
  }

  Part.prototype.step = function (dt, plate) {
    var i;
    if (this.held) {
      /* dragging: the part chases the pointer hard, and its
         velocity is measured from how far it actually moved so
         that letting go throws it */
      for (i = 0; i < 3; i++) {
        var d = (this.target[i] - this.pos[i]);
        this.vel[i] = d / Math.max(dt, 1e-3) * .35;
        this.pos[i] += d * Math.min(1, dt * 22);
      }
    } else {
      for (i = 0; i < 3; i++) {
        var f = (this.target[i] - this.pos[i]) * this.k;
        if (this.free) f *= .06;
        this.vel[i] += f * dt;
        this.vel[i] -= this.vel[i] * Math.min(1, this.damp * dt * (this.free ? .35 : 1));
      }
      if (this.free) this.vel[1] -= 9.0 * this.weight * dt * .16;
      for (i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;
    }

    /* the floor of whatever it is in — the inside of the bucket,
       the bottom of the bowl, the board */
    var fl = this.floor === null ? plate.floor : this.floor;
    if (fl !== null && this.pos[1] < fl) {
      this.pos[1] = fl;
      if (this.vel[1] < 0) {
        this.vel[1] *= -.24;               /* wet food does not bounce much */
        this.vel[0] *= .68; this.vel[2] *= .68;
        this.spin[0] *= .6; this.spin[2] *= .6;
        if (Math.abs(this.vel[1]) < .12) { this.vel[1] = 0; this.free = 0; }
      }
    }

    /* orientation: spin decays into the target orientation */
    var sl = Math.hypot(this.spin[0], this.spin[1], this.spin[2]);
    if (sl > 1e-4) {
      quat.fromAxisAngle(this.tq, this.spin[0] / sl, this.spin[1] / sl, this.spin[2] / sl, sl * dt);
      quat.mul(this.q, this.tq, this.q);
      quat.norm(this.q, this.q);
      var decay = Math.exp(-(this.free ? .9 : 3.4) * dt);
      this.spin[0] *= decay; this.spin[1] *= decay; this.spin[2] *= decay;
    } else if (!this.held) {
      quat.slerp(this.q, this.q, this.targetQ, Math.min(1, dt * 6.5));
    }

    this.mtl.hi = Math.max(this.hover, this.sel);
  };

  Part.prototype.draw = function (stage, origin) {
    var p = this.pos;
    m4.compose(this.mat, [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]], this.q, this.scale);
    stage.draw(this.key, this.mat, this.mtl, this.id, this.pickR);
  };

  Part.prototype.world = function (origin, out) {
    out[0] = this.pos[0] + origin[0];
    out[1] = this.pos[1] + origin[1];
    out[2] = this.pos[2] + origin[2];
    return out;
  };

  D.Part = Part;

  /* ══════════════════════════════════════════════════════════
     THE PLATE
     ══════════════════════════════════════════════════════════ */

  function Plate(dish, origin) {
    this.dish = dish;
    this.origin = origin || [0, 0, 0];
    this.parts = [];
    this.statics = [];      /* vessels: drawn, never simulated */
    this.liquids = [];
    this.open = 0;          /* 0 on the table, 1 fully open */
    this.t = 0;             /* seconds since it started opening */
    this.floor = 0;
    this.focus = null;      /* the part under inspection */
    this.emit = 0;          /* steam accumulator */
    this.seed = (dish.index * 977 % 1000) / 1000;
    this.rnd = M.rng(dish.index * 7919 + 13);
    this.shrimpOpen = 0;    /* the break-apart, 0..1 */
    this.scratch = [0, 0, 0];
    this.cool = 0;
  }

  Plate.prototype.add = function (part) { this.parts.push(part); return part; };

  Plate.prototype.stat = function (key, pos, q, scale, mat) {
    var m = m4.make();
    m4.compose(m, pos, q || [0, 0, 0, 1], scale || [1, 1, 1]);
    this.statics.push({ key: key, mat: m, mtl: mat });
    return m;
  };

  Plate.prototype.liq = function (key, pos, scale, mat) {
    var m = m4.make();
    m4.compose(m, pos, [0, 0, 0, 1], scale);
    this.liquids.push({ key: key, mat: m, mtl: of(mat) });
    return m;
  };

  Plate.prototype.byId = function (id) {
    for (var i = 0; i < this.parts.length; i++) if (this.parts[i].id === id) return this.parts[i];
    return null;
  };

  Plate.prototype.step = function (dt, time, ctx) {
    var i, p;
    this.t += dt;
    var act = D.ACTS[this.dish.act];
    if (act) act(this, this.t, this.open, ctx, dt, time);

    for (i = 0; i < this.parts.length; i++) this.parts[i].step(dt, this);

    /* Separation. Not a solver — one pass of pushing overlapping
       pairs apart, which is all a bucket of shrimp needs to stop
       looking like one shrimp drawn sixteen times in the same
       spot.

       Only one part per object runs through it — the anchor —
       and only if it is big enough to read. The biggest bucket
       holds four hundred and seventy-three parts, three hundred
       and forty of which are flecks of seasoning eleven
       millimetres across, and most of the rest are pieces of
       shell that are *supposed* to be interpenetrating whatever
       they are wrapped around. Filtering the list once at build
       time takes that bucket down to about twenty-five. */
    if (this.open > .02) {
      if (!this.solids) {
        this.solids = [];
        for (i = 0; i < this.parts.length; i++) {
          if (this.parts[i].solid) this.solids.push(this.parts[i]);
        }
      }
      for (i = 0; i < this.solids.length; i++) {
        var a = this.solids[i];
        if (a.held) continue;
        for (var j = i + 1; j < this.solids.length; j++) {
          var b = this.solids[j];
          if (b.held) continue;
          var dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
          var d2 = dx * dx + dy * dy + dz * dz;
          var rr = (a.radius + b.radius) * .82;
          if (d2 > rr * rr || d2 < 1e-8) continue;
          var d = Math.sqrt(d2), push = (rr - d) / d * .5 * Math.min(1, dt * 14);
          a.pos[0] -= dx * push; a.pos[1] -= dy * push; a.pos[2] -= dz * push;
          b.pos[0] += dx * push; b.pos[1] += dy * push; b.pos[2] += dz * push;
        }
      }
    }
  };

  Plate.prototype.draw = function (stage) {
    var i, o = this.origin;
    for (i = 0; i < this.statics.length; i++) {
      var s = this.statics[i];
      var m = s.mat;
      /* statics are stored in plate space; shift into the world
         at draw time so a plate can be moved without rebuilding */
      var t = D._tmpMat || (D._tmpMat = m4.make());
      for (var k = 0; k < 16; k++) t[k] = m[k];
      t[12] += o[0]; t[13] += o[1]; t[14] += o[2];
      stage.draw(s.key, t, s.mtl);
    }
    for (i = 0; i < this.liquids.length; i++) {
      var l = this.liquids[i];
      var t2 = D._tmpMat2 || (D._tmpMat2 = m4.make());
      for (var k2 = 0; k2 < 16; k2++) t2[k2] = l.mat[k2];
      t2[12] += o[0]; t2[13] += o[1]; t2[14] += o[2];
      stage.liquid(l.key, t2, l.mtl);
    }
    for (i = 0; i < this.parts.length; i++) this.parts[i].draw(stage, o);
  };

  D.Plate = Plate;

  /* ══════════════════════════════════════════════════════════
     ASSEMBLY HELPERS
     ══════════════════════════════════════════════════════════ */

  /* Put a whole shrimp together out of its parts, at `at`, with
     scale `s`. `broken` marks it as the one that can come apart.

     Returned so a caller can hold on to the plates and the meat:
     the break-apart in `ACTS.riseAndHold` addresses them by
     name, not by index. */
  function shrimp(plate, at, s, opt) {
    opt = opt || {};
    var q = opt.q || [0, 0, 0, 1];
    var seed = opt.seed === undefined ? plate.rnd() * 9 : opt.seed;
    var group = { plates: [], meat: null, tail: null, head: null, legs: null, all: [] };
    var i;

    /* The shrimp's geometry is built from the head outwards, so
       its local origin is at the head and the body hangs off it.
       Placing a shrimp by its head is unusable — you want to put
       it somewhere by its middle — so every local offset is
       taken relative to the body's centroid first. */
    var CENTRE = [-.44, .30, 0];
    function place(local, out) {
      var m = m4.compose(m4.make(), [0, 0, 0], q, [s, s, s]);
      var lx = local[0] - CENTRE[0], ly = local[1] - CENTRE[1], lz = local[2] - CENTRE[2];
      out[0] = at[0] + m[0] * lx + m[4] * ly + m[8] * lz;
      out[1] = at[1] + m[1] * lx + m[5] * ly + m[9] * lz;
      out[2] = at[2] + m[2] * lx + m[6] * ly + m[10] * lz;
      return out;
    }

    for (i = 0; i < PLATES; i++) {
      var home = place(plateOrigins[i], [0, 0, 0]);
      var band = i % 2 === 1;
      var p = new Part('shrimpPlate' + i, band ? MTL.shrimpBand : MTL.shrimpShell, {
        home: home, homeQ: q.slice(), scale: [s, s, s], seed: seed + i * .31,
        radius: .10 * s, weight: .5, k: 34, damp: 8, pickR: .15 * s,
        id: opt.pick ? opt.pick + ':shell' + i : null,
        label: 'Shell, plate ' + (i + 1)
      });
      p.solid = false;
      plate.add(p); group.plates.push(p); group.all.push(p);
    }
    group.meat = plate.add(new Part('shrimpMeat', MTL.shrimpMeat, {
      home: place([0, 0, 0], [0, 0, 0]), homeQ: q.slice(), scale: [s, s, s], seed: seed + 2.2,
      radius: .20 * s, weight: .9, k: 30, damp: 8, pickR: .38 * s,
      id: opt.pick ? opt.pick + ':meat' : null, label: 'The meat'
    }));
    /* the meat is the shrimp's anchor: it is the piece that runs
       the length of the body, so keeping *it* clear of the next
       shrimp keeps the whole shrimp clear */
    group.all.push(group.meat);
    group.head = plate.add(new Part('shrimpHead', MTL.shrimpShell, {
      home: place([0, 0, 0], [0, 0, 0]), homeQ: q.slice(), scale: [s, s, s], seed: seed + 3.3,
      radius: .11 * s, weight: .6, k: 30, damp: 8, pickR: .17 * s,
      id: opt.pick ? opt.pick + ':head' : null, label: 'Head'
    }));
    group.head.solid = false;
    group.all.push(group.head);
    group.tail = plate.add(new Part('shrimpTail', MTL.shrimpTail, {
      home: place(tailAt, [0, 0, 0]), homeQ: q.slice(), scale: [s, s, s], seed: seed + 4.4,
      radius: .09 * s, weight: .25, k: 26, damp: 7, pickR: .14 * s,
      id: opt.pick ? opt.pick + ':tail' : null, label: 'Tail fan'
    }));
    group.tail.solid = false;
    group.all.push(group.tail);
    group.legs = plate.add(new Part('shrimpLegs', MTL.shrimpLeg, {
      home: place([0, 0, 0], [0, 0, 0]), homeQ: q.slice(), scale: [s, s, s], seed: seed + 5.5,
      radius: .07 * s, weight: .18, k: 24, damp: 7, label: 'Swimmerets'
    }));
    group.legs.solid = false;
    group.all.push(group.legs);
    if (opt.antennae) {
      var an = plate.add(new Part('shrimpAntennae', MTL.shrimpLeg, {
        home: place([0, 0, 0], [0, 0, 0]), homeQ: q.slice(), scale: [s, s, s], seed: seed + 6.6,
        radius: .04 * s, weight: .06, k: 18, damp: 5
      }));
      an.solid = false;
      group.all.push(an);
    }
    group.centre = at.slice();
    group.scale = s;
    return group;
  }
  D.shrimp = shrimp;

  function mussel(plate, at, s, opt) {
    opt = opt || {};
    var seed = opt.seed === undefined ? plate.rnd() * 9 : opt.seed;
    var yaw = opt.yaw === undefined ? plate.rnd() * TAU : opt.yaw;
    var base = quat.fromEuler(quat.make(), opt.tilt || 0, yaw, 0);
    var g = { top: null, bottom: null, meat: null, all: [] };
    g.bottom = plate.add(new Part('musselShell', MTL.musselOut, {
      home: at.slice(), homeQ: base.slice(), scale: [s, s, s], seed: seed,
      radius: .16 * s, weight: .7, k: 28, damp: 8, pickR: .26 * s,
      id: opt.pick || null, label: 'Mussel'
    }));
    var upQ = quat.mul(quat.make(), base, quat.fromEuler(quat.make(), 0, 0, PI));
    g.top = plate.add(new Part('musselShell', MTL.musselOut, {
      home: at.slice(), homeQ: upQ, scale: [s, s, s], seed: seed + .4,
      radius: .16 * s, weight: .55, k: 28, damp: 8, label: 'Mussel, top valve'
    }));
    g.meat = plate.add(new Part('musselMeat', MTL.musselMeat, {
      home: [at[0], at[1] + .01 * s, at[2]], homeQ: base.slice(), scale: [s * .92, s * .92, s * .92],
      seed: seed + .8, radius: .10 * s, weight: .6, k: 26, damp: 8, label: 'Mussel meat'
    }));
    g.top.solid = false; g.meat.solid = false;
    g.all = [g.bottom, g.top, g.meat];
    g.baseQ = base; g.upQ = upQ;
    return g;
  }
  D.mussel = mussel;

  function crab(plate, at, s, opt) {
    opt = opt || {};
    var seed = opt.seed === undefined ? plate.rnd() * 9 : opt.seed;
    var yaw = opt.yaw === undefined ? plate.rnd() * TAU : opt.yaw;
    var g = { all: [] };
    var q = quat.fromEuler(quat.make(), (plate.rnd() - .5) * .5, yaw, (plate.rnd() - .5) * .4);
    g.body = plate.add(new Part('crabBody', MTL.crabShell, {
      home: at.slice(), homeQ: q, scale: [s, s, s], seed: seed,
      radius: .20 * s, weight: 1.0, k: 26, damp: 8, pickR: .34 * s,
      id: opt.pick || null, label: 'Crab body'
    }));
    g.all.push(g.body);
    for (var i = 0; i < 2; i++) {
      var a = yaw + (i ? 1 : -1) * .9;
      var cq = quat.fromEuler(quat.make(), (plate.rnd() - .5) * .6, a, (i ? .3 : -.3));
      g.all.push(plate.add(new Part('crabClaw', MTL.crabShell, {
        home: [at[0] + Math.sin(a) * .30 * s, at[1] + .02 * s, at[2] + Math.cos(a) * .30 * s],
        homeQ: cq, scale: [s, s, s], seed: seed + i + 1,
        radius: .17 * s, weight: .8, k: 25, damp: 8, solid: false, pickR: .26 * s,
        id: opt.pick ? opt.pick + ':claw' + i : null, label: 'Claw'
      })));
    }
    for (var j = 0; j < 3; j++) {
      var la = yaw + PI + (j - 1) * .55;
      g.all.push(plate.add(new Part('crabLeg', MTL.crabJoint, {
        home: [at[0] + Math.sin(la) * .22 * s, at[1] - .01 * s, at[2] + Math.cos(la) * .22 * s],
        homeQ: quat.fromEuler(quat.make(), .2, la, 0), scale: [s, s, s], seed: seed + 4 + j,
        radius: .12 * s, weight: .35, k: 24, damp: 7, solid: false, label: 'Leg'
      })));
    }
    return g;
  }
  D.crab = crab;

  function lobster(plate, at, s, opt) {
    opt = opt || {};
    var seed = opt.seed === undefined ? plate.rnd() * 9 : opt.seed;
    var yaw = opt.yaw === undefined ? 0 : opt.yaw;
    var q = quat.fromEuler(quat.make(), 0, yaw, 0);
    var g = { all: [] };
    g.tail = plate.add(new Part('lobsterTail', MTL.lobsterShell, {
      home: at.slice(), homeQ: q.slice(), scale: [s, s, s], seed: seed,
      radius: .32 * s, weight: 1.4, k: 22, damp: 8, pickR: .48 * s,
      id: opt.pick || null, label: 'Tail'
    }));
    g.all.push(g.tail);
    g.head = plate.add(new Part('lobsterCarapace', MTL.lobsterShell, {
      home: [at[0] - Math.cos(yaw) * .30 * s, at[1] + .10 * s, at[2] + Math.sin(yaw) * .30 * s],
      homeQ: q.slice(), scale: [s, s, s], seed: seed + 1.1,
      radius: .28 * s, weight: 1.2, k: 22, damp: 8, solid: false, pickR: .38 * s,
      id: opt.pick ? opt.pick + ':head' : null, label: 'Carapace'
    }));
    g.all.push(g.head);
    for (var i = 0; i < 2; i++) {
      var side = i ? 1 : -1;
      var cq = quat.fromEuler(quat.make(), 0, yaw + side * .55, side * .18);
      g.all.push(plate.add(new Part('lobsterClaw', MTL.lobsterShell, {
        home: [at[0] - Math.cos(yaw) * .62 * s + side * Math.sin(yaw) * .26 * s,
               at[1] + .02 * s,
               at[2] + Math.sin(yaw) * .62 * s + side * Math.cos(yaw) * .26 * s],
        homeQ: cq, scale: [s, s, s], seed: seed + 2 + i,
        radius: .26 * s, weight: 1.1, k: 22, damp: 8, solid: false, pickR: .36 * s,
        id: opt.pick ? opt.pick + ':claw' + i : null, label: 'Claw'
      })));
    }
    return g;
  }
  D.lobster = lobster;

  /* Seasoning. Not a particle system — real flecks with real
     lighting, which is why they catch the lamp when they fall
     past it. They cost one instance each and there is one draw
     call for all of them. */
  function seasoning(plate, n, spread, y, opt) {
    opt = opt || {};
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = plate.rnd() * TAU, r = Math.sqrt(plate.rnd()) * spread;
      var pale = plate.rnd() < .35;
      out.push(plate.add(new Part('fleck', pale ? MTL.seasoningPale : MTL.seasoning, {
        home: [Math.cos(a) * r, y + plate.rnd() * (opt.h || .1), Math.sin(a) * r],
        homeQ: quat.fromEuler(quat.make(), plate.rnd() * TAU, plate.rnd() * TAU, plate.rnd() * TAU),
        scale: [1, 1, 1], seed: plate.rnd() * 9,
        radius: .012, weight: .05, k: 14, damp: 5,
        spin: [(plate.rnd() - .5) * 3, (plate.rnd() - .5) * 3, (plate.rnd() - .5) * 3]
      })));
    }
    return out;
  }
  D.seasoning = seasoning;

  function crumbs(plate, n, spread, y) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = plate.rnd() * TAU, r = Math.sqrt(plate.rnd()) * spread;
      out.push(plate.add(new Part('crumb', plate.rnd() < .5 ? MTL.breading : MTL.breadingDark, {
        home: [Math.cos(a) * r, y + plate.rnd() * .06, Math.sin(a) * r],
        homeQ: quat.fromEuler(quat.make(), plate.rnd() * TAU, plate.rnd() * TAU, 0),
        scale: [1, 1, 1], seed: plate.rnd() * 9,
        radius: .018, weight: .09, k: 16, damp: 5,
        spin: [(plate.rnd() - .5) * 4, (plate.rnd() - .5) * 4, (plate.rnd() - .5) * 4]
      })));
    }
    return out;
  }
  D.crumbs = crumbs;

})(window);
