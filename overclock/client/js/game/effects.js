/* Particles, tracers and shells.
 *
 * A fixed pool with no allocation after start-up. Every effect in the game
 * is one of six kinds and they all live in the same array, so the update
 * is a single tight loop and the draw is two instanced calls.
 *
 * The budget shrinks with the quality preset. That is the honest way to
 * hit a frame target on a weak phone: fewer sparks, not smaller sparks.
 */

import { parseColour } from '../engine/gl.js';

export const KIND = { SPARK: 0, SMOKE: 1, FLASH: 2, TRACER: 3, SHELL: 4, DECAL: 5, BLOOD: 6 };

export class Effects {
  constructor(budget = 900) {
    this.budget = budget;
    this.n = 0;
    this.p = [];
    for (let i = 0; i < budget; i++) {
      this.p.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, nx: 0, ny: 1, nz: 0,
        life: 0, max: 1, size: 0.1, grow: 0, r: 1, g: 1, b: 1, a: 1,
        kind: 0, gravity: 0, drag: 0, len: 0, speed: 0, travel: 0, range: 0, spin: 0,
      });
    }
  }

  setBudget(n) { this.budget = Math.min(n, this.p.length); if (this.n > this.budget) this.n = this.budget; }

  _take() {
    if (this.n < this.budget) return this.p[this.n++];
    /* Full: recycle the shortest-lived one rather than dropping the new
       effect, so a muzzle flash never loses out to a lingering smoke puff. */
    let worst = 0, worstLife = Infinity;
    for (let i = 0; i < this.n; i++) if (this.p[i].life < worstLife) { worstLife = this.p[i].life; worst = i; }
    return this.p[worst];
  }

  clear() { this.n = 0; }

  spark(x, y, z, vx, vy, vz, r, g, b, life = 0.35, size = 0.055) {
    const e = this._take();
    e.kind = KIND.SPARK; e.x = x; e.y = y; e.z = z;
    e.vx = vx; e.vy = vy; e.vz = vz;
    e.r = r; e.g = g; e.b = b; e.a = 1;
    e.life = e.max = life; e.size = size; e.grow = -0.02;
    e.gravity = 16; e.drag = 3.4;
    return e;
  }

  smoke(x, y, z, vx, vy, vz, life = 0.7, size = 0.22, shade = 0.55) {
    const e = this._take();
    e.kind = KIND.SMOKE; e.x = x; e.y = y; e.z = z;
    e.vx = vx; e.vy = vy; e.vz = vz;
    e.r = shade; e.g = shade; e.b = shade * 1.02; e.a = 0.34;
    e.life = e.max = life; e.size = size; e.grow = 0.7;
    e.gravity = -0.6; e.drag = 2.6;
    return e;
  }

  flash(x, y, z, size, life = 0.055, r = 1, g = 0.86, b = 0.55) {
    const e = this._take();
    e.kind = KIND.FLASH; e.x = x; e.y = y; e.z = z;
    e.vx = e.vy = e.vz = 0;
    e.r = r; e.g = g; e.b = b; e.a = 1;
    e.life = e.max = life; e.size = size; e.grow = 1.2;
    e.gravity = 0; e.drag = 0;
    return e;
  }

  /* Tracers travel rather than appearing whole: at 620 units a second a
     shot across the map is visible for about a tenth of a second, which is
     long enough to read a direction from and short enough not to clutter. */
  tracer(x, y, z, dx, dy, dz, range, r = 1, g = 0.93, b = 0.66, speed = 620) {
    const e = this._take();
    e.kind = KIND.TRACER; e.x = x; e.y = y; e.z = z;
    e.nx = dx; e.ny = dy; e.nz = dz;
    e.r = r; e.g = g; e.b = b; e.a = 0.9;
    e.speed = speed; e.travel = 0; e.range = range;
    e.len = Math.min(9, range * 0.35); e.size = 0.028;
    e.life = e.max = range / speed + 0.02;
    return e;
  }

  shell(x, y, z, vx, vy, vz) {
    const e = this._take();
    e.kind = KIND.SHELL; e.x = x; e.y = y; e.z = z;
    e.vx = vx; e.vy = vy; e.vz = vz;
    e.r = 0.85; e.g = 0.68; e.b = 0.3; e.a = 1;
    e.life = e.max = 1.6; e.size = 0.035; e.grow = 0;
    e.gravity = 20; e.drag = 0.6; e.spin = (Math.random() - 0.5) * 20;
    return e;
  }

  decal(x, y, z, nx, ny, nz, size, r, g, b, life = 7) {
    const e = this._take();
    e.kind = KIND.DECAL;
    // Lift off the surface, or z-fighting turns every bullet hole into a
    // flickering speckle.
    e.x = x + nx * 0.012; e.y = y + ny * 0.012; e.z = z + nz * 0.012;
    e.nx = nx; e.ny = ny; e.nz = nz;
    e.r = r; e.g = g; e.b = b; e.a = 0.75;
    e.life = e.max = life; e.size = size; e.grow = 0;
    e.gravity = 0; e.drag = 0;
    return e;
  }

  blood(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 5; i++) {
      const e = this._take();
      e.kind = KIND.BLOOD; e.x = x; e.y = y; e.z = z;
      e.vx = dx * 2 + (Math.random() - 0.5) * 3;
      e.vy = dy * 2 + Math.random() * 2.4;
      e.vz = dz * 2 + (Math.random() - 0.5) * 3;
      e.r = 0.62; e.g = 0.06; e.b = 0.09; e.a = 0.9;
      e.life = e.max = 0.32 + Math.random() * 0.2;
      e.size = 0.05 + Math.random() * 0.04; e.grow = -0.03;
      e.gravity = 18; e.drag = 2;
    }
  }

  /* ── Composite effects ─────────────────────────────────────────── */
  muzzle(x, y, z, dx, dy, dz, scale = 1, quality = 2) {
    this.flash(x + dx * 0.28, y + dy * 0.28, z + dz * 0.28, 0.46 * scale, 0.05);
    if (quality < 1) return;
    const n = quality >= 2 ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const s = 4 + Math.random() * 8;
      this.spark(x + dx * 0.3, y + dy * 0.3, z + dz * 0.3,
        dx * s + (Math.random() - 0.5) * 3, dy * s + (Math.random() - 0.5) * 3, dz * s + (Math.random() - 0.5) * 3,
        1, 0.8, 0.4, 0.14 + Math.random() * 0.1, 0.03);
    }
    if (quality >= 2) this.smoke(x + dx * 0.4, y + dy * 0.4, z + dz * 0.4, dx * 1.6, dy * 1.6 + 0.5, dz * 1.6, 0.55, 0.16, 0.5);
  }

  impact(x, y, z, nx, ny, nz, colourHex, quality = 2) {
    const c = parseColour(colourHex || '#9a9a9a');
    const n = quality >= 2 ? 7 : quality >= 1 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const s = 2.5 + Math.random() * 6;
      this.spark(x, y, z,
        nx * s + (Math.random() - 0.5) * 5, ny * s + Math.random() * 4, nz * s + (Math.random() - 0.5) * 5,
        Math.min(1, c[0] * 1.6 + 0.35), Math.min(1, c[1] * 1.5 + 0.3), Math.min(1, c[2] * 1.4 + 0.22),
        0.22 + Math.random() * 0.22, 0.035);
    }
    if (quality >= 1) this.smoke(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, nx * 1.2, ny * 1.2 + 0.4, nz * 1.2, 0.45, 0.13, 0.62);
    if (quality >= 2) this.decal(x, y, z, nx, ny, nz, 0.13 + Math.random() * 0.06, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 8);
  }

  /* ── Update and emit ───────────────────────────────────────────── */
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const e = this.p[i];
      e.life -= dt;
      if (e.life <= 0) continue;
      if (e.kind === KIND.TRACER) {
        e.travel += e.speed * dt;
        if (e.travel > e.range + e.len) continue;
      } else if (e.kind !== KIND.DECAL && e.kind !== KIND.FLASH) {
        const d = Math.max(0, 1 - e.drag * dt);
        e.vx *= d; e.vz *= d; e.vy = e.vy * d - e.gravity * dt;
        e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
        e.size += e.grow * dt;
        if (e.size < 0.002) continue;
      }
      if (w !== i) { const t = this.p[w]; this.p[w] = e; this.p[i] = t; }
      w++;
    }
    this.n = w;
  }

  emit(additive, alpha) {
    for (let i = 0; i < this.n; i++) {
      const e = this.p[i];
      const t = e.life / e.max;
      switch (e.kind) {
        case KIND.FLASH:
          additive.push(e.x, e.y, e.z, 0, 0, 0, e.size * (1.6 - t * 0.6), e.size * (1.6 - t * 0.6), 0, e.r, e.g, e.b, t);
          break;
        case KIND.SPARK:
          additive.push(e.x, e.y, e.z, 0, 0, 0, e.size, e.size, 0, e.r, e.g, e.b, Math.min(1, t * 1.7));
          break;
        case KIND.TRACER: {
          const head = Math.min(e.travel, e.range);
          const tail = Math.max(0, head - e.len);
          const len = head - tail;
          if (len <= 0.01) break;
          additive.push(e.x + e.nx * tail, e.y + e.ny * tail, e.z + e.nz * tail,
            e.nx, e.ny, e.nz, e.size, len, 1, e.r, e.g, e.b, 0.85 * Math.min(1, t * 3));
          break;
        }
        case KIND.SMOKE:
          alpha.push(e.x, e.y, e.z, 0, 0, 0, e.size, e.size, 0, e.r, e.g, e.b, e.a * t * t);
          break;
        case KIND.BLOOD:
          alpha.push(e.x, e.y, e.z, 0, 0, 0, e.size, e.size, 2, e.r, e.g, e.b, e.a * Math.min(1, t * 2));
          break;
        case KIND.SHELL:
          alpha.push(e.x, e.y, e.z, 0, 0, 0, e.size, e.size * 2.1, 2, e.r, e.g, e.b, Math.min(1, t * 4));
          break;
        case KIND.DECAL:
          alpha.push(e.x, e.y, e.z, e.nx, e.ny, e.nz, e.size, e.size, 3, e.r, e.g, e.b, e.a * Math.min(1, t * 4));
          break;
      }
    }
  }
}
