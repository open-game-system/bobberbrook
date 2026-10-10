import { describe, expect, it } from "vitest";
import { TAG_GAP, layoutTags, type TagBox, type TagShift } from "./tagLayout";

const tag = (x: number, y: number, seat: number, hw = 0.05, h = 0.04): TagBox => ({ x, y, hw, h, seat });

function placed(boxes: TagBox[]): { x0: number; x1: number; y0: number; y1: number }[] {
  const out: TagShift[] = [];
  layoutTags(boxes, out);
  return boxes.map((b, i) => ({ x0: b.x + out[i]!.dx - b.hw, x1: b.x + out[i]!.dx + b.hw, y0: b.y + out[i]!.dy, y1: b.y + out[i]!.dy + b.h }));
}

function noOverlap(r: ReturnType<typeof placed>): void {
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i]!;
      const b = r[j]!;
      const sepX = Math.max(b.x0 - a.x1, a.x0 - b.x1);
      const sepY = Math.max(b.y0 - a.y1, a.y0 - b.y1);
      expect(Math.max(sepX, sepY)).toBeGreaterThan(TAG_GAP * 0.4);
    }
  }
}

describe("name tag layout", () => {
  it("leaves tags that do not collide where they are", () => {
    const out: TagShift[] = [];
    layoutTags([tag(-0.5, 0.2, 0), tag(0.3, 0.2, 1)], out);
    expect(out).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });

  it("separates two fishers standing on the same spot (the tower: Dad and Juneau)", () => {
    noOverlap(placed([tag(0.1, 0.3, 0), tag(0.1, 0.3, 2, 0.08)]));
  });

  // Round 14 (owner/critic: tower.png showed four tags stacked over one body): a huddle's tags stay in one row.
  // This replaces round 11's "staggers a huddle of four into two rows" (the two rows were the stack).
  it("keeps a huddle of four in one row, each tag near its owner", () => {
    const boxes = [tag(0, 0.3, 0), tag(0.02, 0.3, 1), tag(0.01, 0.31, 2, 0.08), tag(-0.01, 0.3, 3)];
    const out: TagShift[] = [];
    layoutTags(boxes, out);
    noOverlap(placed(boxes));
    expect(out.filter((s) => s.dy > 0).length).toBe(0);
    // One row of four: no tag is pushed more than about three tag widths out.
    for (const s of out) expect(Math.abs(s.dx)).toBeLessThan(0.3);
  });

  it("staggers only a crowd too wide for one row", () => {
    const boxes = Array.from({ length: 8 }, (_, i) => tag(i * 0.001, 0.3, i, 0.06));
    const out: TagShift[] = [];
    layoutTags(boxes, out);
    noOverlap(placed(boxes));
    expect(out.filter((s) => s.dy > 0).length).toBeGreaterThan(0);
  });

  it("keeps tags on screen at the edges", () => {
    const r = placed([tag(0.95, 0.3, 0), tag(0.96, 0.3, 1), tag(0.97, 0.3, 2)]);
    noOverlap(r);
    for (const b of r) {
      expect(b.x0).toBeGreaterThanOrEqual(-0.98 - 1e-9);
      expect(b.x1).toBeLessThanOrEqual(0.98 + 1e-9);
    }
  });

  it("is stable: the same input gives the same layout", () => {
    const boxes = [tag(0, 0.3, 3), tag(0, 0.3, 1)];
    const a: TagShift[] = [];
    const b: TagShift[] = [];
    layoutTags(boxes, a);
    layoutTags(boxes, b);
    expect(a).toEqual(b);
  });
});

describe("huddled tags keep their sides", () => {
  it("never swaps two huddled fishers' tags as they shuffle past each other", () => {
    for (const d of [-0.02, -0.005, 0.005, 0.02]) {
      const out: TagShift[] = [];
      // A family of four huddled to board: Dad (0) and Juneau (2) share the bottom row.
      layoutTags([
        { x: d, y: 0, hw: 0.06, h: 0.05, seat: 0 },
        { x: 0.01, y: 0, hw: 0.06, h: 0.05, seat: 1 },
        { x: -d, y: 0, hw: 0.06, h: 0.05, seat: 2 },
        { x: -0.01, y: 0, hw: 0.06, h: 0.05, seat: 3 },
      ], out);
      expect(d + out[0]!.dx).toBeLessThan(-d + out[2]!.dx);
    }
  });
});
