/* Maps are lists of axis-aligned boxes ("brushes") and nothing else.
 *
 * That constraint is the whole performance story. Collision is box-vs-box
 * with a grid broadphase, the nav graph can be derived by sampling floor
 * surfaces, and the renderer can weld every static brush into a handful of
 * buffers because they never move. Slopes are built as stairs — with a
 * 0.55 unit step-up the player walks them without noticing, and they read
 * honestly as steps rather than pretending to be ramps.
 *
 * A brush is stored as min-corner + size, because floors and walls are
 * easier to author that way than from centres.
 */

import { PLAYER_HEIGHT, PLAYER_RADIUS, STEP_HEIGHT } from '../constants.js';

let brushId = 0;

export class MapBuilder {
  constructor(meta) {
    Object.assign(this, meta);
    this.brushes = [];
    this.spawns = [];
    this.lights = [];
    this._mirrorMark = 0;
  }

  /* x,y,z is the minimum corner; w,h,d the size along X,Y,Z. */
  box(x, y, z, w, h, d, color, opts = {}) {
    const b = {
      id: brushId++, x, y, z, w, h, d, color,
      solid: opts.solid !== false,
      visible: opts.visible !== false,
      tag: opts.tag || '',
      /* Emissive brushes skip lighting and glow — used for strip lights,
         screens and team markers. */
      glow: opts.glow || 0,
      /* Transparent brushes (glass) are drawn last and never block shots. */
      alpha: opts.alpha === undefined ? 1 : opts.alpha,
      shootThrough: opts.shootThrough || false,
      /* Kept out of the navigation sampler. Roofs are the main case: they
         are walkable-looking top faces that would otherwise generate a
         whole phantom floor plan above the map. */
      noNav: opts.noNav || opts.tag === 'roof',
      top: opts.top || null,   // override colour of the +Y face
    };
    this.brushes.push(b);
    return b;
  }

  /* A floor slab: footprint in the XZ plane, `y` is its top surface. */
  floor(x, z, w, d, y, color, opts) {
    return this.box(x, y - 0.4, z, w, 0.4, d, color, opts);
  }

  /* A floor with rectangular holes punched in it. The rectangle is split
     on every hole edge and the covered cells are dropped, which is how
     stairwells and light wells get built without hand-fitting slabs. A
     staircase under an unbroken slab has no headroom, and the symptom is
     a whole upper storey the navigation graph quietly discards. */
  slab(x, z, w, d, y, color, holes = [], opts) {
    const xs = [x, x + w], zs = [z, z + d];
    for (const h of holes) {
      for (const v of [h.x, h.x + h.w]) if (v > x && v < x + w) xs.push(v);
      for (const v of [h.z, h.z + h.d]) if (v > z && v < z + d) zs.push(v);
    }
    xs.sort((a, b) => a - b); zs.sort((a, b) => a - b);
    const ux = [...new Set(xs.map((v) => +v.toFixed(4)))];
    const uz = [...new Set(zs.map((v) => +v.toFixed(4)))];
    for (let i = 0; i < ux.length - 1; i++) {
      for (let j = 0; j < uz.length - 1; j++) {
        const cw = ux[i + 1] - ux[i], cd = uz[j + 1] - uz[j];
        if (cw < 1e-4 || cd < 1e-4) continue;
        const mx = ux[i] + cw / 2, mz = uz[j] + cd / 2;
        if (holes.some((h) => mx > h.x && mx < h.x + h.w && mz > h.z && mz < h.z + h.d)) continue;
        this.floor(ux[i], uz[j], cw, cd, y, color, opts);
      }
    }
  }

  /* A wall standing on `y`, `h` tall. */
  wall(x, z, w, d, y, h, color, opts) {
    return this.box(x, y, z, w, h, d, color, opts);
  }

  /* Stairs climbing along +X/-X/+Z/-Z. `rise` is total height gained. */
  stairs(x, y, z, w, d, rise, dir, color, opts) {
    const steps = Math.max(2, Math.round(rise / 0.34));
    const stepH = rise / steps;
    const along = dir === '+x' || dir === '-x' ? w : d;
    const stepL = along / steps;
    for (let i = 0; i < steps; i++) {
      const h = stepH * (i + 1);
      if (dir === '+x') this.box(x + i * stepL, y, z, stepL + 0.01, h, d, color, opts);
      else if (dir === '-x') this.box(x + w - (i + 1) * stepL, y, z, stepL + 0.01, h, d, color, opts);
      else if (dir === '+z') this.box(x, y, z + i * stepL, w, h, stepL + 0.01, color, opts);
      else this.box(x, y, z + d - (i + 1) * stepL, w, h, stepL + 0.01, color, opts);
    }
  }

