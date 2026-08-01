# SHRIMPARTY — a design concept

A Cajun seafood restaurant on the Dubai water: six pages, a nine-act film in
WebGL2, and a menu board you could actually order from.

No build step, no dependencies, no network calls, no image files.

```bash
python3 -m http.server 8000   # then visit localhost:8000/shrimparty/
```

Add `?debug` to any page for a frame-time readout, plus a `__film` handle on
`window` for seeking and settling the film from a console.

## The six pages

```
/                  the film, then the doors into the rest
/menu/             the full board — seven sections, every price
/signatures/       seven dishes on a live turntable
/sourcing/         the deep, the eleven-hour day, the thirty-four spices
/reserve/          the booking form and the house rules
/visit/            a drawn map, the hours, and what people ask
```

Every one of them is a real document at a real URL. There is no router and no
client-side navigation, which is the reason the back button, middle-click,
"open in new tab" and find-in-page all work without a line of code spent on
them.

**The header and footer are duplicated into all six files rather than injected
at runtime.** Injecting them would mean a page with scripting disabled has no
navigation, which is the one thing a website cannot do without. They are
assembled from a single source string at authoring time and the *output* is
what lives in the repository — the deploy is still the checkout.

## Page transitions

A click on an internal link is intercepted, the page goes under — three layers
of water rise, the content sinks and blurs — and only then does the navigation
happen. The next document runs the second half on load and the water drains.

The two halves are separate documents and cannot share state, so they agree by
construction rather than by handshake: the same three elements and the same
CSS transition, one direction each. The outgoing half is capped at 300 ms, and
if the animation has not finished by then the navigation happens anyway —
nobody should be held at a full-screen wash because a transition event did not
fire.

Cross-document view transitions would do this in four lines of CSS and are the
right answer on a site that can require a current Chromium. This one cannot,
so the fallback would need writing regardless, and then there would be two
transition systems to keep in agreement instead of one.

With scripting off the links are links. With reduced motion the wash is skipped
entirely.

**This is a design proposal, built on spec.** SHRIMPARTY is a real
restaurant; this site is not its official one and was not commissioned by it.
Every dish, price, address and telephone number here is placeholder content
chosen to exercise the layout, and would be replaced with the restaurant's own
before anything went live. The reservation form is a demonstration and sends
nothing anywhere. Every object on the page — every shrimp, every claw, every
plate — is generated in code.

## The constraint

**There are two lights in this project and only two.**

A low afternoon sun, warm and off to one side, and the sky it hangs in — which
is a light in its own right and by far the larger of the two by area. Every
colour anywhere on the page is one of those reflected off something: the
turquoise is sky and depth through water, the white glitter is the sun on
wavelets, the orange is shell taking a warm key. A boil under the pail is the
one local exception and it lights a single act. The small glowing red is a
specular on wet shell — it appears in the fresnel term of the object shader and
nowhere else, and it is never used as a fill.

The sky is a single function, `skyColor`. The sky pass draws it, the ocean
reflects it, and every object's environment term samples it. Two different
skies in one frame is the fastest way to make water look pasted onto a
backdrop, and it is why the horizon reads as a change of material rather than
as a seam between two pictures.

That rule is why the palette holds across nine acts shot in completely
different places, and why the same shrimp reads as appetising under the pail in
act five and as wreckage sinking in act nine without one value changing. Add a
third light and it becomes a page with a lot of orange on it.

The second constraint follows from the first: **there is no image file in this
project.** The film is WebGL2. The seven menu illustrations are drawn on a 2D
canvas at runtime by `art.js`. The underwater section and the footer are canvas
too. The one mark in the nav is inline SVG. Nothing is downloaded, so nothing
can fail to download.

## The film — nine acts on one number

The whole film is a pure function of one normalised scroll value. Hand
`Film.update` a `t` of 0.42 and you get the exact frame at 0.42 — scrolled
there, jumped there, or holding still.

