import { describe, expect, it } from "vitest";
import { DISSOLVE_S, dissolveK } from "./dissolve";

describe("dissolveK (the painted dissolve over a campfire cut)", () => {
  it("shows the old frame whole at the cut and none of it once the dissolve is done", () => {
    expect(dissolveK(0)).toBe(1);
    expect(dissolveK(DISSOLVE_S)).toBe(0);
    expect(dissolveK(DISSOLVE_S + 5)).toBe(0);
  });
  it("is idle before any cut (negative age) and never rises while it plays", () => {
    expect(dissolveK(-1)).toBe(0);
    let last = 1;
    for (let a = 0; a <= DISSOLVE_S; a += 0.01) {
      const k = dissolveK(a);
      expect(k).toBeLessThanOrEqual(last + 1e-12);
      last = k;
    }
  });
  it("takes most of a second, so the eye follows it (not a flash)", () => {
    expect(DISSOLVE_S).toBeGreaterThanOrEqual(0.7);
    expect(dissolveK(DISSOLVE_S * 0.5)).toBeGreaterThan(0.25);
    expect(dissolveK(DISSOLVE_S * 0.5)).toBeLessThan(0.75);
  });
});
