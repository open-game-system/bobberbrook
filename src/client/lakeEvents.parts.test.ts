import { describe, expect, it } from "vitest";
import { join, newLake, type Fisher, type Lake } from "../game/lake";
import { fisherEvents, lakeEvents } from "./lakeEvents";

const base: Fisher = join(newLake(1, 0), { name: "A", ogsId: null }).lake.fishers[0]!;
const at = (over: Partial<Fisher>): Fisher => ({ ...base, ...over });
const shown = { fishId: "pike", cm: 50, shells: 4, isNew: true, golden: true, at: 10, seq: 3 };

describe("one fisher's moments", () => {
  it("joins", () => {
    expect(fisherEvents(undefined, at({ seat: 2 }))).toEqual([{ kind: "joined", seat: 2 }]);
  });
  it("casts, bites and hooks on entering those modes only", () => {
    expect(fisherEvents(at({ mode: "walk" }), at({ mode: "cast" }))).toEqual([{ kind: "cast", seat: 0 }]);
    expect(fisherEvents(at({ mode: "cast" }), at({ mode: "cast" }))).toEqual([]);
    expect(fisherEvents(at({ mode: "wait" }), at({ mode: "bite" }))).toEqual([{ kind: "bite", seat: 0 }]);
    expect(fisherEvents(at({ mode: "bite" }), at({ mode: "bite" }))).toEqual([]);
    expect(fisherEvents(at({ mode: "bite" }), at({ mode: "reel" }))).toEqual([{ kind: "hooked", seat: 0 }]);
    expect(fisherEvents(at({ mode: "reel" }), at({ mode: "reel" }))).toEqual([]);
    expect(fisherEvents(at({ mode: "cast" }), at({ mode: "wait" }))).toEqual([]);
  });
  it("misses when the miss count goes up", () => {
    expect(fisherEvents(at({ mode: "bite", missSeq: 1 }), at({ mode: "wait", missSeq: 2 }))).toEqual([{ kind: "missed", seat: 0 }]);
    expect(fisherEvents(at({ missSeq: 2 }), at({ missSeq: 2 }))).toEqual([]);
  });
  it("catches a new catch with all it brought, once", () => {
    expect(fisherEvents(at({ mode: "reel" }), at({ mode: "catch", catch: shown }))).toEqual([
      { kind: "caught", seat: 0, fishId: "pike", isNew: true, golden: true, shells: 4 },
    ]);
    expect(fisherEvents(at({ catch: shown }), at({ catch: shown }))).toEqual([]);
    expect(fisherEvents(at({ catch: shown }), at({ catch: { ...shown, seq: 4 } }))).toHaveLength(1);
    expect(fisherEvents(at({ catch: shown }), at({ catch: null }))).toEqual([]);
  });
});

describe("the lake's moments", () => {
  const lake: Lake = newLake(1, 0);
  it("celebrates a rod upgrade with the new tier", () => {
    expect(lakeEvents(lake, { ...lake, upgradeSeq: 1, rodTier: 2 })).toEqual([{ kind: "upgrade", tier: 2 }]);
  });
  it("puts each fisher's moments first, in seat order", () => {
    const a = join(lake, { name: "A", ogsId: null }).lake;
    const b = join(a, { name: "B", ogsId: null }).lake;
    expect(lakeEvents(lake, { ...b, campfire: true })).toEqual([
      { kind: "joined", seat: 0 },
      { kind: "joined", seat: 1 },
      { kind: "campfire", on: true },
    ]);
  });
  it("ignores a new plain swirl and a golden one that was already there", () => {
    const golden = { id: 9, pos: { x: 0, z: 0 }, theta: 0, golden: true, since: 0, until: 1, catches: 0 };
    expect(lakeEvents(lake, { ...lake, swirls: [...lake.swirls, { ...golden, id: 10, golden: false }] })).toEqual([]);
    const withGolden = { ...lake, swirls: [golden] };
    expect(lakeEvents(withGolden, { ...withGolden, swirls: [{ ...golden }] })).toEqual([]);
  });
  it("hears the campfire end", () => {
    expect(lakeEvents({ ...lake, campfire: true }, lake)).toEqual([{ kind: "campfire", on: false }]);
  });
});
