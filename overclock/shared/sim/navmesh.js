/* Navigation graph, derived from the map rather than hand-authored.
 *
 * Hand-placing waypoints is the usual way to do this and it is exactly the
 * thing that makes adding a map expensive. Instead: sample the map on a
 * grid, find every walkable surface in each column (so catwalks and second
 * floors get their own nodes above the ground ones), and link neighbours
 * the player could actually walk or drop between.
 *
 * Building it costs a few milliseconds and happens once per map, lazily —
 * a client that never spawns a bot never pays for it.
 */

import { PLAYER_HEIGHT, PLAYER_RADIUS, STEP_HEIGHT } from '../constants.js';
import { raycastWorld, fitsAt, traceClear } from '../maps/builder.js';

/* Clearance is measured from a step-height above the surface, not from
   the surface itself. Measured from the floor, every staircase fails —
   the next riser always intersects a full-height box — even though the
   player walks up it without noticing. */
function headroom(world, x, y, z, r = PLAYER_RADIUS * 0.85) {
  return fitsAt(world, x, y + STEP_HEIGHT, z, PLAYER_HEIGHT - STEP_HEIGHT, r);
}

const SPACING = 2.0;
const MAX_DROP = 4.2;          // bots will jump down this far, but not up
const CLIMB = STEP_HEIGHT + 0.02;
const MAX_CLIMB = 2.4;         // a staircase can gain this much per grid cell
const JUMP_UP = 1.45;          // and a standing jump gains this much

export function buildNav(world) {
  if (world.nav) return world.nav;
  const { minX, minZ, minY, maxX, maxZ, maxY } = world.bounds;
  const floorY = minY - 1;
  const cols = Math.ceil((maxX - minX) / SPACING);
  const rows = Math.ceil((maxZ - minZ) / SPACING);
  const nodes = [];
  const columns = new Array(cols * rows);

  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = minX + (cx + 0.5) * SPACING;
      const z = minZ + (cz + 0.5) * SPACING;
      const list = [];
      let from = maxY + 2;
      /* Walk down the column collecting every top face. The guard stops
         a pathological map with hundreds of stacked slabs from stalling. */
      for (let guard = 0; guard < 12; guard++) {
        const hit = raycastWorld(world, x, from, z, 0, -1, 0, from - floorY);
        if (!hit) break;
        const y = from - hit.dist;
        if (y < floorY) break;
        if (hit.normal.y > 0.5 && !hit.brush.noNav && headroom(world, x, y, z, PLAYER_RADIUS * 0.9)) {
          const n = { i: nodes.length, x, y, z, cx, cz, links: [], open: 0 };
          nodes.push(n);
          list.push(n);
        }
        /* Step past the bottom of whatever we just landed on, not a fixed
           nudge — a thick slab would otherwise eat every iteration. */
        from = Math.min(y - 0.15, hit.brush.y - 0.05);
        if (from < floorY) break;
      }
      columns[cz * cols + cx] = list;
    }
  }

  const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const n of nodes) {
    for (const [dx, dz] of NEIGH) {
      const ax = n.cx + dx, az = n.cz + dz;
      if (ax < 0 || az < 0 || ax >= cols || az >= rows) continue;
      const list = columns[az * cols + ax];
      if (!list) continue;
      let bestUp = null, bestDown = null;
      for (const o of list) {
        const dy = o.y - n.y;
        if (dy > MAX_CLIMB || dy < -MAX_DROP) continue;
        const mx = (n.x + o.x) / 2, mz = (n.z + o.z) / 2;
        const my = Math.max(n.y, o.y);
        /* The mid-point has to admit a standing player, otherwise this is
           a link straight through a wall corner. */
        if (!headroom(world, mx, my, mz)) continue;
        /* A grid cell is 2 units wide and a staircase climbs faster than
           one step-height across it, so a rise the cheap test rejects is
           not necessarily unwalkable. Only then pay for the full trace,
           and if even that fails it may still be a jump — crate tops and
           ledges are reachable, they just cost more. */
        let jump = false;
        if (dy > CLIMB) {
          if (!walkableSegment(world, n, o, floorY)) {
            if (dy > JUMP_UP) continue;
            jump = true;
          }
        }
        if (dy < -CLIMB) { if (!bestDown || o.y > bestDown.y) bestDown = o; }
        else if (!bestUp || Math.abs(dy) < Math.abs(bestUp.y - n.y)) { bestUp = o; bestUp.__jump = jump; }
      }
      const pick = bestUp || bestDown;
      if (pick) {
        const drop = pick.y < n.y - CLIMB;
        const needJump = pick === bestUp && !!bestUp.__jump;
        n.links.push({
          i: pick.i,
          cost: Math.hypot(pick.x - n.x, pick.z - n.z) + (drop ? 1.6 : 0) + (needJump ? 2.4 : 0),
          jump: needJump, drop,
        });
      }
    }
    /* "Openness" — how much sky-to-wall room a node has. Bots prefer open
       nodes when hunting and closed ones when hiding. */
    n.open = n.links.length / 8;
  }

/* Walks the straight line between two nodes in step-height increments,
   the way the player's own movement code would. This is what lets a
   staircase link even though its total rise across one grid cell is far
   more than a single step. */
