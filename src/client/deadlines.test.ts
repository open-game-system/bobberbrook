import { describe, expect, it } from "vitest";
import { CAST_FLIGHT_MS, CATCH_SHOW_MS, action, join, newLake, reelHold, setEasy, step, thrashing, type Fisher, type Lake } from "../game/lake";
import { WEST, lakeRadius } from "../game/world";
import { coachLine } from "./coach";
import { buttonState, needsTick } from "./fisherUi";

const T0 = 1_000_000;

function shore(): Lake {
  const lake = join(newLake(7, T0), { name: "Juneau", ogsId: null }).lake;
  const r = lakeRadius(WEST) + 1;
  return { ...lake, swirls: [], fishers: lake.fishers.map((f) => ({ ...f, pos: { x: -r, z: 0 }, vel: { x: 0, z: 0 } })) };
}
const me = (lake: Lake): Fisher => lake.fishers[0]!;

describe("needsTick: a controller nudges the room once a deadline it waits on has passed", () => {
  it("never while walking", () => {
    expect(needsTick(me(shore()), T0 + 60_000)).toBe(false);
  });
  it("when the cast lands", () => {
    const f = me(action(shore(), 0, T0));
    expect(needsTick(f, T0 + CAST_FLIGHT_MS - 1)).toBe(false);
    expect(needsTick(f, T0 + CAST_FLIGHT_MS)).toBe(true);
  });
  it("at the end of the bite window, for an easy fisher too", () => {
    for (const lake of [shore(), setEasy(shore(), 0, true)]) {
      const w = step(action(lake, 0, T0), T0 + CAST_FLIGHT_MS);
      const f = me(step(w, me(w).biteAt));
      expect(f.mode).toBe("bite");
      expect(needsTick(f, f.biteUntil - 1)).toBe(false);
      expect(needsTick(f, f.biteUntil)).toBe(true);
    }
  });
  it("always while reeling", () => {
    const w = step(action(shore(), 0, T0), T0 + CAST_FLIGHT_MS);
    const at = me(w).biteAt + 10;
    const f = me(reelHold(action(step(w, me(w).biteAt), 0, at), 0, true, at));
    expect(f.mode).toBe("reel");
    expect(needsTick(f, at)).toBe(true);
  });
  it("when the catch card ends", () => {
    const f: Fisher = { ...me(shore()), mode: "catch", catch: { fishId: "perch", cm: 20, shells: 1, isNew: false, golden: false, at: T0, seq: 1 } };
    expect(needsTick(f, T0 + CATCH_SHOW_MS - 1)).toBe(false);
    expect(needsTick(f, T0 + CATCH_SHOW_MS)).toBe(true);
    expect(needsTick({ ...f, catch: null }, T0 + 60_000)).toBe(false);
  });
});

describe("the coach reads a catch while its card is showing", () => {
  it("names the catch until the card's deadline, then moves on", () => {
    const lake = join(shore(), { name: "Dad", ogsId: null }).lake;
    const caught: Lake = {
      ...lake,
      fishers: lake.fishers.map((f) =>
        f.seat === 0 ? { ...f, mode: "catch", catch: { fishId: "perch", cm: 20, shells: 1, isNew: false, golden: false, at: T0, seq: 1 } } : f,
      ),
    };
    expect(coachLine(caught, 1, T0 + CATCH_SHOW_MS - 1)).toBe("Juneau caught a Stripy Perch, 20 cm.");
    expect(coachLine(caught, 1, T0 + CATCH_SHOW_MS)).not.toContain("caught");
  });
});

describe("the big button shakes while the fish thrashes", () => {
  it("shows a thrash exactly when the lake says the hooked fish is thrashing", () => {
    const w = step(action(shore(), 0, T0), T0 + CAST_FLIGHT_MS);
    const at = me(w).biteAt + 10;
    const lake = reelHold(action(step(w, me(w).biteAt), 0, at), 0, true, at);
    const f = me(lake);
    let seen = 0;
    for (let t = at; t < at + 10_000; t += 37) {
      const s = buttonState(lake, f, t);
      expect(s.kind === "reel" && s.thrashing).toBe(thrashing(f, t));
      if (thrashing(f, t)) seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
