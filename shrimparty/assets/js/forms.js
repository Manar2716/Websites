/* ═══════════════════════════════════════════════════════════
   forms.js — every object in this project, generated.

   There is no model file here and no photograph anywhere in the
   project. A shrimp is a tube swept along a C-curve with six
   overlapping shell plates cut out of it; a mussel is two
   ellipsoid halves hinged at the back; a bucket is a profile
   revolved. That constraint is not thrift — it is what makes the
   shrimp come apart. If the shell were one welded lump baked
   into a file, the signature interaction on this site would have
   to be a fade. Because the shell is six independent plates that
   happen to be sitting in their assembled positions, taking it
   apart is just letting go of them.

   Two rules everything here follows:

   1.  Nothing is symmetrical unless it has to be. Every builder
       takes a seed, and the seed bends the curve, jitters the
       plate edges, dents the potato and skews the crumb. Two
       shrimp built from the same function look like two shrimp,
       not like one shrimp drawn twice.

   2.  Normals are recomputed from faces at the end rather than
       written by hand, and creases are made by splitting rings.
       Analytic normals on a displaced surface are a bug farm.

   Output is the interleaved layout gl.js wants:
   position(3) normal(3) uv(2).
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var M = SP.M;
  var TAU = Math.PI * 2, PI = Math.PI;
  var F = (SP.Forms = {});

  /* ══════════════════════════════════════════════════════════
     THE BUILDER
     ══════════════════════════════════════════════════════════ */

  function Mesh() {
    this.p = [];        /* positions, flat */
    this.uv = [];
    this.i = [];        /* indices */
  }

  Mesh.prototype.vert = function (x, y, z, u, v) {
    this.p.push(x, y, z);
    this.uv.push(u || 0, v || 0);
    return (this.p.length / 3) - 1;
  };

  Mesh.prototype.tri = function (a, b, c) { this.i.push(a, b, c); };

  Mesh.prototype.quad = function (a, b, c, d) { this.i.push(a, b, c, a, c, d); };

  /* Stitch a rows×cols lattice of vertices whose first index is
     `base`. `wrap` closes the last column onto the first, which
     is what every revolved and swept form here wants.

     `flip` reverses the winding, and it is not optional
     decoration — it decides which way the surface faces. Which
     value a builder needs depends on which way its row parameter
     runs: a lathe walks its profile upwards and comes out facing
     outwards, while a sphere walks its rows from the north pole
     down and comes out facing inwards from the same code.

     Getting this wrong is not a subtle shading bug. Back faces
     are culled, so an inside-out shell has its near wall removed
     and you see straight through it to whatever it is wrapped
     around — which is exactly what a first pass at this file
     did: every shrimp on the site rendered as a pale lump of
     meat with a few red slivers at the silhouette, and it read
     as a lighting problem rather than as a winding one. */
  Mesh.prototype.lattice = function (base, rows, cols, wrap, flip) {
    var stride = cols;
    for (var r = 0; r < rows - 1; r++) {
      for (var c = 0; c < cols - (wrap ? 0 : 1); c++) {
        var c1 = (c + 1) % cols;
        var a = base + r * stride + c,
            b = base + r * stride + c1,
            d = base + (r + 1) * stride + c,
            e = base + (r + 1) * stride + c1;
        if (flip) this.quad(a, b, e, d); else this.quad(a, d, e, b);
      }
    }
  };

  /* Merge another mesh in, optionally transformed. Used to glue
     legs onto a body and blades onto a tail fan without paying
     for a second draw call. */
  Mesh.prototype.merge = function (other, mat) {
    var base = this.p.length / 3, i;
    for (i = 0; i < other.p.length; i += 3) {
      var x = other.p[i], y = other.p[i + 1], z = other.p[i + 2];
      if (mat) {
        this.p.push(
          mat[0] * x + mat[4] * y + mat[8] * z + mat[12],
          mat[1] * x + mat[5] * y + mat[9] * z + mat[13],
          mat[2] * x + mat[6] * y + mat[10] * z + mat[14]);
      } else this.p.push(x, y, z);
    }
    for (i = 0; i < other.uv.length; i++) this.uv.push(other.uv[i]);
    for (i = 0; i < other.i.length; i++) this.i.push(other.i[i] + base);
    return this;
  };

  /* Smooth normals by area-weighted face accumulation. Area
     weighting rather than plain averaging matters on the swept
     forms, where a ring of long thin triangles at the tail would
     otherwise shout down the ring of fat ones next to it. */
  Mesh.prototype.finish = function () {
    var n = this.p.length / 3;
    var nrm = new Float32Array(this.p.length);
    var i, a, b, c;
    for (i = 0; i < this.i.length; i += 3) {
      a = this.i[i] * 3; b = this.i[i + 1] * 3; c = this.i[i + 2] * 3;
      var ax = this.p[b] - this.p[a], ay = this.p[b + 1] - this.p[a + 1], az = this.p[b + 2] - this.p[a + 2];
      var bx = this.p[c] - this.p[a], by = this.p[c + 1] - this.p[a + 1], bz = this.p[c + 2] - this.p[a + 2];
      /* cross product, unnormalised: its length is twice the
         triangle area, which is exactly the weight we want */
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
      nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
      nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
    }
    var verts = new Float32Array(n * 8);
    for (i = 0; i < n; i++) {
      var o = i * 3;
      var l = Math.sqrt(nrm[o] * nrm[o] + nrm[o + 1] * nrm[o + 1] + nrm[o + 2] * nrm[o + 2]) || 1;
      var w = i * 8;
      verts[w] = this.p[o]; verts[w + 1] = this.p[o + 1]; verts[w + 2] = this.p[o + 2];
      verts[w + 3] = nrm[o] / l; verts[w + 4] = nrm[o + 1] / l; verts[w + 5] = nrm[o + 2] / l;
      verts[w + 6] = this.uv[i * 2]; verts[w + 7] = this.uv[i * 2 + 1];
    }
    var idx = n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i);
    return { verts: verts, index: idx, count: n };
  };

  F.mesh = function () { return new Mesh(); };

  /* ══════════════════════════════════════════════════════════
     PRIMITIVE FORMS
     ══════════════════════════════════════════════════════════ */

  /* Revolve a profile of [radius, height] pairs around Y.

     A point may carry `hard: true`, which repeats the ring so the
     crease survives the smooth-normal pass — the lip of a bucket,
     the rim of a glass, the shoulder of a bottle. Without it a
     revolved vessel reads as inflated rubber. */
  F.lathe = function (profile, seg, opt) {
    opt = opt || {};
    var mesh = opt.into || new Mesh();
    var wobble = opt.wobble || 0;
    var rnd = opt.rnd || null;
    var pts = [];
    var i, k;
    for (i = 0; i < profile.length; i++) {
      pts.push(profile[i]);
      if (profile[i].hard) pts.push(profile[i]);
    }
    var base = mesh.p.length / 3;
    for (i = 0; i < pts.length; i++) {
      var pr = pts[i][0], py = pts[i][1];
      for (k = 0; k < seg; k++) {
        var a = k / seg * TAU;
        var r = pr;
        if (wobble && rnd) r *= 1 + Math.sin(a * 3 + i * .7) * wobble * (.5 + rnd() * .5);
        mesh.vert(Math.cos(a) * r, py, Math.sin(a) * r, k / seg, i / (pts.length - 1));
      }
    }
    mesh.lattice(base, pts.length, seg, true);
    return opt.into ? mesh : mesh.finish();
  };

  /* Sweep a ring along a path.

     `fn(t)` returns the frame at t: centre `c`, forward `d`,
     radius `r`, and an optional `flat` factor that squashes the
     section vertically — a shrimp is not round in cross-section
     and neither is a lobster tail.

     The up vector is carried along the path rather than
     recomputed from the tangent each step, which is what stops
     the section from spinning when the path turns back on
     itself. */
  F.sweep = function (steps, seg, fn, opt) {
    opt = opt || {};
    var mesh = opt.into || new Mesh();
    var base = mesh.p.length / 3;
    var up = [0, 1, 0], side = [1, 0, 0];
    var i, k;
    for (i = 0; i <= steps; i++) {
      var t = i / steps;
      var f = fn(t);
      var d = f.d;
      var dl = Math.hypot(d[0], d[1], d[2]) || 1;
      var dx = d[0] / dl, dy = d[1] / dl, dz = d[2] / dl;
      /* side = up × forward, then up = forward × side. Carrying
         `up` forward keeps the frame from rolling. */
      var sx = up[1] * dz - up[2] * dy,
          sy = up[2] * dx - up[0] * dz,
          sz = up[0] * dy - up[1] * dx;
      var sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-5) { sx = side[0]; sy = side[1]; sz = side[2]; sl = 1; }
      sx /= sl; sy /= sl; sz /= sl;
      side = [sx, sy, sz];
      var ux = dy * sz - dz * sy, uy = dz * sx - dx * sz, uz = dx * sy - dy * sx;
      up = [ux, uy, uz];
      var flat = f.flat === undefined ? 1 : f.flat;
      var roll = f.roll || 0;
      for (k = 0; k < seg; k++) {
        var a = k / seg * TAU + roll;
        var ca = Math.cos(a) * f.r, sa = Math.sin(a) * f.r * flat;
        mesh.vert(
          f.c[0] + sx * ca + ux * sa,
          f.c[1] + sy * ca + uy * sa,
          f.c[2] + sz * ca + uz * sa,
          k / seg, t);
      }
    }
    mesh.lattice(base, steps + 1, seg, true, true);
    if (opt.cap) {
      /* fans over the first and last rings, so a cut tube is not
         a hole you can see the inside of */
      var c0 = mesh.vert(fn(0).c[0], fn(0).c[1], fn(0).c[2], .5, 0);
      var lf = fn(1);
      var c1 = mesh.vert(lf.c[0], lf.c[1], lf.c[2], .5, 1);
      for (k = 0; k < seg; k++) {
        mesh.tri(c0, base + (k + 1) % seg, base + k);
        var last = base + steps * seg;
        mesh.tri(c1, last + k, last + (k + 1) % seg);
      }
    }
    return opt.into ? mesh : mesh.finish();
  };

  /* A sphere pushed around by noise. Potatoes, crumbs, boiled
     onion, the lumps in a breading. `bumps` is high-frequency
     and `dent` is low. */
  F.blob = function (r, seg, rings, opt) {
    opt = opt || {};
    var mesh = opt.into || new Mesh();
    var base = mesh.p.length / 3;
    var s = opt.seed || 1, dent = opt.dent || .12, bumps = opt.bumps || 0;
    var sx = opt.sx || 1, sy = opt.sy || 1, sz = opt.sz || 1;
    for (var i = 0; i <= rings; i++) {
      var v = i / rings, phi = v * PI;
      for (var k = 0; k < seg; k++) {
        var u = k / seg, th = u * TAU;
        var nx = Math.sin(phi) * Math.cos(th),
            ny = Math.cos(phi),
            nz = Math.sin(phi) * Math.sin(th);
        var rr = r * (1 + dent * (M.fbm3(nx * 1.7 + s, ny * 1.7, nz * 1.7 + s, 3) - .5) * 2);
        if (bumps) rr *= 1 + bumps * (M.noise3(nx * 9 + s * 3, ny * 9, nz * 9) - .5);
        mesh.vert(nx * rr * sx, ny * rr * sy, nz * rr * sz, u, v);
      }
    }
    mesh.lattice(base, rings + 1, seg, true, true);
    return opt.into ? mesh : mesh.finish();
  };

  /* A flat tapered blade, bent along its length. Tail fans, herb
     leaves, lettuce, parmesan shavings, mint. */
  F.blade = function (len, wid, opt) {
    opt = opt || {};
    var mesh = opt.into || new Mesh();
    var base = mesh.p.length / 3;
    var steps = opt.steps || 8, cols = opt.cols || 3;
    var curl = opt.curl || 0, twist = opt.twist || 0, thick = opt.thick || .006;
    var taper = opt.taper === undefined ? 1 : opt.taper;
    var ripple = opt.ripple || 0;
    var i, k;
    for (var side = 0; side < 2; side++) {
      for (i = 0; i <= steps; i++) {
        var t = i / steps;
        var w = wid * (1 - taper * t * t) * (opt.round ? Math.sin((t * .85 + .15) * PI) * 1.2 : 1);
        var y = curl * t * t;
        var tw = twist * t;
        for (k = 0; k < cols; k++) {
          var u = (k / (cols - 1)) * 2 - 1;
          var xz = u * w;
          var yy = y + Math.cos(tw) * 0 + ripple * Math.sin(t * 7 + u * 3) * wid * .3;
          var off = (side ? -1 : 1) * thick * (1 - Math.abs(u) * .7);
          mesh.vert(
            xz * Math.cos(tw),
            yy + off + xz * Math.sin(tw) * .35,
            t * len,
            (u + 1) / 2, t);
        }
      }
    }
    mesh.lattice(base, steps + 1, cols, false);
    var half = (steps + 1) * cols;
    /* the underside is stitched with the winding reversed so it
       faces the other way */
    for (i = 0; i < steps; i++) {
      for (k = 0; k < cols - 1; k++) {
        var a = base + half + i * cols + k;
        mesh.quad(a, a + 1, a + cols + 1, a + cols);
      }
    }
    /* edge seam */
    for (i = 0; i < steps; i++) {
      var l0 = base + i * cols, l1 = base + (i + 1) * cols;
      var r0 = base + half + i * cols, r1 = base + half + (i + 1) * cols;
      mesh.quad(l0, l1, r1, r0);
      mesh.quad(l0 + cols - 1, r0 + cols - 1, r1 + cols - 1, l1 + cols - 1);
    }
    return opt.into ? mesh : mesh.finish();
  };

  /* Rounded slab. Fish fillet, salmon steak, fish finger, bread,
     the sizzling plate, a lemon wedge's flat faces. */
  F.slab = function (w, h, d, opt) {
    opt = opt || {};
    var mesh = opt.into || new Mesh();
    var base = mesh.p.length / 3;
    var nu = opt.nu || 12, nv = opt.nv || 8;
    var round = opt.round === undefined ? .45 : opt.round;
    var crown = opt.crown === undefined ? .5 : opt.crown;
    var s = opt.seed || 3, rough = opt.rough || 0;
    for (var i = 0; i <= nv; i++) {
      var v = i / nv, phi = v * PI;
      for (var k = 0; k < nu; k++) {
        var u = k / nu, th = u * TAU;
        var sp = Math.sin(phi);
        var x = sp * Math.cos(th), y = Math.cos(phi), z = sp * Math.sin(th);
        /* superellipsoid-ish: push the surface out towards a box
           by the `round` exponent, then crown the top */
        var e = round;
        var px = Math.sign(x) * Math.pow(Math.abs(x), e);
        var py = Math.sign(y) * Math.pow(Math.abs(y), e);
        var pz = Math.sign(z) * Math.pow(Math.abs(z), e);
        var lift = 1 + (py > 0 ? crown * py * .35 : 0);
        var n = rough ? 1 + rough * (M.fbm3(px * 3 + s, py * 3, pz * 3, 3) - .5) : 1;
        mesh.vert(px * w * n * .5, py * h * lift * n * .5, pz * d * n * .5, u, v);
      }
    }
    mesh.lattice(base, nv + 1, nu, true, true);
    return opt.into ? mesh : mesh.finish();
  };

  /* A torus with a lumpy crust — a calamari ring, and with a low
     `crust` an onion ring or a rubber gasket. */
  F.ring = function (R, r, opt) {
    opt = opt || {};
    var mesh = opt.into || new Mesh();
    var base = mesh.p.length / 3;
    var big = opt.big || 26, small = opt.small || 12;
    var crust = opt.crust || 0, s = opt.seed || 5;
    var squash = opt.squash || 0;
    for (var i = 0; i <= big; i++) {
      var u = i / big, a = u * TAU;
      var ca = Math.cos(a), sa = Math.sin(a);
      var Rr = R * (1 + squash * Math.cos(a * 2) * .5);
      for (var k = 0; k < small; k++) {
        var v = k / small, b = v * TAU;
        var rr = r;
        if (crust) rr *= 1 + crust * (M.fbm3(ca * 4 + s, sa * 4, Math.cos(b) * 4, 3) - .5) * 2;
        var cx = (Rr + Math.cos(b) * rr) * ca;
        var cz = (Rr + Math.cos(b) * rr) * sa;
        mesh.vert(cx, Math.sin(b) * rr, cz, u, v);
      }
    }
    mesh.lattice(base, big + 1, small, true, true);
    return opt.into ? mesh : mesh.finish();
  };

  /* A flat disc on the XZ plane, subdivided so a vertex shader
     can push waves through it. Broth surfaces, sauce pools,
     liquid in a glass. */
  F.disc = function (r, rings, seg, opt) {
    opt = opt || {};
    var mesh = opt.into || new Mesh();
    var base = mesh.p.length / 3;
    var dome = opt.dome || 0;
    for (var i = 0; i <= rings; i++) {
      var t = i / rings;
      for (var k = 0; k < seg; k++) {
        var a = k / seg * TAU;
        mesh.vert(Math.cos(a) * r * t, dome * (1 - t * t) * r, Math.sin(a) * r * t, t, k / seg);
      }
    }
    mesh.lattice(base, rings + 1, seg, true, true);
    return opt.into ? mesh : mesh.finish();
  };

  /* ══════════════════════════════════════════════════════════
     SEAFOOD

     The C-curve every cooked shrimp and lobster tail sits on. A
     shrimp relaxes as it cooks and then locks; the curve is
     tightest a third of the way down the body and opens again at
     the tail, which is why a single circular arc reads as a
     croissant instead.
     ══════════════════════════════════════════════════════════ */

  function shrimpPath(t, bend, seed) {
    /* t: 0 at the head, 1 at the tail joint */
    var a = -0.35 + t * bend;
    var lean = M.noise3(seed, t * 2.3, 0) - .5;
    var r = 0.62 - t * 0.09;
    return [
      Math.cos(a) * r - Math.cos(-0.35) * 0.62,
      Math.sin(a) * r - Math.sin(-0.35) * 0.62,
      lean * 0.07 * t
    ];
  }

  function shrimpFrame(t, bend, seed) {
    var e = 0.004;
    var p = shrimpPath(t, bend, seed);
    var q = shrimpPath(Math.min(1, t + e), bend, seed);
    return {
      c: p,
      d: [q[0] - p[0], q[1] - p[1], q[2] - p[2] || 1e-5]
    };
  }

  /* Body radius down the shrimp: thick at the second segment,
     tapering hard past the fifth. */
  function shrimpRadius(t) {
    return 0.158 * (1 - Math.pow(t, 1.55) * .80) * (1 + .17 * Math.sin(t * 2.1));
  }

  /* How much narrower the meat is than the shell around it. It
     has to clear the shell at every point on the curve or the
     meat pokes through the plates and the shrimp reads as
     two objects intersecting rather than one inside the other. */
  var MEAT_RATIO = 0.74;

  /* One shell plate. Six of these overlap into a tail; each is
     built in its own local space so the break-apart can hand each
     one to the physics with a sane centre of mass.

     `k` is the plate index, 0 at the head. */
  F.shrimpPlate = function (k, opt) {
    opt = opt || {};
    var seed = opt.seed || 0, bend = opt.bend || 2.5;
    var n = opt.plates || 6;
    var t0 = k / n, t1 = (k + 1) / n;
    /* plates overlap: each one runs a little past its own share,
       and the lip flares where it laps the plate behind it */
    var lap = 0.045;
    var a = Math.max(0, t0 - (k ? lap : 0)), b = Math.min(1, t1 + lap);
    var mid = (a + b) / 2;
    var centre = shrimpPath(mid, bend, seed);
    var thick = opt.thick === undefined ? 1.06 : opt.thick;
    var open = opt.open || 0;   /* how far the plate's belly is cut away */
    var mesh = F.sweep(9, 18, function (t) {
      var tt = a + (b - a) * t;
      var fr = shrimpFrame(tt, bend, seed);
      var flare = 1 + .19 * Math.pow(1 - t, 2.2);
      return {
        c: [fr.c[0] - centre[0], fr.c[1] - centre[1], fr.c[2] - centre[2]],
        d: fr.d,
        r: shrimpRadius(tt) * thick * flare,
        flat: 0.82
      };
    }, { into: new Mesh() });
    /* cut the belly away so the plate is a shell and not a pipe:
       pull the lower third of every ring in towards the axis */
    if (open) {
      for (var i = 0; i < mesh.p.length; i += 3) {
        var y = mesh.p[i + 1];
        if (y < -0.02) mesh.p[i + 1] = -0.02 + (y + 0.02) * (1 - open);
      }
    }
    var g = mesh.finish();
    g.origin = centre;
    return g;
  };

  /* The meat, as one piece: the same sweep at 88% radius with the
     segment grooves pressed into it and the dark vein along the
     back. You only ever see this after the shell has come off. */
  F.shrimpMeat = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0, bend = opt.bend || 2.5, n = opt.plates || 6;
    return F.sweep(48, 20, function (t) {
      var fr = shrimpFrame(t, bend, seed);
      /* the grooves between plates leave a scallop in the meat */
      var seg = Math.abs(Math.sin(t * n * PI));
      var r = shrimpRadius(t) * (MEAT_RATIO - .06 * (1 - seg));
      return { c: fr.c, d: fr.d, r: r, flat: 0.83 };
    }, { cap: true });
  };

  /* Head end: the carapace, blunter and wider than the body,
     with the rostrum ridge along the top. */
  F.shrimpHead = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0, bend = opt.bend || 2.5;
    var mesh = F.sweep(10, 18, function (t) {
      var fr = shrimpFrame(-0.20 + t * 0.21, bend, seed);
      return {
        c: fr.c, d: fr.d,
        r: shrimpRadius(0) * (0.55 + Math.sin(t * PI * .92) * .74),
        flat: 0.86
      };
    }, { into: new Mesh(), cap: true });

    /* the rostrum — the serrated spike over the eyes. Short, but
       it is the difference between a head and a bead. */
    var rf = shrimpFrame(-0.19, bend, seed);
    var spike = F.sweep(5, 7, function (t) {
      return {
        c: [rf.c[0] - t * .17, rf.c[1] + t * .10, 0],
        d: [-1, .55, 0],
        r: .028 * (1 - t * .93) + .003
      };
    }, { into: new Mesh(), cap: true });
    mesh.merge(spike);

    /* two eyes on stalks, one either side */
    for (var e = 0; e < 2; e++) {
      var side = e ? 1 : -1;
      var eye = F.blob(.030, 10, 7, { seed: seed + e, dent: .05, into: new Mesh() });
      var m = M.m4.identity(M.m4.make());
      m[12] = rf.c[0] - .045; m[13] = rf.c[1] + .010; m[14] = side * .072;
      mesh.merge(eye, m);
    }
    return mesh.finish();
  };

  /* Tail fan: five blades off a common hinge, the middle one
     longest, splayed by `spread`. */
  F.shrimpTail = function (opt) {
    opt = opt || {};
    var spread = opt.spread || 0.40, seed = opt.seed || 0;
    var bend = opt.bend || 2.5;
    var mesh = new Mesh();
    var rnd = M.rng(((seed * 977) | 0) + 11);

    /* The fan has to leave the body along the body's own tangent
       at the tail joint, and it has to open *flat* — a shrimp's
       tail fan is a flat fan, and its plane contains the tangent
       and the body's lateral axis.

       Built in its own space a blade runs along +Z and splays
       within its local XZ plane, so the basis this needs is
       explicit rather than a stack of Euler angles: +Z onto the
       tangent, +X onto the lateral axis, +Y filling in. Two
       attempts at composing this out of yaw and pitch put the
       fan inside the body, where it was invisible and looked
       like a modelling omission rather than a maths error. */
    var ang = -0.35 + bend;
    var w = [-Math.sin(ang), Math.cos(ang), 0];     // the tangent
    var u = [0, 0, 1];                              // the lateral axis
    var v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    var basis = new Float32Array([
      u[0], u[1], u[2], 0,
      v[0], v[1], v[2], 0,
      w[0], w[1], w[2], 0,
      0, 0, 0, 1
    ]);

    for (var i = -2; i <= 2; i++) {
      var f = 1 - Math.abs(i) * 0.16;
      var a = i * spread + (rnd() - .5) * .06;
      var len = 0.24 * f, wid = 0.042 * f;
      var blade = F.blade(len, wid, {
        steps: 6, cols: 3, thick: .0032, taper: .5, round: true,
        curl: 0.022 * f, ripple: .14, into: new Mesh()
      });
      var splay = M.m4.compose(M.m4.make(), [0, 0, 0],
        M.quat.fromEuler(M.quat.make(), (rnd() - .5) * .14, a, 0), [1, 1, 1]);
      mesh.merge(blade, M.m4.mul(M.m4.make(), basis, splay));
    }
    return mesh.finish();
  };

  /* Swimmerets — the little legs under the belly. Merged into one
     mesh because they are never handled individually. */
  F.shrimpLegs = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0, bend = opt.bend || 2.5;
    var mesh = new Mesh();
    var rnd = M.rng(((seed * 613) | 0) + 5);
    for (var i = 0; i < 5; i++) {
      var t = 0.14 + i * 0.15;
      var fr = shrimpFrame(t, bend, seed);
      var r0 = shrimpRadius(t) * .8;
      var len = 0.055 + rnd() * .02;
      var lean = (rnd() - .5) * .5;
      var leg = F.sweep(4, 6, function (u) {
        return {
          c: [Math.sin(lean) * u * len * .5, -u * len, Math.cos(lean) * u * len * .35],
          d: [Math.sin(lean) * .3, -1, Math.cos(lean) * .2],
          r: 0.011 * (1 - u * .75)
        };
      }, { into: new Mesh(), cap: true });
      var m = M.m4.identity(M.m4.make());
      m[12] = fr.c[0]; m[13] = fr.c[1] - r0 * .55; m[14] = fr.c[2];
      mesh.merge(leg, m);
    }
    return mesh.finish();
  };

  /* Antennae — two long tapered whips. Cheap, and their absence
     is the first thing that makes a rendered shrimp look like a
     toy. */
  F.shrimpAntennae = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = new Mesh();
    var rnd = M.rng(((seed * 331) | 0) + 3);
    for (var i = 0; i < 2; i++) {
      var sway = (rnd() - .5) * .8, curve = .5 + rnd() * .5;
      var whip = F.sweep(14, 5, function (t) {
        return {
          c: [Math.sin(sway) * t * .5 + Math.sin(t * 4) * .03 * t,
              -0.02 + Math.sin(t * curve * 2) * .12 * t,
              Math.cos(sway) * t * .42],
          d: [Math.sin(sway) * .5, Math.cos(t * curve * 2) * .2, Math.cos(sway) * .42],
          r: 0.0115 * (1 - t * .86)
        };
      }, { into: new Mesh() });
      mesh.merge(whip);
    }
    return mesh.finish();
  };

  /* ── mussel ──────────────────────────────────────────────────
     Two ellipsoid halves, hinged at the narrow end, with growth
     rings pressed into the outside. */
  F.musselShell = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = new Mesh();
    var seg = 20, rings = 12;
    var base = 0;
    for (var i = 0; i <= rings; i++) {
      var v = i / rings;
      for (var k = 0; k < seg; k++) {
        var u = k / seg, th = u * PI;   /* half a revolution: one valve */
        var w = Math.sin(v * PI) * .5 + .02;
        /* the profile of a mussel: pointed at the hinge, broad
           and rounded at the lip */
        var prof = Math.pow(v, .62) * (1 - v * .1);
        var x = Math.cos(th) * w * .78;
        var y = Math.sin(th) * w * .52 * (0.55 + prof * .9);
        var z = (v - .5) * 1.0;
        /* growth rings */
        var g = 1 + 0.017 * Math.sin(v * 34) * (1 - Math.abs(x));
        mesh.vert(x * g, y * g, z, u, v);
      }
    }
    mesh.lattice(base, rings + 1, seg, false, true);
    /* close the flat mating face so the valve is a solid object */
    var lip = [];
    for (i = 0; i <= rings; i++) lip.push(base + i * seg);
    var lip2 = [];
    for (i = 0; i <= rings; i++) lip2.push(base + i * seg + seg - 1);
    for (i = 0; i < rings; i++) {
      var inner0 = mesh.vert(0, 0, (i / rings - .5) * 1.0, 0, i / rings);
      var inner1 = mesh.vert(0, 0, ((i + 1) / rings - .5) * 1.0, 0, (i + 1) / rings);
      mesh.tri(lip[i], inner0, lip[i + 1]);
      mesh.tri(lip[i + 1], inner0, inner1);
      mesh.tri(lip2[i], lip2[i + 1], inner0);
      mesh.tri(lip2[i + 1], inner1, inner0);
    }
    var g2 = mesh.finish();
    return g2;
  };

  /* The meat inside: a soft lobed lump that sits in the cupped
     valve. */
  F.musselMeat = function (opt) {
    opt = opt || {};
    return F.blob(.30, 16, 10, {
      seed: (opt.seed || 0) + 4.2, dent: .3, bumps: .1,
      sx: .8, sy: .62, sz: 1.5
    });
  };

  /* ── crab ────────────────────────────────────────────────────
     A crab arrives at Shrimparty already broken down, so what is
     modelled is what is in the bucket: body sections, claws and
     legs, not a whole animal. */
  F.crabBody = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = F.blob(.36, 22, 12, {
      seed: seed + 1.1, dent: .1, bumps: .05, sx: 1.35, sy: .52, sz: 1, into: new Mesh()
    });
    /* the carapace has a hard front edge and a serrated rim; the
       serration is a per-vertex pinch rather than geometry */
    for (var i = 0; i < mesh.p.length; i += 3) {
      var x = mesh.p[i], y = mesh.p[i + 1], z = mesh.p[i + 2];
      if (y < 0) mesh.p[i + 1] = y * .45;
      var edge = Math.max(0, 1 - Math.abs(y) * 6);
      if (edge > 0) {
        var a = Math.atan2(z, x);
        mesh.p[i] = x * (1 + edge * .022 * Math.sin(a * 17));
        mesh.p[i + 2] = z * (1 + edge * .022 * Math.sin(a * 17));
      }
    }
    return mesh.finish();
  };

  F.crabClaw = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = new Mesh();
    /* the palm */
    F.blob(.19, 16, 10, {
      seed: seed + 2.4, dent: .12, sx: 1.5, sy: .8, sz: .85, into: mesh
    });
    /* the fixed finger and the dactyl, both tapered cones bent
       towards each other and left slightly parted */
    for (var f = 0; f < 2; f++) {
      var sign = f ? 1 : -1;
      var gap = 0.055;
      var finger = F.sweep(7, 8, function (t) {
        var bend = t * t * .22;
        return {
          c: [.22 + t * .26, sign * (gap + bend * sign * -.9) * (1 - t * .35), 0],
          d: [1, sign * -.25 * t, 0],
          r: .058 * (1 - t * .85) + .004,
          flat: .8
        };
      }, { into: new Mesh(), cap: true });
      mesh.merge(finger);
    }
    return mesh.finish();
  };

  F.crabLeg = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var rnd = M.rng(((seed * 71) | 0) + 9);
    var mesh = new Mesh();
    var joints = [
      { len: .30, r0: .052, r1: .040, a: -.30 },
      { len: .26, r0: .040, r1: .028, a: .55 },
      { len: .22, r0: .028, r1: .006, a: .85 }
    ];
    var px = 0, py = 0, ang = 0;
    for (var j = 0; j < joints.length; j++) {
      var J = joints[j];
      ang += J.a + (rnd() - .5) * .12;
      var ox = px, oy = py, oa = ang;
      var s = F.sweep(4, 8, function (t) {
        return {
          c: [ox + Math.cos(oa) * J.len * t, oy - Math.sin(oa) * J.len * t, 0],
          d: [Math.cos(oa), -Math.sin(oa), 0],
          r: J.r0 + (J.r1 - J.r0) * t
        };
      }, { into: new Mesh(), cap: true });
      mesh.merge(s);
      px += Math.cos(ang) * J.len; py -= Math.sin(ang) * J.len;
    }
    return mesh.finish();
  };

  /* ── lobster ─────────────────────────────────────────────── */

  F.lobsterTail = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = new Mesh();
    /* six armoured segments, each flaring at its trailing edge */
    for (var k = 0; k < 6; k++) {
      var t0 = k / 6, t1 = (k + 1) / 6;
      F.sweep(5, 20, function (t) {
        var tt = t0 + (t1 - t0) * t;
        var a = -.2 + tt * 1.5;
        return {
          c: [Math.cos(a) * .9 - .88, Math.sin(a) * .9 + .18, 0],
          d: [-Math.sin(a), Math.cos(a), 1e-5],
          r: (.20 - tt * .105) * (1 + .13 * Math.pow(1 - t, 2)),
          flat: .74
        };
      }, { into: mesh });
    }
    return mesh.finish();
  };

  F.lobsterCarapace = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = F.blob(.26, 20, 12, {
      seed: seed + 3.3, dent: .07, sx: 1.55, sy: .95, sz: .9, into: new Mesh()
    });
    /* the rostrum: a spike off the front, and the ridge that
       runs back from it */
    var spike = F.sweep(5, 7, function (t) {
      return { c: [.4 + t * .30, .02 + t * .05, 0], d: [1, .18, 0], r: .05 * (1 - t * .92) + .004 };
    }, { into: new Mesh(), cap: true });
    mesh.merge(spike);
    return mesh.finish();
  };

  F.lobsterClaw = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = new Mesh();
    F.blob(.24, 18, 11, { seed: seed + 5.1, dent: .1, sx: 1.7, sy: .95, sz: .78, into: mesh });
    for (var f = 0; f < 2; f++) {
      var sign = f ? 1 : -1;
      var finger = F.sweep(7, 9, function (t) {
        return {
          c: [.30 + t * .34, sign * .075 * (1 - t * .55) - t * t * sign * .05, 0],
          d: [1, sign * -.2, 0],
          r: .075 * (1 - t * .87) + .005,
          flat: .85
        };
      }, { into: new Mesh(), cap: true });
      mesh.merge(finger);
    }
    return mesh.finish();
  };

  /* ── the rest of the bucket ──────────────────────────────── */

  F.potato = function (opt) {
    opt = opt || {};
    return F.blob(.20, 18, 11, {
      seed: (opt.seed || 0) + 7.7, dent: .17, bumps: .04,
      sx: 1.1, sy: .92, sz: 1
    });
  };

  /* Corn: a cylinder wearing rows of kernels. The kernels are
     displacement on the surface rather than separate geometry —
     at bucket scale nothing on a cob is individually handled. */
  F.corn = function (opt) {
    opt = opt || {};
    var len = opt.len || .62, r = opt.r || .17;
    var mesh = new Mesh();
    var seg = 26, rings = 26;
    for (var i = 0; i <= rings; i++) {
      var v = i / rings;
      var taper = Math.sin(Math.min(1, Math.max(0, v)) * PI) * .18 + .88;
      for (var k = 0; k < seg; k++) {
        var u = k / seg, a = u * TAU;
        /* offset every other row by half a kernel — corn is
           packed in a lattice, not in columns */
        var row = i, off = (row % 2) * .5;
        var kern = Math.pow(Math.abs(Math.sin((u * seg + off) * PI)), .6) *
                   Math.pow(Math.abs(Math.sin(v * rings * PI)), .6);
        var rr = r * taper * (1 + kern * .10);
        mesh.vert(Math.cos(a) * rr, (v - .5) * len, Math.sin(a) * rr, u, v);
      }
    }
    mesh.lattice(0, rings + 1, seg, true);
    return mesh.finish();
  };

  F.lemonWedge = function (opt) {
    opt = opt || {};
    var mesh = new Mesh();
    var seg = 14, rings = 8;
    var span = opt.span || (PI * .52);
    for (var i = 0; i <= rings; i++) {
      var v = i / rings;
      var w = Math.sin(v * PI) * .5 + .04;   /* the rounded back */
      for (var k = 0; k <= seg; k++) {
        var u = k / seg, a = -span / 2 + u * span;
        mesh.vert(Math.cos(a) * .30, (v - .5) * .30 * (1 - Math.abs(Math.cos(a)) * .1), Math.sin(a) * .30 * w * 2.4, u, v);
      }
    }
    mesh.lattice(0, rings + 1, seg + 1, false);
    return mesh.finish();
  };

  F.herb = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var rnd = M.rng(((seed * 191) | 0) + 17);
    var mesh = new Mesh();
    var n = 3 + ((rnd() * 3) | 0);
    for (var i = 0; i < n; i++) {
      var a = rnd() * TAU, tilt = .3 + rnd() * .8;
      var leaf = F.blade(.09 + rnd() * .05, .022 + rnd() * .01, {
        steps: 5, cols: 3, thick: .0022, taper: .8, round: true,
        curl: .01, ripple: .2, into: new Mesh()
      });
      var m = M.m4.compose(M.m4.make(), [0, 0, 0],
        M.quat.fromEuler(M.quat.make(), tilt, a, 0), [1, 1, 1]);
      mesh.merge(leaf, m);
    }
    return mesh.finish();
  };

  F.lettuce = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    return F.blade(.42, .17, {
      steps: 12, cols: 7, thick: .004, taper: .35, round: true,
      curl: .10 + (M.rng(((seed * 53) | 0) + 2)()) * .1,
      ripple: .55, twist: .4
    });
  };

  F.shard = function (opt) {   /* parmesan, and any thin flake */
    opt = opt || {};
    var seed = opt.seed || 0;
    var rnd = M.rng(((seed * 337) | 0) + 8);
    return F.blade(.045 + rnd() * .04, .022 + rnd() * .02, {
      steps: 3, cols: 3, thick: .0018, taper: .5, round: true,
      curl: .008, ripple: .3
    });
  };

  F.crumb = function (opt) {
    opt = opt || {};
    return F.blob(.016, 7, 5, { seed: (opt.seed || 0) * 3.1 + .5, dent: .5, sx: 1.3, sy: .7, sz: 1 });
  };

  /* ── fish ────────────────────────────────────────────────── */

  F.fillet = function (opt) {
    opt = opt || {};
    var w = opt.w || .8, h = opt.h || .17, d = opt.d || .46;
    return F.slab(w, h, d, {
      nu: 22, nv: 14, round: .42, crown: .8,
      rough: opt.breaded ? .085 : .035, seed: (opt.seed || 0) + 9.3
    });
  };

  F.fishFinger = function (opt) {
    opt = opt || {};
    return F.slab(.44, .13, .13, {
      nu: 16, nv: 10, round: .30, crown: .2,
      rough: .11, seed: (opt.seed || 0) + 2.9
    });
  };

  /* A chunk of fish out of a soup or a tagine: irregular, flaked
     along one axis so it reads as cooked rather than diced. */
  F.fishChunk = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = F.slab(.32, .17, .21, {
      nu: 14, nv: 9, round: .5, crown: .3, rough: .1, seed: seed + 4.4, into: new Mesh()
    });
    for (var i = 0; i < mesh.p.length; i += 3) {
      /* flakes: step the surface along X in five plates */
      var x = mesh.p[i];
      mesh.p[i + 1] += Math.sin(x * 44) * .006;
    }
    return mesh.finish();
  };

  /* ── vessels ─────────────────────────────────────────────── */

  F.bucket = function (opt) {
    opt = opt || {};
    var r = opt.r || 1, h = opt.h || .56;
    /* a galvanised pail: rolled lip, straight flare, a swage
       around the belly, recessed base */
    return F.lathe([
      [0, 0],
      [r * .68, 0], { 0: r * .68, 1: 0, hard: true },
      [r * .70, .015], { 0: r * .70, 1: .015, hard: true },
      [r * .78, h * .30],
      [r * .82, h * .40], { 0: r * .82, 1: .40 * h, hard: true },
      [r * .845, h * .46],
      [r * .93, h * .86],
      [r * .97, h], { 0: r * .97, 1: h, hard: true },
      [r * 1.0, h + .028],
      [r * .965, h + .045], { 0: r * .965, 1: h + .045, hard: true },
      [r * .93, h + .02],
      [r * .90, h - .10]
    ], opt.seg || 44);
  };

  F.bowl = function (opt) {
    opt = opt || {};
    var r = opt.r || 1;
    return F.lathe([
      [0, 0],
      [r * .30, 0], { 0: r * .30, 1: 0, hard: true },
      [r * .34, .03],
      [r * .62, .14],
      [r * .88, .30],
      [r * 1.0, .45], { 0: r, 1: .45, hard: true },
      [r * .985, .47],
      [r * .86, .32],
      [r * .58, .16],
      [r * .30, .05],
      [0, .04]
    ], opt.seg || 40);
  };

  F.plate = function (opt) {
    opt = opt || {};
    var r = opt.r || 1;
    return F.lathe([
      [0, 0],
      [r * .5, .004],
      [r * .74, .02],
      [r * .80, .05], { 0: r * .80, 1: .05, hard: true },
      [r * .95, .105],
      [r * 1.0, .12], { 0: r, 1: .12, hard: true },
      [r * .99, .108],
      [r * .93, .095],
      [r * .78, .04],
      [r * .70, .028], { 0: r * .70, 1: .028, hard: true },
      [r * .55, .026],
      [0, .022]
    ], opt.seg || 48);
  };

  /* The wire basket the fried things come in — a lathed cone plus
     a mesh liner drawn as a coarse lattice of thin rings. */
  F.basket = function (opt) {
    opt = opt || {};
    var r = opt.r || 1, h = opt.h || .38;
    return F.lathe([
      [0, 0],
      [r * .62, 0], { 0: r * .62, 1: 0, hard: true },
      [r * .66, .02],
      [r * .88, h * .7],
      [r * .98, h], { 0: r * .98, 1: h, hard: true },
      [r * 1.0, h + .022],
      [r * .96, h + .03], { 0: r * .96, 1: h + .03, hard: true },
      [r * .93, h * .72],
      [r * .63, .03]
    ], opt.seg || 40);
  };

  F.tagineBase = function (opt) {
    opt = opt || {};
    var r = opt.r || 1;
    return F.lathe([
      [0, 0],
      [r * .55, 0], { 0: r * .55, 1: 0, hard: true },
      [r * .60, .02],
      [r * .82, .09],
      [r * .95, .17],
      [r * 1.0, .24], { 0: r, 1: .24, hard: true },
      [r * .96, .26],
      [r * .88, .20],
      [r * .66, .10],
      [r * .40, .07],
      [0, .06]
    ], opt.seg || 44);
  };

  F.tagineLid = function (opt) {
    opt = opt || {};
    var r = opt.r || 1;
    /* The cone, with the knob on top and a slight belly where it
       meets the base. The profile is written bottom-up like
       every other lathe here — written top-down it comes out
       inside-out, because `lathe` takes its winding from the
       direction the profile walks. */
    return F.lathe([
      [0, .86],
      [r * .30, .55],
      [r * .60, .28],
      [r * .86, .09],
      [r * .96, 0], { 0: r * .96, 1: 0, hard: true },
      [r * 1.0, .01],
      [r * .90, .10],
      [r * .68, .28],
      [r * .40, .52],
      [r * .16, .74],
      [r * .05, .82], { 0: r * .05, 1: .82, hard: true },
      [r * .05, .86],
      [r * .085, .90], { 0: r * .085, 1: .90, hard: true },
      [r * .055, .95],
      [0, .96]
    ], opt.seg || 44);
  };

  F.sizzlePlate = function (opt) {
    opt = opt || {};
    var r = opt.r || 1;
    /* cast iron oval on a wooden board: the oval is a lathe
       scaled on one axis by the instance transform */
    return F.lathe([
      [0, .052],
      [r * .70, .050],
      [r * .86, .044], { 0: r * .86, 1: .044, hard: true },
      [r * .93, .075],
      [r * 1.0, .105], { 0: r, 1: .105, hard: true },
      [r * .995, .02],
      [r * .90, 0], { 0: r * .90, 1: 0, hard: true },
      [r * .5, .004],
      [0, .008]
    ], opt.seg || 44);
  };

  F.glass = function (opt) {
    opt = opt || {};
    var r = opt.r || .34, h = opt.h || 1;
    return F.lathe([
      [0, 0],
      [r * .84, 0], { 0: r * .84, 1: 0, hard: true },
      [r * .86, .04],
      [r * .90, h * .35],
      [r * .97, h * .8],
      [r * 1.0, h], { 0: r, 1: h, hard: true },
      [r * .93, h],
      [r * .90, h * .8],
      [r * .83, h * .35],
      [r * .79, .05],
      [0, .045]
    ], opt.seg || 40);
  };

  F.bottle = function (opt) {
    opt = opt || {};
    var r = opt.r || .28, h = opt.h || 1.25;
    return F.lathe([
      [0, 0],
      [r * .86, 0], { 0: r * .86, 1: 0, hard: true },
      [r * .95, .04],
      [r * 1.0, .12],
      [r * 1.0, h * .52], { 0: r, 1: h * .52, hard: true },
      [r * .96, h * .60],
      [r * .55, h * .76],
      [r * .40, h * .84],
      [r * .40, h * .95], { 0: r * .40, 1: h * .95, hard: true },
      [r * .46, h * .96],
      [r * .46, h], { 0: r * .46, 1: h, hard: true },
      [r * .40, h + .02],
      [0, h + .02]
    ], opt.seg || 36);
  };

  F.can = function (opt) {
    opt = opt || {};
    var r = opt.r || .32, h = opt.h || .92;
    return F.lathe([
      [0, .03],
      [r * .78, .02],
      [r * .86, 0], { 0: r * .86, 1: 0, hard: true },
      [r * .97, .05],
      [r * 1.0, .12], { 0: r, 1: .12, hard: true },
      [r * 1.0, h - .10],
      [r * .97, h - .04], { 0: r * .97, 1: h - .04, hard: true },
      [r * .86, h],
      [r * .84, h + .015], { 0: r * .84, 1: h + .015, hard: true },
      [r * .80, h + .005],
      [r * .5, h - .01],
      [0, h - .012]
    ], opt.seg || 36);
  };

  F.spoon = function (opt) {
    opt = opt || {};
    var mesh = new Mesh();
    /* the bowl of the spoon */
    var bowl = F.blob(.10, 16, 10, { seed: 3.9, dent: 0, sx: 1.0, sy: .42, sz: 1.5, into: new Mesh() });
    for (var i = 0; i < bowl.p.length; i += 3) if (bowl.p[i + 1] > 0) bowl.p[i + 1] *= .12;
    mesh.merge(bowl.finish ? bowl : bowl);
    var handle = F.sweep(10, 8, function (t) {
      return {
        c: [0, t * t * .10, .13 + t * .55],
        d: [0, t * .2 + .02, 1],
        r: .022 * (1 - t * .25),
        flat: .42
      };
    }, { into: new Mesh(), cap: true });
    mesh.merge(handle);
    return mesh.finish();
  };

  /* Bread — RASHOUSH, the flatbread the tagines come with. A
     disc with blistered high spots. */
  F.bread = function (opt) {
    opt = opt || {};
    var seed = opt.seed || 0;
    var mesh = new Mesh();
    var seg = 34, rings = 10;
    for (var i = 0; i <= rings; i++) {
      var v = i / rings;
      for (var k = 0; k < seg; k++) {
        var u = k / seg, a = u * TAU;
        var rr = .5 * (1 + .06 * Math.sin(a * 5 + seed) + .03 * Math.sin(a * 11));
        var x = Math.cos(a) * rr * v, z = Math.sin(a) * rr * v;
        var puff = (1 - v * v) * .045 + M.fbm3(x * 8 + seed, 0, z * 8, 3) * .035;
        mesh.vert(x, puff, z, u, v);
      }
    }
    mesh.lattice(0, rings + 1, seg, true, true);
    /* underside, flat */
    var base2 = mesh.p.length / 3;
    for (i = 0; i <= rings; i++) {
      var v2 = i / rings;
      for (k = 0; k < seg; k++) {
        var u2 = k / seg, a2 = u2 * TAU;
        var rr2 = .5 * (1 + .06 * Math.sin(a2 * 5 + seed) + .03 * Math.sin(a2 * 11));
        mesh.vert(Math.cos(a2) * rr2 * v2, -.012 * (1 - v2 * v2), Math.sin(a2) * rr2 * v2, u2, v2);
      }
    }
    for (i = 0; i < rings; i++) {
      for (k = 0; k < seg; k++) {
        var k1 = (k + 1) % seg;
        var aa = base2 + i * seg + k, bb = base2 + i * seg + k1;
        var cc = base2 + (i + 1) * seg + k, dd = base2 + (i + 1) * seg + k1;
        mesh.quad(aa, cc, dd, bb);
      }
    }
    return mesh.finish();
  };

  /* Rice: one grain, drawn thousands of times. */
  F.riceGrain = function () {
    return F.blob(.020, 8, 5, { seed: 1.3, dent: .08, sx: .55, sy: .55, sz: 1.9 });
  };

  /* Seasoning: a single irregular fleck, instanced by the
     hundred. Deliberately not a sphere — a sphere at this size
     reads as a dust bunny, a flake catches a highlight. */
  F.fleck = function (seed) {
    var n = typeof seed === 'number' ? seed : 0;
    return F.blob(.011, 6, 4, { seed: n + .77, dent: .55, sx: 1.5, sy: .35, sz: 1.1 });
  };

  /* An ice cube: a rounded box with the cloudy core left as
     geometry so refraction has something to bend. */
  F.ice = function (opt) {
    opt = opt || {};
    return F.slab(.30, .30, .30, {
      nu: 12, nv: 8, round: .28, crown: 0,
      rough: .06, seed: (opt.seed || 0) + 6.1
    });
  };

  /* A billboard quad, built once and reused by every sprite
     system — steam, bubbles, condensation, oil droplets. Its
     vertex positions are the corner offsets; the vertex shader
     puts it in front of the camera. */
  F.quad = function () {
    var mesh = new Mesh();
    mesh.vert(-1, -1, 0, 0, 0);
    mesh.vert(1, -1, 0, 1, 0);
    mesh.vert(1, 1, 0, 1, 1);
    mesh.vert(-1, 1, 0, 0, 1);
    mesh.quad(0, 1, 2, 3);
    return mesh.finish();
  };

  /* The table. One big slab with a plank seam every so often —
     the room is a warm dark board and one hanging lamp, and
     everything else in frame is food. */
  F.table = function (extent, opt) {
    opt = opt || {};
    var mesh = new Mesh();
    var n = opt.n || 60;
    for (var i = 0; i <= n; i++) {
      for (var k = 0; k <= n; k++) {
        var u = i / n, v = k / n;
        var x = (u - .5) * extent, z = (v - .5) * extent;
        /* boards run along Z; the seam is a shallow groove */
        var board = Math.abs((x / .9) % 1 - .5);
        var groove = -Math.max(0, 1 - board * 26) * .008;
        mesh.vert(x, groove + M.fbm3(x * .8, 0, z * .8, 2) * .004, z, u * 8, v * 8);
      }
    }
    for (i = 0; i < n; i++) {
      for (k = 0; k < n; k++) {
        var a = i * (n + 1) + k;
        mesh.quad(a, a + 1, a + n + 2, a + n + 1);
      }
    }
    return mesh.finish();
  };

})(window);
