/* ═══════════════════════════════════════════════════════════
   build.js — the model builder.

   There is no downloaded aircraft in this project. Every one of
   the eight is lofted at runtime from the numbers in fleet.js,
   in metres, in one coordinate system:

       −Z  nose          +Z  tail
       +X  right wing    −X  left wing
        Y  up, zero on the fuselage centreline

   Longitudinal positions arrive as fractions of overall length
   measured from the nose, because that is how a three-view is
   read; `zAt()` is the only place that converts.

   Control surfaces are separate meshes hung on pivots built
   from their own hinge lines, so a swept flap rotates about the
   axis it actually rotates about rather than about the model's
   X axis. That detail is the difference between a flap that
   extends and a flap that shears.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { quality, clamp, lerp, deg, damp } from './core.js';
import { liveryTextures } from './livery.js';

/* ── airfoil ─────────────────────────────────────────────── */

/* NACA four-digit thickness over an aft-loaded camber line —
   the cheapest shape that still reads as a transonic wing:
   nearly flat on top, with the curvature pushed to the back. */
function airfoil(x, thick) {
  x = clamp(x, 0, 1);
  const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x +
                          0.2843 * x * x * x - 0.1015 * x * x * x * x);
  const camber = 0.055 * Math.pow(x, 1.5) * (1 - x) + 0.010 * Math.sin(Math.PI * Math.pow(x, 0.75));
  return [camber + yt, camber - yt];
}

/* ── geometry helpers ────────────────────────────────────── */

function geomFrom(positions, indices, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/* Mirroring by negating X alone leaves the winding order — and
   therefore every normal — inside out, which lights the left
   wing as if the sun were under it. Reversing each triangle and
   flipping normal.x fixes both at once, for the cost of one
   clone. */
export function mirrorGeometry(src) {
  const g = src.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  const idx = g.index;
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

/* ── lifting-surface factory ─────────────────────────────── */

/* A `surface` knows, for any spanwise station t and chord
   fraction c, exactly where that point is in aircraft space.
   The wing, the fin and the tailplane are all the same object
   with a different frame; every fixed panel and every moving
   control surface is then a rectangle cut out of that (t, c)
   domain, which is what keeps flaps aligned with the wing they
   came from. */
function makeSurface(cfg) {
  const {
    span, rootChord, tipChord, sweep, dihedral, twist,
    origin, kink = 0.34, kinkChord = 0.66,
    thickRoot = 0.135, thickTip = 0.095, vertical = false, flexFn = null
  } = cfg;

  const tanSweep = Math.tan(sweep * deg);
  const tanDi = Math.tan(dihedral * deg);

  const chordAt = (t) =>
    t < kink
      ? lerp(rootChord, rootChord * kinkChord, t / kink)
      : lerp(rootChord * kinkChord, tipChord, (t - kink) / (1 - kink));

  const surf = {
    span, chordAt, vertical,
    thickAt: (t) => lerp(thickRoot, thickTip, t),

    /* Leading-edge point and local frame at station t. */
    frame(t) {
      const s = t * span;
      const chord = chordAt(t);
      const le = new THREE.Vector3();
      if (vertical) {
        le.set(origin.x, origin.y + s, origin.z + tanSweep * s);
      } else {
        const flex = flexFn ? flexFn(t) : 0;
        le.set(origin.x + s, origin.y + tanDi * s + flex, origin.z + tanSweep * s);
      }
      return { le, chord, twist: twist * t, thick: surf.thickAt(t) };
    },

    /* A point on the skin. `side` is +1 upper / −1 lower;
       side 0 returns the mean line, which is what hinges use. */
    point(t, c, side, out = new THREE.Vector3()) {
      const f = surf.frame(t);
      const [up, lo] = airfoil(c, f.thick);
      const off = side > 0 ? up : side < 0 ? lo : (up + lo) * 0.5;
      const a = -f.twist * deg;
      const dz = (c - 0.25) * f.chord;
      const dn = off * f.chord;
      const rz = dz * Math.cos(a) - dn * Math.sin(a);
      const rn = dz * Math.sin(a) + dn * Math.cos(a);
      const qz = f.le.z + 0.25 * f.chord;
      if (vertical) out.set(f.le.x + rn, f.le.y, qz + rz);
      else out.set(f.le.x, f.le.y + rn, qz + rz);
      return out;
    }
  };
  return surf;
}

/* Cut a closed panel out of a surface's (t, c) domain. */
function panelGeometry(surf, t0, t1, c0, c1, nSpan, nChord, opts = {}) {
  const { capTip = true, capRoot = false, sharpTE = true, xform = null } = opts;
  const pos = [], uv = [], idx = [];
  const v = new THREE.Vector3();
  const rows = nSpan + 1;

  /* Chord samples are cosine-clustered so the leading edge —
     where curvature is highest — gets the vertices. */
  const cs = [];
  for (let j = 0; j <= nChord; j++) {
    const u = j / nChord;
    cs.push(c0 + (c1 - c0) * (0.5 - 0.5 * Math.cos(Math.PI * u)));
  }
  const cols = cs.length;

  const push = (t, c, side) => {
    surf.point(t, c, side, v);
    if (xform) v.applyMatrix4(xform);
    pos.push(v.x, v.y, v.z);
    uv.push(c, t);
  };

  for (let i = 0; i <= nSpan; i++) {
    const t = lerp(t0, t1, i / nSpan);
    for (let j = 0; j < cols; j++) push(t, cs[j], 1);      /* upper */
    for (let j = 0; j < cols; j++) push(t, cs[cols - 1 - j], -1); /* lower, reversed */
  }
  const ring = cols * 2;

  for (let i = 0; i < nSpan; i++) {
    const a = i * ring, b = (i + 1) * ring;
    for (let j = 0; j < ring; j++) {
      const j2 = (j + 1) % ring;
      if (sharpTE && (j === cols - 1 || j2 === 0)) {
        /* the two seams where upper meets lower */
      }
      idx.push(a + j, b + j, a + j2, a + j2, b + j, b + j2);
    }
  }

  const capRing = (rowIndex, flip) => {
    const base = rowIndex * ring;
    const centre = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < ring; j++) {
      cx += pos[(base + j) * 3]; cy += pos[(base + j) * 3 + 1]; cz += pos[(base + j) * 3 + 2];
    }
    pos.push(cx / ring, cy / ring, cz / ring);
    uv.push(0.5, flip ? 0 : 1);
    for (let j = 0; j < ring; j++) {
      const j2 = (j + 1) % ring;
      if (flip) idx.push(centre, base + j2, base + j);
      else idx.push(centre, base + j, base + j2);
    }
  };
  if (capRoot) capRing(0, true);
  if (capTip) capRing(nSpan, false);

  return geomFrom(pos, idx, uv);
}

const _hingeX = new THREE.Vector3(1, 0, 0);
const _hingeQ = new THREE.Quaternion();

/* A moving control surface: geometry baked into the frame of
   its own hinge line, so one call to `deflect()` is the whole
   deflection, regardless of how the hinge is swept.

   The mirror is the subtle part. Reflecting the right-hand
   surface through x = 0 gives a matrix with determinant −1,
   which Object3D cannot hold without inverting every normal.
   Splitting the reflection instead — a proper basis
   (Rx·axis, Rx·y, −Rx·z) on the pivot, and a z-flip baked into
   the geometry — reproduces exactly the same shape with the
   winding intact. The cost is that a positive rotation now
   deflects the two surfaces in opposite physical directions,
   which is why every deflection below carries an explicit
   sign. */
function hingeBasis(axis, upHint) {
  const zAxis = new THREE.Vector3().crossVectors(axis, upHint).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, axis).normalize();
  return { axis, yAxis, zAxis };
}

