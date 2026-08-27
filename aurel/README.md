# AUREL — Dental Studio

A single-page site for a private dental clinic in the Dubai
International Financial Centre.

Open `aurel/index.html` in a browser. No build step, no
dependencies, no network calls.

```bash
python3 -m http.server 8000   # then visit localhost:8000/aurel/
```

AUREL is a design concept. The studio, its clinicians, their
credentials, the case note and the reviews are invented for the
purposes of the design, and the page says so in its own footer.
The phone number is unassignable and the email domain is the
reserved `.example`, so nothing here can reach a real person.

## The constraint

**Two grounds, one accent, and the accent is never decoration.**

Every surface is warm ivory or deep navy. The rule between them
is a hairline of sand. The only chromatic colour in the project
is a desaturated aqua, used at small sizes for state — a
selected marker, an open row, a live map, the italic in a
headline — and never as a fill, a gradient or a mood.

That restraint is doing specific work. A clinic site reads as
expensive through type, spacing and photography, and it reads
as cheap through decoration. Everything this project does not
have is a decision: no glassmorphism, no floating cards, no
blobs, no shadow wider than 40px, no gradient behind text, no
rounded corner over 2px, and no colour that did not come off
the ramp at the top of the stylesheet.

The page runs light → light → light → bone → **navy** → light →
bone → **navy** → light → **navy**. The two dark chapters are
the results and the booking: the one place clinical
photography sits better on a dark ground, and the one place the
page wants to feel like an appointment rather than a brochure.

## The photography

**This is the part that is not finished, and it is finished
deliberately.**

The site was designed around two white-on-white 3D renders of a
mandibular molar. Those files are not in the repository — see
`assets/img/README.md` for what goes where. Until a photograph
exists, its slot renders a **plate**: a contact-sheet card with
registration marks at the corners carrying the slot id, the
subject to shoot and the crop it needs.

That is not a placeholder in the apologetic sense. A missing
photograph should look like an art-direction card waiting to be
filled rather than like a broken page, and it should tell
whoever opens the folder exactly what to take. Adding a
photograph is *only* adding a file: `media.js` probes
avif → webp → png → jpg for each slot name and takes the first
that decodes, so there is no manifest to keep in sync.

### Why the renders keep their white background

The specimen composites with `mix-blend-mode: multiply` against
a pool of light painted underneath it. White multiplied into
that ground vanishes; every grey in the shading survives. The
object ends up sitting in the page with no visible image box,
from a file that still has its background — no cut-out, no
alpha channel, no halo.

The trap, and it cost a debugging pass: `mix-blend-mode` blends
with the backdrop **inside its own stacking context**, and both
specimen slots sit under an ancestor with a transform — the
hero's parallax, the anatomy zoom. Each of those establishes a
context that the page's ivory is nowhere inside, so the image
blended against nothing and kept a bright white rectangle. The
ground has to be painted on the blended element's own parent,
which is why `--specimen-ground` exists and why both specimen
sections are on light grounds and must stay there.

## What the page does

**Treatments** are a numbered index with a rule between each
line, not a grid of cards — eight identical rounded cards is
the single most template-looking thing a clinic site can do.
Rows are `<button aria-expanded>` inside `<li>`, so it is a
keyboard list for free. On a pointer device a card trails the
cursor carrying the numeral, the name and the starting price;
it is type rather than a photograph on purpose, because eight
photographs of dentistry shown at 260px while the cursor is
moving would all read as the same pink smear.

**The anatomy study** puts four markers on one photograph of
one tooth and zooms *into the marker* — a scale with the
transform-origin at that point, which is one composited
transform and reads like a clinician leaning in. The markers
live inside the zoomed element so they travel with the anatomy
they label, and counter-scale by 1/z so they stay the same size
on screen while the tooth grows under them. Letting the dots
inflate with the image is what makes most zoom interactions
feel like a broken PDF viewer.

**Before and after** clips the top photograph with
`clip-path: inset()` rather than resizing a layer. A layer
whose width animates squashes the photograph inside it, and a
squashed before next to an unsquashed after is an accidental
lie about the result. It is `touch-action: pan-y`, so a
horizontal drag moves the divider and a vertical one still
scrolls the page.

**Reviews** are a real `overflow-x` element, not a transformed
track — which means trackpad, touch, scrollbar, Tab and the
arrow keys all work without a line of code. The set is rendered
twice and the offset wraps at the halfway mark. It drifts at
17px/s rather than advancing slide by slide, and stops the
moment you touch, hover or focus it.

**Booking** is six steps because the long form is where people
stop. Step two has an honest default and can be skipped, the
calendar never offers a slot the studio is closed for, fields
validate on leaving a step rather than on every keystroke, and
the confirmation shows the whole booking back. Nothing is
transmitted; the note under step five says so rather than
implying an appointment was made.

