/* ═══════════════════════════════════════════════════════════
   scenery.js — the world outside: clouds, terrain, ocean,
   cities, and an airport to leave from.

   All of it is procedural. The terrain is a single grid that
   recentres on the camera every frame and takes its height from
   a noise function evaluated in the vertex shader, so the ground
   is genuinely infinite in every direction and costs one draw
   call. The same height function exists in JavaScript, matched
   constant for constant, so the flight model can ask how high
   the ground is under the aircraft.

   World coordinates are metres, with the origin at the runway
   threshold. Float32 keeps about two centimetres of precision at
   two hundred kilometres out, which is further than anything
   here ever flies.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { quality, clamp, lerp, smoothstep, makeRandom, fbm as jsFbm } from './core.js';

/* ── the height field, in both languages ─────────────────── */

/* A GLSL value-noise stack. Kept deliberately small: four
   octaves of the base ridge and three of detail is enough
   silhouette at the distances an aircraft sees, and every extra
   octave is paid for once per vertex. */
export const TERRAIN_GLSL = /* glsl */`
float thash(vec2 p){
  p = floor(p);
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}
float tnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(thash(i), thash(i + vec2(1.0, 0.0)), f.x),
             mix(thash(i + vec2(0.0, 1.0)), thash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float tfbm(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += tnoise(p) * a; n += a; a *= 0.5; p *= 2.02;
  }
  return s / n;
}

/* Height in metres. The airport sits in a bowl that is flattened
   to sea level within 5 km, so the runway is always on the
   ground no matter what the noise does there. */
float terrainH(vec2 w){
  float continent = tfbm(w * 0.000072, 4);
  /* The departure field is on a continent by construction: the
     noise decides where the coastline is everywhere except
     within a hundred kilometres of the runway, which would
     otherwise sometimes come up as open ocean. */
  float home = 1.0 - smoothstep(48000.0, 132000.0, length(w));
  float land = max(smoothstep(0.40, 0.62, continent), home);
  float ridge = tfbm(w * 0.000105, 5);
  ridge = pow(ridge, 1.7);
  float detail = tfbm(w * 0.00115, 3) * 42.0;
  float h = (ridge * 2350.0 + detail) * land - 90.0 * (1.0 - land);
  /* the name bowl, not flat: flat is reserved in GLSL ES 3.0 */
  float bowl = smoothstep(2400.0, 8200.0, length(w));
  return mix(2.0, h, bowl);
}
`;

const H = (() => {
  const hash = (x, y) => {
    const h = Math.sin(Math.floor(x) * 127.1 + Math.floor(y) * 311.7) * 43758.5453123;
    return h - Math.floor(h);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), fx),
                lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
  };
  const fbm = (x, y, oct) => {
    let s = 0, a = 0.5, n = 0, px = x, py = y;
    for (let i = 0; i < oct; i++) { s += noise(px, py) * a; n += a; a *= 0.5; px *= 2.02; py *= 2.02; }
    return s / n;
  };
  return (x, z) => {
    const continent = fbm(x * 0.000072, z * 0.000072, 4);
    const home = 1 - smoothstep(clamp((Math.hypot(x, z) - 48000) / 84000, 0, 1));
    const land = Math.max(smoothstep(clamp((continent - 0.40) / 0.22, 0, 1)), home);
    let ridge = fbm(x * 0.000105, z * 0.000105, 5);
    ridge = Math.pow(ridge, 1.7);
    const detail = fbm(x * 0.00115, z * 0.00115, 3) * 42;
    const h = (ridge * 2350 + detail) * land - 90 * (1 - land);
    const flat = smoothstep(clamp((Math.hypot(x, z) - 2400) / 5800, 0, 1));
    return lerp(2, h, flat);
  };
})();

/* The one number the flight model asks for. */
export const groundHeight = (x, z) => Math.max(0, H(x, z));

/* ── terrain ─────────────────────────────────────────────── */

