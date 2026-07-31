/* ═══════════════════════════════════════════════════════════
   gl.js — the thin layer over WebGL2.

   Programs, meshes, instance buffers, render targets, and a
   fullscreen triangle. No abstraction beyond what the film
   actually uses; nothing here is general-purpose for its own
   sake.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  var GL = (PEET.GL = {});

  /* ── context ─────────────────────────────────────────────── */

  GL.context = function (canvas, overrides) {
    var opts = {
      alpha: false,
      antialias: false,          /* we resolve edges in post, not with MSAA */
      depth: true,
      stencil: false,
      premultipliedAlpha: false,
      /* The film draws straight to the screen every frame and never
         reads a pixel back, so it does not pay for a preserved
         buffer. Anything that renders in order to *copy the result
         out* has to ask for one: a canvas that is not in the
         document is never composited, and without this the
         readback returns whatever was in the buffer the first time
         it was asked — which renders thirty-four different
         products and blits the same picture thirty-four times. */
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    };
    if (overrides) for (var k in overrides) opts[k] = overrides[k];
    var gl = canvas.getContext('webgl2', opts);
    if (!gl) return null;

    /* Half-float colour targets are what let the film hold real
       highlight range — a 300-nit crema specular on a near-black
       ground clips instantly in 8-bit. If the extension is
       missing we fall back to 8-bit targets and a flatter grade
       rather than refusing to run. */
    var hdr = !!gl.getExtension('EXT_color_buffer_half_float') ||
              !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    var linear16 = !!gl.getExtension('OES_texture_half_float_linear') || hdr;

    return { gl: gl, hdr: hdr, linear16: linear16 };
  };

  /* ── shaders ─────────────────────────────────────────────── */

  function compile(gl, type, src, label) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      var lines = src.split('\n');
      var m = /ERROR:\s*\d+:(\d+)/.exec(log || '');
      var near = m ? lines.slice(Math.max(0, m[1] - 4), (+m[1]) + 3).join('\n') : '';
      gl.deleteShader(sh);
      throw new Error('[' + label + '] ' + log + '\n' + near);
    }
    return sh;
  }

  /* A program plus a lazily-filled uniform location cache. Setting
     a uniform that the compiler optimised away is a no-op rather
     than a crash, which keeps material code honest but tolerant. */
  GL.program = function (gl, vsSrc, fsSrc, label) {
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + ':vert');
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + ':frag');
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error('[' + label + ':link] ' + log);
    }

    var cache = Object.create(null);
    function loc(name) {
      var l = cache[name];
      if (l === undefined) { l = gl.getUniformLocation(p, name); cache[name] = l; }
      return l;
    }

    var api = {
      handle: p,
      use: function () { gl.useProgram(p); return api; },
      loc: loc,
      f: function (n, v) { var l = loc(n); if (l) gl.uniform1f(l, v); return api; },
      i: function (n, v) { var l = loc(n); if (l) gl.uniform1i(l, v); return api; },
      v2: function (n, x, y) { var l = loc(n); if (l) gl.uniform2f(l, x, y); return api; },
      v3: function (n, x, y, z) {
        var l = loc(n); if (!l) return api;
        if (y === undefined) gl.uniform3f(l, x[0], x[1], x[2]); else gl.uniform3f(l, x, y, z);
        return api;
      },
      v4: function (n, x, y, z, w) { var l = loc(n); if (l) gl.uniform4f(l, x, y, z, w); return api; },
      m3: function (n, m) { var l = loc(n); if (l) gl.uniformMatrix3fv(l, false, m); return api; },
      m4: function (n, m) { var l = loc(n); if (l) gl.uniformMatrix4fv(l, false, m); return api; },
      tex: function (n, texture, unit) {
        var l = loc(n); if (!l) return api;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(l, unit);
        return api;
      }
    };
    return api;
  };

  /* ── meshes ──────────────────────────────────────────────────
     A mesh owns its VAO. Instanced meshes get a second, dynamic
     buffer that the body system rewrites every frame. */

  GL.mesh = function (gl, geo) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.STATIC_DRAW);

    /* interleaved: position(3) normal(3) uv(2) = 8 floats */
    var stride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);

    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.index, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    var m = {
      vao: vao,
      count: geo.index.length,
      type: geo.index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      instanceBuffer: null,
      instanceStride: 0,

      draw: function () {
        gl.bindVertexArray(vao);
        gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
      },

      drawInstanced: function (n) {
        if (n <= 0) return;
        gl.bindVertexArray(vao);
        gl.drawElementsInstanced(gl.TRIANGLES, m.count, m.type, 0, n);
      },

      /* attrs: [{loc, size, offset}] measured in floats */
      addInstanceAttribs: function (floatsPerInstance, maxInstances, attrs) {
        gl.bindVertexArray(vao);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, floatsPerInstance * maxInstances * 4, gl.DYNAMIC_DRAW);
        var st = floatsPerInstance * 4;
        for (var i = 0; i < attrs.length; i++) {
          var a = attrs[i];
          gl.enableVertexAttribArray(a.loc);
          gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, st, a.offset * 4);
          gl.vertexAttribDivisor(a.loc, 1);
        }
        gl.bindVertexArray(null);
        m.instanceBuffer = buf;
        m.instanceStride = floatsPerInstance;
        return m;
      },

      uploadInstances: function (data, floatCount) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floatCount);
      }
    };
    return m;
  };

  /* ── render targets ──────────────────────────────────────── */

  GL.target = function (gl, w, h, opt) {
    opt = opt || {};
    var half = opt.half !== false;
    var fmt = half ? gl.RGBA16F : gl.RGBA8;
    var type = half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    var color = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, type, null);
    var filt = opt.nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);

    var depth = null;
    if (opt.depth) {
      /* sampled as a texture, not a renderbuffer — the steam pass
         needs scene depth to know what it is drifting behind */
      depth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depth);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
      fbo: fbo, color: color, depth: depth, w: w, h: h,
      bind: function () {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, w, h);
      },
      dispose: function () {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(color);
        if (depth) gl.deleteTexture(depth);
      }
    };
  };

  /* Depth-only target for the shadow map. */
  GL.shadowTarget = function (gl, size) {
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    var depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      fbo: fbo, depth: depth, size: size,
      bind: function () {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, size, size);
      }
    };
  };

  /* ── a texture from a 2D canvas (used for typography) ────── */

  GL.canvasTexture = function (gl, canvas) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  /* ── fullscreen triangle ─────────────────────────────────────
     One oversized triangle rather than two triangles: no seam
     down the diagonal, one fewer vertex, and the rasteriser gets
     a single primitive to chew on for every post pass. */

  GL.fullscreen = function (gl) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return {
      draw: function () {
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  };

})(window);
