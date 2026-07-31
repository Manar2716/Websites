/* ═══════════════════════════════════════════════════════════
   geometry.js — every object in the film, generated at runtime.

   There is no downloaded model, no texture file and no photograph
   anywhere in this project. A shrimp is a cross-section swept
   along a curled spine, a lobster claw is two swept forms that
   meet on a toothed bite line, corn is a cylinder with kernels
   placed on a phyllotaxis spiral, and the bucket is a revolved
   profile.

   The one idea that pays for itself over and over is `sweep`:
   hand it a path through space and a cross-section that may
   change along that path, and it gives you shrimp, crab legs,
   claws, andouille and herb stems out of one generator. What
   separates them is fifteen lines of profile each, not fifteen
   hundred lines of mesh.

   Everything here runs once, at boot, off the frame loop.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  var M = SHRIMP.M;
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
     below only has to produce positions — which matters here,
     because half of them are deformed after the fact. */
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
  Builder.prototype.finish = function () {
    this.computeNormals();
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
     fn(u, v, out) with u,v in 0..1. `wrapU` closes the seam by
     handing the last column the first column's parameter, so the
     two sides land on exactly the same floats and the normal
     solve treats them as one edge. */

  function parametric(fn, nu, nv, wrapU) {
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
    /* Winding matters and it is easy to get backwards. (a, c, e, d)
       puts the face normal on the outside; the mirror of it culls
       the near wall of every object instead of the far one, which
       on a closed convex form looks like nothing is wrong at all. */
    var row = nu + 1;
    for (j = 0; j < nv; j++) {
      for (i = 0; i < nu; i++) {
        var a = j * row + i, c = a + 1, d = a + row, e = d + 1;
        b.quad(a, c, e, d);
      }
    }
    return b;
  }

  /* ── sweep ───────────────────────────────────────────────────
     A closed cross-section carried along a path.

       path(t, o)        writes the spine point at t
       shape(t, u, o2)   writes the cross-section offset at (t, u)
                         in the frame's right/up axes

     The frame is built from the path tangent and a fixed world up
     rather than by parallel transport. Every path in this file is
     a gentle arc with no inflection and no vertical run, so the
     stable-but-approximate frame is the right trade: a Frenet
     frame flips its normal through an inflection point and puts a
     180° twist in the middle of a shrimp.

     `caps` closes both ends with a fan; forms that end in a fan or
     a separate part leave it open. */

  function sweep(path, shape, segsU, segsV, caps) {
    var b = new Builder();
    var p = [0, 0, 0], pa = [0, 0, 0], pb = [0, 0, 0], o2 = [0, 0];
    var tan = [0, 0, 0], right = [0, 0, 0], up = [0, 0, 0];
    var WORLD_UP = [0, 0, 1];
    var i, j;
    var row = segsU + 1;
    var h = 0.5 / segsV;

    for (j = 0; j <= segsV; j++) {
      var t = j / segsV;
      path(t, p);
      path(Math.max(0, t - h), pa);
      path(Math.min(1, t + h), pb);

      tan[0] = pb[0] - pa[0]; tan[1] = pb[1] - pa[1]; tan[2] = pb[2] - pa[2];
      var tl = Math.hypot(tan[0], tan[1], tan[2]) || 1;
      tan[0] /= tl; tan[1] /= tl; tan[2] /= tl;

      /* right = tangent × up, then up = right × tangent, so the two
         come out orthonormal even when the caller's up is not */
      right[0] = tan[1] * WORLD_UP[2] - tan[2] * WORLD_UP[1];
      right[1] = tan[2] * WORLD_UP[0] - tan[0] * WORLD_UP[2];
      right[2] = tan[0] * WORLD_UP[1] - tan[1] * WORLD_UP[0];
      var rl = Math.hypot(right[0], right[1], right[2]) || 1;
      right[0] /= rl; right[1] /= rl; right[2] /= rl;

      up[0] = right[1] * tan[2] - right[2] * tan[1];
      up[1] = right[2] * tan[0] - right[0] * tan[2];
      up[2] = right[0] * tan[1] - right[1] * tan[0];

      for (i = 0; i <= segsU; i++) {
        var u = i === segsU ? 0 : i / segsU;
        shape(t, u, o2);
        b.vertex(
          p[0] + right[0] * o2[0] + up[0] * o2[1],
          p[1] + right[1] * o2[0] + up[1] * o2[1],
          p[2] + right[2] * o2[0] + up[2] * o2[1],
          i / segsU, t
        );
      }
    }

    for (j = 0; j < segsV; j++) {
      for (i = 0; i < segsU; i++) {
        var a = j * row + i, c = a + 1, d = a + row, e = d + 1;
        b.quad(a, c, e, d);
      }
    }

    if (caps) {
      path(0, p);
      var c0 = b.vertex(p[0], p[1], p[2], .5, 0);
      for (i = 0; i < segsU; i++) b.tri(c0, i, i + 1);
      path(1, p);
      var c1 = b.vertex(p[0], p[1], p[2], .5, 1);
      var base = segsV * row;
      for (i = 0; i < segsU; i++) b.tri(c1, base + i + 1, base + i);
    }
    return b;
  }

  /* ── lathe ───────────────────────────────────────────────────
     profile: [[radius, height], …] bottom to top. */

  function lathe(profile, segments) {
    var b = new Builder();
    var rows = profile.length;
    var i, j;
    for (j = 0; j < rows; j++) {
      for (i = 0; i <= segments; i++) {
        var t = i / segments, a = t * TAU;
        var r = profile[j][0], h = profile[j][1];
        b.vertex(Math.cos(a) * r, h, Math.sin(a) * r, t, j / (rows - 1));
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

  function sphere(r, nu, nv) {
    return parametric(function (u, v, o) {
      var th = u * TAU, ph = v * Math.PI;
      o[0] = Math.sin(ph) * Math.cos(th) * r;
      o[1] = Math.cos(ph) * r;
      o[2] = Math.sin(ph) * Math.sin(th) * r;
    }, nu, nv, true);
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

  /* ── the ocean grid ──────────────────────────────────────────
     A polar disc, re-centred on the camera every frame by the
     vertex shader. Rings are graded by a power so roughly half
     the triangles land inside the first ten metres — where the
     swell is actually resolved — and the outer ring is far enough
     out to sit in the fog rather than end in a visible edge.

     A regular square grid was the first attempt. Its diagonals
     alias into moiré across the wave field at grazing angles,
     which is exactly the angle this camera spends the film at. */

  function oceanGrid(rings, spokes, maxRadius) {
    var b = new Builder();
    b.vertex(0, 0, 0, .5, .5);
    var i, j;
    for (j = 1; j <= rings; j++) {
      var r = Math.pow(j / rings, 2.85) * maxRadius;
      for (i = 0; i < spokes; i++) {
        var a = (i / spokes) * TAU;
        b.vertex(Math.cos(a) * r, 0, Math.sin(a) * r, i / spokes, j / rings);
      }
    }
    for (i = 0; i < spokes; i++) {
      b.tri(0, 1 + i, 1 + ((i + 1) % spokes));
    }
    for (j = 0; j < rings - 1; j++) {
      var o0 = 1 + j * spokes, o1 = o0 + spokes;
      for (i = 0; i < spokes; i++) {
        var n = (i + 1) % spokes;
        b.quad(o0 + i, o1 + i, o1 + n, o0 + n);
      }
    }
    return b;
  }

  /* Superellipsoid — a box with the corners eased off. Hard 90°
     edges read as untextured geometry; a small radius catches a
     highlight line and reads as a made object. */
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

  /* A droplet: a sphere pulled into a teardrop tail, so a frozen
     splash particle has its direction of travel in its shape. */
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

  /* ═══ the shrimp ═════════════════════════════════════════════
     The hero object, and the one that had to be right.

     What reads as "shrimp" at a glance is three things in order of
     importance: the C-curl, the six overlapping shell plates, and
     the fanned tail. Colour and gloss come later and cannot rescue
     a body that has none of the three.

     The curl is in the path. The plates are a sawtooth on the
     radius in t — each segment swells to a trailing lip and then
     steps back in, so the shell overlaps the one behind it and
     every seam catches its own highlight. The abdomen is not
     round: it is taller than it is wide and has a flat-ish back,
     which is what puts the long specular down the spine.

     The head is fatter, blunter and rolls under; the legs are
     suggested by a fringe on the belly rather than modelled,
     because at the scale this is ever seen, modelled legs read as
     noise and cost 40× the triangles. */

  var SHRIMP_SEGMENTS = 6;

  function shrimpPath(t, o) {
    /* Sweep around most of a circle: head at the top, tail curling
       back up toward it. 2.42 rad is the curl of a shrimp that has
       been in the boil — a raw one is nearly straight, and straight
       does not read as food. */
    var a = -0.30 + t * 2.42;
    var r = 1.00 - t * 0.06;
    o[0] = Math.sin(a) * r;
    o[1] = -Math.cos(a) * r;
    /* a little out-of-plane lean so the form is never a flat
       silhouette no matter which side the camera is on */
    o[2] = Math.sin(t * Math.PI) * 0.09;
  }

  function shrimpShape(t, u, o) {
    var th = u * TAU;

    /* thickness along the body: thick through the head and first
       two segments, then a long taper to the tail joint */
    var girth =
      0.30 * Math.pow(1 - t, 0.42) *
      (1 + 0.45 * Math.exp(-Math.pow((t - 0.14) / 0.20, 2)));

    /* segment plates — sawtooth that swells to a lip at the back
       edge of each plate and drops on the seam */
    var seg = t * SHRIMP_SEGMENTS;
    var f = seg - Math.floor(seg);
    var plate = 1 + 0.115 * Math.pow(f, 1.7) - 0.075 * Math.exp(-Math.pow(f / 0.10, 2));
    /* the head is one smooth shell, not plated */
    plate = M.lerp(1, plate, M.smoothstep(0.10, 0.26, t));

    /* cross-section: taller than wide, with the back flattened and
       the belly rounded. cos(th)=+1 is the back. */
    var back = Math.cos(th);
    var wide = 0.86 - 0.10 * Math.max(0, back);
    var tall = 1.14;

    var r = girth * plate;
    o[0] = Math.sin(th) * r * wide;
    o[1] = back * r * tall;

    /* belly fringe — the swimmerets, as a soft ripple rather than
       geometry, on the underside only */
    var belly = Math.max(0, -back);
    o[1] -= Math.pow(belly, 3) * (0.030 + 0.020 * Math.sin(t * 46)) * M.smoothstep(0.18, 0.34, t);
  }

  /* The direction the body is travelling at either end, so the
     head and the fan can be attached *along* the spine. Building
     them in world axes and hoping is what turns a tail fan into a
     pinwheel: the blades splay around +X while the body ends
     pointing somewhere else entirely, and the three of them close
     up into a cone. */
  function shrimpEndAngle(t, sgn) {
    var a = [0, 0, 0], b = [0, 0, 0];
    shrimpPath(M.clamp(t - 0.02, 0, 1), a);
    shrimpPath(M.clamp(t + 0.02, 0, 1), b);
    return Math.atan2((b[1] - a[1]) * sgn, (b[0] - a[0]) * sgn);
  }

  function shrimp(nu, nv) {
    var b = sweep(shrimpPath, shrimpShape, nu, nv, false);
    var p = [0, 0, 0];

    /* ── the head ────────────────────────────────────────────
       A tapered dome that carries on in the direction the body
       came from, with a short rostrum on the top edge. A plain
       sphere here reads as a thumb stuck on the front. */
    shrimpPath(0, p);
    var headAng = shrimpEndAngle(0, -1);
    var head = parametric(function (u, v, o) {
      var th = u * TAU, ph = v * Math.PI * 0.5;
      var sp = Math.sin(ph), cp = Math.cos(ph);
      /* the profile: full girth at the joint, tapering to a blunt
         snout, with the carapace ridge standing proud on top */
      var r = 0.335 * Math.pow(cp, 0.62);
      var back = Math.cos(th);
      o[0] = sp * 0.46;
      o[1] = back * r * 1.16 + Math.pow(Math.max(back, 0), 6) * sp * 0.055;
      o[2] = Math.sin(th) * r * 0.86;
    }, nu, 12, true);
    head.rotateZ(headAng);
    head.translate(p[0], p[1], p[2]);
    b.merge(head);

    /* ── the tail fan ────────────────────────────────────────
       Five blades — the telson down the middle and two uropods
       either side — splayed in the plane of the curl, which is
       the plane the fan is seen edge-on to only if you are
       looking at the shrimp end-on. Each blade is a shallow
       trough with a rib, and the outer ones are shorter. */
    shrimpPath(1, p);
    var tailAng = shrimpEndAngle(1, 1);
    for (var k = -2; k <= 2; k++) {
      var out = Math.abs(k) / 2;
      var len = 0.62 * (1 - out * 0.26);
      var blade = parametric(function (u, v, o) {
        var wdt = Math.sin(Math.pow(v, 0.80) * Math.PI * 0.92) * 0.105;
        var side = (u < 0.5 ? 1 : -1);
        var uu = u < 0.5 ? u * 2 : (1 - u) * 2;
        o[0] = v * len;
        o[1] = side * uu * wdt;
        /* the blade is a trough, thickest on its own axis, and
           it thins to a translucent edge — which is what the
           translucency term in the material then lights up */
        o[2] = Math.cos(uu * Math.PI * 0.5) * 0.020 * (1 - v * 0.62);
      }, 10, 9, true);
      blade.rotateZ(k * 0.30);            /* the splay */
      blade.rotateX(k * 0.16);            /* and a little cup */
      blade.rotateZ(tailAng);
      blade.translate(p[0], p[1], p[2]);
      b.merge(blade);
    }

    /* Centre the whole animal on its own bounding box. Instances
       are placed and spun by the timeline, and an object whose
       origin sits off in space orbits instead of turning. */
    return centred(b);
  }

  function centred(b) {
    var p = b.pos, i;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (i = 0; i < p.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        if (p[i + k] < lo[k]) lo[k] = p[i + k];
        if (p[i + k] > hi[k]) hi[k] = p[i + k];
      }
    }
    b.translate(-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -(lo[2] + hi[2]) / 2);
    return b;
  }

  /* ═══ crab leg ═══════════════════════════════════════════════
     A snow crab leg is a gently bent tube with three knuckles and
     a flat facet running its length — that facet is the whole
     read, because it is what makes a leg look like an exoskeleton
     rather than a sausage. Ends in a point. */

  function crabLeg(nu, nv) {
    var b = sweep(
      function (t, o) {
        o[0] = t * 3.05;
        o[1] = -Math.sin(t * 2.05) * 0.42 + Math.sin(t * 6.1) * 0.03;
        o[2] = Math.sin(t * 1.2) * 0.10;
      },
      function (t, u, o) {
        var th = u * TAU;
        var r = 0.175 * (1 - Math.pow(t, 1.9) * 0.80);
        /* knuckles: three swellings with a tight collar in front */
        var kn = 0;
        var joints = [0.30, 0.58, 0.83];
        for (var i = 0; i < 3; i++) {
          var d = (t - joints[i]);
          kn += Math.exp(-Math.pow(d / 0.035, 2)) * 0.055;
          kn -= Math.exp(-Math.pow((d + 0.055) / 0.026, 2)) * 0.030;
        }
        r += kn;
        /* the flat: press the +Y side toward the axis and let the
           two shoulders of it stand slightly proud */
        var flat = Math.max(0, Math.cos(th));
        var rr = r * (1 - Math.pow(flat, 2.6) * 0.22);
        o[0] = Math.sin(th) * rr;
        o[1] = Math.cos(th) * rr;
      },
      nu, nv, true
    );
    return centred(b);
  }

  /* ═══ lobster claw ═══════════════════════════════════════════
     Two forms that have to meet on one line or the whole thing
     falls apart: the palm (heavy, bulged, carrying the pivot) and
     the dactyl (the moving finger). They share a bite line, and
     the teeth are a ripple applied to both sides of it in
     opposite phase, so they interlock rather than intersect.

     `open` in 0..1 swings the dactyl. The timeline animates it,
     which is why the claw is built per-open-value rather than
     once — there are three of them on screen and the geometry is
     cheap. */

  function lobsterClaw(open, nu, nv) {
    var b = new Builder();
    var gap = open * 0.46;

    /* Palm — heavy at the heel, drawn forward into the fingers,
       and flattened side to side. The lateral flattening is the
       read: a claw is a pair of shears, and a palm that is as deep
       as it is tall comes out as a balloon with sticks in it. */
    var palm = parametric(function (u, v, o) {
      var th = u * TAU, ph = v * Math.PI;
      var sp = Math.sin(ph);
      /* mass sits behind the middle, then tapers to the joint */
      var swell = 1 + 0.34 * Math.exp(-Math.pow((v - 0.56) / 0.26, 2));
      var front = M.smoothstep(0.30, 0.02, v);
      o[0] = Math.cos(ph) * 0.98;
      o[1] = sp * Math.cos(th) * 0.66 * swell * (1 - front * 0.42);
      o[2] = sp * Math.sin(th) * 0.29 * swell * (1 - front * 0.30);
      /* the heel tapers into the arm */
      var heel = M.smoothstep(0.84, 1, v);
      o[1] *= 1 - heel * 0.58; o[2] *= 1 - heel * 0.58;
    }, nu, nv, true);
    b.merge(palm);

    /* The fixed finger, growing off the *front* of the palm.

       The palm's poles are at x = ±0.98, and the profile above
       narrows the +x end into the joint and tapers the -x end
       into the arm. Both fingers therefore have to leave from
       +x. Hanging them off -x instead — which is what the first
       version did — grows them out of the wrist, and the whole
       thing reads as a balloon with two sticks behind it. */
    var fixed = sweep(
      function (t, o) {
        o[0] = 0.86 + t * 1.02;
        o[1] = -0.10 - t * 0.16 + t * t * 0.08;
        o[2] = 0;
      },
      function (t, u, o) {
        var th = u * TAU;
        var r = 0.27 * (1 - Math.pow(t, 1.5) * 0.88);
        /* teeth on the bite side (+Y) */
        var bite = Math.max(0, Math.cos(th));
        r += Math.pow(bite, 3) * Math.sin(t * 26) * 0.030 * (1 - t * 0.4);
        o[0] = Math.sin(th) * r * 0.72;
        o[1] = Math.cos(th) * r;
      },
      nu, 22, true
    );
    b.merge(fixed);

    /* the dactyl, hinged at the palm and swung by `open` */
    var dact = sweep(
      function (t, o) {
        o[0] = 0.80 + t * 0.96;
        o[1] = 0.16 + t * 0.10 - t * t * 0.06;
        o[2] = 0;
      },
      function (t, u, o) {
        var th = u * TAU;
        var r = 0.26 * (1 - Math.pow(t, 1.5) * 0.88);
        var bite = Math.max(0, -Math.cos(th));
        /* opposite phase to the fixed finger, so they mesh */
        r += Math.pow(bite, 3) * Math.sin(t * 26 + Math.PI) * 0.030 * (1 - t * 0.4);
        o[0] = Math.sin(th) * r * 0.72;
        o[1] = Math.cos(th) * r;
      },
      nu, 22, true
    );
    /* rotate about the hinge, not the origin */
    dact.translate(-0.80, -0.16, 0);
    dact.rotateZ(gap);
    dact.translate(0.80, 0.16, 0);
    b.merge(dact);

    return centred(b);
  }

  /* ═══ mussel ═════════════════════════════════════════════════
     A bivalve, opened a crack. The growth rings are what make it
     read as shell rather than a pebble — concentric ridges from
     the hinge, tightening as they go out. */

  function mussel(nu, nv) {
    var b = new Builder();
    for (var s = 0; s < 2; s++) {
      var sign = s ? -1 : 1;
      var half = parametric(function (u, v, o) {
        /* v: hinge → lip. u: across the shell. */
        var wdt = Math.sin(Math.pow(v, 0.72) * Math.PI * 0.95);
        var x = (u - 0.5) * 2;
        var len = v * 1.60 - 0.55;
        var across = x * wdt * 0.52;

        /* the dome, with growth rings on it */
        var dome = Math.sqrt(Math.max(0, 1 - x * x)) * wdt;
        var rings = Math.sin(Math.pow(v, 0.8) * 44) * 0.012 * v;
        var lift = dome * (0.34 + rings);

        o[0] = len;
        o[1] = across;
        o[2] = sign * (lift + 0.012);
      }, nu, nv, false);
      /* crack it open about the hinge */
      half.translate(0.55, 0, 0);
      half.rotateY(sign * 0.14);
      half.translate(-0.55, 0, 0);
      b.merge(half);
    }
    return centred(b);
  }

  /* ═══ corn ═══════════════════════════════════════════════════
     Kernels in staggered rows.

     The first version put them on a golden spiral, on the theory
     that phyllotaxis is what plants do. It is — but not this
     plant. Corn grows its kernels in an even number of straight
     paired rows, and the spiral came out as diagonal ridges with
     no discrete kernels at all, because the angular and axial
     spacings on a 137.5° spiral differ by two orders of magnitude
     and the nearest-point metric collapses onto one axis.

     Sixteen rows, twenty kernels each, alternate rows offset by
     half a kernel. The distance to a kernel centre is measured in
     *surface* units — arc length around, length along — so the
     kernels come out round instead of stretched, and the falloff
     reaches zero at a definite radius so neighbours meet at a
     groove rather than merging into a shrink-wrapped tube. */

  var CORN_ROWS = 16, CORN_PER_ROW = 20, CORN_LEN = 2.35, CORN_R = 0.50;

  function corn(nu, nv) {
    return centred(parametric(function (u, v, o) {
      var th = u * TAU;
      var taper = Math.pow(Math.sin(Math.pow(v, 0.85) * Math.PI), 0.30);
      var r = CORN_R * taper;

      /* nearest row, and the angular offset to its centre */
      var ra = u * CORN_ROWS;
      var ri = Math.round(ra);
      var da = (ra - ri) / CORN_ROWS * TAU;

      /* alternate rows are offset half a kernel along the cob */
      var stagger = (((ri % 2) + 2) % 2) ? 0.5 : 0;
      var rv = v * CORN_PER_ROW - stagger;
      var dv = (rv - Math.round(rv)) / CORN_PER_ROW;

      /* measured on the surface, not in parameter space */
      var dx = da * CORN_R / 0.112;
      var dy = dv * CORN_LEN / 0.072;
      var d = Math.sqrt(dx * dx + dy * dy);
      var bump = d >= 1 ? 0 : Math.pow(Math.cos(d * Math.PI * 0.5), 0.48) * 0.078;
      r += bump * taper;

      o[0] = Math.cos(th) * r;
      o[1] = (v - 0.5) * CORN_LEN;
      o[2] = Math.sin(th) * r;
    }, nu, nv, true));
  }

  /* ═══ lemon wedge ════════════════════════════════════════════
     A sixth of a lemon: rind on the curved back, and on the two
     cut faces the segment walls radiating from the centre. The
     cut face is the only place in this film where a surface is
     allowed to be nearly flat, and the segment ridges are what
     keep it from looking like a card. */

  function lemonWedge(nu, nv) {
    var b = new Builder();
    var SWEEP = TAU / 6;

    var body = parametric(function (u, v, o) {
      var a = -SWEEP / 2 + u * SWEEP;
      var ph = v * Math.PI;
      var r = Math.sin(ph) * 0.92;
      /* the lemon's nipples at both poles */
      r += Math.pow(Math.max(0, Math.abs(Math.cos(ph)) - 0.86) / 0.14, 2) * 0.10 * Math.sin(ph);
      o[0] = Math.cos(a) * r;
      o[1] = Math.cos(ph) * 1.16;
      o[2] = Math.sin(a) * r;
    }, nu, nv, false);
    b.merge(body);

    /* the two cut faces */
    for (var s = 0; s < 2; s++) {
      var sign = s ? 1 : -1;
      var face = parametric(function (u, v, o) {
        var ph = v * Math.PI;
        var rMax = Math.sin(ph) * 0.92;
        var r = u * rMax;
        var a = sign * SWEEP / 2;
        /* segments: eight walls across the face, and the pith ring */
        var pulp = M.smoothstep(0.0, 0.10, u) * (1 - M.smoothstep(0.80, 0.96, u));
        var ridge = Math.sin(u * 30) * 0.006 * pulp;
        var depth = -sign * (pulp * 0.020 + ridge);
        o[0] = Math.cos(a) * r - Math.sin(a) * depth;
        o[1] = Math.cos(ph) * 1.16;
        o[2] = Math.sin(a) * r + Math.cos(a) * depth;
      }, 14, nv, false);
      b.merge(face);
    }
    return centred(b);
  }

  /* ═══ garlic clove ═══════════════════════════════════════════
     A teardrop with one flat face and a crease where it sat
     against its neighbour, and a papery tip. Small, but it flies
     straight at the lens in act seven and gets a close look. */

  function garlic(nu, nv) {
    return centred(parametric(function (u, v, o) {
      var th = u * TAU, ph = v * Math.PI;
      var sp = Math.sin(ph);
      /* fat at the root, drawn to a point at the tip */
      var taper = Math.pow(M.sat(1 - v), 0.55);
      var r = sp * (0.30 + 0.42 * taper);
      var x = Math.cos(th) * r;
      var z = Math.sin(th) * r * 0.80;
      /* the flat face where it met the next clove */
      if (z > 0) z *= 0.62;
      var faceness = Math.max(0, Math.sin(th));
      z -= Math.exp(-(x * x) / 0.030) * faceness * sp * 0.14;
      o[0] = x;
      o[1] = Math.cos(ph) * 0.92 - 0.10;
      o[2] = z;
    }, nu, nv, true));
  }

  /* ═══ andouille ══════════════════════════════════════════════
     A curved capsule with the twist mark at each end. Cajun boils
     do not happen without it. */

  function sausage(nu, nv) {
    return centred(sweep(
      function (t, o) {
        o[0] = (t - 0.5) * 2.30;
        o[1] = Math.sin(t * Math.PI) * 0.16;
        o[2] = 0;
      },
      function (t, u, o) {
        var th = u * TAU;
        var end = Math.pow(Math.sin(M.sat(t) * Math.PI), 0.28);
        var r = 0.34 * end;
        r *= 1 - Math.exp(-Math.pow((t - 0.06) / 0.03, 2)) * 0.35;
        r *= 1 - Math.exp(-Math.pow((t - 0.94) / 0.03, 2)) * 0.35;
        o[0] = Math.sin(th) * r;
        o[1] = Math.cos(th) * r;
      },
      nu, nv, true
    ));
  }

  /* ═══ potato ═════════════════════════════════════════════════
     A lumpy ellipsoid. Low-frequency noise for the lumps, a few
     shallow eyes, and that is the whole object. */

  function potato(nu, nv, seed) {
    var rnd = M.rng(seed || 7);
    var ph1 = rnd() * TAU, ph2 = rnd() * TAU, ph3 = rnd() * TAU;
    return centred(parametric(function (u, v, o) {
      var th = u * TAU, phi = v * Math.PI;
      var sp = Math.sin(phi);
      var lump =
        Math.sin(th * 2 + ph1) * Math.sin(phi * 2.4 + ph2) * 0.070 +
        Math.sin(th * 3.4 + ph2) * Math.sin(phi * 1.7 + ph3) * 0.045;
      var eye = -Math.exp(-Math.pow((Math.cos(th - ph3) - 0.7) / 0.16, 2)) *
                 Math.exp(-Math.pow((phi - 1.5) / 0.35, 2)) * 0.055;
      var r = 0.82 + lump + eye;
      o[0] = sp * Math.cos(th) * r * 1.16;
      o[1] = Math.cos(phi) * r * 0.86;
      o[2] = sp * Math.sin(th) * r;
    }, nu, nv, true));
  }

  /* ═══ herb sprig ═════════════════════════════════════════════
     A stem with paired leaves. Drawn double-sided by the material,
     since a leaf has no thickness worth spending triangles on. */

  function herb(nu, nv) {
    var b = new Builder();
    var stem = sweep(
      function (t, o) { o[0] = t * 1.5; o[1] = Math.sin(t * 1.6) * 0.14; o[2] = 0; },
      function (t, u, o) {
        var th = u * TAU, r = 0.022 * (1 - t * 0.5);
        o[0] = Math.sin(th) * r; o[1] = Math.cos(th) * r;
      }, 6, 10, true
    );
    b.merge(stem);

    /* Three pairs of broad leaves, not five pairs of narrow ones.
       Narrow leaves at this scale come out as a row of spikes down
       a stem — the shape reads as a caterpillar rather than as a
       herb, and no amount of shading fixes a silhouette. */
    for (var i = 0; i < 3; i++) {
      var t = 0.22 + i * 0.27;
      for (var s = -1; s <= 1; s += 2) {
        var leaf = parametric(function (u, v, o) {
          /* a broad oval, widest a third of the way out, folded
             along the midrib and drooping at the tip */
          var w = Math.sin(Math.pow(v, 0.48) * Math.PI) * 0.34 * (1 - v * 0.15);
          var x = (u - 0.5) * 2;
          o[0] = v * 0.62;
          o[1] = x * w;
          o[2] = -Math.abs(x) * w * 0.22 + (1 - Math.abs(x)) * 0.03 - v * v * 0.10;
        }, 9, 9, false);
        leaf.rotateX(s * 0.34);
        leaf.rotateZ(0.30);
        leaf.rotateY(s * 0.85);
        leaf.translate(t * 1.5, Math.sin(t * 1.6) * 0.14, 0);
        b.merge(leaf);
      }
    }
    return centred(b);
  }

  /* ═══ the bucket ═════════════════════════════════════════════
     A galvanised pail: tapered wall, rolled rim, a pressed rib
     round the belly, and a real interior. The camera goes over the
     rim in act five and has to find a wall on the inside, so this
     is shelled rather than being a single surface with the normals
     flipped. */

  function bucketProfile(scale) {
    var s = scale || 1;
    var outer = [
      [0.000, 0.00], [0.560, 0.00], [0.585, 0.012], [0.590, 0.040],
      [0.610, 0.130], [0.640, 0.300], [0.652, 0.400], [0.640, 0.430],
      [0.639, 0.470], [0.652, 0.500], [0.690, 0.700], [0.730, 0.900],
      [0.756, 1.030], [0.762, 1.070]
    ];
    var rim = [
      [0.762, 1.070], [0.790, 1.086], [0.792, 1.108], [0.770, 1.120], [0.744, 1.110]
    ];
    var inner = [
      [0.744, 1.110], [0.736, 1.030], [0.708, 0.900], [0.668, 0.700],
      [0.630, 0.500], [0.618, 0.400], [0.588, 0.230], [0.566, 0.090],
      [0.520, 0.052], [0.300, 0.046], [0.000, 0.044]
    ];
    var pts = [], i;
    for (i = 0; i < outer.length; i++) pts.push([outer[i][0] * s, outer[i][1] * s]);
    for (i = 1; i < rim.length; i++) pts.push([rim[i][0] * s, rim[i][1] * s]);
    for (i = 1; i < inner.length; i++) pts.push([inner[i][0] * s, inner[i][1] * s]);
    return pts;
  }

  function bucket(segments) {
    return lathe(bucketProfile(1), segments || 64);
  }

  /* The handle: a flattened bar bent over the pail, ending in the
     two ears riveted to the rim. */
  function bucketHandle(nu, nv) {
    return sweep(
      function (t, o) {
        var a = Math.PI * t;
        o[0] = -Math.cos(a) * 0.80;
        o[1] = 1.02 + Math.sin(a) * 0.62;
        o[2] = 0;
      },
      function (t, u, o) {
        var th = u * TAU;
        var r = 0.030 + Math.sin(t * Math.PI) * 0.008;
        o[0] = Math.sin(th) * r * 0.45;   /* flat bar, not round rod */
        o[1] = Math.cos(th) * r;
      },
      nu || 8, nv || 40, true
    );
  }

  /* ═══ service ware ═══════════════════════════════════════════
     Four vessels, all revolves, all sharing the same idea: the
     lip is where the light lands, so every profile below spends
     most of its points in the last few millimetres of the rim and
     coasts through the middle. A plate modelled with evenly
     spaced profile points has a rim you cannot see. */

  function plate(segments) {
    return lathe([
      [0.000, 0.000], [1.35, 0.000], [1.52, 0.010], [1.66, 0.040],
      [1.80, 0.092], [1.90, 0.150], [1.955, 0.196], [1.975, 0.222],
      [1.960, 0.236], [1.900, 0.206], [1.800, 0.140], [1.640, 0.078],
      [1.460, 0.046], [1.200, 0.034], [0.000, 0.030]
    ], segments || 64);
  }

  function bowl(segments) {
    return lathe([
      [0.000, 0.000], [0.520, 0.000], [0.600, 0.020], [0.640, 0.060],
      [0.760, 0.200], [0.940, 0.420], [1.100, 0.640], [1.210, 0.820],
      [1.262, 0.930], [1.278, 0.966], [1.262, 0.984], [1.210, 0.960],
      [1.120, 0.840], [0.980, 0.630], [0.820, 0.400], [0.700, 0.210],
      [0.620, 0.110], [0.560, 0.075], [0.300, 0.062], [0.000, 0.058]
    ], segments || 64);
  }

  /* The tagine: a shallow dish and the cone that sits on it. The
     cone is lifted at the table, so both halves are real. */
  function tagineBase(segments) {
    return lathe([
      [0.000, 0.000], [0.900, 0.000], [1.020, 0.020], [1.080, 0.070],
      [1.230, 0.230], [1.330, 0.360], [1.372, 0.430], [1.386, 0.462],
      [1.368, 0.478], [1.320, 0.440], [1.220, 0.310], [1.070, 0.150],
      [0.980, 0.098], [0.860, 0.078], [0.000, 0.072]
    ], segments || 56);
  }

  function tagineCone(segments) {
    return lathe([
      [1.360, 0.000], [1.372, 0.030], [1.330, 0.060], [1.240, 0.130],
      [1.080, 0.330], [0.900, 0.560], [0.700, 0.800], [0.500, 1.010],
      [0.320, 1.170], [0.180, 1.270], [0.110, 1.330], [0.130, 1.395],
      [0.175, 1.450], [0.190, 1.510], [0.150, 1.560], [0.075, 1.585],
      [0.000, 1.590]
    ], segments || 56);
  }

  /* ═══ salmon fillet ═══════════════════════════════════════════
     A wedge with a domed back, thick at the head end and drawn to
     a thin tail. The flakes are shallow chevrons across the top —
     without them a fillet is an orange doorstop. */

  function salmonFillet(nu, nv) {
    return centred(parametric(function (u, v, o) {
      /* v: head → tail. u: around the section. */
      var wid = (0.62 - v * 0.30) * Math.pow(Math.sin(Math.pow(v, 0.55) * Math.PI * 0.96), 0.32);
      var hgt = (0.32 - v * 0.19);
      var th = u * TAU;
      var c = Math.cos(th), s = Math.sin(th);

      /* the back is domed and the skin side is flat */
      var y = c * hgt;
      if (y < 0) y *= 0.28;

      /* flakes: chevrons that only exist on the flesh side */
      var flesh = Math.max(0, c);
      var flake = Math.sin(v * 34 + Math.abs(s) * 4.5) * 0.011 * Math.pow(flesh, 1.6);

      o[0] = s * (wid + flake);
      o[1] = y + flake * 1.4;
      o[2] = (v - 0.5) * 2.5;
    }, nu, nv, true));
  }

  /* ═══ pasta nest ══════════════════════════════════════════════
     A torus with a strand field cut into it. Modelling individual
     strands is the obvious approach and it is wrong at this
     scale: forty tubes is forty thousand triangles for something
     the camera never gets closer than half a metre to, and the
     strands read as a scribble. A ridged torus reads as a nest
     for a fiftieth of the cost. */

  function pastaNest(nu, nv) {
    return centred(parametric(function (u, v, o) {
      var a = u * TAU, b = v * TAU;
      var R = 0.86, r = 0.34;
      /* strands wind around the ring: the ridge phase advances
         with both parameters, which is what makes them spiral
         rather than stripe */
      var strand = Math.sin(b * 9 + a * 5.5) * 0.055 +
                   Math.sin(b * 15 - a * 3.1) * 0.028;
      var rr = r + strand;
      /* flattened, because a nest sits in a bowl */
      o[0] = (R + rr * Math.cos(b)) * Math.cos(a);
      o[1] = rr * Math.sin(b) * 0.62;
      o[2] = (R + rr * Math.cos(b)) * Math.sin(a);
    }, nu, nv, true));
  }

  /* A flat disc for a liquid surface — sauce, stock, or the
     gratin under a grill. Domed very slightly, because a real
     surface in a bowl has a meniscus and a perfectly flat one
     reads as a lid. */
  function liquidDisc(r, segs, dome) {
    var b = new Builder();
    var c = b.vertex(0, dome || 0.02, 0, .5, .5);
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * TAU;
      b.vertex(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(a) * .5 + .5, Math.sin(a) * .5 + .5);
    }
    for (var j = 0; j < segs; j++) b.tri(c, j + 2, j + 1);
    return b;
  }

  /* ── point sampling ──────────────────────────────────────────
     Uniform over surface area, so a form can be *dissolved into*
     particles and reassembled from them. Area-weighted, or every
     dense pole on a sphere gets a clump. */

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

  SHRIMP.Geo = {
    Builder: Builder,
    parametric: parametric,
    sweep: sweep,
    lathe: lathe,
    sphere: sphere,
    cylinder: cylinder,
    plane: plane,
    oceanGrid: oceanGrid,
    roundedBox: roundedBox,
    droplet: droplet,
    centred: centred,

    shrimp: shrimp,
    crabLeg: crabLeg,
    lobsterClaw: lobsterClaw,
    mussel: mussel,
    corn: corn,
    lemonWedge: lemonWedge,
    garlic: garlic,
    sausage: sausage,
    potato: potato,
    herb: herb,
    bucket: bucket,
    bucketHandle: bucketHandle,
    bucketProfile: bucketProfile,

    plate: plate,
    bowl: bowl,
    tagineBase: tagineBase,
    tagineCone: tagineCone,
    salmonFillet: salmonFillet,
    pastaNest: pastaNest,
    liquidDisc: liquidDisc,

    samplePoints: samplePoints
  };

})(window);
