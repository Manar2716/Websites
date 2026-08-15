# Photographs go here

Every picture slot on the site is a drawing **until a photograph takes
it**. Drop files in this folder and name them in `src/data/content.js` —
no component changes, no flags, no second layout.

```js
// src/data/content.js
{
  name: 'Lamb Doner',
  desc: '…',
  art:  'doner',                 // the drawing — the fallback
  photo: photo('lamb-doner.jpg'), // ← the real picture wins
}
```

`photo()` is exported at the top of `content.js` and just prefixes
`./photos/`. Set `photo: null` (or delete the line) to fall back to the
drawing again.

## What each slot wants

| where | field | crop it is composed for |
| --- | --- | --- |
| hero background | not yet wired — ask, it is a two-line change | very wide **and** very tall; the same file is cropped 16:9 on a laptop and 9:19 on a phone |
| about | `about.photo` | portrait, 4:5 |
| the hours rail | `hours.steps[].photo` | portrait, roughly 3:4 |
| menu items | `menu.categories[].items[].photo` | 4:3, and 16:11 for the first item in each category (it prints double size) |
| feature band | `featured.photo` | very wide, 21:9 — and **leave the left third quiet**, the headline sits over it |
| gallery | `gallery.shots[].photo` | mixed: `wide` 16:10, `tall` 4:5, `std` 1:1 |

Everything is drawn with `object-fit: cover`, so an off-ratio file will
still fill its frame — it will just crop from the centre.

## Practical notes

- **Format**: `.webp` or `.avif` beats `.jpg` by roughly half the bytes at
  the same quality. Any of the three work.
- **Size**: 2000px on the long edge is plenty; the largest frame on the
  page is about 1400px wide on a 4K panel.
- **They are lazy-loaded** except the hero, so a heavy gallery costs
  nothing until somebody scrolls to it.
- **Alt text** comes from the item name or the gallery caption
  automatically. The "— drawn illustration" suffix disappears by itself
  once a real photo is in the slot.
- **Rights**: only put files here that the business owns or has licence
  to use. The whole reason this project draws its own images is to avoid
  shipping pictures of a room nobody photographed.

## Colour

The drawings are lit warm from the upper left against near-black, and the
page is built around that. Photographs shot bright and flat will read as
holes punched in the page. If they are all you have, a small warm grade
and a slight exposure pull will settle them in — or say the word and the
palette can move toward the photographs instead.
