/* ATRIUM — three floors of an abandoned office tower around an open void.
 *
 * This is the vertical map. The void in the middle means almost every
 * fight can be joined from above or below, and the glass balustrades are
 * see-through but not bullet-proof, so being visible and being safe come
 * apart — you can watch someone line you up through a panel that will not
 * stop the shot.
 *
 * All four staircases hang in the void itself rather than hiding in corner
 * shafts. That is partly the look, and partly because an open flight is a
 * commitment: you are exposed to two floors for the whole climb, which is
 * what stops the top floor from being a free camping spot.
 */

import { MapBuilder } from './builder.js';

const P = {
  floor: '#dbd8cf', floorAlt: '#c8c5bc', carpet: '#3f9dc4',
  wall: '#e6e4de', wallDark: '#aab0b8', trim: '#57b4d8',
  glass: '#7ad2f2', desk: '#dd8636', foliage: '#4fb25c',
  accent: '#efa42c', lamp: '#efeade', step: '#c3c0b7',
};

export function build() {
  const m = new MapBuilder({
    id: 'atrium',
    name: 'ATRIUM',
    blurb: 'Three floors around an open void. Glass you can see through and shoot through.',
    theme: {
      sky: '#7fd0f5', horizon: '#eaf7ff', fog: '#e9f5fc', fogNear: 62, fogFar: 215,
      sun: [-0.35, -0.82, -0.45], sunColor: '#ffffff', ambient: '#c2e4f7', ambientGround: '#cbd0d6',
      exposure: 1.26,
    },
  });

  const S = 28, H = 5;
  const V1 = 9, V2 = 11.5;                 // void half-width on floors 1 and 2
  const hole = (r) => [{ x: -r, z: -r, w: r * 2, d: r * 2 }];

  /* ── Shell ─────────────────────────────────────────────────────── */
  m.slab(-S, -S, S * 2, S * 2, 0, P.floor);            // lobby: solid
  m.slab(-S, -S, S * 2, S * 2, H, P.floorAlt, hole(V1));
  m.slab(-S, -S, S * 2, S * 2, H * 2, P.floorAlt, hole(V2));
  m.room(-S, -S, S * 2, S * 2, 0, H * 3 + 1.2, 1.4, P.wall, '', { noNav: true });
  m.slab(-S, -S, S * 2, S * 2, H * 3 + 1.2, P.wallDark, [], { tag: 'roof' });
  m.box(-V2, H * 3 + 0.7, -V2, V2 * 2, 0.4, V2 * 2, P.lamp, { glow: 1, solid: false });

  // Curtain wall mullions between the structural piers.
  for (let i = -2; i <= 2; i++) {
    for (const [x, z, w, d] of [[i * 10 - 1.2, -S + 1.4, 2.4, 0.5], [i * 10 - 1.2, S - 1.9, 2.4, 0.5],
                                [-S + 1.4, i * 10 - 1.2, 0.5, 2.4], [S - 1.9, i * 10 - 1.2, 0.5, 2.4]]) {
      for (let f = 0; f < 3; f++) m.box(x, f * H + 0.2, z, w, H - 0.8, d, P.trim, { solid: false });
    }
  }

  /* ── The four open flights ─────────────────────────────────────── */
  // Ground -> 1, inside the floor-1 void, landing where the deck begins.
  m.stairs(-V1 + 0.2, 0, -V1 + 0.4, V1 * 2 + 0.2, 3.0, H, '+x', P.step);
  m.stairs(-V1 + 0.2, 0, V1 - 3.4, V1 * 2 + 0.2, 3.0, H, '-x', P.step);
  // 1 -> 2, standing on the floor-1 deck but inside the floor-2 void.
  m.stairs(V1 + 0.3, H, -V2, 2.1, V2 * 2 + 0.2, H, '+z', P.step);
  m.stairs(-V1 - 2.4, H, -V2 - 0.2, 2.1, V2 * 2 + 0.2, H, '-z', P.step);
  // Stringers, so the flights read as objects rather than floating steps.
  m.box(-V1 + 0.2, 0, -V1 + 0.15, V1 * 2 + 0.2, 0.35, 0.25, P.trim, { solid: false });
  m.box(-V1 + 0.2, 0, V1 - 0.65, V1 * 2 + 0.2, 0.35, 0.25, P.trim, { solid: false });

  /* ── Balustrades ───────────────────────────────────────────────── */
  const rail = (y, r) => {
    const seg = (x, z, w, d) => m.box(x, y, z, w, 1.1, d, P.glass, { alpha: 0.34, shootThrough: true, tag: 'cover' });
    const n = 4, span = (r * 2 - 2.4) / n, len = span - 1.4;   // gaps are drop routes
    for (let i = 0; i < n; i++) {
      const a = -r + 1.2 + i * span;
      seg(a, -r - 0.25, len, 0.25); seg(a, r, len, 0.25);
      seg(-r - 0.25, a, 0.25, len); seg(r, a, 0.25, len);
    }
  };
  rail(H, V1); rail(H * 2, V2);

  /* ── Cover ─────────────────────────────────────────────────────── */
  const desk = (x, z, w, d, y = 0) => {
    m.cover(x, z, w, d, y, P.desk, 1.05);
    m.box(x + 0.15, y + 1.05, z + 0.15, w - 0.3, 0.12, d - 0.3, P.floorAlt);
  };
  const planter = (x, z, y = 0) => {
    m.cover(x, z, 2.4, 2.4, y, P.wallDark, 0.9);
    m.box(x + 0.3, y + 0.9, z + 0.3, 1.8, 1.5, 1.8, P.foliage, { solid: false });
  };

  // Corner service blocks on every floor: the map's only hard cover, and
  // they give each corner a short interior route instead of a dead end.
  for (const f of [0, 1, 2]) {
    const y = f * H;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx > 0 ? S - 11.5 : -S + 1.5, z = sz > 0 ? S - 11.5 : -S + 1.5;
      m.doorway(x, z, 10, 0.6, y, H - 1.2, P.wallDark, 3, 3.0);
      m.doorway(x, z, 0.6, 10, y, H - 1.2, P.wallDark, 3, 3.0);
      m.doorway(x, z + 9.4, 10, 0.6, y, H - 1.2, P.wallDark, 3, 3.0);
      m.doorway(x + 9.4, z, 0.6, 10, y, H - 1.2, P.wallDark, 3, 3.0);
      desk(x + 2, z + 3.4, 6, 2.2, y);
    }
    for (const [x, z] of [[-20, -6], [-20, 3], [16, -6], [16, 3], [-6, -20], [3, -20], [-6, 16], [3, 16]]) {
      if (f === 0 || Math.abs(x) > 12 || Math.abs(z) > 12) desk(x, z, 4.5, 2.2, y);
    }
    for (const [x, z] of [[-14.5, -14.5], [12, -14.5], [-14.5, 12], [12, 12]]) planter(x, z, y);
  }
  m.box(-4, 0, -4, 8, 0.06, 8, P.carpet, { solid: false });

  /* ── Light ─────────────────────────────────────────────────────── */
  m.light(0, H * 3, 0, 52, '#ffffff', 1.0);
  for (const f of [0, 1, 2]) for (const [x, z] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) m.light(x, f * H + 4, z, 18, '#ffeccd', 0.5);

  /* ── Spawns ────────────────────────────────────────────────────── */
  for (const [x, y, z, yaw] of [[-19, 0, -24, 0.4], [-6, 0, -24, 0.1], [6, 0, -24, -0.1], [19, 0, -24, -0.4],
                                [-24, H, -10, 1.2], [24, H, -10, -1.2]]) m.spawn(x, y, z, yaw, 1);
  for (const [x, y, z, yaw] of [[-19, 0, 24, 2.7], [-6, 0, 24, 3.1], [6, 0, 24, 3.2], [19, 0, 24, -2.7],
                                [-24, H, 10, 1.9], [24, H, 10, -1.9]]) m.spawn(x, y, z, yaw, 2);
  for (const [x, y, z, yaw] of [[-24, H * 2, -6, 1.5], [24, H * 2, -6, -1.5], [-24, H * 2, 6, 1.6],
                                [24, H * 2, 6, -1.6], [0, 0, -14, 0], [0, 0, 14, 3.14]]) m.spawn(x, y, z, yaw, 0);

  return m.build();
}