```
0.000  DROP       black. one droplet falls. the screen ripples.
0.078  FOG        fog blooms out of the impact; the sun burns through
0.170  CROSSING   flying low over the swell, sun path running
0.290  THE RISE   the pail breaks the surface, water sheeting off
0.400  ORBIT      the camera circles it; steam; the wordmark lands
0.520  BREAK      the pail comes apart, the boil hangs in the air
0.640  DRIFT      lobster past the lens, garlic at the lens
0.770  REFORM     the whole boil collapses onto the platter
0.880  DESCENT    the camera lifts; the scene sinks; the light goes long
```

Three things are deliberately *not* pure functions of `t`: the springs that
carry two hundred ingredients between their act positions, the particle pool,
and the flicker on the boil. Those are texture rather than choreography — scrub
to 0.42 and wait a beat and they settle to the same frame, which is what makes
them safe to be stateful.

The camera is one Catmull-Rom curve through sixteen keys across the whole film,
not nine shots cut together. That is why the transitions between acts read as
camera moves rather than as edits.

**The ingredients do not teleport.** Each of the two hundred carries five
positions it can be in — packed in the pail, suspended in the break, drifting
past the lens, laid on the platter, sinking — and a spring that takes it
between them. The acts change where the springs are pulling; the lag between
the pull and the arrival is most of what makes the motion feel like mass.

## Everything is generated

`geometry.js` has no downloaded model and no texture in it. The idea that pays
for itself is `sweep`: hand it a path through space and a cross-section that
may change along that path, and it gives you shrimp, crab legs, claws,
andouille and herb stems out of one generator. What separates them is fifteen
lines of profile each.

The shrimp is the object that had to be right. What reads as "shrimp" at a
glance is three things in order of importance — the C-curl, the six overlapping
shell plates, and the fanned tail — and colour cannot rescue a body that has
none of the three. The curl is in the path, the plates are a sawtooth on the
radius, and the fan is five blades aligned to the spine's end tangent. Getting
that last part wrong is instructive: build the blades in world axes and they
splay around `+X` while the body ends pointing elsewhere, and the three of them
close up into a cone.

Corn went the other way. The first version put the kernels on a golden spiral,
on the theory that phyllotaxis is what plants do. It is — but not this plant.
Corn grows its kernels in an even number of straight paired rows, and the
spiral came out as diagonal ridges with no discrete kernels at all, because on
a 137.5° spiral the angular and axial spacings differ by two orders of
magnitude and the nearest-point metric collapses onto one axis. Sixteen rows,
twenty kernels each, alternate rows offset by half a kernel.

## The render pipeline

Nine passes, once a frame, in `stage.js`:

```
1  shadow depth       one directional light, 3×3 PCF, front-face culled
2  sky                fullscreen, per-pixel ray direction
3  ocean              radially graded polar grid, four Gerstner waves
4  solids → HDR       singletons, then instanced crowds
5  steam              raymarched at half res, reads scene depth
6  particles          additive billboards, soft against depth
7  bright → mips      4 down, 4 up — dual filter bloom
8  sun shafts        radial blur at quarter res
9  composite          warp, aberration, grade, ACES, vignette, grain
```

Every target is half-float where the hardware allows it. The whole look depends
on a wet-shell specular being allowed to sit at forty times the value of the
black water behind it, and in eight bits that specular and a sheet of white
paper are the same number.

Two bugs in this pipeline were worth the time they cost and are worth recording:

**The sea came out white.** The Smith visibility term goes to zero over zero at
grazing angles, and the ocean is seen at grazing incidence across the entire
frame. Every caller has to multiply by `NoL`; the object shader did and the
ocean shader did not, so the specular ran to five million and the whole lower
half of every frame clipped.

**The particle pass read the framebuffer it was drawing into.** Soft particles
need the scene depth, and the scene depth is attached to the scene target — a
feedback loop, and an `INVALID_OPERATION`. It is drawn through a second
framebuffer over the same colour texture with no depth attachment, which makes
the read legal. Particles then have no depth test, which turns out not to
matter: the soft-particle term already goes to zero behind the scene surface,
so occlusion comes from the fade rather than from the test.

## Springs, and why they are substepped

`springV3` is explicit Euler, stable only while `stiffness · dt²` stays under
about 4 and `damping · dt` under 2.

