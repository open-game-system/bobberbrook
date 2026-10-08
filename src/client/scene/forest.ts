import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, type Camera, type Material } from "three";
import { CAMPFIRE, SOUTH, TRAIL_HALF_WIDTH, angleGap } from "../../game/world";
import { CANOPY, blob, bushGeometry, instanced, oakGeometry, pineGeometry, type Inst } from "./kit";
import { birchGeometry, willowGeometry } from "./landmarks";
import { fbm, hash2, rng, vnoise } from "./noise";
import { merge, paint, prep, puffNormals } from "./geo";
import { FALLS, heightAt } from "./terrain";
import { LOOKS, lookOf, newOpenInfo, newPondInfo, openAt, placeWeights, pondAt, type Weighted } from "./valley";
import { activeWorld, seaDist } from "./worldQuery";
import type { Jobs } from "./stream";
import type { Biome } from "../../game/regions";

/**
 * The Ashenvale forest filling everything that is not a clearing or a trail: instanced trees in
 * chunks (each frustum-culled), full detail near the camera and a cheap stand-in further out.
 */

/** Ground kept clear of forest (the falls, the camp, the cottages) as circles x, z, r. */
export const FOREST_CLEAR: [number, number, number][] = [
  [CAMPFIRE.x, CAMPFIRE.z, 5],
  [36, 12, 10],
];

export function oakLo(variant: number): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.32, 0.5, 3.0, 6).translate(0, 1.5, 0));
  paint(trunk, 0x3a2c3a, 0x6a5460);
  const canopy = merge([blob(2.1, 0, 4.0, 0, 1, 7, 5), blob(1.5, 1.1, 3.6, 0.4, 2, 6, 4), blob(1.5, -1.0, 3.8, -0.4, 3, 6, 4)]);
  puffNormals(canopy, 0, 4.0, 0, 0.8);
  paint(canopy, CANOPY[variant]![0]!, CANOPY[variant]![1]!, (_p, n, c) => {
    if (n.y > 0.55) c.lerp(new Color(CANOPY[variant]![2]!), (n.y - 0.55) * 0.6);
  });
  return merge([trunk, canopy]);
}

export function pineLo(): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.16, 0.3, 1.6, 5).translate(0, 0.8, 0));
  paint(trunk, 0x3a2c38);
  const a = prep(new ConeGeometry(1.7, 2.8, 7).translate(0, 2.7, 0));
  const b = prep(new ConeGeometry(1.0, 2.2, 7).translate(0, 4.4, 0));
  for (const g of [a, b]) {
    puffNormals(g, 0, 3, 0, 0.5);
    paint(g, 0x102e40, 0x2f6e78);
  }
  return merge([trunk, a, b]);
}

type Kind = { hi: BufferGeometry; lo: BufferGeometry; shadows: boolean };
type Chunk = { ci: number; cj: number; x: number; z: number; r: number; hi: InstancedMesh[]; lo: InstancedMesh[]; lod: number; busy: boolean; alive: boolean; built: boolean };

export type Forest = {
  group: Group;
  /** Plans chunks round the focus and sets LOD against the camera (call once per frame). */
  update(camera: Camera, fx: number, fz: number): void;
  /** Number of trees placed (in the live chunks). */
  count: number;
  reset(): void;
  dispose(): void;
};

const CHUNK = 64;
/** Beyond this (metres from a chunk's edge) the cheap trees stand in. */
const HI_DIST = 75;
const FAR_DIST = 300;
/** Forest is grown this far round the focus. */
const FOREST_R = 250;

/** How a biome leans the forest mix: pines, willows, birches. */
const MIX: Partial<Record<Biome, { pine: number; willow: number; birch: number }>> = {
  marsh: { pine: -0.2, willow: 1.1, birch: 0 },
  willow: { pine: -0.3, willow: 1.5, birch: 0 },
  pools: { pine: 0, willow: 0, birch: 1.0 },
  crystal: { pine: 0.1, willow: 0, birch: 0.8 },
  hollow: { pine: -0.3, willow: 0, birch: 0 },
  tarn: { pine: 0.35, willow: 0, birch: 0 },
  frost: { pine: 0.55, willow: 0, birch: 0.15 },
  ember: { pine: -0.25, willow: 0, birch: 0.1 },
};

