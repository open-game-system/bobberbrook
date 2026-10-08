import { LEASH, type Lake, type Swirl } from "../game/lake";
import { worldFor } from "../game/regions";
import { SHORE_REACH, pondRadius, type Vec } from "../game/world";

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

/** Where to stand to cast straight into a swirl: on the shore just behind it. */
export function shoreFor(lake: Pick<Lake, "worldSeed">, s: Pick<Swirl, "theta" | "area">): Vec {
  const a = worldFor(lake.worldSeed).placeById(s.area);
  if (!a) return { x: 0, z: 0 };
  const r = pondRadius(a, s.theta) + SHORE_REACH * 0.5;
  return { x: a.center.x + Math.cos(s.theta) * r, z: a.center.z + Math.sin(s.theta) * r };
}

export type Compass = { angle: number; distance: number; golden: boolean; explore: boolean; family?: boolean; vehicle?: "boat" | "zeppelin"; arrived: boolean };

/** The middle of everyone else (null when fishing alone). */
export function familyMiddle(lake: Lake, mySeat: number): Vec | null {
  const others = lake.fishers.filter((f) => f.seat !== mySeat);
  if (others.length === 0) return null;
  return { x: others.reduce((a, f) => a + f.pos.x, 0) / others.length, z: others.reduce((a, f) => a + f.pos.z, 0) / others.length };
}

/** At the end of the family's leash: this fisher can't go further until the others catch up. */
export function atLeashEnd(lake: Lake, mySeat: number, from: Vec): boolean {
  const mid = familyMiddle(lake, mySeat);
  return mid !== null && dist(mid, from) >= LEASH - 1.5;
}

type Goal = { at: Vec; golden: boolean; explore: boolean; vehicle?: "boat" | "zeppelin" };

/**
 * What the kid should walk toward: a golden swirl nearby, else a swirl in this place, else the nearest
 * place nobody has found yet (through the fog), else a boat or zeppelin to somewhere new, else any swirl.
 */
export function compassGoal(lake: Lake, from: Vec): Goal | null {
  const w = worldFor(lake.worldSeed);
  const golden = lake.swirls.find((s) => s.golden && dist(s.pos, from) < 2.5 * 96);
  if (golden) return { at: shoreFor(lake, golden), golden: true, explore: false };
  const here = w.areaAt(from)?.id;
  const local = lake.swirls.filter((s) => s.area === here);
  const nearestSwirl = (list: Swirl[]) => list.reduce<Swirl | null>((b, s) => (!b || dist(shoreFor(lake, s), from) < dist(shoreFor(lake, b), from) ? s : b), null);
  const swirlHere = nearestSwirl(local);
  if (swirlHere) return { at: shoreFor(lake, swirlHere), golden: false, explore: false };
  const unfound = w.placesNear(from, 2).filter((p) => !lake.discovered.includes(p.id));
  const place = unfound.reduce<(typeof unfound)[number] | null>((b, p) => (!b || dist(p.center, from) < dist(b.center, from) ? p : b), null);
  if (place) return { at: place.center, golden: false, explore: true };
  const ride = w
    .platformsNear(from, 2)
    .filter((p) => !lake.discovered.includes(p.toPlace))
    .reduce<{ at: Vec; kind: "boat" | "zeppelin" } | null>((b, p) => (!b || dist(p.at, from) < dist(b.at, from) ? { at: p.at, kind: p.kind } : b), null);
  if (ride) return { at: ride.at, golden: false, explore: true, vehicle: ride.kind };
  const any = nearestSwirl(lake.swirls);
  return any ? { at: shoreFor(lake, any), golden: false, explore: false } : null;
}

/** The compass arrow (screen angle: 0 = right, π/2 = down, the minimap's north-up frame). */
export function compassTo(lake: Lake, from: Vec, mySeat?: number): Compass | null {
  const mid = mySeat === undefined ? null : familyMiddle(lake, mySeat);
  if (mySeat !== undefined && mid && atLeashEnd(lake, mySeat, from)) {
    // Gone too far ahead: point back to the family (they're on their way).
    return { angle: Math.atan2(mid.z - from.z, mid.x - from.x), distance: dist(mid, from), golden: false, explore: false, family: true, arrived: false };
  }
  const goal = compassGoal(lake, from);
  if (!goal) return null;
  const way = worldFor(lake.worldSeed).navNext(from, goal.at);
  const distance = dist(goal.at, from);
  return {
    angle: Math.atan2(way.z - from.z, way.x - from.x),
    distance,
    golden: goal.golden,
    explore: goal.explore,
    ...(goal.vehicle ? { vehicle: goal.vehicle } : {}),
    arrived: !goal.explore && distance < 2.2,
  };
}
