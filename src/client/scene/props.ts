import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  BoxGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Material,
} from "three";
import { CAMPFIRE, DOCK, EAST, OBSTACLES, SOUTH, WEST, NORTH, angleGap, lakeRadius, outerRadius } from "../../game/world";
import { FALLS, PATH_D, heightAt } from "./terrain";
import { fbm, rng, vnoise } from "./noise";
import { jitter, merge, paint, paintedMaterial, prep, puffNormals } from "./geo";
import type { TodState } from "./tod";
import type { SceneQuality } from "./types";

type Inst = { x: number; y: number; z: number; s: number; ry: number; tint?: Color; sy?: number; tilt?: number };

const m4 = new Matrix4();
const dummy = new Object3D();

function instanced(geo: BufferGeometry, mat: Material, list: Inst[], shadows: boolean): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(it.tilt ?? 0, it.ry, 0);
    dummy.scale.set(it.s, it.s * (it.sy ?? 1), it.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, it.tint ?? new Color(1, 1, 1));
  });
  mesh.count = list.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  void m4;
  return mesh;
}

// ---------- kits ----------

function blob(r: number, x: number, y: number, z: number, seed: number, w = 10, h = 8): BufferGeometry {
  const g = new SphereGeometry(r, w, h);
  jitter(g, 0.16, seed);
  g.computeVertexNormals();
  g.translate(x, y, z);
  return prep(g);
}

function oakGeometry(): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.3, 0.5, 3.0, 9).translate(0, 1.5, 0));
  paint(trunk, 0x5a3c26, 0x8a6442);
  const roots = prep(new ConeGeometry(0.85, 0.7, 9).translate(0, 0.25, 0));
  paint(roots, 0x4f3420, 0x6b4a2e);
  const blobs: [number, number, number, number][] = [
    [0, 3.9, 0, 1.8], [1.35, 3.4, 0.35, 1.3], [-1.25, 3.5, -0.2, 1.35], [0.25, 3.4, 1.25, 1.25],
    [-0.35, 3.5, -1.2, 1.3], [0.55, 4.8, -0.25, 1.35], [-0.65, 4.6, 0.55, 1.2], [0.9, 4.3, 0.9, 1.0],
  ];
  const canopy = merge(blobs.map(([x, y, z, r], i) => blob(r, x, y, z, i * 1.7)));
  puffNormals(canopy, 0, 4.0, 0, 0.8);
  paint(canopy, 0x2c6a2c, 0x9bd14e, (p, n, c) => {
    const k = vnoise(p.x * 2.2 + 10, p.z * 2.2 + p.y, 4);
    c.multiplyScalar(0.86 + 0.28 * k);
    // A warmer, sunlit top.
    if (n.y > 0.55) c.lerp(new Color(0xc4dc5a), (n.y - 0.55) * 0.5);
  });
  return merge([trunk, roots, canopy]);
}

function pineGeometry(): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.16, 0.3, 1.6, 7).translate(0, 0.8, 0));
  paint(trunk, 0x4f3620, 0x6e4e30);
  const layers: [number, number, number][] = [
    [1.3, 1.75, 2.3], [2.35, 1.4, 2.0], [3.3, 1.05, 1.75], [4.15, 0.68, 1.4],
  ];
  const cones = layers.map(([y, r, h], i) => {
    const g = new ConeGeometry(r, h, 10, 2);
    jitter(g, 0.08, i * 3.3);
    g.computeVertexNormals();
    g.translate(0, y + h / 2, 0);
    const p = prep(g);
    puffNormals(p, 0, y + h * 0.2, 0, 0.55);
    paint(p, 0x1f4f30, 0x4f8e46, (pp, _n, c) => c.multiplyScalar(0.9 + 0.2 * vnoise(pp.x * 3, pp.z * 3 + pp.y, 9)));
    return p;
  });
  return merge([trunk, ...cones]);
}

function rockGeometry(seed: number): BufferGeometry {
  const g = new SphereGeometry(1, 11, 8);
  g.scale(1, 0.68, 0.88);
  jitter(g, 0.32, seed);
  g.computeVertexNormals();
  const p = prep(g);
  paint(p, 0x6c655f, 0xa59d92, (pp, n, c) => {
    c.multiplyScalar(0.88 + 0.22 * vnoise(pp.x * 3 + seed, pp.z * 3, 2));
    if (n.y > 0.55) c.lerp(new Color(0x6f9e3c), Math.min(1, (n.y - 0.55) * 2.2) * 0.8);
  });
  return p;
}

function bushGeometry(): BufferGeometry {
  const parts = [blob(0.75, 0, 0.55, 0, 1, 9, 7), blob(0.6, 0.6, 0.45, 0.2, 2, 9, 7), blob(0.55, -0.55, 0.42, -0.1, 3, 9, 7), blob(0.5, 0.1, 0.9, -0.35, 4, 9, 7)];
  const g = merge(parts);
  puffNormals(g, 0, 0.5, 0, 0.8);
  paint(g, 0x2f6a2c, 0x8cc84a, (p, _n, c) => c.multiplyScalar(0.88 + 0.24 * vnoise(p.x * 3, p.z * 3, 7)));
  return g;
}

