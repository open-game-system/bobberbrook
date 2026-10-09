/**
 * The valley's geometry, shared by the room (who can walk and cast where) and the TV scene (what is
 * drawn where), so the two always agree. Metres; x east, z south. Moonwell Lake, where everyone starts,
 * is centred on the origin; four more places to fish lie up forest trails (AREAS, TRAILS).
 */
export type Vec = { x: number; z: number };
/** Moonwell Lake's own waters (dock, lily pads, below the falls, reeds, open shore), then one per far area. */
export type Water = "dock" | "lily" | "falls" | "reeds" | "shore" | "marsh" | "pools" | "hollow" | "tarn" | "willow" | "crystal" | "ember" | "frost";

export const WALK_SPEED = 5;
/** How far from the water's edge a fisher can still cast. */
export const SHORE_REACH = 2.6;
/** How far out from the edge the bobber lands. */
export const CAST_DISTANCE = 4.5;
const EDGE_MARGIN = 0.4;
const STEP_S = 0.05;

/** The water's edge, by angle around the lake. */
export function lakeRadius(theta: number): number {
  return 17 + 2.4 * Math.sin(2 * theta + 0.6) + 1.4 * Math.sin(3 * theta - 1.1) + 0.8 * Math.sin(5 * theta + 2.0);
}

/** Angular distance between two angles, in [0, π]. */
export function angleGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

export const NORTH = -Math.PI / 2;
export const SOUTH = Math.PI / 2;
export const WEST = Math.PI;
export const EAST = 0;

/** The walkable land's outer limit: hills all round, the waterfall cliff close in on the north. */
export function outerRadius(theta: number): number {
  const cliff = Math.max(0, 1 - angleGap(theta, NORTH) / 0.75);
  return 32 - cliff * (32 - (lakeRadius(theta) + 6));
}

/** The dock runs north from the south shore along x = 0. */
export const DOCK = {
  halfWidth: 1.2,
  rootZ: lakeRadius(SOUTH) + 1,
  tipZ: lakeRadius(SOUTH) - 6.5,
} as const;

/** Big trees and rocks you walk around (the scene draws them here). */
// Stryker disable all: placement data the scene draws; walking around them is tested.
export const OBSTACLES: readonly { x: number; z: number; r: number; kind: "oak" | "pine" | "rock" }[] = [
  { x: 14, z: 22, r: 1.6, kind: "oak" },
  { x: -15, z: 21, r: 1.8, kind: "oak" },
  { x: 25, z: -6, r: 1.4, kind: "pine" },
  { x: -26, z: -4, r: 1.5, kind: "pine" },
  { x: 22, z: 12, r: 1.2, kind: "rock" },
  { x: -23, z: 9, r: 1.3, kind: "rock" },
  { x: 7, z: 27, r: 1.4, kind: "pine" },
  { x: -6, z: 28, r: 1.3, kind: "pine" },
];
// Stryker restore all

/** The campfire (Campfire time) sits on the south-east shore. */
export const CAMPFIRE: Vec = { x: 9, z: lakeRadius(1.15) * Math.sin(1.15) + 5 };

export function polar(p: Vec): { r: number; theta: number } {
  return { r: Math.hypot(p.x, p.z), theta: Math.atan2(p.z, p.x) };
}

export function onDock(p: Vec): boolean {
  return Math.abs(p.x) <= DOCK.halfWidth && p.z >= DOCK.tipZ && p.z <= DOCK.rootZ;
}

/** On solid ground: in a clearing or on a trail, out of every pond, clear of trees and rocks. */
export function onLand(p: Vec): boolean {
  if (AREAS.some((a) => inPond(a, p, EDGE_MARGIN))) return false;
  if (!AREAS.some((a) => inClearing(a, p)) && !onTrail(p)) return false;
  return OBSTACLES.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= o.r + 0.5);
}

export function walkable(p: Vec): boolean {
  return onDock(p) || onLand(p);
}

/** Headings to try when the way ahead is blocked, nearest first (radians). */
export const STEER_HEADINGS = [0, 0.5, -0.5, 1.0, -1.0, 1.4, -1.4];

/** Open ground except for a tree or rock standing there. */
function hitsObstacle(p: Vec): boolean {
  return !OBSTACLES.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= o.r + 0.5);
}

