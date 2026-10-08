import { LEASH, type Lake, type Swirl } from "../game/lake";
import { AREAS, SHORE_REACH, TRAILS, areaAt, areaById, pondRadius, type AreaId, type Vec } from "../game/world";

/** Where to stand to cast straight into a swirl: on the shore just behind it. */
export function shoreFor(s: Pick<Swirl, "theta" | "area">): Vec {
  const a = areaById(s.area);
  const r = pondRadius(a, s.theta) + SHORE_REACH * 0.5;
  return { x: a.center.x + Math.cos(s.theta) * r, z: a.center.z + Math.sin(s.theta) * r };
}

export type Compass = { angle: number; distance: number; golden: boolean; explore: boolean; family?: boolean; arrived: boolean };

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

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

/** The places to walk through, by trail, from one place to another (breadth-first over the trails). */
export function route(from: AreaId, to: AreaId): AreaId[] {
  const prev = new Map<AreaId, AreaId>();
  const queue: AreaId[] = [from];
  const seen = new Set<AreaId>([from]);
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const t of TRAILS) {
      const next = t.joins[0] === at ? t.joins[1] : t.joins[1] === at ? t.joins[0] : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        prev.set(next, at);
        queue.push(next);
      }
    }
  }
  const path: AreaId[] = [to];
  while (path[0] !== from) {
    const p = prev.get(path[0]!);
    if (!p) return [];
    path.unshift(p);
  }
  return path;
}

/** The next point to walk to on the way from `here` to a target in another place: the trailhead out of this place. */
export function nextWaypoint(here: Vec, target: Vec): Vec {
  const fromArea = areaAt(here);
  const toArea = areaAt(target);
  if (!toArea || fromArea?.id === toArea.id) return target;
  if (!fromArea) {
    // On a trail: walk to the end that leads toward the target.
    const t = TRAILS.find((tr) => onTrailNear(here, tr));
    if (!t) return target;
    return dist(t.from, target) < dist(t.to, target) ? t.from : t.to;
  }
  const path = route(fromArea.id, toArea.id);
  const step = path[1];
  if (!step) return target;
  const trail = TRAILS.find((tr) => tr.joins.includes(fromArea.id) && tr.joins.includes(step));
  if (!trail) return target;
  return dist(trail.from, fromArea.center) < dist(trail.to, fromArea.center) ? trail.from : trail.to;
}

function onTrailNear(p: Vec, t: (typeof TRAILS)[number]): boolean {
  const dx = t.to.x - t.from.x;
  const dz = t.to.z - t.from.z;
  const k = Math.max(0, Math.min(1, ((p.x - t.from.x) * dx + (p.z - t.from.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (t.from.x + k * dx), p.z - (t.from.z + k * dz)) <= 4;
}

/** What the kid should walk toward: a golden swirl, else a swirl here, else the nearest place not found yet, else the nearest swirl. */
export function compassGoal(lake: Lake, from: Vec): { at: Vec; golden: boolean; explore: boolean } | null {
  const golden = lake.swirls.find((s) => s.golden);
  if (golden) return { at: shoreFor(golden), golden: true, explore: false };
  const here = areaAt(from)?.id;
  const local = lake.swirls.filter((s) => s.area === here);
  const nearest = (list: Swirl[]) => list.reduce<Swirl | null>((b, s) => (!b || dist(shoreFor(s), from) < dist(shoreFor(b), from) ? s : b), null);
  const swirlHere = nearest(local);
  if (swirlHere) return { at: shoreFor(swirlHere), golden: false, explore: false };
  const unfound = AREAS.filter((a) => !lake.discovered.includes(a.id));
  const place = unfound.reduce<(typeof AREAS)[number] | null>((b, a) => (!b || dist(a.center, from) < dist(b.center, from) ? a : b), null);
  if (place) return { at: place.center, golden: false, explore: true };
  const any = nearest(lake.swirls);
  return any ? { at: shoreFor(any), golden: false, explore: false } : null;
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
  const way = nextWaypoint(from, goal.at);
  const dx = way.x - from.x;
  const dz = way.z - from.z;
  const distance = Math.hypot(goal.at.x - from.x, goal.at.z - from.z);
  return { angle: Math.atan2(dz, dx), distance, golden: goal.golden, explore: goal.explore, arrived: !goal.explore && distance < 2.2 };
}

