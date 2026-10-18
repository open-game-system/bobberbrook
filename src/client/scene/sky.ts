import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
} from "three";
import type { TodState } from "./tod";
import { rng } from "./noise";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uGlow;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uMoon;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // Round 26: the painted horizon sits under the true one. The TV camera stands high over the lake and looks
  // down across it, so the sky it sees over the trees on the hills is mostly at or below the true horizon, where
  // the dome was one flat horizon colour (the "pasted orange band"): the gradient now runs from there.
  float hv = h + 0.12;
  float up = clamp(hv, 0.0, 1.0);
  // Round 16: a painted gradient, not a flat wash. Three stops (a warm horizon, a glow-tinted middle, a
  // deeper zenith), long horizontal brush streaks in the value, and a broad halo round the sun or moon.
  float az = atan(d.z, d.x);
  float streak = fbm(vec2(az * 3.0, hv * 26.0)) - 0.5;
  float hb = up + streak * 0.05;
  // Round 26 (round 25 critic, moonwell_tod-golden: a flat pasted orange band behind the trees): the warm
  // horizon belongs to the sun's side of the sky; round from it the horizon cools to a lilac between the
  // horizon and zenith colours, and up from it the warmth falls off through peach and rose into lilac
  // before the zenith (more stops, low down where the TV sees the sky between the canopies).
  vec2 sunH = normalize(uSunDir.xz + vec2(1e-4, 0.0));
  float toSun = dot(normalize(d.xz + vec2(1e-4, 0.0)), sunH);
  float warmAz = smoothstep(0.55, 1.0, toSun + streak * 0.12);
  // The lilac is the air's own (the fog colour, a touch of zenith): mixing the orange horizon into the violet
  // zenith only ever gave a muddy salmon.
  vec3 lilac = mix(uFog * 1.12, uTop, 0.22);
  vec3 hz = mix(lilac, uHorizon, 0.3 + 0.7 * warmAz);
  vec3 peach = mix(hz, mix(uHorizon, uGlow, 0.35), warmAz);
  vec3 rose = mix(mix(uHorizon, lilac, 0.55), lilac, 1.0 - warmAz);
  vec3 col = mix(hz, peach, smoothstep(0.0, 0.07, hb));
  col = mix(col, rose, smoothstep(0.08, 0.16, hb));
  col = mix(col, lilac, smoothstep(0.13, 0.24, hb));
  col = mix(col, uTop, pow(smoothstep(0.22, 0.85, hb), 0.8));
  col *= 1.0 + streak * 0.1 * smoothstep(0.0, 0.1, up);
  float sd = max(dot(d, uSunDir), 0.0);
  float horizonBand = 1.0 - smoothstep(0.0, 0.45, up);
  // Round 26: the broad halo round the sun is laid over the gradient (it used to be added on top, and at golden
  // hour, the sun low in the TV's view, sky + halo went past what the tone map shows: one flat orange).
  float halo = clamp(pow(sd, 12.0) * 0.5 * horizonBand + pow(sd, 3.0) * 0.08, 0.0, 0.4);
  col = mix(col, uGlow * 0.92 + uHorizon * 0.08, halo) + uGlow * pow(sd, 48.0) * 0.5;
  // Stars (night) with a faint band.
  if (uStars > 0.01 && h > 0.0) {
    vec2 sp = d.xz / (d.y + 0.35) * 90.0;
    vec2 cell = floor(sp);
    float r = h21(cell);
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    vec2 off = vec2(h21(cell + 7.1), h21(cell + 3.3)) - 0.5;
    float dist = length(fract(sp) - 0.5 - off * 0.6);
    float star = step(0.965, r) * smoothstep(0.16, 0.0, dist) * tw;
    float band = smoothstep(0.35, 0.0, abs(d.x * 0.7 + d.z * 0.5 - 0.1)) * fbm(sp * 0.04) * 0.25;
    col += vec3(0.9, 0.95, 1.0) * (star + band * 0.6) * uStars * smoothstep(0.0, 0.2, h);
  }
  // Sun or moon disc (no face): a soft-edged disc; the moon is big, with a wide silver halo.
  float disc = mix(smoothstep(0.9988, 0.9993, sd), smoothstep(0.9938, 0.9946, sd), uMoon);
  col += vec3(0.5, 0.58, 1.0) * (pow(sd, 300.0) * 0.9 + pow(sd, 40.0) * 0.22 + pow(sd, 7.0) * 0.1) * uMoon;
  // The disc's own plane (a basis round the disc direction): the old xz projection stretched the maria
  // into vertical stripes whenever the moon stood high.
  vec3 mt1 = normalize(cross(uSunDir, abs(uSunDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 mt2 = cross(mt1, uSunDir);
  vec2 mp = vec2(dot(d, mt1), dot(d, mt2)) * 60.0;
  float maria = smoothstep(0.45, 0.8, fbm(mp * 0.9 + 4.0)) * 0.22 + smoothstep(0.62, 0.85, vn(mp * 3.1 + 1.7)) * 0.07;
  // Painted limb: a touch darker and cooler toward the edge, lit a little from the upper left.
  float limb = smoothstep(0.9938, 0.99995, sd);
  float side = dot(normalize(mp + 1e-4), normalize(vec2(-0.6, 0.8))) * (1.0 - limb);
  vec3 moonCol = vec3(1.0, 0.99, 1.04) * (1.0 - maria) * (0.86 + 0.14 * limb + 0.06 * side);
  vec3 discCol = mix(uSunCol * 2.2 + 0.6, moonCol, uMoon);
  col = mix(col, discCol, disc * smoothstep(-0.02, 0.02, h));
  // Painted cumulus clouds over the horizon.
  vec2 cuv = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.004, 0.0);
  float n = fbm(cuv);
  float n2 = fbm(cuv + uSunDir.xz * 0.09);
  float band2 = smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.45, 0.85, h));
  float cov = smoothstep(0.5, 0.66, n) * band2 * (1.0 - uMoon * smoothstep(0.985, 0.996, sd));
  float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
  vec3 cc = mix(uCloudShade, uCloud, lit);
  cc += uGlow * pow(sd, 4.0) * 0.4;
  col = mix(col, cc, cov * 0.92);
  // Below the horizon: fade to the horizon colour (hidden by hills anyway).
  col = mix(col, hz, smoothstep(0.0, -0.1, hv));
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const MTN_VERT = /* glsl */ `
attribute float aH;
attribute float aL;
varying float vH;
varying float vL;
varying float vShade;
varying vec2 vP;
void main() {
  vH = aH;
  vL = aL;
  vShade = normal.x * 0.5 + 0.5;
  vP = vec2(atan(position.z, position.x) * 160.0, position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const MTN_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform vec3 uFog;
uniform vec3 uLight;
uniform float uFar;
varying float vH;
varying float vL;
varying float vShade;
varying vec2 vP;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // Opaque painted matte ridges: each layer one flat painted value (nearer = deeper and richer,
  // farther = paler, aerial perspective by layer), brushy vertical tree-mass strokes, a lit crown rim,
  // and mist only pooled at the foot (round 07: the whole hill faded into fog and read as a see-through card).
  float far = vL / 2.0;
  vec3 body = uCol * (0.62 + 0.22 * vShade) * (1.0 - far * 0.18);
  float strokes = vn(vec2(vP.x * 0.9, vP.y * 0.08 + vL * 7.0)) * 0.6 + vn(vec2(vP.x * 2.3, vP.y * 0.2)) * 0.4;
  body *= 0.84 + 0.3 * strokes;
  // Darker tree masses in bands, lighter crowns catching the sky.
  body = mix(body, uCol * 1.25 + uFog * 0.15, smoothstep(0.78, 1.0, vH) * (0.35 + 0.3 * strokes));
  vec3 c = mix(body, uFog, 0.18 + far * 0.32 + uFar * 0.35);
  c = mix(c, uFog, (1.0 - smoothstep(0.0, 0.32, vH)) * 0.7);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type Sky = {
  dome: Mesh;
  mountains: Mesh;
  update(tod: TodState, camera: Camera, time: number): void;
  dispose(): void;
};

/**
 * The far horizon: layered forested ridges (rounded hills whose skyline is a row of tree crowns, a few
 * taller spires to the north), not cone peaks (round 05: "pink cones"). Each ridge is a two-sided strip
 * facing the valley; aH is the height fraction for the shader's gradient.
 */
function buildMountains(): BufferGeometry {
  const r = rng(91);
  const pos: number[] = [];
  const hs: number[] = [];
  const ls: number[] = [];
  const idx: number[] = [];
  const COLS = 22;
  const LAYERS: [number, number, number][] = [
    [215, 30, 0.8],
    [265, 30, 1.05],
    [320, 24, 1.35],
  ];
  LAYERS.forEach(([R, ridges, hk], layer) => {
    for (let p = 0; p < ridges; p++) {
      const th = (p / ridges) * Math.PI * 2 + r() * 0.15 + layer * 0.37;
      const north = 0.5 - 0.5 * Math.sin(th);
      let gap = Math.abs(th + Math.PI / 2) % (Math.PI * 2);
      if (gap > Math.PI) gap = Math.PI * 2 - gap;
      const saddle = 1 - 0.75 * Math.exp(-((gap / 0.2) ** 2));
      const H = (14 + r() * 16) * (0.6 + 0.6 * north) * hk * saddle;
      // A spire now and then in the north, slim and tall like the reference's far rocks.
      const spire = layer === 2 && north > 0.6 && r() < 0.35;
      const W = spire ? 14 + r() * 8 : 34 + r() * 30;
      const cx = Math.cos(th) * R;
      const cz = Math.sin(th) * R;
      const tx = -Math.sin(th);
      const tz = Math.cos(th);
      const base = pos.length / 3;
      for (let i = 0; i <= COLS; i++) {
        const u = (i / COLS) * 2 - 1;
        const lx = u * W;
        const hump = Math.pow(Math.max(0, 1 - u * u), spire ? 1.6 : 0.6);
        // Tree crowns along the skyline: rounded bumps, bigger near the top of the hill.
        const crowns = spire ? 0 : (0.55 + 0.45 * Math.abs(Math.sin(i * 1.9 + p * 3.1))) * 3.2 * hump;
        const top = (spire ? H * 2.1 : H) * hump + crowns;
        pos.push(cx + tx * lx, -6, cz + tz * lx);
        hs.push(0);
        pos.push(cx + tx * lx, top - 6, cz + tz * lx);
        hs.push(top / Math.max(1, H * (spire ? 2.1 : 1) + 3.2));
        ls.push(layer, layer);
      }
      for (let i = 0; i < COLS; i++) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aH", new BufferAttribute(new Float32Array(hs), 1));
  g.setAttribute("aL", new BufferAttribute(new Float32Array(ls), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildSky(): Sky {
  const geo = new SphereGeometry(500, 48, 24);
  const mat = new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new Color() },
      uHorizon: { value: new Color() },
      uFog: { value: new Color() },
      uGlow: { value: new Color() },
      uCloud: { value: new Color() },
      uCloudShade: { value: new Color() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunCol: { value: new Color() },
      uMoon: { value: 0 },
      uStars: { value: 0 },
      uTime: { value: 0 },
    },
  });
  const dome = new Mesh(geo, mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.name = "sky";

  const mgeo = buildMountains();
  const mmat = new ShaderMaterial({
    vertexShader: MTN_VERT,
    fragmentShader: MTN_FRAG,
    fog: false,
    uniforms: {
      uCol: { value: new Color() },
      uFog: { value: new Color() },
      uLight: { value: new Vector3() },
      uFar: { value: 0.2 },
    },
  });
  const mountains = new Mesh(mgeo, mmat);
  mountains.name = "mountains";
  mountains.frustumCulled = false;

  const u = mat.uniforms;
  const mu = mmat.uniforms;
  return {
    dome,
    mountains,
    update(tod, camera, time) {
      dome.position.copy(camera.position);
      // Uniform values are typed `any` by three; these are the objects created above.
      (u.uTop!.value as Color).copy(tod.skyTop);
      (u.uHorizon!.value as Color).copy(tod.skyHorizon);
      (u.uFog!.value as Color).copy(tod.fog);
      (u.uGlow!.value as Color).copy(tod.skyGlow);
      (u.uCloud!.value as Color).copy(tod.cloud);
      (u.uCloudShade!.value as Color).copy(tod.cloudShade);
      (u.uSunCol!.value as Color).copy(tod.sun);
      (u.uSunDir!.value as Vector3).copy(tod.discDir);
      u.uMoon!.value = tod.moon;
      u.uStars!.value = tod.stars;
      u.uTime!.value = time;
      (mu.uCol!.value as Color).copy(tod.mountain);
      (mu.uFog!.value as Color).copy(tod.skyHorizon).lerp(tod.fog, 0.5);
      mu.uFar!.value = 0.15 + tod.mist * 0.35;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mgeo.dispose();
      mmat.dispose();
    },
  };
}
