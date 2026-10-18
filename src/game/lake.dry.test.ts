import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { action, join, newLake, step, type Lake } from "./lake";
import { worldFor } from "./regions";
import { DRY_BANK, FOOT_CLEAR, RAIL_CLEAR, boardwalkPath, clearOfProps, clearOfWalk, dryBank, keepClear, pavilionAt } from "./spots";
import { TRAILS, areaById, distance, pondRadius, polarIn, segmentDistance, type Vec } from "./world";

// Round 28 (round 27 session 119-146 s): at Mistmarsh Juneau fished standing in the water at the boardwalk's
// foot, shoulder to shoulder with Dad, for all four catches. The rules let anyone fish from wherever they could
// cast (0.4 m up the bank), while the TV draws the water to 0.9 m past the edge and the bank only rises above
// it after that; and the boardwalk's feet were kept clear by only 2.2 m.

const T0 = 1_000_000;
const w = worldFor(1);
const marsh = areaById("mistmarsh");
const bank = (theta: number, out: number): Vec => {
  const r = pondRadius(marsh, theta) + out;
  return { x: marsh.center.x + Math.cos(theta) * r, z: marsh.center.z + Math.sin(theta) * r };
};
const upBank = (p: Vec): number => {
  const { r, theta } = polarIn(marsh, p);
  return r - pondRadius(marsh, theta);
};
const onTrail = (t: number): Vec => {
  const tr = TRAILS[0]!;
  return { x: tr.from.x + (tr.to.x - tr.from.x) * t, z: tr.from.z + (tr.to.z - tr.from.z) * t };
};
const seat = (lake: Lake, s: number) => lake.fishers.find((f) => f.seat === s)!;

function pair(a: Vec, b: Vec): Lake {
  let lake = newLake(7, T0);
  for (const name of ["Dad", "Juneau"]) lake = join(lake, { name, ogsId: null }).lake;
  return produce(lake, (d) => {
    d.swirls = [];
    d.discovered = ["moonwell", "mistmarsh"];
    for (const f of d.fishers) {
      f.pos = { ...(f.seat === 0 ? a : b) };
      f.vel = { x: 0, z: 0 };
      if (f.seat === 1) f.lastInputAt = 0;
    }
  });
}

/** Steps until `s` casts; they press whenever stopped or within `pressAt` m of the other. */
function untilCast(lake: Lake, s: number, ms: number, pressAt: number): Lake {
  let pressed = -Infinity;
  for (let t = T0 + 7000; t <= T0 + 7000 + ms; t += 100) {
    lake = step(lake, t);
    const f = seat(lake, s);
    if (f.mode !== "walk") return lake;
    const stopped = f.vel.x === 0 && f.vel.z === 0 && t > T0 + 9000;
    if (f.fishSpot === null && t - pressed > 1500 && (distance(f.pos, seat(lake, 1 - s).pos) < pressAt || stopped)) {
      pressed = t;
      lake = action(lake, s, t);
    }
  }
  return lake;
}

describe("feet on dry land", () => {
  it("the bank is dry a metre up from the water's edge, not at the edge the TV draws as water", () => {
    expect(dryBank(marsh, bank(-0.6, 0.5))).toBe(false);
    expect(dryBank(marsh, bank(-0.6, 0.9))).toBe(false);
    expect(dryBank(marsh, bank(-0.6, DRY_BANK + 0.1))).toBe(true);
  });
  it("every fishing spot round Mistmarsh is dry", () => {
    for (let k = 0; k < 36; k++) {
      const th = (k / 36) * Math.PI * 2;
      for (const out of [0.5, 2, 6]) {
        const spot = w.fishingSpot(bank(th, out), 16);
        if (!spot) continue;
        expect(upBank(spot), `from ${th.toFixed(2)}/${out}`).toBeGreaterThanOrEqual(DRY_BANK - 1e-6);
        expect(dryBank(marsh, spot)).toBe(true);
      }
    }
  });
  it("pressing at the water's very edge beside someone fishing steps aside to a spot with dry feet, and casts there", () => {
    const dad = bank(-1.1, 1.2);
    const edge = bank(-1.0, 0.5);
    expect(w.castFrom(edge)).not.toBeNull();
    let lake = action(pair(dad, edge), 0, T0);
    expect(seat(lake, 0).mode).toBe("cast");
    lake = action(lake, 1, T0 + 100);
    expect(seat(lake, 1).mode).toBe("walk");
    expect(seat(lake, 1).fishSpot).not.toBeNull();
    expect(dryBank(marsh, seat(lake, 1).fishSpot!)).toBe(true);
    for (let t = T0 + 100; t < T0 + 10_000 && seat(lake, 1).mode === "walk"; t += 100) lake = step(lake, t);
    expect(seat(lake, 1).mode).toBe("cast");
    expect(upBank(seat(lake, 1).pos)).toBeGreaterThanOrEqual(DRY_BANK - 0.45);
  });
});

