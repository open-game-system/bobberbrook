import { Color } from "three";
import { NORTH, TRAIL_HALF_WIDTH, angleGap, pondRadius, segmentDistance, type AreaId } from "../../game/world";
const HOME_IDS: readonly AreaId[] = ["moonwell", "mistmarsh", "pools", "hollow", "tarn"];
import type { Biome, Place } from "../../game/regions";
import { smoothstep } from "./noise";
import { clearingEdge, placesAround, trailsAround, type SceneTrail } from "./worldQuery";

/**
 * The valley as the scene sees it: how far a point is from open ground (clearings and trails), which
 * pond it is nearest, and how much each place "owns" it (for its sub-palette). Shared by the terrain,
 * the forest, the dressing and the mood blending, so they all agree with world.ts walkability.
 */

export const AREA_INDEX: Record<AreaId, number> = { moonwell: 0, mistmarsh: 1, pools: 2, hollow: 3, tarn: 4 };

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function cliffFactor(theta: number): number {
  return Math.max(0, 1 - angleGap(theta, NORTH) / 0.75);
}

export type OpenInfo = { o: number; cliff: number; trail: number; along: number; path: SceneTrail | null };

export const newOpenInfo = (): OpenInfo => ({ o: 0, cliff: 0, trail: 0, along: 0, path: null });

const PT = { x: 0, z: 0 };

/**
 * Signed distance (metres) from open ground: negative inside a clearing or on a trail, positive in the
 * forest. Also the cliff factor (Moonwell's falls cliff) and the nearest trail (it, distance from its
 * centre line, distance along it). Works anywhere in the endless world (places and trails near the point).
 */
export function openAt(x: number, z: number, out: OpenInfo): OpenInfo {
  let o = Infinity;
  let moon = Infinity;
  let cliff = 0;
  for (const a of placesAround(x, z)) {
    const e = clearingEdge(a, x, z);
    if (a.id === "moonwell") {
      moon = e;
      cliff = cliffFactor(Math.atan2(z, x));
    }
    o = o === Infinity ? e : smin(o, e, 5);
  }
  let best = Infinity;
  let along = 0;
  let path: SceneTrail | null = null;
  PT.x = x;
  PT.z = z;
  for (const t of trailsAround(x, z)) {
    const d = segmentDistance(PT, t.from, t.to);
    if (d < best) {
      best = d;
      path = t;
      along = (x - t.from.x) * t.ux + (z - t.from.z) * t.uz;
    }
  }
  if (o === Infinity) o = 200;
  if (best < Infinity) o = smin(o, best - TRAIL_HALF_WIDTH, 5);
  out.o = o;
  out.cliff = moon === Infinity ? 0 : cliff * Math.max(0, Math.min(1, 1 - (moon - o) / 4));
  out.trail = best;
  out.along = along;
  out.path = path;
  return out;
}

/** True when a point is at least `margin` metres outside every trail. */
export function clearOfTrails(x: number, z: number, margin: number): boolean {
  PT.x = x;
  PT.z = z;
  return trailsAround(x, z).every((t) => segmentDistance(PT, t.from, t.to) > TRAIL_HALF_WIDTH + margin);
}

export type PondInfo = { d: number; area: Place | null; theta: number };

export const newPondInfo = (): PondInfo => ({ d: 0, area: null, theta: 0 });

/** Distance outside the nearest pond's edge (negative in the water). */
export function pondAt(x: number, z: number, out: PondInfo): PondInfo {
  let d = Infinity;
  out.area = null;
  for (const a of placesAround(x, z)) {
    const dx = x - a.center.x;
    const dz = z - a.center.z;
    const r = Math.hypot(dx, dz);
    if (r - a.pond.r - 6 > d) continue;
    const th = Math.atan2(dz, dx);
    const e = r - pondRadius(a, th);
    if (e < d) {
      d = e;
      out.area = a;
      out.theta = th;
    }
  }
  out.d = d === Infinity ? 999 : d;
  return out;
}

export type Weighted = { place: Place; w: number };

/**
 * How much each nearby place owns a point (0..1 each; the rest is the plain forest baseline, which is
 * Moonwell's neutral look). Fills `out` and returns how many entries it wrote.
 */
export function placeWeights(x: number, z: number, out: Weighted[]): number {
  let n = 0;
  let sum = 0;
  for (const a of placesAround(x, z)) {
    if (a.id === "moonwell") continue;
    const R = a.pond.r + a.clearing;
    const w = 1 - smoothstep(R * 0.7, R + 30, Math.hypot(x - a.center.x, z - a.center.z));
    if (w <= 0) continue;
    const slot = out[n] ?? (out[n] = { place: a, w: 0 });
    slot.place = a;
    slot.w = w;
    sum += w;
    n++;
  }
  if (sum > 1) for (let i = 0; i < n; i++) out[i]!.w /= sum;
  return n;
}

