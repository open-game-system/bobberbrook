import { describe, expect, it } from "vitest";
import { AREAS, TRAILS, advance, areaAt, areaById, castFrom, castRingIn, crossesWater, inPond, onLand, pondOutline, pondRadius, roundThePond, walkable } from "./world";
import { FOLLOW_AFTER_MS, FOLLOW_NEAR, LEASH, SPARKLES_PER_TRAIL, action, join, leash, loadProgress, move, newLake, progressOf, step, type Lake } from "./lake";

/** A point on a place's shore, just out of the water, at an angle. */
const shore = (id: Parameters<typeof areaById>[0], theta: number) => {
  const a = areaById(id);
  const r = pondRadius(a, theta) + 1;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
};

describe("the valley", () => {
  it("has five places, each a pond inside its own clearing", () => {
    expect(AREAS.map((a) => a.id)).toEqual(["moonwell", "mistmarsh", "pools", "hollow", "tarn"]);
    for (const a of AREAS) {
      expect(inPond(a, a.center)).toBe(true);
      expect(areaAt(shore(a.id, 1))?.id).toBe(a.id);
      expect(pondOutline(a, 8)).toHaveLength(8);
    }
  });
  it("joins every place to Moonwell Lake by walkable trails", () => {
    for (const t of TRAILS) for (let i = 0; i <= 20; i++) {
      const p = { x: t.from.x + ((t.to.x - t.from.x) * i) / 20, z: t.from.z + ((t.to.z - t.from.z) * i) / 20 };
      expect(walkable(p)).toBe(true);
    }
    const reached = new Set(["moonwell"]);
    for (let pass = 0; pass < 3; pass++) for (const t of TRAILS) if (reached.has(t.joins[0]) || reached.has(t.joins[1])) t.joins.forEach((j) => reached.add(j));
    expect(reached.size).toBe(5);
  });
  it("is forest between the trails: you can't walk off into the trees", () => {
    expect(onLand({ x: -40, z: -40 })).toBe(false);
    expect(onLand({ x: 40, z: 40 })).toBe(false);
  });
  it("casts into each place's own water", () => {
    expect(castFrom(shore("mistmarsh", 0.5))?.water).toBe("marsh");
    expect(castFrom(shore("pools", 0.5))?.water).toBe("pools");
    expect(castFrom(shore("hollow", 2.5))?.water).toBe("hollow");
    expect(castFrom(shore("tarn", 2))?.water).toBe("tarn");
  });
  it("lands a straight cast inside the pond", () => {
    for (const a of AREAS) expect(inPond(a, castRingIn(a, 0.7))).toBe(true);
  });
  it("walks the trail to the marsh", () => {
    const t = TRAILS[0]!;
    let p = t.from;
    for (let i = 0; i < 40; i++) {
      const dx = t.to.x - p.x;
      const dz = t.to.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) break;
      p = advance(p, { x: (dx / d) * 5, z: (dz / d) * 5 }, 0.2);
    }
    expect(Math.hypot(p.x - t.to.x, p.z - t.to.z)).toBeLessThan(1);
  });
});

describe("exploring", () => {
  const T0 = 1000;
  const twoFishers = (): Lake => join(join(newLake(4, T0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake;

  it("starts with Moonwell Lake found and two swirls there", () => {
    const l = newLake(4, T0);
    expect(l.discovered).toEqual(["moonwell"]);
    expect(l.swirls.map((s) => s.area)).toEqual(["moonwell", "moonwell"]);
  });
  it("discovers a place when someone walks into it, once, with a swirl there", () => {
    let l = join(newLake(4, T0), { name: "A", ogsId: null }).lake;
    l = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: shore("mistmarsh", 0.5) })) };
    l = step(l, T0 + 10);
    expect(l.discovered).toEqual(["moonwell", "mistmarsh"]);
    expect(l.discovery).toMatchObject({ area: "mistmarsh", seat: 0, at: T0 + 10, seq: 1 });
    expect(l.swirls.filter((s) => s.area === "mistmarsh")).toHaveLength(1);
    const again = step(l, T0 + 20);
    expect(again.discovery?.seq).toBe(1);
    expect(again.discovered).toHaveLength(2);
  });
  it("keeps the family within a leash of each other", () => {
    let l = twoFishers();
    l = { ...l, fishers: l.fishers.map((f) => (f.seat === 1 ? { ...f, pos: shore("mistmarsh", 0.3) } : f)) };
    l = step(l, T0 + 10);
    const [a, b] = l.fishers;
    expect(Math.hypot(a!.pos.x - b!.pos.x, a!.pos.z - b!.pos.z)).toBeLessThanOrEqual(LEASH + 0.6);
  });
  it("lets a lone fisher roam anywhere", () => {
    const one = [{ pos: { x: 0, z: 0 } }];
    leash(one);
    expect(one[0]!.pos).toEqual({ x: 0, z: 0 });
  });
  it("walks faster than before for the long trails", () => {
    const l = move(twoFishers(), 0, { x: 1, y: 0 }, T0);
    expect(l.fishers[0]!.vel.x).toBe(5);
  });

  it("keeps places found on earlier visits, with a swirl each and no new celebration", () => {
    const l = loadProgress(newLake(4, T0), { journal: {}, shells: 0, discovered: ["moonwell", "hollow"] });
    expect(l.discovered).toEqual(["moonwell", "hollow"]);
    expect(l.discovery).toBeNull();
    expect(l.swirls.filter((s) => s.area === "hollow")).toHaveLength(1);
    expect(progressOf(l).discovered).toEqual(["moonwell", "hollow"]);
  });
});

