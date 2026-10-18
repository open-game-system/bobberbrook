import { describe, expect, it } from "vitest";
import { action, join, newLake, step, type Lake } from "./lake";
import { worldFor } from "./regions";
import { WEST, distance, lakeRadius } from "./world";

const T0 = 1_000_000;
const w = worldFor(1);

/** Seat 0 at the west shore (about to cast), seat 1 idle `back` metres inland behind them. */
function family(back: number): Lake {
  let lake = newLake(7, T0);
  for (const name of ["Dad", "Juneau"]) lake = join(lake, { name, ogsId: null }).lake;
  const r = lakeRadius(WEST);
  return {
    ...lake,
    swirls: [],
    fishers: lake.fishers.map((f) => (f.seat === 0 ? { ...f, pos: { x: -(r + 1), z: 0 }, vel: { x: 0, z: 0 } } : { ...f, pos: { x: -(r + back), z: 1 }, vel: { x: 0, z: 0 }, lastInputAt: 0 })),
  };
}
const seat = (lake: Lake, s: number) => lake.fishers.find((f) => f.seat === s)!;
function run(lake: Lake, from: number, ms: number): Lake {
  for (let t = from; t <= from + ms; t += 250) lake = step(lake, t);
  return lake;
}

describe("tagging along to someone who is fishing (round 22: Juneau stood on the grass behind Dad)", () => {
  it("the follower walks down to a free spot on the shore beside them, ready to cast", () => {
    let lake = action(family(12), 0, T0 + 7000);
    expect(seat(lake, 0).mode).toBe("cast");
    lake = run(lake, T0 + 7000, 12_000);
    const kid = seat(lake, 1);
    expect(w.castFrom(kid.pos)).not.toBeNull();
    expect(distance(kid.pos, seat(lake, 0).pos)).toBeGreaterThanOrEqual(3);
    expect(kid.vel).toEqual({ x: 0, z: 0 });
  });
  it("someone just walking: the follower still stops close by, as before", () => {
    const lake = run(family(12), T0 + 7000, 12_000);
    expect(distance(seat(lake, 1).pos, seat(lake, 0).pos)).toBeLessThanOrEqual(9.5);
    expect(seat(lake, 1).vel).toEqual({ x: 0, z: 0 });
  });
});
