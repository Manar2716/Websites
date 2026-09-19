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

**The device on screen is photography. Nothing about it is drawn, and nothing
is AI-generated.** Two source images were supplied; `tools/build-assets.py`
cuts four views out of them, and the deck uses those four for the whole run —
one device, one finish, so it reads as a continuous look at a single object
rather than a slideshow of different ones.

```
front      the front face          214 × 663 native
side       the side profile         21 × 205 native
back       the rear                 99 × 204 native
plateau    the camera close-up      98 ×  77 native
```

The tool cuts all three finishes present in the second source; the deck shows
**Burgundy** (as the hero device throughout) and **Black**. The third is left
out of the deck on purpose — it cannot be confidently matched to one of Apple's
four published finish names, and captioning it with a guess would be inventing
a fact. The scene that shows the two is captioned for the two it shows.

Two decisions in that pipeline are worth stating plainly, because they shaped
the design more than anything else.

**The first source's back is deliberately unused.** It shows a square camera
island with the three lenses in a triangle — iPhone 15/16 Pro geometry — not
the full-width plateau this generation has, which the second source does show.
Putting it on screen in a deck about the camera would have meant showing the
wrong camera system. Only its front face is used, which carries no camera
module and is therefore design-accurate, and is also the sharpest asset
available.

**The sources are small, and the layout is built around that rather than
against it.** `product.js` gives every view a maximum on-screen height and
scenes get `min(asked, cap)`; the camera push-in stops at roughly four times
the plateau's native width, which is where an upscale stops reading as shallow
focus. Anything that wanted more frame than the photography can honestly cover
is built from type instead. The full-bleed camera sequence is typographic for
exactly this reason.

### Cutting the backdrop off a photograph, twice, two different ways

Both source images needed their background removed and neither could use the
other's method.

The **panel shots** sit on flat coloured cards, and each phone's body is nearly
the same hue as the card behind it, so keying on a reference colour either
leaves the backdrop's gradient behind or eats into the device. The fix is to
flood inward from the frame edge comparing each pixel to *the neighbour it was
reached from* rather than to one fixed colour: a smooth gradient stays under
the per-step threshold all the way across, and the phone's edge is a hard jump
that stops the fill.

The **front shot** is the opposite problem. It is already on pure black, and so
is the phone's bezel — so a flood fill has no edge to stop at and walks straight
through the frame into the wallpaper, leaving an outline where the phone used to
be. That one is keyed on brightness instead: dark pixels become transparent, lit
ones stay. The pixels it makes partially transparent are the near-black ones,
which sit on a near-black deck anyway. Left as an opaque rectangle it was darker
than the lit ground behind it and read as a box around the product, with
`drop-shadow` tracing the box rather than the phone.

## One device, one shot

The deck is a flat list of 66 **beats**, not a list of slides. Each scene
exposes one function, `apply(n)`, which paints that scene as it should look at
beat `n`, from scratch, every time. Nothing is incremental — which is what
makes stepping backwards work: going back is `apply(n-1)`, not an undo log. A
presenter who over-clicks can always click back.

All four views live in one stack, centred on each other, and crossfading
between them is what reads as the camera moving around the product. The
dissolves are slow on purpose: these are four separate photographs at different
angles, not frames of one turntable, so a fast cut reads as a mistake where a
long dissolve reads as a camera move.

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

**One caveat on sourcing.** `apple.com`, `support.apple.com` and every Apple
CDN were unreachable from the machine this was built on, blocked by an egress
policy rather than by Apple, so no official product imagery could be fetched
and the specifications were taken from reporting that quotes Apple's
specification pages, cross-checked across several outlets. That is a weaker
chain than reading the spec sheet. **Check the figures against Apple's own
tech-spec page before presenting.**

## Files

```
index.html                 the thirteen scenes
SCRIPT.md                  the speaker script, 65 presses, with delivery notes
tools/build-assets.py      cuts the product views out of the source images
tools/src/                 the two source photographs
assets/img/                the four cut views, plus a size manifest
assets/css/keynote.css     cascade layers: tokens → base → stage → phone →
                           slides → scenes → chrome → motion
assets/js/core.js          the shared clock, damping, cancellable timers
assets/js/product.js       the view stack, the crossfade and the pose rig
assets/js/fields.js        the six abstract light studies
assets/js/deck.js          the run of show — 66 beats and the input handling
```
