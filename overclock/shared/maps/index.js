/* The map registry.
 *
 * Adding a map is: write the module, import it here, list it. Nothing else
 * in the codebase enumerates maps. Builds are cached because the client
 * rebuilds geometry on every match and the server holds one world per
 * room — a map is pure data once built, and nothing mutates it. */

import { build as foundry } from './foundry.js';
import { build as atrium } from './atrium.js';
import { build as dunes } from './dunes.js';
import { build as reactor } from './reactor.js';
import { build as range } from './range.js';

const BUILDERS = { foundry, atrium, dunes, reactor, range };
const cache = new Map();

export const MAP_IDS = ['foundry', 'atrium', 'dunes', 'reactor'];
export const ALL_MAP_IDS = Object.keys(BUILDERS);

export function getMap(id) {
  if (!BUILDERS[id]) id = 'foundry';
  if (!cache.has(id)) cache.set(id, BUILDERS[id]());
  return cache.get(id);
}

/* Cheap summary for the map picker, without building the geometry. */
export const MAP_INFO = {
  foundry: { name: 'FOUNDRY', size: 'Medium', blurb: 'Casting hall. Sunken pit, catwalk overhead, mezzanine on three walls.', best: 'All-round', accent: '#e0713a' },
  atrium: { name: 'ATRIUM', size: 'Medium', blurb: 'Three floors around an open void. Glass you can see through and shoot through.', best: 'Vertical fights', accent: '#4fb3d9' },
  dunes: { name: 'DUNES', size: 'Large', blurb: 'Open lake bed, a ridge that sees everything, and a tunnel that sees none of it.', best: 'Long range', accent: '#d9a24a' },
  reactor: { name: 'REACTOR', size: 'Small', blurb: 'Containment hall. No sightline crosses the middle — the core is in the way.', best: 'Close quarters', accent: '#4be0a8' },
  range: { name: 'RANGE', size: 'Training', blurb: 'Aim training hall. Flat light, no clutter, marked distances.', best: 'Practice', accent: '#4d94c0' },
};
