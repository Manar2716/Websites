/* 4x4 matrices, column-major to match what WebGL expects.
   Every function writes into an output array rather than allocating: the
   render loop calls these a few hundred times a frame and a garbage
   collection pause is a dropped frame. */

export const create = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export function identity(o) {
  o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
  o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
  return o;
}

export function perspective(o, fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[11] = -1;
  o[12] = 0; o[13] = 0; o[15] = 0;
  const nf = 1 / (near - far);
  o[10] = (far + near) * nf;
  o[14] = 2 * far * near * nf;
  return o;
}

/* A first-person view matrix straight from yaw and pitch: cheaper and
   more stable than building a look-at from a computed forward vector. */
export function fpsView(o, x, y, z, yaw, pitch, roll = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // Camera basis: right, up, back (the inverse rotation goes in the matrix).
  let rx = cy, ry = 0, rz = -sy;
  let ux = sy * sp, uy = cp, uz = cy * sp;
  let bx = sy * cp, by = -sp, bz = cy * cp;
  if (roll) {
    const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
    const nux = ux * cr - rx * sr, nuy = uy * cr - ry * sr, nuz = uz * cr - rz * sr;
    rx = nrx; ry = nry; rz = nrz; ux = nux; uy = nuy; uz = nuz;
  }
  o[0] = rx; o[4] = ry; o[8] = rz; o[12] = -(rx * x + ry * y + rz * z);
  o[1] = ux; o[5] = uy; o[9] = uz; o[13] = -(ux * x + uy * y + uz * z);
  o[2] = bx; o[6] = by; o[10] = bz; o[14] = -(bx * x + by * y + bz * z);
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
  return o;
}

/* Orthographic projection, for the sun's view of the world. */
export function ortho(o, l, r, b, t, near, far) {
  const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (near - far);
  o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[10] = 2 * nf; o[11] = 0;
  o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (far + near) * nf; o[15] = 1;
  return o;
}

/* A view matrix looking from `eye` along `dir`. Used for the shadow
   camera, where there is a direction but no target. */
export function lookAlong(o, ex, ey, ez, dx, dy, dz) {
  let fx = dx, fy = dy, fz = dz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // Any up vector not parallel to the direction will do.
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(fy) > 0.99) { ux = 1; uy = 0; uz = 0; }
  let rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const vx = ry * fz - rz * fy, vy = rz * fx - rx * fz, vz = rx * fy - ry * fx;
  o[0] = rx; o[4] = ry; o[8] = rz; o[12] = -(rx * ex + ry * ey + rz * ez);
  o[1] = vx; o[5] = vy; o[9] = vz; o[13] = -(vx * ex + vy * ey + vz * ez);
  o[2] = -fx; o[6] = -fy; o[10] = -fz; o[14] = (fx * ex + fy * ey + fz * ez);
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
  return o;
}

export function multiply(o, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return o;
}

/* Six frustum planes in world space, from a view-projection matrix.
   Used to cull brushes that cannot be on screen. */
export function frustumFromVP(planes, m) {
  const rows = [
    [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
    [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
    [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
    [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
    [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
    [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
  ];
  for (let i = 0; i < 6; i++) {
    const [a, b, c, d] = rows[i];
    const len = Math.hypot(a, b, c) || 1;
    planes[i * 4] = a / len; planes[i * 4 + 1] = b / len;
    planes[i * 4 + 2] = c / len; planes[i * 4 + 3] = d / len;
  }
  return planes;
}

export function aabbInFrustum(planes, minX, minY, minZ, maxX, maxY, maxZ) {
  for (let i = 0; i < 6; i++) {
    const a = planes[i * 4], b = planes[i * 4 + 1], c = planes[i * 4 + 2], d = planes[i * 4 + 3];
    // Test the corner furthest along the plane normal; if that is behind
    // the plane, the whole box is.
    const x = a > 0 ? maxX : minX, y = b > 0 ? maxY : minY, z = c > 0 ? maxZ : minZ;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}
