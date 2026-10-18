/**
 * Scene lab: the TV scene full-window, driven by a local simulation with the real lake rules and
 * simple bots. ?scenario=morning|four-reel|golden-swirl|night-catch|rod-upgrade|campfire|empty|
 * moonwell|mistmarsh|pools|hollow|tarn|trail|discovery|night-tarn|far-place|biome-<biome>|boat-ride|
 * zeppelin-ride|boarding|tower|tower-lamp|arrival|fog &phase=0..1 &seed=N &world=N (world seed, default 7) &lite=1 &view=name
 */
import { produce } from "immer";
import { CATCH_SKIP_MS, SEAT_COLORS, action, join, move, newLake, reelHold, setCampfire, step, type Fisher, type Lake } from "../game/lake";
import { DAY_MS, DAY_START } from "../game/daycycle";
import { fishById } from "../game/fish";
import { thrashingAt } from "../game/reel";
import { AREAS, DOCK, TRAILS, areaAt, areaById, castRing, castRingIn, distance, lakeRadius, pondRadius, type AreaId, type Vec } from "../game/world";
import { worldFor, type Biome, type Place, type Platform } from "../game/regions";
import { createLakeScene } from "./scene";
import { landmarkFor } from "./scene/biomes";
import { shoreFeatures, type ShoreFeature } from "./scene/shores";
import { placeHash } from "./scene/valley";
import { boardwalkPath } from "./scene/walkways";

type Bot = { stay: boolean; noHook: boolean; target: Vec; hookAt: number; nextCastAt: number; stick: { x: number; y: number }; holding: boolean; reactAt: number; wander: boolean };
type Scenario = {
  phase: number;
  /**
   * Round 24: `kid` (a wordless join: drawn child-sized) defaults to the family's kids by name (Juneau, Sis);
   * `easy` is the little one (Sis), and the grown-ups' bots may use it to hook faster (still drawn grown-up).
   */
  fishers: { seat: number; name: string; spot: Vec | "swirl" | "golden"; easy?: boolean; kid?: boolean; at?: Vec; stay?: boolean; noHook?: boolean }[];
  setup?: (lake: Lake, now: number) => Lake;
  /** Tweaks every step (the "director"). */
  direct?: (lake: Lake, now: number) => Lake;
  /** Fast-forward (virtual time) until this holds, before going real time. */
  warmUntil?: (lake: Lake) => boolean;
  hero: (lake: Lake, now: number, startedRealAt: number) => boolean;
  campfire?: boolean;
  /** Hold the rules where the warm-up left them (the scene keeps animating): a still moment for the shot. */
  freeze?: boolean;
};

const shore = (theta: number, out = 1.3): Vec => {
  const r = lakeRadius(theta) + out;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
};
/** A spot on a place's shore, `out` metres from the water. */
const shoreIn = (id: AreaId, theta: number, out = 1.3): Vec => {
  const a = areaById(id);
  const r = pondRadius(a, theta) + out;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
};
/** A point on Mistmarsh's boardwalk (0 = its shore end, 14 = its far end). */
const walkAt = (i: number): Vec => boardwalkPath(areaById("mistmarsh"))[i]!;
/** Round 24: the castable shore spot nearest the boardwalk's shore end, and the rules' free spot beside it. */
const dockFoot = (): Vec => W.fishingSpot(walkAt(0), 6) ?? walkAt(0);
const besideDockFoot = (): Vec => W.fishingSpot(dockFoot(), 8, [dockFoot()]) ?? dockFoot();
const discoverAll = (l: Lake): Lake => produce(l, (d) => { d.discovered = AREAS.map((a) => a.id); });
const discoverOnly = (ids: AreaId[]) => (l: Lake): Lake => produce(l, (d) => { d.discovered = ["moonwell", ...ids]; });
const swirlIn = (id: AreaId, theta: number, golden: boolean) => (l: Lake, now: number): Lake =>
  produce(l, (d) => {
    d.swirls = d.swirls.filter((s) => s.area !== id);
    d.swirlSeq += 1;
    d.swirls.push({ id: d.swirlSeq, area: id, pos: castRingIn(areaById(id), theta), theta, golden, since: now - 3000, until: now + 90_000, catches: 0 });
  });
const both = (...fs: ((l: Lake, now: number) => Lake)[]) => (l: Lake, now: number): Lake => fs.reduce((acc, f) => f(acc, now), l);
/** A point on a trail: `t` 0..1 from its first place to its second, `lat` metres to its left. */
const onTrailAt = (i: number, t: number, lat = 0): Vec => {
  const tr = TRAILS[i]!;
  const dx = tr.to.x - tr.from.x;
  const dz = tr.to.z - tr.from.z;
  const len = Math.hypot(dx, dz);
  return { x: tr.from.x + dx * t - (dz / len) * lat, z: tr.from.z + dz * t + (dx / len) * lat };
};
/** A calm moment to show a place: a while in, nobody holding up a catch. */
const calm = (l: Lake, now: number, s: number) => now - s > 5000 && !l.fishers.some((f) => f.mode === "catch");
const centroid = (l: Lake): Vec => {
  const n = Math.max(1, l.fishers.length);
  return { x: l.fishers.reduce((s, f) => s + f.pos.x, 0) / n, z: l.fishers.reduce((s, f) => s + f.pos.z, 0) / n };
};
const forceCatchFish = (seat: number, fishId: string, cm: number) => (l: Lake): Lake =>
  produce(l, (d) => {
    for (const f of d.fishers) if (f.mode === "reel" && f.reel && f.seat === seat && f.reel.fishId !== fishId) {
      f.reel.fishId = fishId;
      f.reel.cm = cm;
    }
    d.journal = Object.fromEntries(Object.entries(d.journal).filter(([id]) => id !== fishId));
  });

