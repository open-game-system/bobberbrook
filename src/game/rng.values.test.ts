import { describe, expect, it } from "vitest";
import { between, pickWeighted, rand } from "./rng";

describe("rand is mulberry32 on seed + counter", () => {
  it("gives the same numbers it always has (rooms replay their rolls)", () => {
    expect(rand(42, 0)).toBe(0.23769244481809437);
    expect(rand(42, 3)).toBe(0.56670600338839);
    expect(rand(7, 100)).toBe(0.23915191646665335);
    expect(rand(0, 0)).toBe(0.5464560757391155);
  });
  it("scales into a range from the same roll", () => {
    expect(between(42, 3, 10, 20)).toBeCloseTo(10 + 10 * 0.56670600338839, 12);
  });
  it("falls back to the last index when the roll reaches the total", () => {
    expect(pickWeighted([1, 1], 1)).toBe(1);
    expect(pickWeighted([1, 3], 0.25)).toBe(1);
    expect(pickWeighted([1, 3], 0.2499)).toBe(0);
  });
});
