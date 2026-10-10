import { describe, expect, it } from "vitest";
import { CARD_PX, CHIN_GAP, FEET_CLEAR, FISH_PX, chestHold, liftFrom } from "./holdCard";

const k = FISH_PX / CARD_PX;
const visH = (size: number, aspect: number) => (size * k) / aspect;

describe("chestHold", () => {
  const body = { handsY: 0.88, chinY: 1.21, feetY: 0 };

  it("keeps a small fish at the hands, its top below the chin", () => {
    const h = chestHold({ size: 0.6, aspect: 2.2, ...body });
    expect(h.size).toBe(0.6);
    expect(h.centreY).toBeCloseTo(0.88, 6);
    expect(h.centreY + visH(h.size, 2.2) / 2).toBeLessThanOrEqual(body.chinY - CHIN_GAP + 1e-9);
  });

  it("holds a bigger fish lower so it never covers the face", () => {
    const h = chestHold({ size: 1.8, aspect: 2.0, ...body });
    expect(h.centreY).toBeLessThan(0.88);
    expect(h.centreY + visH(h.size, 2.0) / 2).toBeCloseTo(body.chinY - CHIN_GAP, 6);
  });

  it("shrinks a fish too tall for the body to fit between chin and feet", () => {
    const h = chestHold({ size: 4, aspect: 1.2, ...body });
    expect(visH(h.size, 1.2)).toBeCloseTo(body.chinY - CHIN_GAP - FEET_CLEAR, 6);
    expect(h.centreY - visH(h.size, 1.2) / 2).toBeGreaterThanOrEqual(body.feetY + FEET_CLEAR - 1e-9);
    expect(h.centreY + visH(h.size, 1.2) / 2).toBeLessThanOrEqual(body.chinY - CHIN_GAP + 1e-9);
  });

  it("follows the catcher off the ground (a deck, a boat)", () => {
    const h = chestHold({ size: 0.6, aspect: 2.2, handsY: 3.28, chinY: 3.61, feetY: 2.4 });
    expect(h.centreY).toBeCloseTo(3.28, 6);
  });
});

describe("liftFrom", () => {
  it("starts at the bobber when it is close", () => {
    expect(liftFrom({ x: 0, z: 0 }, { x: 1, z: 1 }, 2.2)).toEqual({ x: 1, z: 1 });
  });

  it("starts no further than the reach from the catcher (never between two fishers)", () => {
    const p = liftFrom({ x: 0, z: 0 }, { x: 6, z: 8 }, 2.2);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(2.2, 6);
    expect(p.x / p.z).toBeCloseTo(6 / 8, 6);
  });
});
