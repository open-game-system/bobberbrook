import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from "three";
import { FOG_TILE } from "../../game/lake";
import type { TodState } from "./tod";
import { heightAt } from "./terrain";
import { placesAround } from "./worldQuery";
import type { Jobs } from "./stream";

/**
 * Fog of war: the world the family hasn't explored lies under a soft, darker violet mist blanket (a few
 * stacked layers hugging the land). It lifts tile by tile as `lake.revealed` grows; places the family
 * has found are always clear. One draw call; a small texture of tiles round the focus drives it.
 */

const N = 48;
const VIOLET = new Color(0.16, 0.11, 0.3);
const LAYERS = [1.2, 5.5, 10.5, 16];

const VERT = /* glsl */ `
#include <fog_pars_vertex>
attribute float aLayer;
attribute float aClear;
uniform float uTime;
varying vec3 vWorld;
varying float vLayer;
varying float vClear;
void main() {
  vClear = aClear;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += sin(uTime * 0.25 + wp.x * 0.05 + aLayer * 2.0) * 0.6 * aLayer;
  vWorld = wp.xyz;
  vLayer = aLayer;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uCol;
uniform vec3 uTop;
varying vec3 vWorld;
varying float vLayer;
varying float vClear;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // A cloudy edge, never a tile grid.
  float wob = vn(vWorld.xz * 0.045 + uTime * 0.02) - 0.5;
  float veil = 1.0 - smoothstep(0.15, 0.7, vClear + wob * 0.45);
  float n = vn(vWorld.xz * 0.05 + vec2(uTime * 0.03, vLayer * 3.1)) * 0.6 + vn(vWorld.xz * 0.13 - uTime * 0.04) * 0.4;
  float a = veil * mix(0.55, 1.0, n) * mix(0.95, 0.55, vLayer);
  if (a < 0.004) discard;
  vec3 col = mix(uCol, uTop, vLayer * 0.7 + n * 0.3);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 unfogged = gl_FragColor.rgb;
  #include <fog_fragment>
  // Half the distance haze: the unexplored stays darker than the far forest round it.
  gl_FragColor.rgb = mix(unfogged, gl_FragColor.rgb, 0.3);
}`;

export type FogOfWar = {
  mesh: Mesh;
  /** revealed: the lake's tiles (null: no fog, e.g. before the first lake); found: place ids. */
  update(tod: TodState, time: number, dt: number, fx: number, fz: number, revealed: readonly string[] | null, found: readonly string[]): void;
  /** How veiled a world point is (0 clear .. 1 fogged), for other systems. */
  veilAt(x: number, z: number): number;
  stats(): Record<string, unknown>;
  reset(): void;
  dispose(): void;
};

