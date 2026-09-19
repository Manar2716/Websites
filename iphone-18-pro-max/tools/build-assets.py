#!/usr/bin/env python3
"""
build-assets.py — cut the product photography used by the deck.

Run from the project root, with the sources in ./tools/src/:

    python3 tools/build-assets.py

Sources are three captures of Apple's iPhone 18 Pro pages:

  3.png  the comparison module and, below it, a large macro of the
         camera system in Burgundy
  4.png  "Our finest unibody of work" — the device front, three-quarter
  5.png  "Four gorgeous colors" — all four finishes, three-quarter rear

Four views come out of them, and the deck uses those four for the whole
run: one device, one finish, so it reads as a continuous look at a
single object rather than a slideshow of different ones.

TWO EARLIER SOURCES WERE DROPPED. A render supplied first showed a
square camera island with the lenses in a triangle — iPhone 15/16 Pro
geometry, not this generation's full-width plateau. Its front face was
used for a while on the grounds that a front carries no camera module
and so could not be wrong; that was too generous. It was a render of a
different design throughout, and now that genuine 18 Pro photography is
available there is no reason to keep any part of it.

BACKGROUND REMOVAL IS PER-ASSET, AND NOT EVERY ASSET GETS IT.
All four crops sit on black, so the burgundy views are keyed on their
own brightness: dark pixels become transparent, lit ones stay, and the
near-black pixels it softens are sitting on a near-black deck anyway.
Left opaque, a crop is darker than the lit ground behind it and reads as
a box around the product, with drop-shadow tracing the box rather than
the phone.

The four-finish shot is keyed on a much lower knee than the rest. Its
Black device and the source's backdrop overlap in brightness when
measured across the whole image, but inside the crop the backdrop tops
out around 5 while the black phone's body runs from about 14 up, so a
low threshold does separate them. Publishing that view opaque instead —
an earlier pass did — leaves a rectangle visibly darker than the deck's
own ground, which carries a grain overlay and never reaches zero.
"""
from PIL import Image, ImageFilter
import numpy as np
import os, json

SRC = os.path.join(os.path.dirname(__file__), 'src')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'img')
os.makedirs(OUT, exist_ok=True)

def key_luma(im, knee=22.0, gamma=0.8):
    """Cut a subject off black by its own brightness."""
    im = im.convert('RGBA')
    lum = np.asarray(im.convert('RGB')).astype(float).max(2)
    a = np.clip(lum / knee, 0, 1) ** gamma
    im.putalpha(Image.fromarray((a * 255).astype('uint8')))
    return im

def soft_edges(im, pad=10, sides='ltrb'):
    """Fade chosen cut edges to transparent. Used where a crop runs off
    the side of its source and the cut is not the device's own outline."""
    im = im.convert('RGBA')
    a = np.asarray(im.split()[-1]).astype(float)
    h, w = a.shape
    if 'l' in sides or 'r' in sides:
        rx = np.ones(w)
        if 'l' in sides: rx = np.minimum(rx, np.clip(np.arange(w) / pad, 0, 1))
        if 'r' in sides: rx = np.minimum(rx, np.clip((w - 1 - np.arange(w)) / pad, 0, 1))
        a *= rx[None, :]
    if 't' in sides or 'b' in sides:
        ry = np.ones(h)
        if 't' in sides: ry = np.minimum(ry, np.clip(np.arange(h) / pad, 0, 1))
        if 'b' in sides: ry = np.minimum(ry, np.clip((h - 1 - np.arange(h)) / pad, 0, 1))
        a *= ry[:, None]
    im.putalpha(Image.fromarray(a.astype('uint8')))
    return im

manifest = {}
def save(im, name, scale=1):
    if scale != 1:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.png'), optimize=True)
    manifest[name] = {'w': im.width, 'h': im.height,
                      'native': [im.width // scale, im.height // scale]}
    print(f'{name:12s} {im.width}x{im.height}  (native {im.width//scale}x{im.height//scale})')

# ── front, three-quarter, from 4.png ───────────────────────────────────
im4 = Image.open(os.path.join(SRC, '4.png')).convert('RGB')
save(key_luma(im4.crop((863, 410, 1092, 908)), knee=20), 'front', 2)

# ── rear, three-quarter, from the Burgundy device in 5.png ─────────────
# x0=820 clears the Glacier device standing behind it
im5 = Image.open(os.path.join(SRC, '5.png')).convert('RGB')
back = key_luma(im5.crop((820, 140, 1000, 612)), knee=20)
save(soft_edges(back, pad=14, sides='b'), 'back', 2)   # bottom runs off the source

# ── the camera system, from the macro in 3.png ─────────────────────────
im3 = Image.open(os.path.join(SRC, '3.png')).convert('RGB')
cam = key_luma(im3.crop((232, 352, 981, 846)), knee=26)
save(soft_edges(cam, pad=16, sides='b'), 'camera', 1)

# ── all four finishes, from 5.png ──────────────────────────────────────
# Cropped wider than the devices so there is black margin to dissolve
# into — feathering straight at their edges would clip the outer two.
# The top edge sits below the source's own caption line; taking in more
# than that brings Apple's page copy along with the photograph.
#
# This one is keyed too, but on a much lower knee than the others. The
# Black device's body sits around 14 and up while this crop's backdrop
# tops out near 5, so a low threshold separates them; a knee set for the
# burgundy views (22) would have taken the black phone with it. Measured
# on the whole source rather than the crop the two overlap, which is why
# an earlier pass published this view opaque — and an opaque black
# rectangle is visibly darker than the deck's own ground, which carries
# a grain overlay and never reaches zero.
fin = key_luma(im5.crop((175, 152, 1020, 612)), knee=11, gamma=0.9)
fin = soft_edges(fin, pad=40, sides='lrt')
save(soft_edges(fin, pad=88, sides='b'), 'finishes', 1)

with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
print('\nwrote manifest.json')
