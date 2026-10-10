import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, ShaderMaterial } from "three";
import { rng } from "./noise";
import { getCards } from "./cards";

/**
 * The campfire's flames and embers (round 07: a stack of additive cones): camera-facing flame cards
 * with a noise-licked teardrop shape (white-gold core, orange body, red tips), flickering and leaning,
 * and a stream of embers rising, drifting and winking out. One draw, one program.
 */

const VERT = /* glsl */ `
attribute vec3 aOff;
attribute vec4 aCard; // size, seed, kind (0 flame, 1 ember), speed
uniform float uTime;
uniform float uFire;
uniform float uPainted;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
varying float vLife;
void main() {
  vUv = position.xy + 0.5;
  vSeed = aCard.y;
  vKind = aCard.z;
  vec3 c = aOff;
  float size = aCard.x;
  vLife = 0.0;
  if (aCard.z > 1.5) {
    // The painted embers card: a still card over the fire (its sparks scroll up in the fragment shader).
    size *= 0.85 + 0.15 * uFire;
  } else if (aCard.z > 0.5) {
    // An ember: rises, drifts and fades over its life.
    float life = fract(uTime * aCard.w + aCard.y * 7.31);
    vLife = life;
    c.y += life * 2.6 * (0.7 + 0.5 * uFire);
    c.x += sin(uTime * 2.1 + aCard.y * 40.0) * 0.25 * life + (aCard.y - 0.5) * life * 0.8;
    c.z += cos(uTime * 1.7 + aCard.y * 23.0) * 0.25 * life;
    size *= (1.0 - life * 0.6);
  } else {
    size *= 0.75 + 0.25 * uFire + 0.08 * sin(uTime * (9.0 + aCard.y * 5.0) + aCard.y * 20.0);
  }
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  // Flames stand on their base (grow upward); embers are centred.
  vec2 corner = position.xy;
  if (aCard.z < 0.5 || aCard.z > 1.5) corner.y += 0.5;
  mv.xy += corner * size * (aCard.z < 0.5 ? vec2(uPainted > 0.5 ? 0.9 : 0.62, 1.0) : vec2(1.0));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uFire;
uniform float uPainted;
uniform sampler2D tFlameA;
uniform sampler2D tFlameB;
uniform sampler2D tEmbers;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
varying float vLife;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  if (vKind > 1.5) {
    // Painted embers rising: the card scrolls up and fades near its wrap and its top.
    float y = fract(vUv.y - uTime * 0.22);
    vec4 e = texture2D(tEmbers, vec2(vUv.x, y));
    float a = e.a * smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.85, y) * smoothstep(1.0, 0.55, vUv.y) * (0.6 + 0.4 * uFire);
    gl_FragColor = vec4(e.rgb * a * 1.4, a);
    return;
  }
  if (vKind > 0.5) {
    float d = length(vUv - 0.5);
    float a = smoothstep(0.5, 0.0, d) * (1.0 - smoothstep(0.6, 1.0, vLife)) * smoothstep(0.0, 0.08, vLife);
    vec3 col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.85, 0.5), smoothstep(0.25, 0.0, d)) * 2.2;
    gl_FragColor = vec4(col * a, a);
    return;
  }
  vec2 uv = vUv;
  float t = uTime * (2.4 + vSeed);
  float n = vn(vec2(uv.x * 3.0 + vSeed * 13.0, uv.y * 3.5 - t)) * 0.65 + vn(vec2(uv.x * 7.0 - vSeed * 5.0, uv.y * 7.0 - t * 1.7)) * 0.35;
  if (uPainted > 0.5) {
    // Round 11: the Codex-painted licks, swaying more toward the tip, breathing in height, half of them
    // mirrored, crossfading between the two paintings (a slow flipbook).
    vec2 q = vec2(uv.x + (n - 0.5) * 0.14 * uv.y + sin(t * 0.7 + vSeed * 9.0) * 0.04 * uv.y, uv.y / (0.9 + 0.12 * sin(t * 1.3 + vSeed * 7.0)));
    if (fract(vSeed * 3.7) > 0.5) q.x = 1.0 - q.x;
    float k = 0.5 + 0.5 * sin(t * 0.8 + vSeed * 11.0);
    vec4 f = mix(texture2D(tFlameA, q), texture2D(tFlameB, q), k * smoothstep(0.2, 0.8, vSeed + 0.3));
    float a = f.a * (0.75 + 0.25 * uFire) * step(q.y, 1.0);
    gl_FragColor = vec4(f.rgb * a * 1.5, a);
    return;
  }
  // Licks lean and sway, more toward the tip.
  float x = uv.x - 0.5 + (n - 0.5) * 0.55 * uv.y + sin(t * 0.7 + vSeed * 9.0) * 0.07 * uv.y;
  // Round 09: the soft teardrop still read as a cone. Narrower licks with a forked, torn top: two
  // tongues split by noise, holes eaten out of the upper body, a hot white-gold heart low down.
  float w = 0.34 * pow(max(0.0, 1.0 - uv.y), 0.9) * (0.7 + 0.3 * smoothstep(0.0, 0.12, uv.y));
  float fork = smoothstep(0.35, 0.9, uv.y) * smoothstep(0.08, 0.0, abs(x + (vSeed - 0.5) * 0.1)) * 0.9;
  float torn = smoothstep(0.45, 0.75, vn(vec2(uv.x * 9.0 + vSeed * 31.0, uv.y * 6.0 - t * 2.2))) * smoothstep(0.35, 0.95, uv.y);
  float body = smoothstep(w, w * 0.3, abs(x)) * smoothstep(1.0, 0.5, uv.y + (n - 0.5) * 0.6) * (1.0 - fork) * (1.0 - torn * 0.85);
  float core = smoothstep(w * 0.6, 0.0, abs(x)) * smoothstep(0.6, 0.05, uv.y + (n - 0.5) * 0.3);
  vec3 col = mix(vec3(0.9, 0.12, 0.03), vec3(1.0, 0.48, 0.08), smoothstep(0.0, 0.55, body));
  col = mix(col, vec3(1.0, 0.86, 0.5), core);
  float a = clamp(body * (0.75 + 0.25 * uFire), 0.0, 1.0);
  gl_FragColor = vec4(col * a * 1.8, a);
}`;

