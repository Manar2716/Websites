# UNDERGROUND CAFE — a design concept

A site concept for Underground Cafe, Majan, Dubai — an English restaurant,
despite the name, open from noon until one in the morning. React and Tailwind,
with every picture on the page drawn in code at run time. No photograph, no
image file, no font from a CDN, no network request after the page loads.

The drawings are scaffolding, not the point. Every picture slot takes a real
photograph the moment one is dropped into `public/photos/` and named in
`content.js` — see that folder's README.

```bash
npm install
npm run dev        # the site
npm run build      # → ../underground-dist
npm run lint
```

`art.html` is a development-only contact sheet: it draws all thirty-odd
pictures at the aspect ratios the real page uses, which is the only practical
way to judge them as a set. It is not part of the build.

---

## This is a concept, and it says so

**Unofficial.** This is not affiliated with, endorsed by or produced for
Underground Cafe. The footer says that, on the page, in the last paragraph.

Everything the site claims about the business lives in one file,
`src/data/content.js`, and every fact in it carries a `status`:

| status        | means                                                        |
| ------------- | ------------------------------------------------------------ |
| `confirmed`   | from the business's own site or its verified social profile   |
| `listed`      | from a third-party directory — almost certainly right, but not the business speaking |
| `placeholder` | **not real.** A stand-in of roughly the right shape           |

Search that file for `placeholder` to find everything outstanding.

**No prices, anywhere.** Not one published price could be sourced, and a
concept site carrying invented numbers is the version of this that does real
damage — somebody quotes it back at the counter. Names and descriptions are
shown; prices live one tap away on the official site.

**Four menu items are real.** English Breakfast, the Beef & Cheddar burger,
the Underground chicken pizza and the Lamb Doner have names and descriptions
taken from the restaurant's own delivery listings. They carry a brass dot on
the page, and the legend sits above the list. Everything else is a layout
placeholder and has no dot.

**The founding year** is shown as `20—` rather than guessed at.

There are no reviews, ratings, awards or superlatives anywhere in this
project, and there should not be: none of it can be sourced.

### What an earlier draft got wrong

The first version of this site was written as a third-wave espresso bar:
"specialty coffee", a tagline about coffee, and a five-panel horizontal
section walking through sourcing, roasting, grinding, extraction and the
pour. Underground does not roast coffee. It is an English kitchen doing
all-day breakfast, burgers, pizza on a fresh base and a lamb doner in pitta
rolled from that same dough.

That section is now the opening hours — the one thing about the place that
is both true and worth a rail — and the roasting scenes have been deleted
from `src/art/scenes.js` rather than left lying around. It is worth naming
because it is the exact failure mode this whole `status` system exists to
prevent, and it still happened: the copy was plausible, internally
consistent, and about a different business.

---

## The constraint: nothing here is a photograph

A site for a business cannot show photographs of a room nobody has been
inside, and stock images of somebody else's cafe are worse than none — they
are a claim. So the whole image set is generated: `src/art/` is about
seventeen hundred lines of canvas that draws a room, twenty-odd dishes and
drinks, six gallery frames and a street map.

It also happens to be the right technical answer while the real photographs
are missing. Thirty pictures weigh nothing, stay sharp on a 4K panel, need no
CDN, and can be re-lit by changing one number — and each one is a slot the
real picture drops straight into, at the same crop, with no layout change.

**One lamp lights all of it**, and that is what makes the set read as one body
of work rather than a folder of unrelated images:

```
key      warm, upper left, hard-ish, the brass side of white
fill     almost nothing — the shadows go to near-black
rim      a cool bounce on the right edge of every form
ground   never flat: a warm pool with the corners falling away, and grain
```

Twelve drinks come out of two forms. A latte and a flat white are not two
different pictures — they are the same cup with a different foam depth, a
different rim ratio and a different surface pattern, which is also the entire
difference between them on a bench.

Three menu sections are one drawing each with a parameter on it: a double
burger is a single with a second patty and the bun lifted, a chicken burger
is the same with a paler crumbed middle, and a margherita is the chicken
pizza with the toppings list emptied. Nine menu items, three shapes — which
is roughly how the kitchen thinks about them too.

All randomness is seeded off the picture's own id, so resizing the window
redraws the same picture rather than a new one.

### Composing for a crop you do not know yet

The same drawing is asked for at 16:10 in the gallery, 4:5 in the hours rail
and 9:19 behind the hero on a phone. Composing against the real width and
height gives a picture that works in one of those and falls apart in the rest
— the bar ends up off the bottom, or a pendant lands on the headline.

So every interior is composed inside a **virtual frame** and scaled to *cover*
the canvas, the way `object-fit: cover` treats a photograph. Each scene
carries two virtual frames, landscape and portrait, and because every element
inside is positioned as a fraction of `W` and `H`, handing it the portrait box
re-lays the same room out tall instead of cropping a quarter out of the wide
one.

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

## Four bugs worth writing down

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
