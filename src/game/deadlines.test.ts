import { describe, expect, it } from "vitest";
import {
  BITE_WINDOW_MS, CAST_FLIGHT_MS, CATCH_SHOW_MS, EASY_HOOK_DELAY_MS,
  action, deadlineOf, join, newLake, reelHold, setCampfire, setEasy, step, thrashing, type Fisher, type Lake,
} from "./lake";
import { fishById } from "./fish";
import { phaseLength, thrashingAt } from "./reel";
import { WEST, lakeRadius } from "./world";

const T0 = 1_000_000;

/** One fisher standing at the west shore, no swirls, ready to cast. */
function shore(seed = 7): Lake {
  const lake = join(newLake(seed, T0), { name: "Juneau", ogsId: null }).lake;
  const r = lakeRadius(WEST) + 1;
  return { ...lake, swirls: [], fishers: lake.fishers.map((f) => ({ ...f, pos: { x: -r, z: 0 }, vel: { x: 0, z: 0 } })) };
}

const me = (lake: Lake): Fisher => lake.fishers[0]!;

function cast(lake: Lake): Lake {
  return action(lake, 0, T0);
}
function waiting(lake: Lake): Lake {
  return step(cast(lake), T0 + CAST_FLIGHT_MS);
}
function biting(lake: Lake): Lake {
  const w = waiting(lake);
  return step(w, me(w).biteAt);
}
function reeling(lake: Lake): Lake {
  const b = biting(lake);
  return reelHold(action(b, 0, me(b).biteAt + 10), 0, true, me(b).biteAt + 10);
}
function showingCatch(lake: Lake): Lake {
  let l = reeling(lake);
  for (let t = me(l).biteAt + 100; me(l).mode === "reel"; t += 100) l = step(l, t);
  return l;
}

describe("a fisher's deadline: when the room next moves it on by itself", () => {
  it("has none while walking", () => {
    expect(deadlineOf(me(shore()))).toBeNull();
  });
  it("is the moment a cast lands", () => {
    expect(deadlineOf(me(cast(shore())))).toBe(T0 + CAST_FLIGHT_MS);
  });
  it("is the bite while waiting", () => {
    const f = me(waiting(shore()));
    expect(deadlineOf(f)).toBe(f.biteAt);
  });
  it("is the end of the bite window while biting", () => {
    const f = me(biting(shore()));
    expect(f.mode).toBe("bite");
    expect(deadlineOf(f)).toBe(f.biteUntil);
    expect(f.biteUntil).toBe(f.biteAt + BITE_WINDOW_MS);
  });
  it("is the self-hook for an easy fisher's bite", () => {
    const f = me(biting(setEasy(shore(), 0, true)));
    expect(f.mode).toBe("bite");
    expect(deadlineOf(f)).toBe(f.biteAt + EASY_HOOK_DELAY_MS);
  });
  it("has none while reeling: the reel moves continuously", () => {
    expect(me(reeling(shore())).mode).toBe("reel");
    expect(deadlineOf(me(reeling(shore())))).toBeNull();
  });
  it("is the end of the catch card", () => {
    const f = me(showingCatch(shore()));
    expect(f.mode).toBe("catch");
    expect(deadlineOf(f)).toBe(f.catch!.at + CATCH_SHOW_MS);
  });
  it("has none in the catch mode without a catch", () => {
    expect(deadlineOf({ ...me(shore()), mode: "catch", catch: null })).toBeNull();
  });
  it("has none at the campfire", () => {
    expect(deadlineOf(me(setCampfire(waiting(shore()), true, T0 + CAST_FLIGHT_MS)))).toBeNull();
  });
});

describe("the room keeps each deadline exactly", () => {
  const cases: [string, (l: Lake) => Lake][] = [
    ["a landing cast", cast],
    ["a coming bite", waiting],
    ["a bite getting away", biting],
    ["an easy fisher's self-hook", (l) => biting(setEasy(l, 0, true))],
    ["a catch card ending", showingCatch],
  ];
  for (const [name, at] of cases) {
    it(`moves on at ${name}, not a millisecond before`, () => {
      for (const seed of [1, 7, 42, 1234]) {
        const lake = at(shore(seed));
        const due = deadlineOf(me(lake));
        expect(due).not.toBeNull();
        const before = step(lake, due! - 1);
        expect(me(before).mode).toBe(me(lake).mode);
        expect(me(step(lake, due!)).mode).not.toBe(me(lake).mode);
      }
    });
  }
});

describe("a room that wakes late catches up as if it had been there", () => {
  /** Steps every 100 ms from `from` to `to`, like a TV ticking. */
  function ticked(lake: Lake, from: number, to: number): Lake {
    let l = lake;
    for (let t = from; t < to; t += 100) l = step(l, t);
    return step(l, to);
  }
  it("schedules bites and misses from their deadlines, not from the late tick", () => {
    for (const seed of [1, 7, 42, 1234]) {
      const lake = cast(shore(seed));
      const late = T0 + 25_000;
      expect(step(lake, late)).toEqual(ticked(lake, T0, late));
    }
  });
  it("hooks an easy fisher's fish at the deadline, not at the late tick", () => {
    for (const seed of [1, 7, 42, 1234]) {
      const lake = biting(setEasy(shore(seed), 0, true));
      const late = me(lake).biteAt + EASY_HOOK_DELAY_MS + 1500;
      const once = step(lake, late);
      expect(me(once).mode).toBe("reel");
      expect(me(once).reel!.hookAt).toBe(me(lake).biteAt + EASY_HOOK_DELAY_MS);
      expect(once).toEqual(ticked(lake, me(lake).biteAt, late));
    }
  });
});

describe("thrashing: whether the hooked fish is pulling back right now", () => {
  it("is never true unless reeling", () => {
    for (const l of [shore(), cast(shore()), waiting(shore()), biting(shore()), showingCatch(shore())]) {
      for (let t = T0; t < T0 + 20_000; t += 250) expect(thrashing(me(l), t)).toBe(false);
    }
  });
  it("follows the hooked fish's fight: calm first, then a thrash", () => {
    const f = me(reeling(shore()));
    const reel = f.reel!;
    const fight = fishById(reel.fishId)!.fight;
    const calm = phaseLength(fight, reel.seed, 0);
    expect(thrashing(f, reel.hookAt)).toBe(false);
    expect(thrashing(f, reel.hookAt + calm - 1)).toBe(false);
    expect(thrashing(f, reel.hookAt + calm)).toBe(true);
    for (let t = reel.hookAt; t < reel.hookAt + 15_000; t += 37) expect(thrashing(f, t)).toBe(thrashingAt(fight, reel, t));
  });
  it("is false for a fisher that has stopped reeling, whatever reel it still carries", () => {
    const f = me(reeling(shore()));
    const done: Fisher = { ...f, mode: "catch" };
    for (let t = f.reel!.hookAt; t < f.reel!.hookAt + 15_000; t += 37) expect(thrashing(done, t)).toBe(false);
  });
  it("is false for a reel on a fish the lake doesn't know", () => {
    const f = me(reeling(shore()));
    const stray: Fisher = { ...f, reel: { ...f.reel!, fishId: "no-such-fish" } };
    for (let t = f.reel!.hookAt; t < f.reel!.hookAt + 10_000; t += 100) expect(thrashing(stray, t)).toBe(false);
  });
});
