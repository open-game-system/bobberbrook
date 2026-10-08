import { BufferAttribute, BufferGeometry, Color, Group, Mesh, type Material } from "three";
import { NORTH, lakeRadius } from "../../game/world";
import { fbm, smoothstep, lerp, vnoise } from "./noise";
import { LOOKS, lookOf, newOpenInfo, newPondInfo, openAt, placeWeights, pondAt, type Weighted } from "./valley";
import { seaDist, trailsAround } from "./worldQuery";
import type { Jobs } from "./stream";

/** The falls: a cliff on the north shore, a brook from its foot across the land ring into the lake. */
export const FALLS = (() => {
  const edge = lakeRadius(NORTH);
  const footZ = -(edge + 6.6);
  return { edge, footZ, topZ: footZ - 2.4, topY: 8.6, brookHalf: 1.05 };
})();

/** The path loop around Moonwell Lake, this far from the water's edge. */
export const PATH_D = 3.1;

const OI = newOpenInfo();
const PI = newPondInfo();

/** Sea level: the open sea's surface (ponds sit at 0 too). */
export const SEA_Y = -0.05;

/** Ground height (y) at a point. Shared by the ground mesh, props and fishers' feet. */
export function heightAt(x: number, z: number): number {
  const s = seaDist(x, z);
  if (s < 0) return Math.max(-3.4, 0.12 + s * 0.45);
  const y = landHeight(x, z);
  return s < 16 ? lerp(0.12 + 0.25 * smoothstep(0, 5, s), y, smoothstep(2.5, 16, s)) : y;
}

