import { describe, expect, it } from "vitest";
import { join, newLake, type Lake } from "../game/lake";
import { TRAILS, areaById, castRingIn, pondRadius, type AreaId } from "../game/world";
import { compassGoal, compassTo, shoreFor } from "./compass";
import { nextWaypoint, route } from "../game/world";

const swirl = (id: number, area: AreaId, theta: number, golden = false) => ({ id, area, pos: castRingIn(areaById(area), theta), theta, golden, since: 0, until: 1e9, catches: 0 });
const lakeWith = (swirls: Lake["swirls"], discovered: AreaId[] = ["moonwell"]): Lake => ({ ...newLake(1, 0), swirls, discovered });
const shore = (area: AreaId, theta: number) => {
  const a = areaById(area);
  const r = pondRadius(a, theta) + 1.5;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
};

describe("routes along the trails", () => {
  it("walks from the lake to the far tarn through another place", () => {
    const r = route("moonwell", "tarn");
    expect(r[0]).toBe("moonwell");
    expect(r.at(-1)).toBe("tarn");
    expect(r).toHaveLength(3);
    expect(route("moonwell", "moonwell")).toEqual(["moonwell"]);
  });
  it("heads for the trailhead out of this place, not straight through the forest", () => {
    const marshTrail = TRAILS[0]!;
    expect(nextWaypoint(shore("moonwell", 2.6), areaById("mistmarsh").center)).toEqual(marshTrail.from);
  });
  it("walks to the far end of a trail once on it", () => {
    const t = TRAILS[0]!;
    const mid = { x: (t.from.x + t.to.x) / 2, z: (t.from.z + t.to.z) / 2 };
    expect(nextWaypoint(mid, areaById("mistmarsh").center)).toEqual(t.to);
  });
  it("goes straight to a target in the same place", () => {
    const target = shore("moonwell", 1);
    expect(nextWaypoint(shore("moonwell", 0), target)).toEqual(target);
  });
});

describe("the kid's compass", () => {
  it("prefers the golden swirl wherever it is", () => {
    const g = compassGoal(lakeWith([swirl(1, "moonwell", 0), swirl(2, "mistmarsh", 1, true)], ["moonwell", "mistmarsh"]), shore("moonwell", 0))!;
    expect(g.golden).toBe(true);
  });
  it("points at a swirl in this place", () => {
    const s = swirl(1, "moonwell", 1);
    expect(compassGoal(lakeWith([s]), shore("moonwell", 0))?.at).toEqual(shoreFor({ worldSeed: 1 }, s));
  });
  it("sends you exploring when this place has no swirl", () => {
    const g = compassGoal(lakeWith([swirl(1, "pools", 1)], ["moonwell", "pools"]), shore("moonwell", 2.6))!;
    expect(g.explore).toBe(true);
    expect(g.at).toEqual(areaById("mistmarsh").center);
  });
  it("says when you've arrived at the swirl", () => {
    const s = swirl(1, "moonwell", Math.PI);
    expect(compassTo(lakeWith([s]), shoreFor({ worldSeed: 1 }, s))?.arrived).toBe(true);
  });
  it("always has somewhere new to point at in the endless valley", () => {
    const c = compassTo(lakeWith([], ["moonwell", "mistmarsh", "pools", "hollow", "tarn"]), { x: 0, z: 20 })!;
    expect(c.explore).toBe(true);
  });

  it("points back to the family at the end of the leash", () => {
    const base = join(join(newLake(1, 0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake;
    const l = { ...base, fishers: base.fishers.map((f) => ({ ...f, pos: f.seat === 0 ? { x: 0, z: 20 } : { x: -29, z: 20 } })) };
    const c = compassTo(l, { x: -29, z: 20 }, 1)!;
    expect(c.family).toBe(true);
    expect(Math.cos(c.angle)).toBeGreaterThan(0.9);
    expect(compassTo(l, { x: -10, z: 20 }, 1)?.family).toBeUndefined();
  });
});
