import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { CROWD, action, join, newLake, step, type Lake } from "./lake";
import { worldFor } from "./regions";
import { ACROSS_NEAR, SPOT_ACROSS, apartAcross, boardwalkPath, clearOfProps, keepClear, viewRight } from "./spots";
import { CAMPFIRE, DOCK, TRAILS, areaById, distance, pondRadius, spawnPoint, type Vec } from "./world";

// Round 26 (round 25 session): Juneau fished from inside Moonwell's campfire (66-139 s), and at Mistmarsh
// Dad stood behind Juneau and the boardwalk's foot posts for four catches (252-280 s).

const T0 = 1_000_000;
const w = worldFor(1);
const marsh = areaById("mistmarsh");
const marshPlace = w.placeById("mistmarsh")!;
const moonPlace = w.placeById("moonwell")!;
const shoreIn = (theta: number, out: number): Vec => {
  const r = pondRadius(marsh, theta) + out;
  return { x: marsh.center.x + Math.cos(theta) * r, z: marsh.center.z + Math.sin(theta) * r };
};
const onTrail = (t: number): Vec => {
  const tr = TRAILS[0]!;
  return { x: tr.from.x + (tr.to.x - tr.from.x) * t, z: tr.from.z + (tr.to.z - tr.from.z) * t };
};
const seat = (lake: Lake, s: number) => lake.fishers.find((f) => f.seat === s)!;

/** Two fishers placed by hand (seat 0, seat 1), nobody fishing yet. */
function pair(a: Vec, b: Vec, idleB = false): Lake {
  let lake = newLake(7, T0);
  for (const name of ["Dad", "Juneau"]) lake = join(lake, { name, ogsId: null }).lake;
  return produce(lake, (d) => {
    d.swirls = [];
    d.discovered = ["moonwell", "mistmarsh"];
    for (const f of d.fishers) {
      f.pos = { ...(f.seat === 0 ? a : b) };
      f.vel = { x: 0, z: 0 };
      if (f.seat === 1 && idleB) f.lastInputAt = 0;
    }
  });
}

/** Steps the rules until `seat` casts (or `ms` runs out); the kid presses the big button within `pressAt` m of Dad, or once the tag-along has stopped him. */
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

/** Sideways distance between two points as the TV sees a pair there. */
function across(place: typeof marshPlace, a: Vec, b: Vec): number {
  const right = viewRight(place, [a, b]);
  return Math.abs((a.x - b.x) * right.x + (a.z - b.z) * right.z);
}

