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

/* The composite, checked with the same arithmetic the shader runs.
 *
 * This exists because of a specific mistake that is easy to make twice.
 * The scene renders into an 8-bit target, so the colour arriving at the
 * composite has already been exposed and clamped by the box shader above.
 * A filmic tone curve there is tone-mapping the same image a second time,
 * and the symptom — a bright palette going flat and grey — looks exactly
 * like a lighting bug, which is where anyone would go looking first.
 *
 * Three properties keep the composite honest, and every one of them was
 * violated by the ACES fit that used to sit here:
 *
 *   below the knee, the curve is the identity — mid-tones and shadows pass
 *   through untouched, so nothing the lighting check just measured is
 *   altered after the fact;
 *   full scale stays full scale — white is still white;
 *   it is monotonic — no pair of distinguishable inputs collapses onto one
 *   output, which is what "washed out" means numerically.
 */
const KNEE = 0.94;   // must match PostFX.knee
const rolloff = (x) => {
  if (x <= KNEE) return x;
  const over = x - KNEE, head = 1 - KNEE;
  return KNEE + head * over / (over + head);
};

console.log('\ncomposite');
let bad = 0;
const check = (label, cond, detail) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? '' : '  — ' + detail}`);
  if (!cond) bad++;
};

/* The invariant that ties the two halves of this tool together: the
   composite must not touch anything the lighting pass above just measured
   and approved. Brighten the palette past the knee, or lower the knee, and
   this fails - which is the failure that otherwise shows up as "the game
   looks washed out" with no obvious cause. */
check(`knee clears the brightest lit surface (${KNEE} vs ${worst.toFixed(3)}, margin ${(KNEE - worst).toFixed(3)})`,
  KNEE > worst,
  `${worstWhere} reaches ${worst.toFixed(3)} — lit surfaces are being compressed`);

let maxIdentityErr = 0;
for (let i = 0; i <= Math.floor(KNEE * 1000); i++) {
  const x = i / 1000;
  maxIdentityErr = Math.max(maxIdentityErr, Math.abs(rolloff(x) - x));
}
check('identity below the knee', maxIdentityErr < 1e-9,
  `drifts by ${maxIdentityErr.toFixed(4)} — the lit range is being altered after the fact`);

/* Some headroom above full scale has to be reserved for the bloom add, so
   white cannot map to exactly white; it just has to stay white-looking. */
check('full scale survives', rolloff(1) > 0.95,
  `1.0 maps to ${rolloff(1).toFixed(3)} — white is no longer white`);

let monotonic = true;
for (let i = 0; i < 400; i++) if (rolloff((i + 1) / 200) < rolloff(i / 200)) monotonic = false;
check('monotonic', monotonic, 'brighter input produces darker output');

/* How much of the displayable range the curve alters at all. The ACES fit
   this replaced scored 100%: every value in the image was moved. */
let touched = 0;
for (let i = 0; i <= 1000; i++) if (Math.abs(rolloff(i / 1000) - i / 1000) > 0.002) touched++;
check('most of the range passes through', touched / 1001 < 0.1,
  `${(touched / 10.01).toFixed(0)}% of the range is remapped — this is a tone curve, not a roll-off`);

console.log(bad ? `\nFAIL — ${bad} composite check(s) failed` : '\nok — composite preserves the palette');
process.exit(worst > 1 || bad ? 1 : 0);