describe("not at the boardwalk's foot", () => {
  const walk = boardwalkPath(marsh);
  it("both feet keep FOOT_CLEAR m clear (posts, lanterns, rails and the shallows round them)", () => {
    expect(keepClear("mistmarsh").map((k) => k.r)).toEqual([FOOT_CLEAR, FOOT_CLEAR]);
    expect(FOOT_CLEAR).toBeGreaterThanOrEqual(3.5);
  });
  it("a kid tagging along to Dad by the east foot fishes on dry land, off the foot, and apart from Dad", () => {
    for (const theta of [-0.45, -0.6, -0.7]) {
      let lake = action(pair(bank(theta, 1.2), onTrail(0.75)), 0, T0 + 7000);
      if (seat(lake, 0).mode !== "cast") continue;
      lake = untilCast(lake, 1, 30_000, 6);
      const kid = seat(lake, 1);
      expect(kid.mode, `Dad at ${theta}`).toBe("cast");
      expect(upBank(kid.pos), `Dad at ${theta}`).toBeGreaterThanOrEqual(DRY_BANK - 0.45);
      for (const foot of [walk[0]!, walk[walk.length - 1]!]) expect(distance(kid.pos, foot), `Dad at ${theta}`).toBeGreaterThanOrEqual(FOOT_CLEAR - 0.05);
    }
  });
  it("Dad pressing 2.75 m from the east foot (allowed before) walks off the boardwalk's stretch along the bank; Juneau tagging along fishes clear of it too", () => {
    const dadAt = bank(-0.5, 1.2);
    expect(clearOfWalk("mistmarsh", dadAt)).toBe(false);
    let lake = action(pair(dadAt, onTrail(0.75)), 0, T0 + 7000);
    for (let t = T0 + 7000; t < T0 + 15_000 && seat(lake, 0).mode === "walk"; t += 100) lake = step(lake, t);
    expect(seat(lake, 0).mode).toBe("cast");
    lake = untilCast(lake, 1, 30_000, 6);
    expect(seat(lake, 1).mode).toBe("cast");
    for (const s of [0, 1]) {
      const p = seat(lake, s).pos;
      let near = Infinity;
      for (let i = 1; i < walk.length; i++) near = Math.min(near, segmentDistance(p, walk[i - 1]!, walk[i]!));
      expect(near, `seat ${s}`).toBeGreaterThanOrEqual(RAIL_CLEAR - 0.6);
      expect(upBank(p), `seat ${s}`).toBeGreaterThanOrEqual(DRY_BANK - 0.45);
    }
  });
  it("nobody fishes from under Mistmarsh's pavilion roof (the lab's dock-foot pair: Juneau stood on its floor)", () => {
    const pv = pavilionAt(marsh);
    expect(clearOfProps("mistmarsh", pv)).toBe(false);
    for (const out of [0.5, 1.5]) {
      const spot = w.fishingSpot(bank(-2.35, out), 8);
      expect(spot).not.toBeNull();
      expect(distance(spot!, pv)).toBeGreaterThanOrEqual(5);
    }
  });
});
