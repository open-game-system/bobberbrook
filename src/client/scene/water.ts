import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { lakeRadius } from "../../game/world";
import type { TodState } from "./tod";
import { FALLS, heightAt } from "./terrain";

export const MAX_RIPPLES = 24;
export const MAX_SWIRLS = 4;

/** GLSL port of world.ts lakeRadius (must stay in sync). */
const LAKE_RADIUS_GLSL = /* glsl */ `
float lakeRadius(float t) {
  return 17.0 + 2.4 * sin(2.0 * t + 0.6) + 1.4 * sin(3.0 * t - 1.1) + 0.8 * sin(5.0 * t + 2.0);
}`;

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const LAKE_VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const LAKE_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uShoreTint;
uniform float uTime;
uniform float uGlow;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform vec4 uSwirls[${MAX_SWIRLS}];
uniform vec2 uFallsFoot;
varying vec3 vWorld;
${LAKE_RADIUS_GLSL}
${NOISE_GLSL}

void main() {
  vec2 p = vWorld.xz;
  float r = length(p);
  float th = atan(p.y, p.x);
  float depth = lakeRadius(th) - r;
  // Gentle wind ripples: a few directional waves + value noise.
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.3 + uTime * 1.1) * 0.06;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 2.1 + uTime * 1.6) * 0.04;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 3.7 + uTime * 2.2) * 0.025;
  float n1 = vn(p * 0.9 + uTime * 0.15);
  float n2 = vn(p * 0.9 + vec2(0.37, 0.0) + uTime * 0.15);
  float n3 = vn(p * 0.9 + vec2(0.0, 0.37) + uTime * 0.15);
  g += vec2(n2 - n1, n3 - n1) * 0.35;
  float ringFoam = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    float age = uTime - rp.z;
    if (rp.w <= 0.0 || age < 0.0 || age > 3.0) continue;
    vec2 dv = p - rp.xy;
    float dist = length(dv) + 1e-4;
    float rad = age * (1.1 + rp.w * 0.5);
    float env = rp.w * exp(-age * 1.5);
    float x = (dist - rad) * 4.0;
    float wave = exp(-x * x);
    g += (dv / dist) * sin(x * 2.4) * wave * env * 0.9;
    ringFoam += wave * env * smoothstep(1.2, 0.0, age) * 0.7;
    // A white disc at the very start of a big splash.
    ringFoam += smoothstep(0.35 * rp.w + 0.2, 0.0, dist) * smoothstep(0.6, 0.0, age) * step(0.9, rp.w);
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  // Painted depth gradient.
  float dz = smoothstep(0.2, 7.5, depth);
  vec3 base = mix(uShallow * 1.05, uDeep, dz);
  base = mix(base, uShallow * 1.25 + 0.05, (1.0 - smoothstep(0.0, 1.4, depth)) * 0.5);
  // Shallow-water shimmer (caustic-like).
  float c1 = vn(p * 1.7 + vec2(uTime * 0.3, -uTime * 0.2));
  float c2 = vn(p * 1.7 * 1.3 - vec2(uTime * 0.25, uTime * 0.31));
  float caus = pow(1.0 - abs(c1 - c2), 8.0);
  base += vec3(0.75, 1.0, 0.9) * caus * (1.0 - dz) * 0.22;
  // Far-shore reflections: a darker, greener band hugging the edge.
  base = mix(base, uShoreTint, (1.0 - smoothstep(0.5, 4.5, depth)) * 0.28 * (1.0 - cosT * 0.5));
  // Swirls: a lighter patch, circling streaks, a golden glow.
  for (int i = 0; i < ${MAX_SWIRLS}; i++) {
    vec4 s = uSwirls[i];
    if (s.z <= 0.0) continue;
    vec2 dv = p - s.xy;
    float d = length(dv);
    float pat = (1.0 - smoothstep(1.2, 3.8, d)) * s.z;
    float a = atan(dv.y, dv.x);
    float streak = smoothstep(0.55, 1.0, sin(a * 3.0 - d * 2.2 + uTime * 2.4)) * smoothstep(3.4, 1.0, d) * smoothstep(0.2, 0.9, d);
    vec3 tint = mix(vec3(0.75, 1.0, 0.95), vec3(1.0, 0.82, 0.35), s.w);
    base = mix(base, base * 0.6 + tint * 0.55, pat * 0.55);
    ringFoam += streak * s.z * 0.5;
    base += tint * pat * s.w * 0.25 * (0.7 + 0.3 * sin(uTime * 3.0));
  }
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
  vec3 col = mix(base, sky, fres * 0.65);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0) * 2.2 + pow(max(dot(N, H), 0.0), 40.0) * 0.12;
  col += uSunCol * spec * smoothstep(-0.05, 0.15, uSunDir.y);
  // Shore foam: a soft lapping line.
  float lap = sin(uTime * 1.3 + th * 23.0 + vn(p * 2.0) * 4.0) * 0.12;
  float foam = smoothstep(0.55, 0.05, depth + lap - (vn(p * 3.0 + uTime * 0.2) - 0.5) * 0.25);
  // White water at the brook mouth under the falls.
  float mouth = smoothstep(3.2, 0.4, length(p - uFallsFoot)) * (0.55 + 0.45 * vn(p * 3.0 - vec2(0.0, uTime * 1.5)));
  foam = max(foam, mouth);
  foam = max(foam, clamp(ringFoam, 0.0, 1.0));
  col = mix(col, vec3(0.97, 1.0, 1.0) * (0.85 + 0.15 * uGlow), clamp(foam, 0.0, 1.0) * 0.9);
  float alpha = mix(0.62, 0.96, smoothstep(0.0, 3.0, depth));
  alpha = max(alpha, foam);
  gl_FragColor = vec4(max(col, vec3(0.0)), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FLOW_VERT = /* glsl */ `
#include <fog_pars_vertex>
attribute vec2 aFlow;
varying vec2 vFlow;
varying vec3 vWorld;
void main() {
  vFlow = aFlow;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FLOW_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uTime;
uniform float uSpeed;
uniform vec3 uTint;
uniform vec3 uDeep;
uniform float uSheet;
varying vec2 vFlow;
varying vec3 vWorld;
${NOISE_GLSL}
void main() {
  // vFlow.x across (0..1), vFlow.y along the flow (metres).
  float t = uTime * uSpeed;
  float s1 = vn(vec2(vFlow.x * 9.0, vFlow.y * 0.7 - t));
  float s2 = vn(vec2(vFlow.x * 23.0 + 3.0, vFlow.y * 1.6 - t * 1.4));
  float streak = smoothstep(0.35, 0.85, s1 * 0.6 + s2 * 0.5);
  float edge = smoothstep(0.0, 0.12, vFlow.x) * smoothstep(1.0, 0.88, vFlow.x);
  vec3 col = mix(uDeep, uTint, 0.35 + 0.65 * streak * mix(0.6, 1.0, uSheet));
  col = mix(col, vec3(1.0), smoothstep(0.75, 1.0, s2) * 0.6);
  float a = edge * mix(0.75, 0.92, streak);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export type Water = {
  lake: Mesh;
  brook: Mesh;
  falls: Mesh;
  /** Add a ring ripple at (x, z) at time t (seconds). strength ≈ 0.3 nibble, 0.6 plop, 1.0+ splash. */
  ripple(x: number, z: number, t: number, strength: number): void;
  setSwirl(i: number, x: number, z: number, alpha: number, golden: number): void;
  update(tod: TodState, time: number): void;
  dispose(): void;
};

function lakeGeometry(): BufferGeometry {
  const cols = 160;
  const rows = 34;
  const pos: number[] = [0, 0, 0];
  for (let j = 1; j <= rows; j++) {
    const f = j / rows;
    for (let i = 0; i < cols; i++) {
      const th = (i / cols) * Math.PI * 2;
      const r = (lakeRadius(th) + 0.9) * Math.pow(f, 0.8);
      pos.push(Math.cos(th) * r, 0, Math.sin(th) * r);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < cols; i++) idx.push(0, 1 + ((i + 1) % cols), 1 + i);
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = 1 + j * cols + i;
      const b = 1 + j * cols + ((i + 1) % cols);
      const c = 1 + (j + 1) * cols + i;
      const d = 1 + (j + 1) * cols + ((i + 1) % cols);
      idx.push(a, d, c, a, b, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A ribbon following a centre line: (x, y, z) points with a half width each. */
function ribbon(points: { x: number; y: number; z: number; w: number }[], sideways: "x" | "z"): BufferGeometry {
  const pos: number[] = [];
  const flow: number[] = [];
  const idx: number[] = [];
  let along = 0;
  points.forEach((p, i) => {
    if (i > 0) {
      const q = points[i - 1]!;
      along += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    }
    if (sideways === "x") {
      pos.push(p.x - p.w, p.y, p.z, p.x + p.w, p.y, p.z);
    } else {
      pos.push(p.x, p.y, p.z - p.w, p.x, p.y, p.z + p.w);
    }
    flow.push(0, along, 1, along);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aFlow", new BufferAttribute(new Float32Array(flow), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function flowMaterial(speed: number, sheet: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: FLOW_VERT,
    fragmentShader: FLOW_FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uTint: { value: new Color(0xeaffff) },
        uDeep: { value: new Color(0x4fb8c8) },
        uSheet: { value: sheet },
      },
    ]),
  });
}

export function buildWater(): Water {
  const ripples: Vector4[] = Array.from({ length: MAX_RIPPLES }, () => new Vector4(0, 0, -100, 0));
  const swirls: Vector4[] = Array.from({ length: MAX_SWIRLS }, () => new Vector4(0, 0, 0, 0));
  let nextRipple = 0;
  const lakeMat = new ShaderMaterial({
    vertexShader: LAKE_VERT,
    fragmentShader: LAKE_FRAG,
    transparent: true,
    depthWrite: true,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uShallow: { value: new Color() },
        uDeep: { value: new Color() },
        uSkyTop: { value: new Color() },
        uSkyHorizon: { value: new Color() },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uSunCol: { value: new Color() },
        uShoreTint: { value: new Color(0x2f5a3a) },
        uTime: { value: 0 },
        uGlow: { value: 0 },
        uRipples: { value: [] },
        uSwirls: { value: [] },
        uFallsFoot: { value: [0, 0] },
      },
    ]),
  });
  // UniformsUtils.merge clones values; arrays of vectors must be shared with our pools.
  lakeMat.uniforms.uRipples = { value: ripples };
  lakeMat.uniforms.uSwirls = { value: swirls };
  lakeMat.uniforms.uFallsFoot = { value: new Vector2(0, -(FALLS.edge - 0.4)) };
  const lakeGeo = lakeGeometry();
  const lake = new Mesh(lakeGeo, lakeMat);
  lake.name = "lake";
  lake.renderOrder = 1;

  // The brook from the foot of the falls to the lake.
  const pts: { x: number; y: number; z: number; w: number }[] = [];
  for (let z = FALLS.footZ - 0.6; z <= -FALLS.edge + 0.8; z += 0.4) {
    const x = -Math.sin(z * 0.6) * 0.25;
    pts.push({ x, y: Math.max(heightAt(x, z) + 0.12, 0.02), z, w: FALLS.brookHalf + 0.15 });
  }
  const brookGeo = ribbon(pts, "x");
  const brookMat = flowMaterial(1.2, 0);
  const brook = new Mesh(brookGeo, brookMat);
  brook.name = "brook";
  brook.renderOrder = 2;

  // The falls: a sheet curving over the lip and down the cliff in two steps.
  const fpts: { x: number; y: number; z: number; w: number }[] = [];
  const topZ = FALLS.topZ - 1.6;
  const lipY = heightAt(0, topZ) + 0.25;
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const z = topZ + (FALLS.footZ - topZ + 0.4) * Math.pow(f, 0.45);
    const y = lipY + (0.2 - lipY) * f * f * (0.4 + 0.6 * f) - (f < 0.12 ? 0 : 0);
    fpts.push({ x: 0, y: Math.max(y, 0.15), z: z + 0.2 * Math.sin(f * Math.PI), w: 1.15 + f * 0.55 });
  }
  const fallsGeo = ribbon(fpts, "x");
  const fallsMat = flowMaterial(4.5, 1);
  const falls = new Mesh(fallsGeo, fallsMat);
  falls.name = "falls";
  falls.renderOrder = 3;

  const u = lakeMat.uniforms;
  return {
    lake,
    brook,
    falls,
    ripple(x, z, t, strength) {
      const r = ripples[nextRipple]!;
      r.set(x, z, t, strength);
      nextRipple = (nextRipple + 1) % MAX_RIPPLES;
    },
    setSwirl(i, x, z, alpha, golden) {
      const s = swirls[i];
      if (s) s.set(x, z, alpha, golden);
    },
    update(tod, time) {
      (u.uShallow!.value as Color).copy(tod.waterShallow);
      (u.uDeep!.value as Color).copy(tod.waterDeep);
      (u.uSkyTop!.value as Color).copy(tod.skyTop);
      (u.uSkyHorizon!.value as Color).copy(tod.skyHorizon);
      (u.uSunDir!.value as Vector3).copy(tod.lightDir);
      (u.uSunCol!.value as Color).copy(tod.sun).multiplyScalar(tod.sunI * 0.5);
      (u.uShoreTint!.value as Color).setRGB(0.16, 0.32, 0.2).lerp(tod.hemiGround, 0.3).multiplyScalar(0.6 + 0.4 * (1 - tod.moon));
      u.uTime!.value = time;
      u.uGlow!.value = tod.glow;
      for (const m of [brookMat, fallsMat]) {
        m.uniforms.uTime!.value = time;
        (m.uniforms.uDeep!.value as Color).copy(tod.waterShallow).multiplyScalar(0.85);
        (m.uniforms.uTint!.value as Color).setRGB(0.93, 1, 1).lerp(tod.hemiSky, 0.25);
      }
    },
    dispose() {
      lakeGeo.dispose();
      lakeMat.dispose();
      brookGeo.dispose();
      brookMat.dispose();
      fallsGeo.dispose();
      fallsMat.dispose();
    },
  };
}
