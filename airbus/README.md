# FLIGHT ENVELOPE

A design study of four Airbus airframes, built as a real site rather than a mockup.

Open `index.html` in a browser. No build step, no dependencies, no network calls.

```bash
python3 -m http.server 8000   # then visit localhost:8000/airbus/
```

**This is an independent design study.** It is not affiliated with, endorsed by,
or produced by Airbus SE. Aircraft type designations are used descriptively to
identify the airframes studied; all artwork, geometry, copy and code here are
original to this project. No manufacturer logo, photograph, brand asset or
marketing text appears anywhere in it.

## The constraint

**Nothing in this project is a picture.**

There is no image file, no icon font, no webfont, no library. The four aircraft,
the sky, the cloud decks, the globe, the cabin section and the payload-range
chart are all generated at runtime from maths. That is not a stunt — it is what
makes the rest of the ideas possible.

### Aircraft are parameters, not drawings

Each type is a parameter set: fuselage length, span, sweep, chord distribution,
nacelle stations, deck count. `plan()` and `profile()` turn a parameter set into
SVG path data.

Because all four share one topology — the same control points in the same order —
you can linearly interpolate between two parameter sets and regenerate the paths.
So the fleet selector performs a **true morph**, not a cross-fade: an A220 grows
into an A380 through intermediate shapes that are themselves plausible aircraft.
The outer nacelle does not pop in when you select the A380; it scales up from
nothing while the inner one slides outboard.

The same interpolation runs over the spec numbers, so the figures travel with the
geometry instead of snapping at the end.

And because the geometry is authored in metres and drawn into one viewBox, the
wingspan strip at the bottom of that section is honestly to scale. The A380 is not
"drawn bigger". It is 79.75 m across next to an A220's 35.10 m.

### The network is real spherical geometry

The globe is an orthographic projection of a unit sphere with a graticule and
back-face culling. Routes are **slerped** between real airport coordinates, so
they bow the way a real track does — the New York–Tokyo line goes over the pole
because that genuinely is the short way round. Distances are haversine on
R = 6371 km, computed at load, not typed in.

The part worth clicking: each sector is gated against the **published range of
whichever aircraft is selected two sections above**. Select the A220-300 and five
of the twelve sectors grey out and re-label themselves as beyond range. The
network is a function of the airframe, which is the actual relationship the
section is about.

### Scroll is a flight

The corner readout is not decoration. Altitude, Mach and flight phase are
computed from scroll progress through a climb/cruise/descent profile, so the
number in the HUD is a real statement about where you are in the document.

## Motion architecture

One `requestAnimationFrame` loop drives everything (`core.js`). Scroll, resize and
pointer handlers never read layout — they park a number, and all work happens once
per frame against a damped scroll value, so the motion feels identical at 60 Hz or
240 Hz. Offscreen scenes cull themselves, the loop stops entirely when the tab is
hidden, and only `transform` and `opacity` are animated.

**Scrolling is not hijacked.** A lot of sites in this genre take the scrollbar away
to get cinematic lag. This one doesn't: native scrolling stays native — trackpad
inertia, keyboard paging, find-in-page and screen readers all behave normally.
What's smoothed is a *derived* value the animations read instead of `scrollY`. You
get the lag without paying for it in usability.

The one genuinely expensive-looking thing, the three parallax cloud decks, costs
almost nothing: each deck is rendered once into an offscreen canvas at boot and
then blitted twice per frame at an offset. A deck made of ninety soft radial
gradients is two `drawImage` calls. Only the contrail particles are live geometry.

## Colour

One hue family for the world, one warm accent for the interface. The sky runs from
`#04070F` down to a thin warm band at the horizon, and every surface is a step
inside that same cold blue. The single warm colour, `#FF7A2E`, is reserved for
interface state — focus, active, hover — and never appears in the scenery, which
is what keeps it legible as "this is a control".

The four fleet colours are a separate, **validated** categorical set. They were
checked against the dark chart surface for lightness band, chroma floor,
colour-vision-deficiency separation (worst adjacent pair ΔE 9.8 deutan), normal-
vision separation and contrast. They also never carry meaning alone — every
coloured mark sits next to a text label.

| | Type | Hex |
|---|---|---|
| ● | A220-300 | `#3494DC` |
| ● | A321neo | `#C87524` |
| ● | A350-1000 | `#17AD7E` |
| ● | A380-800 | `#9A6BE0` |

## Accessibility

- `prefers-reduced-motion` is respected throughout: the boot sequence, parallax,
  contrails, globe auto-rotation, cabin cycling and every reveal either stop or
  resolve instantly.
- The fleet selector is a real tab list with arrow-key navigation and managed
  focus.
- Every chart and spec panel is duplicated as a plain table under
  *Full figures, all four types*.
- The page is readable and navigable with JavaScript off — a `<noscript>` block
  unlocks scroll, opens the sticky scroll scene into a normal stacked section and
  reveals everything that would otherwise wait for an observer.
- The cursor reticle is an accent that follows the real pointer, not a
  replacement for it.

## Figures

Dimensions, weights, ranges, seat counts and cruise speeds are published
manufacturer figures, rounded. Everything derived from them is a model and is
labelled as such on the page: the payload-range curve shape, the pax-equivalent
readout, and block times (cruise Mach at FL350 plus a fixed 25-minute ground and
terminal allowance). None of it is operational data and none of it should be used
as such.

## Files

```
index.html              markup and copy
assets/css/airbus.css   the whole design system
assets/js/core.js       the clock, scroll store, reveal observer, scroll scenes
assets/js/aircraft.js   parametric geometry for all four types
assets/js/sky.js        cloud decks, star field, contrails
assets/js/globe.js      orthographic projection, great circles, range gating
assets/js/site.js       section wiring
```

## Measured

| | |
|---|---|
| Uncompressed | 145 KB |
| Gzipped | 40 KB |
| Requests | 7 (document, 1 stylesheet, 5 scripts) |
| Images, fonts, libraries | 0 |
