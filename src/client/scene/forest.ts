import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, type Camera, type Material } from "three";
import { AREAS, CAMPFIRE, SOUTH, TRAIL_HALF_WIDTH, angleGap } from "../../game/world";
import { CANOPY, blob, bushGeometry, instanced, oakGeometry, pineGeometry, type Inst } from "./kit";
import { birchGeometry, willowGeometry } from "./landmarks";
import { fbm, rng, vnoise } from "./noise";
import { merge, paint, prep, puffNormals } from "./geo";
import { FALLS, heightAt } from "./terrain";
import { LOOKS, VALLEY, areaWeights, openAt, pondAt, type OpenInfo, type PondInfo } from "./valley";

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
type Chunk = { x: number; z: number; r: number; hi: InstancedMesh[]; lo: InstancedMesh[]; lod: number };

export type Forest = {
  group: Group;
  /** LOD and distance culling against the camera (call once per frame). */
  update(camera: Camera): void;
  /** Number of trees placed. */
  count: number;
  dispose(): void;
};

const CHUNK = 50;
/** Beyond this (metres from a chunk's edge) the cheap trees stand in. */
const HI_DIST = 75;
const FAR_DIST = 330;

export function buildForest(full: boolean, treeMat: Material): Forest {
  const R = rng(4321);
  const kinds: Kind[] = [
    { hi: oakGeometry(0), lo: oakLo(0), shadows: true },
    { hi: oakGeometry(1), lo: oakLo(1), shadows: true },
    { hi: oakGeometry(2), lo: oakLo(2), shadows: true },
    { hi: pineGeometry(), lo: pineLo(), shadows: true },
    { hi: bushGeometry(), lo: bushGeometry(), shadows: false },
    { hi: willowGeometry(3), lo: oakLo(0), shadows: true },
    { hi: birchGeometry(9), lo: oakLo(2), shadows: true },
  ];
  const cols = Math.ceil((VALLEY.x1 - VALLEY.x0 + 60) / CHUNK);
  const rows = Math.ceil((VALLEY.z1 - VALLEY.z0 + 60) / CHUNK);
  const ox = VALLEY.x0 - 30;
  const oz = VALLEY.z0 - 30;
  const lists: Inst[][][] = Array.from({ length: cols * rows }, () => kinds.map(() => []));
  const oi: OpenInfo = { o: 0, cliff: 0, trail: 0, trailIndex: 0, along: 0 };
  const pi: PondInfo = { d: 0, area: AREAS[0]!, theta: 0 };
  const W = new Float32Array(AREAS.length);
  const tint = new Color();
  const spacing = full ? 3.7 : 4.6;
  let count = 0;
  for (let z = oz; z < oz + rows * CHUNK; z += spacing) {
    for (let x = ox; x < ox + cols * CHUNK; x += spacing) {
      const px = x + (R() - 0.5) * spacing * 0.9;
      const pz = z + (R() - 0.5) * spacing * 0.9;
      const { o, trail } = openAt(px, pz, oi);
      // Near a trail the woods stay low and open, so the camera sees the family walking it.
      const nearTrail = trail - TRAIL_HALF_WIDTH < 10;
      if (o < -0.5) continue;
      if (pondAt(px, pz, pi).d < 1.5) continue;
      if (Math.abs(px) < 4.5 && pz < 0 && pz > FALLS.topZ - 14) continue;
      if (FOREST_CLEAR.some(([cx, cz, r]) => Math.hypot(px - cx, pz - cz) < r)) continue;
      // A meadow south of Moonwell where the camera sits.
      const mr = Math.hypot(px, pz);
      if (angleGap(Math.atan2(pz, px), SOUTH) < 0.75 && mr < 75 && (mr > 62 || R() < 0.85)) continue;
      // Outside the valley proper the hills thin out (fog hides them anyway).
      const outside = px < VALLEY.x0 || px > VALLEY.x1 || pz < VALLEY.z0 || pz > VALLEY.z1;
      if (outside && R() < 0.5) continue;
      const dens = fbm(px * 0.04, pz * 0.04, 3, 77);
      if (dens < 0.36 && R() < 0.6) continue;
      const y = heightAt(px, pz) - 0.15;
      areaWeights(px, pz, W);
      let k: number;
      let s: number;
      if (o < 1.6) {
        // The fringe of the open ground: bushes.
        if (R() < 0.45) continue;
        k = 4;
        s = 0.7 + R() * 0.6;
      } else {
        const pineK = 0.45 + 0.35 * W[4]! - 0.3 * W[3]! - 0.2 * W[1]!;
        k = R() < pineK ? 3 : Math.floor(R() * 3);
        // Willows round the marsh, birches round the pools.
        if (!nearTrail && o > 6 && R() < W[1]! * 1.1 - 0.15) k = 5;
        else if (R() < W[2]! * 1.0 - 0.15) k = 6;
        s = (0.95 + R() * 0.6 + Math.min(o, 40) * 0.012) * (k === 3 ? 1.15 : k === 5 ? 0.85 : 1);
        if (nearTrail) {
          if (R() < 0.4) continue;
          s = Math.min(s, 0.75 + 0.03 * (trail - TRAIL_HALF_WIDTH));
        }
      }
      // Canopy sub-palette of the place it belongs to.
      tint.setRGB(0, 0, 0);
      AREAS.forEach((a, i) => {
        const w = W[i]!;
        if (w <= 0) return;
        const L = LOOKS[a.id];
        const cc = L.canopy[Math.floor(vnoise(px * 0.2, pz * 0.2, 3) * L.canopy.length * 0.999)]!;
        tint.r += cc.r * w; tint.g += cc.g * w; tint.b += cc.b * w;
      });
      tint.multiplyScalar(0.85 + R() * 0.22);
      const ci = Math.floor((px - ox) / CHUNK) + Math.floor((pz - oz) / CHUNK) * cols;
      const list = lists[ci];
      if (!list) continue;
      list[k]!.push({ x: px, y, z: pz, s, ry: R() * 6.28, tint: tint.clone() });
      count++;
    }
  }
  const group = new Group();
  group.name = "forest";
  const chunks: Chunk[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const per = lists[j * cols + i]!;
      const hi: InstancedMesh[] = [];
      const lo: InstancedMesh[] = [];
      per.forEach((list, k) => {
        if (list.length === 0) return;
        const kind = kinds[k]!;
        const h = instanced(kind.hi, treeMat, list, full && kind.shadows);
        h.name = `forest-${k}`;
        const l = instanced(kind.lo, treeMat, list, false);
        l.name = `forest-lo-${k}`;
        l.visible = false;
        hi.push(h);
        lo.push(l);
        group.add(h, l);
      });
      chunks.push({ x: ox + (i + 0.5) * CHUNK, z: oz + (j + 0.5) * CHUNK, r: CHUNK * 0.71, hi, lo, lod: 0 });
    }
  }
  return {
    group,
    count,
    update(camera) {
      const cx = camera.position.x;
      const cz = camera.position.z;
      for (const c of chunks) {
        const d = Math.hypot(c.x - cx, c.z - cz) - c.r;
        const lod = d < HI_DIST ? 0 : d < FAR_DIST ? 1 : 2;
        if (lod === c.lod) continue;
        c.lod = lod;
        for (const m of c.hi) m.visible = lod === 0;
        for (const m of c.lo) m.visible = lod === 1;
      }
    },
    dispose() {
      for (const k of kinds) {
        k.hi.dispose();
        k.lo.dispose();
      }
    },
  };
}