function flipZGeometry(src) {
  const g = src.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -p.getZ(i));
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setZ(i, -n.getZ(i));
  const idx = g.index;
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

function controlSurface(surf, t0, t1, c0, c1, nSpan, nChord, material, opts = {}) {
  const p0 = surf.point(t0, c0, 0);
  const p1 = surf.point(t1, c0, 0);
  const axis = p1.clone().sub(p0).normalize();
  const upHint = surf.vertical ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const { yAxis, zAxis } = hingeBasis(axis, upHint);

  const basis = new THREE.Matrix4().makeBasis(axis, yAxis, zAxis).setPosition(p0);
  const geo = panelGeometry(surf, t0, t1, c0, c1, nSpan, nChord,
    { ...opts, xform: basis.clone().invert() });

  const build = (g, m) => {
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = mesh.receiveShadow = true;
    const pivot = new THREE.Group();
    m.decompose(pivot.position, pivot.quaternion, pivot.scale);
    pivot.add(mesh);
    return {
      pivot, mesh,
      base: pivot.position.clone(),
      frame: pivot.quaternion.clone(),

      /* Deflection has to be composed onto the hinge frame, not
         written into `rotation.x`. The pivot's own orientation is
         a full three-axis rotation — a swept hinge with dihedral,
         and on the mirrored side very nearly a half turn — and
         assigning one Euler component silently discards the other
         two. That is a flap which is correct at 35° and folded
         through the wing at 0°. */
      deflect(rad) {
        pivot.quaternion.copy(this.frame).multiply(_hingeQ.setFromAxisAngle(_hingeX, rad));
      },
      /* Fowler motion: the panel slides aft and down along its
         own hinge frame before it rotates, which is what a
         tracked flap actually does and what makes the wing look
         like it grows rather than just bends. */
      slide(aft, down) {
        pivot.position.copy(this.base).add(
          new THREE.Vector3(0, -down, aft * this.sign).applyQuaternion(this.frame));
      }
    };
  };

  const right = build(geo, basis);

  /* the same surface on the other wing */
  const mAxis = new THREE.Vector3(-axis.x, axis.y, axis.z);
  const mY = new THREE.Vector3(-yAxis.x, yAxis.y, yAxis.z);
  const mZ = new THREE.Vector3(zAxis.x, -zAxis.y, -zAxis.z);
  const mBasis = new THREE.Matrix4()
    .makeBasis(mAxis, mY, mZ)
    .setPosition(new THREE.Vector3(-p0.x, p0.y, p0.z));
  const left = build(flipZGeometry(geo), mBasis);

  right.sign = 1; left.sign = -1;
  return { right, left, axis, p0 };
}

/* ── the builder ─────────────────────────────────────────── */

