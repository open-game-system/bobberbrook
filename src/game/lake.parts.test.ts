import { describe, expect, it } from "vitest";
import {
  CATCH_SKIP_MS, GOLDEN_CATCHES, GOLDEN_EVERY_MS, GOLDEN_FIRST_MS, GOLDEN_LIFE_MS, LOG_LENGTH, RESCUE_REEL_MS, ROD_AT,
  SWIRL_CATCHES, SWIRL_LIFE_MS, action, biterPool, canCast, catchWeight, chooseCatch, countsInJournal, heldStill, join, journalAfter, landedCatch,
  loadProgress, move, newLake, reelHold, setCampfire, setEasy, step, stickVelocity, swirlSpent, todOf, type Catch, type Fisher, type Lake,
  type Swirl,
} from "./lake";
import { fishById, type FishDef } from "./fish";
import { REEL_START } from "./reel";
import { WALK_SPEED, WEST, angleGap, castRing, lakeRadius, spawnPoint } from "./world";

const T0 = 1_000_000;
const fisher = (lake: Lake, seat = 0) => lake.fishers.find((f) => f.seat === seat)!;
const fish = (id: string): FishDef => fishById(id)!;
const shown = (at: number): Catch => ({ fishId: "perch", cm: 20, shells: 1, isNew: false, golden: false, at, seq: 1 });
const swirl = (over: Partial<Swirl> = {}): Swirl => ({ id: 99, area: "moonwell", pos: castRing(WEST), theta: WEST, golden: false, since: T0, until: T0 + 1e6, catches: 0, ...over });

function lakeWith(n: number, seed = 7): Lake {
  let lake = newLake(seed, T0);
  for (let i = 0; i < n; i++) lake = join(lake, { name: `P${i}`, ogsId: null }).lake;
  return lake;
}

/** Seat 0 on the lily shore, standing still, with the given swirls (none by default). */
function atLilyShore(lake: Lake, swirls: Swirl[] = []): Lake {
  const r = lakeRadius(WEST) + 1;
  return { ...lake, swirls, fishers: lake.fishers.map((f) => (f.seat === 0 ? { ...f, pos: { x: -r, z: 0 }, vel: { x: 0, z: 0 } } : f)) };
}

function withFisher0(lake: Lake, over: Partial<Fisher>): Lake {
  return { ...lake, fishers: lake.fishers.map((f) => (f.seat === 0 ? { ...f, ...over } : f)) };
}

/** Casts seat 0 and lets the bobber settle; returns the lake when the fish bites. */
function toBite(lake: Lake, at = T0): Lake {
  const waiting = step(action(lake, 0, at), at + 900);
  return step(waiting, fisher(waiting).biteAt);
}

/** Hooks a fish and lands it straight away (a reel at full progress). */
function landNow(lake: Lake, fishId: string, cm = 30): { lake: Lake; at: number } {
  const bitten = toBite(lake, lake.now);
  const at = fisher(bitten).biteAt + 10;
  const hooked = action(bitten, 0, at);
  const reel = { ...fisher(hooked).reel!, fishId, cm };
  // Nobody reels: the rescue lands it.
  const landedAt = at + RESCUE_REEL_MS;
  return { lake: step(withFisher0(hooked, { reel }), landedAt), at: landedAt };
}

