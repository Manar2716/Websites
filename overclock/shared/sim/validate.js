/* Map sanity checks, run by the test script rather than at play time.
 *
 * The one that actually catches bugs is reachability: a deck the nav graph
 * can only fall off, never climb onto, looks completely normal in the
 * renderer and makes bots pile up at the bottom of a staircase. */

import { buildNav, nearestNode } from './navmesh.js';
import { fitsAt, floorUnder } from '../maps/builder.js';
import { PLAYER_HEIGHT } from '../constants.js';

export function validateMap(world) {
  const nav = buildNav(world);
  const issues = [];
  if (!nav.nodes.length) issues.push('no walkable surface found at all');

  /* Forward reachability from the first spawn: links are directed, so an
     undirected flood fill would happily call a one-way drop "connected". */
  const s0 = world.spawns[0];
  const start = s0 ? nearestNode(nav, s0.x, s0.y, s0.z) : nav.nodes[0];
  const seen = new Uint8Array(nav.nodes.length);
  const stack = [start.i]; seen[start.i] = 1;
  let count = 1;
  while (stack.length) {
    const v = stack.pop();
    for (const l of nav.nodes[v].links) if (!seen[l.i]) { seen[l.i] = 1; count++; stack.push(l.i); }
  }
  const frac = count / nav.nodes.length;
  if (frac < 0.9) issues.push(`only ${(frac * 100).toFixed(0)}% of nav nodes reachable from spawn`);

  /* Every spawn must be standable and connected, or players spawn stuck. */
  for (const sp of world.spawns) {
    if (!fitsAt(world, sp.x, sp.y + 0.05, sp.z, PLAYER_HEIGHT)) issues.push(`spawn inside geometry at ${sp.x},${sp.y},${sp.z}`);
    const f = floorUnder(world, sp.x, sp.y + 1.0, sp.z, 6);
    if (f === null) issues.push(`spawn over a void at ${sp.x},${sp.y},${sp.z}`);
    else if (Math.abs(f - sp.y) > 1.2) issues.push(`spawn floats ${(sp.y - f).toFixed(1)} above floor at ${sp.x},${sp.z}`);
    const n = nearestNode(nav, sp.x, sp.y, sp.z);
    if (!n || !seen[n.i]) issues.push(`spawn at ${sp.x},${sp.z} is cut off from the map`);
  }

  const teams = { 0: 0, 1: 0, 2: 0 };
  for (const sp of world.spawns) teams[sp.team] = (teams[sp.team] || 0) + 1;
  if (teams[1] < 4 || teams[2] < 4) issues.push(`needs >=4 spawns per team (alpha ${teams[1]}, bravo ${teams[2]})`);
  if (world.spawns.length < 10) issues.push(`only ${world.spawns.length} spawns; want 10+`);

  return { ok: issues.length === 0, issues, nodes: nav.nodes.length, reachable: count, frac, brushes: world.brushes.length, teams };
}