export function turned(v: Vec, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.z * s, z: v.x * s + v.z * c };
}

/** Moves a fisher by a velocity for dt seconds, steering round trees and rocks and sliding along the shore. */
export function advance(pos: Vec, vel: Vec, dt: number): Vec {
  if (dt <= 0 || (vel.x === 0 && vel.z === 0)) return pos;
  let p = pos;
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(STEP_S, left);
    left -= h;
    const next = stepOnce(p, vel, h);
    if (!next) break;
    p = next;
  }
  return p;
}

/** One small step: straight on; a tree or rock in the way: veer round it; the shore: slide along it on one axis. Undefined when stuck. */
function stepOnce(p: Vec, vel: Vec, h: number): Vec | undefined {
  const ahead = { x: p.x + vel.x * h, z: p.z + vel.z * h };
  const heads = walkable(ahead) ? [vel] : hitsObstacle(ahead) ? STEER_HEADINGS.map((a) => turned(vel, a)) : [{ x: vel.x, z: 0 }, { x: 0, z: vel.z }];
  return heads.map((v) => ({ x: p.x + v.x * h, z: p.z + v.z * h })).find(walkable);
}

/** Where the bobber lands from here, and which water it is in; null when too far from the water. */
export function castFrom(p: Vec): { bobber: Vec; water: Water } | null {
  if (onDock(p)) {
    if (p.z > DOCK.tipZ + 2.5) return null;
    return { bobber: { x: p.x * 0.4, z: DOCK.tipZ - CAST_DISTANCE }, water: "dock" };
  }
  if (!onLand(p)) return null;
  for (const a of AREAS) {
    const { r, theta } = polarIn(a, p);
    const edge = pondRadius(a, theta);
    if (r - edge > SHORE_REACH) continue;
    return { bobber: castRingIn(a, theta), water: a.id === "moonwell" ? waterAt(theta) : a.water };
  }
  return null;
}

/** The kind of water at an angle around the lake (the dock is its own, cast from the dock). */
export function waterAt(theta: number): Water {
  if (angleGap(theta, WEST) <= 0.6) return "lily";
  if (angleGap(theta, NORTH) <= 0.55) return "falls";
  if (angleGap(theta, EAST) <= 0.6) return "reeds";
  return "shore";
}

/** Where a seat's fisher starts: in a row at the foot of the dock. */
export function spawnPoint(seat: number): Vec {
  return { x: -3.3 + 2.2 * seat, z: DOCK.rootZ + 2.5 };
}

/** A point on the bobber line (the ring a straight cast lands on) at an angle: swirls float there. */
export function castRing(theta: number): Vec {
  const r = lakeRadius(theta) - CAST_DISTANCE;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
}

