/**
 * Round 23: the camera-judder measure. Given the group camera's pose per frame (look-at target, distance,
 * yaw, elevation), it finds back-and-forth swings: a pan (or zoom) one way of more than a threshold followed
 * within `within` seconds by one the other way. The round-22 session read as a wobbling lens (critic: 279
 * camera_jerk flags) from exactly such swings: a catch push-in snapping back out, the lineup yaw stepping
 * out and back.
 */
export type Pose = { t: number; x: number; z: number; dist: number; yaw: number; el: number };
export type Swing = { from: number; to: number; amount: number };
export type Reversal = { a: Swing; b: Swing };

/**
 * The pan (rad) of what the camera looks at between two poses: the look-at's sideways move over the
 * distance (the fishers' depth slides across the screen; an orbit about the look-at leaves it in place).
 */
function pan(a: Pose, b: Pose): number {
  const rx = Math.cos(b.yaw);
  const rz = -Math.sin(b.yaw);
  return ((b.x - a.x) * rx + (b.z - a.z) * rz) / Math.max(1, b.dist * Math.cos(b.el));
}

/** The turn (rad) of the view direction (the far scenery slides across the screen by this). */
function turn(a: Pose, b: Pose): number {
  return b.yaw - a.yaw;
}

/** The relative zoom (+ = out) between two poses. */
function zoom(a: Pose, b: Pose): number {
  return Math.log(b.dist / Math.max(1e-3, a.dist));
}

/**
 * Back-and-forth swings: at each turning point of the motion, how far it went one way in the `within` s
 * before and how far back in the `within` s after; a reversal when both exceed `min`. A long pan that ends
 * and later reverses slowly is no judder; a pan of a degree in half a second and straight back is.
 */
function reversals(poses: readonly Pose[], step: (a: Pose, b: Pose) => number, min: number, within: number): Reversal[] {
  const t: number[] = [];
  const d: number[] = [];
  for (let i = 1; i < poses.length; i++) {
    const v = step(poses[i - 1]!, poses[i]!);
    if (Math.abs(v) < 1e-7) continue;
    t.push(poses[i]!.t);
    d.push(v);
  }
  const out: Reversal[] = [];
  let lastTo = -Infinity;
  for (let i = 1; i < d.length; i++) {
    if (Math.sign(d[i]!) === Math.sign(d[i - 1]!)) continue;
    const turnAt = t[i - 1]!;
    let before = 0;
    let from = turnAt;
    for (let j = i - 1; j >= 0 && t[j]! > turnAt - within; j--) {
      before += d[j]!;
      from = t[j]!;
    }
    let after = 0;
    let to = turnAt;
    for (let j = i; j < d.length && t[j]! < turnAt + within; j++) {
      after += d[j]!;
      to = t[j]!;
    }
    if (Math.abs(before) > min && Math.abs(after) > min && Math.sign(before) !== Math.sign(after) && turnAt > lastTo) {
      out.push({ a: { from, to: turnAt, amount: before }, b: { from: turnAt, to, amount: after } });
      lastTo = to;
    }
  }
  return out;
}

/** Pan reversals: swings of the look-at across the screen over `minRad` that turn back within `within` s. */
export function panReversals(poses: readonly Pose[], minRad = 0.4 * (Math.PI / 180), within = 1): Reversal[] {
  return reversals(poses, pan, minRad, within);
}

/** Turn reversals: the view direction swinging one way by over `minRad` and back within `within` s. */
export function turnReversals(poses: readonly Pose[], minRad = 0.4 * (Math.PI / 180), within = 1): Reversal[] {
  return reversals(poses, turn, minRad, within);
}

/** Zoom reversals: in-then-out (or out-then-in) of more than `minLog` (log of the distance ratio) within `within` s. */
export function zoomReversals(poses: readonly Pose[], minLog = 0.04, within = 1): Reversal[] {
  return reversals(poses, zoom, minLog, within);
}
