/* ═══════════════════════════════════════════════════════════
   stage.js — the renderer.

   Stage knows how to draw a world. It does not know what happens
   in the film. Every frame it is handed one state object and
   draws exactly that, which means the two can be reasoned about
   separately: if the bucket is in the wrong place that is
   film.js, and if the bucket is the wrong material it is here.

   Pass order, once per frame:

     1  shadow depth       one directional light, 3×3 PCF
     2  sky                fullscreen, per-pixel ray direction
     3  ocean              displaced polar grid, moon streak
     4  solids → HDR       singletons, then instanced crowds
     5  steam              raymarched at half res, reads depth
     6  particles          additive billboards, soft against depth
     7  bright → mips      4 down, 4 up — dual filter bloom
     8  moon shafts        radial blur at quarter res
     9  composite          warp, aberration, grade, ACES, grain

   Every target is half-float where the hardware allows it. The
   whole look depends on a wet-shell specular being allowed to sit
   at 40× the value of the black water behind it, and in 8 bits
   that specular and a piece of white paper are the same number.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  var M = SHRIMP.M, GL = SHRIMP.GL, Geo = SHRIMP.Geo, SH = SHRIMP.SH;
  var v3 = M.v3, m4 = M.m4;

  /* ── materials ───────────────────────────────────────────────
     Physical-ish and deliberately restrained. Roughness under
     about 0.05 on anything that is not liquid or glass makes the
     whole frame read as chrome-plated plastic. Translucency is
     the number that separates food from props. */

  var MAT = {
    shell:   { rough: 0.30, metal: 0.00, coat: 0.55, trans: 0.85 },
    claw:    { rough: 0.24, metal: 0.00, coat: 0.70, trans: 0.42 },
    steel:   { rough: 0.47, metal: 0.86, coat: 0.14, trans: 0.00 },
    veg:     { rough: 0.46, metal: 0.00, coat: 0.30, trans: 0.55 },
    citrus:  { rough: 0.38, metal: 0.00, coat: 0.42, trans: 1.25 },
    herb:    { rough: 0.52, metal: 0.00, coat: 0.22, trans: 1.05 },
    liquid:  { rough: 0.045, metal: 0.00, coat: 1.00, trans: 0.90 },
    stone:   { rough: 0.72, metal: 0.00, coat: 0.05, trans: 0.00 }
  };

  var INSTANCE_FLOATS = 16;
  var PARTICLE_FLOATS = 12;

  function create(canvas, opts) {
    opts = opts || {};
    var ctx = GL.context(canvas);
    if (!ctx) return null;
    var gl = ctx.gl;
    var half = ctx.hdr && ctx.linear16;

    var W = 1, H = 1, dpr = 1;
    var scale = opts.renderScale || 1;
    var shadowSize = opts.shadowSize || 1024;

    /* ── programs ────────────────────────────────────────────── */

    var P = {
      obj:      GL.program(gl, SH.objVert(false), SH.objFrag(), 'obj'),
      objInst:  GL.program(gl, SH.objVert(true),  SH.objFrag(), 'objInst'),
      depth:    GL.program(gl, SH.depthVert(false), SH.depthFrag, 'depth'),
      depthInst:GL.program(gl, SH.depthVert(true),  SH.depthFrag, 'depthInst'),
      ocean:    GL.program(gl, SH.oceanVert, SH.oceanFrag, 'ocean'),
      sky:      GL.program(gl, SH.fsVert, SH.skyFrag, 'sky'),
      steam:    GL.program(gl, SH.fsVert, SH.steamFrag, 'steam'),
      part:     GL.program(gl, SH.partVert, SH.partFrag, 'part'),
      bright:   GL.program(gl, SH.fsVert, SH.brightFrag, 'bright'),
      down:     GL.program(gl, SH.fsVert, SH.downFrag, 'down'),
      up:       GL.program(gl, SH.fsVert, SH.upFrag, 'up'),
      shaft:    GL.program(gl, SH.fsVert, SH.shaftFrag, 'shaft'),
      comp:     GL.program(gl, SH.fsVert, SH.compFrag, 'comp'),
      blit:     GL.program(gl, SH.fsVert, SH.head +
                  'in vec2 vUv; uniform sampler2D uTex; out vec4 o;' +
                  'void main(){ o = texture(uTex, vUv); }', 'blit')
    };

    var fs = GL.fullscreen(gl);

    /* ── the ocean mesh ──────────────────────────────────────── */

    var oceanMesh = GL.mesh(gl, Geo.oceanGrid(
      opts.oceanRings || 150, opts.oceanSpokes || 168, 340).finish());

    /* ── the particle quad ───────────────────────────────────────
       One unit quad, instanced. Locations here are its own — the
       particle shader does not share the object shader's layout,
       because a billboard has no normals and no uv worth
       carrying. */

    var partVao = gl.createVertexArray();
    var partBuf, partMax = opts.maxParticles || 6000;
    (function () {
      gl.bindVertexArray(partVao);
      var quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      partBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
      gl.bufferData(gl.ARRAY_BUFFER, PARTICLE_FLOATS * partMax * 4, gl.DYNAMIC_DRAW);
      var st = PARTICLE_FLOATS * 4;
      for (var i = 0; i < 3; i++) {
        gl.enableVertexAttribArray(1 + i);
        gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, st, i * 16);
        gl.vertexAttribDivisor(1 + i, 1);
      }
      gl.bindVertexArray(null);
    })();

    /* ── targets ─────────────────────────────────────────────── */

    var scene = null, sceneColor = null, steamT = null, shaftT = null, tmpT = null;
    var chain = [];
    var shadow = GL.shadowTarget(gl, shadowSize);

    function disposeTargets() {
      if (sceneColor) sceneColor.dispose();
      if (scene) scene.dispose();
      if (steamT) steamT.dispose();
      if (shaftT) shaftT.dispose();
      if (tmpT) tmpT.dispose();
      for (var i = 0; i < chain.length; i++) chain[i].dispose();
      chain = [];
    }

    function resize(w, h, ratio) {
      dpr = ratio;
      W = Math.max(2, Math.round(w * ratio * scale));
      H = Math.max(2, Math.round(h * ratio * scale));
      /* The backing store is the render size; CSS stretches it to
         the element. This is the one place the two are allowed to
         disagree, and it is how the adaptive scale drops
         resolution without relayout. */
      canvas.width = W;
      canvas.height = H;
      disposeTargets();
      scene = GL.target(gl, W, H, { half: half, depth: true });
      sceneColor = GL.colorOnly(gl, scene.color, W, H);
      steamT = GL.target(gl, Math.max(2, W >> 1), Math.max(2, H >> 1), { half: half });
      shaftT = GL.target(gl, Math.max(2, W >> 2), Math.max(2, H >> 2), { half: half });
      tmpT = GL.target(gl, Math.max(2, W >> 2), Math.max(2, H >> 2), { half: half });
      /* five levels: the bright pass plus four halvings */
      var cw = W, ch = H;
      for (var i = 0; i < 5; i++) {
        cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1);
        chain.push(GL.target(gl, cw, ch, { half: half }));
      }
    }

    /* ── per-frame scratch, allocated once ───────────────────── */

    var view = m4.make(), proj = m4.make(), viewProj = m4.make();
    var invViewProj = m4.make(), model = m4.make(), nrmMat = new Float32Array(9);
    var lightView = m4.make(), lightProj = m4.make(), lightVP = m4.make();
    var eye = [0, 0, 0], target = [0, 0, 0], up = [0, 1, 0];
    var lightEye = [0, 0, 0];
    var camRight = [0, 0, 0], camUp = [0, 0, 0], fwd = [0, 0, 0], tmp3 = [0, 0, 0];
    var NEAR = 0.06, FAR = 420;

    /* ── shared uniform block ────────────────────────────────── */

    function lightUniforms(p, s) {
      p.v3('uMoonDir', s.moon.dir)
       .v3('uMoonColor', s.moon.color)
       .v3('uBoilPos', s.boil.pos)
       .v3('uBoilColor', s.boil.color)
       .f('uBoilPower', s.boil.power)
       .v3('uFogColor', s.fog.color)
       .v3('uDeepColor', s.deep)
       .f('uFogDensity', s.fog.density)
       .v3('uCamera', eye)
       .f('uTime', s.time);
    }

    function material(p, name) {
      var m = MAT[name] || MAT.shell;
      p.f('uRough', m.rough).f('uMetal', m.metal)
       .f('uCoat', m.coat).f('uTranslucency', m.trans);
    }

    /* ── shadow pass ─────────────────────────────────────────────
       One directional light, framed on a focus point the timeline
       hands us rather than on the whole scene. A shadow map fitted
       to a 340 m ocean has no resolution left for a shrimp. */

    function shadowPass(s) {
      var f = s.shadowFocus || s.boil.pos;
      var ext = s.shadowExtent || 4.2;
      v3.addScaled(lightEye, f, s.moon.dir, 16);
      m4.lookAt(lightView, lightEye, f, up);
      m4.ortho(lightProj, -ext, ext, -ext, ext, 0.5, 34);
      m4.mul(lightVP, lightProj, lightView);

      shadow.bind();
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      /* Front-face culling in the depth pass moves the acne onto
         surfaces the camera cannot see, which lets the bias stay
         small enough that contact shadows survive. */
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT);

      var i;
      P.depth.use().m4('uViewProj', lightVP);
      for (i = 0; i < s.bodies.length; i++) {
        var b = s.bodies[i];
        if (b.noShadow || b.hidden) continue;
        m4.compose(model, b.pos, b.quat, b.scale);
        P.depth.m4('uModel', model);
        b.mesh.draw();
      }
      P.depthInst.use().m4('uViewProj', lightVP);
      for (i = 0; i < s.crowds.length; i++) {
        var c = s.crowds[i];
        if (c.noShadow || c.count <= 0) continue;
        c.mesh.uploadInstances(c.data, c.count * INSTANCE_FLOATS);
        c.mesh.drawInstanced(c.count);
      }
      gl.cullFace(gl.BACK);
    }

    /* ── solids ──────────────────────────────────────────────── */

    function solids(s) {
      var i;
      P.obj.use();
      P.obj.m4('uViewProj', viewProj).m4('uLightViewProj', lightVP);
      lightUniforms(P.obj, s);
      P.obj.f('uWaterLine', s.waterLine)
           .f('uShadowStrength', s.shadowStrength)
           .tex('uShadowMap', shadow.depth, 4);

      for (i = 0; i < s.bodies.length; i++) {
        var b = s.bodies[i];
        if (b.hidden) continue;
        m4.compose(model, b.pos, b.quat, b.scale);
        m4.normalMat3(nrmMat, model);
        material(P.obj, b.material);
        P.obj.m4('uModel', model).m3('uNormalMat', nrmMat)
             .v4('uTint', b.tint[0], b.tint[1], b.tint[2], b.matBlend || 0)
             .v4('uExtra', b.wet || 0, b.emissive || 0, b.dissolve || 0, b.seed || 0);
        if (b.twoSided) gl.disable(gl.CULL_FACE);
        b.mesh.draw();
        if (b.twoSided) gl.enable(gl.CULL_FACE);
      }

      P.objInst.use();
      P.objInst.m4('uViewProj', viewProj).m4('uLightViewProj', lightVP);
      lightUniforms(P.objInst, s);
      P.objInst.f('uWaterLine', s.waterLine)
               .f('uShadowStrength', s.shadowStrength)
               .tex('uShadowMap', shadow.depth, 4);

      for (i = 0; i < s.crowds.length; i++) {
        var c = s.crowds[i];
        if (c.count <= 0) continue;
        material(P.objInst, c.material);
        if (c.twoSided) gl.disable(gl.CULL_FACE);
        c.mesh.uploadInstances(c.data, c.count * INSTANCE_FLOATS);
        c.mesh.drawInstanced(c.count);
        if (c.twoSided) gl.enable(gl.CULL_FACE);
      }
    }

    /* ── the frame ───────────────────────────────────────────── */

    function render(s) {
      var cam = s.camera;
      v3.copy(eye, cam.pos);
      v3.copy(target, cam.target);

      /* camera roll, applied to the up vector rather than to the
         matrix, so lookAt stays the only place a basis is built */
      v3.sub(fwd, target, eye); v3.norm(fwd, fwd);
      v3.cross(tmp3, fwd, [0, 1, 0]); v3.norm(tmp3, tmp3);
      v3.cross(camUp, tmp3, fwd);
      var cr = Math.cos(cam.roll || 0), sr = Math.sin(cam.roll || 0);
      up[0] = camUp[0] * cr + tmp3[0] * sr;
      up[1] = camUp[1] * cr + tmp3[1] * sr;
      up[2] = camUp[2] * cr + tmp3[2] * sr;

      m4.lookAt(view, eye, target, up);
      m4.perspective(proj, cam.fov, W / H, NEAR, FAR);
      m4.mul(viewProj, proj, view);
      m4.invert(invViewProj, viewProj);

      /* billboard basis, read straight out of the view matrix */
      camRight[0] = view[0]; camRight[1] = view[4]; camRight[2] = view[8];
      camUp[0] = view[1]; camUp[1] = view[5]; camUp[2] = view[9];

      shadowPass(s);

      /* ── scene ─────────────────────────────────────────────── */
      scene.bind();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      if (s.skyAmount > 0.001) {
        gl.depthMask(false);
        gl.disable(gl.DEPTH_TEST);
        P.sky.use()
          .m4('uInvViewProj', invViewProj)
          .v3('uCamera', eye)
          .v3('uMoonDir', s.moon.dir)
          .v3('uMoonColor', s.moon.color)
          .v3('uFogColor', s.fog.color)
          .v3('uDeepColor', s.deep)
          .f('uMoonSize', s.moon.size)
          .f('uStars', s.stars * s.skyAmount)
          .f('uTime', s.time);
        fs.draw();
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
      }

      if (s.oceanAmount > 0.001) {
        /* The sea is drawn without back-face culling: at a low
           camera the far side of a crest turns away, and culling
           it opens a hole straight through to the sky. */
        gl.disable(gl.CULL_FACE);
        P.ocean.use().m4('uViewProj', viewProj);
        lightUniforms(P.ocean, s);
        P.ocean.f('uAmp', s.oceanAmp)
               .v2('uRippleAt', s.ripple.at[0], s.ripple.at[1])
               .v2('uRipple', s.ripple.age, s.ripple.strength);
        oceanMesh.draw();
        gl.enable(gl.CULL_FACE);
      }

      solids(s);

      /* ── steam, half res, over the scene ───────────────────── */
      if (s.steam.strength > 0.002) {
        steamT.bind();
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        P.steam.use()
          .m4('uInvViewProj', invViewProj)
          .v3('uCamera', eye)
          .v3('uMoonDir', s.moon.dir)
          .v3('uMoonColor', s.moon.color)
          .v3('uBoilColor', s.boil.color)
          .v3('uOrigin', s.steam.origin)
          .f('uTime', s.time)
          .f('uStrength', s.steam.strength)
          .f('uRadius', s.steam.radius)
          .f('uHeight', s.steam.height)
          .v2('uNearFar', NEAR, FAR)
          .tex('uDepth', scene.depth, 0);
        fs.draw();

        scene.bind();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        P.blit.use().tex('uTex', steamT.color, 0);
        fs.draw();
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
      }

      /* ── particles, additive, soft against depth ───────────── */
      if (s.particleCount > 0) {
        /* the colour-only view of the scene target, so sampling
           scene.depth below is a legal read rather than a loop */
        sceneColor.bind();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.disable(gl.DEPTH_TEST);
        var n = Math.min(s.particleCount, partMax);
        gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, s.particles, 0, n * PARTICLE_FLOATS);
        P.part.use()
          .m4('uViewProj', viewProj)
          .m4('uView', view)
          .v3('uRight', camRight)
          .v3('uUp', camUp)
          .v2('uNearFar', NEAR, FAR)
          .v2('uResolution', W, H)
          .tex('uDepth', scene.depth, 0);
        gl.bindVertexArray(partVao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
      }

      /* ── bloom ─────────────────────────────────────────────── */
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);

      chain[0].bind();
      P.bright.use()
        .f('uThreshold', s.post.bloomThreshold)
        .f('uKnee', 0.55)
        .tex('uTex', scene.color, 0);
      fs.draw();

      var i;
      for (i = 1; i < chain.length; i++) {
        chain[i].bind();
        P.down.use()
          .v2('uTexel', 1 / chain[i - 1].w, 1 / chain[i - 1].h)
          .tex('uTex', chain[i - 1].color, 0);
        fs.draw();
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (i = chain.length - 1; i > 0; i--) {
        chain[i - 1].bind();
        P.up.use()
          .v2('uTexel', 1 / chain[i].w, 1 / chain[i].h)
          .f('uScale', 1.15)
          .tex('uTex', chain[i].color, 0);
        fs.draw();
      }
      gl.disable(gl.BLEND);

      /* ── moon shafts ───────────────────────────────────────── */
      if (s.post.shafts > 0.001) {
        /* project the moon: it is a direction, so put it a long
           way off along that direction and transform the point */
        v3.addScaled(tmp3, eye, s.moon.dir, 300);
        var cx = viewProj[0] * tmp3[0] + viewProj[4] * tmp3[1] + viewProj[8] * tmp3[2] + viewProj[12];
        var cy = viewProj[1] * tmp3[0] + viewProj[5] * tmp3[1] + viewProj[9] * tmp3[2] + viewProj[13];
        var cw = viewProj[3] * tmp3[0] + viewProj[7] * tmp3[1] + viewProj[11] * tmp3[2] + viewProj[15];
        var sx = 0.5, sy = 1.4;
        if (cw > 0.0001) { sx = (cx / cw) * 0.5 + 0.5; sy = (cy / cw) * 0.5 + 0.5; }

        tmpT.bind();
        P.blit.use().tex('uTex', chain[1].color, 0);
        fs.draw();

        shaftT.bind();
        P.shaft.use()
          .v2('uSun', sx, sy)
          .f('uDecay', 0.955)
          .f('uWeight', 1.05)
          .f('uDensity', 0.62)
          .tex('uTex', tmpT.color, 0);
        fs.draw();
      }

      /* ── composite ─────────────────────────────────────────── */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      var po = s.post;
      P.comp.use()
        .tex('uScene', scene.color, 0)
        .tex('uBloom', chain[0].color, 1)
        .tex('uShafts', shaftT.color, 2)
        .f('uBloomAmount', po.bloom)
        .f('uShaftAmount', po.shafts)
        .f('uAberration', po.aberration)
        .f('uVignette', po.vignette)
        .f('uGrain', po.grain)
        .f('uExposure', po.exposure)
        .f('uFade', po.fade)
        .f('uWarp', po.warp)
        .v2('uWarpAt', po.warpAt[0], po.warpAt[1])
        .v2('uResolution', W, H)
        .v3('uLift', po.lift)
        .v3('uGain', po.gain)
        .f('uTime', s.time);
      fs.draw();
    }

    /* ── mesh registration ───────────────────────────────────── */

    function mesh(geo) { return GL.mesh(gl, geo); }

    function crowdMesh(geo, maxInstances) {
      var m = GL.mesh(gl, geo);
      m.addInstanceAttribs(INSTANCE_FLOATS, maxInstances, [
        { loc: 3, size: 4, offset: 0 },
        { loc: 4, size: 4, offset: 4 },
        { loc: 5, size: 4, offset: 8 },
        { loc: 6, size: 4, offset: 12 }
      ]);
      return m;
    }

    return {
      gl: gl,
      resize: resize,
      render: render,
      mesh: mesh,
      crowdMesh: crowdMesh,
      INSTANCE_FLOATS: INSTANCE_FLOATS,
      PARTICLE_FLOATS: PARTICLE_FLOATS,
      maxParticles: partMax,
      size: function () { return [W, H]; },
      /* handles for the frame-grab harness; nothing on the page
         calls these */
      __targets: function () {
        return { scene: scene, chain: chain, shafts: shaftT, steam: steamT, half: half };
      }
    };
  }

  SHRIMP.Stage = { create: create, MAT: MAT, INSTANCE_FLOATS: INSTANCE_FLOATS, PARTICLE_FLOATS: PARTICLE_FLOATS };

})(window);
