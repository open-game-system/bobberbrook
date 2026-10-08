"""Slices the Codex fish sprite sheets (assets-src/fish/sheet-*.png) into one trimmed WebP per fish.
Finds each sprite as a connected blob of alpha (fins and whiskers joined by a small dilation), then reads
the blobs in rows, top to bottom, left to right."""
from PIL import Image
import numpy as np
from scipy import ndimage
import os

SHEETS = [
    ("assets-src/fish/sheet-a.png", 4, ["brook-trout", "perch", "bluegill", "catfish", "minnow", "golden-koi",
                                       "lily-carp", "pike", "rainbow-trout", "salmon", "crystal-char", "bass"]),
    ("assets-src/fish/sheet-b.png", 3, ["sturgeon", "glowfin", "lanternfish", "moonfin", "ember-shiner", "puffer",
                                       "boot", "teapot", "chest"]),
]
OUT = "public/art/fish"
os.makedirs(OUT, exist_ok=True)
for path, cols, ids in SHEETS:
    im = Image.open(path).convert("RGBA")
    alpha = np.array(im.getchannel("A")) > 24
    joined = ndimage.binary_dilation(alpha, iterations=6)
    labels, n = ndimage.label(joined)
    sizes = ndimage.sum(joined, labels, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 4000]
    boxes = ndimage.find_objects(labels)
    blobs = []
    for lab in keep:
        sl = boxes[lab - 1]
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        blobs.append((cy, cx, lab, sl))
    assert len(blobs) == len(ids), f"{path}: found {len(blobs)} sprites, expected {len(ids)}"
    blobs.sort(key=lambda b: b[0])
    rows = [sorted(blobs[i:i + cols], key=lambda b: b[1]) for i in range(0, len(blobs), cols)]
    ordered = [b for row in rows for b in row]
    arr = np.array(im)
    for fid, (_, _, lab, sl) in zip(ids, ordered):
        mask = (labels[sl] == lab)
        piece = arr[sl].copy()
        piece[..., 3] = np.where(mask, piece[..., 3], 0)
        out = Image.fromarray(piece)
        out = out.crop(out.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox())
        out.thumbnail((480, 480))
        out.save(f"{OUT}/{fid}.webp", "WEBP", quality=88)
        print(fid, out.size)
