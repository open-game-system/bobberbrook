import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Material,
} from "three";
import { rng, vnoise } from "./noise";
import { jitter, merge, paint, prep, puffNormals } from "./geo";
import { attachFoliage, foliageOf, hangingCards, leafCards, type Puff, type Strand } from "./foliage";

/** The shared set-dressing kit: trees, rocks, plants and buildings every place draws from. */

export type Inst = { x: number; y: number; z: number; s: number; ry: number; tint?: Color; sy?: number; tilt?: number };

const m4 = new Matrix4();
export const dummy = new Object3D();

export function instanced(geo: BufferGeometry, mat: Material, list: Inst[], shadows: boolean): InstancedMesh {
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
  // Leaf cards ride along as a child sharing the same instances.
  const f = foliageOf(geo);
  if (f) {
    const leaf = new InstancedMesh(f.cards, f.mat, Math.max(1, list.length));
    leaf.instanceMatrix = mesh.instanceMatrix;
    leaf.instanceColor = mesh.instanceColor;
    leaf.count = mesh.count;
    leaf.castShadow = false;
    // No shadow-map lookups on the cards (they overlap a lot; the crown's own shading carries it).
    leaf.receiveShadow = false;
    leaf.name = "leaves";
    // After the opaque set (cores, trunks, ground): alpha-tested cards behind them never get shaded.
    leaf.renderOrder = 1;
    leaf.computeBoundingSphere();
    mesh.add(leaf);
    mesh.addEventListener("dispose", () => leaf.dispose());
  }
  return mesh;
}

// ---------- kits ----------

export function blob(r: number, x: number, y: number, z: number, seed: number, w = 10, h = 8): BufferGeometry {
  const g = new SphereGeometry(r, w, h);
  jitter(g, 0.16, seed);
  g.computeVertexNormals();
  g.translate(x, y, z);
  return prep(g);
}

/** Canopy colours: bottom, top, sunlit tips. 0 violet, 1 teal, 2 rose. */
export const CANOPY: [number, number, number][] = [
  [0x2a1f5c, 0x8a62d0, 0xc8a4ff],
  [0x123c4c, 0x3a9a9a, 0x8ae0d0],
  [0x3a1f5a, 0xb86ac0, 0xffb4e8],
];

export function oakGeometry(variant = 0): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.3, 0.5, 3.0, 9).translate(0, 1.5, 0));
  paint(trunk, 0x3a2c3a, 0x6a5460);
  const roots = prep(new ConeGeometry(0.85, 0.7, 9).translate(0, 0.25, 0));
  paint(roots, 0x302430, 0x4a3a46);
  const blobs: [number, number, number, number][] = [
    [0, 3.9, 0, 1.8], [1.35, 3.4, 0.35, 1.3], [-1.25, 3.5, -0.2, 1.35], [0.25, 3.4, 1.25, 1.25],
    [-0.35, 3.5, -1.2, 1.3], [0.55, 4.8, -0.25, 1.35], [-0.65, 4.6, 0.55, 1.2], [0.9, 4.3, 0.9, 1.0],
  ];
  // A dark leafy core (the silhouette and the shadow) under clumps of painted leaf cards.
  const canopy = merge(blobs.map(([x, y, z, r], i) => blob(r * 0.86, x, y, z, i * 1.7)));
  puffNormals(canopy, 0, 4.0, 0, 0.8);
  paint(canopy, CANOPY[variant]![0]!, CANOPY[variant]![1]!, (p, n, c) => {
    const k = vnoise(p.x * 2.2 + 10, p.z * 2.2 + p.y, 4);
    c.multiplyScalar((0.86 + 0.28 * k) * 0.62);
    if (n.y > 0.55) c.lerp(new Color(CANOPY[variant]![2]!).multiplyScalar(0.6), (n.y - 0.55) * 0.5);
  });
  const cards = leafCards(blobs.map(([x, y, z, r]): Puff => [x, y, z, r]), {
    cx: 0, cy: 4.0, cz: 0, size: 1.15, density: 2.2, inner: CANOPY[variant]![0]!, outer: CANOPY[variant]![1]!, top: CANOPY[variant]![2]!, seed: 11 + variant,
  });
  return attachFoliage(merge([trunk, roots, canopy]), cards, "violet");
}

