/* Small, allocation-conscious maths. The simulation runs 60 times a
   second on both ends, so the hot helpers here take and mutate plain
   {x,y,z} objects rather than returning new ones. */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;

/* Frame-rate independent exponential approach. `rate` is roughly
   "how many e-folds per second"; dt is the real frame time. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const copy = (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
export const set = (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; };
export const addScaled = (o, a, s) => { o.x += a.x * s; o.y += a.y * s; o.z += a.z * s; return o; };
export const sub = (o, a, b) => { o.x = a.x - b.x; o.y = a.y - b.y; o.z = a.z - b.z; return o; };
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export function normalize(o) {
  const l = Math.hypot(o.x, o.y, o.z);
  if (l > 1e-8) { o.x /= l; o.y /= l; o.z /= l; }
  return o;
}

/* Yaw/pitch in radians -> unit forward vector. Yaw 0 looks down -Z,
   which is the direction the camera faces at identity. */
export function angleToDir(yaw, pitch, out = vec3()) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function dirToAngle(d) {
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(clamp(d.y, -1, 1)) };
}

/* Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function approachAngle(cur, target, maxStep) {
  const d = angleDelta(cur, target);
  return cur + clamp(d, -maxStep, maxStep);
}

/* Deterministic PRNG (mulberry32). The server seeds one of these per
   match so recoil patterns and shotgun spreads are reproducible in a
   replay, and so bots do not all pick the same "random" choice. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Quantisation used by the wire format. Positions get millimetre-ish
   resolution over a +/-1024 unit world; angles get ~0.005 degrees. */
export const QUANT_POS = 128;
export const packPos = (v) => Math.round(clamp(v, -1024, 1024) * QUANT_POS);
export const unpackPos = (v) => v / QUANT_POS;
export const packAngle = (a) => Math.round(((a % TAU) + TAU) % TAU / TAU * 65536) & 0xffff;
export const unpackAngle = (v) => (v / 65536) * TAU;
