/* ═══════════════════════════════════════════════════════════
   pass.js — the renderer.

   One class, used twice: once for the hero, once for the menu.
   It knows nothing about dishes or scrolling. It is handed a
   scene — a camera, a light, a list of parts with transforms and
   materials, and optionally a plume of steam — and it draws that,
   at whatever resolution it has been told it can afford.

   Six passes:

     1  shadow depth     one key light, 3×3 PCF, front faces culled
     2  scene → HDR      the room, then opaque, then transparent
     3  steam            depth-soft sprites, drawn into the same target
     4  soft + DoF       quarter-res blur, mixed back by circle of confusion
     5  bright → mips    4 down, 4 up — dual-filter bloom
     6  composite        aberration, split-tone, ACES, vignette, grain

   The stage culls itself when its section is off screen, stops
   entirely when the tab is hidden, and adjusts its own render
   scale from measured frame time — because a slightly softer
   image at rate beats a sharp one that stutters, every time.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = (global.SHRIM = global.SHRIM || {});
  var M = SHRIM.M, GL = SHRIM.GL, SH = SHRIM.SH;
  var m4 = M.m4, v3 = M.v3;

  /* sRGB → linear. Every colour in dishes.js is written the way it
     would be picked in a colour picker; the shading maths needs it
     linear, and doing the conversion at the boundary rather than
     in the shader means the grade only has to happen once. */
  function lin(c) {
    function f(x) { return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    return [f(c[0]), f(c[1]), f(c[2])];
  }

  function hex(h) {
    var n = parseInt(h.slice(1), 16);
    return lin([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
  }

  /* ── the stage ───────────────────────────────────────────── */

  function Stage(canvas, opt) {
    opt = opt || {};
    this.ok = false;
    this.canvas = canvas;
    this.tier = opt.tier || { shadowSize: 1024, maxScale: 1.5, steam: 40, detail: 1 };
    this.maxSteam = this.tier.steam;

    var ctx = GL.context(canvas, {});
    if (!ctx || !ctx.gl) { this.error = 'no webgl2'; return; }
    this.gl = ctx.gl;
    this.hdr = !!ctx.hdr;

    this.w = 2; this.h = 2;
    this.scale = Math.min(this.tier.maxScale, global.devicePixelRatio || 1);
    this.meshes = {};

    try { this.build(); } catch (e) { this.error = (e && e.message) || String(e); return; }

    /* A GPU reset, a driver update, a laptop switching graphics —
       contexts are lost in normal use, and a lost one does not
       throw, it silently stops drawing. Rebuilding every buffer,
       program and target from here would be a lot of code for a
       rare event; saying so and falling back to the poster is
       honest, and it is what the page already does for a browser
       with no WebGL2 at all. */
    var self = this;
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      self.ok = false;
      self.error = 'context lost';
      if (self.onLost) self.onLost();
    }, false);

    this.ok = true;
  }

  Stage.prototype.build = function () {
    var gl = this.gl;

    this.pObj = GL.program(gl, SH.objVS, SH.objFS, 'obj');
    this.pDepth = GL.program(gl, SH.depthVS, SH.depthFS, 'depth');
    this.pSprite = GL.program(gl, SH.spriteVS, SH.spriteFS, 'sprite');
    this.pBack = GL.program(gl, SH.fsVS, SH.backdrop, 'backdrop');
    this.pBright = GL.program(gl, SH.fsVS, SH.bright, 'bright');
    this.pDown = GL.program(gl, SH.fsVS, SH.down, 'down');
    this.pUp = GL.program(gl, SH.fsVS, SH.up, 'up');
    this.pDof = GL.program(gl, SH.fsVS, SH.dof, 'dof');
    this.pComp = GL.program(gl, SH.fsVS, SH.composite, 'composite');
    this.pBlit = GL.program(gl, SH.fsVS, SH.blit, 'blit');

    this.quad = GL.fullscreen(gl);
    this.shadow = GL.shadowTarget(gl, this.tier.shadowSize);

    /* one unit quad, instanced, for every puff of steam */
    var q = new SHRIM.K.Builder();
    q.vertex(-1, -1, 0, 0, 0); q.vertex(1, -1, 0, 1, 0);
    q.vertex(1, 1, 0, 1, 1); q.vertex(-1, 1, 0, 0, 1);
    q.quad(0, 1, 2, 3);
    this.spriteMesh = GL.mesh(gl, q.finish());
    this.spriteMesh.addInstanceAttribs(8, this.maxSteam, [
      { loc: 3, size: 4, offset: 0 },
      { loc: 4, size: 4, offset: 4 }
    ]);
    this.spriteData = new Float32Array(this.maxSteam * 8);

    this._m = {
      view: m4.make(), proj: m4.make(), viewProj: m4.make(), invViewProj: m4.make(),
      lightView: m4.make(), lightProj: m4.make(), lightVP: m4.make(),
      normal: new Float32Array(9), tmp: m4.make()
    };
    this._targets = null;
    this.time = 0;
    this.frameMs = 16;
    this._samples = 0;
    this._acc = 0;
  };

  /* Meshes are cached by key. Nine prawns on a platter, six
     dishes, one buffer. */
  Stage.prototype.mesh = function (key, build) {
    var m = this.meshes[key];
    if (!m) {
      var b = build();
      var geo = b.finish ? b.finish() : b;
      m = this.meshes[key] = GL.mesh(this.gl, geo);
      m.radius = b.radius ? b.radius() : 1;
      m.tris = geo.triCount;
    }
    return m;
  };

  Stage.prototype.resize = function (cssW, cssH, scaleOverride) {
    var s = scaleOverride === undefined ? this.scale : scaleOverride;
    var w = Math.max(2, Math.round(cssW * s));
    var h = Math.max(2, Math.round(cssH * s));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.cssW = cssW; this.cssH = cssH;
    this.canvas.width = w;
    this.canvas.height = h;
    this.buildTargets();
  };

  Stage.prototype.buildTargets = function () {
    var gl = this.gl, w = this.w, h = this.h, half = this.hdr;
    if (this._targets) this._targets.forEach(function (t) { t.dispose(); });

    function mk(dw, dh, depth, eightBit) {
      return GL.target(gl, Math.max(2, Math.ceil(dw)), Math.max(2, Math.ceil(dh)),
        { half: eightBit ? false : half, depth: depth });
    }
    this.T = {
      main: mk(w, h, true),
      soft1: mk(w / 2, h / 2),
      soft2: mk(w / 4, h / 4),
      dof: mk(w, h),
      bright: mk(w / 2, h / 2),
      d1: mk(w / 4, h / 4), d2: mk(w / 8, h / 8), d3: mk(w / 16, h / 16), d4: mk(w / 32, h / 32),
      u3: mk(w / 16, h / 16), u2: mk(w / 8, h / 8), u1: mk(w / 4, h / 4), u0: mk(w / 2, h / 2),
      out: mk(w, h, false, true)
    };
    this._targets = Object.keys(this.T).map(function (k) { return this.T[k]; }, this);
    if (this.mainNoDepth) this.mainNoDepth.dispose();
    this.mainNoDepth = GL.colorOnly(gl, this.T.main);
  };

  /* ── uniform helpers ─────────────────────────────────────── */

  function setEnv(p, L) {
    p.v3('uEnvTop', L.envTop).v3('uEnvFloor', L.envFloor)
     .v3('uEnvKey', L.envKey).v3('uEnvCool', L.envCool).v3('uEnvBounce', L.envBounce)
     .v3('uKeyDir', L.keyDir).v3('uCoolDir', L.coolDir);
  }

  function setLight(p, L) {
    setEnv(p, L);
    p.v3('uKeyColor', L.keyColor).v3('uCoolColor', L.coolColor)
     .v3('uRimColor', L.rimColor).v3('uAmbient', L.ambient);
  }

  /* ── the frame ───────────────────────────────────────────── */

  Stage.prototype.render = function (scene, dt) {
    if (!this.ok) return;
    var gl = this.gl, m = this._m, T = this.T;
    this.time += dt;

    var cam = scene.camera, L = scene.light;
    var aspect = this.w / this.h;

    m4.perspective(m.proj, cam.fov, aspect, cam.near, cam.far);
    m4.lookAt(m.view, cam.eye, cam.target, [0, 1, 0]);
    m4.mul(m.viewProj, m.proj, m.view);
    m4.invert(m.invViewProj, m.viewProj);

    /* ── 1 · shadow ──────────────────────────────────────────
       The light box is fitted to the dish, not to the world. A
       shadow map stretched over twenty metres to cover a table
       nobody sees spends all its resolution on nothing, and the
       contact shadow under a prawn — the only shadow that
       matters — comes back as four grey pixels. */
    var box = scene.shadowBox || 2.6;
    var lightEye = v3.scale([0, 0, 0], L.keyDir, 9);
    v3.add(lightEye, lightEye, scene.shadowCentre || [0, 0, 0]);
    m4.ortho(m.lightProj, -box, box, -box, box, 0.5, 20);
    m4.lookAt(m.lightView, lightEye, scene.shadowCentre || [0, 0, 0], [0, 1, 0]);
    m4.mul(m.lightVP, m.lightProj, m.lightView);

    this.shadow.bind();
    /* depthMask before the clear, not after.

       A masked-off depth buffer does not clear. The post chain
       leaves the mask false, so from the second frame onward this
       clear — and the one on the main target below — quietly did
       nothing, and every frame accumulated the depth of the one
       before it. The first frame of the page looked perfect,
       which is the worst way for a bug like this to behave. */
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    /* front faces culled: the back wall of an object is a better
       depth reference than its front, and it costs no bias */
    gl.cullFace(gl.FRONT);
    gl.disable(gl.BLEND);

    var p = this.pDepth.use();
    p.m4('uLightViewProj', m.lightVP);
    var i, part;
    for (i = 0; i < scene.parts.length; i++) {
      part = scene.parts[i];
      if (part.hidden || part.mat.blend || part.noShadow) continue;
      p.m4('uModel', part.model);
      part.mesh.draw();
    }

    /* ── 2 · the room and the food ───────────────────────── */
    T.main.bind();
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    p = this.pBack.use();
    setEnv(p, L);
    p.m4('uInvViewProj', m.invViewProj).v3('uCam', cam.eye)
     .f('uTime', this.time).f('uRoomAmt', L.roomAmt === undefined ? 1 : L.roomAmt)
     .f('uHazeAmt', L.hazeAmt || 0).v3('uHazeColor', L.hazeColor || [0, 0, 0]);
    this.quad.draw();

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    p = this.pObj.use();
    setLight(p, L);
    p.m4('uViewProj', m.viewProj).v3('uCam', cam.eye)
     .tex('uShadowMap', this.shadow.depth, 0)
     .m4('uShadowMat', m.lightVP)
     .f('uShadowStrength', L.shadowStrength === undefined ? 1 : L.shadowStrength)
     .v2('uShadowTexel', 1 / this.shadow.size, 1 / this.shadow.size)
     .f('uTime', this.time)
     .v2('uFog', scene.fog ? scene.fog[0] : 0.04, scene.fog ? scene.fog[1] : 0.02);

    var detail = this.tier.detail;
    function drawPart(part) {
      var mat = part.mat;
      p.i('uMat', mat.mat | 0)
       .v3('uBase', mat.base)
       .v3('uTint2', mat.tint2 || mat.base)
       .v3('uSSSTint', mat.sssTint || mat.base)
       .f('uRough', mat.rough === undefined ? 0.4 : mat.rough)
       .f('uMetal', mat.metal || 0)
       .f('uAlpha', part.alpha === undefined ? (mat.alpha === undefined ? 1 : mat.alpha) : part.alpha)
       .f('uCoat', mat.coat || 0)
       .f('uSSS', mat.sss || 0)
       .f('uDetail', (mat.detail === undefined ? 1 : mat.detail) * detail)
       .f('uChar', part.char === undefined ? (mat.char || 0) : part.char)
       .f('uFade', part.fade === undefined ? 1 : part.fade)
       .f('uWobble', part.wobble || 0)
       .m4('uModel', part.model)
       .m3('uNormalMat', part.normalMat);
      part.mesh.draw();
    }

    for (i = 0; i < scene.parts.length; i++) {
      part = scene.parts[i];
      if (part.hidden || part.mat.blend) continue;
      drawPart(part);
    }

    /* Transparent things last, back to front, writing no depth.
       There are never more than a handful on a plate, so the sort
       is an insertion sort over a list of four. */
    var blended = [];
    for (i = 0; i < scene.parts.length; i++) {
      part = scene.parts[i];
      if (part.hidden || !part.mat.blend) continue;
      part.__z = v3.dist(cam.eye, [part.model[12], part.model[13], part.model[14]]);
      blended.push(part);
    }
    if (blended.length) {
      blended.sort(function (a, b) { return b.__z - a.__z; });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      for (i = 0; i < blended.length; i++) drawPart(blended[i]);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
    }

    /* ── 3 · steam ───────────────────────────────────────── */
    if (scene.steam && scene.steam.count > 0) this.drawSteam(scene, dt);

    /* ── 4 · soft, then depth of field ───────────────────── */
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    this.blur(T.main.color, T.soft1, this.w, this.h);
    this.blur(T.soft1.color, T.soft2, T.soft1.w, T.soft1.h);

    T.dof.bind();
    p = this.pDof.use();
    p.tex('uScene', T.main.color, 0).tex('uSoft', T.soft2.color, 1).tex('uDepth', T.main.depth, 2)
     .f('uNear', cam.near).f('uFar', cam.far)
     .f('uFocus', cam.focus).f('uRange', cam.dofRange || 1.4)
     .f('uAmount', cam.dof === undefined ? 1 : cam.dof)
     .f('uMaxCoC', cam.maxCoC === undefined ? 0.92 : cam.maxCoC);
    this.quad.draw();

    /* ── 5 · bloom ───────────────────────────────────────── */
    var g = scene.grade;
    T.bright.bind();
    p = this.pBright.use();
    p.tex('uScene', T.dof.color, 0).f('uThreshold', g.bloomThreshold).f('uKnee', 0.28);
    this.quad.draw();

    var chain = [T.bright, T.d1, T.d2, T.d3, T.d4];
    for (i = 1; i < chain.length; i++) {
      chain[i].bind();
      p = this.pDown.use();
      p.tex('uTex', chain[i - 1].color, 0).v2('uTexel', 1 / chain[i - 1].w, 1 / chain[i - 1].h);
      this.quad.draw();
    }
    var up = [[T.u3, T.d4, T.d3], [T.u2, T.u3, T.d2], [T.u1, T.u2, T.d1], [T.u0, T.u1, T.bright]];
    for (i = 0; i < up.length; i++) {
      up[i][0].bind();
      p = this.pUp.use();
      p.tex('uTex', up[i][1].color, 0).tex('uPrev', up[i][2].color, 1)
       .v2('uTexel', 1 / up[i][1].w, 1 / up[i][1].h).f('uRadius', 1.15).f('uPrevAmt', 1);
      this.quad.draw();
    }

    /* ── 6 · composite ───────────────────────────────────── */
    T.out.bind();
    p = this.pComp.use();
    p.tex('uScene', T.dof.color, 0).tex('uBloom', T.u0.color, 1)
     .f('uTime', this.time).f('uBloomAmt', g.bloom).f('uExposure', g.exposure)
     .f('uVignette', g.vignette).f('uGrain', g.grain).f('uAberration', g.aberration)
     .f('uFade', g.fade === undefined ? 1 : g.fade).f('uWarmth', g.warmth)
     .f('uLift', g.lift || 0).v2('uRes', this.w, this.h);
    this.quad.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    p = this.pBlit.use();
    p.tex('uTex', T.out.color, 0);
    this.quad.draw();
  };

  Stage.prototype.blur = function (srcTex, dst, srcW, srcH) {
    dst.bind();
    var p = this.pDown.use();
    p.tex('uTex', srcTex, 0).v2('uTexel', 1 / srcW, 1 / srcH);
    this.quad.draw();
  };

  /* ── steam ───────────────────────────────────────────────────
     A small pool of puffs, recycled. Each rises, spreads, fades
     and is respawned at the bottom — the whole system is thirty
     floats per puff and it never allocates after the first frame.

     The drift is curl noise sampled on the CPU, which is the same
     field the shader warps each puff's shape with, so a plume
     leans and shears as one body rather than as forty sprites
     that happen to be near each other. */
  Stage.prototype.drawSteam = function (scene, dt) {
    var gl = this.gl, S = scene.steam, m = this._m;
    var n = Math.min(S.count, this.maxSteam);

    if (!this._puffs || this._puffs.length !== n) {
      this._puffs = [];
      for (var k = 0; k < n; k++) {
        this._puffs.push({ t: k / n, x: 0, y: 0, z: 0, seed: Math.random(), rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.4 });
      }
      this._first = true;
    }

    var d = this.spriteData, drift = [0, 0, 0];
    var life = S.life || 2.6;
    var steps = this._first ? Math.ceil(life / 0.05) : 1;   /* prime it, so nothing pops in */
    var stepDt = this._first ? 0.05 : dt;
    this._first = false;

    for (var pass = 0; pass < steps; pass++) {
      for (var i = 0; i < n; i++) {
        var q = this._puffs[i];
        q.t += stepDt / life;
        if (q.t >= 1) {
          q.t -= Math.floor(q.t);
          var a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * S.radius;
          q.x = Math.cos(a) * r; q.y = 0; q.z = Math.sin(a) * r;
          q.seed = Math.random();
        }
        M.curl(drift, q.x * 1.7 + this.time * 0.18, q.y * 1.7, q.z * 1.7, 0.4);
        q.x += drift[0] * stepDt * 0.30;
        q.z += drift[2] * stepDt * 0.30;
        q.y += (S.rise || 0.5) * stepDt * (0.65 + q.seed * 0.5);
        q.rot += q.spin * stepDt;
      }
    }

    for (i = 0; i < n; i++) {
      var pu = this._puffs[i];
      var t = pu.t;
      /* in fast, out slow — steam appears at the surface and takes
         its time to give up */
      var fade = M.smoothstep(0, 0.12, t) * (1 - M.smoothstep(0.30, 1, t));
      var o = i * 8;
      d[o] = S.origin[0] + pu.x;
      d[o + 1] = S.origin[1] + pu.y;
      d[o + 2] = S.origin[2] + pu.z;
      d[o + 3] = (S.size || 0.32) * (0.42 + t * 1.5);
      d[o + 4] = fade * (S.amount === undefined ? 1 : S.amount) * (0.5 + pu.seed * 0.7);
      d[o + 5] = pu.rot;
      d[o + 6] = pu.seed;
      d[o + 7] = 0.55;
    }
    this.spriteMesh.uploadInstances(d, n * 8);

    /* the sprite plane faces the camera: right and up taken out of
       the view matrix rather than recomputed */
    var right = [m.view[0], m.view[4], m.view[8]];
    var up = [m.view[1], m.view[5], m.view[9]];

    /* into the scene's colour buffer, through a framebuffer that
       does not have the depth texture attached — see GL.colorOnly */
    this.mainNoDepth.bind();
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    var p = this.pSprite.use();
    p.m4('uViewProj', m.viewProj).v3('uRight', right).v3('uUp', up)
     .tex('uDepth', this.T.main.depth, 0)
     .v3('uTint', S.tint).v3('uLit', S.lit)
     .f('uTime', this.time).f('uNear', scene.camera.near).f('uFar', scene.camera.far)
     .f('uSoft', S.soft || 0.30).v2('uRes', this.w, this.h);
    this.spriteMesh.drawInstanced(n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
  };

  /* ── a still ─────────────────────────────────────────────────
     The composite already lands in an 8-bit target rather than
     straight on the canvas, so a thumbnail is a readPixels away
     and no stage has to ask for a preserved drawing buffer to get
     one. Used once per dish, at idle, to fill the index. */
  Stage.prototype.snapshot = function (into) {
    var gl = this.gl, w = this.w, h = this.h;
    var px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.T.out.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var src = document.createElement('canvas');
    src.width = w; src.height = h;
    var sctx = src.getContext('2d');
    var img = sctx.createImageData(w, h);
    /* GL's origin is bottom-left and a canvas's is top-left */
    for (var y = 0; y < h; y++) {
      var s = (h - 1 - y) * w * 4, dd = y * w * 4;
      for (var x = 0; x < w * 4; x++) img.data[dd + x] = px[s + x];
    }
    sctx.putImageData(img, 0, 0);

    var g2 = into.getContext('2d');
    g2.clearRect(0, 0, into.width, into.height);
    g2.drawImage(src, 0, 0, into.width, into.height);
  };

  /* ── frame timing ────────────────────────────────────────────
     The render scale follows measured cost, not a device string.
     A phone that turns out to be fast keeps its pixels; a laptop
     throttling on battery gives some back. Moves are small and
     rate-limited, because a resolution that hunts is worse than
     one that is slightly too low. */
  Stage.prototype.measure = function (ms) {
    this._acc += ms; this._samples++;
    if (this._samples < 45) return;
    var avg = this._acc / this._samples;
    this._acc = 0; this._samples = 0;
    this.frameMs = avg;
    var want = this.scale;
    if (avg > 15.5) want = this.scale * 0.90;
    else if (avg < 7.5) want = this.scale * 1.06;
    want = M.clamp(want, 0.62, Math.min(this.tier.maxScale, global.devicePixelRatio || 1));
    if (Math.abs(want - this.scale) > 0.03) {
      this.scale = want;
      if (this.cssW) this.resize(this.cssW, this.cssH);
    }
  };

  SHRIM.Stage = Stage;
  SHRIM.lin = lin;
  SHRIM.hex = hex;

})(window);
