/* ═══════════════════════════════════════════════════════════
   scenes.js — what the camera is looking at, and why.

   Two things live in here and they share one renderer, one
   table and one clock, because the whole argument of this site
   is that it is one room you move through rather than a stack
   of sections.

   THE FILM is the top of the page and it is a pure function of
   scroll. One shrimp in the dark, then that shrimp peeling
   itself as you scroll, then the camera pulling back to find
   the bucket it came out of. Scroll up and every bit of it runs
   backwards — the shell plates fly back onto the meat — because
   the peel is a parameter and not a timeline.

   THE TABLE is the menu. Thirty dishes on one board, and the
   camera dollies along it. Whatever is in front of you is live:
   real geometry, real steam, real physics, being simulated at
   that moment. Open it and the camera moves into that dish's
   own shot and its act starts. Nothing here is a picture of a
   dish standing in for the dish.

   Only what is near the camera exists. A window of five plates
   is built and stepped; the rest have not been made yet and are
   thrown away again once you have gone far enough past them.
   That is what keeps a menu of thirty dishes, some of which are
   four hundred simulated parts, inside a frame budget.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var M = SP.M, D = SP.Dishes, F = SP.Forms;
  var m4 = M.m4, quat = M.quat, v3 = M.v3, E = M.E;
  var TAU = Math.PI * 2, PI = Math.PI;

  var RAIL = 3.4;           /* metres between dishes on the board */

  SP.Scenes = function (stage, cam) {
    var reduced = false;

    /* ══════════════════════════════════════════════════════════
       PARTICLES

       Steam, bubbles, oil mist. Condensation is not simulated —
       the beads on a cold can are held in place by the act that
       owns them and drawn straight through, which is why `puff`
       takes a life of zero to mean "this frame only".
       ══════════════════════════════════════════════════════════ */

    var POOL = 1400;
    var px = new Float32Array(POOL), py = new Float32Array(POOL), pz = new Float32Array(POOL);
    var vx = new Float32Array(POOL), vy = new Float32Array(POOL), vz = new Float32Array(POOL);
    var ps = new Float32Array(POOL), pl = new Float32Array(POOL), pa = new Float32Array(POOL);
    var pk = new Float32Array(POOL), pAge = new Float32Array(POOL), pSeed = new Float32Array(POOL);
    var pAlive = new Uint8Array(POOL);
    var cursor = 0, live = 0;

    function puff(x, y, z, size, life, rise, kind, alpha) {
      if (life <= 0) {
        /* immediate: straight to the stage, no simulation */
        stage.sprite(kind, x, y, z, size, 1, 1, 1, alpha, 0, 0, (x * 7 + y * 13) % 1);
        return;
      }
      for (var tries = 0; tries < 24; tries++) {
        var i = cursor; cursor = (cursor + 1) % POOL;
        if (pAlive[i]) continue;
        pAlive[i] = 1; live++;
        px[i] = x; py[i] = y; pz[i] = z;
        var spread = kind === 1 ? .04 : kind === 3 ? .55 : .10;
        vx[i] = (Math.random() - .5) * spread;
        vy[i] = rise * (.7 + Math.random() * .6);
        vz[i] = (Math.random() - .5) * spread;
        ps[i] = size; pl[i] = life; pa[i] = alpha; pk[i] = kind;
        pAge[i] = 0; pSeed[i] = Math.random();
        return;
      }
    }

    function stepParticles(dt, time) {
      if (!live) return;
      for (var i = 0; i < POOL; i++) {
        if (!pAlive[i]) continue;
        pAge[i] += dt;
        var u = pAge[i] / pl[i];
        if (u >= 1) { pAlive[i] = 0; live--; continue; }
        var kind = pk[i];
        if (kind === 1) {
          /* a bubble accelerates as it rises and gets bigger */
          vy[i] += dt * 1.4;
          if (vy[i] > 1.5) vy[i] = 1.5;
        } else if (kind === 3) {
          /* oil mist is ballistic and short */
          vy[i] -= dt * 2.6;
        } else {
          /* steam slows, spreads and wanders. The wander is
             the same curl field the shader's noise uses, so
             the plume's shape and its motion agree. */
          var c = M.noise3(px[i] * 1.7, py[i] * 1.7 + time * .35, pz[i] * 1.7) - .5;
          var c2 = M.noise3(pz[i] * 1.7 + 4.1, py[i] * 1.7 + time * .35, px[i] * 1.7) - .5;
          vx[i] += c * dt * .55; vz[i] += c2 * dt * .55;
          vy[i] *= 1 - dt * .55;
          vx[i] *= 1 - dt * .25; vz[i] *= 1 - dt * .25;
        }
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;

        var size = ps[i], alpha = pa[i];
        if (kind === 0) {
          size *= 1 + u * 2.6;                     /* a plume opens out */
          alpha *= M.arc(u) * (1 - u * .35);
        } else if (kind === 1) {
          size *= 1 + u * .5;
          alpha *= M.sat(1 - u * u * 1.6);
        } else {
          alpha *= M.arc(Math.pow(u, .7));
        }
        stage.sprite(kind, px[i], py[i], pz[i], size, 1, 1, 1, alpha,
          pSeed[i] * TAU + time * (kind === 0 ? .12 : 0), pAge[i], pSeed[i]);
      }
    }

    function clearParticles() {
      for (var i = 0; i < POOL; i++) pAlive[i] = 0;
      live = 0;
    }

    /* ══════════════════════════════════════════════════════════
       THE ROOM

       One board, and that is the whole set. Everything else in
       frame is food. The board is drawn every frame in both
       modes so that going from the film to the menu does not
       change what you are standing on.
       ══════════════════════════════════════════════════════════ */

    var tableMat = m4.identity(m4.make());
    function drawTable() {
      stage.draw('table', tableMat, D.MTL.board);
    }

    /* ══════════════════════════════════════════════════════════
       CONTEXT

       What the acts are handed. It is deliberately small: a
       camera to face, a way to emit, a way to ripple, and what
       the pointer is doing.
       ══════════════════════════════════════════════════════════ */

    var ctx = {
      cam: cam, stage: stage, puff: puff,
      hover: null, sel: null, peel: 0, time: 0
    };

    /* ══════════════════════════════════════════════════════════
       THE FILM
       ══════════════════════════════════════════════════════════ */

    var film = null;

    function buildFilm() {
      if (film) return film;
      var fakeShrimp = { id: '_hero', index: 900, act: '_none', scene: 'bucket', opts: {} };
      var hero = new D.Plate(fakeShrimp, [0, 0, 0]);
      hero.floor = -9;
      /* The shrimp is turned to present its curve to the camera's
         act-one position. A C-shape seen edge-on is a sausage,
         and no amount of lighting rescues it. */
      var g = D.shrimp(hero, [0, .52, 0], .95, { q: quat.fromEuler(quat.make(), 0, -.35, 0), pick: 'hero', seed: 1.7, antennae: true });
      g.kind = 'shrimp'; g.pick = 'hero';
      hero.groups = [g];
      hero.flecks = D.seasoning(hero, 90, .55, .40, { h: .5 });
      hero.hero = g;

      var bucket = D.build(SP.BY_ID['mix-shrimparty-bucket'], [0, 0, 0]);

      film = { hero: hero, bucket: bucket, g: g };
      return film;
    }

    /* One number in, one frame out. `p` is 0 at the top of the
       film and 1 at the bottom of its scroll track. */
    function stepFilm(p, dt, time) {
      var f = buildFilm();
      var i;

      /* ── the three acts, as slices of one number ──────────
         Act two ends and act three begins with a *hand-off*, not
         a cross-fade: the hero shrimp is gone before the bucket
         is drawn, and the camera has already pulled back to a
         distance that can hold a bucket before either happens.
         The first cut of this had both objects at the origin at
         the same time and the camera still at close-up range,
         which put the lens inside a bucket full of shrimp. */
      var a1 = M.range(p, 0, .32);          // the shrimp, alone
      var a2 = M.range(p, .30, .62);        // the peel
      var a3 = M.range(p, .64, 1);          // the table

      ctx.peel = a2;
      var vis = 1 - E.inOutCubic(M.range(p, .63, .73));
      f.hero.open = vis;
      for (i = 0; i < f.g.all.length; i++) f.g.all[i].mtl.hi = 0;
      if (vis > .01) {
        D.peel(f.hero, f.g, a2, ctx, time);
        /* it turns while it is whole, and stops turning the
           moment the shell starts to come off — a subject that
           keeps rotating while it disassembles reads as a
           product demo */
        var spin = (1 - E.outCubic(M.sat(a2 * 3))) * .16;
        for (i = 0; i < f.g.all.length; i++) f.g.all[i].spin[1] = M.lerp(f.g.all[i].spin[1], spin, .04);
        f.hero.step(dt, time, ctx);
        /* it leaves frame by dropping away rather than by going
           transparent, because there is no transparency in this
           renderer and there should not be */
        var away = (1 - vis) * (1 - vis) * 3.2;
        for (i = 0; i < f.hero.parts.length; i++) {
          var q = f.hero.parts[i];
          q.pos[1] -= away;
          if (vis > .02) q.draw(stage, f.hero.origin);
          q.pos[1] += away;
        }
      }

      /* steam off the hero for the whole of act one, from
         underneath so it silhouettes the shrimp */
      if (a1 > .05 && vis > .1) {
        f.hero.emit = (f.hero.emit || 0) + dt * 9 * vis;
        var n = Math.floor(f.hero.emit); f.hero.emit -= n;
        for (i = 0; i < n; i++) {
          var ang = Math.random() * TAU, r = Math.random() * .45;
          puff(-.46 + Math.cos(ang) * r, .18, Math.sin(ang) * r, .20 + Math.random() * .14, 2.4, .26, 0, .13 * vis);
        }
      }

      /* the bucket arrives only once the shrimp has gone */
      var bucketIn = M.range(p, .72, 1);
      f.bucket.open = E.outCubic(M.range(p, .80, 1)) * .9;
      if (bucketIn > .001) {
        f.bucket.step(dt, time, ctx);
        f.bucket.draw(stage);
      }

      drawTable();

      /* ── the camera ──────────────────────────────────────
         Three shots, blended rather than cut. The pull-back runs
         on its own curve rather than on act three's, so the lens
         is already far enough out to hold a bucket by the time
         one is on the board. */
      var az = -.55 + a1 * .70 + a2 * .55 + a3 * 1.15;
      var el = M.lerp(.28, .15, E.inOutCubic(a2)) + a3 * .34;
      var pull = E.outCubic(M.range(p, .60, .88));
      var rad = M.lerp(3.50, 2.55, E.inOutQuint(a2));
      rad = M.lerp(rad, 5.60, pull);
      /* stand further back on a narrow frame — see D.frameDistance */
      rad /= Math.min(1, D.aspect || 1.6);
      var ty = M.lerp(.52, .56, a2);
      ty = M.lerp(ty, .74, pull);
      /* the subject is framed right of centre so the title has
         the left third to itself, and it recentres as the camera
         finds the table */
      var off = -.46 * (1 - pull);
      var eye = [off + Math.sin(az) * Math.cos(el) * rad, ty + Math.sin(el) * rad, Math.cos(az) * Math.cos(el) * rad];
      cam.goal(eye, [off, ty, 0], {
        fov: M.lerp(.60, .52, E.inOutCubic(a2)),
        /* the rack: focus sits on the shrimp through the peel
           and opens up as the camera finds the table */
        focus: M.lerp(rad, rad + .10, a2),
        aperture: M.lerp(1.05, .52, a2) + pull * 3.0
      });

      return {
        shadowCenter: [off, .5, 0],
        shadowExtent: M.lerp(1.5, 3.4, pull),
        vignette: M.lerp(.34, .26, a3),
        bloom: 1
      };
    }

    /* ══════════════════════════════════════════════════════════
       THE TABLE — thirty dishes on one board

       `at` is a floating index: 3.5 means halfway between the
       fourth and fifth dish, and the camera is there. Snapping
       is done by the caller, so a flick can carry past two
       dishes and settle.
       ══════════════════════════════════════════════════════════ */

    var plates = Object.create(null);
    var at = 0, opened = -1, openAmt = 0;

    function plateAt(i) {
      if (i < 0 || i >= SP.DISHES.length) return null;
      var p = plates[i];
      if (!p) {
        p = plates[i] = D.build(SP.DISHES[i], [i * RAIL, 0, 0]);
      }
      return p;
    }

    /* Plates outside a window of the camera are thrown away, so a
       menu of thirty dishes only ever holds five in memory. The
       one that is open is exempt whatever the camera is doing:
       dropping it out from under an act that is mid-flight is
       how a dish gets closed while its camera is still reading
       from it. */
    function cull(centre) {
      for (var k in plates) {
        if (+k !== opened && Math.abs((+k) - centre) > 3.5) delete plates[k];
      }
    }

    function stepTable(dt, time) {
      var c = Math.round(at);
      cull(c);
      var i, look = { shadowCenter: [at * RAIL, .4, 0], shadowExtent: 2.6, vignette: .26, bloom: 1 };

      for (i = c - 2; i <= c + 2; i++) {
        var p = plateAt(i);
        if (!p) continue;
        var near = 1 - M.sat(Math.abs(i - at) / 2.6);
        /* only the dish you have actually opened runs its act at
           full strength; its neighbours idle, which is enough
           for steam and the settle */
        p.open = (i === opened) ? openAmt : 0;
        p.step(dt, time, (i === c) ? ctx : idleCtx);
        p.draw(stage);
      }
      drawTable();

      /* ── the camera on the rail ──────────────────────────── */
      var cur = plateAt(Math.max(0, Math.min(SP.DISHES.length - 1, c)));
      var railX = at * RAIL;
      var openPlate = opened >= 0 ? plates[opened] : null;

      /* Where the chosen piece actually is, in the world, this
         frame. The camera needs it because a close-up has to
         follow the thing it is a close-up of — a shrimp lifted
         out of the ring and peeling in mid-air will not sit where
         the dish's standing shot is pointed, and the first cut of
         this framed the empty bucket while the shrimp came apart
         above the top of the screen. */
      ctx.selPos = null;
      if (openPlate && ctx.sel) {
        var selPart = openPlate.byId(ctx.sel);
        if (selPart) ctx.selPos = selPart.world(openPlate.origin, selWorld);
      }

      if (openPlate && openAmt > .001) {
        var dish = SP.DISHES[opened];
        var shot = (D.CAMS[dish.act] || D.defaultShot)(openPlate, openPlate.t, openAmt, ctx);
        /* blend from the rail's standing shot into the dish's
           own coverage, so opening a dish is a move rather than
           a cut */
        var rail = railShot(railX);
        var b = E.inOutCubic(M.sat(openAmt * 1.25));
        cam.goal(
          [M.lerp(rail.eye[0], shot.eye[0], b), M.lerp(rail.eye[1], shot.eye[1], b), M.lerp(rail.eye[2], shot.eye[2], b)],
          [M.lerp(rail.target[0], shot.target[0], b), M.lerp(rail.target[1], shot.target[1], b), M.lerp(rail.target[2], shot.target[2], b)],
          { fov: M.lerp(rail.fov, shot.fov, b), aperture: M.lerp(rail.aperture, shot.aperture, b) });
        look.shadowCenter = shot.target;
        look.shadowExtent = 1.9;
        look.vignette = M.lerp(.26, .33, b);
      } else {
        var r = railShot(railX);
        cam.goal(r.eye, r.target, { fov: r.fov, aperture: r.aperture });
      }
      return look;
    }

    /* The standing shot on the rail: three-quarters, a little
       above the food, with the neighbours falling out of focus
       on both sides. It is the shot a menu photographer would
       set up and then not move. */
    function railShot(x) {
      var k = 1 / Math.min(1, D.aspect || 1.6);
      return {
        eye: [x + .78 * k, 1.66 * Math.min(1.35, k), 3.25 * k],
        target: [x, .32, 0],
        fov: .58,
        /* wide open, so the dishes either side of the one you are
           looking at fall away — that defocus is what tells you
           the table carries on in both directions */
        aperture: 1.05
      };
    }

    /* the neighbours get a context that emits nothing and picks
       nothing — they are scenery until you arrive at them */
    var idleCtx = { cam: cam, stage: stage, puff: function () {}, hover: null, sel: null, peel: 0 };

    /* ══════════════════════════════════════════════════════════
       POINTER
       ══════════════════════════════════════════════════════════ */

    var held = null, heldPlane = 0, dragPt = [0, 0, 0], dragOff = [0, 0, 0];
    var peelTarget = 0;

    var selWorld = [0, 0, 0];

    var api = {
      mode: 'film',
      ctx: ctx,

      setReduced: function (r) { reduced = r; },

      /* ── the film ─────────────────────────────────────────── */
      film: function (progress, dt, time) {
        ctx.time = time;
        var look = stepFilm(progress, dt, time);
        stepParticles(dt, time);
        return look;
      },

      /* ── the table ────────────────────────────────────────── */
      table: function (dt, time) {
        ctx.time = time;
        /* the peel ramps on its own once a shrimp is chosen, so
           the signature move plays without asking the user to
           drag anything — and then stays live to be dragged */
        ctx.peel = M.damp(ctx.peel, peelTarget, reduced ? 40 : 3.4, dt);
        var look = stepTable(dt, time);
        stepParticles(dt, time);
        stage.stepRipples(dt);
        return look;
      },

      goto: function (i, immediate) {
        i = Math.max(0, Math.min(SP.DISHES.length - 1, i));
        if (immediate) at = i;
        api.want = i;
        return i;
      },
      want: 0,
      index: function () { return Math.round(at); },
      exact: function () { return at; },
      nudge: function (dx) { api.want = Math.max(0, Math.min(SP.DISHES.length - 1, api.want + dx)); },

      /* the rail glides towards the dish you asked for; it never
         jumps, because the neighbours passing through frame are
         what tells you the menu is one continuous table */
      settle: function (dt) {
        at = M.damp(at, api.want, 5.2, dt);
        if (Math.abs(at - api.want) < .0015) at = api.want;
      },

      open: function (i) {
        if (opened !== i) {
          var prev = plates[opened];
          if (prev) { prev.t = 0; }
          opened = i;
          var p = plateAt(i);
          if (p) p.t = 0;
          ctx.sel = null; peelTarget = 0; ctx.peel = 0;
        }
      },
      close: function () {
        opened = -1; ctx.sel = null; peelTarget = 0;
      },
      opened: function () { return opened; },
      setOpenAmount: function (v) { openAmt = v; },
      openAmount: function () { return openAmt; },
      plate: function (i) { return plates[i === undefined ? opened : i] || null; },

      clearParticles: clearParticles,

      /* ── picking, selecting, dragging ─────────────────────── */

      hoverAt: function (ndcX, ndcY) {
        var id = stage.pick(cam, ndcX, ndcY);
        ctx.hover = id;
        return id;
      },

      selectAt: function (ndcX, ndcY) {
        var id = stage.pick(cam, ndcX, ndcY);
        if (!id) { ctx.sel = null; peelTarget = 0; return null; }
        ctx.sel = id;
        /* choosing a shrimp starts the peel; choosing anything
           else just brings it forward */
        peelTarget = /shrimp|:shell|:meat|:head|:tail|^p\d|^hero/.test(id) ? 1 : 0;
        var p = api.plate();
        if (p) {
          for (var i = 0; i < p.groups.length; i++) {
            if (p.groups[i].pick && id.indexOf(p.groups[i].pick) === 0) {
              peelTarget = p.groups[i].kind === 'shrimp' ? 1 : 0;
              return { id: id, group: p.groups[i] };
            }
          }
        }
        return { id: id };
      },

      deselect: function () { ctx.sel = null; peelTarget = 0; },

      grab: function (ndcX, ndcY) {
        var id = stage.pick(cam, ndcX, ndcY);
        if (!id) return false;
        var p = api.plate();
        if (!p) return false;
        var part = p.byId(id);
        if (!part) return false;
        held = part;
        held.held = true;
        held.free = 0;
        heldPlane = part.pos[1] + p.origin[1];
        if (stage.rayPlane(cam, ndcX, ndcY, heldPlane, dragPt)) {
          dragOff[0] = part.pos[0] + p.origin[0] - dragPt[0];
          dragOff[1] = 0;
          dragOff[2] = part.pos[2] + p.origin[2] - dragPt[2];
        }
        return true;
      },

      drag: function (ndcX, ndcY) {
        if (!held) return false;
        var p = api.plate();
        if (!p) return false;
        if (stage.rayPlane(cam, ndcX, ndcY, heldPlane, dragPt)) {
          held.target[0] = dragPt[0] + dragOff[0] - p.origin[0];
          held.target[1] = heldPlane - p.origin[1];
          held.target[2] = dragPt[2] + dragOff[2] - p.origin[2];
        }
        return true;
      },

      /* Let go without throwing: the pointer went down on a
         piece and came up again without moving, which is a click
         and not a drag. The piece goes back to its act. */
      ungrab: function () {
        if (!held) return;
        held.held = false;
        held.vel[0] = held.vel[1] = held.vel[2] = 0;
        held = null;
      },

      /* Letting go hands the part to gravity with whatever
         velocity the drag gave it, which is the difference
         between putting something down and dropping it. */
      release: function () {
        if (!held) return;
        held.held = false;
        held.free = 1;
        held.spin[0] += (Math.random() - .5) * 2;
        held.spin[1] += held.vel[0] * 2.5;
        held.spin[2] += (Math.random() - .5) * 2;
        held = null;
      },
      holding: function () { return !!held; },

      /* what the pointer is over, in words, for the readout */
      hoverLabel: function () {
        var p = api.plate();
        if (!p || !ctx.hover) return null;
        var part = p.byId(ctx.hover);
        return part && part.label ? part.label : null;
      },

      /* a knock on the glass, for the drinks */
      knock: function () {
        var p = api.plate();
        if (p) p.knock = ctx.time;
      },

      /* Anything that starts a ripple where the pointer meets a
         liquid surface: a tap on soup, a finger through sauce. */
      touchLiquid: function (ndcX, ndcY) {
        var p = api.plate();
        if (!p) return false;
        var y = p.surfaceY === undefined ? .14 : p.surfaceY;
        if (stage.rayPlane(cam, ndcX, ndcY, p.origin[1] + y, dragPt)) {
          var dx = dragPt[0] - p.origin[0], dz = dragPt[2] - p.origin[2];
          if (dx * dx + dz * dz < (p.rim || 1) * (p.rim || 1)) {
            stage.ripple(dragPt[0], dragPt[2], 1.2);
            return true;
          }
        }
        return false;
      },

      /* Where a dish is on screen, for the DOM caption that sits
         beside it. */
      projectDish: function (i, out) {
        var p = plates[i];
        if (!p) return null;
        return cam.project([p.origin[0], p.origin[1] + .55, p.origin[2]], out);
      },

      particleCount: function () { return live; }
    };

    return api;
  };

})(window);
