# PEET'S COFFEE — a design concept

A recreation of a premium coffee brand's site, built around a scroll-driven
film in WebGL2 and a menu of thirty-four products that are drawn rather than
photographed.

Open `peets/index.html` in a browser. No build step, no dependencies, no
network calls, no image files.

```bash
python3 -m http.server 8000   # then visit localhost:8000/peets/
```

**This is an unofficial portfolio exercise.** It is not affiliated with,
endorsed by or produced for Peet's Coffee. No logo, photograph or other trade
dress of the real company appears anywhere in it — every mark, product and
object on the page is generated in code. Product names are used descriptively;
prices, hours, addresses and the rewards balance are invented for the layout.

## The constraint

**Every colour that emits or reflects light here is a coffee colour.** The ramp
runs from the near-black of a dark roast up through roast, cinnamon and crema to
milk. The one exception is the daylight through the café window, which is
neutral-cool, and it exists so the warm side of the page has something to be
warm against. Take that single cool value out and the whole thing reads as
sepia.

The second constraint follows from the first: **there is no image file in this
project.** The film is WebGL. The poster behind it is four gradients. The wood
counter under the beans, the bakery and the story is three repeating gradients.
The seal in the nav is one inline SVG. And all thirty-four products in the menu
are drawn on a 2D canvas at runtime by `art.js`.

That last one is the constraint earning its keep. A photograph of a latte and a
photograph of a flat white are two different photographs; here they are the same
vessel with a different foam depth and a different rim ratio, which is also the
difference between them on a bench. Twelve drinks, eight blends, six teas and
eight pastries come out of about ten parametric forms, stay sharp on a 4K panel,
weigh nothing, and can all be re-lit by changing one number.

## The film — nine acts on one number

The whole film is a pure function of one normalised scroll value. Hand
`Timeline.update` a `t` of 0.42 and you get the exact frame at 0.42 — scrolled
there, jumped there, or holding still.

```
0.000  BEAN        one bean, one weak key, nothing else
0.072  ROAST       two thousand beans arrive and orbit the lens
0.188  CUP         the crowd becomes a cup, then ceramic takes over
0.300  EXTRACTION  espresso, crema, the level rising
0.432  POUR        the rosetta drawn on the surface in stroke order
0.546  STEAM       up through the plume, and into HANDCRAFTED SINCE 1966
0.648  THE BAR     the machine assembles out of the air, ~190 parts
0.800  SPLASH      frozen mid-air, then pulled into the wordmark
0.896  CAFÉ        the room, holding
```

The one thing that is *not* a pure function of `t` is the physics, and that is
deliberate — it is what gives the film memory. Beans arriving at the cup carry
the speed they had in the swarm; droplets flung out of a splash are still
slowing down when the camera catches them.

There is no "explode mode" and no "assemble mode". Every body in the film — bean,
droplet, machine part, dust mote, cocoa flake — is a spring chasing a target with
its own mass and drag. What changes between acts is only *where the target is*: a
point on an orbit around the camera, a point on the surface of a cup, or a pixel
inside a letterform. Because it is one continuous simulation, beans can be
mid-orbit when the cup target arrives and they arc into place carrying the
momentum they already had. That is the difference between assembling and
cross-fading.

Two wordmarks are drawn on a canvas at boot and used twice each: the steam
shader masks against them in screen space, and the droplet crowd flies to a
point cloud sampled from the same glyphs.

## Passes

```
1  shadow depth     one directional light, 3×3 PCF, front-face culled
2  scene → HDR      sky, opaque, liquid surface, transparent, sprites
3  steam            raymarched at half res, reads scene depth
4  bright → mips    4 down, 4 up — dual-filter bloom
5  shafts + streak  radial blur toward the projected sun
6  composite        aberration, grade, ACES, vignette, grain
```

Reflections come from an analytic café — a dark warm room, one broad window in
the sun direction, a warm bounce off the counter. Roughness widens the window
lobe, which is what makes ceramic, steel, glass and liquid read as different
materials under the same light without a single cubemap.

## The page below the film

The film has a GPU. The page does not, and it still has to feel like the same
piece of work.

**Nothing fades in.** Every section and every card arrives from *behind* — a
little further away, a little lower, tipped back a few degrees — and lands. That
is one composited transform per element, and it is the difference between a page
that assembles and a page that cross-fades.

**The transitions between sections are painted once.** Steam wraps the camera at
the end of the film; on the page it wraps the *seam*. Each veil is a plume or an
espresso splash drawn into a 480×170 canvas at load and then only transformed,
so a transition running the whole length of a section costs two composited
properties and no repaints. A plume has no detail to lose, so a canvas that
small stretched over 1800 CSS pixels is exactly the softness the effect wants.

**Products float and turn.** Each one drifts on its own phase — a slow vertical
bob and a fraction of a degree of roll — written as two custom properties a
frame, with the Z offset that lifts the object off its own panel left in the
stylesheet. Point at a card and it tips toward the pointer, parallaxing the
object against its own background.

**The map is a map.** Not a tile server and not a picture of one: a grid of
extruded blocks and five pins, projected by hand, sorted back to front and
drawn. Drag turns it; letting go leaves it turning and lets the throw decay. The
city is generated once from a seeded PRNG, because a map that reshuffles itself
when you resize the window is not a map.

## Five bugs worth writing down

