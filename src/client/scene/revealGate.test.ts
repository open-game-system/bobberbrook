import { describe, expect, it } from "vitest";
import { REVEAL_WAIT_S, revealReady } from "./revealGate";

/**
 * Round 18 (round 17 session ~186-192 s): a place is discovered as the first fisher steps into its clearing,
 * often still on the trail ~25 m out, so the reveal ran while the family was still walking in (and the critic
 * saw no beat). The reveal waits until someone has arrived at the water, or REVEAL_WAIT_S at most.
 */
const PLACE = { center: { x: -64, z: 40 }, pond: { r: 13 }, clearing: 11 };

describe("the discovery reveal plays when the family arrives", () => {
  it("waits while everyone is still out on the edge of the clearing", () => {
    expect(revealReady([{ x: -64 + 23, z: 40 }], PLACE, 1)).toBe(false);
  });
  it("plays once anyone reaches the water's side of the clearing", () => {
    expect(revealReady([{ x: -64 + 23, z: 40 }, { x: -64, z: 40 - 17 }], PLACE, 1)).toBe(true);
  });
  it("plays anyway after REVEAL_WAIT_S (a family that lingers at the edge still gets its beat)", () => {
    expect(revealReady([{ x: -64 + 23, z: 40 }], PLACE, REVEAL_WAIT_S)).toBe(true);
    expect(revealReady([{ x: -64 + 23, z: 40 }], PLACE, REVEAL_WAIT_S - 0.1)).toBe(false);
  });
  it("plays at once with no fishers to wait for", () => {
    expect(revealReady([], PLACE, 0)).toBe(true);
  });
});
