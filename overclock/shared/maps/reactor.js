/* REACTOR — a containment hall, four-fold symmetric.
 *
 * The small, fast map. Nothing here is further than about thirty units
 * from anything else, so it is where the SMGs and the shotgun earn their
 * place. The core in the middle is solid, which means there is no line
 * across the map at all: every sightline is an arc around the core, and
 * the elevated ring above the ambulatory lets you cut that arc short.
 *
 * Everything is authored once in the +Z quadrant and rotated four times,
 * so the map is symmetric by construction rather than by careful typing.
 */

import { MapBuilder } from './builder.js';

const P = {
  floor: '#2f3a3a', floorAlt: '#27302f', deck: '#3c4a48', grate: '#46524f',
  wall: '#39443f', wallDark: '#2b3431', trim: '#5c6d66',
  core: '#1d2523', glow: '#4be0a8', amber: '#e8a13c', pipe: '#6b7d74',
};

export function build() {
  const m = new MapBuilder({
    id: 'reactor',
    name: 'REACTOR',
    blurb: 'Containment hall. No sightline crosses the middle — the core is in the way.',
    theme: {
      sky: '#16211f', horizon: '#243430', fog: '#1e2b28', fogNear: 22, fogFar: 74,
      sun: [0.3, -0.9, 0.32], sunColor: '#dcf2e6', ambient: '#54706a', ambientGround: '#33403c',
      exposure: 1.16,
    },
  });

  const S = 22, RING_Y = 3.5, ROOF = 8.5;

  /* Places a brush four times, rotating 90 degrees about the origin each
     time. Under (x,z) -> (-z,x) an axis-aligned rect stays axis-aligned,
     which is the only reason this is as cheap as it looks. */
  const quad = (x, y, z, w, h, d, color, opts) => {
    let bx = x, bz = z, bw = w, bd = d;
    for (let k = 0; k < 4; k++) {
      m.box(bx, y, bz, bw, h, bd, color, opts);
      const nx = -(bz + bd), nz = bx, nw = bd, nd = bw;
      bx = nx; bz = nz; bw = nw; bd = nd;
    }
  };
  const quadStairs = (x, y, z, w, d, rise, dir, color) => {
    const turn = { '+z': '-x', '-x': '-z', '-z': '+x', '+x': '+z' };
    let bx = x, bz = z, bw = w, bd = d, bdir = dir;
    for (let k = 0; k < 4; k++) {
      m.stairs(bx, y, bz, bw, bd, rise, bdir, color);
      const nx = -(bz + bd), nz = bx, nw = bd, nd = bw;
      bx = nx; bz = nz; bw = nw; bd = nd; bdir = turn[bdir];
    }
  };

  /* ── Shell ─────────────────────────────────────────────────────── */
  m.slab(-S, -S, S * 2, S * 2, 0, P.floor);
  m.room(-S, -S, S * 2, S * 2, 0, ROOF + 1, 1.5, P.wall, '', { noNav: true });
  m.slab(-S, -S, S * 2, S * 2, ROOF + 1, P.wallDark, [], { tag: 'roof' });

  /* ── The core ──────────────────────────────────────────────────── */
  m.box(-4.5, 0, -4.5, 9, ROOF + 1, 9, P.core);
  quad(-3.2, 0, -5.4, 6.4, ROOF + 1, 0.9, P.wallDark);       // chamfers
  for (let i = 0; i < 5; i++) {
    quad(-2.6, 0.6 + i * 1.7, -5.7, 5.2, 0.5, 0.35, P.glow, { glow: 1, solid: false });
  }
  m.light(0, 4, 0, 22, '#4be0a8', 1.0);

  /* ── Elevated ring, and the four flights onto it ───────────────── */
  quad(-10.5, RING_Y - 0.4, 7, 21, 0.4, 3.5, P.deck);
  // Outer rail in two runs per side. The gap in the middle is where the
  // flight lands; a continuous rail fences its own staircase off.
  quad(-10.5, RING_Y, 10.15, 7, 0.95, 0.35, P.trim, { tag: 'cover' });
  quad(3.5, RING_Y, 10.15, 7, 0.95, 0.35, P.trim, { tag: 'cover' });
  // Inner edge is left open on purpose: it is the drop back down into the
  // ambulatory, and it is what makes the ring a risk to stand on.
  quadStairs(-2.2, 0, 10.5, 4.4, 6.5, RING_Y, '-z', P.grate);
  // Pillars under the ring, doubling as cover in the ambulatory below.
  quad(6.6, 0, 6.6, 1.6, RING_Y - 0.4, 1.6, P.pipe);
  quad(-0.8, 0, 6.8, 1.6, RING_Y - 0.4, 1.6, P.pipe);

  /* ── Corner alcoves ────────────────────────────────────────────── */
  // Two walls each, so they are alcoves rather than boxes — you can be
  // flanked in one, which is what stops them being safe holds. Each wall
  // is broken, so the alcove has a second way out along the perimeter.
  const NN = { noNav: true };
  quad(11.5, 0, 12.5, 3.5, 4.2, 0.7, P.wallDark, NN);
  quad(17.5, 0, 12.5, 3.5, 4.2, 0.7, P.wallDark, NN);
  quad(12.5, 0, 11.5, 0.7, 4.2, 3.5, P.wallDark, NN);
  quad(12.5, 0, 17.5, 0.7, 4.2, 3.5, P.wallDark, NN);
  quad(17.6, 0, 17.6, 2.8, 1.2, 2.8, P.pipe, { tag: 'cover' });

  /* ── Cover in the four bays between ring and corner ────────────── */
  quad(-1.8, 0, 13.5, 3.6, 1.25, 2.4, P.pipe, { tag: 'cover' });
  quad(-9, 0, 16.5, 3.2, 2.6, 3.2, P.wallDark, { noNav: true });
  quad(6, 0, 16.5, 3.2, 2.6, 3.2, P.wallDark, { noNav: true });
  quad(-19.5, 0, 4, 3.4, 1.3, 6, P.pipe, { tag: 'cover' });
  // Conduits along the ceiling. Not solid — they exist to stop the roof
  // reading as one flat plane from the ring.
  for (let i = -2; i <= 2; i++) {
    m.box(-S, ROOF - 0.6, i * 8 - 0.5, S * 2, 0.6, 1.0, P.pipe, { solid: false });
    m.box(i * 8 - 0.5, ROOF - 0.6, -S, 1.0, 0.6, S * 2, P.pipe, { solid: false });
  }
  for (const [x, z] of [[-15, -15], [15, -15], [-15, 15], [15, 15], [0, -15], [0, 15], [-15, 0], [15, 0]]) {
    m.box(x - 1, ROOF - 0.75, z - 1, 2, 0.3, 2, P.amber, { glow: 0.9, solid: false });
    m.light(x, ROOF - 1.4, z, 16, '#ffc880', 0.5);
  }

  /* ── Spawns ────────────────────────────────────────────────────── */
  for (const [x, y, z, yaw] of [[-15, 0, -15, 0.8], [15, 0, -15, -0.8], [0, 0, -19, 0], [-12, 0, -19.5, 0.3],
                                [-19.5, 0, -12, 1.3], [19.5, 0, -12, -1.3]]) m.spawn(x, y, z, yaw, 1);
  for (const [x, y, z, yaw] of [[-15, 0, 15, 2.4], [15, 0, 15, -2.4], [0, 0, 19, 3.14], [12, 0, 19.5, -2.8],
                                [-19.5, 0, 12, 1.8], [19.5, 0, 12, -1.8]]) m.spawn(x, y, z, yaw, 0);
  for (const [x, y, z, yaw] of [[0, RING_Y, 8.8, 3.14], [0, RING_Y, -8.8, 0], [8.8, RING_Y, 0, -1.57],
                                [-8.8, RING_Y, 0, 1.57], [-12, 0, 19.5, 2.8], [12, 0, -19.5, -0.3]]) m.spawn(x, y, z, yaw, 2);

  return m.build();
}