function tuftGeometry(): BufferGeometry {
  const pos: number[] = [];
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const h = 0.3 + ((i * 37) % 10) * 0.035;
    const lean = 0.12 + ((i * 13) % 5) * 0.03;
    const cx = Math.cos(a) * 0.06;
    const cz = Math.sin(a) * 0.06;
    const px = -Math.sin(a) * 0.045;
    const pz = Math.cos(a) * 0.045;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  // Grass normals point up so tufts light like the ground they stand on.
  const nor = g.getAttribute("normal");
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  paint(g, 0x3c7a2a, 0xb4d660);
  return g;
}

function flowerGeometry(): BufferGeometry {
  const stem = prep(new CylinderGeometry(0.012, 0.016, 0.32, 4).translate(0, 0.16, 0));
  paint(stem, 0x3f7a2a);
  const head = prep(new SphereGeometry(0.075, 7, 5).scale(1, 0.55, 1).translate(0, 0.33, 0));
  paint(head, 0xffffff);
  const eye = prep(new SphereGeometry(0.032, 6, 4).translate(0, 0.36, 0));
  paint(eye, 0xffd23a);
  // Head + eye are white/yellow; the instance tint colours the petals (and slightly the eye).
  return merge([stem, head, eye]);
}

function lupineGeometry(): BufferGeometry {
  const stem = prep(new CylinderGeometry(0.015, 0.02, 0.5, 4).translate(0, 0.25, 0));
  paint(stem, 0x3f7a2a);
  const spike = prep(new ConeGeometry(0.09, 0.5, 7, 3).translate(0, 0.68, 0));
  jitter(spike, 0.2, 2);
  paint(spike, 0xffffff, 0xf0f0ff);
  const leaves = prep(new ConeGeometry(0.16, 0.12, 6).translate(0, 0.06, 0));
  paint(leaves, 0x4a8a34);
  return merge([stem, spike, leaves]);
}

function reedGeometry(cattail: boolean): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const n = cattail ? 4 : 5;
  for (let i = 0; i < n; i++) {
    const h = 1.1 + ((i * 7) % 5) * 0.14;
    const g = new ConeGeometry(0.035, h, 4);
    g.translate(0, h / 2, 0);
    g.rotateZ(((i % 3) - 1) * 0.12);
    g.rotateX(((i % 2) - 0.5) * 0.18);
    g.translate(Math.cos(i * 2.3) * 0.12, 0, Math.sin(i * 2.3) * 0.12);
    const p = prep(g);
    paint(p, 0x3d6e2a, 0xa9c45c);
    parts.push(p);
  }
  if (cattail) {
    for (let i = 0; i < 2; i++) {
      const x = i * 0.12 - 0.05;
      const stalk = prep(new CylinderGeometry(0.014, 0.018, 1.5, 4).translate(x, 0.75, i * 0.05));
      paint(stalk, 0x4f7a32);
      const head = prep(new CylinderGeometry(0.065, 0.065, 0.3, 7).translate(x, 1.5 + i * 0.12, i * 0.05));
      paint(head, 0x6a3f22, 0x7f4c28);
      parts.push(stalk, head);
    }
  }
  return merge(parts);
}

function padGeometry(): BufferGeometry {
  const g = new CircleGeometry(0.55, 16, 0.25, Math.PI * 2 - 0.5);
  g.rotateX(-Math.PI / 2);
  const p = prep(g);
  paint(p, 0x3f8a34, 0x3f8a34, (pp, _n, c) => {
    const r = Math.hypot(pp.x, pp.z);
    c.setHex(0x3a8030).lerp(new Color(0x7cbf4a), r / 0.55);
  });
  return p;
}

function lilyGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      const g = new SphereGeometry(1, 6, 4);
      g.scale(0.07, 0.035, 0.2);
      g.translate(0, 0, 0.13);
      g.rotateX(ring === 0 ? -0.35 : -0.85);
      g.rotateY(a);
      g.translate(0, 0.05 + ring * 0.03, 0);
      const p = prep(g);
      paint(p, ring === 0 ? 0xf6b8d0 : 0xffe8f0, 0xffffff);
      parts.push(p);
    }
  }
  const c = prep(new SphereGeometry(0.05, 6, 4).translate(0, 0.08, 0));
  paint(c, 0xffcc33);
  parts.push(c);
  return merge(parts);
}

