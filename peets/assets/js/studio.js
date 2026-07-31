/* ═══════════════════════════════════════════════════════════
   studio.js — a product shot, rendered.

   One WebGL2 context for the whole menu. Each card asks for its
   product, the studio renders it into a single offscreen canvas
   and the pixels are blitted into the card's own 2D canvas, so
   thirty-four products cost one context and one set of render
   targets rather than thirty-four of each.

   The lighting is a product photographer's, not the film's: a
   broad warm key from the upper left, the café's window as the
   environment every reflection is sampled from, a bounce off the
   counter, and a narrow rim to lift the silhouette off the
   backdrop. The subject sits on a surface with a real shadow
   under it, because the single thing that separates a product
   render from a sticker is contact with the ground.

   Everything up to the composite is linear light. The composite
   is the film's, so the menu and the film are graded by the same
   curve — that is what makes them read as one piece of work.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  var M = PEET.M, GL = PEET.GL, Geo = PEET.Geo, SH = PEET.SH, Tex = PEET.Tex;
  var m4 = M.m4, v3 = M.v3;

  function Studio(size) {
    this.ok = false;
    this.size = size || 560;

    var canvas = doc().createElement('canvas');
    canvas.width = this.size;
    canvas.height = this.size;
    this.canvas = canvas;

    var ctx = GL.context(canvas, { preserveDrawingBuffer: true });
    if (!ctx || !ctx.gl) { this.error = 'no webgl2'; return; }
    this.gl = ctx.gl;
    this.hdr = !!ctx.hdr;

    try { this.build(); } catch (e) { this.error = e && e.message; return; }
    this.ok = true;
  }

  function doc() { return global.document; }

  Studio.prototype.build = function () {
    var gl = this.gl, s = this.size;

    var o = SH.obj(false), d = SH.depth(false);
    this.pObj = GL.program(gl, o.vs, o.fs, 'studioObj');
    this.pDepth = GL.program(gl, d.vs, d.fs, 'studioDepth');
    this.pSky = GL.program(gl, SH.fsVS, SH.sky, 'studioSky');
    this.pBright = GL.program(gl, SH.fsVS, SH.bright, 'studioBright');
    this.pDown = GL.program(gl, SH.fsVS, SH.down, 'studioDown');
    this.pUp = GL.program(gl, SH.fsVS, SH.up, 'studioUp');
    this.pComp = GL.program(gl, SH.fsVS, SH.composite, 'studioComp');
    this.quad = GL.fullscreen(gl);

    var half = this.hdr;
    function mk(w, h, depth) {
      return GL.target(gl, Math.max(2, Math.ceil(w)), Math.max(2, Math.ceil(h)),
        { half: half, depth: depth });
    }
    this.T = {
      main: mk(s, s, true),
      bright: mk(s / 2, s / 2), d1: mk(s / 4, s / 4), d2: mk(s / 8, s / 8),
      d3: mk(s / 16, s / 16), d4: mk(s / 32, s / 32),
      u3: mk(s / 16, s / 16), u2: mk(s / 8, s / 8), u1: mk(s / 4, s / 4), u0: mk(s / 2, s / 2),
      /* the composite wants a steam layer and a shafts layer; the
         studio has neither, and a sampler left unbound reads unit
         zero, which is the buffer being drawn into */
      black: mk(2, 2)
    };
    this.shadow = GL.shadowTarget(gl, 1024);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.T.black.fbo);
    gl.viewport(0, 0, 2, 2);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.meshes = {};
    this.textures = {};
    this._m = {
      view: m4.make(), proj: m4.make(), viewProj: m4.make(), invViewProj: m4.make(),
      model: m4.make(), normal: new Float32Array(9),
      lightView: m4.make(), lightProj: m4.make(), lightVP: m4.make()
    };
    this._fwd = [0, 0, 0];

    /* the ground the product stands on, and a flat art texture for
       anything that does not carry latte art */
    this.mGround = this.mesh('ground', function () {
      return Geo.lathe([[0, 0], [0.6, 0], [1.4, 0], [3.0, 0], [7.0, 0]], 72);
    });
    this.blankArt = GL.canvasTexture(gl, blankCanvas());
  };

  function blankCanvas() {
    var c = doc().createElement('canvas');
    c.width = c.height = 4;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 4, 4);
    return c;
  }

  /* Meshes are cached by key: twelve drinks share one mug, eight
     bags share one pouch, and the whole menu uploads about a dozen
     buffers rather than thirty-four. */
  Studio.prototype.mesh = function (key, build) {
    var m = this.meshes[key];
    if (!m) {
      var b = build();
      m = this.meshes[key] = GL.mesh(this.gl, b.finish ? b.finish() : b);
    }
    return m;
  };

  Studio.prototype.texture = function (key, draw) {
    var t = this.textures[key];
    if (!t) t = this.textures[key] = GL.canvasTexture(this.gl, draw());
    return t;
  };

  /* ── the set ──────────────────────────────────────────────── */

  Studio.prototype.defaultState = function () {
    return {
      cam: { pos: [0, 0.6, 2.2], target: [0, 0.3, 0], fov: 0.52, roll: 0 },
      /* the key comes from the upper left and slightly behind, so
         the near shoulder of every product is the lit one and the
         back edge carries a rim */
      sun: { dir: norm([-0.46, 0.66, 0.42]), color: [2.30, 1.86, 1.42] },
      env: {
        top: [0.055, 0.046, 0.042], floor: [0.020, 0.013, 0.009],
        window: [2.10, 1.72, 1.34], bounce: [0.135, 0.078, 0.044],
        ambient: [1.0, 1.0, 1.0], rim: [0.34, 0.22, 0.13]
      },
      room: 0.42, haze: { amt: 0.010, color: [0.075, 0.048, 0.032] },
      fog: [3.4, 0.10],
      shadow: 0.92,
      post: {
        exposure: 1.06, bloom: 0.34, vignette: 0.52,
        grain: 0.022, aberration: 0.0016, fade: 0, warmth: 0.30
      }
    };
  };

  function norm(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  /* Frame the subject rather than guessing a camera per product.
     Given how tall and how wide the thing is, this puts the lens
     where it fills `fill` of the frame, on a three-quarter view at
     `pitch` above the surface. */
  Studio.prototype.frame = function (st, h, w, o) {
    o = o || {};
    var fill = o.fill || 0.74;
    var fov = o.fov || 0.50;
    var pitch = o.pitch === undefined ? 0.30 : o.pitch;
    var yaw = o.yaw === undefined ? 0.44 : o.yaw;

    var extent = Math.max(h, w * 0.92);
    var dist = (extent / fill) / (2 * Math.tan(fov / 2));
    var cy = h * (o.aim === undefined ? 0.46 : o.aim);

    st.cam.fov = fov;
    st.cam.target = [0, cy, 0];
    st.cam.pos = [
      Math.sin(yaw) * Math.cos(pitch) * dist,
      cy + Math.sin(pitch) * dist,
      Math.cos(yaw) * Math.cos(pitch) * dist
    ];
    return st;
  };

  Studio.prototype.updateCamera = function (st) {
    var m = this._m;
    m4.lookAt(m.view, st.cam.pos, st.cam.target, [0, 1, 0]);
    m4.perspective(m.proj, st.cam.fov, 1, 0.03, 60);
    m4.mul(m.viewProj, m.proj, m.view);
    m4.invert(m.invViewProj, m.viewProj);
    v3.sub(this._fwd, st.cam.target, st.cam.pos);
    v3.norm(this._fwd, this._fwd);

    /* the light frustum is sized to the subject, not to a scene —
       a 3.4-unit ortho box around a 12 cm cup spends the whole
       shadow map on empty counter */
    var f = st.cam.target;
    var r = st.shadowExtent || 1.2;
    /* The depth range has to match the film's, not just the box.
       The bias in shadowAt is a constant in normalised depth, so
       squeezing near/far around a 12 cm cup makes that constant
       cover a fraction of the world distance it was tuned for, and
       the cup wall comes back covered in acne. Same 0.6–20 range,
       same light distance; only the XY box tightens. */
    var lp = [f[0] + st.sun.dir[0] * 9, f[1] + st.sun.dir[1] * 9, f[2] + st.sun.dir[2] * 9];
    m4.lookAt(m.lightView, lp, f, [0, 1, 0]);
    m4.ortho(m.lightProj, -r, r, -r, r, 0.6, 20);
    m4.mul(m.lightVP, m.lightProj, m.lightView);
  };

  Studio.prototype.applyLighting = function (p, st) {
    p.v3('uSunDir', st.sun.dir).v3('uSunColor', st.sun.color)
     .v3('uAmbient', st.env.ambient).v3('uRimColor', st.env.rim)
     .v3('uEnvTop', st.env.top).v3('uEnvFloor', st.env.floor)
     .v3('uEnvWindow', st.env.window).v3('uEnvBounce', st.env.bounce)
     .v3('uCam', st.cam.pos)
     .m4('uViewProj', this._m.viewProj)
     .m4('uShadowMat', this._m.lightVP)
     .f('uShadowStrength', st.shadow)
     .v2('uShadowTexel', 1 / 1024, 1 / 1024)
     .tex('uShadowMap', this.shadow.depth, 6)
     .tex('uArtTex', this.blankArt, 5)
     .v2('uFog', st.fog[0], st.fog[1])
     .f('uTime', st.time || 0);
  };

  Studio.prototype.setMat = function (p, mat) {
    var liq = mat.liq || PEET.Products.LIQ.espresso;
    p.v3('uDeep', liq.deep).v3('uCrema', liq.crema)
     .v3('uCremaHi', liq.cremaHi).v3('uMilk', liq.milk)
     .v3('uBase', mat.base)
     .f('uRough', mat.rough).f('uMetal', mat.metal || 0)
     .f('uAlpha', mat.alpha === undefined ? 1 : mat.alpha)
     .v3('uEmissive', mat.emissive || [0, 0, 0])
     .i('uMat', mat.mat || 0)
     .f('uFade', 1)
     .f('uDetail', mat.detail || 0)
     .v4('uDeform', 1, 0, 0, 0)
     .v4('uLiquid', 1, 0, 0, 0)
     .v4('uPour', 0, 0, 0, 0);
  };

  Studio.prototype.model = function (p, part) {
    var m = this._m;
    var q = [0, 0, 0, 1];
    M.quat.fromEuler(q, part.rx || 0, part.ry || 0, part.rz || 0);
    var sc = part.scale === undefined ? 1 : part.scale;
    if (typeof sc === 'number') sc = [sc, sc, sc];
    m4.compose(m.model, part.pos || [0, 0, 0], q, sc);
    m4.normalMat3(m.normal, m.model);
    p.m4('uModel', m.model).m3('uNormalMat', m.normal);
  };

  Studio.prototype.drawParts = function (parts, st, shadowPass) {
    var gl = this.gl;
    var p = shadowPass ? this.pDepth : this.pObj;
    p.use();
    if (shadowPass) p.m4('uLightViewProj', this._m.lightVP);
    else this.applyLighting(p, st);

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.hidden) continue;
      /* glass and liquid films cast almost nothing, and a solid
         shadow under a tumbler is the tell that gives away a
         render every time */
      if (shadowPass && part.noShadow) continue;
      this.model(p, part);
      if (!shadowPass) {
        this.setMat(p, part.mat);
        if (part.liquid) {
          p.f('uRough', 0.17)
           .v4('uLiquid', 1.0, part.liquid.crema, part.liquid.swirl || 0, part.liquid.artReveal || 0)
           .v4('uPour', 0, 0, 0, part.liquid.artOpacity || 0)
           .tex('uArtTex', part.liquid.tex || this.blankArt, 5);
        } else if (part.decal) {
          p.tex('uArtTex', part.decal, 5);
        }
      } else {
        p.f('uTime', st.time || 0).i('uMat', part.mat.mat || 0).v4('uDeform', 1, 0, 0, 0);
      }
      part.mesh.draw();
    }
  };

  /* ── the frame ────────────────────────────────────────────── */

  Studio.prototype.draw = function (scene) {
    if (!this.ok) return false;
    var gl = this.gl, T = this.T, st = scene.state, s = this.size;

    this.updateCamera(st);

    var opaque = [], blended = [];
    for (var i = 0; i < scene.parts.length; i++) {
      (scene.parts[i].mat.alpha !== undefined && scene.parts[i].mat.alpha < 1
        || scene.parts[i].mat.mat === 7 ? blended : opaque).push(scene.parts[i]);
    }

    /* 1 — shadow */
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.shadow.bind();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    this.drawParts(opaque, st, true);
    gl.cullFace(gl.BACK);

    /* 2 — scene */
    T.main.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.pSky.use()
      .m4('uInvViewProj', this._m.invViewProj)
      .v3('uCam', st.cam.pos).v3('uSunDir', st.sun.dir)
      .v3('uEnvTop', st.env.top).v3('uEnvFloor', st.env.floor)
      .v3('uEnvWindow', st.env.window).v3('uEnvBounce', st.env.bounce)
      .f('uTime', st.time || 0).f('uRoomAmt', st.room)
      .f('uHazeAmt', st.haze.amt).v3('uHazeColor', st.haze.color);
    this.quad.draw();

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    this.drawParts(opaque, st, false);

    if (blended.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      /* back faces first, then front: without it the far wall of a
         tumbler is drawn over the ice standing in front of it */
      gl.cullFace(gl.FRONT);
      this.drawParts(blended, st, false);
      gl.cullFace(gl.BACK);
      this.drawParts(blended, st, false);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* Everything from here on is a fullscreen quad, and none of it
       wants the depth buffer. Leaving the test on is a subtle bug
       rather than a loud one: the first composite writes its depth
       and every later one fails it, so the studio renders
       thirty-four different products and shows the first one
       thirty-four times. */
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    /* 3 — bloom */
    T.bright.bind();
    this.pBright.use()
      .tex('uScene', T.main.color, 0).tex('uSteam', T.black.color, 1)
      .f('uThreshold', 0.78).f('uKnee', 0.40);
    this.quad.draw();

    var chain = [T.bright, T.d1, T.d2, T.d3, T.d4];
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
    this.pUp.use().f('uRadius', 1.1);
    for (i = 0; i < ups.length; i++) {
      ups[i].bind();
      this.pUp.tex('uTex', srcs[i].color, 0).tex('uPrev', prevs[i].color, 1)
        .v2('uTexel', 1 / srcs[i].w, 1 / srcs[i].h);
      this.quad.draw();
    }

    /* 4 — composite, on the same curve as the film */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, s, s);
    var post = st.post;
    this.pComp.use()
      .tex('uScene', T.main.color, 0)
      .tex('uSteam', T.black.color, 1)
      .tex('uBloom', T.u0.color, 2)
      .tex('uRays', T.black.color, 3)
      .f('uTime', st.time || 0)
      .f('uBloomAmt', post.bloom).f('uRayAmt', 0)
      .f('uExposure', post.exposure).f('uVignette', post.vignette)
      .f('uGrain', post.grain).f('uAberration', post.aberration)
      .f('uFadeToBlack', post.fade).f('uWarmth', post.warmth)
      .v2('uRes', s, s);
    this.quad.draw();
    return true;
  };

  /* Copy the render into a card's own canvas. `cover` crops rather
     than stretches, so a card that is not square gets a crop of the
     shot instead of a squashed cup. */
  Studio.prototype.blit = function (canvas, cssW, cssH, dpr) {
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    canvas.width = w; canvas.height = h;
    var g = canvas.getContext('2d');
    if (!g) return false;
    var s = this.size;
    var scale = Math.max(w / s, h / s);
    var dw = s * scale, dh = s * scale;
    g.clearRect(0, 0, w, h);
    g.drawImage(this.canvas, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return true;
  };

  /* Give the context back once the last card has been drawn. A
     WebGL context held open for the life of the page is a context
     another one on the same page cannot have. */
  Studio.prototype.dispose = function () {
    if (!this.ok) return;
    var ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    this.ok = false;
  };

  PEET.Studio = Studio;

})(window);
