/* ═══════════════════════════════════════════════════════════
   stage.js — the renderer.

   It knows nothing about shrimp. Every frame it is handed a
   list of instances and a camera, and it draws them: shadow
   pass, opaque pass into an HDR buffer with a distance buffer
   alongside, liquid, soft sprites, a blur chain, and a
   composite that does depth of field, bloom, ACES and the
   grade in one go.

   Everything is batched by mesh. A bucket holding sixteen
   shrimp, five potatoes, three corn and three hundred and forty
   flecks of seasoning is not three hundred and sixty draw
   calls — it is one call per distinct form, because every
   instance carries its own transform and its own material in
   the vertex stream.

   Picking is on the CPU against instance bounding spheres. A
   read-back from a colour-coded pass would be exact, but it
   costs a pipeline stall every time the pointer moves, and the
   things you pick up here are convex lumps a couple of
   centimetres across — a sphere test is right often enough that
   you would have to be trying to catch it out.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var M = SP.M, GL = SP.GL, SH = SP.SH, Forms = SP.Forms;
  var m4 = M.m4, v3 = M.v3;

  /* per-instance vertex stream: mat4 + albedo/rough + surf + extra */
  var STRIDE = 28;
  var SPRITE_STRIDE = 12;
  var MAX_SPRITES = 1400;
  var NRIP = 8;

  SP.Stage = function (canvas, opts) {
    opts = opts || {};
    var ctx = GL.context(canvas, { antialias: false });
    if (!ctx) return null;
    var gl = ctx.gl;
    var hdr = ctx.hdr;

    /* ══════════════════════════════════════════════════════════
       QUALITY

       Three tiers chosen once from what the machine says it is,
       then a render scale that moves at runtime from measured
       frame time. A slightly softer image at rate beats a sharp
       one that stutters, and on this page — where you are
       dragging a shell around with a pointer — latency is the
       thing you actually feel.
       ══════════════════════════════════════════════════════════ */

    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var mem = global.navigator && navigator.deviceMemory || 4;
    var cores = global.navigator && navigator.hardwareConcurrency || 4;
    var mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    var tier = 2;
    if (mobile || cores <= 4 || mem <= 4) tier = 1;
    if (mobile && (cores <= 4 || mem <= 3)) tier = 0;
    if (opts.tier !== undefined) tier = opts.tier;

    var Q = [
      { scale: .62, shadow: 512,  sprites: 260,  wide: false, grain: .010 },
      { scale: .82, shadow: 1024, sprites: 700,  wide: true,  grain: .012 },
      { scale: 1.0, shadow: 2048, sprites: 1400, wide: true,  grain: .013 }
    ][tier];

    var renderScale = Q.scale;
    var W = 2, H = 2;

    /* ── programs ─────────────────────────────────────────── */

    var pSurf   = GL.program(gl, SH.surfVS, SH.surfFS, 'surface');
    var pShadow = GL.program(gl, SH.shadowVS, SH.shadowFS, 'shadow');
    var pLiquid = GL.program(gl, SH.liquidVS, SH.liquidFS, 'liquid');
    var pSprite = GL.program(gl, SH.spriteVS, SH.spriteFS, 'sprite');
    var pRoom   = GL.program(gl, SH.postVS, SH.roomFS, 'room');
    var pDown   = GL.program(gl, SH.postVS, SH.downFS, 'down');
    var pUp     = GL.program(gl, SH.postVS, SH.upFS, 'up');
    var pComp   = GL.program(gl, SH.postVS, SH.compositeFS, 'composite');

    var fs = GL.fullscreen(gl);

    /* ── meshes ────────────────────────────────────────────────
       Built on demand from a factory table and kept forever.
       Every form on the site together is about twenty thousand
       vertices, so there is nothing to gain from evicting. */

    var factories = Object.create(null);
    var meshes = Object.create(null);
    var radii = Object.create(null);

    function boundingRadius(geo) {
      var r = 0;
      for (var i = 0; i < geo.verts.length; i += 8) {
        var d = geo.verts[i] * geo.verts[i] + geo.verts[i + 1] * geo.verts[i + 1] + geo.verts[i + 2] * geo.verts[i + 2];
        if (d > r) r = d;
      }
      return Math.sqrt(r);
    }

    var INSTANCE_ATTRS = [
      { loc: 3, size: 4, offset: 0 },
      { loc: 4, size: 4, offset: 4 },
      { loc: 5, size: 4, offset: 8 },
      { loc: 6, size: 4, offset: 12 },
      { loc: 7, size: 4, offset: 16 },
      { loc: 8, size: 4, offset: 20 },
      { loc: 9, size: 4, offset: 24 }
    ];

    function meshFor(key) {
      var m = meshes[key];
      if (m) return m;
      var f = factories[key];
      if (!f) throw new Error('stage: no form registered for "' + key + '"');
      var geo = f();
      m = GL.mesh(gl, geo);
      m.addInstanceAttribs(STRIDE, m.cap || 256, INSTANCE_ATTRS);
      m.data = new Float32Array(STRIDE * (m.cap || 256));
      m.cap = 256;
      m.n = 0;
      radii[key] = boundingRadius(geo);
      meshes[key] = m;
      return m;
    }

    function grow(m, key) {
      var cap = m.cap * 2;
      /* rebuilding the VAO's instance buffer is a boot-time cost
         in practice: the biggest bucket settles inside two
         frames and never grows again */
      m.addInstanceAttribs(STRIDE, cap, INSTANCE_ATTRS);
      var d = new Float32Array(STRIDE * cap);
      d.set(m.data);
      m.data = d; m.cap = cap;
    }

    /* ── frame state ──────────────────────────────────────── */

    var used = [];                 /* mesh keys touched this frame */
    var liquidKeys = [];
    var picks = [];                /* {id, x,y,z, r} in world space */
    var spriteData = new Float32Array(SPRITE_STRIDE * MAX_SPRITES);
    var spriteN = 0;
    var spriteMesh = null;
    var ripples = new Float32Array(NRIP * 4);
    var ripSlot = 0;
    var clock = 0;

    /* the room, as three lights. Warm lamp over the table, a
       cool window slab off to the left, warm bounce up off the
       board. These are the only light in the project. */
    var lamp = {
      /* Three-quarter back key, high and to the right. This is
         the light a food photographer actually uses: front light
         makes a shrimp a flat red shape, and a key behind it
         rakes along the shell, picks out every plate edge and
         puts a rim on the wet surfaces. It is the single change
         that made the food on this page stop looking modelled.

         It also means the contact shadow falls towards the lens,
         which is what gives the board depth. */
      dir: v3.norm([], [.42, .74, -.52]),
      col: [1.0, .78, .55],
      power: 6.2
    };
    /* The fill, from the window wall on the camera's side. It is
       cool, it is broad, and it is about a third of the key —
       enough to open the shadows without flattening them. Take
       it out and the whole image goes sepia, which is the one
       thing a warm palette cannot survive. */
    var win = { dir: v3.norm([], [-.62, .28, .74]), col: [1.75, 2.25, 3.25] };
    /* the board bouncing warm light back up into undersides */
    var board = [.34, .215, .145];
    var exposure = 1.08;

    /* ── targets ──────────────────────────────────────────── */

    var scene = null, half = null, quarter = null, eighth = null, upHalf = null;
    var shadow = GL.shadowTarget(gl, Q.shadow);

    function resize(cssW, cssH) {
      var w = Math.max(2, Math.round(cssW * dpr * renderScale));
      var h = Math.max(2, Math.round(cssH * dpr * renderScale));
      if (w === W && h === H) return;
      W = w; H = h;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      if (scene) { scene.dispose(); half.dispose(); quarter.dispose(); eighth.dispose(); upHalf.dispose(); }
      scene   = GL.target(gl, W, H, { half: hdr, depth: true, dist: true });
      half    = GL.target(gl, Math.max(2, W >> 1), Math.max(2, H >> 1), { half: hdr });
      quarter = GL.target(gl, Math.max(2, W >> 2), Math.max(2, H >> 2), { half: hdr });
      eighth  = GL.target(gl, Math.max(2, W >> 3), Math.max(2, H >> 3), { half: hdr });
      upHalf  = GL.target(gl, Math.max(2, W >> 1), Math.max(2, H >> 1), { half: hdr });
    }

    /* ══════════════════════════════════════════════════════════
       THE FRAME API
       ══════════════════════════════════════════════════════════ */

    var api = {
      gl: gl,
      tier: tier,
      quality: Q,
      lamp: lamp,
      win: win,

      form: function (key, factory) { factories[key] = factory; return api; },
      has: function (key) { return !!factories[key]; },

      resize: resize,

      begin: function (time) {
        clock = time;
        for (var i = 0; i < used.length; i++) meshes[used[i]].n = 0;
        used.length = 0;
        liquidKeys.length = 0;
        picks.length = 0;
        spriteN = 0;
      },

      /* Queue one instance.

         `mat` is a mat4. `mtl` is a material record; missing
         fields fall back to a matte off-white, which is
         deliberately ugly — an unstyled object should be
         obvious, not plausible. */
      draw: function (key, mat, mtl, pickId, pickR) {
        var m = meshFor(key);
        if (m.n >= m.cap) grow(m, key);
        if (m.n === 0) used.push(key);
        var o = m.n * STRIDE, d = m.data, i;
        for (i = 0; i < 16; i++) d[o + i] = mat[i];
        d[o + 16] = mtl.r; d[o + 17] = mtl.g; d[o + 18] = mtl.b;
        d[o + 19] = mtl.rough === undefined ? .8 : mtl.rough;
        d[o + 20] = mtl.metal || 0;
        d[o + 21] = mtl.wet || 0;
        d[o + 22] = mtl.sss || 0;
        d[o + 23] = mtl.seed || 0;
        d[o + 24] = mtl.emis || 0;
        d[o + 25] = mtl.crust || 0;
        d[o + 26] = mtl.sauce === undefined ? 1 : mtl.sauce;
        d[o + 27] = mtl.hi || 0;
        m.n++;
        if (pickId !== undefined && pickId !== null) {
          picks.push(pickId, mat[12], mat[13], mat[14],
            (pickR || radii[key] || .2) * Math.max(
              Math.hypot(mat[0], mat[1], mat[2]),
              Math.hypot(mat[4], mat[5], mat[6]),
              Math.hypot(mat[8], mat[9], mat[10])));
        }
      },

      /* Liquid surfaces run the ripple shader, so they are
         queued separately and drawn after the opaque pass. */
      liquid: function (key, mat, mtl) {
        api.draw(key, mat, mtl);
        if (liquidKeys.indexOf(key) < 0) liquidKeys.push(key);
      },

      sprite: function (kind, x, y, z, size, r, g, b, a, rot, life, seed) {
        if (spriteN >= Math.min(MAX_SPRITES, Q.sprites)) return;
        var o = spriteN * SPRITE_STRIDE, d = spriteData;
        d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
        d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a;
        d[o + 8] = rot || 0; d[o + 9] = kind; d[o + 10] = life || 0; d[o + 11] = seed || 0;
        spriteN++;
      },

      /* Start a ring travelling out from a point on a liquid
         surface. Oldest slot wins, so a fast drag leaves a
         wake rather than one ripple that keeps restarting. */
      ripple: function (x, z, strength) {
        var o = ripSlot * 4;
        ripples[o] = x; ripples[o + 1] = z; ripples[o + 2] = 0; ripples[o + 3] = strength;
        ripSlot = (ripSlot + 1) % NRIP;
      },

      stepRipples: function (dt) {
        for (var i = 0; i < NRIP; i++) {
          if (ripples[i * 4 + 3] > 0) {
            ripples[i * 4 + 2] += dt;
            if (ripples[i * 4 + 2] > 3.2) ripples[i * 4 + 3] = 0;
          }
        }
      },

      setExposure: function (e) { exposure = e; },

      /* ── picking ──────────────────────────────────────────
         Ray against every instance that asked to be pickable.
         Nearest hit along the ray wins, with a small bias
         towards whatever is closest to the ray's axis so that
         two shrimp lying across each other pick the one you
         actually pointed at rather than the one in front. */
      pick: function (cam, ndcX, ndcY) {
        var ro = cam.eyeR || cam.eye, rd = cam.rayFromNdc(ndcX, ndcY);
        var best = null, bestT = 1e9;
        for (var i = 0; i < picks.length; i += 5) {
          var cx = picks[i + 1] - ro[0], cy = picks[i + 2] - ro[1], cz = picks[i + 3] - ro[2];
          var r = picks[i + 4];
          var tca = cx * rd[0] + cy * rd[1] + cz * rd[2];
          if (tca < 0) continue;
          var d2 = cx * cx + cy * cy + cz * cz - tca * tca;
          if (d2 > r * r) continue;
          var t = tca - Math.sqrt(r * r - d2);
          /* the bias: a hit dead centre counts as slightly nearer */
          var score = t + Math.sqrt(Math.max(0, d2)) * .35;
          if (score < bestT) { bestT = score; best = picks[i]; }
        }
        return best;
      },

      /* Where a ray through the pointer meets a horizontal
         plane. This is what dragging runs on. */
      rayPlane: function (cam, ndcX, ndcY, planeY, out) {
        var ro = cam.eyeR || cam.eye, rd = cam.rayFromNdc(ndcX, ndcY);
        if (Math.abs(rd[1]) < 1e-5) return null;
        var t = (planeY - ro[1]) / rd[1];
        if (t < 0) return null;
        out[0] = ro[0] + rd[0] * t;
        out[1] = planeY;
        out[2] = ro[2] + rd[2] * t;
        return out;
      },

      /* ══════════════════════════════════════════════════════
         RENDER
         ══════════════════════════════════════════════════════ */

      render: function (cam, look) {
        look = look || {};
        var i, key, m;

        /* upload every batch once */
        for (i = 0; i < used.length; i++) {
          m = meshes[used[i]];
          m.uploadInstances(m.data, m.n * STRIDE);
        }

        /* ── 1. shadow ──────────────────────────────────────
           One directional light, framed on the working volume
           the camera is looking at rather than on the whole
           table — a 2048 map spread over six metres of board is
           a 2048 map wasted. */
        var lv = m4.make(), lp = m4.make(), lvp = m4.make();
        var ext = look.shadowExtent || 2.2;
        var c = look.shadowCenter || cam.target;
        m4.lookAt(lv, [c[0] + lamp.dir[0] * 6, c[1] + lamp.dir[1] * 6, c[2] + lamp.dir[2] * 6], c, [0, 1, 0]);
        m4.ortho(lp, -ext, ext, -ext, ext, .1, 14);
        m4.mul(lvp, lp, lv);

        shadow.bind();
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        /* front faces culled: the depth we want for a contact
           shadow under a shrimp is the shrimp's back, which
           moves the whole surface off the acne threshold */
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        pShadow.use().m4('uLightVP', lvp);
        for (i = 0; i < used.length; i++) {
          m = meshes[used[i]];
          if (m.n) m.drawInstanced(m.n);
        }
        gl.cullFace(gl.BACK);

        /* ── 2. the room, then everything solid ───────────── */
        scene.bind();
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        var invVP = m4.invert(m4.make(), cam.vp);
        pRoom.use()
          .m4('uInvVP', invVP).v3('uEye', cam.eyeR || cam.eye)
          .v2('uRes', W, H).f('uTime', clock)
          .v3('uLampDir', lamp.dir)
          .v3('uLampCol', lamp.col[0] * lamp.power, lamp.col[1] * lamp.power, lamp.col[2] * lamp.power)
          .v3('uWinDir', win.dir).v3('uWinCol', win.col)
          .v3('uBoardCol', board).f('uExposure', exposure);
        fs.draw();

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        function lights(p) {
          p.v3('uLampDir', lamp.dir)
            .v3('uLampCol', lamp.col[0] * lamp.power, lamp.col[1] * lamp.power, lamp.col[2] * lamp.power)
            .v3('uWinDir', win.dir).v3('uWinCol', win.col)
            .v3('uBoardCol', board).f('uExposure', exposure)
            .m4('uLightVP', lvp).f('uShadowTexel', 1 / shadow.size)
            .tex('uShadow', shadow.depth, 0)
            .v3('uEye', cam.eyeR || cam.eye).f('uTime', clock);
        }

        pSurf.use().m4('uVP', cam.vp);
        lights(pSurf);
        for (i = 0; i < used.length; i++) {
          key = used[i];
          if (liquidKeys.indexOf(key) >= 0) continue;
          m = meshes[key];
          if (m.n) m.drawInstanced(m.n);
        }

        /* ── 3. liquid ──────────────────────────────────────
           After the solids so it can blend against them, and
           with depth writes on because a shrimp half in the
           broth has to be occluded by it. */
        if (liquidKeys.length) {
          pLiquid.use().m4('uVP', cam.vp);
          lights(pLiquid);
          pLiquid.f('uRipSpeed', 1.35);
          var loc = pLiquid.loc('uRip[0]');
          if (loc) gl.uniform4fv(loc, ripples);
          for (i = 0; i < liquidKeys.length; i++) {
            m = meshes[liquidKeys[i]];
            if (m.n) m.drawInstanced(m.n);
          }
        }

        /* ── 4. sprites ─────────────────────────────────────
           Premultiplied alpha, no depth write, soft against the
           distance buffer the opaque pass just filled. */
        if (spriteN) {
          if (!spriteMesh) {
            spriteMesh = GL.mesh(gl, Forms.quad());
            spriteMesh.addInstanceAttribs(SPRITE_STRIDE, MAX_SPRITES, [
              { loc: 3, size: 4, offset: 0 },
              { loc: 4, size: 4, offset: 4 },
              { loc: 5, size: 4, offset: 8 }
            ]);
          }
          spriteMesh.uploadInstances(spriteData, spriteN * SPRITE_STRIDE);
          scene.bindColorOnly();
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(false);
          pSprite.use()
            .m4('uVP', cam.vp)
            .v3('uRight', cam.right).v3('uUp', cam.up).v3('uEye', cam.eyeR || cam.eye)
            .v2('uRes', W, H)
            .v3('uLampDir', lamp.dir)
            .v3('uLampCol', lamp.col[0] * lamp.power, lamp.col[1] * lamp.power, lamp.col[2] * lamp.power)
            .v3('uWinCol', win.col).f('uExposure', exposure).f('uTime', clock)
            .tex('uSceneDepth', scene.dist, 1);
          spriteMesh.drawInstanced(spriteN);
          gl.disable(gl.BLEND);
          gl.depthMask(true);
        }

        /* ── 5. blur chain ──────────────────────────────────
           Not bright-passed. It is the real image at low
           resolution, because it is both the bloom source and
           the out-of-focus image the depth of field mixes
           towards. */
        gl.disable(gl.DEPTH_TEST);
        function down(src, dst) {
          dst.bind();
          pDown.use().tex('uTex', src.color, 0).v2('uTexel', 1 / src.w, 1 / src.h);
          fs.draw();
        }
        down(scene, half);
        down(half, quarter);
        if (Q.wide) down(quarter, eighth);

        /* upsample the small level back onto the half so the
           depth of field has a genuinely wide blur to reach for
           rather than a blocky quarter */
        upHalf.bind();
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        var src = Q.wide ? eighth : quarter;
        pUp.use().tex('uTex', src.color, 0).v2('uTexel', 1 / src.w, 1 / src.h).f('uAmt', .62);
        fs.draw();
        pUp.use().tex('uTex', quarter.color, 0).v2('uTexel', 1 / quarter.w, 1 / quarter.h).f('uAmt', .38);
        fs.draw();
        gl.disable(gl.BLEND);

        /* ── 6. composite ──────────────────────────────────── */
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        pComp.use()
          .tex('uScene', scene.color, 0)
          .tex('uBlur', half.color, 1)
          .tex('uWide', upHalf.color, 2)
          .tex('uDepth', scene.dist, 3)
          .v2('uRes', canvas.width, canvas.height)
          .f('uFocus', cam.focus)
          .f('uAperture', cam.aperture)
          .f('uBloom', look.bloom === undefined ? 1 : look.bloom)
          .f('uGrain', Q.grain)
          .f('uVignette', look.vignette === undefined ? .34 : look.vignette)
          .f('uFade', look.fade === undefined ? 1 : look.fade)
          .f('uTime', clock);
        fs.draw();
      },

      /* ── adaptive scale ───────────────────────────────────
         Moved from measured frame time, in small steps, with a
         dead band so it does not hunt. */
      adapt: function (avgMs, cssW, cssH) {
        var target = 1000 / 110;
        var lo = Math.max(.5, Q.scale * .62), hi = Q.scale;
        var next = renderScale;
        if (avgMs > target * 1.55) next = Math.max(lo, renderScale - .06);
        else if (avgMs < target * .92) next = Math.min(hi, renderScale + .03);
        if (Math.abs(next - renderScale) > .004) {
          renderScale = next;
          W = H = 0;
          resize(cssW, cssH);
        }
      },

      renderScale: function () { return renderScale; },
      spriteCount: function () { return spriteN; },
      instanceCount: function () {
        var n = 0;
        for (var i = 0; i < used.length; i++) n += meshes[used[i]].n;
        return n;
      },
      drawCalls: function () { return used.length; }
    };

    return api;
  };

})(window);
