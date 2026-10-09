import { describe, expect, it } from "vitest";
import { newLake, type Lake, type Ride } from "../game/lake";
import { lakeEvents, rideName } from "./lakeEvents";

const l: Lake = newLake(1, 0);
const ride: Ride = { platformId: "boat:x", kind: "zeppelin", from: { x: 0, z: 0 }, to: { x: 1, z: 0 }, toPlace: "mistmarsh", departAt: 0, arriveAt: 1, seats: [0] };

describe("the lake's moments, rides and finds", () => {
  it("nothing changed: nothing to say", () => {
    expect(lakeEvents(l, l)).toEqual([]);
  });
  it("a discovery only when its seq is new", () => {
    const d = { ...l, discovery: { area: "mistmarsh", seat: 1, at: 5, seq: 2 } };
    expect(lakeEvents(l, d)).toEqual([{ kind: "discovered", seat: 1, area: "mistmarsh" }]);
    expect(lakeEvents(d, { ...d })).toEqual([]);
  });
  it("a treasure pickup only when its seq is new", () => {
    const p = { ...l, pickup: { seat: 2, sparkleId: 1, at: 5, seq: 1 } };
    expect(lakeEvents(l, p)).toEqual([{ kind: "treasure", seat: 2 }]);
    expect(lakeEvents(p, { ...p })).toEqual([]);
  });
  it("setting off on a ride names where it goes; landing says arrived", () => {
    const riding = { ...l, ride };
    expect(lakeEvents(l, riding)).toEqual([{ kind: "ride", vehicle: "zeppelin", to: "Mistmarsh", toPlace: "mistmarsh" }]);
    expect(lakeEvents(riding, { ...riding })).toEqual([]);
    expect(lakeEvents(riding, l)).toEqual([{ kind: "arrived", place: "mistmarsh" }]);
  });
  it("all the lake's moments at once come in a fixed order", () => {
    const next = { ...l, upgradeSeq: l.upgradeSeq + 1, campfire: !l.campfire, discovery: { area: "pools", seat: 0, at: 1, seq: 1 }, pickup: { seat: 0, sparkleId: 1, at: 1, seq: 1 }, ride };
    expect(lakeEvents(l, next).map((e) => e.kind)).toEqual(["upgrade", "campfire", "discovered", "treasure", "ride"]);
  });
});

describe("rideName", () => {
  it("the place's name, or somewhere new", () => {
    expect(rideName(1, "tarn")).toBe("Starfall Tarn");
    expect(rideName(1, "nowhere")).toBe("somewhere new");
  });
});
