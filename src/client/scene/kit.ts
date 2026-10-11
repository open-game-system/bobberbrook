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
  Vector3,
  type Material,
} from "three";
import { rng, vnoise } from "./noise";
import { jitter, merge, paint, prep, puffNormals, surf } from "./geo";
import { PK } from "./painter";
import { attachFoliage, coniferCards, foliageOf, leafCards, splitRim, wisteriaCards, type Puff, type Strand, type Tier } from "./foliage";
import { barked, markRock, surfaceMaterial } from "./surfaces";
import { rim } from "./matte";

/** The shared set-dressing kit: trees, rocks, plants and buildings every place draws from. */

export type Inst = { x: number; y: number; z: number; s: number; ry: number; tint?: Color; sy?: number; tilt?: number };

const m4 = new Matrix4();
export const dummy = new Object3D();

export function instanced(geo: BufferGeometry, mat: Material, list: Inst[], shadows: boolean): InstancedMesh {
  const mesh = new InstancedMesh(geo, surfaceMaterial(geo, mat), Math.max(1, list.length));
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
  for (const [fi, f] of foliageOf(geo).entries()) {
    const leaf = new InstancedMesh(f.cards, f.mat, Math.max(1, list.length));
    leaf.instanceMatrix = mesh.instanceMatrix;
    leaf.instanceColor = mesh.instanceColor;
    leaf.count = mesh.count;
    leaf.castShadow = false;
    // No shadow-map lookups on the cards (they overlap a lot; the crown's own shading carries it).
    leaf.receiveShadow = false;
    leaf.name = "leaves";
    // After the opaque set (cores, trunks, ground): alpha-tested cards behind them never get shaded.
    leaf.renderOrder = fi === 0 ? 2 : 1;
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

/** Share of a canopy's leaf cards on its rim that take the glow sheet (round 12). */
export const RIM_SHARE = 0.22;

/** Wisteria strand shading (round 12): under the canopy, and at the tips. */
export const WISTERIA_TOP = 0x8a7aa8;
export const WISTERIA_TIP = 0xf4ecff;

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
  const [body, rimCards] = splitRim(cards, 0, 4.0, 0, RIM_SHARE);
  return attachFoliage(barked([trunk, roots], [canopy]), body, variant === 1 ? "teal" : "violet", [rimCards, "glow"]);
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
  // Round 16: each bough is dressed in leaf cards along its length (bare, they read as flat dark planks
  // fanned under the crown at TV distance).
  const boughPuffs: Puff[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const tilt = 0.75 + r() * 0.25;
    const lift = 10 + r() * 3;
    const br = new CylinderGeometry(0.35, 0.8, 9, 7);
    br.translate(0, 4.5, 0);
    br.rotateZ(tilt);
    br.rotateY(a);
    br.translate(0, lift, 0);
    const bp = prep(br);
    paint(bp, 0x2e2434, 0x52404e);
    parts.push(bp);
    for (const [t, rad] of [[0.45, 1.5], [0.75, 1.9], [1.0, 2.2]] as const) {
      const p = new Vector3(0, 9 * t, 0).applyAxisAngle(new Vector3(0, 0, 1), tilt).applyAxisAngle(new Vector3(0, 1, 0), a);
      boughPuffs.push([p.x, p.y + lift + 0.4, p.z, rad, 0.7]);
    }
  }
  const wood = parts.splice(0, parts.length);
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
  const cards = leafCards([...puffs, ...boughPuffs], { cx: 0, cy: 18, cz: 0, size: 2.6, density: 2.0, inner: c0, outer: c1, top: c2, seed: 401 + variant });
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
  const [body, rimCards] = splitRim(cards, 0, 18, 0, RIM_SHARE);
  return attachFoliage(barked(wood, parts), body, variant === 1 ? "teal" : "violet", [rimCards, "glow"], [wisteriaCards(strands, WISTERIA_TOP, WISTERIA_TIP, 900 + variant), "wisteria"]);
}

export function mushroomGeometry(): BufferGeometry {
  // Matte painted toadstools (round 09-B; they were unlit HDR colour and read as glossy vinyl): a stem
  // dark at the root and pale under the cap, a cap lit from above with soft brushy mottling and pale
  // spots, dark gills. Only the cap's rim (and faintly the gills) glows, through aRim.
  const stem = prep(new CylinderGeometry(0.045, 0.075, 0.3, 7).translate(0, 0.15, 0));
  paint(stem, 0x3a4458, 0xd8e2f0);
  rim(stem, () => 0);
  const capPaint = (r0: number, y0: number) => (p: Vector3, n: Vector3, c: Color) => {
    const rr = Math.min(1, Math.hypot(p.x, p.z) / r0);
    // Baked light: the crown catches the light, the shoulder rolls into shade, the rim lifts again.
    const k = 0.62 + 0.18 * (1 - rr) + 0.3 * Math.pow(rr, 4) + 0.12 * (vnoise(p.x * 26 + 7, p.z * 26 + (p.y - y0) * 14, 43) - 0.5);
    c.setScalar(k);
    const sp = vnoise(p.x * 34 + 3, p.z * 34 + (p.y - y0) * 20, 41);
    if (sp > 0.74 && rr < 0.75) c.lerp(new Color(1, 1, 1), (sp - 0.74) * 2.4);
    if (n.y < -0.2) c.setScalar(0.28);
  };
  const capRim = (r0: number, cx: number, cz: number) => (x: number, _y: number, z: number) => Math.pow(Math.min(1, Math.hypot(x - cx, z - cz) / r0), 6);
  const cap = prep(new SphereGeometry(0.17, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.27, 0));
  paint(cap, 0xffffff, 0xffffff, capPaint(0.17, 0.27));
  rim(cap, capRim(0.17, 0, 0));
  const gills = prep(new CylinderGeometry(0.03, 0.165, 0.035, 18, 1, true).translate(0, 0.255, 0));
  paint(gills, 0xffffff, 0xffffff, (p, _n, c) => c.setScalar(0.22 + 0.1 * (Math.sin(Math.atan2(p.z, p.x) * 18) > 0 ? 1 : 0)));
  rim(gills, () => 0.3);
  const small = prep(new SphereGeometry(0.09, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.16, 0.12, 0.05));
  paint(small, 0xffffff, 0xffffff, (p, n, c) => capPaint(0.09, 0.12)(new Vector3(p.x - 0.16, p.y, p.z - 0.05), n, c));
  rim(small, capRim(0.09, 0.16, 0.05));
  const sgills = prep(new CylinderGeometry(0.015, 0.088, 0.02, 12, 1, true).translate(0.16, 0.115, 0.05));
  paint(sgills, 0x404858);
  rim(sgills, () => 0.3);
  const sstem = prep(new CylinderGeometry(0.025, 0.045, 0.13, 6).translate(0.16, 0.06, 0.05));
  paint(sstem, 0x3a4458, 0xc8d4e8);
  rim(sstem, () => 0);
  return merge([stem, cap, gills, small, sgills, sstem]);
}

export function pineGeometry(): BufferGeometry {
  // A leaf-card conifer (round 07: stacked smooth cones read as vinyl): a barked trunk, a slim dark core
  // for the silhouette and the shadow, and tiers of painted needle-spray boughs drooping from it.
  const trunk = prep(new CylinderGeometry(0.1, 0.3, 4.6, 7).translate(0, 2.3, 0));
  paint(trunk, 0x3a2c38, 0x5a4652);
  const tiers: Tier[] = [
    { y: 1.15, r: 1.85, h: 1.25 }, { y: 1.95, r: 1.6, h: 1.15 }, { y: 2.7, r: 1.32, h: 1.05 }, { y: 3.4, r: 1.02, h: 0.95 }, { y: 4.05, r: 0.7, h: 0.85 },
  ];
  const cones = tiers.map(({ y, r, h }, i) => {
    const g = new ConeGeometry(r * 0.62, h * 1.25, 9, 1);
    jitter(g, 0.06, i * 3.3);
    g.computeVertexNormals();
    g.translate(0, y + h * 0.62, 0);
    const p = prep(g);
    puffNormals(p, 0, y + h * 0.3, 0, 0.55);
    paint(p, 0x081c28, 0x123a44);
    return p;
  });
  const cards = coniferCards(tiers, { inner: 0x0e2a34, outer: 0x2e7a78, top: 0x6ab8a0, seed: 313 });
  return attachFoliage(barked([trunk], cones), cards, "needle");
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
  return markRock(p);
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
  return markRock(p);
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
    const g = surf(prep(new BoxGeometry(0.14, h, 0.1).translate(0, h / 2, R + 0.02).rotateY(a)), PK.grain);
    paint(g, 0x4a3226, 0x6a4632);
    beams.push(g);
  }
  const band = prep(new TorusGeometry(R * 0.99, 0.07, 5, 18).rotateX(Math.PI / 2).translate(0, h * 0.98, 0));
  paint(band, 0x4a3226);
  const base = prep(new CylinderGeometry(R + 0.12, R + 0.2, 0.3, 14).translate(0, 0.15, 0));
  paint(base, 0x6a6280, 0x8a84a0);
  // A swooping night-elf roof: an upturned, curled eave lip, a concave sweep up to a tall point, a
  // second smaller tier above it, gold trim on both eaves and a gold finial. Profiles run from the eave
  // up to the tip (outward-facing lathe; round 07's reversed profile drew the roof inside out).
  const roofH = 3.4 + r() * 0.9;
  const eave = R + 0.6;
  const sweep = (e: number, H: number, y0: number, lip: number): Vector2[] => {
    const prof: Vector2[] = [new Vector2(e + lip, y0 + lip * 0.9), new Vector2(e + lip * 0.35, y0 + lip * 0.15), new Vector2(e, y0)];
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      prof.push(new Vector2(Math.max(0.03, e * Math.pow(1 - t, 1.45)), y0 + H * t));
    }
    return prof;
  };
  const roofCols = [0x5a3ea8, 0x6a48b8, 0x4e3a9a, 0x7650c0];
  const rc = roofCols[Math.floor(r() * roofCols.length)]!;
  const roofPaint = (y0: number, H: number) => (p: Vector3, n: Vector3, c: Color) => {
    const t = Math.max(0, Math.min(1, (p.y - y0) / H));
    c.setHex(rc).lerp(new Color(0xb89af0), t * 0.55);
    // Painted shingle rows: darker under each row's lip, a lit edge above it.
    const row = ((p.y - y0) * 4.2) % 1;
    c.multiplyScalar(0.78 + 0.3 * Math.min(1, row * 1.6));
    if (n.y < -0.1) c.multiplyScalar(0.55);
  };
  const roof = surf(prep(new LatheGeometry(sweep(eave, roofH, h - 0.05, 0.32), 20)), PK.shingles);
  paint(roof, rc, rc, roofPaint(h - 0.05, roofH));
  const y2 = h - 0.05 + roofH * 0.42;
  const e2 = eave * Math.pow(1 - 0.42, 1.45) + 0.35;
  const roof2 = surf(prep(new LatheGeometry(sweep(e2, roofH * 0.62, y2, 0.22), 16)), PK.shingles);
  paint(roof2, rc, rc, roofPaint(y2, roofH * 0.62));
  const gold = (g: BufferGeometry) => paint(prep(g), 0xb88a30, 0xf0d080);
  const trim1 = gold(new TorusGeometry(eave + 0.32, 0.06, 5, 32).rotateX(Math.PI / 2).translate(0, h - 0.05 + 0.29, 0));
  const trim2 = gold(new TorusGeometry(e2 + 0.22, 0.05, 5, 24).rotateX(Math.PI / 2).translate(0, y2 + 0.2, 0));
  const tipY = Math.max(h - 0.05 + roofH, y2 + roofH * 0.62);
  const tip = gold(new ConeGeometry(0.07, 0.9, 6).translate(0, tipY + 0.4, 0));
  const orb = gold(new SphereGeometry(0.12, 8, 6).translate(0, tipY + 0.05, 0));
  // Door: an arched dark-wood door with a lamp-lit frame.
  const door = surf(prep(new BoxGeometry(0.62, 0.95, 0.12).translate(0, 0.62, R - 0.02)), PK.planks);
  const arch = prep(new CylinderGeometry(0.31, 0.31, 0.12, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 1.09, R - 0.02));
  paint(door, 0x4a2c4a, 0x6a3c5a);
  paint(arch, 0x6a3c5a);
  // Tall arched windows (lit glass) in carved dark-wood frames.
  const wins: BufferGeometry[] = [];
  const frames: BufferGeometry[] = [];
  for (const a of [-0.75, 0.75, 2.2, -2.2]) {
    const glass = merge([
      prep(new BoxGeometry(0.36, 0.42, 0.06).translate(0, h * 0.5, R + 0.02)),
      prep(new CylinderGeometry(0.18, 0.18, 0.06, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, h * 0.5 + 0.21, R + 0.02)),
    ].map((g) => paint(g, 0xffffff)));
    wins.push(glass.rotateY(a));
    const fr = merge([
      prep(new BoxGeometry(0.5, 0.06, 0.1).translate(0, h * 0.5 - 0.24, R + 0.04)),
      prep(new BoxGeometry(0.06, 0.46, 0.1).translate(-0.22, h * 0.5, R + 0.04)),
      prep(new BoxGeometry(0.06, 0.46, 0.1).translate(0.22, h * 0.5, R + 0.04)),
      prep(new BoxGeometry(0.03, 0.5, 0.08).translate(0, h * 0.5 + 0.02, R + 0.05)),
      prep(new TorusGeometry(0.2, 0.035, 4, 10, Math.PI).translate(0, h * 0.5 + 0.21, R + 0.04)),
    ].map((g) => paint(g, 0x3a2430, 0x5a3a40)));
    frames.push(fr.rotateY(a));
  }
  // A small round attic window in the lower roof.
  const atR = eave * Math.pow(1 - 0.6 / roofH, 1.45) + 0.02;
  wins.push(paint(prep(new CylinderGeometry(0.15, 0.15, 0.08, 10).rotateX(Math.PI / 2 - 0.5).translate(0, h + 0.55, atR)), 0xffffff));
  return { body: merge([walls, ...beams, band, base, roof, roof2, trim1, trim2, tip, orb, door, arch, ...frames]), windows: merge(wins) };
}


