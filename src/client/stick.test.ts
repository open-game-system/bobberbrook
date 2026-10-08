import { describe, expect, it } from "vitest";
import { quantizeStick, sameStick } from "./stick";

describe("quantizeStick", () => {
  it("ignores small wobbles in the dead zone", () => {
    expect(quantizeStick(5, 5, 100)).toEqual({ x: 0, y: 0 });
  });
  it("turns screen-down into stick-down", () => {
    expect(quantizeStick(0, 100, 100)).toEqual({ x: 0, y: -1 });
    expect(quantizeStick(0, -100, 100)).toEqual({ x: 0, y: 1 });
  });
  it("has a half-speed ring and a full-speed ring", () => {
    expect(quantizeStick(40, 0, 100)).toEqual({ x: 0.5, y: 0 });
    expect(quantizeStick(90, 0, 100)).toEqual({ x: 1, y: 0 });
    expect(quantizeStick(300, 0, 100)).toEqual({ x: 1, y: 0 });
  });
  it("snaps to one of 16 directions", () => {
    const a = quantizeStick(100, -3, 100);
    const b = quantizeStick(100, 3, 100);
    expect(sameStick(a, b)).toBe(true);
    const diag = quantizeStick(70, -70, 100);
    expect(diag.x).toBeCloseTo(Math.SQRT1_2, 3);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2, 3);
  });
});
