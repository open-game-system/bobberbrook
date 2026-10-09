import { describe, expect, it } from "vitest";
import { WADE_RANGE, action, join, move, newLake, step, type Lake } from "./lake";
import { worldFor } from "./regions";
import { WEST, distance, lakeRadius } from "./world";

const T0 = 1_000_000;
const w = worldFor(1);

function lakeWith(n: number): Lake {
  let lake = newLake(7, T0);
  for (let i = 0; i < n; i++) lake = join(lake, { name: `P${i}`, ogsId: null }).lake;
  return lake;
}

/** Seat 0 stands `back` metres inland from the west shore (lily pads), still. */
function backFromShore(lake: Lake, back: number): Lake {
  const r = lakeRadius(WEST) + back;
  return { ...lake, swirls: [], fishers: lake.fishers.map((f) => (f.seat === 0 ? { ...f, pos: { x: -r, z: 0 }, vel: { x: 0, z: 0 } } : f)) };
}

const me = (lake: Lake) => lake.fishers.find((f) => f.seat === 0)!;

/** Steps the lake at the TV's 4 Hz for `ms`. */
function run(lake: Lake, from: number, ms: number): Lake {
  for (let t = from; t <= from + ms; t += 250) lake = step(lake, t);
  return lake;
}

describe("the big button always leads to fishing (wading in)", () => {
  it("a few metres back from the water: the press walks the fisher to the shore and casts", () => {
    let lake = backFromShore(lakeWith(1), 6);
    expect(w.castFrom(me(lake).pos)).toBeNull();
    lake = action(lake, 0, T0 + 100);
    expect(me(lake).fishSpot).not.toBeNull();
    expect(me(lake).mode).toBe("walk");
    lake = run(lake, T0 + 100, 3000);
    expect(me(lake).mode).not.toBe("walk");
    expect(me(lake).bobber).not.toBeNull();
    expect(me(lake).fishSpot).toBeNull();
  });

  it("the spot it walks to is on land and castable, and nearer than WADE_RANGE", () => {
    const from = { x: -(lakeRadius(WEST) + 6), z: 0 };
    const spot = w.fishingSpot(from, WADE_RANGE);
    expect(spot).not.toBeNull();
    expect(w.walkable(spot!)).toBe(true);
    expect(w.castFrom(spot!)).not.toBeNull();
    expect(distance(spot!, from)).toBeLessThan(6);
  });

  it("deep in the forest, far from any water: the press does nothing", () => {
    let lake = lakeWith(1);
    const far = { x: 0, z: 1000 };
    expect(w.fishingSpot(far, WADE_RANGE)).toBeNull();
    lake = { ...lake, fishers: lake.fishers.map((f) => ({ ...f, pos: far })) };
    lake = action(lake, 0, T0 + 100);
    expect(me(lake).fishSpot).toBeNull();
    expect(me(lake).vel).toEqual({ x: 0, z: 0 });
  });

  it("touching the stick takes over: the walk to the water stops", () => {
    let lake = backFromShore(lakeWith(1), 6);
    lake = action(lake, 0, T0 + 100);
    lake = move(lake, 0, { x: 0, y: 1 }, T0 + 400);
    expect(me(lake).fishSpot).toBeNull();
  });

  it("a kid wading in is not pulled back to the family by tag-along", () => {
    let lake = backFromShore(lakeWith(2), 6);
    // The other fisher stands 8 m inland, inside FOLLOW_FAR, so tag-along would otherwise hold or pull.
    lake = { ...lake, fishers: lake.fishers.map((f) => (f.seat === 1 ? { ...f, pos: { x: -(lakeRadius(WEST) + 14), z: 0 }, vel: { x: 0, z: 0 }, lastInputAt: 0 } : f)) };
    lake = action(lake, 0, T0 + 7000);
    lake = run(lake, T0 + 7000, 3000);
    expect(me(lake).bobber).not.toBeNull();
  });

  it("standing at the water already: the press casts straight away, no walk", () => {
    let lake = backFromShore(lakeWith(1), 1);
    lake = action(lake, 0, T0 + 100);
    expect(me(lake).mode).toBe("cast");
    expect(me(lake).fishSpot).toBeNull();
  });
});

describe("a missed bite is remembered", () => {
  it("records when the fish got away (the coach explains it)", () => {
    let lake = backFromShore(lakeWith(1), 1);
    lake = action(lake, 0, T0 + 100);
    expect(me(lake).missAt).toBeNull();
    lake = step(lake, T0 + 1000);
    const until = me(lake).biteUntil;
    lake = step(lake, until + 10);
    expect(me(lake).missAt).toBe(until);
    expect(me(lake).mode).toBe("wait");
  });
});
