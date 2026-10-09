import { describe, expect, it } from "vitest";
import {
  CAMPFIRE, DOCK, NORTH, OBSTACLES, SOUTH, WEST, advance, angleGap, castFrom, castRing, distance, lakeOutline, lakeRadius, onDock, onLand, outerRadius,
  polar, spawnPoint, walkable,
} from "./world";

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
  it("spawns seats 3 m apart from the left (wider than FISHER_SPACE, so nobody is nudged on arrival)", () => {
    expect(spawnPoint(0)).toEqual({ x: -4.5, z: DOCK.rootZ + 2.5 });
    expect(spawnPoint(1).x).toBeCloseTo(-1.5, 12);
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

describe("the lake's shape, pinned (the scene draws the same one)", () => {
  it("has its edge where it always was", () => {
    expect(lakeRadius(0)).toBeCloseTo(17.83488957352262, 12);
    expect(lakeRadius(1)).toBeCloseTo(20.087612694108923, 12);
    expect(lakeRadius(2.5)).toBeCloseTo(16.396045000316867, 12);
  });
  it("measures angles the short way round", () => {
    expect(angleGap(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2, 12);
    expect(angleGap(-3, 3)).toBeCloseTo(2 * Math.PI - 6, 12);
    expect(angleGap(1, 1 + Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(angleGap(0, 3)).toBeCloseTo(3, 12);
    expect(angleGap(5, 1)).toBeCloseTo(2 * Math.PI - 4, 12);
  });
  it("lowers the cliff gradually away from the waterfall", () => {
    const mid = outerRadius(NORTH + 0.375);
    expect(mid).toBeCloseTo(32 - 0.5 * (32 - (lakeRadius(NORTH + 0.375) + 6)), 9);
    expect(outerRadius(NORTH + 0.75)).toBe(32);
  });
  it("puts the campfire on land near the south-east shore", () => {
    expect(walkable(CAMPFIRE)).toBe(true);
    const { r, theta } = polar(CAMPFIRE);
    expect(r - lakeRadius(theta)).toBeLessThan(6);
    expect(CAMPFIRE.x).toBe(9);
    expect(CAMPFIRE.z).toBeGreaterThan(0);
  });
  it("ends the dock at its root", () => {
    expect(onDock({ x: 0, z: DOCK.rootZ + 1 })).toBe(false);
    expect(onDock({ x: 0, z: DOCK.tipZ - 1 })).toBe(false);
    expect(onDock({ x: DOCK.halfWidth + 0.1, z: DOCK.tipZ + 1 })).toBe(false);
  });
  it("keeps half a metre clear of every tree and rock", () => {
    for (const o of OBSTACLES) expect(onLand({ x: o.x + o.r + 0.3, z: o.z })).toBe(false);
    expect(OBSTACLES.length).toBeGreaterThan(0);
  });
  it("walks right up to the water, in small steps", () => {
    const start = at(WEST, lakeRadius(WEST) + 1.5);
    const p = advance(start, { x: 4, z: 0 }, 2);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(Math.hypot(start.x, start.z) - 0.5);
  });
});
