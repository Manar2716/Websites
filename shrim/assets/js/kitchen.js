/* ═══════════════════════════════════════════════════════════
   kitchen.js — the larder. Every ingredient on this site is a
   surface generated at runtime.

   There is no photograph in this project and no downloaded model.
   A prawn is a cross-section swept along a curled spine with six
   shell segments cut into the radius; a lemon wedge is a sector of
   a lathe with the pith left proud of the flesh; a pool of garlic
   butter is a disc whose rim is displaced by the same noise the
   shader reads. Vectors stay sharp on a 4K panel, weigh nothing,
   and — the part that matters here — can be taken apart, because
   a dish that comes apart into its ingredients has to be built
   out of its ingredients in the first place.

   Two conventions everything below obeys:

   • +Y is up, and every ingredient is modelled sitting on Y = 0
     so that plating is a translation rather than a guess.
   • v runs along an object's length, u around it. Every
     procedural pattern in shaders.js — shell banding, citrus
     segments, the char on a grilled tail — is written against
     that, so the mesh and the material never disagree about
     which way the food is pointing.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = (global.SHRIM = global.SHRIM || {});
  var M = SHRIM.M;
  var TAU = Math.PI * 2;

  /* ── builder ─────────────────────────────────────────────────
     Positions and uvs go in, an interleaved buffer comes out.
     Generators only ever have to produce positions: normals are
     accumulated from face area afterwards, which is both shorter
     to write and correct for surfaces that have been bent after
     the fact. */

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

  Builder.prototype.computeNormals = function () {
    var p = this.pos, n = this.nrm, ix = this.idx, i;
    for (i = 0; i < n.length; i++) n[i] = 0;
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

  Builder.prototype.rotateX = function (a) {
    var c = Math.cos(a), s = Math.sin(a), p = this.pos;
    for (var i = 0; i < p.length; i += 3) {
      var y = p[i + 1], z = p[i + 2];
      p[i + 1] = c * y - s * z; p[i + 2] = s * y + c * z;
    }
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

  Builder.prototype.rotateZ = function (a) {
    var c = Math.cos(a), s = Math.sin(a), p = this.pos;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1];
      p[i] = c * x - s * y; p[i + 1] = s * x + c * y;
    }
    return this;
  };

  /* Reverse every triangle's winding.

     Face orientation falls out of the order a generator happens to
     walk u and v in, and getting it backwards is invisible on a
     closed convex surface — the far wall is kept instead of the
     near one, and `computeNormals` reads winding, so the two
     errors cancel exactly. It is not invisible on an open one:
     the whole surface is simply culled and disappears. That is
     what happened to the prawn's tail fan, to every herb leaf,
     and to the table itself, which spent an afternoon being lit
     from underneath. There is a check for this in the test
     harness now; these calls are what it asked for. */
  Builder.prototype.flipFaces = function () {
    for (var i = 0; i < this.idx.length; i += 3) {
      var t = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = t;
    }
    return this;
  };

  /* Append a mirrored copy of every face, so a membrane one
     triangle thick is visible from both sides. Cheaper and more
     robust than turning culling off for the draw call: nothing
     upstream has to know the mesh is thin, and exactly one of the
     two sheets survives culling from any given view, so there is
     nothing to z-fight.

     The vertices are copied as well as the indices, and that is
     the whole point. Reversed faces sharing the *same* vertices
     contribute exactly opposite face normals, `computeNormals`
     sums them to zero, and `normalize` of that is a NaN. Every
     herb leaf on this site was invisible and every prawn's tail
     fan was a blown-out white smear for exactly that reason. */
  Builder.prototype.doubleSided = function () {
    var vn = this.pos.length / 3, n = this.idx.length, i;
    for (i = 0; i < vn * 3; i++) this.pos.push(this.pos[i]);
    for (i = 0; i < vn * 2; i++) this.uv.push(this.uv[i]);
    for (i = 0; i < vn * 3; i++) this.nrm.push(0);
    for (i = 0; i < n; i += 3) {
      this.idx.push(this.idx[i] + vn, this.idx[i + 2] + vn, this.idx[i + 1] + vn);
    }
    return this;
  };

  /* Squeeze a surface's v into a band. Every procedural pattern
     in shaders.js reads v, so this is how a piece of geometry
     merged into a larger mesh says "shade me as the tail", rather
     than inheriting six segments' worth of banding across its
     own width. */
  Builder.prototype.remapV = function (a, b) {
    for (var i = 1; i < this.uv.length; i += 2) this.uv[i] = a + this.uv[i] * (b - a);
    return this;
  };

  Builder.prototype.merge = function (other) {
    var off = this.pos.length / 3, i;
    for (i = 0; i < other.pos.length; i++) this.pos.push(other.pos[i]);
    for (i = 0; i < other.uv.length; i++) this.uv.push(other.uv[i]);
    for (i = 0; i < other.nrm.length; i++) this.nrm.push(0);
    for (i = 0; i < other.idx.length; i++) this.idx.push(other.idx[i] + off);
    return this;
  };

  /* Interleave into the one layout the renderer knows:
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

  /* Radius of the bounding sphere about the origin — the plate
     uses it to know how far apart to push ingredients without
     letting them intersect. */
  Builder.prototype.radius = function () {
    var p = this.pos, r = 0;
    for (var i = 0; i < p.length; i += 3) {
      var d = p[i] * p[i] + p[i + 1] * p[i + 1] + p[i + 2] * p[i + 2];
      if (d > r) r = d;
    }
    return Math.sqrt(r);
  };

  /* ── generic surfaces ────────────────────────────────────── */

  /* fn(u, v, out) with u, v in 0..1. wrapU closes the seam. */
  function parametric(fn, nu, nv, wrapU) {
    var b = new Builder(), out = [0, 0, 0], i, j;
    for (j = 0; j <= nv; j++) {
      for (i = 0; i <= nu; i++) {
        var u = i / nu, v = j / nv;
        fn(wrapU && i === nu ? 0 : u, v, out);
        b.vertex(out[0], out[1], out[2], u, v);
      }
    }
    var row = nu + 1;
    for (j = 0; j < nv; j++) {
      for (i = 0; i < nu; i++) {
        var a = j * row + i, c = a + 1, d = a + row, e = d + 1;
        b.quad(a, c, e, d);
      }
    }
    return b;
  }

  /* profile: [[radius, height], …] bottom to top. */
  function lathe(profile, segments) {
    var b = new Builder(), rows = profile.length, i, j;
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

  function sphere(r, nu, nv) {
    return parametric(function (u, v, o) {
      var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
      o[0] = s * Math.cos(th) * r; o[1] = Math.cos(phi) * r; o[2] = s * Math.sin(th) * r;
    }, nu, nv, true);
  }

  function cylinder(r, h, segs, capped) {
    var b = lathe([[0.0001, 0], [r, 0], [r, h], [0.0001, h]], segs);
    if (capped === false) return lathe([[r, 0], [r, h]], segs);
    return b;
  }

  function roundedBox(w, h, d, round, n) {
    n = n || 5;
    var hx = Math.max(w / 2 - round, 0), hy = Math.max(h / 2 - round, 0), hz = Math.max(d / 2 - round, 0);
    return parametric(function (u, v, o) {
      var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
      var nx = s * Math.cos(th), ny = Math.cos(phi), nz = s * Math.sin(th);
      o[0] = Math.sign(nx) * hx + nx * round;
      o[1] = Math.sign(ny) * hy + ny * round;
      o[2] = Math.sign(nz) * hz + nz * round;
    }, n * 6, n * 4, true);
  }

  /* Sweep a closed cross-section along a spine. `spine(t, out)`
     gives a point, `frame` is rebuilt per station from the
     tangent, and `section(t, a, out2)` gives the local (x, y) of
     the outline at angle a. This is the one generator the prawn,
     the chilli and the noodles are all built from. */
  function sweep(spine, section, nStations, nAround, capEnds) {
    var b = new Builder();
    var p0 = [0, 0, 0], p1 = [0, 0, 0], tan = [0, 0, 0];
    var up = [0, 1, 0], nx = [0, 0, 0], ny = [0, 0, 0], out2 = [0, 0];
    var i, j;

    for (j = 0; j <= nStations; j++) {
      var t = j / nStations;
      spine(t, p0);
      spine(Math.min(t + 1e-3, 1), p1);
      spine(Math.max(t - 1e-3, 0), tan);
      M.v3.sub(tan, p1, tan);
      M.v3.norm(tan, tan);

      /* A parallel-transport frame is overkill for spines that
         never loop; taking the reference up-vector and
         re-orthogonalising is stable for everything here, and
         degrades gracefully when the tangent goes vertical. */
      var ref = Math.abs(tan[1]) > 0.94 ? [0, 0, 1] : up;
      M.v3.cross(nx, ref, tan); M.v3.norm(nx, nx);
      M.v3.cross(ny, tan, nx); M.v3.norm(ny, ny);

      for (i = 0; i <= nAround; i++) {
        var u = i / nAround;
        section(t, (i === nAround ? 0 : u) * TAU, out2);
        b.vertex(
          p0[0] + nx[0] * out2[0] + ny[0] * out2[1],
          p0[1] + nx[1] * out2[0] + ny[1] * out2[1],
          p0[2] + nx[2] * out2[0] + ny[2] * out2[1],
          u, t
        );
      }
    }

    var row = nAround + 1;
    for (j = 0; j < nStations; j++) {
      for (i = 0; i < nAround; i++) {
        var p = j * row + i;
        b.quad(p, p + 1, p + row + 1, p + row);
      }
    }

    if (capEnds) {
      /* Fan each open end to its own centre. Without this a
         sweep is a tube you can see down, and the shadow pass —
         which culls front faces — leaks light through the hole. */
      [0, nStations].forEach(function (station) {
        var c = [0, 0, 0];
        spine(station / nStations, c);
        var ci = b.vertex(c[0], c[1], c[2], 0.5, station / nStations);
        for (var k = 0; k < nAround; k++) {
          var a = station * row + k;
          if (station === 0) b.tri(ci, a + 1, a); else b.tri(ci, a, a + 1);
        }
      });
    }
    return b;
  }

  /* ── the prawn ───────────────────────────────────────────────
     The centrepiece, and the object every other decision on this
     site is downstream of.

     A cooked, peeled, tail-on prawn is four things at once: a
     curl, a taper, six overlapping shell segments, and a fan. The
     curl is a circular arc of about 190° — enough to read as
     cooked (a raw prawn is nearly straight; heat contracts the
     abdominal muscle and pulls it into a comma) but short of the
     tight ring an overcooked one makes, which reads as rubber.

     The section is taller than it is wide, because a prawn tail is
     laterally compressed, and it is flattened underneath where the
     swimmerets were. Getting that one ratio wrong is the
     difference between a prawn and a sausage.

     The segments are cut into the radius rather than modelled as
     separate shells: each of the six bulges toward its leading
     edge and pinches at the joint behind it. The pinch is what
     catches a specular line, and the specular line is what makes
     the thing read as segmented at any distance. */

  function prawn(opt) {
    opt = opt || {};
    var curl = opt.curl === undefined ? 1 : opt.curl;      /* 0 straight … 1.2 tight */
    var girth = opt.girth === undefined ? 1 : opt.girth;
    var segs = 6;
    var nu = opt.nu || 26, nv = opt.nv || 76;

    /* The spine: an arc in XZ, opening toward -X, with the head
       end fractionally lower than the tail so the prawn sits on a
       plate rather than balancing on its middle. */
    var sweepAngle = (Math.PI * 1.06) * curl;
    var R = 1.02;
    function spine(t, o) {
      var a = -sweepAngle * 0.5 + sweepAngle * t;
      /* the radius of the curl opens out slightly toward the tail,
         which is what stops the tail crossing back over the head */
      var r = R * (1 + t * 0.13);
      o[0] = Math.cos(a) * r;
      o[2] = Math.sin(a) * r;
      o[1] = 0.30 + Math.sin(t * Math.PI) * 0.055 - t * 0.035;
    }

    /* Radius along the body.

       Two earlier versions of this were an analytic taper, and
       both came out as a horn: a long smooth cone with no moment
       where the body stops and the tail begins. A prawn does not
       do that. It holds most of its girth to about two thirds,
       falls away through the last two segments, and ends abruptly
       at a stub — the peduncle — that the fan hangs off. That
       abruptness is the whole silhouette, and it turns out to be
       much easier to state as ten numbers than to find a curve
       that happens to pass through them. */
    var PROFILE = [
      [0.00, 0.60], [0.06, 0.90], [0.18, 1.00], [0.34, 0.98], [0.50, 0.92],
      [0.64, 0.82], [0.76, 0.68], [0.86, 0.52], [0.94, 0.36], [1.00, 0.26]
    ];

    function girthAt(t) {
      var base = 0.40 * girth;
      var i = 0;
      while (i < PROFILE.length - 2 && t > PROFILE[i + 1][0]) i++;
      var a0 = PROFILE[i], a1 = PROFILE[i + 1];
      var f0 = M.sat((t - a0[0]) / (a1[0] - a0[0]));
      /* smoothstep between keys, so ten straight segments do not
         put ten creases down the back of the prawn */
      var r = base * M.lerp(a0[1], a1[1], f0 * f0 * (3 - 2 * f0));

      /* six segments: a bulge that leads and a pinch that follows,
         fading out toward the head where the meat is continuous.
         The pinch is deeper than the bulge is high, because what
         you actually see on a prawn is the groove. */
      var s = M.sat((t - 0.05) / 0.82) * segs;
      var f = s - Math.floor(s);
      var band = Math.max(0, Math.sin(f * Math.PI)) * 0.050 - Math.exp(-Math.pow(f - 0.985, 2) / 0.0009) * 0.115;
      var strength = M.smoothstep(0.02, 0.20, t) * M.smoothstep(1.0, 0.86, t);
      return r * (1 + band * strength);
    }

    function section(t, a, o) {
      var r = girthAt(t);
      var c = Math.cos(a), s = Math.sin(a);
      /* laterally compressed: narrow across, deep top to bottom */
      var x = c * r * 0.86;
      var y = s * r * 1.12;
      /* flat underside where the swimmerets sat, and a soft keel
         along the back that the highlight runs down */
      if (y < 0) y *= 0.80 - 0.10 * Math.pow(Math.abs(c), 2);
      else y *= 1 + 0.06 * Math.pow(Math.max(0, s), 3);
      o[0] = x; o[1] = y;
    }

    var b = sweep(spine, section, nv, nu, true);

    /* The tail fan. It was five separate blades to begin with,
       and at the size a prawn actually appears on this page that
       came out as two or three thin spikes — a fan whose blades
       are further apart than they are wide reads as antennae, not
       as a tail.

       It is one membrane now, scalloped into five lobes along its
       trailing edge, ribbed where the blades meet and cupped
       across its width. Short, too: a real tail fan is about one
       and a half segments long, and the first version was five. */
    var tip = [0, 0, 0], before = [0, 0, 0];
    spine(1, tip); spine(0.97, before);
    var dir = M.v3.norm([0, 0, 0], M.v3.sub([0, 0, 0], tip, before));
    var ang = Math.atan2(dir[0], dir[2]);

    var fan = parametric(function (u, v, o) {
      var spread = (u - 0.5) * 1.85;
      /* The outline is shorter at the sides and scalloped where
         the five blades meet. The scallops were deep notches in
         the first version — |sin| to the first power — and the fan
         came out as a hand of spikes. They are a twentieth of the
         length now, which is what they are on a prawn: you can
         see the blades, you cannot see between them. */
      var edge = 1 - Math.pow(Math.abs(u - 0.5) * 2, 2.2) * 0.42;
      var scallop = 1 - 0.055 * (0.5 - 0.5 * Math.cos(u * Math.PI * 10));
      var r = 0.082 + v * 0.34 * edge * scallop;
      o[0] = Math.sin(spread) * r * 1.35;
      o[2] = Math.cos(spread) * r;
      /* ribs where the blades join, and a cup across the whole fan */
      var rib = Math.pow(Math.abs(Math.sin(u * Math.PI * 5)), 8) * 0.007;
      o[1] = rib * v + Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.026 * v - v * 0.024;
    }, 34, 8, false);
    fan.remapV(0.93, 1.0).flipFaces().doubleSided();
    fan.rotateX(-0.22);
    fan.rotateY(ang);
    fan.translate(tip[0], tip[1] + 0.006, tip[2]);
    b.merge(fan);
    return b;
  }

  /* A prawn still in its shell, for the grill: the same body with
     the shell ridges deepened and a head on the front. Reads
     heavier and darker, which is what a shell-on prawn does. */
  function prawnShellOn() {
    var b = prawn({ girth: 1.06, curl: 0.92 });
    var head = parametric(function (u, v, o) {
      var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
      var r = 0.30 * (0.55 + 0.45 * Math.sin(Math.pow(v, 0.8) * Math.PI));
      o[0] = s * Math.cos(th) * r * 0.86;
      o[1] = Math.cos(phi) * r * 0.72;
      o[2] = s * Math.sin(th) * r;
      /* the rostrum — the spike over the eyes */
      o[1] += Math.pow(M.sat(1 - v * 2.4), 2) * 0.10;
    }, 18, 16, true);
    var p = [0, 0, 0];
    (function (t, o) {
      var a = -(Math.PI * 1.06 * 0.92) * 0.5;
      o[0] = Math.cos(a) * 1.02; o[2] = Math.sin(a) * 1.02; o[1] = 0.30;
    })(0, p);
    head.translate(p[0] - 0.16, p[1] + 0.02, p[2] - 0.10);
    return b.merge(head);
  }

  /* ── things prawns sit on ────────────────────────────────── */

  /* A wide coupe: flat well, a soft shoulder, a rolled rim. The
     shoulder is three rows rather than one because a single row
     puts a hard crease where the glaze highlight runs, and a hard
     crease on a curved surface is the tell of a cheap render. */
  function plate(r) {
    r = r || 1;
    return lathe([
      [0.00, 0.000], [0.42 * r, 0.000], [0.70 * r, 0.004], [0.82 * r, 0.020],
      [0.90 * r, 0.052], [0.95 * r, 0.086], [0.985 * r, 0.108], [1.00 * r, 0.118],
      [0.995 * r, 0.124], [0.96 * r, 0.112], [0.90 * r, 0.078],
      [0.86 * r, 0.040], [0.84 * r, 0.014], [0.80 * r, 0.006], [0.00, 0.004]
    ], 84);
  }

  function bowl(r) {
    r = r || 1;
    return lathe([
      [0.00, 0.000], [0.28 * r, 0.002], [0.48 * r, 0.030], [0.66 * r, 0.098],
      [0.80 * r, 0.200], [0.90 * r, 0.318], [0.97 * r, 0.430], [1.00 * r, 0.500],
      [0.985 * r, 0.512], [0.945 * r, 0.470], [0.86 * r, 0.352], [0.74 * r, 0.226],
      [0.58 * r, 0.128], [0.36 * r, 0.062], [0.00, 0.048]
    ], 76);
  }

  /* Cast iron: straight walls, a rolled lip, and a handle that is
     a swept bar rather than a cylinder, because a cast handle has
     a flat top you could put a thumb on. */
  function skillet(r) {
    r = r || 1;
    var b = lathe([
      [0.00, 0.000], [0.70 * r, 0.000], [0.86 * r, 0.026], [0.93 * r, 0.090],
      [0.96 * r, 0.190], [1.00 * r, 0.264], [1.02 * r, 0.286], [1.00 * r, 0.298],
      [0.955 * r, 0.286], [0.92 * r, 0.196], [0.885 * r, 0.086], [0.80 * r, 0.030],
      [0.00, 0.026]
    ], 72);

    var handle = sweep(function (t, o) {
      o[0] = r * (0.96 + t * 0.92);
      o[1] = 0.255 + Math.sin(t * Math.PI) * 0.055 + t * 0.020;
      o[2] = 0;
    }, function (t, a, o) {
      var w = 0.085 * (1 - t * 0.18), h = 0.048 * (1 + t * 0.35);
      var c = Math.cos(a), s = Math.sin(a);
      o[0] = c * w;
      o[1] = s * h * (s > 0 ? 0.55 : 1);   /* flat on top, rounded under */
    }, 14, 14, true);
    return b.merge(handle);
  }

  /* ── the pool ────────────────────────────────────────────────
     Butter, curry, chilli oil — every liquid on this site is this
     one surface: a disc whose rim is displaced by the same value
     noise the shader samples, domed a hair in the middle and
     lifted at the very edge into a meniscus. The meniscus is the
     whole trick: a flat disc reads as a decal, and a disc with a
     bright ring a millimetre inside its edge reads as liquid. */
  function pool(radius, seed) {
    var rnd = M.rng(seed || 7);
    var wob = [];
    for (var i = 0; i < 8; i++) wob.push(rnd() * TAU);
    function edge(a) {
      var e = 1;
      for (var k = 0; k < 4; k++) e += Math.sin(a * (k + 2) + wob[k]) * (0.055 / (k + 1));
      return e;
    }
    return parametric(function (u, v, o) {
      var a = u * TAU;
      var r = radius * edge(a) * v;
      o[0] = Math.cos(a) * r;
      o[2] = Math.sin(a) * r;
      var edgeness = M.smoothstep(0.86, 1, v);
      o[1] = 0.030 * (1 - v * v * 0.55) + edgeness * 0.016 - Math.pow(M.sat((v - 0.97) / 0.03), 2) * 0.030;
    }, 72, 16, true);
  }

  /* ── citrus ──────────────────────────────────────────────────
     A wedge is a sector of a lathe with three distinct materials
     stacked in one mesh: rind outside, pith under it, flesh
     inside. Rather than three meshes the shader reads v — 1 at the
     skin, 0 at the point — and the pith is a band in the middle,
     which is why the wedge can be one draw call. */
  function citrusWedge(len, sweepAngle) {
    len = len || 0.5;
    sweepAngle = sweepAngle || 0.78;
    var b = new Builder();
    var nA = 16, nR = 12, i, j;

    /* the curved outer face, plus the two flat cut faces */
    for (j = 0; j <= nR; j++) {
      for (i = 0; i <= nA; i++) {
        var a = (i / nA - 0.5) * sweepAngle;
        var rr = j / nR;
        /* the flesh is a rounded triangle in section; the skin
           bulges out over it */
        var r = rr * len;
        var thick = 0.19 * len * Math.sin(Math.pow(rr, 0.55) * Math.PI * 0.86) + 0.02;
        b.vertex(Math.sin(a) * r, thick, Math.cos(a) * r, i / nA, rr);
      }
    }
    var row = nA + 1;
    for (j = 0; j < nR; j++) for (i = 0; i < nA; i++) {
      var p = j * row + i;
      b.quad(p, p + 1, p + row + 1, p + row);
    }
    /* mirror for the underside */
    var under = new Builder();
    under.pos = b.pos.slice(); under.uv = b.uv.slice(); under.nrm = b.nrm.slice();
    for (var k = 0; k < b.idx.length; k += 3) under.idx.push(b.idx[k], b.idx[k + 2], b.idx[k + 1]);
    for (var q = 1; q < under.pos.length; q += 3) under.pos[q] *= -1;
    b.merge(under);

    /* the rind cap across the wide end */
    var capB = new Builder();
    for (j = 0; j <= 8; j++) {
      for (i = 0; i <= nA; i++) {
        var aa = (i / nA - 0.5) * sweepAngle;
        var vv = j / 8;
        var th = 0.19 * len * Math.sin(Math.PI * 0.86) + 0.02;
        var yy = Math.cos(vv * Math.PI) * th;
        var rr2 = len * (1 + Math.sin(vv * Math.PI) * 0.055);
        capB.vertex(Math.sin(aa) * rr2, yy, Math.cos(aa) * rr2, i / nA, 1);
      }
    }
    for (j = 0; j < 8; j++) for (i = 0; i < nA; i++) {
      var pp = j * row + i;
      capB.quad(pp, pp + row, pp + row + 1, pp + 1);
    }
    return b.merge(capB).flipFaces();
  }

  /* A round slice, for the top of a bowl. Built as a parametric
     rather than a lathe so that v is the radius — every citrus
     pattern in the shader is written against v running from the
     middle of the fruit out to the peel, and a lathe's v runs
     along the profile instead, which put the peel across the top
     face and the flesh around the edge. */
  function citrusSlice(r) {
    r = r || 0.34;
    return parametric(function (u, v, o) {
      var a = u * TAU;
      var rr, yy;
      if (v < 0.44) { rr = r * (v / 0.44); yy = 0.032 * (1 - Math.pow(v / 0.44, 2) * 0.30); }
      else if (v < 0.56) { rr = r; yy = 0.032 - ((v - 0.44) / 0.12) * 0.064; }
      else { rr = r * (1 - (v - 0.56) / 0.44); yy = -0.032; }
      o[0] = Math.cos(a) * rr;
      o[1] = yy;
      o[2] = Math.sin(a) * rr;
    }, 44, 14, true);
  }

  /* ── aromatics ───────────────────────────────────────────── */

  /* A clove: squat, not a tooth. The first version was half as
     wide as it was tall and came out looking like a tulip bulb.
     A clove of garlic is about as long as it is wide once you
     have taken the papery skin off, flattened on the two faces
     where it was pressed against its neighbours in the bulb, with
     a blunt hook at the tip and a squared-off root end. */
  function garlicClove() {
    return parametric(function (u, v, o) {
      var th = u * TAU;
      var taper = Math.pow(Math.sin(Math.pow(v, 0.68) * Math.PI), 0.42);
      var r = 0.20 * taper;
      var x = Math.cos(th) * r * 0.74;
      var z = Math.sin(th) * r;
      /* the two pressed faces */
      x *= 1 - 0.26 * Math.pow(Math.abs(Math.cos(th)), 3);
      /* the root end is cut flat rather than rounded */
      var y = (v - 0.48) * 0.42;
      if (v < 0.10) y = -0.20;
      o[0] = x + Math.pow(M.sat((v - 0.60) / 0.40), 2) * 0.055;   /* the hook */
      o[1] = y;
      o[2] = z;
    }, 22, 22, true).flipFaces();
  }

  /* Sliced garlic — the form it actually turns up in on a plate.
     Two millimetres thick, with a real edge: a flat ellipse with
     no side to it reads as a sticker on the plate, which is what
     the first one did. */
  function garlicSlice() {
    function outline(a) { return 0.125 * (1 + Math.sin(a * 2) * 0.12 + Math.sin(a * 3 + 1.1) * 0.05); }
    return parametric(function (u, v, o) {
      var a = u * TAU;
      var R = outline(a);
      /* v walks the top face out, down the rim, and back across
         the underside */
      var rr, yy;
      if (v < 0.42) { rr = R * (v / 0.42); yy = 0.020 * (1 - Math.pow(v / 0.42, 2) * 0.35); }
      else if (v < 0.58) { rr = R; yy = 0.020 - ((v - 0.42) / 0.16) * 0.040; }
      else { rr = R * (1 - (v - 0.58) / 0.42); yy = -0.020; }
      o[0] = Math.cos(a) * rr * 1.16;
      o[1] = yy;
      o[2] = Math.sin(a) * rr * 0.86;
    }, 26, 12, true);
  }

  /* A chilli: a swept cone with a wrinkled section and a stem that
     bends the other way. The wrinkles are in the mesh rather than
     the normal map because a chilli's silhouette is wrinkled — a
     smooth outline with a bumpy interior is a plastic chilli. */
  function chilli(len) {
    len = len || 1;
    var b = sweep(function (t, o) {
      o[0] = Math.sin(t * 1.5) * 0.16 * len;
      o[1] = 0.09 * len * (1 - Math.pow(t, 1.6));
      o[2] = t * len;
    }, function (t, a, o) {
      var r = 0.108 * len * Math.pow(1 - t, 0.36) * (1 - Math.pow(t, 6));
      var wrinkle = 1 + Math.sin(a * 3 + t * 2.2) * 0.10 * M.smoothstep(0.15, 0.75, t);
      o[0] = Math.cos(a) * r * wrinkle;
      o[1] = Math.sin(a) * r * wrinkle * 0.94;
    }, 22, 16, true);

    var stem = sweep(function (t, o) {
      o[0] = -Math.sin(t * 0.9) * 0.05 * len;
      o[1] = 0.09 * len + t * 0.02 * len;
      o[2] = -t * 0.22 * len;
    }, function (t, a, o) {
      var r = 0.030 * len * (1 - t * 0.45);
      o[0] = Math.cos(a) * r; o[1] = Math.sin(a) * r;
    }, 8, 10, true);
    return b.merge(stem);
  }

  /* A ring of chilli, cut across — the form that ends up scattered
     over a plate. Hollow, with the seeds left out; seeds modelled
     at this scale are three pixels of noise. */
  function chilliRing(r) {
    r = r || 0.10;
    var b = parametric(function (u, v, o) {
      var a = u * TAU;
      var wall = 0.013;
      /* v walks: outer wall down, across the bottom, inner wall up */
      var rr, yy;
      if (v < 0.42) { rr = r; yy = 0.05 * (1 - v / 0.42); }
      else if (v < 0.58) { rr = r - wall * ((v - 0.42) / 0.16); yy = 0; }
      else { rr = r - wall; yy = 0.05 * ((v - 0.58) / 0.42); }
      rr *= 1 + Math.sin(a * 3) * 0.06;
      o[0] = Math.cos(a) * rr; o[1] = yy; o[2] = Math.sin(a) * rr;
    }, 24, 10, true);
    return b;
  }

  /* A flat-leaf parsley leaflet. The first attempt modulated the
     width with a sine and got a green shard; a leaf is ovate —
     widest around two fifths along, drawn to a point — with a
     serrated edge, a short stalk at the base, and a dish along
     the midrib that is what makes one half of it catch light and
     the other hold shade. */
  function herbLeaf(size) {
    size = size || 1;
    return parametric(function (u, v, o) {
      var w = Math.sin(Math.pow(v, 0.58) * Math.PI) * 0.23;
      /* serrations, which only start once the blade has width */
      w *= 1 + Math.sin(v * Math.PI * 9) * 0.11 * Math.min(v * 3, 1);
      /* the stalk */
      var stalk = M.smoothstep(0.14, 0.02, v);
      w = w * (1 - stalk) + 0.014 * stalk;
      var x = (u - 0.5) * 2 * w;
      o[0] = x * size;
      o[2] = v * 0.56 * size;
      o[1] = (Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.038 + Math.pow(v, 2.6) * 0.055) * size;
    }, 16, 16, false).flipFaces().doubleSided();
  }

  /* Chives / spring onion, cut on the bias. */
  function scallionSlice(r) {
    r = r || 0.075;
    return parametric(function (u, v, o) {
      var a = u * TAU, wall = 0.020;
      var rr = v < 0.5 ? r : r - wall;
      var yy = (v < 0.5 ? v / 0.5 : (1 - v) / 0.5) * 0.030;
      o[0] = Math.cos(a) * rr; o[1] = yy; o[2] = Math.sin(a) * rr;
    }, 20, 8, true).flipFaces();
  }

  /* ── carbohydrate ────────────────────────────────────────── */

  /* Tempura: a blob field wrapped around a prawn silhouette. The
     crust is displaced by three octaves of the same noise the
     shader shades it with, so the bumps and the shading agree —
     mismatch there is what makes fried food look like a rock. */
  function tempuraCrust() {
    var b = prawn({ girth: 1.34, curl: 0.86, nu: 22, nv: 56 });
    var p = b.pos;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2];
      var n = M.fbm3(x * 7.5, y * 7.5, z * 7.5, 3);
      var l = Math.sqrt(x * x + z * z) || 1;
      var k = 0.055 + n * 0.075;
      p[i] += (x / l) * k * 0.55;
      p[i + 1] += (n * 0.5 + 0.2) * k;
      p[i + 2] += (z / l) * k * 0.55;
    }
    return b;
  }

  /* A single crumb of the crust, for when the tempura comes apart. */
  function crumb(seed) {
    var rnd = M.rng(seed || 3);
    var a1 = rnd() * TAU, a2 = rnd() * TAU;
    return parametric(function (u, v, o) {
      var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
      var nx = s * Math.cos(th), ny = Math.cos(phi), nz = s * Math.sin(th);
      var r = 0.055 * (1 + Math.sin(th * 3 + a1) * 0.28 + Math.sin(phi * 4 + a2) * 0.22);
      o[0] = nx * r * 1.25; o[1] = ny * r * 0.80; o[2] = nz * r;
    }, 12, 10, true);
  }

  /* Linguine: a flat ribbon swept along a wandering curve, with a
     twist so it catches light down its length the way pasta does. */
  function noodle(len, seed, twist) {
    var rnd = M.rng(seed || 11);
    var ax = rnd() * TAU, az = rnd() * TAU, k = 1.4 + rnd() * 1.4;
    return sweep(function (t, o) {
      o[0] = Math.sin(t * TAU * 0.72 + ax) * 0.30 * len + (t - 0.5) * len * 0.55;
      o[1] = Math.sin(t * 7 + az) * 0.016 + 0.012;
      o[2] = Math.cos(t * TAU * k + az) * 0.26 * len;
    }, function (t, a, o) {
      var w = 0.056, h = 0.0075;
      var tw = a + t * (twist === undefined ? 5.2 : twist);
      o[0] = Math.cos(tw) * w; o[1] = Math.sin(tw) * h;
    }, 40, 8, true);
  }

  /* A nest of them, baked into one mesh: the pasta moves as one
     ingredient, so it should cost one draw call. */
  function noodleNest(count, radius, seed) {
    var b = new Builder(), rnd = M.rng(seed || 21);
    for (var i = 0; i < count; i++) {
      var n = noodle(0.62 + rnd() * 0.34, (seed || 21) + i * 7, 3 + rnd() * 5);
      n.rotateY(rnd() * TAU);
      var a = rnd() * TAU, r = Math.sqrt(rnd()) * radius;
      /* a nest is wound flat and heaped in the middle, not tipped
         out of a box — the vertical spread is a fifth of what the
         first version had, and it is biased toward the centre */
      n.translate(Math.cos(a) * r, (1 - r / radius) * 0.055 + rnd() * 0.020, Math.sin(a) * r);
      b.merge(n);
    }
    return b;
  }

  /* Rice: individual grains, baked into a mound. Three hundred
     capsules is a lot of triangles for something two centimetres
     across on screen, and it is still the cheapest way to get the
     one thing a displaced dome cannot give you — a silhouette
     made of grains. */
  function riceMound(count, radius, seed) {
    var b = new Builder(), rnd = M.rng(seed || 31);
    var grain = parametric(function (u, v, o) {
      var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
      var r = 0.0125 * Math.pow(Math.sin(Math.pow(v, 0.85) * Math.PI), 0.35);
      o[0] = s * Math.cos(th) * r;
      o[1] = (v - 0.5) * 0.098;
      o[2] = s * Math.sin(th) * r;
    }, 6, 6, true).flipFaces();
    for (var i = 0; i < count; i++) {
      var g = new Builder();
      g.pos = grain.pos.slice(); g.uv = grain.uv.slice();
      g.nrm = grain.nrm.slice(); g.idx = grain.idx.slice();
      g.rotateX(rnd() * TAU); g.rotateY(rnd() * TAU); g.rotateZ(rnd() * TAU);
      var a = rnd() * TAU, rr = Math.pow(rnd(), 0.62) * radius;
      var dome = Math.cos((rr / radius) * Math.PI * 0.5);
      g.translate(Math.cos(a) * rr, dome * 0.13 * rnd() + 0.012, Math.sin(a) * rr);
      b.merge(g);
    }
    return b;
  }

  /* Toast: a slab with an irregular crumb face and a crust edge
     that stands slightly proud of it. */
  function toast(w, d) {
    w = w || 0.62; d = d || 0.46;
    var b = parametric(function (u, v, o) {
      var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
      var nx = s * Math.cos(th), ny = Math.cos(phi), nz = s * Math.sin(th);
      var hx = w / 2 - 0.05, hy = 0.055, hz = d / 2 - 0.05;
      var bump = 1 + M.fbm3(nx * 4, ny * 4, nz * 4, 2) * 0.16;
      o[0] = Math.sign(nx) * hx + nx * 0.05 * bump;
      o[1] = Math.sign(ny) * hy + ny * 0.05 * bump;
      o[2] = Math.sign(nz) * hz + nz * 0.05 * bump;
    }, 30, 22, true);
    return b;
  }

  /* ── the small things ────────────────────────────────────────
     Flakes, seeds and cracked pepper. Individually they are three
     pixels; collectively they are the difference between a plate
     and a render of a plate. All of them bake into one mesh,
     because they are one ingredient. */
  function scatter(kind, count, radius, seed) {
    var b = new Builder(), rnd = M.rng(seed || 41);
    for (var i = 0; i < count; i++) {
      /* drawn before the generator runs, not inside it — parametric
         calls back immediately, so a size sampled after the call
         is still undefined when the vertices are written and the
         whole scatter comes out NaN */
      var size = 0.6 + rnd() * 0.8;
      var piece;
      if (kind === 'flake') {
        piece = parametric(function (u, v, o) {
          var a = u * TAU;
          var r = 0.030 * size * v;
          o[0] = Math.cos(a) * r * 1.4; o[2] = Math.sin(a) * r * 0.7;
          o[1] = Math.sin(v * Math.PI) * 0.006;
        }, 8, 3, true);
      } else if (kind === 'seed') {
        piece = parametric(function (u, v, o) {
          var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
          o[0] = s * Math.cos(th) * 0.028 * size;
          o[1] = Math.cos(phi) * 0.010 * size;
          o[2] = s * Math.sin(th) * 0.019 * size;
        }, 8, 6, true);
      } else {
        piece = parametric(function (u, v, o) {
          var phi = v * Math.PI, th = u * TAU, s = Math.sin(phi);
          var r = 0.016 * size * (1 + Math.sin(th * 3) * 0.4 + Math.sin(phi * 5) * 0.3);
          o[0] = s * Math.cos(th) * r; o[1] = Math.cos(phi) * r; o[2] = s * Math.sin(th) * r;
        }, 7, 6, true);
      }
      piece.rotateY(rnd() * TAU);
      piece.rotateX((rnd() - 0.5) * 0.9);
      var a2 = rnd() * TAU, r2 = Math.sqrt(rnd()) * radius;
      piece.translate(Math.cos(a2) * r2, 0.004 + rnd() * 0.012, Math.sin(a2) * r2);
      b.merge(piece);
    }
    return b;
  }

  /* ── hard goods ──────────────────────────────────────────── */

  function skewer(len) {
    len = len || 2.2;
    return sweep(function (t, o) {
      o[0] = 0; o[1] = 0; o[2] = (t - 0.5) * len;
    }, function (t, a, o) {
      var r = 0.024 * (1 - Math.pow(M.sat((t - 0.86) / 0.14), 2) * 0.9);
      o[0] = Math.cos(a) * r; o[1] = Math.sin(a) * r * 0.82;
    }, 12, 8, true);
  }

  /* A pat of butter, and the same pat half gone. */
  function butterPat() {
    return roundedBox(0.24, 0.11, 0.20, 0.035, 5);
  }

  /* The table. One big plane; everything about it — the grain, the
     sheen, the fall-off into the dark — happens in the shader. It
     is subdivided because the shadow of a plate landing on four
     vertices is a shadow landing on nothing. */
  function table(size) {
    size = size || 26;
    return parametric(function (u, v, o) {
      o[0] = (u - 0.5) * size; o[1] = 0; o[2] = (v - 0.5) * size;
    }, 24, 24, false).flipFaces();
  }

  /* A rolled linen napkin — one soft cylinder with a fold, used
     once, in the location section's table setting. */
  function napkin() {
    return sweep(function (t, o) {
      o[0] = 0; o[1] = 0.06 + Math.sin(t * Math.PI) * 0.012; o[2] = (t - 0.5) * 0.9;
    }, function (t, a, o) {
      var r = 0.062 * (1 + Math.sin(a * 2 + t) * 0.10) * (1 - Math.pow(Math.abs(t - 0.5) * 2, 4) * 0.25);
      o[0] = Math.cos(a) * r * 1.2; o[1] = Math.sin(a) * r * 0.75;
    }, 16, 14, true);
  }

  SHRIM.K = {
    Builder: Builder,
    parametric: parametric, lathe: lathe, sphere: sphere,
    cylinder: cylinder, roundedBox: roundedBox, sweep: sweep,

    prawn: prawn, prawnShellOn: prawnShellOn,
    plate: plate, bowl: bowl, skillet: skillet, pool: pool,
    citrusWedge: citrusWedge, citrusSlice: citrusSlice,
    garlicClove: garlicClove, garlicSlice: garlicSlice,
    chilli: chilli, chilliRing: chilliRing,
    herbLeaf: herbLeaf, scallionSlice: scallionSlice,
    tempuraCrust: tempuraCrust, crumb: crumb,
    noodle: noodle, noodleNest: noodleNest,
    riceMound: riceMound, toast: toast,
    scatter: scatter, skewer: skewer, butterPat: butterPat,
    table: table, napkin: napkin
  };

})(window);
