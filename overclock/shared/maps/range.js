/* RANGE — the aim-training hall.
 *
 * Deliberately dull. Every surface is flat and matte, the lighting is even
 * and there is nothing to read, because the whole point is that the only
 * thing your eye can land on is a target. The lanes exist to give distance
 * a visual scale, not to be cover.
 */

import { MapBuilder } from './builder.js';

const P = { floor: '#5b7994', line: '#82a6c4', wall: '#7691ab', wallDark: '#5a7488', trim: '#f0be2e', pad: '#3d5670' };

export function build() {
  const m = new MapBuilder({
    id: 'range',
    name: 'RANGE',
    blurb: 'Aim training hall. Flat light, no clutter, marked distances.',
    modes: ['aim'],
    theme: {
      sky: '#8fd8f8', horizon: '#daeffc', fog: '#d2e8f6', fogNear: 85, fogFar: 250,
      sun: [0.1, -0.95, 0.28], sunColor: '#ffffff', ambient: '#abd6ef', ambientGround: '#7290a8',
      exposure: 1.30,
    },
    /* Where the trainer is allowed to put targets, and where you stand. */
    training: {
      stand: { x: 0, y: 0.6, z: 30, yaw: 0 },
      area: { minX: -15, maxX: 15, minY: 1.0, maxY: 5.2, minZ: -26, maxZ: 14 },
    },
  });

  const W = 19, Z0 = -32, Z1 = 34;

  m.slab(-W, Z0, W * 2, Z1 - Z0, 0, P.floor);
  m.room(-W, Z0, W * 2, Z1 - Z0, 0, 11, 1.5, P.wall, '', { noNav: true });
  m.slab(-W, Z0, W * 2, Z1 - Z0, 11, P.wallDark, [], { tag: 'roof' });

  // Firing platform, half a metre up, so the shooting position is fixed.
  m.box(-8, 0, 27, 16, 0.6, 7, P.pad);
  m.stairs(-8, 0, 34 - 1.6, 16, 1.6, 0.6, '-z', P.pad);
  m.box(-8, 0.6, 26.6, 16, 0.85, 0.5, P.trim, { tag: 'cover' });

  // Distance marks every ten units, plus a lane grid on the floor.
  for (let z = 20; z >= -30; z -= 10) {
    m.box(-W + 1.5, 0.01, z - 0.15, W * 2 - 3, 0.02, 0.3, P.line, { solid: false });
    m.box(-W + 1.5, 0.02, z - 0.15, 0.8, 0.9, 0.3, P.trim, { glow: 0.7, solid: false });
    m.box(W - 2.3, 0.02, z - 0.15, 0.8, 0.9, 0.3, P.trim, { glow: 0.7, solid: false });
  }
  for (let x = -12; x <= 12; x += 6) m.box(x - 0.1, 0.01, Z0 + 2, 0.2, 0.02, 56, P.line, { solid: false });

  // A back wall with a slight bevel, so misses read as impacts on a
  // surface rather than vanishing into fog.
  m.box(-W + 1.5, 0, Z0 + 1.5, W * 2 - 3, 7, 0.6, P.wallDark);
  for (let i = 0; i < 6; i++) m.box(-W + 2 + i * 6, 0, Z0 + 2.1, 5, 0.5 + i % 2, 0.4, P.line);

  for (let z = 24; z >= -28; z -= 13) m.light(0, 9, z, 40, '#e6f0fa', 0.95);

  // Only used if somebody loads this map into a normal match.
  m.spawn(0, 0.6, 30, 0, 0);
  for (let i = 0; i < 5; i++) { m.spawn(-10 + i * 5, 0, 24, 0, 1); m.spawn(-10 + i * 5, 0, 18, 0, 2); }

  return m.build();
}
