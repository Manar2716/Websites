# AIRBUS — THE FUTURE OF FLIGHT

An interactive aviation site: eight Airbus aircraft you can walk around, board,
and fly, plus a global traffic radar. Everything three-dimensional in it is
generated in the browser at the moment you look at it.

```bash
python3 -m http.server 8000   # then open localhost:8000/airbus/
```

## What you can do

```
ENTER  →  scroll the film  →  open the hangar  →  pick an aircraft
       →  walk around it   →  go underneath    →  open a door
       →  walk the cabin   →  enter the flight deck
       →  press things     →  start the engines →  take off
       →  fly              →  land             →  open the radar
```

Keyboard: `1`–`5` jump between the hero, the hangar, the flight deck, flight and
the radar. In the walkaround, `WASD` moves, the mouse looks, `shift` runs and `E`
interacts. In the flight deck, `WASD` flies, `↑`/`↓` are thrust, `G` is the gear,
`F`/`V` the flaps, `B` the brake, `space` the spoilers and `C` cycles the camera.
Everything also has a button, and everything works on a touchscreen.

## The constraint

**No image assets, and no downloaded aircraft.**

There is not one photograph, texture file, or model file in this project. Every
aircraft is lofted at runtime from the published dimensions in
`assets/js/fleet.js`; every livery, panel, instrument face and runway marking is
drawn into a canvas when the page loads; every sound is synthesised from
oscillators and filtered noise.

That is not a stunt. It is what makes an A380 exactly 1.88 times as long as an
A220 when they are parked next to each other, because the builder scales the
model to `spec.length` and there is no artistic licence in between. It is also
why the whole fleet stays sharp on a 4K panel and costs no network at all.

The one exception is the globe, and it is the one place where invented geometry
would have been a lie: `assets/data/coastline.js` is Natural Earth 1:50m land
and border data — 1 420 rings, 60 500 points — quantised to 1/64°, delta-coded,
varint-packed and base64'd into 220 KB.

## What is real, and what is not

The site is a design study. It is not affiliated with Airbus SE, and the livery
is a house scheme in the manufacturer's own colours rather than any airline's
trade dress.

**Real:** every dimension, range, capacity, ceiling and powerplant on the spec
panels; the ICAO identifiers and coordinates in the flight-management computer;
the coastlines; the aerodynamic behaviour of the flight model in the sense that
matters (it will not fly below its stall speed and it will float if you cross
the threshold fast).

**Not real:** the registrations (invented, in the F-W… block Airbus uses for its
own development aircraft), the terrain, the airport, and — clearly labelled as
such — the demo radar traffic.

**The flight model is a simplified simulation, not a professional or certified
flight simulator**, and does not claim to be one.

### The radar, specifically

Live positions come from the OpenSky Network's public REST API, used
anonymously, one request every fifteen seconds, within its published limits.
Nothing is scraped and no restriction is worked around.

That endpoint returns identity, position, altitude, track and speed — and *not*
aircraft type. So in LIVE mode the type filters switch themselves off and say
why, rather than guessing an A320 from a callsign. Selecting one aircraft asks
the metadata endpoint about that single airframe, and the type appears only if
it comes back. If the API cannot be reached at all, the globe drops to a
**DEMO MODE** that is labelled everywhere it is visible; demo traffic flies real
great circles between real airports and is generated locally. No invented
position is ever presented as a real aircraft.

## How it is built