const DOCK_SPOT: Vec = { x: 0.3, z: DOCK.tipZ + 0.9 };

function swirlSpot(lake: Lake, golden: boolean): Vec | null {
  const s = lake.swirls.find((x) => x.golden === golden);
  return s ? shore(s.theta) : null;
}

function forceSwirl(lake: Lake, theta: number, golden: boolean, now: number): Lake {
  return produce(lake, (d) => {
    d.swirls = d.swirls.filter((s) => Math.abs(s.theta - theta) > 1);
    d.swirlSeq += 1;
    d.swirls.push({ id: d.swirlSeq, area: "moonwell", pos: castRing(theta), theta, golden, since: now - 3000, until: now + 90_000, catches: 0 });
  });
}

const inCatch = (lake: Lake, now: number, min: number, max: number) =>
  lake.fishers.some((f) => f.mode === "catch" && f.catch !== null && now - f.catch.at >= min && now - f.catch.at <= max);

// ---- the endless world (?world=N) ----
const WORLD_SEED = Number(new URLSearchParams(location.search).get("world") ?? "7");
const W = worldFor(WORLD_SEED);
const castFrom = (p: Vec) => W.castFrom(p);
/** A spot on any place's shore, `out` metres from the water. */
const shoreOf = (p: Place, theta: number, out = 1.3): Vec => {
  const r = pondRadius(p, theta) + out;
  return { x: p.center.x + Math.cos(theta) * r, z: p.center.z + Math.sin(theta) * r };
};
/** The nearest generated place of a biome (or at a ring). */
function findPlace(test: (p: Place) => boolean): Place {
  for (let ring = 1; ring < 9; ring++) {
    const hit = W.placesNear({ x: 0, z: 0 }, ring).filter((p) => !p.home && p.ring === ring && test(p));
    if (hit.length) return hit.sort((a, b) => a.key.localeCompare(b.key))[0]!;
  }
  throw new Error("no such place in this world");
}
function findPlatform(kind: "boat" | "zeppelin"): Platform {
  for (let ring = 0; ring < 9; ring++) {
    const hit = W.platformsNear({ x: 0, z: 0 }, ring).filter((p) => p.kind === kind);
    if (hit.length) return hit[0]!;
  }
  throw new Error(`no ${kind} in this world`);
}
/** A generated place of a biome whose shore has one of `feats` (and the landmark, if asked); else the biome's first. */
function findShore(biome: Biome, feats: ShoreFeature[], landmark: string | null): Place {
  const ok = (p: Place) => p.biome === biome && shoreFeatures(Math.floor(placeHash(p.key, 5) * 1000)).some((f) => feats.includes(f));
  const lm = (p: Place) => !landmark || landmarkFor(p.biome, placeHash(p.key, 6)) === landmark;
  for (const test of [(p: Place) => ok(p) && lm(p), ok, (p: Place) => p.biome === biome]) {
    try {
      return findPlace(test);
    } catch {
      // try the next, looser test
    }
  }
  throw new Error(`no ${biome} place in this world`);
}
/** The family fishing at a generated place (found, its fog lifted). */
function atPlace(p: Place, phase: number): Scenario {
  // Where along the near shore they settle, and how spread, varies by place (not always a row).
  let h = 0;
  for (const ch of p.key) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  const base = Math.PI / 2 + ((h % 7) / 6 - 0.5) * 0.8;
  const spread = 0.35 + ((h >> 3) % 5) * 0.12;
  const ths = [base + spread * 1.4, base, base - spread];
  return {
    phase,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreOf(p, ths[0]!), at: shoreOf(p, ths[0]!, 2.5) },
      { seat: 2, name: "Juneau", spot: shoreOf(p, ths[1]!), at: shoreOf(p, ths[1]!, 2.5) },
      { seat: 3, name: "Sis", spot: shoreOf(p, ths[2]!), easy: true, at: shoreOf(p, ths[2]!, 2.5) },
    ],
    setup: (l) => produce(l, (d) => { d.discovered = ["moonwell", p.id]; }),
    hero: calm,
  };
}
/**
 * The family standing on a dock or mooring, packed inside its reach (the real rules board them after
 * BOARD_MS, then ride). Nobody walks or casts: they wait for the vehicle like a family would.
 */
