import { describe, expect, it } from "vitest";
import { AREAS, TRAILS, advance, areaAt, areaById, castFrom, castRingIn, inPond, onLand, pondOutline, pondRadius, walkable } from "./world";
import { LEASH, join, leash, move, newLake, step, type Lake } from "./lake";

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
});
