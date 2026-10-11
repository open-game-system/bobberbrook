import type { Spot } from "./personalSpace";

/**
 * Round 21 (round 20 session 144-200 s, arrival.png): Juneau stood in front of Dad on the Mistmarsh dock and
 * all four overlapped at arrival; personal space keeps 1.5 m between feet, but a pair 2-4 m apart straight
 * along the camera's view still stacks on the TV. Draw-only, after spaceOut: any two fishers within
 * LINE_DEPTH of each other along the view and nearer than LINE_SIDE across it are eased apart across the
 * screen (each half, along the camera's right). A fisher on a walk (dock, boardwalk) slides along it instead,
 * so they spread along the dock and never step off it. The rules' positions are untouched.
 */
export const LINE_SIDE = 1.3;
export const LINE_DEPTH = 5;
/** No one is drawn further than this from where the rules put them (with personal space). */
const MAX_OFFSET = 1.6;

type Dir = { x: number; z: number };

export function spreadAcross(spots: Spot[], fwd: Dir, along: (x: number, z: number) => Dir | null = () => null): void {
  const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const fx = fwd.x / fl;
  const fz = fwd.z / fl;
  // Right of the view on the ground.
  const rx = -fz;
  const rz = fx;
  const walk = spots.map((s) => along(s.x, s.z));
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i]!;
        const b = spots[j]!;
        const dx = b.x + b.ox - (a.x + a.ox);
        const dz = b.z + b.oz - (a.z + a.oz);
        const depth = dx * fx + dz * fz;
        let across = dx * rx + dz * rz;
        if (Math.abs(depth) > LINE_DEPTH || Math.abs(across) >= LINE_SIDE) continue;
        // Exactly in line: split by seat so the pair always parts the same way.
        if (Math.abs(across) < 1e-4) across = a.seat < b.seat ? 1e-4 : -1e-4;
        const push = (LINE_SIDE - Math.abs(across)) / 2;
        const sgn = Math.sign(across);
        nudge(a, -sgn * push, rx, rz, walk[i] ?? null);
        nudge(b, sgn * push, rx, rz, walk[j] ?? null);
      }
    }
  }
  for (const s of spots) {
    const m = Math.hypot(s.ox, s.oz);
    if (m > MAX_OFFSET) {
      s.ox *= MAX_OFFSET / m;
      s.oz *= MAX_OFFSET / m;
    }
  }
}

/** Moves a spot `k` metres across the screen; on a walk, along the walk by as much as gives that sideways move. */
function nudge(s: Spot, k: number, rx: number, rz: number, w: Dir | null): void {
  if (!w) {
    s.ox += rx * k;
    s.oz += rz * k;
    return;
  }
  const wl = Math.hypot(w.x, w.z) || 1;
  const tx = w.x / wl;
  const tz = w.z / wl;
  // How much of the screen's sideways a step along the walk gives (a walk straight away from the lens: little).
  const across = tx * rx + tz * rz;
  if (Math.abs(across) < 0.25) return;
  const step = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, k / across));
  s.ox += tx * step;
  s.oz += tz * step;
}

/** Spacing of riders stepping aboard and ashore, side by side across the screen (m). */
export const ASHORE_STEP = 1.4;

/**
 * Round 21 (arrival.png: all four overlapped stepping off the airship): where rider `rank` of `n` is drawn
 * round the rules' landing spot, in a row across the camera's view (`across`: the view's right on the ground),
 * centred, so nobody stands behind anybody on the TV.
 */
export function ashoreOffset(rank: number, n: number, across: Dir): Dir {
  const l = Math.hypot(across.x, across.z) || 1;
  const k = (rank - (Math.max(1, n) - 1) / 2) * ASHORE_STEP;
  return { x: (across.x / l) * k, z: (across.z / l) * k };
}
