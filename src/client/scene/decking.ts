import { BufferAttribute, BufferGeometry, Color, LatheGeometry, Vector2, Vector3 } from "three";
import { prep } from "./geo";
import { PK, PK_UV, type PaintKind } from "./painter";

/**
 * Painted surfaces the family stands on (round 13): boardwalk planks that each carry one painted board
 * of the kit's planks texture along the walk, and round discs (decks, stepping stones, terraces, plinths)
 * turned on a lathe so they have a bevelled lip that catches the light and rings for baked occlusion.
 */

/** The painted boards in planks.webp, as [v0, v1] texture rows (gaps at the strip edges). */
export const PLANK_BOARDS: readonly (readonly [number, number])[] = [
  [10 / 512, 86 / 512],
  [90 / 512, 162 / 512],
  [168 / 512, 262 / 512],
  [270 / 512, 342 / 512],
  [346 / 512, 410 / 512],
  [418 / 512, 506 / 512],
];
/** Metres of plank per repeat of the texture across u. */
const PLANK_U_M = 2.8;

/**
 * One board of the painted planks on a plank modelled in its own space: length along x (`len`), width
 * along z (`wid`). The texture's board runs along the plank; its painted edges sit on the plank's edges.
 * Call before the plank is turned and placed.
 */
export function plankUV(g: BufferGeometry, len: number, wid: number, board: number, uOff: number): BufferGeometry {
  const pos = g.getAttribute("position");
  const strip = PLANK_BOARDS[((board % PLANK_BOARDS.length) + PLANK_BOARDS.length) % PLANK_BOARDS.length]!;
  const a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const across = Math.min(1, Math.max(0, pos.getZ(i) / wid + 0.5));
    a[i * 3] = PK_UV + PK.planks;
    a[i * 3 + 1] = uOff + (pos.getX(i) + len / 2) / PLANK_U_M;
    a[i * 3 + 2] = strip[0] + (strip[1] - strip[0]) * across;
  }
  g.setAttribute("aPaint", new BufferAttribute(a, 3));
  return g;
}

/**
 * Picks each triangle's painted kind from its centre and face normal (a non-indexed geometry: tops
 * one texture, sides another, never blended across a triangle).
 */
export function surfBy(g: BufferGeometry, pick: (centre: Vector3, normal: Vector3) => PaintKind): BufferGeometry {
  const pos = g.getAttribute("position");
  const a = new Float32Array(pos.count * 3);
  const p0 = new Vector3();
  const p1 = new Vector3();
  const p2 = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  for (let t = 0; t + 2 < pos.count; t += 3) {
    p0.fromBufferAttribute(pos, t);
    p1.fromBufferAttribute(pos, t + 1);
    p2.fromBufferAttribute(pos, t + 2);
    c.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
    n.subVectors(p1, p0).cross(p2.clone().sub(p0));
    if (n.lengthSq() > 0) n.normalize();
    const k = pick(c, n);
    for (let j = 0; j < 3; j++) a[(t + j) * 3] = k;
  }
  g.setAttribute("aPaint", new BufferAttribute(a, 3));
  return g;
}

export type DiscOpts = {
  /** Outer radius at the top (before the lip). */
  r: number;
  top: number;
  bottom: number;
  /** Bevel width of the lip. */
  lip: number;
  /** Flare of the foot (the side widens by this toward the bottom). */
  flare?: number;
  /** Concentric rings on the top (for painted occlusion). */
  rings?: number;
};

/** The lathe profile of a disc: from the centre of the top out to the lip, down the side to the foot. */
export function discProfile(o: DiscOpts): Vector2[] {
  const rings = Math.max(1, o.rings ?? 3);
  const inner = Math.max(0.01, o.r - o.lip);
  const pts: Vector2[] = [new Vector2(0.001, o.top)];
  for (let k = 1; k <= rings; k++) pts.push(new Vector2((inner * k) / rings, o.top));
  // The lip: a soft quarter round, so a painted highlight runs round the edge.
  pts.push(new Vector2(inner + o.lip * 0.62, o.top - o.lip * 0.12));
  pts.push(new Vector2(o.r, o.top - o.lip * 0.55));
  pts.push(new Vector2(o.r + (o.flare ?? 0) * 0.3, o.top - o.lip * 1.2));
  if (o.bottom < o.top - o.lip * 1.2) pts.push(new Vector2(o.r + (o.flare ?? 0), o.bottom));
  return pts;
}

/**
 * A painted disc: lathe-turned with a bevelled lip. `paintOf` colours each vertex from its radius share
 * (0 centre .. 1 rim), height share (0 foot .. 1 top) and whether it is on the lip (the painted highlight).
 */
export function disc(o: DiscOpts, segments: number, paintOf: (rho: number, h: number, lip: boolean, out: Color) => void): BufferGeometry {
  // Lathe faces look outward when the profile runs from the foot up to the centre.
  const g = prep(new LatheGeometry(discProfile(o).reverse(), segments));
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const cols = new Float32Array(pos.count * 3);
  const c = new Color();
  const inner = o.r - o.lip;
  const span = Math.max(1e-3, o.top - o.bottom);
  for (let i = 0; i < pos.count; i++) {
    const rr = Math.hypot(pos.getX(i), pos.getZ(i));
    const y = pos.getY(i);
    const lip = rr > inner - 1e-3 && y > o.top - o.lip * 0.9 && nor.getY(i) > 0.2;
    paintOf(Math.min(1, rr / o.r), (y - o.bottom) / span, lip, c);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new BufferAttribute(cols, 3));
  return g;
}

/** The usual painted-stone shading for a disc: a lit lip, an occluded foot, a little darker at the centre. */
export function stoneShade(base: number | Color, lit: number | Color): (rho: number, h: number, lip: boolean, out: Color) => void {
  const b = new Color(base);
  const l = new Color(lit);
  return (rho, h, lip, out) => {
    out.copy(b).lerp(l, Math.min(1, Math.max(0, h)));
    if (lip) out.lerp(new Color(0xffffff), 0.28);
    // Baked occlusion: the foot sinks into the ground or water.
    out.multiplyScalar(0.62 + 0.38 * Math.min(1, Math.max(0, h * 1.6)));
    if (h > 0.98 && !lip) out.multiplyScalar(0.94 + 0.06 * rho);
  };
}

/** A flat stepping stone (about 1.3 m across): painted rock, a lit worn lip, its foot dark in the water. */
export function steppingStone(base: number, lit: number, seed: number): BufferGeometry {
  const r = 0.62 + 0.08 * Math.sin(seed * 12.9898);
  const g = disc({ r, top: 0.2, bottom: -0.25, lip: 0.14, flare: 0.1, rings: 2 }, 11, stoneShade(base, lit));
  // A little irregular: squash it along one axis.
  g.scale(1, 1, 0.82 + 0.12 * Math.cos(seed * 4.1));
  const a = new Float32Array(g.getAttribute("position").count * 3).fill(0);
  for (let i = 0; i < a.length; i += 3) a[i] = PK.rock;
  g.setAttribute("aPaint", new BufferAttribute(a, 3));
  return g;
}