/* One grid, recentred on the camera each frame. The vertices are
   laid out on a squared distribution so they crowd toward the
   middle: at the horizon a vertex every two kilometres is
   invisible, and near the aircraft one every twenty metres is
   not. */
export function makeTerrain({ extent = 190000, res = null } = {}) {
  const N = res || (quality.tier === 2 ? 300 : quality.tier === 1 ? 220 : 150);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
      const x = Math.sign(u) * Math.pow(Math.abs(u), 2.6) * extent;
      const z = Math.sign(v) * Math.pow(Math.abs(v), 2.6) * extent;
      pos.push(x, 0, z);
      uv.push(i / N, j / N);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = (i + 1) * (N + 1) + j;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), extent * 2);

  const uniforms = {
    uOrigin: { value: new THREE.Vector2() },
    uSun: { value: new THREE.Vector3(0.3, 0.6, -0.7) },
    uSunColor: { value: new THREE.Color(0xfff2e0) },
    uSky: { value: new THREE.Color(0xa8c6e6) },
    uFog: { value: new THREE.Color(0x9fb8d4) },
    uFogDensity: { value: 0.000021 },
    uTime: { value: 0 },
    uSnow: { value: 1650 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: TERRAIN_GLSL + /* glsl */`
      uniform vec2 uOrigin;
      varying vec3 vW;
      varying float vH;
      varying vec3 vN;
      void main(){
        vec2 w = position.xz + uOrigin;
        float h = terrainH(w);
        /* finite-difference normal; the step scales with the
           local vertex spacing so distant terrain does not
           develop a fake sparkle */
        float d = max(18.0, length(position.xz) * 0.02);
        float hx = terrainH(w + vec2(d, 0.0));
        float hz = terrainH(w + vec2(0.0, d));
        vN = normalize(vec3(h - hx, d, h - hz));
        vH = h;
        vec3 p = vec3(position.x, max(h, -8.0), position.z);
        vW = vec3(w.x, p.y, w.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uSun, uSunColor, uSky, uFog;
      uniform float uFogDensity, uSnow;
      varying vec3 vW; varying float vH; varying vec3 vN;

      void main(){
        vec3 n = normalize(vN);
        float slope = 1.0 - n.y;

        vec3 grass = vec3(0.255, 0.315, 0.205);
        vec3 dry   = vec3(0.400, 0.360, 0.238);
        vec3 rock  = vec3(0.305, 0.295, 0.282);
        vec3 snow  = vec3(0.88, 0.92, 0.97);
        vec3 sand  = vec3(0.560, 0.510, 0.395);

        float alt = clamp(vH / 2200.0, 0.0, 1.0);
        vec3 col = mix(grass, dry, smoothstep(0.10, 0.55, alt));
        col = mix(col, rock, smoothstep(0.30, 0.75, slope * 2.2 + alt * 0.5));
        col = mix(col, snow, smoothstep(uSnow, uSnow + 420.0, vH) * (1.0 - slope * 0.8));
        col = mix(sand, col, smoothstep(0.0, 60.0, vH));

        float diff = max(dot(n, normalize(uSun)), 0.0);
        vec3 lit = col * (uSunColor * (0.22 + diff * 1.10) + uSky * 0.58);

        /* Aerial perspective. Without it a mountain sixty
           kilometres away reads as one six kilometres away, and
           the whole sense of altitude goes with it. */
        float dist = length(vW - cameraPosition);
        float f = 1.0 - exp(-dist * uFogDensity);
        f = clamp(f, 0.0, 1.0);
        gl_FragColor = vec4(mix(lit, uFog, f * f), 1.0);
      }`
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  mesh.receiveShadow = false;

  return {
    mesh, uniforms,
    /* Snapping to a coarse grid stops the vertices swimming as
       the aircraft moves. */
    follow(x, z) {
      const step = 64;
      const sx = Math.round(x / step) * step;
      const sz = Math.round(z / step) * step;
      mesh.position.set(sx, 0, sz);
      uniforms.uOrigin.value.set(sx, sz);
    }
  };
}

/* ── ocean ───────────────────────────────────────────────── */

export function makeOcean({ extent = 200000 } = {}) {
  const geo = new THREE.PlaneGeometry(extent, extent, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uSun: { value: new THREE.Vector3(0.3, 0.6, -0.7) },
    uSunColor: { value: new THREE.Color(0xfff2e0) },
    uDeep: { value: new THREE.Color(0x0b2038) },
    uShallow: { value: new THREE.Color(0x1d4e6e) },
    uFog: { value: new THREE.Color(0x9fb8d4) },
    uFogDensity: { value: 0.000021 },
    uTime: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 uSun, uSunColor, uDeep, uShallow, uFog;
      uniform float uFogDensity, uTime;
      varying vec3 vW;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 v = normalize(cameraPosition - vW);
        /* a wobble in the normal, enough to break the specular
           into a glitter path rather than a single hot spot */
        vec2 q = vW.xz * 0.0035 + uTime * 0.03;
        float w1 = n(q) - 0.5, w2 = n(q * 2.7 - uTime * 0.02) - 0.5;
        vec3 nrm = normalize(vec3(w1 * 0.22, 1.0, w2 * 0.22));
        float fres = pow(1.0 - max(dot(v, nrm), 0.0), 4.0);
        vec3 col = mix(uDeep, uShallow, fres * 1.4);
        vec3 hv = normalize(normalize(uSun) + v);
        col += uSunColor * pow(max(dot(nrm, hv), 0.0), 260.0) * 2.6;
        col += uFog * fres * 0.55;
        float dist = length(vW - cameraPosition);
        float f = clamp(1.0 - exp(-dist * uFogDensity), 0.0, 1.0);
        gl_FragColor = vec4(mix(col, uFog, f * f), 1.0);
      }`
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -6;
  return {
    mesh, uniforms,
    follow(x, z) { mesh.position.set(x, -0.5, z); }
  };
}

/* ── clouds ──────────────────────────────────────────────── */

function puffTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  const rnd = makeRandom(7);
  const seedX = rnd() * 100, seedY = rnd() * 100;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = (i / S) * 2 - 1, v = (j / S) * 2 - 1;
      const r = Math.hypot(u, v);
      const n = jsFbm(seedX + i / S * 4.2, seedY + j / S * 4.2, 4);
      /* a soft disc eaten into by noise, so no two puffs in an
         instanced field read as the same sprite */
      let a = (1 - smoothstep(clamp((r - 0.10) / 0.85, 0, 1))) * (0.55 + n * 0.85);
      a = clamp(a - r * 0.35, 0, 1);
      const k = (j * S + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let PUFF = null;

/* Clouds are camera-facing quads billboarded in the vertex
   shader, arranged into clusters so they build cumulus rather
   than a fog of discs. They are lit by one term — how much of
   the puff faces the sun — carried per instance, which is what
   gives a cloud a bright crown and a grey base. */
export function makeClouds({
  count = quality.clouds, base = 1800, spread = 26000, thickness = 900, seed = 12
} = {}) {
  PUFF ||= puffTexture();
  const rnd = makeRandom(seed);
  const clusters = Math.max(6, Math.round(count / 11));
  const perCluster = Math.round(count / clusters);
  const total = clusters * perCluster;

  const geo = new THREE.PlaneGeometry(1, 1);
  const uniforms = {
    tPuff: { value: PUFF },
    uSun: { value: new THREE.Vector3(0.3, 0.6, -0.7) },
    uSunColor: { value: new THREE.Color(0xfff4e4) },
    uSky: { value: new THREE.Color(0x9fc3e8) },
    uOpacity: { value: 1 },
    uFogDensity: { value: 0.0000085 },
    uFog: { value: new THREE.Color(0x9fb8d4) }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float aCrown;
      attribute float aScale;
      varying vec2 vUv; varying float vCrown; varying float vDist;
      void main(){
        vUv = uv; vCrown = aCrown;
        vec4 centre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 mv = viewMatrix * centre;
        mv.xy += position.xy * aScale;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tPuff;
      uniform vec3 uSunColor, uSky, uFog;
      uniform float uOpacity, uFogDensity;
      varying vec2 vUv; varying float vCrown; varying float vDist;
      void main(){
        float a = texture2D(tPuff, vUv).a;
        if (a < 0.01) discard;
        vec3 col = mix(uSky * 0.62, uSunColor * 1.06, vCrown);
        float f = clamp(1.0 - exp(-vDist * uFogDensity), 0.0, 1.0);
        col = mix(col, uFog, f * 0.85);
        gl_FragColor = vec4(col, a * uOpacity * (1.0 - f * 0.45));
      }`
  });

  const mesh = new THREE.InstancedMesh(geo, material, total);
  mesh.frustumCulled = false;
  const crown = new Float32Array(total);
  const scale = new Float32Array(total);
  const m4 = new THREE.Matrix4();
  const homes = new Float32Array(total * 3);

  let k = 0;
  for (let c = 0; c < clusters; c++) {
    const cx = (rnd() - 0.5) * spread;
    const cz = (rnd() - 0.5) * spread;
    const cy = base + (rnd() - 0.5) * thickness;
    const size = 420 + rnd() * 900;
    for (let p = 0; p < perCluster; p++) {
      const t = p / perCluster;
      const rx = (rnd() - 0.5) * size * 2.4;
      const rz = (rnd() - 0.5) * size * 2.4;
      const ry = (rnd() - 0.35) * size * 0.85 * (1 - Math.abs(rx + rz) / (size * 4));
      homes[k * 3] = cx + rx;
      homes[k * 3 + 1] = cy + ry;
      homes[k * 3 + 2] = cz + rz;
      scale[k] = size * (0.55 + rnd() * 0.85);
      crown[k] = clamp(0.30 + (ry / (size * 0.85)) * 0.8 + rnd() * 0.18, 0, 1);
      m4.makeTranslation(homes[k * 3], homes[k * 3 + 1], homes[k * 3 + 2]);
      mesh.setMatrixAt(k, m4);
      k++;
      void t;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aCrown', new THREE.InstancedBufferAttribute(crown, 1));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scale, 1));

  return {
    mesh, uniforms, homes, count: total,
    /* Wrap the field around the camera so it never runs out.
       The modulo is on the whole field rather than per puff, so
       clusters stay together as they wrap. */
    follow(x, z, wind = 0) {
      const half = spread / 2;
      const ox = ((x + half) % spread + spread) % spread - half;
      const oz = ((z + half) % spread + spread) % spread - half;
      mesh.position.set(x - ox, 0, z - oz + wind);
    }
  };
}

/* ── cities ──────────────────────────────────────────────── */

/* Instanced boxes on a grid, with the tallest in the middle,
   which is enough to read as a city from three thousand metres
   and costs one draw call. */
export function makeCity({ centre = new THREE.Vector3(), radius = 4200, blocks = quality.cityBlocks, seed = 31 } = {}) {
  const rnd = makeRandom(seed);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x7d8794, roughness: 0.82, metalness: 0.05,
    emissive: 0x0a0e16, emissiveIntensity: 1
  });
  const mesh = new THREE.InstancedMesh(geo, material, blocks);
  mesh.castShadow = quality.shadows;
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < blocks; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.pow(rnd(), 0.55) * radius;
    const density = 1 - r / radius;
    const w = 22 + rnd() * 46;
    const h = (14 + Math.pow(rnd(), 2.2) * 210) * (0.35 + density * 1.25);
    p.set(centre.x + Math.cos(a) * r, centre.y, centre.z + Math.sin(a) * r);
    s.set(w, h, w * (0.7 + rnd() * 0.6));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(rnd() * 4) * Math.PI / 2 + rnd() * 0.12);
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
    col.setHSL(0.58, 0.05, 0.32 + rnd() * 0.26);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/* ── airport ─────────────────────────────────────────────── */

