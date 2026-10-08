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
  // Ashenvale family: every phase stays violet/indigo with teal water; warmth only in small accents.
  // Morning: lavender-silver dawnlight through fog.
  { at: 0.0, skyTop: 0x5a5aa8, skyHorizon: 0xc8b4e0, skyGlow: 0xf0c8e8, cloud: 0xe8d8f4, cloudShade: 0x8a78b8, sun: 0xe8dcff, sunI: 1.7, az: 25 * D, el: 14 * D,
    hemiSky: 0xb0a8e8, hemiGround: 0x3a5a6a, hemiI: 1.05, fog: 0xa898d0, fogNear: 45, fogFar: 230, exposure: 1.0, stars: 0.35, glow: 0.45, mist: 0.9,
    waterShallow: 0x58e0d8, waterDeep: 0x10708e, moon: 0, mountain: 0x8a7ab8 },
  { at: 0.12, skyTop: 0x4c5cb0, skyHorizon: 0xc4c0ec, skyGlow: 0xf4e4ff, cloud: 0xf0eaff, cloudShade: 0x9a90c8, sun: 0xf0eaff, sunI: 2.1, az: 60 * D, el: 32 * D,
    hemiSky: 0xb8b8f0, hemiGround: 0x3a6070, hemiI: 1.05, fog: 0xa8a4dc, fogNear: 55, fogFar: 260, exposure: 1.0, stars: 0.3, glow: 0.35, mist: 0.6,
    waterShallow: 0x50e6dc, waterDeep: 0x0c7894, moon: 0, mountain: 0x8480c0 },
  { at: 0.3, skyTop: 0x4858b0, skyHorizon: 0xbcbcec, skyGlow: 0xf0e8ff, cloud: 0xf0ecff, cloudShade: 0x9890cc, sun: 0xf2eeff, sunI: 2.15, az: 100 * D, el: 44 * D,
    hemiSky: 0xb4b8f0, hemiGround: 0x3a6070, hemiI: 1.05, fog: 0xa4a4dc, fogNear: 55, fogFar: 260, exposure: 1.0, stars: 0.3, glow: 0.35, mist: 0.5,
    waterShallow: 0x4ee8dc, waterDeep: 0x0a7a96, moon: 0, mountain: 0x8282c4 },
  // Golden: rose-violet dusk with a warm rim.
  { at: 0.41, skyTop: 0x4a3c8a, skyHorizon: 0xf0a8c0, skyGlow: 0xffb48a, cloud: 0xffc4d0, cloudShade: 0x8a5a9a, sun: 0xffb890, sunI: 2.2, az: 150 * D, el: 14 * D,
    hemiSky: 0xc8a0d8, hemiGround: 0x3a4a68, hemiI: 1.0, fog: 0xb88ab8, fogNear: 50, fogFar: 240, exposure: 1.02, stars: 0.4, glow: 0.6, mist: 0.55,
    waterShallow: 0x58d8d4, waterDeep: 0x16608a, moon: 0, mountain: 0x8a6aa8 },
  { at: 0.48, skyTop: 0x34307a, skyHorizon: 0xd88ab0, skyGlow: 0xff9a7a, cloud: 0xe8a0c0, cloudShade: 0x6a4a8a, sun: 0xffa080, sunI: 1.6, az: 168 * D, el: 6 * D,
    hemiSky: 0xa088c8, hemiGround: 0x2e3a5a, hemiI: 1.0, fog: 0x9a78b0, fogNear: 45, fogFar: 230, exposure: 1.04, stars: 0.6, glow: 0.85, mist: 0.6,
    waterShallow: 0x50ccd0, waterDeep: 0x14507e, moon: 0.2, mountain: 0x6a5498 },
  // Night: deep indigo, a bright moon, glowing water and wisps.
  { at: 0.55, skyTop: 0x161a52, skyHorizon: 0x4a3c8a, skyGlow: 0x8a7ad0, cloud: 0x6a62a8, cloudShade: 0x2a2a60, sun: 0xb8c4ff, sunI: 1.4, az: 210 * D, el: 30 * D,
    hemiSky: 0x6a6ad0, hemiGround: 0x22305a, hemiI: 1.2, fog: 0x3a3478, fogNear: 45, fogFar: 220, exposure: 1.08, stars: 1, glow: 1, mist: 0.6,
    waterShallow: 0x3ad8d8, waterDeep: 0x0a3a70, moon: 1, mountain: 0x3a3478 },
  { at: 0.66, skyTop: 0x0e1244, skyHorizon: 0x2e2c78, skyGlow: 0x6a6ad0, cloud: 0x4a4a90, cloudShade: 0x1c1c50, sun: 0xc4d0ff, sunI: 1.65, az: 245 * D, el: 44 * D,
    hemiSky: 0x5a64c8, hemiGround: 0x1c2a54, hemiI: 1.25, fog: 0x262a68, fogNear: 45, fogFar: 210, exposure: 1.1, stars: 1, glow: 1, mist: 0.55,
    waterShallow: 0x36dcd8, waterDeep: 0x082e66, moon: 1, mountain: 0x262a68 },
  { at: 0.8, skyTop: 0x0e1244, skyHorizon: 0x2e2c78, skyGlow: 0x6a6ad0, cloud: 0x4a4a90, cloudShade: 0x1c1c50, sun: 0xc4d0ff, sunI: 1.65, az: 300 * D, el: 40 * D,
    hemiSky: 0x5a64c8, hemiGround: 0x1c2a54, hemiI: 1.25, fog: 0x262a68, fogNear: 45, fogFar: 210, exposure: 1.1, stars: 1, glow: 1, mist: 0.6,
    waterShallow: 0x36dcd8, waterDeep: 0x082e66, moon: 1, mountain: 0x262a68 },
  // Dawn: misty cyan.
  { at: 0.9, skyTop: 0x283c84, skyHorizon: 0x7ab8d0, skyGlow: 0xa8e8f0, cloud: 0xa8c8e8, cloudShade: 0x4a5a98, sun: 0xc0e8ff, sunI: 1.3, az: 345 * D, el: 20 * D,
    hemiSky: 0x80b0e0, hemiGround: 0x284a60, hemiI: 1.15, fog: 0x6a9ac0, fogNear: 30, fogFar: 200, exposure: 1.05, stars: 0.6, glow: 0.8, mist: 1.0,
    waterShallow: 0x48e4dc, waterDeep: 0x0c5a84, moon: 0.6, mountain: 0x5a78a8 },
  { at: 0.965, skyTop: 0x3a58a4, skyHorizon: 0x9ad0e0, skyGlow: 0xd8f0ff, cloud: 0xd0e4f4, cloudShade: 0x6a7ab0, sun: 0xd8f0ff, sunI: 1.5, az: 8 * D, el: 8 * D,
    hemiSky: 0x9ac0e8, hemiGround: 0x2e5064, hemiI: 1.1, fog: 0x8ab4d4, fogNear: 30, fogFar: 210, exposure: 1.02, stars: 0.4, glow: 0.6, mist: 1.0,
    waterShallow: 0x50e4dc, waterDeep: 0x0e6688, moon: 0, mountain: 0x7a8ab8 },
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
