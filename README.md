# UNDERSTORY — CANOPY 01

A single-page site for a fictional 3D printer, built around scroll-driven 3D.

Open `index.html` in a browser. No build step, no dependencies, no network calls.

```bash
python3 -m http.server 8000   # then visit localhost:8000
```

## The constraint

**One hue. No exceptions.**

Every pixel is black or chlorophyll green. The palette is a single ramp from
`#040705` to a sunlit `#D8EFA0`, which does the job white normally does — there
is no white, no second accent, and no photograph anywhere in the project. Hue
stays inside 82–96° throughout.

That rule is also why there are no image assets. The bamboo grove, the machine,
the spore field, the filament spools and the printed vase are all generated at
runtime from gradients, CSS 3D transforms and canvas paths. Vectors stay sharp on
a 4K panel, weigh nothing, and can be animated without touching layout.

The brand is invented. It deliberately does not reuse the trade dress of any real
printer manufacturer.

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
assets/js/scene.js      grove, spore field, the CSS-3D machine, spools, growth
assets/js/printjob.js   the layer-by-layer canvas print
assets/js/main.js       wiring, reveals, counters, telemetry
```

## Accessibility and degradation

`prefers-reduced-motion` is honoured — scenes hold representative end states
instead of animating, and the boot sequence is skipped. An inline head script sets
a `js` class before first paint; the boot overlay and every reveal-on-scroll style
is gated behind it, so with scripting unavailable the page is a static version of
itself rather than a blank screen. Verified in Chromium at 390 / 1280 / 1440 /
1600 px wide, with reduced motion, and with JavaScript disabled.