function runwayTexture(designation = '27', length = 3500) {
  const W = 2048, Hh = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const x = c.getContext('2d');
  x.fillStyle = '#3b4046';
  x.fillRect(0, 0, W, Hh);

  /* wear: two darker bands where every aircraft touches down */
  const wear = x.createLinearGradient(0, 0, 0, Hh);
  wear.addColorStop(0.28, 'rgba(18,20,23,0)');
  wear.addColorStop(0.38, 'rgba(26,29,33,0.55)');
  wear.addColorStop(0.62, 'rgba(26,29,33,0.55)');
  wear.addColorStop(0.72, 'rgba(18,20,23,0)');
  x.fillStyle = wear;
  x.fillRect(0, 0, W * 0.14, Hh);
  x.fillRect(W * 0.86, 0, W * 0.14, Hh);

  x.fillStyle = '#e8ebef';
  /* edge lines */
  x.fillRect(0, 10, W, 4);
  x.fillRect(0, Hh - 14, W, 4);

  /* centreline: 30 m stripe, 20 m gap */
  const px = W / length;
  for (let s = 60; s < length - 60; s += 50) {
    x.fillRect(s * px, Hh / 2 - 2.5, 30 * px, 5);
  }

  /* threshold bars at both ends */
  for (const end of [0, 1]) {
    for (let i = 0; i < 8; i++) {
      const y = 26 + i * 26;
      const w = 46 * px;
      const bx = end ? W - 30 * px - w : 30 * px;
      x.fillRect(bx, y, w, 12);
    }
  }

  /* touchdown zone markers */
  for (const end of [0, 1]) {
    for (let g = 1; g <= 3; g++) {
      const d = 150 + g * 150;
      const bx = end ? W - d * px : d * px;
      for (const y of [Hh / 2 - 44, Hh / 2 + 32]) {
        x.fillRect(bx - 22 * px, y, 45 * px, 12);
      }
    }
  }

  /* designation numerals */
  x.save();
  x.fillStyle = '#e8ebef';
  x.font = '700 96px ui-sans-serif, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.translate(W * 0.055, Hh / 2); x.rotate(Math.PI / 2);
  x.fillText(designation, 0, 0);
  x.restore();
  x.save();
  x.translate(W * 0.945, Hh / 2); x.rotate(-Math.PI / 2);
  x.fillStyle = '#e8ebef';
  x.font = '700 96px ui-sans-serif, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const opp = String((parseInt(designation, 10) + 18) % 36 || 36).padStart(2, '0');
  x.fillText(opp, 0, 0);
  x.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = quality.anisotropy;
  return t;
}