/** The lake's outline as a polygon (mini-maps, the scene's shoreline mesh). */
export function lakeOutline(points = 96): Vec[] {
  return Array.from({ length: points }, (_, i) => {
    const theta = (i / points) * 2 * Math.PI;
    const r = lakeRadius(theta);
    return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
  });
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ---------- the valley: five places to fish, joined by forest trails ----------

export type AreaId = "moonwell" | "mistmarsh" | "pools" | "hollow" | "tarn";

export type Area = {
  id: AreaId;
  name: string;
  center: Vec;
  /** The pond's wobbly edge: base radius plus three sine bumps (amplitude, phase) at 2, 3 and 5 lobes. */
  pond: { r: number; bumps: readonly [number, number, number]; phases: readonly [number, number, number] };
  /** How far the walkable clearing reaches beyond the pond's base radius. */
  clearing: number;
  water: Water;
};

// Stryker disable all: layout data; walking, casting and discovery over it are tested.
export const AREAS: readonly Area[] = [
  { id: "moonwell", name: "Moonwell Lake", center: { x: 0, z: 0 }, pond: { r: 17, bumps: [2.4, 1.4, 0.8], phases: [0.6, -1.1, 2.0] }, clearing: 15, water: "shore" },
  { id: "mistmarsh", name: "Mistmarsh", center: { x: -64, z: 40 }, pond: { r: 13, bumps: [2.2, 1.6, 1.0], phases: [1.3, 0.4, -0.7] }, clearing: 11, water: "marsh" },
  { id: "pools", name: "Whisperfall Pools", center: { x: -6, z: -72 }, pond: { r: 10, bumps: [1.6, 1.0, 0.6], phases: [-0.4, 2.2, 0.9] }, clearing: 11, water: "pools" },
  { id: "hollow", name: "Glowshroom Hollow", center: { x: 70, z: -8 }, pond: { r: 11, bumps: [1.8, 1.2, 0.7], phases: [2.6, -0.3, 1.4] }, clearing: 10, water: "hollow" },
  { id: "tarn", name: "Starfall Tarn", center: { x: 52, z: -80 }, pond: { r: 13, bumps: [2.0, 1.1, 0.9], phases: [0.2, 1.7, -1.5] }, clearing: 11, water: "tarn" },
];

/** Forest trails between places (segments, half-width TRAIL_HALF_WIDTH). */
export const TRAIL_HALF_WIDTH = 2.8;
export const TRAILS: readonly { from: Vec; to: Vec; joins: readonly [AreaId, AreaId] }[] = [
  { from: { x: -24.9, z: 14.9 }, to: { x: -45.5, z: 28.1 }, joins: ["moonwell", "mistmarsh"] },
  { from: { x: -22.3, z: -18.5 }, to: { x: -11.5, z: -53.8 }, joins: ["moonwell", "pools"] },
  { from: { x: 28.9, z: -2.9 }, to: { x: 51.1, z: -5.7 }, joins: ["moonwell", "hollow"] },
  { from: { x: 13, z: -74.6 }, to: { x: 32.2, z: -77.3 }, joins: ["pools", "tarn"] },
  { from: { x: 65.4, z: -26.4 }, to: { x: 56.9, z: -60.6 }, joins: ["hollow", "tarn"] },
];
// Stryker restore all

const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]));
export function areaById(id: AreaId): Area {
  const a = AREA_BY_ID.get(id);
  if (!a) throw new Error(`no area ${id}`);
  return a;
}

export function polarIn(a: Area, p: Vec): { r: number; theta: number } {
  return polar({ x: p.x - a.center.x, z: p.z - a.center.z });
}

/** A pond's edge at an angle around its centre (Moonwell's is lakeRadius). */
export function pondRadius(a: Area, theta: number): number {
  const { r, bumps, phases } = a.pond;
  return r + bumps[0] * Math.sin(2 * theta + phases[0]) + bumps[1] * Math.sin(3 * theta + phases[1]) + bumps[2] * Math.sin(5 * theta + phases[2]);
}

export function inPond(a: Area, p: Vec, margin = 0): boolean {
  const { r, theta } = polarIn(a, p);
  return r < pondRadius(a, theta) + margin;
}

/** The walkable clearing around a pond (Moonwell's is hemmed in by the falls cliff: outerRadius). */
export function inClearing(a: Area, p: Vec): boolean {
  const { r, theta } = polarIn(a, p);
  return r <= (a.id === "moonwell" ? outerRadius(theta) : a.pond.r + a.clearing);
}

/** Distance from a point to a segment. */
export function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

export function onTrail(p: Vec): boolean {
  return TRAILS.some((t) => segmentDistance(p, t.from, t.to) <= TRAIL_HALF_WIDTH);
}

/** The place a point is in (its clearing), or null on a trail between places. */
export function areaAt(p: Vec): Area | null {
  return AREAS.find((a) => inClearing(a, p)) ?? null;
}

/** Where a straight cast from the shore at an angle lands in a pond (swirls float on this ring). */
export function castRingIn(a: Area, theta: number): Vec {
  const edge = pondRadius(a, theta);
  const r = edge - Math.min(CAST_DISTANCE, edge * 0.45);
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
}

/** A pond's outline as a polygon (mini-maps, the scene's shoreline). */
export function pondOutline(a: Area, points = 72): Vec[] {
  return Array.from({ length: points }, (_, i) => {
    const theta = (i / points) * 2 * Math.PI;
    const r = pondRadius(a, theta);
    return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
  });
}

// ---------- getting somewhere: round ponds, along trails ----------

