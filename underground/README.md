# UNDERGROUND CAFE — a design concept

A site concept for Underground Cafe, Majan, Dubai — a British kitchen open from
noon until one in the morning. React and Tailwind, with every picture on the
page drawn in code at run time. No photograph, no image file, no font from a
CDN, no network request after the page loads.

The direction is a Dubai garden terrace: deep forest green against warm cream,
sun through a canopy, leaf-arch frames instead of rounded rectangles. It
replaced an earlier dark, industrial version of this same site — that palette
and its whole basement-interior image set were deleted rather than tinted.

```bash
npm install
npm run dev        # the site
npm run build      # → ../underground-dist
npm run lint
```

`art.html` is a development-only contact sheet: it draws every picture at the
aspect ratios the real page uses, which is the only practical way to judge
thirty drawings as a set. It is not part of the build.

---

## What is real on this page, and what is missing

**Unofficial.** Not affiliated with, endorsed by or produced for Underground
Cafe. A fixed badge says so in the corner of every screen, and the footer says
it again in full.

Everything the site claims lives in `src/data/content.js`, and each fact
carries a `src`:

| src | means |
| --- | --- |
| `owner` | given by the person commissioning this, reading off Underground's own site |
| `listed` | from a public delivery listing — almost certainly right, but not the business speaking |
| `todo` | not known. A slot, never a guess |

### The prices are missing, and that is the one thing to fix

`undergroundcafe.ae` **cannot be reached from the machine this was built on.**
The network policy blocks the domain outright — three attempts, all
`EGRESS_BLOCKED`. No price for any item could be sourced anywhere else either.

So there are no prices on this page. Not one is guessed. Every item carries
`price: null`, which renders as nothing today and renders as `AED 42` the
moment a number goes in it — the menu layout already has the column, the type
and the alignment reserved.

**Filling them in is a fifteen-minute job with the real menu in hand:** set
`price` and `desc` on each item in `content.js`. Nothing else changes.

### The menu items are real

Names come from the brief (read off the official site) or from public delivery
listings: Full English Breakfast, Fish & Chips, Cottage Pie, Jacket Potato,
Doner on Chips, Underground Heat Burger, Doner Burger, Beef & Cheddar Burger,
Tandoori Pizza, Underground Chicken Pizza, Lamb Doner, Apple Crumble, School
Dinner Cake with Custard.

Descriptions appear **only** where one could be sourced — four of them. The
rest are left empty rather than written, because a description is a claim about
what is on the plate. The full menu carries more categories than are built out
here (Sides, Salads, Kids, Bakery, British Drinks, Healthy Line); the note
under the menu points at them.

The drinks section names no drink, deliberately: the menu has Hot, Cold and
British Drinks lists, but not one drink could be sourced by name, so the
section sells the counter and links to the real menu.

There are no reviews, ratings, awards or invented history anywhere in this
project.

---

## The drawings

`src/art/` is about two thousand lines of canvas: a garden terrace, twenty-odd
plates and drinks, six gallery scenes and an illustrated street plan.

A site for a business cannot show photographs of a room nobody has been inside,
and stock images of somebody else's café are worse than none — they are a
claim. Every picture here is a **slot**: drop a file into `public/photos/`,
name it in `content.js`, and the photograph takes over at the same crop with no
component change. See that folder's README for what each slot wants.

**Five leaves build everything green.** Monstera, banana, palm, philodendron
and fern, each drawn around its own origin pointing up, each taking a single
`t` shade parameter — 0 in full sun, 1 deep in the shade behind. That one
number is what makes a mass of foliage read as depth rather than a flat green
shape.

**One sun lights all of it.** Sunlight through leaves is not one lamp: it is a
huge soft source overhead, a green bounce coming back up off the foliage, and
hard little coins of light where the canopy has gaps. Nothing goes black
outdoors — the deepest shade is a saturated green, and the shadow under a plate
is green too, because that is the colour of the light bouncing into it.

### Composing for a crop you do not know yet

The same drawing is asked for at 16:10 in the gallery, 4:5 in a menu card and
9:19 behind the hero on a phone. Every scene is composed inside a **virtual
frame** and scaled to *cover*, with separate landscape and portrait framings —
because every element is positioned as a fraction of `W` and `H`, handing a
scene the portrait box re-lays the same terrace out tall instead of cropping a
quarter out of the wide one.

---

---

## Motion

Nothing simply fades in. Everything arrives from slightly below and slightly
behind — one composited transform per element, which is the difference between
a page that assembles and a page that cross-fades.

The rules every hook in `src/lib/hooks.js` follows:

- **Nothing reads layout inside a frame.** Handlers park a number; work happens
  once, on the next animation frame.
