import { BufferAttribute, BufferGeometry, Color, Group, Mesh, type Material } from "three";
import { AREAS, NORTH, TRAILS, lakeRadius } from "../../game/world";
import { fbm, smoothstep, lerp, vnoise } from "./noise";
import { LOOKS, VALLEY, areaWeights, openAt, pondAt, type OpenInfo, type PondInfo } from "./valley";

/** The falls: a cliff on the north shore, a brook from its foot across the land ring into the lake. */
export const FALLS = (() => {
  const edge = lakeRadius(NORTH);
  const footZ = -(edge + 6.6);
  return { edge, footZ, topZ: footZ - 2.4, topY: 8.6, brookHalf: 1.05 };
})();

/** The path loop around Moonwell Lake, this far from the water's edge. */
export const PATH_D = 3.1;

const OI: OpenInfo = { o: 0, cliff: 0, trail: 0, trailIndex: 0, along: 0 };
const PI: PondInfo = { d: 0, area: AREAS[0]!, theta: 0 };

/** Ground height (y) at a point. Shared by the ground mesh, props and fishers' feet. */
export function heightAt(x: number, z: number): number {
  const pond = pondAt(x, z, PI);
  const d = pond.d;
  if (d < 0) return Math.max(-1.7, -0.03 + d * 0.45);
  let y = -0.03 + smoothstep(0, 1.6, d) * 0.36 + (fbm(x * 0.12, z * 0.12, 3, 3) - 0.5) * 0.35 * smoothstep(1.5, 4, d);
  const { o, cliff: c } = openAt(x, z, OI);
  if (o > -1) {
    const n = fbm(x * 0.05, z * 0.05, 4, 7);
    const H = lerp(3.0 + 5.5 * n, FALLS.topY, c);
    const W = lerp(20, 2.4, c);
    y += H * smoothstep(-1, W, o);
    // Rolling hills further out, and a higher second step behind the falls.
    y += (2 + 9 * fbm(x * 0.025, z * 0.025, 4, 11)) * smoothstep(W, W + 40, o);
    y += c * 5 * smoothstep(W + 6, W + 12, o);
  }
  // The brook: a shallow channel from the foot of the falls to the lake, and a notch over the cliff lip.
  if (Math.abs(x) < 3 && z < 0 && z > FALLS.topZ - 12) {
    const brook = 1 - smoothstep(FALLS.brookHalf * 0.6, FALLS.brookHalf + 0.6, Math.abs(x + Math.sin(z * 0.6) * 0.25));
    if (z < -FALLS.edge + 0.5 && z > FALLS.footZ - 0.5) y = lerp(y, -0.22, brook);
    else if (z <= FALLS.footZ - 0.5 && z > FALLS.topZ - 10) y -= brook * 0.7;
  }
  return y;
}

/** How worn the ground is by a trail at a point (0 grass .. 1 bare earth), with a wandering line. */
export function trailWear(x: number, z: number): number {
  let best = 0;
  for (const t of TRAILS) {
    const dx = t.to.x - t.from.x;
    const dz = t.to.z - t.from.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const along = (x - t.from.x) * ux + (z - t.from.z) * uz;
    if (along < -14 || along > len + 14) continue;
    const lat = (x - t.from.x) * -uz + (z - t.from.z) * ux;
    const wob = Math.sin(along * 0.13 + len) * 0.9 + Math.sin(along * 0.31) * 0.35;
    const w = 0.95 + 0.3 * vnoise(along * 0.4, 3, 7);
    const k = 1 - smoothstep(w * 0.55, w * 1.15, Math.abs(lat - wob));
    const ends = smoothstep(-14, -4, along) * (1 - smoothstep(len + 4, len + 14, along));
    best = Math.max(best, k * ends);
  }
  return best;
}

export type Ground = { group: Group; chunks: Mesh[]; dispose(): void };