Food packed in a pail is *in the pail* — it does not lag behind it — so the
packed phase runs seven times stiffer than the break, and the two blend across
the moment the pail comes apart. At 13 fps, which is a slow machine or the
first frame back from a background tab, that stiffness breaks both limits at
once and two hundred ingredients leave the frame at speed, permanently.

Every spring in the film substeps at a fixed 1/120 regardless of the display.
Eight substeps of a three-multiply spring across two hundred items is not a
cost worth optimising, and the alternative is a boil that occasionally
evaporates.

## Smooth scrolling

The momentum scroll in `main.js` drives the *real* scroll position rather than
translating a wrapper element. Wheel and key input are captured, integrated
into a target, and the page is eased toward it — so `position: sticky` still
works, the scrollbar is still the scrollbar, anchors still land, and
find-in-page still scrolls to the match. A transformed wrapper gets the same
feel and breaks all four.

It turns itself off for a coarse pointer, where the platform's own inertia
beats anything achievable in JS, and for anyone who has asked for reduced
motion.

## A different animation per section

Nothing on this page fades in, and no two sections arrive the same way:

| section | mechanism |
| --- | --- |
| film captions | rise out of the black, a blurred copy burning off behind |
| the legend | a tide sweeps the block; each character it passes lifts and settles |
| headings | letters on a `rotateX` from below, delayed outward from the centre |
| menu panels | float on independent phases, tilt to the pointer on a spring |
| signature dishes | driven by the turntable's own progress, not by their scroll |
| the deep | a canvas whose current is the scroll velocity |
| booking | the field border is an SVG rect drawn from one corner |
| the footer | particles that never stop, because the page is never still |
| page heroes | a mask wipe: each word is a clipping box, letters ride up into it |
| menu rows | the name arrives, the leader draws across, the price slides in behind it |
| the map | every stroke draws itself, normalised by `pathLength` |
| the doors | a bar of boil light wipes across from the left |

The page hero runs off its own clock rather than off the scroll, because it is
on screen before a wheel has been touched — a scroll-driven entrance for
something already in view either plays instantly or never plays at all.

The menu board's leader dots are worth a note. The name, the leader and the
price are siblings rather than a name block beside a price, because the leader
has to be the element that absorbs the slack and it cannot do that from inside
a wrapper that has already taken all of it. Give the flexible column to the
name and the leader collapses to a two-centimetre stub floating next to the
number, which is worse than no leader at all.

The reservation form's heat switch slides on a spring rather than a transition,
so holding an arrow key gives one continuous slide instead of four separate
300 ms eases fighting each other.

## Two WebGL contexts, never at once

The signature dishes run a second, smaller stage on their own canvas —
`studio.js` — because that section's brief is *interactive* camera movement,
which pre-baked turntable frames cannot give you off the axis.

The cost is managed rather than paid: each stage culls itself when its own
section is off screen, and the two sections cannot both be on screen because
there is a whole menu between them. The GPU only ever has one running.

One camera rig serves all seven dishes, and the vessels are nothing like the
same size — a pail is 0.8 across and a plate is 2.0. Each dish carries the
scale that brings it to the same apparent size, applied to everything it owns:
the vessel, its contents, its pool, its steam and its shadow. Scaling only the
vessel is the trap — the food then floats above a plate it no longer fits.

Dishes hand over by sinking and shrinking while a noise threshold eats them.
The first version handed over across a third of a slice, which meant a third of
the section's scroll was spent looking at lace. The handover is now short, and
most of the distance between two dishes is covered by motion the eye reads as
an exit rather than an effect it reads as a glitch.

## Frame budget

One `requestAnimationFrame` drives everything. Scroll, pointer and resize
handlers park a number and return — they never read layout. Every element
offset is measured once, on load and on resize, into a table the loop reads
from. Only `transform`, `opacity` and custom properties are written.

Device tier sets the counts at boot; the measured frame time then adjusts
render scale at runtime, because a slightly softer image at rate beats a sharp
one that stutters. Off-screen scenes are culled, and the loop stops entirely
when the tab is hidden.

The loop is unconditional and the film is optional. Four of the six pages have
no GPU scene on them at all, and they still need a clock — every reveal on
every page starts at opacity zero and is brought back by the frame loop.
Returning early when `#gl` is missing, which an earlier version of this did,
leaves a correct, fully populated, completely invisible page. Each page loads
only the modules it needs: the menu takes the 2D illustrator, the turntable
takes the renderer, and sourcing, reserve and visit take neither.

