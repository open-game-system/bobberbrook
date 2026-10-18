import { CylinderGeometry, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from "three";

/**
 * The bite splash as shapes, not a heap of white spheres: a crisp double ring racing out over the
 * water and a jagged crown of water that rises, flares and falls back (the droplets come from Fx).
 */

const RING_VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vP;
void main() {
  vP = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const RING_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uAge;
uniform float uSize;
varying vec2 vP;
float ring(float d, float r, float w) { return smoothstep(r - w, r - w * 0.35, d) * (1.0 - smoothstep(r + w * 0.35, r + w, d)); }
void main() {
  if (uAge < 0.0 || uAge > 1.6) discard;
  float d = length(vP);
  float t = uAge;
  // Two rings: a fast bright one and a slower one behind it; both thin out as they spread.
  float r1 = uSize * (0.35 + 2.6 * (1.0 - exp(-t * 2.4)));
  float r2 = uSize * (0.2 + 1.7 * (1.0 - exp(-t * 2.0)));
  float a = ring(d, r1, 0.09 + 0.05 * t) * (1.0 - smoothstep(0.4, 1.5, t));
  a = max(a, ring(d, r2, 0.07) * (1.0 - smoothstep(0.3, 1.2, t)) * 0.8);
  // A brief white disc where the fish struck.
  a = max(a, (1.0 - smoothstep(0.0, uSize * 0.45, d)) * (1.0 - smoothstep(0.0, 0.25, t)));
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.97, 1.0, 1.0), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const CROWN_VERT = /* glsl */ `
#include <fog_pars_vertex>
uniform float uAge;
uniform float uSize;
varying vec2 vUv;
varying float vShade;
void main() {
  vUv = uv;
  float t = clamp(uAge / 0.75, 0.0, 1.0);
  // Rises fast, flares outward at the lip, sinks back.
  float h = uSize * 1.25 * sin(3.14159 * pow(t, 0.7));
  float rBase = uSize * (0.35 + 0.55 * t);
  float flare = uSize * (0.15 + 0.6 * t) * uv.y * uv.y;
  vec2 dir = normalize(position.xz + vec2(1e-5));
  vec3 p = vec3(dir.x * (rBase + flare), uv.y * h, dir.y * (rBase + flare));
  vShade = 0.85 + 0.15 * dir.y;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CROWN_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uAge;
varying vec2 vUv;
varying float vShade;
void main() {
  if (uAge < 0.0 || uAge > 0.8) discard;
  // Round 14: a sheet of thrown water, not an opaque white crown (hollow.png, session 75 s): translucent
  // vertical streaks, a soft ragged lip with beads, clear at the foot where it leaves the water.
  float x = vUv.x * 6.28318;
  float sheet = 0.5 + 0.5 * sin(x * 7.0 + sin(x * 3.0) * 1.7);
  float lip = 0.55 + 0.3 * pow(abs(sin(x * 4.5 + 1.3)), 0.5) + 0.15 * sheet;
  float edge = 1.0 - smoothstep(lip - 0.22, lip, vUv.y);
  float bead = smoothstep(0.06, 0.0, abs(vUv.y - lip - 0.05)) * step(0.82, fract(vUv.x * 23.0)) * 0.6;
  float foot = smoothstep(0.0, 0.3, vUv.y);
  float fade = 1.0 - smoothstep(0.4, 0.8, uAge);
  float a = ((0.14 + 0.4 * sheet) * edge + bead) * foot * fade;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.6, 0.86, 0.92), vec3(0.96, 1.0, 1.0), clamp(vUv.y * 0.6 + sheet * 0.4 + bead, 0.0, 1.0)) * vShade;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// Round 23: 4 -> 10 (a thrashing fish bursts every 0.45 s; four reels at once must not steal a bite's splash).
const POOL = 10;

export class Splashes {
  readonly group = new Group();
  private readonly slots: { ring: Mesh; crown: Mesh; ringMat: ShaderMaterial; crownMat: ShaderMaterial; start: number }[] = [];
  private next = 0;
  private readonly ringGeo = new PlaneGeometry(8, 8);
  private readonly crownGeo = new CylinderGeometry(1, 1, 1, 44, 6, true).translate(0, 0.5, 0);

  constructor() {
    this.group.name = "splashes";
    for (let i = 0; i < POOL; i++) {
      const common = (vs: string, fs: string) =>
        new ShaderMaterial({
          vertexShader: vs,
          fragmentShader: fs,
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
          fog: true,
          uniforms: UniformsUtils.merge([UniformsLib.fog, { uAge: { value: 99 }, uSize: { value: 1 } }]),
        });
      const ringMat = common(RING_VERT, RING_FRAG);
      const crownMat = common(CROWN_VERT, CROWN_FRAG);
      const ring = new Mesh(this.ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 4;
      const crown = new Mesh(this.crownGeo, crownMat);
      crown.renderOrder = 5;
      crown.frustumCulled = false;
      this.group.add(ring, crown);
      this.slots.push({ ring, crown, ringMat, crownMat, start: -99 });
    }
  }

  spawn(x: number, z: number, t: number, size: number): void {
    const s = this.slots[this.next]!;
    this.next = (this.next + 1) % POOL;
    s.start = t;
    s.ring.position.set(x, 0.04, z);
    s.crown.position.set(x, 0.0, z);
    s.ringMat.uniforms.uSize!.value = size;
    s.crownMat.uniforms.uSize!.value = size;
  }

  frame(t: number): void {
    for (const s of this.slots) {
      const age = t - s.start;
      const live = age >= 0 && age < 1.7;
      s.ring.visible = live;
      s.crown.visible = live && age < 0.85;
      s.ringMat.uniforms.uAge!.value = age;
      s.crownMat.uniforms.uAge!.value = age;
    }
  }

  /** Everything visible once so its shaders compile at start. */
  showAllForPrewarm(): void {
    for (const s of this.slots) {
      s.ring.visible = true;
      s.crown.visible = true;
    }
  }

  dispose(): void {
    this.ringGeo.dispose();
    this.crownGeo.dispose();
    for (const s of this.slots) {
      s.ringMat.dispose();
      s.crownMat.dispose();
    }
  }
}
