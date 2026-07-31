# NOCTURNE — LOT 014

A scroll-driven film for a fictional coffee roastery, rendered in WebGL2.

Open `coffee/index.html` in a browser. No build step, no dependencies, no
network calls, no image files.

```bash
python3 -m http.server 8000   # then visit localhost:8000/coffee/
```

## The constraint

**Every colour that emits or reflects light in this film is a coffee colour.**

The ramp runs from the near-black of an over-developed bean up through roast,
cinnamon and crema to milk. The single exception is the daylight coming through
the café window, which is neutral-cool, and it exists so that the warm side of
the film has something to be warm against. Take that one cool value out and the
whole thing reads as sepia.

The second constraint follows from the first: **darkness is the ground state.**
The film opens in it, and the room is not faded up so much as *let in* — a
little when the cup forms, fully when the camera clears the steam and finds the
window. Roughly the first fifth of the film is a frame that is 60% pure black,
which is deliberate and is the reason the single bean reads at all.

## Nine acts on one number

The whole film is a pure function of one normalised scroll value. Hand
`Timeline.update` a `t` of 0.42 and you get the exact frame at 0.42 — scrolled
there, jumped there, or holding still.

```
0.000  EMBER    one bean, one weak key, nothing else
0.072  SWARM    two thousand beans arrive and orbit the lens
0.188  VESSEL   the crowd becomes a cup, then ceramic takes over
0.300  POUR     espresso, crema, the level rising
0.432  MILK     the rosetta drawn on the surface in stroke order
0.546  STEAM    up through the plume, and into the words
0.648  BENCH    the machine assembles out of the air, ~190 parts
0.800  SPLASH   frozen mid-air, then pulled into letterforms
0.896  CODA     the room, holding
```

The one thing that is *not* a pure function of `t` is the physics, and that is
deliberate — it is what gives the film memory. Beans arriving at the cup carry
the speed they had in the swarm; droplets flung out of a splash are still
slowing down when the camera catches them.

## One crowd system

There is no "explode mode" and no "assemble mode". Every body in the film —
bean, droplet, machine part, dust mote, cocoa flake — is a spring chasing a
target with its own mass and drag. What changes between acts is only *where the
target is*: a point on an orbit around the camera, a point on the surface of a
cup, a pixel inside a letterform.

Because it is one continuous simulation, beans can be mid-orbit when the cup
target arrives, and they arc into place carrying the momentum they already had.
That is the difference between assembling and cross-fading.

Targets come from `Geo.samplePoints`, which area-weights random points over a
finished mesh, so "assembles into a cup" is a real spatial operation against
the same geometry that gets drawn.

## Nothing is a model file

A bean is a parametric ellipsoid, flattened on one face, with a gaussian crease
cut down the middle of that face and the crease walls pinched so the groove
catches a specular line instead of reading as a dent. A cup is a profile
revolved and shelled, with a handle swept along a cubic whose endpoints are
placed *on* the wall at the radius the profile actually has at that height. The
espresso machine and grinder are about 190 boxes and cylinders in five
instanced batches — five draw calls for the whole bench.

The only two images in the project are drawn on a 2D canvas at load:

- **The rosetta.** Latte art is a *drawn* thing — it has stroke order, overlap
  and a pulled stem — so it is bezier crescents, not an SDF. Each leaf is
  punched out of what is already there with a halo before it is filled, because
  what makes a rosetta legible is not the milk but the thin line of crema left
  between one leaf and the next. The channels are packed: **R** coverage,
  **G** stroke order (so the shader reveals it in the order a barista pulled
  it), **B** edge relief.
- **The typography**, which serves two consumers from one canvas: the steam
  shader masks against it in screen space, and droplets fly to a point cloud
  sampled from the same glyphs.

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
the sun direction, a warm bounce off the table. Roughness widens the window
lobe, which is what makes ceramic, steel, glass and liquid read as different
materials under the same light without a single cubemap.

## Four bugs worth writing down

**The whole film was rendering a stop and a half under.** Everything up to the
composite is linear light and the drawing buffer is sRGB, and the transfer
function was missing. It was invisible for a long time because the *screenshots*
looked fine — the image viewer was applying its own display transform. Reading
the framebuffer back with `readPixels` and grading it numerically, rather than
looking at pictures, is the only reason it was found.

