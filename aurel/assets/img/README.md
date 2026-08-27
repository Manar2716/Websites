# assets/img — the photography

Nothing in this folder is committed. Every photographic slot on
the site renders a **plate** — a contact-sheet card naming the
slot, the subject to shoot and the crop it needs — until a file
with the matching name appears here.

## Adding a photograph

Drop the file in. That is the whole procedure; there is no
manifest to edit and no build step.

```
aurel/assets/img/tooth-specimen.png
```

The loader (`assets/js/media.js`) probes `.avif`, `.webp`,
`.png`, `.jpg`, `.jpeg` in that order and takes the first that
decodes, so any of those extensions works. Once one slot
resolves, every later slot tries that same extension first — a
folder of `.webp` costs one request per slot rather than three.
Nothing is probed until it is within two screens of the
viewport.

## The slots

| file name | what it is | crop |
|---|---|---|
| `tooth-specimen` | **the important one.** Molar render, three-quarter view, white object on white ground | square-ish, 1600px min |
| `tooth-specimen-wide` | the same molar framed wide, room above and below | 16:9, 1600px min |
| `studio-interior` | a surgery — chair, window light, no people | 3:4 portrait, 1600px min |
| `clinic-facade` | the entrance at dusk, signage legible | 4:3, 2000px min |
| `case-before` | case 041 before treatment | 4:3 |
| `case-after` | case 041 after — **same camera, same light, same crop** | 4:3 |
| `dr-haddad` `dr-rahman` `dr-albakri` `dr-okonkwo` | clinician portraits, natural light | 4:5, 1200px min |
| `tx-general` `tx-cosmetic` `tx-whitening` `tx-veneers` `tx-implants` `tx-ortho` `tx-invisalign` `tx-preventive` | one per treatment, shown in the panel that opens under the index row | 4:3, 1600px min |

`tooth-specimen` carries the hero and the anatomy study, so it
is the one photograph that changes how the page reads. Add it
first.

## Leave the white background in

Do **not** cut the specimen out, and do not save it with
transparency. The white ground is load-bearing: the specimen
slots composite with `mix-blend-mode: multiply` against a pool
of light painted underneath them, and white multiplied into
that ground disappears completely while every grey in the
shading survives at full strength. The result is an object
sitting in the page with no visible image box, from a file that
still has its background.

Two consequences worth knowing:

- **Both specimen sections are on light grounds, and have to
  stay that way.** Multiply against the navy sections would
  sink the whole object to black.
- **The ground colour is declared per section** with
  `--specimen-ground` (see `.media--specimen` in the
  stylesheet). If a specimen is ever moved onto a different
  ground, set that variable to the new one or a faint rectangle
  will appear around it.

## Re-calibrating the anatomy markers

The four markers in the anatomy study are positioned as
percentages of the specimen image, in one table at the top of
`assets/js/data.js`:

```js
{ id: 'cervical', label: 'Cervical margin', x: 65, y: 47, z: 2.4, … }
```

`x` and `y` are the centre of the region as a percentage of the
image box; `z` is how far to zoom when it is opened. They are
set for a molar photographed upright and centred, with the
crown occupying roughly the top 45% and the roots the bottom
half. A different framing needs them nudged — open the page,
move a number, reload, repeat. It takes about a minute for all
four.

## Before and after

`case-before` and `case-after` must be the same patient,
photographed at the same crop, distance and colour temperature.
The comparison clips rather than resizes precisely so that
neither photograph is distorted relative to the other, and the
caption under it says the photographs are unretouched. If that
is not true of the pair you add, change the caption in
`index.html` — do not leave a claim on the page that the
photographs do not support.

## Sizes

Export at roughly twice the largest box the slot is drawn in
and compress properly. The hero specimen is the only image on
the page that is not lazy-loaded, so it is the one worth being
strict with: keep it under about 250KB.
