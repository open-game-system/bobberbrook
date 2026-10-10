import { describe, expect, it } from "vitest";
import { cleanCardPixels } from "./cards";

/** A w x h straight-alpha image, top row first, from a per-texel function. */
function img(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4);
  return d;
}
const at = (d: Uint8Array, w: number, x: number, y: number) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

describe("cleanCardPixels", () => {
  it("keeps opaque texels and alpha, and flips the rows bottom-up", () => {
    const w = 8;
    const h = 8;
    const src = img(w, h, (_x, y) => (y === 0 ? [200, 100, 50, 255] : [10, 10, 10, 0]));
    const out = cleanCardPixels(src, w, h);
    // The image's top row is the texture's last row.
    expect(at(out, w, 3, h - 1)).toEqual([200, 100, 50, 255]);
    expect(at(out, w, 3, 0)[3]).toBe(0);
  });

  it("gives a black-keyed fringe the colour of the opaque texels beside it, not the dark key", () => {
    const w = 16;
    const h = 1;
    // Opaque green on the left, a dark half-transparent fringe, then empty.
    const src = img(w, h, (x) => (x < 6 ? [40, 200, 80, 255] : x < 8 ? [12, 60, 24, 128] : [0, 0, 0, 0]));
    const out = cleanCardPixels(src, w, h);
    const fringe = at(out, w, 6, 0);
    expect(fringe[3]).toBe(128);
    expect(fringe[1]).toBeGreaterThan(190);
    expect(fringe[0]).toBeLessThan(50);
    // Far out in the empty part: still the card's colour (mipmaps average it in), never black.
    expect(at(out, w, 15, 0)[1]).toBeGreaterThan(150);
  });
});
