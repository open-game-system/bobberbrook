import { describe, expect, it } from "vitest";
import { newLake } from "../game/lake";
import { areaById, castRingIn, type AreaId } from "../game/world";
import { worldFor } from "../game/regions";
import { compassGoal, compassShown, compassTo, nearestRide, nearestSwirl, nearestUnfound, shoreFor } from "./compass";

const swirl = (id: number, area: AreaId, theta: number) => ({ id, area, pos: castRingIn(areaById(area), theta), theta, golden: false, since: 0, until: 1e9, catches: 0 });

describe("nearestSwirl", () => {
  const lake = { worldSeed: 1 };
  it("none: null", () => {
    expect(nearestSwirl(lake, { x: 0, z: 0 }, [])).toBeNull();
  });
  it("the one whose shore is nearest; the first on a tie", () => {
    const a = swirl(1, "moonwell", 0);
    const b = swirl(2, "moonwell", Math.PI);
    expect(nearestSwirl(lake, shoreFor(lake, b), [a, b])).toBe(b);
    expect(nearestSwirl(lake, shoreFor(lake, a), [a, b])).toBe(a);
    const a2 = { ...a, id: 3 };
    expect(nearestSwirl(lake, shoreFor(lake, a), [a, a2])).toBe(a);
  });
});

describe("nearestUnfound", () => {
  const p = (id: string, x: number) => ({ id, center: { x, z: 0 } });
  it("the nearest place not yet found, the first on a tie", () => {
    const places = [p("a", 1), p("b", 5), p("c", 3), p("d", 3)];
    expect(nearestUnfound(places, ["a"], { x: 0, z: 0 })?.id).toBe("c");
    expect(nearestUnfound(places, [], { x: 0, z: 0 })?.id).toBe("a");
  });
  it("all found: null", () => {
    expect(nearestUnfound([p("a", 1)], ["a"], { x: 0, z: 0 })).toBeNull();
  });
});

describe("nearestRide", () => {
  const r = (toPlace: string, x: number, kind: "boat" | "zeppelin" = "boat") => ({ toPlace, kind, at: { x, z: 0 } });
  it("the nearest mooring going somewhere new, with its vehicle", () => {
    expect(nearestRide([r("a", 1), r("b", 4, "zeppelin"), r("c", 6)], ["a"], { x: 0, z: 0 })).toEqual({ at: { x: 4, z: 0 }, kind: "zeppelin" });
    expect(nearestRide([r("b", 4), r("c", 4, "zeppelin")], [], { x: 0, z: 0 })).toEqual({ at: { x: 4, z: 0 }, kind: "boat" });
  });
  it("every ride goes somewhere found: null", () => {
    expect(nearestRide([r("a", 1)], ["a"], { x: 0, z: 0 })).toBeNull();
    expect(nearestRide([], [], { x: 0, z: 0 })).toBeNull();
  });
});

describe("compassTo", () => {
  it("fishing alone (a seat with nobody else): never points back to a family", () => {
    const c = compassTo({ ...newLake(1, 0), swirls: [swirl(1, "moonwell", 0)] }, { x: 0, z: 25 }, 0);
    expect(c?.family).toBeUndefined();
  });
  it("a vehicle goal carries its vehicle; others don't", () => {
    const c = compassTo({ ...newLake(1, 0), swirls: [swirl(1, "moonwell", 0)] }, { x: 0, z: 25 });
    expect(c && "vehicle" in c).toBe(false);
  });
});

describe("compassGoal past every place in sight", () => {
  it("heads for a boat or zeppelin to somewhere new, then any swirl, else nothing", () => {
    const w = worldFor(1);
    let found: { from: { x: number; z: number }; seen: string[]; kind: string } | null = null;
    for (let i = -8; i <= 8 && !found; i++)
      for (let j = -8; j <= 8 && !found; j++) {
        for (const p of w.platformsNear({ x: i * 96, z: j * 96 }, 0)) {
          const seen = w.placesNear(p.at, 2).map((x): string => x.id);
          if (!seen.includes(p.toPlace)) {
            found = { from: p.at, seen, kind: p.kind };
            break;
          }
        }
      }
    expect(found).not.toBeNull();
    const { from, seen, kind } = found!;
    const lake = { ...newLake(1, 0), swirls: [], discovered: seen };
    expect(compassGoal(lake, from)?.vehicle).toBeDefined();
    const s = swirl(1, "tarn", 0);
    const allRides = w.platformsNear(from, 2).map((p) => p.toPlace);
    const everywhere = { ...lake, discovered: [...seen, ...allRides] };
    expect(compassGoal(everywhere, from)).toBeNull();
    expect(compassTo(everywhere, from)).toBeNull();
    expect(compassGoal({ ...everywhere, swirls: [s] }, from)?.at).toEqual(shoreFor(lake, s));
    expect(kind === "boat" || kind === "zeppelin").toBe(true);
  });
});

describe("compassShown", () => {
  const c = { angle: 0, distance: 20, golden: false, explore: false, arrived: false };
  it("walking away from water: the arrow leads the way", () => {
    expect(compassShown("walk-to-water", c)).toBe(c);
  });
  it("at the water with the rod: no arrow (fish here), unless a golden swirl or the family calls", () => {
    expect(compassShown("cast", c)).toBeNull();
    expect(compassShown("cast", { ...c, golden: true })).not.toBeNull();
    expect(compassShown("cast", { ...c, family: true })).not.toBeNull();
  });
  it("no goal, or busy fishing: nothing", () => {
    expect(compassShown("walk-to-water", null)).toBeNull();
    expect(compassShown("waiting", c)).toBeNull();
  });
});
