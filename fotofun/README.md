# Foto Fun Color Lab

The website for Foto Fun Color Lab (L.L.C.), a photography and printing shop
at The Meadows Souk, Ground Floor, Dubai.

Open `index.html` in a browser. There is no build step and nothing to install.

```bash
python3 -m http.server 8000   # then visit localhost:8000/fotofun/
```

## Files

```
index.html               the whole page: semantic HTML, SEO and Open Graph tags, JSON-LD
assets/css/site.css      tokens → base → layout → components → sections → motion → responsive
assets/js/site.js        header state, mobile menu, reveals, "open now", mobile call bar
assets/fonts/            self-hosted Schibsted Grotesk, Inter, IBM Plex Mono (SIL OFL)
assets/img/              favicon, touch icon, social preview image (og-image.jpg)
```

The page works without JavaScript: every section is present in the HTML and
all the motion is switched on by a `js` class. `prefers-reduced-motion` is
respected.

## Design

- **One accent.** Warm off-white paper, near-black ink, and a single
  orange-red taken from a darkroom safelight. The red appears only in small
  marks: the logo dot, the section numbers, focus rings.
- **Photographs as prints.** In the hero and on the printing card, photos are
  shown as physical prints with white borders and soft shadows. When the page
  loads, the hero prints "develop": colour rises out of a pale image.
- **Film details, used sparingly.** Small mono labels, like the edge print on
  a film strip, and a faint row of sprocket holes on the contact panel.
- **Typography.** Schibsted Grotesk for headings, Inter for reading, IBM Plex
  Mono for labels.

## Content rules

The copy only uses details that are published about the shop. There are
**no** prices, testimonials, reviews, statistics, awards, staff names, or
founding dates. Anything added later should follow the same rule.

Where each detail comes from:

| Detail on the site | Source |
| --- | --- |
| Name, Ground Floor location, phone, email, category | [Emaar Malls store listing](https://www.emaarmalls.ae/malls-shop-details/the-meadows-souk/foto-fun-color-lab-llc/) |
| Daily 10 AM – 10 PM, family portraits, card and cash, parking | [2GIS listing](https://2gis.ae/dubai/firm/70000001018409617) |
| Passport and visa photos taken in store | Customer reviews of the Meadows branch ([Nicelocal](https://nicelocal.ae/dubai/utility_service/fotofun_color_lab_meadows_souk/)) and directory listings ([HaiUAE](https://www.haiuae.com/company/fotofun-color-lab-vocational-services-art-photography-services-passport-size-photos-photo-center-photographs-photo-printing-framed-photos)) |
| Framed photos, albums, cameras, personalised items | [Dubai Shopping Guide](https://www.dubaishoppingguide.com/item/fotofun-color-lab-kodak-express/), HaiUAE |
| Canvas, mosaic and collage canvases, photobooks, photo tiles ("Also from Fotofun") | Fotofun's own shop, [planetfotofun.com](https://www.planetfotofun.com/shop) |
| Corner of Meadows Drive and Springs Drive | [Property Finder guide to The Meadows Souk](https://www.propertyfinder.ae/blog/the-meadows-souk/) |
| Instagram and Facebook links | [@fotofundubai](https://www.instagram.com/fotofundubai/), [facebook.com/fotofundubai](https://www.facebook.com/fotofundubai/) |

**To confirm with the owner:** that the Meadows shop and the wider Fotofun
brand (planetfotofun.com, @fotofundubai) are the same business; which
"Also from Fotofun" products the Meadows branch actually offers; and that
card payments and parking are still accurate.

The "Open now" status is worked out from the regular hours (daily 10:00 to
22:00, Dubai time). If the shop starts keeping different hours, update
`OPEN`/`CLOSE` in `assets/js/site.js`, plus the hours text in `index.html`
and the JSON-LD block.

## Replacing the photographs

The photos currently on the site are **illustrative stock photography from
Unsplash**, loaded from Unsplash's image CDN. They are not Foto Fun's work,
and the page says so (a credit under the gallery and in the footer). They
should be replaced with the shop's own photos as soon as those exist.

To replace one:

1. Put the new image in `assets/img/photos/`, e.g. `assets/img/photos/gallery-family.jpg`.
   Export it about 2000px on the long side, as JPEG or WebP, at roughly 75–80% quality.
2. In `index.html`, find the `<img>` (search for its `alt` text from the table
   below) and replace the whole tag with:
   ```html
   <img src="assets/img/photos/gallery-family.jpg" width="2000" height="1333"
        alt="Describe what is in the photo" loading="lazy" decoding="async">
   ```
   Set `width`/`height` to the file's real pixel size, which stops the layout
   jumping while it loads. Keep `loading="lazy"` for everything except the
   three hero prints.
3. Once no Unsplash photos are left, remove the two "Unsplash" credits (under
   the gallery and in the footer) and the `preconnect` to `images.unsplash.com`
   in the `<head>`.

The Passport & Visa Photos card is drawn in CSS (a sheet of ID-photo
silhouettes), so it needs no photograph.

Every image slot crops with `object-fit: cover`, so any orientation works.
Keep the subject near the centre.

| Where | Current alt text | Unsplash photo | Photographer |
| --- | --- | --- | --- |
| Hero, large print | *(decorative)* | [7T0JileziTE](https://unsplash.com/photos/7T0JileziTE) | Boba Jovanovic |
| Hero, small print | *(decorative)* | [sd-34z9t13g](https://unsplash.com/photos/sd-34z9t13g) | David Law |
| Hero, wide print | *(decorative)* | [9gz3wfHr65U](https://unsplash.com/photos/9gz3wfHr65U) | Krista Mangulsone |
| Services · Studio Photography | A woman holding an instant camera… | [fLPDz_sPY2U](https://unsplash.com/photos/fLPDz_sPY2U) | Diego Vedita |
| Services · Printing (3 prints) | *(decorative)* | [JLkhiWpBSSs](https://unsplash.com/photos/JLkhiWpBSSs), [R5rVLQZ8hG8](https://unsplash.com/photos/R5rVLQZ8hG8), [HwZQGB-ZjG4](https://unsplash.com/photos/HwZQGB-ZjG4) | David Straight, Jason Mavrommatis, Daiga Ellaby |
| Services · Canvas, Framing & Gifts | Wooden picture frames on a wall | [19IdBsV5ofg](https://unsplash.com/photos/19IdBsV5ofg) | Steve Long |
| Gallery 01 · Childhood | A child holding a candle lantern | [HwZQGB-ZjG4](https://unsplash.com/photos/HwZQGB-ZjG4) | Daiga Ellaby |
| Gallery 02 · Pets | A black-and-white portrait of a dog | [3nQhyFuwUkk](https://unsplash.com/photos/3nQhyFuwUkk) | Fabian Gieske |
| Gallery 03 · Desert days | A desert safari in Dubai at sunset | [WaUcTYPfiCU](https://unsplash.com/photos/WaUcTYPfiCU) | K T |
| Gallery 04 · Seaside | A child in a pink dress… | [-fiPzmOG8sU](https://unsplash.com/photos/-fiPzmOG8sU) | Noah Silliman |
| Gallery 05 · Dubai | The Burj Al Arab in Dubai | [jomuw0-3F8A](https://unsplash.com/photos/jomuw0-3F8A) | Roman Logov |
| Gallery 06 · Family | A family standing together on a beach | [d8IPvipdj1Y](https://unsplash.com/photos/d8IPvipdj1Y) | Anneliese Phillips |
| About, main | Cameras and lenses laid out… | [2mZncc1MQX4](https://unsplash.com/photos/2mZncc1MQX4) | Micah & Sammie Chaffin |
| About, small print | *(decorative)* | [XnYWqFjsohw](https://unsplash.com/photos/XnYWqFjsohw) | insung yoon |

Each Unsplash `<img>` also has a tiny blurred preview as its inline
`background-image`, so slow connections see colour instead of an empty box.
Local photos don't need one, so leave the `style` attribute off.

## Before going live on a custom domain

The canonical URL, Open Graph URLs and JSON-LD currently point at the GitHub
Pages address, `https://manar2716.github.io/Websites/fotofun/`. Search
`index.html` for that address and replace it with the real domain.

## Map and directions

"Get Directions" and the embedded map search Google Maps for
*Foto Fun Color Lab, The Meadows Souk, Dubai*. If the shop has a Google
Business Profile, swap in its exact place link so directions land on the pin.