function walkableSegment(world, a, b, floorY) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.ceil(d / 0.34));
  let y = a.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t, z = a.z + dz * t;
    const probe = y + CLIMB + 0.05;
    const hit = raycastWorld(world, x, probe, z, 0, -1, 0, probe - floorY);
    if (!hit) return false;
    const fy = probe - hit.dist;
    if (fy > y + CLIMB || fy < y - MAX_DROP) return false;
    if (!headroom(world, x, fy, z, PLAYER_RADIUS * 0.8)) return false;
    y = fy;
  }
  return Math.abs(y - b.y) < 0.35;
}

  /* Drop nodes that nothing can reach; they are usually the tops of
     crates and light fixtures the sampler mistook for floor. */
  const reachable = pruneIslands(nodes);

  const nav = {
    nodes: reachable, cols, rows, minX, minZ, spacing: SPACING,
    columns: rebuildColumns(reachable, cols, rows, minX, minZ),
  };
  world.nav = nav;
  return nav;
}

function pruneIslands(nodes) {
  /* Undirected flood fill from the biggest component. Drop links are
     one-way, so treat every edge as bidirectional for connectivity. */
  const adj = nodes.map(() => []);
  for (const n of nodes) for (const l of n.links) { adj[n.i].push(l.i); adj[l.i].push(n.i); }
  const comp = new Int32Array(nodes.length).fill(-1);
  let best = -1, bestSize = 0, c = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] !== -1) continue;
    let size = 0; const stack = [s]; comp[s] = c;
    while (stack.length) {
      const v = stack.pop(); size++;
      for (const u of adj[v]) if (comp[u] === -1) { comp[u] = c; stack.push(u); }
    }
    if (size > bestSize) { bestSize = size; best = c; }
    c++;
  }
  const kept = nodes.filter((n) => comp[n.i] === best);
  const remap = new Map();
  kept.forEach((n, i) => remap.set(n.i, i));
  for (const n of kept) {
    n.i = remap.get(n.i);
    n.links = n.links.filter((l) => remap.has(l.i)).map((l) => ({ i: remap.get(l.i), cost: l.cost }));
  }
  return kept;
}

function rebuildColumns(nodes, cols, rows, minX, minZ) {
  const columns = new Array(cols * rows);
  for (let i = 0; i < columns.length; i++) columns[i] = [];
  for (const n of nodes) {
    n.cx = Math.min(cols - 1, Math.max(0, Math.floor((n.x - minX) / SPACING)));
    n.cz = Math.min(rows - 1, Math.max(0, Math.floor((n.z - minZ) / SPACING)));
    columns[n.cz * cols + n.cx].push(n);
  }
  return columns;
}

export function nearestNode(nav, x, y, z) {
  const cx = Math.floor((x - nav.minX) / nav.spacing);
  const cz = Math.floor((z - nav.minZ) / nav.spacing);
  let best = null, bestD = Infinity;
  for (let r = 0; r <= 3 && !best; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ax = cx + dx, az = cz + dz;
        if (ax < 0 || az < 0 || ax >= nav.cols || az >= nav.rows) continue;
        for (const n of nav.columns[az * nav.cols + ax]) {
          const d = (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 2.5) ** 2;
          if (d < bestD) { bestD = d; best = n; }
        }
      }
    }
    if (best && r >= 1) break;
  }
  return best;
}

/* A* over the graph. Returns an array of nodes, start excluded, or null.
   The open set is a plain array with a linear scan — graphs here are a
   few thousand nodes and the scan never shows up in a profile. */
export function findPath(nav, startIdx, goalIdx, maxExpand = 2500) {
  if (startIdx === goalIdx) return [];
  const nodes = nav.nodes;
  const g = new Float32Array(nodes.length).fill(Infinity);
  const f = new Float32Array(nodes.length).fill(Infinity);
  const from = new Int32Array(nodes.length).fill(-1);
  const closed = new Uint8Array(nodes.length);
  const goal = nodes[goalIdx];
  const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z) + Math.abs(n.y - goal.y);
  g[startIdx] = 0; f[startIdx] = h(nodes[startIdx]);
  const open = [startIdx];
  let expand = 0;
  while (open.length && expand++ < maxExpand) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cur === goalIdx) {
      const path = [];
      for (let v = goalIdx; v !== -1 && v !== startIdx; v = from[v]) path.push(nodes[v]);
      path.reverse();
      return path;
    }
    closed[cur] = 1;
    for (const l of nodes[cur].links) {
      if (closed[l.i]) continue;
      const ng = g[cur] + l.cost;
      if (ng < g[l.i]) {
        g[l.i] = ng; f[l.i] = ng + h(nodes[l.i]); from[l.i] = cur;
        if (open.indexOf(l.i) === -1) open.push(l.i);
      }
    }
  }
  return null;
}

/* Straightens a path by dropping waypoints the bot can walk past
   directly. Without this bots visibly zig-zag between grid cells. */
export function smoothPath(world, path, fromX, fromY, fromZ) {
  if (!path || path.length < 2) return path;
  const out = [];
  let cx = fromX, cy = fromY, cz = fromZ;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    for (; j > i; j--) {
      const n = path[j];
      if (Math.abs(n.y - cy) < STEP_HEIGHT * 2 &&
          traceClear(world, cx, cy + 0.9, cz, n.x, n.y + 0.9, n.z) &&
          traceClear(world, cx, cy + 0.25, cz, n.x, n.y + 0.25, n.z)) break;
    }
    const n = path[j];
    out.push(n); cx = n.x; cy = n.y; cz = n.z;
    i = j + 1;
  }
  return out;
}
