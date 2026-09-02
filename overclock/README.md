# OVERCLOCK

A fast arcade first-person shooter that runs in a browser tab. Real online
multiplayer against a dedicated authoritative server, four game modes, four
maps, eleven weapons, bots that can hold their own, and a control scheme
designed for a phone held sideways rather than retrofitted to one.

```bash
node server/index.js          # then open http://localhost:8080
```

There is no build step and no dependency to install. The server is one Node
process using nothing but the standard library; the client is ES modules
served as files.

For a copy you can open from anywhere — no server, no network, offline
against bots:

```bash
node tools/bundle.mjs overclock-standalone.html
```

That inlines the whole module graph, the stylesheet and the markup into one
455 kB file that makes no external requests at all.

**This is an original game.** It is built around the same appeal as the
browser arena shooters — instant to start, fast to move, quick to kill — but
every map, weapon, model, sound, name and pixel of interface here was made
for this project. Nothing is copied from any existing game, and there are no
asset files of any kind: the geometry, the audio and the artwork are all
generated in code at runtime.

## The one architectural decision

**The simulation is isomorphic, and the client plays against it through the
same protocol either way.**

`shared/` holds the whole game: movement, collision, weapons, hit
resolution, game modes, bot AI, room and lobby management. `server/` is the
node-shaped shell around it — sockets, files and a clock. `client/` is
rendering, input and interface.

That split buys three things that would otherwise each be their own problem:

- **Prediction that actually matches.** The client runs the identical
  `stepMovement` the server will run, so what it predicts is what the server
  computes, and reconciliation converges instead of fighting.
- **Offline play for free.** Choosing *Play offline* constructs a
  `LocalTransport` that hosts a room in the same tab. It speaks the same
  binary protocol to the same room code. Practice mode is not a second
  implementation of the game that can drift from the real one — it is the
  real one with a shorter wire.
- **A server you can actually run.** One process, no dependencies, ~0.3 ms
  per tick for a full room.

## Playing

| | |
|---|---|
| **Move** | `WASD` · left thumb (the stick appears wherever you touch) |
| **Look** | mouse · drag anywhere the buttons are not |
| **Sprint** | `Shift` · push the stick to its edge, or the RUN button |
| **Fire / sights** | left / right mouse · FIRE and ADS buttons |
| **Jump · crouch · reload** | `Space` · `Ctrl` · `R`, or their buttons |
| **Weapons** | `1` `2` `3`, `Q`, scroll wheel · SWAP |
| **Scoreboard** | hold `Tab` · TAB button |
| **Pause** | `Esc` |

Every touch button can be dragged, resized and made more or less
transparent, and the layout is saved in the browser. Sensitivity is
adjustable for look, sights, horizontal and vertical independently, with
optional gyroscope aiming layered on top.

## Modes, maps, weapons

**Free For All · Team Deathmatch · Gun Game · Practice.** Gun Game marches
everyone up an eleven-rung ladder ending on the knife. Practice is bots only
with no clock.

**FOUNDRY** is a casting hall built around a sunken pit, a catwalk crossing
over it and a mezzanine on three walls, so height is never one uncontested
prize. **ATRIUM** is three office floors around an open void, with glass you
can see through and shoot through — being visible and being safe come apart.
**DUNES** is the long-range map: a ridge that sees the whole lake bed, and a
tunnel underneath that sees none of it, so the answer to being pinned is a
route rather than a better gun. **REACTOR** is small and four-fold
symmetric, with a solid core in the middle: no sightline crosses the map, so
every fight is an arc.

Eleven weapons across seven classes, balanced on shots-to-kill and
time-to-kill rather than raw damage. Each has its own recoil pattern, spread
behaviour, sight speed, movement penalty and range falloff, and its own
shape in the viewmodel.

## Netcode

Server-authoritative, 60 Hz simulation, 20 Hz snapshots.

The client never sends a position, a health value, an ammo count or a hit.
It sends two movement axes, a button field and a view angle; the server
simulates the consequences. That is most of the anti-cheat, and it is
structural rather than a list of checks — there is no `dt` to inflate
because the server steps a fixed tick per command regardless of what the
client claims elapsed, and no ammo to edit because the client's copy is
advisory. What remains is small and explicit, in `sanitiseCommand`: clamped
axes, a clamped pitch, stripped unknown button bits, a bounded input queue
and a bounded drain rate.

Three things make it feel local anyway:

**Prediction.** Local input is simulated immediately and the command is
kept. When the server's answer disagrees, the correction is applied to the
simulation at once but faded out of the *camera* over about a tenth of a
second, so a small disagreement never reads as a jolt. A large one snaps,
because hiding it would be lying about where you are.

**Interpolation.** Remote players are drawn about 110 ms in the past, far
enough behind that there are always two snapshots to interpolate between
even when one is dropped. Nothing is extrapolated: a player who snaps back a
body-width mid-strafe is far worse to shoot at than one drawn slightly late.

**Lag compensation.** The server rewinds every other player to where the
shooter's screen showed them before testing the ray, capped at 250 ms. That
is the refund for the interpolation delay above: it makes "I put the
crosshair on them" the rule at any ping, at the known cost of occasionally
dying a moment after reaching cover.

A snapshot of sixteen players is 300 bytes — about 6 kB/s down. Bullet
impacts are never sent: the client has the map, the shooter's angles and the
same deterministic spread function, so it resolves the pellets itself. A
nine-pellet shotgun blast costs nothing on the wire.

The WebSocket layer is RFC 6455 implemented directly on the HTTP upgrade
(`server/ws.js`) — a couple of hundred visible lines instead of a
dependency, with a message-size cap and a write-backlog cap so a client that
stops reading cannot grow the server's memory.

## Rendering

**Every solid thing in this game is a box** — map brushes, player limbs, the
gun in your hands, the crates — so there is one unit cube in video memory
and one instance buffer describing where the copies go. The entire world and
every player in it is a single draw call; a full match is five calls a
frame. Adding detail to a map costs an array entry, not a draw call.

There are no textures and no image files. Surfaces get their detail from
panel lines and low-frequency mottling derived from world position in the
fragment shader, which is lighter than a texture and never has to be
downloaded.

On the high preset the sun casts a real shadow map, and it is cheap for a
reason particular to this geometry: the sun does not move and neither does
the map, so the orthographic frustum is fitted to the world bounds once at
load and the depth pass never has to be re-framed. The pass renders back
faces (`gl.cullFace(gl.FRONT)`), which on closed boxes is a depth offset
that costs nothing and removes most of the acne a bias would otherwise have
to hide; what remains is handled by a slope-scaled bias and a 3x3 PCF tap.
Below that preset, contact darkening on the underside of every box plus a
blob under each player does the job a shadow actually does at this scale —
telling you whether somebody is on your floor or the balcony above it.

The frame then goes through a post chain (`client/js/engine/post.js`):
FXAA, because low-poly geometry is nothing but long shallow edges and that
is the worst case for aliasing; and a bright-pass plus two separable blurs
at quarter resolution, added back, which is what makes strip lights and
muzzle flashes read as light rather than as pale paint. Both are off on the
low preset — a phone that is struggling wants its fill rate spent on the
scene.

One trap worth naming, because it cost a repaint: the scene renders into an
8-bit target, so by the time the composite reads it the colour is already
exposed and clamped. Running a filmic tone curve there is tone-mapping the
same image twice. An ACES fit maps 1.0 to 0.80 and squeezes 0.70-1.00 into
the 0.72-0.80 band while lifting shadows — on a high-key palette that turns
the whole game grey, and it looks like a lighting bug rather than a
composite one. The curve now applies above a knee only, where the sole
thing that can exceed the ceiling is the bloom that was just added.

The look is high-key on purpose: saturated flat colour, long sightlines,
and nothing lost in shadow. That is harder to light than a dark game, in a
specific way — raise albedo, ambient and exposure together and every
surface clips to flat white, which reads as a rendering bug and is really
an arithmetic one. `tools/check-lighting.mjs` evaluates the same expression
the shader does, for every map and several surface orientations, and fails
if anything clips or crushes. The palette is balanced by measurement rather
than by eye.

Because the world is bright, the interface cannot rely on it being dark.
Every HUD value carries a hard four-way outline plus a soft shadow, so the
ammo counter is legible over a white floor and a black doorway alike, and
the browser tests assert that no HUD element runs off the edge of the
screen at any of the three viewport sizes.

The performance dial that matters most on a phone is resolution, so it is
automatic: the backing store shrinks when frames run long and grows back
grudgingly, dropping resolution rather than frames. Quality presets set the
light budget, surface detail and particle budget together.

Shaders are written in GLSL ES 1.00 deliberately — WebGL2 accepts them and
WebGL1 requires them, so there is one source rather than two, and the game
runs on anything from the last decade.

