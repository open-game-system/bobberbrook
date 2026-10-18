import { describe, expect, it } from "vitest";
import { CARD_PX, FISH_PX, MAX_FISH_W, heldFishWidth, holdCard } from "./holdCard";

const k = FISH_PX / CARD_PX;

describe("the held fish is sized by its catch length (round 27: a 20 cm Bluegill covered Dad's torso)", () => {
  it("a small catch sits in two hands at the chest (well under the ~2.3 it was grown to)", () => {
    expect(heldFishWidth(20)).toBeLessThan(1.4);
    expect(heldFishWidth(12)).toBeGreaterThan(1.0);
  });
  it("grows with length and stays under the cap", () => {
    expect(heldFishWidth(60)).toBeGreaterThan(heldFishWidth(30));
    expect(heldFishWidth(100)).toBeGreaterThan(heldFishWidth(60));
    expect(heldFishWidth(160)).toBeLessThanOrEqual(MAX_FISH_W);
    expect(heldFishWidth(400)).toBe(MAX_FISH_W);
  });
  it("is grown only a little to read across the room (a 20 cm fish at TV distance stays under 1.6 m)", () => {
    const base = heldFishWidth(20) / k;
    const h = holdCard({ base, aspect: 1.8, headHalf: 0.6, screenW: 40 });
    expect(h.size * k).toBeLessThan(1.6);
    expect(h.size * k).toBeGreaterThanOrEqual(heldFishWidth(20) - 1e-9);
  });
});