describe("swirls run out", () => {
  it("at the end of their life, or after their catches (golden ones sooner)", () => {
    expect(swirlSpent({ until: T0, catches: 0, golden: false }, T0 - 1)).toBe(false);
    expect(swirlSpent({ until: T0, catches: 0, golden: false }, T0)).toBe(true);
    expect(swirlSpent({ until: T0, catches: SWIRL_CATCHES - 1, golden: false }, 0)).toBe(false);
    expect(swirlSpent({ until: T0, catches: SWIRL_CATCHES, golden: false }, 0)).toBe(true);
    expect(swirlSpent({ until: T0, catches: GOLDEN_CATCHES - 1, golden: true }, 0)).toBe(false);
    expect(swirlSpent({ until: T0, catches: GOLDEN_CATCHES, golden: true }, 0)).toBe(true);
  });
  it("new swirls live their life and keep apart from the others", () => {
    for (let seed = 1; seed < 30; seed++) {
      const lake = newLake(seed, T0);
      const [a, b] = lake.swirls;
      expect(lake.swirlSeq).toBe(2);
      expect(lake.swirls.map((s) => s.id)).toEqual([1, 2]);
      expect(a!.until).toBe(T0 + SWIRL_LIFE_MS);
      expect(a!.since).toBe(T0);
      expect(a!.golden).toBe(false);
      expect(a!.catches).toBe(0);
      expect(a!.pos).toEqual(castRing(a!.theta));
      expect(angleGap(a!.theta, b!.theta)).toBeGreaterThan(1.0);
    }
  });
  it("replaces a spent plain swirl with a fresh one and frees whoever fished it", () => {
    let lake = atLilyShore(lakeWith(1), [swirl()]);
    lake = action(lake, 0, T0);
    expect(fisher(lake).swirlId).toBe(99);
    lake = step({ ...lake, swirls: [swirl({ until: T0 + 10 })] }, T0 + 10);
    expect(lake.swirls.map((s) => s.id)).toEqual([lake.swirlSeq]);
    expect(lake.swirls[0]!.since).toBe(T0 + 10);
    expect(fisher(lake).swirlId).toBeNull();
  });
  it("keeps a live swirl and its fisher", () => {
    let lake = atLilyShore(lakeWith(1), [swirl()]);
    lake = step(action(lake, 0, T0), T0 + 10);
    expect(lake.swirls.map((s) => s.id)).toEqual([99]);
    expect(fisher(lake).swirlId).toBe(99);
  });
  it("does not replace a spent golden swirl", () => {
    const lake = step({ ...lakeWith(1), swirls: [swirl({ golden: true, until: T0 + 5 })] }, T0 + 5);
    expect(lake.swirls).toEqual([]);
  });
  it("brings the golden swirl first after a while, then every few minutes, one at a time", () => {
    const lake = lakeWith(1);
    expect(lake.nextGoldenAt).toBe(T0 + GOLDEN_FIRST_MS);
    expect(step(lake, T0 + GOLDEN_FIRST_MS - 1).swirls.some((s) => s.golden)).toBe(false);
    const golden = step(lake, T0 + GOLDEN_FIRST_MS);
    const g = golden.swirls.find((s) => s.golden)!;
    expect(g.until).toBe(T0 + GOLDEN_FIRST_MS + GOLDEN_LIFE_MS);
    expect(golden.nextGoldenAt).toBe(T0 + GOLDEN_FIRST_MS + GOLDEN_EVERY_MS);
    const kept = { ...lake, swirls: [swirl({ golden: true, id: 5 })] };
    const again = step(kept, T0 + GOLDEN_FIRST_MS);
    expect(again.swirls.filter((s) => s.golden).map((s) => s.id)).toEqual([5]);
    expect(again.nextGoldenAt).toBe(T0 + GOLDEN_FIRST_MS + GOLDEN_EVERY_MS);
  });
});

