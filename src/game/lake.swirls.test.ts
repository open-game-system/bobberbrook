import { describe, expect, it } from "vitest";
import { HOME_WORLD_SEED, keptSwirls, mergedEntry, wantsSwirl } from "./lake";
import { worldFor } from "./regions";

const swirl = (area: string, x: number, golden = false) => ({ area, pos: { x, z: 0 }, golden });

describe("keptSwirls", () => {
  const out = swirl("3,0", 1000);
  it("nobody here: every swirl stays (the same list)", () => {
    const all = [out];
    expect(keptSwirls(all, [])).toBe(all);
  });
  it("a generated place's swirl fades once everyone is over two cells away", () => {
    expect(keptSwirls([out], [{ pos: { x: 0, z: 0 } }])).toEqual([]);
    expect(keptSwirls([out], [{ pos: { x: 790, z: 0 } }])).toEqual([out]);
    expect(keptSwirls([out], [{ pos: { x: 0, z: 0 } }, { pos: { x: 990, z: 0 } }])).toEqual([out]);
  });
  it("golden and home-valley swirls always stay", () => {
    const g = swirl("3,0", 1000, true);
    const home = swirl("tarn", 1000);
    expect(keptSwirls([g, home], [{ pos: { x: 0, z: 0 } }])).toEqual([g, home]);
  });
});

describe("wantsSwirl", () => {
  const w = worldFor(HOME_WORLD_SEED);
  const places = w.placesNear({ x: 0, z: 0 }, 2);
  const gen = places.find((p) => !p.home)!;
  const home = places.find((p) => p.home)!;
  it("a found generated place with no swirl wants one", () => {
    expect(wantsSwirl({ discovered: [gen.id], swirls: [] }, gen)).toBe(true);
  });
  it("not when nowhere, at home, not found yet, or it already has one", () => {
    expect(wantsSwirl({ discovered: [gen.id], swirls: [] }, null)).toBe(false);
    expect(wantsSwirl({ discovered: [home.id], swirls: [] }, home)).toBe(false);
    expect(wantsSwirl({ discovered: [], swirls: [] }, gen)).toBe(false);
    const s = { id: 1, area: gen.id, pos: { x: 0, z: 0 }, theta: 0, golden: false, since: 0, until: 1, catches: 0 };
    expect(wantsSwirl({ discovered: [gen.id], swirls: [s] }, gen)).toBe(false);
  });
});

describe("mergedEntry", () => {
  it("a new fish: a copy of the saved entry", () => {
    const saved = { count: 2, bestCm: 30, firstBy: "Juneau" };
    const m = mergedEntry(undefined, saved);
    expect(m).toEqual(saved);
    expect(m).not.toBe(saved);
  });
  it("counts add, the best size wins, the saved first-catcher wins unless there is none", () => {
    expect(mergedEntry({ count: 1, bestCm: 40, firstBy: "Mum" }, { count: 2, bestCm: 30, firstBy: "Juneau" })).toEqual({ count: 3, bestCm: 40, firstBy: "Juneau" });
    expect(mergedEntry({ count: 1, bestCm: 20, firstBy: "Mum" }, { count: 2, bestCm: 30, firstBy: null })).toEqual({ count: 3, bestCm: 30, firstBy: "Mum" });
  });
});
