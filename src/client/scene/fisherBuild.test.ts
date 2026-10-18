import { describe, expect, it } from "vitest";
import { BUILDS, fisherRole, figureTop } from "./fisherBuild";

describe("fisher builds per role (round 24)", () => {
  it("reads the role from the rules: a named grown-up, a wordless kid, the little one on easy mode", () => {
    expect(fisherRole({ kid: false, easy: false })).toBe("adult");
    expect(fisherRole({ kid: false, easy: true })).toBe("adult");
    expect(fisherRole({ kid: true, easy: false })).toBe("kid");
    expect(fisherRole({ kid: true, easy: true })).toBe("little");
  });

  it("grown-ups stand 1.25-1.45x a kid's height, the little one a bit smaller than the kid", () => {
    const a = figureTop(BUILDS.adult);
    const k = figureTop(BUILDS.kid);
    const l = figureTop(BUILDS.little);
    expect(a / k).toBeGreaterThanOrEqual(1.25);
    expect(a / k).toBeLessThanOrEqual(1.45);
    expect(l / k).toBeGreaterThan(0.8);
    expect(l / k).toBeLessThan(0.95);
  });

  it("grown-ups have adult proportions: long legs and a smaller head for their height", () => {
    const ratio = (r: keyof typeof BUILDS) => (BUILDS[r].headS * 0.5) / figureTop(BUILDS[r]);
    expect(ratio("adult")).toBeLessThan(0.33);
    expect(ratio("kid")).toBeGreaterThan(0.4);
    expect(ratio("little")).toBeGreaterThanOrEqual(ratio("kid"));
    expect(BUILDS.adult.hip / figureTop(BUILDS.adult)).toBeGreaterThan(0.3);
    expect(BUILDS.kid.hip / figureTop(BUILDS.kid)).toBeLessThan(0.25);
  });

  it("every part stacks: hips under the shoulders under the neck, hands below the hips' top", () => {
    for (const b of Object.values(BUILDS)) {
      expect(b.hip).toBeLessThan(b.shoulderY);
      expect(b.shoulderY).toBeLessThan(b.neckY);
      expect(b.shoulderY - b.armLen).toBeGreaterThan(0.05);
      expect(b.sitDrop).toBeLessThan(b.hip);
    }
  });
});
