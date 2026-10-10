import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  CustomBlending,
  SrcAlphaFactor,
  OneMinusSrcAlphaFactor,
  ZeroFactor,
  OneFactor,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
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

/** The painted fish sprites, loaded once as images (drawn into each card's canvas). */
export class FishTextures {
  private readonly imgs = new Map<string, HTMLImageElement>();

  constructor(base: string) {
    for (const id of FISH_IDS) {
      const img = new Image();
      img.decoding = "async";
      img.src = `${base}${id}.webp`;
      this.imgs.set(id, img);
    }
  }

  image(id: string): HTMLImageElement | undefined {
    const img = this.imgs.get(id);
    return img && img.complete && img.naturalWidth > 0 ? img : undefined;
  }

  aspectOf(id: string): number {
    const img = this.image(id);
    return img ? img.naturalWidth / Math.max(1, img.naturalHeight) : 1.6;
  }

  dispose(): void {
    this.imgs.clear();
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

  private readonly canvas: HTMLCanvasElement;
  private readonly tex: CanvasTexture;

  constructor(raysGeo: BufferGeometry, planeGeo: PlaneGeometry) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 640;
    this.canvas.height = 640;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.cardMat = new MeshBasicMaterial({ map: this.tex, transparent: true, alphaTest: 0.02, side: DoubleSide, depthWrite: false });
    // Colour blends as usual; the buffer's alpha is cut where the fish is, so the painterly filter
    // (post.ts) leaves the painted sprite as it is (GL state only: no new program).
    this.cardMat.blending = CustomBlending;
    this.cardMat.blendSrc = SrcAlphaFactor;
    this.cardMat.blendDst = OneMinusSrcAlphaFactor;
    this.cardMat.blendSrcAlpha = ZeroFactor;
    this.cardMat.blendDstAlpha = OneMinusSrcAlphaFactor;
    this.card = new Mesh(planeGeo, this.cardMat);
    this.card.renderOrder = 15;
    this.raysMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.rays = new Mesh(raysGeo, this.raysMat);
    this.rays.renderOrder = 14;
    this.rays.position.z = -0.05;
    this.group.add(this.rays, this.card);
  }

  /** Paints the fish into the card with a soft thin rim of light (reads on any background). Returns the aspect. */
  paint(img: HTMLImageElement | undefined, glow: string): number {
    const c = this.canvas;
    const ctx = c.getContext("2d");
    if (!ctx) return 1.6;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!img) return 1.6;
    const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    const pad = 60;
    const w = c.width - pad * 2;
    const h = w / aspect;
    const y = (c.height - h) / 2;
    // Round 16: a soft, thin rim of light (one pass, short blur), not a thick white sticker halo.
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(img, pad, y, w, h);
    ctx.restore();
    ctx.drawImage(img, pad, y, w, h);
    this.tex.needsUpdate = true;
    return aspect;
  }

  dispose(): void {
    this.tex.dispose();
    this.cardMat.dispose();
    this.raysMat.dispose();
  }
}

export function sharedCardGeometry(): { rays: BufferGeometry; plane: PlaneGeometry } {
  return { rays: raysGeometry(14), plane: new PlaneGeometry(1, 1) };
}

/** A soft light pillar for the golden swirl: brightest where you look through it edge-on, fading up. */
/** Shared GLSL value noise for the pillar and its ground ring. */
const PILLAR_NOISE = /* glsl */ `
float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/**
 * The golden swirl's light pillar (round 17): a soft additive column, brightest through its middle and
 * fading to nothing at its silhouette (no hard edge facing the camera), broken up by rising vertical
 * noise that frays its top into wisps, standing in a glowing ring of light on the water.
 */
export function lightPillar(): { mesh: Mesh; mat: ShaderMaterial } {
  const g = new CylinderGeometry(1.6, 2.2, 10, 40, 12, true);
  g.translate(0, 5, 0);
  // Additive light that leaves the buffer's alpha alone (a catcher inside it stays out of the paint filter).
  const additive = (m: ShaderMaterial): ShaderMaterial => {
    m.transparent = true;
    m.blending = CustomBlending;
    m.blendSrc = OneFactor;
    m.blendDst = OneFactor;
    m.blendSrcAlpha = ZeroFactor;
    m.blendDstAlpha = OneFactor;
    m.depthWrite = false;
    return m;
  };
  const mat = additive(new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uStrength: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
varying float vH;
varying float vFacing;
varying float vA;
void main() {
  vH = position.y / 10.0;
  vA = atan(position.z, position.x);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 v = normalize(cameraPosition - wp.xyz);
  vFacing = abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: /* glsl */ `
uniform float uStrength;
uniform float uTime;
varying float vH;
varying float vFacing;
varying float vA;
${PILLAR_NOISE}
void main() {
  // Soft toward the silhouette: the side seen edge-on carries no light, so the column has no outline.
  float soft = vFacing * vFacing * vFacing;
  // Rising vertical streaks (seamless round the turn: the angle wraps through sin/cos).
  vec2 ring = vec2(cos(vA), sin(vA)) * 1.6;
  float n1 = pNoise(vec2(ring.x * 2.0 + ring.y * 3.1, vH * 3.0 - uTime * 0.35));
  float n2 = pNoise(vec2(ring.y * 4.3 - ring.x * 1.7, vH * 7.0 - uTime * 0.7));
  float n = 0.55 * n1 + 0.45 * n2;
  // Bright and dense at the water, fraying into wisps up the column.
  float top = 1.0 - smoothstep(0.12 + 0.55 * n, 0.95, vH);
  float base = smoothstep(0.0, 0.08, vH);
  float body = mix(1.0, 0.35 + 0.9 * n, smoothstep(0.0, 0.5, vH));
  vec3 c = mix(vec3(1.0, 0.86, 0.5), vec3(1.0, 0.7, 0.3), vH) * soft * top * base * body * uStrength * 0.5;
  gl_FragColor = vec4(c, 1.0);
}`,
  }));
  const mesh = new Mesh(g, mat);
  mesh.renderOrder = 13;
  // The glowing ring on the water where the column stands (shares the pillar's uniforms).
  const disc = new PlaneGeometry(7.2, 7.2);
  disc.rotateX(-Math.PI / 2);
  disc.translate(0, 0.06, 0);
  const ringMat = additive(new ShaderMaterial({
    uniforms: mat.uniforms,
    vertexShader: /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform float uStrength;
uniform float uTime;
varying vec2 vP;
${PILLAR_NOISE}
void main() {
  float r = length(vP);
  float a = atan(vP.y, vP.x);
  float wob = pNoise(vec2(cos(a) * 2.5 + 7.0, sin(a) * 2.5 + uTime * 0.4));
  float rr = 2.15 + 0.25 * wob;
  float band = exp(-pow((r - rr) / 0.32, 2.0));
  float pool = exp(-pow(r / 2.0, 2.0)) * 0.35;
  float outer = 1.0 - smoothstep(2.6, 3.55, r);
  float pulse = 0.85 + 0.15 * sin(uTime * 2.2 - r * 2.0);
  vec3 c = vec3(1.0, 0.8, 0.42) * (band * pulse + pool) * outer * uStrength * 0.6;
  gl_FragColor = vec4(c, 1.0);
}`,
  }));
  const ringMesh = new Mesh(disc, ringMat);
  ringMesh.renderOrder = 12;
  mesh.add(ringMesh);
  return { mesh, mat };
}