function atPlatform(pl: Platform, phase: number, until: (l: Lake) => boolean, hero: Scenario["hero"], freeze = false): Scenario {
  const dx = pl.to.x - pl.at.x;
  const dz = pl.to.z - pl.at.z;
  const len = Math.hypot(dx, dz) || 1;
  // k metres along the route (toward the vehicle), side metres across it: all within PLATFORM_REACH - 1.
  const on = (k: number, side: number): Vec => ({ x: pl.at.x + (dx / len) * k - (dz / len) * side, z: pl.at.z + (dz / len) * k + (dx / len) * side });
  // Round 14: as far apart as the rules keep them (FISHER_SPACE 2.8 m), all within the 3.6 m boarding reach.
  const spots = [on(1.4, 1.4), on(1.4, -1.4), on(-1.4, 1.4), on(-1.4, -1.4)];
  const names: [number, string][] = [[0, "Dad"], [1, "Mom"], [2, "Juneau"], [3, "Sis"]];
  return {
    phase,
    fishers: names.map(([seat, name], i) => ({ seat, name, spot: spots[i]!, at: spots[i]!, stay: true, easy: seat === 3 })),
    setup: (l) => produce(l, (d) => { d.discovered = ["moonwell", pl.place, pl.toPlace]; }),
    warmUntil: until,
    hero,
    freeze,
  };
}
const BIOME_SCENES = Object.fromEntries(
  (["marsh", "pools", "hollow", "tarn", "willow", "crystal", "ember", "frost"] as const).map((b: Exclude<Biome, "moonwell">) => [`biome-${b}`, () => atPlace(findPlace((p) => p.biome === b), 0.3)]),
);
const rideK = (l: Lake) => (l.ride ? (l.now - l.ride.departAt) / (l.ride.arriveAt - l.ride.departAt) : 0);
const LAZY: Record<string, () => Scenario> = {
  ...BIOME_SCENES,
  "far-place": () => atPlace(findPlace((p) => p.ring === 4), 0.32),
  // Round 13: the painted surfaces the family stands near at generated places: a frost place with the
  // lantern shrine and stepping stones or terraces (Winterglow in round 12), an ember place with terraces.
  "shore-frost": () => atPlace(findShore("frost", ["stones", "terraces"], "shrine"), 0.3),
  "shore-ember": () => atPlace(findShore("ember", ["terraces"], null), 0.3),
  // Mid-sea and mid-air: boarded by the real rules, then fast-forwarded to the middle of the ride.
  "boat-ride": () => atPlatform(findPlatform("boat"), 0.3, (l) => rideK(l) > 0.42, (l, now, s) => now - s > 3000 && l.ride !== null),
  "zeppelin-ride": () => atPlatform(findPlatform("zeppelin"), 0.36, (l) => rideK(l) > 0.4, (l, now, s) => now - s > 3000 && l.ride !== null),
  // The boarding moment (sail unfurling / propellers spinning, the platform glowing): held there.
  tower: () => atPlatform(findPlatform("zeppelin"), 0.3, (l) => l.boarding !== null && l.now - l.boarding.since > 1700, (_l, now, s) => now - s > 2600, true),
  boarding: () => atPlatform(findPlatform("boat"), 0.4, (l) => l.boarding !== null && l.now - l.boarding.since > 1700, (_l, now, s) => now - s > 2600, true),
  // A tower lantern between the camera and a fisher (round 10, 239 s): Juneau on the tower deck just
  // behind its camera-side lamp while Dad fishes the pond beside it (the lamp must dissolve).
  "tower-lamp": () => {
    const pl = findPlatform("zeppelin");
    const place = W.placeById(pl.place);
    if (!place) throw new Error("the zeppelin place is missing");
    const t = W.towerAt(place);
    // The deck lamps stand at pi/8 + k pi/2 on a 5.85 m ring. Once the camera has settled (2.5 s), Juneau
    // steps 2.6 m behind the lamp nearest the camera, on the line from the lens (again at 5.5 s).
    let placed = 0;
    let t0 = -1;
    const behindLamp = (l: Lake, now: number): Lake => {
      if (t0 < 0) t0 = now;
      // Juneau is busy on the deck (an idle fisher would tag along after Dad).
      l = produce(l, (dd) => { for (const f of dd.fishers) if (f.seat === 2) f.lastInputAt = now; });
      const cam = window.__scene?.cameraAt?.();
      // Twice: the camera re-fits after the first step, so the second aims from where it settled.
      if (placed >= 2 || now - t0 < 3000 + placed * 2500 || !cam) return l;
      placed++;
      let a = Math.PI / 8;
      const score = (b: number) => -Math.hypot(t.x + Math.cos(b) * 5.85 - cam.x, t.z + Math.sin(b) * 5.85 - cam.z);
      for (let k = 1; k < 4; k++) {
        const b = Math.PI / 8 + (k * Math.PI) / 2;
        if (score(b) > score(a)) a = b;
      }
      const lx = t.x + Math.cos(a) * 5.85;
      const lz = t.z + Math.sin(a) * 5.85;
      const d = Math.hypot(lx - cam.x, lz - cam.z) || 1;
      const at = { x: lx + ((lx - cam.x) / d) * 2.6, z: lz + ((lz - cam.z) / d) * 2.6 };
      return produce(l, (dd) => { for (const f of dd.fishers) if (f.seat === 2) { f.pos = at; f.vel = { x: 0, z: 0 }; f.movedAt = now; } });
    };
    const juneau = { x: t.x, z: t.z };
    // Dad at the pond shore nearest the tower.
    const th = Math.atan2(t.z - place.center.z, t.x - place.center.x);
    const dad = shoreOf(place, th);
    return {
      phase: 0.3,
      fishers: [
        { seat: 2, name: "Juneau", spot: juneau, at: juneau, stay: true },
        { seat: 0, name: "Dad", spot: dad, at: shoreOf(place, th, 2.5) },
      ],
      setup: (l) => produce(l, (d) => { d.discovered = ["moonwell", pl.place]; }),
      direct: behindLamp,
      hero: (_l, now, s) => now - s > 9000,
    };
  },
  // Back to fishing after the campfire (round 10, 254 s): the family round the fire, then home to their
  // spots by the airship tower at another place; the shot is 2.5 s after the fire goes out.
  "campfire-out": () => {
    const pl = findPlatform("zeppelin");
    const place = W.placeById(pl.place);
    if (!place) throw new Error("the zeppelin place is missing");
    const t = W.towerAt(place);
    const th = Math.atan2(t.z - place.center.z, t.x - place.center.x);
    let t0 = -1;
    let outAt = -1;
    return {
      phase: 0.3,
      fishers: [
        { seat: 0, name: "Dad", spot: shoreOf(place, th + 0.25), at: shoreOf(place, th + 0.25, 2.5) },
        { seat: 2, name: "Juneau", spot: shoreOf(place, th - 0.2), at: shoreOf(place, th - 0.2, 2.5) },
      ],
      setup: (l) => produce(l, (d) => { d.discovered = ["moonwell", pl.place]; }),
      campfire: true,
      direct: (l, now) => {
        if (t0 < 0) t0 = now;
        if (outAt < 0 && now - t0 > 6000) {
          outAt = now;
          return setCampfire(l, false, now);
        }
        return l;
      },
      hero: (_l, now) => outAt > 0 && now - outAt > 2500,
    };
  },
  // Round 14 (session 204-220 s, the Dell): Dad and Juneau fishing 3 m apart along a shore that runs away
  // from the camera, by an airship tower; one must never stand hidden behind the other on screen.
  "shore-line": () => {
    const pl = findPlatform("zeppelin");
    const place = W.placeById(pl.place);
    if (!place) throw new Error("the zeppelin place is missing");
    return {
      phase: 0.3,
      fishers: [
        { seat: 0, name: "Dad", spot: shoreOf(place, -0.17), at: shoreOf(place, -0.17, 2.5) },
        { seat: 2, name: "Juneau", spot: shoreOf(place, 0.17), at: shoreOf(place, 0.17, 2.5) },
      ],
      setup: (l) => produce(l, (d) => { d.discovered = ["moonwell", pl.place]; }),
      hero: calm,
    };
  },
  // Arrival: the airship settling at the far tower, the family stepping off.
  arrival: () => atPlatform(findPlatform("zeppelin"), 0.3, (l) => rideK(l) > 0.86, (l, now, s) => now - s > 1500 && (l.ride === null || rideK(l) > 0.985)),
  // The edge of what the family has explored: out of Whisperfall Pools up the trail north into the
  // unexplored world, the veil wall ahead peeling back as they walk.
  fog: () => {
    const tr = W.trailsNear(areaById("pools").center, 1).find((t) => [t.a, t.b].includes("0,-1") && [t.a, t.b].includes("0,-2"));
    if (!tr) throw new Error("no trail north of the pools");
    const from = tr.a === "0,-1" ? tr.from : tr.to;
    const to = tr.a === "0,-1" ? tr.to : tr.from;
    const along = (t: number, lat: number): Vec => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      return { x: from.x + dx * t - (dz / len) * lat, z: from.z + dz * t + (dx / len) * lat };
    };
    return {
      phase: 0.34,
      fishers: [
        { seat: 0, name: "Dad", spot: along(0.55, 1), at: along(0.12, 1) },
        { seat: 2, name: "Juneau", spot: along(0.58, -0.8), at: along(0.15, -0.8) },
      ],
      setup: (l) => produce(l, (d) => { d.discovered = ["moonwell", "pools"]; }),
      warmUntil: () => true,
      hero: (_l, now, s) => now - s > 5000,
    };
  },
};