const ck = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

export function buildForest(full: boolean, treeMat: Material, jobs: Jobs): Forest {
  const kinds: Kind[] = [
    { hi: oakGeometry(0), lo: oakLo(0), shadows: true },
    { hi: oakGeometry(1), lo: oakLo(1), shadows: true },
    { hi: oakGeometry(2), lo: oakLo(2), shadows: true },
    { hi: pineGeometry(), lo: pineLo(), shadows: true },
    { hi: bushGeometry(), lo: bushGeometry(), shadows: false },
    { hi: willowGeometry(3), lo: oakLo(0), shadows: true },
    { hi: birchGeometry(9), lo: oakLo(2), shadows: true },
  ];
  const group = new Group();
  group.name = "forest";
  const chunks = new Map<number, Chunk>();
  const oi = newOpenInfo();
  const pi = newPondInfo();
  const W: Weighted[] = [];
  const tint = new Color();
  const spacing = full ? 3.7 : 4.6;
  const api: Forest = { group, count: 0, update, reset, dispose };

  function* grow(c: Chunk): Generator<void, void> {
    const R = rng(Math.floor(hash2(c.ci, c.cj, activeWorld().seed * 31 + 4321) * 4294967296));
    const lists: Inst[][] = kinds.map(() => []);
    const ox = c.ci * CHUNK;
    const oz = c.cj * CHUNK;
    let row = 0;
    for (let z = oz; z < oz + CHUNK; z += spacing) {
      for (let x = ox; x < ox + CHUNK; x += spacing) {
        const px = x + (R() - 0.5) * spacing * 0.9;
        const pz = z + (R() - 0.5) * spacing * 0.9;
        const r1 = R();
        const r2 = R();
        const r3 = R();
        const r4 = R();
        const r5 = R();
        const r6 = R();
        if (seaDist(px, pz) < 3) continue;
        const { o, trail } = openAt(px, pz, oi);
        // Near a trail the woods stay low and open, so the camera sees the family walking it.
        const nearTrail = trail - TRAIL_HALF_WIDTH < 10;
        if (o < -0.5) continue;
        if (pondAt(px, pz, pi).d < 1.5) continue;
        if (Math.abs(px) < 4.5 && pz < 0 && pz > FALLS.topZ - 14) continue;
        if (FOREST_CLEAR.some(([cx, cz, r]) => Math.hypot(px - cx, pz - cz) < r)) continue;
        // A meadow south of Moonwell where the camera sits.
        const mr = Math.hypot(px, pz);
        if (angleGap(Math.atan2(pz, px), SOUTH) < 0.75 && mr < 75 && (mr > 62 || r1 < 0.85)) continue;
        const dens = fbm(px * 0.04, pz * 0.04, 3, 77);
        if (dens < 0.36 && r2 < 0.6) continue;
        const y = heightAt(px, pz) - 0.15;
        const n = placeWeights(px, pz, W);
        let pineK = 0.45;
        let willowK = 0;
        let birchK = 0;
        for (let i = 0; i < n; i++) {
          const m = MIX[W[i]!.place.biome];
          if (!m) continue;
          pineK += m.pine * W[i]!.w;
          willowK += m.willow * W[i]!.w;
          birchK += m.birch * W[i]!.w;
        }
        let k: number;
        let s: number;
        if (o < 1.6) {
          // The fringe of the open ground: bushes.
          if (r3 < 0.45) continue;
          k = 4;
          s = 0.7 + r4 * 0.6;
        } else {
          k = r3 < pineK ? 3 : Math.floor(r4 * 3);
          // Willows round the marshes, birches round the pools.
          if (!nearTrail && o > 6 && r5 < willowK - 0.15) k = 5;
          else if (r5 < birchK - 0.15) k = 6;
          s = (0.95 + r6 * 0.6 + Math.min(o, 40) * 0.012) * (k === 3 ? 1.15 : k === 5 ? 0.85 : 1);
          if (nearTrail) {
            if (r1 < 0.4) continue;
            s = Math.min(s, 0.75 + 0.03 * (trail - TRAIL_HALF_WIDTH));
          }
        }
        // Canopy sub-palette of the places it belongs to.
        let rest = 1;
        for (let i = 0; i < n; i++) rest -= W[i]!.w;
        rest = Math.max(0, rest);
        const vn = vnoise(px * 0.2, pz * 0.2, 3);
        const M = LOOKS.moonwell.canopy;
        tint.copy(M[Math.floor(vn * M.length * 0.999)]!).multiplyScalar(rest);
        for (let i = 0; i < n; i++) {
          const L = lookOf(W[i]!.place).canopy;
          const cc = L[Math.floor(vn * L.length * 0.999)]!;
          const w = W[i]!.w;
          tint.r += cc.r * w; tint.g += cc.g * w; tint.b += cc.b * w;
        }
        tint.multiplyScalar(0.85 + r2 * 0.22);
        lists[k]!.push({ x: px, y, z: pz, s, ry: r6 * 6.28, tint: tint.clone() });
      }
      if (++row % 3 === 0) yield;
    }
    if (!c.alive) return;
    let count = 0;
    lists.forEach((list, k) => {
      if (list.length === 0) return;
      const kind = kinds[k]!;
      const h = instanced(kind.hi, treeMat, list, full && kind.shadows);
      h.name = `forest-${k}`;
      const l = instanced(kind.lo, treeMat, list, false);
      l.name = `forest-lo-${k}`;
      c.hi.push(h);
      c.lo.push(l);
      h.visible = c.lod === 0;
      l.visible = c.lod === 1;
      group.add(h, l);
      count += list.length;
    });
    api.count += count;
    c.built = true;
    c.busy = false;
  }

  function drop(c: Chunk): void {
    c.alive = false;
    api.count -= c.hi.reduce((s, m) => s + m.count, 0);
    for (const m of [...c.hi, ...c.lo]) {
      group.remove(m);
      m.dispose();
    }
    c.hi.length = 0;
    c.lo.length = 0;
  }

  function update(camera: Camera, fx: number, fz: number): void {
    const R = Math.ceil(FOREST_R / CHUNK);
    const ci0 = Math.floor(fx / CHUNK);
    const cj0 = Math.floor(fz / CHUNK);
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const ci = ci0 + di;
        const cj = cj0 + dj;
        const x = (ci + 0.5) * CHUNK;
        const z = (cj + 0.5) * CHUNK;
        const d = Math.max(0, Math.hypot(x - fx, z - fz) - CHUNK * 0.71);
        if (d > FOREST_R) continue;
        const k = ck(ci, cj);
        if (chunks.has(k)) continue;
        const c: Chunk = { ci, cj, x, z, r: CHUNK * 0.71, hi: [], lo: [], lod: 0, busy: true, alive: true, built: false };
        chunks.set(k, c);
        jobs.add(d + 5, grow(c));
      }
    }
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const [k, c] of chunks) {
      if (Math.hypot(c.x - fx, c.z - fz) - c.r > FOREST_R + 50) {
        drop(c);
        chunks.delete(k);
        continue;
      }
      const d = Math.hypot(c.x - cx, c.z - cz) - c.r;
      const lod = d < HI_DIST ? 0 : d < FAR_DIST ? 1 : 2;
      if (lod === c.lod) continue;
      c.lod = lod;
      for (const m of c.hi) m.visible = lod === 0;
      for (const m of c.lo) m.visible = lod === 1;
    }
  }

  function reset(): void {
    for (const c of chunks.values()) drop(c);
    chunks.clear();
    api.count = 0;
  }

  function dispose(): void {
    reset();
    for (const k of kinds) {
      k.hi.dispose();
      k.lo.dispose();
    }
  }

  return api;
}
