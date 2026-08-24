# SHRIMPARTY — a redesign concept

Shrimparty is a Cajun seafood restaurant on 21st Street in Al Satwa, Dubai. It
serves buckets of boiled shellfish onto the table with no cutlery and no plates.
This is a rebuild of its website around that one fact.

Open `shrimparty/index.html` in a browser. No build step, no dependencies, no
network calls, no image files.

```bash
python3 -m http.server 8000   # then visit localhost:8000/shrimparty/
```

**This is an unofficial concept and is not affiliated with, endorsed by or
produced for Shrimparty.** The menu, prices, hours, address, phone number and
the account of how the restaurant started are the restaurant's own and are
reproduced as published. Everything drawn on the page is generated in code:
there is no photograph anywhere in the project, and the mark in the nav is
drawn rather than taken.

## What is actually on the menu

Thirty dishes, in Shrimparty's own categories and its own words, in
`assets/js/menu.js`. Two rules held while writing that file:

**Where a price is not published, no price is shown.** Ten of the thirty are
published — the soups and the salad at AED 33, Fisherman Catch at 52, Fried
Shrimp Basket at 49, and the drinks. The other twenty say so and point at the
phone. It would have taken one line to fill the gaps with plausible numbers and
the menu would have looked finished; it would also have been a page of invented
prices for a real restaurant.

**Same for the rest of it.** Grilled Salmon is on the menu without a
description anywhere I could reach, so it goes out without one. No hot drink is
confirmed on the menu, so there is no hot drink on this page — the steam work
lives on the soups and the tagines, which genuinely steam.

## The constraint

**Everything is generated, and that is what makes the shrimp come apart.**

There is no model file here. A shrimp is a tube swept along a C-curve with six
overlapping shell plates cut out of it, a separate length of meat inside them,
a head, a five-bladed tail fan, swimmerets and two antennae. A mussel is two
ellipsoid halves hinged at the narrow end. A bucket is a profile revolved. All
of it is in `forms.js`, about forty parametric forms in twenty thousand
vertices for the whole site.

That is not thrift. If the shell were one welded lump baked into a file, the
signature interaction on this site — clicking a shrimp and having it peel —
would have to be a cross-fade. Because the shell is six independent plates that
happen to be sitting in their assembled positions, taking it apart is just
letting go of them.

The second constraint follows: **nothing is symmetrical unless it has to be.**
Every builder takes a seed, and the seed bends the curve, jitters the plate
edges, dents the potato and skews the crumb. Two shrimp built by the same
function look like two shrimp rather than like one shrimp drawn twice.

## Food is wet

Almost nothing on a Shrimparty table is a dry matte surface, and that is the
whole of the look. A boiled shell carries a film of sauce; fried breading is
glazed with oil; a mussel is glossy inside and chalky outside; broth is a mirror
with a skin on it. What separates a plate that looks edible from a plate that
looks like plastic is not polygon count — it is that the specular response
varies across the surface, and that what it reflects is a real room.

So there is no cubemap and no IBL rig. The room is analytic: one hot lamp over
the table, a cool sheet of light from the window wall, and a warm bounce up off
the board. `env()` evaluates that room for any direction at any roughness, which
is what lets steel, wet shell, dry breading, ceramic, glass and liquid read as
different materials under one light without a single texture fetch.

`wet` is per-instance and a noise field decides where the sauce actually sits,
pooling on downward faces and shedding off upward ones. That is the difference
between "shiny" and "wet".

The key is a three-quarter **back** light. Front light makes a shrimp a flat red
shape; a key behind it rakes along the shell, picks out every plate edge, puts a
rim on the wet surfaces and throws the contact shadow towards the lens. It was
the single change that made the food stop looking modelled.

## The film — three acts on one number

The top of the page is a pure function of scroll.

```
0.00  ONE SHRIMP   alone, back-lit, turning about a quarter of a degree a frame
0.30  THE PEEL     head, six plates tail-end first, the fan, then the meat
0.64  THE TABLE    the camera pulls back and finds the bucket it came out of
```

Scroll up and every bit of it runs backwards — the shell plates fly back onto
the meat — because the peel is a parameter and not a timeline. `D.peel(plate,
group, u)` takes a `u` of 0.42 and gives you the shrimp 42% peeled, scrolled
there, jumped there or held there.

## Thirty dishes, thirty acts

The brief this was built to was blunt about it: no two dishes may move the same
way. `acts.js` is thirty functions, not one function with a switch.

