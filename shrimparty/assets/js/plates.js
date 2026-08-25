/* ═══════════════════════════════════════════════════════════
   plates.js — thirteen ways to build a dish, thirty ways to
   open one.

   BUILDERS take a menu record and fill a plate with vessels,
   food and garnish. They run once, when a dish is first looked
   at, and they are seeded off the dish's index so the same
   bucket is packed the same way every reload — a menu that
   reshuffles itself when you scroll past twice is not a menu.

   ACTS run every frame. They receive the plate, the time since
   it started opening, and how far open it is, and their only
   job is to say where every part should be *trying* to be. They
   never set a position directly. The springs in dishes.js do
   the moving, which is what keeps the motion physical: a shell
   plate that has been pulled off and dropped is still falling
   while the act is busy telling the rest of the shrimp what to
   do, and nothing has to coordinate that.

   CAMS say how the camera covers each dish. Some dishes want an
   orbit, some want a push-in, the tagines want to be looked
   down into once the lid is off, and the soups want the lens
   almost level with the broth because that is the only angle
   from which steam reads.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var M = SP.M, D = SP.Dishes, F = SP.Forms;
  var m4 = M.m4, quat = M.quat, v3 = M.v3, E = M.E;
  var MTL = D.MTL, Part = D.Part, of = D.of;
  var TAU = Math.PI * 2, PI = Math.PI;

  var Q0 = [0, 0, 0, 1];
  function euler(x, y, z) { return quat.fromEuler(quat.make(), x, y, z); }

  /* ══════════════════════════════════════════════════════════
     BUILDERS
     ══════════════════════════════════════════════════════════ */

  var BUILD = {};

  /* ── the bucket ────────────────────────────────────────────
     Galvanised pail, food packed in layers the way a boil comes
     out of the pot: potato and corn go in first and end up at
     the bottom, shellfish on top of them, seasoning over
     everything. That ordering is the reason `layerSplit` has
     something to split. */
  BUILD.bucket = function (plate, dish) {
    var o = dish.opts, wide = !!o.wide;
    var R = wide ? 1.16 : 1.0;
    plate.stat(wide ? 'bucketWide' : 'bucket', [0, 0, 0], Q0, [1, 1, 1], of(MTL.steelWorn, { seed: 2.4 }));
    plate.floor = .10;

    var i, a, r, y;

    /* A bucket that holds its food below the rim is a bin. The
       whole point of the format is that the boil is heaped over
       the top of the pail, so everything here is packed into a
       dome: the sunflower angle spreads it evenly across the
       radius, and the height falls away from the middle, so the
       silhouette is a mound and the outer pieces lean on the
       rim rather than hiding behind it. */
    function mound(rad, base, spread) {
      return base + (1 - rad / R) * spread;
    }

    /* the base layer */
    for (i = 0; i < (o.potato || 0); i++) {
      a = plate.rnd() * TAU; r = Math.sqrt(plate.rnd()) * R * .58;
      plate.add(new Part(i % 2 ? 'potato2' : 'potato', MTL.potato, {
        home: [Math.cos(a) * r, mound(r, .20, .10) + plate.rnd() * .05, Math.sin(a) * r],
        homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, plate.rnd() * TAU),
        scale: [.68, .68, .68], seed: plate.rnd() * 9,
        radius: .14, weight: 1.1, k: 24, damp: 8, pickR: .20,
        id: 'potato' + i, label: 'Baby potato'
      }));
    }
    for (i = 0; i < (o.corn || 0); i++) {
      a = plate.rnd() * TAU; r = Math.sqrt(plate.rnd()) * R * .55;
      plate.add(new Part('corn', MTL.corn, {
        home: [Math.cos(a) * r, mound(r, .24, .10) + plate.rnd() * .04, Math.sin(a) * r],
        homeQ: euler(PI / 2 + (plate.rnd() - .5) * .5, plate.rnd() * TAU, 0),
        scale: [.62, .62, .62], seed: plate.rnd() * 9,
        radius: .17, weight: 1.2, k: 24, damp: 8, pickR: .24,
        id: 'corn' + i, label: 'Sweet corn'
      }));
    }

    /* the shellfish, in the order the menu lists them */
    plate.groups = [];
    var slot = 0, mix = o.mix || [];
    for (var m = 0; m < mix.length; m++) {
      var kind = mix[m][0], n = mix[m][1];
      for (i = 0; i < n; i++) {
        var ang = slot * 2.399963;             /* the sunflower angle: */
        var rad = Math.sqrt((slot + .6) / 26) * R * .74;   /* even packing, no rings */
        var at = [Math.cos(ang) * rad, mound(rad, .40, .17) + plate.rnd() * .05, Math.sin(ang) * rad];
        var g = null;
        if (kind === 'shrimp') {
          g = D.shrimp(plate, at, .40, {
            q: euler((plate.rnd() - .5) * .9, plate.rnd() * TAU, (plate.rnd() - .5) * .8),
            pick: 'shrimp' + slot, seed: plate.rnd() * 9
          });
          g.kind = 'shrimp'; g.pick = 'shrimp' + slot;
        } else if (kind === 'mussel') {
          g = D.mussel(plate, at, .46, { pick: 'mussel' + slot, tilt: (plate.rnd() - .5) * .8 });
          g.kind = 'mussel'; g.pick = 'mussel' + slot;
        } else if (kind === 'crab') {
          g = D.crab(plate, at, .58, { pick: 'crab' + slot });
          g.kind = 'crab'; g.pick = 'crab' + slot;
        } else if (kind === 'lobster') {
          g = D.lobster(plate, [at[0], at[1] + .08, at[2]], .66, { pick: 'lobster' + slot, yaw: plate.rnd() * TAU });
          g.kind = 'lobster'; g.pick = 'lobster' + slot;
        } else if (kind === 'calamari') {
          var p = plate.add(new Part('ringPlain', MTL.calamari, {
            home: at, homeQ: euler((plate.rnd() - .5) * 1.2, plate.rnd() * TAU, (plate.rnd() - .5) * 1.2),
            scale: [.95, .95, .95], seed: plate.rnd() * 9,
            radius: .17, weight: .5, k: 26, damp: 8, pickR: .24,
            id: 'calamari' + slot, label: 'Calamari'
          }));
          g = { kind: 'calamari', all: [p], pick: 'calamari' + slot, ring: p };
        }
        if (g) plate.groups.push(g);
        slot++;
      }
    }

    plate.flecks = D.seasoning(plate, o.seasoning || 200, R * .82, .34, { h: .38 });
    /* the sauce the boil is sitting in, pooled in the bottom */
    plate.liq('liquid', [0, .17, 0], [R * .70, 1, R * .70], MTL.sauceCajun);
    plate.steamY = .62;
    plate.steamR = R * .6;
    plate.steamRate = o.steam === undefined ? .5 : o.steam;
    plate.rim = R;
  };

  /* ── a bowl of soup ────────────────────────────────────── */
  BUILD.bowl = function (plate, dish) {
    var o = dish.opts;
    plate.stat('bowl', [0, 0, 0], Q0, [1, 1, 1], of(MTL.ceramic, { seed: 1.1 }));
    plate.floor = .16;
    var broth = o.broth === 'red' ? MTL.brothRed : o.broth === 'rice' ? MTL.rice : MTL.brothCream;
    plate.liq('liquid', [0, .345, 0], [.83, 1, .83], broth);
    plate.surfaceY = .345;

    var pieces = o.pieces || [];
    var i, n = 0;
    for (i = 0; i < 11; i++) {
      var kind = pieces[i % Math.max(1, pieces.length)];
      if (!pieces.length) break;
      var a = i * 2.399963, r = Math.sqrt((i + .5) / 12) * .58;
      var at = [Math.cos(a) * r, .30 + plate.rnd() * .04, Math.sin(a) * r];
      if (kind === 'shrimp') {
        var g = D.shrimp(plate, at, .26, {
          q: euler((plate.rnd() - .5) * .6, plate.rnd() * TAU, 0),
          pick: 'p' + i, seed: plate.rnd() * 9
        });
        g.kind = 'shrimp'; g.pick = 'p' + i;
        (plate.groups || (plate.groups = [])).push(g);
      } else if (kind === 'calamari') {
        plate.add(new Part('ringSmall', MTL.calamari, {
          home: at, homeQ: euler((plate.rnd() - .5) * .8, plate.rnd() * TAU, 0),
          scale: [.62, .62, .62], seed: plate.rnd() * 9,
          radius: .10, weight: .4, k: 22, damp: 7, id: 'p' + i, label: 'Calamari'
        }));
      } else {
        plate.add(new Part('fishChunk', MTL.fishFlesh, {
          home: at, homeQ: euler((plate.rnd() - .5) * .5, plate.rnd() * TAU, 0),
          scale: [.7, .7, .7], seed: plate.rnd() * 9,
          radius: .11, weight: .6, k: 22, damp: 7, id: 'p' + i, label: 'Fish'
        }));
      }
      n++;
    }
    if (o.broth === 'rice') {
      /* rice is not soup: a low mound of grains, no liquid look */
      plate.liquids.length = 0;
      for (i = 0; i < 220; i++) {
        var ra = plate.rnd() * TAU, rr = Math.pow(plate.rnd(), .6) * .62;
        plate.add(new Part('rice', MTL.rice, {
          home: [Math.cos(ra) * rr, .20 + (1 - rr / .62) * .16 + plate.rnd() * .03, Math.sin(ra) * rr],
          homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, plate.rnd() * TAU),
          scale: [1, 1, 1], seed: plate.rnd() * 9,
          radius: .02, weight: .05, k: 18, damp: 6
        }));
      }
    }
    if (o.spoon) {
      plate.spoon = plate.add(new Part('spoon', MTL.steel, {
        home: [.30, .40, .18], homeQ: euler(-.35, -.6, .1), scale: [1, 1, 1],
        seed: 4.1, radius: .16, weight: .9, k: 30, damp: 9,
        id: 'spoon', label: 'Spoon'
      }));
    }
    plate.steamY = .40; plate.steamR = .55;
    plate.steamRate = o.steam === undefined ? 1 : o.steam;
    plate.rim = .92;
  };

  /* ── the caesar ────────────────────────────────────────── */
  BUILD.salad = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('bowl', [0, 0, 0], Q0, [1, 1, 1], of(MTL.ceramic, { seed: 3.2 }));
    plate.floor = .18;
    for (i = 0; i < (o.leaves || 24); i++) {
      var a = plate.rnd() * TAU, r = Math.pow(plate.rnd(), .55) * .62;
      plate.add(new Part(i % 2 ? 'lettuce' : 'lettuce2', i % 3 ? MTL.romaine : MTL.lettuce, {
        home: [Math.cos(a) * r, .22 + plate.rnd() * .22, Math.sin(a) * r],
        homeQ: euler((plate.rnd() - .5) * 1.6, plate.rnd() * TAU, (plate.rnd() - .5) * 1.6),
        scale: [.8, .8, .8], seed: plate.rnd() * 9,
        radius: .14, weight: .18, k: 20, damp: 6.5, label: 'Romaine'
      }));
    }
    plate.shrimps = [];
    for (i = 0; i < (o.shrimp || 6); i++) {
      var ang = i / (o.shrimp || 6) * TAU + .4;
      var g = D.shrimp(plate, [Math.cos(ang) * .40, .44, Math.sin(ang) * .40], .30, {
        q: euler(-.25, ang + PI * .5, 0), pick: 'shrimp' + i, seed: plate.rnd() * 9
      });
      g.kind = 'shrimp'; g.pick = 'shrimp' + i;
      plate.shrimps.push(g);
      (plate.groups || (plate.groups = [])).push(g);
    }
    for (i = 0; i < (o.parmesan || 20); i++) {
      var pa = plate.rnd() * TAU, pr = Math.pow(plate.rnd(), .5) * .62;
      plate.add(new Part('shard', MTL.parmesan, {
        home: [Math.cos(pa) * pr, .40 + plate.rnd() * .14, Math.sin(pa) * pr],
        homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, plate.rnd() * TAU),
        scale: [1, 1, 1], seed: plate.rnd() * 9,
        radius: .04, weight: .06, k: 16, damp: 5, label: 'Parmesan'
      }));
    }
    plate.steamRate = 0; plate.rim = .92;
  };

  /* ── a plate of things ─────────────────────────────────── */
  BUILD.platter = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('plate', [0, 0, 0], Q0, [1, 1, 1], of(MTL.ceramic, { seed: 5.4 }));
    plate.floor = .06;
    var mix = o.mix || ['shrimp'];
    plate.groups = [];
    for (i = 0; i < (o.count || 10); i++) {
      var kind = mix[i % mix.length];
      var a = i * 2.399963, r = Math.sqrt((i + .5) / (o.count || 10)) * .60;
      var at = [Math.cos(a) * r, .10 + plate.rnd() * .05, Math.sin(a) * r];
      if (kind === 'shrimp') {
        var g = D.shrimp(plate, at, .30, {
          q: euler((plate.rnd() - .5) * .5, plate.rnd() * TAU, 0), pick: 'p' + i, seed: plate.rnd() * 9
        });
        g.kind = 'shrimp'; g.pick = 'p' + i;
        for (var k = 0; k < g.all.length; k++) {
          g.all[k].mtl = of(MTL.friedShell, { seed: g.all[k].mtl.seed });
        }
        plate.groups.push(g);
      } else if (kind === 'calamari') {
        plate.groups.push({ kind: 'calamari', pick: 'p' + i, all: [plate.add(new Part('ringSmall', MTL.breading, {
          home: at, homeQ: euler((plate.rnd() - .5) * 1.4, plate.rnd() * TAU, (plate.rnd() - .5) * 1.4),
          scale: [.9, .9, .9], seed: plate.rnd() * 9,
          radius: .13, weight: .4, k: 24, damp: 7, id: 'p' + i, label: 'Calamari'
        }))] });
      } else if (kind === 'potato') {
        plate.groups.push({ kind: 'potato', pick: 'p' + i, all: [plate.add(new Part(i % 2 ? 'potato' : 'potato2', MTL.potato, {
          home: at, homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, plate.rnd() * TAU),
          scale: [.66, .66, .66], seed: plate.rnd() * 9,
          radius: .13, weight: 1, k: 24, damp: 8, id: 'p' + i, label: 'Baby potato'
        }))] });
      } else {
        plate.groups.push({ kind: 'fish', pick: 'p' + i, all: [plate.add(new Part('fishFinger', MTL.breading, {
          home: at, homeQ: euler((plate.rnd() - .5) * .4, plate.rnd() * TAU, 0),
          scale: [.8, .8, .8], seed: plate.rnd() * 9,
          radius: .16, weight: .6, k: 24, damp: 7, id: 'p' + i, label: 'Fried fish'
        }))] });
      }
    }
    for (i = 0; i < (o.lemon || 0); i++) {
      var la = -.6 + i * 1.2;
      plate.add(new Part('lemon', MTL.lemon, {
        home: [Math.cos(la) * .70, .09, Math.sin(la) * .70],
        homeQ: euler(0, la, .25), scale: [.8, .8, .8], seed: plate.rnd() * 9,
        radius: .13, weight: .4, k: 24, damp: 8, id: 'lemon' + i, label: 'Lemon'
      }));
    }
    for (i = 0; i < (o.herbs || 0); i++) {
      var ha = plate.rnd() * TAU, hr = Math.pow(plate.rnd(), .5) * .55;
      plate.add(new Part(i % 2 ? 'herb' : 'herb2', MTL.herb, {
        home: [Math.cos(ha) * hr, .16 + plate.rnd() * .05, Math.sin(ha) * hr],
        homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, 0), scale: [1, 1, 1],
        seed: plate.rnd() * 9, radius: .06, weight: .07, k: 16, damp: 5, label: 'Rosemary'
      }));
    }
    if (o.mix && o.mix[0] === 'potato') plate.liq('liquid', [0, .055, 0], [.62, 1, .62], MTL.sauceCajun);
    plate.steamRate = o.steam || 0;
    plate.rim = .95;
  };

  /* ── the fry basket ────────────────────────────────────── */
  BUILD.basket = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('basket', [0, 0, 0], Q0, [1, 1, 1], of(MTL.steel, { seed: 6.6 }));
    plate.floor = .05;
    plate.groups = [];
    var n = o.count || 10;
    for (i = 0; i < n; i++) {
      var a = i * 2.399963, r = Math.sqrt((i + .6) / n) * .52;
      var at = [Math.cos(a) * r, .12 + plate.rnd() * .14, Math.sin(a) * r];
      if (o.item === 'shrimp') {
        var g = D.shrimp(plate, at, .32, {
          q: euler((plate.rnd() - .5) * .8, plate.rnd() * TAU, (plate.rnd() - .5) * .8),
          pick: 'p' + i, seed: plate.rnd() * 9
        });
        for (var k = 0; k < g.all.length; k++) g.all[k].mtl = of(MTL.friedShell, { seed: g.all[k].mtl.seed, crust: .5 });
        g.kind = 'shrimp'; g.pick = 'p' + i;
        plate.groups.push(g);
      } else if (o.item === 'calamari') {
        plate.groups.push({ kind: 'calamari', pick: 'p' + i, all: [plate.add(new Part('ringSmall', MTL.breading, {
          home: at, homeQ: euler((plate.rnd() - .5) * 1.5, plate.rnd() * TAU, (plate.rnd() - .5) * 1.5),
          scale: [.95, .95, .95], seed: plate.rnd() * 9,
          radius: .14, weight: .42, k: 24, damp: 7, id: 'p' + i, label: 'Calamari ring'
        }))] });
      } else {
        plate.groups.push({ kind: 'finger', pick: 'p' + i, all: [plate.add(new Part('fishFinger', MTL.breading, {
          home: at, homeQ: euler((plate.rnd() - .5) * .5, plate.rnd() * TAU, (plate.rnd() - .5) * .3),
          scale: [.92, .92, .92], seed: plate.rnd() * 9,
          radius: .18, weight: .62, k: 24, damp: 7, id: 'p' + i, label: 'Fish finger'
        }))] });
      }
    }
    plate.crumbs = D.crumbs(plate, o.crumbs || 60, .60, .07);
    /* the dip, in its own little pot at the edge of the basket */
    var dipCol = o.dip === 'mustard' ? MTL.sauceCheese : o.dip === 'tartar' ? MTL.sauceCream : MTL.sauceRed;
    plate.stat('bowl', [.88, 0, .28], Q0, [.34, .34, .34], of(MTL.ceramic, { seed: 8.2 }));
    plate.dipAt = [.88, .16, .28];
    plate.liq('liquid', [.88, .155, .28], [.27, 1, .27], dipCol);
    plate.add(new Part('lemon', MTL.lemon, {
      home: [-.72, .10, .48], homeQ: euler(0, -.9, .3), scale: [.78, .78, .78],
      seed: 2.2, radius: .12, weight: .4, k: 24, damp: 8, id: 'lemon', label: 'Lemon'
    }));
    plate.steamRate = .22; plate.rim = 1;
  };

  /* ── baked mussels under cheese ────────────────────────── */
  BUILD.gratin = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('plate', [0, 0, 0], Q0, [1, 1, 1], of(MTL.ceramic, { seed: 4.8 }));
    plate.floor = .07;
    plate.shells = [];
    var n = o.mussels || 9;
    for (i = 0; i < n; i++) {
      var a = i * 2.399963, r = Math.sqrt((i + .6) / n) * .55;
      var at = [Math.cos(a) * r, .10, Math.sin(a) * r];
      var yaw = plate.rnd() * TAU;
      /* half-shell: one valve, meat in it, cheese over the top */
      var sh = plate.add(new Part('musselShell', MTL.musselOut, {
        home: at, homeQ: euler(0, yaw, 0), scale: [.46, .46, .46], seed: plate.rnd() * 9,
        radius: .17, weight: .7, k: 26, damp: 8, pickR: .24, id: 'm' + i, label: 'Mussel'
      }));
      var me = plate.add(new Part('musselMeat', MTL.musselMeat, {
        home: [at[0], at[1] + .03, at[2]], homeQ: euler(0, yaw, 0), scale: [.42, .42, .42],
        seed: plate.rnd() * 9, radius: .09, weight: .4, k: 26, damp: 8, solid: false, label: 'Mussel meat'
      }));
      var ch = plate.add(new Part('musselMeat', MTL.cheeseMelt, {
        home: [at[0], at[1] + .045, at[2]], homeQ: euler(0, yaw, 0), scale: [.50, .30, .56],
        seed: plate.rnd() * 9, radius: .10, weight: .2, k: 20, damp: 7, solid: false, label: 'Mozzarella'
      }));
      plate.shells.push({ shell: sh, meat: me, cheese: ch, at: at, pick: 'm' + i });
    }
    plate.groups = plate.shells.map(function (s) { return { kind: 'mussel', pick: s.pick, all: [s.shell, s.meat, s.cheese] }; });
    plate.steamY = .22; plate.steamR = .5; plate.steamRate = o.steam || .8;
    plate.rim = .95;
  };

  /* ── the tagine ────────────────────────────────────────── */
  BUILD.tagine = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('tagineBase', [0, 0, 0], Q0, [1, 1, 1], of(MTL.clay, { seed: 7.1 }));
    plate.floor = .08;
    plate.liq('liquid', [0, .13, 0], [.62, 1, .62], o.fill && o.fill[0] && o.fill[0][0] === 'calamari' ? MTL.sauceRed : MTL.sauceCajun);

    plate.lid = plate.add(new Part('tagineLid', MTL.clay, {
      home: [0, .21, 0], homeQ: Q0.slice(), scale: [1, 1, 1], seed: 1.9,
      radius: .9, weight: 2.4, k: 20, damp: 9, id: 'lid', label: 'The lid'
    }));
    plate.lid.floor = -2;

    plate.groups = [];
    var fill = o.fill || [], slot = 0;
    for (var m = 0; m < fill.length; m++) {
      for (i = 0; i < fill[m][1]; i++) {
        var a = slot * 2.399963, r = Math.sqrt((slot + .6) / 13) * .46;
        var at = [Math.cos(a) * r, .19 + plate.rnd() * .04, Math.sin(a) * r];
        var kind = fill[m][0];
        if (kind === 'shrimp') {
          var g = D.shrimp(plate, at, .28, {
            q: euler((plate.rnd() - .5) * .5, plate.rnd() * TAU, 0), pick: 'p' + slot, seed: plate.rnd() * 9
          });
          g.kind = 'shrimp'; g.pick = 'p' + slot;
          plate.groups.push(g);
        } else if (kind === 'calamari') {
          plate.groups.push({ kind: 'calamari', pick: 'p' + slot, all: [plate.add(new Part('ringSmall', MTL.calamari, {
            home: at, homeQ: euler((plate.rnd() - .5) * .9, plate.rnd() * TAU, 0),
            scale: [.7, .7, .7], seed: plate.rnd() * 9,
            radius: .11, weight: .4, k: 22, damp: 7, id: 'p' + slot, label: 'Calamari'
          }))] });
        } else {
          plate.groups.push({ kind: 'fish', pick: 'p' + slot, all: [plate.add(new Part('fishChunk', MTL.fishFlesh, {
            home: at, homeQ: euler((plate.rnd() - .5) * .4, plate.rnd() * TAU, 0),
            scale: [.85, .85, .85], seed: plate.rnd() * 9,
            radius: .14, weight: .7, k: 22, damp: 7, id: 'p' + slot, label: 'Fish fillet'
          }))] });
        }
        slot++;
      }
    }
    if (o.onion) {
      for (i = 0; i < 6; i++) {
        var oa = plate.rnd() * TAU, or_ = Math.pow(plate.rnd(), .5) * .44;
        plate.add(new Part('ringPlain', MTL.onion, {
          home: [Math.cos(oa) * or_, .17, Math.sin(oa) * or_],
          homeQ: euler(PI / 2 + (plate.rnd() - .5) * .4, plate.rnd() * TAU, 0),
          scale: [.62, .62, .62], seed: plate.rnd() * 9,
          radius: .10, weight: .2, k: 20, damp: 6, label: 'White onion'
        }));
      }
    }
    for (i = 0; i < (o.herbs || 4); i++) {
      var ha = plate.rnd() * TAU, hr = Math.pow(plate.rnd(), .5) * .42;
      plate.add(new Part(i % 2 ? 'herb' : 'herb2', MTL.herb, {
        home: [Math.cos(ha) * hr, .22, Math.sin(ha) * hr],
        homeQ: euler(0, plate.rnd() * TAU, 0), scale: [1, 1, 1], seed: plate.rnd() * 9,
        radius: .06, weight: .07, k: 16, damp: 5, id: 'herb' + i, label: 'Herbs'
      }));
    }
    /* the RASHOUSH, alongside */
    plate.stat('bread', [1.05, .09, -.15], euler(0, .4, 0), [.95, 1, .95], of(MTL.bread, { seed: 3.4 }));
    plate.steamY = .30; plate.steamR = .42;
    plate.steamRate = o.steam === undefined ? 1.2 : o.steam;
    plate.rim = 1.0;
  };

  /* ── the sizzling plate ────────────────────────────────── */
  BUILD.sizzler = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('board', [0, -.02, 0], Q0, [1, 1, 1], of(MTL.wood, { seed: 2.7 }));
    plate.iron = plate.stat('sizzlePlate', [0, .06, 0], Q0, [1.05, 1, .72], of(MTL.castIron, { seed: 5.2 }));
    plate.ironMtl = plate.statics[plate.statics.length - 1].mtl;
    plate.floor = .12;
    plate.groups = [];
    for (i = 0; i < (o.salmon || 2); i++) {
      plate.groups.push({ kind: 'salmon', pick: 's' + i, all: [plate.add(new Part('fillet', MTL.salmon, {
        home: [-.42 + i * .52, .17, -.18 + i * .10],
        homeQ: euler(0, .3 - i * .5, 0), scale: [.72, .72, .72], seed: plate.rnd() * 9,
        radius: .30, weight: 1, k: 26, damp: 8, id: 's' + i, label: 'Salmon'
      }))] });
    }
    for (i = 0; i < (o.shrimp || 6); i++) {
      var a = i / (o.shrimp || 6) * TAU;
      var g = D.shrimp(plate, [Math.cos(a) * .48, .17, Math.sin(a) * .30 + .12], .28, {
        q: euler(0, a * .6 + 1, 0), pick: 'p' + i, seed: plate.rnd() * 9
      });
      g.kind = 'shrimp'; g.pick = 'p' + i;
      plate.groups.push(g);
    }
    for (i = 0; i < (o.calamari || 5); i++) {
      var ca = plate.rnd() * TAU, cr = Math.pow(plate.rnd(), .5) * .52;
      plate.groups.push({ kind: 'calamari', pick: 'c' + i, all: [plate.add(new Part('ringSmall', MTL.calamari, {
        home: [Math.cos(ca) * cr, .16, Math.sin(ca) * cr * .66],
        homeQ: euler(PI / 2, plate.rnd() * TAU, 0), scale: [.72, .72, .72], seed: plate.rnd() * 9,
        radius: .11, weight: .35, k: 24, damp: 7, id: 'c' + i, label: 'Calamari'
      }))] });
    }
    plate.liq('liquid', [0, .135, 0], [.86, 1, .58], MTL.sauceCajun);
    plate.steamY = .30; plate.steamR = .62;
    plate.steamRate = o.steam || 1.6;
    plate.rim = 1.1;
  };

  /* ── off the grill ─────────────────────────────────────── */
  BUILD.grill = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('plate', [0, 0, 0], Q0, [1.05, 1, 1.05], of(MTL.ceramic, { seed: 6.1 }));
    plate.floor = .07;
    var salmon = o.fillet === 'salmon';
    plate.fish = plate.add(new Part(o.breaded ? 'filletBreaded' : 'fillet',
      salmon ? MTL.salmon : (o.breaded ? MTL.breading : MTL.seabass), {
      home: [0, .16, 0], homeQ: euler(0, .18, 0), scale: [1.05, 1.05, 1.05], seed: 3.7,
      radius: .44, weight: 1.4, k: 24, damp: 9, id: 'fish', label: salmon ? 'Salmon fillet' : 'Seabass fillet'
    }));
    plate.groups = [{ kind: 'fish', pick: 'fish', all: [plate.fish] }];
    for (i = 0; i < (o.lemon || 0); i++) {
      var la = -.5 + i * 1.0;
      plate.groups.push({ kind: 'lemon', pick: 'lemon' + i, all: [plate.add(new Part('lemon', MTL.lemon, {
        home: [Math.cos(la) * .66, .10, Math.sin(la) * .66], homeQ: euler(0, la, .3),
        scale: [.85, .85, .85], seed: plate.rnd() * 9,
        radius: .14, weight: .4, k: 24, damp: 8, id: 'lemon' + i, label: 'Lemon'
      }))] });
    }
    for (i = 0; i < (o.herbs || 0); i++) {
      var ha = plate.rnd() * TAU, hr = .12 + plate.rnd() * .3;
      plate.add(new Part(i % 2 ? 'herb' : 'herb2', MTL.herb, {
        home: [Math.cos(ha) * hr, .24, Math.sin(ha) * hr * .6],
        homeQ: euler(0, plate.rnd() * TAU, 0), scale: [1, 1, 1], seed: plate.rnd() * 9,
        radius: .06, weight: .07, k: 16, damp: 5, id: 'herb' + i, label: 'Herbs'
      }));
    }
    if (o.crumbs) plate.crumbs = D.crumbs(plate, o.crumbs, .60, .08);
    if (o.rice) {
      for (i = 0; i < 190; i++) {
        var ra = plate.rnd() * TAU, rr = Math.pow(plate.rnd(), .6) * .34;
        plate.add(new Part('rice', MTL.rice, {
          home: [-.62 + Math.cos(ra) * rr, .10 + (1 - rr / .34) * .10, .30 + Math.sin(ra) * rr],
          homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, plate.rnd() * TAU),
          scale: [1, 1, 1], seed: plate.rnd() * 9, radius: .02, weight: .05, k: 18, damp: 6
        }));
      }
    }
    plate.steamY = .28; plate.steamR = .38;
    plate.steamRate = salmon ? .55 : .30;
    plate.rim = 1.05;
  };

  /* ── thermidor ─────────────────────────────────────────── */
  BUILD.thermidor = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('plate', [0, 0, 0], Q0, [1.05, 1, 1.05], of(MTL.ceramic, { seed: 2.3 }));
    plate.floor = .07;
    /* the half tail, split, meat and cheese sitting in it */
    plate.shell = plate.add(new Part('lobsterTail', MTL.lobsterShell, {
      home: [0, .14, 0], homeQ: euler(0, .2, 0), scale: [.86, .86, .86], seed: 4.9,
      radius: .34, weight: 1.6, k: 22, damp: 9, id: 'shell', label: 'Lobster shell'
    }));
    plate.meat = plate.add(new Part('lobsterTail', MTL.lobsterMeat, {
      home: [0, .17, 0], homeQ: euler(0, .2, 0), scale: [.70, .58, .70], seed: 5.9,
      radius: .28, weight: 1.1, k: 22, damp: 9, solid: false, id: 'meat', label: 'Lobster meat'
    }));
    plate.cheese = plate.add(new Part('lobsterTail', MTL.cheeseMelt, {
      home: [0, .19, 0], homeQ: euler(0, .2, 0), scale: [.76, .40, .76], seed: 6.9,
      radius: .30, weight: .5, k: 18, damp: 8, solid: false, id: 'cheese', label: 'Melted mozzarella'
    }));
    plate.groups = [
      { kind: 'shell', pick: 'shell', all: [plate.shell] },
      { kind: 'meat', pick: 'meat', all: [plate.meat] },
      { kind: 'cheese', pick: 'cheese', all: [plate.cheese] }
    ];
    plate.shrimps = [];
    for (i = 0; i < (o.shrimp || 4); i++) {
      var a = -.7 + i * .48;
      var g = D.shrimp(plate, [Math.cos(a) * .52, .22, Math.sin(a) * .38], .26, {
        q: euler(-.2, a + 1.4, 0), pick: 'p' + i, seed: plate.rnd() * 9
      });
      g.kind = 'shrimp'; g.pick = 'p' + i;
      plate.shrimps.push(g); plate.groups.push(g);
    }
    plate.liq('liquid', [0, .13, 0], [.5, 1, .34], MTL.sauceCream);
    plate.steamY = .28; plate.steamR = .34;
    plate.steamRate = o.steam || .9;
    plate.rim = 1.0;
  };

  /* ── drinks ────────────────────────────────────────────── */
  BUILD.glass = function (plate, dish) {
    var o = dish.opts, i;
    plate.stat('glass', [0, 0, 0], Q0, [1, 1, 1], of(MTL.glassMat, { seed: 1.5 }));
    plate.floor = .07;
    var liq = o.liquid === 'mojito' ? MTL.mojito : o.liquid === 'soda' ? MTL.soda : MTL.juice;
    plate.surfaceY = .78;
    plate.liq('liquid', [0, .78, 0], [.30, 1, .30], liq);
    plate.groups = [];
    for (i = 0; i < (o.ice || 0); i++) {
      var a = plate.rnd() * TAU, r = plate.rnd() * .13;
      plate.groups.push({ kind: 'ice', pick: 'ice' + i, all: [plate.add(new Part('ice', MTL.ice, {
        home: [Math.cos(a) * r, .22 + i * .11, Math.sin(a) * r],
        homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, plate.rnd() * TAU),
        scale: [.62, .62, .62], seed: plate.rnd() * 9,
        radius: .10, weight: .5, k: 20, damp: 6, id: 'ice' + i, label: 'Ice'
      }))] });
    }
    for (i = 0; i < (o.mint || 0); i++) {
      var ma = plate.rnd() * TAU;
      plate.add(new Part(i % 2 ? 'herb' : 'herb2', MTL.mint, {
        home: [Math.cos(ma) * .16, .62 + plate.rnd() * .18, Math.sin(ma) * .16],
        homeQ: euler(plate.rnd() * TAU, plate.rnd() * TAU, 0), scale: [1.2, 1.2, 1.2],
        seed: plate.rnd() * 9, radius: .07, weight: .05, k: 14, damp: 5, id: 'mint' + i, label: 'Fresh mint'
      }));
    }
    plate.bubbleRate = o.bubbles || 0;
    plate.steamRate = 0;
    plate.rim = .40;
  };

  BUILD.can = function (plate, dish) {
    plate.stat('can', [0, 0, 0], Q0, [1, 1, 1], of(MTL.canMetal, { seed: 3.6 }));
    /* the label is the same lathe, a hair proud of the metal */
    plate.stat('can', [0, 0, 0], Q0, [1.006, .74, 1.006], of(MTL.canLabel, { seed: 4.6 }));
    plate.floor = 0;
    plate.dropRate = dish.opts.condensation || 100;
    plate.rim = .35;
    plate.groups = [];
    plate.steamRate = 0;
  };

  BUILD.bottle = function (plate, dish) {
    var o = dish.opts;
    var liq = o.liquid === 'tea' ? MTL.tea : MTL.water;
    plate.stat('bottle', [0, 0, 0], Q0, [1, 1, 1], of(MTL.glassMat, { seed: 5.7 }));
    /* the drink inside, as a slightly smaller copy of the same
       body — a bottle you can see through is a bottle that has
       to have something in it */
    plate.inner = plate.stat('bottle', [0, .01, 0], Q0, [.93, .70, .93], of(liq, { seed: 6.3 }));
    plate.floor = 0;
    plate.dropRate = o.condensation || 90;
    plate.rim = .32;
    plate.groups = [];
    plate.steamRate = 0;
  };

  D.BUILD = BUILD;

  D.build = function (dish, origin) {
    var plate = new D.Plate(dish, origin);
    var b = BUILD[dish.scene];
    if (!b) throw new Error('no builder for scene "' + dish.scene + '"');
    b(plate, dish);
    plate.groups = plate.groups || [];
    D.measure(plate);
    return plate;
  };

  /* ── how big the dish actually is ──────────────────────────
     Measured, not assumed. Camera distances were hand-written
     per dish first and every one of them was wrong, because a
     number that frames a bucket of radius one puts the lens
     inside a highball glass and halfway through a tagine. A dish
     knows its own size; the camera should ask it.

     `wide` is the horizontal reach and `tall` the vertical, both
     including the radius of whatever sits at the edge. */
  D.measure = function (plate) {
    var wide = .55, tall = .30, i;
    function span(key) { return D.bounds[key] || { x: .2, y: .2, z: .2 }; }
    for (i = 0; i < plate.parts.length; i++) {
      var p = plate.parts[i], b = span(p.key);
      var r = Math.hypot(p.home[0], p.home[2]) + Math.max(b.x * p.scale[0], b.z * p.scale[2]);
      if (r > wide) wide = r;
      var y = p.home[1] + b.y * p.scale[1];
      if (y > tall) tall = y;
    }
    for (i = 0; i < plate.statics.length; i++) {
      var st = plate.statics[i], m = st.mat, sb = span(st.key);
      var sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
      var sr = Math.hypot(m[12], m[14]) + Math.max(sb.x * sx, sb.z * sz);
      if (sr > wide) wide = sr;
      var top = m[13] + sb.y * sy;
      if (top > tall) tall = top;
    }
    plate.wide = wide;
    plate.tall = tall;
    return plate;
  };

  /* The distance at which a dish of this size fills `fit` of the
     frame's shorter axis at this field of view. `lift` is
     headroom for the act — most of them raise the food, and the
     frame has to already contain where it is going, or the shot
     recomposes itself while you are watching it. */
  D.frameDistance = function (plate, fov, fit, lift) {
    var half = Math.max(plate.wide, (plate.tall + (lift || 0)) * .60);
    var d = half / Math.tan(fov * .5) / Math.max(.2, fit);
    /* `fov` is vertical, so on anything narrower than square the
       horizontal is what runs out first. On a phone held upright
       the frame is less than half as wide as it is tall, and a
       distance that composes a bucket on a laptop crops it down
       both sides. Nothing else about the shot changes — the
       camera just stands further back. */
    return d / Math.min(1, D.aspect || 1.6);
  };
  D.aspect = 1.6;

  /* ══════════════════════════════════════════════════════════
     SHARED MOTION

     Small pieces the acts build out of. Each one is a way of
     saying "put this part there", never a way of drawing.
     ══════════════════════════════════════════════════════════ */

  /* Move a part's target to its home plus an offset. */
  function to(p, dx, dy, dz) {
    p.target[0] = p.home[0] + dx;
    p.target[1] = p.home[1] + dy;
    p.target[2] = p.home[2] + dz;
  }
  function rest(p) { to(p, 0, 0, 0); }

  /* Every part of a group at once. */
  function groupTo(g, dx, dy, dz) {
    for (var i = 0; i < g.all.length; i++) to(g.all[i], dx, dy, dz);
  }

  /* The idle breath everything on the table has. Not a bob — a
     bob is a sine wave and reads as floating. This is two
     incommensurate frequencies at a few tenths of a millimetre,
     which reads as "sitting in sauce that is still moving". */
  function settle(p, time, amp) {
    var s = p.mtl.seed * 6.1;
    return Math.sin(time * .9 + s) * amp + Math.sin(time * 1.53 + s * 1.7) * amp * .45;
  }

  /* Turn a part to face the camera, for a close inspection. */
  function faceCam(p, ctx, extra) {
    if (!ctx || !ctx.cam) return;
    var az = Math.atan2(ctx.cam.eyeR[0] - p.pos[0], ctx.cam.eyeR[2] - p.pos[2]);
    quat.fromEuler(p.targetQ, 0, az + (extra || 0), 0);
  }

  /* steam, emitted at a rate rather than per frame, so the
     plume does not thicken when the frame rate rises */
  function steam(plate, ctx, dt, rate, opt) {
    opt = opt || {};
    if (!ctx || !ctx.stage || rate <= 0) return;
    plate.emit += dt * rate * 26;
    var n = Math.floor(plate.emit);
    plate.emit -= n;
    var o = plate.origin, R = opt.r === undefined ? plate.steamR : opt.r;
    var y = (opt.y === undefined ? plate.steamY : opt.y);
    for (var i = 0; i < n; i++) {
      var a = plate.rnd() * TAU, r = Math.sqrt(plate.rnd()) * R;
      ctx.puff(
        o[0] + Math.cos(a) * r,
        o[1] + y,
        o[2] + Math.sin(a) * r,
        opt.size || (.16 + plate.rnd() * .12),
        opt.life || (1.7 + plate.rnd() * 1.4),
        opt.rise || .30,
        opt.kind === undefined ? 0 : opt.kind,
        opt.alpha === undefined ? .16 : opt.alpha
      );
    }
  }

  D.motion = { to: to, rest: rest, groupTo: groupTo, settle: settle, faceCam: faceCam, steam: steam };

})(window);