- **Only `transform` and `opacity` are animated.** Nothing else composites free.
- **Parallax writes a custom property, not React state.** `--p` on the element,
  read by CSS. A parallax that re-renders a component per frame is not a
  parallax, it is a stutter.
- **Reduced motion is not a downgrade bolted on afterwards.** Each hook checks
  it first and returns a still version of itself. The horizontal rail stops
  being a rail at all and becomes a three-column grid.

The one thing that moves without being asked is a one-pixel line in the footer
that takes twelve seconds to cross.

**The horizontal section** (`Hours`) is a sticky child inside a tall parent.
The vertical distance the parent adds is derived from the measured width of
the track, so the rail finishes exactly as the pin releases — no dead scroll at
the end, no panel left half off-screen.

---

## Bugs worth writing down

**An IntersectionObserver alone cannot drive reveals on a page with a nav.** It
fires on a *threshold crossing*. Click "Location" and every section in between
goes from "below the fold, not intersecting" to "above the fold, not
intersecting" without ever crossing one. No entry is delivered and those
sections sit at `opacity: 0` forever. The observer now handles ordinary
scrolling and a sweep handles jumps: when the scroll moves more than three
quarters of a viewport between frames, anything at or above the fold is
measured once and let in.

**A canvas with `inset: 0` and no explicit height paints the top 216px of a
377px box.** A canvas is a replaced element, so with `height: auto` the browser
takes its *intrinsic* size — the 300×150 default, 2:1 — and drops the `bottom`
constraint on the floor. It looks exactly like a bug in the drawing code.

**`getBoundingClientRect()` is the wrong way to size a canvas backing store.**
Several of these sit inside a parallax wrapper that is scaled, and a bounding
rect reports the *transformed* box. `offsetWidth/offsetHeight` are the layout
size and are what the painter needs.

**Two display utilities on one element let stylesheet order decide.** The
magnetic button hard-coded `inline-flex` on its wrapper, so a caller's
`hidden sm:inline-flex` was a coin toss — and the desktop CTA stayed visible on
a phone, pushing the hamburger off the edge. The wrapper now carries no
`display` of its own.

---

## Type

Bodoni Moda for display, Inter for text, IBM Plex Mono for labels. All three
are SIL OFL 1.1 and self-hosted from `public/fonts/`, latin subset only, about
124KB for the four files.

The hero wordmark is sized in viewport units with no floor, deliberately.
UNDERGROUND is eleven characters of a didone, about 8.2em wide — so a `clamp()`
with a 3rem minimum sets a 400px word inside a 350px column on a phone and the
D falls off the edge.

## Contrast

Text colour is set from measured contrast against `--color-raise` (`#17171A`),
the lightest ground any copy is ever set on: headings land near 14:1, body near
9.6:1, and the dimmest token (`--color-dust`) at 5.5:1 with a 13px floor. The
hero is the hard case, because the wordmark crosses the brightest part of the
picture; it is resolved with a second scrim thrown from the corner the headline
sits in, rather than a flat overlay strong enough to flatten the whole room.

## Accessibility and degradation

`prefers-reduced-motion` is honoured throughout. The custom cursor and the
magnetism are attached only on a fine pointer — on a touch screen there is no
hover to lean into and the listeners are pure cost — and every hover-revealed
caption is open by default at the same breakpoint those styles stop applying,
so nothing on this page is available only to someone with a mouse.

An inline head script sets a `js` class before first paint and every
reveal-on-scroll style is gated behind it, so with scripting unavailable the
page is a static version of itself; there is also a `<noscript>` card with the
address and a link to the real site, since the imagery genuinely needs a canvas.

Word-by-word reveals keep the whole string in the accessibility tree as one
label and hide the per-word spans, so a screen reader hears a sentence rather
than a list of words.

Verified in Chromium at 320 / 390 / 820 / 1280 / 1440 px wide, with reduced
motion, and with JavaScript disabled: no console errors, no horizontal
overflow, no dead links.

## Files

```
index.html
art.html                     dev-only contact sheet of every painter
src/index.css                tokens, type scale, reveals, motion prefs
src/data/content.js          every word on the site, with a status per fact
src/lib/hooks.js             reveals, scroll, parallax, magnetism
src/components/Media.jsx     photograph if there is one, drawing if not
src/components/Painting.jsx  the canvas ↔ layout bridge
public/photos/               drop real photographs here — see its README
src/components/ui.jsx        words, buttons, grain, cursor
src/art/core.js              the camera: light, grain, seeded noise, cover
src/art/vessels.js           cups, glasses, the milk jug
src/art/food.js              crockery and twelve dishes
src/art/scenes.js            the room, the doorway, the map
src/art/painters.js          the registry — one id per picture
src/sections/*.jsx           nine sections, in page order
```
