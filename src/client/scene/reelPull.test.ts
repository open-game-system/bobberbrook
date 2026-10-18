import { describe, expect, it } from "vitest";
import { REEL_NEAR_M, REEL_PULL, reelInCap } from "./fishers";

/** Where a reel at progress k draws a bobber cast d0 m out (fishers.ts: 0.72 x REEL_PULL of the way in at full). */
const drawnAt = (d0: number, k: number) => d0 * (1 - 0.72 * REEL_PULL * Math.min(k, reelInCap(d0)));

describe("the reel keeps the fight out on the water (round 27: a landed fish fought at the fisher's feet)", () => {
  it("never draws a bobber in closer than REEL_NEAR_M", () => {
    for (const d0 of [2.1, 2.5, 3, 4, 6]) for (const k of [0, 0.5, 1]) expect(drawnAt(d0, k)).toBeGreaterThanOrEqual(REEL_NEAR_M - 1e-9);
  });
  it("leaves a bobber cast closer than that where it is", () => {
    expect(reelInCap(1.5)).toBe(0);
    expect(drawnAt(1.5, 1)).toBe(1.5);
  });
  it("still shows the fish coming closer on a long cast", () => {
    expect(drawnAt(6, 1)).toBeLessThan(drawnAt(6, 0.5));
    expect(drawnAt(6, 0.5)).toBeLessThan(6);
    expect(reelInCap(20)).toBe(1);
  });
});
