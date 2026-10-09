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
