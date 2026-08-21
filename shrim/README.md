# SHRIM PARTY — a design concept

A recreation of a prawn restaurant's site, built around a menu of six dishes
that are drawn rather than photographed — and that come apart into their
ingredients when you open them.

Open `shrim/index.html` in a browser. No build step, no dependencies, no
network calls, no image files.

```bash
python3 -m http.server 8000   # then visit localhost:8000/shrim/
```

**This is an unofficial portfolio exercise.** Shrim Party is invented, and so
are the prices, the hours, the address and the people. Nothing on the page is
affiliated with any real restaurant, and no logo, photograph or other trade
dress of a real business appears in it.

## The constraint

**There is no image file in this project, and the brief asked for
photorealism.**

Those two things are the whole problem. Everything on the page that looks
photographed — the prawns, the sauce, the citrus, the cast iron, the oak table
under all of it — is a surface generated at runtime and lit by a WebGL2
renderer. Not a texture, not a sprite sheet, not a downloaded model.

That is not asceticism for its own sake. A photograph of a plate of prawns is
a picture of a plate of prawns, and there is exactly one thing you can do with
it: show it. The centre of this site is a dish that separates into the things
it is made of, with a name against each one. That is only possible if the dish
was assembled out of those things in the first place — so the constraint and
the feature are the same decision seen from two sides.

The second constraint is colour. **Every colour on this page is somewhere in
the ninety seconds a prawn spends over heat.** It starts grey-blue and
translucent — the one cool value in the project, and it exists so the warm side
has something to be warm against. It goes through the pan: char, ember, brass.
It comes out coral, and coral is the only saturated colour anywhere. Then
salt. There is no second accent hue, no blue link, no green success state.

## What makes a rendered prawn look like a prawn

Three things, in this order of importance. Getting the first one wrong is
fatal; getting the third one wrong is merely obvious.

**1 · Light goes through it.** Prawn meat is a few millimetres of dense
translucent protein. Light the far side and the near side glows red-orange.
Without a subsurface term the surface is opaque and reads as painted resin no
matter how good the specular is. The energy for it is taken *out* of the
diffuse lobe rather than added on top — the first version added, and the
prawns came out as lamps.

**2 · It is wet.** Everything served here comes out of butter, oil or its own
juice, and a wet surface is a rough diffuse body under a smooth clear layer:
two lobes, not one roughness. A single mid-roughness GGX gives you satin, and
satin is exactly what food never looks like.

**3 · Its colour is banded, and not uniform.** A cooked prawn is coral where
the shell segment bulged, near-white in the joint behind it, coral again on the
back where the pigment sat, and nearly white on the belly. All of that is
driven off the same `v` coordinate the mesh was swept along, so the pattern and
the geometry can never disagree about where the segments are.

The body itself took three attempts. The first two used an analytic taper and
came out as a horn — a long smooth cone with no moment where the body stops.
A prawn holds most of its girth to about two thirds of its length, falls away
through the last two segments, and ends abruptly at a stub that the tail fan
hangs off. That abruptness *is* the silhouette, and it turned out to be much
easier to state as ten numbers than to find a curve that happens to pass
through them.

## Taking a dish apart

The brief was "click a dish and it separates into its ingredients". The
interesting question is what that should feel like, and the answer is: like
lifting things off a plate, not like an exploded-view diagram.

Four rules came out of getting it wrong:

- **Nothing travels in a straight line.** Everything arcs, because a thing
  being lifted rises before it moves sideways.
- **Nothing arrives at the same time.** Parts leave in the order you would
  actually pick them up — the loose things on top first, the heavy things
  underneath last. The tempura sheds its batter before the prawn inside it
  moves at all.
- **Nothing bounces.** The springs are just under critically damped, so a prawn
  overshoots by about two per cent and settles. Anything springier reads as a
  cartoon, immediately.
- **Weight decides the arc.** A parsley leaf lofts and takes its time; a prawn
  goes up a little and comes down into place. Same code, one divisor.

