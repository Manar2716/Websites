/* Simulates the box shader's lighting on the CPU for every map.
 *
 *   node tools/check-lighting.mjs
 *
 * A bright palette is easy to get wrong in one specific way: raise albedo,
 * ambient and exposure together and every surface clips to flat white, which
 * looks like a rendering bug and is really an arithmetic one. This evaluates
 * the same expression the shader does for a handful of surface orientations
 * and reports what clips, so the palette is balanced by measurement.
 */

import { ALL_MAP_IDS, getMap } from '../shared/maps/index.js';
import { parseColour } from '../client/js/engine/gl.js';

const AMBIENT_SKY = 0.42, AMBIENT_GROUND = 0.30, SATURATION = 1.15;

const NORMALS = [
  ['floor   ', [0, 1, 0]],
  ['sun wall', null],          // filled per-map: the wall most facing the sun
  ['shade   ', null],          // and the one most facing away
  ['ceiling ', [0, -1, 0]],
];

let worst = 0, worstWhere = '';
console.log('map      surface    brightest channel   verdict');

for (const id of ALL_MAP_IDS) {
  const w = getMap(id);
  const t = w.theme;
  const sl = Math.hypot(...t.sun) || 1;
  const sun = t.sun.map((v) => v / sl);
  const sunCol = parseColour(t.sunColour);
  const ambSky = parseColour(t.ambient).map((v) => v * AMBIENT_SKY);
  const ambGnd = parseColour(t.ambientGround).map((v) => v * AMBIENT_GROUND);
  const exposure = t.exposure || 1;

  // The two horizontal normals that most face toward and away from the sun.
  const toward = [-sun[0], 0, -sun[2]];
  const tl = Math.hypot(toward[0], toward[2]) || 1;
  NORMALS[1][1] = [toward[0] / tl, 0, toward[2] / tl];
  NORMALS[2][1] = [-toward[0] / tl, 0, -toward[2] / tl];

  // The lightest albedo the map actually uses is the one at risk.
  let albedo = [0, 0, 0], albedoName = '';
  for (const b of w.brushes) {
    if (!b.visible || b.glow) continue;
    const c = parseColour(b.color);
    if (c[0] + c[1] + c[2] > albedo[0] + albedo[1] + albedo[2]) { albedo = c; albedoName = b.color; }
  }

  for (const [label, n] of NORMALS) {
    const ndl = Math.max(-(n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]), 0);
    const wrapped = Math.max((-(n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) + 0.35) / 1.35, 0);
    const k = ndl * 0.72 + wrapped * 0.28;
    const hemi = (n[1] * 0.5 + 0.5);
    const out = [0, 1, 2].map((i) => {
      const light = sunCol[i] * k + (ambGnd[i] + (ambSky[i] - ambGnd[i]) * hemi);
      return albedo[i] * light * exposure;
    });
    const lum = 0.299 * out[0] + 0.587 * out[1] + 0.114 * out[2];
    const sat = out.map((v) => lum + (v - lum) * SATURATION);
    const peak = Math.max(...sat);
    const verdict = peak > 1.0 ? 'CLIPS' : peak > 0.94 ? 'near limit' : peak < 0.12 ? 'CRUSHED' : 'ok';
    if (peak > worst) { worst = peak; worstWhere = `${id} ${label.trim()}`; }
    console.log(`${id.padEnd(8)} ${label}   ${peak.toFixed(3).padStart(6)}            ${verdict}`);
  }
  console.log(`         lightest albedo in map: ${albedoName}`);
}
console.log(`\nbrightest point anywhere: ${worst.toFixed(3)} (${worstWhere})`);
console.log(worst > 1 ? 'FAIL — surfaces clip to flat colour' : 'ok — nothing clips');
process.exit(worst > 1 ? 1 : 0);
