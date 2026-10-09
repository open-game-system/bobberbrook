import type { ButtonState } from "./fisherUi";
import { LEASH, type Lake, type Swirl } from "../game/lake";
import { worldFor, type Platform } from "../game/regions";
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
  return goldenGoal(lake, from) ?? swirlGoal(lake, from, localSwirls(lake, from)) ?? exploreGoal(lake, from) ?? rideGoal(lake, from) ?? swirlGoal(lake, from, lake.swirls);
}

function goldenGoal(lake: Lake, from: Vec): Goal | null {
  const golden = lake.swirls.find((s) => s.golden && dist(s.pos, from) < 2.5 * 96);
  return golden ? { at: shoreFor(lake, golden), golden: true, explore: false } : null;
}

function localSwirls(lake: Lake, from: Vec): Swirl[] {
  const here = worldFor(lake.worldSeed).areaAt(from)?.id;
  return lake.swirls.filter((s) => s.area === here);
}

/** The shore behind the nearest of these swirls (null if there are none). */
function swirlGoal(lake: Lake, from: Vec, swirls: Swirl[]): Goal | null {
  const s = nearestSwirl(lake, from, swirls);
  return s ? { at: shoreFor(lake, s), golden: false, explore: false } : null;
}

/** The swirl whose casting shore is nearest `from` (the first on a tie). */
export function nearestSwirl(lake: Pick<Lake, "worldSeed">, from: Vec, list: Swirl[]): Swirl | null {
  return list.reduce<Swirl | null>((b, s) => (!b || dist(shoreFor(lake, s), from) < dist(shoreFor(lake, b), from) ? s : b), null);
}

function exploreGoal(lake: Lake, from: Vec): Goal | null {
  const place = nearestUnfound(worldFor(lake.worldSeed).placesNear(from, 2), lake.discovered, from);
  return place ? { at: place.center, golden: false, explore: true } : null;
}

/** The nearest place nobody has found yet (the first on a tie). */
export function nearestUnfound<P extends { id: string; center: Vec }>(places: P[], discovered: string[], from: Vec): P | null {
  return places.filter((p) => !discovered.includes(p.id)).reduce<P | null>((b, p) => (!b || dist(p.center, from) < dist(b.center, from) ? p : b), null);
}

function rideGoal(lake: Lake, from: Vec): Goal | null {
  const ride = nearestRide(worldFor(lake.worldSeed).platformsNear(from, 2), lake.discovered, from);
  return ride ? { at: ride.at, golden: false, explore: true, vehicle: ride.kind } : null;
}

/** The nearest boat or zeppelin mooring that goes somewhere nobody has found yet (the first on a tie). */
export function nearestRide(platforms: Pick<Platform, "at" | "kind" | "toPlace">[], discovered: string[], from: Vec): { at: Vec; kind: "boat" | "zeppelin" } | null {
  return platforms
    .filter((p) => !discovered.includes(p.toPlace))
    .reduce<{ at: Vec; kind: "boat" | "zeppelin" } | null>((b, p) => (!b || dist(p.at, from) < dist(b.at, from) ? { at: p.at, kind: p.kind } : b), null);
}

/** The compass arrow (screen angle: 0 = right, π/2 = down, the minimap's north-up frame). */
export function compassTo(lake: Lake, from: Vec, mySeat?: number): Compass | null {
  const back = backToFamily(lake, from, mySeat);
  if (back) return back;
  const goal = sharedGoal(lake, from);
  return goal ? arrowTo(lake, from, goal) : null;
}

/**
 * The family's one goal: chosen from the middle of everyone, so every device's arrow leads to the same
 * place (round 09: Dad's and Juneau's arrows pointed opposite ways). Fishing alone: from `from`.
 */
export function sharedGoal(lake: Lake, from: Vec): Goal | null {
  const n = lake.fishers.length;
  if (n < 2) return compassGoal(lake, from);
  const middle = { x: lake.fishers.reduce((a, f) => a + f.pos.x, 0) / n, z: lake.fishers.reduce((a, f) => a + f.pos.z, 0) / n };
  return compassGoal(lake, middle);
}

/** Gone too far ahead: point back to the family (they're on their way). */
function backToFamily(lake: Lake, from: Vec, mySeat: number | undefined): Compass | null {
  if (mySeat === undefined) return null;
  const mid = familyMiddle(lake, mySeat);
  if (!mid || !atLeashEnd(lake, mySeat, from)) return null;
  return { angle: Math.atan2(mid.z - from.z, mid.x - from.x), distance: dist(mid, from), golden: false, explore: false, family: true, arrived: false };
}

/** The arrow toward a goal: along the way there (round ponds, by trail), arrived once on a swirl's shore. */
function arrowTo(lake: Lake, from: Vec, goal: Goal): Compass {
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

/**
 * Whether the arrow shows for this button state. With the rod showing the kid should fish here, so a
 * swirl arrow (which flips as swirls move) would only say "go elsewhere"; a golden swirl or the family
 * calling still shows.
 */
export function compassShown(kind: ButtonState["kind"], c: Compass | null): Compass | null {
  if (!c) return null;
  if (kind === "walk-to-water") return c;
  return kind === "cast" && (c.golden || c.family === true) ? c : null;
}
