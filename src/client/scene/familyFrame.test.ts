import { describe, expect, it } from "vitest";
import { FRAME_ALL_MAX, FRAME_ALL_RELEASE, FamilyFrame } from "./split";
import type { Member } from "./split";

const m = (seat: number, x: number, z: number): Member => ({ seat, x, z, activity: "idle", inputAt: 0, place: null });

describe("FamilyFrame (round 09: frame a split family whole, up to a cap)", () => {
  it("frames two fishers 25 m apart together (no edge marker)", () => {
    const f = new FamilyFrame();
    expect(f.update([m(0, 0, 0), m(1, 25, 0)])).toBe(true);
  });

  it("frames a family 29 m apart (the leash) together", () => {
    const f = new FamilyFrame();
    expect(f.update([m(0, 0, 0), m(1, 0, 29), m(2, 3, 10)])).toBe(true);
  });

  it("past the cap, hands over to the split camera", () => {
    const f = new FamilyFrame();
    expect(f.update([m(0, 0, 0), m(1, FRAME_ALL_RELEASE + 1, 0)])).toBe(false);
  });

  it("uses the widest pair, not the distance from the first fisher", () => {
    const f = new FamilyFrame();
    expect(f.update([m(0, 0, 0), m(1, -22, 0), m(2, 22, 0)])).toBe(false);
  });

  it("has hysteresis: stays whole until the release spread, regroups only under the cap", () => {
    const f = new FamilyFrame();
    expect(f.update([m(0, 0, 0), m(1, FRAME_ALL_MAX + 2, 0)])).toBe(true);
    expect(f.update([m(0, 0, 0), m(1, FRAME_ALL_RELEASE + 0.5, 0)])).toBe(false);
    expect(f.update([m(0, 0, 0), m(1, FRAME_ALL_MAX + 2, 0)])).toBe(false);
    expect(f.update([m(0, 0, 0), m(1, FRAME_ALL_MAX - 1, 0)])).toBe(true);
  });

  it("an empty or single family is always framed whole", () => {
    const f = new FamilyFrame();
    expect(f.update([])).toBe(true);
    expect(f.update([m(0, 500, 500)])).toBe(true);
  });
});
