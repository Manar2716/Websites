# iPhone 18 Pro Max — a product keynote

A twelve-scene keynote built as one continuous shot, in HTML, CSS and
JavaScript. Open `index.html`. No build step, no dependencies, no network
calls, no image files.

```bash
python3 -m http.server 8000   # then visit localhost:8000/iphone-18-pro-max/
```

**This is an unofficial presentation exercise.** It is not affiliated with,
endorsed by or produced for Apple. No Apple logo, photograph, render or other
trade dress appears anywhere in it — the device, the lenses and every scene are
generated in code. Specifications are quoted descriptively and attributed, and
the deck is explicit about which of its numbers are Apple's and which are not.

**Presenting:** `→` or click to advance, `←` to go back, `F` for full screen,
`I` for the sources panel, `0`–`9` to jump to a scene. 61 clicks end to end.
The speaker script is `SCRIPT.md`, and its `[CLICK]` markers line up one-to-one
with those 61.

## The constraint

**Near-black, white type, one accent, and nothing else emits colour.**

The whole deck lives between `#000000` and `#f5f5f7`. The only hue admitted is
the battery green, `#30d158`, and it appears on exactly two scenes so that it
still means something when it does. The device is a neutral titanium ramp. The
six photography scenes are the one place colour is allowed to run, and that is
the point of them — they are the only lit thing in a black room.

The second constraint follows the rest of this repository: **there is no image
file in this project.** The iPhone is CSS 3D. Its body is an extrusion of 19
stacked rounded slices, because CSS cannot round an edge in three dimensions
and a stack of silhouettes keeps the outline correct from any orbit angle. The
lenses are nested radial gradients. The wallpaper is four gradient pools. The
six photographic scenes — sun, a room with one window, a city after dark, a
distant ridge, a person, movement — are drawn on a 2D canvas from gradients and
blurred discs.

That last one carries a caveat, and the deck states it on screen rather than
burying it here: **those six scenes are illustrations of a lighting situation,
not camera samples.** Nothing in this project was photographed on any phone.
A rendered gradient captioned as an iPhone photo would be a lie, so while the
sequence is running the frame carries the line *rendered illustration — not a
camera sample*, and the script tells the speaker to say it out loud.

## One phone, one shot

The deck is a flat list of 61 **beats**, not a list of slides, and there is
exactly one phone element for the entire run. It is never unmounted. Scenes do
not contain it — they *request* it, by naming a pose, and a damped rAF loop
carries it there. That is what makes the device appear to travel continuously
from the cold open to the last frame rather than being re-staged twelve times.

Each scene exposes one function, `apply(n)`, which paints that scene as it
should look at beat `n`, from scratch, every time. Nothing is incremental.
That single decision is what makes stepping backwards work: going back is
`apply(n-1)`, not an undo log. A presenter who over-clicks can always click
back.

### Two bugs worth keeping written down

**Opacity and rotation must not share an element.** Any element with
`opacity < 1` is forced to `transform-style: flat`, which composites its whole
subtree into one plane. With the fade and the `rotateY` on the same node the
faces stopped rotating relative to each other, `backface-visibility` was
evaluated as though the device had never turned, and the front of the phone was
the only side that could ever be seen — the camera reveal showed a screen. The
rig is now split: `.phoneRig` fades and positions, `.phone` rotates and scales.

**`ch` resolves against the container's own font-size.** `max-width: 24ch` on a
wrapper holding 144px display type is a 190px box, not a 1700px one, and every
centred headline ran straight off the side of the frame. Display measures here
are in viewport units, and display *sizes* are bounded on both axes —
`clamp(2.4rem, min(8.4vw, 12vh), 9rem)` — because type sized only in `vw`
overflows the bottom of a projector frame the moment it wraps to three lines.

## Frame budget

One `requestAnimationFrame` loop drives everything. Only `transform` and
`opacity` are animated. The loop stops when the tab is hidden. Damping is
exponential rather than a per-frame lerp, so the travel feels the same at 60 Hz
on a projector and 120 Hz on a laptop panel.

Two things were avoided rather than tuned, both learned elsewhere in this repo:
full-viewport `filter: blur()` over animating content, and animated grain. The
grain here is a static SVG mask; the key light is a gradient that is soft by
construction. The six canvases are painted once on first use and once per
resize, never per frame, and the first is not painted until the scene that
needs it — drawing six full-viewport canvases at boot showed up as a stutter on
the opening reveal.

`filter` also cannot be used to shade the body slices: a filter on a child of a
`preserve-3d` parent flattens that child, which silently kills
`backface-visibility`. The slices are shaded with an inset box-shadow instead.

## Contrast

Micro labels were initially `rgba(245,245,247,.34)`, which lands near 2:1 on
black — the same mistake, and the same fix, as the printer site in this repo.
Labels now sit at `.55` (≈5:1) and body copy at `.62` (≈7:1), both above the
4.5:1 floor for small text, and no text token is below `0.68rem`.

The photography scenes are lit, and white copy over the night scene's street
glow was close to unreadable, so the caption has its own ground: a bottom scrim
that fades in with it. Anything carrying copy gets a ground.

## Accessibility and degradation

`prefers-reduced-motion` is honoured by collapsing durations rather than
disabling animation, so a presenter with the setting on sees the same scenes in
the same order with the same beats and can still present from it — every beat
lands in its final state, it just stops travelling to get there. Keyboard
navigation covers arrows, space, page up/down, home/end and digits. Verified in
Chromium at 2560, 1600, 1280, 844 and 390 px wide, in portrait and landscape,
with reduced motion, and stepped forwards and backwards through all 61 beats
with no console errors and no text leaving the frame.

## Fact checking

Every figure is listed in the sources panel (`I`) with its provenance, split
three ways: Apple's published specifications, Apple UAE pricing, and things
derived or illustrated here. The deck does not put a battery capacity in mAh on
screen, because Apple does not publish one and teardown figures disagree; only
Apple's hour ratings appear. The comparison bars start at zero. The camera
comparison includes a scene stating that the three sensors are unchanged
between generations, because they are.

**One caveat on sourcing.** `apple.com` and `support.apple.com` were unreachable
from the machine this was built on — blocked by an egress policy, not by
Apple — so the specifications were taken from reporting that quotes Apple's
specification pages and newsroom release, cross-checked across several
independent outlets. That is a weaker chain than reading the spec sheet, and it
is disclosed in the sources panel as well as here. **Check the figures against
Apple's own tech-spec page before presenting this.**

## Files

```
index.html                 the twelve scenes
SCRIPT.md                  the speaker script, 61 clicks, with delivery notes
assets/css/keynote.css     cascade layers: tokens → base → stage → phone →
                           slides → scenes → chrome → motion
assets/js/core.js          the shared clock, damping, cancellable timers
assets/js/phone.js         the CSS-3D device and the pose rig
assets/js/plates.js        the six canvas lighting scenes
assets/js/deck.js          the run of show — 61 beats and the input handling
```