## Bots

Bots produce exactly the command structure a human client sends and are
stepped by the same match loop. A bot cannot do anything a player could not,
cannot see through a wall unless the same raycast says it can, and appears
to the rest of the system as an ordinary participant.

They navigate a graph derived from the map rather than hand-placed
waypoints: sample every column for walkable surfaces, link neighbours the
player could walk, climb, jump or drop between, then A* over the result. A
new map gets working navigation for free, and `tools/test-sim.js` checks
that a map's whole graph is reachable from its spawns — a deck you can only
fall off looks completely normal in the renderer and makes bots pile up at
the bottom of a staircase.

Four difficulty tiers, measured rather than asserted. Put three of each in
one match and the K/D separates cleanly:

```
tier      kills  deaths    K/D   accuracy
easy        106     330    0.32        46%
normal      256     322    0.80        44%
hard        409     298    1.37        36%
insane      464     285    1.63        32%
```

The lever that separates them most is not aim error but firing discipline —
how lined up a bot insists on being before it pulls. A loose tolerance means
firing during the swing and missing most of the burst, which is also how
people miss.

## Sound

Every sound is synthesised when it plays. There is not one audio file, so
there is nothing to download and nothing to decode on a slow phone.

A gunshot is three layers, which is roughly what one is: a click transient
for the mechanism, a filtered noise burst for the blast, and a short low
body for weight. Distance does three things at once — quieter, later, and
duller — and the low-pass is what makes a far-off firefight sound far off.
Positioning is stereo pan plus attenuation rather than HRTF panning, which
with sixteen players firing is the most expensive thing on the audio thread
and inaudible through a phone speaker.

## Layout

```
index.html                  the client
client/css/app.css          interface, sized in vmin and inset from the notch
client/js/main.js           boot and wiring
client/js/engine/           WebGL: context, instanced boxes, sprites, matrices
client/js/game/             prediction, interpolation, effects, avatars, viewmodel
client/js/input/            keyboard and mouse, touch, gyroscope
client/js/ui/               screens, HUD, menus, settings
client/js/audio/            the synthesised sound bank
client/js/modes/            aim training
shared/constants.js         everything both ends must agree on
shared/weapons.js           the armory, as data
shared/protocol.js          the wire format
shared/maps/                brush DSL and the four maps
shared/sim/                 movement, combat, modes, bots, the match loop
shared/net/                 rooms, lobbies, session handling
server/index.js             http + sockets + clock
server/ws.js                RFC 6455, implemented directly
tools/test-*.js             simulation, server and browser checks
```

## Tests

```bash
npm test                    # simulation and a real server over a real socket
npm run test:browser        # Chromium, three viewport sizes, two clients in one room
npm run test:bundle         # the single-file build, loaded from file://
npm run test:controls       # every desktop control, read off the simulation
```

`test-sim.js` runs the real match loop rather than a mock: map reachability,
weapon balance, a duel resolving, friendly fire and spawn protection, the
input validation, every game mode's end condition, and whether bot
difficulty is actually monotonic. `test-server.js` drives the real server
over a real WebSocket — handshake, room codes, host authority, binary
snapshots, input moving a player server-side, ammo authority, reconnection
by token, and that malformed input leaves it running. `test-browser.mjs`
plays a match through the real interface at phone, tablet and desktop sizes,
then puts two browsers in one room. `test-bundle.mjs` opens the single-file
build straight off the filesystem and plays it, including with pointer lock
refused — the case an embedded copy hits, and one that would otherwise leave
a desktop player unable to look around.

`test-controls.mjs` presses every desktop key and mouse button in turn and
reads the result off the predicted player state rather than off the screen,
which is the whole point of it: a mirrored look axis, a dropped jump and a
key that cycles the loadout while held all look completely correct in a
screenshot, and all three were real.

## Deploying

The client alone is static and will run from any file host, playing offline
against bots. For multiplayer, run `server/index.js` anywhere with a Node
runtime — it serves the client and hosts the rooms from the same process and
the same port. Point a client at a server elsewhere with `?server=wss://…`.

## Known edges

- The minimap shows teammates in team modes and nobody in free-for-all, on
  purpose. A radar that shows enemies is a wallhack with a nice frame.
- There is no account system. Statistics, settings and control layouts live
  in the browser's local storage, and nothing is sent anywhere.
- Room browsing is per-server. There is no global matchmaking service, and
  adding one is a deployment decision rather than a code change.
