import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Blending,
} from "three";

/**
 * One pooled CPU particle system (no per-frame allocation). Two instances: soft alpha (water, mist,
 * confetti) and additive (sparkles, fireflies, embers). Shape 0 = soft disc, 1 = four-point star.
 */
const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.5);
  gl_PointSize = clamp(aSize * uScale / dist, 0.0, 256.0);
  vAlpha = aAlpha;
  vShape = aShape;
  vColor = aColor;
}`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying float vShape;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  float a;
  if (vShape > 0.5) {
    float star = max(0.0, 1.0 - abs(p.x * p.y) * 18.0 - d * 0.6);
    a = clamp(star + smoothstep(0.45, 0.0, d), 0.0, 1.0);
  } else {
    a = smoothstep(1.0, 0.55, d);
  }
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type EmitOpts = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; size: number;
  r: number; g: number; b: number;
  alpha?: number; gravity?: number; drag?: number; shape?: number; grow?: number;
};

export class Particles {
  readonly points: Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly size0: Float32Array;
  private readonly alpha: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly shape: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private next = 0;
  private readonly geo: BufferGeometry;
  readonly material: ShaderMaterial;

  constructor(n: number, blending: Blending) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.shape = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.geo = new BufferGeometry();
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aColor", new BufferAttribute(this.col, 3));
    this.geo.setAttribute("aSize", new BufferAttribute(this.size, 1));
    this.geo.setAttribute("aAlpha", new BufferAttribute(this.alpha, 1));
    this.geo.setAttribute("aShape", new BufferAttribute(this.shape, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: { uScale: { value: 500 } },
    });
    this.points = new Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === AdditiveBlending ? 12 : 10;
    // Seed one visible particle so the shader compiles in the prewarm.
    this.emit({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 0.01, r: 1, g: 1, b: 1 });
  }

  setScale(viewportHeightPx: number, fovDeg: number): void {
    this.material.uniforms.uScale!.value = viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(o: EmitOpts): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const k = i * 3;
    this.pos[k] = o.x;
    this.pos[k + 1] = o.y;
    this.pos[k + 2] = o.z;
    this.vel[k] = o.vx;
    this.vel[k + 1] = o.vy;
    this.vel[k + 2] = o.vz;
    this.col[k] = o.r;
    this.col[k + 1] = o.g;
    this.col[k + 2] = o.b;
    this.size0[i] = o.size;
    this.size[i] = o.size;
    this.alpha0[i] = o.alpha ?? 1;
    this.alpha[i] = o.alpha ?? 1;
    this.shape[i] = o.shape ?? 0;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.gravity[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.grow[i] = o.grow ?? 0;
  }

  update(dt: number, time: number): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (this.life[i]! <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      const l = this.life[i]! - dt;
      this.life[i] = l;
      const k = i * 3;
      const dr = 1 - Math.min(1, this.drag[i]! * dt);
      this.vel[k + 1] = (this.vel[k + 1]! - this.gravity[i]! * dt) * dr;
      this.vel[k] = this.vel[k]! * dr;
      this.vel[k + 2] = this.vel[k + 2]! * dr;
      this.pos[k] = this.pos[k]! + this.vel[k]! * dt;
      this.pos[k + 1] = this.pos[k + 1]! + this.vel[k + 1]! * dt;
      this.pos[k + 2] = this.pos[k + 2]! + this.vel[k + 2]! * dt;
      const t = Math.max(0, l / this.maxLife[i]!);
      // Fade in fast, out slow; sparkles twinkle.
      const fin = Math.min(1, (1 - t) * 8);
      const tw = this.shape[i]! > 0.5 ? 0.7 + 0.3 * Math.sin(time * 18 + i) : 1;
      this.alpha[i] = this.alpha0[i]! * Math.min(fin, t * 1.6) * tw;
      this.size[i] = this.size0[i]! * (1 + this.grow[i]! * (1 - t));
      // Water droplets vanish at the surface.
      if (this.gravity[i]! > 0 && this.pos[k + 1]! < -0.05 && this.vel[k + 1]! < 0) this.life[i] = 0;
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.aColor!.needsUpdate = true;
    this.geo.attributes.aSize!.needsUpdate = true;
    this.geo.attributes.aAlpha!.needsUpdate = true;
    this.geo.attributes.aShape!.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

export function makeParticles(): { water: Particles; glow: Particles } {
  return { water: new Particles(2400, NormalBlending), glow: new Particles(1600, AdditiveBlending) };
}
