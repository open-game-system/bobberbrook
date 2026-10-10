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
  /** Where the sun or moon disc sits in the sky (independent of the key light, so it can be in frame). */
  discAz: number;
  discEl: number;
  /** Post grade gain (multiplies the final image, before tone mapping). */
  grade: number;
};

const D = Math.PI / 180;

const KEYS: Key[] = [
  // Every phase stays in the Ashenvale family (violet, teal water), but each time of day has its own
  // key light, sky and grade so a stranger can name it from one frame.
  // Sunrise: pink-cyan haze lifting.
  { at: 0.0, skyTop: 0x6a9ad0, skyHorizon: 0xf0c4dc, skyGlow: 0xffd8e4, cloud: 0xfff0f6, cloudShade: 0xb090c8, sun: 0xffd4c8, sunI: 2.0, az: 30 * D, el: 12 * D,
    hemiSky: 0xd0d4f0, hemiGround: 0x4a6a5a, hemiI: 1.25, fog: 0xc8acdc, fogNear: 30, fogFar: 220, exposure: 1.06, stars: 0.1, glow: 0.35, mist: 0.85,
    waterShallow: 0x5ce4dc, waterDeep: 0x147494, moon: 0, mountain: 0x9a90c4, discAz: 300 * D, discEl: 6 * D, grade: 0xfff4fa },
  // Morning: pale lilac-silver sky, soft warm low key light, light mist, readable greens.
  // Round 16: a deeper zenith, a rosier horizon and a lilac (not grey) haze: the far woods melt into
  // violet the way Ashenvale's do, instead of flat grey fog sheets.
  { at: 0.1, skyTop: 0x6a7cd6, skyHorizon: 0xf0d6ec, skyGlow: 0xffe4c8, cloud: 0xffffff, cloudShade: 0xb4acd8, sun: 0xffe6c8, sunI: 2.7, az: 55 * D, el: 24 * D,
    hemiSky: 0xdcdaf6, hemiGround: 0x5a7c5a, hemiI: 1.35, fog: 0xbcaee8, fogNear: 60, fogFar: 300, exposure: 1.1, stars: 0, glow: 0.12, mist: 0.35,
    waterShallow: 0x62ecdc, waterDeep: 0x10809a, moon: 0, mountain: 0xa8a4d4, discAz: 305 * D, discEl: 28 * D, grade: 0xfffaf2 },
  { at: 0.3, skyTop: 0x5e74d4, skyHorizon: 0xe8d4f0, skyGlow: 0xffecd0, cloud: 0xffffff, cloudShade: 0xaaa2d4, sun: 0xfff0dc, sunI: 2.7, az: 100 * D, el: 40 * D,
    hemiSky: 0xd4d4f4, hemiGround: 0x567a5a, hemiI: 1.3, fog: 0xb4aae6, fogNear: 60, fogFar: 300, exposure: 1.08, stars: 0, glow: 0.15, mist: 0.3,
    waterShallow: 0x5aeadc, waterDeep: 0x0e7e9a, moon: 0, mountain: 0xa0a0d4, discAz: 250 * D, discEl: 40 * D, grade: 0xfffaf4 },
  // Golden hour: rose-amber key low in the west, long shadows, pink-violet clouds.
  // Round 14: an amber key and a warm grade (session 213 s: "Golden hour" did not visibly warm).
  { at: 0.4, skyTop: 0x4a3a92, skyHorizon: 0xffa890, skyGlow: 0xffa050, cloud: 0xffb8c8, cloudShade: 0x8a4a92, sun: 0xff9a50, sunI: 3.6, az: 160 * D, el: 15 * D,
    hemiSky: 0xf4b8a8, hemiGround: 0x5a4a5a, hemiI: 1.4, fog: 0xd08aa8, fogNear: 50, fogFar: 250, exposure: 1.18, stars: 0.1, glow: 0.5, mist: 0.45,
    waterShallow: 0x5ad6d0, waterDeep: 0x1a5a8a, moon: 0, mountain: 0x8a5a9a, discAz: 228 * D, discEl: 5 * D, grade: 0xffe2c4 },
  { at: 0.47, skyTop: 0x36307e, skyHorizon: 0xf08a9a, skyGlow: 0xff8a5a, cloud: 0xf0a0c4, cloudShade: 0x6a4a8a, sun: 0xff9058, sunI: 3.0, az: 168 * D, el: 9 * D,
    hemiSky: 0xd8a4d8, hemiGround: 0x4a4260, hemiI: 1.35, fog: 0xa878b0, fogNear: 45, fogFar: 235, exposure: 1.06, stars: 0.4, glow: 0.8, mist: 0.55,
    waterShallow: 0x52ccd0, waterDeep: 0x16507e, moon: 0, mountain: 0x6a5498, discAz: 232 * D, discEl: 2 * D, grade: 0xffdcc8 },
  // Night: deep indigo, the big moon over the falls, glowing water, mushrooms, wisps and lanterns.
  // Round 14: a silver (not blue) moon key, a less saturated indigo fill and a warm grade, so lamps,
  // fireflies and firelight read warm against the indigo instead of the whole frame going saturated blue.
  { at: 0.55, skyTop: 0x101452, skyHorizon: 0x3a3488, skyGlow: 0x6a6ac0, cloud: 0x6a6ab0, cloudShade: 0x262660, sun: 0xc8c6ec, sunI: 1.9, az: 225 * D, el: 26 * D,
    hemiSky: 0x5c5aa8, hemiGround: 0x1c5664, hemiI: 1.55, fog: 0x2e2c70, fogNear: 45, fogFar: 220, exposure: 1.7, stars: 1, glow: 1, mist: 0.55,
    waterShallow: 0x3ae0dc, waterDeep: 0x0a3070, moon: 1, mountain: 0x302c70, discAz: 271 * D, discEl: 4.5 * D, grade: 0xfff0e2 },
  { at: 0.82, skyTop: 0x0c1048, skyHorizon: 0x302c80, skyGlow: 0x6060b8, cloud: 0x5a5aa0, cloudShade: 0x1e1e58, sun: 0xc8c6ec, sunI: 2.0, az: 290 * D, el: 26 * D,
    hemiSky: 0x5a58a6, hemiGround: 0x1a5262, hemiI: 1.55, fog: 0x282a6c, fogNear: 45, fogFar: 215, exposure: 1.7, stars: 1, glow: 1, mist: 0.6,
    waterShallow: 0x38e0dc, waterDeep: 0x082c6a, moon: 1, mountain: 0x2a2a6c, discAz: 273 * D, discEl: 5 * D, grade: 0xfff0e2 },
  // Dawn: pink-cyan haze, the last stars, mist on the water.
  { at: 0.9, skyTop: 0x4a8ac8, skyHorizon: 0xf4b0cc, skyGlow: 0xffc8dc, cloud: 0xffd8ec, cloudShade: 0x7a7ab8, sun: 0xffc0d4, sunI: 1.8, az: 345 * D, el: 8 * D,
    hemiSky: 0xa8d4f0, hemiGround: 0x3a5a6a, hemiI: 1.3, fog: 0xbca4dc, fogNear: 34, fogFar: 200, exposure: 1.06, stars: 0.35, glow: 0.6, mist: 0.85,
    waterShallow: 0x58e8e0, waterDeep: 0x125a88, moon: 0, mountain: 0x8a8ac0, discAz: 292 * D, discEl: 3 * D, grade: 0xfff0f8 },
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
  discDir: Vector3;
  grade: Color;
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
    discDir: new Vector3(0, 1, 0),
    grade: new Color(1, 1, 1),
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
  mixHex(out.grade, a.grade, b.grade, t);
  let bdAz = b.discAz;
  while (bdAz < a.discAz - Math.PI) bdAz += Math.PI * 2;
  while (bdAz > a.discAz + Math.PI) bdAz -= Math.PI * 2;
  const dAz = a.discAz + (bdAz - a.discAz) * t;
  const dEl = a.discEl + (b.discEl - a.discEl) * t;
  out.discDir.set(Math.cos(dAz) * Math.cos(dEl), Math.sin(dEl), Math.sin(dAz) * Math.cos(dEl)).normalize();
  return out;
}