/** A colossal ancient tree: flared roots, a leaning trunk, a mushroom-like canopy, hanging leaf strands. */
export function giantGeometry(variant: number): BufferGeometry {
  const r = rng(77 + variant);
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(1.6, 2.7, 16, 14, 5);
  jitter(trunk, 0.12, variant + 2);
  trunk.computeVertexNormals();
  trunk.translate(0, 8, 0);
  const tp = prep(trunk);
  paint(tp, 0x2a2030, 0x5a4658, (p, _n, c) => c.multiplyScalar(0.85 + 0.3 * vnoise(p.x * 1.5, p.y * 0.3, 5)));
  parts.push(tp);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.4;
    const root = new CylinderGeometry(1.15, 0.3, 6.5, 7);
    root.translate(0, -3.25, 0);
    root.rotateZ(1.0 + r() * 0.2);
    root.rotateY(a);
    root.translate(0, 3.4, 0);
    const rp = prep(root);
    paint(rp, 0x261c2a, 0x4a3a4a);
    parts.push(rp);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const br = new CylinderGeometry(0.35, 0.8, 9, 7);
    br.translate(0, 4.5, 0);
    br.rotateZ(0.75 + r() * 0.25);
    br.rotateY(a);
    br.translate(0, 10 + r() * 3, 0);
    const bp = prep(br);
    paint(bp, 0x2e2434, 0x52404e);
    parts.push(bp);
  }
  const [c0, c1, c2] = CANOPY[variant]!;
  const blobs: BufferGeometry[] = [];
  const puffs: Puff[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = i === 0 ? 0 : 5 + r() * 3;
    const rad = i === 0 ? 8.5 : 5.2 + r() * 2.2;
    const g = new SphereGeometry(rad * 0.88, 14, 9);
    g.scale(1, 0.48, 1);
    jitter(g, 0.12, i * 1.3 + variant);
    g.computeVertexNormals();
    const px = Math.cos(a) * rr;
    const py = 18 + (i === 0 ? 2.5 : r() * 2.5 - (rr > 0 ? 1.5 : 0));
    const pz = Math.sin(a) * rr;
    g.translate(px, py, pz);
    blobs.push(prep(g));
    puffs.push([px, py, pz, rad, 0.48]);
  }
  const canopy = merge(blobs);
  puffNormals(canopy, 0, 17, 0, 0.7);
  paint(canopy, c0, c1, (p, n, c) => {
    c.multiplyScalar((0.85 + 0.3 * vnoise(p.x * 0.5, p.z * 0.5 + p.y, 6)) * 0.62);
    if (n.y > 0.5) c.lerp(new Color(c2).multiplyScalar(0.6), (n.y - 0.5) * 0.6);
  });
  parts.push(canopy);
  const cards = leafCards(puffs, { cx: 0, cy: 18, cz: 0, size: 2.6, density: 2.0, inner: c0, outer: c1, top: c2, seed: 401 + variant });
  // Hanging leaf strands (wisteria-like) under the rim.
  const strands: Strand[] = [];
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const rr = 4 + r() * 7;
    const len = 1.6 + r() * 2.0;
    const w = 1.0 + r() * 0.5;
    r();
    strands.push({ x: Math.cos(a) * rr, y: 16.9 - rr * 0.08, z: Math.sin(a) * rr, len, w, ox: Math.cos(a), oz: Math.sin(a) });
  }
  return attachFoliage(merge(parts), merge([cards, hangingCards(strands, 0x5a3a8a, 0xd8b8ff, 900 + variant)]), "violet");
}

export function mushroomGeometry(): BufferGeometry {
  const stem = prep(new CylinderGeometry(0.05, 0.07, 0.3, 6).translate(0, 0.15, 0));
  paint(stem, 0x9ab8d0, 0xe0f0ff);
  const cap = prep(new SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.27, 0));
  paint(cap, 0xffffff, 0xd8ecff);
  const small = prep(new SphereGeometry(0.09, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.16, 0.12, 0.05));
  const sstem = prep(new CylinderGeometry(0.03, 0.04, 0.13, 5).translate(0.16, 0.06, 0.05));
  paint(small, 0xffffff);
  paint(sstem, 0xc0d8f0);
  return merge([stem, cap, small, sstem]);
}

/** A fern: arching fronds from a centre (sways with the grass). */
export function fernGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i * 0.3;
    const len = 0.55 + ((i * 5) % 3) * 0.12;
    const g = new SphereGeometry(1, 6, 4);
    g.scale(0.09, 0.02, len / 2);
    g.translate(0, 0, len / 2);
    g.rotateX(-0.75);
    g.rotateY(a);
    g.translate(0, 0.05, 0);
    const p = prep(g);
    paint(p, 0x245a4a, 0x6ab88a);
    parts.push(p);
  }
  const m = merge(parts);
  // Normals up so fronds light like the ground.
  const nor = m.getAttribute("normal");
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  return m;
}

/** A glowing bellflower stalk: little hanging bells (lit by the instance colour). */
export function bellGeometry(): BufferGeometry {
  const stem = prep(new CylinderGeometry(0.012, 0.016, 0.5, 4).translate(0, 0.25, 0));
  paint(stem, 0x2a4a5a);
  const parts: BufferGeometry[] = [stem];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    const b = prep(new ConeGeometry(0.06, 0.09, 7, 1, true).translate(Math.cos(a) * 0.06, 0.36 + i * 0.07, Math.sin(a) * 0.06));
    paint(b, 0xffffff, 0xe0f0ff);
    parts.push(b);
  }
  return merge(parts);
}

