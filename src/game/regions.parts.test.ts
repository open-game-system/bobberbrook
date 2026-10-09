import { describe, expect, it } from "vitest";
import { adjacent, cellKey, farShore, homeLinked, isSea, samePair, tracePath, wildLinked, type Cell } from "./regions";

describe("adjacent", () => {
  it("only the four next-door cells", () => {
    expect(adjacent({ i: 0, j: 0 }, { i: 1, j: 0 })).toBe(true);
    expect(adjacent({ i: 0, j: 0 }, { i: 0, j: -1 })).toBe(true);
    expect(adjacent({ i: 0, j: 0 }, { i: 1, j: 1 })).toBe(false);
    expect(adjacent({ i: 0, j: 0 }, { i: 0, j: 0 })).toBe(false);
    expect(adjacent({ i: 0, j: 0 }, { i: 2, j: 0 })).toBe(false);
  });
});

describe("samePair", () => {
  it("either way round, never half a match", () => {
    expect(samePair("a", "b", "a", "b")).toBe(true);
    expect(samePair("b", "a", "a", "b")).toBe(true);
    expect(samePair("a", "c", "a", "b")).toBe(false);
    expect(samePair("c", "a", "a", "b")).toBe(false);
    expect(samePair("a", "a", "a", "b")).toBe(false);
  });
});

describe("homeLinked", () => {
  it("two home places: joined only where a hand-made trail runs", () => {
    expect(homeLinked("0,0", "-1,0")).toBe(true);
    expect(homeLinked("-1,0", "0,0")).toBe(true);
    expect(homeLinked("1,0", "1,-1")).toBe(true);
  });
  it("home to the generated world: only the listed exits, either way round", () => {
    expect(homeLinked("0,0", "0,1")).toBe(true);
    expect(homeLinked("0,1", "0,0")).toBe(true);
    expect(homeLinked("-1,0", "-2,0")).toBe(true);
    expect(homeLinked("1,0", "2,0")).toBe(true);
    expect(homeLinked("0,-1", "1,-1")).toBe(homeLinked("1,-1", "0,-1"));
    expect(homeLinked("-1,0", "-1,-1")).toBe(false);
  });
});

describe("wildLinked", () => {
  const seed = 7;
  const cells: Cell[] = [];
  for (let i = 3; i <= 8; i++) for (let j = -2; j <= 2; j++) if (!isSea(seed, { i, j })) cells.push({ i, j });
  it("is symmetric", () => {
    for (const a of cells) for (const b of [{ i: a.i + 1, j: a.j }, { i: a.i, j: a.j + 1 }]) expect(wildLinked(seed, a, b)).toBe(wildLinked(seed, b, a));
  });
  it("every generated land cell with an inland neighbour is joined to one of them", () => {
    for (const c of cells) {
      const inward = [{ i: c.i - 1, j: c.j }, { i: c.i, j: c.j + (c.j > 0 ? -1 : 1) }].filter((n) => Math.max(Math.abs(n.i), Math.abs(n.j)) < Math.max(Math.abs(c.i), Math.abs(c.j)) && !isSea(seed, n));
      if (inward.length === 0) continue;
      expect(inward.some((n) => wildLinked(seed, c, n))).toBe(true);
    }
  });
  it("joins some, but not all, sideways pairs (by the seed)", () => {
    const pairs = cells.map((c) => wildLinked(seed, c, { i: c.i, j: c.j + 1 }));
    expect(pairs.some(Boolean)).toBe(true);
    expect(pairs.every(Boolean)).toBe(false);
  });
});

describe("farShore", () => {
  it("never over the home valley: the second cell out", () => {
    expect(farShore(1, { i: 0, j: 0 }, { i: 1, j: 0 })).toEqual({ i: 2, j: 0 });
    expect(farShore(1, { i: 0, j: 0 }, { i: 0, j: -1 })).toEqual({ i: 0, j: -2 });
  });
  it("the first land cell past the sea, or null when it is sea all the way", () => {
    const seed = 3;
    let found = 0;
    let none = 0;
    for (let i = -12; i <= 12; i++)
      for (let j = -12; j <= 12; j++) {
        const c = { i, j };
        const d = { i: 1, j: 0 };
        const out = farShore(seed, c, d);
        const ks = [2, 3, 4, 5, 6].find((k) => !isSea(seed, { i: i + k, j }));
        expect(out).toEqual(ks === undefined ? null : { i: i + ks, j });
        if (out && ks !== undefined && ks > 2) found++;
        if (!out) none++;
      }
    expect(found).toBeGreaterThan(0);
    expect(none + found).toBeGreaterThan(0);
  });
});

describe("tracePath", () => {
  const a = { i: 0, j: 0 };
  const b = { i: 1, j: 0 };
  const c = { i: 2, j: 0 };
  it("from to itself: just that cell", () => {
    expect(tracePath(new Map(), a, a)).toEqual([a]);
  });
  it("walks predecessors back to the start", () => {
    const prev = new Map([[cellKey(b), a], [cellKey(c), b]]);
    expect(tracePath(prev, a, c)).toEqual([a, b, c]);
  });
  it("never reached: no path", () => {
    expect(tracePath(new Map([[cellKey(b), a]]), a, c)).toEqual([]);
  });
});