describe("walking around trees", () => {
  it("steers round a tree in the way instead of getting stuck on it", () => {
    // The oak at (-15, 21) sits on the straight line from (-9, 24) to (-20, 19).
    let p = { x: -9.1, z: 24.3 };
    for (let i = 0; i < 80; i++) {
      const dx = -20 - p.x;
      const dz = 19 - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1) break;
      p = advance(p, { x: (dx / d) * 5, z: (dz / d) * 5 }, 0.15);
    }
    expect(Math.hypot(p.x + 20, p.z - 19)).toBeLessThan(1.5);
  });
});

describe("finding the way round a pond", () => {
  it("goes straight when no water is in the way", () => {
    expect(crossesWater({ x: 0, z: 20 }, { x: 5, z: 22 })).toBe(false);
    expect(roundThePond({ x: 0, z: 20 }, { x: 5, z: 22 })).toEqual({ x: 5, z: 22 });
  });
  it("heads round the rim when the lake is in the way, and gets there", () => {
    const from = shore("moonwell", Math.PI); // west shore
    const to = shore("moonwell", 0); // east shore, across the lake
    expect(crossesWater(from, to)).toBe(true);
    let p = from;
    for (let i = 0; i < 600 && Math.hypot(p.x - to.x, p.z - to.z) > 1; i++) {
      const w = roundThePond(p, to);
      const d = Math.hypot(w.x - p.x, w.z - p.z) || 1;
      p = advance(p, { x: ((w.x - p.x) / d) * 5, z: ((w.z - p.z) / d) * 5 }, 0.1);
    }
    expect(Math.hypot(p.x - to.x, p.z - to.z)).toBeLessThan(1.5);
  });
});

describe("tagging along", () => {
  const T0 = 1000;
  function apart(): Lake {
    let l = join(join(newLake(4, T0), { name: "Dad", ogsId: null }).lake, { name: "Kid", ogsId: null }).lake;
    return { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: f.seat === 0 ? shore("moonwell", 2.6) : shore("moonwell", 0.2) })) };
  }
  it("walks an idle fisher over to the family after a while", () => {
    let l = apart();
    const start = l.fishers[1]!.pos;
    l = step(l, T0 + FOLLOW_AFTER_MS - 100);
    expect(l.fishers[1]!.vel).toEqual({ x: 0, z: 0 });
    for (let t = T0 + FOLLOW_AFTER_MS; t < T0 + FOLLOW_AFTER_MS + 30_000; t += 250) l = step(l, t);
    const [dad, kid] = l.fishers;
    expect(Math.hypot(kid!.pos.x - dad!.pos.x, kid!.pos.z - dad!.pos.z)).toBeLessThan(FOLLOW_NEAR + 1.5);
    expect(kid!.pos).not.toEqual(start);
    expect(kid!.vel).toEqual({ x: 0, z: 0 });
  });
  it("never moves someone who is using their stick, or fishing", () => {
    let l = apart();
    l = move(l, 1, { x: 0, y: 0 }, T0 + 5000); // touched the stick: idle clock restarts
    l = step(l, T0 + 5000 + FOLLOW_AFTER_MS - 100);
    expect(l.fishers[1]!.vel).toEqual({ x: 0, z: 0 });
    let f = apart();
    f = action(f, 1, T0);
    f = step(f, T0 + FOLLOW_AFTER_MS + 2000);
    expect(f.fishers[1]!.mode).not.toBe("walk");
    expect(f.fishers[1]!.vel).toEqual({ x: 0, z: 0 });
  });
});

describe("trail treasures", () => {
  const T0 = 1000;
  it("lines every trail with a few sparkles to pick up", () => {
    const l = newLake(4, T0);
    expect(l.sparkles.length).toBe(TRAILS.length * SPARKLES_PER_TRAIL);
    for (const s of l.sparkles) expect(walkable(s.pos)).toBe(true);
  });
  it("gives a shell to whoever walks over one, then it's gone for a while", () => {
    let l = join(newLake(4, T0), { name: "A", ogsId: null }).lake;
    const sp = l.sparkles[0]!;
    l = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: { ...sp.pos } })) };
    l = step(l, T0 + 10);
    expect(l.shells).toBe(1);
    expect(l.sparkles[0]!.backAt).toBeGreaterThan(T0 + 10);
    expect(l.pickup).toMatchObject({ seat: 0, sparkleId: sp.id, seq: 1 });
    l = step(l, T0 + 20);
    expect(l.shells).toBe(1);
    l = step(l, l.sparkles[0]!.backAt + 1);
    expect(l.shells).toBe(2);
  });
});
