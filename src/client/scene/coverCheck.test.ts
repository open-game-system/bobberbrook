import { describe, expect, it } from "vitest";
import { Vector4 } from "three";
import { coveredIn } from "./coverCheck";

const W = 10;
const H = 10;
const keyed = () => {
  const a = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) a.set([255, 0, 255, 255], i * 4);
  return a;
};
const paint = (a: Uint8Array, x: number, y: number) => a.set([90, 60, 40, 255], (y * W + x) * 4);

describe("cover check: fisher pixels the scenery took", () => {
  it("counts fisher pixels inside a box that the scenery pass lost", () => {
    const all = keyed();
    const seen = keyed();
    for (let y = 2; y < 6; y++) for (let x = 2; x < 4; x++) { paint(all, x, y); paint(seen, x, y); }
    // A post across the fisher's middle row.
    seen.set([255, 0, 255, 255], (3 * W + 2) * 4);
    seen.set([255, 0, 255, 255], (3 * W + 3) * 4);
    const r = coveredIn(all, seen, W, H, [new Vector4(0.15, 0.15, 0.45, 0.65), new Vector4(1, 1, 0, 0)]);
    expect(r.boxes).toHaveLength(1);
    expect(r.boxes[0]!.px).toBe(8);
    expect(r.boxes[0]!.covered).toBe(2);
    expect(r.worst).toBeCloseTo(0.25);
  });

  it("ignores fisher pixels outside every box (a bobber in the reeds) and empty boxes", () => {
    const all = keyed();
    const seen = keyed();
    paint(all, 9, 9);
    const r = coveredIn(all, seen, W, H, [new Vector4(0, 0, 0.3, 0.3)]);
    expect(r.worst).toBe(0);
  });
});