describe("what bites, in detail", () => {
  const ctx = { water: "lily" as const, tod: "morning" as const, tier: 0, swirl: "none" as const, species: 0, known: () => true };
  it("weighs commons, uncommons and rares, more so with a better rod", () => {
    expect(catchWeight(fish("perch"), ctx)).toBe(60);
    expect(catchWeight(fish("perch"), { ...ctx, tier: 3 })).toBe(60);
    expect(catchWeight(fish("pike"), ctx)).toBe(30);
    expect(catchWeight(fish("pike"), { ...ctx, tier: 2 })).toBe(40);
    expect(catchWeight(fish("salmon"), ctx)).toBe(9);
    expect(catchWeight(fish("salmon"), { ...ctx, tier: 2 })).toBe(17);
  });
  it("boosts uncommon and rare fish in a plain swirl, not in a golden one", () => {
    expect(catchWeight(fish("perch"), { ...ctx, swirl: "plain" })).toBe(60);
    expect(catchWeight(fish("pike"), { ...ctx, swirl: "plain" })).toBe(45);
    expect(catchWeight(fish("salmon"), { ...ctx, swirl: "plain" })).toBe(22.5);
    expect(catchWeight(fish("salmon"), { ...ctx, swirl: "golden" })).toBe(9);
  });
  it("favours species the family hasn't met", () => {
    expect(catchWeight(fish("perch"), { ...ctx, known: (id) => id !== "perch" })).toBe(96);
  });
  it("pools the fish of this water and time, never the legendary one", () => {
    const pool = biterPool({ water: "lily", tod: "night", swirl: "plain" }).map((f) => f.id);
    expect(pool).toContain("lily-carp");
    expect(pool).not.toContain("glowfin");
    expect(pool).not.toContain("moonfin");
    expect(pool).not.toContain("salmon");
    expect(pool).not.toContain("golden-koi");
  });
  it("pools only rares in a golden swirl", () => {
    expect(biterPool({ water: "marsh", tod: "golden", swirl: "golden" }).map((f) => f.id)).toEqual(["golden-koi", "ember-shiner", "puffer"]);
    expect(biterPool({ water: "lily", tod: "golden", swirl: "golden" }).map((f) => f.id)).toEqual(["puffer"]);
    expect(biterPool({ water: "reeds", tod: "morning", swirl: "golden" }).map((f) => f.id)).toEqual(["puffer"]);
  });
  it("finds treasure more often in a golden swirl", () => {
    const once = (x: number) => () => x;
    expect(chooseCatch({ ...ctx, swirl: "golden" }, once(0.09)).id).toBe("chest");
    expect(chooseCatch({ ...ctx, swirl: "golden" }, once(0.1)).id).not.toBe("chest");
    expect(chooseCatch(ctx, once(0.019)).id).toBe("chest");
    expect(chooseCatch(ctx, once(0.02)).id).not.toBe("chest");
  });
  it("picks junk from this water by the third roll", () => {
    const rolls = (...xs: number[]) => {
      let i = 0;
      return () => xs[i++]!;
    };
    expect(chooseCatch({ ...ctx, water: "shore" }, rolls(0.5, 0.049, 0)).id).toBe("boot");
    expect(chooseCatch({ ...ctx, water: "shore" }, rolls(0.5, 0.049, 0.99)).id).toBe("teapot");
    expect(chooseCatch({ ...ctx, water: "shore" }, rolls(0.5, 0.05, 0)).rarity).not.toBe("junk");
    expect(chooseCatch({ ...ctx, water: "falls" }, rolls(0.5, 0.5)).rarity).not.toBe("junk");
  });
  it("raises the Moonfin only below the 0.3 roll", () => {
    const night = { ...ctx, water: "tarn" as const, swirl: "plain" as const, tod: "night" as const, species: 8 };
    const rolls = (...xs: number[]) => {
      let i = 0;
      return () => xs[i++ % xs.length]!;
    };
    expect(chooseCatch(night, rolls(0.5, 0.29)).id).toBe("moonfin");
    expect(chooseCatch(night, rolls(0.5, 0.3)).id).not.toBe("moonfin");
    expect(chooseCatch({ ...night, tod: "golden" }, rolls(0.5, 0.1)).id).not.toBe("moonfin");
    expect(chooseCatch({ ...night, swirl: "golden" }, rolls(0.5, 0.1)).id).toBe("moonfin");
  });
});

