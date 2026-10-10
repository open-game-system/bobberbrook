import { type BufferGeometry, Vector3 } from "three";

/**
 * The painter's light on a fisher (round 15), baked into the vertex colours: soft occlusion where one part
 * tucks against another (under the chin, inside the arms, the legs under the coat, the boots on the ground)
 * and a top light that runs from shaded boots to lit shoulders. Figure space: the model ~1 unit tall, feet at 0.
 */

/** A part of the figure that shades what faces it (a sphere round its bulk). */
export type Occluder = { c: Vector3; r: number };

const STRENGTH = 0.6;
const FLOOR = 0.4;
/** Top light: boots at LOW, shoulders and up at HIGH. */
const LOW = 0.74;
const HIGH = 1.04;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const d = new Vector3();

/** The shade (multiplier) at a point p with normal n of the figure. */
export function figureShade(p: Vector3, n: Vector3, occluders: readonly Occluder[]): number {
  let ao = 1;
  for (const o of occluders) {
    d.subVectors(o.c, p);
    const dist = d.length();
    // A point inside the sphere is the part itself.
    if (dist < o.r) continue;
    const facing = Math.max(0, n.dot(d) / dist);
    ao *= 1 - STRENGTH * Math.min(1, ((o.r * o.r) / (dist * dist)) * facing);
  }
  // Contact with the ground: the soles and the feet of the boots.
  ao *= 0.78 + 0.22 * smooth(0.0, 0.14, p.y);
  const light = LOW + (HIGH - LOW) * smooth(0.04, 0.62, p.y);
  return Math.max(FLOOR, ao) * light;
}

/** Multiplies a part's vertex colours by the figure's shade; `at` places the part (its pivot) in the figure. */
export function bakeFigure(g: BufferGeometry, at: Vector3, occluders: readonly Occluder[]): BufferGeometry {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const col = g.getAttribute("color");
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).add(at);
    n.fromBufferAttribute(nor, i).normalize();
    const k = figureShade(p, n, occluders);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return g;
}