const C = (hex: number) => new Color(hex);
const GRASS_FAR = C(0x365a66);
const SAND = C(0xb8acc4);
const WET = C(0x6a6a88);
const BED = C(0x8ab8b0);
const BED_DEEP = C(0x2a5a78);
const DIRT = C(0x9a8678);
const ROCK = C(0x847e94);
const ROCK_DARK = C(0x5a5470);
const MOSS = C(0x3e8a70);

const tmp = new Color();
const ga = new Color();
const gb = new Color();
const gc = new Color();
const W = new Float32Array(AREAS.length);

function groundColor(x: number, z: number, y: number, slope: number, out: Color): void {
  const pond = pondAt(x, z, PI);
  const d = pond.d;
  if (d < 0) {
    out.copy(BED).lerp(BED_DEEP, smoothstep(0, 3, -d));
    out.multiplyScalar(0.9 + 0.2 * vnoise(x * 0.8, z * 0.8, 5));
    return;
  }
  areaWeights(x, z, W);
  ga.setRGB(0, 0, 0);
  gb.setRGB(0, 0, 0);
  gc.setRGB(0, 0, 0);
  AREAS.forEach((a, i) => {
    const w = W[i]!;
    if (w <= 0) return;
    const L = LOOKS[a.id];
    ga.r += L.grassA.r * w; ga.g += L.grassA.g * w; ga.b += L.grassA.b * w;
    gb.r += L.grassB.r * w; gb.g += L.grassB.g * w; gb.b += L.grassB.b * w;
    gc.r += L.grassC.r * w; gc.g += L.grassC.g * w; gc.b += L.grassC.b * w;
  });
  const n1 = fbm(x * 0.09, z * 0.09, 3, 21);
  const n2 = vnoise(x * 0.45, z * 0.45, 22);
  out.copy(ga).lerp(gb, smoothstep(0.35, 0.65, n1));
  out.lerp(gc, smoothstep(0.62, 0.8, n1) * 0.7);
  out.multiplyScalar(0.92 + 0.16 * n2);
  const { o, cliff } = openAt(x, z, OI);
  // The forest floor darkens away from the open ground.
  out.lerp(GRASS_FAR, smoothstep(2, 40, o) * 0.55);
  // Sandy bank with a wet line at the water.
  const sand = 1 - smoothstep(0.5, 1.5 + 0.8 * n2, d);
  tmp.copy(WET).lerp(SAND, smoothstep(0, 0.45, d));
  out.lerp(tmp, sand);
  // Moonwell's path loop round the lake (not over the cliff) and the lane to the cottages.
  let path = 0;
  if (pond.area.id === "moonwell") {
    const th = pond.theta;
    const pathW = 0.75 + 0.25 * vnoise(th * 9, 1, 3);
    path = (1 - smoothstep(pathW * 0.6, pathW, Math.abs(d - PATH_D))) * (1 - cliff * 1.3);
    const lane = 1 - smoothstep(0.6, 1.1, Math.abs(x - 2 - (z - 20) * 0.35));
    if (z > 18 && z < 60) path = Math.max(path, lane * smoothstep(18, 21, z));
  }
  // Forest trails: worn earth that runs on into each clearing and fades before the shore.
  path = Math.max(path, trailWear(x, z) * smoothstep(1.5, 5, d));
  if (path > 0) out.lerp(tmp.copy(DIRT).multiplyScalar(0.92 + 0.15 * n2), Math.max(0, Math.min(1, path)) * 0.9);
  // Rock on steep faces, moss on top.
  const rock = smoothstep(0.55, 0.85, slope);
  if (rock > 0) {
    tmp.copy(ROCK).lerp(ROCK_DARK, vnoise(x * 0.6, y * 1.4, 9));
    out.lerp(tmp, rock);
    out.lerp(MOSS, rock * smoothstep(0.55, 0.8, vnoise(x * 0.3, y * 0.5, 4)) * 0.6);
  }
}

