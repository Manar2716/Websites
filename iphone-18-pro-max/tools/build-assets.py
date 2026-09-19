#!/usr/bin/env python3
"""
build-assets.py — cut the product photography used by the deck.

Run from the project root with the two source photographs in ./tools/src/:

    python3 tools/build-assets.py

Two sources, used for different things, and the split is deliberate:

  1.png  Burgundy iPhone, front and back, on black.
         ONLY THE FRONT FACE IS USED. Its back shows a square camera
         island with the lenses in a triangle — iPhone 15/16 Pro
         geometry — which is not the full-width plateau the 18 Pro Max
         has. Using it for anything camera-related would put the wrong
         camera system on screen in a deck about the camera. The front
         face shows no camera module, so it is design-accurate and it is
         the sharpest asset available.

  2.png  Three finishes, backs and side profiles, with the correct
         full-width plateau. Low resolution (482x312 for all three), so
         everything cut from it is capped in how large it may be drawn.
         Every use of it in the deck is sized against `native`, printed
         below, and never blown far past it.

The backdrop is removed by flooding inward from the frame edge and
comparing each pixel to the NEIGHBOUR it was reached from rather than to
one fixed reference colour. A smooth panel gradient stays under the
per-step threshold the whole way across; the phone's edge is a hard jump
and stops the fill. A single reference colour cannot do both — it either
leaves the gradient behind or eats into a phone whose body is nearly the
same hue as the panel, which is the case for all three of these.
"""
from PIL import Image, ImageFilter
import numpy as np
from collections import deque
import os, json

SRC = os.path.join(os.path.dirname(__file__), 'src')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'img')
os.makedirs(OUT, exist_ok=True)

def key_grad(im, step_tol=16, feather=1.0):
    rgb = np.asarray(im.convert('RGB')).astype(int)
    h, w, _ = rgb.shape
    bg = np.zeros((h, w), bool); seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y, x]: seen[y, x] = bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y, x]: seen[y, x] = bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                if np.abs(rgb[ny, nx] - rgb[y, x]).sum() <= step_tol:
                    seen[ny, nx] = bg[ny, nx] = True; q.append((ny, nx))
    a = Image.fromarray(((~bg) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(feather))
    out = im.convert('RGBA'); out.putalpha(a)
    return out

def trim(im):
    return im.crop(im.getbbox())

def split_columns(im, gap_frac=0.04):
    """Split a keyed panel into its separate objects (back, side profile)
    by finding the empty alpha columns between them."""
    a = np.asarray(im.split()[-1]).astype(int)
    colsum = a.sum(0)
    filled = colsum > colsum.max() * 0.02
    runs, start = [], None
    for i, f in enumerate(filled):
        if f and start is None: start = i
        elif not f and start is not None:
            if i - start > im.width * gap_frac: runs.append((start, i))
            start = None
    if start is not None: runs.append((start, im.width))
    return [trim(im.crop((s, 0, e, im.height))) for s, e in runs]

manifest = {}
def save(im, name, scale=1):
    if scale != 1:
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    p = os.path.join(OUT, name + '.png')
    im.save(p, optimize=True)
    manifest[name] = {'w': im.width, 'h': im.height, 'native': [im.width // scale, im.height // scale]}
    print(f'{name:18s} {im.width}x{im.height}  (native {im.width//scale}x{im.height//scale})')

def key_luma(im, knee=34.0, gamma=0.75):
    """Turn a subject-on-black photograph into a cut-out by its own
    brightness: dark pixels become transparent, lit ones stay.

    This is the right tool where flood filling is not. The source
    backdrop is pure black and so is the phone's bezel, so a fill seeded
    at the border has no edge to stop at and walks into the screen.
    Brightness has no such problem — and the pixels it does make
    partially transparent are the near-black ones, which are sitting on
    a near-black deck anyway, so the blend is invisible.

    Without this the crop is an opaque black rectangle: darker than the
    lit ground behind it, so it reads as a box around the product, and
    drop-shadow traces that box instead of the phone."""
    im = im.convert('RGBA')
    rgb = np.asarray(im.convert('RGB')).astype(float)
    lum = rgb.max(2)
    a = np.clip(lum / knee, 0, 1) ** gamma
    im.putalpha(Image.fromarray((a * 255).astype('uint8')))
    return im

# ── the front face, from 1.png ─────────────────────────────────────────
im1 = Image.open(os.path.join(SRC, '1.png')).convert('RGB')
# A plain rectangular window around the front-facing device. This one is
# deliberately NOT keyed: the source backdrop is already pure black and
# so is the phone's bezel, so a flood fill has no hard edge to stop at
# and walks straight through the frame into the wallpaper, leaving an
# outline where the phone used to be. On a black ground the rectangle
# composites invisibly anyway; only its cut edges need softening.
# x0=288 clears the overlapping back-facing device without biting into
# the front phone's left bezel.
save(key_luma(im1.crop((288, 112, 502, 775))), 'front', 2)

# ── backs and side profiles, from 2.png ────────────────────────────────
im2 = Image.open(os.path.join(SRC, '2.png')).convert('RGB')
for name, (x0, x1) in {'blue': (0, 158), 'burgundy': (158, 320), 'black': (320, 482)}.items():
    parts = split_columns(key_grad(im2.crop((x0, 0, x1, 312))))
    parts.sort(key=lambda p: -p.width)          # back is the wider object
    save(parts[0], f'back-{name}', 3)
    if len(parts) > 1:
        save(parts[1], f'side-{name}', 3)

# ── the camera plateau, cut from the burgundy back ─────────────────────
b = Image.open(os.path.join(OUT, 'back-burgundy.png'))
plateau = b.crop((0, 0, b.width, int(b.height * 0.38)))
# fade the cut along the bottom only — the other three sides are the
# device's own silhouette and are already keyed
pa = np.asarray(plateau.split()[-1]).astype(float)
ph = pa.shape[0]
fade = np.clip((ph - 1 - np.arange(ph)) / 26, 0, 1)
plateau.putalpha(Image.fromarray((pa * fade[:, None]).astype('uint8')))
save(plateau, 'plateau', 1)

with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=1)
print('\nwrote manifest.json')
