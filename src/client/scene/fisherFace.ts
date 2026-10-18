import { Vector3 } from "three";

/**
 * Round 24: a head that is not a sphere (concept/web/08-characters.jpg): every critic since round 15 read the
 * fishers' heads as perfect vinyl balls. Head space as in fisherShape.ts (the skull's centre at (0, 0.24, 0),
 * radius 0.25, the face toward +z). The skull, the hair and every feature are placed through the same shape,
 * so the eyes, nose and freckles sit on the face it makes.
 *  - Kids: full round cheeks low on the face, a soft small chin, a flatter face front.
 *  - Grown-ups: a longer face, a narrower jaw with a chin, the cheekbones higher.
 */
const C = new Vector3(0, 0.24, 0);
export const HEAD_R = 0.25;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (c: number, w: number, x: number) => Math.max(0, 1 - ((x - c) / w) ** 2);

export type HeadShape = { adult: boolean };

/** How much taller a grown-up's face is than the round-23 sphere (the hat and hair sit on it). */
export const ADULT_STRETCH = 1.1;

/** Moves a point of the round skull (head space) onto the shaped head; writes and returns `out`. */
export function shapeHead(p: Vector3, s: HeadShape, out: Vector3 = new Vector3()): Vector3 {
  const qx = p.x - C.x;
  const qy = p.y - C.y;
  const qz = p.z - C.z;
  const len = Math.hypot(qx, qy, qz) || 1;
  const ny = qy / len;
  const nz = qz / len;
  let x = qx;
  let y = qy;
  let z = qz;
  // The face front a little flatter (a face, not a ball), the back of the head a touch fuller.
  z *= 1 - 0.09 * smooth(0.35, 0.95, nz) + 0.04 * smooth(-0.3, -0.9, nz);
  if (s.adult) {
    // Higher cheekbones, a narrower jaw tapering to a chin that comes forward a little.
    x *= 1 + 0.05 * bump(0.0, 0.35, ny) - 0.13 * smooth(-0.25, -0.95, ny);
    y *= ADULT_STRETCH;
    z += 0.025 * smooth(-0.45, -0.9, ny) * smooth(0.2, 0.8, nz) * HEAD_R * 4;
  } else {
    // Full round cheeks low on the face, a soft small chin.
    x *= 1 + 0.09 * bump(-0.32, 0.4, ny) * smooth(-0.2, 0.5, nz) - 0.05 * smooth(-0.6, -1, ny);
    z *= 1 + 0.04 * bump(-0.3, 0.35, ny) * smooth(0.2, 0.7, nz);
  }
  return out.set(C.x + x, C.y + y, C.z + z);
}

const tmp = new Vector3();
/** The point on the shaped face over (x, y) of the round skull's front, lifted `lift` off it along +z. */
export function onFace(x: number, y: number, s: HeadShape, lift = 0): Vector3 {
  const dy = y - C.y;
  const zs = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - dy * dy));
  const p = shapeHead(tmp.set(x, y, C.z + zs), s, new Vector3());
  p.z += lift;
  return p;
}

/** The top of the shaped skull above the round one (a grown-up's longer head lifts the hat). */
export function crownLift(s: HeadShape): number {
  return s.adult ? HEAD_R * (ADULT_STRETCH - 1) : 0;
}
