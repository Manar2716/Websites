/* ═══════════════════════════════════════════════════════════
   dishes.js — the light, the materials, and the menu.

   A dish here is not a picture. It is a list of parts, and every
   part knows which ingredient it belongs to. That one decision is
   what the whole menu section is built on: taking a dish apart is
   not a special effect layered over a photograph, it is the dish
   being read out in the order it was assembled.

   The lighting rig is a food photographer's, and it does not
   change between dishes — one broad warm key up and to the left
   where the softbox hangs, one cool fill from the window side
   that never casts, a narrow rim to lift food off a dark table.
   Six dishes shot on one table under one light is what makes a
   menu look like a menu rather than six stock photographs.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = (global.SHRIM = global.SHRIM || {});
  var M = SHRIM.M, K = SHRIM.K, hex = SHRIM.hex, lin = SHRIM.lin;
  var MAT = SHRIM.SH.MAT;
  var TAU = Math.PI * 2;

  function mul(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function nrm(a) { return M.v3.norm([0, 0, 0], a); }

  /* ── the rig ─────────────────────────────────────────────────
     Two lights and a room. The key is a metre-square softbox up
     and to the left at about forty-five degrees, which is where
     every food photographer puts one, because it is the angle
     that puts a highlight on the top of a wet surface and leaves
     a shadow long enough to say which way is up.

     The fill is the window: cool, broad, and it does not cast. A
     second shadow-casting light in a food shot gives you two
     shadows and no idea what time it is.

     Everything is written as sRGB and converted once. */

  var LIGHT = {
    keyDir: nrm([-0.44, 0.78, 0.44]),
    keyColor: mul(hex('#FFD9AE'), 3.2),
    coolDir: nrm([0.80, 0.30, -0.34]),
    coolColor: mul(hex('#7E9BA6'), 0.44),
    rimColor: mul(hex('#FFC49A'), 0.34),
    ambient: [0.95, 0.95, 0.95],

    envTop: mul(hex('#1A1512'), 1),
    envFloor: mul(hex('#090707'), 1),
    envKey: mul(hex('#FFE7C8'), 1.25),
    envCool: mul(hex('#5E7C8A'), 0.34),
    envBounce: mul(hex('#402818'), 0.34),

    roomAmt: 1,
    hazeAmt: 0.055,
    hazeColor: mul(hex('#2A1C14'), 1),
    shadowStrength: 0.95
  };

  /* The grade. Both stages share it, which is most of why the
     hero and the menu read as one piece of work. */
  var GRADE = {
    exposure: 1.62,
    bloom: 0.30,
    bloomThreshold: 1.06,
    vignette: 0.44,
    grain: 0.017,
    aberration: 0.013,
    warmth: 0.55,
    lift: 0.05,
    fade: 1
  };

  /* ── the pantry ──────────────────────────────────────────────
     Every material on the site, in one place, so that a change to
     what butter looks like is one line rather than six. */

  var MATS = {
    prawn: {
      mat: MAT.PRAWN, base: hex('#CE5330'), tint2: hex('#EDB496'),
      sssTint: hex('#B8321A'), sss: 0.92, rough: 0.26, coat: 0.66, detail: 1
    },
    prawnRaw: {
      mat: MAT.PRAWN, base: hex('#8C93A0'), tint2: hex('#D6D9DC'),
      sssTint: hex('#6D7C8C'), sss: 0.85, rough: 0.24, coat: 0.60, detail: 1
    },
    prawnGrilled: {
      mat: MAT.PRAWN, base: hex('#C2431F'), tint2: hex('#E5A379'),
      sssTint: hex('#A82A12'), sss: 0.72, rough: 0.34, coat: 0.55, char: 0.8, detail: 1
    },
    prawnShell: {
      mat: MAT.PRAWN, base: hex('#B23A22'), tint2: hex('#D98A63'),
      sssTint: hex('#93250F'), sss: 0.55, rough: 0.20, coat: 0.85, detail: 1
    },

    ceramic: { mat: MAT.CERAMIC, base: hex('#1B1716'), rough: 0.12, detail: 1 },
    ceramicPale: { mat: MAT.CERAMIC, base: hex('#DCD3C6'), rough: 0.20, detail: 1 },
    /* A stoneware glaze for the two bowls. The plates are near
       black because coral food on black ceramic is the whole look;
       squid-ink linguine on black ceramic is a black bowl with
       nothing in it, and no amount of rim light rescues that. */
    stoneware: { mat: MAT.CERAMIC, base: hex('#463C34'), tint2: hex('#5A4E43'), rough: 0.34, detail: 1 },
    iron: { mat: MAT.METAL, base: hex('#1E1A18'), rough: 0.66, metal: 0.55, detail: 1 },
    table: { mat: MAT.TABLE, base: hex('#2C1D14'), tint2: hex('#4A2E1C'), rough: 0.42, detail: 1 },

    butter: {
      mat: MAT.LIQUID, base: hex('#6B3F0E'), tint2: hex('#C99334'),
      sssTint: hex('#B87C22'), sss: 0.55, rough: 0.06, coat: 1, alpha: 0.62, blend: true, detail: 1
    },
    curry: {
      mat: MAT.LIQUID, base: hex('#9A5F22'), tint2: hex('#D69B48'),
      sssTint: hex('#C4802E'), sss: 0.50, rough: 0.10, coat: 1, alpha: 0.94, blend: true, detail: 1
    },
    inkSauce: {
      mat: MAT.LIQUID, base: hex('#100E0E'), tint2: hex('#38302C'),
      sssTint: hex('#241E1C'), sss: 0.12, rough: 0.05, coat: 1, alpha: 0.94, blend: true, detail: 1
    },
    chilliOil: {
      mat: MAT.LIQUID, base: hex('#6A1A0C'), tint2: hex('#B84A1C'),
      sssTint: hex('#B03516'), sss: 0.60, rough: 0.05, coat: 1, alpha: 0.66, blend: true, detail: 1
    },

    lemon: {
      mat: MAT.CITRUS, base: hex('#E7C64C'), tint2: hex('#D8B32C'),
      sssTint: hex('#CFA31E'), sss: 0.92, rough: 0.20, coat: 0.72, detail: 1
    },
    lime: {
      mat: MAT.CITRUS, base: hex('#A8BC46'), tint2: hex('#5E8A24'),
      sssTint: hex('#86A62E'), sss: 0.92, rough: 0.20, coat: 0.72, detail: 1
    },
    herb: {
      mat: MAT.HERB, base: hex('#37642A'), tint2: hex('#6B9840'),
      sssTint: hex('#4E8A2C'), sss: 0.88, rough: 0.33, coat: 0.42, detail: 1
    },
    herbPale: {
      mat: MAT.HERB, base: hex('#4C7A34'), tint2: hex('#8DB05A'),
      sssTint: hex('#689A38'), sss: 0.88, rough: 0.30, coat: 0.40, detail: 1
    },
    chilli: {
      mat: MAT.CHILLI, base: hex('#A81E16'), tint2: hex('#D8836C'),
      sssTint: hex('#B4301C'), sss: 0.55, rough: 0.11, coat: 0.86, detail: 1
    },
    garlic: {
      mat: MAT.GARLIC, base: hex('#DCCFB4'), tint2: hex('#C7B694'),
      sssTint: hex('#CBAF84'), sss: 0.72, rough: 0.34, coat: 0.40, detail: 1
    },
    crust: {
      mat: MAT.CRUST, base: hex('#D08C3C'), tint2: hex('#6E3D12'),
      sssTint: hex('#B0691E'), sss: 0.18, rough: 0.55, coat: 0.30, detail: 1
    },
    inkPasta: {
      mat: MAT.NOODLE, base: hex('#1A1615'), tint2: hex('#7A6A60'),
      rough: 0.17, coat: 0.85, detail: 1
    },
    rice: {
      mat: MAT.GRAIN, base: hex('#E9E1D2'), tint2: hex('#D6C9B2'),
      sssTint: hex('#D2C3A8'), sss: 0.60, rough: 0.24, coat: 0.30, detail: 1
    },
    butterSolid: {
      mat: MAT.BUTTER, base: hex('#EBD49B'), tint2: hex('#DCC076'),
      sssTint: hex('#DDBE72'), sss: 0.66, rough: 0.30, coat: 0.26, detail: 1
    },
    charWood: { mat: MAT.CHAR, base: hex('#3A2718'), tint2: hex('#14100C'), rough: 0.70, detail: 1 },
    pepper: { mat: MAT.PLAIN, base: hex('#33251C'), rough: 0.42, coat: 0.3 },
    flake: { mat: MAT.CHILLI, base: hex('#9E2A12'), tint2: hex('#C86A44'), sss: 0.5, sssTint: hex('#A83214'), rough: 0.30, coat: 0.5 },
    sesame: { mat: MAT.GRAIN, base: hex('#E4D2AC'), tint2: hex('#C9B085'), sss: 0.4, sssTint: hex('#D0B98E'), rough: 0.28, coat: 0.4 },
    scallion: { mat: MAT.HERB, base: hex('#6E9A3C'), tint2: hex('#C8D8A8'), sss: 0.85, sssTint: hex('#7FA84A'), rough: 0.26, coat: 0.55 },
    linen: { mat: MAT.PLAIN, base: hex('#B8AC9A'), rough: 0.78 }
  };

  /* ── plating helpers ─────────────────────────────────────────
     `ctx.add` takes an ingredient key and a placement and hands
     back a part. Everything a dish's build function does goes
     through it, which is how every part ends up carrying the
     ingredient it belongs to without any dish having to remember
     to say so. */

  function makeCtx(stage, seed) {
    var rnd = M.rng(seed);
    var parts = [];
    var ctx = {
      rnd: rnd,
      /* a jittered value, for the small differences that stop nine
         prawns from looking like nine copies of one prawn */
      jit: function (k) { return (rnd() - 0.5) * 2 * k; },
      mesh: function (key, build) { return stage.mesh(key, build); },
      parts: parts,
      add: function (group, meshKey, build, mat, place) {
        var part = {
          group: group,
          mesh: stage.mesh(meshKey, build),
          mat: mat,
          home: {
            p: [place.x || 0, place.y || 0, place.z || 0],
            e: [place.rx || 0, place.ry || 0, place.rz || 0],
            s: place.s === undefined ? 1 : place.s
          },
          /* Some things are the wrong size once they are no longer
             part of a dish. A pool of sauce lifted whole off a
             plate is a flying orange dinner plate; as a spoonful
             it reads as sauce. A skewer is two feet of bamboo
             across the frame. Both say so here. */
          awayScale: place.awayScale,
          wobbleMax: place.wobble === undefined ? 0.35 : place.wobble,
          weight: place.weight === undefined ? 1 : place.weight,
          noShadow: !!place.noShadow
        };
        parts.push(part);
        return part;
      }
    };
    return ctx;
  }

  /* ── the menu ────────────────────────────────────────────────
     Six dishes. Prices, hours and the address are invented for the
     layout; this is a portfolio piece, not a restaurant's site.

     Each carries three things beyond its copy: how it is built,
     which ingredients it declares, and how it comes apart. The
     last of those is per dish on purpose — a skewer should slide
     apart along its own axis, a bowl should tip, and a tempura
     prawn should shed its crust before anything else moves,
     because that is the order those things happen in when you
     actually take them apart with your hands. */

  var DISHES = [

    /* ─────────────────────────────────────────────────────── */
    {
      id: 'platter',
      no: '01',
      name: 'The Whole Party',
      sub: 'Nine on the table',
      price: '48',
      heat: 1,
      serves: 'Serves 2–3',
      line: 'Nine tiger prawns, one pan of garlic butter, and no cutlery worth speaking of.',
      copy: 'The dish the room is named after. Nine head-off tiger prawns go into a pan of ' +
            'butter, garlic and chilli for ninety seconds a side — long enough to curl, not ' +
            'long enough to tighten — and come to the table in the pan juices with a wedge of ' +
            'lemon and enough bread to justify them.',
      choreo: 'bloom',
      vessel: 'plate',
      camera: { dist: 4.38, height: 1.72, range: 1.72 },
      ingredients: [
        { key: 'prawn', label: 'Tiger prawns', note: 'Nine, head off, tail on' },
        { key: 'butter', label: 'Garlic butter', note: 'Cultured, browned in the pan' },
        { key: 'garlic', label: 'Garlic', note: 'Sliced thin, barely coloured' },
        { key: 'chilli', label: 'Red chilli', note: 'Deseeded, cut into rings' },
        { key: 'lemon', label: 'Lemon', note: 'One wedge, charred cut side' },
        { key: 'parsley', label: 'Flat-leaf parsley', note: 'Torn, added off the heat' }
      ],
      allergens: 'Crustaceans · Milk',
      build: function (ctx) {
        var i;
        ctx.add('vessel', 'plate', function () { return K.plate(1); }, MATS.ceramic,
          { x: 0, y: 0, z: 0, s: 1.06, wobble: 0 });
        ctx.add('butter', 'pool-lg', function () { return K.pool(0.60, 17); }, MATS.butter,
          { x: 0, y: 0.008, z: 0, s: 1, awayScale: 0.42, wobble: 0, noShadow: true });

        /* Five round the outside, four inside, each turned
           tangentially. Nine on one alternating ring came out as a
           heap; two rings with different counts is what a chef
           does, and it is what reads as arranged. */
        for (i = 0; i < 9; i++) {
          var outer = i < 5;
          var a = outer ? (i / 5) * TAU + 0.30 : ((i - 5) / 4) * TAU + 1.05;
          var r = outer ? 0.54 : 0.26;
          ctx.add('prawn', 'prawn', function () { return K.prawn(); }, MATS.prawn, {
            x: Math.cos(a) * r + ctx.jit(0.03),
            y: 0.014 + (outer ? 0 : 0.026),
            z: Math.sin(a) * r + ctx.jit(0.03),
            ry: a + Math.PI * 0.5 + ctx.jit(0.30),
            rz: ctx.jit(0.14),
            s: (outer ? 0.215 : 0.200) + ctx.jit(0.010),
            weight: 1.3
          });
        }

        for (i = 0; i < 7; i++) {
          ctx.add('garlic', 'garlic-slice', function () { return K.garlicSlice(); }, MATS.garlic, {
            x: ctx.jit(0.62), y: 0.014, z: ctx.jit(0.62),
            ry: ctx.rnd() * TAU, rx: ctx.jit(0.25), s: 0.9 + ctx.jit(0.2), weight: 0.3
          });
        }
        for (i = 0; i < 5; i++) {
          ctx.add('chilli', 'chilli-ring', function () { return K.chilliRing(0.10); }, MATS.chilli, {
            x: ctx.jit(0.66), y: 0.014, z: ctx.jit(0.66),
            ry: ctx.rnd() * TAU, rx: 1.2 + ctx.jit(0.6), s: 0.85 + ctx.jit(0.25), weight: 0.3
          });
        }
        ctx.add('lemon', 'lemon-wedge', function () { return K.citrusWedge(0.44, 0.82); }, MATS.lemon,
          { x: -0.60, y: 0.028, z: 0.52, ry: 2.3, rz: 0.30, rx: -0.12, s: 1, weight: 0.7 });
        for (i = 0; i < 6; i++) {
          ctx.add('parsley', 'herb', function () { return K.herbLeaf(1); }, MATS.herb, {
            x: ctx.jit(0.60), y: 0.020 + ctx.rnd() * 0.02, z: ctx.jit(0.60),
            ry: ctx.rnd() * TAU, rx: ctx.jit(0.4), rz: ctx.jit(0.3),
            s: 0.52 + ctx.jit(0.14), weight: 0.2, wobble: 0.9
          });
        }
      }
    },

    /* ─────────────────────────────────────────────────────── */
    {
      id: 'skillet',
      no: '02',
      name: 'Butter, Loudly',
      sub: 'Straight out of the pan',
      price: '26',
      heat: 1,
      serves: 'One pan, one person',
      line: 'Six prawns, a whole pat of butter still going, and the pan it happened in.',
      copy: 'It never leaves the pan. Six prawns, a pat of cultured butter dropped in at the ' +
            'last second so it is still going when it reaches you, garlic taken just to blond, ' +
            'and the fond scraped up with a splash of the wine you are drinking.',
      choreo: 'column',
      vessel: 'skillet',
      camera: { dist: 4.00, height: 1.55, range: 1.50 },
      ingredients: [
        { key: 'prawn', label: 'Tiger prawns', note: 'Six, butterflied down the back' },
        { key: 'butter', label: 'Cultured butter', note: 'A pat, in off the heat' },
        { key: 'garlic', label: 'Garlic', note: 'Whole cloves, confited' },
        { key: 'pan', label: 'The pan', note: 'Cast iron, twenty years seasoned' },
        { key: 'parsley', label: 'Parsley', note: 'And more than you think' }
      ],
      allergens: 'Crustaceans · Milk · Sulphites',
      build: function (ctx) {
        var i;
        ctx.add('pan', 'skillet', function () { return K.skillet(0.86); }, MATS.iron,
          { x: 0.10, y: 0, z: 0, s: 1, ry: -0.5, awayScale: 0.40, wobble: 0, weight: 2 });
        ctx.add('butter', 'pool-md', function () { return K.pool(0.50, 23); }, MATS.butter,
          { x: 0.10, y: 0.032, z: 0, s: 1, awayScale: 0.42, wobble: 0, noShadow: true });

        for (i = 0; i < 6; i++) {
          var a = (i / 6) * TAU + 0.9;
          var r = 0.30 + (i % 2) * 0.14;
          ctx.add('prawn', 'prawn', function () { return K.prawn(); }, MATS.prawn, {
            x: 0.10 + Math.cos(a) * r, y: 0.042 + (i % 2) * 0.02, z: Math.sin(a) * r,
            ry: a + 1.2 + ctx.jit(0.4), rz: ctx.jit(0.2),
            s: 0.205 + ctx.jit(0.01), weight: 1.3
          });
        }
        ctx.add('butter', 'butter-pat', function () { return K.butterPat(); }, MATS.butterSolid,
          { x: -0.14, y: 0.070, z: 0.20, ry: 0.6, rz: 0.10, s: 1, weight: 0.8 });
        for (i = 0; i < 4; i++) {
          ctx.add('garlic', 'garlic-clove', function () { return K.garlicClove(); }, MATS.garlic, {
            x: 0.10 + ctx.jit(0.46), y: 0.052, z: ctx.jit(0.46),
            ry: ctx.rnd() * TAU, rx: 1.45 + ctx.jit(0.3), s: 0.46, weight: 0.5
          });
        }
        for (i = 0; i < 7; i++) {
          ctx.add('parsley', 'herb', function () { return K.herbLeaf(1); }, MATS.herbPale, {
            x: 0.10 + ctx.jit(0.52), y: 0.058 + ctx.rnd() * 0.02, z: ctx.jit(0.52),
            ry: ctx.rnd() * TAU, rx: ctx.jit(0.5), rz: ctx.jit(0.3),
            s: 0.48 + ctx.jit(0.12), weight: 0.2, wobble: 0.9
          });
        }
      }
    },

    /* ─────────────────────────────────────────────────────── */
    {
      id: 'grill',
      no: '03',
      name: 'Over Coals',
      sub: 'Two skewers, charred',
      price: '24',
      heat: 2,
      serves: 'Two skewers',
      line: 'Shell on, over binchōtan, with lime and a chilli salt that does most of the talking.',
      copy: 'Shell on, because the shell is what protects the meat over that kind of heat and ' +
            'what carries the smoke afterwards. Four minutes over binchōtan, turned once, ' +
            'brushed with chilli oil at the end. Eat them with your hands and use the lime.',
      choreo: 'skewer',
      vessel: 'board',
      camera: { dist: 4.12, height: 1.42, range: 1.38 },
      ingredients: [
        { key: 'prawn', label: 'Tiger prawns', note: 'Six, shell on, head off' },
        { key: 'skewer', label: 'Bamboo skewers', note: 'Soaked, then charred' },
        { key: 'chilli', label: 'Chilli salt', note: 'Flaked over at the pass' },
        { key: 'lime', label: 'Lime', note: 'Two wedges, cut side down on the grill' },
        { key: 'coriander', label: 'Coriander', note: 'Stems and all' }
      ],
      allergens: 'Crustaceans',
      build: function (ctx) {
        var i, s;
        ctx.add('vessel', 'plate-slate', function () { return K.plate(1.02); }, MATS.ceramic,
          { x: 0, y: 0, z: 0, s: 1.02, wobble: 0 });

        for (s = 0; s < 2; s++) {
          var zoff = (s - 0.5) * 0.44;
          ctx.add('skewer', 'skewer', function () { return K.skewer(2.1); }, MATS.charWood,
            { x: 0, y: 0.030, z: zoff, ry: 0.16 * (s ? 1 : -1), s: 1, awayScale: 0.30, weight: 0.6 });
          for (i = 0; i < 3; i++) {
            var t = (i - 1) * 0.42;
            ctx.add('prawn', 'prawn-shell', function () { return K.prawnShellOn(); }, MATS.prawnGrilled, {
              x: t * 0.98 + ctx.jit(0.02),
              y: 0.048,
              z: zoff + t * 0.16 * (s ? 1 : -1),
              ry: 1.57 + ctx.jit(0.28), rz: ctx.jit(0.5),
              s: 0.195 + ctx.jit(0.008), weight: 1.4
            });
          }
        }
        ctx.add('lime', 'lime-wedge', function () { return K.citrusWedge(0.40, 0.80); }, MATS.lime,
          { x: 0.62, y: 0.026, z: 0.54, ry: -1.9, rz: 0.26, s: 1, weight: 0.7 });
        ctx.add('lime', 'lime-wedge', function () { return K.citrusWedge(0.40, 0.80); }, MATS.lime,
          { x: 0.78, y: 0.026, z: 0.34, ry: -2.6, rz: -0.20, s: 1, weight: 0.7 });
        ctx.add('chilli', 'flakes', function () { return K.scatter('flake', 34, 0.66, 51); }, MATS.flake,
          { x: -0.10, y: 0.012, z: 0.0, s: 1, weight: 0.2, noShadow: true });
        for (i = 0; i < 5; i++) {
          ctx.add('coriander', 'herb', function () { return K.herbLeaf(1); }, MATS.herbPale, {
            x: -0.52 + ctx.jit(0.30), y: 0.018 + ctx.rnd() * 0.02, z: -0.42 + ctx.jit(0.34),
            ry: ctx.rnd() * TAU, rx: ctx.jit(0.4), s: 0.54 + ctx.jit(0.12), weight: 0.2, wobble: 0.9
          });
        }
      }
    },

    /* ─────────────────────────────────────────────────────── */
    {
      id: 'tempura',
      no: '04',
      name: 'The Tower',
      sub: 'Batter, and what is under it',
      price: '22',
      heat: 0,
      serves: 'Five pieces',
      line: 'Five prawns in a batter mixed with iced soda thirty seconds before they go in.',
      copy: 'The batter is mixed with iced soda water thirty seconds before the first prawn ' +
            'goes in, and lumpy on purpose — a smooth batter is a heavy one. A hundred and ' +
            'eighty degrees, ninety seconds, drained standing up so nothing steams itself soft. ' +
            'Salt while it is still too hot to hold.',
      choreo: 'shell',
      vessel: 'plate',
      camera: { dist: 3.88, height: 1.66, range: 1.38 },
      ingredients: [
        { key: 'prawn', label: 'Tiger prawns', note: 'Scored underneath so they fry straight' },
        { key: 'crust', label: 'Tempura batter', note: 'Iced soda, low gluten, mixed badly' },
        { key: 'lemon', label: 'Lemon', note: 'A wedge, and salt' },
        { key: 'chilli', label: 'Togarashi', note: 'Seven spices, one of them chilli' }
      ],
      allergens: 'Crustaceans · Gluten · Sesame',
      build: function (ctx) {
        var i;
        ctx.add('vessel', 'plate', function () { return K.plate(1); }, MATS.ceramic,
          { x: 0, y: 0, z: 0, s: 1.0, wobble: 0 });

        /* stacked, leaning on each other — the tower */
        var lay = [
          [-0.28, 0.052, 0.10, 0.35], [0.24, 0.052, -0.14, 2.30], [-0.04, 0.052, -0.36, 1.15],
          [0.02, 0.150, 0.02, 0.80], [-0.10, 0.238, -0.14, 2.70]
        ];
        for (i = 0; i < lay.length; i++) {
          var L = lay[i];
          /* the prawn inside, and the crust around it: two parts,
             one place, so the crust can leave without it */
          ctx.add('prawn', 'prawn', function () { return K.prawn(); }, MATS.prawn, {
            x: L[0], y: L[1], z: L[2], ry: L[3], rz: ctx.jit(0.14),
            s: 0.195, weight: 1.2
          });
          ctx.add('crust', 'crust', function () { return K.tempuraCrust(); }, MATS.crust, {
            x: L[0], y: L[1], z: L[2], ry: L[3], rz: ctx.jit(0.14),
            s: 0.205, weight: 0.8
          });
        }
        for (i = 0; i < 9; i++) {
          ctx.add('crust', 'crumb-' + (i % 3), function () { return K.crumb(90 + (i % 3)); }, MATS.crust, {
            x: ctx.jit(0.70), y: 0.014, z: ctx.jit(0.70),
            ry: ctx.rnd() * TAU, rx: ctx.rnd() * TAU, s: 0.8 + ctx.jit(0.4), weight: 0.15
          });
        }
        ctx.add('lemon', 'lemon-wedge', function () { return K.citrusWedge(0.44, 0.82); }, MATS.lemon,
          { x: 0.60, y: 0.028, z: 0.50, ry: -2.1, rz: 0.28, s: 1, weight: 0.7 });
        ctx.add('chilli', 'togarashi', function () { return K.scatter('flake', 30, 0.40, 61); }, MATS.flake,
          { x: -0.46, y: 0.012, z: 0.44, s: 0.85, weight: 0.2, noShadow: true });
      }
    },

    /* ─────────────────────────────────────────────────────── */
    {
      id: 'linguine',
      no: '05',
      name: 'Black Linguine',
      sub: 'Squid ink, prawn, chilli',
      price: '29',
      heat: 2,
      serves: 'One bowl',
      line: 'Ink pasta rolled the same morning, prawn butter, and more chilli than is polite.',
      copy: 'The pasta is rolled the same morning with cuttlefish ink and comes out the colour ' +
            'of a wet slate roof. The sauce is the prawn shells — roasted, pounded, mounted with ' +
            'butter — so the dish tastes of prawn twice: once from the ones in it, and once from ' +
            'the ones that are not.',
      choreo: 'unwind',
      vessel: 'bowl',
      camera: { dist: 3.75, height: 1.80, range: 1.27 },
      ingredients: [
        { key: 'pasta', label: 'Squid ink linguine', note: 'Rolled this morning' },
        { key: 'prawn', label: 'Tiger prawns', note: 'Four, halved lengthways' },
        { key: 'sauce', label: 'Prawn shell butter', note: 'Roasted, pounded, mounted' },
        { key: 'chilli', label: 'Calabrian chilli', note: 'In oil, and not shy' },
        { key: 'parsley', label: 'Parsley', note: 'The stems go in the sauce' }
      ],
      allergens: 'Crustaceans · Gluten · Milk · Molluscs',
      build: function (ctx) {
        var i;
        ctx.add('vessel', 'bowl', function () { return K.bowl(0.92); }, MATS.stoneware,
          { x: 0, y: 0, z: 0, s: 1, wobble: 0 });
        ctx.add('sauce', 'pool-sm', function () { return K.pool(0.44, 29); }, MATS.inkSauce,
          { x: 0, y: 0.052, z: 0, s: 1, awayScale: 0.48, wobble: 0, noShadow: true });
        ctx.add('pasta', 'nest', function () { return K.noodleNest(11, 0.34, 37); }, MATS.inkPasta,
          { x: 0, y: 0.070, z: 0, s: 0.92, awayScale: 0.62, ry: 0.4, weight: 1.1 });

        for (i = 0; i < 4; i++) {
          var a = (i / 4) * TAU + 0.6;
          ctx.add('prawn', 'prawn', function () { return K.prawn(); }, MATS.prawn, {
            x: Math.cos(a) * 0.28, y: 0.170 + (i % 2) * 0.02, z: Math.sin(a) * 0.28,
            ry: a + 1.4 + ctx.jit(0.3), rz: ctx.jit(0.25),
            s: 0.185 + ctx.jit(0.008), weight: 1.3
          });
        }
        for (i = 0; i < 4; i++) {
          ctx.add('chilli', 'chilli-ring', function () { return K.chilliRing(0.095); }, MATS.chilli, {
            x: ctx.jit(0.40), y: 0.185, z: ctx.jit(0.40),
            ry: ctx.rnd() * TAU, rx: 1.1 + ctx.jit(0.7), s: 0.85, weight: 0.3
          });
        }
        for (i = 0; i < 5; i++) {
          ctx.add('parsley', 'herb', function () { return K.herbLeaf(1); }, MATS.herb, {
            x: ctx.jit(0.38), y: 0.195 + ctx.rnd() * 0.02, z: ctx.jit(0.38),
            ry: ctx.rnd() * TAU, rx: ctx.jit(0.5), s: 0.46 + ctx.jit(0.1), weight: 0.2, wobble: 0.9
          });
        }
      }
    },

    /* ─────────────────────────────────────────────────────── */
    {
      id: 'curry',
      no: '06',
      name: 'Coconut, Late',
      sub: 'The one that ends the night',
      price: '27',
      heat: 3,
      serves: 'One bowl, with rice',
      line: 'Coconut, lime leaf, a paste pounded to order, and rice to put out the fire.',
      copy: 'The paste is pounded to order — galangal, lemongrass, bird\'s eye, shrimp paste — ' +
            'and fried in coconut cream until it splits and goes fragrant. Then coconut milk, ' +
            'lime leaf, and the prawns in for the last two minutes only. The rice is not optional.',
      choreo: 'tip',
      vessel: 'bowl',
      camera: { dist: 3.75, height: 1.78, range: 1.27 },
      ingredients: [
        { key: 'prawn', label: 'Tiger prawns', note: 'Five, in for two minutes' },
        { key: 'sauce', label: 'Coconut curry', note: 'Cream split first, milk after' },
        { key: 'rice', label: 'Jasmine rice', note: 'Steamed, not boiled' },
        { key: 'chilli', label: 'Bird\'s eye chilli', note: 'In the paste and on top' },
        { key: 'lime', label: 'Lime', note: 'Leaf in the pot, wedge on the side' },
        { key: 'coriander', label: 'Coriander', note: 'The last thing to touch it' }
      ],
      allergens: 'Crustaceans · Fish · Molluscs',
      build: function (ctx) {
        var i;
        ctx.add('vessel', 'bowl', function () { return K.bowl(0.92); }, MATS.stoneware,
          { x: 0, y: 0, z: 0, s: 1, wobble: 0 });
        ctx.add('sauce', 'pool-curry', function () { return K.pool(0.52, 43); }, MATS.curry,
          { x: 0, y: 0.140, z: 0, s: 1, awayScale: 0.44, wobble: 0, noShadow: true });
        ctx.add('rice', 'rice', function () { return K.riceMound(180, 0.30, 47); }, MATS.rice,
          { x: -0.02, y: 0.150, z: 0.06, s: 1, awayScale: 0.70, weight: 0.9 });

        for (i = 0; i < 5; i++) {
          var a = (i / 5) * TAU + 1.2;
          ctx.add('prawn', 'prawn', function () { return K.prawn(); }, MATS.prawn, {
            x: Math.cos(a) * 0.30, y: 0.180 + (i % 2) * 0.015, z: Math.sin(a) * 0.30,
            ry: a + 1.5 + ctx.jit(0.3), rz: ctx.jit(0.22),
            s: 0.180 + ctx.jit(0.008), weight: 1.3
          });
        }
        for (i = 0; i < 3; i++) {
          ctx.add('chilli', 'chilli-whole', function () { return K.chilli(0.62); }, MATS.chilli, {
            x: ctx.jit(0.34), y: 0.200, z: ctx.jit(0.34),
            ry: ctx.rnd() * TAU, rz: ctx.jit(0.3), s: 0.62, weight: 0.4
          });
        }
        ctx.add('lime', 'lime-slice', function () { return K.citrusSlice(0.20); }, MATS.lime,
          { x: 0.34, y: 0.196, z: -0.26, ry: 0.8, rx: 0.25, s: 1, weight: 0.4 });
        for (i = 0; i < 6; i++) {
          ctx.add('coriander', 'herb', function () { return K.herbLeaf(1); }, MATS.herbPale, {
            x: ctx.jit(0.36), y: 0.205 + ctx.rnd() * 0.02, z: ctx.jit(0.36),
            ry: ctx.rnd() * TAU, rx: ctx.jit(0.5), s: 0.48 + ctx.jit(0.12), weight: 0.2, wobble: 0.9
          });
        }
      }
    }
  ];

  /* Steam, per dish. A bowl of curry steams; a plate of tempura
     does not, or at least it should not be seen to, because the
     whole point of tempura is that it is dry. */
  var STEAM = {
    platter: { count: 26, origin: [0, 0.10, 0], radius: 0.42, rise: 0.36, size: 0.40, life: 3.0, amount: 0.16 },
    skillet: { count: 30, origin: [0.10, 0.14, 0], radius: 0.40, rise: 0.46, size: 0.38, life: 2.8, amount: 0.22 },
    grill: { count: 20, origin: [0, 0.12, 0], radius: 0.50, rise: 0.40, size: 0.42, life: 3.2, amount: 0.13 },
    tempura: { count: 10, origin: [0, 0.28, 0], radius: 0.24, rise: 0.34, size: 0.30, life: 3.0, amount: 0.07 },
    linguine: { count: 26, origin: [0, 0.24, 0], radius: 0.30, rise: 0.42, size: 0.34, life: 2.9, amount: 0.19 },
    curry: { count: 30, origin: [0, 0.24, 0], radius: 0.32, rise: 0.44, size: 0.36, life: 2.8, amount: 0.24 }
  };

    /* Steam is a grey, not a light. Lit at nine tenths it went over
     the bloom threshold and every bowl on the menu grew a white
     column out of it. */
  var STEAM_TINT = { tint: lin([0.20, 0.19, 0.185]), lit: lin([0.56, 0.52, 0.47]), soft: 0.30 };

  SHRIM.LIGHT = LIGHT;
  SHRIM.GRADE = GRADE;
  SHRIM.MATS = MATS;
  SHRIM.DISHES = DISHES;
  SHRIM.STEAM = STEAM;
  SHRIM.STEAM_TINT = STEAM_TINT;
  SHRIM.makeCtx = makeCtx;

})(window);
