import { describe, expect, it } from "vitest";
import { FIRE_CLEAR, aroundFire } from "./campPath";

const fire = { x: 0, z: 0 };

describe("aroundFire", () => {
  it("leaves a step outside the clear ring alone", () => {
    const next = { x: 3, z: 0.1 };
    expect(aroundFire({ x: 3.2, z: 0 }, next, { x: 3, z: 1 }, fire)).toEqual(next);
  });

  it("never lets a walker cross the fire on the way to a seat across it", () => {
    let p = { x: -4, z: 0.05 };
    const seat = { x: 2.9, z: 0 };
    let minD = Infinity;
    for (let i = 0; i < 400; i++) {
      // The seat pulls straight at it (the old damped walk), the fire ring steers.
      const next = { x: p.x + (seat.x - p.x) * 0.05, z: p.z + (seat.z - p.z) * 0.05 };
      p = aroundFire(p, next, seat, fire);
      minD = Math.min(minD, Math.hypot(p.x, p.z));
    }
    expect(minD).toBeGreaterThanOrEqual(FIRE_CLEAR - 1e-6);
    expect(Math.hypot(p.x - seat.x, p.z - seat.z)).toBeLessThan(0.05);
  });

  it("goes round the short way, toward the seat's side", () => {
    const from = { x: 0, z: -FIRE_CLEAR };
    const out = aroundFire(from, { x: 0.1, z: -1 }, { x: 2.5, z: 0 }, fire);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(FIRE_CLEAR, 6);
    expect(out.x).toBeGreaterThan(0);
  });
});
