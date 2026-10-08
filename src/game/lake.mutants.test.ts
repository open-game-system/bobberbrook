import { describe, expect, it } from "vitest";
import { CAST_FLIGHT_MS, RESCUE_REEL_MS, action, chooseCatch, join, move, newLake, reelHold, setCampfire, setEasy, step, type Fisher, type Lake, type Swirl } from "./lake";
import { fishById } from "./fish";
import { DAY_MS } from "./daycycle";
import { EAST, WALK_SPEED, WEST, angleGap, castRing, lakeRadius } from "./world";

const T0 = 1_000_000;
const fisher = (lake: Lake, seat = 0) => lake.fishers.find((f) => f.seat === seat)!;
const swirl = (over: Partial<Swirl> = {}): Swirl => ({ id: 99, area: "moonwell", pos: castRing(WEST), theta: WEST, golden: false, since: T0, until: T0 + 1e6, catches: 0, ...over });

function lakeWith(n: number, seed = 7): Lake {
  let lake = newLake(seed, T0);
  for (let i = 0; i < n; i++) lake = join(lake, { name: `P${i}`, ogsId: null }).lake;
  return lake;
}

/** Seat 0 standing on the shore at an angle. */
function onShore(lake: Lake, theta = WEST, swirls: Swirl[] = []): Lake {
  const r = lakeRadius(theta) + 1;
  const pos = { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
  return { ...lake, swirls, fishers: lake.fishers.map((f) => (f.seat === 0 ? { ...f, pos, vel: { x: 0, z: 0 } } : f)) };
}

/** Hooks a fish for seat 0 and returns its reel (fishing from the shore at `theta`). */
function hookOne(lake: Lake, theta = WEST, swirls: Swirl[] = []): NonNullable<Fisher["reel"]> {
  const waiting = step(action(onShore(lake, theta, swirls), 0, lake.now), lake.now + CAST_FLIGHT_MS);
  const at = fisher(waiting).biteAt + 1;
  return fisher(action(step(waiting, at - 1), 0, at)).reel!;
}

describe("one step covers everything that happened since the last", () => {
  it("goes from a cast through the wait to the bite in a single step", () => {
    const cast = action(onShore(lakeWith(1)), 0, T0);
    const waited = step(cast, T0 + CAST_FLIGHT_MS);
    const biteAt = fisher(waited).biteAt;
    expect(fisher(step(cast, biteAt)).mode).toBe("bite");
  });
  it("hooks an easy fisher's fish and reels it in the same step", () => {
    const waiting = step(action(setEasy(onShore(lakeWith(1)), 0, true), 0, T0), T0 + CAST_FLIGHT_MS);
    const later = fisher(waiting).biteAt + 1000;
    expect(fisher(step(waiting, later)).reel!.at).toBe(later);
  });
  it("counts at most eight changes in one step: missed bites stop piling up", () => {
    const cast = action(onShore(lakeWith(1)), 0, T0);
    const f = fisher(step(cast, T0 + 60 * 60_000));
    expect(f.mode).toBe("bite");
    expect(f.missSeq).toBe(3);
  });
});

describe("reeling, in detail", () => {
  it("lands a fish reeled all the way in before the rescue", () => {
    const easy = setEasy(onShore(lakeWith(1)), 0, true);
    const waiting = step(action(easy, 0, T0), T0 + CAST_FLIGHT_MS);
    const hookAt = fisher(waiting).biteAt + 450;
    let lake = reelHold(step(waiting, hookAt), 0, true, hookAt);
    let t = hookAt;
    while (fisher(lake).mode === "reel") lake = step(lake, (t += 100));
    expect(t).toBeLessThan(hookAt + RESCUE_REEL_MS);
  });
  it("seeds each fight from the room's rolls", () => {
    const seeds = [1, 2, 3, 4, 5, 6].map((s) => hookOne(lakeWith(1, s)).seed);
    expect(seeds.every((s) => Number.isInteger(s) && s >= 0 && s < 2 ** 31)).toBe(true);
    expect(seeds.some((s) => s > 1000)).toBe(true);
    expect(new Set(seeds).size).toBe(6);
  });
});

describe("what a hook brings up", () => {
  it("varies with the room's rolls", () => {
    const ids = new Set(Array.from({ length: 40 }, (_, s) => hookOne(lakeWith(1, s + 1)).fishId));
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
  it("keeps the glowing fish up in the Hollow and the Tarn, not at Moonwell Lake by day or night", () => {
    const night = (s: number) => {
      const l = lakeWith(1, s + 1);
      return { ...l, startedAt: T0 - 0.5 * DAY_MS };
    };
    const atNight = Array.from({ length: 80 }, (_, s) => hookOne(night(s)).fishId);
    const byDay = Array.from({ length: 80 }, (_, s) => hookOne(lakeWith(1, s + 1)).fishId);
    expect(atNight).not.toContain("glowfin");
    expect(byDay).not.toContain("glowfin");
    expect(new Set(atNight).size).toBeGreaterThanOrEqual(3);
  });
  it("brings up junk now and then outside swirls", () => {
    const ids = Array.from({ length: 300 }, (_, s) => hookOne(lakeWith(1, s + 1), Math.PI / 4).fishId);
    expect(ids.some((id) => fishById(id)?.rarity === "junk")).toBe(true);
  });
  it("brings up only rare fish (or treasure) in a golden swirl", () => {
    for (let s = 1; s < 40; s++) {
      const r = hookOne(lakeWith(1, s), WEST, [swirl({ golden: true })]);
      expect(["rare", "treasure"]).toContain(fishById(r.fishId)!.rarity);
    }
  });
  it("counts the swirl the fisher is in, not another one", () => {
    const far = swirl({ id: 1, golden: true, pos: castRing(EAST), theta: EAST });
    const lake = onShore(lakeWith(1), WEST, [far, swirl()]);
    const cast = action(lake, 0, T0);
    expect(fisher(cast).swirlId).toBe(99);
    const waiting = step(cast, T0 + CAST_FLIGHT_MS);
    const at = fisher(waiting).biteAt + 1;
    const hooked = action(step(waiting, at - 1), 0, at);
    const landed = step(hooked, at + RESCUE_REEL_MS);
    expect(fisher(landed).catch!.golden).toBe(false);
    expect(landed.swirls.find((s) => s.id === 99)!.catches).toBe(1);
    expect(landed.swirls.find((s) => s.id === 1)!.catches).toBe(0);
  });
  it("casts into plain water when no swirl is near", () => {
    const lake = onShore(lakeWith(1), WEST, [swirl({ pos: castRing(EAST), theta: EAST })]);
    const f = fisher(action(lake, 0, T0));
    expect(f.swirlId).toBeNull();
    expect(f.bobber).not.toEqual(castRing(EAST));
  });
});

describe("swirls, in detail", () => {
  it("counts its rolls", () => {
    expect(newLake(3, T0).rngN).toBeGreaterThanOrEqual(2);
  });
  it("starts with two plain swirls", () => {
    expect(newLake(3, T0).swirls.map((s) => s.golden)).toEqual([false, false]);
  });
  it("comes back golden four minutes after the last golden swirl", () => {
    const first = step(lakeWith(1), T0 + 150_000);
    expect(first.nextGoldenAt).toBe(T0 + 150_000 + 240_000);
  });
  it("brings a golden swirl even with plain ones about, but never a second golden one", () => {
    const plainOnly = step({ ...lakeWith(1), swirls: [swirl({ id: 5 })] }, T0 + 150_000);
    expect(plainOnly.swirls.filter((s) => s.golden)).toHaveLength(1);
    const both = step({ ...lakeWith(1), swirls: [swirl({ id: 5 }), swirl({ id: 6, golden: true })] }, T0 + 150_000);
    expect(both.swirls.filter((s) => s.golden).map((s) => s.id)).toEqual([6]);
  });
  it("keeps a new swirl apart from all the others", () => {
    let apart = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const lake = step(newLake(seed, T0), T0 + 150_000);
      const g = lake.swirls.find((s) => s.golden)!;
      if (lake.swirls.every((s) => s === g || angleGap(s.theta, g.theta) > 1.0)) apart++;
    }
    expect(apart).toBeGreaterThanOrEqual(54);
  });
  it("frees only the fishers of a swirl that ran out", () => {
    let lake = onShore(lakeWith(2), WEST, [swirl(), swirl({ id: 7, area: "moonwell", pos: castRing(EAST), theta: EAST, until: T0 + 10 })]);
    lake = action(lake, 0, T0);
    lake = step(lake, T0 + 10);
    expect(fisher(lake).swirlId).toBe(99);
  });
});

describe("players, in detail", () => {
  it("starts a fisher with no nibbles", () => {
    expect(fisher(lakeWith(1)).nibbles).toEqual([]);
  });
  it("moves only the fisher whose stick it is, east as asked", () => {
    const lake = move(lakeWith(2), 1, { x: 1, y: 0 }, T0);
    expect(fisher(lake, 0).vel).toEqual({ x: 0, z: 0 });
    const x = fisher(lake, 1).pos.x;
    expect(fisher(step(lake, T0 + 500), 1).pos.x).toBeCloseTo(x + WALK_SPEED * 0.5, 6);
  });
  it("faces the bobber when casting from anywhere round the lake", () => {
    const theta = 0.9;
    const f = fisher(action(onShore(lakeWith(1), theta), 0, T0));
    expect(angleGap(f.facing, theta + Math.PI)).toBeLessThan(1e-9);
  });
  it("leaves lines in the water when the campfire ends, and stops everyone when it starts", () => {
    const casting = action(onShore(lakeWith(1)), 0, T0);
    expect(fisher(setCampfire(casting, false, T0 + 1)).mode).toBe("cast");
    const walking = move(lakeWith(1), 0, { x: 1, y: 0 }, T0);
    expect(fisher(setCampfire(walking, true, T0 + 1)).vel).toEqual({ x: 0, z: 0 });
  });
});

describe("junk rolls", () => {
  it("doesn't spend a roll on junk where there is none", () => {
    const rolls = [0.5, 0, 0.99];
    let i = 0;
    const ctx = { water: "falls" as const, tod: "morning" as const, tier: 0, swirl: "none" as const, species: 0, known: () => true };
    // The second roll picks the fish: 0 is the first fish in the pool.
    expect(chooseCatch(ctx, () => rolls[i++]!).id).toBe("brook-trout");
  });
});

describe("bites, at the edges", () => {
  it("lets the fish go exactly when the bite window closes", () => {
    const waiting = step(action(onShore(lakeWith(1)), 0, T0), T0 + CAST_FLIGHT_MS);
    const f = fisher(step(waiting, fisher(waiting).biteAt));
    expect(fisher(step(waiting, f.biteUntil - 1)).missSeq).toBe(0);
    expect(fisher(step(waiting, f.biteUntil)).missSeq).toBe(1);
  });
  it("brings species the family already knows a little less often", () => {
    const bluegills = (journal: Lake["journal"]) =>
      Array.from({ length: 300 }, (_, s) => hookOne({ ...lakeWith(1, s + 1), journal })).filter((r) => r.fishId === "bluegill").length;
    const unknown = bluegills({});
    const known = bluegills({ bluegill: { count: 1, bestCm: 20, firstBy: null } });
    expect(unknown).toBeGreaterThan(0);
    expect(known).toBeLessThan(unknown);
  });
});