describe("standing still and casting", () => {
  it("reads the stick: a dead zone, full speed on a diagonal, up is north", () => {
    expect(stickVelocity({ x: 0.15, y: 0 })).toBeNull();
    expect(stickVelocity({ x: 0.16, y: 0 })).toEqual({ x: 0.16 * WALK_SPEED, z: -0 });
    expect(stickVelocity({ x: 0, y: 0.5 })).toEqual({ x: 0, z: -0.5 * WALK_SPEED });
    expect(stickVelocity({ x: 0, y: -1 })).toEqual({ x: 0, z: WALK_SPEED });
    const v = stickVelocity({ x: 3, y: 4 })!;
    expect(v.x).toBeCloseTo(0.6 * WALK_SPEED, 9);
    expect(v.z).toBeCloseTo(-0.8 * WALK_SPEED, 9);
  });
  it("holds a fisher still while reeling and just after a catch", () => {
    expect(heldStill({ mode: "reel", catch: null }, 0)).toBe(true);
    expect(heldStill({ mode: "catch", catch: shown(T0) }, T0 + CATCH_SKIP_MS - 1)).toBe(true);
    expect(heldStill({ mode: "catch", catch: shown(T0) }, T0 + CATCH_SKIP_MS)).toBe(false);
    expect(heldStill({ mode: "catch", catch: null }, T0)).toBe(false);
    expect(heldStill({ mode: "walk", catch: shown(T0) }, T0)).toBe(false);
  });
  it("casts while walking, or once a catch card has been seen", () => {
    expect(canCast({ mode: "walk", catch: null }, 0)).toBe(true);
    expect(canCast({ mode: "catch", catch: shown(T0) }, T0 + CATCH_SKIP_MS - 1)).toBe(false);
    expect(canCast({ mode: "catch", catch: shown(T0) }, T0 + CATCH_SKIP_MS)).toBe(true);
    expect(canCast({ mode: "catch", catch: null }, T0 + CATCH_SKIP_MS)).toBe(false);
    for (const mode of ["cast", "wait", "reel"] as const) expect(canCast({ mode, catch: shown(0) }, T0)).toBe(false);
  });
  it("faces where it walks, and keeps facing when the stick lets go", () => {
    let lake = move(lakeWith(1), 0, { x: 1, y: 0 }, T0);
    expect(fisher(lake).facing).toBeCloseTo(0, 9);
    lake = move(lake, 0, { x: 0, y: -1 }, T0 + 10);
    expect(fisher(lake).facing).toBeCloseTo(Math.PI / 2, 9);
    lake = move(lake, 0, { x: 0, y: 0 }, T0 + 20);
    expect(fisher(lake).facing).toBeCloseTo(Math.PI / 2, 9);
    expect(fisher(lake).vel).toEqual({ x: 0, z: 0 });
  });
  it("leaves a waiting line out when the stick only wobbles", () => {
    let lake = action(atLilyShore(lakeWith(1)), 0, T0);
    lake = move(lake, 0, { x: 0.1, y: 0 }, T0 + 10);
    expect(fisher(lake).mode).toBe("cast");
    expect(fisher(lake).bobber).not.toBeNull();
  });
  it("walks off a bite and frees its swirl", () => {
    let lake = toBite(atLilyShore(lakeWith(1), [swirl()]));
    lake = move(lake, 0, { x: 1, y: 0 }, lake.now + 1);
    expect(fisher(lake).mode).toBe("walk");
    expect(fisher(lake).swirlId).toBeNull();
  });
  it("casts into a nearby swirl, facing the bobber, and clears an old catch", () => {
    const { lake: landed, at } = landNow(atLilyShore(lakeWith(1), [swirl()]), "perch");
    const lake = action(landed, 0, at + CATCH_SKIP_MS);
    const f = fisher(lake);
    expect(f.mode).toBe("cast");
    expect(f.castAt).toBe(at + CATCH_SKIP_MS);
    expect(f.bobber).toEqual(castRing(WEST));
    expect(f.catch).toBeNull();
    expect(f.vel).toEqual({ x: 0, z: 0 });
    expect(f.facing).toBeCloseTo(Math.atan2(f.bobber!.z - f.pos.z, f.bobber!.x - f.pos.x), 9);
  });
  it("ignores players who aren't seated", () => {
    const lake = lakeWith(1);
    expect(action(lake, 3, T0)).toBe(lake);
    expect(move(lake, 3, { x: 1, y: 0 }, T0)).toBe(lake);
  });
  it("only holds the reel while reeling", () => {
    const lake = atLilyShore(lakeWith(1));
    expect(fisher(reelHold(lake, 0, true, T0)).reel).toBeNull();
    const bitten = toBite(lake);
    const hooked = action(bitten, 0, bitten.now + 1);
    expect(fisher(hooked).reel!.holding).toBe(false);
    expect(fisher(reelHold(hooked, 0, true, hooked.now)).reel!.holding).toBe(true);
  });
});