function landHeight(x: number, z: number): number {
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
  for (const t of trailsAround(x, z)) {
    const { ux, uz, len } = t;
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
const W: Weighted[] = [];
const BEACH = C(0xc8bcc8);
const SEABED = C(0x5a8a9a);

export function groundColor(x: number, z: number, y: number, slope: number, out: Color, sea: number): void {
  if (sea < 6) {
    // The coast: pale sand at the waterline, a teal sea bed under it.
    if (sea < 0) {
      out.copy(BEACH).lerp(SEABED, smoothstep(0, 4, -sea)).multiplyScalar(0.9 + 0.2 * vnoise(x * 0.5, z * 0.5, 6));
      return;
    }
  }
  const pond = pondAt(x, z, PI);
  const d = pond.d;
  if (d < 0) {
    out.copy(BED).lerp(BED_DEEP, smoothstep(0, 3, -d));
    out.multiplyScalar(0.9 + 0.2 * vnoise(x * 0.8, z * 0.8, 5));
    return;
  }
  const n = placeWeights(x, z, W);
  const M = LOOKS.moonwell;
  let rest = 1;
  for (let i = 0; i < n; i++) rest -= W[i]!.w;
  rest = Math.max(0, rest);
  ga.copy(M.grassA).multiplyScalar(rest);
  gb.copy(M.grassB).multiplyScalar(rest);
  gc.copy(M.grassC).multiplyScalar(rest);
  for (let i = 0; i < n; i++) {
    const w = W[i]!.w;
    const L = lookOf(W[i]!.place);
    ga.r += L.grassA.r * w; ga.g += L.grassA.g * w; ga.b += L.grassA.b * w;
    gb.r += L.grassB.r * w; gb.g += L.grassB.g * w; gb.b += L.grassB.b * w;
    gc.r += L.grassC.r * w; gc.g += L.grassC.g * w; gc.b += L.grassC.b * w;
  }
  const n1 = fbm(x * 0.09, z * 0.09, 3, 21);
  const n2 = vnoise(x * 0.45, z * 0.45, 22);
  out.copy(ga).lerp(gb, smoothstep(0.35, 0.65, n1));
  // Violet moss drifts: soft-edged and broken up by finer noise, never a solid slab (round 02).
  const n3 = vnoise(x * 0.23, z * 0.23, 23);
  out.lerp(gc, smoothstep(0.58, 0.9, n1 * 0.75 + n3 * 0.25 + n2 * 0.08) * 0.38);
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
  if (pond.area?.id === "moonwell") {
    const th = pond.theta;
    const pathW = 0.75 + 0.25 * vnoise(th * 9, 1, 3);
    path = (1 - smoothstep(pathW * 0.6, pathW, Math.abs(d - PATH_D))) * (1 - cliff * 1.3);
    const lane = 1 - smoothstep(0.6, 1.1, Math.abs(x - 2 - (z - 20) * 0.35));
    if (z > 18 && z < 60) path = Math.max(path, lane * smoothstep(18, 21, z));
  }
  // Forest trails: worn earth that runs on into each clearing and fades before the shore.
  path = Math.max(path, trailWear(x, z) * smoothstep(1.5, 5, d));
  if (path > 0) out.lerp(tmp.copy(DIRT).multiplyScalar(0.92 + 0.15 * n2), Math.max(0, Math.min(1, path)) * 0.9);
  if (sea < 3) out.lerp(BEACH, (1 - smoothstep(0.5, 3, sea)) * 0.85);
  // Rock on steep faces, moss on top.
  const rock = smoothstep(0.55, 0.85, slope);
  if (rock > 0) {
    tmp.copy(ROCK).lerp(ROCK_DARK, vnoise(x * 0.6, y * 1.4, 9));
    out.lerp(tmp, rock);
    out.lerp(MOSS, rock * smoothstep(0.55, 0.8, vnoise(x * 0.3, y * 0.5, 4)) * 0.6);
  }
}

// ---------- the ground, streamed in chunks round the action ----------

export const GROUND_CHUNK = 48;
/** Grid step per level of detail (metres). */
const STEPS = [0.75, 1.5, 4];
const LOD_DIST = [70, 150];
const GROUND_R = 270;

type GChunk = { ci: number; cj: number; lod: number; want: number; mesh: Mesh | null; sea: Mesh | null; busy: boolean; alive: boolean };

export type GroundStream = {
  group: Group;
  /** Plan chunks round the focus (call every frame; the work itself runs in the job queue). */
  update(fx: number, fz: number): void;
  /** Drop everything (the world changed). */
  reset(): void;
  count(): number;
  dispose(): void;
};

/** Builds one ground chunk at a grid step, a row per slice of work. */
function* chunkJob(ci: number, cj: number, step: number, mat: Material, seaMat: Material): Generator<void, { ground: Mesh; sea: Mesh | null }> {
  const n = Math.round(GROUND_CHUNK / step);
  const x0 = ci * GROUND_CHUNK;
  const z0 = cj * GROUND_CHUNK;
  const N = n + 3;
  const H = new Float32Array(N * N);
  const S = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = x0 + (i - 1) * step;
      const z = z0 + (j - 1) * step;
      S[j * N + i] = seaDist(x, z);
      H[j * N + i] = heightAt(x, z);
    }
    if (j % 6 === 5) yield;
  }
  const V = (n + 1) * (n + 1);
  const skirt = 4 * (n + 1);
  const pos = new Float32Array((V + skirt) * 3);
  const col = new Float32Array((V + skirt) * 3);
  const nor = new Float32Array((V + skirt) * 3);
  const c = new Color();
  let anySea = false;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const g = (j + 1) * N + (i + 1);
      const x = x0 + i * step;
      const z = z0 + j * step;
      const y = H[g]!;
      const gx = (H[g + 1]! - H[g - 1]!) / (2 * step);
      const gz = (H[g + N]! - H[g - N]!) / (2 * step);
      const len = Math.sqrt(1 + gx * gx + gz * gz);
      const k = (j * (n + 1) + i) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      nor[k] = -gx / len;
      nor[k + 1] = 1 / len;
      nor[k + 2] = -gz / len;
      const sea = S[g]!;
      if (sea < 1.5) anySea = true;
      groundColor(x, z, y, (1 - 1 / len) * 1.6, c, sea);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
    if (j % 4 === 3) yield;
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c2 = a + n + 1;
      const d2 = c2 + 1;
      if ((i + j) % 2 === 0) idx.push(a, c2, b, b, c2, d2);
      else idx.push(a, c2, d2, a, d2, b);
    }
  }
  // Skirts hang down from the four edges, hiding cracks between chunks of different detail.
  const edges: number[][] = [[], [], [], []];
  for (let t = 0; t <= n; t++) {
    edges[0]!.push(t);
    edges[1]!.push(n * (n + 1) + t);
    edges[2]!.push(t * (n + 1));
    edges[3]!.push(t * (n + 1) + n);
  }
  let sv = V;
  edges.forEach((edge, e) => {
    const base = sv;
    for (const v of edge) {
      pos[sv * 3] = pos[v * 3]!;
      pos[sv * 3 + 1] = pos[v * 3 + 1]! - 2.5;
      pos[sv * 3 + 2] = pos[v * 3 + 2]!;
      for (let q = 0; q < 3; q++) {
        col[sv * 3 + q] = col[v * 3 + q]!;
        nor[sv * 3 + q] = nor[v * 3 + q]!;
      }
      sv++;
    }
    for (let t = 0; t < n; t++) {
      const a = edge[t]!;
      const b = edge[t + 1]!;
      const a2 = base + t;
      const b2 = base + t + 1;
      // Both windings: the skirt shows from either side.
      if (e === 0 || e === 3) idx.push(a, b, a2, b, b2, a2);
      else idx.push(a, a2, b, b, a2, b2);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const ground = new Mesh(g, mat);
  ground.receiveShadow = true;
  ground.name = "ground-chunk";
  let sea: Mesh | null = null;
  if (anySea) {
    yield;
    // The open sea over this chunk: only where the ground dips below the surface.
    const sp: number[] = [];
    const sd: number[] = [];
    const si: number[] = [];
    const vmap = new Int32Array((n + 1) * (n + 1)).fill(-1);
    const vert = (i: number, j: number) => {
      const k = j * (n + 1) + i;
      if (vmap[k]! >= 0) return vmap[k]!;
      const gi = (j + 1) * N + (i + 1);
      vmap[k] = sp.length / 3;
      sp.push(x0 + i * step, SEA_Y, z0 + j * step);
      sd.push(Math.max(-1, SEA_Y - H[gi]!), S[gi]!);
      return vmap[k]!;
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const lo = Math.min(H[(j + 1) * N + i + 1]!, H[(j + 1) * N + i + 2]!, H[(j + 2) * N + i + 1]!, H[(j + 2) * N + i + 2]!);
        const sMin = Math.min(S[(j + 1) * N + i + 1]!, S[(j + 2) * N + i + 2]!);
        if (lo > SEA_Y + 0.05 || sMin > 8) continue;
        const a = vert(i, j);
        const b = vert(i + 1, j);
        const c2 = vert(i, j + 1);
        const d2 = vert(i + 1, j + 1);
        si.push(a, c2, b, b, c2, d2);
      }
    }
    if (si.length > 0) {
      const sg = new BufferGeometry();
      sg.setAttribute("position", new BufferAttribute(new Float32Array(sp), 3));
      sg.setAttribute("aSea", new BufferAttribute(new Float32Array(sd), 2));
      sg.setIndex(si);
      sg.computeBoundingSphere();
      sea = new Mesh(sg, seaMat);
      sea.name = "sea-chunk";
      sea.renderOrder = 1;
    }
  }
  return { ground, sea };
}

const ck = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

export function buildGroundStream(material: Material, seaMat: Material, jobs: Jobs, full: boolean): GroundStream {
  const group = new Group();
  group.name = "ground";
  const chunks = new Map<number, GChunk>();
  const steps = full ? STEPS : STEPS.map((s) => s * 1.5);
  const drop = (c: GChunk) => {
    c.alive = false;
    if (c.mesh) {
      group.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    if (c.sea) {
      group.remove(c.sea);
      c.sea.geometry.dispose();
    }
    c.mesh = null;
    c.sea = null;
  };
  const schedule = (c: GChunk, prio: number) => {
    c.busy = true;
    const lod = c.want;
    const gen = chunkJob(c.ci, c.cj, steps[lod]!, material, seaMat);
    jobs.add(prio, function* () {
      const r: { ground: Mesh; sea: Mesh | null } = yield* gen;
      c.busy = false;
      if (!c.alive) {
        r.ground.geometry.dispose();
        r.sea?.geometry.dispose();
        return;
      }
      if (c.mesh) {
        group.remove(c.mesh);
        c.mesh.geometry.dispose();
      }
      if (c.sea) {
        group.remove(c.sea);
        c.sea.geometry.dispose();
      }
      c.mesh = r.ground;
      c.sea = r.sea;
      c.lod = lod;
      group.add(r.ground);
      if (r.sea) group.add(r.sea);
    }());
  };
  return {
    group,
    update(fx, fz) {
      const R = Math.ceil(GROUND_R / GROUND_CHUNK);
      const ci0 = Math.floor(fx / GROUND_CHUNK);
      const cj0 = Math.floor(fz / GROUND_CHUNK);
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const ci = ci0 + di;
          const cj = cj0 + dj;
          const cx = (ci + 0.5) * GROUND_CHUNK;
          const cz = (cj + 0.5) * GROUND_CHUNK;
          const d = Math.max(0, Math.hypot(cx - fx, cz - fz) - GROUND_CHUNK * 0.71);
          if (d > GROUND_R) continue;
          const want = d < LOD_DIST[0]! ? 0 : d < LOD_DIST[1]! ? 1 : 2;
          const k = ck(ci, cj);
          let c = chunks.get(k);
          if (!c) {
            c = { ci, cj, lod: -1, want, mesh: null, sea: null, busy: false, alive: true };
            chunks.set(k, c);
          }
          c.want = want;
          if (!c.busy && c.lod !== want) schedule(c, d + (c.mesh ? 60 : 0));
        }
      }
      for (const [k, c] of chunks) {
        const cx = (c.ci + 0.5) * GROUND_CHUNK;
        const cz = (c.cj + 0.5) * GROUND_CHUNK;
        if (Math.hypot(cx - fx, cz - fz) - GROUND_CHUNK * 0.71 > GROUND_R + 40) {
          drop(c);
          chunks.delete(k);
        }
      }
    },
    reset() {
      for (const c of chunks.values()) drop(c);
      chunks.clear();
    },
    count: () => chunks.size,
    dispose() {
      for (const c of chunks.values()) drop(c);
      chunks.clear();
    },
  };
}
