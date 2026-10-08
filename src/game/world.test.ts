import { describe, expect, it } from "vitest";
import {
  DOCK, EAST, NORTH, OBSTACLES, SHORE_REACH, SOUTH, WEST, advance, castFrom, castRing, lakeOutline, lakeRadius, onDock, onLand,
  outerRadius, spawnPoint, walkable, waterAt,
} from "./world";

const at = (theta: number, r: number) => ({ x: Math.cos(theta) * r, z: Math.sin(theta) * r });

describe("the lake", () => {
  it("has a wobbly but always sensible edge", () => {
    for (let i = 0; i < 360; i++) {
      const r = lakeRadius((i / 360) * 2 * Math.PI);
      expect(r).toBeGreaterThan(11);
      expect(r).toBeLessThan(23);
    }
  });
  it("leaves room to walk between the water and the hills everywhere", () => {
    for (let i = 0; i < 360; i++) {
      const t = (i / 360) * 2 * Math.PI;
      expect(outerRadius(t) - lakeRadius(t)).toBeGreaterThanOrEqual(5.9);
    }
  });
  it("hems in the north by the waterfall cliff", () => {
    expect(outerRadius(NORTH)).toBeCloseTo(lakeRadius(NORTH) + 6, 5);
    expect(outerRadius(SOUTH)).toBe(32);
  });
  it("traces an outline on the edge", () => {
    const pts = lakeOutline(8);
    expect(pts).toHaveLength(8);
    expect(Math.hypot(pts[0]!.x, pts[0]!.z)).toBeCloseTo(lakeRadius(0), 6);
  });
});

describe("walking", () => {
  it("is on land between the edge and the hills, never in the water", () => {
    expect(onLand(at(WEST, lakeRadius(WEST) + 2))).toBe(true);
    expect(onLand(at(WEST, lakeRadius(WEST) - 1))).toBe(false);
    expect(onLand(at(WEST, 40))).toBe(false);
  });
  it("keeps out of trees and rocks", () => {
    for (const o of OBSTACLES) expect(onLand({ x: o.x, z: o.z })).toBe(false);
  });
  it("can walk the dock out over the water", () => {
    expect(onDock({ x: 0, z: DOCK.tipZ + 0.5 })).toBe(true);
    expect(walkable({ x: 0, z: DOCK.tipZ + 0.5 })).toBe(true);
    expect(walkable({ x: 3, z: DOCK.tipZ + 0.5 })).toBe(false);
  });
  it("moves at the stick's speed on open ground", () => {
    const p = advance(spawnPoint(0), { x: 1, z: 0 }, 1);
    expect(p.x - spawnPoint(0).x).toBeCloseTo(1, 5);
  });
  it("stops at the water instead of walking in", () => {
    const start = at(WEST, lakeRadius(WEST) + 1.5);
    const p = advance(start, { x: 4, z: 0 }, 3); // straight towards the lake centre
    expect(walkable(p)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(lakeRadius(Math.atan2(p.z, p.x)));
  });
  it("slides along the shore when pushed at an angle", () => {
    const start = at(WEST, lakeRadius(WEST) + 0.6);
    const p = advance(start, { x: 3, z: 3 }, 1);
    expect(p.z).toBeGreaterThan(start.z + 0.5);
  });
  it("does nothing with no stick or no time", () => {
    const s = spawnPoint(1);
    expect(advance(s, { x: 0, z: 0 }, 5)).toBe(s);
    expect(advance(s, { x: 1, z: 0 }, 0)).toBe(s);
  });
  it("spawns every seat on land, apart", () => {
    const pts = [0, 1, 2, 3].map(spawnPoint);
    for (const p of pts) expect(walkable(p)).toBe(true);
    expect(new Set(pts.map((p) => p.x)).size).toBe(4);
  });
});

describe("casting", () => {
  it("works at the water's edge and lands out in the water", () => {
    const c = castFrom(at(WEST, lakeRadius(WEST) + 1));
    expect(c?.water).toBe("lily");
    const b = c!.bobber;
    expect(Math.hypot(b.x, b.z)).toBeLessThan(lakeRadius(WEST) - 3);
  });
  it("does not work far from the water", () => {
    expect(castFrom(at(WEST, lakeRadius(WEST) + SHORE_REACH + 1))).toBeNull();
  });
  it("works from the end of the dock, not its root", () => {
    expect(castFrom({ x: 0, z: DOCK.tipZ + 1 })?.water).toBe("dock");
    expect(castFrom({ x: 0, z: DOCK.rootZ - 0.5 })).toBeNull();
  });
  it("names the waters around the lake", () => {
    expect(waterAt(WEST)).toBe("lily");
    expect(waterAt(NORTH)).toBe("falls");
    expect(waterAt(EAST)).toBe("reeds");
    expect(waterAt(SOUTH)).toBe("shore");
    expect(waterAt(Math.PI / 4)).toBe("shore");
  });
  it("puts swirls on the ring a straight cast lands on", () => {
    const c = castFrom(at(EAST, lakeRadius(EAST) + 1))!;
    const ring = castRing(EAST);
    expect(Math.hypot(c.bobber.x - ring.x, c.bobber.z - ring.z)).toBeLessThan(0.01);
  });
});
