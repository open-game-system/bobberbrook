import { describe, expect, it } from "vitest";
import {
  BITE_WINDOW_MS, CAST_FLIGHT_MS, CATCH_SHOW_MS, EASY_HOOK_DELAY_MS, GOLDEN_FIRST_MS, MAX_FISHERS, ROD_AT, SWIRL_CATCHES,
  action, chooseCatch, join, loadProgress, move, newLake, progressOf, reelHold, rodTierFor, setCampfire, setEasy, speciesCount, step,
  type Lake,
} from "./lake";
import { fishById } from "./fish";
import { DOCK, WEST, castRing, lakeRadius } from "./world";

const T0 = 1_000_000;

function lakeWith(n: number, seed = 7): Lake {
  let lake = newLake(seed, T0);
  for (let i = 0; i < n; i++) lake = join(lake, { name: `P${i}`, ogsId: null }).lake;
  return lake;
}

/** Puts seat 0 at the west shore (lily pads), standing still. */
function atLilyShore(lake: Lake): Lake {
  const r = lakeRadius(WEST) + 1;
  return { ...lake, fishers: lake.fishers.map((f) => (f.seat === 0 ? { ...f, pos: { x: -r, z: 0 }, vel: { x: 0, z: 0 } } : f)), swirls: [] };
}

const fisher = (lake: Lake, seat = 0) => lake.fishers.find((f) => f.seat === seat)!;

/** Holds the reel until the fish lands (letting go during thrashes is not needed to land eventually). */
function reelIn(lake: Lake, at: number): { lake: Lake; at: number } {
  let l = reelHold(lake, 0, true, at);
  let t = at;
  while (fisher(l).mode === "reel" && t < at + 30_000) {
    t += 100;
    l = step(l, t);
  }
  return { lake: l, at: t };
}

describe("joining", () => {
  it("seats up to four fishers in seat order with their colours", () => {
    const lake = lakeWith(4);
    expect(lake.fishers.map((f) => f.seat)).toEqual([0, 1, 2, 3]);
    expect(lake.fishers.map((f) => f.color)).toEqual(["green", "yellow", "blue", "pink"]);
    expect(join(lake, { name: "Extra", ogsId: null }).seat).toBeNull();
    expect(MAX_FISHERS).toBe(4);
  });
  it("gives an OGS player their own seat back", () => {
    let lake = newLake(1, T0);
    lake = join(lake, { name: "Dad", ogsId: "p1" }).lake;
    lake = join(lake, { name: "Juneau", ogsId: "p2" }).lake;
    const again = join(lake, { name: "Dad", ogsId: "p1" });
    expect(again.seat).toBe(0);
    expect(again.lake.fishers).toHaveLength(2);
  });
  it("starts with two swirls on the lake", () => {
    expect(newLake(3, T0).swirls).toHaveLength(2);
  });
});

describe("walking", () => {
  it("moves with the stick (up is north) and stops when it's let go", () => {
    let lake = lakeWith(1);
    const start = fisher(lake).pos;
    lake = move(lake, 0, { x: 0, y: 1 }, T0);
    lake = move(lake, 0, { x: 0, y: 0 }, T0 + 500);
    const p = fisher(lake).pos;
    expect(p.z).toBeLessThan(start.z - 1.5);
    lake = step(lake, T0 + 3000);
    expect(fisher(lake).pos).toEqual(p);
  });
  it("caps a diagonal stick at full speed", () => {
    let lake = lakeWith(1);
    lake = move(lake, 0, { x: 1, y: 1 }, T0);
    expect(Math.hypot(fisher(lake).vel.x, fisher(lake).vel.z)).toBeCloseTo(4.2, 5);
  });
  it("ignores a tiny wobble of the stick", () => {
    const lake = move(lakeWith(1), 0, { x: 0.1, y: 0 }, T0);
    expect(fisher(lake).vel).toEqual({ x: 0, z: 0 });
  });
});