export function buildFogOfWar(jobs: Jobs): FogOfWar {
  const data = new Uint8Array(N * N * 4).fill(255);
  const level = new Float32Array(N * N).fill(1);
  const want = new Float32Array(N * N).fill(1);
  const V = N + 1;
  const pos = new Float32Array(V * V * LAYERS.length * 3);
  const layer = new Float32Array(V * V * LAYERS.length);
  const clearA = new Float32Array(V * V * LAYERS.length);
  const idx: number[] = [];
  LAYERS.forEach((_, l) => {
    const base = l * V * V;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) layer[base + j * V + i] = l / (LAYERS.length - 1);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = base + j * V + i;
      idx.push(a, a + V, a + 1, a + 1, a + V, a + V + 1);
    }
  });
  const geo = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("aLayer", new BufferAttribute(layer, 1));
  const clearAttr = new BufferAttribute(clearA, 1);
  geo.setAttribute("aClear", clearAttr);
  geo.setIndex(idx);
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog]),
  });
  Object.assign(mat.uniforms, {
    uTime: { value: 0 },
    uCol: { value: new Color() },
    uTop: { value: new Color() },
  });
  const mesh = new Mesh(geo, mat);
  mesh.name = "fog-of-war";
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.visible = false;
  // The grid's origin tile (lower corner), and the one being built.
  let oi = 1e9;
  let oj = 1e9;
  let building = false;
  let lastRevealed = -1;
  let lastFound = "";
  let haveFog = false;
  let snap = true;

  function* shift(ni: number, nj: number): Generator<void, void> {
    const next = new Float32Array(V * V);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const x = (ni + i) * FOG_TILE;
        const z = (nj + j) * FOG_TILE;
        next[j * V + i] = Math.max(0, heightAt(x, z));
      }
      if (j % 4 === 3) yield;
    }
    // Carry the eased levels over to the new grid.
    const old = level.slice();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const si = i + ni - oi;
      const sj = j + nj - oj;
      level[j * N + i] = si >= 0 && sj >= 0 && si < N && sj < N ? old[sj * N + si]! : 0;
    }
    LAYERS.forEach((h, l) => {
      const base = l * V * V;
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const k = (base + j * V + i) * 3;
        pos[k] = (ni + i) * FOG_TILE;
        pos[k + 1] = next[j * V + i]! + h;
        pos[k + 2] = (nj + j) * FOG_TILE;
      }
    });
    posAttr.needsUpdate = true;
    oi = ni;
    oj = nj;
    lastRevealed = -1;
    building = false;
  }

  /** Tile levels to the grid's corners (the mean of the four tiles round each; outside the grid: fogged). */
  function push(): void {
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      let sum = 0;
      for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const ti = i + di;
        const tj = j + dj;
        sum += ti >= 0 && tj >= 0 && ti < N && tj < N ? level[tj * N + ti]! : 0;
      }
      const c = sum / 4;
      for (let l = 0; l < LAYERS.length; l++) clearA[l * V * V + j * V + i] = c;
    }
    clearAttr.needsUpdate = true;
  }

  const sampleOpen = (x: number, z: number, found: Set<string>) => {
    for (const p of placesAround(x, z)) {
      if (!found.has(p.id)) continue;
      if (Math.hypot(x - p.center.x, z - p.center.z) < p.pond.r + p.clearing + 18) return true;
    }
    return false;
  };

  return {
    mesh,
    update(tod, time, dt, fx, fz, revealed, found) {
      mat.uniforms.uTime!.value = time;
      (mat.uniforms.uCol!.value as Color).copy(tod.fog).lerp(tod.hemiSky, 0.25).multiplyScalar(0.25).lerp(VIOLET, 0.6);
      (mat.uniforms.uTop!.value as Color).copy(tod.fog).lerp(tod.hemiSky, 0.45).multiplyScalar(0.45).lerp(VIOLET, 0.4);
      haveFog = revealed !== null;
      mesh.visible = haveFog && oi < 1e8;
      if (!revealed) return;
      const ci = Math.floor(fx / FOG_TILE) - N / 2;
      const cj = Math.floor(fz / FOG_TILE) - N / 2;
      if (!building && (Math.abs(ci - oi) > 3 || Math.abs(cj - oj) > 3)) {
        building = true;
        const g = shift(ci, cj);
        if (oi > 1e8) {
          // First time: no fog shows until it's in place, so build it now.
          for (let r = g.next(); !r.done; r = g.next());
        } else jobs.add(1, g);
      }
      const fk = found.join(",");
      if (revealed.length !== lastRevealed || fk !== lastFound) {
        lastRevealed = revealed.length;
        lastFound = fk;
        const set = new Set(revealed);
        const fs = new Set(found);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const ti = oi + i;
          const tj = oj + j;
          const open = set.has(`${ti},${tj}`) || sampleOpen((ti + 0.5) * FOG_TILE, (tj + 0.5) * FOG_TILE, fs);
          want[j * N + i] = open ? 1 : 0;
        }
        if (snap) {
          level.set(want);
          for (let q = 0; q < N * N; q++) data[q * 4] = Math.round(level[q]! * 255);
          push();
          snap = false;
        }
      }
      let changed = false;
      const k = Math.min(1, dt / 2.2);
      for (let q = 0; q < N * N; q++) {
        const d = want[q]! - level[q]!;
        if (d === 0) continue;
        level[q] = Math.abs(d) <= k ? want[q]! : level[q]! + Math.sign(d) * k;
        const v = Math.round(level[q]! * 255);
        if (v !== data[q * 4]) {
          data[q * 4] = v;
          changed = true;
        }
      }
      if (changed) push();
    },
    stats: () => ({ zeros: data.filter((v, i) => i % 4 === 0 && v === 0).length, version: clearA.reduce((a, b) => a + b, 0) / clearA.length, origin: [oi, oj], p0: [pos[0], pos[1], pos[2]], vis: mesh.visible }),
    veilAt(x, z) {
      if (!haveFog || oi > 1e8) return 0;
      const i = Math.floor(x / FOG_TILE) - oi;
      const j = Math.floor(z / FOG_TILE) - oj;
      if (i < 0 || j < 0 || i >= N || j >= N) return 1;
      return 1 - level[j * N + i]!;
    },
    reset() {
      oi = 1e9;
      oj = 1e9;
      building = false;
      lastRevealed = -1;
      snap = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
