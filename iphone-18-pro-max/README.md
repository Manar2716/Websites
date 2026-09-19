# iPhone 18 Pro Max — a product keynote

Thirteen scenes built as one continuous shot, in HTML, CSS and JavaScript.
Open `index.html`. No build step, no dependencies, no network calls.

```bash
python3 -m http.server 8000   # then visit localhost:8000/iphone-18-pro-max/
```

**This is an unofficial presentation exercise.** It is not affiliated with,
endorsed by or produced for Apple. Specifications are quoted descriptively and
attributed, and the deck is explicit about which of its numbers are Apple's and
which are not.

**Presenting:** `→` or click to advance, `←` back, `F` full screen, `I` for the
sources panel, `0`–`9` and `Shift`+`0`–`2` to jump to a scene. 66 beats end to
end — the opening black screen, then 65 presses. The speaker script is
`SCRIPT.md`, and its `[CLICK]` markers line up one-to-one with those 65.

## The photography

**Every device on screen is photography. Nothing is drawn, and nothing is
AI-generated.** `tools/build-assets.py` cuts four views out of three captures
of Apple's iPhone 18 Pro pages, and the deck uses those four for the whole run
— one device in one finish, so it reads as a continuous look at a single object
rather than a slideshow of different ones.

```
front       the device, three-quarter front     229 × 498 native
back        the device, three-quarter rear      180 × 472 native
camera      the camera system, macro            749 × 494 native
finishes    all four finishes together          845 × 460 native
```

**Two earlier sources were dropped entirely.** They showed a square camera
island with the three lenses in a triangle — iPhone 15/16 Pro geometry, not
this generation's full-width plateau. One of them was kept for a while on the
grounds that a *front* face carries no camera module and so could not be wrong;
that was too generous. It was a render of a different design throughout, and
with genuine 18 Pro photography available there is no reason to keep any part
of it. Nothing from either survives.

The consequence is visible in the deck: the camera macro is 749 px wide
natively where the old cut was 98, so the camera reveal is a real full-frame
push rather than something nursed along at a quarter size. `product.js` still
caps each view at the largest height it can honestly carry, but the caps are no
longer the binding constraint on the layout.

### Cutting the backdrop off a photograph, three times, three thresholds

All four crops sit on black, so all four are keyed on their own brightness:
dark pixels become transparent, lit ones stay, and the near-black pixels it
softens are sitting on a near-black deck anyway. What changes per asset is the
threshold.

The burgundy views take a knee of 20–26: their bodies are bright enough that
nothing of the device is at risk.

**The four-finish shot needed a knee of 11**, and finding that took a wrong
turn worth recording. Measured across the whole source, the Black device's body
sits near 31 luminance and the backdrop reaches 31 at its 99th percentile —
they overlap, so no threshold separates them, and that measurement said the
view had to be published opaque. But an opaque black rectangle is *darker* than
this deck's own ground, which carries a grain overlay and never reaches zero;
it read as a box around the picture. Measured on the crop that is actually
published rather than the whole source, the backdrop tops out near 5 while the
black phone runs from 14 up — and a low knee separates them cleanly. The lesson
is to measure the thing being shipped, not the thing it came from.

## One device, one shot

The deck is a flat list of 66 **beats**, not a list of slides. Each scene
exposes one function, `apply(n)`, which paints that scene as it should look at
beat `n`, from scratch, every time. Nothing is incremental — which is what
makes stepping backwards work: going back is `apply(n-1)`, not an undo log. A
presenter who over-clicks can always click back.

All four views live in one stack, centred on each other, and crossfading
between them is what reads as the camera moving around the product — front, to
rear three-quarter, to the camera system, and then further in. The dissolves
are slow on purpose: these are separate photographs at different angles, not
frames of one turntable, so a fast cut reads as a mistake where a long dissolve
reads as a camera move.

Fade and transform are on separate elements. Sharing them means every push-in
is composited through a changing opacity, which on a large image is the
difference between a clean move and a stuttering one.

## Type