They are only allowed to do one thing: move targets. Nothing in that file sets a
position, a rotation or a colour directly. Every motion on this site arrives
through the same springs and carries the same weight, which is why a shell you
have pulled off and dropped is still falling while the act is busy telling the
rest of the shrimp what to do, and why nothing has to coordinate that.

The test for each act was: *would this motion make sense if the dish were on a
table in front of you?* A basket of fried shrimp gets shaken, because that is
what you do with a basket. Mussels hinge open about forty degrees. A tagine's
lid lifts, arcs over and comes to rest beside the pot. The sizzling plate — the
only dish that arrives still cooking — glows where the food is not sitting,
throws oil mist, and everything on it has a half-millimetre tremor.

And **steamed white rice steams.** The grains breathe by a fraction of a
millimetre. That is the entire act, and it would be worse with anything added.
Getting the restraint right on the quiet dishes is what earns the bucket the
right to be loud.

## The table

The menu is not a grid of pictures of dishes. It is thirty dishes on one board,
and the camera dollies along it; whatever is in front of you is real geometry
being simulated at that moment. Open one and the camera moves into that dish's
own coverage and its act starts. Click a shrimp and the lens goes to *it* —
wherever it has got to — and it peels.

Only what is near the camera exists. A window of five plates is built and
stepped and the rest have not been made yet, which is what keeps a menu of
thirty dishes, some of which are four hundred simulated parts, inside a frame
budget.

Underneath it, `#menu` is the whole menu in markup — every dish, description and
price, served as HTML. Building it in JavaScript would have been fewer lines and
would have meant that a browser with scripting off gets an empty section where
the menu should be. For a restaurant, the menu is the one thing on the site that
has to survive everything.

## Six bugs worth writing down

**Every swept and revolved surface was inside-out.** `lathe` walks its profile
upwards and comes out facing outwards; `sweep`, `blob`, `slab`, `ring` and
`disc` walk their rows the other way and come out facing inwards from the same
stitching code. Back faces are culled, so an inside-out shell has its near wall
removed and you see straight through it to whatever it is wrapped around. Every
shrimp on the site rendered as a pale lump of meat with a few red slivers at the
silhouette — and it read as a *lighting* problem, so the first three attempts at
a fix were all in the shader. `lattice` takes a `flip` now, and the thing
that actually found it was computing the signed volume of every closed form and
looking for the negative ones — which is a two-minute check that would have
saved three attempts at fixing it in the shader.

**The collision pass blew every shrimp apart on the first frame.** One pass of
pushing overlapping pairs apart is all a bucket needs — except that a shrimp's
six shell plates overlap its meat *by design*. The hero shot looked three times
too close because it was: it was a shrimp the size of the frame, exploded.
Only one anchor part per creature goes into the collision list now, which also
took the biggest bucket from 473 candidates to 25.

**A normalised specular lobe added on top of the direct term is fifty times too
bright.** The analytic environment had a lamp lobe in it, normalised by
`(g+2)/2π`, *and* the direct GGX term had the same lamp. Because a normalised
lobe's peak scales with its own tightness, the second copy burned a hard white
streak along every curved surface that sparkled as the geometry turned. The
environment carries the lamp as a broad sheen at a peak of about one now, and
the crisp highlight comes from the direct term alone, where it belongs.

**Every hand-written camera distance was wrong for at least one dish.** The
number that framed a bucket put the lens inside a highball glass and halfway
through a tagine. Dishes measure themselves at build time (`D.measure`) and the
camera asks (`D.frameDistance`) — which also fixed phones for free, since a
vertical field of view runs out horizontally first on a frame that is less than
half as wide as it is tall.

**`is-on` on `<html>` collided with `.gl` on the canvas.** A class named `gl`
was added to the root element to fade out the CSS poster; `.gl` is also the
canvas's own selector, which is `position: fixed; inset: 0`. The root element
became a fixed box and the entire page went blank.

**`[hidden]` is a UA rule, so `.cta { display: inline-block }` beats it.** Half
the buttons on this page are `.cta`, so hiding one did nothing: the table showed
"Open it" and "Back to the table" side by side.

## Frame budget

One `requestAnimationFrame` loop, and it stops. It runs when the film is on
screen or the table is open; scroll past the film with the table closed and the
WebGL context is doing nothing at all, which matters because the rest of the
page is a long read.

Scroll, pointer and resize handlers park a number and return. Every element
offset the loop needs is measured once, on load and on resize, into a table it
reads from. Nothing reads layout inside a frame.

Everything is batched by mesh. A bucket holding sixteen shrimp, five potatoes,
three corn and two hundred and sixty flecks of seasoning is **29 draw calls for
1216 instances**, because every instance carries its own transform and its own
material in the vertex stream.