And a fifth that is not about motion at all: the ingredients have to end up
somewhere a label can go. The layout is a phyllotaxis spiral within each
ingredient and a wave along the frame's width between them, with the largest
cluster placed in the middle and the rest alternating outward — declaration
order put the prawns, always the biggest group, at the far left of every
dish, and every dish came apart lopsided.

Each of the six has its own choreography. The pan lifts as a column because a
pan is deep; the skewers slide apart along their own axis; the nest of linguine
turns as it rises, the way a fork turns it; the curry bowl tips and its
contents come out over the lip.

## Passes

```
1  shadow depth     one key light, 3×3 PCF, front faces culled
2  scene → HDR      the room, then opaque, then transparent
3  steam            depth-soft sprites, drawn into the same target
4  soft + DoF       quarter-res blur, mixed back by circle of confusion
5  bright → mips    4 down, 4 up — dual-filter bloom
6  composite        aberration, split tone, ACES, vignette, grain
```

There is no cubemap and no HDRI. Reflections come from an analytic dining
room: a dark warm ceiling, a broad soft key overhead where a photographer would
hang one, one cool window off to the side, and a warm bounce back up off the
table. Roughness widens the key's lobe, and that single relationship is what
makes glazed ceramic, cast iron, butter, citrus rind and wet prawn read as five
different materials under one light without a texture map between them.

Depth of field is the cheap version — the scene blurred once at quarter
resolution and mixed back by a circle of confusion from linear depth — but it
is not optional. Food photography is shot wide open on a macro lens, and a
plate rendered with everything in focus reads as a diagram of a plate.

## Five bugs worth writing down

**A NaN spread across a third of the frame as a black rectangle.** The bump
function normalises a screen-space derivative, and that derivative goes to zero
wherever a surface is degenerate — the fan of triangles closing the end of a
swept tube, the seam where a wrapped grid meets itself. `normalize(vec3(0))` is
a NaN; one NaN fragment went into the bright pass, `NaN/NaN` came out of the
soft knee, and the blur chain spread it across the frame as a hard-edged black
box quantised to the size of the smallest mip. It looked far more like a shadow
bug than a divide, which is why it took a while. Every `normalize` in that
function is guarded now, and the object shader refuses to emit a non-finite
fragment at all.

**Reversed faces sharing vertices cancel their own normals.** Making a membrane
double-sided by pushing a reversed copy of the index list looks obviously
correct and is obviously wrong: the two sets of faces contribute exactly
opposite face normals, `computeNormals` sums them to zero, and normalising that
is another NaN. Every herb leaf on the site was invisible and every prawn's
tail fan was a blown-out white smear for exactly that reason. The vertices are
copied too, now.

**Half the objects were being lit from underneath.** Face orientation falls out
of the order a generator happens to walk `u` and `v`, and getting it backwards
is invisible on a closed convex surface — the far wall is kept instead of the
near one, and because `computeNormals` reads winding, the two errors cancel
exactly. It is not invisible on an open one: the surface is simply culled and
disappears. The table spent an afternoon lit from below. There is a signed-
volume check in the test harness now, and the `flipFaces()` calls in
`kitchen.js` are what it asked for.

**A masked-off depth buffer does not clear.** The post chain leaves
`depthMask` false, so from the second frame onward the shadow map's clear and
the main target's clear quietly did nothing and every frame accumulated the
depth of the one before it. The first frame of the page looked perfect, which
is the worst way for a bug like this to behave.

**Value noise on a sin-hash prints a diamond trellis on anything large.**
`fract(sin(dot(p, …)) * 43758.5)` is fine while the coordinates are small and
aliases into a regular lattice when they are not. The table is twenty-six
metres of oak whose grain is sampled at seventeen cycles a metre, which puts
the argument well past that. Three rounds of integer mixing cost about the same
and have no coordinate at which they start repeating.

## Frame budget

One `requestAnimationFrame` loop drives the whole page: two renderers, the
reveals, the nav, the cursor and the map. There is no second loop and no timer
anywhere in the project.