/** A place's own look within Ashenvale: ground, canopy, water, light and air. */
export type AreaLook = {
  grassA: Color;
  grassB: Color;
  grassC: Color;
  /** Canopy instance tints (multiply the painted canopy). */
  canopy: Color[];
  waterShallow: Color;
  waterDeep: Color;
  /** 0 lively ripples .. 1 mirror-still. */
  calm: number;
  fog: Color;
  fogK: number;
  fogScale: number;
  sunK: number;
  hemiK: number;
  hemiSky: Color;
  glowAdd: number;
  mistAdd: number;
  exposureK: number;
  grade: Color;
};

const c = (h: number) => new Color(h);

export const LOOKS: Record<AreaId, AreaLook> = {
  moonwell: {
    grassA: c(0x2c6a62), grassB: c(0x4c907e), grassC: c(0x9284d8),
    canopy: [c(0xffffff), c(0xf0f4ff), c(0xfff0f8)],
    waterShallow: c(0xffffff), waterDeep: c(0xffffff), calm: 0,
    fog: c(0xffffff), fogK: 0, fogScale: 1, sunK: 1, hemiK: 1, hemiSky: c(0xffffff), glowAdd: 0, mistAdd: 0, exposureK: 1, grade: c(0xffffff),
  },
  // Misty lily marsh: blue-violet moss, willow purples, lavender haze.
  mistmarsh: {
    grassA: c(0x3e7a70), grassB: c(0x62a08a), grassC: c(0x9a8ad8),
    canopy: [c(0xc8a8ff), c(0xb090f0), c(0xe0b8ff)],
    waterShallow: c(0xd4ecff), waterDeep: c(0x8a74e8), calm: 0.3,
    fog: c(0xb8b0e8), fogK: 0.6, fogScale: 0.6, sunK: 0.9, hemiK: 1.15, hemiSky: c(0xc8c0f4), glowAdd: 0.25, mistAdd: 0.5, exposureK: 1.06, grade: c(0xf6f2ff),
  },
  // Fresh rock pools: bright turquoise water, lavender birches, clean air.
  pools: {
    grassA: c(0x4a9a6a), grassB: c(0x7ac48a), grassC: c(0xb09ae8),
    canopy: [c(0xe8c8ff), c(0xf4dcff), c(0xd8b8ff)],
    waterShallow: c(0xb0fff0), waterDeep: c(0xb8f0ff), calm: 0,
    fog: c(0xe0d8f8), fogK: 0.3, fogScale: 1.1, sunK: 1.08, hemiK: 1.05, hemiSky: c(0xf0f0ff), glowAdd: 0, mistAdd: 0.15, exposureK: 1.04, grade: c(0xf6fffc),
  },
  // Dark grove under giant glowing mushrooms: deep indigo shade, teal-violet glow everywhere.
  hollow: {
    grassA: c(0x1e3e58), grassB: c(0x2a5a6a), grassC: c(0x5a4aa8),
    canopy: [c(0x8a7ad0), c(0x6a6ac0), c(0x9a6ad8)],
    waterShallow: c(0x90ffff), waterDeep: c(0x7a90ff), calm: 0.3,
    fog: c(0x2a2c78), fogK: 0.75, fogScale: 0.6, sunK: 0.35, hemiK: 0.7, hemiSky: c(0x6a70d8), glowAdd: 0.75, mistAdd: 0.3, exposureK: 1.08, grade: c(0xe4e8ff),
  },
  // High mountain tarn: cool silver-blue, dark pines, mirror water.
  tarn: {
    grassA: c(0x3e5e72), grassB: c(0x5a7e8a), grassC: c(0x9aa8e0),
    canopy: [c(0xa8b8e8), c(0x98a8e0), c(0xb8c0f0)],
    // Round 20: silver-cyan shallows (0xa0c0ff dulled the glowing rim to blue-grey; the deep keeps the tarn's cool violet).
    waterShallow: c(0xc8f0ff), waterDeep: c(0x7070d8), calm: 0.9,
    fog: c(0x8a9ae0), fogK: 0.5, fogScale: 0.8, sunK: 0.9, hemiK: 0.95, hemiSky: c(0xc0c8ff), glowAdd: 0.3, mistAdd: 0.25, exposureK: 1.0, grade: c(0xeef0ff),
  },
};

const B = (h: number) => new Color(h);

