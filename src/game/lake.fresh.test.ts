import { describe, expect, it } from "vitest";
import { GOLDEN_FIRST_MS, biterPool, chooseCatch, join, newLake, step, type BiteContext, type Lake } from "./lake";
import { worldFor } from "./regions";

const ctx = (freshPlace: boolean, known: (id: string) => boolean): BiteContext => ({
  water: "marsh", tod: "morning", tier: 0, swirl: "plain", species: 3, known, freshPlace,
});

describe("a new place keeps the coach's promise: its own fish first", () => {
  it("at a freshly found place the first catch is almost always a species the family hasn't met", () => {
    const pool = biterPool(ctx(true, () => false));
    const some = pool[0]!.id;
    // The family knows one of this water's fish (the commonest); the rest are new.
    const known = (id: string) => id === some;
    let fresh = 0;
    let seed = 1;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) if (!known(chooseCatch(ctx(true, known), r).id)) fresh++;
    let plain = 0;
    seed = 1;
    for (let i = 0; i < 400; i++) if (!known(chooseCatch(ctx(false, known), r).id)) plain++;
    expect(fresh / 400).toBeGreaterThan(0.8);
    expect(fresh).toBeGreaterThan(plain);
  });
});

describe("a golden swirl turns up where the family is", () => {
  const T0 = 1_000_000;
  const onTrail = { x: -35, z: 21.5 };
  it("not while they walk a trail (nobody could race there); it waits until they arrive", () => {
    let l: Lake = join(newLake(7, T0), { name: "A", ogsId: null }).lake;
    expect(worldFor(l.worldSeed).areaAt(onTrail)).toBeNull();
    l = { ...l, discovered: ["moonwell", "mistmarsh"], fishers: l.fishers.map((f) => ({ ...f, pos: onTrail, vel: { x: 0, z: 0 } })) };
    l = step(l, T0 + GOLDEN_FIRST_MS + 1);
    expect(l.swirls.some((s) => s.golden)).toBe(false);
    const marsh = worldFor(l.worldSeed).placeById("mistmarsh")!;
    l = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: { x: marsh.center.x + marsh.pond.r + 4, z: marsh.center.z } })) };
    l = step(l, T0 + GOLDEN_FIRST_MS + 60_000);
    expect(l.swirls.find((s) => s.golden)?.area).toBe("mistmarsh");
  });
});

describe("a golden swirl the family walks away from fades", () => {
  it("ends once nobody is within reach of it (no stale race calls from a place left behind)", () => {
    const T0 = 1_000_000;
    let l: Lake = join(newLake(7, T0), { name: "A", ogsId: null }).lake;
    l = step(l, T0 + GOLDEN_FIRST_MS + 1);
    const golden = l.swirls.find((s) => s.golden);
    expect(golden).toBeDefined();
    const marsh = worldFor(l.worldSeed).placeById("mistmarsh")!;
    l = { ...l, discovered: ["moonwell", "mistmarsh"], fishers: l.fishers.map((f) => ({ ...f, pos: { x: marsh.center.x + marsh.pond.r + 4, z: marsh.center.z }, vel: { x: 0, z: 0 } })) };
    l = step(l, T0 + GOLDEN_FIRST_MS + 5_000);
    const still = l.swirls.find((s) => s.id === golden!.id);
    expect(still === undefined || still.until <= T0 + GOLDEN_FIRST_MS + 5_000).toBe(true);
  });
});
