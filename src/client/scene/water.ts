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
import { pondRadius, type Area } from "../../game/world";
import type { Place } from "../../game/regions";
import { lookOf } from "./valley";
import type { TodState } from "./tod";
import { FALLS, heightAt } from "./terrain";

export const MAX_RIPPLES = 24;
export const MAX_SWIRLS = 8;

/** GLSL port of world.ts pondRadius (must stay in sync): base radius + bumps at 2, 3 and 5 lobes. */
const POND_RADIUS_GLSL = /* glsl */ `
uniform vec4 uPond;
uniform vec3 uPhase;
float pondRadius(float t) {
  return uPond.x + uPond.y * sin(2.0 * t + uPhase.x) + uPond.z * sin(3.0 * t + uPhase.y) + uPond.w * sin(5.0 * t + uPhase.z);
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
uniform vec2 uCenter;
uniform vec3 uTintS;
uniform vec3 uTintD;
uniform float uCalm;
uniform float uVeil;
uniform float uStars;
uniform vec3 uVeilCol;
varying vec3 vWorld;
${POND_RADIUS_GLSL}
${NOISE_GLSL}

void main() {
  vec2 p = vWorld.xz;
  vec2 lp = p - uCenter;
  float r = length(lp);
  float th = atan(lp.y, lp.x);
  float depth = pondRadius(th) - r;
  // Gentle wind ripples: a few directional waves + value noise.
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.3 + uTime * 1.1) * 0.06;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 2.1 + uTime * 1.6) * 0.04;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 3.7 + uTime * 2.2) * 0.025;
  float n1 = vn(p * 0.9 + uTime * 0.15);
  float n2 = vn(p * 0.9 + vec2(0.37, 0.0) + uTime * 0.15);
  float n3 = vn(p * 0.9 + vec2(0.0, 0.37) + uTime * 0.15);
  g += vec2(n2 - n1, n3 - n1) * 0.35;
  g *= 1.0 - 0.8 * uCalm;
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
  // Painted depth: pale cyan shallows, a teal band, a deep teal-violet middle (wobbly contours, not rings).
  float dw = depth + (vn(p * 0.35 + 7.0) - 0.5) * 2.2;
  float dz = smoothstep(0.3, 7.0, dw);
  vec3 shallow = uShallow * uTintS;
  vec3 deepV = mix(uDeep * uTintD, vec3(0.16, 0.1, 0.42) * (0.5 + 0.5 * length(uDeep) * 1.6), 0.38);
  vec3 base = mix(shallow * 1.05, deepV, dz);
  base = mix(base, mix(shallow, vec3(1.0), 0.3) * 1.15, (1.0 - smoothstep(0.0, 1.6, dw)) * 0.6);
  // Shallow-water shimmer (caustic-like).
  float c1 = vn(p * 1.7 + vec2(uTime * 0.3, -uTime * 0.2));
  float c2 = vn(p * 1.7 * 1.3 - vec2(uTime * 0.25, uTime * 0.31));
  float caus = pow(1.0 - abs(c1 - c2), 8.0);
  base += vec3(0.75, 1.0, 0.9) * caus * (1.0 - dz) * 0.22;
  // Far-shore reflections: a darker, greener band hugging the edge.
  // Reflections of the shore trees: a dark band hugging the far edges, broken into vertical streaks by ripples.
  float streaks = 0.65 + 0.35 * vn(vec2(p.x * 2.6, p.y * 0.45) + g * 6.0);
  base = mix(base, uShoreTint, (1.0 - smoothstep(0.5, 7.0, depth)) * 0.42 * streaks * (1.0 - cosT * 0.4) * smoothstep(-4.0, 2.0, -lp.y));
  // Soft drifting highlights (wind patches).
  base += mix(uShallow, vec3(1.0), 0.5) * smoothstep(0.58, 0.85, vn(p * 0.22 + vec2(uTime * 0.05, uTime * 0.03))) * 0.07 * (0.6 + 0.4 * dz);
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
  // Moonwell glow: the water lights itself, more at night; drifting glints under the surface.
  float glowK = 0.35 + 0.65 * uGlow;
  base += shallow * glowK * (0.1 + 0.16 * (1.0 - dz));
  float mote = smoothstep(0.93, 1.0, vn(p * 2.3 + vec2(uTime * 0.12, uTime * 0.07))) * smoothstep(0.9, 1.0, vn(p * 5.1 - uTime * 0.2));
  base += vec3(0.6, 1.0, 1.0) * mote * glowK * 2.0;
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
  // Still water (the tarn) is a mirror: more sky, and the stars in it at night.
  float mirror = uCalm * uCalm;
  if (uStars > 0.01 && R.y > 0.0) {
    vec2 sp = R.xz / (R.y + 0.35) * 90.0;
    vec2 cell = floor(sp);
    float rr = h21(cell);
    float st = step(0.955, rr) * smoothstep(0.2, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * (1.0 + rr * 3.0) + rr * 40.0));
    sky += vec3(0.9, 0.95, 1.0) * st * uStars * (0.4 + 1.6 * mirror);
  }
  vec3 col = mix(base, sky, fres * 0.65 + mirror * 0.4);
  vec3 H = normalize(uSunDir + V);
  // Painted glints: soft-edged dabs, capped (never a white-hot speck that blooms the frame out).
  float nh = max(dot(N, H), 0.0);
  float spec = smoothstep(0.35, 0.8, pow(nh, 120.0)) * 0.45 + pow(nh, 30.0) * 0.06;
  col += uSunCol * vec3(1.0, 0.93, 0.82) * spec * smoothstep(-0.05, 0.15, uSunDir.y) * (1.0 - 0.65 * uStars);
  // Moon path (night): a broken silver road across the water toward the moon, wherever the reflected
  // ray points at the moon's bearing; the ripples break it into dabs that shimmer.
  if (uStars > 0.01) {
    vec2 rz = R.xz / max(length(R.xz), 1e-4);
    vec2 mz = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
    float road = smoothstep(0.994, 0.9993, dot(rz, mz)) * smoothstep(0.8, 0.35, R.y);
    float bits = smoothstep(0.42, 0.78, vn(vec2(p.x * 1.6, p.y * 5.0) + vec2(uTime * 0.35, -uTime * 0.2)));
    col += vec3(0.7, 0.8, 1.0) * road * (0.15 + 0.85 * bits) * uStars * 0.9;
  }
  // Shore foam, painted (round 07: one even white rim): a broken lip of foam dabs right at the bank and
  // a second, thinner lapping line a little way out that comes and goes; between them the shallows show.
  float lap = sin(uTime * 1.3 + th * 23.0 + vn(p * 2.0) * 4.0) * 0.08;
  float edge = depth + lap;
  float dabs = smoothstep(0.32, 0.68, vn(p * 1.9 + vec2(uTime * 0.07, 0.0))) * 0.7 + vn(p * 5.3 - uTime * 0.1) * 0.3;
  float lip = smoothstep(0.42, 0.04, edge - (dabs - 0.5) * 0.3) * (0.4 + 0.6 * smoothstep(0.25, 0.75, dabs));
  float out2 = 0.62 + 0.14 * sin(uTime * 0.8 + th * 5.0);
  float line2 = (1.0 - smoothstep(0.0, 0.09, abs(edge - out2))) * smoothstep(0.45, 0.75, vn(vec2(th * 34.0, uTime * 0.25))) * 0.7;
  float foam = max(lip, line2);
  // The wet bank: right at the edge the water thins and darkens (wet stones and sand under it).
  base = mix(base, base * vec3(0.55, 0.7, 0.72), (1.0 - smoothstep(0.0, 0.35, depth)) * 0.5);
  // A hint of the violet canopy mirrored along the far banks.
  float canopy = smoothstep(0.45, 0.8, vn(vec2(th * 6.0, 3.0) + g * 2.0)) * (1.0 - smoothstep(1.0, 6.0, depth)) * smoothstep(-4.0, 2.0, -lp.y);
  col = mix(col, vec3(0.26, 0.16, 0.42) * (0.6 + 0.6 * uGlow), canopy * 0.28 * (1.0 - cosT * 0.5));
  // White water at the brook mouth under the falls.
  float mouth = smoothstep(3.2, 0.4, length(p - uFallsFoot)) * (0.55 + 0.45 * vn(p * 3.0 - vec2(0.0, uTime * 1.5)));
  foam = max(foam, mouth);
  foam = max(foam, clamp(ringFoam, 0.0, 1.0));
  // Foam is pale painted teal-white, never paper white (round 08: bloom white-outs at the falls' foot).
  vec3 foamCol = mix(vec3(0.66, 0.88, 0.92), vec3(0.86, 0.95, 0.96), dabs) * (0.85 + 0.12 * uGlow);
  col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.85);
  // Undiscovered: veiled, darker, lost in a lilac haze.
  col = mix(col, uVeilCol * (0.55 + 0.25 * vn(p * 0.2 + uTime * 0.05)), uVeil * 0.7);
  float alpha = mix(0.5, 0.96, smoothstep(0.0, 3.0, depth));
  alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.9);
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
  col = mix(col, vec3(0.82, 0.94, 0.96), smoothstep(0.75, 1.0, s2) * 0.45);
  float a = edge * mix(0.75, 0.92, streak);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Ponds drawn at once: the nearest places to the action get a slot (the shader count stays flat). */
export const POND_SLOTS = 6;

const SEA_VERT = /* glsl */ `
#include <fog_pars_vertex>
attribute vec2 aSea;
uniform float uTime;
varying vec3 vWorld;
varying vec2 vSea;
void main() {
  vSea = aSea;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // A gentle swell, calm at the shore.
  float k = smoothstep(0.0, 2.5, aSea.x);
  wp.y += (sin(wp.x * 0.09 + uTime * 0.6) * 0.5 + sin(wp.z * 0.07 - uTime * 0.45) * 0.5) * 0.22 * k;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SEA_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uShallow;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uTime;
uniform float uGlow;
uniform float uStars;
uniform vec4 uRipples[${MAX_RIPPLES}];
varying vec3 vWorld;
varying vec2 vSea;
${NOISE_GLSL}
void main() {
  vec2 p = vWorld.xz;
  float depth = vSea.x;
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.35 + uTime * 0.9) * 0.08;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 0.7 + uTime * 1.2) * 0.05;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 1.9 + uTime * 1.9) * 0.03;
  float n1 = vn(p * 0.5 + uTime * 0.1);
  float n2 = vn(p * 0.5 + vec2(0.37, 0.0) + uTime * 0.1);
  float n3 = vn(p * 0.5 + vec2(0.0, 0.37) + uTime * 0.1);
  g += vec2(n2 - n1, n3 - n1) * 0.3;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    float age = uTime - rp.z;
    if (rp.w <= 0.0 || age < 0.0 || age > 3.0) continue;
    vec2 dv = p - rp.xy;
    float dist = length(dv) + 1e-4;
    float x = (dist - age * (1.1 + rp.w * 0.5)) * 4.0;
    g += (dv / dist) * sin(x * 2.4) * exp(-x * x) * rp.w * exp(-age * 1.5) * 0.9;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  // Round 16: a wider, noisier shelf (depth is interpolated over the coarse ground cells, and the narrow
  // ramp drew their straight edges as a hard seam between the shallows and the deep).
  float dz = smoothstep(0.1, 4.6, depth + (vn(p * 0.06) - 0.5) * 2.2 + (vn(p * 0.23) - 0.5) * 0.9);
  vec3 shallow = mix(uShallow, vec3(0.75, 1.0, 0.95), 0.25);
  vec3 deepC = vec3(0.12, 0.2, 0.42) * (0.55 + 0.45 * length(uShallow));
  vec3 base = mix(shallow * 1.05, deepC, dz);
  float c1 = vn(p * 0.9 + vec2(uTime * 0.2, -uTime * 0.15));
  float c2 = vn(p * 1.2 - vec2(uTime * 0.18, uTime * 0.22));
  base += vec3(0.7, 1.0, 0.9) * pow(1.0 - abs(c1 - c2), 8.0) * (1.0 - dz) * 0.2;
  base += shallow * (0.3 + 0.7 * uGlow) * 0.06;
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
  if (uStars > 0.01 && R.y > 0.0) {
    vec2 sp = R.xz / (R.y + 0.35) * 90.0;
    float rr = h21(floor(sp));
    sky += vec3(0.9, 0.95, 1.0) * step(0.96, rr) * smoothstep(0.2, 0.0, length(fract(sp) - 0.5)) * uStars * 0.6;
  }
  vec3 col = mix(base, sky, fres * 0.75);
  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  col += uSunCol * vec3(1.0, 0.93, 0.82) * (smoothstep(0.35, 0.8, pow(nh, 120.0)) * 0.45 + pow(nh, 26.0) * 0.06) * smoothstep(-0.05, 0.15, uSunDir.y);
  // Soft lapping foam along the coast.
  float lap = sin(uTime * 1.1 + vSea.y * 1.4 + vn(p * 0.4) * 5.0) * 0.18;
  float foam = smoothstep(0.45, 0.0, depth + lap - (vn(p * 1.5 + uTime * 0.15) - 0.5) * 0.3);
  col = mix(col, vec3(0.97, 1.0, 1.0) * (0.85 + 0.15 * uGlow), clamp(foam, 0.0, 1.0) * 0.85);
  // Round 16: the sea fades out over the last half metre (its mesh ends on the ground grid's cells, which
  // drew hard planar seams along the coast), and the foam fades out above the waterline.
  float alpha = mix(0.7, 0.97, smoothstep(0.0, 2.0, depth)) * smoothstep(-0.15, 0.6, depth);
  alpha = max(alpha, foam * 0.9 * smoothstep(-0.5, 0.05, depth));
  gl_FragColor = vec4(max(col, vec3(0.0)), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export type Water = {
  /** The pond slots (reassigned to the nearest places as the family travels). */
  ponds: Mesh[];
  /** The open sea's material (every sea chunk shares it). */
  sea: ShaderMaterial;
  /** Gives the slots to these places (nearest first; at most POND_SLOTS). */
  assign(places: readonly Place[]): void;
  brook: Mesh;
  falls: Mesh;
  /** Add a ring ripple at (x, z) at time t (seconds). strength ≈ 0.3 nibble, 0.6 plop, 1.0+ splash. */
  ripple(x: number, z: number, t: number, strength: number): void;
  setSwirl(i: number, x: number, z: number, alpha: number, golden: number): void;
  /** 1 = an undiscovered place, veiled; 0 = found. */
  setVeil(placeId: string, v: number): void;
  update(tod: TodState, time: number): void;
  dispose(): void;
};

function pondGeometry(a: Place | Area): BufferGeometry {
  const big = a.pond.r > 15;
  const cols = big ? 160 : 112;
  const rows = big ? 34 : 24;
  const pos: number[] = [a.center.x, 0, a.center.z];
  for (let j = 1; j <= rows; j++) {
    const f = j / rows;
    for (let i = 0; i < cols; i++) {
      const th = (i / cols) * Math.PI * 2;
      const r = (pondRadius(a, th) + 0.9) * Math.pow(f, 0.8);
      pos.push(a.center.x + Math.cos(th) * r, 0, a.center.z + Math.sin(th) * r);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < cols; i++) idx.push(0, 1 + ((i + 1) % cols), 1 + i);
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const p = 1 + j * cols + i;
      const q = 1 + j * cols + ((i + 1) % cols);
      const c = 1 + (j + 1) * cols + i;
      const d = 1 + (j + 1) * cols + ((i + 1) % cols);
      idx.push(p, d, c, p, q, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A ribbon following a centre line: (x, y, z) points with a half width each. */
export function ribbon(points: { x: number; y: number; z: number; w: number }[], sideways: "x" | "z"): BufferGeometry {
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

export function flowMaterial(speed: number, sheet: number): ShaderMaterial {
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
        uTint: { value: new Color(0xc4eef0) },
        uDeep: { value: new Color(0x4fb8c8) },
        uSheet: { value: sheet },
      },
    ]),
  });
}

