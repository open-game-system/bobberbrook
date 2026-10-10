import { pondRadius, areaById, type PondPlace } from "../../game/world";

/**
 * Round 20: the walks built over the water (Mistmarsh's boardwalk), shared by the landmark that builds
 * them and the fishing lines that must pass over them (round 19 session 226-257 s: a line reeled in from
 * beyond the boardwalk ran through its planks, the bobber dragged in under the deck).
 */

/** The boardwalk deck's height (m), its half-width to the rails and the clearance a line keeps over it. */
export const WALK_Y = 0.55;
export const WALK_HALF = 1.05;
const CLEAR = 0.35;

/** Mistmarsh's boardwalk centre line: from the north shore out over the water and along it. */
export function boardwalkPath(a: PondPlace): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const th = -1.55 + t * 1.25;
    const r = pondRadius(a, th) + 1.5 - Math.sin(t * Math.PI) * 5.5 - t * 0.5;
    out.push({ x: a.center.x + Math.cos(th) * r, z: a.center.z + Math.sin(th) * r });
  }
  return out;
}

let cached: { x: number; z: number }[] | null = null;
function walks(): { x: number; z: number }[] {
  if (!cached) cached = boardwalkPath(areaById("mistmarsh"));
  return cached;
}

/** Distance (m) on the ground from (x, z) to a polyline. */
function distTo(path: readonly { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const s = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - a.x - dx * s, z - a.z - dz * s));
  }
  return best;
}

/**
 * The lowest a line may pass at (x, z): over a walk (rails included, with a little margin) the deck plus
 * CLEAR, else -Infinity (no walk there).
 */
export function lineFloor(x: number, z: number): number {
  const path = walks();
  // Cheap reject: the boardwalk lies within ~20 m of Mistmarsh's centre.
  const c = path[7]!;
  if (Math.abs(x - c.x) > 30 || Math.abs(z - c.z) > 30) return -Infinity;
  return distTo(path, x, z) < WALK_HALF + 0.35 ? WALK_Y + CLEAR : -Infinity;
}

/** Whether a point on the water lies under a walk (a bobber there would sit under the deck). */
export function underWalk(x: number, z: number): boolean {
  return lineFloor(x, z) > -Infinity;
}