export function buildAircraft(type, opts = {}) {
  const { spec, geo } = type;
  const detail = opts.detail || 'full';           /* 'full' | 'lod' */
  const lod = detail === 'lod';

  const L = spec.length;
  const semi = spec.span / 2;
  const RW = geo.fuseW / 2, RH = geo.fuseH / 2;
  const zAt = (f) => (f - 0.5) * L;               /* fraction from nose → z */

  const segLen = lod ? 30 : quality.fuselageSegments;
  const segRad = lod ? 14 : quality.radialSegments;

  const tex = liveryTextures(type);
  const M = materials(tex, lod);

  const group = new THREE.Group();
  group.name = type.id;
  const parts = {};
  const hotspots = [];
  const anim = {
    flap: 0, slat: 0, gear: 1, aileron: 0, elevator: 0, rudder: 0,
    spoiler: 0, n1: 0, reverse: 0, flex: 0, doorOpen: 0, spin: 0
  };

  /* ── fuselage ──────────────────────────────────────────
     A superellipse swept along a drooping, upswept centreline.
     The exponent opens from a near-circle in the mid-body to a
     flatter oval over the nose (which is where a flight deck
     physically fits) and, on the A380, to a tall double-bubble
     that is 8.41 m from keel to crown. */

  const centreline = (f) => {
    /* nose droop and tail upsweep, in metres */
    let y = 0;
    if (f < geo.noseLen) {
      const u = 1 - f / geo.noseLen;
      y -= RH * 0.16 * u * u;
    }
    const tailStart = 1 - geo.tailLen;
    if (f > tailStart) {
      const u = (f - tailStart) / geo.tailLen;
      y += RH * geo.tailUp * u * u * u;
    }
    return y;
  };

  const halfW = (f) => {
    if (f < geo.noseLen) {
      const u = f / geo.noseLen;
      return RW * Math.pow(Math.sin(u * Math.PI * 0.5), 0.62);
    }
    const tailStart = 1 - geo.tailLen;
    if (f > tailStart) {
      const u = (f - tailStart) / geo.tailLen;
      return RW * (1 - (1 - geo.tailPinch) * Math.pow(u, 2.1));
    }
    return RW;
  };

  const halfH = (f) => halfW(f) * (RH / RW);

  /* Cross-section exponent: 2 is an ellipse, larger is boxier. */
  const shapeExp = (f) => (geo.decks === 2 ? 2.35 : lerp(2.5, 2.05, clamp(f / geo.noseLen, 0, 1)));

  {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segLen; i++) {
      /* Stations clustered toward both ends where curvature lives. */
      const s = i / segLen;
      const f = 0.5 - 0.5 * Math.cos(Math.PI * s);
      const z = zAt(f), cy = centreline(f);
      const hw = halfW(f), hh = halfH(f), n = shapeExp(f);
      for (let j = 0; j <= segRad; j++) {
        const a = (j / segRad) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const px = hw * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n);
        let py = hh * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n);
        /* the A380's lower lobe is wider than its upper one */
        if (geo.decks === 2 && ca < 0) py *= 1.04;
        pos.push(px, cy + py, z);
        uv.push(f, j / segRad);
      }
    }
    const ring = segRad + 1;
    for (let i = 0; i < segLen; i++) {
      for (let j = 0; j < segRad; j++) {
        const a = i * ring + j, b = (i + 1) * ring + j;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = geomFrom(pos, idx, uv);
    const fuselage = new THREE.Mesh(g, M.skin);
    fuselage.castShadow = fuselage.receiveShadow = true;
    fuselage.name = 'fuselage';
    fuselage.userData.component = 'cabin';
    group.add(fuselage);
    parts.fuselage = fuselage;
  }

  /* Flight-deck glass: a shell a few centimetres proud of the
     nose, so it catches its own highlight instead of being a
     dark rectangle painted on the paint. */
  {
    const pos = [], idx = [];
    const f0 = geo.noseLen * 0.40, f1 = geo.noseLen * 0.94;
    const rows = 6, cols = 10;
    for (let i = 0; i <= rows; i++) {
      const f = lerp(f0, f1, i / rows);
      const hw = halfW(f) * 1.012, hh = halfH(f) * 1.012, cy = centreline(f);
      const n = shapeExp(f);
      /* window band hugs the upper flanks, narrowing forward */
      const spread = lerp(0.30, 0.86, i / rows);
      for (let j = 0; j <= cols; j++) {
        const u = (j / cols) * 2 - 1;
        const a = u * spread + Math.PI * 0;
        const ca = Math.cos(a * 0.9), sa = Math.sin(a * 0.9);
        const px = hw * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n);
        const py = hh * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n);
        pos.push(px, cy + py * 0.99 + RH * 0.06, zAt(f));
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j, b = (i + 1) * (cols + 1) + j;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const glass = new THREE.Mesh(geomFrom(pos, idx, null), M.glass);
    glass.name = 'flightdeck-glass';
    group.add(glass);
    parts.deckGlass = glass;
  }

  /* ── wing ──────────────────────────────────────────────── */

  const wingRootY = -geo.wingLow * RH;
  const wingSurf = makeSurface({
    span: semi,
    rootChord: geo.rootChord * L,
    tipChord: geo.tipChord * L,
    sweep: geo.sweep,
    dihedral: geo.dihedral,
    twist: geo.twist,
    origin: new THREE.Vector3(0, wingRootY, zAt(geo.wingLE)),
    thickRoot: 0.145, thickTip: 0.095,
    flexFn: (t) => anim.flex * semi * 0.075 * t * t
  });

  const nSpanW = lod ? 10 : 26;
  const nChordW = lod ? 6 : 14;
  const wingBox = { c0: 0.150, c1: 0.715 };
  const S = geo.surfaces;

  const wings = new THREE.Group();
  wings.name = 'wings';
  group.add(wings);
  parts.wings = wings;

  const mkPair = (geoR, mat, name, component) => {
    const r = new THREE.Mesh(geoR, mat);
    const l = new THREE.Mesh(mirrorGeometry(geoR), mat);
    r.castShadow = l.castShadow = r.receiveShadow = l.receiveShadow = true;
    r.name = name + '-r'; l.name = name + '-l';
    if (component) r.userData.component = l.userData.component = component;
    return [r, l];
  };

  {
    const g = panelGeometry(wingSurf, 0.03, 1.0, wingBox.c0, wingBox.c1, nSpanW, nChordW, { capRoot: true });
    const [r, l] = mkPair(g, M.wing, 'wing', 'wing');
    wings.add(r, l);
    parts.wingR = r; parts.wingL = l;
  }

  /* wing-root fairing — the belly bulge that hides the wing box */
  {
    const fl = geo.rootChord * L * 1.42;
    const z0 = zAt(geo.wingLE) - fl * 0.12;
    const g = new THREE.CapsuleGeometry(RW * 0.62, fl * 0.62, 4, lod ? 8 : 14);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, M.skin);
    m.position.set(0, wingRootY + RH * 0.10, z0 + fl * 0.42);
    m.scale.set(1.34, 0.78, 1);
    m.castShadow = m.receiveShadow = true;
    m.name = 'wing-fairing';
    group.add(m);
  }

  /* ── moving surfaces on the wing ───────────────────────── */

  const movers = { flapIn: [], flapOut: [], aileron: [], slat: [], spoiler: [] };

  const addPair = (bucket, t0, t1, c0, c1, ns, nc, component) => {
    const cs = controlSurface(wingSurf, t0, t1, c0, c1, ns, nc, M.wing, { capRoot: true, capTip: true });
    for (const half of [cs.right, cs.left]) {
      if (component) half.mesh.userData.component = component;
      wings.add(half.pivot);
      bucket.push(half);
    }
  };

  addPair(movers.flapIn,  S.flapIn[0],  S.flapIn[1],  wingBox.c1 - 0.015, 1.0, lod ? 3 : 6, lod ? 4 : 8, 'flaps');
  addPair(movers.flapOut, S.flapOut[0], S.flapOut[1], wingBox.c1 - 0.015, 1.0, lod ? 3 : 6, lod ? 4 : 8, 'flaps');
  addPair(movers.aileron, S.aileron[0], S.aileron[1], wingBox.c1 - 0.015, 1.0, lod ? 3 : 5, lod ? 4 : 7, 'aileron');
  addPair(movers.slat,    S.slats[0],   S.slats[1],   0.0, wingBox.c0 + 0.016, lod ? 6 : 14, lod ? 5 : 10, 'flaps');

  /* spoiler panels sit flush on the upper skin */
  {
    const n = lod ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const t0 = lerp(S.spoilers[0], S.spoilers[1], i / n) + 0.006;
      const t1 = lerp(S.spoilers[0], S.spoilers[1], (i + 1) / n) - 0.006;
      addPair(movers.spoiler, t0, t1, 0.60, wingBox.c1 - 0.004, 2, 4);
    }
  }

  /* flap-track fairings — the teardrops slung under every wing,
     which reach a long way past the trailing edge because that
     is where the flap ends up when it is out */
  if (!lod) {
    const stations = [S.flapIn[0] + 0.035, (S.flapIn[0] + S.flapIn[1]) / 2, S.flapIn[1] - 0.025,
                      S.flapOut[0] + 0.045, S.flapOut[1] - 0.045];
    for (const t of stations) {
      const front = wingSurf.point(t, 0.52, -1);
      const back = wingSurf.point(t, 1.02, -1);
      const chord = wingSurf.chordAt(t);
      const len = back.z - front.z;
      const r = chord * 0.055;
      const g = new THREE.CapsuleGeometry(r, Math.max(len * 0.72, r * 2.2), 4, 10);
      g.rotateX(Math.PI / 2);
      g.scale(0.85, 0.80, 1);
      for (const sx of [1, -1]) {
        const m = new THREE.Mesh(g, M.wing);
        m.name = 'flap-track-fairing';
        m.position.set(front.x * sx, (front.y + back.y) * 0.5 - r * 0.55, (front.z + back.z) * 0.5);
        m.castShadow = true;
        wings.add(m);
      }
    }
  }

  /* ── wingtip devices ─────────────────────────────────────
     A sharklet is a continuation of the wing, not a plate bolted
     to the end of it: its own aerofoil section, its own taper,
     its own sweep, canted outboard from vertical. Building it
     from the same lofting code as the wing costs less than a box
     would and gets the silhouette — the part a viewer actually
     recognises — right. */
  {
    const tip = wingSurf.frame(1);
    const chord = tip.chord;
    const style = geo.wingTip;
    /* height above the tip, blade sweep, and lean from vertical */
    const P = {
      sharklet: { h: 1.55, sweep: 42, cant: 16, taper: 0.34 },
      curved:   { h: 1.30, sweep: 46, cant: 24, taper: 0.30 },
      winglet:  { h: 1.05, sweep: 38, cant: 28, taper: 0.40 },
      fence:    { h: 0.55, sweep: 26, cant:  6, taper: 0.62 }
    }[style] || { h: 1.2, sweep: 40, cant: 18, taper: 0.35 };

    const mkBlade = (hScale, up, taper) => {
      const surf = makeSurface({
        span: chord * P.h * hScale,
        rootChord: chord * 0.92,
        tipChord: chord * taper,
        sweep: P.sweep, dihedral: 0, twist: 0, vertical: true,
        kink: 0.99, kinkChord: 0.99, thickRoot: 0.10, thickTip: 0.075,
        origin: new THREE.Vector3(0, 0, 0)
      });
      const g = panelGeometry(surf, 0, 1, 0, 1, lod ? 5 : 10, lod ? 5 : 9, { capRoot: true });
      /* lean outboard (−Z rotation carries +Y toward +X), then
         flip for a lower blade, then hang it off the tip */
      const tilt = new THREE.Matrix4().makeRotationZ(-P.cant * deg);
      if (!up) tilt.premultiply(new THREE.Matrix4().makeScale(1, -1, 1));
      g.applyMatrix4(tilt);
      g.translate(tip.le.x - chord * 0.01, tip.le.y, tip.le.z + chord * 0.02);
      g.computeVertexNormals();
      return g;
    };

    const blades = [[mkBlade(1, true, P.taper), M.tail]];
    if (style === 'fence') blades.push([mkBlade(0.85, false, P.taper), M.tail]);
    if (style === 'winglet') blades.push([mkBlade(0.42, false, 0.5), M.tail]);

    for (const [g, mat] of blades) {
      const r = new THREE.Mesh(g, mat);
      const l = new THREE.Mesh(mirrorGeometry(g), mat);
      r.name = l.name = 'wingtip-device';
      r.castShadow = l.castShadow = true;
      r.userData.component = l.userData.component = 'wing';
      wings.add(r, l);
    }
  }

  /* ── empennage ─────────────────────────────────────────── */

  const finSurf = makeSurface({
    span: geo.vStabH * L,
    rootChord: geo.vStabRoot * L,
    tipChord: geo.vStabTip * L,
    sweep: geo.vStabSweep,
    dihedral: 0, twist: 0, vertical: true,
    kink: 0.99, kinkChord: 0.99,
    thickRoot: 0.12, thickTip: 0.09,
    origin: new THREE.Vector3(0, centreline(geo.vStabLE) + halfH(geo.vStabLE) * 0.92, zAt(geo.vStabLE))
  });
  {
    const g = panelGeometry(finSurf, 0, 1, 0, 0.70, lod ? 5 : 12, lod ? 5 : 10, { capRoot: true });
    const fin = new THREE.Mesh(g, M.tail);
    fin.castShadow = fin.receiveShadow = true;
    fin.name = 'fin';
    group.add(fin);
    parts.fin = fin;

    const rud = controlSurface(finSurf, 0.01, 0.99, 0.685, 1.0, lod ? 4 : 9, lod ? 4 : 7, M.tail, { capRoot: true });
    rud.right.mesh.userData.component = 'rudder';
    group.add(rud.right.pivot);
    parts.rudder = rud.right;
  }

  const tailSurf = makeSurface({
    span: (geo.hStabSpan * L) / 2,
    rootChord: geo.hStabRoot * L,
    tipChord: geo.hStabTip * L,
    sweep: geo.hStabSweep,
    dihedral: 5,
    twist: 0,
    kink: 0.99, kinkChord: 0.99,
    thickRoot: 0.11, thickTip: 0.09,
    origin: new THREE.Vector3(0, centreline(geo.hStabLE) + halfH(geo.hStabLE) * 0.25, zAt(geo.hStabLE))
  });
  {
    const g = panelGeometry(tailSurf, 0.0, 1, 0, 0.615, lod ? 5 : 11, lod ? 5 : 9, { capRoot: true });
    const [r, l] = mkPair(g, M.wing, 'tailplane');
    group.add(r, l);
    parts.tailplaneR = r;

    const elev = controlSurface(tailSurf, 0.02, 0.99, 0.605, 1.0, lod ? 4 : 8, lod ? 4 : 6, M.wing, { capRoot: true });
    elev.right.mesh.userData.component = elev.left.mesh.userData.component = 'elevator';
    group.add(elev.right.pivot, elev.left.pivot);
    parts.elevator = [elev.right, elev.left];
  }

  /* ── engines ───────────────────────────────────────────── */

  const engines = [];
  const nacLen = geo.nacL * L, nacDia = geo.nacD * L;

  for (let e = 0; e < geo.engY.length; e++) {
    const t = geo.engY[e];
    const f = wingSurf.frame(t);
    const chord = f.chord;
    const inletZ = f.le.z - geo.engFwd * L;
    const yPos = f.le.y - geo.engDrop * L;
    const scale = e === 1 ? 0.94 : 1;             /* outboard pods sit slightly smaller in frame */
    for (const sx of [1, -1]) {
      const pod = buildNacelle({
        length: nacLen * scale, dia: nacDia * scale, fanDia: spec.fanDia,
        M, lod, pylonUp: geo.engDrop * L, pylonZ: f.le.z + chord * 0.16 - inletZ
      });
      pod.group.position.set(f.le.x * sx, yPos, inletZ + nacLen * scale * 0.5);
      pod.group.userData.component = 'engine';
      wings.add(pod.group);
      engines.push(pod);
      hotspots.push({
        id: 'engine', label: 'ENGINE',
        position: new THREE.Vector3(f.le.x * sx + nacDia * 0.6 * sx, yPos, inletZ + nacLen * 0.2)
      });
    }
  }
  parts.engines = engines;

  /* ── landing gear ──────────────────────────────────────── */

  const gearGroup = new THREE.Group();
  gearGroup.name = 'gear';
  group.add(gearGroup);

  const wheelR = L * (geo.decks === 2 ? 0.0175 : semi > 25 ? 0.0165 : 0.0215);
  const legs = [];

  {
    const nz = zAt(geo.gearNose.z);
    const nLen = geo.gearNose.len * L;
    const leg = buildGearLeg({
      M, lod, wheels: 2, wheelR: wheelR * 0.78, strutLen: nLen,
      bogie: false, nose: true
    });
    leg.group.position.set(0, centreline(geo.gearNose.z) - halfH(geo.gearNose.z) * 0.92, nz);
    leg.retractAxis = new THREE.Vector3(1, 0, 0);
    leg.retractAngle = 1.55;                       /* forward into the bay */
    gearGroup.add(leg.group);
    legs.push(leg);
    parts.gearNose = leg;
    hotspots.push({ id: 'gear', label: 'NOSE GEAR', position: new THREE.Vector3(0, leg.group.position.y - nLen * 0.5, nz) });
  }

  {
    const gm = geo.gearMain;
    const mz = zAt(gm.z);
    const mLen = gm.len * L;
    const mx = gm.y * semi * 2 * 0.5 + RW * 0.28;
    for (const sx of [1, -1]) {
      const leg = buildGearLeg({
        M, lod, wheels: gm.wheels, wheelR, strutLen: mLen, bogie: gm.wheels > 2
      });
      leg.group.position.set(mx * sx, wingRootY - RH * 0.10, mz);
      leg.retractAxis = new THREE.Vector3(0, 0, sx);
      leg.retractAngle = 1.5;                      /* inboard into the belly */
      gearGroup.add(leg.group);
      legs.push(leg);
      hotspots.push({
        id: 'gear', label: 'MAIN GEAR',
        position: new THREE.Vector3(mx * sx * 1.25, wingRootY - mLen * 0.6, mz)
      });
    }
    if (gm.body) {
      for (const sx of [1, -1]) {
        const leg = buildGearLeg({ M, lod, wheels: gm.body, wheelR, strutLen: mLen * 0.97, bogie: true });
        leg.group.position.set(gm.bodyY * L * sx, -RH * 0.86, zAt(gm.bodyZ));
        leg.retractAxis = new THREE.Vector3(1, 0, 0);
        leg.retractAngle = 1.5;
        gearGroup.add(leg.group);
        legs.push(leg);
      }
    }
    if (gm.centre) {
      const leg = buildGearLeg({ M, lod, wheels: 4, wheelR, strutLen: mLen * 0.96, bogie: true });
      leg.group.position.set(0, -RH * 0.90, zAt(gm.z + 0.012));
      leg.retractAxis = new THREE.Vector3(1, 0, 0);
      leg.retractAngle = 1.5;
      gearGroup.add(leg.group);
      legs.push(leg);
    }
  }
  parts.gearLegs = legs;

  /* Ground clearance: the lowest wheel contact defines where the
     aircraft sits, and every stage positions it by this number. */
  let lowest = 0;
  for (const leg of legs) lowest = Math.min(lowest, leg.group.position.y - leg.height);
  const groundY = -lowest;

  /* ── doors ─────────────────────────────────────────────── */

  const doors = [];
  if (!lod) {
    for (const [f, label] of geo.doors) {
      const hw = halfW(f), hh = halfH(f), cy = centreline(f);
      const dh = Math.min(RH * 0.92, 1.95), dw = 1.05;
      for (const sx of [1, -1]) {
        const g = new THREE.BoxGeometry(0.10, dh, dw, 1, 2, 2);
        const m = new THREE.Mesh(g, M.door);
        const pivot = new THREE.Group();
        const yTop = cy + (geo.decks === 2 ? -hh * 0.28 : hh * 0.20);
        pivot.position.set(hw * 0.985 * sx, yTop, zAt(f) - dw * 0.5);
        m.position.set(0, 0, dw * 0.5);
        pivot.add(m);
        pivot.userData = { component: 'door', label, sx };
        m.userData.component = 'door';
        m.castShadow = true;
        group.add(pivot);
        doors.push({ pivot, sx });
        if (sx === 1) {
          hotspots.push({ id: 'door', label, position: new THREE.Vector3(hw * 1.4, yTop, zAt(f)) });
        }
      }
    }
  }
  parts.doors = doors;

  hotspots.push({ id: 'wing', label: 'WING', position: wingSurf.point(0.55, 0.35, 1).clone().add(new THREE.Vector3(0, 1.2, 0)) });
  hotspots.push({ id: 'flaps', label: 'FLAPS', position: wingSurf.point(0.30, 0.95, 1).clone().add(new THREE.Vector3(0, 0.8, 0)) });
  hotspots.push({ id: 'aileron', label: 'AILERON', position: wingSurf.point(0.86, 0.95, 1).clone().add(new THREE.Vector3(0, 0.6, 0)) });
  hotspots.push({ id: 'rudder', label: 'RUDDER', position: finSurf.point(0.5, 0.85, 1).clone().add(new THREE.Vector3(1.2, 0, 0)) });
  hotspots.push({ id: 'elevator', label: 'ELEVATOR', position: tailSurf.point(0.6, 0.85, 1).clone().add(new THREE.Vector3(0, 0.6, 0)) });
  hotspots.push({ id: 'apu', label: 'APU', position: new THREE.Vector3(0, centreline(0.985), zAt(0.985)) });
  hotspots.push({ id: 'cockpit', label: 'FLIGHT DECK', position: new THREE.Vector3(0, centreline(geo.noseLen * 0.7) + halfH(geo.noseLen * 0.7), zAt(geo.noseLen * 0.75)) });

  /* ── animation ─────────────────────────────────────────── */

  const target = { ...anim };

  /* Flap and slat travel in degrees, so the model shows the real
     angles rather than a pleasing guess: flaps run to 35°, slats
     to 27°, ailerons ±25°, elevator ±20°, rudder ±25°, spoilers
     to 45° when used as ground spoilers. */
  const cRoot = geo.rootChord * L;
  const setSurfaces = () => {
    for (const m of movers.flapIn) {
      m.deflect(anim.flap * 35 * deg * m.sign);
      m.slide(anim.flap * cRoot * 0.135, anim.flap * cRoot * 0.028);
    }
    for (const m of movers.flapOut) {
      m.deflect(anim.flap * 33 * deg * m.sign);
      m.slide(anim.flap * cRoot * 0.115, anim.flap * cRoot * 0.024);
    }
    for (const m of movers.slat) {
      m.deflect(-anim.slat * 27 * deg * m.sign);
      m.slide(-anim.slat * cRoot * 0.055, anim.slat * cRoot * 0.020);
    }
    for (const m of movers.spoiler) m.deflect(-anim.spoiler * 38 * deg * m.sign);

    /* Ailerons are antisymmetric, and the mirrored hinge frame
       already carries that inversion — so both take the same
       local sign and come out opposed in the world. */
    for (const m of movers.aileron) m.deflect(-anim.aileron * 25 * deg);

    if (parts.rudder) parts.rudder.deflect(anim.rudder * 25 * deg);
    if (parts.elevator) for (const h of parts.elevator) h.deflect(anim.elevator * 20 * deg * h.sign);
  };

  const setGear = () => {
    for (const leg of legs) {
      const stowed = 1 - anim.gear;
      leg.group.quaternion.setFromAxisAngle(leg.retractAxis, stowed * leg.retractAngle);
      leg.group.visible = anim.gear > 0.02;
      leg.setCompression(anim.gear > 0.98 ? (anim.compression || 0) : 0);
      leg.spin(anim.wheelSpin || 0);
    }
  };

  const api = {
    type, group, spec, geo, L, semi, parts, hotspots, anim, target,
    groundY, wingSurf, finSurf, tailSurf, zAt,
    materials: M, textures: tex, movers,

    /* Approach every animated quantity exponentially so that a
       state change made in one frame still takes the physical
       time the real surface would take. */
    update(dt, opts = {}) {
      const rate = opts.instant ? 1e3 : 1;
      anim.flap = damp(anim.flap, target.flap, 1.1 * rate, dt);
      anim.slat = damp(anim.slat, target.slat, 1.4 * rate, dt);
      anim.gear = damp(anim.gear, target.gear, 0.55 * rate, dt);
      anim.aileron = damp(anim.aileron, target.aileron, 7 * rate, dt);
      anim.elevator = damp(anim.elevator, target.elevator, 7 * rate, dt);
      anim.rudder = damp(anim.rudder, target.rudder, 5 * rate, dt);
      anim.spoiler = damp(anim.spoiler, target.spoiler, 4 * rate, dt);
      anim.reverse = damp(anim.reverse, target.reverse, 1.6 * rate, dt);
      anim.n1 = damp(anim.n1, target.n1, 0.7 * rate, dt);
      anim.flex = damp(anim.flex, target.flex, 1.2 * rate, dt);
      anim.doorOpen = damp(anim.doorOpen, target.doorOpen, 1.5 * rate, dt);

      setSurfaces();
      setGear();

      anim.spin += dt * (0.25 + anim.n1 * 42);
      for (const e of engines) e.update(anim, dt);
      for (const d of doors) d.pivot.rotation.y = -anim.doorOpen * 1.5 * d.sx;
    },

    setDetail() {},
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const k in M) M[k].dispose?.();
      for (const k in tex) tex[k].dispose?.();
    }
  };

  api.update(0.016, { instant: true });
  return api;
}

