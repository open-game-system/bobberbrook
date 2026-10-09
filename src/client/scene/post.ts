import {
  Color,
  DepthTexture,
  PerspectiveCamera,
  HalfFloatType,
  LinearFilter,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

/** The layer the name tags live on: drawn after the post chain, so the painterly filter never smears them. */
export const TAG_LAYER = 1;
/** Screen spots kept crisp (the fishers' heads and faces). */
export const CRISP_SPOTS = 4;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * The painted grade (linear light, before tone mapping): Ashenvale's split palette — violet shadows,
 * teal mid-tones, warm lantern highlights — a soft gamut squeeze on hot reds and oranges (so warm
 * places glow amber instead of crushing to red), a gentle vignette and a still canvas grain.
 */
const GradeShader = {
  name: "BobberPaintGrade",
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.06 },
    uContrast: { value: 1.04 },
    uVignette: { value: 0.3 },
    uGain: { value: new Color(1, 1, 1) },
    uShadowTint: { value: new Color(0.86, 0.8, 1.12) },
    uMidTint: { value: new Color(0.95, 1.03, 1.03) },
    uHighTint: { value: new Color(1.07, 1.01, 0.9) },
    uGrain: { value: 0.035 },
    uRes: { value: new Vector2(1920, 1080) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uSat;
uniform float uContrast;
uniform float uVignette;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uMidTint;
uniform vec3 uHighTint;
uniform float uGrain;
uniform vec2 uRes;
varying vec2 vUv;
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = max(c, vec3(0.0)) * uGain;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Hot reds and oranges: pull the strongest channel's lead in (hue kept), so ember woods read amber.
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float warmLead = clamp((c.r - c.b) / max(mx, 1e-4), 0.0, 1.0) * smoothstep(0.55, 0.95, (mx - mn) / max(mx, 1e-4));
  c = mix(c, vec3(l) + (c - vec3(l)) * 0.78, warmLead * 0.6);
  c = mix(vec3(l), c, uSat);
  c = pow(max(c, vec3(0.0)) / 0.18, vec3(uContrast)) * 0.18;
  // Three-way split tone by luminance (perceptual-ish: on sqrt of linear light).
  float pl = sqrt(clamp(l, 0.0, 4.0));
  float wS = 1.0 - smoothstep(0.08, 0.42, pl);
  float wH = smoothstep(0.55, 0.95, pl);
  float wM = max(0.0, 1.0 - wS - wH);
  c *= uShadowTint * wS + uMidTint * wM + uHighTint * wH;
  // Still canvas: a fine tooth and a soft woven unevenness (screen-fixed, like paint on a canvas).
  vec2 px = vUv * uRes;
  float tooth = h12(floor(px)) - 0.5;
  float weave = vn2(px * vec2(0.19, 0.21)) * 0.6 + vn2(px * 0.031) * 0.4 - 0.5;
  c *= 1.0 + (tooth * 0.55 + weave) * uGrain;
  vec2 d = vUv - 0.5;
  float v = 1.0 - dot(d, d) * uVignette * 2.2;
  c *= clamp(v, 0.0, 1.0);
  gl_FragColor = vec4(c, 1.0);
}`,
};

/**
 * Painted contact shadow, then the highlight knee. Contact shadow: a crease detector on the depth
 * buffer (a pixel whose opposite neighbours both stand nearer the camera sits in a hollow: where a
 * mushroom stem, a boot or a rock meets the ground), darkened toward a cool violet the way a painter
 * glazes the contact. Planar ground at a grazing angle cancels out, so open fields stay clean.
 * Highlights then roll off before bloom: a soft knee on each pixel's brightest channel (hue kept), so
 * glowing caps, lanterns, foam and falls can glow but never bloom the TV to white.
 */
const KneeShader = {
  name: "BobberKneeAO",
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new Vector2(1 / 1920, 1 / 1080) },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    /** Pixels per metre at 1 m depth (the AO radius is a fixed world size). */
    uPxPerM: { value: 1000 },
    uKnee: { value: 0.66 },
    uMax: { value: 1.12 },
    uAO: { value: 0.62 },
    uAOTint: { value: new Color(0.5, 0.44, 0.7) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uPxPerM;
uniform float uKnee;
uniform float uMax;
uniform float uAO;
uniform vec3 uAOTint;
varying vec2 vUv;
float zAt(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
void main() {
  vec4 t = texture2D(tDiffuse, vUv);
  vec3 c = t.rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = max(c, vec3(0.0));
  float d0 = texture2D(tDepth, vUv).x;
  if (d0 < 0.9999) {
    float z0 = -perspectiveDepthToViewZ(d0, uNear, uFar);
    float r = clamp(0.45 * uPxPerM / z0, 2.0, 28.0);
    float occ = 0.0;
    for (int i = 0; i < 4; i++) {
      float a = float(i) * 0.785398 + 0.39;
      vec2 o = vec2(cos(a), sin(a)) * r * uTexel * (i == 1 || i == 3 ? 0.6 : 1.0);
      float dA = z0 - zAt(vUv + o);
      float dB = z0 - zAt(vUv - o);
      // Second difference (planes cancel), only for near neighbours (no halo round far silhouettes).
      float crease = (dA + dB) / (0.12 + z0 * 0.004);
      float range = 1.0 - smoothstep(0.6, 1.6, max(dA, dB));
      occ += clamp(crease, 0.0, 1.0) * range;
    }
    occ = smoothstep(0.0, 1.0, occ * 0.25) * uAO * (1.0 - smoothstep(60.0, 140.0, z0));
    c *= mix(vec3(1.0), uAOTint, occ);
  }
  float m = max(c.r, max(c.g, c.b));
  if (m > uKnee) {
    float r = uMax - uKnee;
    float mm = uKnee + r * (1.0 - exp(-(m - uKnee) / r));
    c *= mm / m;
    // Very hot pixels also lose a little saturation toward a pale warm tint (painted highlights, not neon).
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(l) * vec3(1.02, 1.0, 0.96), smoothstep(uKnee, uMax, m) * 0.15);
  }
  gl_FragColor = vec4(c, t.a);
}`,
};

