import { describe, expect, it } from "vitest";
import { action, join, newLake, reelHold, step, type Lake } from "../game/lake";
import { lakeRadius, WEST } from "../game/world";
import { eventCues, liveCues, type LiveMemory } from "./deviceCues";

const T0 = 1000;
function shore(): Lake {
  const l = join(join(newLake(5, T0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake;
  return { ...l, swirls: [], fishers: l.fishers.map((f) => (f.seat === 0 ? { ...f, pos: { x: -(lakeRadius(WEST) + 1), z: 0 } } : f)) };
}
const mem = (): LiveMemory => ({ nibbled: new Set(), wasThrash: false, lastClickAt: 0 });

describe("eventCues", () => {
  it("sounds only this seat's moments", () => {
    const l = shore();
    const cast = action(l, 0, T0);
    expect(eventCues(l, cast, 0)).toEqual(["cast"]);
    expect(eventCues(l, cast, 1)).toEqual([]);
  });
  it("sounds a bite, a catch with the new-fish fanfare, and a miss", () => {
    let l = step(action(shore(), 0, T0), T0 + 900);
    const f = l.fishers[0]!;
    const bitten = step(l, f.biteAt);
    expect(eventCues(l, bitten, 0)).toEqual(["bite"]);
    expect(eventCues(bitten, step(bitten, f.biteUntil), 0)).toEqual(["missed"]);
    l = action(bitten, 0, f.biteAt + 10);
    const landed = step(l, f.biteAt + 30_000);
    const cues = eventCues(l, landed, 0);
    expect(cues[0] === "catch" || cues[0] === "junk").toBe(true);
  });
});

describe("a trail shell", () => {
  it("twinkles on the picker's device only", () => {
    const l = shore();
    const got = { ...l, pickup: { seat: 1, sparkleId: 0, at: 5, seq: 1 } };
    expect(eventCues(l, got, 1)).toEqual(["shell"]);
    expect(eventCues(l, got, 0)).toEqual([]);
  });
});

describe("a new place", () => {
  it("chimes on every device, once", () => {
    const l = shore();
    const found = { ...l, discovered: [...l.discovered, "hollow" as const], discovery: { area: "hollow" as const, seat: 1, at: 5, seq: 1 } };
    expect(eventCues(l, found, 0)).toEqual(["place"]);
    expect(eventCues(l, found, 1)).toEqual(["place"]);
  });
});

describe("liveCues", () => {
  it("is quiet with no fisher", () => {
    expect(liveCues(undefined, 0, 0, mem())).toEqual([]);
  });
  it("sounds each nibble once", () => {
    const f = step(action(shore(), 0, T0), T0 + 900).fishers[0]!;
    const m = mem();
    const t = f.nibbles[0]!;
    expect(liveCues(f, t + 10, 0, m)).toEqual(["nibble"]);
    expect(liveCues(f, t + 20, 0, m)).toEqual([]);
  });
  it("clicks while the reel is held, no faster than every 90 ms", () => {
    let l = step(action(shore(), 0, T0), T0 + 900);
    const at = l.fishers[0]!.biteAt + 5;
    l = reelHold(action(l, 0, at), 0, true, at + 1);
    const f = l.fishers[0]!;
    const m = mem();
    expect(liveCues(f, at + 2, 1000, m)).toContain("reelClick");
    expect(liveCues(f, at + 3, 1050, m)).not.toContain("reelClick");
    expect(liveCues(f, at + 4, 1200, m)).toContain("reelClick");
  });
});