/** Grid lines along one axis: fine across the valley, widening outside it toward the horizon. */
function axis(lo: number, hi: number, step: number, far: number): number[] {
  const out: number[] = [];
  const outer: number[] = [];
  let s = step;
  for (let v = lo - s; v > lo - far; v -= s) {
    outer.push(v);
    s *= 1.12;
  }
  out.push(...outer.reverse());
  for (let v = lo; v <= hi + 1e-6; v += step) out.push(v);
  s = step;
  for (let v = out[out.length - 1]! + s; v < hi + far; v += s) {
    out.push(v);
    s *= 1.12;
  }
  return out;
}

/**
 * One continuous ground over the whole valley: a tensor grid (fine in the valley, coarse outside),
 * cut into chunks so each is frustum-culled on its own.
 */
export function buildGround(material: Material, step: number): Ground {
  const xs = axis(VALLEY.x0, VALLEY.x1, step, 260);
  const zs = axis(VALLEY.z0, VALLEY.z1, step, 260);
  const nx = xs.length;
  const nz = zs.length;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = heightAt(xs[i]!, zs[j]!);
  const col = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  const c = new Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(nx - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(nz - 1, j + 1);
      const gx = (H[j * nx + i1]! - H[j * nx + i0]!) / (xs[i1]! - xs[i0]!);
      const gz = (H[j1 * nx + i]! - H[j0 * nx + i]!) / (zs[j1]! - zs[j0]!);
      const len = Math.sqrt(1 + gx * gx + gz * gz);
      const slope = 1 - 1 / len;
      const kn = (j * nx + i) * 3;
      nor[kn] = -gx / len;
      nor[kn + 1] = 1 / len;
      nor[kn + 2] = -gz / len;
      groundColor(xs[i]!, zs[j]!, H[j * nx + i]!, slope * 1.6, c);
      const k = (j * nx + i) * 3;
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  const group = new Group();
  group.name = "ground";
  const chunks: Mesh[] = [];
  const CH = 48;
  for (let j0 = 0; j0 < nz - 1; j0 += CH) {
    for (let i0 = 0; i0 < nx - 1; i0 += CH) {
      const i1 = Math.min(nx - 1, i0 + CH);
      const j1 = Math.min(nz - 1, j0 + CH);
      const w = i1 - i0 + 1;
      const h = j1 - j0 + 1;
      const pos = new Float32Array(w * h * 3);
      const cc = new Float32Array(w * h * 3);
      const nn = new Float32Array(w * h * 3);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const src = (j0 + j) * nx + (i0 + i);
          const k = (j * w + i) * 3;
          pos[k] = xs[i0 + i]!;
          pos[k + 1] = H[src]!;
          pos[k + 2] = zs[j0 + j]!;
          cc[k] = col[src * 3]!;
          cc[k + 1] = col[src * 3 + 1]!;
          cc[k + 2] = col[src * 3 + 2]!;
          nn[k] = nor[src * 3]!;
          nn[k + 1] = nor[src * 3 + 1]!;
          nn[k + 2] = nor[src * 3 + 2]!;
        }
      }
      const idx: number[] = [];
      for (let j = 0; j < h - 1; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i;
          const b = a + 1;
          const c2 = a + w;
          const d2 = c2 + 1;
          // Alternate the diagonal so slopes do not streak.
          if ((i + j) % 2 === 0) idx.push(a, c2, b, b, c2, d2);
          else idx.push(a, c2, d2, a, d2, b);
        }
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(pos, 3));
      g.setAttribute("color", new BufferAttribute(cc, 3));
      g.setAttribute("normal", new BufferAttribute(nn, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new Mesh(g, material);
      mesh.receiveShadow = true;
      mesh.name = "ground-chunk";
      chunks.push(mesh);
      group.add(mesh);
    }
  }
  return { group, chunks, dispose: () => chunks.forEach((m) => m.geometry.dispose()) };
}