/** The moment a fisher's fish got away (lab clock), for the miss scenario. */
const missWatch = { seq: 0, at: -1e9 };

const SCENARIOS: Record<string, Scenario> = {
  // A missed hook: Juneau never strikes, the fish flicks its tail and gets away.
  miss: {
    phase: 0.22,
    fishers: [
      { seat: 2, name: "Juneau", spot: shore(2.6), at: shore(2.6, 2), noHook: true },
      { seat: 0, name: "Dad", spot: shore(2.2), at: shore(2.2, 2), noHook: true },
    ],
    warmUntil: (l) => l.fishers.some((f) => f.mode === "bite"),
    direct: (l, now) => {
      const seq = l.fishers.reduce((a, f) => a + f.missSeq, 0);
      if (seq > missWatch.seq) {
        missWatch.seq = seq;
        missWatch.at = now;
      }
      return l;
    },
    hero: (_l, now, s) => now - s > 1500 && now - missWatch.at > 380 && now - missWatch.at < 520,
  },
  morning: {
    phase: 0.14,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(2.2) },
      { seat: 2, name: "Juneau", spot: DOCK_SPOT },
    ],
    hero: (_l, now, s) => now - s > 5000,
  },
  "four-reel": {
    phase: 0.22,
    fishers: [
      { seat: 0, name: "Dad", spot: DOCK_SPOT, at: { x: 0, z: DOCK.tipZ + 1.5 } },
      { seat: 1, name: "Mom", spot: "swirl" },
      { seat: 2, name: "Juneau", spot: shore(2.75), at: shore(2.75, 2) },
      { seat: 3, name: "Sis", spot: shore(0.5), easy: true, at: shore(0.5, 2) },
    ],
    setup: (l, now) => forceSwirl(l, 3.6, false, now),
    warmUntil: (l) => l.fishers.filter((f) => f.mode === "reel").length >= 2,
    hero: (l, now) => inCatch(l, now, 1100, 1900) && l.fishers.some((f) => f.mode === "reel"),
  },
  // Round 23 (round 22 session 125-141 s: Dad's phone said "let go" for 16 s, the TV showed nothing): a reel
  // while the fish thrashes, the bent rod, the taut line and the splash burst at the bobber.
  "reel-thrash": {
    phase: 0.3,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(2.4), at: shore(2.4, 2) },
      { seat: 2, name: "Juneau", spot: shore(2.9), at: shore(2.9, 2) },
    ],
    warmUntil: (l) => l.fishers.some((f) => f.mode === "reel"),
    hero: (l, now) =>
      l.fishers.some((f) => {
        const def = f.reel ? fishById(f.reel.fishId) : undefined;
        return f.mode === "reel" && f.reel !== null && def !== undefined && thrashingAt(def.fight, f.reel, now) && now - f.reel.hookAt > 1500;
      }),
  },
  "golden-swirl": {
    phase: 0.43,
    fishers: [
      { seat: 2, name: "Juneau", spot: "golden", at: shore(2.4, 3) },
      { seat: 0, name: "Dad", spot: "golden", at: shore(2.0, 3) },
    ],
    setup: (l, now) => forceSwirl(l, 2.3, true, now),
    warmUntil: (l) => l.fishers.some((f) => f.mode === "wait"),
    hero: (l, now, s) => now - s > 4000 && l.fishers.some((f) => f.mode === "reel" || f.mode === "bite"),
  },
  "night-catch": {
    phase: 0.7,
    fishers: [
      { seat: 2, name: "Juneau", spot: shore(2.6), at: shore(2.6, 2) },
      { seat: 0, name: "Dad", spot: DOCK_SPOT },
    ],
    direct: (l) =>
      produce(l, (d) => {
        for (const f of d.fishers) if (f.mode === "reel" && f.reel && f.seat === 2 && f.reel.fishId !== "glowfin") {
          f.reel.fishId = "glowfin";
          f.reel.cm = 34;
        }
        d.journal = Object.fromEntries(Object.entries(d.journal).filter(([id]) => id !== "glowfin"));
      }),
    warmUntil: (l) => l.fishers.some((f) => f.seat === 2 && f.mode === "reel"),
    hero: (l, now) => inCatch(l, now, 1300, 2000),
  },
  "rod-upgrade": {
    phase: 0.3,
    fishers: [
      { seat: 2, name: "Juneau", spot: shore(2.5), at: shore(2.5, 2) },
      { seat: 1, name: "Mom", spot: shore(1.9), at: shore(1.9, 2) },
    ],
    setup: (l) => produce(l, (d) => { d.shells = 19; d.rodTier = 0; }),
    warmUntil: (l) => l.fishers.some((f) => f.mode === "reel"),
    hero: (l, now) => l.upgradeSeq > 0 && inCatch(l, now, 1000, 1700),
  },
  campfire: {
    phase: 0.62,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(1.6) },
      { seat: 1, name: "Mom", spot: shore(1.4) },
      { seat: 2, name: "Juneau", spot: shore(1.2) },
      { seat: 3, name: "Sis", spot: shore(1.0) },
    ],
    campfire: true,
    hero: (_l, now, s) => now - s > 4500,
  },
  empty: { phase: 0.4, fishers: [], hero: (_l, now, s) => now - s > 3000 },
  // ---- the valley: each place with the family fishing there ----
  moonwell: {
    phase: 0.2,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(2.4), at: shore(2.4, 2) },
      { seat: 1, name: "Mom", spot: shore(0.9), at: shore(0.9, 2) },
      { seat: 2, name: "Juneau", spot: DOCK_SPOT },
    ],
    setup: discoverAll,
    hero: calm,
  },
  mistmarsh: {
    phase: 0.44,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", 0.2), at: shoreIn("mistmarsh", 0.2, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", 1.0), at: shoreIn("mistmarsh", 1.0, 2) },
      { seat: 3, name: "Sis", spot: shoreIn("mistmarsh", 1.7), easy: true, at: shoreIn("mistmarsh", 1.7, 2) },
    ],
    setup: both(discoverOnly(["mistmarsh"]), swirlIn("mistmarsh", 0.6, false)),
    hero: calm,
  },
  pools: {
    phase: 0.24,
    fishers: [
      { seat: 1, name: "Mom", spot: shoreIn("pools", 0.4), at: shoreIn("pools", 0.4, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("pools", 1.4), at: shoreIn("pools", 1.4, 2) },
    ],
    setup: both(discoverOnly(["pools"]), swirlIn("pools", 0.9, false)),
    hero: calm,
  },
  hollow: {
    phase: 0.3,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("hollow", 2.0), at: shoreIn("hollow", 2.0, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("hollow", 1.2), at: shoreIn("hollow", 1.2, 2) },
      { seat: 3, name: "Sis", spot: shoreIn("hollow", 0.5), easy: true, at: shoreIn("hollow", 0.5, 2) },
    ],
    setup: both(discoverOnly(["hollow"]), swirlIn("hollow", 1.4, false)),
    hero: calm,
  },
  tarn: {
    phase: 0.12,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("tarn", 1.9), at: shoreIn("tarn", 1.9, 2) },
      { seat: 1, name: "Mom", spot: shoreIn("tarn", 1.2), at: shoreIn("tarn", 1.2, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("tarn", 0.6), at: shoreIn("tarn", 0.6, 2) },
      { seat: 3, name: "Sis", spot: shoreIn("tarn", 2.6), easy: true, at: shoreIn("tarn", 2.6, 2) },
    ],
    setup: both(discoverAll, swirlIn("tarn", 1.3, false)),
    hero: calm,
  },
  // The family walking the trail from Moonwell Lake toward Mistmarsh (not found yet: it glows ahead).
  trail: {
    phase: 0.36,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.6, 1.5), at: onTrailAt(0, -0.16, 1.2) },
      { seat: 1, name: "Mom", spot: shoreIn("mistmarsh", -0.4, 1.5), at: onTrailAt(0, -0.22, -1.2) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.8, 1.5), at: onTrailAt(0, -0.1, 0) },
      { seat: 3, name: "Sis", spot: shoreIn("mistmarsh", -0.5, 1.5), at: onTrailAt(0, -0.26, 0.4) },
    ],
    warmUntil: () => true,
    hero: (l, now, s) => now - s > 3500 && areaAt(centroid(l)) === null && centroid(l).x < -38,
  },
  // Round 14 (session 49-66 s): Dad and Juneau leave the Moonwell lawn and walk the whole trail
  // into Mistmarsh; trees beside the path must never hang over them (54 s), half-faded or whole. The shot
  // is mid-trail, in the woods.
  "trail-walk": {
    phase: 0.34,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.6, 1.5), at: onTrailAt(0, -0.36, 1.5) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.8, 1.5), at: onTrailAt(0, -0.33, -1.5) },
    ],
    setup: discoverOnly(["mistmarsh"]),
    hero: (l, now, s) => now - s > 2200 && areaAt(centroid(l)) === null,
  },
  // Round 13 (session 160 s: a golden swirl at Mistmarsh announced and never shown): the family on the
  // trail with a golden swirl in the marsh ahead; the beacon must read on the TV.
  "golden-trail": {
    phase: 0.36,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.6, 1.5), at: onTrailAt(0, -0.16, 1.2) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.8, 1.5), at: onTrailAt(0, -0.1, 0) },
    ],
    setup: both(discoverOnly(["mistmarsh"]), swirlIn("mistmarsh", 0.6, true)),
    warmUntil: () => true,
    hero: (l, now, s) => now - s > 3500 && areaAt(centroid(l)) === null && centroid(l).x < -38,
  },
  // Two catches at once, side by side.
  "double-catch": {
    phase: 0.25,
    fishers: [
      { seat: 0, name: "Dad", spot: shore(2.3), easy: true, at: shore(2.3, 2) },
      { seat: 3, name: "Sis", spot: shore(2.15), easy: true, at: shore(2.15, 2) },
    ],
    direct: (l) => produce(l, (d) => { for (const f of d.fishers) if (f.reel) f.reel.fishId = f.seat === 0 ? "perch" : "bluegill"; }),
    warmUntil: (l) => l.fishers.every((f) => f.mode === "reel"),
    hero: (l, now) => l.fishers.filter((f) => f.mode === "catch" && f.catch !== null && now - f.catch.at > 900 && now - f.catch.at < 2600).length >= 2,
  },
  // Round 20 (round 19 session 216-257 s): Dad and Juneau fishing Mistmarsh from the shore they arrive
  // on (north-east, by the boardwalk), as the family really does; the shot is mid-catch (the push-in).
  "mistmarsh-catch": {
    phase: 0.36,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.45), easy: true, at: shoreIn("mistmarsh", -0.45, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.7), at: shoreIn("mistmarsh", -0.7, 2) },
    ],
    setup: discoverOnly(["mistmarsh"]),
    warmUntil: (l) => l.fishers.some((f) => f.mode === "reel"),
    hero: (l, now) => inCatch(l, now, 1300, 2000),
  },
  // Round 21 (round 20 session 144-202 s): Dad out on Mistmarsh's boardwalk, Juneau on the shore at its
  // foot, both catching; the shot is the catch push-in (wisteria over Dad at 184/202 s, Juneau in front of him).
  "mistmarsh-dock": {
    phase: 0.36,
    fishers: [
      { seat: 0, name: "Dad", spot: walkAt(4), easy: true, at: walkAt(4) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -1.62), at: shoreIn("mistmarsh", -1.62, 2) },
    ],
    setup: discoverOnly(["mistmarsh"]),
    warmUntil: (l) => l.fishers.some((f) => f.mode === "reel"),
    hero: (l, now) => inCatch(l, now, 1300, 2000),
  },
  // Round 24 (round 23 session 136-211 s): Dad fishing on the shore at the foot of Mistmarsh's boardwalk,
  // Juneau tagged along to the free castable spot the rules give him beside Dad (lake.ts besideAtShore:
  // world.fishingSpot within 8 m, Dad's spot taken), which put him in front of Dad on the TV; the shot is
  // Dad's catch held up (the stack check: nobody covers the catcher or the fish).
  "mistmarsh-dock-foot": {
    phase: 0.36,
    fishers: [
      { seat: 0, name: "Dad", spot: dockFoot(), easy: true, at: dockFoot() },
      { seat: 2, name: "Juneau", spot: besideDockFoot(), at: besideDockFoot(), noHook: true },
    ],
    setup: discoverOnly(["mistmarsh"]),
    warmUntil: (l) => l.fishers.some((f) => f.seat === 0 && f.mode === "reel"),
    hero: (l, now) => inCatch(l, now, 1300, 2000),
  },
  // The same, while both reel in (the lines and bobbers by the boardwalk).
  "mistmarsh-reel": {
    phase: 0.36,
    fishers: [
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.45), easy: true, at: shoreIn("mistmarsh", -0.45, 2) },
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.7), at: shoreIn("mistmarsh", -0.7, 2) },
    ],
    setup: discoverOnly(["mistmarsh"]),
    warmUntil: (l) => l.fishers.some((f) => f.mode === "reel"),
    hero: (l) => l.fishers.some((f) => f.mode === "reel" && f.reel !== null && f.reel.progress > 0.55),
  },
  // The family strung out along the trail: one at the lake, one mid-trail, one at the marsh's edge.
  spread: {
    phase: 0.3,
    fishers: [
      { seat: 0, name: "Dad", spot: onTrailAt(0, -0.3), at: onTrailAt(0, -0.3) },
      { seat: 2, name: "Juneau", spot: onTrailAt(0, 0.5), at: onTrailAt(0, 0.5) },
      { seat: 1, name: "Mom", spot: onTrailAt(0, 1.05), at: onTrailAt(0, 1.05) },
    ],
    setup: discoverOnly(["mistmarsh"]),
    warmUntil: () => true,
    hero: (_l, now, s) => now - s > 4500,
  },
  // Juneau walks out of the trees into Mistmarsh: the discovery moment.
  discovery: {
    phase: 0.4,
    fishers: [
      { seat: 2, name: "Juneau", spot: shoreIn("mistmarsh", -0.55, 1.5), at: onTrailAt(0, 0.22, 0) },
      { seat: 0, name: "Dad", spot: shoreIn("mistmarsh", -0.3, 1.5), at: onTrailAt(0, 0.08, 1.2) },
      { seat: 1, name: "Mom", spot: shoreIn("mistmarsh", -0.8, 1.5), at: onTrailAt(0, 0.02, -1.2) },
    ],
    warmUntil: () => true,
    // Round 17: the reveal now eases in over 1.2 s and holds to 3.8 s: shoot the held look.
    hero: (l, now) => l.discovery !== null && now - l.discovery.at > 2800,
  },
  // The family split (round-02 live play): Juneau fishing at the lake, Dad dawdling at the marsh end
  // of the trail, ~29 m apart (the leash is 30 m).
  split: {
    phase: 0.36,
    fishers: [
      { seat: 2, name: "Juneau", spot: shore(2.75), at: shore(2.75, 2) },
      { seat: 0, name: "Dad", spot: onTrailAt(0, 0.9, 0.8), at: onTrailAt(0, 0.85) },
    ],
    setup: discoverOnly(["mistmarsh"]),
    // Dad keeps "touching the stick" (no tag-along back to Juneau).
    direct: (l, now) => produce(l, (d) => { for (const f of d.fishers) if (f.seat === 0) f.lastInputAt = now; }),
    warmUntil: (l) => l.fishers.some((f) => f.seat === 2 && f.mode === "wait"),
    hero: (_l, now, s) => now - s > 6000,
  },
  // A night walk in the woods: Dad and Juneau on the trail between Moonwell and Mistmarsh, lanterns lit.
  "night-woods": {
    phase: 0.68,
    fishers: [
      { seat: 0, name: "Dad", spot: onTrailAt(0, 0.5, 2.2), at: onTrailAt(0, 0.5, 2.2), stay: true },
      { seat: 2, name: "Juneau", spot: onTrailAt(0, 0.47, -1.6), at: onTrailAt(0, 0.47, -1.6), stay: true },
    ],
    setup: discoverAll,
    warmUntil: () => true,
    hero: (l, now, s) => now - s > 4000 && areaAt(centroid(l)) === null,
  },
  // A Moonfin, the legend of Starfall Tarn, at night.
  "night-tarn": {
    phase: 0.68,
    fishers: [
      { seat: 2, name: "Juneau", spot: shoreIn("tarn", 1.1), at: shoreIn("tarn", 1.1, 2) },
      { seat: 0, name: "Dad", spot: shoreIn("tarn", 1.8), at: shoreIn("tarn", 1.8, 2) },
    ],
    setup: discoverAll,
    direct: forceCatchFish(2, "moonfin", 96),
    warmUntil: (l) => l.fishers.some((f) => f.seat === 2 && f.mode === "reel"),
    hero: (l, now) => inCatch(l, now, 1300, 2000),
  },
};

