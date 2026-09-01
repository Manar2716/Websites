/* DUNES — a wind-scoured outpost on a dry lake bed.
 *
 * The long-range map. The centre is deliberately open and deliberately
 * lethal: a sniper on the west ridge covers most of it. What keeps that
 * fair is the tunnel — a covered north-south run under the compound that
 * crosses the map without ever entering the ridge's sightline, so the
 * answer to being pinned is a route rather than a better gun.
 */

import { MapBuilder } from './builder.js';

const P = {
  sand: '#f6d07c', sandDark: '#e7b55b', rock: '#da9c57', rockDark: '#b97c40',
  crete: '#f0e7d4', creteDark: '#d5c9b0', metal: '#8b95a1', rust: '#ff7a3d',
  cloth: '#3fb8c4', dark: '#6d5737', lamp: '#ffd98f', tunnel: '#a68350',
};

export function build() {
  const m = new MapBuilder({
    id: 'dunes',
    name: 'DUNES',
    blurb: 'Open lake bed, a ridge that sees everything, and a tunnel that sees none of it.',
    theme: {
      sky: '#37b6e8', horizon: '#ffe9b8', fog: '#f3e0b0', fogNear: 75, fogFar: 265,
      sun: [0.5, -0.72, -0.48], sunColor: '#fff6d8', ambient: '#92d2ef', ambientGround: '#e2ba7a',
      exposure: 1.30, outdoor: true,
    },
  });

  const S = 38, TY = -3.5;                   // map half-extent, tunnel floor

  /* ── Ground, with the two tunnel mouths punched out ────────────── */
  const mouths = [{ x: -3.5, z: -21, w: 7, d: 7 }, { x: -3.5, z: 14, w: 7, d: 7 }];
  m.slab(-S, -S, S * 2, S * 2, 0, P.sand, mouths);
  // Cliffs. Tall enough that nothing escapes the play area, and marked
  // out of the nav sampler so their tops are not "walkable".
  m.room(-S, -S, S * 2, S * 2, TY - 2, 26, 3.2, P.rock, '', { noNav: true });

  /* ── The tunnel ────────────────────────────────────────────────── */
  m.floor(-4.5, -21, 9, 42, TY, P.tunnel);
  // Side walls in segments, leaving a gap where each alcove opens.
  for (const [z0, z1] of [[-21, -11], [-6, 21]]) m.box(-4.9, TY, z0, 0.4, 3.1, z1 - z0, P.rockDark);
  for (const [z0, z1] of [[-21, 4], [9, 21]]) m.box(4.5, TY, z0, 0.4, 3.1, z1 - z0, P.rockDark);
  // Roof over the stretch that is not already under the ground slab.
  m.box(-4.9, 0, -21, 9.8, 0.5, 7, P.rockDark, { solid: false });
  m.stairs(-3.5, TY, -21, 7, 6.4, 3.5, '-z', P.crete);
  m.stairs(-3.5, TY, 14.6, 7, 6.4, 3.5, '+z', P.crete);
  for (const z of [-16, -8, 0, 8, 16]) {
    m.box(-3.4, TY + 2.4, z, 0.5, 0.25, 0.5, P.lamp, { glow: 1, solid: false });
    m.light(-3, TY + 2.2, z, 11, '#ffcf8a', 0.7);
  }
  // Side alcoves: somewhere to break a straight run down a straight tube.
  const alcove = (x0, z0, w, d) => {
    m.floor(x0, z0, w, d, TY, P.tunnel);
    if (x0 < 0) m.box(x0 - 0.4, TY, z0 - 0.4, 0.4, 3.1, d + 0.8, P.rockDark);
    else m.box(x0 + w, TY, z0 - 0.4, 0.4, 3.1, d + 0.8, P.rockDark);
    m.box(x0 - 0.4, TY, z0 - 0.4, w + 0.8, 3.1, 0.4, P.rockDark);
    m.box(x0 - 0.4, TY, z0 + d, w + 0.8, 3.1, 0.4, P.rockDark);
  };
  alcove(-8.5, -11, 4, 5);
  alcove(4.9, 4, 4, 5);

  /* ── West ridge: the long-range platform ───────────────────────── */
  m.box(-S + 3.2, 0, -26, 14, 4.5, 52, P.rock, { top: P.rockDark });
  m.stairs(-21, 0, -16, 7, 7, 4.5, '-x', P.rockDark);
  m.stairs(-21, 0, 9, 7, 7, 4.5, '-x', P.rockDark);
  for (const z of [-22, -12, -2, 8, 18]) m.cover(-32, z, 3.4, 4.4, 4.5, P.rockDark, 1.2);
  // Overhang, so the ridge is not safe from the compound roof either.
  m.box(-S + 3.2, 6.4, -26, 3, 1.4, 52, P.rock, { solid: false });

  /* ── North-east mesa ───────────────────────────────────────────── */
  m.box(20, 0, -S + 3.2, 15, 6, 15, P.rock, { top: P.rockDark });
  m.stairs(20, 0, -20, 15, 6.5, 6, '-z', P.rockDark);
  m.cover(22, -30, 4, 3.2, 6, P.rockDark, 1.25);
  m.cover(29, -22, 3.2, 4, 6, P.rockDark, 1.25);

  /* ── The compound, dead centre ─────────────────────────────────── */
  // A walled yard with a walkable roof; the tunnel runs beneath it.
  const C = 11;
  m.doorway(-C, -C, C * 2, 0.7, 0, 4, P.crete, 4.5, 3.0);
  m.doorway(-C, C - 0.7, C * 2, 0.7, 0, 4, P.crete, 4.5, 3.0);
  m.doorway(-C, -C, 0.7, C * 2, 0, 4, P.crete, 4.5, 3.0);
  m.doorway(C - 0.7, -C, 0.7, C * 2, 0, 4, P.crete, 4.5, 3.0);
  // Roof, with the stairwell and the two tunnel mouths left open.
  m.slab(-C, -C, C * 2, C * 2, 4, P.creteDark, [{ x: 4, z: -4, w: 7, d: 8 }]);
  m.stairs(4.4, 0, -3.4, 6.2, 7.4, 4, '+z', P.creteDark);
  for (let i = 0; i < 4; i++) {
    const a = -C + 1.4 + i * 5.4;
    m.box(a, 4, -C, 3.4, 1.0, 0.7, P.creteDark, { tag: 'cover' });
    m.box(a, 4, C - 0.7, 3.4, 1.0, 0.7, P.creteDark, { tag: 'cover' });
    m.box(-C, 4, a, 0.7, 1.0, 3.4, P.creteDark, { tag: 'cover' });
    m.box(C - 0.7, 4, a, 0.7, 1.0, 3.4, P.creteDark, { tag: 'cover' });
  }
  m.cover(-9, 3, 3, 3, 0, P.rust, 1.3);
  m.cover(6, -8.5, 3, 3, 0, P.rust, 1.3);

  /* ── Outbuildings ──────────────────────────────────────────────── */
  const shed = (x, z, w, d, h, open) => {
    m.room(x, z, w, d, 0, h, 0.6, P.crete, open);
    m.slab(x, z, w, d, h, P.creteDark);
    m.cover(x + 1, z + 1, w - 2, 1.4, 0, P.metal, 1.1);
  };
  shed(-24, 22, 11, 10, 3.4, 'n');
  shed(15, 20, 12, 11, 3.4, 'w');
  shed(-30, -32, 10, 9, 3.4, 's');
  shed(24, 6, 10, 10, 3.6, 'w');
  // Crates against the sheds double as the way onto their roofs. They are
  // staggered rather than stacked: two boxes in one footprint is a pillar
  // nothing can climb, two side by side is a staircase.
  const stack = (x, z, dx, dz) => {
    m.cover(x, z, 2.3, 2.3, 0, P.rust, 1.25);
    m.cover(x + dx * 2.4, z + dz * 2.4, 2.3, 2.3, 0, P.rust, 2.4);
  };
  stack(-27.6, 20.6, 1, 0); stack(27.4, 17.4, -1, 0);
  stack(11.2, 18.6, 1, 0); stack(20.2, 4.6, 1, 0);

  /* ── Sand berms and rocks: the open-ground cover ───────────────── */
  const berm = (x, z, w, d) => m.cover(x, z, w, d, 0, P.sandDark, 1.3);
  for (const [x, z, w, d] of [
    [-18, -26, 10, 2.6], [-6, -30, 2.6, 9], [6, -22, 11, 2.6], [16, -12, 2.6, 10],
    [-19, -6, 9, 2.6], [-16, 6, 2.6, 11], [3, 14, 10, 2.6], [-8, 26, 2.6, 9],
    [20, 28, 11, 2.6], [26, -8, 2.6, 12], [-30, 30, 9, 2.6], [8, 30, 2.6, 8],
  ]) berm(x, z, w, d);
  for (const [x, z, s, h] of [[-14, -18, 3.4, 2.6], [12, -30, 4, 3.2], [30, 14, 3.6, 2.8],
                              [-26, 8, 3.2, 2.4], [18, 30, 3.8, 2.6], [-13, 32, 3.4, 2.2],
                              [32, -12, 3, 2.4], [-33, -14, 3.4, 2.6]]) {
    m.box(x, 0, z, s, h, s, P.rock);
    m.box(x + 0.4, h, z + 0.4, s - 0.8, 0.5, s - 0.8, P.rockDark);
  }

  m.light(0, 12, 0, 90, '#ffe9c4', 0.55);
  m.light(0, 3.2, 0, 16, '#ffd9a0', 0.6);

  /* ── Spawns ────────────────────────────────────────────────────── */
  for (const [x, y, z, yaw] of [[-17, 0, -30, 0.9], [-8, 0, -33, 0.2], [2, 0, -34, 0], [31, 6, -30, 3.0],
                                [-26, 4.5, -20, 1.6], [14, 0, -33, -0.3]]) m.spawn(x, y, z, yaw, 1);
  for (const [x, y, z, yaw] of [[-33, 0, 30, 2.5], [-17, 0, 33, 3.1], [4, 0, 34, 3.14], [33, 0, 30, -2.5],
                                [-26, 4.5, 20, 1.6], [10, 0, 26, 3.4]]) m.spawn(x, y, z, yaw, 2);
  for (const [x, y, z, yaw] of [[-8, 4, 6, 0.7], [-26, 4.5, 0, 1.57], [33, 0, -4, -1.57],
                                [0, TY, -8, 3.14], [0, TY, 8, 0], [-17, 0, 6, 1.2]]) m.spawn(x, y, z, yaw, 0);

  return m.build();
}
