import { describe, expect, it } from "vitest";
import { AREAS, TRAILS, nextWaypoint, otherEnd, route, trailNeighbours, walkBack } from "./world";

const center = (id: string) => AREAS.find((a) => a.id === id)!.center;

describe("otherEnd", () => {
  it("the far end from either end; null for a trail not touching here", () => {
    expect(otherEnd(["moonwell", "pools"], "moonwell")).toBe("pools");
    expect(otherEnd(["moonwell", "pools"], "pools")).toBe("moonwell");
    expect(otherEnd(["moonwell", "pools"], "tarn")).toBeNull();
  });
});

describe("trailNeighbours", () => {
  it("every place one trail away, in trail order", () => {
    expect(trailNeighbours("moonwell")).toEqual(["mistmarsh", "pools", "hollow"]);
    expect(trailNeighbours("tarn")).toEqual(["pools", "hollow"]);
    expect(trailNeighbours("mistmarsh")).toEqual(["moonwell"]);
  });
});

describe("walkBack", () => {
  it("from to itself: just it", () => {
    expect(walkBack(new Map<string, string>(), "a", "a")).toEqual(["a"]);
  });
  it("follows predecessors to the start, or gives up when cut off", () => {
    expect(walkBack(new Map([["b", "a"], ["c", "b"]]), "a", "c")).toEqual(["a", "b", "c"]);
    expect(walkBack(new Map([["b", "a"]]), "a", "c")).toEqual([]);
  });
});

describe("route", () => {
  it("shortest by trail", () => {
    expect(route("mistmarsh", "tarn")).toHaveLength(4);
    expect(route("moonwell", "moonwell")).toEqual(["moonwell"]);
  });
});

describe("nextWaypoint off the places", () => {
  it("lost in the forest, far from any trail: straight at the target", () => {
    const target = center("tarn");
    expect(nextWaypoint({ x: 300, z: 300 }, target)).toEqual(target);
  });
  it("halfway down a trail: the end nearer the target", () => {
    const t = TRAILS[0]!;
    const mid = { x: (t.from.x + t.to.x) / 2, z: (t.from.z + t.to.z) / 2 };
    expect(nextWaypoint(mid, center("mistmarsh"))).toEqual(t.to);
    expect(nextWaypoint(mid, center("moonwell"))).toEqual(t.from);
  });
  it("in a place, bound for another: this place's end of the first trail", () => {
    expect(nextWaypoint(center("mistmarsh"), center("tarn"))).toEqual(TRAILS[0]!.to);
  });
});