**The map** is drawn, not embedded. An iframe from a map
provider would drag in a third-party script, a cookie banner's
worth of tracking and a palette nobody here chose, onto a page
whose whole argument is restraint. Wheel-to-zoom stays off
until the map is clicked — a map that swallows the scroll wheel
as the cursor crosses it is the most hated widget on the web.

## Motion

One `requestAnimationFrame` loop drives everything (`core.js`).
Scroll, resize and pointer handlers never read layout — they
park a number, and all work happens once per frame against a
damped scroll value, so the motion feels the same at 60Hz or
240Hz. Offscreen tracks are culled, and **the loop parks itself
after half a second of nothing moving**, which is the rule that
caught the two real performance bugs in this build:

- The review rail drifted from page load rather than from when
  it came on screen. By the time anyone scrolled to the
  reviews it had already walked several hundred pixels and
  opened mid-card, and it had held the frame loop awake for the
  entire journey to get there.
- The specimen had a slow sine float. A permanent animation
  never lets the loop park, and — the part that is easy to miss
  until you try to use it — it means the four anatomy markers
  are never once stationary, so a cursor hovering one is
  chasing a target that is still moving. It is scroll-linked
  now: no scroll, no work, no movement.

The specialty strip under the hero is the only continuous
animation left, and it is gated on the hero being in frame for
the same reason. Measured: over the hero the loop runs; parked
in the treatments section it costs one frame in two and a half
seconds.

Nothing bounces, nothing spins, nothing arrives from a
direction chosen at random, and no element travels further than
about 24px on entry. The hero headline is masked per line and
rises rather than fading, which is the one entrance that is
meant to be noticed.

## Accessibility

- `prefers-reduced-motion` is honoured, and honoured as *less
  motion* rather than no site: travel and parallax go, the
  interactive pieces keep working, and everything that was
  going to arrive is simply already there. Booking also stops
  auto-advancing, because the advance is only kind if the
  transition shows you it happened.
- Text colour is measured, not chosen by eye, and measured
  against the **darkest** ground each token ever sits on rather
  than the lightest — measuring against the lightest is how
  label text ends up at 4.1:1 on half a page while the token
  comment claims it passes. Every piece of text on the page
  clears its AA threshold — 4.5:1, or 3:1 where the type is
  large — and nothing tracked-and-uppercase is set below 12px.
- The accent has two values. `--aqua` is for marks, rules and
  the large display italic, which only need 3:1; anything that
  is *words* at label size uses `--aqua-ink`, the same hue two
  steps darker. Splitting them is the difference between an
  accent that looks right and an accent you can read.
- The before/after divider is a `role="slider"` with arrow,
  Home/End and PageUp/Down. The anatomy markers are buttons,
  Escape backs out. The drawer traps focus, locks the page
  behind it, and returns focus to the burger.
- The booking form never moves focus on load — the first
  `go(1)` happens as the page opens, and pulling focus into a
  form six screens down on arrival is the rudest thing a page
  can do.

## Degradation

An inline head script sets a `js` class before first paint, and
everything that would leave the page unusable if the scripts
never arrive is gated behind it. With scripting off: the
booking form degrades to its real fieldsets minus the generated
ones and minus the confirmation panel (a page that says
"That's in the book" to somebody who has not booked anything is
worse than no form at all), and the four script-built sections
carry `<noscript>` lists of the same names in plain markup.

## Files

```
index.html
assets/css/aurel.css       cascade layers: tokens → base → … → responsive
assets/js/core.js          the clock, the scroll store, the reveal registry
assets/js/media.js         every photograph, the loader, the plate
assets/js/data.js          treatments, regions, clinicians, reviews, hours
assets/js/nav.js           bar states, drawer, scrollspy, anchor jumps
assets/js/treatments.js    the index, the panel, the cursor peek
assets/js/anatomy.js       the four markers and the zoom
assets/js/compare.js       the before/after divider
assets/js/team.js          the clinician bands
assets/js/reviews.js       the drifting rail
assets/js/booking.js       the six steps
assets/js/clinic.js        the drawn map, and whether we are open
assets/js/main.js          entrances, counters, parallax, magnetic buttons
assets/img/README.md       what to photograph and where to put it
```

## Verified

Chromium at 1920 / 1440 / 834 / 390 / 360 / 320px wide, with no
horizontal overflow at any of them; with reduced motion; with
JavaScript disabled; and against a scripted pass over the whole
page checking every piece of text for contrast against the
ground it is actually painted on. The interaction suite covers
the six booking steps end to end, the divider by drag and by
keyboard, the treatments and profile panels, the anatomy zoom
and reset, the review controls, the map zoom, and the drawer's
focus handling. The blend compositing and the marker
calibration were checked against a throwaway white-on-white
fixture, which is not in the repository.
