import type { Spot } from "./personalSpace";

/**
 * Round 21 (round 20 session 144-200 s, arrival.png): Juneau stood in front of Dad on the Mistmarsh dock and
 * all four overlapped at arrival; personal space keeps 1.5 m between feet, but a pair 2-4 m apart straight
 * along the camera's view still stacks on the TV. Draw-only, after spaceOut: any two fishers within
 * LINE_DEPTH of each other along the view and nearer than LINE_SIDE across it are eased apart across the
 * screen (each half, along the camera's right). A fisher on a walk (dock, boardwalk) slides along it instead,
 * so they spread along the dock and never step off it. The rules' positions are untouched.
 */
// Round 23: 1.3 -> 1.6 m (mistmarsh-reel, round 22: at 1.3 m Juneau's shoulder still sat behind Dad's; a body
// with its arms out is ~1 m wide, so 1.6 m leaves a clear gap).
export const LINE_SIDE = 1.6;
// Round 23: 5 -> 7 m (four-reel_tod-morning, round 22: Mom on the bank at the dock's foot ~6 m in front of Dad
// at its tip covered his legs; at the group camera's elevation a body 5-7 m nearer still overlaps the far one).
export const LINE_DEPTH = 7;
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
        // Round 23: a fisher on a walk that runs along the view (Moonwell's dock, Mistmarsh's boardwalk seen
        // end-on) cannot move sideways; the other takes the whole push (round 22: neither moved, Mom stood in
        // front of Dad on the dock, Dad behind Juneau on the boardwalk). When neither can, they part along
        // their walks in depth (the far one rises clear on screen).
        const da = nudge(a, -sgn * push, rx, rz, walk[i] ?? null);
        const db = nudge(b, sgn * push, rx, rz, walk[j] ?? null);
        if (Math.abs(da) < push - 1e-6) nudge(b, sgn * (push - Math.abs(da)), rx, rz, walk[j] ?? null);
        if (Math.abs(db) < push - 1e-6) nudge(a, -sgn * (push - Math.abs(db)), rx, rz, walk[i] ?? null);
        if (Math.abs(da) < 1e-6 && Math.abs(db) < 1e-6) {
          const dsg = depth >= 0 ? 1 : -1;
          deepen(a, -dsg * push, fx, fz, walk[i] ?? null);
          deepen(b, dsg * push, fx, fz, walk[j] ?? null);
        }
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

/**
 * Moves a spot `k` metres across the screen; on a walk, along the walk by as much as gives that sideways move.
 * Returns the sideways move it made (0 on a walk running along the view).
 */
function nudge(s: Spot, k: number, rx: number, rz: number, w: Dir | null): number {
  if (!w) {
    s.ox += rx * k;
    s.oz += rz * k;
    return k;
  }
  const wl = Math.hypot(w.x, w.z) || 1;
  const tx = w.x / wl;
  const tz = w.z / wl;
  // How much of the screen's sideways a step along the walk gives (a walk straight away from the lens: little).
  const across = tx * rx + tz * rz;
  if (Math.abs(across) < 0.25) return 0;
  const step = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, k / across));
  s.ox += tx * step;
  s.oz += tz * step;
  return step * across;
}

/** Moves a spot on a walk `k` metres deeper into the view along the walk (negative: toward the lens). */
function deepen(s: Spot, k: number, fx: number, fz: number, w: Dir | null): void {
  if (!w) return;
  const wl = Math.hypot(w.x, w.z) || 1;
  const along = (w.x * fx + w.z * fz) / wl;
  if (Math.abs(along) < 0.25) return;
  const step = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, k / along));
  s.ox += (w.x / wl) * step;
  s.oz += (w.z / wl) * step;
}

/** Spacing of riders stepping aboard and ashore, side by side across the screen (m). */
// Round 24: 1.4 -> 1.9 m (grown-ups now stand taller and wider than the kids; at 1.4 m a kid beside a grown-up
// stepping ashore lost a sixth of his body behind them, arrival.png).
export const ASHORE_STEP = 1.9;

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