export type CampfireFx = { mesh: Mesh; update(time: number, fire: number): void; dispose(): void };

export function buildCampfireFx(x: number, y: number, z: number): CampfireFx {
  const R = rng(4040);
  const pos: number[] = [];
  const off: number[] = [];
  const card: number[] = [];
  const idx: number[] = [];
  const quad = (ox: number, oy: number, oz: number, size: number, seed: number, kind: number, speed: number) => {
    const b = pos.length / 3;
    for (const [qx, qy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as [number, number][]) {
      pos.push(qx, qy, 0);
      off.push(x + ox, y + oy, z + oz);
      card.push(size, seed, kind, speed);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // Flames: a tall middle lick and a ring of smaller ones round it.
  quad(0, 0, 0, 1.35, R(), 0, 0);
  quad(0.08, 0, -0.05, 1.15, R(), 0, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.5;
    const r = i % 2 === 0 ? 0.3 : 0.16;
    quad(Math.cos(a) * r, 0, Math.sin(a) * r, 0.55 + R() * 0.5, R(), 0, 0);
  }
  // Embers.
  for (let i = 0; i < 26; i++) quad((R() - 0.5) * 0.5, 0.3, (R() - 0.5) * 0.5, 0.06 + R() * 0.06, R(), 1, 0.25 + R() * 0.35);
  // The painted embers card (drawn only when the kit has it).
  const cards = getCards();
  if (cards) quad(0, 0.5, 0.05, 2.0, R(), 2, 0);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aOff", new BufferAttribute(new Float32Array(off), 3));
  g.setAttribute("aCard", new BufferAttribute(new Float32Array(card), 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uFire: { value: 0 }, uPainted: { value: cards ? 1 : 0 }, tFlameA: { value: cards?.flameA ?? null }, tFlameB: { value: cards?.flameB ?? null }, tEmbers: { value: cards?.embers ?? null } },
  });
  const mesh = new Mesh(g, mat);
  mesh.name = "campfire-flames";
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return {
    mesh,
    update(time, fire) {
      mat.uniforms.uTime!.value = time;
      mat.uniforms.uFire!.value = fire;
    },
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}