/* ── nacelle ─────────────────────────────────────────────── */

function buildNacelle({ length, dia, fanDia, M, lod, pylonUp, pylonZ }) {
  const g = new THREE.Group();
  const R = dia / 2;
  const seg = lod ? 12 : 28;

  /* Cowl profile: the lip is the widest point and it sits a few
     per cent aft of the inlet plane. That overhang is what makes
     a turbofan read as a turbofan rather than as a tube, and it
     is the first thing missing from every simplified model. */
  const profile = [];
  const stations = [
    [0.000, 0.815], [0.018, 0.930], [0.045, 0.985], [0.085, 1.000],
    [0.220, 0.996], [0.400, 0.972], [0.560, 0.930], [0.700, 0.872],
    [0.820, 0.812], [0.910, 0.762], [1.000, 0.720]
  ];
  for (const [u, r] of stations) profile.push(new THREE.Vector2(R * r, (u - 0.5) * length));
  const cowlGeo = new THREE.LatheGeometry(profile, seg);
  cowlGeo.rotateX(Math.PI / 2);          /* lathe spins about Y; the engine points along Z */
  const cowl = new THREE.Mesh(cowlGeo, M.nacelle);
  cowl.name = 'nacelle';
  cowl.castShadow = cowl.receiveShadow = true;
  cowl.userData.component = 'engine';
  g.add(cowl);

  /* The inlet throat, drawn inward from behind the lip. Without
     it the nacelle is a ring you can see the sky through. */
  const inner = [];
  for (const [u, r] of [[0.020, 0.790], [0.070, 0.735], [0.180, 0.715], [0.420, 0.720], [0.470, 0.740]]) {
    inner.push(new THREE.Vector2(R * r, (u - 0.5) * length));
  }
  const ductGeo = new THREE.LatheGeometry(inner, seg);
  ductGeo.rotateX(Math.PI / 2);
  const duct = new THREE.Mesh(ductGeo, M.ductInner);
  g.add(duct);

  /* fan — the face a viewer looks straight into */
  const fan = new THREE.Group();
  fan.position.z = -length * 0.24;
  const fanR = Math.min(R * 0.715, fanDia / 2);
  const bladeCount = lod ? 12 : 22;
  const bladeGeo = new THREE.BoxGeometry(fanR * 0.80, fanR * 0.235, fanR * 0.038);
  bladeGeo.translate(fanR * 0.55, 0, 0);
  for (let i = 0; i < bladeCount; i++) {
    const b = new THREE.Mesh(bladeGeo, M.blade);
    b.rotation.z = (i / bladeCount) * Math.PI * 2;
    b.rotateOnAxis(new THREE.Vector3(1, 0, 0), 0.72);
    fan.add(b);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(fanR * 1.02, seg), M.ductInner);
  disc.position.z = fanR * 0.16;
  fan.add(disc);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(fanR * 0.19, fanR * 0.66, lod ? 8 : 16), M.blade);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -fanR * 0.34;
  fan.add(spinner);
  g.add(fan);

  /* exhaust: core nozzle and plug, both proud of the cowl */
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.46, R * 0.40, length * 0.30, seg, 1, true), M.exhaust);
  core.rotation.x = Math.PI / 2;
  core.position.z = length * 0.58;
  g.add(core);
  const plug = new THREE.Mesh(new THREE.ConeGeometry(R * 0.33, length * 0.28, lod ? 10 : 20), M.exhaust);
  plug.rotation.x = -Math.PI / 2;
  plug.position.z = length * 0.80;
  g.add(plug);

  /* reverser band: translates aft to open the cascades */
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.935, R * 0.875, length * 0.20, seg, 1, true), M.reverser);
  band.rotation.x = Math.PI / 2;
  band.position.z = length * 0.16;
  g.add(band);
  const cascade = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.90, R * 0.90, length * 0.13, seg, 1, true), M.cascade);
  cascade.rotation.x = Math.PI / 2;
  cascade.position.z = length * 0.055;
  g.add(cascade);

  /* pylon up to the wing */
  /* pylon: a tapered blade, thicker and deeper where it meets
     the wing than where it meets the cowl */
  {
    const h = Math.max(pylonUp * 0.92 - R * 0.55 + 0.25, dia * 0.20);
    const t0 = dia * 0.105, t1 = dia * 0.070;
    const c0 = length * 0.86, c1 = length * 0.52;
    const zc = length * 0.12;
    const pos = [], idx = [];
    for (let i = 0; i < 2; i++) {
      const y = i === 0 ? R * 0.55 : R * 0.55 + h;
      const t = i === 0 ? t1 : t0, c = i === 0 ? c1 : c0;
      const zf = i === 0 ? zc : zc + length * 0.10;
      for (const [dx, dz] of [[-t / 2, -c / 2], [t / 2, -c / 2], [t / 2, c / 2], [-t / 2, c / 2]]) {
        pos.push(dx, y, zf + dz);
      }
    }
    for (let j = 0; j < 4; j++) {
      const a = j, b = (j + 1) % 4;
      idx.push(a, b, a + 4, b, b + 4, a + 4);
    }
    idx.push(0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7);
    const pylon = new THREE.Mesh(geomFrom(pos, idx, null), M.wing);
    pylon.name = 'pylon';
    pylon.castShadow = true;
    g.add(pylon);
  }

  return {
    group: g, fan, band, cascade,
    update(anim) {
      fan.rotation.z = anim.spin;
      band.position.z = length * (0.20 + anim.reverse * 0.16);
      cascade.visible = anim.reverse > 0.02;
      M.exhaustGlow && (M.exhaustGlow.opacity = anim.n1);
    }
  };
}

