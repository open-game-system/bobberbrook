import { BufferAttribute, BufferGeometry, Color, InstancedMesh, ShaderMaterial } from "three";
import { rng } from "./noise";
import { cloudSheet } from "./painter";
import { getCards } from "./cards";

/**
 * Painted cloud banks: each cloud is a cluster of camera-facing cards cut from the painted cumulus
 * sheet (soft lit domes, shaded base, brushy tops), tinted by the time of day. Round 07's ride clouds
 * were smooth pink blobs. Instanced: the instance matrix places and sizes a whole cluster.
 */

const VERT = /* glsl */ `
attribute vec3 aOff;
attribute vec3 aCard;
varying vec2 vUv;
varying float vFade;
void main() {
  vec4 c = modelViewMatrix * instanceMatrix * vec4(aOff, 1.0);
  float sc = length(instanceMatrix[1].xyz);
  c.xy += position.xy * aCard.x * sc * vec2(1.6, 1.0);
  vUv = aCard.yz + (position.xy + 0.5) * 0.5;
  vFade = clamp(sc * 4.0, 0.0, 1.0);
  gl_Position = projectionMatrix * c;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uLit;
uniform vec3 uShade;
varying vec2 vUv;
varying float vFade;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.01) discard;
  // Light from the painted cloud's own value (unpremultiplied, so the black-keyed fringe is no darker),
  // tinted by the time of day.
  float lp = dot(t.rgb, vec3(0.3, 0.55, 0.15));
  float l = lp / max(t.a, 0.05);
  vec3 col = mix(uShade, uLit, smoothstep(0.25, 0.9, l));
  // The painted cards' black-keyed fringe and faint haze are cut (premultiplied value), and every card
  // fades out at its own edges (the paintings touch them).
  vec2 local = fract(vUv * 2.0);
  float edge = smoothstep(0.0, 0.1, min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y)));
  float a = min(1.0, t.a * 1.5) * smoothstep(0.06, 0.3, lp) * edge;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a * vFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type CloudCards = { mesh: InstancedMesh; lit: Color; shade: Color; dispose(): void };

export function buildCloudCards(count: number): CloudCards {
  const R = rng(818);
  const CARDS = 8;
  const pos: number[] = [];
  const off: number[] = [];
  const card: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < CARDS; k++) {
    // Back to front: a wide back card, smaller ones in front lower down.
    const ox = (R() - 0.5) * 6.0;
    const oy = (R() - 0.5) * 0.8 - k * 0.12;
    const oz = (k / CARDS - 0.5) * 3.0;
    const size = 9.0 - k * 0.5 + R() * 2.0;
    const u0 = Math.floor(R() * 2) * 0.5;
    const v0 = Math.floor(R() * 2) * 0.5;
    const b = pos.length / 3;
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as [number, number][]) {
      pos.push(x, y, 0);
      off.push(ox, oy, oz);
      card.push(size, u0, v0);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aOff", new BufferAttribute(new Float32Array(off), 3));
  g.setAttribute("aCard", new BufferAttribute(new Float32Array(card), 3));
  g.setIndex(idx);
  // Round 11: the Codex-painted cumulus cards when the kit has them, else the code-painted sheet.
  const painted = getCards()?.clouds ?? null;
  const tex = painted ?? cloudSheet();
  const lit = new Color(1, 1, 1);
  const shade = new Color(0.5, 0.45, 0.7);
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { map: { value: tex }, uLit: { value: lit }, uShade: { value: shade } },
  });
  const mesh = new InstancedMesh(g, mat, count);
  mesh.frustumCulled = false;
  // After the fog-of-war banks (7): the clouds float over the land far below.
  mesh.renderOrder = 8;
  return {
    mesh,
    lit,
    shade,
    dispose() {
      g.dispose();
      mat.dispose();
      if (!painted) tex.dispose();
    },
  };
}
