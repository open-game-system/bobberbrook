import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from "three";
import { AREAS, TRAILS, pondRadius, type AreaId } from "../../game/world";
import { rng } from "./noise";
import type { TodState } from "./tod";

/**
 * Soft drifting mist cards (camera-facing, one draw call for the whole valley): low mist over the
 * marsh, and the veils that hide places nobody has found yet, with a glow at each trail's end that
 * pulls you in.
 */

const VERT = /* glsl */ `
#include <fog_pars_vertex>
attribute float aAlpha;
attribute float aSeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uNear;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vSeed;
void main() {
  vUv = uv;
  vAlpha = aAlpha;
  vColor = aColor;
  vSeed = aSeed;
  vec3 c = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float s = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
  c.x += sin(uTime * 0.07 + aSeed * 6.0) * 1.6;
  c.z += cos(uTime * 0.05 + aSeed * 4.0) * 1.2;
  c.y += sin(uTime * 0.2 + aSeed * 9.0) * 0.15;
  vec4 mvPosition = viewMatrix * vec4(c, 1.0);
  // A card in front of the family thins out, so the mist hides the place, never the fishers.
  if (uNear > 0.0) vAlpha *= 0.15 + 0.85 * smoothstep(uNear - 2.0, uNear + 6.0, -mvPosition.z);
  mvPosition.xy += position.xy * s;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uTime;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vSeed;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 q = vUv - 0.5;
  // A soft flattened puff, broken up by slowly moving noise.
  float d = length(q * vec2(1.0, 1.7));
  float n = vn(vUv * 3.0 + vec2(uTime * 0.03, vSeed * 7.0)) * 0.6 + vn(vUv * 7.0 - vec2(uTime * 0.05, 0.0)) * 0.4;
  float a = smoothstep(0.5, 0.1, d) * (0.45 + 0.55 * n) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

type Card = { area: AreaId; kind: "marsh" | "veil" | "glow"; base: number };

export type Mist = {
  mesh: InstancedMesh;
  update(tod: TodState, time: number, veil: Float32Array, near: number): void;
  dispose(): void;
};

export function buildMist(full: boolean): Mist {
  const R = rng(808);
  const cards: Card[] = [];
  const mats: Matrix4[] = [];
  const add = (area: AreaId, kind: Card["kind"], x: number, y: number, z: number, s: number, base: number) => {
    cards.push({ area, kind, base });
    mats.push(new Matrix4().makeScale(s, s, s).setPosition(x, y, z));
  };
  for (const a of AREAS) {
    if (a.id === "moonwell") continue;
    // Low mist lying on the marsh water.
    if (a.id === "mistmarsh") {
      for (let i = 0; i < (full ? 16 : 9); i++) {
        const th = R() * Math.PI * 2;
        const r = pondRadius(a, th) * Math.sqrt(R()) * 0.95;
        add(a.id, "marsh", a.center.x + Math.cos(th) * r, 0.7, a.center.z + Math.sin(th) * r, 7 + R() * 5, 0.22);
      }
    }
    // The veil: a thick bank of mist over the whole clearing.
    const R0 = a.pond.r + a.clearing;
    for (let i = 0; i < (full ? 22 : 12); i++) {
      const th = R() * Math.PI * 2;
      const r = R0 * Math.sqrt(R()) * 1.05;
      add(a.id, "veil", a.center.x + Math.cos(th) * r, 1.5 + R() * 4, a.center.z + Math.sin(th) * r, 12 + R() * 8, 0.85);
    }
  }
  // At each trail's end into a hidden place: a soft glow in the mist, to walk toward.
  for (const t of TRAILS) {
    for (const [end, id] of [[t.from, t.joins[0]], [t.to, t.joins[1]]] as const) {
      if (id === "moonwell") continue;
      for (let k = 0; k < 3; k++) add(id, "glow", end.x + (R() - 0.5) * 3, 1.6 + k * 1.1, end.z + (R() - 0.5) * 3, 5 + k * 2.5, 0.55 - k * 0.12);
    }
  }
  const geo = new PlaneGeometry(1, 1);
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uNear: { value: 0 } }]),
  });
  const mesh = new InstancedMesh(geo, mat, cards.length);
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  const alpha = new InstancedBufferAttribute(new Float32Array(cards.length), 1);
  const seed = new InstancedBufferAttribute(new Float32Array(cards.map(() => R())), 1);
  const color = new InstancedBufferAttribute(new Float32Array(cards.length * 3), 3);
  geo.setAttribute("aAlpha", alpha);
  geo.setAttribute("aSeed", seed);
  geo.setAttribute("aColor", color);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = "mist";
  const idx = new Map(AREAS.map((a, i) => [a.id, i]));
  const veilCol = new Color();
  const glowCol = new Color();
  const marshCol = new Color();
  return {
    mesh,
    update(tod, time, veil, near) {
      mat.uniforms.uTime!.value = time;
      mat.uniforms.uNear!.value = near;
      veilCol.copy(tod.fog).lerp(tod.hemiSky, 0.35).multiplyScalar(0.95);
      glowCol.setRGB(0.75, 0.7, 1.0).lerp(tod.hemiSky, 0.2).multiplyScalar(1.2 + 0.8 * tod.glow);
      marshCol.copy(tod.fog).lerp(new Color(1, 1, 1), 0.35);
      cards.forEach((c, i) => {
        const v = veil[idx.get(c.area) ?? 0] ?? 0;
        let a = 0;
        let col = veilCol;
        if (c.kind === "marsh") {
          a = c.base * (0.5 + tod.mist) * (1 - v);
          col = marshCol;
        } else if (c.kind === "veil") a = c.base * v;
        else {
          a = c.base * v * (0.8 + 0.2 * Math.sin(time * 1.3 + i));
          col = glowCol;
        }
        alpha.setX(i, a);
        color.setXYZ(i, col.r, col.g, col.b);
      });
      alpha.needsUpdate = true;
      color.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
