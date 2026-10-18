/**
 * Nobody stands hidden behind another fisher (round 10: Dad sat straight behind Juneau on the camera
 * axis for 40 s). The group camera yaws a little (and lifts a touch) until every pair reads.
 */
export type Ground = { x: number; z: number };
/** Something solid on the ground the camera must not look through at a fisher (a tower's deck and plinth). */
export type Blocker = { x: number; z: number; r: number };

/** A fisher's silhouette width (m) and how far a back fisher must rise on screen to show its head. */
const BODY_W = 0.95;
// Round 14: 1.3 -> 1.9 m. A back fisher only reads when its whole figure (with the hat) rises clear of the
// front one's head; at 1.3 a pair 2.8 m apart in depth at the boarding view scored 0.16 while one body
// covered the other (critic/scene/14-s2/tower.png before this change).
const HEAD_H = 1.9;
/** Pairs nearer than this in depth stand side by side (they cannot hide one another). */
const MIN_DEPTH = 0.25;
const YAWS = [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5];
// Round 14: up to 0.38 rad higher (was 0.16): a huddle (boarding, a dock walk in single file) is only
// separated on screen by looking down on it, where depth becomes height.
const LIFTS = [0, 0.08, 0.16, 0.26, 0.38];
/** The least time (s) a lineup choice is held once made, when the caller passes the time (round 23). */
export const HOLD_S = 1.6;
/** The least time (s) before the lineup eases back toward the plain view (round 23). */
export const RELEASE_S = 4;

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

/**
 * How many fishers stand behind a blocker seen from this yaw (round 14: the Dell's tower deck filled the
 * foreground with the family beyond it, session 186-210 s). The camera stands `dist` metres out (on the
 * ground) from the fishers' centre; a fisher is blocked when the ground line from it to the camera crosses a
 * blocker's disc it is not standing on. A fisher only just behind the edge counts in part.
 */
export function blocked(pts: readonly Ground[], blockers: readonly Blocker[], yaw: number, dist: number, n = pts.length): number {
  if (n === 0 || blockers.length === 0) return 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pts[i]!.x / n;
    cz += pts[i]!.z / n;
  }
  const camX = cx + Math.sin(yaw) * dist;
  const camZ = cz + Math.cos(yaw) * dist;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const dx = camX - p.x;
    const dz = camZ - p.z;
    const len2 = dx * dx + dz * dz || 1;
    for (const b of blockers) {
      // Standing on the deck itself (not on the steps round its foot, which it hides from the far side).
      if (Math.hypot(p.x - b.x, p.z - b.z) < b.r - 0.6) continue;
      const t = Math.min(1, Math.max(0, ((b.x - p.x) * dx + (b.z - p.z) * dz) / len2));
      const d = Math.hypot(p.x + dx * t - b.x, p.z + dz * t - b.z);
      sum += Math.min(1, Math.max(0, (b.r + 1 - d) / 2));
    }
  }
  return sum;
}

/** Picks the smallest yaw (and lift) that shows everyone, and holds it while it still works (no flip-flop). */
export class Lineup {
  private yaw = 0;
  private el = 0;
  /** When the choice last changed (s; round 23). */
  private changedAt = -Infinity;

  /** The first `n` of `pts` are the fishers (the rest of the buffer is ignored). */
  /**
   * `now` (s), when given, holds each choice for at least HOLD_S (round 23: a fisher walking past behind
   * another flipped the yaw 0.1 -> -0.1 -> 0 -> 0.1 inside half a second, a visible wobble; a passer-by is
   * hidden only for a moment, a fisher standing behind another stays hidden and still gets the turn).
   */
  update(pts: readonly Ground[], baseYaw: number, baseEl: number, n = pts.length, blockers: readonly Blocker[] = [], dist = 20, now = Number.NaN): { yaw: number; el: number } {
    if (n < 2 && (n === 0 || blockers.length === 0)) {
      this.yaw = 0;
      this.el = 0;
      return { yaw: 0, el: 0 };
    }
    const since = now - this.changedAt;
    if (since < HOLD_S) return { yaw: this.yaw, el: this.el };
    const cost = (y: number, e: number) => hidden(pts, baseYaw + y, baseEl + e, n) + blocked(pts, blockers, baseYaw + y, dist * Math.cos(baseEl + e), n) + 0.25 * Math.abs(y) + 0.6 * e;
    // Hold the current choice unless another is clearly better; crossing to the other side (a big swing)
    // must be better still.
    let best = cost(this.yaw, this.el);
    let by = this.yaw;
    let be = this.el;
    for (const y of YAWS) {
      for (const e of LIFTS) {
        // A change has to show at least a good part of a hidden fisher (fishers shuffling in a huddle
        // must not swing the camera about).
        // Round 14: 0.2 -> 0.08 (0.4 -> 0.25 to cross sides): a half-hidden pair (hidden ~0.3) never cleared it.
        const flip = y * this.yaw < 0 ? 0.25 : 0.08;
        const c = cost(y, e) + flip;
        if (c < best - 1e-9) {
          best = c;
          by = y;
          be = e;
        }
      }
    }
    // Easing back toward the plain view waits longer (a fisher dithering behind another swung the camera out
    // and back every 1.6 s in the round-23 trace): only RELEASE_S after the last change.
    const easing = Math.abs(by) <= Math.abs(this.yaw) && be <= this.el && (by !== this.yaw || be !== this.el);
    if (easing && since < RELEASE_S) return { yaw: this.yaw, el: this.el };
    if (by !== this.yaw || be !== this.el) this.changedAt = now;
    this.yaw = by;
    this.el = be;
    return { yaw: by, el: be };
  }
}
