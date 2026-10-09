/**
 * Nobody stands hidden behind another fisher (round 10: Dad sat straight behind Juneau on the camera
 * axis for 40 s). The group camera yaws a little (and lifts a touch) until every pair reads.
 */
export type Ground = { x: number; z: number };

/** A fisher's silhouette width (m) and how far a back fisher must rise on screen to show its head. */
const BODY_W = 0.95;
const HEAD_H = 1.3;
/** Pairs nearer than this in depth stand side by side (they cannot hide one another). */
const MIN_DEPTH = 0.25;
const YAWS = [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5];
const LIFTS = [0, 0.08, 0.16];

/**
 * How much the fishers hide one another seen from this yaw and elevation (0 = nobody; ~1 per fully
 * hidden fisher). The camera sits at +(sin yaw, cos yaw) from its target, so screen-right on the ground is
 * (cos yaw, -sin yaw); a fisher further away stands higher on screen by its extra depth x sin(el).
 */
export function hidden(pts: readonly Ground[], yaw: number, el: number, n = pts.length): number {
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rise = Math.sin(Math.max(0.05, el));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[j]!.x - pts[i]!.x;
      const dz = pts[j]!.z - pts[i]!.z;
      const dep = Math.abs(dx * fx + dz * fz);
      if (dep < MIN_DEPTH) continue;
      const lat = Math.abs(dx * rx + dz * rz);
      sum += Math.max(0, 1 - lat / BODY_W) * Math.max(0, 1 - (dep * rise) / HEAD_H);
    }
  }
  return sum;
}

/** Picks the smallest yaw (and lift) that shows everyone, and holds it while it still works (no flip-flop). */
export class Lineup {
  private yaw = 0;
  private el = 0;

  /** The first `n` of `pts` are the fishers (the rest of the buffer is ignored). */
  update(pts: readonly Ground[], baseYaw: number, baseEl: number, n = pts.length): { yaw: number; el: number } {
    if (n < 2) {
      this.yaw = 0;
      this.el = 0;
      return { yaw: 0, el: 0 };
    }
    const cost = (y: number, e: number) => hidden(pts, baseYaw + y, baseEl + e, n) + 0.25 * Math.abs(y) + 0.6 * e;
    // Hold the current choice unless another is clearly better; crossing to the other side (a big swing)
    // must be better still.
    let best = cost(this.yaw, this.el);
    let by = this.yaw;
    let be = this.el;
    for (const y of YAWS) {
      for (const e of LIFTS) {
        // A change has to show at least a good part of a hidden fisher (fishers shuffling in a huddle
        // must not swing the camera about).
        const flip = y * this.yaw < 0 ? 0.4 : 0.2;
        const c = cost(y, e) + flip;
        if (c < best - 1e-9) {
          best = c;
          by = y;
          be = e;
        }
      }
    }
    this.yaw = by;
    this.el = be;
    return { yaw: by, el: be };
  }
}