**Steam drawn as strokes reads as pipework.** The first version of the steam over
each cup was three tapered, gradient-filled bezier strokes. A stroked path — even
a tapered one — has two hard edges running its whole length, and three of them
over a latte look like plumbing. It is now eighty radial gradients at two per
cent alpha along a wandering path: soft by construction, no blur filter needed to
rescue it.

**`> *` took the veils out of position and put 370 px of dead air into three
sections.** The overlay that knocks the wood back is on `::after`, so anything
that has to read over it needs a stacking context: `.sec--bakery > * { position:
relative }`. That also matches the veil, which is `position: absolute` for a
reason, and same-specificity-later-wins turned it back into a block in the flow.
It is now `> :not(.veil)`.

**An IntersectionObserver alone cannot drive reveals on a page with a nav.** It
only notifies on a *threshold crossing*. Jump from the film straight to
`#bakery` — which every link in the nav does — and the four sections in between
go from "below the viewport, not intersecting" to "above the viewport, not
intersecting" without ever crossing 0.06. No entry is delivered and they sit at
opacity 0. The observer now handles ordinary scrolling and a sweep handles jumps:
when the scroll moves more than three quarters of a viewport between frames,
everything not yet revealed gets measured once and anything at or above the fold
is let in.

**The film kept rendering behind the whole site.** In the project this renderer
came from the film *was* the page. Here it is the first two fifths of a long one,
and a six-pass HDR pipeline was running behind the menu, the map and the footer.
The stage is culled outside its own scroll track now — measured at zero
`stage.render` calls while parked in the footer, against a full frame rate on the
film.

**A bag with a greeked label is a placeholder.** The eight blends were first
drawn with ruled lines standing in for type, and from two metres away the section
read as a wireframe. The blend name is now typeset on the label, wrapped to the
panel and pulled in until it fits.

## Frame budget

Two loops, and both of them stop.

The film's loop culls itself outside its scroll track, drops to a poster with no
WebGL2, and stops entirely when the tab is hidden. Three device tiers set bean
count, steam step count, shadow map size and tessellation; on top of that the
render scale is adjusted at runtime from the measured average frame time, because
a slightly softer image at rate beats a sharp one that stutters.

The page's loop shuts down half a second after the last frame that had work in
it, and anything that could start motion — a scroll, a pointer, a resize, an
observer — starts it again. Scroll, pointer and resize handlers park a number and
return; every element offset the loop needs is measured once, on load and on
resize, into a table it reads from. Nothing reads layout inside a frame.

Add `?debug` for a frame readout and a `__film` handle with `seek` and `settle`.

## Contrast

Text colour is set from measured contrast against the lightest ground it is ever
set on — the card surface, `#170f0a` — not chosen by eye. Headings land near
17:1, body near 13:1, labels near 7:1, and the lightest fine-print token near
6.7:1 with a 13 px floor.

The film is harder, because it runs from near-black to a lit café and nothing at
the edges of frame can rely on the image behind it. Captions carry their own pool
of shade plus a two-stop text shadow; the rail and the scroll hint sit on lower-
and upper-third gradients, which is what a title designer would ask for.

The hero is the one caption that sits on the same screen as a lit object, and it
is blocked apart from it rather than shaded over it: bottom left, clear of the
bean in the middle of frame, clear of the rail under it and clear of the scroll
hint in the centre. On a phone the bean fills the middle and there is nowhere to
go, so the eyebrow — the one line there that is decoration rather than
information — is dropped and the title keeps its shade.

## Accessibility and degradation

`prefers-reduced-motion` is honoured. The film still answers the scroll, because
that is navigation rather than decoration, but the wall clock is frozen, so
nothing moves on its own — no handheld, no camera lag, no per-letter travel, no
card tilt, no float — and the film is shortened.

The film needs WebGL2. Without it the stage keeps a poster built from gradients,
stops being sticky, and the rest of the page is untouched: the menu, the map and
every reveal are canvas 2D and CSS, and neither needs a GPU context.

An inline head script sets a `js` class before first paint, and the boot card,
the sticky stage, the caption layer and every reveal-on-scroll style are gated
behind it — so with scripting unavailable the page is a static version of itself
rather than a blank screen. The hero is the only thing that is shown *because*
the scripts did not arrive: the captions are a JavaScript layer, so there is a
matching title card in the markup for that case.

The captions over the canvas are decorative duplicates of the prose in the story
section, and the whole caption layer is `aria-hidden` — nothing in this project is
available only to someone who can see a WebGL canvas, and nothing flickers in and
out of the accessibility tree as you scroll. The nine-item nav collapses into a
panel behind a toggle below 940 px, which closes on Escape and on any link.

## Files

```
index.html
assets/css/peets.css      cascade layers: tokens → base → nav → film → … → responsive
assets/js/math.js         vectors, matrices, quaternions, easing, springs, noise
assets/js/gl.js           programs, meshes, instance buffers, render targets
assets/js/geometry.js     every object in the film, generated at runtime
assets/js/textures.js     the rosetta and the typography, drawn on a canvas
assets/js/shaders.js      GLSL ES 3.00 for all six passes
assets/js/bodies.js       one spring system for every crowd
assets/js/stage.js        the renderer — draws whatever state it is handed
assets/js/film.js         the film — nine acts, camera keys, act state
assets/js/art.js          all thirty-four products, drawn on a 2D canvas
assets/js/site.js         reveals, veils, card physics, the 3D map, the nav
assets/js/main.js         boot, the scroll store, one clock, the overlay
```

Verified in Chromium at 390 / 900 / 1280 / 1440 px wide, with reduced motion,
with JavaScript disabled, and with the film culled and restored.
