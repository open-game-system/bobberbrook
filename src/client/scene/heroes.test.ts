import { describe, expect, it } from "vitest";
import { HERO_SCALE, heroFor, platformAt } from "./heroes";

describe("heroFor (each generated place's hero silhouette)", () => {
  it("never puts a colossal tree beside a giant-tree landmark (cottages instead)", () => {
    for (let p = 0; p < 1; p += 0.05) expect(heroFor("giant", p)).toBe("hamlet");
  });
  it("mostly an ancient tree with an elven platform, sometimes a hamlet of big cottages", () => {
    let ancient = 0;
    for (let p = 0; p < 1; p += 0.01) if (heroFor("arch", p) === "ancient") ancient++;
    expect(ancient).toBeGreaterThan(50);
    expect(ancient).toBeLessThan(85);
    expect(heroFor("spire", 0.99)).toBe("hamlet");
  });
});

describe("the ancient tree", () => {
  it("towers over the place's own landmark giant (0.62-0.92) and the forest", () => {
    expect(HERO_SCALE.min).toBeGreaterThanOrEqual(1.4);
  });
  it("hangs its platform on the trunk above the roots and below the boughs, wider than the trunk there", () => {
    for (const s of [HERO_SCALE.min, HERO_SCALE.max]) {
      const p = platformAt(s);
      expect(p.y).toBeGreaterThan(3.6 * s);
      expect(p.y).toBeLessThan(9 * s);
      expect(p.deckR).toBeGreaterThan(p.trunkR + 1.5);
    }
  });
});
