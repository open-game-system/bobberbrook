import { describe, expect, it } from "vitest";
import { DOCK, SOUTH, WEST, advance, castFrom, castRing, distance, lakeOutline, lakeRadius, spawnPoint, walkable } from "./world";

const at = (theta: number, r: number) => ({ x: Math.cos(theta) * r, z: Math.sin(theta) * r });

describe("walking, in detail", () => {
  it("never jumps the lake, however long the stick is held", () => {
    const start = at(WEST, lakeRadius(WEST) + 1);
    const p = advance(start, { x: 4.2, z: 0 }, 20);
    expect(p.x).toBeLessThan(0);
    expect(walkable(p)).toBe(true);
  });
  it("slides sideways along a shore it is pushed into", () => {
    const theta = SOUTH + 0.5;
    const start = at(theta, lakeRadius(theta) + 0.6);
    // Pushed toward the water and west: the step east-and-north fails, the step west alone doesn't.
    const p = advance(start, { x: -3, z: -3 }, 0.5);
    expect(p.x).toBeLessThan(start.x - 0.5);
  });
  it("stays put when every way is blocked", () => {
    const inWater = { x: 0, z: 0 };
    expect(advance(inWater, { x: 1, z: 1 }, 1)).toBe(inWater);
  });
  it("spawns seats 2.2 m apart from the left", () => {
    expect(spawnPoint(0)).toEqual({ x: -3.3, z: DOCK.rootZ + 2.5 });
    expect(spawnPoint(1).x).toBeCloseTo(-1.1, 12);
  });
});

describe("casting, in detail", () => {
  it("casts straight out from the end of the dock, pulled a little toward the middle", () => {
    expect(castFrom({ x: 0.5, z: DOCK.tipZ + 1 })).toEqual({ bobber: { x: 0.2, z: DOCK.tipZ - 4.5 }, water: "dock" });
  });
  it("can't cast from the water", () => {
    expect(castFrom({ x: 0, z: 0 })).toBeNull();
    expect(castFrom(at(1, lakeRadius(1) - 0.2))).toBeNull();
  });
  it("lands the bobber 4.5 m out, straight toward the middle", () => {
    const theta = 1;
    const c = castFrom(at(theta, lakeRadius(theta) + 1))!;
    expect(c.bobber.x).toBeCloseTo(Math.cos(theta) * (lakeRadius(theta) - 4.5), 9);
    expect(c.bobber.z).toBeCloseTo(Math.sin(theta) * (lakeRadius(theta) - 4.5), 9);
    expect(castRing(theta)).toEqual(c.bobber);
  });
});

describe("shapes", () => {
  it("traces the outline evenly round from the east", () => {
    const pts = lakeOutline(8);
    expect(pts[2]!.x).toBeCloseTo(0, 9);
    expect(pts[2]!.z).toBeCloseTo(lakeRadius(Math.PI / 2), 9);
    expect(pts[1]!.z).toBeCloseTo(Math.sin(Math.PI / 4) * lakeRadius(Math.PI / 4), 9);
    expect(lakeOutline()).toHaveLength(96);
  });
  it("measures distance on the ground", () => {
    expect(distance({ x: 1, z: 1 }, { x: 4, z: 5 })).toBe(5);
  });
});