`SF Pro Display` for headings and `SF Pro Text` for body, with
`-apple-system` ahead of both — so on an Apple machine these resolve to the
real thing, and everywhere else the stack falls to the nearest grotesque with
the same proportions. No font is fetched over the network and none is
redistributed with the project.

Display sizes are bounded on **both** axes — `clamp(2.4rem, min(8.4vw, 12vh),
9rem)` — because type sized only in `vw` overflows the bottom of a projector
frame the moment it wraps to three lines. Measures are in viewport units, never
`ch`: `ch` resolves against the container's own font-size, so `max-width: 24ch`
around 144px display type is a ~190px box, and every centred headline ran off
the side of the frame until that was found.

## Contrast

Micro labels sit at `.55` alpha (≈5:1 on black) and body copy at `.62` (≈7:1),
both above the 4.5:1 floor for small text; no text token is below `0.68rem`.
The camera sequence is lit, so its caption has its own ground — a bottom scrim
that fades in with it.

## Frame budget

One `requestAnimationFrame` loop drives everything; only `transform` and
`opacity` are animated; the loop stops when the tab is hidden. Damping is
exponential rather than a per-frame lerp, so travel feels the same at 60 Hz on
a projector and 120 Hz on a laptop panel. The six canvases in the camera
sequence are painted once on first use and once per resize, never per frame,
and none is painted until the scene that needs it — drawing six full-viewport
canvases at boot showed up as a stutter on the opening reveal.

## Accessibility and degradation

`prefers-reduced-motion` is honoured by collapsing durations rather than
disabling animation, so the same scenes arrive in the same order with the same
beats and the deck is still presentable from. Keyboard navigation covers
arrows, space, page up/down, home/end and digits. Verified in Chromium at 2560,
1600, 1280, 844 and 390 px wide, portrait and landscape, with reduced motion,
stepping forwards and backwards through all 66 beats with no console errors and
no text leaving the frame.

## Fact checking

Every figure is in the sources panel (`I`) with its provenance, split between
Apple's published specifications and what was derived or illustrated here. The
45-hour figure is a video-playback rating and is described as one everywhere it
appears. The hour-by-hour percentages on the battery and day scenes are an
illustration of a day's shape, labelled on the slide and called out in the
script. The camera sequence's six situations are abstract light studies, not
photographs, labelled on screen while they are up.

The specification baseline was supplied and then checked: the display, chip,
camera, battery, storage, connectivity and IP68 figures matched, and the four
that had not been verified before — **249 g**, **aluminium unibody**, **iOS
27** and **120 Hz ProMotion** — were confirmed independently.

The CPU, GPU and battery comparison figures — **up to 20% faster 6-core CPU**,
**up to 40% faster 7-core GPU**, **up to 6 more hours** video playback against
iPhone 17 Pro Max — are read directly off Apple's own comparison module in one
of the source captures. Note that the GPU is **7-core** there; secondary
reporting had said six, and the capture wins.

**One caveat on sourcing.** `apple.com`, `support.apple.com` and every Apple
CDN were unreachable from the machine this was built on, blocked by an egress
policy rather than by Apple. The photography came from screen captures of
Apple's pages supplied directly, and the written specifications were
cross-checked against reporting that quotes Apple's specification pages. That
is a weaker chain than reading the spec sheet. **Check the figures against
Apple's own tech-spec page before presenting.**

## Files

```
index.html                 the thirteen scenes
SCRIPT.md                  the speaker script, 65 presses, with delivery notes
tools/build-assets.py      cuts the product views out of the source captures
tools/src/                 the three source captures
assets/img/                the four cut views, plus a size manifest
assets/css/keynote.css     cascade layers: tokens → base → stage → phone →
                           slides → scenes → chrome → motion
assets/js/core.js          the shared clock, damping, cancellable timers
assets/js/product.js       the view stack, the crossfade and the pose rig
assets/js/fields.js        the six abstract light studies
assets/js/deck.js          the run of show — 66 beats and the input handling
```
