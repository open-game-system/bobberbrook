import { Vector3, type Camera } from "three";

/**
 * Round 28 lab check (round 27 session 119-146 s: at Mistmarsh Juneau fished standing in the water at the
 * boardwalk's foot, shoulder to shoulder with Dad, for all four catches). Per fisher: how far up the bank their
 * feet are (the TV draws a pond's water 0.9 m past its edge); per pair standing near each other: the gap between
 * their bodies on screen, in body widths (each body BODY_W of its height across at the chest, as the camera sees
 * it: a grown-up's shoulders, arms and vest in the lab stills, a kid's round tummy and arms).
 */
export const BODY_W = 0.45;
/** Feet at least this far up the bank (m) are on dry land as the TV draws it. */
export const DRY_FEET = 0.95;
/** Pairs further apart than this on the ground are not checked (across the pond from each other). */
const NEAR_PAIR = 9;

export type SpotBody = { seat: number; x: number; y: number; z: number; /** Feet to hat top (m). */ top: number };
export type SpotReport = { feet: { seat: number; bank: number; dry: boolean }[]; pairs: { a: number; b: number; gap: number }[]; wet: number; minGap: number };

const right = new Vector3();
const p = new Vector3();

/** Screen x (NDC) of a point, or null behind the lens. */
function ndcX(cam: Camera, x: number, y: number, z: number): number | null {
  p.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  if (-p.z < 0.1) return null;
  p.applyMatrix4(cam.projectionMatrix);
  return p.x;
}

export function spotCheck(cam: Camera, bodies: readonly SpotBody[], upBank: (x: number, z: number) => number): SpotReport {
  cam.updateMatrixWorld();
  right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
  const feet = bodies.map((b) => {
    const bank = upBank(b.x, b.z);
    return { seat: b.seat, bank: Math.round(bank * 100) / 100, dry: bank >= DRY_FEET };
  });
  const span = (b: SpotBody): [number, number] | null => {
    const h = b.y + b.top * 0.5;
    const half = BODY_W * b.top * 0.5;
    const l = ndcX(cam, b.x - right.x * half, h, b.z - right.z * half);
    const r = ndcX(cam, b.x + right.x * half, h, b.z + right.z * half);
    return l === null || r === null ? null : [Math.min(l, r), Math.max(l, r)];
  };
  const pairs: SpotReport["pairs"] = [];
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i]!;
      const B = bodies[j]!;
      if (Math.hypot(A.x - B.x, A.z - B.z) > NEAR_PAIR) continue;
      const sa = span(A);
      const sb = span(B);
      if (!sa || !sb) continue;
      const [lo, hi] = sa[0] < sb[0] ? [sa, sb] : [sb, sa];
      const w = ((sa[1] - sa[0]) + (sb[1] - sb[0])) / 2;
      pairs.push({ a: A.seat, b: B.seat, gap: Math.round(((hi[0] - lo[1]) / w) * 100) / 100 });
    }
  return { feet, pairs, wet: feet.filter((f) => !f.dry).length, minGap: pairs.reduce((m, q) => Math.min(m, q.gap), Infinity) };
}