/* Runway 09/27, 3 500 m by 45 m, laid along +X with the 27
   threshold at the origin. Taxiway, apron, and the approach and
   edge lighting that make it findable at night. */
export function makeAirport() {
  const g = new THREE.Group();
  const LEN = 3500, WID = 45;

  const asphalt = new THREE.MeshStandardMaterial({
    map: runwayTexture('27', LEN), roughness: 0.94, metalness: 0.0
  });
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(LEN, WID), asphalt);
  rw.rotation.x = -Math.PI / 2;
  rw.position.set(LEN / 2, 0.06, 0);
  rw.receiveShadow = true;
  g.add(rw);

  const concrete = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.95 });
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(LEN * 0.92, 26), concrete);
  taxi.rotation.x = -Math.PI / 2;
  taxi.position.set(LEN / 2, 0.04, 165);
  taxi.receiveShadow = true;
  g.add(taxi);

  for (const x of [180, LEN * 0.5, LEN - 180]) {
    const link = new THREE.Mesh(new THREE.PlaneGeometry(26, 165), concrete);
    link.rotation.x = -Math.PI / 2;
    link.position.set(x, 0.04, 82);
    g.add(link);
  }

  const apron = new THREE.Mesh(new THREE.PlaneGeometry(900, 340), concrete);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(LEN * 0.42, 0.03, 360);
  apron.receiveShadow = true;
  g.add(apron);

  /* terminal — a long low shed with a glazed face */
  const term = new THREE.Mesh(
    new THREE.BoxGeometry(760, 26, 74),
    new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.72, metalness: 0.18 })
  );
  term.position.set(LEN * 0.42, 13, 560);
  term.castShadow = term.receiveShadow = true;
  g.add(term);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(756, 16, 2),
    new THREE.MeshPhysicalMaterial({ color: 0x16202c, roughness: 0.08, metalness: 0.4, envMapIntensity: 2 })
  );
  glass.position.set(LEN * 0.42, 13, 522);
  g.add(glass);

  /* lighting: edge, centreline and a five-bar approach system */
  const lampGeo = new THREE.SphereGeometry(1.1, 6, 4);
  const white = new THREE.MeshBasicMaterial({ color: 0xdfe8ff });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const green = new THREE.MeshBasicMaterial({ color: 0x2bff88 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x3b6cff });

  const edge = new THREE.InstancedMesh(lampGeo, white, Math.floor(LEN / 60) * 2 + 40);
  const m4 = new THREE.Matrix4();
  let i = 0;
  for (let x = 0; x <= LEN; x += 60) {
    for (const z of [-WID / 2 - 1.5, WID / 2 + 1.5]) {
      m4.makeTranslation(x, 0.5, z);
      edge.setMatrixAt(i++, m4);
    }
  }
  for (; i < edge.count; i++) { m4.makeTranslation(0, -50, 0); edge.setMatrixAt(i, m4); }
  edge.instanceMatrix.needsUpdate = true;
  g.add(edge);

  const thr = new THREE.InstancedMesh(lampGeo, green, 22);
  for (let k = 0; k < 22; k++) {
    m4.makeTranslation(k < 11 ? 2 : LEN - 2, 0.6, -WID / 2 + (k % 11) * (WID / 10));
    thr.setMatrixAt(k, m4);
  }
  thr.instanceMatrix.needsUpdate = true;
  g.add(thr);

  const app = new THREE.InstancedMesh(lampGeo, red, 5 * 5);
  let a = 0;
  for (let bar = 1; bar <= 5; bar++) {
    for (let k = -2; k <= 2; k++) {
      m4.makeTranslation(-bar * 150, 0.8 + bar * 0.4, k * 6);
      app.setMatrixAt(a++, m4);
    }
  }
  app.instanceMatrix.needsUpdate = true;
  g.add(app);

  const taxiLights = new THREE.InstancedMesh(lampGeo, blue, 60);
  for (let k = 0; k < 60; k++) {
    m4.makeTranslation(120 + k * 52, 0.5, 152);
    taxiLights.setMatrixAt(k, m4);
  }
  taxiLights.instanceMatrix.needsUpdate = true;
  g.add(taxiLights);

  /* signage along the taxiway, so there is something to pass */
  const signMat = new THREE.MeshStandardMaterial({ color: 0xf0c33c, roughness: 0.7 });
  for (let k = 0; k < 8; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 0.4), signMat);
    s.position.set(220 + k * 420, 2, 138);
    s.castShadow = true;
    g.add(s);
  }

  /* a control tower to give the field a landmark */
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 9, 52, 16),
    new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.78 })
  );
  shaft.position.y = 26;
  const cab = new THREE.Mesh(
    new THREE.CylinderGeometry(13, 10, 11, 16),
    new THREE.MeshPhysicalMaterial({ color: 0x1a2836, roughness: 0.08, metalness: 0.5, envMapIntensity: 2.2 })
  );
  cab.position.y = 57;
  tower.add(shaft, cab);
  tower.position.set(LEN * 0.30, 0, 420);
  tower.traverse((o) => { o.castShadow = true; });
  g.add(tower);

  g.userData = { LEN, WID, thresholdX: 0, oppositeX: LEN, heading: 270 };
  return g;
}

export { H as rawHeight };
