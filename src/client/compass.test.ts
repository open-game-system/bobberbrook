import { describe, expect, it } from "vitest";
import { newLake, type Lake } from "../game/lake";
import { castRing, EAST, WEST } from "../game/world";
import { compassTo, shoreFor } from "./compass";

const swirl = (id: number, theta: number, golden = false) => ({ id, pos: castRing(theta), theta, golden, since: 0, until: 1e9, catches: 0 });
const lakeWith = (swirls: Lake["swirls"]): Lake => ({ ...newLake(1, 0), swirls });

describe("compassTo", () => {
  it("points at the nearest swirl's shore", () => {
    // Standing south of the lake: the nearer (east) swirl's shore is up and to the right.
    const c = compassTo(lakeWith([swirl(1, WEST), swirl(2, EAST)]), { x: 10, z: 24 })!;
    expect(c.golden).toBe(false);
    expect(Math.cos(c.angle)).toBeGreaterThan(0);
    expect(Math.sin(c.angle)).toBeLessThan(0);
  });
  it("prefers the golden swirl even when it's farther", () => {
    const c = compassTo(lakeWith([swirl(1, EAST), swirl(2, WEST, true)]), { x: 25, z: 0 })!; // west is far left
    expect(c.golden).toBe(true);
    expect(Math.abs(Math.abs(c.angle) - Math.PI)).toBeLessThan(0.3);
  });
  it("says when you've arrived", () => {
    const s = swirl(1, WEST);
    expect(compassTo(lakeWith([s]), shoreFor(s))!.arrived).toBe(true);
  });
  it("is null with no swirls", () => {
    expect(compassTo(lakeWith([]), { x: 0, z: 0 })).toBeNull();
  });
});