describe("a whole catch", () => {
  it("casts, waits, bites, hooks, reels and lands a fish into the journal", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    expect(fisher(lake).mode).toBe("cast");
    expect(fisher(lake).water).toBe("lily");
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    expect(fisher(lake).mode).toBe("wait");
    const f = fisher(lake);
    expect(f.nibbles.length).toBeGreaterThanOrEqual(1);
    expect(f.nibbles.every((t) => t > T0 && t < f.biteAt)).toBe(true);
    lake = step(lake, f.biteAt);
    expect(fisher(lake).mode).toBe("bite");
    lake = action(lake, 0, f.biteAt + 300);
    expect(fisher(lake).mode).toBe("reel");
    const fishId = fisher(lake).reel!.fishId;
    const done = reelIn(lake, f.biteAt + 300);
    lake = done.lake;
    const c = fisher(lake).catch!;
    expect(fisher(lake).mode).toBe("catch");
    expect(c.fishId).toBe(fishId);
    expect(c.isNew).toBe(fishById(fishId)!.rarity !== "junk" && fishById(fishId)!.rarity !== "treasure");
    expect(lake.shells).toBe(c.shells);
    expect(lake.log.at(-1)?.fishId).toBe(fishId);
    lake = step(lake, c.at + CATCH_SHOW_MS);
    expect(fisher(lake).mode).toBe("walk");
  });

  it("can't cast away from the water", () => {
    const lake = action(lakeWith(1), 0, T0);
    expect(fisher(lake).mode).toBe("walk");
  });

  it("lets a missed bite splash away and waits for the next one", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    const f = fisher(lake);
    lake = step(lake, f.biteUntil + 1);
    expect(fisher(lake).mode).toBe("wait");
    expect(fisher(lake).missSeq).toBe(1);
    expect(fisher(lake).biteAt).toBeGreaterThan(f.biteUntil);
  });

  it("hooks by itself for an easy fisher, and never loses ground while reeling", () => {
    let lake = setEasy(atLilyShore(lakeWith(1)), 0, true);
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    const biteAt = fisher(lake).biteAt;
    lake = step(lake, biteAt + EASY_HOOK_DELAY_MS);
    expect(fisher(lake).mode).toBe("reel");
    lake = reelHold(lake, 0, true, biteAt + EASY_HOOK_DELAY_MS);
    let last = fisher(lake).reel!.progress;
    for (let t = biteAt + 600; fisher(lake).mode === "reel"; t += 100) {
      lake = step(lake, t);
      const p = fisher(lake).reel?.progress ?? 1;
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(fisher(lake).mode).toBe("catch");
  });

  it("does nothing on an early press while waiting", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    const before = fisher(lake);
    lake = action(lake, 0, T0 + CAST_FLIGHT_MS + 10);
    expect(fisher(lake).mode).toBe("wait");
    expect(fisher(lake).biteAt).toBe(before.biteAt);
  });

  it("reels the line in when the fisher walks off", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    lake = move(lake, 0, { x: 1, y: 0 }, T0 + 2000);
    expect(fisher(lake).mode).toBe("walk");
    expect(fisher(lake).bobber).toBeNull();
  });

  it("holds the fisher still while reeling", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    lake = action(lake, 0, fisher(lake).biteAt + 10);
    lake = move(lake, 0, { x: 1, y: 0 }, fisher(lake).biteAt + 50);
    expect(fisher(lake).mode).toBe("reel");
    expect(fisher(lake).vel).toEqual({ x: 0, z: 0 });
  });

  it("lands even a fish nobody reels after the rescue time", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    const at = fisher(lake).biteAt + 10;
    lake = action(lake, 0, at);
    lake = step(lake, at + 20_001);
    expect(fisher(lake).mode).toBe("catch");
  });

  it("can skip a catch card by casting again once it has been seen", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    lake = action(lake, 0, fisher(lake).biteAt + 10);
    const { lake: landed, at } = reelIn(lake, fisher(lake).biteAt + 10);
    expect(fisher(action(landed, 0, at + 100)).mode).toBe("catch");
    expect(fisher(action(landed, 0, at + 1300)).mode).toBe("cast");
  });
});

describe("swirls", () => {
  it("pulls a cast near a swirl into it and bites faster there", () => {
    let lake = lakeWith(1);
    const r = lakeRadius(WEST) + 1;
    lake = { ...lake, fishers: lake.fishers.map((f) => ({ ...f, pos: { x: -r, z: 0 } })) };
    lake = { ...lake, swirls: [{ id: 99, pos: castRing(WEST), theta: WEST, golden: false, since: T0, until: T0 + 1e6, catches: 0 }] };
    lake = action(lake, 0, T0);
    expect(fisher(lake).swirlId).toBe(99);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    expect(fisher(lake).biteAt - (T0 + CAST_FLIGHT_MS)).toBeLessThanOrEqual(2600);
  });

  it("moves on after enough catches", () => {
    let lake = lakeWith(1);
    lake = { ...lake, swirls: [{ id: 99, pos: castRing(WEST), theta: WEST, golden: false, since: T0, until: T0 + 1e6, catches: SWIRL_CATCHES }] };
    lake = step(lake, T0 + 10);
    expect(lake.swirls.map((s) => s.id)).not.toContain(99);
    expect(lake.swirls).toHaveLength(1);
  });

  it("brings a golden swirl now and then", () => {
    const lake = step(lakeWith(1), T0 + GOLDEN_FIRST_MS + 1);
    expect(lake.swirls.some((s) => s.golden)).toBe(true);
  });
});

