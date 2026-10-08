import { Color, Vector3 } from "three";

/**
 * Time-of-day look: keyframes over the day phase (0 = sunrise, see src/game/daycycle.ts), lerped
 * continuously. Everything here is a uniform or a light value, so nothing recompiles as the day turns.
 */
type Key = {
  at: number;
  skyTop: number;
  skyHorizon: number;
  /** Glow around the sun/moon on the horizon. */
  skyGlow: number;
  cloud: number;
  cloudShade: number;
  sun: number;
  sunI: number;
  /** Light azimuth (radians, 0 = from +x east, π/2 = from +z south) and elevation. */
  az: number;
  el: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
  stars: number;
  /** Warm windows, lanterns, string lights, fireflies. */
  glow: number;
  mist: number;
  waterShallow: number;
  waterDeep: number;
  /** Disc in the sky: 0 sun, 1 moon. */
  moon: number;
  mountain: number;
};

const D = Math.PI / 180;

const KEYS: Key[] = [
  { at: 0.0, skyTop: 0x7ea6dc, skyHorizon: 0xffd6b8, skyGlow: 0xffb48a, cloud: 0xffe6da, cloudShade: 0xb79ab8, sun: 0xffd4a8, sunI: 1.41, az: 20 * D, el: 9 * D,
    hemiSky: 0xc4d0ea, hemiGround: 0x8a7a62, hemiI: 0.98, fog: 0xead6cc, fogNear: 40, fogFar: 190, exposure: 1.0, stars: 0, glow: 0.35, mist: 0.75,
    waterShallow: 0x6fd6cf, waterDeep: 0x1f7f95, moon: 0, mountain: 0xa898c4 },
  { at: 0.1, skyTop: 0x3f8fe6, skyHorizon: 0xcfe9fb, skyGlow: 0xfff0d8, cloud: 0xffffff, cloudShade: 0xb6c6dc, sun: 0xfff0d6, sunI: 2.22, az: 55 * D, el: 38 * D,
    hemiSky: 0xd6e8ff, hemiGround: 0x91a35c, hemiI: 0.98, fog: 0xcfe4f4, fogNear: 60, fogFar: 230, exposure: 1.0, stars: 0, glow: 0, mist: 0.15,
    waterShallow: 0x5fe0d2, waterDeep: 0x13859c, moon: 0, mountain: 0x8fa2cc },
  { at: 0.28, skyTop: 0x3a8ae4, skyHorizon: 0xd2ebfb, skyGlow: 0xfff4e0, cloud: 0xffffff, cloudShade: 0xb8c8de, sun: 0xfff3dc, sunI: 2.29, az: 100 * D, el: 52 * D,
    hemiSky: 0xd8eaff, hemiGround: 0x93a55a, hemiI: 0.94, fog: 0xd0e6f6, fogNear: 60, fogFar: 230, exposure: 1.0, stars: 0, glow: 0, mist: 0.05,
    waterShallow: 0x5ce2d2, waterDeep: 0x10879e, moon: 0, mountain: 0x8ea4d0 },
  { at: 0.39, skyTop: 0x6a86cc, skyHorizon: 0xffd08e, skyGlow: 0xffb060, cloud: 0xffe2b8, cloudShade: 0xd08a7a, sun: 0xffb866, sunI: 2.15, az: 145 * D, el: 20 * D,
    hemiSky: 0xf2cfa8, hemiGround: 0x8a7a44, hemiI: 0.89, fog: 0xf2cc9c, fogNear: 50, fogFar: 210, exposure: 1.0, stars: 0, glow: 0.25, mist: 0.15,
    waterShallow: 0x7ad8c0, waterDeep: 0x1f7890, moon: 0, mountain: 0xb08aa8 },
  { at: 0.47, skyTop: 0x4c4fa0, skyHorizon: 0xff9a78, skyGlow: 0xff7a48, cloud: 0xffb0a0, cloudShade: 0x9a5a8a, sun: 0xff8e56, sunI: 1.48, az: 165 * D, el: 6 * D,
    hemiSky: 0xd8a8b8, hemiGround: 0x6a5a48, hemiI: 0.85, fog: 0xe0a094, fogNear: 45, fogFar: 200, exposure: 1.02, stars: 0.05, glow: 0.75, mist: 0.25,
    waterShallow: 0x7ab8b8, waterDeep: 0x2a5a80, moon: 0, mountain: 0x8a6a9a },
  { at: 0.54, skyTop: 0x1c275c, skyHorizon: 0x6c5c92, skyGlow: 0x9a7ab0, cloud: 0x8a80b0, cloudShade: 0x3a3a6a, sun: 0x9fb2ff, sunI: 0.85, az: 200 * D, el: 25 * D,
    hemiSky: 0x5a6aa8, hemiGround: 0x2a3040, hemiI: 0.94, fog: 0x4a4c78, fogNear: 40, fogFar: 180, exposure: 1.05, stars: 0.6, glow: 1, mist: 0.3,
    waterShallow: 0x3a8a9a, waterDeep: 0x14385e, moon: 1, mountain: 0x3a3e6a },
  { at: 0.64, skyTop: 0x0b1638, skyHorizon: 0x26407a, skyGlow: 0x4a68b0, cloud: 0x4a5a8a, cloudShade: 0x1a2448, sun: 0xa8c2ff, sunI: 1.07, az: 240 * D, el: 42 * D,
    hemiSky: 0x4a64a4, hemiGround: 0x1e2c34, hemiI: 1.02, fog: 0x1e2e58, fogNear: 40, fogFar: 170, exposure: 1.1, stars: 1, glow: 1, mist: 0.2,
    waterShallow: 0x2a7a96, waterDeep: 0x0c2a52, moon: 1, mountain: 0x24305a },
  { at: 0.8, skyTop: 0x0b1638, skyHorizon: 0x26407a, skyGlow: 0x4a68b0, cloud: 0x4a5a8a, cloudShade: 0x1a2448, sun: 0xa8c2ff, sunI: 1.07, az: 300 * D, el: 40 * D,
    hemiSky: 0x4a64a4, hemiGround: 0x1e2c34, hemiI: 1.02, fog: 0x1e2e58, fogNear: 40, fogFar: 170, exposure: 1.1, stars: 1, glow: 1, mist: 0.3,
    waterShallow: 0x2a7a96, waterDeep: 0x0c2a52, moon: 1, mountain: 0x24305a },
  { at: 0.9, skyTop: 0x2a3a74, skyHorizon: 0xb08ca8, skyGlow: 0xd0a0b0, cloud: 0xb0a0c0, cloudShade: 0x5a5a8a, sun: 0xb8c4f0, sunI: 0.81, az: 345 * D, el: 22 * D,
    hemiSky: 0x8a8ab8, hemiGround: 0x4a4a50, hemiI: 0.94, fog: 0x8a84a8, fogNear: 30, fogFar: 170, exposure: 1.05, stars: 0.35, glow: 0.8, mist: 0.9,
    waterShallow: 0x5a9aaa, waterDeep: 0x24507a, moon: 0.6, mountain: 0x7a76a6 },
  { at: 0.965, skyTop: 0x6c94d4, skyHorizon: 0xffc8b4, skyGlow: 0xffa888, cloud: 0xffd8d0, cloudShade: 0xa890b8, sun: 0xffc8a0, sunI: 1.04, az: 5 * D, el: 4 * D,
    hemiSky: 0xb8bce0, hemiGround: 0x76705c, hemiI: 0.98, fog: 0xe4cccc, fogNear: 30, fogFar: 180, exposure: 1.0, stars: 0.05, glow: 0.5, mist: 1.0,
    waterShallow: 0x6cc8c8, waterDeep: 0x1f6e90, moon: 0, mountain: 0xa294c2 },
];

