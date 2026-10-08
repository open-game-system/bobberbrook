import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import { FISH_IDS } from "../../game/fish";

/** Flat fish silhouette (local +x = head), for shadows under the surface. */
function silhouette(): BufferGeometry {
  const pts: number[] = [];
  const body = 14;
  const cx = 0.05;
  const rx = 0.32;
  const rz = 0.11;
  for (let i = 0; i < body; i++) {
    const a0 = (i / body) * Math.PI * 2;
    const a1 = ((i + 1) / body) * Math.PI * 2;
    pts.push(cx, 0, 0, cx + Math.cos(a1) * rx, 0, Math.sin(a1) * rz, cx + Math.cos(a0) * rx, 0, Math.sin(a0) * rz);
  }
  // Tail.
  pts.push(-0.22, 0, 0, -0.45, 0, 0.13, -0.45, 0, -0.13);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
  g.computeVertexNormals();
  return g;
}

export const MAX_SHADOWS = 64;

export class FishShadows {
  readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  private n = 0;
  private readonly dummy = new Object3D();
  private readonly c = new Color();

  constructor() {
    this.mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide });
    this.mesh = new InstancedMesh(silhouette(), this.mat, MAX_SHADOWS);
    this.mesh.renderOrder = 4;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_SHADOWS; i++) this.mesh.setColorAt(i, this.c.setRGB(0.05, 0.2, 0.25));
  }

  begin(): void {
    this.n = 0;
  }

  /** heading: direction the head points (radians in xz, atan2(z, x) convention). */
  add(x: number, z: number, heading: number, scale: number, wiggle: number, r: number, g: number, b: number): void {
    if (this.n >= MAX_SHADOWS) return;
    const d = this.dummy;
    d.position.set(x, 0.035, z);
    d.rotation.set(0, -heading + wiggle, 0);
    d.scale.set(scale, 1, scale * (1 + 0.15 * Math.sin(wiggle * 6)));
    d.updateMatrix();
    this.mesh.setMatrixAt(this.n, d.matrix);
    this.mesh.setColorAt(this.n, this.c.setRGB(r, g, b));
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** The painted fish sprites, loaded once. */
export class FishTextures {
  readonly placeholder: Texture;
  private readonly map = new Map<string, Texture>();
  private readonly aspect = new Map<string, number>();

  constructor(base: string) {
    this.placeholder = new DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1, RGBAFormat);
    this.placeholder.needsUpdate = true;
    const loader = new TextureLoader();
    for (const id of FISH_IDS) {
      const t = loader.load(`${base}${id}.webp`, (tex) => {
        const img: unknown = tex.image;
        if (img instanceof HTMLImageElement || img instanceof ImageBitmap) this.aspect.set(id, img.width / Math.max(1, img.height));
      });
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      this.map.set(id, t);
    }
  }

  get(id: string): Texture {
    return this.map.get(id) ?? this.placeholder;
  }

  aspectOf(id: string): number {
    return this.aspect.get(id) ?? 1.6;
  }

  dispose(): void {
    for (const t of this.map.values()) t.dispose();
    this.placeholder.dispose();
  }
}

function raysGeometry(n: number): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 0.09;
    pos.push(0, 0, 0, Math.cos(a - w) * 1, Math.sin(a - w) * 1, 0, Math.cos(a + w) * 1, Math.sin(a + w) * 1, 0);
    col.push(1, 0.85, 0.45, 0, 0, 0, 0, 0, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  return g;
}

/** One fish card (camera-facing painted sprite) with optional rays behind it. */
export class CatchCard {
  readonly group = new Group();
  readonly card: Mesh;
  readonly rays: Mesh;
  readonly cardMat: MeshBasicMaterial;
  readonly raysMat: MeshBasicMaterial;

  constructor(placeholder: Texture, raysGeo: BufferGeometry, planeGeo: PlaneGeometry) {
    this.cardMat = new MeshBasicMaterial({ map: placeholder, transparent: true, alphaTest: 0.02, side: DoubleSide, depthWrite: false });
    this.card = new Mesh(planeGeo, this.cardMat);
    this.card.renderOrder = 15;
    this.raysMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.rays = new Mesh(raysGeo, this.raysMat);
    this.rays.renderOrder = 14;
    this.rays.position.z = -0.05;
    this.group.add(this.rays, this.card);
  }

  dispose(): void {
    this.cardMat.dispose();
    this.raysMat.dispose();
  }
}

export function sharedCardGeometry(): { rays: BufferGeometry; plane: PlaneGeometry } {
  return { rays: raysGeometry(14), plane: new PlaneGeometry(1, 1) };
}

/** A soft light pillar for the golden swirl. */
export function lightPillar(): { mesh: Mesh; mat: MeshBasicMaterial } {
  const g = new CylinderGeometry(1.6, 2.4, 9, 24, 6, true);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 4.5) / 9;
    const k = Math.pow(1 - t, 2.2) * 0.55;
    col[i * 3] = 1 * k;
    col[i * 3 + 1] = 0.82 * k;
    col[i * 3 + 2] = 0.4 * k;
  }
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.translate(0, 4.5, 0);
  const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const mesh = new Mesh(g, mat);
  mesh.renderOrder = 13;
  return { mesh, mat };
}