/** The knee + contact-shadow pass: reads the scene's colour and its resolved depth. */
class KneeAOPass extends Pass {
  private readonly mat = new ShaderMaterial(KneeShader);
  private readonly quad = new FullScreenQuad();
  private readonly texel = new Vector2();
  constructor(private readonly camera: Camera) {
    super();
    this.mat.uniforms.uTexel = { value: this.texel };
    this.quad.material = this.mat;
  }
  override setSize(w: number, h: number): void {
    this.texel.set(1 / Math.max(1, w), 1 / Math.max(1, h));
  }
  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const u = this.mat.uniforms;
    u.tDiffuse!.value = readBuffer.texture;
    u.tDepth!.value = readBuffer.depthTexture;
    const cam = this.camera;
    if (cam instanceof PerspectiveCamera) {
      u.uNear!.value = cam.near;
      u.uFar!.value = cam.far;
      u.uPxPerM!.value = 1 / (this.texel.y * 2 * Math.tan((cam.fov * Math.PI) / 360));
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  override dispose(): void {
    this.mat.dispose();
    this.quad.dispose();
  }
}

/** Structure tensor (half res): which way the image's edges and strokes run at each pixel. */
const TensorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new Vector2(1 / 1920, 1 / 1080) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 tp(float x, float y) { return min(texture2D(tDiffuse, vUv + vec2(x, y) * uTexel * 2.0).rgb, vec3(1.4)); }
void main() {
  vec3 tl = tp(-1.0, 1.0), t = tp(0.0, 1.0), tr = tp(1.0, 1.0);
  vec3 l = tp(-1.0, 0.0), r = tp(1.0, 0.0);
  vec3 bl = tp(-1.0, -1.0), b = tp(0.0, -1.0), br = tp(1.0, -1.0);
  vec3 sx = (tr + 2.0 * r + br - tl - 2.0 * l - bl) * 0.25;
  vec3 sy = (tl + 2.0 * t + tr - bl - 2.0 * b - br) * 0.25;
  gl_FragColor = vec4(dot(sx, sx), dot(sx, sy), dot(sy, sy), 1.0);
}`,
};

/**
 * Anisotropic Kuwahara, 8 sectors, at half resolution: each sector of an ellipse stretched along the
 * local stroke direction gives a mean and a variance; the flattest sectors win, so surfaces break into
 * flat strokes of paint that follow the forms while edges stay put. A faint bristle streak runs along
 * each stroke (visible brushwork on painted ground and flat-coloured props alike).
 */
const KuwaharaShader = {
  uniforms: {
    tDiffuse: { value: null },
    tTensor: { value: null },
    uTexel: { value: new Vector2(1 / 1920, 1 / 1080) },
    uHalfTexel: { value: new Vector2(1 / 960, 1 / 540) },
    uRadius: { value: 6.0 },
    uBristle: { value: 0.07 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tTensor;
uniform vec2 uTexel;
uniform vec2 uHalfTexel;
uniform float uRadius;
uniform float uBristle;
varying vec2 vUv;
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 tap(vec2 o) { return min(texture2D(tDiffuse, vUv + o * uTexel).rgb, vec3(1.6)); }
void main() {
  // Smoothed tensor -> stroke direction t (along edges) and anisotropy A.
  vec3 T = texture2D(tTensor, vUv).rgb * 0.4;
  T += texture2D(tTensor, vUv + vec2(1.5, 1.5) * uHalfTexel).rgb * 0.15;
  T += texture2D(tTensor, vUv + vec2(-1.5, 1.5) * uHalfTexel).rgb * 0.15;
  T += texture2D(tTensor, vUv + vec2(1.5, -1.5) * uHalfTexel).rgb * 0.15;
  T += texture2D(tTensor, vUv + vec2(-1.5, -1.5) * uHalfTexel).rgb * 0.15;
  float E = T.x, F = T.y, G = T.z;
  float root = sqrt((E - G) * (E - G) + 4.0 * F * F);
  float l1 = 0.5 * (E + G + root);
  float l2 = 0.5 * (E + G - root);
  vec2 t = vec2(l1 - E, -F);
  t = dot(t, t) > 1e-10 ? normalize(t) : vec2(0.0, 1.0);
  vec2 n = vec2(-t.y, t.x);
  float A = (l1 + l2) > 1e-6 ? (l1 - l2) / (l1 + l2) : 0.0;
  float ea = uRadius * clamp(1.0 + A, 0.4, 2.0);
  float eb = uRadius * clamp(1.0 / (1.0 + A), 0.4, 2.0);
  vec3 c0 = tap(vec2(0.0));
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.785398;
    vec2 d0 = vec2(cos(a), sin(a));
    vec2 d1 = vec2(cos(a - 0.3), sin(a - 0.3));
    vec2 d2 = vec2(cos(a + 0.3), sin(a + 0.3));
    vec3 s1 = tap(t * (d0.x * ea * 0.4) + n * (d0.y * eb * 0.4));
    vec3 s2 = tap(t * (d1.x * ea * 0.75) + n * (d1.y * eb * 0.75));
    vec3 s3 = tap(t * (d2.x * ea * 0.75) + n * (d2.y * eb * 0.75));
    vec3 s4 = tap(t * (d0.x * ea) + n * (d0.y * eb));
    vec3 m = (c0 + s1 + s2 + s3 + s4) * 0.2;
    vec3 v = (c0 * c0 + s1 * s1 + s2 * s2 + s3 * s3 + s4 * s4) * 0.2 - m * m;
    float sv = sqrt(max(0.0, v.r + v.g + v.b)) * 10.0;
    float w = 1.0 / (1.0 + sv * sv * sv * sv);
    acc += m * w;
    wsum += w;
  }
  vec3 c = acc / wsum;
  // Bristles: long thin value streaks along the stroke (stronger where the stroke has a clear direction).
  vec2 px = vUv / uTexel;
  vec2 q = vec2(dot(px, t), dot(px, n));
  float br = vn2(q * vec2(0.09, 0.85)) * 0.7 + vn2(q * vec2(0.05, 0.33) + 17.0) * 0.3 - 0.5;
  c *= 1.0 + br * uBristle * (0.4 + 0.6 * A);
  gl_FragColor = vec4(c, 1.0);
}`,
};