export function pineGeometry(): BufferGeometry {
  const trunk = prep(new CylinderGeometry(0.16, 0.3, 1.6, 7).translate(0, 0.8, 0));
  paint(trunk, 0x3a2c38, 0x5a4652);
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
    paint(p, 0x102e40, 0x2f6e78, (pp, _n, c) => c.multiplyScalar(0.9 + 0.2 * vnoise(pp.x * 3, pp.z * 3 + pp.y, 9)));
    return p;
  });
  return merge([trunk, ...cones]);
}

export function rockGeometry(seed: number): BufferGeometry {
  const g = new SphereGeometry(1, 11, 8);
  g.scale(1, 0.68, 0.88);
  jitter(g, 0.32, seed);
  g.computeVertexNormals();
  const p = prep(g);
  paint(p, 0x5a5468, 0x9a94ac, (pp, n, c) => {
    c.multiplyScalar(0.88 + 0.22 * vnoise(pp.x * 3 + seed, pp.z * 3, 2));
    if (n.y > 0.55) c.lerp(new Color(0x3e8a6c), Math.min(1, (n.y - 0.55) * 2.2) * 0.8);
  });
  return p;
}

/** Faceted cliff stone: flat-shaded planes, dark violet-grey with strata and mossy tops. */
export function cliffRockGeometry(seed: number): BufferGeometry {
  const g = new SphereGeometry(1, 7, 5);
  g.scale(1, 0.95, 0.8);
  jitter(g, 0.4, seed);
  const p = prep(g);
  p.computeVertexNormals();
  paint(p, 0x3e3a54, 0x7a7494, (pp, n, c) => {
    c.multiplyScalar(0.82 + 0.18 * Math.abs(Math.sin(pp.y * 5.5 + pp.x * 0.8)));
    if (n.y > 0.6) c.lerp(new Color(0x3e8a6a), Math.min(1, (n.y - 0.6) * 2.5) * 0.85);
  });
  return p;
}

export function bushGeometry(): BufferGeometry {
  const puffs: Puff[] = [[0, 0.55, 0, 0.75], [0.6, 0.45, 0.2, 0.6], [-0.55, 0.42, -0.1, 0.55], [0.1, 0.9, -0.35, 0.5]];
  const g = merge(puffs.map(([x, y, z, r], i) => blob(r * 0.82, x, y, z, i + 1, 9, 7)));
  puffNormals(g, 0, 0.5, 0, 0.8);
  paint(g, 0x1a3a50, 0x4a8a8a, (p, _n, c) => c.multiplyScalar((0.88 + 0.24 * vnoise(p.x * 3, p.z * 3, 7)) * 0.62));
  const cards = leafCards(puffs, { cx: 0, cy: 0.5, cz: 0, size: 0.75, density: 2.4, inner: 0x1a3a50, outer: 0x4a8a8a, top: 0x8ad0c0, seed: 77 });
  return attachFoliage(g, cards, "fern");
}

export function tuftGeometry(): BufferGeometry {
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
  paint(g, 0x24504c, 0x86c4b0);
  return g;
}

export function flowerGeometry(): BufferGeometry {
  const stem = prep(new CylinderGeometry(0.012, 0.016, 0.32, 4).translate(0, 0.16, 0));
  paint(stem, 0x3f7a2a);
  const head = prep(new SphereGeometry(0.075, 7, 5).scale(1, 0.55, 1).translate(0, 0.33, 0));
  paint(head, 0xffffff);
  const eye = prep(new SphereGeometry(0.032, 6, 4).translate(0, 0.36, 0));
  paint(eye, 0xffd23a);
  // Head + eye are white/yellow; the instance tint colours the petals (and slightly the eye).
  return merge([stem, head, eye]);
}

export function lupineGeometry(): BufferGeometry {
  const stem = prep(new CylinderGeometry(0.015, 0.02, 0.5, 4).translate(0, 0.25, 0));
  paint(stem, 0x3f7a2a);
  const spike = prep(new ConeGeometry(0.09, 0.5, 7, 3).translate(0, 0.68, 0));
  jitter(spike, 0.2, 2);
  paint(spike, 0xffffff, 0xf0f0ff);
  const leaves = prep(new ConeGeometry(0.16, 0.12, 6).translate(0, 0.06, 0));
  paint(leaves, 0x4a8a34);
  return merge([stem, spike, leaves]);
}