/** Whether the straight walk from a to b crosses any pond. */
export function crossesWater(a: Vec, b: Vec): boolean {
  const n = Math.max(2, Math.ceil(distance(a, b) / 1.5));
  for (let i = 1; i < n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
    if (AREAS.some((ar) => inPond(ar, p, 1.2))) return true;
  }
  return false;
}

/** The next point to head for on the way from `from` to `to` inside one place: straight, or round the pond's rim the short way. */
export function roundThePond(from: Vec, to: Vec): Vec {
  if (!crossesWater(from, to)) return to;
  const a = areaAt(from) ?? AREAS.find((ar) => inPond(ar, to, 6)) ?? AREAS[0]!;
  const me = polarIn(a, from);
  const goal = polarIn(a, to);
  let gap = goal.theta - me.theta;
  while (gap > Math.PI) gap -= 2 * Math.PI;
  while (gap < -Math.PI) gap += 2 * Math.PI;
  const theta = me.theta + Math.sign(gap || 1) * Math.min(Math.abs(gap), 0.22);
  const r = pondRadius(a, theta) + 3.2;
  return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
}

/** The places to walk through, by trail, from one place to another (breadth-first over the trails). */
export function route(from: AreaId, to: AreaId): AreaId[] {
  const prev = new Map<AreaId, AreaId>();
  const queue: AreaId[] = [from];
  const seen = new Set<AreaId>([from]);
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const next of trailNeighbours(at)) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, at);
      queue.push(next);
    }
  }
  return walkBack(prev, from, to);
}

/** The places one trail away, in TRAILS order. */
export function trailNeighbours(at: AreaId): AreaId[] {
  return TRAILS.map((t) => otherEnd(t.joins, at)).filter((x): x is AreaId => x !== null);
}

/** The far end of a trail joining `ends`, from `at` (null if the trail doesn't touch `at`). */
export function otherEnd(ends: readonly [AreaId, AreaId], at: AreaId): AreaId | null {
  return ends[0] === at ? ends[1] : ends[1] === at ? ends[0] : null;
}

/** Walks predecessors back from `to` to `from`; [] when `to` was never reached. */
export function walkBack<K>(prev: ReadonlyMap<K, K>, from: K, to: K): K[] {
  const path: K[] = [to];
  while (path[0] !== from) {
    const p = prev.get(path[0]!);
    if (p === undefined) return [];
    path.unshift(p);
  }
  return path;
}

/** The next point to walk to on the way from `here` to a target in another place: the trailhead out of this place. */
export function nextWaypoint(here: Vec, target: Vec): Vec {
  const fromArea = areaAt(here);
  const toArea = areaAt(target);
  if (!toArea || fromArea?.id === toArea.id) return target;
  if (!fromArea) return trailEndToward(here, target);
  return trailheadToward(fromArea, toArea.id, target);
}

/** On a trail: walk to the end that leads toward the target (no trail here: straight at it). */
function trailEndToward(here: Vec, target: Vec): Vec {
  const t = TRAILS.find((tr) => onTrailNear(here, tr));
  if (!t) return target;
  return distance(t.from, target) < distance(t.to, target) ? t.from : t.to;
}

/** In a place, bound for another: this place's end of the first trail on the route (no route: straight at the target). */
function trailheadToward(fromArea: Area, to: AreaId, target: Vec): Vec {
  const step = route(fromArea.id, to)[1];
  if (!step) return target;
  const trail = TRAILS.find((tr) => tr.joins.includes(fromArea.id) && tr.joins.includes(step));
  if (!trail) return target;
  return distance(trail.from, fromArea.center) < distance(trail.to, fromArea.center) ? trail.from : trail.to;
}

function onTrailNear(p: Vec, t: (typeof TRAILS)[number]): boolean {
  const dx = t.to.x - t.from.x;
  const dz = t.to.z - t.from.z;
  const k = Math.max(0, Math.min(1, ((p.x - t.from.x) * dx + (p.z - t.from.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (t.from.x + k * dx), p.z - (t.from.z + k * dz)) <= 4;
}


/** The next point to head for, anywhere in the valley: along the trails between places, round a pond within one. */
export function navNext(from: Vec, to: Vec): Vec {
  const way = nextWaypoint(from, to);
  return roundThePond(from, way);
}