**Every parametric surface was inside-out.** With the winding I first used, the
face normal points into the surface, back-face culling keeps the far wall of
each object instead of the near one, and `computeNormals` — which reads winding
— inverts with it. On a sphere the two errors cancel *exactly* and nothing looks
wrong, which is why it survived until a flat disc, the coffee surface, vanished
from the cup entirely.

**The swarm was mathematically correct and completely invisible.** The bean
shell ran from 1.6 to 9.5 units with the lens at 1.6, so every bean was four
metres away or further: a field of sub-pixel specks on a black frame. The shell
now starts inside the lens's own radius so the crowd passes *through* the shot.

**The wordmark came out as a solid bar.** Two compounding causes: the string
overran the canvas it was drawn on and got clipped at both ends, and each
droplet was about three times the width of the stem of an N. Typography now
measures itself and pulls the size in until it fits; droplets shrink as they
arrive.

## Frame budget

One `requestAnimationFrame` loop drives everything. Scroll and resize handlers
never read layout — they park a number, and all work happens once per frame
against a damped scroll value, so the motion feels the same at 60 Hz or 240 Hz.

Three device tiers set bean count, steam step count, shadow map size and
tessellation; on top of that the render scale is adjusted at runtime from the
measured average frame time, because a slightly softer image at rate beats a
sharp one that stutters. Fully transparent bodies are skipped rather than
uploaded, which in most acts is the majority of the buffer.

Two things dominated and were fixed rather than tuned. The steam raymarch was
stepping from the near plane to the far plane, spending every one of its 64
samples in empty air — 40 cm apart, far coarser than the plume is wide, so the
jitter that hides the banding *became* the image. It is now clipped to the
plume's own bounding box, and the same 64 steps land about 3 cm apart. And the
caption blur is on a separate, static layer: only its opacity animates, because
animating a blur radius forces the layer to re-rasterise every frame.

Add `?debug` for a frame readout and a `__film` handle with `seek` and `settle`.

## Contrast

The film runs from near-black to a lit café, so nothing at the edges of frame
can rely on the image behind it. Captions carry their own pool of shade plus a
two-stop text shadow; the rail and the scroll hint sit on lower- and upper-third
gradients, which is what a title designer would ask for and what keeps them
readable in both. The lightest label token measures about 6.1:1 on the page
ground and the micro type has a 13 px floor.

An earlier composition put the opening title dead centre — directly on top of
the only lit object in frame, with its scrim putting the subject out. Captions
and subject are now blocked apart.

## Accessibility and degradation

`prefers-reduced-motion` is honoured: the film still answers the scroll, because
that is navigation rather than decoration, but the wall clock is frozen, so
nothing moves on its own — no handheld, no camera lag, no per-letter travel, and
the film is shortened.

The film needs WebGL2. Without it the stage keeps a poster built from gradients,
stops being sticky, and the page becomes the prose column. An inline head script
sets a `js` class before first paint, so with scripting unavailable the page is
the same words in a plain column.

The captions over the canvas are decorative duplicates of the prose below the
film, and the whole caption layer is `aria-hidden` — nothing in this project is
available only to someone who can see a WebGL canvas, and nothing flickers in
and out of the accessibility tree as you scroll.

## Files

```
index.html
assets/css/coffee.css     cascade layers: tokens → base → … → responsive
assets/js/math.js         vectors, matrices, quaternions, easing, springs, noise
assets/js/gl.js           programs, meshes, instance buffers, render targets
assets/js/geometry.js     every object in the film, generated at runtime
assets/js/textures.js     the rosetta and the typography, drawn on a canvas
assets/js/shaders.js      GLSL ES 3.00 for all six passes
assets/js/bodies.js       one spring system for every crowd
assets/js/stage.js        the renderer — draws whatever state it is handed
assets/js/timeline.js     the film — nine acts, camera keys, act state
assets/js/main.js         boot, the scroll store, one clock, the overlay
```

Verified in Chromium at 390 / 900 / 1280 / 1440 px wide, with reduced motion,
with JavaScript disabled, and with WebGL2 unavailable.

NOCTURNE is invented for this page. No trade dress, mark or product of any real
roastery or manufacturer is used or referenced.