export function reedGeometry(cattail: boolean): BufferGeometry {
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
    paint(p, 0x24584a, 0x7ab49a);
    parts.push(p);
  }
  if (cattail) {
    for (let i = 0; i < 2; i++) {
      const x = i * 0.12 - 0.05;
      const stalk = prep(new CylinderGeometry(0.014, 0.018, 1.5, 4).translate(x, 0.75, i * 0.05));
      paint(stalk, 0x2e6a52);
      const head = prep(new CylinderGeometry(0.065, 0.065, 0.3, 7).translate(x, 1.5 + i * 0.12, i * 0.05));
      paint(head, 0x4a3448, 0x6a4a5e);
      parts.push(stalk, head);
    }
  }
  return merge(parts);
}

export function padGeometry(): BufferGeometry {
  const g = new CircleGeometry(0.55, 16, 0.25, Math.PI * 2 - 0.5);
  g.rotateX(-Math.PI / 2);
  const p = prep(g);
  paint(p, 0x3f8a34, 0x3f8a34, (pp, _n, c) => {
    const r = Math.hypot(pp.x, pp.z);
    c.setHex(0x3a8030).lerp(new Color(0x7cbf4a), r / 0.55);
  });
  return p;
}

export function lilyGeometry(): BufferGeometry {
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
export function roofGeometry(w: number, d: number, h: number): BufferGeometry {
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

/** A round night-elf cottage: cream walls with dark beams, a swept concave purple roof with an upturned eave. */
export function cottageGeometry(seed: number): { body: BufferGeometry; windows: BufferGeometry } {
  const r = rng(seed);
  const R = 1.5 + r() * 0.4;
  const h = 1.9 + r() * 0.5;
  const walls = prep(new CylinderGeometry(R * 0.96, R, h, 14).translate(0, h / 2, 0));
  paint(walls, 0xcab8a4, 0xf0e2cc, (p, _n, c) => c.multiplyScalar(0.9 + 0.1 * vnoise(p.x * 3, p.y * 3, 2)));
  const beams: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const g = prep(new BoxGeometry(0.14, h, 0.1).translate(0, h / 2, R + 0.02).rotateY(a));
    paint(g, 0x4a3226, 0x6a4632);
    beams.push(g);
  }
  const band = prep(new TorusGeometry(R * 0.99, 0.07, 5, 18).rotateX(Math.PI / 2).translate(0, h * 0.98, 0));
  paint(band, 0x4a3226);
  const base = prep(new CylinderGeometry(R + 0.12, R + 0.2, 0.3, 14).translate(0, 0.15, 0));
  paint(base, 0x6a6280, 0x8a84a0);
  // Swept roof: concave profile from a flared, upturned eave to a tall point.
  const roofH = 2.8 + r() * 0.8;
  const eave = R + 0.95;
  const prof: Vector2[] = [new Vector2(eave + 0.15, 0.32), new Vector2(eave, 0.0)];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    prof.push(new Vector2(Math.max(0.02, eave * Math.pow(1 - t, 2.1)), roofH * t));
  }
  const roofG = new LatheGeometry(prof.reverse(), 16);
  const roof = prep(roofG.translate(0, h - 0.05, 0));
  const roofCols = [0x5a3ea8, 0x6a48b8, 0x4e3a9a, 0x7650c0];
  const rc = roofCols[Math.floor(r() * roofCols.length)]!;
  paint(roof, rc, 0xa88ae8, (p, _n, c) => c.multiplyScalar(0.82 + 0.16 * Math.abs(Math.sin((p.y - h) * 7.5))));
  const tip = prep(new ConeGeometry(0.08, 0.7, 6).translate(0, h + roofH + 0.25, 0));
  paint(tip, 0xd8c070);
  // Door: an arched dark-wood door with a lamp-lit frame.
  const door = prep(new BoxGeometry(0.62, 0.95, 0.12).translate(0, 0.62, R - 0.02));
  const arch = prep(new CylinderGeometry(0.31, 0.31, 0.12, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 1.09, R - 0.02));
  paint(door, 0x4a2c4a, 0x6a3c5a);
  paint(arch, 0x6a3c5a);
  const wins: BufferGeometry[] = [];
  for (const a of [-0.75, 0.75, 2.2, -2.2]) {
    const g = prep(new CylinderGeometry(0.22, 0.22, 0.08, 12).rotateX(Math.PI / 2).scale(1, 1.35, 1).translate(0, h * 0.58, R + 0.01).rotateY(a));
    paint(g, 0xffffff);
    wins.push(g);
  }
  // A small round attic window high in the roof.
  wins.push(paint(prep(new CylinderGeometry(0.16, 0.16, 0.08, 10).rotateX(Math.PI / 2).translate(0, h + 0.75, eave * 0.62)), 0xffffff));
  return { body: merge([walls, ...beams, band, base, roof, tip, door, arch]), windows: merge(wins) };
}

