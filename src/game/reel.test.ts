import { describe, expect, it } from "vitest";
import { REEL_START, integrateReel, phaseLength, reelRate, thrashingAt, type Fight, type Reel } from "./reel";
import { between } from "./rng";

const fight: Fight = { calmMs: [1000, 2000], thrashMs: [300, 600], pull: 1 };
const reel = (over: Partial<Reel> = {}): Reel => ({ fishId: "pike", cm: 40, hookAt: 0, seed: 5, progress: 0.5, at: 0, holding: false, ...over });

describe("the fight's rhythm", () => {
  it("alternates calm stretches and thrashes, each from the hook's seed", () => {
    expect(phaseLength(fight, 5, 0)).toBe(between(5, 1000, 1000, 2000));
    expect(phaseLength(fight, 5, 1)).toBe(between(5, 1001, 300, 600));
    expect(phaseLength(fight, 5, 2)).toBe(between(5, 1002, 1000, 2000));
  });
  it("is calm first, then thrashes exactly at the end of the calm", () => {
    const calm = phaseLength(fight, 5, 0);
    const thrash = phaseLength(fight, 5, 1);
    expect(thrashingAt(fight, { hookAt: 100, seed: 5 }, 100)).toBe(false);
    expect(thrashingAt(fight, { hookAt: 100, seed: 5 }, 100 + calm - 1)).toBe(false);
    expect(thrashingAt(fight, { hookAt: 100, seed: 5 }, 100 + calm)).toBe(true);
    expect(thrashingAt(fight, { hookAt: 100, seed: 5 }, 100 + calm + thrash - 1)).toBe(true);
    expect(thrashingAt(fight, { hookAt: 100, seed: 5 }, 100 + calm + thrash)).toBe(false);
  });
  it("settles down after a very long fight", () => {
    expect(thrashingAt({ calmMs: [10, 10], thrashMs: [10, 10], pull: 1 }, { hookAt: 0, seed: 1 }, 1_000_000)).toBe(false);
  });
});

describe("reel speed", () => {
  const at = (o: Partial<Parameters<typeof reelRate>[0]>) => reelRate({ thrashing: false, holding: false, easy: false, tier: 0, pull: 1, ...o });
  it("reels in while holding in the calm, faster with a better rod, slower against a strong fish", () => {
    expect(at({ holding: true })).toBeCloseTo(0.3 / 1.15, 12);
    expect(at({ holding: true, tier: 2 })).toBeCloseTo((0.3 * 1.24) / 1.15, 12);
    expect(at({ holding: true, pull: 0 })).toBeCloseTo(0.3 / 0.8, 12);
  });
  it("slips back a little when let go in the calm, never for an easy fisher", () => {
    expect(at({})).toBe(-0.03);
    expect(at({ easy: true })).toBe(0);
  });
  it("holds still when let go during a thrash", () => {
    expect(at({ thrashing: true })).toBe(0);
    expect(at({ thrashing: true, easy: true })).toBe(0);
  });
  it("loses ground holding through a thrash, by the fish's pull; an easy fisher gains", () => {
    expect(at({ thrashing: true, holding: true, pull: 1.5 })).toBeCloseTo(-0.24, 12);
    expect(at({ thrashing: true, holding: true, easy: true })).toBe(0.08);
  });
});

describe("integrating a reel", () => {
  const opts = { easy: false, tier: 0 };
  it("does nothing for no time", () => {
    const r = reel({ at: 500 });
    expect(integrateReel(r, fight, 500, opts)).toBe(r);
    expect(integrateReel(r, fight, 400, opts)).toBe(r);
  });
  it("reels in through the calm at the calm rate", () => {
    const r = integrateReel(reel({ holding: true }), fight, 500, opts);
    expect(r.progress).toBeCloseTo(0.5 + (0.3 / 1.15) * 0.5, 12);
    expect(r.at).toBe(500);
  });
  it("integrates stretch by stretch from the middle of a fight", () => {
    const calm = phaseLength(fight, 5, 0);
    const thrash = phaseLength(fight, 5, 1);
    const start = reel({ holding: true, at: calm - 100 });
    const r = integrateReel(start, fight, calm + thrash + 100, opts);
    const expected = 0.5 + (0.3 / 1.15) * 0.1 - 0.16 * (thrash / 1000) + (0.3 / 1.15) * 0.1;
    expect(r.progress).toBeCloseTo(expected, 12);
  });
  it("matches stepping in small pieces", () => {
    let small = reel({ holding: true, progress: 0.2 });
    for (let t = 100; t <= 3000; t += 100) small = integrateReel(small, fight, t, opts);
    const big = integrateReel(reel({ holding: true, progress: 0.2 }), fight, 3000, opts);
    expect(big.progress).toBeCloseTo(small.progress, 9);
  });
  it("never drops below a little, and stops at landed", () => {
    expect(integrateReel(reel({ progress: 0.06 }), fight, 900, opts).progress).toBe(0.05);
    const landed = integrateReel(reel({ holding: true, progress: 0.99 }), fight, 10_000, opts);
    expect(landed.progress).toBe(1);
    expect(landed.at).toBe(10_000);
  });
  it("starts a fresh reel part of the way in", () => {
    expect(REEL_START).toBe(0.12);
  });
});
