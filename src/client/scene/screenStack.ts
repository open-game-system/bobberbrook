import { PerspectiveCamera, Vector3, type Camera } from "three";
import type { Spot } from "./personalSpace";
import { pairSide, type Sides } from "./screenSpread";

/**
 * Round 24 (round 23 session 136-211 s: Juneau stood in front of Dad at the foot of Mistmarsh's boardwalk and
 * hid both of Dad's catches). spreadAcross works in world metres (LINE_SIDE across, LINE_DEPTH along the
 * view), but a fisher near the lens is wider on screen than one further back, and a grown-up is taller than
 * a kid, so a pair 1.6 m apart across can still stack on the TV. This pass works on the bodies as the TV
 * camera sees them: each fisher's box (feet to hat, BODY_HW either side) projected to the screen; where two
 * boxes overlap they are eased apart across the screen by the overlap plus GAP, each by half in screen
 * terms (so the near one moves fewer metres). A fisher on a walk slides along it; a move that would put a
 * fisher where nobody can stand (water) is given to the other. Draw-only, after spaceOut and spreadAcross.
 */
export const BODY_HW = 0.55;
/** Clear space between two bodies on screen, in metres at the far one's depth. */
export const STACK_GAP = 0.4;
/** No one is drawn further than this from where the rules put them (all passes together). */
export const STACK_MAX_OFFSET = 2.6;

/** `hw`: half the body's width on the ground across the view (a kid's wide brim, a fish held up), BODY_HW at least. */
export type Body = Spot & { top: number; y: number; hw?: number };
type Dir = { x: number; z: number };
type Box = { x0: number; x1: number; y0: number; y1: number; depth: number; perNdc: number };

const v = new Vector3();
const r = new Vector3();

function boxOf(b: Body, cam: PerspectiveCamera): Box | null {
  const x = b.x + b.ox;
  const z = b.z + b.oz;
  v.set(x, b.y + b.top * 0.5, z).applyMatrix4(cam.matrixWorldInverse);
  const depth = -v.z;
  if (depth < 0.5) return null;
  // World metres per NDC unit across at that depth.
  const perNdc = depth * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
  v.set(x, b.y, z).project(cam);
  const fx = v.x;
  const fy = v.y;
  v.set(x, b.y + b.top, z).project(cam);
  const cx = (fx + v.x) / 2;
  const hw = Math.max(BODY_HW, b.hw ?? 0) / perNdc;
  return { x0: cx - hw, x1: cx + hw, y0: Math.min(fy, v.y), y1: Math.max(fy, v.y), depth, perNdc };
}

/** The share of the far body's box that the near one's covers on screen (0 when apart). */
export function stackShare(a: Body, b: Body, cam: PerspectiveCamera): number {
  const A = boxOf(a, cam);
  const B = boxOf(b, cam);
  if (!A || !B) return 0;
  const far = A.depth > B.depth ? A : B;
  const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
  const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  if (ox <= 0 || oy <= 0) return 0;
  return (ox * oy) / ((far.x1 - far.x0) * (far.y1 - far.y0));
}

export function spreadOnScreen(bodies: Body[], cam: Camera, walkable: (x: number, z: number) => boolean, along: (x: number, z: number) => Dir | null = () => null, sides?: Sides): void {
  if (!(cam instanceof PerspectiveCamera)) return;
  const pc = cam;
  pc.updateMatrixWorld();
  r.setFromMatrixColumn(pc.matrixWorld, 0).setY(0);
  if (r.lengthSq() < 1e-8) return;
  r.normalize();
  const walks = bodies.map((b) => along(b.x, b.z));
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const A = boxOf(a, pc);
        const B = boxOf(b, pc);
        if (!A || !B) continue;
        const far = A.depth > B.depth ? A : B;
        const gap = STACK_GAP / far.perNdc;
        const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) + gap;
        const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        // Overlapping across, and more than a fifth of the shorter body in height.
        if (ox <= 0 || oy <= 0.2 * Math.min(A.y1 - A.y0, B.y1 - B.y0)) continue;
        // The side the pair parts to: held until the rules' positions really cross (screenSpread pairSide).
        const sgn = pairSide(sides, a.seat, b.seat, (b.x - a.x) * r.x + (b.z - a.z) * r.z);
        // Half each in screen terms: metres = NDC x metres-per-NDC at each one's depth.
        const ka = (-sgn * ox * A.perNdc) / 2;
        const kb = (sgn * ox * B.perNdc) / 2;
        const ma = shift(a, ka, walks[i] ?? null, walkable);
        const mb = shift(b, kb, walks[j] ?? null, walkable);
        // Whatever one could not take, the other takes (in screen terms).
        if (Math.abs(ma) < Math.abs(ka) - 1e-6) shift(b, (sgn * (Math.abs(ka) - Math.abs(ma)) * B.perNdc) / A.perNdc, walks[j] ?? null, walkable);
        if (Math.abs(mb) < Math.abs(kb) - 1e-6) shift(a, (-sgn * (Math.abs(kb) - Math.abs(mb)) * A.perNdc) / B.perNdc, walks[i] ?? null, walkable);
      }
    }
  }
}

/**
 * Moves a body `k` metres along the screen's right, within reach and on ground anyone can stand on (halving
 * back from the full move); where that leaves the ground (off a boardwalk's edge), along its walk instead.
 * Returns the sideways move made.
 */
function shift(s: Body, k: number, w: Dir | null, walkable: (x: number, z: number) => boolean): number {
  const free = tryMove(s, r.x * k, r.z * k, k, walkable);
  if (free !== 0 || !w) return free;
  const wl = Math.hypot(w.x, w.z) || 1;
  const tx = w.x / wl;
  const tz = w.z / wl;
  const across = tx * r.x + tz * r.z;
  if (Math.abs(across) < 0.25) return 0;
  const step = k / across;
  return tryMove(s, tx * step, tz * step, k, walkable);
}

function tryMove(s: Body, dx: number, dz: number, k: number, walkable: (x: number, z: number) => boolean): number {
  let moved = k;
  for (let h = 0; h < 4; h++) {
    const nx = s.ox + dx;
    const nz = s.oz + dz;
    if (Math.hypot(nx, nz) <= STACK_MAX_OFFSET && walkable(s.x + nx, s.z + nz)) {
      s.ox = nx;
      s.oz = nz;
      return moved;
    }
    dx /= 2;
    dz /= 2;
    moved /= 2;
  }
  return 0;
}