/** The four new biomes' looks (no concept art: from the brief), still in Ashenvale's twilight family. */
const BIOME_LOOKS: Record<"willow" | "crystal" | "ember" | "frost", AreaLook> = {
  // Weeping willows, hanging purple moss, pearly water.
  willow: {
    grassA: B(0x3e7a6a), grassB: B(0x6aa88a), grassC: B(0xb898e0),
    canopy: [B(0xd8b0ff), B(0xc8a0f0), B(0xe8c8ff)],
    // Round 20: a deeper pearl-violet middle (0xc8b8f0 left no depth gradient: one pale plate).
    waterShallow: B(0xf0e8ff), waterDeep: B(0xa090e0), calm: 0.7,
    fog: B(0xd0c0ec), fogK: 0.4, fogScale: 0.85, sunK: 1.12, hemiK: 0.88, hemiSky: B(0xdccaf8), glowAdd: 0.15, mistAdd: 0.3, exposureK: 0.97, grade: B(0xfaf4ff),
  },
  // Pale glowing crystal clusters, prism light.
  crystal: {
    grassA: B(0x3a6a7a), grassB: B(0x5a9aa0), grassC: B(0xa0c0ff),
    canopy: [B(0xb0d0ff), B(0xc0b8ff), B(0xa8f0f0)],
    waterShallow: B(0xc0ffff), waterDeep: B(0x90a8ff), calm: 0.6,
    fog: B(0xa8c0f0), fogK: 0.4, fogScale: 0.9, sunK: 1.12, hemiK: 0.85, hemiSky: B(0xc0d0f8), glowAdd: 0.45, mistAdd: 0.15, exposureK: 0.95, grade: B(0xf0f6ff),
  },
  // Amber and copper autumn canopy, warm lanterns: twilight, not summer.
  ember: {
    grassA: B(0x5a6a4a), grassB: B(0x8a8a5a), grassC: B(0xc08a6a),
    canopy: [B(0xffb070), B(0xff9a60), B(0xffc890)],
    waterShallow: B(0xffe8c8), waterDeep: B(0xc890a0), calm: 0.4,
    fog: B(0xe0a890), fogK: 0.45, fogScale: 0.85, sunK: 1.05, hemiK: 1.0, hemiSky: B(0xffd8c0), glowAdd: 0.3, mistAdd: 0.15, exposureK: 1.03, grade: B(0xfff2e8),
  },
  // Snowy pines, frosted grass, pale blue ice edge.
  frost: {
    grassA: B(0x9aaccc), grassB: B(0xd4dff0), grassC: B(0xa8b0e0),
    canopy: [B(0xe8f0ff), B(0xd8e4ff), B(0xf4f8ff)],
    waterShallow: B(0xc0e8ff), waterDeep: B(0x6070c8), calm: 0.85,
    // Snow is bright: a strong low key, a weak cool fill and less exposure keep it shaped, not flat white.
    fog: B(0xb0c0e8), fogK: 0.35, fogScale: 0.9, sunK: 1.2, hemiK: 0.78, hemiSky: B(0xb8c8f0), glowAdd: 0.2, mistAdd: 0.15, exposureK: 0.88, grade: B(0xeef2ff),
  },
};

const HOME_OF: Record<"marsh" | "pools" | "hollow" | "tarn", AreaId> = { marsh: "mistmarsh", pools: "pools", hollow: "hollow", tarn: "tarn" };

export function biomeLook(b: Biome): AreaLook {
  if (b === "moonwell") return LOOKS.moonwell;
  if (b === "willow" || b === "crystal" || b === "ember" || b === "frost") return BIOME_LOOKS[b];
  return LOOKS[HOME_OF[b]];
}

/** A cheap hash of a place key in [0, 1) per salt. */
export function placeHash(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const lookCache = new Map<string, AreaLook>();
const hsl = { h: 0, s: 0, l: 0 };

function vary(c: Color, dh: number, dl: number): Color {
  const o = c.clone();
  o.getHSL(hsl);
  o.setHSL((hsl.h + dh + 1) % 1, hsl.s, Math.max(0, Math.min(1, hsl.l * (1 + dl))));
  return o;
}

/** A place's look: the home valley's hand-tuned ones, else its biome's with a seeded sub-palette. */
export function lookOf(p: Place): AreaLook {
  const homeId = HOME_IDS.find((id) => id === p.id);
  if (p.home && homeId) return LOOKS[homeId];
  const ck = `${p.key}:${p.biome}:${p.center.x}`;
  const hit = lookCache.get(ck);
  if (hit) return hit;
  const base = biomeLook(p.biome);
  const dh = (placeHash(p.key, 1) - 0.5) * 0.08;
  const dl = (placeHash(p.key, 2) - 0.5) * 0.18;
  const dc = (placeHash(p.key, 3) - 0.5) * 0.12;
  const look: AreaLook = {
    ...base,
    grassA: vary(base.grassA, dh, dl),
    grassB: vary(base.grassB, dh * 0.7, dl),
    grassC: vary(base.grassC, dh * 1.5, dl * 0.5),
    canopy: base.canopy.map((c, i) => vary(c, dc + (i - 1) * 0.02, dl * 0.5)),
    waterShallow: vary(base.waterShallow, dh * 0.6, 0),
    waterDeep: vary(base.waterDeep, dh, 0),
  };
  lookCache.set(ck, look);
  return look;
}
