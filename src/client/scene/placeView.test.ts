import { describe, expect, it } from "vitest";
import { SIDE_SLACK, behindYaw, placeYaw, wrapAngle, placeSideYaw } from "./placeView";

/** A fisher on a pond of radius 10 round (0, 0) at angle theta (x = cos, z = sin, as the shores are laid out). */
const at = (theta: number) => ({ x: Math.cos(theta) * 10, z: Math.sin(theta) * 10 });

describe("behindYaw (round 20: the camera stands behind the family, across the water from them)", () => {
  it("a family on the south shore (+z) is seen from the south (yaw 0)", () => {
    expect(behindYaw(0, 0, [at(Math.PI / 2 - 0.2), at(Math.PI / 2 + 0.2)])).toBeCloseTo(0, 5);
  });
  it("a family on the north-east shore (Mistmarsh's boardwalk shore) is seen from the north-east", () => {
    const y = behindYaw(0, 0, [at(-0.45), at(-0.7)]);
    expect(y).not.toBeNull();
    // The camera sits at +(sin yaw, cos yaw): north-east is +x, -z.
    expect(Math.sin(y ?? 0)).toBeGreaterThan(0.6);
    expect(Math.cos(y ?? 0)).toBeLessThan(-0.4);
  });
  it("is null when the family stands all round the pond", () => {
    expect(behindYaw(0, 0, [at(0), at(Math.PI)])).toBeNull();
    expect(behindYaw(0, 0, [])).toBeNull();
  });
});

describe("placeYaw", () => {
  it("keeps the place's own side while the family is on that side (Moonwell's framing is unchanged)", () => {
    expect(placeYaw(0, 0.7, 0)).toBe(0);
    expect(placeYaw(0, -SIDE_SLACK, 0)).toBe(0);
    expect(placeYaw(0.3, 0.3 + 0.5, 0.3)).toBeCloseTo(0.3, 9);
  });
  it("swings round when they fish further round, ending SIDE_SLACK off straight behind", () => {
    const y = placeYaw(0, 2.4, 0);
    expect(y).toBeCloseTo(2.4 - SIDE_SLACK, 9);
    expect(placeYaw(0, -2.0, 0)).toBeCloseTo(-2.0 + SIDE_SLACK, 9);
  });
  it("is continuous as the family walks round the pond", () => {
    let prev = 0;
    for (let b = 0; b < 2.6; b += 0.01) {
      const y = placeYaw(0, b, prev);
      expect(Math.abs(y - prev)).toBeLessThan(0.02);
      prev = y;
    }
  });
  it("never spins the long way round: the result is unwrapped next to the last yaw", () => {
    // The camera already went round to 2.3 rad (past pi on the other side the wrapped value would be negative).
    const y = placeYaw(0, -3.0, 2.3);
    expect(Math.abs(y - 2.3)).toBeLessThan(1);
  });
  it("a family straight across keeps the side the camera already swung to", () => {
    const fromLeft = placeYaw(0, 3.1, -2.0);
    const fromRight = placeYaw(0, -3.1, 2.0);
    expect(wrapAngle(fromLeft)).toBeLessThan(0);
    expect(wrapAngle(fromRight)).toBeGreaterThan(0);
  });
  it("holds the last yaw when the family stands all round", () => {
    expect(placeYaw(0, null, 1.2)).toBe(1.2);
  });
});

describe("placeSideYaw (round 23: shared by the camera and the moored airships)", () => {
  it("looks at home places from the south and at others from a hashed side within 0.45 rad", () => {
    expect(placeSideYaw({ home: true, key: "moonwell" })).toBe(0);
    const y = placeSideYaw({ home: false, key: "3,-2" });
    expect(Math.abs(y)).toBeLessThanOrEqual(0.45);
    expect(placeSideYaw({ home: false, key: "3,-2" })).toBe(y);
  });
});