/* ── landing gear leg ────────────────────────────────────── */

function buildGearLeg({ M, lod, wheels, wheelR, strutLen, bogie, nose }) {
  const g = new THREE.Group();
  const seg = lod ? 8 : 16;
  const strutR = wheelR * 0.30;

  const strut = new THREE.Mesh(new THREE.CylinderGeometry(strutR, strutR * 0.86, strutLen, seg), M.strut);
  strut.name = 'gear-strut';
  strut.position.y = -strutLen / 2;
  strut.castShadow = true;
  strut.userData.component = 'gear';
  g.add(strut);

  const oleo = new THREE.Mesh(new THREE.CylinderGeometry(strutR * 0.72, strutR * 0.72, strutLen * 0.34, seg), M.oleo);
  const oleoGroup = new THREE.Group();
  oleoGroup.position.y = -strutLen * 0.80;
  oleo.position.y = strutLen * 0.02;
  oleoGroup.add(oleo);
  g.add(oleoGroup);

  /* side stay */
  const stay = new THREE.Mesh(new THREE.CylinderGeometry(strutR * 0.36, strutR * 0.36, strutLen * 0.82, 8), M.strut);
  stay.name = 'gear-stay';
  stay.position.set(strutLen * 0.20, -strutLen * 0.44, 0);
  stay.rotation.z = 0.44;
  g.add(stay);

  /* torque link */
  const link = new THREE.Mesh(new THREE.BoxGeometry(strutR * 0.30, strutLen * 0.30, strutR * 0.9), M.strut);
  link.position.set(0, -strutLen * 0.60, strutR * 1.05);
  link.rotation.x = 0.30;
  g.add(link);

  const axleY = -strutLen;
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.80, lod ? 12 : 22);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.48, wheelR * 0.48, wheelR * 0.86, lod ? 10 : 18);
  hubGeo.rotateZ(Math.PI / 2);

  const axles = [];
  const pairs = Math.max(1, Math.round(wheels / 2));
  const bogieLen = wheelR * 2.25 * (pairs - 1);

  if (bogie && pairs > 1) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 0.55, wheelR * 0.42, bogieLen + wheelR * 1.1), M.strut);
    beam.position.set(0, axleY, 0);
    beam.castShadow = true;
    g.add(beam);
  }

  for (let p = 0; p < pairs; p++) {
    const z = pairs === 1 ? 0 : -bogieLen / 2 + (p * bogieLen) / (pairs - 1);
    for (const sx of [1, -1]) {
      const w = new THREE.Mesh(wheelGeo, M.tyre);
      w.position.set(sx * wheelR * 0.62, axleY, z);
      w.castShadow = true;
      w.userData.component = 'gear';
      const h = new THREE.Mesh(hubGeo, M.hub);
      h.position.copy(w.position);
      g.add(w, h);
      axles.push(w, h);
    }
  }

  void nose;

  return {
    group: g,
    height: strutLen + wheelR,
    setCompression(c) { oleoGroup.position.y = -strutLen * 0.80 + c * strutLen * 0.06; },
    spin(a) { for (const w of axles) w.rotation.x = a; }
  };
}