Vanilla ES modules, [three.js](https://threejs.org) for the renderer and
GSAP/ScrollTrigger for the scroll-scrubbed camera, both vendored into
`vendor/` rather than fetched at runtime. No build step: the repository is the
deployable artifact, which is the same arrangement as the other sites here.

```
index.html
vendor/                       three.module.min.js · gsap · ScrollTrigger
assets/data/coastline.js      Natural Earth 1:50m, packed
assets/css/airbus.css         cascade layers: tokens → base → chrome → story → stages → motion → responsive
assets/js/
  core.js        the clock, the numbers, quality tiers, the shared pointer
  world.js       one renderer, the sky, the post chain, the stage manager
  fleet.js       eight aircraft, described twice: specs and geometry
  build.js       the model builder — lofted fuselage, airfoil wings, hinged surfaces
  livery.js      paint, drawn at runtime
  scenery.js     terrain, ocean, clouds, cities, an airport
  hero.js        the opening and the scroll film
  hangar.js      eight aircraft in a building, and the two ways to look at them
  walk.js        the first-person controller
  cabin.js       the inside of the tube
  cockpit.js     an Airbus-style flight deck out of primitives and silkscreen
  displays.js    PFD · ND · ECAM, drawn every frame from the flight model
  mcdu.js        a working MCDU, with a real airport database
  sim.js         the flight model
  flightdeck.js  the aircraft, the deck in it, and the world it moves through
  radar.js       the globe
  audio.js       every sound, synthesised
  ui.js          cursor, magnetic navigation, panels, counters, boot
  main.js        boot, routing, and the code-splitting boundary
```

Only the hero and its aircraft are in the first parse. The hangar, the flight
deck and the radar are dynamic imports, fetched the first time someone asks for
them.

## Three things that turned out to matter

**Control surfaces move about their own hinges.** A flap on a swept wing rotates
about the swept hinge line, not about the model's X axis, so every moving
surface has its geometry baked into a frame built from its own hinge and is
deflected by composing a rotation onto that frame. Writing the deflection into
`rotation.x` instead — which is the obvious thing to do — silently discards the
other two Euler components, and produces a flap that is correct at 35° and
folded through the wing at 0°.

**The output transform is not free.** The post chain is hand-rolled, because the
effect composer that ships with three.js lives in the examples directory and
this project vendors only the core build. A `RawShaderMaterial` gets none of
three.js's automatic output conversion, so ACES and the sRGB transfer are
applied explicitly at the end of the composite pass. Without them the entire
site renders as though the sun had gone down — which it did, for about an hour.

**There is one sun.** The light and the ambient move between scenes rather than
being copied into them. An earlier version cloned the ambient at build time,
which froze each stage at whatever time of day happened to be set the first time
it was constructed, and made the flight deck permanently dusk.

## Performance

One `requestAnimationFrame` loop drives everything. Input handlers park numbers;
all work happens once per frame against damped values, so motion feels the same
at 60 Hz and at 240 Hz. A quality tier is chosen once from what the device
admits to — memory, cores, viewport — and sets shadow resolution, cloud counts,
fuselage segments and texture sizes. The render scale is the only thing that
moves at runtime, adjusted every half-second from measured frame time between
0.62 and 1.

The seven aircraft you are not looking at in the hangar are built in reduced
detail; selecting one promotes it to the full model and caches it. The terrain
is one draw call: a single grid that recentres on the camera and takes its
height from a noise function in the vertex shader, with vertices crowded toward
the middle so the horizon is not paying for detail nobody can see. Clouds and
cities are instanced. The flight-deck displays redraw at 20 Hz rather than every
frame.

## Accessibility and degradation

`prefers-reduced-motion` is honoured throughout: the boot hold is skipped, the
camera drifts stop, split-text reveals resolve immediately, counters jump to
their value and the film grain is removed. Every route is reachable from the
keyboard, and every 3-D interaction has an HTML control that does the same
thing. Sound is off until it is asked for, and the mute state is a real toggle
button with `aria-pressed`.

Text colour is set from measured contrast on the page ground rather than by eye:
body text sits near 15:1, secondary text near 7:1, and the faintest label token
at 4.6:1, which is the floor for the sizes it is used at. Nothing carrying copy
sits directly on moving 3-D without a ground of its own.

With scripting unavailable the page says so rather than showing a blank screen.
It cannot degrade further than that: there is no static version of a site whose
entire content is generated at runtime.

Verified in Chromium at 390 / 900 / 1600 px wide, with reduced motion, and with
sound both on and off.
