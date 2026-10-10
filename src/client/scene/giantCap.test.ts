import { describe, expect, it } from "vitest";
import { CylinderGeometry, SphereGeometry } from "three";
import { CAP_LAYER, capLayerOf, capUV, gillUV } from "./giantCap";

describe("giant mushroom cap texture coordinates", () => {
  it("maps the cap from above: the crown at the centre of the painted cap, the rim near its edge", () => {
    const capR = 4;
    const g = capUV(new SphereGeometry(capR, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1), capR, CAP_LAYER.violet);
    const a = g.getAttribute("aCap");
    const pos = g.getAttribute("position");
    let crown = -1;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > crown) crown = pos.getY(i);
    for (let i = 0; i < pos.count; i++) {
      const u = a.getX(i) - 0.5;
      const v = a.getY(i) - 0.5;
      const rho = Math.hypot(pos.getX(i), pos.getZ(i)) / capR;
      // Planar from above: the radius in the texture follows the radius on the cap, never tiling.
      expect(Math.hypot(u, v)).toBeCloseTo(rho * 0.48, 5);
      expect(Math.hypot(u, v)).toBeLessThanOrEqual(0.5);
      expect(a.getZ(i)).toBe(CAP_LAYER.violet);
      if (pos.getY(i) === crown) expect(Math.hypot(u, v)).toBeLessThan(0.01);
    }
  });

  it("lays the gills as a fan from the stem out to the cap's edge, inside the texture", () => {
    const g = gillUV(new CylinderGeometry(4, 0.8, 0.5, 22, 1, true), 0.8, 4);
    const a = g.getAttribute("aCap");
    const pos = g.getAttribute("position");
    let inner = 0;
    let outer = 0;
    for (let i = 0; i < pos.count; i++) {
      const u = a.getX(i);
      const v = a.getY(i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(a.getZ(i)).toBe(CAP_LAYER.gills);
      const d = Math.hypot(u - 0.5, v - 0.98);
      if (Math.hypot(pos.getX(i), pos.getZ(i)) < 1) inner = Math.max(inner, d);
      else outer = Math.max(outer, d);
    }
    // The fan's origin (bottom centre of the painting) is at the stem; the arc at the rim.
    expect(inner).toBeLessThan(0.25);
    expect(outer).toBeGreaterThan(0.75);
  });

  it("picks the teal painting for blue-green caps and the violet one for violet caps", () => {
    expect(capLayerOf(0.5)).toBe(CAP_LAYER.teal);
    expect(capLayerOf(0.48)).toBe(CAP_LAYER.teal);
    expect(capLayerOf(0.75)).toBe(CAP_LAYER.violet);
    expect(capLayerOf(0.76)).toBe(CAP_LAYER.violet);
  });
});
