import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
} from "three";
import type { TodState } from "./tod";
import { rng } from "./noise";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uMoon;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = clamp(h, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.75, up), 0.65));
  float sd = max(dot(d, uSunDir), 0.0);
  float horizonBand = 1.0 - smoothstep(0.0, 0.45, up);
  col += uGlow * (pow(sd, 6.0) * 0.55 * horizonBand + pow(sd, 48.0) * 0.5);
  // Stars (night) with a faint band.
  if (uStars > 0.01 && h > 0.0) {
    vec2 sp = d.xz / (d.y + 0.35) * 90.0;
    vec2 cell = floor(sp);
    float r = h21(cell);
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    vec2 off = vec2(h21(cell + 7.1), h21(cell + 3.3)) - 0.5;
    float dist = length(fract(sp) - 0.5 - off * 0.6);
    float star = step(0.965, r) * smoothstep(0.16, 0.0, dist) * tw;
    float band = smoothstep(0.35, 0.0, abs(d.x * 0.7 + d.z * 0.5 - 0.1)) * fbm(sp * 0.04) * 0.25;
    col += vec3(0.9, 0.95, 1.0) * (star + band * 0.6) * uStars * smoothstep(0.0, 0.2, h);
  }
  // Sun or moon disc (no face): a soft-edged disc.
  float disc = smoothstep(0.9988, 0.9993, sd);
  vec3 discCol = mix(uSunCol * 2.2 + 0.6, vec3(0.92, 0.94, 1.0) * (0.85 + 0.15 * vn(d.xz * 400.0)), uMoon);
  col = mix(col, discCol, disc * smoothstep(-0.02, 0.02, h));
  // Painted cumulus clouds over the horizon.
  vec2 cuv = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.004, 0.0);
  float n = fbm(cuv);
  float n2 = fbm(cuv + uSunDir.xz * 0.09);
  float band2 = smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.45, 0.85, h));
  float cov = smoothstep(0.5, 0.66, n) * band2;
  float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
  vec3 cc = mix(uCloudShade, uCloud, lit);
  cc += uGlow * pow(sd, 4.0) * 0.4;
  col = mix(col, cc, cov * 0.92);
  // Below the horizon: fade to the horizon colour (hidden by hills anyway).
  col = mix(col, uHorizon, smoothstep(0.0, -0.1, h));
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const MTN_VERT = /* glsl */ `
attribute float aH;
varying float vH;
varying float vShade;
void main() {
  vH = aH;
  vShade = normal.x * 0.5 + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const MTN_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform vec3 uFog;
uniform vec3 uLight;
uniform float uFar;
varying float vH;
varying float vShade;
void main() {
  vec3 c = uCol * (0.82 + 0.3 * vShade);
  c = mix(c, uCol * 1.45 + 0.08, smoothstep(0.78, 0.92, vH));
  c = mix(uFog, c, 0.45 + 0.4 * vH);
  c = mix(c, uFog, uFar);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type Sky = {
  dome: Mesh;
  mountains: Mesh;
  update(tod: TodState, camera: Camera, time: number): void;
  dispose(): void;
};

function buildMountains(): BufferGeometry {
  const r = rng(91);
  const pos: number[] = [];
  const hs: number[] = [];
  const idx: number[] = [];
  const peaks = 26;
  for (let layer = 0; layer < 2; layer++) {
    const R = layer === 0 ? 230 : 300;
    for (let p = 0; p < peaks; p++) {
      const th = (p / peaks) * Math.PI * 2 + r() * 0.2 + layer * 0.12;
      // Leave the south open behind the camera; mountains crowd the north.
      const north = 0.5 - 0.5 * Math.sin(th);
      const H = (25 + r() * 35) * (0.55 + 0.75 * north) * (layer === 0 ? 1 : 1.35);
      const W = 40 + r() * 40;
      const base = pos.length / 3;
      const cx = Math.cos(th) * R;
      const cz = Math.sin(th) * R;
      const tx = -Math.sin(th);
      const tz = Math.cos(th);
      // A peak: apex + ring of 7 base points with a jagged profile.
      const k = 7;
      pos.push(cx + (r() - 0.5) * 10, H - 6, cz + (r() - 0.5) * 10);
      hs.push(1);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        const rr = W * (0.6 + 0.4 * r());
        const mid = i % 2 === 0 ? 0 : H * (0.25 + 0.2 * r());
        const lx = Math.cos(a) * rr;
        const lz = Math.sin(a) * rr * 0.6;
        pos.push(cx + tx * lx + Math.cos(th) * lz, mid - 6, cz + tz * lx + Math.sin(th) * lz);
        hs.push(mid / H);
      }
      for (let i = 0; i < k; i++) idx.push(base, base + 1 + ((i + 1) % k), base + 1 + i);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aH", new BufferAttribute(new Float32Array(hs), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildSky(): Sky {
  const geo = new SphereGeometry(500, 48, 24);
  const mat = new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new Color() },
      uHorizon: { value: new Color() },
      uGlow: { value: new Color() },
      uCloud: { value: new Color() },
      uCloudShade: { value: new Color() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunCol: { value: new Color() },
      uMoon: { value: 0 },
      uStars: { value: 0 },
      uTime: { value: 0 },
    },
  });
  const dome = new Mesh(geo, mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.name = "sky";

  const mgeo = buildMountains();
  const mmat = new ShaderMaterial({
    vertexShader: MTN_VERT,
    fragmentShader: MTN_FRAG,
    fog: false,
    uniforms: {
      uCol: { value: new Color() },
      uFog: { value: new Color() },
      uLight: { value: new Vector3() },
      uFar: { value: 0.2 },
    },
  });
  const mountains = new Mesh(mgeo, mmat);
  mountains.name = "mountains";
  mountains.frustumCulled = false;

  const u = mat.uniforms;
  const mu = mmat.uniforms;
  return {
    dome,
    mountains,
    update(tod, camera, time) {
      dome.position.copy(camera.position);
      // Uniform values are typed `any` by three; these are the objects created above.
      (u.uTop!.value as Color).copy(tod.skyTop);
      (u.uHorizon!.value as Color).copy(tod.skyHorizon);
      (u.uGlow!.value as Color).copy(tod.skyGlow);
      (u.uCloud!.value as Color).copy(tod.cloud);
      (u.uCloudShade!.value as Color).copy(tod.cloudShade);
      (u.uSunCol!.value as Color).copy(tod.sun);
      (u.uSunDir!.value as Vector3).copy(tod.lightDir);
      u.uMoon!.value = tod.moon;
      u.uStars!.value = tod.stars;
      u.uTime!.value = time;
      (mu.uCol!.value as Color).copy(tod.mountain);
      (mu.uFog!.value as Color).copy(tod.skyHorizon).lerp(tod.fog, 0.5);
      mu.uFar!.value = 0.15 + tod.mist * 0.35;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mgeo.dispose();
      mmat.dispose();
    },
  };
}
