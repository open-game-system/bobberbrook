import { describe, expect, it } from "vitest";
import { action, join, newLake, setCampfire, step, type Lake } from "../game/lake";
import { lakeRadius, WEST } from "../game/world";
import { lakeEvents } from "./lakeEvents";

const T0 = 5_000;
function shoreLake(): Lake {
  const l = join(newLake(3, T0), { name: "A", ogsId: null }).lake;
  return { ...l, swirls: [], fishers: l.fishers.map((f) => ({ ...f, pos: { x: -(lakeRadius(WEST) + 1), z: 0 } })) };
}

describe("lakeEvents", () => {
  it("is quiet with no previous state or no change", () => {
    const l = shoreLake();
    expect(lakeEvents(null, l)).toEqual([]);
    expect(lakeEvents(l, l)).toEqual([]);
  });
  it("sees a fisher join", () => {
    const a = newLake(3, T0);
    expect(lakeEvents(a, join(a, { name: "A", ogsId: null }).lake)).toEqual([{ kind: "joined", seat: 0 }]);
  });
  it("sees cast, bite, hook and a catch", () => {
    let l = shoreLake();
    const cast = action(l, 0, T0);
    expect(lakeEvents(l, cast)).toEqual([{ kind: "cast", seat: 0 }]);
    l = step(cast, T0 + 900);
    const f = l.fishers[0]!;
    const bitten = step(l, f.biteAt);
    expect(lakeEvents(l, bitten)).toEqual([{ kind: "bite", seat: 0 }]);
    const hooked = action(bitten, 0, f.biteAt + 10);
    expect(lakeEvents(bitten, hooked)).toEqual([{ kind: "hooked", seat: 0 }]);
    const landed = step(hooked, f.biteAt + 30_000);
    const ev = lakeEvents(hooked, landed);
    expect(ev[0]?.kind).toBe("caught");
  });
  it("sees a miss", () => {
    let l = step(action(shoreLake(), 0, T0), T0 + 900);
    const f = l.fishers[0]!;
    l = step(l, f.biteAt);
    expect(lakeEvents(l, step(l, f.biteUntil))).toContainEqual({ kind: "missed", seat: 0 });
  });
  it("sees the campfire and a new golden swirl", () => {
    const l = shoreLake();
    expect(lakeEvents(l, setCampfire(l, true, T0 + 1))).toEqual([{ kind: "campfire", on: true }]);
    const g = { ...l, swirls: [{ id: 50, pos: { x: 0, z: 0 }, theta: 0, golden: true, since: 0, until: 1e9, catches: 0 }] };
    expect(lakeEvents(l, g)).toEqual([{ kind: "golden-swirl" }]);
  });
});
