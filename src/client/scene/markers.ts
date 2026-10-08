import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type PerspectiveCamera } from "three";
import { SEAT_HEX } from "./types";

/**
 * Soft screen-edge markers for fishers the camera is not framing (the family split between places): a
 * glowing disc in their hat colour with a white chevron pointing their way. No text. One per seat, always
 * in the scene (alpha 0 when unused) so nothing compiles mid-play.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uAngle;
uniform float uTime;
varying vec2 vUv;
void main() {
  float c = cos(uAngle), s = sin(uAngle);
  vec2 q = vec2(c * vUv.x + s * vUv.y, -s * vUv.x + c * vUv.y);
  float r = length(vUv);
  // A teardrop: the disc with a short tip toward the fisher.
  float tip = (1.0 - smoothstep(0.0, 0.42, abs(q.y) + (q.x - 0.56) * 0.9)) * step(0.3, q.x) * (1.0 - smoothstep(0.9, 0.96, q.x));
  float disc = max(1.0 - smoothstep(0.56, 0.62, r), tip);
  float halo = (1.0 - smoothstep(0.4, 1.0, r)) * (0.35 + 0.15 * sin(uTime * 3.0));
  // A white chevron inside, pointing the same way.
  float arm = abs(abs(q.y) - (0.26 - (q.x + 0.04)));
  float chevron = (1.0 - smoothstep(0.07, 0.11, arm)) * step(-0.22, q.x) * step(q.x, 0.24) * step(abs(q.y), 0.3);
  float ring = smoothstep(0.46, 0.5, r) * (1.0 - smoothstep(0.56, 0.62, r));
  vec3 col = mix(uColor, vec3(1.0), max(chevron, ring * 0.7));
  float a = max(disc, halo * 0.55) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * mix(1.0, 1.25, disc), a);
}`;

export type Marker = { seat: number; x: number; y: number; z: number; color: string; show: boolean };

export class EdgeMarkers {
  readonly meshes: Mesh[] = [];
  private readonly geo = new PlaneGeometry(1, 1);
  private readonly mats: ShaderMaterial[] = [];
  private readonly alpha = [0, 0, 0, 0];
  private readonly ang = [0, 0, 0, 0];
  private readonly pos = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly tmp = new Vector3();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  constructor() {
    for (let i = 0; i < 4; i++) {
      const mat = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        uniforms: { uColor: { value: new Color() }, uAlpha: { value: 0 }, uAngle: { value: 0 }, uTime: { value: 0 } },
      });
      const m = new Mesh(this.geo, mat);
      m.frustumCulled = false;
      m.renderOrder = 50;
      m.name = `edge-marker-${i}`;
      this.meshes.push(m);
      this.mats.push(mat);
    }
  }

  /** Each seat's marker: shown (eased) for the fishers out of the shot, pinned to the screen edge their way. */
  update(camera: PerspectiveCamera, list: readonly Marker[], t: number, dt: number): void {
    camera.updateMatrixWorld();
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const D = 2;
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * D;
    const aspect = camera.aspect;
    const k = Math.min(1, dt * 5);
    for (let i = 0; i < 4; i++) {
      const mk = list.find((m) => m.seat === i);
      const want = mk?.show ? 1 : 0;
      this.alpha[i]! += (want - this.alpha[i]!) * k;
      const mat = this.mats[i]!;
      const mesh = this.meshes[i]!;
      if (mk) {
        (mat.uniforms.uColor!.value as Color).setHex(SEAT_HEX[mk.color] ?? 0xffffff);
        // Where the fisher is on screen (behind the camera: mirrored, so the marker still points their way).
        this.tmp.set(mk.x, mk.y + 1, mk.z).applyMatrix4(camera.matrixWorldInverse);
        // Beside or behind the camera the perspective divide is meaningless: use the camera-space
        // direction, and since the view looks down on the valley, behind reads as "below".
        const depth = -this.tmp.z;
        let sx: number;
        let sy: number;
        if (depth > 2) {
          sx = this.tmp.x / depth / (halfH / D) / aspect;
          sy = this.tmp.y / depth / (halfH / D);
        } else {
          sx = this.tmp.x / aspect;
          sy = Math.min(this.tmp.y, -Math.abs(this.tmp.x) * 0.5 - (2 - depth));
        }
        const ax = sx * aspect;
        const len = Math.hypot(ax, sy) || 1;
        const dx = ax / len;
        const dy = sy / len;
        // Out along that direction to the inset edge (the top band is the HUD's, so markers stay below it).
        const EX = 0.93 * aspect;
        const EY0 = -0.78;
        const EY1 = 0.58;
        const s = Math.min(dx !== 0 ? EX / Math.abs(dx) : Infinity, dy > 0 ? EY1 / dy : dy < 0 ? EY0 / dy : Infinity);
        const wantX = (dx * s) / aspect;
        const wantY = dy * s;
        const first = this.alpha[i]! < 0.02;
        this.pos[i * 2] = first ? wantX : this.pos[i * 2]! + (wantX - this.pos[i * 2]!) * k;
        this.pos[i * 2 + 1] = first ? wantY : this.pos[i * 2 + 1]! + (wantY - this.pos[i * 2 + 1]!) * k;
        let da = Math.atan2(dy, dx) - this.ang[i]!;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        this.ang[i] = first ? Math.atan2(dy, dx) : this.ang[i]! + da * k;
      }
      const px = this.pos[i * 2]!;
      const py = this.pos[i * 2 + 1]!;
      mesh.position
        .copy(camera.position)
        .addScaledVector(this.fwd, D)
        .addScaledVector(this.right, px * halfH * aspect)
        .addScaledVector(this.up, py * halfH);
      mesh.quaternion.copy(camera.quaternion);
      const size = halfH * 2 * 0.09 * (0.85 + 0.15 * this.alpha[i]!);
      mesh.scale.set(size, size, 1);
      mat.uniforms.uAlpha!.value = this.alpha[i]!;
      mat.uniforms.uAngle!.value = this.ang[i]!;
      mat.uniforms.uTime!.value = t;
    }
  }

  /** Debug: alpha and NDC position per seat. */
  debug(): { alpha: number; x: number; y: number }[] {
    return this.alpha.map((a, i) => ({ alpha: a, x: this.pos[i * 2]!, y: this.pos[i * 2 + 1]! }));
  }

  dispose(): void {
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
  }
}
