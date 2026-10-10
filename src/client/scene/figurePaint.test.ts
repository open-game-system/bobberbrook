import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { bakeFigure, figureShade } from "./figurePaint";

const HEAD = { c: new Vector3(0, 0.8, 0), r: 0.25 };

describe("figureShade (baked occlusion and painted top light on a fisher)", () => {
  it("darkens a surface that faces a nearby part (under the chin)", () => {
    const open = figureShade(new Vector3(0.3, 0.55, 0), new Vector3(1, 0, 0), [HEAD]);
    const underChin = figureShade(new Vector3(0, 0.5, 0), new Vector3(0, 1, 0), [HEAD]);
    expect(underChin).toBeLessThan(open * 0.8);
  });

  it("does not darken a surface facing away from the part", () => {
    const away = figureShade(new Vector3(0, 0.5, 0), new Vector3(0, -1, 0), [HEAD]);
    const none = figureShade(new Vector3(0, 0.5, 0), new Vector3(0, -1, 0), []);
    expect(away).toBeCloseTo(none, 6);
  });

  it("ignores a part the point is inside (its own shape)", () => {
    const inside = figureShade(new Vector3(0, 0.8, 0.1), new Vector3(0, 0, 1), [HEAD]);
    const none = figureShade(new Vector3(0, 0.8, 0.1), new Vector3(0, 0, 1), []);
    expect(inside).toBeCloseTo(none, 6);
  });

  it("paints light from above: shoulders brighter than boots, boots shaded toward the ground", () => {
    const up = new Vector3(0, 0, 1);
    const shoulder = figureShade(new Vector3(0, 0.6, 0.2), up, []);
    const knee = figureShade(new Vector3(0, 0.2, 0.2), up, []);
    const sole = figureShade(new Vector3(0, 0.0, 0.2), up, []);
    expect(shoulder).toBeGreaterThan(knee);
    expect(knee).toBeGreaterThan(sole);
    expect(sole).toBeGreaterThan(0.45);
    expect(shoulder).toBeLessThanOrEqual(1.1);
  });

  it("never goes black however many parts crowd a point", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({ c: new Vector3(Math.cos(i), 0.5, Math.sin(i)).multiplyScalar(0.3), r: 0.2 }));
    expect(figureShade(new Vector3(0, 0.3, 0), new Vector3(0, 1, 0), crowd)).toBeGreaterThan(0.35);
  });
});

describe("bakeFigure", () => {
  it("multiplies the vertex colours by the shade at the part's place in the figure", () => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 0, 0.6, 0]), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1]), 3));
    bakeFigure(g, new Vector3(0, 0, 0), []);
    const c = g.getAttribute("color");
    expect(c.getX(0)).toBeLessThan(c.getX(1));
    // The same part placed higher in the figure (an arm at the shoulder) is lit as such.
    const h = new BufferGeometry();
    h.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0]), 3));
    h.setAttribute("normal", new BufferAttribute(new Float32Array([0, 0, 1]), 3));
    h.setAttribute("color", new BufferAttribute(new Float32Array([1, 1, 1]), 3));
    bakeFigure(h, new Vector3(0, 0.6, 0), []);
    expect(h.getAttribute("color").getX(0)).toBeCloseTo(c.getX(1), 6);
  });
});
