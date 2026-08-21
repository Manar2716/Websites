/* ═══════════════════════════════════════════════════════════
   plate.js — a dish, and taking it apart.

   The brief for this section was "click a dish and it separates
   into its ingredients". The interesting question is what that
   should feel like, and the answer is: like lifting things off a
   plate, not like an explosion diagram.

   Four rules came out of getting it wrong:

   • Nothing travels in a straight line. Everything arcs, because
     a thing being lifted rises before it moves sideways.
   • Nothing arrives at the same time. Parts leave in the order
     you would actually pick them up — the loose things on top
     first, the heavy things underneath last.
   • Nothing bounces. The springs here are just under critically
     damped, so a prawn overshoots by about two per cent and
     settles. Anything springier reads as a cartoon, immediately.
   • Weight decides the arc. A parsley leaf floats up and takes
     its time; a prawn goes up a little and comes down into place.
     Same code, one divisor.

   And a fifth that is not about motion at all: the ingredients
   have to end up somewhere a label can be put. The layout is a
   phyllotaxis spiral within each ingredient and a wave along the
   screen's width between them, which spaces six ingredient
   clusters without any two of them colliding at any camera angle
   the page ever uses.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = (global.SHRIM = global.SHRIM || {});
  var M = SHRIM.M;
  var m4 = M.m4, v3 = M.v3, quat = M.quat;
  var GOLDEN = 2.39996323;

  /* ── choreography ────────────────────────────────────────────
     Six dishes, six ways of coming apart. What varies is where
     the slots are, what order the parts leave in, and how much
     the thing turns on its way. Everything else is shared. */

  /* Six dishes, six ways of coming apart. What varies is where
     the slots sit, what order the parts leave in, and how much the
     thing turns on its way.

     Every number here is a *fraction of the frame*, not a distance
     in the world. `wide` and `depth` are fractions of the half
     width the camera can see at the subject; `hi` and `lo` are
     fractions of the half height, above and below where the camera
     is looking. That is the difference between a layout and a set
     of coordinates: the dishes are shot from six different
     distances, the menu card and the hero are different shapes,
     and a spread written in metres fits exactly one of them. */

  var CHOREO = {
    /* the platter blooms outward from the middle of the table */
    bloom: { spread: 2.05, wide: 0.74, depth: 0.30, hi: 0.46, lo: -0.30, jag: 0.10, spin: 0.5, arc: 1.0,
      order: function (p, r) { return r; } },
    /* the pan lifts as a column, because a pan is deep */
    column: { spread: 1.62, wide: 0.60, depth: 0.24, hi: 0.58, lo: -0.32, jag: 0.16, spin: 0.4, arc: 0.7,
      order: function (p) { return 1 - M.sat(p.home.p[1] * 3.2); } },
    /* the skewers slide apart along their own axis first */
    skewer: { spread: 2.15, wide: 0.76, depth: 0.24, hi: 0.34, lo: -0.26, jag: 0.06, spin: 0.35, arc: 0.55,
      order: function (p) { return M.sat((p.home.p[0] + 1.1) / 2.2); } },
    /* the batter leaves before anything under it does */
    shell: { spread: 1.90, wide: 0.70, depth: 0.28, hi: 0.50, lo: -0.28, jag: 0.12, spin: 0.6, arc: 1.25,
      order: function (p) { return p.group === 'crust' ? 0 : 0.55 + p.home.p[1] * 0.4; } },
    /* the nest turns as it rises, the way a fork turns it */
    unwind: { spread: 1.95, wide: 0.70, depth: 0.28, hi: 0.46, lo: -0.26, jag: 0.13, spin: 1.5, arc: 0.9,
      order: function (p, r) { return p.group === 'pasta' ? 0.35 : r * 0.8; } },
    /* the bowl tips, and what is in it comes out over the lip */
    tip: { spread: 2.00, wide: 0.72, depth: 0.30, hi: 0.48, lo: -0.28, jag: 0.11, spin: 0.5, arc: 0.85,
      order: function (p, r) { return 0.10 + r * 0.7; }, tipVessel: 0.26 }
  };

  /* ── the plate ───────────────────────────────────────────── */

  function Plate(stage, opt) {
    opt = opt || {};
    this.stage = stage;
    this.dish = null;
    this.parts = [];
    this.groups = [];
    this.open = 0;          /* where we are asked to be */
    this._openV = 0;        /* where we actually are */
    this.time = 0;
    this.azimuth = opt.azimuth === undefined ? 0 : opt.azimuth;
    this.pointer = [0, 0];
    this._pointer = [0, 0];
    this.reduced = !!opt.reduced;
    this.idle = opt.idle === undefined ? 1 : opt.idle;

    this._cam = {
      eye: [0, 1.6, 3.2], target: [0, 0.1, 0],
      fov: 0.42, near: 0.14, far: 40,
      focus: 3.3, dofRange: 1.4, dof: 1, maxCoC: 0.9
    };
    this._scene = {
      camera: this._cam, light: SHRIM.LIGHT, grade: Object.create(SHRIM.GRADE),
      parts: this.parts, shadowBox: 1.9, shadowCentre: [0, 0.06, 0],
      /* the table has to be dark well before its own far edge, or
         the edge shows up as a horizon line across the shot */
      fog: [0.035, 0.048], steam: null
    };
    this._q = [0, 0, 0, 1];
    this._p = [0, 0, 0];
    this._s = [1, 1, 1];
  }

  /* ── loading a dish ──────────────────────────────────────────
     Build the parts, then work out where each one goes when the
     dish comes apart. Both happen once, at load: nothing in the
     frame loop allocates or measures. */

  Plate.prototype.load = function (dish) {
    if (this.dish === dish) return;
    this.dish = dish;

    var ctx = SHRIM.makeCtx(this.stage, dish.id.length * 977 + 13);
    /* The table is under every dish, so it is the plate's rather
       than any one dish's. It casts nothing — it is the ground the
       shadows land on — and leaving it out of the shadow pass also
       keeps the light's ortho box fitted to the food rather than
       to twenty-six metres of empty oak. */
    ctx.add('__table', 'table', function () { return SHRIM.K.table(46); },
      SHRIM.MATS.table, { x: 0, y: -0.004, z: 0, s: 1, wobble: 0, noShadow: true });
    dish.build(ctx);

    this.parts.length = 0;
    for (var i = 0; i < ctx.parts.length; i++) this.parts.push(ctx.parts[i]);

    /* groups, in the order the dish declares its ingredients —
       which is the order they will be read out, so it had better
       be the order they are laid out in */
    var declared = dish.ingredients.map(function (g) { return g.key; });
    var byKey = {};
    this.groups = declared.map(function (key, idx) {
      var g = { key: key, idx: idx, parts: [], centre: [0, 0, 0], screen: [0, 0], visible: false };
      byKey[key] = g;
      return g;
    });
    this.parts.forEach(function (p) { if (byKey[p.group]) byKey[p.group].parts.push(p); });

    this.layout();
    this.reset();
    return this;
  };

  /* Where every part goes when the dish is open.

     Recomputed on resize as well as on load, because the frame it
     is laid out inside is the canvas, and the canvas changes shape
     with the window. */
  Plate.prototype.layout = function () {
    var C = CHOREO[this.dish.choreo] || CHOREO.bloom;
    this.choreo = C;

    /* what the camera can see, in world units, at the distance the
       open dish is shot from */
    var dc = this.dish.camera;
    var aspect = this.stage && this.stage.h ? this.stage.w / this.stage.h : 1.45;
    var fit = M.clamp(1.45 / Math.max(aspect, 0.34), 1, 3.0);
    var d = dc.dist * fit * 1.04;
    var halfH = d * Math.tan((dc.fov || 0.42) * 0.5);
    var halfW = halfH * aspect;
    var camY = 0.06 + 0.62;
    this.frame = { halfW: halfW, halfH: halfH, camY: camY };

    /* the camera's basis at the moment of laying out — the spread
       is arranged across the screen, not across the world, or it
       reads as a heap from every angle but one */
    var az = this.azimuth;
    var right = [Math.cos(az), 0, -Math.sin(az)];
    var fwd = [Math.sin(az), 0, Math.cos(az)];
    var up = [0, 1, 0];

    var G = this.groups.length;
    var self = this;

    /* Which ingredient gets which slot along the arc.

       Declaration order — which is reading order, and the order
       the bullet list is in — put the prawns at the far left of
       every dish, because prawns are always declared first. Nine
       prawns is also always the biggest cluster, so every dish
       came apart lopsided, with the whole weight of it in one
       corner and air on the other side.

       The clusters are assigned by size instead: biggest in the
       middle, the rest alternating outward. The labels still read
       in declaration order, because they are anchored to their
       cluster rather than to a position in a row. */
    var bySize = this.groups.map(function (g, i) { return i; });
    bySize.sort(function (a, b) {
      var d = self.groups[b].parts.length - self.groups[a].parts.length;
      return d !== 0 ? d : a - b;
    });
    var slotOf = new Array(G);
    var mid = (G - 1) / 2;
    var order = [];
    for (var k = 0; k < G; k++) {
      var off = Math.ceil(k / 2) * (k % 2 ? -1 : 1);
      order.push(Math.round(mid + off));
    }
    bySize.forEach(function (gi, k) { slotOf[gi] = order[k]; });

    this.groups.forEach(function (g, gi) {
      var i = slotOf[gi];
      /* (i + 0.5)/G rather than i/(G−1): the first and last
         ingredients sit inside the arc rather than at the very
         ends of it, which is what kept walking the biggest
         cluster — the prawns, always declared first — off the
         left edge of frame. */
      var f = (i + 0.5) / G - 0.5;
      var phi = f * C.spread;
      /* An arch, highest in the middle, with every other cluster
         nudged off it so six of them never line up into a row.

         The first version ran a sine along the arc, which over the
         angles actually used is close to monotonic — so the whole
         spread came out as one diagonal streak from bottom left to
         top right. An arch is the shape it wanted: the slots are
         assigned by size, so the biggest cluster is in the middle,
         and the middle is now also the top and the nearest point.
         The dish comes apart and the thing it is mostly made of
         ends up at the apex. */
      var edge = Math.abs(phi) / (C.spread * 0.5 || 1);
      var hf = C.hi - (C.hi - C.lo) * Math.pow(edge, 1.35) + (i % 2 ? -C.jag : C.jag);
      var h = camY + hf * halfH;
      var wide = C.wide * halfW * (1 + (i % 2) * 0.06);
      var deep = C.depth * halfW;

      var cx = right[0] * Math.sin(phi) * wide + fwd[0] * Math.cos(phi) * deep;
      var cz = right[2] * Math.sin(phi) * wide + fwd[2] * Math.cos(phi) * deep;
      g.slot = [cx, h, cz];

      var m = g.parts.length;
      /* Held up for inspection, things are smaller than they were
         on the plate. Nine prawns at plating size cannot be shown
         separately inside one frame without either overlapping or
         leaving it — and shrinking them is what a diagram does
         anyway. Singles barely change; crowds come down by a
         third. */
      /* Held up for inspection, things are smaller than they were
         on the plate. Nine prawns at plating size cannot be shown
         separately inside one frame without either overlapping or
         leaving it — and shrinking them is what a diagram does
         anyway. Singles barely change; crowds come down by half. */
      var shrink = m > 6 ? 0.46 : m > 3 ? 0.62 : m > 1 ? 0.78 : 0.95;

      var big = 0;
      g.parts.forEach(function (p) {
        var sc = p.awayScale === undefined ? shrink : p.awayScale;
        big = Math.max(big, (p.mesh.radius || 1) * p.home.s * sc);
      });
      /* The cluster radius is not a taste decision. Laying m items
         on a phyllotaxis spiral of radius R gives each of them an
         area of πR²/m, so for none of them to intersect, R has to
         be at least `big·√m`. Below that the crowd is a heap; the
         first version capped it well below and nine prawns came
         out as one orange smear. */
      var cluster = m > 1 ? Math.min(big * Math.sqrt(m) * 1.06, halfW * 0.34) : 0;
      g.spreadR = cluster + big;

      g.parts.forEach(function (p, j) {
        var ang = j * GOLDEN;
        var rad = m > 1 ? cluster * Math.sqrt((j + 0.5) / m) : 0;
        var ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad * 0.78;

        p.away = {
          p: [
            g.slot[0] + right[0] * ox + fwd[0] * oy * 0.18,
            g.slot[1] + oy,
            g.slot[2] + right[2] * ox + fwd[2] * oy * 0.18
          ],
          /* turned to present itself: an ingredient held up for
             inspection is turned side-on, not left as it fell */
          e: [
            p.home.e[0] * 0.30 + (self.rnd2(j + i * 31) - 0.5) * 0.55,
            az + 1.15 + (self.rnd2(j + i * 17 + 5) - 0.5) * 1.10,
            p.home.e[2] * 0.30 + (self.rnd2(j + i * 53 + 9) - 0.5) * 0.40
          ],
          s: p.home.s * (p.awayScale === undefined ? shrink : p.awayScale)
        };

        var rel = m > 1 ? j / (m - 1) : 0.5;
        p.delay = M.clamp(C.order(p, rel) * 0.34 + i * 0.030, 0, 0.52);
        /* light things loft, heavy things do not */
        p.loft = C.arc * (0.16 / Math.max(p.weight, 0.15));
        p.spin = C.spin * (0.4 + self.rnd2(j * 7 + i) * 0.9) / Math.max(p.weight, 0.3);
        p.phase = self.rnd2(j * 13 + i * 5) * 6.283;
      });
    });

    /* the vessel: it stays where it is, but a bowl that never
       moves while everything comes out of it reads as a hole in
       the animation, so it tips a few degrees and dims */
    var tip = C.tipVessel || 0;
    this.parts.forEach(function (p) {
      if (p.away) return;
      if (p.group === '__table') {
        p.away = { p: p.home.p.slice(), e: p.home.e.slice(), s: p.home.s };
        p.delay = 0; p.loft = 0; p.spin = 0; p.phase = 0; p.isTable = true;
        return;
      }
      /* The plate or pan is not an ingredient and it is the widest
         thing in the scene, so it goes back and down and out of
         the light rather than sitting in the middle of the spread
         being the brightest object in frame. */
      p.away = {
        p: [p.home.p[0], p.home.p[1] - 0.16, p.home.p[2] - 0.80],
        e: [p.home.e[0] - tip, p.home.e[1], p.home.e[2]],
        s: p.home.s * 0.94
      };
      p.delay = 0;
      p.loft = 0;
      p.spin = 0;
      p.phase = 0;
      p.isVessel = true;
    });
  };

  /* A cheap deterministic hash, so the jitter in the layout is the
     same on every load without carrying a generator around. */
  Plate.prototype.rnd2 = function (i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  /* Called when the canvas changes shape. The parts keep their
     springs and their progress; only where they are heading
     changes, so a dish that is open when the window is dragged
     rearranges rather than jumping. */
  Plate.prototype.relayout = function () {
    if (this.dish) this.layout();
  };

  Plate.prototype.reset = function () {
    this.parts.forEach(function (p) {
      p.u = 0; p.uv = 0;
      p.model = p.model || m4.make();
      p.normalMat = p.normalMat || new Float32Array(9);
    });
    this._openV = this.open;
  };

  Plate.prototype.setOpen = function (v) { this.open = M.sat(v); };
  Plate.prototype.toggle = function () { this.setOpen(this.open > 0.5 ? 0 : 1); };

  /* ── the frame ───────────────────────────────────────────── */

  Plate.prototype.update = function (dt, opt) {
    opt = opt || {};
    /* Reduced motion freezes the wall clock but not the
       interaction: opening a dish is navigation, and refusing to
       animate it would mean refusing to show the ingredients. It
       is shortened and it does not drift, idle or wobble. */
    var wall = this.reduced ? 0 : dt;
    this.time += wall;

    var t = this.open;
    var rate = this.reduced ? 26 : 9.5;
    this._openV = M.damp(this._openV, t, rate, dt);
    var openV = this._openV;

    /* ── camera ──────────────────────────────────────────────
       Pointer parallax is damped rather than followed, so the
       camera has mass. Following the pointer directly is the
       single most common way a 3D scene on a page ends up feeling
       cheap. */
    this._pointer[0] = M.damp(this._pointer[0], this.pointer[0], 4.5, dt);
    this._pointer[1] = M.damp(this._pointer[1], this.pointer[1], 4.5, dt);

    var dc = this.dish.camera;
    var drift = this.reduced ? 0 : this.idle;
    var az = this.azimuth
      + this._pointer[0] * 0.20
      + Math.sin(this.time * 0.13) * 0.032 * drift
      + (opt.azimuth || 0);
    /* Opening the dish moves the camera about as much as a
       photographer would: back a hand's width, not into the next
       room. The spread is laid out to fit the frame it is already
       in, so a big pull-back just makes six ingredients small and
       far away — which is what the first version of this did. */
    /* Every dish was framed on a 3:2 panel. A vertical field of
       view does not care how wide the window is, so on anything
       narrower than that the subject keeps its height and loses
       its edges — which is exactly what a 4:3 menu card and a 5:4
       phone did to a platter. The camera steps back by whatever
       the frame is missing, and never steps closer than the
       framing it was authored at. */
    var aspect = this.stage && this.stage.h ? this.stage.w / this.stage.h : 1.45;
    /* The ceiling is high because a phone held upright is a 0.46
       frame, and covering that from a 1.45 framing takes three
       times the distance. It is only ever a longer lens on the
       same shot. */
    var fit = M.clamp(1.45 / Math.max(aspect, 0.34), 1, 3.0);

    var dist = dc.dist * fit * (1 + openV * 0.04) * (opt.distMul || 1);
    /* The height is scaled by the same `fit` as the distance.

       Pulling back to cover a narrower frame is a longer lens, not
       a different set-up, and the camera's angle to the table
       should not change with it. Left absolute, a phone's
       threefold pull-back dropped the elevation from twenty-one
       degrees to eight and the plate went almost edge-on. */
    var hgt = dc.height * fit * (1 + openV * 0.04)
      + this._pointer[1] * 0.34
      + Math.sin(this.time * 0.093) * 0.022 * drift
      + (opt.height || 0);

    var cam = this._cam;
    /* set before anything reads it: `halfHNow` below is derived
       from the field of view, and taking last frame's would put
       the subject in the wrong place for one frame every time a
       caller changed it */
    cam.fov = (opt.fov || dc.fov || 0.42);
    /* targetX slides the whole frame sideways without turning the
       camera, which is how the hero keeps the dish clear of the
       words: the subject is at the origin and the frame moves off
       it, rather than the dish being moved off its own plate. */
    var tx = opt.targetX || 0;
    cam.eye[0] = Math.sin(az) * dist + tx;
    cam.eye[1] = hgt;
    cam.eye[2] = Math.cos(az) * dist;
    cam.target[0] = tx;
    /* frameY slides the subject up the frame by a fraction of what
       the camera can see, rather than by a distance — the hero on
       a phone needs the dish in the top third and the words under
       it, and "a third of the frame" is the only way to say that
       which survives the camera moving. */
    var halfHNow = dist * Math.tan(cam.fov * 0.5);
    cam.target[1] = 0.06 + openV * 0.62 + (opt.targetY || 0) - (opt.frameY || 0) * halfHNow;
    cam.target[2] = 0;

    /* Focus is measured, not authored.

       It used to be a number per dish, which was correct for
       exactly the camera distance that dish was framed at — and
       the hero pulls its camera back by a factor of one and a
       half, so the whole platter sat a metre and a half behind the
       focal plane and the page opened on a blurred photograph of
       dinner. Taking it off the geometry means any camera any
       part of the page asks for is in focus by construction.

       Closed, that is the dish at the origin. Open, it is the
       spread, which stands about a third of a plate's width in
       front of where the dish was. */
    var fx = cam.eye[0] - cam.target[0];
    var fy = cam.eye[1] - (0.10 + openV * 0.42);
    var fz = cam.eye[2];
    cam.focus = (Math.sqrt(fx * fx + fy * fy + fz * fz) - openV * 0.34) * (opt.focusMul || 1);
    /* The depth of field opens as the camera moves back — but only
       when moving back actually makes the subject smaller. `fit`
       is the opposite case: it pulls back precisely to keep the
       subject the same size in a narrower frame, so it is divided
       back out here. Left in, a phone got three times the depth of
       field and the whole point of shooting food wide open went
       with it. */
    cam.dofRange = M.lerp(dc.range, dc.range * 1.9, openV)
      * M.clamp(dist / (dc.dist * fit), 0.6, 2.2);
    cam.dof = opt.dof === undefined ? 1 : opt.dof;

    /* ── parts ───────────────────────────────────────────────
       One spring per part, integrated at a fixed rate. A spring
       stepped with a variable dt is a spring whose stiffness
       depends on the frame rate, which is how the same animation
       ends up feeling different on two machines. */
    var steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.0125)));
    var sdt = Math.min(dt, 0.05) / steps;
    var stiff = this.reduced ? 420 : 148;
    var damp = this.reduced ? 41 : 22.2;   /* just under critical (2√148 ≈ 24.3) */

    var P = this._p, Q = this._q, S = this._s;
    var i, j, p;

    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      var span = 1 - p.delay;
      var want = M.sat((t - p.delay) / (span || 1));
      for (j = 0; j < steps; j++) {
        var a = (want - p.u) * stiff - p.uv * damp;
        p.uv += a * sdt;
        p.u += p.uv * sdt;
      }
      var u = p.u;
      var eu = M.sat(u);

      var h = p.home, w = p.away;
      /* the arc: up first, across second */
      var lift = Math.sin(M.sat(u) * Math.PI) * p.loft;
      var bob = (this.reduced || p.isVessel) ? 0
        : Math.sin(this.time * 0.72 + p.phase) * 0.010 * eu / Math.max(p.weight, 0.3);

      P[0] = h.p[0] + (w.p[0] - h.p[0]) * u;
      P[1] = h.p[1] + (w.p[1] - h.p[1]) * u + lift + bob;
      P[2] = h.p[2] + (w.p[2] - h.p[2]) * u;

      var ex = h.e[0] + (w.e[0] - h.e[0]) * u;
      var ey = h.e[1] + (w.e[1] - h.e[1]) * u + (this.reduced ? 0 : this.time * 0.05 * p.spin * eu);
      var ez = h.e[2] + (w.e[2] - h.e[2]) * u;
      quat.fromEuler(Q, ex, ey, ez);

      S[0] = S[1] = S[2] = h.s + (w.s - h.s) * u;

      m4.compose(p.model, P, Q, S);
      m4.normalMat3(p.normalMat, p.model);

      p.wobble = this.reduced ? 0 : p.wobbleMax * eu;
      /* the vessel steps back rather than disappearing: it is
         still the plate the food came off */
      p.fade = p.isVessel ? 1 - eu * 0.74 : 1;
      if (p.isTable) { p.fade = 1; p.wobble = 0; }

      p.__wx = P[0]; p.__wy = P[1]; p.__wz = P[2];
    }

    /* ── steam ───────────────────────────────────────────────
       Steam comes off a hot dish, not off six ingredients laid
       out in the air, so it goes out as the dish opens. */
    var st = SHRIM.STEAM[this.dish.id];
    if (st && !this.reduced && opt.steam !== false) {
      var T = SHRIM.STEAM_TINT;
      this._scene.steam = {
        count: st.count, origin: st.origin, radius: st.radius, rise: st.rise,
        size: st.size, life: st.life,
        amount: st.amount * (1 - openV * 0.88) * (opt.steamMul === undefined ? 1 : opt.steamMul),
        tint: T.tint, lit: T.lit, soft: T.soft
      };
    } else {
      this._scene.steam = null;
    }

    /* the grade breathes a little with the interaction: opening a
       dish opens the aperture by a third of a stop, which is what
       lifts the ingredients off the table without touching a light */
    var g = this._scene.grade;
    var base = SHRIM.GRADE;
    g.exposure = base.exposure * (1 + openV * 0.10) * (opt.exposureMul || 1);
    g.bloom = base.bloom * (1 - openV * 0.20);
    g.bloomThreshold = base.bloomThreshold;
    g.vignette = base.vignette * (opt.vignetteMul === undefined ? 1 : opt.vignetteMul);
    g.grain = base.grain;
    g.aberration = base.aberration;
    g.warmth = base.warmth;
    g.lift = base.lift;
    g.fade = opt.fade === undefined ? 1 : opt.fade;

    /* the room closes in as the dish opens: the table falls away
       faster, so six ingredients in the air have something dark
       to be seen against instead of a lit floor */
    this._scene.fog[1] = (0.048 + openV * 0.075) * (opt.fogMul || 1);
    this._scene.shadowBox = 1.9 + openV * 1.5;
    this._scene.shadowCentre[1] = 0.06 + openV * 0.34;

    return this._scene;
  };

  /* ── where to put the labels ─────────────────────────────────
     Each ingredient's cluster centroid, projected. Returned in
     0..1 of the canvas so the caller can place a DOM node without
     knowing anything about the projection — and with the group's
     view depth, so labels for things at the back can be set back
     as well.

     This runs once a frame and reads no layout. */

  Plate.prototype.project = function (out) {
    var m = this.stage._m;
    var vp = m.viewProj;
    var res = out || [];
    res.length = 0;

    for (var i = 0; i < this.groups.length; i++) {
      var g = this.groups[i];
      var n = g.parts.length;
      if (!n) continue;
      var cx = 0, cy = 0, cz = 0;
      for (var j = 0; j < n; j++) {
        cx += g.parts[j].__wx; cy += g.parts[j].__wy; cz += g.parts[j].__wz;
      }
      cx /= n; cy /= n; cz /= n;

      var w = vp[3] * cx + vp[7] * cy + vp[11] * cz + vp[15];
      if (w <= 0.0001) { continue; }
      var x = (vp[0] * cx + vp[4] * cy + vp[8] * cz + vp[12]) / w;
      var y = (vp[1] * cx + vp[5] * cy + vp[9] * cz + vp[13]) / w;

      res.push({
        key: g.key,
        idx: g.idx,
        x: x * 0.5 + 0.5,
        y: 0.5 - y * 0.5,
        depth: w,
        /* which side of frame it is on decides which way its
           leader line runs */
        side: x < 0 ? -1 : 1
      });
    }
    return res;
  };

  /* The tallest point of the dish, projected — used to park the
     hero's caption clear of the food rather than over it. */
  Plate.prototype.top = function () {
    var hi = -1e9;
    for (var i = 0; i < this.parts.length; i++) {
      if (this.parts[i].__wy > hi) hi = this.parts[i].__wy;
    }
    return hi;
  };

  SHRIM.Plate = Plate;
  SHRIM.CHOREO = CHOREO;

})(window);