const moonPath = new Color(0.75, 0.82, 1.1);

export function buildWater(): Water {
  const ripples: Vector4[] = Array.from({ length: MAX_RIPPLES }, () => new Vector4(0, 0, -100, 0));
  const swirls: Vector4[] = Array.from({ length: MAX_SWIRLS }, () => new Vector4(0, 0, 0, 0));
  let nextRipple = 0;
  // Uniforms every pond shares (the same objects, so one update drives them all; one program).
  const common = {
    uShallow: { value: new Color() },
    uDeep: { value: new Color() },
    uSkyTop: { value: new Color() },
    uSkyHorizon: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: new Color() },
    uShoreTint: { value: new Color(0x2f5a3a) },
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uStars: { value: 0 },
    uVeilCol: { value: new Color(0x6a5a9a) },
    uRipples: { value: ripples },
    uSwirls: { value: swirls },
  };
  type Slot = { mesh: Mesh; mat: ShaderMaterial; id: string | null; cx: number };
  const slots: Slot[] = [];
  for (let i = 0; i < POND_SLOTS; i++) {
    const m = new ShaderMaterial({
      vertexShader: LAKE_VERT,
      fragmentShader: LAKE_FRAG,
      transparent: true,
      depthWrite: true,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog]),
    });
    Object.assign(m.uniforms, common, {
      uCenter: { value: new Vector2(0, 0) },
      uPond: { value: new Vector4(1, 0, 0, 0) },
      uPhase: { value: new Vector3() },
      uTintS: { value: new Color(1, 1, 1) },
      uTintD: { value: new Color(1, 1, 1) },
      uCalm: { value: 0 },
      uVeil: { value: 0 },
      uFallsFoot: { value: new Vector2(9999, 9999) },
    });
    const mesh = new Mesh(new BufferGeometry(), m);
    mesh.name = `pond-slot-${i}`;
    mesh.renderOrder = 1;
    mesh.visible = false;
    slots.push({ mesh, mat: m, id: null, cx: 0 });
  }
  const give = (slot: Slot, a: Place) => {
    const look = lookOf(a);
    const u = slot.mat.uniforms;
    (u.uCenter!.value as Vector2).set(a.center.x, a.center.z);
    (u.uPond!.value as Vector4).set(a.pond.r, a.pond.bumps[0], a.pond.bumps[1], a.pond.bumps[2]);
    (u.uPhase!.value as Vector3).set(a.pond.phases[0], a.pond.phases[1], a.pond.phases[2]);
    (u.uTintS!.value as Color).copy(look.waterShallow);
    (u.uTintD!.value as Color).copy(look.waterDeep);
    u.uCalm!.value = look.calm;
    // Only Moonwell has the falls; elsewhere the foam patch is parked far away.
    (u.uFallsFoot!.value as Vector2).set(a.id === "moonwell" ? 0 : 9999, a.id === "moonwell" ? -(FALLS.edge - 0.4) : 9999);
    slot.mesh.geometry.dispose();
    slot.mesh.geometry = pondGeometry(a);
    slot.mesh.name = `pond-${a.id}`;
    slot.mesh.visible = true;
    slot.id = a.id;
    slot.cx = a.center.x;
  };
  const seaMat = new ShaderMaterial({
    vertexShader: SEA_VERT,
    fragmentShader: SEA_FRAG,
    transparent: true,
    depthWrite: true,
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog]),
  });
  Object.assign(seaMat.uniforms, common);

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

  const u = common;
  return {
    ponds: slots.map((sl) => sl.mesh),
    sea: seaMat,
    assign(places) {
      const want = places.slice(0, POND_SLOTS);
      const ids = new Set<string>(want.map((p) => `${p.id}@${p.center.x}`));
      const free = slots.filter((sl) => sl.id === null || !ids.has(`${sl.id}@${sl.cx}`));
      for (const sl of free) {
        sl.id = null;
        sl.mesh.visible = false;
      }
      for (const p of want) {
        if (slots.some((sl) => sl.id === p.id && sl.cx === p.center.x)) continue;
        const sl = free.shift();
        if (sl) give(sl, p);
      }
    },
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
    setVeil(id, v) {
      const sl = slots.find((x) => x.id === id);
      if (sl) sl.mat.uniforms.uVeil!.value = v;
    },
    update(tod, time) {
      u.uShallow.value.copy(tod.waterShallow);
      u.uDeep.value.copy(tod.waterDeep);
      u.uSkyTop.value.copy(tod.skyTop);
      u.uSkyHorizon.value.copy(tod.skyHorizon);
      u.uSunDir.value.copy(tod.discDir);
      // Sun glints by day; a bright silver moon path at night.
      u.uSunCol.value.copy(tod.sun).multiplyScalar(tod.sunI * 0.12).lerp(moonPath, tod.moon);
      u.uShoreTint.value.setRGB(0.16, 0.32, 0.2).lerp(tod.hemiGround, 0.3).multiplyScalar(0.6 + 0.4 * (1 - tod.moon));
      u.uTime.value = time;
      u.uGlow.value = tod.glow;
      u.uStars.value = tod.stars;
      u.uVeilCol.value.copy(tod.fog).lerp(tod.hemiSky, 0.3).multiplyScalar(0.8);
      for (const m of [brookMat, fallsMat]) {
        m.uniforms.uTime!.value = time;
        (m.uniforms.uDeep!.value as Color).copy(tod.waterShallow).multiplyScalar(0.85);
        (m.uniforms.uTint!.value as Color).setRGB(0.93, 1, 1).lerp(tod.hemiSky, 0.25);
      }
    },
    dispose() {
      for (const sl of slots) {
        sl.mesh.geometry.dispose();
        sl.mat.dispose();
      }
      seaMat.dispose();
      brookGeo.dispose();
      brookMat.dispose();
      fallsGeo.dispose();
      fallsMat.dispose();
    },
  };
}