/** A triangular-prism roof over a w×d footprint, ridge along x. */
function roofGeometry(w: number, d: number, h: number): BufferGeometry {
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  const A = [x0, 0, z0], B = [x1, 0, z0], C = [x1, 0, z1], D = [x0, 0, z1], E = [x0, h, 0], F = [x1, h, 0];
  tri(D, C, F); tri(D, F, E);
  tri(B, A, E); tri(B, E, F);
  tri(A, D, E);
  tri(C, B, F);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

function cottageGeometry(seed: number): { body: BufferGeometry; windows: BufferGeometry } {
  const r = rng(seed);
  const w = 3 + r() * 1.2;
  const d = 2.4 + r() * 0.6;
  const h = 1.9 + r() * 0.6;
  const walls = prep(new BoxGeometry(w, h, d).translate(0, h / 2, 0));
  paint(walls, 0xd8c8a0, 0xf4e8c8);
  const beams: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const b = prep(new BoxGeometry(0.16, h, 0.16).translate((sx * w) / 2, h / 2, (sz * d) / 2));
      paint(b, 0x5a3a24);
      beams.push(b);
    }
  }
  const roofCols = [0xb4523a, 0x4a6aa0, 0x8a4a6a, 0xc0703a];
  const roof = prep(roofGeometry(w + 0.6, d + 0.7, 1.4 + r() * 0.4).translate(0, h, 0));
  paint(roof, roofCols[Math.floor(r() * roofCols.length)]!, 0xffffff, (_p, _n, c) => c.multiplyScalar(0.85));
  const chim = prep(new BoxGeometry(0.4, 1.2, 0.4).translate(w * 0.25, h + 1.0, -d * 0.15));
  paint(chim, 0x8a7a6a);
  const door = prep(new BoxGeometry(0.6, 1.1, 0.06).translate(-w * 0.2, 0.55, d / 2 + 0.03));
  paint(door, 0x6a4022);
  const wins: BufferGeometry[] = [];
  for (const wx of [w * 0.18, w * 0.36]) {
    const g = prep(new BoxGeometry(0.42, 0.5, 0.05).translate(wx - w * 0.02, h * 0.55, d / 2 + 0.03));
    paint(g, 0xffffff);
    wins.push(g);
  }
  const side = prep(new BoxGeometry(0.05, 0.5, 0.42).translate(w / 2 + 0.03, h * 0.55, 0));
  paint(side, 0xffffff);
  wins.push(side);
  return { body: merge([walls, ...beams, roof, chim, door]), windows: merge(wins) };
}

// ---------- the set ----------

export type Props = {
  group: Group;
  /** Lights owned by props (fixed count: dock lantern, campfire). */
  lanternLight: PointLight;
  fireLight: PointLight;
  /** Seats around the campfire (world xz + facing). */
  campSeats: { x: number; z: number; facing: number }[];
  /** Rod-tip-free dock tip (for camera framing etc.). */
  update(tod: TodState, time: number, campfire: number): void;
  dispose(): void;
};

