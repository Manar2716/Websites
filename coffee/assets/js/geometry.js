/* ═══════════════════════════════════════════════════════════
   geometry.js — every object in the film, generated at runtime.

   There is not a single downloaded model or texture in this
   project. A bean is a deformed parametric surface, a cup is a
   profile revolved and shelled, the espresso machine is a few
   dozen boxes and cylinders welded together. Vectors stay sharp
   at any resolution, weigh nothing, and can be sampled for
   points — which is what lets beans *assemble into* the cup
   rather than cross-fade with it.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var NOC = (global.NOC = global.NOC || {});
  var M = NOC.M;
  var TAU = Math.PI * 2;

  /* ── builder ─────────────────────────────────────────────── */

  function Builder() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
  }

  Builder.prototype.vertex = function (x, y, z, u, v) {
    this.pos.push(x, y, z);
    this.nrm.push(0, 0, 0);
    this.uv.push(u || 0, v || 0);
    return (this.pos.length / 3) - 1;
  };

  Builder.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); return this; };

  Builder.prototype.quad = function (a, b, c, d) { this.idx.push(a, b, c, a, c, d); return this; };

  /* Area-weighted face normals accumulated per vertex. Doing it
     numerically rather than analytically means every generator
     below only has to produce positions. */
  Builder.prototype.computeNormals = function () {
    var p = this.pos, n = this.nrm, ix = this.idx;
    for (var i = 0; i < n.length; i++) n[i] = 0;
    for (var t = 0; t < ix.length; t += 3) {
      var a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      var ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2];
      var bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2];
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (var v = 0; v < n.length; v += 3) {
      var l = Math.sqrt(n[v] * n[v] + n[v + 1] * n[v + 1] + n[v + 2] * n[v + 2]) || 1;
      n[v] /= l; n[v + 1] /= l; n[v + 2] /= l;
    }
    return this;
  };

  Builder.prototype.transform = function (m) {
    var p = this.pos;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2];
      p[i]     = m[0] * x + m[4] * y + m[8] * z + m[12];
      p[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      p[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    return this;
  };

  Builder.prototype.translate = function (x, y, z) {
    var p = this.pos;
    for (var i = 0; i < p.length; i += 3) { p[i] += x; p[i + 1] += y; p[i + 2] += z; }
    return this;
  };

  Builder.prototype.scale = function (sx, sy, sz) {
    if (sy === undefined) { sy = sx; sz = sx; }
    var p = this.pos;
    for (var i = 0; i < p.length; i += 3) { p[i] *= sx; p[i + 1] *= sy; p[i + 2] *= sz; }
    return this;
  };

  Builder.prototype.rotateY = function (a) {
    var c = Math.cos(a), s = Math.sin(a), p = this.pos;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], z = p[i + 2];
      p[i] = c * x + s * z; p[i + 2] = -s * x + c * z;
    }
    return this;
  };

  Builder.prototype.rotateX = function (a) {
    var c = Math.cos(a), s = Math.sin(a), p = this.pos;
    for (var i = 0; i < p.length; i += 3) {
      var y = p[i + 1], z = p[i + 2];
      p[i + 1] = c * y - s * z; p[i + 2] = s * y + c * z;
    }
    return this;
  };

  Builder.prototype.rotateZ = function (a) {
    var c = Math.cos(a), s = Math.sin(a), p = this.pos;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1];
      p[i] = c * x - s * y; p[i + 1] = s * x + c * y;
    }
    return this;
  };

  Builder.prototype.merge = function (other) {
    var off = this.pos.length / 3;
    var i;
    for (i = 0; i < other.pos.length; i++) this.pos.push(other.pos[i]);
    for (i = 0; i < other.uv.length; i++) this.uv.push(other.uv[i]);
    for (i = 0; i < other.nrm.length; i++) this.nrm.push(0);
    for (i = 0; i < other.idx.length; i++) this.idx.push(other.idx[i] + off);
    return this;
  };

  /* Interleave into the one buffer layout the renderer knows:
     position(3) normal(3) uv(2). */
  Builder.prototype.finish = function (skipNormals) {
    if (!skipNormals) this.computeNormals();
    var n = this.pos.length / 3;
    var verts = new Float32Array(n * 8);
    for (var i = 0; i < n; i++) {
      verts[i * 8]     = this.pos[i * 3];
      verts[i * 8 + 1] = this.pos[i * 3 + 1];
      verts[i * 8 + 2] = this.pos[i * 3 + 2];
      verts[i * 8 + 3] = this.nrm[i * 3];
      verts[i * 8 + 4] = this.nrm[i * 3 + 1];
      verts[i * 8 + 5] = this.nrm[i * 3 + 2];
      verts[i * 8 + 6] = this.uv[i * 2];
      verts[i * 8 + 7] = this.uv[i * 2 + 1];
    }
    var index = n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    return { verts: verts, index: index, vertexCount: n, triCount: index.length / 3 };
  };

  /* ── generic parametric grid ─────────────────────────────────
     fn(u, v, out) with u,v in 0..1. Wrap closes the u seam. */

  function parametric(fn, nu, nv, wrapU, capless) {
    var b = new Builder();
    var out = [0, 0, 0];
    var i, j;
    for (j = 0; j <= nv; j++) {
      for (i = 0; i <= nu; i++) {
        var u = i / nu, v = j / nv;
        fn(wrapU && i === nu ? 0 : u, v, out);
        b.vertex(out[0], out[1], out[2], u, v);
      }
    }
    /* Winding matters, and it is easy to get backwards here. With
       (a, d, e, c) the face normal comes out pointing *into* the
       surface: back-face culling then keeps the far wall of every
       object instead of the near one, and computeNormals — which
       reads winding — inverts with it. On a sphere the two errors
       cancel exactly and nothing looks wrong, which is why this
       survived until a flat disc (the coffee surface) vanished. */
    var row = nu + 1;
    for (j = 0; j < nv; j++) {
      for (i = 0; i < nu; i++) {
        var a = j * row + i, c = a + 1, d = a + row, e = d + 1;
        b.quad(a, c, e, d);
      }
    }
    return b;
  }

  /* ── the bean ────────────────────────────────────────────────
     An ellipsoid, flattened on one face, with the crease cut down
     the middle of that face — and the crease walls pinched so the
     groove catches a specular line instead of reading as a dent.
     Slight per-bean asymmetry comes from the instance data, not
     from the mesh; every bean shares this one buffer. */

  function bean(nu, nv) {
    return parametric(function (u, v, o) {
      var phi = v * Math.PI;           /* along the bean */
      var th = u * TAU;                /* around it */
      var sv = Math.sin(phi);

      var x = Math.cos(phi) * 1.22;    /* long axis */
      var y = sv * Math.cos(th) * 0.80;
      var z = sv * Math.sin(th) * 0.62;

      /* the flat face is +z; squash it toward the centre plane */
      if (z > 0) z *= 0.70;

      /* crease: a gaussian valley along the bean's length, only on
         the flat face, tapering out before the tips so it doesn't
         slice the ends open */
      var faceness = Math.max(0, Math.sin(th));
      var endFade = Math.pow(sv, 0.55);
      var groove = Math.exp(-(y * y) / 0.026) * faceness * endFade;
      z -= groove * 0.44;

      /* the lips either side of the crease sit slightly proud */
      var lip = Math.exp(-Math.pow(Math.abs(y) - 0.20, 2) / 0.012) * faceness * endFade;
      z += lip * 0.045;

      /* the whole bean is a touch bananaed, as real ones are */
      z += Math.pow(Math.abs(x) / 1.16, 2) * 0.05;

      o[0] = x; o[1] = y; o[2] = z;
    }, nu, nv, true);
  }

  /* ── lathe ───────────────────────────────────────────────────
     profile: [[radius, height], …] bottom to top. */

  function lathe(profile, segments, uvScale) {
    var b = new Builder();
    var rows = profile.length;
    var i, j;
    for (j = 0; j < rows; j++) {
      for (i = 0; i <= segments; i++) {
        var t = i / segments, a = t * TAU;
        var r = profile[j][0], h = profile[j][1];
        b.vertex(Math.cos(a) * r, h, Math.sin(a) * r, t * (uvScale || 1), j / (rows - 1));
      }
    }
    var row = segments + 1;
    for (j = 0; j < rows - 1; j++) {
      for (i = 0; i < segments; i++) {
        var p = j * row + i;
        b.quad(p, p + row, p + row + 1, p + 1);
      }
    }
    return b;
  }

  /* ── primitives ──────────────────────────────────────────── */

  function box(w, h, d) {
    var b = new Builder();
    var x = w / 2, y = h / 2, z = d / 2;
    var faces = [
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
      [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]],
      [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]],
      [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]],
      [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]],
      [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]]
    ];
    for (var f = 0; f < faces.length; f++) {
      var q = faces[f];
      var i0 = b.vertex(q[0][0], q[0][1], q[0][2], 0, 0);
      b.vertex(q[1][0], q[1][1], q[1][2], 1, 0);
      b.vertex(q[2][0], q[2][1], q[2][2], 1, 1);
      b.vertex(q[3][0], q[3][1], q[3][2], 0, 1);
      b.quad(i0, i0 + 1, i0 + 2, i0 + 3);
    }
    return b;
  }

  /* Superellipsoid — a box with the corners eased off. Every metal
     part of the espresso machine is one of these; hard 90° edges
     read as untextured geometry, a 2 mm radius catches a highlight
     and reads as machined. */
  function roundedBox(w, h, d, round, nu, nv) {
    var e = M.clamp(round, 0.02, 1);
    return parametric(function (u, v, o) {
      var th = u * TAU, ph = v * Math.PI - Math.PI / 2;
      var ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
      function pw(x, p) { return Math.sign(x) * Math.pow(Math.abs(x), p); }
      o[0] = pw(cp, e) * pw(ct, e) * w / 2;
      o[1] = pw(sp, e) * h / 2;
      o[2] = pw(cp, e) * pw(st, e) * d / 2;
    }, nu || 20, nv || 14, true);
  }

  function cylinder(r, h, segs, capped) {
    var b = new Builder();
    var i;
    for (i = 0; i <= segs; i++) {
      var a = (i / segs) * TAU;
      b.vertex(Math.cos(a) * r, -h / 2, Math.sin(a) * r, i / segs, 0);
      b.vertex(Math.cos(a) * r, h / 2, Math.sin(a) * r, i / segs, 1);
    }
    for (i = 0; i < segs; i++) {
      var p = i * 2;
      b.quad(p, p + 1, p + 3, p + 2);
    }
    if (capped !== false) {
      var top = b.vertex(0, h / 2, 0, .5, .5);
      var bot = b.vertex(0, -h / 2, 0, .5, .5);
      for (i = 0; i < segs; i++) {
        b.tri(top, i * 2 + 3, i * 2 + 1);
        b.tri(bot, i * 2, i * 2 + 2);
      }
    }
    return b;
  }

  function disc(r, segs, dome) {
    var b = new Builder();
    var c = b.vertex(0, 0, 0, .5, .5);
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * TAU;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.vertex(x, -(dome || 0), z, (Math.cos(a) * .5 + .5), (Math.sin(a) * .5 + .5));
    }
    /* faces +Y — this is the coffee surface, and it is seen from above */
    for (var j = 0; j < segs; j++) b.tri(c, j + 2, j + 1);
    return b;
  }

  function plane(w, d, nx, nz) {
    var b = new Builder();
    var i, j;
    for (j = 0; j <= nz; j++) for (i = 0; i <= nx; i++) {
      b.vertex((i / nx - .5) * w, 0, (j / nz - .5) * d, i / nx, j / nz);
    }
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
      var p = j * (nx + 1) + i;
      b.quad(p, p + nx + 1, p + nx + 2, p + 1);
    }
    return b;
  }

  /* Torus arc — the cup handle. `sweep` in radians, so a handle is
     a partial torus rather than a closed ring. */
  function torusArc(R, r, sweep, start, nu, nv, squash) {
    return parametric(function (u, v, o) {
      var a = start + u * sweep, b2 = v * TAU;
      var cr = r * (1 + Math.cos(u * Math.PI) * 0.18);   /* thicker mid-handle */
      var x = (R + cr * Math.cos(b2)) * Math.cos(a);
      var y = (R + cr * Math.cos(b2)) * Math.sin(a);
      var z = cr * Math.sin(b2) * (squash || 1);
      o[0] = x; o[1] = y; o[2] = z;
    }, nu, nv, false);
  }

  /* A tube along a vertical axis whose radius follows a profile
     function — the espresso and milk streams. The shader adds the
     twist and wobble at draw time so one buffer serves both. */
  function stream(len, radiusFn, segsU, segsV) {
    return parametric(function (u, v, o) {
      var a = u * TAU;
      var r = radiusFn(v);
      o[0] = Math.cos(a) * r;
      o[1] = -v * len;
      o[2] = Math.sin(a) * r;
    }, segsU, segsV, true);
  }

  function sphere(r, nu, nv) {
    return parametric(function (u, v, o) {
      var th = u * TAU, ph = v * Math.PI;
      o[0] = Math.sin(ph) * Math.cos(th) * r;
      o[1] = Math.cos(ph) * r;
      o[2] = Math.sin(ph) * Math.sin(th) * r;
    }, nu, nv, true);
  }

  /* A droplet: a sphere with a teardrop tail, so frozen splash
     particles have a direction of travel baked into their shape. */
  function droplet(nu, nv) {
    return parametric(function (u, v, o) {
      var th = u * TAU, ph = v * Math.PI;
      var sp = Math.sin(ph);
      var taper = Math.pow(Math.max(0, Math.cos(ph) * .5 + .5), 0.7);
      var r = sp * (0.55 + 0.45 * (1 - taper));
      o[0] = Math.cos(th) * r;
      o[1] = Math.cos(ph) * 1.35;
      o[2] = Math.sin(th) * r;
    }, nu, nv, true);
  }

  /* ── the cup ─────────────────────────────────────────────────
     A shelled revolve: outer wall down, foot, inner wall up, and
     a rounded rim closing the two. The interior is real geometry,
     not a texture — the camera goes over the rim in act five and
     has to find a wall there. */

  function cupProfile(scale) {
    var s = scale || 1;
    var outer = [
      [0.00, 0.000], [0.30, 0.000], [0.42, 0.008], [0.455, 0.030],
      [0.46, 0.055], [0.44, 0.075], [0.435, 0.10], [0.455, 0.16],
      [0.50, 0.26], [0.545, 0.38], [0.575, 0.50], [0.596, 0.60],
      [0.606, 0.66], [0.612, 0.695]
    ];
    var inner = [
      [0.596, 0.700], [0.590, 0.66], [0.572, 0.58], [0.540, 0.44],
      [0.495, 0.30], [0.450, 0.19], [0.420, 0.12], [0.40, 0.095],
      [0.30, 0.088], [0.00, 0.086]
    ];
    var rim = [
      [0.612, 0.695], [0.6165, 0.7015], [0.615, 0.7065], [0.6065, 0.7095], [0.596, 0.700]
    ];
    var pts = [];
    var i;
    for (i = 0; i < outer.length; i++) pts.push([outer[i][0] * s, outer[i][1] * s]);
    for (i = 1; i < rim.length - 1; i++) pts.push([rim[i][0] * s, rim[i][1] * s]);
    for (i = 0; i < inner.length; i++) pts.push([inner[i][0] * s, inner[i][1] * s]);
    return pts;
  }

  /* ── the handle ──────────────────────────────────────────────
     Not a torus arc. A cup tapers, so the two ends of a handle sit
     at different radii, and a circular arc translated out from the
     axis lands one end inside the wall and leaves the other
     floating in the air beside it. This sweeps a flattened tube
     along a cubic whose endpoints are placed *on* the wall, at the
     radius the profile actually has at that height. */

  function handle(radiusAt, yTop, yBot, bulge, tube, flat, nu, nv) {
    var A = [radiusAt(yTop) - 0.035, yTop];
    var B = [radiusAt(yBot) - 0.030, yBot];
    var C1 = [A[0] + bulge, yTop + (yBot - yTop) * 0.12];
    var C2 = [B[0] + bulge * 1.06, yBot - (yBot - yTop) * 0.12];

    function at(t, o) {
      var u = 1 - t;
      o[0] = u * u * u * A[0] + 3 * u * u * t * C1[0] + 3 * u * t * t * C2[0] + t * t * t * B[0];
      o[1] = u * u * u * A[1] + 3 * u * u * t * C1[1] + 3 * u * t * t * C2[1] + t * t * t * B[1];
    }

    var p = [0, 0], q = [0, 0];
    return parametric(function (u, v, o) {
      /* v runs along the handle, u around the section */
      at(v, p);
      at(Math.min(v + 0.004, 1), q);
      var tx = q[0] - p[0], ty = q[1] - p[1];
      var tl = Math.hypot(tx, ty) || 1;
      /* in-plane normal; the out-of-plane axis is simply z */
      var nx = -ty / tl, ny = tx / tl;
      var a = u * TAU;
      /* thicker through the middle, and where the thumb sits */
      var r = tube * (0.72 + 0.46 * Math.sin(Math.PI * Math.pow(v, 0.9)));
      o[0] = p[0] + nx * Math.cos(a) * r;
      o[1] = p[1] + ny * Math.cos(a) * r;
      o[2] = Math.sin(a) * r * flat;
    }, nu, nv, true);
  }

  function cup(scale, segs) {
    var s = scale || 1;
    var prof = cupProfile(1);
    /* outer wall radius at a given height, read off the same
       profile the lathe uses — one source of truth */
    function outerAt(y) {
      var best = 0;
      for (var i = 0; i < 14; i++) {
        if (prof[i][1] <= y) best = prof[i][0];
        else {
          var a = prof[i - 1] || prof[0], b = prof[i];
          var t = (y - a[1]) / ((b[1] - a[1]) || 1e-6);
          return a[0] + (b[0] - a[0]) * t;
        }
      }
      return best;
    }
    var b = lathe(cupProfile(s), segs || 64);
    var h = handle(outerAt, 0.585, 0.215, 0.235, 0.052, 0.66, 20, 30);
    h.scale(s, s, s);
    b.merge(h);
    return b;
  }

  function saucer(scale, segs) {
    var s = scale || 1;
    var profile = [
      [0.00, 0.000], [0.55, 0.000], [0.62, 0.006], [0.64, 0.022],
      [0.66, 0.040], [0.80, 0.055], [1.00, 0.070], [1.12, 0.086],
      [1.155, 0.100], [1.16, 0.112], [1.145, 0.118], [1.10, 0.108],
      [0.95, 0.090], [0.72, 0.070], [0.60, 0.054], [0.56, 0.036],
      [0.50, 0.030], [0.00, 0.028]
    ];
    for (var i = 0; i < profile.length; i++) { profile[i][0] *= s; profile[i][1] *= s; }
    return lathe(profile, segs || 72);
  }

  /* ── surface sampling ────────────────────────────────────────
     Area-weighted random points on a finished mesh. This is the
     hinge of the whole film: the cup, the letterforms and the
     machine are all just point clouds that bodies fly toward, so
     "assembling into" is a real spatial operation rather than a
     dissolve between two renders. */

  function samplePoints(geo, count, seed) {
    var rnd = M.rng(seed || 1);
    var verts = geo.verts, idx = geo.index;
    var tris = idx.length / 3;

    var cdf = new Float64Array(tris);
    var total = 0;
    var i;
    for (i = 0; i < tris; i++) {
      var a = idx[i * 3] * 8, b = idx[i * 3 + 1] * 8, c = idx[i * 3 + 2] * 8;
      var ax = verts[b] - verts[a], ay = verts[b + 1] - verts[a + 1], az = verts[b + 2] - verts[a + 2];
      var bx = verts[c] - verts[a], by = verts[c + 1] - verts[a + 1], bz = verts[c + 2] - verts[a + 2];
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      total += Math.sqrt(nx * nx + ny * ny + nz * nz) * .5;
      cdf[i] = total;
    }

    var pos = new Float32Array(count * 3);
    var nrm = new Float32Array(count * 3);

    for (i = 0; i < count; i++) {
      var target = rnd() * total;
      /* binary search the area CDF */
      var lo = 0, hi = tris - 1, t = 0;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (cdf[mid] < target) lo = mid + 1; else { t = mid; hi = mid - 1; }
      }
      var i0 = idx[t * 3] * 8, i1 = idx[t * 3 + 1] * 8, i2 = idx[t * 3 + 2] * 8;
      var u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      var w = 1 - u - v;
      for (var k = 0; k < 3; k++) {
        pos[i * 3 + k] = verts[i0 + k] * w + verts[i1 + k] * u + verts[i2 + k] * v;
        nrm[i * 3 + k] = verts[i0 + 3 + k] * w + verts[i1 + 3 + k] * u + verts[i2 + 3 + k] * v;
      }
      var l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
      nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
    }
    return { pos: pos, nrm: nrm, count: count };
  }

  NOC.Geo = {
    Builder: Builder,
    parametric: parametric,
    lathe: lathe,
    box: box,
    roundedBox: roundedBox,
    cylinder: cylinder,
    disc: disc,
    plane: plane,
    torusArc: torusArc,
    sphere: sphere,
    handle: handle,
    droplet: droplet,
    stream: stream,
    bean: bean,
    cup: cup,
    cupProfile: cupProfile,
    saucer: saucer,
    samplePoints: samplePoints
  };

})(window);
