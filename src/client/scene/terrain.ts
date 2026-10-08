import { BufferAttribute, BufferGeometry, Color, Mesh, type Material } from "three";
import { NORTH, angleGap, lakeRadius, outerRadius } from "../../game/world";
import { fbm, smoothstep, lerp, vnoise } from "./noise";

/** The falls: a cliff on the north shore, a brook from its foot across the land ring into the lake. */
export const FALLS = (() => {
  const edge = lakeRadius(NORTH);
  const footZ = -(edge + 6.6);
  return { edge, footZ, topZ: footZ - 2.4, topY: 8.6, brookHalf: 1.05 };
})();

function cliffFactor(theta: number): number {
  return Math.max(0, 1 - angleGap(theta, NORTH) / 0.75);
}

/** The path loop around the lake, this far from the water's edge. */
export const PATH_D = 3.1;

/** Ground height (y) at a point. Shared by the ground mesh, props and fishers' feet. */
export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const edge = lakeRadius(th);
  const d = r - edge;
  if (d < 0) return Math.max(-1.7, -0.03 + d * 0.45);
  let y = -0.03 + smoothstep(0, 1.6, d) * 0.36 + (fbm(x * 0.12, z * 0.12, 3, 3) - 0.5) * 0.35 * smoothstep(1.5, 4, d);
  const outer = outerRadius(th);
  const e = r - outer;
  const c = cliffFactor(th);
  if (e > -1) {
    const n = fbm(x * 0.05, z * 0.05, 4, 7);
    const H = lerp(3.5 + 6 * n, FALLS.topY, c);
    const W = lerp(20, 2.4, c);
    y += H * smoothstep(-1, W, e);
    // Rolling hills further out, and a higher second step behind the falls.
    y += (4 + 14 * fbm(x * 0.025, z * 0.025, 4, 11)) * smoothstep(W, W + 40, e);
    y += c * 5 * smoothstep(W + 6, W + 12, e);
  }
  // The brook: a shallow channel from the foot of the falls to the lake, and a notch over the cliff lip.
  const brook = 1 - smoothstep(FALLS.brookHalf * 0.6, FALLS.brookHalf + 0.6, Math.abs(x + Math.sin(z * 0.6) * 0.25));
  if (z < -edge + 0.5 && z > FALLS.footZ - 0.5) y = lerp(y, -0.22, brook);
  else if (z <= FALLS.footZ - 0.5 && z > FALLS.topZ - 10) y -= brook * 0.7;
  return y;
}

export type Ground = { mesh: Mesh; dispose(): void };

const C = (hex: number) => new Color(hex);
const GRASS_A = C(0x5f9e36);
const GRASS_B = C(0x86bc45);
const GRASS_C = C(0xa9c75a);
const GRASS_FAR = C(0x4f8a3a);
const SAND = C(0xe0c88e);
const WET = C(0x9a8a62);
const BED = C(0xc8b47e);
const BED_DEEP = C(0x6f8a74);
const DIRT = C(0xc79a5e);
const ROCK = C(0x8f8476);
const ROCK_DARK = C(0x6a6260);
const MOSS = C(0x6d9a3a);

const tmp = new Color();

function groundColor(x: number, z: number, y: number, slope: number, out: Color): void {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const edge = lakeRadius(th);
  const d = r - edge;
  if (d < 0) {
    out.copy(BED).lerp(BED_DEEP, smoothstep(0, 3, -d));
    out.multiplyScalar(0.9 + 0.2 * vnoise(x * 0.8, z * 0.8, 5));
    return;
  }
  const n1 = fbm(x * 0.09, z * 0.09, 3, 21);
  const n2 = vnoise(x * 0.45, z * 0.45, 22);
  out.copy(GRASS_A).lerp(GRASS_B, smoothstep(0.35, 0.65, n1));
  out.lerp(GRASS_C, smoothstep(0.62, 0.8, n1) * 0.7);
  out.multiplyScalar(0.92 + 0.16 * n2);
  const outer = outerRadius(th);
  out.lerp(GRASS_FAR, smoothstep(outer, outer + 40, r) * 0.6);
  // Sandy bank with a wet line at the water.
  const sand = 1 - smoothstep(0.5, 1.5 + 0.8 * n2, d);
  tmp.copy(WET).lerp(SAND, smoothstep(0, 0.45, d));
  out.lerp(tmp, sand);
  // The path loop around the lake (not over the cliff) and the lane to the cottages.
  const pathW = 0.75 + 0.25 * vnoise(th * 9, 1, 3);
  let path = (1 - smoothstep(pathW * 0.6, pathW, Math.abs(d - PATH_D))) * (1 - cliffFactor(th) * 1.3);
  const lane = 1 - smoothstep(0.6, 1.1, Math.abs(x - 2 - (z - 20) * 0.35));
  if (z > edge * 0 + 18 && z < 60) path = Math.max(path, lane * smoothstep(18, 21, z));
  if (path > 0) out.lerp(tmp.copy(DIRT).multiplyScalar(0.92 + 0.15 * n2), Math.max(0, Math.min(1, path)) * 0.9);
  // Rock on steep faces, moss on top.
  const rock = smoothstep(0.55, 0.85, slope);
  if (rock > 0) {
    tmp.copy(ROCK).lerp(ROCK_DARK, vnoise(x * 0.6, y * 1.4, 9));
    out.lerp(tmp, rock);
    out.lerp(MOSS, rock * smoothstep(0.55, 0.8, vnoise(x * 0.3, y * 0.5, 4)) * 0.6);
  }
}

/** Rings around the lake, by distance from the water's edge (metres). */
function rings(): number[] {
  const out: number[] = [];
  for (let d = -4.5; d < 0; d += 0.75) out.push(d);
  for (let d = 0; d < 18; d += 0.45) out.push(d);
  for (let d = 18; d < 60; d += 2) out.push(d);
  for (let d = 60; d <= 150; d += 8) out.push(d);
  return out;
}

export function buildGround(material: Material, segments: number): Ground {
  const ds = rings();
  const cols = segments;
  const rows = ds.length;
  const pos = new Float32Array(cols * rows * 3);
  const col = new Float32Array(cols * rows * 3);
  const c = new Color();
  const e = 0.25;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const th = (i / cols) * Math.PI * 2;
      const r = lakeRadius(th) + ds[j]!;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      const y = heightAt(x, z);
      const k = (j * cols + i) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
      const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      const slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
      groundColor(x, z, y, slope * 1.6, c);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * cols + i;
      const b = j * cols + ((i + 1) % cols);
      const c2 = (j + 1) * cols + i;
      const d2 = (j + 1) * cols + ((i + 1) % cols);
      idx.push(a, b, c2, b, d2, c2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new Mesh(g, material);
  mesh.receiveShadow = true;
  mesh.name = "ground";
  return { mesh, dispose: () => g.dispose() };
}
