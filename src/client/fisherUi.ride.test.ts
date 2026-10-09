import { describe, expect, it } from "vitest";
import { join, newLake, type Ride } from "../game/lake";
import { buttonState, needsTick } from "./fisherUi";

const lake = join(newLake(1, 0), { name: "A", ogsId: null }).lake;
const me = { ...lake.fishers[0]!, mode: "ride" as const };
const ride: Ride = { platformId: "z", kind: "zeppelin", from: { x: 0, z: 0 }, to: { x: 1, z: 0 }, toPlace: "tarn", departAt: 0, arriveAt: 9, seats: [0] };

describe("the button while riding", () => {
  it("shows the vehicle being ridden", () => {
    expect(buttonState({ ...lake, ride }, me, 1)).toEqual({ kind: "riding", vehicle: "zeppelin" });
    expect(buttonState({ ...lake, ride: { ...ride, kind: "boat" } }, me, 1)).toEqual({ kind: "riding", vehicle: "boat" });
  });
  it("a boat when the ride has already ended on the lake's side", () => {
    expect(buttonState({ ...lake, ride: null }, me, 1)).toEqual({ kind: "riding", vehicle: "boat" });
  });
  it("never nudges the room's clock", () => {
    expect(needsTick(me, 1e12)).toBe(false);
  });
});

describe("at a zeppelin mooring", () => {
  it("shows the zeppelin on the button while waiting for the family", async () => {
    const { buttonState } = await import("./fisherUi");
    const { join, newLake } = await import("../game/lake");
    const { worldFor } = await import("../game/regions");
    const l0 = join(newLake(1, 0), { name: "A", ogsId: null }).lake;
    const zep = worldFor(l0.worldSeed).platformsNear({ x: 0, z: 0 }, 0).find((p) => p.kind === "zeppelin")!;
    const l = { ...l0, fishers: l0.fishers.map((f) => ({ ...f, pos: { ...zep.at } })) };
    expect(buttonState(l, l.fishers[0]!, 0)).toEqual({ kind: "board", vehicle: "zeppelin" });
  });
});
