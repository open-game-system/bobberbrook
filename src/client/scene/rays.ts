import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, Vector3 } from "three";
import { NORTH, outerRadius } from "../../game/world";
import { heightAt } from "./terrain";
import type { TodState } from "./tod";

/** God rays: soft additive shafts slanting down through the canopy toward the lake. */
export type Rays = { mesh: Mesh; update(tod: TodState, time: number): void; dispose(): void };

export function buildRays(): Rays {
  const pos: number[] = [];
  const uv: number[] = [];
  const seed: number[] = [];
  const shafts: [number, number, number][] = [
    [NORTH - 0.75, 2, 3.2], [NORTH - 0.35, 5, 2.4], [NORTH + 0.4, 3, 3.6], [NORTH + 0.85, 4, 2.6], [NORTH + 1.3, 1, 3.0], [NORTH - 1.25, 2, 2.8],
  ];
  const dir = new Vector3(0.35, -1, 0.55).normalize();
  shafts.forEach(([th, e, w], i) => {
    const r = outerRadius(th) + e;
    const top = new Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
    top.y = heightAt(top.x, top.z) + 19;
    const len = 26;
    const bot = top.clone().addScaledVector(dir, len);
    // Two crossed quads.
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
      const a = top.clone().addScaledVector(side, -w * 0.5);
      const b = top.clone().addScaledVector(side, w * 0.5);
      const c = bot.clone().addScaledVector(side, w * 1.1);
      const d = bot.clone().addScaledVector(side, -w * 1.1);
      for (const p of [a, b, c, a, c, d]) pos.push(p.x, p.y, p.z);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      for (let j = 0; j < 6; j++) seed.push(i * 1.7 + k);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("aSeed", new BufferAttribute(new Float32Array(seed), 1));
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uColor: { value: new Color() }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  float across = sin(vUv.x * 3.14159);
  float along = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
  float pulse = 0.7 + 0.3 * sin(uTime * 0.4 + vSeed * 2.3);
  float streak = 0.75 + 0.25 * sin(vUv.x * 18.0 + vSeed * 5.0);
  gl_FragColor = vec4(uColor * across * across * along * pulse * streak, 1.0);
}`,
  });
  const mesh = new Mesh(g, mat);
  mesh.renderOrder = 9;
  mesh.frustumCulled = false;
  const col = mat.uniforms.uColor!.value as Color;
  return {
    mesh,
    update(tod, time) {
      // Strongest in misty morning and rose dusk, faint moonbeams at night.
      const k = 0.07 + 0.08 * tod.mist - 0.03 * tod.moon;
      col.copy(tod.sun).multiplyScalar(Math.max(0.03, k));
      mat.uniforms.uTime!.value = time;
    },
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}
