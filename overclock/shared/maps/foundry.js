/* FOUNDRY — a stripped-out casting hall.
 *
 * The shape of the fight: a sunken pit in the middle that everybody can
 * shoot down into, a catwalk crossing over it that everybody can shoot up
 * at, and a mezzanine ring on three walls so height is never a single
 * uncontested prize. The pit is the risk — good pickups-worth of cover but
 * only two ways out — and the south half is deliberately flat and open so
 * there is somewhere to fight that is not a height duel.
 */

import { MapBuilder } from './builder.js';

const P = {
  floor: '#3b3f45', floorAlt: '#33373d', deck: '#4a4038',
  wall: '#4b5158', wallDark: '#3a3f45', rib: '#5b6068',
  rust: '#8a5432', hot: '#e0713a', crate: '#7a6a4a',
  rail: '#6d7178', glass: '#7fb6c8', lamp: '#ffcf8f',
};

export function build() {
  const m = new MapBuilder({
    id: 'foundry',
    name: 'FOUNDRY',
    blurb: 'Casting hall. Sunken pit, catwalk overhead, mezzanine on three walls.',
    theme: {
      sky: '#242c34', horizon: '#3a4048', fog: '#2f353d', fogNear: 30, fogFar: 104,
      sun: [0.42, -0.78, 0.28], sunColor: '#ffe0bc', ambient: '#5c6a78', ambientGround: '#3f342a',
      exposure: 1.1,
    },
  });

  const S = 32;                       // half-extent: the hall runs -32..32
  const PIT = 9, PIT_Y = -3;

  /* ── Shell ─────────────────────────────────────────────────────── */
  // Ground floor, built as four slabs so the pit is a genuine hole.
  m.floor(-S, -S, S * 2, S - PIT, 0, P.floor);
  m.floor(-S, PIT, S * 2, S - PIT, 0, P.floor);
  m.floor(-S, -PIT, S - PIT, PIT * 2, 0, P.floorAlt);
  m.floor(PIT, -PIT, S - PIT, PIT * 2, 0, P.floorAlt);
  m.floor(-PIT, -PIT, PIT * 2, PIT * 2, PIT_Y, P.deck);

  // Pit revetment.
  m.box(-PIT - 0.4, PIT_Y, -PIT - 0.4, 0.4, 3, PIT * 2 + 0.8, P.wallDark);
  m.box(PIT, PIT_Y, -PIT - 0.4, 0.4, 3, PIT * 2 + 0.8, P.wallDark);
  m.box(-PIT - 0.4, PIT_Y, -PIT - 0.4, PIT * 2 + 0.8, 3, 0.4, P.wallDark);
  m.box(-PIT - 0.4, PIT_Y, PIT, PIT * 2 + 0.8, 3, 0.4, P.wallDark);

  m.room(-S, -S, S * 2, S * 2, PIT_Y, 13, 1.5, P.wall, '', { noNav: true });
  // Roof, so the skybox does not show through and shots do not fly forever.
  m.floor(-S, -S, S * 2, S * 2, 10.4, P.wallDark, { tag: 'roof' });

  // Structural ribs, purely to break up the walls and give the eye scale.
  for (let i = -3; i <= 3; i++) {
    m.box(-S + 1.5, 0, i * 9 - 0.4, 0.6, 10, 0.8, P.rib, { solid: false });
    m.box(S - 2.1, 0, i * 9 - 0.4, 0.6, 10, 0.8, P.rib, { solid: false });
  }

  /* ── Pit access ────────────────────────────────────────────────── */
  m.stairs(-3, PIT_Y, 3, 6, 6, 3, '+z', P.rust);     // south steps
  m.stairs(-3, PIT_Y, -PIT, 6, 6, 3, '-z', P.rust);  // north steps
  // Cover down in the pit — otherwise it is a killing floor from above.
  m.cover(-6, -6, 3.4, 3.4, PIT_Y, P.crate, 1.4);
  m.cover(2.6, 2.6, 3.4, 3.4, PIT_Y, P.crate, 1.4);
  m.box(-2, PIT_Y, -2.2, 4, 2.2, 4.4, P.rust);       // ladle block, centre
  m.box(-1.4, PIT_Y + 2.2, -1.6, 2.8, 0.3, 3.2, P.hot, { glow: 0.85 });

  /* ── Catwalk, east to west at y = 4 ────────────────────────────── */
  m.floor(-S, -2, S * 2, 4, 4, P.deck);
  for (const z of [-2.2, 1.9]) {
    // Stops short of the mezzanine runs at |x| > 23; railing across those
    // would fence the east and west decks in half.
    for (let x = -23; x < 23; x += 8) m.box(x, 4, z, 5.6, 0.9, 0.3, P.rail, { tag: 'cover' });
  }
  // Two ways down onto the ground floor mid-map, so it is not a trap.
  m.stairs(-16, 0, 2, 5, 6, 4, '-z', P.deck);
  m.stairs(11, 0, 2, 5, 6, 4, '-z', P.deck);

  /* ── Mezzanine on the north, east and west walls ───────────────── */
  m.floor(-S, -S, S * 2, 9, 4, P.deck);              // north run
  m.floor(-S, -S, 8, S * 2 - 8, 4, P.deck);          // west run
  m.floor(S - 8, -S, 8, S * 2 - 8, 4, P.deck);       // east run
  // Railings with deliberate gaps, so there are drop-down shortcuts.
  for (let x = -S + 2; x < S - 4; x += 10) m.box(x, 4, -S + 8.7, 7, 0.95, 0.35, P.rail, { tag: 'cover' });
  for (let z = -S + 11; z < S - 6; z += 10) {
    m.box(-S + 7.7, 4, z, 0.35, 0.95, 7, P.rail, { tag: 'cover' });
    m.box(S - 8, 4, z, 0.35, 0.95, 7, P.rail, { tag: 'cover' });
  }

  // Stairs up: two at the north corners, two at the south ends of the runs.
  m.stairs(-S + 9, 0, -S + 9, 4.5, 7, 4, '-z', P.rust);
  m.stairs(S - 13.5, 0, -S + 9, 4.5, 7, 4, '-z', P.rust);
  m.stairs(-S, 0, S - 9, 8, 7, 4, '-z', P.rust);
  m.stairs(S - 8, 0, S - 9, 8, 7, 4, '-z', P.rust);

  /* ── Ground-floor plant: the cover layout ──────────────────────── */
  const machine = (x, z, w, d, h) => {
    m.box(x, 0, z, w, h, d, P.wallDark);
    m.box(x - 0.25, h - 0.35, z - 0.25, w + 0.5, 0.35, d + 0.5, P.rib);
    m.box(x + w * 0.3, h, z + d * 0.3, w * 0.35, 0.9, d * 0.35, P.rust);
  };
  machine(-26, -20, 6, 5, 3.2);
  machine(20, -20, 6, 5, 3.2);
  machine(-24, 13, 7, 6, 2.6);
  machine(17, 13, 7, 6, 2.6);
  machine(-5.5, -26, 11, 5, 2.8);
  machine(-5.5, 21, 11, 5, 2.8);

  // Loose crates. Deliberately clustered near the pit lips, which is where
  // people get caught in the open crossing from one half to the other.
  const crates = [
    [-14, -12], [-14.2, -8.6], [12, 10], [12.2, 6.6], [-13, 8], [11, -12],
    [-22, 0], [20, 2], [0, -14], [-1.6, 14], [-19, -8], [17, -6],
  ];
  for (const [x, z] of crates) {
    m.cover(x, z, 2.2, 2.2, 0, P.crate, 1.25);
    if ((x + z) % 3 === 0) m.cover(x + 0.3, z + 0.3, 1.6, 1.6, 1.25, P.crate, 1.2);
  }

  // Corner cut-throughs: short walls that make the corners fights rather
  // than flat runs, and give the mezzanine stairs a contested approach.
  m.doorway(-S + 9, -S + 16, 10, 1.2, 0, 4, P.wall, 3.2);
  m.doorway(S - 19, -S + 16, 10, 1.2, 0, 4, P.wall, 3.2);
  m.doorway(-S + 9, S - 17, 10, 1.2, 0, 4, P.wall, 3.2);
  m.doorway(S - 19, S - 17, 10, 1.2, 0, 4, P.wall, 3.2);

  /* ── Light ─────────────────────────────────────────────────────── */
  for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, 0]]) {
    m.box(x - 2, 9.6, z - 0.4, 4, 0.35, 0.8, P.lamp, { glow: 1, solid: false });
    m.light(x, 9.2, z, 26, '#ffd39a', 0.8);
  }
  m.light(0, 0, 0, 16, '#ff8a3c', 0.9);

  /* ── Spawns ────────────────────────────────────────────────────── */
  // Alpha holds the north half, Bravo the south. FFA uses all of them,
  // and the picker rejects any that has an enemy in view anyway.
  const A = [[-26, -27, 0.4], [-9, -28, 0.1], [9, -28, -0.1], [26, -27, -0.4],
             [-28, -12, 1.4], [28, -12, -1.4]];
  const B = [[-20, 27, 2.9], [-9, 28, 3.1], [9, 28, 3.2], [20, 27, -2.9],
             [-28, 12, 1.7], [28, 12, -1.7]];
  for (const [x, z, yaw] of A) m.spawn(x, 0, z, yaw, 1);
  for (const [x, z, yaw] of B) m.spawn(x, 0, z, yaw, 2);
  // Neutral spawns up top and in the pit keep FFA from clumping.
  m.spawn(-27, 4, -27, 0.8, 0); m.spawn(27, 4, -27, -0.8, 0);
  m.spawn(-27, 4, 20, 1.6, 0); m.spawn(27, 4, 20, -1.6, 0);
  m.spawn(-6, PIT_Y, 5, 0.6, 0); m.spawn(6, PIT_Y, -6, 3.6, 0);

  return m.build();
}
