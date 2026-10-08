import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const GradeShader = {
  name: "BobberGrade",
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.12 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.28 },
    uWarm: { value: 0.04 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uSat;
uniform float uContrast;
uniform float uVignette;
uniform float uWarm;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  // NaN / negative guard: bloom smears one bad pixel into a black blot.
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = max(c, vec3(0.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  // Gentle S-curve around mid grey (in linear light, before tone mapping).
  c = pow(c / 0.18, vec3(uContrast)) * 0.18;
  // Warm highlights, cool shadows.
  float hl = smoothstep(0.05, 0.8, l);
  c *= mix(vec3(1.0 - uWarm * 0.5, 1.0, 1.0 + uWarm), vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm), hl);
  vec2 d = vUv - 0.5;
  float v = 1.0 - dot(d, d) * uVignette * 2.2;
  c *= clamp(v, 0.0, 1.0);
  gl_FragColor = vec4(c, 1.0);
}`,
};

export type Post = {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  /** The render target the scene is drawn into (shader prewarm compiles against it). */
  target: WebGLRenderTarget;
  setSize(w: number, h: number): void;
  render(): void;
  dispose(): void;
};

export function buildPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number): Post {
  const target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(w / 2, h / 2), 0.42, 0.55, 0.92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    grade,
    target,
    setSize(w2, h2) {
      composer.setSize(w2, h2);
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.dispose();
      target.dispose();
    },
  };
}