  /* Four walls with a gap left where `open` names a side. */
  room(x, z, w, d, y, h, t, color, open = '', opts) {
    const has = (s) => !open.includes(s);
    if (has('n')) this.wall(x, z, w, t, y, h, color, opts);
    if (has('s')) this.wall(x, z + d - t, w, t, y, h, color, opts);
    if (has('w')) this.wall(x, z, t, d, y, h, color, opts);
    if (has('e')) this.wall(x + w - t, z, t, d, y, h, color, opts);
  }

  /* A wall with a doorway punched through the middle of it. */
  /* gapH is 3.0, not head height. A doorway only tall enough to stand in
     silently blocks the step-up retry in the movement code, so anyone
     climbing a stair that starts under it stops dead on the first step. */
  doorway(x, z, w, d, y, h, color, gap = 3, gapH = 3.0, opts) {
    const alongX = w >= d;
    const span = alongX ? w : d;
    const side = (span - gap) / 2;
    if (alongX) {
      this.wall(x, z, side, d, y, h, color, opts);
      this.wall(x + side + gap, z, side, d, y, h, color, opts);
      if (h > gapH) this.wall(x + side, z, gap, d, y + gapH, h - gapH, color, opts);
    } else {
      this.wall(x, z, w, side, y, h, color, opts);
      this.wall(x, z + side + gap, w, side, y, h, color, opts);
      if (h > gapH) this.wall(x, z + side, w, gap, y + gapH, h - gapH, color, opts);
    }
  }

  /* Waist-high cover you can shoot over and vault onto. */
  cover(x, z, w, d, y, color, h = 1.15) {
    return this.box(x, y, z, w, h, d, color, { tag: 'cover' });
  }

  spawn(x, y, z, yaw = 0, team = 0) {
    this.spawns.push({ x, y, z, yaw, team });
  }

  light(x, y, z, r, color, intensity = 1) {
    this.lights.push({ x, y, z, r, color, intensity });
  }

  /* Everything added since the last call is mirrored across the X axis at
     `cx`. Team maps are built one half at a time and folded. */
  mirrorX(cx) {
    const n = this.brushes.length;
    for (let i = this._mirrorMark; i < n; i++) {
      const b = this.brushes[i];
      this.brushes.push({ ...b, id: brushId++, x: 2 * cx - b.x - b.w });
    }
    const sn = this.spawns.length;
    for (let i = 0; i < sn; i++) {
      const s = this.spawns[i];
      this.spawns.push({ ...s, x: 2 * cx - s.x, yaw: -s.yaw + Math.PI, team: s.team === 1 ? 2 : s.team === 2 ? 1 : 0 });
    }
    const ln = this.lights.length;
    for (let i = 0; i < ln; i++) {
      const l = this.lights[i];
      this.lights.push({ ...l, x: 2 * cx - l.x });
    }
    this._mirrorMark = this.brushes.length;
    return this;
  }

  mark() { this._mirrorMark = this.brushes.length; return this; }

  build() {
    return finalize(this);
  }
}

/* ── Collision world ────────────────────────────────────────────────────
 * A uniform grid over the XZ plane. Every solid brush is registered in the
 * cells it overlaps; a query touches only the cells the query box covers.
 * With ~600 brushes and a 4-unit cell this turns a 600-item scan into a
 * 4-to-12 item one, which is what makes 24 entities at 60 Hz cheap.
 */
export const CELL = 4;

function finalize(m) {
  const solids = m.brushes.filter((b) => b.solid);
  let minX = Infinity, minZ = Infinity, minY = Infinity;
  let maxX = -Infinity, maxZ = -Infinity, maxY = -Infinity;
  for (const b of m.brushes) {
    minX = Math.min(minX, b.x); minZ = Math.min(minZ, b.z); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxZ = Math.max(maxZ, b.z + b.d);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const gx = Math.max(1, Math.ceil((maxX - minX) / CELL));
  const gz = Math.max(1, Math.ceil((maxZ - minZ) / CELL));
  const grid = new Array(gx * gz);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  for (const b of solids) {
    const x0 = Math.max(0, Math.floor((b.x - minX) / CELL));
    const x1 = Math.min(gx - 1, Math.floor((b.x + b.w - minX) / CELL));
    const z0 = Math.max(0, Math.floor((b.z - minZ) / CELL));
    const z1 = Math.min(gz - 1, Math.floor((b.z + b.d - minZ) / CELL));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z * gx + x].push(b);
  }

  const world = {
    id: m.id, name: m.name, blurb: m.blurb, theme: m.theme,
    modes: m.modes || ['ffa', 'tdm', 'gungame', 'practice'],
    brushes: m.brushes, solids, spawns: m.spawns, lights: m.lights,
    bounds: { minX, minZ, minY, maxX, maxZ, maxY },
    grid, gx, gz, minX, minZ,
    /* Filled in lazily — the nav graph costs a few ms and offline clients
       that never spawn a bot should not pay for it. */
    nav: null,
  };
  world.query = (x0, y0, z0, x1, y1, z1, out) => queryBox(world, x0, y0, z0, x1, y1, z1, out);
  return world;
}