const TW = {
  skyTop: new Color(0x221c5c),
  skyHorizon: new Color(0xb488c8),
  skyGlow: new Color(0xf2a8c4),
  cloud: new Color(0xbcaee6),
  cloudShade: new Color(0x5a4a92),
  fog: new Color(0x7c6ab4),
  hemiSky: new Color(0x8a80d4),
  mountain: new Color(0x2a2656),
};

/**
 * The zeppelin's sky: whatever the hour, a ride above the clouds blends toward Ashenvale twilight
 * (indigo overhead, a rose-violet glow on the horizon, first stars, lavender cloud banks) instead of
 * the flat pink of a dusk key (round 05). w: 0..1.
 */
export function rideTwilight(tod: TodState, w: number): void {
  if (w <= 0.001) return;
  tod.skyTop.lerp(TW.skyTop, w);
  tod.skyHorizon.lerp(TW.skyHorizon, w);
  tod.skyGlow.lerp(TW.skyGlow, w);
  tod.cloud.lerp(TW.cloud, w);
  tod.cloudShade.lerp(TW.cloudShade, w);
  tod.fog.lerp(TW.fog, w);
  tod.hemiSky.lerp(TW.hemiSky, w * 0.6);
  tod.mountain.lerp(TW.mountain, w);
  tod.stars = Math.max(tod.stars, 0.45 * w);
  tod.glow = Math.max(tod.glow, 0.6 * w);
}
