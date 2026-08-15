# UNDERSTORY — CANOPY 01

A single-page site for a fictional 3D printer, built around scroll-driven 3D.

Open `index.html` in a browser. No build step, no dependencies, no network calls.

```bash
python3 -m http.server 8000   # then visit localhost:8000
```

> **Other sites in this repository**
>
> - `peets/` — a design concept for a premium coffee brand, WebGL. No build step.
> - `underground/` — a design concept for Underground Cafe, an English
>   restaurant in Majan, Dubai. React + Tailwind, and the only thing here
>   that compiles; see [`underground/README.md`](underground/README.md).

## The constraint

**One hue for the world, neutral grey for the machine.**

The forest is a single green hue across a wide value range — from `#081205` in
the foreground silhouettes up to a sunlit `#A8CF72` in the far haze. No second
hue enters the landscape, and there is no photograph anywhere in the project.

The one deliberate exception is the printer itself, which is neutral grey. It is
the only manufactured object in frame, and letting it sit outside the green is
what makes it read as machinery dropped into a forest rather than grown there.

The grove is lit from behind, so the *distance* is the brightest part of the
frame and each nearer plane reads darker against it. That ordering is what makes
depth work; an earlier version had it exactly backwards, with the far plane
dimmest, and the result read as flat scenery rather than a grove.

That rule is also why there are no image assets. The jungle — bamboo culms in
three depth planes, fern undergrowth, canopy light shafts, drifting spores — plus
the machine, the filament spools and the printed vase are all generated at runtime
from gradients, CSS 3D transforms and canvas paths. Vectors stay sharp on a 4K
panel, weigh nothing, and can be animated without touching layout.

The machine's industrial design follows the enclosed CoreXY printers this page is
about: sheet-metal cube, single glass door, control unit at the top left of that
door, nameplate top right, mark on the right flank, feet. The brand on it is
invented, and deliberately does not reuse the trade dress of any real
manufacturer.

## The scroll animation

**Scrolling is the print job.** In the sticky `.print` section a parametric vase
is sliced into 480 layers and drawn in isometric projection. Scroll down and the
machine lays layers; scroll up and it un-prints. The HUD alongside reports real
state — layer count, Z height, nozzle temperature, and measured frame timing.

Two other scenes are scroll-driven: the machine rotates a full 360° through the
`.orbit` track with spec callouts firing at fixed offsets, and bamboo draws itself
upward as the closing CTA enters frame.

## Frame budget

One `requestAnimationFrame` loop drives everything (`core.js`). Scroll, resize and
pointer handlers never read layout — they park a number, and all work happens once
per frame against a damped scroll value, so the motion feels the same at 60 Hz or
240 Hz. Offscreen scenes are culled, the loop stops entirely when the tab is
hidden, and only `transform` and `opacity` are animated.

A note on the frame counter in the HUD: it shows what the browser actually
achieved. Browsers cap rendering at the display's refresh rate, so the target is
never dropping a frame below that ceiling rather than any particular number.

Two things turned out to dominate the budget and were removed rather than tuned:
full-viewport `filter: blur()` layers whose *contents* animate (which forces the
blurred layer to re-rasterise every frame), and an animated grain overlay. The
spotlight is now built from gradients that are soft by construction. On the
canvas, the 480 layer contours are batched into ~40 compound paths, so the whole
object costs roughly 40 fill operations per frame instead of 480.

## Files

```
index.html
assets/css/main.css     cascade layers: tokens → base → … → responsive
assets/js/core.js       the shared clock, scroll store, scroll-track helper
assets/js/scene.js      grove, undergrowth, spores, the CSS-3D machine, spools
assets/js/printjob.js   the layer-by-layer canvas print
assets/js/main.js       wiring, reveals, counters, telemetry
```

## Contrast

Text colour is set from measured contrast, not by eye. The label token was once
`rgba(166,204,92,.34)`, which lands around **2.1:1** on the page ground — well
under the 4.5:1 small text needs, and it carried every eyebrow, spec unit, HUD
label, footer link and the partner strip. Effectively half the page's small text
was unreadable. Labels now sit near 6:1 and body text near 7:1, and the micro
labels moved off `0.6rem` (9.6px), which was under-sized as well as under-set.

Brightening the grove made this harder rather than easier, so anything carrying
copy has its own ground: the hero copy sits in a pool of shade, the staged scenes
have a scrim behind the object, and the reading sections have a backdrop. Bright
scenery and legible text are in genuine tension here — the scrims are where that
tension is resolved, and they are the first thing to adjust if the balance should
move either way.

## Accessibility and degradation

`prefers-reduced-motion` is honoured — scenes hold representative end states
instead of animating, and the boot sequence is skipped. An inline head script sets
a `js` class before first paint; the boot overlay and every reveal-on-scroll style
is gated behind it, so with scripting unavailable the page is a static version of
itself rather than a blank screen. Verified in Chromium at 390 / 1280 / 1440 /
1600 px wide, with reduced motion, and with JavaScript disabled.