describe("bites, in detail", () => {
  it("bites sooner in a swirl, sooner still in a golden one, and sooner for an easy fisher", () => {
    const waitFor = (lake: Lake) => {
      const w = step(action(lake, 0, T0), T0 + 900);
      return fisher(w).biteAt - (T0 + 900);
    };
    for (let seed = 1; seed < 40; seed++) {
      const open = waitFor(atLilyShore(lakeWith(1, seed)));
      expect(open).toBeGreaterThanOrEqual(2800);
      expect(open).toBeLessThan(6500);
      const easy = waitFor(setEasy(atLilyShore(lakeWith(1, seed)), 0, true));
      expect(easy).toBeCloseTo(open * 0.75, 6);
      const plain = waitFor(atLilyShore(lakeWith(1, seed), [swirl()]));
      expect(plain).toBeGreaterThanOrEqual(1200);
      expect(plain).toBeLessThan(2600);
      const golden = waitFor(atLilyShore(lakeWith(1, seed), [swirl({ golden: true })]));
      expect(golden).toBeGreaterThanOrEqual(900);
      expect(golden).toBeLessThan(1800);
    }
  });
  it("bites sooner with a better rod", () => {
    const waitFor = (lake: Lake) => {
      const w = step(action(lake, 0, T0), T0 + 900);
      return fisher(w).biteAt - (T0 + 900);
    };
    const base = atLilyShore(lakeWith(1, 4));
    expect(waitFor({ ...base, rodTier: 2 })).toBeCloseTo(waitFor(base) * 0.8, 6);
  });
  it("nibbles one to three times, in order, before the bite", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed < 60; seed++) {
      const w = step(action(atLilyShore(lakeWith(1, seed)), 0, T0), T0 + 900);
      const f = fisher(w);
      counts.add(f.nibbles.length);
      const span = f.biteAt - (T0 + 900);
      const n = f.nibbles.length;
      f.nibbles.forEach((t, i) => {
        expect(t).toBeGreaterThanOrEqual(T0 + 900 + (span * (i + 0.4)) / (n + 0.5));
        expect(t).toBeLessThanOrEqual(T0 + 900 + (span * (i + 0.8)) / (n + 0.5));
      });
    }
    expect([...counts].sort()).toEqual([1, 2, 3]);
  });
  it("bites exactly when due, not a moment before", () => {
    const w = step(action(atLilyShore(lakeWith(1)), 0, T0), T0 + 899);
    expect(fisher(w).mode).toBe("cast");
    const waiting = step(w, T0 + 900);
    expect(fisher(step(waiting, fisher(waiting).biteAt - 1)).mode).toBe("wait");
  });
  it("lets an easy fisher's fish bite a moment before it hooks itself", () => {
    const lake = toBite(setEasy(atLilyShore(lakeWith(1)), 0, true));
    const biteAt = fisher(lake).biteAt;
    expect(fisher(step(lake, biteAt + 449)).mode).toBe("bite");
    const hooked = step(lake, biteAt + 450);
    expect(fisher(hooked).reel!.hookAt).toBe(biteAt + 450);
  });
  it("hooks a fish of its size range, at the start of the reel", () => {
    for (let seed = 1; seed < 30; seed++) {
      const bitten = toBite(atLilyShore(lakeWith(1, seed)));
      const at = fisher(bitten).biteAt + 5;
      const reel = fisher(action(bitten, 0, at)).reel!;
      const def = fish(reel.fishId);
      expect(reel.cm).toBeGreaterThanOrEqual(def.cm[0]);
      expect(reel.cm).toBeLessThanOrEqual(def.cm[1]);
      expect(Number.isInteger(reel.cm)).toBe(true);
      expect(reel.progress).toBe(REEL_START);
      expect(reel.hookAt).toBe(at);
      expect(reel.at).toBe(at);
      expect(reel.seed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("landing a catch", () => {
  it("writes the journal: count, best size, and who caught the first", () => {
    expect(journalAfter(undefined, 20, "Juneau")).toEqual({ count: 1, bestCm: 20, firstBy: "Juneau" });
    expect(journalAfter({ count: 2, bestCm: 30, firstBy: "Dad" }, 25, "Juneau")).toEqual({ count: 3, bestCm: 30, firstBy: "Dad" });
    expect(journalAfter({ count: 2, bestCm: 30, firstBy: null }, 35, "Juneau")).toEqual({ count: 3, bestCm: 35, firstBy: "Juneau" });
  });
  it("values a catch by rarity, doubled from a golden swirl, new only for unmet journal fish", () => {
    const met = { pike: { count: 1, bestCm: 40, firstBy: null } };
    expect(landedCatch(fish("moonfin"), 99, false, {})).toEqual({ fishId: "moonfin", cm: 99, shells: 12, isNew: true, golden: false });
    expect(landedCatch(fish("pike"), 50, true, met)).toEqual({ fishId: "pike", cm: 50, shells: 4, isNew: false, golden: true });
    expect(landedCatch(fish("pike"), 50, false, { pike: { count: 0, bestCm: 0, firstBy: null } }).isNew).toBe(true);
    expect(landedCatch(fish("boot"), 25, true, {})).toMatchObject({ shells: 0, isNew: false });
  });
  it("keeps junk and treasure out of the journal", () => {
    expect(countsInJournal(fish("perch"))).toBe(true);
    expect(countsInJournal(fish("moonfin"))).toBe(true);
    expect(countsInJournal(fish("boot"))).toBe(false);
    expect(countsInJournal(fish("chest"))).toBe(false);
  });
  it("records a catch: shells, the journal, the log and the catch card", () => {
    const { lake, at } = landNow(atLilyShore(lakeWith(1)), "pike", 55);
    const f = fisher(lake);
    expect(f.catch).toEqual({ fishId: "pike", cm: 55, shells: 2, isNew: true, golden: false, at, seq: 1 });
    expect(f.mode).toBe("catch");
    expect(f.reel).toBeNull();
    expect(f.bobber).toBeNull();
    expect(lake.shells).toBe(2);
    expect(lake.catchSeq).toBe(1);
    expect(lake.journal.pike).toEqual({ count: 1, bestCm: 55, firstBy: "P0" });
    expect(lake.log).toEqual([{ seat: 0, fishId: "pike", cm: 55, isNew: true, at }]);
    const second = landNow(step(lake, at + 4000), "pike", 40).lake;
    expect(fisher(second).catch!.isNew).toBe(false);
    expect(fisher(second).catch!.seq).toBe(2);
    expect(second.journal.pike).toEqual({ count: 2, bestCm: 55, firstBy: "P0" });
  });
  it("doubles the shells from a golden swirl and counts the swirl's catches", () => {
    const { lake } = landNow(atLilyShore(lakeWith(1), [swirl({ golden: true })]), "golden-koi");
    expect(fisher(lake).catch!.golden).toBe(true);
    expect(fisher(lake).catch!.shells).toBe(8);
    expect(lake.swirls[0]!.catches).toBe(1);
  });
  it("brings up treasure without a journal entry", () => {
    const { lake } = landNow(atLilyShore(lakeWith(1)), "chest");
    expect(fisher(lake).catch!.isNew).toBe(false);
    expect(fisher(lake).catch!.shells).toBe(8);
    expect(lake.journal).toEqual({});
  });
  it("upgrades the rod when the family passes a milestone, once", () => {
    const near = { ...atLilyShore(lakeWith(1)), shells: ROD_AT[1] - 2 };
    const { lake, at } = landNow(near, "pike");
    expect(lake.rodTier).toBe(1);
    expect(lake.upgradeSeq).toBe(1);
    const more = landNow(step(lake, at + 4000), "perch").lake;
    expect(more.rodTier).toBe(1);
    expect(more.upgradeSeq).toBe(1);
  });
  it("keeps the last forty catches in the log", () => {
    const old = Array.from({ length: LOG_LENGTH }, (_, i) => ({ seat: 1, fishId: "perch", cm: i, isNew: false, at: i }));
    const { lake } = landNow({ ...atLilyShore(lakeWith(1)), log: old }, "pike");
    expect(lake.log).toHaveLength(LOG_LENGTH);
    expect(lake.log[0]!.cm).toBe(1);
    expect(lake.log.at(-1)!.fishId).toBe("pike");
  });
  it("shows the catch card for a while, then walks", () => {
    const { lake, at } = landNow(atLilyShore(lakeWith(1)), "perch");
    expect(fisher(step(lake, at + 3399)).mode).toBe("catch");
    expect(fisher(lake).catch!.at).toBe(at);
    expect(fisher(step(lake, at + 3400)).mode).toBe("walk");
  });
  it("lands a reeling fish when the campfire starts", () => {
    const bitten = toBite(atLilyShore(lakeWith(1)));
    const hooked = action(bitten, 0, bitten.now + 1);
    const fire = setCampfire(hooked, true, hooked.now + 2);
    expect(fire.catchSeq).toBe(1);
    expect(fisher(fire).catch).toBeNull();
    expect(fisher(fire).mode).toBe("walk");
    expect(fire.campfire).toBe(true);
  });
});

describe("joining, in detail", () => {
  it("starts a fisher at its spawn point, facing the lake, standing still", () => {
    const lake = step(newLake(1, T0), T0 + 50);
    const { lake: joined, seat } = join(lake, { name: "Mum", ogsId: "m" });
    const f = fisher(joined);
    expect(seat).toBe(0);
    expect(f).toMatchObject({ name: "Mum", ogsId: "m", easy: false, pos: spawnPoint(0), vel: { x: 0, z: 0 }, movedAt: T0 + 50, mode: "walk", missSeq: 0 });
    expect(f.facing).toBe(-Math.PI / 2);
  });
  it("fills the lowest free seat and keeps fishers in seat order", () => {
    const lake = lakeWith(3);
    const gap = { ...lake, fishers: lake.fishers.filter((f) => f.seat !== 1) };
    const { lake: joined, seat } = join(gap, { name: "New", ogsId: null });
    expect(seat).toBe(1);
    expect(joined.fishers.map((f) => f.seat)).toEqual([0, 1, 2]);
  });
  it("seats a guest without an OGS id even if another guest has none", () => {
    expect(join(lakeWith(1), { name: "X", ogsId: null }).seat).toBe(1);
  });
});

describe("easy mode and progress", () => {
  it("turns easy mode on and off for a seated fisher only", () => {
    const lake = setEasy(lakeWith(2), 1, true);
    expect(fisher(lake, 1).easy).toBe(true);
    expect(fisher(lake, 0).easy).toBe(false);
    expect(fisher(setEasy(lake, 1, false), 1).easy).toBe(false);
    expect(setEasy(lake, 3, true).fishers).toEqual(lake.fishers);
  });
  it("adds saved progress to what this room already caught", () => {
    const { lake } = landNow(atLilyShore(lakeWith(1)), "perch", 20);
    const merged = loadProgress(lake, { journal: { perch: { count: 4, bestCm: 18, firstBy: "Juneau" } }, shells: 59 });
    expect(merged.journal.perch).toEqual({ count: 5, bestCm: 20, firstBy: "Juneau" });
    expect(merged.shells).toBe(60);
    expect(merged.rodTier).toBe(2);
    expect(merged.progressLoaded).toBe(true);
    const keepMine = loadProgress(lake, { journal: { perch: { count: 1, bestCm: 30, firstBy: null } }, shells: 0 });
    expect(keepMine.journal.perch).toEqual({ count: 2, bestCm: 30, firstBy: "P0" });
  });
  it("tells the time of day from the room's clock", () => {
    expect(todOf({ startedAt: T0, now: T0 })).toBe("morning");
    expect(todOf({ startedAt: T0, now: T0 + 5 * 60_000 })).toBe("golden");
  });
});
