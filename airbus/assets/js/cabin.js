/* ═══════════════════════════════════════════════════════════
   cabin.js — the inside of the tube.

   Built from the same cross-section the exterior was lofted
   from, so the sidewall you lean against in here is the same
   curve you looked at out there, and the windows line up with
   the ones painted on the hull. Seats are instanced: an A321
   cabin is 220 of them and they cost one draw call.

   The layout comes from the fuselage width — a 3.7 m tube gets
   2-3, a 3.95 m tube 3-3, a 5.6 m tube 2-4-2 and the A380's
   main deck 3-4-3 — which is how those aircraft are actually
   laid out and why they feel different to stand in.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { quality, clamp, lerp, makeRandom } from './core.js';

function layoutFor(width) {
  if (width < 3.8) return { groups: [2, 3], pitch: 0.813, seatW: 0.475 };
  if (width < 4.6) return { groups: [3, 3], pitch: 0.787, seatW: 0.457 };
  if (width < 5.8) return { groups: [2, 4, 2], pitch: 0.813, seatW: 0.457 };
  if (width < 6.4) return { groups: [3, 3, 3], pitch: 0.813, seatW: 0.457 };
  return { groups: [3, 4, 3], pitch: 0.838, seatW: 0.470 };
}

function trimTexture(seed = 3) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#d9dde3';
  x.fillRect(0, 0, S, S);
  const rnd = makeRandom(seed);
  /* a fine speckle so the sidewall is not a flat fill under a
     light that is right next to it */
  for (let i = 0; i < 14000; i++) {
    const a = 0.03 + rnd() * 0.05;
    x.fillStyle = `rgba(90,100,115,${a})`;
    x.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 3);
  return t;
}

