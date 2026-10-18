import { describe, expect, it } from "vitest";
import { CROWD, action, join, newLake, step, type Lake } from "./lake";
import { worldFor } from "./regions";
import { WEST, distance, lakeRadius } from "./world";

const T0 = 1_000_000;
const w = worldFor(1);
const r = lakeRadius(WEST);

/** Two fishers at the west shore: seat 0 at the water's edge, seat 1 `gap` metres beside them along the shore. */
function pair(gap: number): Lake {
  let lake = newLake(7, T0);
  for (const name of ["Dad", "Juneau"]) lake = join(lake, { name, ogsId: null }).lake;
  return {
    ...lake,
    swirls: [],
    fishers: lake.fishers.map((f) => ({ ...f, pos: f.seat === 0 ? { x: -(r + 1), z: 0 } : { x: -(r + 1), z: gap }, vel: { x: 0, z: 0 } })),
  };
}
const seat = (lake: Lake, s: number) => lake.fishers.find((f) => f.seat === s)!;
function run(lake: Lake, from: number, ms: number): Lake {
  for (let t = from; t <= from + ms; t += 250) lake = step(lake, t);
  return lake;
}

describe("everyone gets their own fishing spot (round 24: Juneau fished from inside Dad's ring at Mistmarsh)", () => {
  it("pressing at the water right beside someone steps aside to a free spot first, then casts there", () => {
    let lake = action(pair(1), 0, T0 + 100);
    expect(seat(lake, 0).mode).toBe("cast");
    lake = action(lake, 1, T0 + 200);
    expect(seat(lake, 1).mode).toBe("walk");
    expect(seat(lake, 1).fishSpot).not.toBeNull();
    lake = run(lake, T0 + 200, 6000);
    const kid = seat(lake, 1);
    expect(kid.mode).not.toBe("walk");
    expect(kid.bobber).not.toBeNull();
    expect(distance(kid.pos, seat(lake, 0).pos)).toBeGreaterThanOrEqual(CROWD);
  });
  it("with room to spare, the press casts straight away as before", () => {
    const lake = action(pair(5), 1, T0 + 100);
    expect(seat(lake, 1).mode).toBe("cast");
  });
  it("walking down to the water, a fisher doesn't cast on the way in right next to someone", () => {
    let lake = pair(1);
    // Juneau starts 6 m inland behind Dad and presses: the walk ends at a free spot, not beside Dad.
    lake = { ...lake, fishers: lake.fishers.map((f) => (f.seat === 1 ? { ...f, pos: { x: -(r + 7), z: 0.5 } } : f)) };
    lake = action(lake, 0, T0 + 100);
    lake = action(lake, 1, T0 + 200);
    lake = run(lake, T0 + 200, 8000);
    expect(seat(lake, 1).bobber).not.toBeNull();
    expect(distance(seat(lake, 1).pos, seat(lake, 0).pos)).toBeGreaterThanOrEqual(CROWD);
  });
  it("the spot it steps to is castable", () => {
    const lake = action(action(pair(1), 0, T0 + 100), 1, T0 + 200);
    expect(w.castFrom(seat(lake, 1).fishSpot!)).not.toBeNull();
  });
});