/**
 * A faceted crystal shard (round 09: flat white paper octahedra): a six-sided prism with a point, glowing
 * from inside (deep at the root to pale at the tip), each facet its own value, a violet turned side.
 * Base at y = 0, pointing up; height hh, radius r0. For the unlit glow material (vertex colours carry it).
 */
export function crystalShard(hh: number, r0: number, facet: number, deep: Color, tip: Color): BufferGeometry {
  const prism = new CylinderGeometry(r0 * 0.82, r0, hh * 0.68, 6, 1).translate(0, hh * 0.34, 0);
  const point = new ConeGeometry(r0 * 0.82, hh * 0.42, 6, 1).translate(0, hh * 0.68 + hh * 0.21, 0);
  const g = merge([prep(prism), prep(point)]).rotateY(facet);
  return paint(g, deep, tip, (p, n, c) => {
    // Inner glow: brightest a third of the way up (light caught inside), facets by their turn.
    const t = p.y / hh;
    c.multiplyScalar(0.7 + 0.45 * Math.exp(-((t - 0.45) * (t - 0.45)) * 6));
    c.multiplyScalar(0.62 + 0.5 * Math.abs(Math.sin(n.x * 3.1 + n.z * 2.3 + facet * 7)));
    if (n.x + n.z < -0.3) c.lerp(new Color(0x6a3ab0), 0.28);
  });
}
