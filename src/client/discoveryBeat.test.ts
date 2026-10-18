import { describe, expect, it } from "vitest";
import { join, newLake, type Lake } from "../game/lake";
import { worldFor } from "../game/regions";
import { revealedAt } from "./discoveryBeat";

function found(atWater: boolean): Lake {
  let l = newLake(1, 0);
  l = join(l, { name: "Dad", ogsId: null }).lake;
  const mist = worldFor(l.worldSeed).placeById("mistmarsh")!;
  const pos = atWater ? { x: mist.center.x + mist.pond.r + 1, z: mist.center.z } : { x: 0, z: 20 };
  return { ...l, fishers: l.fishers.map((f) => ({ ...f, pos })), discovered: ["moonwell", "mistmarsh"], discovery: { area: "mistmarsh", seat: 0, at: 1000, seq: 3 } };
}

describe("the device's 'new place' beat lands with the TV's reveal (round 23: the phone's star burst 14 s early)", () => {
  it("still on the trail: not yet", () => {
    expect(revealedAt(null, found(false), 2000)).toBeNull();
  });
  it("at the water: starts now, and keeps that start once remembered", () => {
    const m = revealedAt(null, found(true), 2000);
    expect(m).toEqual({ seq: 3, at: 2000 });
    expect(revealedAt(m, found(true), 4000)).toEqual({ seq: 3, at: 2000 });
  });
  it("the TV reveals after its wait anyway: so does the device", () => {
    expect(revealedAt(null, found(false), 1000 + 6500)).toEqual({ seq: 3, at: 7500 });
  });
  it("a place found long ago (a screen joining later): no beat", () => {
    expect(revealedAt(null, found(true), 1000 + 60_000)).toBeNull();
  });
  it("no discovery: nothing", () => {
    expect(revealedAt(null, { ...found(true), discovery: null }, 2000)).toBeNull();
  });
});
