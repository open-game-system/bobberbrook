/**
 * Bobberbrook Lake's geometry, shared by the room (who can walk and cast where) and the TV scene (what
 * is drawn where), so the two always agree. Metres; x east, z south; the lake is centred on the origin.
 */
export type Vec = { x: number; z: number };
export type Water = "dock" | "lily" | "falls" | "reeds" | "shore";

export const WALK_SPEED = 4.2;
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

/** The campfire (Campfire time) sits on the south-east shore. */
export const CAMPFIRE: Vec = { x: 9, z: lakeRadius(1.15) * Math.sin(1.15) + 5 };

export function polar(p: Vec): { r: number; theta: number } {
  return { r: Math.hypot(p.x, p.z), theta: Math.atan2(p.z, p.x) };
}

export function onDock(p: Vec): boolean {
  return Math.abs(p.x) <= DOCK.halfWidth && p.z >= DOCK.tipZ && p.z <= DOCK.rootZ;
}

export function onLand(p: Vec): boolean {
  const { r, theta } = polar(p);
  if (r < lakeRadius(theta) + EDGE_MARGIN || r > outerRadius(theta)) return false;
  return OBSTACLES.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= o.r + 0.5);
}

export function walkable(p: Vec): boolean {
  return onDock(p) || onLand(p);
}

/** Moves a fisher by a velocity for dt seconds, sliding along the shore and around obstacles. */
export function advance(pos: Vec, vel: Vec, dt: number): Vec {
  if (dt <= 0 || (vel.x === 0 && vel.z === 0)) return pos;
  let p = pos;
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(STEP_S, left);
    left -= h;
    const tries: Vec[] = [
      { x: p.x + vel.x * h, z: p.z + vel.z * h },
      { x: p.x + vel.x * h, z: p.z },
      { x: p.x, z: p.z + vel.z * h },
    ];
    const next = tries.find(walkable);
    if (!next) break;
    p = next;
  }
  return p;
}

/** Where the bobber lands from here, and which water it is in; null when too far from the water. */
export function castFrom(p: Vec): { bobber: Vec; water: Water } | null {
  if (onDock(p)) {
    if (p.z > DOCK.tipZ + 2.5) return null;
    return { bobber: { x: p.x * 0.4, z: DOCK.tipZ - CAST_DISTANCE }, water: "dock" };
  }
  if (!onLand(p)) return null;
  const { r, theta } = polar(p);
  const edge = lakeRadius(theta);
  if (r - edge > SHORE_REACH) return null;
  const out = edge - CAST_DISTANCE;
  return { bobber: { x: Math.cos(theta) * out, z: Math.sin(theta) * out }, water: waterAt(theta) };
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
