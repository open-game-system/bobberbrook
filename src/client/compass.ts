import type { Lake, Swirl } from "../game/lake";
import { castRing, lakeRadius, SHORE_REACH, type Vec } from "../game/world";

/** Where to stand to cast straight into a swirl: on the shore just behind it. */
export function shoreFor(s: Pick<Swirl, "theta">): Vec {
  const r = lakeRadius(s.theta) + SHORE_REACH * 0.5;
  return { x: Math.cos(s.theta) * r, z: Math.sin(s.theta) * r };
}

export type Compass = { angle: number; distance: number; golden: boolean; arrived: boolean };

/**
 * The kid's compass to the fish: the golden swirl if there is one, else the nearest swirl's shore.
 * angle is in screen terms (0 = right, π/2 = down), the same north-up frame as the minimap.
 */
export function compassTo(lake: Lake, from: Vec): Compass | null {
  if (lake.swirls.length === 0) return null;
  const golden = lake.swirls.find((s) => s.golden);
  const target =
    golden ??
    lake.swirls.reduce((best, s) => {
      const a = shoreFor(s);
      const b = shoreFor(best);
      return Math.hypot(a.x - from.x, a.z - from.z) < Math.hypot(b.x - from.x, b.z - from.z) ? s : best;
    });
  const spot = shoreFor(target);
  const dx = spot.x - from.x;
  const dz = spot.z - from.z;
  const distance = Math.hypot(dx, dz);
  const ring = castRing(target.theta);
  return { angle: Math.atan2(dz, dx), distance, golden: target.golden, arrived: distance < 2.2 && Math.hypot(ring.x - target.pos.x, ring.z - target.pos.z) < 1 };
}