/* ── materials ───────────────────────────────────────────── */

function materials(tex, lod) {
  const Skin = lod || quality.tier < 2 ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const painted = (map, extra = {}) => {
    const p = {
      map, roughness: 0.42, metalness: 0.05,
      envMapIntensity: 0.85, ...extra
    };
    if (Skin === THREE.MeshPhysicalMaterial) { p.clearcoat = 0.45; p.clearcoatRoughness = 0.34; }
    return new Skin(p);
  };

  const skin = painted(tex.hull, {
    emissiveMap: tex.hullLit, emissive: 0xffffff, emissiveIntensity: 0
  });
  const wing = painted(tex.wing, { roughness: 0.30 });
  const tail = painted(tex.tail, { roughness: 0.32 });

  return {
    skin, wing, tail,
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0a1420, roughness: 0.06, metalness: 0.30,
      transmission: 0, opacity: 0.94, transparent: true,
      envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.02
    }),
    door: new Skin({ color: 0xf2f4f7, roughness: 0.34, metalness: 0.06 }),
    nacelle: painted(tex.nacelle),
    ductInner: new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.55, metalness: 0.3, side: THREE.BackSide }),
    blade: new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.24, metalness: 0.95, envMapIntensity: 1.6 }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: 0.42, metalness: 0.85 }),
    reverser: painted(tex.nacelle, { color: 0xdfe3e8 }),
    cascade: new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.7, metalness: 0.4 }),
    strut: new THREE.MeshStandardMaterial({ color: 0xa9b2ba, roughness: 0.32, metalness: 0.92, envMapIntensity: 1.3 }),
    oleo: new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.10, metalness: 1.0, envMapIntensity: 2.0 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.92, metalness: 0.02 }),
    hub: new THREE.MeshStandardMaterial({ color: 0x7d858d, roughness: 0.40, metalness: 0.85 })
  };
}