declare global {
  interface Window {
    __lab?: { ready: boolean; heroReady: boolean; scenario: string; lake(): Lake | null; skipTo(ms: number): void; pause(on: boolean): void };
  }
}

function joinAs(lake: Lake, seat: number, name: string, at: Vec | undefined, easy: boolean, kid: boolean): Lake {
  // Join until the requested seat is ours, then drop the placeholders.
  let l = lake;
  const placeholders: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = join(l, { name, ogsId: null });
    l = r.lake;
    if (r.seat === seat || r.seat === null) break;
    placeholders.push(r.seat);
  }
  return produce(l, (d) => {
    d.fishers = d.fishers.filter((f) => !placeholders.includes(f.seat) || f.seat === seat);
    const f = d.fishers.find((x) => x.seat === seat);
    if (f) {
      f.easy = easy;
      f.kid = kid;
      if (at) f.pos = { ...at };
    }
  });
}

function botStep(lake: Lake, f: Fisher, bot: Bot, now: number): Lake {
  let l = lake;
  if (l.campfire || bot.stay) return l;
  if (f.mode === "walk") {
    const dx = bot.target.x - f.pos.x;
    const dz = bot.target.z - f.pos.z;
    const len = Math.hypot(dx, dz);
    const can = castFrom(f.pos);
    if (len > 0.5 && !(can && len < 1.6)) {
      const stick = { x: dx / len, y: -dz / len };
      if (Math.abs(stick.x - bot.stick.x) + Math.abs(stick.y - bot.stick.y) > 0.15) {
        bot.stick = stick;
        l = move(l, f.seat, stick, now);
      }
    } else {
      if (bot.stick.x !== 0 || bot.stick.y !== 0) {
        bot.stick = { x: 0, y: 0 };
        l = move(l, f.seat, bot.stick, now);
      }
      if (now >= bot.nextCastAt) l = action(l, f.seat, now);
    }
  } else if (f.mode === "bite") {
    if (bot.noHook) return l;
    if (bot.hookAt === 0) bot.hookAt = now + 300 + ((f.seat * 97) % 400);
    if (now >= bot.hookAt) {
      bot.hookAt = 0;
      l = action(l, f.seat, now);
    }
  } else if (f.mode === "reel" && f.reel) {
    const def = fishById(f.reel.fishId);
    const thrash = def ? thrashingAt(def.fight, f.reel, now) : false;
    const want = !thrash;
    if (want !== bot.holding && now >= bot.reactAt) {
      bot.holding = want;
      bot.reactAt = now + 180;
      l = reelHold(l, f.seat, want, now);
    } else if (f.reel.holding !== bot.holding) l = reelHold(l, f.seat, bot.holding, now);
  } else if (f.mode === "catch" && f.catch) {
    if (now >= f.catch.at + CATCH_SKIP_MS + 1600) {
      bot.nextCastAt = now + 400;
      l = action(l, f.seat, now);
    }
  }
  return l;
}

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const name = q.get("scenario") ?? "morning";
  const sc = SCENARIOS[name] ?? LAZY[name]?.();
  if (!sc) throw new Error(`unknown scenario ${name}; try ${[...Object.keys(SCENARIOS), ...Object.keys(LAZY)].join(", ")}`);
  const seed = Number(q.get("seed") ?? "7");
  const forceFish = q.get("fish");
  const phaseQ = q.get("phase");
  const phase = phaseQ !== null ? Number(phaseQ) : sc.phase;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block";
  document.body.style.margin = "0";
  document.body.style.background = "#000";
  document.body.appendChild(canvas);

  let now = 1_000_000;
  const startedAt = now - (((phase - DAY_START) % 1) + 1) % 1 * DAY_MS;
  let lake = newLake(seed, startedAt);
  lake = produce(lake, (d) => { d.worldSeed = WORLD_SEED; });
  lake = step(lake, now);
  const bots = new Map<number, Bot>();
  for (const spec of sc.fishers) {
    lake = joinAs(lake, spec.seat, spec.name, spec.at, spec.easy ?? false, spec.kid ?? (spec.name === "Juneau" || spec.name === "Sis"));
    bots.set(spec.seat, { stay: spec.stay ?? false, noHook: spec.noHook ?? false, target: { x: 0, z: 0 }, hookAt: 0, nextCastAt: 0, stick: { x: 0, y: 0 }, holding: false, reactAt: 0, wander: false });
  }
  if (sc.setup) lake = sc.setup(lake, now);
  // ?swapColors=1: colours are chosen per device, not by seat; reverse them to prove the TV follows `color`.
  if (q.get("swapColors")) lake = produce(lake, (d) => { for (const f of d.fishers) f.color = SEAT_COLORS[3 - f.seat]!; });
  const assignTargets = () => {
    for (const spec of sc.fishers) {
      const bot = bots.get(spec.seat);
      if (!bot) continue;
      const t = spec.spot === "swirl" ? swirlSpot(lake, false) : spec.spot === "golden" ? swirlSpot(lake, true) : spec.spot;
      bot.target = t ?? shore(spec.seat * 1.3 + 1.8);
    }
  };
  assignTargets();
  if (sc.campfire) lake = setCampfire(lake, true, now);

  const tick = (dtMs: number) => {
    now += dtMs;
    lake = step(lake, now);
    for (const f of lake.fishers) {
      const bot = bots.get(f.seat);
      if (bot) lake = botStep(lake, f, bot, now);
    }
    if (sc.direct) lake = sc.direct(lake, now);
    // ?fish=<id>: every hooked fish is this one (to see each rarity's catch moment).
    if (forceFish) lake = produce(lake, (d) => { for (const f of d.fishers) if (f.reel && f.reel.fishId !== forceFish) f.reel.fishId = forceFish; });
    if (now % 2000 < dtMs) assignTargets();
  };
  const warmFrom = now;
  if (sc.warmUntil) {
    for (let i = 0; i < 3000 && !sc.warmUntil(lake); i++) tick(50);
  } else for (let i = 0; i < 40; i++) tick(50);
  // The warm-up is virtual time: keep the scenario's time of day where it asked to be.
  const warmed = now - warmFrom;
  lake = produce(lake, (d) => { d.startedAt += warmed; });

  const scene = await createLakeScene(canvas, { quality: q.get("lite") ? "lite" : "full" });
  if (phaseQ !== null) window.__scene?.setPhase(phase);
  const view = q.get("view");
  if (view) window.__scene?.setView(view);
  window.addEventListener("resize", () => scene.resize());

  const lab = {
    ready: false,
    heroReady: false,
    scenario: name,
    lake: () => lake,
    skipTo: (ms: number) => {
      for (let i = 0; i < ms / 50; i++) tick(50);
    },
    pause: (on: boolean) => { paused = on; },
  };
  let paused = sc.freeze ?? false;
  window.__lab = lab;
  let realStart = now;
  let lastReal = performance.now();
  let realT0 = lastReal;
  let sendAcc = 0;
  scene.update(lake, performance.now());
  const pump = () => {
    const p = performance.now();
    const dt = Math.min(200, p - lastReal);
    lastReal = p;
    if (!paused) tick(dt);
    sendAcc += dt;
    if (sendAcc >= 125) {
      sendAcc = 0;
      scene.update(lake, performance.now());
    }
    // A frozen scenario's clock is the wall clock (the rules' clock stands still).
    const heroNow = sc.freeze ? realStart + (p - realT0) : now;
    if (!lab.heroReady && sc.hero(lake, heroNow, realStart)) lab.heroReady = true;
    setTimeout(pump, 16);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    lab.ready = true;
    realStart = now;
    lastReal = performance.now();
    realT0 = lastReal;
    pump();
  }));
  void distance;
  void areaAt;
}

main().catch((e: unknown) => {
  const pre = document.createElement("pre");
  pre.style.cssText = "color:#f88;position:fixed;top:0;left:0;z-index:9;font:14px monospace;white-space:pre-wrap";
  pre.textContent = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  document.body.appendChild(pre);
  console.error(e);
});