/** Blends the half-res paint over the frame, except round the fishers' faces (kept crisp). */
const PaintBlendShader = {
  uniforms: {
    tDiffuse: { value: null },
    tPaint: { value: null },
    uAmount: { value: 0.58 },
    uAspect: { value: 16 / 9 },
    uCrisp: { value: Array.from({ length: CRISP_SPOTS }, () => new Vector4(0, 0, 0, 0)) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tPaint;
uniform float uAmount;
uniform float uAspect;
uniform vec4 uCrisp[${CRISP_SPOTS}];
varying vec2 vUv;
void main() {
  vec4 o = texture2D(tDiffuse, vUv);
  vec3 p = texture2D(tPaint, vUv).rgb;
  float keep = 0.0;
  for (int i = 0; i < ${CRISP_SPOTS}; i++) {
    vec4 s = uCrisp[i];
    if (s.z <= 0.0) continue;
    vec2 d = (vUv - s.xy) * vec2(uAspect, 1.0);
    keep = max(keep, 1.0 - smoothstep(s.z * 0.6, s.z, length(d)));
  }
  // Strokes take the colour of the paint, but keep the frame's own value detail a little (no mush).
  float amt = uAmount * (1.0 - keep);
  gl_FragColor = vec4(mix(o.rgb, p, amt), o.a);
}`,
};

class PaintPass extends Pass {
  readonly half: WebGLRenderTarget;
  private readonly tensor: WebGLRenderTarget;
  private readonly tens = new ShaderMaterial(TensorShader);
  private readonly kuwa = new ShaderMaterial(KuwaharaShader);
  readonly blend = new ShaderMaterial(PaintBlendShader);
  private readonly quad = new FullScreenQuad();
  private readonly texel = new Vector2();
  private readonly halfTexel = new Vector2();
  readonly crisp = Array.from({ length: CRISP_SPOTS }, () => new Vector4(0, 0, 0, 0));

  constructor(w: number, h: number) {
    super();
    this.tens.uniforms.uTexel = { value: this.texel };
    this.kuwa.uniforms.uTexel = { value: this.texel };
    this.kuwa.uniforms.uHalfTexel = { value: this.halfTexel };
    this.blend.uniforms.uCrisp = { value: this.crisp };
    const opts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false };
    this.half = new WebGLRenderTarget(1, 1, opts);
    this.tensor = new WebGLRenderTarget(1, 1, opts);
    this.setSize(w, h);
  }

  override setSize(w: number, h: number): void {
    const hw = Math.max(1, Math.round(w / 2));
    const hh = Math.max(1, Math.round(h / 2));
    this.half.setSize(hw, hh);
    this.tensor.setSize(hw, hh);
    // Taps in full-res pixels: the input is full size, the output half (so each output averages a little).
    this.texel.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    this.halfTexel.set(1 / hw, 1 / hh);
    this.kuwa.uniforms.uRadius!.value = Math.max(3, (h / 1080) * 7);
    this.blend.uniforms.uAspect!.value = w / Math.max(1, h);
  }

  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    this.tens.uniforms.tDiffuse!.value = readBuffer.texture;
    this.quad.material = this.tens;
    renderer.setRenderTarget(this.tensor);
    this.quad.render(renderer);
    this.kuwa.uniforms.tDiffuse!.value = readBuffer.texture;
    this.kuwa.uniforms.tTensor!.value = this.tensor.texture;
    this.quad.material = this.kuwa;
    renderer.setRenderTarget(this.half);
    this.quad.render(renderer);
    this.blend.uniforms.tDiffuse!.value = readBuffer.texture;
    this.blend.uniforms.tPaint!.value = this.half.texture;
    this.quad.material = this.blend;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.half.dispose();
    this.tensor.dispose();
    this.tens.dispose();
    this.kuwa.dispose();
    this.blend.dispose();
    this.quad.dispose();
  }
}

/** The bloom's high-pass knee width (three types the uniforms as a bare object). */
function setSmoothWidth(u: object, v: number): void {
  if (!("smoothWidth" in u)) return;
  const s = u.smoothWidth;
  if (typeof s === "object" && s !== null && "value" in s) s.value = v;
}

export type Post = {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  /** The time of day's colour gain (multiplied in before the grade). */
  gain: Color;
  /** The render target the scene is drawn into (shader prewarm compiles against it). */
  target: WebGLRenderTarget;
  /** Screen spots kept crisp this frame: (u, v, radius in screen-height units, unused); radius 0 = off. */
  crisp: Vector4[];
  /** Calls draw for each object drawn over the finished frame (the name tags, on TAG_LAYER). */
  overlay: ((draw: (o: Object3D) => void) => void) | null;
  setSize(w: number, h: number): void;
  render(): void;
  dispose(): void;
};

export function buildPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number): Post {
  // Depth resolved to a texture for the painted contact shadow (each composer buffer gets its own).
  const target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(w, h) });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const knee = new KneeAOPass(camera);
  knee.setSize(w, h);
  composer.addPass(knee);
  const paint = new PaintPass(w, h);
  composer.addPass(paint);
  // Bloom only on what is left above the knee: a soft wide glow round lanterns and glowing water.
  const bloom = new UnrealBloomPass(new Vector2(w / 2, h / 2), 0.32, 0.55, 0.78);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  setSmoothWidth(bloom.highPassUniforms, 0.3);
  const res = new Vector2();
  grade.uniforms.uRes = { value: res };
  const gain = new Color(1, 1, 1);
  grade.uniforms.uGain = { value: gain };
  const setRes = (w2: number, h2: number) => {
    const pr = renderer.getPixelRatio();
    res.set(w2 * pr, h2 * pr);
  };
  setRes(w, h);
  const crisp = paint.crisp;
  const drawOverlay = (o: Object3D) => renderer.render(o, camera);
  return {
    composer,
    bloom,
    grade,
    target,
    crisp,
    gain,
    setSize(w2, h2) {
      composer.setSize(w2, h2);
      setRes(w2, h2);
    },
    overlay: null,
    render() {
      composer.render();
      // Name tags over the finished frame, untouched by the filter (they never depth-test anyway).
      // Each tag is drawn on its own (no second walk of the whole scene).
      if (!this.overlay) return;
      const autoClear = renderer.autoClear;
      const shadowAuto = renderer.shadowMap.autoUpdate;
      const mask = camera.layers.mask;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      camera.layers.set(TAG_LAYER);
      renderer.setRenderTarget(null);
      this.overlay(drawOverlay);
      camera.layers.mask = mask;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.autoClear = autoClear;
    },
    dispose() {
      composer.dispose();
      paint.dispose();
      knee.dispose();
      target.dispose();
    },
  };
}