const _scratch = [];
export function queryBox(world, x0, y0, z0, x1, y1, z1, out = _scratch) {
  out.length = 0;
  const cx0 = Math.max(0, Math.floor((x0 - world.minX) / CELL));
  const cx1 = Math.min(world.gx - 1, Math.floor((x1 - world.minX) / CELL));
  const cz0 = Math.max(0, Math.floor((z0 - world.minZ) / CELL));
  const cz1 = Math.min(world.gz - 1, Math.floor((z1 - world.minZ) / CELL));
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const cell = world.grid[cz * world.gx + cx];
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.x > x1 || b.x + b.w < x0) continue;
        if (b.y > y1 || b.y + b.h < y0) continue;
        if (b.z > z1 || b.z + b.d < z0) continue;
        if (out.indexOf(b) === -1) out.push(b);
      }
    }
  }
  return out;
}

/* Slab-method ray/AABB, restricted to brushes that stop bullets. Returns
   the nearest hit distance and its face normal, or null. */
export function raycastWorld(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist, bn = null, bb = null;
  const x0 = Math.min(ox, ox + dx * maxDist), x1 = Math.max(ox, ox + dx * maxDist);
  const y0 = Math.min(oy, oy + dy * maxDist), y1 = Math.max(oy, oy + dy * maxDist);
  const z0 = Math.min(oz, oz + dz * maxDist), z1 = Math.max(oz, oz + dz * maxDist);
  const cands = queryBox(world, x0, y0, z0, x1, y1, z1, []);
  const idx = 1 / (dx || 1e-12), idy = 1 / (dy || 1e-12), idz = 1 / (dz || 1e-12);
  for (const b of cands) {
    if (b.shootThrough) continue;
    /* A ray starting inside a brush must not be stopped by it — otherwise
       a muzzle clipping a wall reports a zero-length hit, and the column
       sampler in navmesh.js can never trace past a thick slab. */
    if (ox > b.x && ox < b.x + b.w && oy > b.y && oy < b.y + b.h && oz > b.z && oz < b.z + b.d) continue;
    let tmin = 0, tmax = best, n = null;
    let t1 = (b.x - ox) * idx, t2 = (b.x + b.w - ox) * idx;
    let lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    if (lo > tmin) { tmin = lo; n = 0; }
    tmax = Math.min(tmax, hi);
    if (tmin > tmax) continue;
    t1 = (b.y - oy) * idy; t2 = (b.y + b.h - oy) * idy;
    lo = Math.min(t1, t2); hi = Math.max(t1, t2);
    if (lo > tmin) { tmin = lo; n = 1; }
    tmax = Math.min(tmax, hi);
    if (tmin > tmax) continue;
    t1 = (b.z - oz) * idz; t2 = (b.z + b.d - oz) * idz;
    lo = Math.min(t1, t2); hi = Math.max(t1, t2);
    if (lo > tmin) { tmin = lo; n = 2; }
    tmax = Math.min(tmax, hi);
    if (tmin > tmax || tmin < 0) continue;
    if (tmin < best) {
      best = tmin; bb = b;
      const nx = n === 0 ? (dx > 0 ? -1 : 1) : 0;
      const ny = n === 1 ? (dy > 0 ? -1 : 1) : 0;
      const nz = n === 2 ? (dz > 0 ? -1 : 1) : 0;
      bn = { x: nx, y: ny, z: nz };
    }
  }
  return bb ? { dist: best, normal: bn, brush: bb } : null;
}

/* Cheap yes/no version for AI line-of-sight, which asks constantly. */
export function traceClear(world, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-5) return true;
  const hit = raycastWorld(world, ax, ay, az, dx / d, dy / d, dz / d, d - 0.02);
  return !hit;
}

/* Highest solid surface under a point, used by spawn placement and the
   nav sampler. Returns null when the column is empty. */
export function floorUnder(world, x, y, z, maxDrop = 40) {
  const hit = raycastWorld(world, x, y, z, 0, -1, 0, maxDrop);
  return hit ? y - hit.dist : null;
}

export function fitsAt(world, x, y, z, height = PLAYER_HEIGHT, r = PLAYER_RADIUS) {
  const hits = queryBox(world, x - r, y + 0.05, z - r, x + r, y + height - 0.05, z + r, []);
  return hits.length === 0;
}

export const STEP = STEP_HEIGHT;
