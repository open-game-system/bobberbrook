import { describe, expect, it } from "vitest";
import { between, pickWeighted, rand } from "./rng";

describe("rand", () => {
  it("is deterministic per seed and counter", () => {
    expect(rand(42, 3)).toBe(rand(42, 3));
    expect(rand(42, 3)).not.toBe(rand(42, 4));
    expect(rand(42, 3)).not.toBe(rand(43, 3));
  });
  it("stays in [0, 1)", () => {
    for (let i = 0; i < 2000; i++) {
      const r = rand(7, i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
  it("spreads values (no bucket of ten holds more than 15%)", () => {
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 5000; i++) buckets[Math.floor(rand(99, i) * 10)]! += 1;
    for (const b of buckets) expect(b).toBeLessThan(750);
  });
});

describe("between", () => {
  it("maps into the range", () => {
    for (let i = 0; i < 200; i++) {
      const v = between(1, i, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
    }
  });
});

describe("pickWeighted", () => {
  it("picks by cumulative weight", () => {
    expect(pickWeighted([1, 1, 2], 0)).toBe(0);
    expect(pickWeighted([1, 1, 2], 0.24)).toBe(0);
    expect(pickWeighted([1, 1, 2], 0.26)).toBe(1);
    expect(pickWeighted([1, 1, 2], 0.51)).toBe(2);
    expect(pickWeighted([1, 1, 2], 0.999)).toBe(2);
  });
  it("skips zero weights", () => {
    expect(pickWeighted([0, 5, 0], 0)).toBe(1);
    expect(pickWeighted([0, 5, 0], 0.99)).toBe(1);
  });
});