export function buildProps(quality: SceneQuality, swayMat: MeshLambertMaterial): Props {
  const full = quality === "full";
  const group = new Group();
  group.name = "props";
  const disposables: { dispose(): void }[] = [];
  const mat = paintedMaterial();
  const matDouble = paintedMaterial({ side: DoubleSide });
  disposables.push(mat, matDouble);
  const R = rng(1234);
  const add = (m: Mesh | InstancedMesh) => {
    group.add(m);
    disposables.push(m.geometry);
    return m;
  };

  // --- trees: the obstacles exactly, then forest on the hills ---
  const oaks: Inst[] = [];
  const pines: Inst[] = [];
  const tint = (a: number, b: number) => new Color(1, 1, 1).multiplyScalar(a + R() * (b - a));
  for (const o of OBSTACLES) {
    const y = heightAt(o.x, o.z) - 0.1;
    if (o.kind === "oak") oaks.push({ x: o.x, y, z: o.z, s: o.r / 1.15, ry: R() * 6, tint: tint(0.95, 1.05) });
    if (o.kind === "pine") pines.push({ x: o.x, y, z: o.z, s: o.r / 1.0, ry: R() * 6, tint: tint(0.95, 1.05) });
  }
  const forestN = full ? 340 : 170;
  for (let i = 0; i < forestN * 3 && oaks.length + pines.length < forestN; i++) {
    const th = R() * Math.PI * 2;
    const outer = outerRadius(th);
    const e = 1.5 + Math.pow(R(), 0.8) * 70;
    const r = outer + e;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (angleGap(th, SOUTH) < 0.75 && r < 75) continue; // keep the camera's view open
    if (Math.abs(x) < 4.5 && z < 0 && z > FALLS.topZ - 14) continue; // the falls and its stream
    if (Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 5) continue;
    if (Math.abs(x - 34) < 9 && Math.abs(z - 14) < 9) continue; // the cottages
    const dens = fbm(x * 0.04, z * 0.04, 3, 77);
    if (dens < 0.42 && R() < 0.7) continue;
    const y = heightAt(x, z) - 0.15;
    const s = 0.9 + R() * 0.6 + e * 0.008;
    if (R() < 0.55) pines.push({ x, y, z, s: s * 1.15, ry: R() * 6, tint: tint(0.85, 1.05) });
    else oaks.push({ x, y, z, s, ry: R() * 6, tint: tint(0.85, 1.08) });
  }
  add(instanced(oakGeometry(), mat, oaks, true)).name = "oaks";
  add(instanced(pineGeometry(), mat, pines, true)).name = "pines";

  // --- rocks: obstacles, shore stones, the falls, the fire ring ---
  const rocks: Inst[] = [];
  for (const o of OBSTACLES) if (o.kind === "rock") {
    const y = heightAt(o.x, o.z);
    rocks.push({ x: o.x, y: y + 0.1, z: o.z, s: o.r * 0.95, ry: R() * 6, sy: 1.1 });
    rocks.push({ x: o.x + o.r * 0.9, y, z: o.z + 0.3, s: o.r * 0.45, ry: R() * 6 });
  }
  for (let i = 0; i < 70; i++) {
    const th = R() * Math.PI * 2;
    if (angleGap(th, SOUTH) < 0.12) continue; // the dock
    const d = -0.8 + R() * 1.6;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    rocks.push({ x, y: heightAt(x, z) + 0.02, z, s: 0.18 + R() * 0.4, ry: R() * 6 });
  }
  // The falls: boulders flanking the brook and the cliff foot.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = FALLS.footZ - 2.5 + R() * (FALLS.footZ - FALLS.topZ + 8.5);
    const x = side * (FALLS.brookHalf + 0.9 + R() * 2.6);
    const big = z < FALLS.footZ + 0.5;
    rocks.push({ x, y: heightAt(x, z) - 0.1, z, s: big ? 1.0 + R() * 1.1 : 0.35 + R() * 0.5, ry: R() * 6, sy: big ? 1.3 : 1 });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = CAMPFIRE.x + Math.cos(a) * 0.72;
    const z = CAMPFIRE.z + Math.sin(a) * 0.72;
    rocks.push({ x, y: heightAt(x, z) + 0.02, z, s: 0.17 + R() * 0.05, ry: R() * 6, tint: new Color(0.85, 0.85, 0.85) });
  }
  add(instanced(rockGeometry(3), mat, rocks, true)).name = "rocks";

  // --- bushes ---
  const bushes: Inst[] = [];
  for (let i = 0; i < 200 && bushes.length < (full ? 70 : 35); i++) {
    const th = R() * Math.PI * 2;
    const outer = outerRadius(th);
    const r = outer - 1 + R() * 6;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (angleGap(th, SOUTH) < 0.5) continue;
    if (Math.abs(x) < 3 && z < 0) continue;
    bushes.push({ x, y: heightAt(x, z) - 0.05, z, s: 0.7 + R() * 0.7, ry: R() * 6, tint: tint(0.85, 1.1) });
  }
  for (const o of OBSTACLES) if (o.kind !== "rock") {
    const a = R() * 6;
    const x = o.x + Math.cos(a) * (o.r + 0.6);
    const z = o.z + Math.sin(a) * (o.r + 0.6);
    bushes.push({ x, y: heightAt(x, z) - 0.05, z, s: 0.55, ry: a });
  }
  add(instanced(bushGeometry(), mat, bushes, true)).name = "bushes";

  // --- grass, flowers, lupines (swaying) ---
  const tufts: Inst[] = [];
  const flowers: Inst[] = [];
  const lupines: Inst[] = [];
  const flowerCols = [0xffffff, 0xfff2a0, 0xffd23a, 0xc9a6ff, 0xff9ec4, 0x8ab8ff].map((h) => new Color(h));
  const lupineCols = [0x7a5ad8, 0x9a6ae8, 0xd070c0, 0x6a7ae0].map((h) => new Color(h));
  const tuftN = full ? 5200 : 1800;
  for (let i = 0; i < tuftN * 3 && tufts.length < tuftN; i++) {
    const th = R() * Math.PI * 2;
    const edge = lakeRadius(th);
    const d = 0.7 + Math.pow(R(), 1.3) * 34;
    const r = edge + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (Math.abs(x) <= DOCK.halfWidth + 0.3 && z > DOCK.tipZ && z < DOCK.rootZ + 0.5) continue;
    if (Math.abs(d - PATH_D) < 0.7 && R() < 0.85) continue;
    if (Math.abs(x) < 2 && z < -edge + 1 && z > FALLS.topZ) continue;
    const dens = fbm(x * 0.15, z * 0.15, 2, 5);
    if (dens < 0.38 && R() < 0.6) continue;
    tufts.push({ x, y: heightAt(x, z) - 0.03, z, s: 0.8 + R() * 0.9, ry: R() * 6, tint: tint(0.8, 1.15) });
  }
  const flowerN = full ? 1100 : 400;
  for (let i = 0; i < flowerN * 4 && flowers.length < flowerN; i++) {
    const th = R() * Math.PI * 2;
    const edge = lakeRadius(th);
    const d = 1.0 + Math.pow(R(), 1.2) * 26;
    const r = edge + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (Math.abs(d - PATH_D) < 0.8) continue;
    if (Math.abs(x) <= DOCK.halfWidth + 0.3 && z > DOCK.tipZ && z < DOCK.rootZ + 0.5) continue;
    const patch = vnoise(x * 0.18, z * 0.18, 31);
    if (patch < 0.55) continue;
    const col = flowerCols[Math.floor(vnoise(x * 0.07, z * 0.07, 8) * flowerCols.length * 0.999 + R() * 1.4) % flowerCols.length]!;
    flowers.push({ x, y: heightAt(x, z) - 0.02, z, s: 0.9 + R() * 0.7, ry: R() * 6, tint: col });
  }
  for (let i = 0; i < 600 && lupines.length < (full ? 190 : 80); i++) {
    const th = R() * Math.PI * 2;
    const outer = outerRadius(th);
    const r = outer - 3 + R() * 9;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (vnoise(x * 0.12, z * 0.12, 41) < 0.5) continue;
    if (Math.abs(x) < 2.5 && z < 0) continue;
    lupines.push({ x, y: heightAt(x, z) - 0.03, z, s: 0.9 + R() * 0.8, ry: R() * 6, tint: lupineCols[Math.floor(R() * lupineCols.length)]! });
  }
  // Lupine clusters round the obstacles and the camp.
  for (const o of [...OBSTACLES, { x: CAMPFIRE.x + 3, z: CAMPFIRE.z - 2, r: 1, kind: "rock" as const }]) {
    for (let k = 0; k < 6; k++) {
      const a = R() * 6.28;
      const x = o.x + Math.cos(a) * (o.r + 0.4 + R() * 1.2);
      const z = o.z + Math.sin(a) * (o.r + 0.4 + R() * 1.2);
      lupines.push({ x, y: heightAt(x, z) - 0.03, z, s: 0.9 + R() * 0.6, ry: R() * 6, tint: lupineCols[Math.floor(R() * lupineCols.length)]! });
    }
  }
  add(instanced(tuftGeometry(), swayMat, tufts, false)).name = "grass";
  add(instanced(flowerGeometry(), swayMat, flowers, false)).name = "flowers";
  add(instanced(lupineGeometry(), swayMat, lupines, false)).name = "lupines";

  // --- reeds (east) and cattails ---
  const reeds: Inst[] = [];
  const cattails: Inst[] = [];
  for (let i = 0; i < (full ? 260 : 130); i++) {
    const th = EAST + (R() - 0.5) * 1.5;
    const d = -1.5 + R() * 2.3;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const it = { x, y: heightAt(x, z), z, s: 0.75 + R() * 0.6, ry: R() * 6, tint: tint(0.85, 1.1) };
    if (R() < 0.35) cattails.push(it);
    else reeds.push(it);
  }
  // A few clumps round the rest of the shore (not in front of the dock).
  for (let i = 0; i < 70; i++) {
    const th = R() * Math.PI * 2;
    if (angleGap(th, SOUTH) < 0.4 || angleGap(th, NORTH) < 0.25) continue;
    const d = -0.6 + R() * 0.9;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    reeds.push({ x, y: heightAt(x, z), z, s: 0.55 + R() * 0.4, ry: R() * 6, tint: tint(0.85, 1.1) });
  }
  add(instanced(reedGeometry(false), swayMat, reeds, true)).name = "reeds";
  add(instanced(reedGeometry(true), swayMat, cattails, true)).name = "cattails";

  // --- lily pads + water lilies (west) ---
  const pads: Inst[] = [];
  const lilies: Inst[] = [];
  for (let i = 0; i < 400 && pads.length < (full ? 95 : 55); i++) {
    const th = WEST + (R() - 0.5) * 1.4;
    const d = -0.5 - Math.pow(R(), 0.8) * 6.5;
    const r = lakeRadius(th) + d;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (vnoise(x * 0.35, z * 0.35, 12) < 0.35) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < 0.75 * Math.max(p.s, 1))) continue;
    const s = 0.65 + R() * 0.75;
    pads.push({ x, y: 0.025, z, s, ry: R() * 6, tint: tint(0.85, 1.1) });
    if (R() < 0.3) lilies.push({ x: x + 0.1, y: 0.03, z: z - 0.05, s: 0.9 + R() * 0.6, ry: R() * 6 });
  }
  // A few pads elsewhere along calm edges.
  for (let i = 0; i < 24; i++) {
    const th = R() * Math.PI * 2;
    if (angleGap(th, SOUTH) < 0.45 || angleGap(th, NORTH) < 0.4) continue;
    const r = lakeRadius(th) - 0.6 - R() * 1.6;
    pads.push({ x: Math.cos(th) * r, y: 0.025, z: Math.sin(th) * r, s: 0.55 + R() * 0.4, ry: R() * 6 });
  }
  add(instanced(padGeometry(), matDouble, pads, false)).name = "pads";
  add(instanced(lilyGeometry(), mat, lilies, false)).name = "lilies";

  // --- the dock ---
  const deckY = 0.42;
  const dockParts: BufferGeometry[] = [];
  const plankCols = [0xa0714a, 0x8f6440, 0xb07e52, 0x9a6c46];
  for (let z = DOCK.tipZ; z < DOCK.rootZ + 0.1; z += 0.44) {
    const g = new BoxGeometry(DOCK.halfWidth * 2 + 0.2, 0.12, 0.4);
    g.rotateY((R() - 0.5) * 0.03);
    g.translate((R() - 0.5) * 0.08, deckY - 0.06 + (R() - 0.5) * 0.02, z + 0.2);
    const p = prep(g);
    paint(p, plankCols[Math.floor(R() * plankCols.length)]!, 0xffffff, (pp, n, c) => {
      c.multiplyScalar(0.92 + 0.12 * vnoise(pp.x * 8, pp.z * 2, 3));
      if (n.y < 0.5) c.multiplyScalar(0.65);
    });
    dockParts.push(p);
  }
  for (const sx of [-0.85, 0.85]) {
    const g = prep(new BoxGeometry(0.2, 0.22, DOCK.rootZ - DOCK.tipZ + 0.5).translate(sx, deckY - 0.22, (DOCK.rootZ + DOCK.tipZ) / 2));
    paint(g, 0x5a3e28);
    dockParts.push(g);
  }
  const posts: [number, number][] = [];
  for (let z = DOCK.tipZ + 0.15; z < DOCK.rootZ; z += 2.1) for (const sx of [-1, 1]) posts.push([sx * (DOCK.halfWidth + 0.08), z]);
  for (const [px, pz] of posts) {
    const g = prep(new CylinderGeometry(0.15, 0.17, 2.4, 8).translate(px, deckY + 0.55 - 1.2, pz));
    paint(g, 0x4a3220, 0x7a5636);
    dockParts.push(g);
    const cap = prep(new CylinderGeometry(0.16, 0.15, 0.06, 8).translate(px, deckY + 0.58, pz));
    paint(cap, 0x8a6642);
    dockParts.push(cap);
    const rope = prep(new TorusGeometry(0.17, 0.035, 5, 12).rotateX(Math.PI / 2).translate(px, deckY + 0.42, pz));
    paint(rope, 0xd8b878);
    dockParts.push(rope);
  }
  // Ropes sagging between posts along each side.
  for (const sx of [-1, 1]) {
    const side = posts.filter(([px]) => Math.sign(px) === sx);
    for (let i = 0; i < side.length - 1; i++) {
      const [ax, az] = side[i]!;
      const [, bz] = side[i + 1]!;
      const curve = new CatmullRomCurve3([
        new Vector3(ax, deckY + 0.42, az),
        new Vector3(ax, deckY + 0.22, (az + bz) / 2),
        new Vector3(ax, deckY + 0.42, bz),
      ]);
      const t = prep(new TubeGeometry(curve, 10, 0.03, 4, false));
      paint(t, 0xd2b070);
      dockParts.push(t);
    }
  }
  // Lantern post at the tip.
  const lx = DOCK.halfWidth + 0.08;
  const lz = DOCK.tipZ + 0.15;
  const lpost = prep(new CylinderGeometry(0.09, 0.11, 1.5, 7).translate(lx, deckY + 1.2, lz));
  paint(lpost, 0x4a3220);
  const arm = prep(new BoxGeometry(0.6, 0.07, 0.07).translate(lx - 0.28, deckY + 1.9, lz));
  paint(arm, 0x4a3220);
  const lanternFrame = prep(new BoxGeometry(0.3, 0.36, 0.3).translate(lx - 0.5, deckY + 1.62, lz));
  paint(lanternFrame, 0x2a2420);
  const lanternTop = prep(new ConeGeometry(0.24, 0.18, 4).rotateY(Math.PI / 4).translate(lx - 0.5, deckY + 1.89, lz));
  paint(lanternTop, 0x2a2420);
  dockParts.push(lpost, arm, lanternFrame, lanternTop);
  // Crates and a bucket on the deck.
  const crate = prep(new BoxGeometry(0.55, 0.45, 0.55).translate(-0.6, deckY + 0.22, DOCK.rootZ - 1.6));
  paint(crate, 0x8a5a32, 0xb07a48);
  const bucket = prep(new CylinderGeometry(0.2, 0.16, 0.3, 10).translate(-0.75, deckY + 0.15, DOCK.rootZ - 2.5));
  paint(bucket, 0x8a96a0, 0xb8c4cc);
  dockParts.push(crate, bucket);
  const dock = add(new Mesh(merge(dockParts), mat));
  dock.name = "dock";
  dock.castShadow = true;
  dock.receiveShadow = true;
  const glassMat = new MeshBasicMaterial({ color: 0xffd48a });
  disposables.push(glassMat);
  const glass = add(new Mesh(new BoxGeometry(0.22, 0.28, 0.22), glassMat));
  glass.position.set(lx - 0.5, deckY + 1.62, lz);
  const lanternLight = new PointLight(0xffb560, 0, 14, 1.6);
  lanternLight.position.set(lx - 0.5, deckY + 1.5, lz);
  group.add(lanternLight);

  // --- rowboat moored on the east side ---
  const boatParts: BufferGeometry[] = [];
  const hull = prep(new SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.75, 0.42, 1.85));
  paint(hull, 0x2f6f84, 0x3f93a4, (_p, n, c) => {
    if (n.y > 0.2) c.setHex(0xa77a4c);
  });
  const rim = prep(new TorusGeometry(1, 0.06, 5, 24).rotateX(Math.PI / 2).scale(0.75, 1, 1.85));
  paint(rim, 0xe8dcc0);
  const bench1 = prep(new BoxGeometry(1.35, 0.06, 0.28).translate(0, -0.08, 0.45));
  const bench2 = prep(new BoxGeometry(1.2, 0.06, 0.28).translate(0, -0.08, -0.65));
  paint(bench1, 0x9a6a40);
  paint(bench2, 0x9a6a40);
  const oar = prep(new CylinderGeometry(0.03, 0.03, 2.0, 5).rotateZ(1.35).rotateY(0.25).translate(0.2, 0.0, 0.0));
  paint(oar, 0xc49a62);
  boatParts.push(hull, rim, bench1, bench2, oar);
  const boatInner = merge(boatParts);
  const boat = add(new Mesh(boatInner, matDouble));
  boat.name = "boat";
  boat.position.set(DOCK.halfWidth + 1.35, 0.12, (DOCK.rootZ + DOCK.tipZ) / 2 - 0.5);
  boat.rotation.y = 0.08;
  boat.castShadow = true;

  // --- cottages on the east-south-east hill + two behind the falls ---
  const winParts: BufferGeometry[] = [];
  const bodyParts: BufferGeometry[] = [];
  const spots: [number, number, number][] = [
    [34, 9, 0], [38, 15, 1], [31, 18, 2], [41, 6, 3], [36, 22, 4], [-9, -35, 5], [11, -37, 6], [-30, -22, 7],
  ];
  for (const [x, z, s] of spots) {
    const { body, windows } = cottageGeometry(s + 10);
    const face = Math.atan2(-x, -z); // front (+z local) toward the lake
    const y = heightAt(x, z) - 0.1;
    for (const g of [body, windows]) {
      g.rotateY(face);
      g.translate(x, y, z);
    }
    bodyParts.push(body);
    winParts.push(windows);
  }
  const village = add(new Mesh(merge(bodyParts), mat));
  village.name = "village";
  village.castShadow = true;
  village.receiveShadow = true;
  const windowMat = new MeshBasicMaterial({ vertexColors: true, color: 0x6a7a8a });
  disposables.push(windowMat);
  add(new Mesh(merge(winParts), windowMat)).name = "windows";

  // --- campfire: logs to sit on, fire, string lights ---
  const campParts: BufferGeometry[] = [];
  const campSeats: { x: number; z: number; facing: number }[] = [];
  const seatAngles = [-2.2, -1.0, 0.6, 1.9];
  seatAngles.forEach((a, i) => {
    const sx = CAMPFIRE.x + Math.cos(a) * 2.3;
    const sz = CAMPFIRE.z + Math.sin(a) * 2.3;
    campSeats.push({ x: sx, z: sz, facing: Math.atan2(CAMPFIRE.z - sz, CAMPFIRE.x - sx) });
    if (i % 2 === 0) {
      const lx2 = CAMPFIRE.x + Math.cos(a + 0.55) * 2.5;
      const lz2 = CAMPFIRE.z + Math.sin(a + 0.55) * 2.5;
      const log = prep(new CylinderGeometry(0.22, 0.24, 1.6, 9).rotateZ(Math.PI / 2).rotateY(-(a + 0.55) + Math.PI / 2).translate(lx2, heightAt(lx2, lz2) + 0.18, lz2));
      paint(log, 0x6a4628, 0x8a6038);
      campParts.push(log);
    }
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const g = prep(new CylinderGeometry(0.07, 0.09, 0.9, 6).rotateZ(1.1).rotateY(a).translate(CAMPFIRE.x, heightAt(CAMPFIRE.x, CAMPFIRE.z) + 0.22, CAMPFIRE.z));
    paint(g, 0x3a2416, 0x6a4628);
    campParts.push(g);
  }
  // String-light poles.
  const poleA = new Vector3(CAMPFIRE.x - 3.4, 0, CAMPFIRE.z - 1.6);
  const poleB = new Vector3(CAMPFIRE.x + 3.4, 0, CAMPFIRE.z - 1.2);
  for (const p of [poleA, poleB]) {
    p.y = heightAt(p.x, p.z);
    const g = prep(new CylinderGeometry(0.07, 0.09, 3.0, 6).translate(p.x, p.y + 1.5, p.z));
    paint(g, 0x5a3e28);
    campParts.push(g);
  }
  add(new Mesh(merge(campParts), mat)).castShadow = true;
  const bulbN = 15;
  const bulbGeo = new SphereGeometry(0.075, 8, 6);
  const bulbMat = new MeshBasicMaterial({ color: 0xffffff });
  disposables.push(bulbMat);
  const bulbs = new InstancedMesh(bulbGeo, bulbMat, bulbN);
  const bulbCols = [0xffd27a, 0xff9a6a, 0xfff0a0, 0x9ad8ff, 0xffa8d0].map((h) => new Color(h));
  for (let i = 0; i < bulbN; i++) {
    const t = (i + 0.5) / bulbN;
    dummy.position.set(
      poleA.x + (poleB.x - poleA.x) * t,
      poleA.y + 2.9 + (poleB.y - poleA.y) * t - Math.sin(t * Math.PI) * 0.7,
      poleA.z + (poleB.z - poleA.z) * t,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    bulbs.setColorAt(i, bulbCols[i % bulbCols.length]!);
  }
  add(bulbs).name = "bulbs";
  const wire = new CatmullRomCurve3(
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return new Vector3(poleA.x + (poleB.x - poleA.x) * t, poleA.y + 2.95 + (poleB.y - poleA.y) * t - Math.sin(t * Math.PI) * 0.7, poleA.z + (poleB.z - poleA.z) * t);
    }),
  );
  const wireGeo = prep(new TubeGeometry(wire, 24, 0.015, 3, false));
  paint(wireGeo, 0x2a2a2a);
  add(new Mesh(wireGeo, mat));

  // Flames: three additive cones flickering.
  const flameMat = new MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
  const flameCore = new MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
  disposables.push(flameMat, flameCore);
  const flames: Mesh[] = [];
  const fy = heightAt(CAMPFIRE.x, CAMPFIRE.z) + 0.2;
  for (let i = 0; i < 4; i++) {
    const g = new ConeGeometry(i === 3 ? 0.16 : 0.26, i === 3 ? 0.6 : 0.95, 7);
    g.translate(0, (i === 3 ? 0.6 : 0.95) / 2, 0);
    const f = add(new Mesh(g, i === 3 ? flameCore : flameMat));
    const a = (i / 3) * Math.PI * 2;
    f.position.set(CAMPFIRE.x + (i === 3 ? 0 : Math.cos(a) * 0.12), fy, CAMPFIRE.z + (i === 3 ? 0 : Math.sin(a) * 0.12));
    f.renderOrder = 5;
    flames.push(f);
  }
  const fireLight = new PointLight(0xff9040, 0, 12, 1.5);
  fireLight.position.set(CAMPFIRE.x, fy + 0.8, CAMPFIRE.z);
  group.add(fireLight);

  // A fallen log at the east shore.
  const fl = prep(new CylinderGeometry(0.3, 0.35, 3.2, 10).rotateZ(Math.PI / 2).rotateY(0.9));
  paint(fl, 0x5a3c24, 0x7a5434, (_p, n, c) => {
    if (n.y > 0.6) c.lerp(new Color(0x6f9a3c), 0.7);
  });
  const fallen = add(new Mesh(fl, mat));
  const fth = EAST + 0.42;
  const fr = lakeRadius(fth) + 0.1;
  fallen.position.set(Math.cos(fth) * fr, 0.08, Math.sin(fth) * fr);
  fallen.castShadow = true;

  const winCol = windowMat.color;
  const day = new Color(0x5a6a78);
  const night = new Color(2.4, 1.5, 0.7);
  return {
    group,
    lanternLight,
    fireLight,
    campSeats,
    update(tod, time, campfire) {
      winCol.copy(day).lerp(night, tod.glow);
      const g = tod.glow;
      glassMat.color.setRGB(1 + 2.2 * g, 0.85 + 1.3 * g, 0.55 + 0.4 * g);
      lanternLight.intensity = 0.2 + 5 * g;
      bulbMat.color.setScalar(0.75 + 1.9 * Math.max(g, campfire));
      const fire = 0.55 + 0.45 * Math.max(g, campfire);
      const fl1 = 0.85 + 0.15 * Math.sin(time * 13.0) * Math.sin(time * 7.3 + 1.0);
      fireLight.intensity = (2 + 10 * Math.max(g, campfire)) * fl1;
      flames.forEach((f, i) => {
        const k = 0.75 + 0.25 * Math.sin(time * (9 + i * 2.3) + i * 1.7);
        f.scale.set(fire * (0.9 + 0.1 * k), fire * k * (1 + 0.3 * campfire), fire * (0.9 + 0.1 * k));
        f.rotation.y = time * (0.7 + i * 0.2);
      });
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
