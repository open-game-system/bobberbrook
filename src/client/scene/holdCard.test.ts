import { describe, expect, it } from "vitest";
import { CARD_PX, FISH_PX, MAX_FISH_H, MAX_FISH_W, MAX_GROW, MAX_SCREEN_SHARE, MIN_SCREEN_SHARE, holdCard } from "./holdCard";

const k = FISH_PX / CARD_PX;

describe("the held fish card", () => {
  for (const aspect of [1.1, 1.7, 3.2]) {
    it(`never covers the face (aspect ${aspect}): the fish's near end is clear of the head`, () => {
      const h = holdCard({ base: 2.6, aspect, headHalf: 0.62, screenW: 34 });
      const nearEnd = h.lateral - (h.size * k) / 2;
      expect(nearEnd).toBeGreaterThan(0.62);
    });

    it(`rests on the hands (aspect ${aspect}): the fish's lower edge is just under the hands`, () => {
      const h = holdCard({ base: 2.6, aspect, headHalf: 0.62, screenW: 34 });
      const halfH = (h.size * k) / 2 / aspect;
      const lowerEdge = h.lift - halfH;
      expect(lowerEdge).toBeLessThan(0);
      expect(lowerEdge).toBeGreaterThan(-0.25 * halfH - 0.01);
    });
  }

  it("grows a small catch to read across the room, within a cap", () => {
    const far = holdCard({ base: 2.0, aspect: 1.7, headHalf: 0.62, screenW: 40 });
    expect(far.size * k).toBeGreaterThanOrEqual(Math.min(MIN_SCREEN_SHARE * 40, 2.0 * MAX_GROW * k) - 1e-9);
    expect(far.size).toBeLessThanOrEqual(2.0 * MAX_GROW + 1e-9);
    const near = holdCard({ base: 2.0, aspect: 1.7, headHalf: 0.62, screenW: 12 });
    expect(near.size).toBe(2.0);
  });

  it("keeps the base size when the screen width is unknown", () => {
    expect(holdCard({ base: 3, aspect: 2, headHalf: 0.6, screenW: 0 }).size).toBe(3);
  });
});

describe("the held fish card's cap (round 09: the Moonfin covered the catcher)", () => {
  it("never shows a fish wider than MAX_FISH_W, however big or rare", () => {
    const h = holdCard({ base: 4.7, aspect: 1.3, headHalf: 0.66, screenW: 40 });
    expect(h.size * k).toBeLessThanOrEqual(MAX_FISH_W + 1e-9);
  });

  it("never shows a fish taller than MAX_FISH_H (a squarish legend stays beside the catcher's head)", () => {
    const h = holdCard({ base: 4.7, aspect: 1.05, headHalf: 0.66, screenW: 40 });
    expect((h.size * k) / 1.05).toBeLessThanOrEqual(MAX_FISH_H + 1e-9);
  });

  it("never fills more than MAX_SCREEN_SHARE of the screen width", () => {
    const h = holdCard({ base: 4.7, aspect: 2.5, headHalf: 0.66, screenW: 10 });
    expect(h.size * k).toBeLessThanOrEqual(MAX_SCREEN_SHARE * 10 + 1e-9);
  });

  it("still clears the head and rests on the hands when capped", () => {
    const aspect = 1.1;
    const h = holdCard({ base: 4.7, aspect, headHalf: 0.66, screenW: 40 });
    expect(h.lateral - (h.size * k) / 2).toBeGreaterThan(0.66);
    expect(h.lift - (h.size * k) / 2 / aspect).toBeLessThan(0);
  });
});
