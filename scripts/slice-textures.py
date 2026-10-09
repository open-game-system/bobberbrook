"""Cuts the painted texture sheet (3x3, black gutters) into game textures: tiling swatches made
seamless by cross-fading each with its half-offset copy, leaf cards keyed off black into alpha.
Usage: python3 scripts/slice-textures.py assets-src/textures/atlas-a.png public/art/textures"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(float)
dark = a.mean(axis=2) < 14

def runs(mask):
    """Spans between gutters (lines that are >90% black)."""
    spans, start = [], None
    for i, g in enumerate(mask):
        if not g and start is None:
            start = i
        if g and start is not None:
            spans.append((start, i)); start = None
    if start is not None:
        spans.append((start, len(mask)))
    return [s for s in spans if s[1] - s[0] > 100]

cols = runs(dark.mean(axis=0) > 0.9)
rows = runs(dark.mean(axis=1) > 0.9)
assert len(cols) == 3 and len(rows) == 3, (cols, rows)
NAMES = ["grass", "moss", "path", "bark", "rock", "stone-tiles", "leaves-violet", "leaves-fern", "lakebed"]
CARDS = {"leaves-violet", "leaves-fern"}
SIZE = 512

def seamless(img):
    x = np.asarray(img).astype(float)
    h, w, _ = x.shape
    rolled = np.roll(np.roll(x, h // 2, axis=0), w // 2, axis=1)
    yy = 1 - np.abs(np.linspace(-1, 1, h))[:, None]
    xx = 1 - np.abs(np.linspace(-1, 1, w))[None, :]
    wgt = np.clip(np.minimum(yy, xx) * 3.0, 0, 1)[..., None]
    return Image.fromarray((x * wgt + rolled * (1 - wgt)).astype(np.uint8))

for k, name in enumerate(NAMES):
    (y0, y1), (x0, x1) = rows[k // 3], cols[k % 3]
    tile = im.crop((x0 + 4, y0 + 4, x1 - 4, y1 - 4)).resize((SIZE, SIZE), Image.LANCZOS)
    if name in CARDS:
        rgb = np.asarray(tile).astype(float)
        lum = rgb.max(axis=2)
        alpha = np.clip((lum - 18) / 40, 0, 1)
        alpha_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        tile = tile.convert("RGBA"); tile.putalpha(alpha_img)
        tile.save(f"{out}/{name}.webp", quality=88)
    else:
        seamless(tile).save(f"{out}/{name}.webp", quality=86)
    print(name)
