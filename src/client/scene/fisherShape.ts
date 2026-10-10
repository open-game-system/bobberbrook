import { type BufferGeometry, Color, Vector3 } from "three";

/**
 * Round 19: the fishers' silhouettes broken up like a painted figure's, not a vinyl toy's (three critics running
 * read the family as glossy vinyl: perfect spheres for heads, a smooth cap of hair, flat discs for brims and one
 * airbrushed peach over the whole head). Head space throughout: the skull's centre at (0, 0.24, 0), radius 0.25,
 * the face toward +z.
 */

const C = new Vector3(0, 0.24, 0);
const HR = 0.25;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Where the face's features are (eyes, cheeks, smile, freckles, glasses): no lock of hair ever lands in it. */
export const FACE_WINDOW = { x: 0.19, z: 0.08, y0: 0.08, y1: 0.35 } as const;

/**
 * A felt brim's soft waves: the outer rim rises and dips round the hat (two waves of 3 and 5 lobes, phase by
 * `seed`), nothing at radius `r0` (where it meets the crown), full at `r1`; the front third stays nearly flat so the
 * brim never drops over the eyes. Only y moves (by the vertex's own x, z: the same point moves the same, seams shut).
 */
export function waveBrim(g: BufferGeometry, r0: number, r1: number, amp: number, seed: number): BufferGeometry {
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const k = smooth(r0, r1, r);
    if (k <= 0) continue;
    const a = Math.atan2(z, x);
    const wave = 0.6 * Math.sin(3 * a + seed * 1.7) + 0.4 * Math.sin(5 * a - seed * 2.3);
    // Calm toward the face (+z): the brim may lift there but barely waves.
    const calm = 1 - 0.85 * Math.max(0, z / Math.max(r, 1e-6)) ** 2;
    pos.setY(i, pos.getY(i) + amp * k * wave * calm);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** One lock of hair: its root on the skull, how it is stretched (x, y, z) and turned (Euler x, y, z). */
export type Lock = { at: Vector3; scale: Vector3; rot: Vector3; size: number };

/** A small deterministic jitter per seat and lock. */
const jit = (seat: number, i: number, k: number) => {
  const s = Math.sin(seat * 91.7 + i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

/**
 * Locks of hair round the hairline: sideburns in front of the ears, a ragged fringe of three under the brim and a
 * row of locks round the back and sides below the hat, each pointing down and out, so the hair's edge is a painted
 * ragged line instead of a sphere's clean rim.
 */
export function hairLocks(seat: number): Lock[] {
  const locks: Lock[] = [];
  const onSkull = (theta: number, y: number, out = 0.0) => {
    const dy = y - C.y;
    const rr = Math.sqrt(Math.max(0, HR * HR - dy * dy)) + out;
    // theta 0 = +x (the fisher's left), PI/2 = +z (the face).
    return new Vector3(Math.cos(theta) * rr, y, Math.sin(theta) * rr);
  };
  // Back and sides: theta from just behind the ears round the back.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const theta = -0.25 - t * (Math.PI - 0.5) + jit(seat, i, 0) * 0.12;
    const y = 0.2 + jit(seat, i, 1) * 0.05 - 0.03 * Math.sin(t * Math.PI);
    const at = onSkull(theta, y, -0.008);
    const size = 0.05 + jit(seat, i, 2) * 0.014;
    // Point down and a little out along the skull: tip the lock outward round its own tangent.
    locks.push({ at, scale: new Vector3(0.75, 1.7, 0.55), rot: new Vector3(0, -theta + Math.PI / 2, 0.0), size });
  }
  // Sideburns, just in front of each ear.
  for (const sx of [1, -1]) {
    const theta = sx > 0 ? 0.32 : Math.PI - 0.32;
    locks.push({ at: onSkull(theta, 0.24 + jit(seat, 20 + sx, 0) * 0.02, -0.012), scale: new Vector3(0.55, 1.5, 0.6), rot: new Vector3(0, -theta + Math.PI / 2, 0), size: 0.045 });
  }
  // A ragged fringe: three locks under the brim, uneven, over the brow but above the eyes.
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.085 + jit(seat, 30 + i, 0) * 0.02;
    const y = 0.375 + jit(seat, 30 + i, 1) * 0.012;
    const z = Math.sqrt(Math.max(0, HR * HR - x * x - (y - C.y) ** 2)) - 0.012;
    locks.push({ at: new Vector3(x, y, z), scale: new Vector3(1.1, 0.75, 0.55), rot: new Vector3(-0.5, 0, (i - 1) * 0.35 + jit(seat, 30 + i, 2) * 0.3), size: 0.055 + jit(seat, 30 + i, 3) * 0.01 });
  }
  return locks;
}

/**
 * The painter's planes on the skull, baked into its vertex colours: the back and sides of the head turn into a
 * cooler rosy shade, the hair throws a soft shadow along the hairline, the cheeks warm, the brow and the bridge of
 * the nose catch a lighter plane. So the head reads as painted skin with its own value design, not one airbrushed
 * peach over a sphere.
 */
export function paintSkull(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute("position");
  const col = g.getAttribute("color");
  const p = new Vector3();
  const c = new Color();
  const shade = new Color(0.78, 0.7, 0.84);
  const warm = new Color(1.04, 0.86, 0.8);
  const cheekL = new Vector3(0.58, -0.22, 0.78).normalize();
  const cheekR = new Vector3(-0.58, -0.22, 0.78).normalize();
  const brow = new Vector3(0, 0.3, 0.95).normalize();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(C).normalize();
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    // Turning away from the face: the side planes, then the back, in a cool rosy shade.
    const away = smooth(0.55, -0.35, p.z);
    c.multiply(new Color(1, 1, 1).lerp(shade, away));
    // The hairline's shadow on the brow and temples (the hair starts at about n.y 0.7 at the front).
    const hl = smooth(0.42, 0.66, p.y) * smooth(-0.2, 0.4, p.z);
    c.multiplyScalar(1 - 0.16 * hl);
    // Warm cheeks: a broad soft area round each cheek (the blush itself sits on top).
    const ck = Math.max(smooth(0.86, 0.98, p.dot(cheekL)), smooth(0.86, 0.98, p.dot(cheekR)));
    c.multiply(new Color(1, 1, 1).lerp(warm, ck));
    // A lighter plane over the brow and down the nose.
    c.multiplyScalar(1 + 0.06 * smooth(0.9, 0.99, p.dot(brow)));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return g;
}