function fabricTexture(seed = 9) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#152840';
  x.fillRect(0, 0, S, S);
  const rnd = makeRandom(seed);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(${40 + rnd() * 60 | 0},${70 + rnd() * 70 | 0},${120 + rnd() * 90 | 0},0.30)`;
    x.fillRect(rnd() * S, rnd() * S, 2, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let TRIM = null, FABRIC = null;

/* One seat: base, cushion, back, headrest, armrests. Small
   enough to instance, detailed enough to read at arm's length. */
function seatGeometry(w, lod) {
  const parts = [];
  const push = (g, tx, ty, tz, rx = 0) => {
    if (rx) g.rotateX(rx);
    g.translate(tx, ty, tz);
    parts.push(g);
  };
  const seg = lod ? 1 : 2;
  push(new THREE.BoxGeometry(w * 0.92, 0.10, 0.50, seg, 1, seg), 0, 0.42, 0);
  push(new THREE.BoxGeometry(w * 0.90, 0.56, 0.10, seg, seg, 1), 0, 0.74, 0.26, -0.10);
  push(new THREE.BoxGeometry(w * 0.60, 0.18, 0.09), 0, 1.06, 0.29);
  push(new THREE.BoxGeometry(0.055, 0.07, 0.44), -w * 0.46, 0.50, 0.02);
  push(new THREE.BoxGeometry(0.055, 0.07, 0.44), w * 0.46, 0.50, 0.02);
  push(new THREE.BoxGeometry(w * 0.30, 0.40, 0.05), 0, 0.20, 0.16);

  /* merge by hand: mergeGeometries lives in the examples folder,
     which this project does not vendor */
  let vCount = 0, iCount = 0;
  for (const g of parts) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3); nor.set(n.array, vo * 3); uv.set(u.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function buildCabin(ac, { lod = false } = {}) {
  TRIM ||= trimTexture();
  FABRIC ||= fabricTexture();

  const { geo, spec, L } = ac;
  const RW = geo.fuseW / 2, RH = geo.fuseH / 2;
  const zAt = (f) => (f - 0.5) * L;
  const lay = layoutFor(geo.fuseW);
  const twinDeck = geo.decks === 2;

  /* Floor sits below the centreline by enough to leave a hold
     under it — which is exactly why a cabin floor is not on the
     axis of the tube. */
  const floorY = twinDeck ? -RH * 0.30 : -RH * 0.36;
  const ceilY = floorY + (twinDeck ? 2.24 : 2.26);
  const halfW = RW * 0.955;

  const g = new THREE.Group();
  g.name = 'cabin';
  const colliders = [];

  const front = geo.winStart - 0.015;
  const back = geo.winEnd + 0.010;
  const z0 = zAt(front), z1 = zAt(back);
  const len = z1 - z0;

  /* The sidewall is a one-sided loft whose normals point out of
     the tube, so from a seat it would simply not be there. */
  const trim = new THREE.MeshStandardMaterial({
    map: TRIM, color: 0xeef1f5, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.86 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x1c2634, roughness: 0.97 });
  const fabric = new THREE.MeshStandardMaterial({ map: FABRIC, roughness: 0.92, metalness: 0.0 });
  const strip = new THREE.MeshBasicMaterial({ color: 0x9cc4ee });
  const winGlass = new THREE.MeshBasicMaterial({ color: 0xdfeeff });

  /* ── shell: floor, curved sidewalls, ceiling ──────────── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, len), carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, floorY, (z0 + z1) / 2);
  floor.receiveShadow = true;
  g.add(floor);

  {
    /* the sidewall follows the same superellipse the hull does */
    const rows = lod ? 6 : 12;
    const pos = [], idx = [], uv = [];
    const n = twinDeck ? 2.35 : 2.2;
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= rows; i++) {
        const t = i / rows;
        /* sweep from the floor edge up over the shoulder to the
           bin line */
        const a = lerp(Math.PI * 0.62, Math.PI * 0.14, t);
        const px = side * RW * 0.985 * Math.pow(Math.abs(Math.sin(a)), 2 / n);
        const py = RH * 0.985 * Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 2 / n);
        for (const z of [z0, z1]) {
          pos.push(px, clamp(py, floorY, ceilY + 0.3), z);
          uv.push(t, (z - z0) / len);
        }
      }
      for (let i = 0; i < rows; i++) {
        const a0 = base + i * 2;
        if (side > 0) idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
        else idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
    }
    const wall = new THREE.BufferGeometry();
    wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wall.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    wall.setIndex(idx);
    wall.computeVertexNormals();
    const m = new THREE.Mesh(wall, trim);
    m.receiveShadow = true;
    g.add(m);
  }

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 1.15, len), trim);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilY, (z0 + z1) / 2);
  g.add(ceiling);

  /* the light cove, which is what makes a cabin photograph well */
  for (const side of [1, -1]) {
    const cove = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.035, len * 0.98), strip);
    cove.position.set(side * halfW * 0.50, ceilY - 0.03, (z0 + z1) / 2);
    g.add(cove);
  }

  /* ── overhead bins ────────────────────────────────────── */
  for (const side of [1, -1]) {
    const binW = halfW * (lay.groups.length > 2 ? 0.42 : 0.52);
    const bin = new THREE.Mesh(new THREE.BoxGeometry(binW, 0.42, len * 0.985), trim);
    bin.position.set(side * (halfW - binW * 0.46), ceilY - 0.30, (z0 + z1) / 2);
    bin.castShadow = !lod;
    g.add(bin);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, len * 0.985), dark);
    lip.position.set(side * (halfW - binW * 0.94), ceilY - 0.32, (z0 + z1) / 2);
    g.add(lip);
  }
  if (lay.groups.length > 2) {
    const cw = halfW * 0.52;
    const bin = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.40, len * 0.985), trim);
    bin.position.set(0, ceilY - 0.22, (z0 + z1) / 2);
    g.add(bin);
  }

  /* ── windows ──────────────────────────────────────────── */
  {
    const pitch = 0.813;
    const count = Math.floor(len / pitch);
    const wm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.24, 0.34), winGlass, count * 2);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    let i = 0;
    for (let k = 0; k < count; k++) {
      const z = z0 + 0.5 + k * pitch;
      for (const side of [1, -1]) {
        p.set(side * (halfW - 0.012), floorY + 1.16, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side > 0 ? -Math.PI / 2 : Math.PI / 2);
        m4.compose(p, q, s);
        wm.setMatrixAt(i++, m4);
      }
    }
    wm.count = i;
    wm.instanceMatrix.needsUpdate = true;
    g.add(wm);
    ac.cabinWindows = wm;
  }

  /* ── seats ────────────────────────────────────────────── */
  {
    const geoSeat = seatGeometry(lay.seatW, lod);
    const aisleW = 0.50;
    const totalSeats = lay.groups.reduce((a, b) => a + b, 0);
    const seatsW = totalSeats * lay.seatW;
    const aisles = lay.groups.length - 1;
    const used = seatsW + aisles * aisleW;
    let x = -used / 2;

    const columns = [];
    for (let gi = 0; gi < lay.groups.length; gi++) {
      for (let s = 0; s < lay.groups[gi]; s++) {
        columns.push(x + lay.seatW / 2);
        x += lay.seatW;
      }
      if (gi < lay.groups.length - 1) { columns.push(null); x += aisleW; }
    }
    const seatX = columns.filter((c) => c !== null);
    const aisleX = [];
    let ax = -used / 2;
    for (let gi = 0; gi < lay.groups.length; gi++) {
      ax += lay.groups[gi] * lay.seatW;
      if (gi < lay.groups.length - 1) { aisleX.push(ax + aisleW / 2); ax += aisleW; }
    }

    const rows = Math.max(4, Math.floor((len - 3.2) / lay.pitch));
    const im = new THREE.InstancedMesh(geoSeat, fabric, rows * seatX.length);
    im.castShadow = !lod;
    im.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const z = z1 - 1.6 - r * lay.pitch;
      for (const sx of seatX) {
        p.set(sx, floorY, z);
        m4.compose(p, q, one);
        im.setMatrixAt(i++, m4);
      }
    }
    im.count = i;
    im.instanceMatrix.needsUpdate = true;
    g.add(im);

    /* Seat blocks are one collider per bank per row-run rather
       than per seat: 220 cylinders would be tested every frame
       for no visible gain. */
    let bank = [];
    for (let c = 0; c < seatX.length; c++) {
      bank.push(seatX[c]);
      const isEnd = c === seatX.length - 1 || aisleX.some((a) => a > seatX[c] && a < seatX[c + 1]);
      if (isEnd) {
        const lo = Math.min(...bank) - lay.seatW / 2, hi = Math.max(...bank) + lay.seatW / 2;
        colliders.push({
          type: 'box', x: (lo + hi) / 2, z: (z0 + z1) / 2,
          hx: (hi - lo) / 2, hz: len / 2 - 1.4,
          y0: floorY, y1: floorY + 1.25
        });
        bank = [];
      }
    }

    ac.cabinAisles = aisleX;
    ac.cabinRows = rows;
    ac.cabinSeats = i;
  }

  /* ── ends: galley, lavatories, flight-deck door ───────── */
  const bulk = (z, label) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 2.1, 0.10), trim);
    w.position.set(0, floorY + 1.05, z);
    g.add(w);
    colliders.push({ type: 'box', x: 0, z, hx: halfW, hz: 0.12, y0: floorY, y1: floorY + 2.1 });
    void label;
  };

  const doorZ = z0 - 0.9;
  bulk(doorZ - 1.6);
  const deckDoor = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.95, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.5, metalness: 0.25 }));
  deckDoor.position.set(0, floorY + 0.98, doorZ - 1.63);
  deckDoor.userData.component = 'cockpit';
  g.add(deckDoor);

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x2b8cff }));
  sign.position.set(0, floorY + 2.02, doorZ - 1.57);
  g.add(sign);

  /* galley units either side of the forward vestibule */
  for (const side of [1, -1]) {
    const gal = new THREE.Mesh(new THREE.BoxGeometry(halfW * 0.55, 1.95, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.7 }));
    gal.position.set(side * halfW * 0.66, floorY + 0.98, doorZ - 0.7);
    g.add(gal);
    colliders.push({ type: 'box', x: side * halfW * 0.66, z: doorZ - 0.7, hx: halfW * 0.28, hz: 0.48, y0: floorY, y1: floorY + 2 });
  }

  bulk(z1 + 0.5);

  /* the tube itself, so nobody walks out through the sidewall */
  for (const side of [1, -1]) {
    colliders.push({ type: 'box', x: side * (halfW + 0.5), z: (z0 + z1) / 2, hx: 0.5, hz: len / 2 + 2, y0: floorY - 1, y1: ceilY });
  }

  /* A cabin sits inside a shadow-casting tube, so the sun does
     not reach it. These are the ceiling coves and the wash they
     throw, which is the only light in here. */
  {
    g.add(new THREE.HemisphereLight(0xd2e2f5, 0x1a2230, 0.85));
    const n = Math.max(2, Math.round(len / 9));
    for (let i = 0; i < n; i++) {
      const z = lerp(z0 + 2, z1 - 2, n === 1 ? 0.5 : i / (n - 1));
      const l = new THREE.PointLight(0xdbe9ff, 2.6, 11, 1.7);
      l.position.set(0, ceilY - 0.22, z);
      g.add(l);
    }
  }

  g.userData = {
    floorY, ceilY, z0, z1,
    entryZ: null,
    deckDoorZ: doorZ - 1.63,
    aisles: ac.cabinAisles,
    colliders
  };
  return g;
}
