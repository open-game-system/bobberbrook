import { describe, expect, it } from "vitest";
import { PK } from "./painter";
import { valance } from "./valance";

describe("valance (a scalloped cloth drape under an eave)", () => {
  const g = valance({ r: 3.7, top: 3.35, depth: 0.4, scallops: 12, repeats: 6 });
  const pos = g.getAttribute("position");
  const a = g.getAttribute("aPaint");

  it("is painted with the tent canvas by explicit texture coordinates", () => {
    for (let i = 0; i < a.count; i++) expect(a.getX(i)).toBe(PK.tent);
    let maxU = 0;
    for (let i = 0; i < a.count; i++) maxU = Math.max(maxU, a.getY(i));
    expect(maxU).toBeCloseTo(6, 5);
  });

  it("hangs from a straight top edge down to a scalloped hem", () => {
    let top = -Infinity;
    let low = Infinity;
    let high = -Infinity;
    const hem: number[] = [];
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    expect(top).toBeCloseTo(3.35, 5);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < top - 1e-4) hem.push(y);
    }
    for (const y of hem) {
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    expect(low).toBeCloseTo(3.35 - 0.4, 2);
    // The scallops lift the hem between the points by at least a third of the depth.
    expect(high - low).toBeGreaterThan(0.4 / 3);
  });

  it("stays round the eave at its radius", () => {
    for (let i = 0; i < pos.count; i++) {
      const rr = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(rr).toBeGreaterThan(3.6);
      expect(rr).toBeLessThan(3.85);
    }
  });
});