The loop also stops. Both stages cull themselves when their section leaves the
viewport, and when neither is visible and nothing has moved for half a second
the callback is not rescheduled at all — a page sitting in the footer costs
nothing. A scroll, a pointer, a resize or a click wakes it.

Scroll, pointer and resize handlers park a number and return. Every element
offset the loop needs is measured once, on load and on resize, into a table it
reads from. Nothing inside a frame asks the browser a question it would have to
do work to answer.

Three device tiers set shadow map size, steam count, procedural detail and the
render-scale ceiling; on top of that the render scale is adjusted at runtime
from measured frame time, because a slightly softer image at rate beats a sharp
one that stutters.

`window.__shrim` is a handle on the running page: `frames`, `running`, `ms`
(per-stage average frame time and current render scale), `select(i)` to change
dish, and `tick(n, ms)` to step the loop by hand at a fixed timestep. That last
one is there because a software rasteriser takes seconds a frame, and "wait and
hope" is not a way to check that a dish came apart correctly.

## Contrast

Text colour is set from measured contrast against the lightest ground it is
ever set on — the card, `#191412` — not chosen by eye. Headings land near
15:1, body near 11.5:1, labels near 7.8:1, and the lightest fine-print token
near 6.2:1 with a 13 px floor.

The brand coral is 3.7:1 on that ground, which is under what small text needs,
so coral never carries body copy. Coral text is always the lighter tone, at
6.8:1; the darker one is for rules, fills and large type only.

The hero is the one place text sits on the same screen as a lit object, and the
two are blocked apart rather than one being laid over the other: the food takes
the middle and the right, the words take the bottom left in their own pool of
shade. On a phone there is nowhere to go, so the camera centres the dish and
the copy sits under it.

## Accessibility and degradation

`prefers-reduced-motion` is honoured, and the distinction it draws is between
decoration and navigation. Everything that moves on its own stops: no camera
drift, no idle bob, no steam, no reveals, no custom cursor, no entrance card.
Everything that moves *because it was asked to* keeps moving — opening a dish,
expanding the directions, the nav panel — because a control that changes state
with no transition at all is harder to follow, not easier. Those are shortened
to about a tenth of their length instead.

The stages need WebGL2. Without it the page adds a `no-webgl` class, the hero
falls back to a poster built from four gradients, the stage shows a line of
type instead of a canvas, and the menu index still selects dishes and still
fills in the detail panel — which is where the recipe actually lives. Nothing
on this page is available only to someone who can see a canvas.

An inline head script sets a `js` class before first paint, and the entrance
card, the canvases and every reveal-on-scroll style are gated behind it, so
with scripting unavailable the page is the same words in a plain column.

The ingredient tags over the stage are decorative duplicates of the bullet list
in the panel beside it, and the whole tag layer is `aria-hidden` — nothing
flickers in and out of the accessibility tree as a dish opens. The nav collapses
into a panel behind a toggle below 940 px, which closes on Escape and on any
link.

The booking form validates and then says what it is. Nothing is sent anywhere:
there is no server behind this page, and a form that pretends to have booked a
table at a restaurant that does not exist is a worse thing to build than one
that admits it.

## Files

```
index.html
assets/css/shrim.css      cascade layers: tokens → base → boot → nav → … → responsive
assets/js/math.js         vectors, matrices, quaternions, easing, springs, noise
assets/js/gl.js           programs, meshes, instance buffers, render targets
assets/js/shaders.js      GLSL ES 3.00 for all six passes, and fifteen materials
assets/js/kitchen.js      the larder — every ingredient, generated at runtime
assets/js/pass.js         the renderer — draws whatever scene it is handed
assets/js/dishes.js       the light, the materials, and the six dishes
assets/js/plate.js        a dish, and taking it apart
assets/js/site.js         nav, reveals, cursor, the index, the tags, the map
assets/js/main.js         boot, the scroll store, one clock, the stages
```

## Sound

There is none. The brief allowed optional, subtle sound effects; adding them
would have meant either an audio file — which breaks the one constraint this
project is built on — or synthesising them, which is a different project. A
restaurant page that makes noise when you click a prawn is also, on balance,
worse than one that does not.
