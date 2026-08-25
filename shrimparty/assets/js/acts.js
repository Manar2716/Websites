/* ═══════════════════════════════════════════════════════════
   acts.js — what each dish does when you open it.

   Thirty functions. They run every frame while a dish is open,
   and all they are allowed to do is move targets, emit steam and
   start ripples. Nothing here writes a position, a rotation or a
   colour directly, so every motion on this site arrives through
   the same springs and carries the same weight.

   `open` runs 0 → 1 as the dish comes forward and back to 0 as
   it goes away, so every act reverses for free: scroll back out
   of the shrimp and it reassembles, because reassembling is just
   the targets going home while the same physics carries the
   pieces.

   Two rules held the whole way through:

   Motion has to be true to the food. A basket of fried shrimp
   gets shaken, because that is what you do with a basket.
   Mussels open, because that is what mussels do. Soup does not
   rise, separate, orbit or explode — soup sits there and steams
   and something turns over under the surface. Getting that
   restraint right on the quiet dishes is what earns the bucket
   the right to be loud.

   And nothing moves that would not move. Steamed white rice
   steams; the grains shift by a fraction of a millimetre; that
   is the entire act, and it would be worse with anything added.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var M = SP.M, D = SP.Dishes;
  var quat = M.quat, m4 = M.m4, E = M.E;
  var mo = D.motion, to = mo.to, rest = mo.rest, groupTo = mo.groupTo;
  var settle = mo.settle, faceCam = mo.faceCam, steam = mo.steam;
  var TAU = Math.PI * 2, PI = Math.PI;

  function euler(x, y, z) { return quat.fromEuler(quat.make(), x, y, z); }

  /* Ease a value in over the dish's opening, staggered by index
     so a bucket empties in sequence rather than all at once. */
  function stagger(open, i, n, spread) {
    spread = spread === undefined ? .55 : spread;
    var lo = (i / Math.max(1, n)) * spread;
    return E.outCubic(M.range(open, lo, lo + (1 - spread)));
  }

  /* Does this id belong to that group?

     Ids are the group's name and then the part, `shrimp7:meat`,
     so a plain prefix test is not enough: `shrimp1` is a prefix
     of `shrimp10`, and picking the eleventh shrimp in a bucket
     also selected the second one. The separator has to be part
     of the match. */
  function owns(id, pick) {
    if (!id || !pick) return false;
    return id === pick || (id.length > pick.length && id.charAt(pick.length) === ':' && id.indexOf(pick) === 0);
  }
  D.owns = owns;

  /* Is this group the one being pointed at or held? */
  function on(ctx, g) {
    if (!ctx || !g.pick) return 0;
    if (owns(ctx.sel, g.pick)) return 1;
    if (owns(ctx.hover, g.pick)) return .5;
    return 0;
  }

  /* Mark hover/selection on every part of a group so the rim
     light in the surface shader picks it up. */
  function light(g, v) {
    for (var i = 0; i < g.all.length; i++) g.all[i].hover = v;
  }

  /* ══════════════════════════════════════════════════════════
     THE BREAK-APART

     The signature. It is deliberately not an explosion, and it
     is not a fade: it is a shrimp being peeled, in the order a
     shrimp comes apart.

       head off first, and away
       the six shell plates lift from the tail end forward,
         each one hinging outwards before it lets go
       the tail fan pulls free
       the swimmerets drop, because they are the lightest thing
         on it and nothing is holding them
       the meat is left, and turns to face you

     `u` runs 0 → 1. Every stage is a slice of it, so dragging
     the scroll backwards peels it in reverse, and letting the
     dish close reassembles the shrimp. The pieces stay live the
     whole time — you can catch one mid-peel and drag it, and
     the rest of the sequence carries on without it.
     ══════════════════════════════════════════════════════════ */

  D.peel = function (plate, g, u, ctx, time) {
    if (!g || g.kind !== 'shrimp') return;
    var i, p, s = g.scale || .34;
    var e = E.outCubic(M.sat(u));

    /* the head: straight off the front, turning as it goes */
    var hu = E.outCubic(M.range(u, 0, .30));
    p = g.head;
    to(p, -.40 * s * hu * 1.35, .12 * s * hu * 1.35, -.20 * s * hu * 1.35);
    if (hu > .02) quat.slerp(p.targetQ, p.homeQ, euler(.6, 1.9, .4), hu);

    /* the plates, tail end first. Each one hinges out around the
       body before it travels, which is the difference between a
       shell coming off and a shell teleporting. */
    for (i = 0; i < g.plates.length; i++) {
      var k = g.plates.length - 1 - i;             /* 5,4,3,2,1,0 */
      var lo = .12 + i * .085;
      var pu = E.outCubic(M.range(u, lo, lo + .30));
      p = g.plates[k];
      var a = (k / g.plates.length) * TAU * .5 + 1.1;
      /* How far a plate travels once it lets go. It has to be
         enough to read as off the shrimp and not so much that
         the pieces leave the frame — a first pass at three and a
         half body-radii threw them past the edge of a 16:9
         viewport before the peel was halfway done. */
      var lift = pu * s * 1.30;
      to(p,
        Math.cos(a) * lift * .78,
        lift * (.55 + (k % 2) * .25),
        Math.sin(a) * lift * .78);
      if (pu > .02) {
        quat.slerp(p.targetQ, p.homeQ, euler(a * .7, a, .9 + k * .3), pu);
        p.spin[2] = M.lerp(p.spin[2], (k % 2 ? 1 : -1) * 1.5, .04);
      } else { quat.slerp(p.targetQ, p.targetQ, p.homeQ, .2); }
    }

    /* the tail fan */
    var tu = E.outCubic(M.range(u, .48, .82));
    p = g.tail;
    to(p, .34 * s * tu * 1.25, .26 * s * tu * 1.25, .34 * s * tu * 1.25);
    if (tu > .02) quat.slerp(p.targetQ, p.homeQ, euler(-.7, -1.4, .5), tu);

    /* the swimmerets simply fall */
    var lu = E.outCubic(M.range(u, .30, .70));
    p = g.legs;
    if (lu > .01) {
      p.free = 1;
      if (lu < .02) p.vel[1] = -.1;
    } else { p.free = 0; rest(p); }

    /* the meat: rises a little as the shell leaves it and turns
       to present its side, which is the only orientation where
       the segment grooves read */
    p = g.meat;
    var mu = E.inOutCubic(M.sat(u * 1.15));
    to(p, 0, .10 * s * mu * .95, 0);
    if (mu > .02) faceCam(p, ctx, PI * .5);

    /* seasoning coming off the shell as it opens. Real flecks,
       lit by the same lamp, falling under the same gravity —
       the moment the file's whole approach is paying for. */
    if (plate.flecks && u > .05 && u < .98 && ctx) {
      var want = Math.floor(M.sat(u) * Math.min(64, plate.flecks.length));
      for (i = 0; i < want; i++) {
        var f = plate.flecks[i];
        if (!f.freed) {
          f.freed = 1; f.free = 1;
          var fa = plate.rnd() * TAU;
          f.pos[0] = g.centre[0] + Math.cos(fa) * .12;
          f.pos[1] = g.centre[1] + .10;
          f.pos[2] = g.centre[2] + Math.sin(fa) * .12;
          f.vel[0] = Math.cos(fa) * .5; f.vel[1] = .35 + plate.rnd() * .4; f.vel[2] = Math.sin(fa) * .5;
        }
      }
    }
    g.peeled = e;
  };

  /* ══════════════════════════════════════════════════════════
     THE ACTS
     ══════════════════════════════════════════════════════════ */

  var A = (D.ACTS = {});

  /* ── 1. Sea Carnival Soup ──────────────────────────────────
     A bowl of soup does not do anything. It sits there, it
     steams, and things turn over slowly under the surface. The
     interaction is that a piece you point at comes up out of the
     broth far enough to see, and drops back when you look away.
     Every rise starts a ring on the surface, because something
     coming out of soup does that. */
  A.brothSettle = function (plate, t, open, ctx, dt, time) {
    var i, g;
    for (i = 0; i < plate.parts.length; i++) {
      var p = plate.parts[i];
      if (p.held || p.free) continue;
      var s = settle(p, time, .006);
      to(p, s * .5, s, s * .4);
      p.spin[1] = M.lerp(p.spin[1], .10 + p.mtl.seed * .04, .02);
    }
    for (i = 0; i < (plate.groups || []).length; i++) {
      g = plate.groups[i];
      var h = on(ctx, g);
      light(g, h);
      if (h > 0) {
        var lift = .10 * open * (h > .9 ? 1.6 : 1);
        groupTo(g, 0, lift, 0);
        if (!g.rippled && ctx && ctx.stage) {
          g.rippled = 1;
          ctx.stage.ripple(plate.origin[0] + g.all[0].home[0], plate.origin[2] + g.all[0].home[2], .8);
        }
      } else g.rippled = 0;
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .20, life: 2.2, rise: .26 });
  };

  /* ── 2. Shrimparty Soup ────────────────────────────────────
     The same bowl, and a completely different act, because this
     one has a spoon in it. The spoon sweeps, the wake pushes
     what is floating, and every position it passes through
     starts a ring. Take hold of the spoon and you are stirring
     it yourself. */
  A.spoonStir = function (plate, t, open, ctx, dt, time) {
    var sp = plate.spoon, i;
    if (sp) {
      var driven = sp.held;
      if (!driven) {
        var a = time * .55;
        var r = .30;
        to(sp, Math.cos(a) * r - .30, -.02, Math.sin(a) * r - .18);
        quat.slerp(sp.targetQ, sp.targetQ, euler(-.35, -a - .6, .1), Math.min(1, dt * 4));
      }
      if (ctx && ctx.stage && open > .2) {
        plate.wake = (plate.wake || 0) + dt;
        if (plate.wake > .085) {
          plate.wake = 0;
          ctx.stage.ripple(plate.origin[0] + sp.pos[0], plate.origin[2] + sp.pos[2], driven ? 1.5 : .9);
        }
      }
      sp.hover = ctx && ctx.hover === 'spoon' ? .6 : 0;
    }
    /* what floats gets pushed by the wake, in the direction the
       spoon is actually travelling */
    for (i = 0; i < (plate.groups || []).length; i++) {
      var g = plate.groups[i], h = on(ctx, g);
      light(g, h);
      var p0 = g.all[0];
      var dx = p0.home[0] - (sp ? sp.pos[0] : 0), dz = p0.home[2] - (sp ? sp.pos[2] : 0);
      var d = Math.hypot(dx, dz) || 1;
      var push = M.sat(1 - d / .55) * .12 * open;
      groupTo(g, dx / d * push + settle(p0, time, .004), settle(p0, time, .005) + h * .06, dz / d * push);
      for (var k = 0; k < g.all.length; k++) g.all[k].spin[1] = M.lerp(g.all[k].spin[1], push * 4, .05);
    }
    for (i = 0; i < plate.parts.length; i++) {
      var q = plate.parts[i];
      if (q === sp || q.held || q.id) continue;
      to(q, 0, settle(q, time, .005), 0);
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .19, life: 2.0, rise: .28 });
  };

  /* ── 3. Shrimp Caesar Salad ────────────────────────────────
     The shrimp lift clear of the greens and hold; the leaves
     relax open underneath them once the weight is off; the
     parmesan drifts. Nothing here rotates or orbits — a salad
     that spins is a salad nobody would eat. */
  A.liftFromGreens = function (plate, t, open, ctx, dt, time) {
    var i;
    for (i = 0; i < plate.shrimps.length; i++) {
      var g = plate.shrimps[i];
      var u = stagger(open, i, plate.shrimps.length, .5);
      var h = on(ctx, g); light(g, h);
      groupTo(g, 0, u * .16 + h * .10 + settle(g.all[0], time, .004), 0);
      if (u > .02) {
        for (var k = 0; k < g.all.length; k++) {
          quat.slerp(g.all[k].targetQ, g.all[k].homeQ, euler(-.35, i * 1.1, .18), u);
        }
      }
    }
    for (i = 0; i < plate.parts.length; i++) {
      var p = plate.parts[i];
      if (p.id || p.held) continue;
      if (p.key === 'shard') {
        /* parmesan settles down into the gaps the shrimp left */
        to(p, 0, -.05 * open + settle(p, time, .003), 0);
        p.spin[1] = M.lerp(p.spin[1], .25, .02);
      } else if (p.key.indexOf('lettuce') === 0) {
        var s = settle(p, time, .005);
        to(p, s, .03 * open + s * .6, s * .8);
      }
    }
  };

  /* ── 4. Fisherman Catch ────────────────────────────────────
     A mixed plate, so the act is a survey: everything lifts into
     one shallow ring at eye level and turns on the spot while
     the camera goes round it. The point is to see all thirteen
     things at once, which is the one thing a plate piled up
     cannot show you. */
  A.orbitSeparate = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups, n = gs.length;
    for (var i = 0; i < n; i++) {
      var g = gs[i], u = stagger(open, i, n, .45);
      var a = (i / n) * TAU + time * .10;
      var r = .34 + (i % 3) * .09;
      var p0 = g.all[0];
      var dx = Math.cos(a) * r - p0.home[0];
      var dz = Math.sin(a) * r - p0.home[2];
      var h = on(ctx, g); light(g, h);
      groupTo(g, dx * u, u * (.26 + (i % 4) * .05) + h * .07, dz * u);
      for (var k = 0; k < g.all.length; k++) g.all[k].spin[1] = M.lerp(g.all[k].spin[1], u * (.5 + (i % 3) * .2), .03);
    }
  };

  /* ── 5. Fried Shrimp Basket ────────────────────────────────
     You shake a basket. It gets one hard shake as it opens —
     everything jumps, the crumbs come off the bottom and rain —
     and then it settles and one shrimp is offered up for you to
     take. */
  A.crumbShake = function (plate, t, open, ctx, dt, time) {
    var shake = Math.exp(-t * 3.4) * M.sat(open * 4) * (open > .1 ? 1 : 0);
    var j = Math.sin(t * 34) * shake;
    var i, k;
    for (i = 0; i < plate.groups.length; i++) {
      var g = plate.groups[i], h = on(ctx, g); light(g, h);
      var u = stagger(open, i, plate.groups.length, .5);
      groupTo(g, j * .05 * (1 + i % 3), j * .09 + h * .16 + u * .04, j * .04);
      if (h > .9) {
        for (k = 0; k < g.all.length; k++) faceCam(g.all[k], ctx, PI * .5);
      }
    }
    if (plate.crumbs) {
      for (i = 0; i < plate.crumbs.length; i++) {
        var c = plate.crumbs[i];
        if (shake > .25 && !c.freed) {
          c.freed = 1; c.free = 1;
          c.vel[0] = (plate.rnd() - .5) * .8;
          c.vel[1] = .5 + plate.rnd() * .7;
          c.vel[2] = (plate.rnd() - .5) * .8;
        }
        if (open < .05) { c.freed = 0; c.free = 0; }
      }
    }
    if (ctx && ctx.stage && ctx.hover === 'lemon') {
      var lm = plate.byId('lemon'); if (lm) lm.hover = .7;
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .12, life: 1.1, rise: .34, alpha: .10 });
  };

  /* ── 6. Fried Calamari Basket ──────────────────────────────
     Rings roll. Each one lifts and turns about its own ring
     axis rather than about the world's, so they read as hoops
     rather than as discs, and one of them rolls over to the dip
     and drops a ring into it. */
  A.ringRoll = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups, n = gs.length;
    for (var i = 0; i < n; i++) {
      var g = gs[i], p = g.all[0], u = stagger(open, i, n, .5);
      var h = on(ctx, g); light(g, h);
      var a = (i / n) * TAU;
      to(p, Math.cos(a) * .12 * u, u * (.12 + (i % 3) * .06) + h * .12, Math.sin(a) * .12 * u);
      /* rolling: spin about the ring's own axis, which after the
         build is its local Y */
      var roll = u * (.7 + (i % 4) * .35) * (i % 2 ? 1 : -1);
      p.spin[0] = M.lerp(p.spin[0], Math.cos(a) * roll, .04);
      p.spin[2] = M.lerp(p.spin[2], Math.sin(a) * roll, .04);
      if (h > .9) faceCam(p, ctx, 0);
    }
    /* the dip answers whatever is nearest it */
    if (ctx && ctx.stage && open > .3) {
      plate.dipT = (plate.dipT || 0) + dt;
      if (plate.dipT > .55) {
        plate.dipT = 0;
        ctx.stage.ripple(plate.origin[0] + plate.dipAt[0], plate.origin[2] + plate.dipAt[2], .5);
      }
    }
  };

  /* ── 7. Fried Fish Fingers Basket ──────────────────────────
     Eight identical objects, so the act is about one of them:
     they fan apart just enough to be individually reachable, and
     whichever you point at comes forward, turns end-on and shows
     you the break — the breading outside, the flake inside. */
  A.pullOne = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups, n = gs.length;
    for (var i = 0; i < n; i++) {
      var g = gs[i], p = g.all[0], u = stagger(open, i, n, .4);
      var h = on(ctx, g); light(g, h);
      var a = (i - (n - 1) / 2) * .30;
      to(p, Math.sin(a) * .34 * u - p.home[0] * u * .5,
            u * .10 + h * .30,
            Math.cos(a) * .18 * u - p.home[2] * u * .5);
      quat.slerp(p.targetQ, p.homeQ, euler(0, a, h > .9 ? .9 : .12), u);
      if (h > .9) {
        faceCam(p, ctx, PI * .5);
        p.spin[1] = M.lerp(p.spin[1], .5, .04);
      }
    }
    if (plate.crumbs) for (var c = 0; c < plate.crumbs.length; c++) {
      to(plate.crumbs[c], 0, settle(plate.crumbs[c], time, .002), 0);
    }
  };

  /* ── 8. Baked Mussels & Cheese ─────────────────────────────
     The cheese is the act. Lift a shell and the cheese does not
     come with it cleanly — it stays anchored to the plate and
     stretches, thinning as it goes, until the shell is high
     enough that it lets go. That is one part being scaled along
     one axis between two moving anchors, and it is the only
     honest way to draw melted mozzarella. */
  A.cheesePull = function (plate, t, open, ctx, dt, time) {
    for (var i = 0; i < plate.shells.length; i++) {
      var s = plate.shells[i];
      var g = plate.groups[i];
      var h = on(ctx, g);
      light(g, h);
      var u = stagger(open, i, plate.shells.length, .45);
      var lift = u * .06 + h * .34;
      to(s.shell, 0, lift, 0);
      to(s.meat, 0, lift + .002, 0);
      /* the cheese: its base stays down, its top follows the
         shell, so it is scaled to span the gap and thinned as
         it is drawn out */
      var span = lift;
      to(s.cheese, 0, span * .5, 0);
      s.cheese.scale[1] = .30 + span * 3.2;
      var thin = 1 / (1 + span * 2.6);
      s.cheese.scale[0] = .50 * thin; s.cheese.scale[2] = .56 * thin;
      if (h > .9) {
        quat.slerp(s.shell.targetQ, s.shell.homeQ, euler(-.5, 1.0, .2), M.sat(h));
        quat.slerp(s.meat.targetQ, s.meat.homeQ, euler(-.5, 1.0, .2), M.sat(h));
      }
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .13, life: 1.5, rise: .30, alpha: .13 });
  };

  /* ── 9. Shrimp Bucket ──────────────────────────────────────
     The hero. Sixteen shrimp come up out of the bucket in
     sequence and hang above it in a slow turn — the boil, taken
     apart in the air. Then you pick one and it peels.

     The sequence is by index, not by height, so it reads as
     being lifted out one at a time by hand rather than as a
     layer floating off. */
  A.riseAndHold = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups, n = gs.length, i, k;
    var sel = ctx && ctx.sel;
    for (i = 0; i < n; i++) {
      var g = gs[i];
      var u = stagger(open, i, n, .62);
      var picked = owns(sel, g.pick);
      var h = picked ? 1 : on(ctx, g);
      light(g, picked ? 0 : h);
      /* the ring they hang in, turning slowly */
      var a = (i / n) * TAU + time * .085;
      var r = .42 + (i % 3) * .13;
      var p0 = g.all[0];
      var cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      var cy = .62 + (i % 4) * .10 + Math.sin(time * .8 + i) * .012;
      if (picked) {
        /* the chosen one comes out of the ring and up in front
           of the lens */
        cx = 0; cz = 0; cy = 1.35;
      } else if (sel) {
        /* Everything else settles back into the bucket. Opening
           the ring outwards was not enough on its own: the other
           shrimp then sat between the lens and the one being
           peeled and filled the foreground with red bokeh. They
           have to drop out of the sight line, not just widen. */
        cx *= 1.30; cz *= 1.30; cy -= .50;
      }
      var base = g.centre;
      var dx = (cx - base[0]) * u, dy = (cy - base[1]) * u, dz = (cz - base[2]) * u;
      groupTo(g, dx, dy + h * .05, dz);
      if (u > .02 && !picked) {
        for (k = 0; k < g.all.length; k++) {
          g.all[k].spin[1] = M.lerp(g.all[k].spin[1], .16 + (i % 3) * .07, .02);
        }
      }
      if (picked) {
        D.peel(plate, g, ctx.peel || 0, ctx, time);
      } else if (g.peeled) {
        D.peel(plate, g, 0, ctx, time);
        g.peeled = 0;
      }
    }
    /* seasoning falls out of the bucket as the shrimp leave it */
    if (plate.flecks) {
      for (i = 0; i < plate.flecks.length; i++) {
        var f = plate.flecks[i];
        if (f.freed) continue;
        to(f, 0, open * (.18 + (i % 7) * .04), 0);
        f.spin[1] = M.lerp(f.spin[1], open * 1.2, .02);
      }
    }
    steam(plate, ctx, dt, plate.steamRate * (1 - open * .5), { size: .22, life: 2.4, rise: .24, alpha: .12 });
  };

  /* ── 10. Mix Seafood Bucket ────────────────────────────────
     Four kinds in one bucket, so it comes apart the way it went
     together: into layers. Each kind rises to its own height and
     turns at its own rate, which makes the composition of the
     dish legible at a glance — this much shrimp, this much
     mussel, this much crab. */
  A.layerSplit = function (plate, t, open, ctx, dt, time) {
    var order = { potato: 0, corn: 0, mussel: 1, calamari: 2, shrimp: 3, crab: 4, lobster: 5 };
    var gs = plate.groups, i, k;
    var counts = {};
    for (i = 0; i < gs.length; i++) {
      var kind = gs[i].kind;
      counts[kind] = (counts[kind] || 0);
    }
    for (i = 0; i < gs.length; i++) {
      var g = gs[i];
      var lvl = order[g.kind] === undefined ? 2 : order[g.kind];
      var idx = counts[g.kind]++;
      var per = 0;
      for (k = 0; k < gs.length; k++) if (gs[k].kind === g.kind) per++;
      var u = E.outCubic(M.range(open, lvl * .10, lvl * .10 + .62));
      var a = (idx / Math.max(1, per)) * TAU + time * (.07 + lvl * .022);
      var r = .26 + lvl * .16;
      var h = on(ctx, g); light(g, h);
      var base = g.all[0].home;
      var cx = Math.cos(a) * r, cy = .42 + lvl * .28, cz = Math.sin(a) * r;
      groupTo(g, (cx - base[0]) * u, (cy - base[1]) * u + h * .06, (cz - base[2]) * u);
      if (u > .02) for (k = 0; k < g.all.length; k++) {
        g.all[k].spin[1] = M.lerp(g.all[k].spin[1], u * (.18 + lvl * .05), .02);
      }
      if (owns(ctx && ctx.sel, g.pick) && g.kind === 'shrimp') {
        D.peel(plate, g, ctx.peel || 0, ctx, time);
      }
    }
    steam(plate, ctx, dt, plate.steamRate * (1 - open * .6), { size: .20, life: 2.2, rise: .24 });
  };

  /* ── 11. Crabs Bucket ──────────────────────────────────────
     Crab is armour, and the interesting side of armour is the
     inside. The bodies come up and the claws come off them and
     turn over, so what you are looking at is the underside of a
     claw rather than another red lump. */
  A.shellCrack = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups, n = gs.length;
    for (var i = 0; i < n; i++) {
      var g = gs[i], u = stagger(open, i, n, .5);
      var h = on(ctx, g); light(g, h);
      var a = (i / n) * TAU + time * .06;
      var body = g.body;
      var cx = Math.cos(a) * .30, cz = Math.sin(a) * .30, cy = .52 + (i % 2) * .12;
      to(body, (cx - body.home[0]) * u, (cy - body.home[1]) * u + h * .05, (cz - body.home[2]) * u);
      body.spin[1] = M.lerp(body.spin[1], u * .2, .02);
      /* claws and legs push outward from the body and roll over */
      for (var k = 1; k < g.all.length; k++) {
        var p = g.all[k];
        var ox = p.home[0] - body.home[0], oz = p.home[2] - body.home[2];
        var d = Math.hypot(ox, oz) || 1;
        to(p, (cx - p.home[0]) * u + ox / d * .22 * u,
              (cy - p.home[1]) * u + (k % 2 ? .10 : -.06) * u + h * .05,
              (cz - p.home[2]) * u + oz / d * .22 * u);
        if (u > .02) quat.slerp(p.targetQ, p.homeQ, euler(PI * .55 * (k % 2 ? 1 : -1), Math.atan2(ox, oz), .3), u);
      }
    }
    if (plate.flecks) for (var f = 0; f < plate.flecks.length; f++) {
      var fl = plate.flecks[f];
      to(fl, 0, open * (.12 + (f % 5) * .05), 0);
      fl.spin[0] = M.lerp(fl.spin[0], open * 1.6, .02);
    }
    steam(plate, ctx, dt, plate.steamRate * (1 - open * .5), { size: .20, life: 2.0, rise: .25 });
  };

  /* ── 12. Mussels Bucket ────────────────────────────────────
     Mussels open. Not by much and not all at once — a hinge of
     about forty degrees, staggered, with the meat sitting in the
     bottom valve where it actually is. Coming close opens them
     further, which is the whole interaction: the dish reacts to
     being looked at. */
  A.shellsOpen = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups, n = gs.length;
    for (var i = 0; i < n; i++) {
      var g = gs[i], u = stagger(open, i, n, .55);
      var h = on(ctx, g); light(g, h);
      var a = (i / n) * TAU + time * .05;
      var r = .30 + (i % 3) * .09;
      var b = g.bottom;
      var cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = .36 + (i % 4) * .09;
      var dx = (cx - b.home[0]) * u, dy = (cy - b.home[1]) * u, dz = (cz - b.home[2]) * u;
      to(g.bottom, dx, dy + h * .05, dz);
      to(g.meat, dx, dy + h * .05, dz);
      /* the top valve hinges back rather than translating: it
         stays touching at the narrow end */
      var gape = (u * .55 + h * .45) * .8;
      to(g.top, dx, dy + h * .05 + gape * .06, dz - gape * .04);
      quat.slerp(g.top.targetQ, g.upQ, quat.mul(quat.make(), g.upQ, euler(gape * 1.1, 0, 0)), 1);
      g.bottom.spin[1] = M.lerp(g.bottom.spin[1], u * .14, .02);
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .16, life: 1.8, rise: .28, alpha: .12 });
  };

  /* ── 13. Mix Shrimparty Bucket ─────────────────────────────
     Everything in the house, and the act is an inventory. The
     bucket empties upward in the order it was packed — potato
     and corn first, then mussels, calamari, shrimp, crab, and
     the lobster last and highest, because it is the thing you
     paid for. Each tier turns at its own rate, so the whole
     thing reads as a slow exploded diagram of a boil that you
     can reach into. */
  A.cascade = function (plate, t, open, ctx, dt, time) {
    var tiers = { potato: 0, corn: 0, mussel: 1, calamari: 2, shrimp: 3, crab: 4, lobster: 5 };
    var gs = plate.groups, i, k;
    var seen = {};
    for (i = 0; i < gs.length; i++) {
      var g = gs[i];
      var lvl = tiers[g.kind] === undefined ? 3 : tiers[g.kind];
      var idx = (seen[g.kind] = (seen[g.kind] || 0) + 1) - 1;
      var per = 0;
      for (k = 0; k < gs.length; k++) if (gs[k].kind === g.kind) per++;
      var u = E.outCubic(M.range(open, lvl * .105, lvl * .105 + .58));
      var a = (idx / Math.max(1, per)) * TAU + time * (.055 + lvl * .018) + lvl * .7;
      var r = .26 + lvl * .155;
      var h = on(ctx, g); light(g, h);
      var base = g.all[0].home;
      var cy = .42 + lvl * .30 + Math.sin(time * .7 + i * .9) * .012;
      groupTo(g, (Math.cos(a) * r - base[0]) * u, (cy - base[1]) * u + h * .06, (Math.sin(a) * r - base[2]) * u);
      if (u > .02) for (k = 0; k < g.all.length; k++) {
        g.all[k].spin[1] = M.lerp(g.all[k].spin[1], u * (.14 + lvl * .04), .02);
      }
      if (owns(ctx && ctx.sel, g.pick) && g.kind === 'shrimp') {
        D.peel(plate, g, ctx.peel || 0, ctx, time);
      }
    }
    /* the seasoning stays where the bucket was, hanging in the
       column the food left behind */
    if (plate.flecks) for (i = 0; i < plate.flecks.length; i++) {
      var f = plate.flecks[i];
      if (f.freed) continue;
      to(f, 0, open * (.10 + (i % 11) * .055), 0);
      f.spin[1] = M.lerp(f.spin[1], open * .9, .02);
    }
    steam(plate, ctx, dt, plate.steamRate * (1 - open * .55), { size: .24, life: 2.6, rise: .22 });
  };

  /* ── 14. Lobster Bucket ────────────────────────────────────
     One object worth walking round. It comes up whole, turns,
     and the claws swing out from the body rather than detaching
     — a lobster's claws are attached, and pretending otherwise
     to get a nicer diagram would be a lie about the food. */
  A.lobsterRise = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i], u = E.outCubic(M.range(open, i * .18, i * .18 + .70));
      var h = on(ctx, g); light(g, h);
      var lift = u * .58 + h * .06;
      var yaw = u * (.9 + i * .4) + time * .10 * u;
      for (var k = 0; k < g.all.length; k++) {
        var p = g.all[k];
        var ox = p.home[0] - g.all[0].home[0], oz = p.home[2] - g.all[0].home[2];
        var spread = k >= 2 ? .16 * u : 0;      /* the claws only */
        var d = Math.hypot(ox, oz) || 1;
        to(p, ox / d * spread, lift + (k >= 2 ? -.04 * u : 0), oz / d * spread);
        p.spin[1] = M.lerp(p.spin[1], u * .28, .03);
      }
    }
    if (plate.flecks) for (var f = 0; f < plate.flecks.length; f++) {
      to(plate.flecks[f], 0, open * .08, 0);
    }
    steam(plate, ctx, dt, plate.steamRate * (1 - open * .6), { size: .20, life: 2.0, rise: .24 });
  };

  /* ── the tagines ───────────────────────────────────────────
     All four begin with the lid, because that is what happens at
     the table: the cone comes off and the steam comes out. What
     they do afterwards is what makes them four dishes rather
     than one dish four times. */

  function lift(plate, open, t, ctx, dt) {
    var lid = plate.lid;
    var u = E.inOutCubic(M.range(open, 0, .42));
    /* Up, over, and down beside the pot — a lid that lifts
       straight up and hovers there is a lid nobody has ever
       seen, and it sits in the middle of the shot for the whole
       of the rest of the act. The arc peaks halfway across. */
    to(lid, u * 1.85, M.arc(u) * .55 + u * .05, -u * .55);
    quat.slerp(lid.targetQ, [0, 0, 0, 1], euler(-.30, .55, 1.15), u);
    lid.hover = ctx && ctx.hover === 'lid' ? .5 : 0;
    /* the plume is heaviest in the second the lid breaks its
       seal and then falls back to a simmer */
    var burst = M.arc(M.range(open, .05, .55));
    steam(plate, ctx, dt, plate.steamRate * (open * .5 + burst * 2.6), {
      size: .17 + burst * .16, life: 1.9 + burst * 1.1, rise: .30 + burst * .34,
      alpha: .12 + burst * .10, y: plate.steamY + u * .10
    });
    return u;
  }

  /* ── 15. Mix Seafood Tagin ── the three kinds separate out
     into a low ring inside the base, so you can see it really is
     three kinds. */
  A.lidLiftSpread = function (plate, t, open, ctx, dt, time) {
    lift(plate, open, t, ctx, dt);
    var gs = plate.groups, n = gs.length;
    var u = E.outCubic(M.range(open, .30, .95));
    for (var i = 0; i < n; i++) {
      var g = gs[i], p = g.all[0];
      var h = on(ctx, g); light(g, h);
      var a = (i / n) * TAU;
      var r = .40;
      groupTo(g, (Math.cos(a) * r - p.home[0]) * u, u * .10 + h * .08, (Math.sin(a) * r - p.home[2]) * u);
      for (var k = 0; k < g.all.length; k++) g.all[k].spin[1] = M.lerp(g.all[k].spin[1], u * .16, .02);
    }
  };

  /* ── 16. Fish Filet Tagin ── the fillets turn, and the herbs
     lift off the top so you can see what is under them. */
  A.lidLiftTurn = function (plate, t, open, ctx, dt, time) {
    lift(plate, open, t, ctx, dt);
    var u = E.outCubic(M.range(open, .32, .95));
    for (var i = 0; i < plate.groups.length; i++) {
      var g = plate.groups[i], p = g.all[0];
      var h = on(ctx, g); light(g, h);
      to(p, 0, u * .09 + h * .10, 0);
      p.spin[1] = M.lerp(p.spin[1], u * (.22 + i * .05), .03);
      if (h > .9) faceCam(p, ctx, 0);
    }
    for (var j = 0; j < plate.parts.length; j++) {
      var q = plate.parts[j];
      if (q.key.indexOf('herb') !== 0) continue;
      var hh = ctx && ctx.hover === q.id ? .8 : 0;
      q.hover = hh;
      to(q, 0, u * .16 + hh * .12 + settle(q, time, .004), 0);
      q.spin[1] = M.lerp(q.spin[1], u * .5, .02);
    }
  };

  /* ── 17. Shrimp Tagin ── they come up out of the sauce one at
     a time and hang there, dripping. Nothing spreads: the whole
     point of a tagine is that it is served in the pot. */
  A.lidLiftFloat = function (plate, t, open, ctx, dt, time) {
    lift(plate, open, t, ctx, dt);
    var gs = plate.groups, n = gs.length;
    for (var i = 0; i < n; i++) {
      var g = gs[i];
      var u = E.outCubic(M.range(open, .30 + (i / n) * .35, .30 + (i / n) * .35 + .40));
      var h = on(ctx, g); light(g, h);
      groupTo(g, 0, u * (.22 + (i % 3) * .07) + h * .08 + settle(g.all[0], time, .005), 0);
      for (var k = 0; k < g.all.length; k++) g.all[k].spin[1] = M.lerp(g.all[k].spin[1], u * .13, .02);
      if (u > .5 && !g.rippled && ctx && ctx.stage) {
        g.rippled = 1;
        ctx.stage.ripple(plate.origin[0] + g.all[0].home[0], plate.origin[2] + g.all[0].home[2], .7);
      }
      if (open < .2) g.rippled = 0;
      if (owns(ctx && ctx.sel, g.pick)) D.peel(plate, g, ctx.peel || 0, ctx, time);
    }
  };

  /* ── 18. Calamari Tagin ── the food barely moves; the sauce is
     the actor. It is the one dish on the menu whose description
     is three sauces, so the act is three seconds of watching a
     sauce move. */
  A.lidLiftSauce = function (plate, t, open, ctx, dt, time) {
    lift(plate, open, t, ctx, dt);
    var u = E.outCubic(M.range(open, .34, .95));
    for (var i = 0; i < plate.groups.length; i++) {
      var g = plate.groups[i], p = g.all[0];
      var h = on(ctx, g); light(g, h);
      to(p, 0, u * .045 + h * .13 + settle(p, time, .006), 0);
      p.spin[1] = M.lerp(p.spin[1], u * .1, .02);
    }
    if (ctx && ctx.stage && open > .3) {
      plate.sauceT = (plate.sauceT || 0) + dt;
      if (plate.sauceT > .40) {
        plate.sauceT = 0;
        var a = plate.rnd() * TAU, r = plate.rnd() * .34;
        ctx.stage.ripple(plate.origin[0] + Math.cos(a) * r, plate.origin[2] + Math.sin(a) * r, .55);
      }
    }
  };

  /* ── 19. Shrimparty Sizzling ───────────────────────────────
     The only dish on the menu that arrives still cooking, so it
     is the only one with heat in it. The iron glows where the
     food is not sitting, oil comes off it in a fine mist, the
     sauce is agitated the whole time, and everything on the
     plate has a tremor. Touch the iron and it spits. */
  A.sizzle = function (plate, t, open, ctx, dt, time) {
    var heat = M.sat(open * 1.4) * (.55 + .45 * Math.sin(time * 3.1) * Math.sin(time * 1.7));
    plate.ironMtl.emis = heat * .10;
    var i, k;
    for (i = 0; i < plate.groups.length; i++) {
      var g = plate.groups[i];
      var h = on(ctx, g); light(g, h);
      var u = stagger(open, i, plate.groups.length, .4);
      /* the tremor: high frequency, sub-millimetre, and it never
         stops while the plate is hot */
      var s = g.all[0].mtl.seed;
      var jx = Math.sin(time * 27 + s * 9) * .0035 * heat;
      var jz = Math.sin(time * 31 + s * 5) * .0035 * heat;
      groupTo(g, jx, u * .05 + h * .16 + Math.abs(Math.sin(time * 19 + s)) * .002 * heat, jz);
      if (h > .9) for (k = 0; k < g.all.length; k++) faceCam(g.all[k], ctx, PI * .5);
    }
    /* oil mist, and steam above it */
    if (ctx) {
      plate.oil = (plate.oil || 0) + dt * heat * 30;
      var n = Math.floor(plate.oil); plate.oil -= n;
      for (i = 0; i < n; i++) {
        var a = plate.rnd() * TAU, r = Math.sqrt(plate.rnd()) * .7;
        ctx.puff(plate.origin[0] + Math.cos(a) * r, plate.origin[1] + .18,
                 plate.origin[2] + Math.sin(a) * r * .66,
                 .022 + plate.rnd() * .022, .35 + plate.rnd() * .3, .9, 3, .5);
      }
    }
    steam(plate, ctx, dt, plate.steamRate * open * heat, { size: .20, life: 1.5, rise: .55, alpha: .13 });
    if (ctx && ctx.stage && open > .2) {
      plate.szT = (plate.szT || 0) + dt;
      if (plate.szT > .22) {
        plate.szT = 0;
        var sa = plate.rnd() * TAU, sr = plate.rnd() * .5;
        ctx.stage.ripple(plate.origin[0] + Math.cos(sa) * sr, plate.origin[2] + Math.sin(sa) * sr * .6, .9);
      }
    }
  };

  /* ── 20. Grilled Salmon ────────────────────────────────────
     A grilled fillet is a texture, and a texture needs a moving
     light across it. So the fish turns — slowly, once — and the
     lamp walks over the crust while it does. The lemon is the
     only thing you can pick up, because it is the only thing on
     the plate you would pick up. */
  A.grillMarks = function (plate, t, open, ctx, dt, time) {
    var f = plate.fish;
    var u = E.outCubic(M.range(open, 0, .8));
    var h = ctx && ctx.hover === 'fish' ? .5 : 0;
    f.hover = h;
    to(f, 0, u * .10 + h * .04, 0);
    f.spin[1] = M.lerp(f.spin[1], u * .17, .02);
    for (var i = 1; i < plate.groups.length; i++) {
      var g = plate.groups[i], p = g.all[0];
      var gh = on(ctx, g); light(g, gh);
      to(p, 0, u * .05 + gh * .26, 0);
      if (gh > .9) { faceCam(p, ctx, 0); p.spin[1] = M.lerp(p.spin[1], .6, .04); }
    }
    for (var j = 0; j < plate.parts.length; j++) {
      var q = plate.parts[j];
      if (q.key.indexOf('herb') !== 0) continue;
      to(q, 0, settle(q, time, .004) + u * .03, 0);
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .11, life: 1.3, rise: .30, alpha: .09 });
  };

  /* ── 21. Lobster Thermidor ─────────────────────────────────
     Three layers in one shell, so the act is a section. The
     cheese lifts and tips back like a lid, the meat comes up out
     of the shell behind it, and the shell stays where it is —
     which is the whole dish explained in one move. */
  A.openShell = function (plate, t, open, ctx, dt, time) {
    var u = E.inOutCubic(M.range(open, .05, .70));
    var hc = ctx && ctx.hover === 'cheese' ? .4 : 0;
    var hm = ctx && ctx.hover === 'meat' ? .4 : 0;
    plate.cheese.hover = hc; plate.meat.hover = hm; plate.shell.hover = ctx && ctx.hover === 'shell' ? .4 : 0;
    to(plate.cheese, 0, u * .30 + hc * .06, -u * .16);
    quat.slerp(plate.cheese.targetQ, euler(0, .2, 0), euler(-.55, .2, .05), u);
    to(plate.meat, 0, u * .13 + hm * .06, 0);
    plate.meat.spin[1] = M.lerp(plate.meat.spin[1], u * .12, .02);
    for (var i = 0; i < plate.shrimps.length; i++) {
      var g = plate.shrimps[i];
      var gu = stagger(open, i, plate.shrimps.length, .5);
      var h = on(ctx, g); light(g, h);
      groupTo(g, 0, gu * .13 + h * .09, 0);
      if (owns(ctx && ctx.sel, g.pick)) D.peel(plate, g, ctx.peel || 0, ctx, time);
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .13, life: 1.6, rise: .28, alpha: .12 });
  };

  /* ── 22. Fried Seabass ─────────────────────────────────────
     Breading is the point, and breading is only visible at a
     grazing angle. So the fillet rolls about its long axis into
     the key light and back, and the crumbs that were sitting on
     it come off as it turns. */
  A.crustTurn = function (plate, t, open, ctx, dt, time) {
    var f = plate.fish;
    var u = E.outCubic(M.range(open, 0, .75));
    var h = ctx && ctx.hover === 'fish' ? .5 : 0;
    f.hover = h;
    to(f, 0, u * .14 + h * .05, 0);
    var roll = Math.sin(time * .38) * .55 * u;
    quat.slerp(f.targetQ, euler(0, .18, 0), euler(0, .18 + u * .5, roll), 1);
    if (plate.crumbs) {
      for (var i = 0; i < plate.crumbs.length; i++) {
        var c = plate.crumbs[i];
        if (u > .3 && !c.freed && plate.rnd() < .006) {
          c.freed = 1; c.free = 1;
          c.pos[1] = f.pos[1] + .1;
          c.vel[0] = (plate.rnd() - .5) * .3; c.vel[1] = .05; c.vel[2] = (plate.rnd() - .5) * .3;
        }
        if (open < .05) { c.freed = 0; c.free = 0; }
      }
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .10, life: 1.1, rise: .30, alpha: .08 });
  };

  /* ── 23. Steamed White Rice ────────────────────────────────
     Steam, and the grains breathing by a fraction of a
     millimetre. That is the dish. Anything more would be a lie
     about a bowl of rice, and the restraint here is what makes
     the bucket next to it read as loud. */
  A.riceSteam = function (plate, t, open, ctx, dt, time) {
    for (var i = 0; i < plate.parts.length; i++) {
      var p = plate.parts[i];
      to(p, 0, settle(p, time, .0018), 0);
    }
    steam(plate, ctx, dt, plate.steamRate * open, { size: .17, life: 2.4, rise: .26, alpha: .13, y: .34, r: .5 });
  };

  /* ── 24. Baked Baby Potato ─────────────────────────────────
     Rosemary garlic butter. The potatoes roll slowly through the
     pool, each one picking up more gloss as it goes — the
     wetness on the material is driven by how far it has rolled,
     so the shine is a consequence of the motion rather than a
     separate effect. */
  A.butterGloss = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i], p = g.all[0];
      if (!p) continue;
      var h = on(ctx, g); light(g, h);
      var u = stagger(open, i, gs.length, .5);
      var a = (i / gs.length) * TAU + time * .16;
      var r = .34;
      to(p, (Math.cos(a) * r - p.home[0]) * u, u * .03 + h * .12, (Math.sin(a) * r - p.home[2]) * u);
      /* rolling about the tangent of the circle it is walking */
      p.spin[0] = M.lerp(p.spin[0], -Math.sin(a) * u * 1.5, .04);
      p.spin[2] = M.lerp(p.spin[2], Math.cos(a) * u * 1.5, .04);
      p.mtl.wet = M.lerp(p.mtl.wet, .58 + u * .34, .02);
      if (ctx && ctx.stage && u > .3) {
        plate.bT = (plate.bT || 0) + dt / gs.length;
        if (plate.bT > .3) {
          plate.bT = 0;
          ctx.stage.ripple(plate.origin[0] + p.pos[0], plate.origin[2] + p.pos[2], .4);
        }
      }
    }
    for (var j = 0; j < plate.parts.length; j++) {
      var q = plate.parts[j];
      if (q.key.indexOf('herb') !== 0) continue;
      to(q, 0, settle(q, time, .004), 0);
    }
  };

  /* ── the drinks ────────────────────────────────────────────
     Four cold drinks and two containers, and the brief was right
     that they need their own behaviour: a juice, a mojito, a
     soda and a bottle of water do not move alike. What they
     share is that the liquid is the thing that moves, not the
     glass. */

  /* ── 25. Fresh Juices ── no ice, no gas: a thick liquid that
     tilts and takes its time coming level again. */
  A.pourSettle = function (plate, t, open, ctx, dt, time) {
    if (ctx && ctx.stage) {
      plate.jT = (plate.jT || 0) + dt;
      if (plate.jT > 1.4 && open > .3) {
        plate.jT = 0;
        ctx.stage.ripple(plate.origin[0] + (plate.rnd() - .5) * .2, plate.origin[2] + (plate.rnd() - .5) * .2, .35);
      }
    }
  };

  /* ── 26. Mojitos ── ice and mint, both buoyant, both in the
     way of each other. Push a cube down and it comes back up
     and shoulders the others aside on the way. */
  A.muddle = function (plate, t, open, ctx, dt, time) {
    var gs = plate.groups;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i], p = g.all[0];
      var h = on(ctx, g); light(g, h);
      /* buoyancy: everything wants to be at the surface, and
         what is below it rises */
      var surf = plate.surfaceY - .12;
      var lift = M.sat((surf - p.pos[1]) * 2.2) * .10;
      to(p, settle(p, time, .004), lift + settle(p, time, .006), settle(p, time, .004));
      p.spin[1] = M.lerp(p.spin[1], .25 + (i % 3) * .1, .02);
      p.spin[0] = M.lerp(p.spin[0], .12, .02);
      if (p.held && ctx && ctx.stage) ctx.stage.ripple(plate.origin[0] + p.pos[0], plate.origin[2] + p.pos[2], .8);
    }
    for (var j = 0; j < plate.parts.length; j++) {
      var q = plate.parts[j];
      if (q.key.indexOf('herb') !== 0) continue;
      var a = time * .5 + q.mtl.seed;
      to(q, Math.cos(a) * .03, settle(q, time, .006), Math.sin(a) * .03);
      q.hover = ctx && ctx.hover === q.id ? .6 : 0;
    }
    if (ctx) {
      plate.bub = (plate.bub || 0) + dt * plate.bubbleRate * .5 * open;
      var n = Math.floor(plate.bub); plate.bub -= n;
      for (var b = 0; b < n; b++) {
        var ba = plate.rnd() * TAU, br = plate.rnd() * .24;
        ctx.puff(plate.origin[0] + Math.cos(ba) * br, plate.origin[1] + .12,
                 plate.origin[2] + Math.sin(ba) * br, .012 + plate.rnd() * .014,
                 1.1 + plate.rnd() * .5, .55, 1, .8);
      }
    }
  };

  /* ── 27. Shrimparty Soda ── carbonation, which is columns of
     bubbles from a few fixed points on the glass rather than a
     uniform fog. Knock it and every nucleation site lets go at
     once. */
  A.fizz = function (plate, t, open, ctx, dt, time) {
    if (!plate.sites) {
      plate.sites = [];
      for (var s = 0; s < 5; s++) {
        var a = plate.rnd() * TAU, r = .10 + plate.rnd() * .16;
        plate.sites.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
    var burst = plate.knock ? Math.exp(-(time - plate.knock) * 3.4) : 0;
    for (var i = 0; i < plate.groups.length; i++) {
      var g = plate.groups[i], p = g.all[0];
      var h = on(ctx, g); light(g, h);
      to(p, 0, settle(p, time, .005) + burst * .03, 0);
      p.spin[1] = M.lerp(p.spin[1], .2, .02);
    }
    if (ctx) {
      plate.bub = (plate.bub || 0) + dt * plate.bubbleRate * (.35 + burst * 3) * open;
      var n = Math.floor(plate.bub); plate.bub -= n;
      for (var b = 0; b < n; b++) {
        var site = plate.sites[(plate.rnd() * plate.sites.length) | 0];
        ctx.puff(plate.origin[0] + site[0] + (plate.rnd() - .5) * .02,
                 plate.origin[1] + .10,
                 plate.origin[2] + site[1] + (plate.rnd() - .5) * .02,
                 .008 + plate.rnd() * .012, 1.0 + plate.rnd() * .4, .75, 1, .9);
      }
    }
  };

  /* ── 28. Soft Drinks ── a cold can. Beads of condensation, and
     every so often one of them gets heavy enough to run, taking
     the beads below it with it and leaving a clear track. */
  A.condensationRun = function (plate, t, open, ctx, dt, time) {
    if (!plate.beads) {
      plate.beads = [];
      for (var i = 0; i < 90; i++) {
        plate.beads.push({
          a: plate.rnd() * TAU, y: .06 + plate.rnd() * .80,
          r: .006 + plate.rnd() * .010, v: 0, wait: plate.rnd() * 9
        });
      }
    }
    for (var k = 0; k < plate.beads.length; k++) {
      var b = plate.beads[k];
      b.wait -= dt;
      if (b.wait < 0 && b.v === 0 && b.r > .011) b.v = .02;
      if (b.v > 0) {
        b.v += dt * .35;
        b.y -= b.v * dt;
        if (b.y < .03) { b.y = .06 + plate.rnd() * .8; b.v = 0; b.wait = 4 + plate.rnd() * 8; }
      }
      if (ctx) {
        ctx.puff(plate.origin[0] + Math.cos(b.a) * .335, plate.origin[1] + b.y,
                 plate.origin[2] + Math.sin(b.a) * .335, b.r, 0, 0, 2, .9, true);
      }
    }
  };

  /* ── 29. Bottled Ice Tea ── it rocks on its base, and the
     drink inside lags the glass, which is the only cue that
     tells you there is liquid in a bottle you can see through. */
  A.bottleTilt = function (plate, t, open, ctx, dt, time) {
    var rock = Math.sin(time * 1.15) * .035 * open;
    var st = plate.statics[0], inner = plate.statics[1];
    m4.compose(st.mat, [0, 0, 0], euler(0, time * .12, rock), [1, 1, 1]);
    /* the liquid lags: the same rock, a fifth of a second late */
    var lag = Math.sin(time * 1.15 - .55) * .035 * open;
    m4.compose(inner.mat, [0, .01, 0], euler(0, time * .12, lag), [.93, .70, .93]);
    A.condensationRun(plate, t, open, ctx, dt, time);
  };

  /* ── 30. Water ── a clear bottle turns, and the light goes
     through it. Nothing else happens, and nothing else should. */
  A.clearRefract = function (plate, t, open, ctx, dt, time) {
    var st = plate.statics[0], inner = plate.statics[1];
    m4.compose(st.mat, [0, 0, 0], euler(0, time * .16, 0), [1, 1, 1]);
    m4.compose(inner.mat, [0, .01, 0], euler(0, time * .16, 0), [.93, .70, .93]);
    A.condensationRun(plate, t, open, ctx, dt, time);
  };

  /* ══════════════════════════════════════════════════════════
     CAMERA

     How each dish is covered. Everything gets an orbit by
     default because a plate of food is a thing you walk round;
     the overrides are the dishes where that would be wrong.
     ══════════════════════════════════════════════════════════ */

  var C = (D.CAMS = {});

  /* One shot builder. It is given the angle to stand at and how
     much headroom the act needs, and it asks the dish how big it
     is — see `D.frameDistance`. Every distance in this file was
     a hand-written number first, and every one of them was wrong
     for at least one dish: the number that framed a bucket put
     the lens inside a highball glass and halfway through a
     tagine.

     Opening a dish pushes in. Closed, the dish sits at about
     half the frame with the board around it; open, it fills two
     thirds and the lens has dropped to a working aperture, so
     the dishes either side of it are gone. */
  function shot(az, el, o) {
    o = o || {};
    var fov = o.fov || .58;
    var lift = o.lift === undefined ? .55 : o.lift;
    var fitShut = o.fitShut || .50, fitOpen = o.fitOpen || .70;
    var spin = o.spin === undefined ? .075 : o.spin;
    return function (plate, t, open, ctx) {
      var u = E.inOutCubic(M.sat(open));
      var a = az + t * spin;
      var e = M.lerp(el * .72, el, u);
      /* Choosing something is a shot change. The lens moves in
         on it and the frame rises to meet it, on every dish, so
         that picking a piece up reads as the camera taking an
         interest rather than as an object changing size. */
      var chosen = ctx && ctx.selPos ? 1 : 0;
      var head = lift * u;
      var r = D.frameDistance(plate, fov, M.lerp(fitShut, fitOpen, u), head);
      var ty = plate.tall * .55 + head * .45;
      var o0 = plate.origin;
      var cx = o0[0], cy = o0[1] + ty, cz = o0[2];
      if (chosen) {
        /* the close-up: the frame goes to where the piece is,
           and the lens comes in to about a hand's width of it */
        cx = ctx.selPos[0]; cy = ctx.selPos[1]; cz = ctx.selPos[2];
        r = Math.max(.80, r * .58);
      }
      var ex = cx + Math.sin(a) * Math.cos(e) * r;
      var ey = cy + Math.sin(e) * r;
      var ez = cz + Math.cos(a) * Math.cos(e) * r;
      var tx = cx, tyy = cy, tz = cz;

      /* Pan, rather than centre. The dish's own words live in the
         lower left of the frame, so the dish is pushed out of the
         middle to make room for them — the camera slides sideways
         and the geometry between it and the subject does not
         change, which is what a real operator would do rather
         than turning the head and skewing the perspective.

         The shift is a fraction of the visible width at the
         subject's distance, so it holds at any focal length and
         on any aspect ratio. */
      var halfW = Math.tan(fov * .5) * r;
      var slideX = -halfW * (chosen ? .30 : .40) * u;
      var slideY = -halfW * .10 * u;
      /* camera right, on the ground plane */
      var rx = Math.cos(a), rz = -Math.sin(a);
      ex += rx * slideX; ez += rz * slideX; ey += slideY;
      tx += rx * slideX; tz += rz * slideX; tyy += slideY;

      return {
        target: [tx, tyy, tz],
        eye: [ex, ey, ez],
        fov: fov,
        /* the aperture closes down as the dish opens: shallow
           depth of field on a dish you are inspecting, deep
           enough to see the table when you are not */
        aperture: chosen ? r * .11 : M.lerp(r * .55, r * .16, u)
      };
    };
  }

  /* Soup and rice are shot nearly level with the surface, which
     is the only angle where steam has anything to rise against. */
  C.brothSettle   = shot(.5,  .26, { lift: .25 });
  C.spoonStir     = shot(-.4, .24, { lift: .25 });
  C.riceSteam     = shot(.9,  .24, { lift: .15, spin: .04 });
  /* the salad is shot from above, because a bowl of leaves is
     flat and a low angle turns it into a hedge */
  C.liftFromGreens = shot(.2, .70, { lift: .35, fov: .60 });
  C.orbitSeparate  = shot(0,  .40, { lift: .30, spin: .14, fitOpen: .76 });
  C.crumbShake     = shot(.7, .46, { lift: .35 });
  C.ringRoll       = shot(-.5, .44, { lift: .35 });
  C.pullOne        = shot(.3, .38, { lift: .40 });
  C.cheesePull     = shot(.6, .32, { lift: .45 });
  /* the buckets empty upwards, so they need real headroom */
  C.riseAndHold    = shot(.4,  .28, { lift: .75, fitOpen: .82 });
  C.layerSplit     = shot(-.3, .32, { lift: 1.00, fitOpen: .82 });
  C.shellCrack     = shot(.8,  .34, { lift: .35, fitOpen: .78 });
  C.shellsOpen     = shot(-.6, .38, { lift: .30, fitOpen: .78 });
  C.cascade        = shot(.2,  .26, { lift: 1.20, fitOpen: .80, spin: .05 });
  C.lobsterRise    = shot(1.1, .26, { lift: .35, fitOpen: .78 });

  /* The tagines are looked *into* once the lid is off, so the
     elevation climbs with `open` rather than being fixed — and
     the frame has to hold the lid, which travels out to the side
     and stays there. */
  function tagineShot(az) {
    var inner = shot(az, .62, { lift: .55, fitShut: .46, fitOpen: .66, spin: .06 });
    return function (plate, t, open, ctx) {
      var sh = inner(plate, t, open, ctx);
      /* start low, looking at the closed cone, and climb */
      var u = E.inOutCubic(M.sat(open));
      var o0 = plate.origin;
      var e = M.lerp(.18, .62, u);
      var r = Math.hypot(sh.eye[0] - sh.target[0], sh.eye[1] - sh.target[1], sh.eye[2] - sh.target[2]);
      var a = az + t * .06;
      var ty = M.lerp(plate.tall * .52, plate.tall * .34, u);
      return {
        target: [o0[0], o0[1] + ty, o0[2]],
        eye: [o0[0] + Math.sin(a) * Math.cos(e) * r, o0[1] + ty + Math.sin(e) * r, o0[2] + Math.cos(a) * Math.cos(e) * r],
        fov: sh.fov, aperture: sh.aperture
      };
    };
  }
  C.lidLiftSpread = tagineShot(.35);
  C.lidLiftTurn   = tagineShot(-.55);
  C.lidLiftFloat  = tagineShot(.95);
  C.lidLiftSauce  = tagineShot(-1.25);

  /* the sizzler comes in fast and low, because that is the
     dish's whole personality */
  C.sizzle = (function () {
    var inner = shot(-.35, .17, { lift: .30, fitShut: .48, fitOpen: .80, fov: .60, spin: .05 });
    return function (plate, t, open, ctx) {
      var sh = inner(plate, t, open, ctx);
      /* the one dish whose push-in is on a hard ease rather than
         a soft one — it should feel like the plate arrived */
      sh.fov = M.lerp(.66, .54, E.outQuint(M.sat(open)));
      return sh;
    };
  })();

  C.grillMarks   = shot(-.8, .40, { lift: .30 });
  C.openShell    = shot(.55, .36, { lift: .30, fitOpen: .76 });
  C.crustTurn    = shot(-.2, .34, { lift: .25 });
  C.butterGloss  = shot(.4,  .46, { lift: .25 });

  /* drinks are tall and narrow, so they are shot from low and
     the frame is filled by height rather than by width */
  C.pourSettle      = shot(.3,  .16, { lift: .10, fitShut: .58, fitOpen: .80 });
  C.muddle          = shot(-.4, .20, { lift: .10, fitShut: .58, fitOpen: .80 });
  C.fizz            = shot(.7,  .18, { lift: .18, fitShut: .58, fitOpen: .80 });
  C.condensationRun = shot(-.9, .16, { lift: .05, fitShut: .58, fitOpen: .82, spin: .11 });
  C.bottleTilt      = shot(.5,  .14, { lift: .05, fitShut: .58, fitOpen: .82 });
  C.clearRefract    = shot(-.3, .14, { lift: .05, fitShut: .58, fitOpen: .82, spin: .10 });

  D.defaultShot = shot(.3, .34, { lift: .5 });

})(window);