describe("what bites", () => {
  const base = { water: "lily" as const, tod: "morning" as const, tier: 0, swirl: "none" as const, species: 0, known: () => false };
  const seq = (...xs: number[]) => {
    let i = 0;
    return () => xs[i++ % xs.length]!;
  };
  it("only gives fish that live in that water at that time", () => {
    for (let i = 0; i < 200; i++) {
      const f = chooseCatch(base, seq(0.5, 0.5, (i * 0.61) % 1));
      expect(f.waters).toContain("lily");
      expect(f.when === "night" || f.when === "golden").toBe(false);
    }
  });
  it("gives treasure on a lucky roll", () => {
    expect(chooseCatch(base, seq(0.01)).id).toBe("chest");
  });
  it("gives junk only outside swirls", () => {
    expect(chooseCatch({ ...base, water: "shore" }, seq(0.5, 0.01, 0.0)).rarity).toBe("junk");
    expect(chooseCatch({ ...base, water: "shore", swirl: "plain" }, seq(0.5, 0.01, 0.0)).rarity).not.toBe("junk");
  });
  it("raises the Moonfin from a night swirl once the journal is full enough", () => {
    expect(chooseCatch({ ...base, swirl: "plain", tod: "night", species: 10 }, seq(0.5, 0.1)).id).toBe("moonfin");
    expect(chooseCatch({ ...base, swirl: "plain", tod: "night", species: 9 }, seq(0.5, 0.1)).id).not.toBe("moonfin");
    expect(chooseCatch({ ...base, swirl: "none", tod: "night", species: 12 }, seq(0.5, 0.5, 0.1)).id).not.toBe("moonfin");
  });
  it("gives only rare fish in a golden swirl", () => {
    for (let i = 0; i < 50; i++) expect(chooseCatch({ ...base, water: "falls", swirl: "golden" }, seq(0.5, (i * 0.37) % 1)).rarity).toBe("rare");
  });
  it("lets golden-hour fish bite at golden hour", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 300; i++) ids.add(chooseCatch({ ...base, tod: "golden" }, seq(0.5, 0.5, (i * 0.137) % 1)).id);
    expect(ids.has("golden-koi")).toBe(true);
  });
});

describe("rods and progress", () => {
  it("upgrades the rod at shell milestones", () => {
    expect(ROD_AT.map(rodTierFor)).toEqual([0, 1, 2, 3]);
    expect(rodTierFor(ROD_AT[1] - 1)).toBe(0);
  });
  it("merges saved progress once", () => {
    let lake = lakeWith(1);
    const saved = { journal: { perch: { count: 3, bestCm: 22, firstBy: "Juneau" }, nope: { count: 1, bestCm: 1, firstBy: null } }, shells: 25 };
    lake = loadProgress(lake, saved);
    expect(lake.journal.perch?.count).toBe(3);
    expect(lake.journal.nope).toBeUndefined();
    expect(lake.rodTier).toBe(1);
    expect(speciesCount(lake.journal)).toBe(1);
    expect(loadProgress(lake, saved)).toBe(lake);
    expect(progressOf(lake).shells).toBe(25);
  });
});

describe("campfire", () => {
  it("brings everyone in from the water and stops play until it ends", () => {
    let lake = atLilyShore(lakeWith(2));
    lake = action(lake, 0, T0);
    lake = setCampfire(lake, true, T0 + 100);
    expect(fisher(lake).mode).toBe("walk");
    expect(fisher(lake).bobber).toBeNull();
    expect(fisher(action(lake, 0, T0 + 200)).mode).toBe("walk");
    lake = setCampfire(lake, false, T0 + 300);
    expect(fisher(action(lake, 0, T0 + 400)).mode).toBe("cast");
  });
});

describe("the dock", () => {
  it("is its own water", () => {
    let lake = lakeWith(1);
    lake = { ...lake, swirls: [], fishers: lake.fishers.map((f) => ({ ...f, pos: { x: 0, z: DOCK.tipZ + 0.5 } })) };
    expect(fisher(action(lake, 0, T0)).water).toBe("dock");
  });
});

describe("time", () => {
  it("never goes backwards", () => {
    const lake = step(lakeWith(1), T0 + 100);
    expect(step(lake, T0 + 50)).toBe(lake);
  });
  it("waits a bite window before giving up on a bite", () => {
    let lake = atLilyShore(lakeWith(1));
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + CAST_FLIGHT_MS);
    const f = fisher(lake);
    expect(f.biteUntil - f.biteAt).toBe(BITE_WINDOW_MS);
  });
});
