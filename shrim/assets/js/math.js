/* ═══════════════════════════════════════════════════════════
   math.js — vectors, matrices, quaternions, easing, springs.

   Everything here is allocation-free where it matters. The frame
   loop touches these functions a few hundred thousand times per
   second, so nothing in the hot paths returns a fresh array; you
   pass an output vector in and it gets written.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = (global.SHRIM = global.SHRIM || {});

  /* ── scalars ─────────────────────────────────────────────── */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sat(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* remap into 0..1 across [a,b], clamped. The workhorse of every
     staged move on the page: a dish's deconstruction, a camera
     push, a reveal are all a `range` of some driving number. */
  function range(x, a, b) { return sat((x - a) / (b - a || 1e-6)); }

  function smoothstep(e0, e1, x) { var t = range(x, e0, e1); return t * t * (3 - 2 * t); }
  function smootherstep(e0, e1, x) { var t = range(x, e0, e1); return t * t * t * (t * (t * 6 - 15) + 10); }

  /* frame-rate independent exponential smoothing — the same feel
     at 60 Hz and at 240 Hz, which a naive lerp does not give you. */
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }

  /* pingpong 0..1..0 — used for anything that swells and settles */
  function arc(t) { return Math.sin(sat(t) * Math.PI); }

  var E = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inOutQuad: function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    inOutQuart: function (t) { return t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },
    outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    inOutQuint: function (t) { return t < .5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; },
    inExpo: function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * t - 10); },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutExpo: function (t) {
      if (t <= 0) return 0; if (t >= 1) return 1;
      return t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    outSine: function (t) { return Math.sin(t * Math.PI / 2); },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    /* overshoot and settle — weight arriving, not a value changing */
    outBack: function (t) { var c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    /* a soft elastic that never looks like a cartoon bounce */
    outSoftElastic: function (t) {
      if (t <= 0) return 0; if (t >= 1) return 1;
      return 1 - Math.pow(2, -9 * t) * Math.cos(t * 11);
    }
  };

  /* ── deterministic random ────────────────────────────────────
     Everything scattered on a plate — where the chilli flakes
     land, how far each shrimp is turned, the wander in a plume of
     steam — is seeded off the dish, so the same dish plates the
     same way every time you open it. A dish that reshuffles
     itself on reload is not a dish, it is a slot machine. */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── vec3, as plain 3-arrays ─────────────────────────────── */

  var v3 = {
    make: function (x, y, z) { return [x || 0, y || 0, z || 0]; },
    set: function (o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; },
    copy: function (o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
    add: function (o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
    sub: function (o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
    scale: function (o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
    addScaled: function (o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (o, a, b) {
      var x = a[1] * b[2] - a[2] * b[1],
          y = a[2] * b[0] - a[0] * b[2],
          z = a[0] * b[1] - a[1] * b[0];
      o[0] = x; o[1] = y; o[2] = z; return o;
    },
    len: function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); },
    dist: function (a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); },
    norm: function (o, a) {
      var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
      o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
    },
    lerp: function (o, a, b, t) {
      o[0] = a[0] + (b[0] - a[0]) * t;
      o[1] = a[1] + (b[1] - a[1]) * t;
      o[2] = a[2] + (b[2] - a[2]) * t;
      return o;
    },
    damp: function (o, a, b, lambda, dt) {
      var k = 1 - Math.exp(-lambda * dt);
      o[0] = a[0] + (b[0] - a[0]) * k;
      o[1] = a[1] + (b[1] - a[1]) * k;
      o[2] = a[2] + (b[2] - a[2]) * k;
      return o;
    },
    transformM4: function (o, a, m) {
      var x = a[0], y = a[1], z = a[2];
      var w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
      var ox = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
      var oy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      var oz = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
      o[0] = ox; o[1] = oy; o[2] = oz; return o;
    }
  };

  /* ── mat4, column-major (the layout WebGL wants) ─────────── */

  var m4 = {
    make: function () { return new Float32Array(16); },
    identity: function (o) {
      o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
      o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
      return o;
    },
    mul: function (o, a, b) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
          a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
          a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
          a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      for (var i = 0; i < 4; i++) {
        var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        o[i * 4]     = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      }
      return o;
    },
    perspective: function (o, fovY, aspect, near, far) {
      var f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
      o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
      o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
      return o;
    },
    ortho: function (o, l, r, b, t, n, f) {
      var lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
      o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = 2 * nf; o[11] = 0;
      o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
      return o;
    },
    lookAt: function (o, eye, target, up) {
      var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
      var zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
      if (zl < 1e-6) { zz = 1; zl = 1; }
      zx /= zl; zy /= zl; zz /= zl;
      var xx = up[1] * zz - up[2] * zy,
          xy = up[2] * zx - up[0] * zz,
          xz = up[0] * zy - up[1] * zx;
      var xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
      if (xl < 1e-6) { xx = 1; xy = 0; xz = 0; xl = 1; }
      xx /= xl; xy /= xl; xz /= xl;
      var yx = zy * xz - zz * xy,
          yy = zz * xx - zx * xz,
          yz = zx * xy - zy * xx;
      o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
      o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
      o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
      o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      o[15] = 1;
      return o;
    },
    /* position + quaternion + non-uniform scale, in one go */
    compose: function (o, p, q, s) {
      var x = q[0], y = q[1], z = q[2], w = q[3];
      var x2 = x + x, y2 = y + y, z2 = z + z;
      var xx = x * x2, xy = x * y2, xz = x * z2;
      var yy = y * y2, yz = y * z2, zz = z * z2;
      var wx = w * x2, wy = w * y2, wz = w * z2;
      var sx = s[0], sy = s[1], sz = s[2];
      o[0] = (1 - (yy + zz)) * sx; o[1] = (xy + wz) * sx; o[2] = (xz - wy) * sx; o[3] = 0;
      o[4] = (xy - wz) * sy; o[5] = (1 - (xx + zz)) * sy; o[6] = (yz + wx) * sy; o[7] = 0;
      o[8] = (xz + wy) * sz; o[9] = (yz - wx) * sz; o[10] = (1 - (xx + yy)) * sz; o[11] = 0;
      o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1;
      return o;
    },
    invert: function (o, a) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
          a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
          a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
          a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10,
          b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
          b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
          b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
          b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31,
          b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return m4.identity(o);
      det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
    /* inverse-transpose of the upper 3×3, for normals under
       non-uniform scale */
    normalMat3: function (o, m) {
      var a00 = m[0], a01 = m[1], a02 = m[2],
          a10 = m[4], a11 = m[5], a12 = m[6],
          a20 = m[8], a21 = m[9], a22 = m[10];
      var b01 = a22 * a11 - a12 * a21,
          b11 = -a22 * a10 + a12 * a20,
          b21 = a21 * a10 - a11 * a20;
      var det = a00 * b01 + a01 * b11 + a02 * b21;
      if (!det) { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0; o[7] = 0; o[8] = 1; return o; }
      det = 1 / det;
      o[0] = b01 * det;
      o[1] = (-a22 * a01 + a02 * a21) * det;
      o[2] = (a12 * a01 - a02 * a11) * det;
      o[3] = b11 * det;
      o[4] = (a22 * a00 - a02 * a20) * det;
      o[5] = (-a12 * a00 + a02 * a10) * det;
      o[6] = b21 * det;
      o[7] = (-a21 * a00 + a01 * a20) * det;
      o[8] = (a11 * a00 - a01 * a10) * det;
      return o;
    }
  };

  /* ── quaternions ─────────────────────────────────────────── */

  var quat = {
    make: function () { return [0, 0, 0, 1]; },
    identity: function (o) { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; },
    fromAxisAngle: function (o, ax, ay, az, rad) {
      var h = rad * .5, s = Math.sin(h);
      o[0] = ax * s; o[1] = ay * s; o[2] = az * s; o[3] = Math.cos(h);
      return o;
    },
    fromEuler: function (o, x, y, z) {
      var c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
      var s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
      o[0] = s1 * c2 * c3 + c1 * s2 * s3;
      o[1] = c1 * s2 * c3 - s1 * c2 * s3;
      o[2] = c1 * c2 * s3 + s1 * s2 * c3;
      o[3] = c1 * c2 * c3 - s1 * s2 * s3;
      return o;
    },
    mul: function (o, a, b) {
      var ax = a[0], ay = a[1], az = a[2], aw = a[3];
      var bx = b[0], by = b[1], bz = b[2], bw = b[3];
      o[0] = ax * bw + aw * bx + ay * bz - az * by;
      o[1] = ay * bw + aw * by + az * bx - ax * bz;
      o[2] = az * bw + aw * bz + ax * by - ay * bx;
      o[3] = aw * bw - ax * bx - ay * by - az * bz;
      return o;
    },
    norm: function (o, a) {
      var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]) || 1;
      o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l; return o;
    },
    slerp: function (o, a, b, t) {
      var ax = a[0], ay = a[1], az = a[2], aw = a[3];
      var bx = b[0], by = b[1], bz = b[2], bw = b[3];
      var cos = ax * bx + ay * by + az * bz + aw * bw;
      if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
      var s0, s1;
      if (1 - cos > 1e-6) {
        var om = Math.acos(cos), sin = Math.sin(om);
        s0 = Math.sin((1 - t) * om) / sin;
        s1 = Math.sin(t * om) / sin;
      } else { s0 = 1 - t; s1 = t; }
      o[0] = s0 * ax + s1 * bx;
      o[1] = s0 * ay + s1 * by;
      o[2] = s0 * az + s1 * bz;
      o[3] = s0 * aw + s1 * bw;
      return o;
    }
  };

  /* ── noise ───────────────────────────────────────────────────
     3D value noise + fbm, matched to the GLSL implementation in
     shaders.js so CPU-side drift and GPU-side steam agree about
     which way the air over the pass is moving. */

  function hash3(x, y, z) {
    var n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function noise3(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = x - ix, fy = y - iy, fz = z - iz;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    var n000 = hash3(ix, iy, iz), n100 = hash3(ix + 1, iy, iz);
    var n010 = hash3(ix, iy + 1, iz), n110 = hash3(ix + 1, iy + 1, iz);
    var n001 = hash3(ix, iy, iz + 1), n101 = hash3(ix + 1, iy, iz + 1);
    var n011 = hash3(ix, iy + 1, iz + 1), n111 = hash3(ix + 1, iy + 1, iz + 1);
    var x00 = lerp(n000, n100, ux), x10 = lerp(n010, n110, ux);
    var x01 = lerp(n001, n101, ux), x11 = lerp(n011, n111, ux);
    return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz) * 2 - 1;
  }

  function fbm3(x, y, z, oct) {
    var a = .5, f = 1, s = 0;
    for (var i = 0; i < (oct || 3); i++) {
      s += a * noise3(x * f, y * f, z * f);
      f *= 2.02; a *= .5;
    }
    return s;
  }

  /* Divergence-free drift. One octave only: this runs per body per
     frame, and the extra octaves cost more than they read on
     screen at these speeds. */
  function curl(o, x, y, z, e) {
    e = e || .35;
    var n1 = noise3(x, y + e, z), n2 = noise3(x, y - e, z);
    var n3 = noise3(x, y, z + e), n4 = noise3(x, y, z - e);
    var n5 = noise3(x + e, y, z), n6 = noise3(x - e, y, z);
    o[0] = (n3 - n4) - (n1 - n2);
    o[1] = (n5 - n6) - (n3 - n4);
    o[2] = (n1 - n2) - (n5 - n6);
    return o;
  }

  /* ── spring ──────────────────────────────────────────────────
     A real second-order spring, not an ease. A prawn lifted off a
     plate with one of these carries momentum into the top of its
     arc and settles, which is the whole difference between
     "animated" and "weighs something". The springs used for food
     are tuned just under critical damping — food does not bounce,
     and anything that overshoots more than a few per cent stops
     reading as food and starts reading as a cartoon. */
  function springStep(cur, vel, target, stiffness, damping, dt) {
    var a = (target - cur) * stiffness - vel * damping;
    vel += a * dt;
    cur += vel * dt;
    return [cur, vel];
  }

  /* Vector form, writing back into the arrays it is handed. */
  function springV3(pos, vel, target, stiffness, damping, dt, i) {
    for (var k = 0; k < 3; k++) {
      var a = (target[k] - pos[i + k]) * stiffness - vel[i + k] * damping;
      vel[i + k] += a * dt;
      pos[i + k] += vel[i + k] * dt;
    }
  }

  /* ── catmull-rom through sparse keys ─────────────────────────
     Camera moves and the spine of a prawn are both authored as a
     handful of points; this is what makes what runs between them
     a curve instead of a dogleg. */
  function spline(o, pts, t) {
    var n = pts.length;
    if (n === 0) return v3.set(o, 0, 0, 0);
    if (n === 1) return v3.copy(o, pts[0]);
    var u = sat(t) * (n - 1);
    var i = Math.min(Math.floor(u), n - 2);
    var f = u - i;
    var p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    var f2 = f * f, f3 = f2 * f;
    for (var k = 0; k < 3; k++) {
      o[k] = 0.5 * (
        (2 * p1[k]) +
        (-p0[k] + p2[k]) * f +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3
      );
    }
    return o;
  }

  SHRIM.M = {
    clamp: clamp, sat: sat, lerp: lerp, range: range,
    smoothstep: smoothstep, smootherstep: smootherstep,
    damp: damp, arc: arc, E: E, rng: mulberry,
    v3: v3, m4: m4, quat: quat,
    noise3: noise3, fbm3: fbm3, curl: curl,
    springStep: springStep, springV3: springV3, spline: spline,
    TAU: Math.PI * 2, PI: Math.PI
  };

})(window);
