import { describe, expect, it } from "vitest";
import { FOG_TILE, FOLLOW_FAR, FOLLOW_NEAR, PLATFORM_REACH, arrivalSpeed, boardingTarget, closeEnough, fogTilesAround, partWay } from "./lake";
import { WALK_SPEED } from "./world";
import type { Platform } from "./regions";

const dock = (id: string, x: number): Platform => ({ id, kind: "boat", place: "a", at: { x, z: 0 }, to: { x: 0, z: 0 }, toPlace: "b", path: [] });

describe("boardingTarget", () => {
  const far = { pos: { x: 10, z: 0 }, seat: 1 };
  it("no mooring by the others: nothing to board", () => {
    expect(boardingTarget(far, { seat: 0 }, undefined, undefined)).toBeUndefined();
  });
  it("walks onto the others' mooring from away", () => {
    const p = dock("p", 0);
    expect(boardingTarget(far, { seat: 0 }, p, undefined)).toBe(p);
  });
  it("already on it (within reach − 1): no boarding walk", () => {
    const p = dock("p", 0);
    expect(boardingTarget({ pos: { x: PLATFORM_REACH - 1, z: 0 }, seat: 1 }, { seat: 0 }, p, undefined)).toBeUndefined();
    expect(boardingTarget({ pos: { x: PLATFORM_REACH - 0.99, z: 0 }, seat: 1 }, { seat: 0 }, p, undefined)).toBe(p);
  });
  it("on the same mooring as mine: hold", () => {
    const p = dock("p", 0);
    expect(boardingTarget(far, { seat: 0 }, p, dock("p", 10))).toBeUndefined();
  });
  it("different moorings: the lower seat holds, the higher seat walks over", () => {
    const p = dock("p", 0);
    const mine = dock("m", 10);
    expect(boardingTarget({ ...far, seat: 0 }, { seat: 1 }, p, mine)).toBeUndefined();
    expect(boardingTarget({ ...far, seat: 2 }, { seat: 1 }, p, mine)).toBe(p);
  });
});

describe("arrivalSpeed", () => {
  const full = WALK_SPEED * 0.85;
  it("full follow speed far out, easing to 15% at the mooring", () => {
    expect(arrivalSpeed(10)).toBeCloseTo(full);
    expect(arrivalSpeed(3.1)).toBeCloseTo(full);
    expect(arrivalSpeed(1.85)).toBeCloseTo(full * 0.5);
    expect(arrivalSpeed(0)).toBeCloseTo(full * 0.15);
  });
});

describe("closeEnough", () => {
  it("always within FOLLOW_NEAR", () => {
    expect(closeEnough({ following: true }, FOLLOW_NEAR)).toBe(true);
    expect(closeEnough({ following: false }, FOLLOW_NEAR)).toBe(true);
  });
  it("between NEAR and FAR only when not already following", () => {
    expect(closeEnough({ following: false }, FOLLOW_FAR)).toBe(true);
    expect(closeEnough({ following: true }, FOLLOW_FAR)).toBe(false);
  });
  it("past FOLLOW_FAR: never", () => {
    expect(closeEnough({ following: false }, FOLLOW_FAR + 0.01)).toBe(false);
  });
});

describe("fogTilesAround", () => {
  it("a rough circle of tiles: 21 at radius 2, 37 at radius 3, row by row", () => {
    expect(fogTilesAround({ x: 0, z: 0 }, 2)).toHaveLength(21);
    expect(fogTilesAround({ x: 0, z: 0 }, 3)).toHaveLength(37);
    expect(fogTilesAround({ x: 0, z: 0 }, 1)[0]).toBe("-1,-1");
    expect(fogTilesAround({ x: FOG_TILE * 5 + 1, z: 0 }, 0)).toEqual(["5,0"]);
  });
});

describe("partWay", () => {
  it("the unit way from a to b, or by seat east–west when exactly on top of each other", () => {
    expect(partWay({ pos: { x: 0, z: 0 }, seat: 0 }, { pos: { x: 0, z: 2 }, seat: 1 }, 2)).toEqual({ x: 0, z: 1 });
    expect(partWay({ pos: { x: 0, z: 0 }, seat: 0 }, { pos: { x: 0, z: 0 }, seat: 1 }, 0)).toEqual({ x: 1, z: 0 });
    expect(partWay({ pos: { x: 0, z: 0 }, seat: 2 }, { pos: { x: 0, z: 0 }, seat: 1 }, 0)).toEqual({ x: -1, z: 0 });
  });
});