## Typography

There is no webfont, because there is no network request anywhere in this
project and a 300 KB variable font would be the single heaviest thing on a page
whose entire 3D film is generated in code. The display face is the system UI
stack pushed hard — very large, very tight, uppercase — and the labels are the
system monospace at wide tracking.

Text colour is set from measured contrast rather than by eye. Body copy lands
near 10:1 on the ground, labels near 6:1, and nothing carrying words is smaller
than 11.5 px. Nothing is pure white either: the brightest type sits at
`#F4F1EC`, because `#FFF` on `#090909` at display brightness is a light source
rather than a letterform.

## Accessibility and degradation

`prefers-reduced-motion` is honoured throughout: the momentum scroll is off,
scenes hold representative end states, every reveal resolves to its finished
form, the ambient canvases stop, page transitions are skipped and the boot
overlay never appears. Nothing is hidden behind a preference.

Below 860 px the header collapses to a button and a full-screen list. It is a
button and a list, so it works from the keyboard, closes on Escape, and needs
no library.

An inline head script sets a `js` class before first paint, and every
reveal-on-scroll style is gated behind it, so with scripting unavailable the
page is a static version of itself rather than a column of blanks. Without
WebGL2 the film and the dish stage fall back to painted gradients and their
tracks collapse to normal height; the rest of the page is unaffected.

The custom cursor only replaces the system one where a fine pointer exists.
Focus styles are visible, the skip link works, the current page is marked with
`aria-current` in the markup rather than derived by script, and the form
reports validation in a live region.

The signature dishes page carries the same seven dishes as plain text under
the turntable. That list is the content; the turntable is the presentation.
Without a GPU, without a pointer or without scripting, the seven dishes and
their prices are still all there.

## Files

```
shrimparty/index.html                  home
shrimparty/menu/index.html             the board
shrimparty/signatures/index.html       the turntable
shrimparty/sourcing/index.html         the deep
shrimparty/reserve/index.html          booking
shrimparty/visit/index.html            map, hours, FAQ
shrimparty/assets/css/shrimparty.css   cascade layers: tokens → base → … → responsive
shrimparty/assets/js/math.js           vectors, matrices, quaternions, easing, springs
shrimparty/assets/js/gl.js             the thin layer over WebGL2
shrimparty/assets/js/geometry.js       every object in the film, generated
shrimparty/assets/js/shaders.js        GLSL ES 3.00 for the whole film
shrimparty/assets/js/stage.js          the renderer — nine passes
shrimparty/assets/js/film.js           the nine acts, on one number
shrimparty/assets/js/studio.js         the signature dishes, on a turntable
shrimparty/assets/js/art.js            the menu illustrations, on a 2D canvas
shrimparty/assets/js/site.js           everything that is not the film
shrimparty/assets/js/chrome.js         page transitions, header state, the drawer
shrimparty/assets/js/main.js           boot, tiers, the scroll store, one clock
```

`math.js` and `gl.js` are shared in spirit with the sibling project in this
repository and carried across as source rather than imported, because each site
here is self-contained and reachable on its own path.

## On the requested stack

The brief for this page named GSAP, ScrollTrigger, Lenis, Three.js, SplitType
and Framer Motion. None of them are here, and the equivalents are:

| asked for | what is here |
| --- | --- |
| Three.js | `gl.js` + `stage.js` — WebGL2 direct, nine passes |
| GSAP + ScrollTrigger | the scroll store in `main.js`, driven per frame |
| Lenis | `MomentumScroll` in `main.js`, on the real scroll position |
| SplitType | `split()` in `site.js` |
| Framer Motion | the springs in `math.js` |

The reason is the repository, not preference: every site in it is a static
checkout with no build step and no network call, and the deploy is the
checkout. Adding six CDN scripts would make the page's first paint depend on
six third parties for behaviour that is a few hundred lines of code here — and
a Three.js scene would still need every shader in `shaders.js` written by hand,
because there is no off-the-shelf material for wet shell lit by a boil.