Three device tiers set the shadow map size, the sprite cap and the blur chain
depth; on top of that the render scale moves at runtime from measured frame time
towards 110 fps. On a page where you drag a shell around with a pointer, latency
is the thing you feel first, so a slightly softer image at rate beats a sharp
one that stutters.

Add `?debug` for a frame readout and a `__shrimparty` handle with `seek`,
`table`, `pickAt`, `sel` and `peel`.

## Passes

```
1  shadow depth      one directional light, 3×3 PCF, front faces culled
2  room + opaque     analytic room, then everything solid, into HDR + distance
3  liquid            ripple-displaced surfaces, after the solids
4  sprites           steam, bubbles, condensation, oil mist — soft against 2
5  blur chain        three down, one up: the DOF source *and* the bloom source
6  composite         depth of field, bloom, ACES, grade, vignette, grain
```

The blur chain is not bright-passed. It is the real image at low resolution,
because it is doing two jobs: it is what the depth of field mixes towards and it
is where the bloom is bright-passed *from* at composite time. Two chains would
cost twice as much and look the same.

Pass 4 samples the distance buffer pass 2 wrote, so a puff of steam fades as it
approaches the rim of the bowl it is rising out of. A texture still attached to
the bound framebuffer is a feedback loop whether or not anything is written to
it, so the attachment comes off for the duration of that pass.

## Contrast

Text colour is set from measured contrast against the ground it actually sits
on, not chosen by eye. On the page ground: body **17.6:1**, muted **10.7:1**,
the mono labels **6.2:1**, the accent **6.4:1**, and the ink on the one solid
button **6.2:1**. On the lifted ground under the booking form the labels are
still **6.0:1**, which is the dimmest text anywhere in the project. Nothing is
set below 12px, and everything carrying prose is at 13px or more.

The film and the table are harder, because nothing at the edge of frame can rely
on the image behind it. The captions carry lower- and upper-third gradients —
the ones a title designer would ask for — and the hero caption is blocked apart
from the shrimp rather than shaded over it: the subject is framed right of
centre so the title has the left third to itself, and the camera pans rather
than centres when a dish is open so its words have somewhere to go.

## Accessibility and degradation

`prefers-reduced-motion` is honoured. The film still answers the scroll, because
that is navigation rather than decoration, but the handheld is off, the idle
drift is off, the reveals are off and the peel resolves immediately instead of
easing.

An inline head script sets a `js` class before first paint, and the boot card,
the sticky film, the canvas and every reveal-on-scroll style is gated behind it.
With scripting unavailable the page is the same words in a plain column, with
the full menu in it, and a title card in markup that is the only thing shown
*because* the scripts did not arrive. Without WebGL2 the canvas never appears
and the CSS poster stays.

The film's captions duplicate prose that is also in `#rule`, so the whole
caption layer is `aria-hidden` rather than flickering in and out of the
accessibility tree. The nav collapses behind a toggle below 940px, which closes
on Escape and on any link. The table closes on Escape, moves on the arrow keys,
and returns focus to whatever opened it. The menu prints.

## Files

```
index.html
assets/css/shrimparty.css   cascade layers: tokens → base → nav → film → … → responsive
assets/js/math.js           vectors, matrices, quaternions, easing, springs, noise
assets/js/gl.js             programs, meshes, instance buffers, render targets
assets/js/shaders.js        GLSL ES 3.00 for all six passes
assets/js/forms.js          every object in the project, generated at runtime
assets/js/menu.js           the real menu, and the restaurant's own details
assets/js/camera.js         the rig — a goal, a scripted move, and handheld
assets/js/stage.js          the renderer: draws whatever it is handed
assets/js/dishes.js         materials, parts, the physics, the assemblies
assets/js/plates.js         thirteen builders — how each dish is put together
assets/js/acts.js           thirty choreographies, the peel, and the coverage
assets/js/scenes.js         the film, the table, particles, picking, dragging
assets/js/site.js           nav, reveals, opening hours, booking, table chrome
assets/js/main.js           boot, one clock, the scroll store, the pointer
```

`math.js` and `gl.js` started as the same files from the Peet's project in this
repository, with the namespace changed; `gl.js` has since grown the second
colour attachment the steam needs. They are plumbing, and rewriting vector
maths to avoid reusing vector maths would have been a waste of the budget.

Verified in Chromium at 390 / 900 / 1280 / 1440 px wide, with reduced motion,
with JavaScript disabled, with the film culled and restored, and with the whole
rail walked dish by dish.