export type TodState = {
  phase: number;
  skyTop: Color;
  skyHorizon: Color;
  skyGlow: Color;
  cloud: Color;
  cloudShade: Color;
  sun: Color;
  sunI: number;
  /** Unit vector pointing from the scene toward the light (sun or moon). */
  lightDir: Vector3;
  hemiSky: Color;
  hemiGround: Color;
  hemiI: number;
  fog: Color;
  fogNear: number;
  fogFar: number;
  exposure: number;
  stars: number;
  glow: number;
  mist: number;
  waterShallow: Color;
  waterDeep: Color;
  moon: number;
  mountain: Color;
};

export function newTodState(): TodState {
  return {
    phase: 0,
    skyTop: new Color(),
    skyHorizon: new Color(),
    skyGlow: new Color(),
    cloud: new Color(),
    cloudShade: new Color(),
    sun: new Color(),
    sunI: 0.74,
    lightDir: new Vector3(0, 1, 0),
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiI: 0.85,
    fog: new Color(),
    fogNear: 50,
    fogFar: 200,
    exposure: 1,
    stars: 0,
    glow: 0,
    mist: 0,
    waterShallow: new Color(),
    waterDeep: new Color(),
    moon: 0,
    mountain: new Color(),
  };
}

const ca = new Color();
const cb = new Color();
function mixHex(out: Color, a: number, b: number, t: number): void {
  ca.setHex(a);
  cb.setHex(b);
  out.copy(ca).lerp(cb, t);
}

function smoothT(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Fills `out` with the look at `phase` (0..1, wraps). No allocation. */
export function sampleTod(phase: number, out: TodState): TodState {
  const p = phase - Math.floor(phase);
  out.phase = p;
  let i = KEYS.length - 1;
  for (let k = 0; k < KEYS.length; k++) if (KEYS[k]!.at <= p) i = k;
  const a = KEYS[i]!;
  const b = KEYS[(i + 1) % KEYS.length]!;
  const bAt = b.at <= a.at ? b.at + 1 : b.at;
  const t = smoothT((p - a.at) / (bAt - a.at));
  mixHex(out.skyTop, a.skyTop, b.skyTop, t);
  mixHex(out.skyHorizon, a.skyHorizon, b.skyHorizon, t);
  mixHex(out.skyGlow, a.skyGlow, b.skyGlow, t);
  mixHex(out.cloud, a.cloud, b.cloud, t);
  mixHex(out.cloudShade, a.cloudShade, b.cloudShade, t);
  mixHex(out.sun, a.sun, b.sun, t);
  mixHex(out.hemiSky, a.hemiSky, b.hemiSky, t);
  mixHex(out.hemiGround, a.hemiGround, b.hemiGround, t);
  mixHex(out.fog, a.fog, b.fog, t);
  mixHex(out.waterShallow, a.waterShallow, b.waterShallow, t);
  mixHex(out.waterDeep, a.waterDeep, b.waterDeep, t);
  mixHex(out.mountain, a.mountain, b.mountain, t);
  out.sunI = a.sunI + (b.sunI - a.sunI) * t;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  out.fogNear = a.fogNear + (b.fogNear - a.fogNear) * t;
  out.fogFar = a.fogFar + (b.fogFar - a.fogFar) * t;
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
  out.stars = a.stars + (b.stars - a.stars) * t;
  out.glow = a.glow + (b.glow - a.glow) * t;
  out.mist = a.mist + (b.mist - a.mist) * t;
  out.moon = a.moon + (b.moon - a.moon) * t;
  let bAz = b.az;
  while (bAz < a.az) bAz += Math.PI * 2;
  const az = a.az + (bAz - a.az) * t;
  const el = a.el + (b.el - a.el) * t;
  out.lightDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
  return out;
}
