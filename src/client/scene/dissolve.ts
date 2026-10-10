import { HalfFloatType, LinearFilter, ShaderMaterial, WebGLRenderTarget, type WebGLRenderer } from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

/**
 * Round 19: the cut into and out of the campfire (round 18 session 148 s, 156 s) is a painted dissolve: the
 * last frame before the cut is held and brushed away, stroke by stroke, over the new shot as it settles in. The
 * camera still lands at once (camera.campfire.test.ts); only what the eye sees eases.
 */
export const DISSOLVE_S = 0.9;
/** The old frame held whole for this long before the strokes start to clear it. */
const HOLD_S = 0.08;

/** How much of the held frame shows `age` seconds after the cut (1 at the cut, 0 when done or idle). */
export function dissolveK(age: number): number {
  if (age < 0 || age >= DISSOLVE_S) return 0;
  if (age <= HOLD_S) return 1;
  const x = (age - HOLD_S) / (DISSOLVE_S - HOLD_S);
  return 1 - x * x * (3 - 2 * x);
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tHeld;
uniform float uK;
uniform float uAspect;
varying vec2 vUv;
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 cur = texture2D(tDiffuse, vUv);
  // Long diagonal brush strokes (noise stretched along a slant), coarse then fine.
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 q = mat2(0.82, -0.57, 0.57, 0.82) * p;
  float n = 0.62 * vn(q * vec2(3.0, 16.0)) + 0.38 * vn(q * vec2(7.0, 37.0) + 5.0);
  float m = smoothstep(n - 0.1, n + 0.1, uK * 1.2 - 0.1);
  vec4 held = texture2D(tHeld, vUv);
  gl_FragColor = vec4(mix(cur.rgb, held.rgb, m), cur.a);
}`;

/**
 * After the grade: idle, it keeps a half-size copy of each finished frame and passes the frame through
 * untouched; while a dissolve plays it holds that copy and brushes it away over the live frame. One program for
 * both (compiled on the first frame, so the program count stays flat in play).
 */
export class DissolvePass extends Pass {
  private readonly held: WebGLRenderTarget;
  private readonly mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { tDiffuse: { value: null }, tHeld: { value: null }, uK: { value: 0 }, uAspect: { value: 16 / 9 } },
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new FullScreenQuad(this.mat);
  /** 0..1: how much of the held frame shows (set per frame from dissolveK). */
  k = 0;

  constructor(w: number, h: number) {
    super();
    this.held = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.setSize(w, h);
  }

  override setSize(w: number, h: number): void {
    this.held.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    this.mat.uniforms.uAspect!.value = w / Math.max(1, h);
  }

  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const u = this.mat.uniforms;
    u.tDiffuse!.value = readBuffer.texture;
    if (this.k <= 0) {
      // Idle: copy the finished frame (k 0 = the frame itself) and leave the chain's buffers as they are.
      u.uK!.value = 0;
      u.tHeld!.value = readBuffer.texture;
      renderer.setRenderTarget(this.held);
      this.quad.render(renderer);
      this.needsSwap = false;
      return;
    }
    u.uK!.value = this.k;
    u.tHeld!.value = this.held.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    this.needsSwap = true;
  }

  override dispose(): void {
    this.held.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