describe("the campfire is off the fishing bank", () => {
  it("no spawn spot fishes within the campfire's keep-clear, and every spawn press casts away from it", () => {
    for (let s = 0; s < 4; s++) {
      const spot = w.fishingSpot(spawnPoint(s), 16);
      expect(spot).not.toBeNull();
      expect(distance(spot!, CAMPFIRE)).toBeGreaterThanOrEqual(6);
    }
  });
  it("no fishing spot round Moonwell is within 6 m of the fire", () => {
    for (let a = 0; a < 24; a++) {
      const p = { x: Math.cos(a / 3.82) * 24, z: Math.sin(a / 3.82) * 24 };
      const spot = w.fishingSpot(p, 16);
      if (spot) expect(distance(spot, CAMPFIRE), `from ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("clear of the bank's props", () => {
  const walk = boardwalkPath(marsh);
  it("keeps both feet of Mistmarsh's boardwalk clear", () => {
    expect(keepClear("mistmarsh").map((k) => k.at)).toEqual([walk[0], walk[walk.length - 1]]);
    for (const foot of [walk[0]!, walk[walk.length - 1]!]) {
      const spot = w.fishingSpot(foot, 16);
      expect(spot).not.toBeNull();
      expect(clearOfProps("mistmarsh", spot!)).toBe(true);
      expect(distance(spot!, foot)).toBeGreaterThanOrEqual(2.2);
    }
  });
  it("a press at the boardwalk's foot walks a fisher off it to a spot of their own, and they cast there", () => {
    const foot = walk[walk.length - 1]!;
    expect(w.castFrom(foot)).not.toBeNull();
    let lake = action(pair(foot, onTrail(0.2)), 0, T0);
    expect(seat(lake, 0).mode).toBe("walk");
    expect(seat(lake, 0).fishSpot).not.toBeNull();
    for (let t = T0; t < T0 + 8000 && seat(lake, 0).mode === "walk"; t += 100) lake = step(lake, t);
    expect(seat(lake, 0).mode).toBe("cast");
    expect(clearOfProps("mistmarsh", seat(lake, 0).pos)).toBe(true);
  });
  it("Moonwell's dock is still a place to fish (a prop you fish from is not kept clear)", () => {
    const tip = { x: 0, z: DOCK.tipZ + 0.9 };
    const lake = action(pair(tip, spawnPoint(3)), 0, T0);
    expect(seat(lake, 0).mode).toBe("cast");
  });
});

describe("apart across the TV's view", () => {
  it("two spots lined up along the view are not apart; side by side they are", () => {
    // Moonwell's camera looks north from the south shore: x is across, z is depth.
    const a = { x: -8, z: 16 };
    expect(apartAcross(moonPlace, { x: -8, z: 20 }, [a])).toBe(false);
    expect(apartAcross(moonPlace, { x: -8 + SPOT_ACROSS + 0.1, z: 17 }, [a])).toBe(true);
    expect(apartAcross(moonPlace, { x: -8, z: 16 + ACROSS_NEAR + 0.1 }, [a])).toBe(true);
  });
  it("Mistmarsh's north-east shore: the camera swings round from the east, so depth there runs east-west", () => {
    const dad = shoreIn(-0.6, 1.2);
    const right = viewRight(marshPlace, [dad]);
    // The camera stands east of the family (round 20 placeView: no more than 0.75 rad off straight behind them).
    expect(Math.abs(right.x)).toBeLessThan(0.35);
  });
  it("a kid tagging along to Dad at Mistmarsh and pressing within 6 m fishes beside him on screen, not behind", () => {
    let lake = action(pair(shoreIn(-0.6, 1.2), onTrail(0.75), true), 0, T0 + 7000);
    expect(seat(lake, 0).mode).toBe("cast");
    lake = untilCast(lake, 1, 30_000, 6);
    const dad = seat(lake, 0).pos;
    const kid = seat(lake, 1);
    expect(kid.mode).toBe("cast");
    expect(distance(kid.pos, dad)).toBeGreaterThanOrEqual(CROWD);
    expect(across(marshPlace, kid.pos, dad)).toBeGreaterThanOrEqual(SPOT_ACROSS);
    expect(clearOfProps("mistmarsh", kid.pos)).toBe(true);
  });
  it("wherever Dad stands on that shore, and whenever the kid presses on the way in, they fish apart across the view", () => {
    for (const theta of [-0.45, -0.6, -0.7]) {
      for (const out of [1.2, 2.0]) {
        for (const pressAt of [5, 6]) {
          let lake = action(pair(shoreIn(theta, out), onTrail(0.85), true), 0, T0 + 7000);
          if (seat(lake, 0).mode !== "cast") continue;
          lake = untilCast(lake, 1, 30_000, pressAt);
          const kid = seat(lake, 1);
          const at = `Dad at ${theta}/${out}, press within ${pressAt} m`;
          expect(kid.mode, at).toBe("cast");
          expect(across(marshPlace, kid.pos, seat(lake, 0).pos), at).toBeGreaterThanOrEqual(SPOT_ACROSS);
        }
      }
    }
  });
  it("pressing in line behind someone fishing (4 m back along the view) steps aside", () => {
    const dad = shoreIn(-0.6, 1.2);
    const right = viewRight(marshPlace, [dad]);
    // Straight toward the camera from Dad: perpendicular to `right`, on land.
    const back = { x: dad.x + right.z * 4, z: dad.z - right.x * 4 };
    const toward = w.castFrom(back) ? back : { x: dad.x - right.z * 4, z: dad.z + right.x * 4 };
    let lake = action(pair(dad, toward), 0, T0);
    expect(seat(lake, 0).mode).toBe("cast");
    if (w.castFrom(toward) === null) return;
    lake = action(lake, 1, T0 + 100);
    expect(seat(lake, 1).mode).toBe("walk");
    expect(seat(lake, 1).fishSpot).not.toBeNull();
    expect(across(marshPlace, seat(lake, 1).fishSpot!, dad)).toBeGreaterThanOrEqual(SPOT_ACROSS);
  });
  it("from every spawn spot at Moonwell, pressing beside Dad at the dock's foot casts apart from him across the view", () => {
    for (let s = 1; s < 4; s++) {
      const dadAt = { x: -1.2, z: DOCK.rootZ + 0.6 };
      let lake = action(pair(dadAt, spawnPoint(s)), 0, T0);
      expect(seat(lake, 0).mode).toBe("cast");
      lake = untilCast(lake, 1, 15_000, 99);
      const kid = seat(lake, 1);
      expect(kid.mode, `spawn ${s}`).toBe("cast");
      expect(across(moonPlace, kid.pos, dadAt), `spawn ${s}`).toBeGreaterThanOrEqual(SPOT_ACROSS);
      expect(distance(kid.pos, CAMPFIRE)).toBeGreaterThanOrEqual(6);
    }
  });
  it("a fisher alone casts where they press, as before", () => {
    const lake = action(pair(shoreIn(-0.6, 1.2), onTrail(0.1)), 0, T0);
    expect(seat(lake, 0).mode).toBe("cast");
    expect(seat(lake, 0).fishSpot).toBeNull();
    expect(distance(seat(lake, 0).pos, shoreIn(-0.6, 1.2))).toBeLessThan(1);
  });
});
