import { describe, expect, it } from "vitest";
import { BOARD_MS, PLATFORM_REACH, boardingPlatform, join, newLake, step, type Lake } from "./lake";
import { BIOMES, REGION, cellKey, createWorld, isSea, worldFor, type Cell, type Platform } from "./regions";
import { distance } from "./world";

const seed = 12345;

describe("the endless valley", () => {
  it("is the same world for the same seed, and a different one for another", () => {
    const a = createWorld(seed).placeAt({ i: 4, j: -3 });
    const b = createWorld(seed).placeAt({ i: 4, j: -3 });
    expect(a).toEqual(b);
    const names = new Set([3, 4, 5, 6, 7].map((s) => createWorld(s).placeAt({ i: 2, j: 2 })?.name ?? "sea"));
    expect(names.size).toBeGreaterThan(2);
  });
  it("keeps the hand-made home valley at the centre", () => {
    const w = worldFor(seed);
    expect(w.placeAt({ i: 0, j: 0 })?.id).toBe("moonwell");
    expect(w.placeAt({ i: -1, j: 0 })?.id).toBe("mistmarsh");
    expect(w.placeById("tarn")?.cell).toEqual({ i: 1, j: -1 });
  });
  it("goes on forever: far places exist, with names, biomes and ponds in their own cell", () => {
    const w = worldFor(seed);
    let land = 0;
    for (let i = -30; i <= 30; i += 6)
      for (let j = -30; j <= 30; j += 6) {
        const p = w.placeAt({ i, j });
        if (!p || p.home) continue;
        land++;
        expect(p.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
        expect(BIOMES).toContain(p.biome);
        expect(Math.abs(p.center.x - i * REGION)).toBeLessThanOrEqual(15);
      }
    expect(land).toBeGreaterThan(60);
  });
  it("has seas somewhere out there, never near home", () => {
    let seas = 0;
    for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) if (isSea(seed, { i, j })) seas++;
    expect(seas).toBeGreaterThan(10);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) expect(isSea(seed, { i, j })).toBe(false);
  });
  it("joins places by trails both ways, and you can walk out from home a long way", () => {
    const w = worldFor(seed);
    expect(w.linked({ i: 0, j: 0 }, { i: 0, j: 1 })).toBe(true);
    expect(w.linked({ i: 0, j: 1 }, { i: 0, j: 0 })).toBe(true);
    const seen = new Set(["0,0"]);
    const queue: Cell[] = [{ i: 0, j: 0 }];
    while (queue.length > 0 && seen.size < 200) {
      const c = queue.shift()!;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = { i: c.i + d[0], j: c.j + d[1] };
        if (!seen.has(cellKey(n)) && w.linked(c, n)) {
          seen.add(cellKey(n));
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(60);
  });
  it("walks from Moonwell Lake down the south trail into a generated place and casts into its own water", () => {
    const w = worldFor(seed);
    const south = w.placeAt({ i: 0, j: 1 })!;
    let p = { x: 0, z: 20 };
    for (let i = 0; i < 400 && !(w.areaAt(p)?.id === south.id && w.castFrom(p)); i++) {
      // Follow the trails there; once in the clearing, walk straight down to the water.
      const way = w.areaAt(p)?.id === south.id ? south.center : w.navNext(p, south.center);
      const dd = distance(way, p) || 1;
      p = w.advance(p, { x: ((way.x - p.x) / dd) * 5, z: ((way.z - p.z) / dd) * 5 }, 0.2);
    }
    expect(w.areaAt(p)?.id).toBe(south.id);
    expect(w.castFrom(p)?.water).toBe(south.biome);
  });
  it("puts a zeppelin tower at Moonwell Lake, standing on walkable ground", () => {
    const w = worldFor(seed);
    const zep = w.platformsNear({ x: 0, z: 0 }, 0).filter((p) => p.kind === "zeppelin");
    expect(zep.length).toBeGreaterThan(0);
    for (const z of zep) expect(w.walkable(z.at)).toBe(true);
  });
});

describe("riding a zeppelin", () => {
  const T0 = 10_000;
  it("leaves once the family has stood at the tower together, flies, and sets them down far away", () => {
    let l: Lake = { ...join(join(newLake(1, T0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake, worldSeed: seed };
    const w = worldFor(seed);
    const zep = w.platformsNear({ x: 0, z: 0 }, 0).find((p) => p.kind === "zeppelin")!;
    l = { ...l, fishers: l.fishers.map((f, i) => ({ ...f, pos: { x: zep.at.x + (i ? 1 : -1), z: zep.at.z } })) };
    l = step(l, T0 + 10);
    expect(l.boarding?.platformId).toBe(zep.id);
    l = step(l, T0 + 10 + BOARD_MS);
    expect(l.ride?.toPlace).toBe(zep.toPlace);
    expect(l.fishers.every((f) => f.mode === "ride")).toBe(true);
    const mid = step(l, (l.ride!.departAt + l.ride!.arriveAt) / 2);
    expect(distance(mid.fishers[0]!.pos, zep.at)).toBeGreaterThan(20);
    const landed = step(mid, l.ride!.arriveAt + 1);
    expect(landed.ride).toBeNull();
    expect(landed.fishers.every((f) => f.mode === "walk")).toBe(true);
    expect(distance(landed.fishers[0]!.pos, zep.to)).toBeLessThan(PLATFORM_REACH + 6);
    expect(landed.discovered).toContain(zep.toPlace);
    expect(landed.revealed.length).toBeGreaterThan(mid.revealed.length - 1);
  });
  it("finds only the place it lands at, not the places it flies over (one name per trip)", () => {
    let l: Lake = { ...join(join(newLake(1, T0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake, worldSeed: seed };
    const zep = worldFor(seed).platformsNear({ x: 0, z: 0 }, 0).find((p) => p.kind === "zeppelin")!;
    l = { ...l, fishers: l.fishers.map((f, i) => ({ ...f, pos: { x: zep.at.x + (i ? 1 : -1), z: zep.at.z } })) };
    l = step(step(l, T0 + 10), T0 + 10 + BOARD_MS);
    const before = l.discovered.length;
    for (let t = l.ride!.departAt; t < l.ride!.arriveAt; t += 250) l = step(l, t);
    expect(l.discovered.length).toBe(before);
    l = step(l, l.ride!.arriveAt + 1);
    expect(l.discovered.slice(before)).toEqual([zep.toPlace]);
  });
  it("keeps the mooring it started boarding while everyone is still on it (no flip to the next mooring's destination)", () => {
    const w = worldFor(seed);
    const all = w.platformsNear({ x: 0, z: 0 }, 0).filter((x) => x.kind === "zeppelin");
    // Two neighbouring moorings (side by side round the tower).
    const pairs = all.flatMap((a, i) => all.slice(i + 1).map((b): [Platform, Platform] => [a, b]));
    const [p, q] = pairs.reduce((best, pq) => (Math.hypot(pq[0].at.x - pq[1].at.x, pq[0].at.z - pq[1].at.z) < Math.hypot(best[0].at.x - best[1].at.x, best[0].at.z - best[1].at.z) ? pq : best));
    const d = Math.hypot(q.at.x - p.at.x, q.at.z - p.at.z);
    const toward = (m: number) => ({ x: p.at.x + ((q.at.x - p.at.x) / d) * m, z: p.at.z + ((q.at.z - p.at.z) / d) * m });
    // Both a little nearer q in sum, but still within reach of p.
    // Moorings round one tower are close enough that the middle between two is within reach of both.
    expect(d / 2 + 0.05).toBeLessThanOrEqual(PLATFORM_REACH);
    const fishers = [{ pos: toward(d / 2 + 0.05) }, { pos: toward(d / 2 + 0.05) }];
    expect(boardingPlatform(p.id, fishers, w)?.id).toBe(p.id);
    expect(boardingPlatform(null, fishers, w)?.id).toBe(q.id);
  });
  it("doesn't leave while someone is still elsewhere", () => {
    let l: Lake = { ...join(join(newLake(1, T0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake, worldSeed: seed };
    const zep = worldFor(seed).platformsNear({ x: 0, z: 0 }, 0).find((p) => p.kind === "zeppelin")!;
    l = { ...l, fishers: l.fishers.map((f, i) => ({ ...f, pos: i ? { ...zep.at } : { x: 0, z: 20 } })) };
    l = step(step(l, T0 + 10), T0 + 10 + BOARD_MS * 2);
    expect(l.ride).toBeNull();
  });
});

describe("tagging along to a ride", () => {
  it("walks an idle kid right up to the tower where the family waits, and off they fly", () => {
    const T0 = 10_000;
    let l: Lake = { ...join(join(newLake(1, T0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake, worldSeed: seed };
    const zep = worldFor(seed).platformsNear({ x: 0, z: 0 }, 0).find((p) => p.kind === "zeppelin")!;
    l = { ...l, fishers: l.fishers.map((f) => (f.seat === 0 ? { ...f, pos: { ...zep.at } } : { ...f, pos: { x: 10, z: 19 } })) };
    for (let t = T0; t < T0 + 60_000 && !l.ride; t += 250) l = step(l, t);
    expect(l.ride?.platformId).toBe(zep.id);
  });
});

describe("fog of war", () => {
  it("clears round everyone as they go, and remembers it", () => {
    const l = join(newLake(1, 1000), { name: "A", ogsId: null }).lake;
    expect(l.revealed.length).toBeGreaterThan(5);
    const moved = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: { x: 0, z: 90 } })) };
    const after = step(moved, 2000);
    expect(after.revealed.length).toBeGreaterThan(l.revealed.length);
    expect(after.revealed).toEqual(expect.arrayContaining(l.revealed));
  });
});
