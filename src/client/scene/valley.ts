import { Color } from "three";
import { AREAS, NORTH, TRAILS, TRAIL_HALF_WIDTH, angleGap, outerRadius, pondRadius, segmentDistance, type Area, type AreaId } from "../../game/world";
import { smoothstep } from "./noise";

/**
 * The valley as the scene sees it: how far a point is from open ground (clearings and trails), which
 * pond it is nearest, and how much each place "owns" it (for its sub-palette). Shared by the terrain,
 * the forest, the dressing and the mood blending, so they all agree with world.ts walkability.
 */

/** The ground mesh and forest cover this rectangle (metres). */
export const VALLEY = { x0: -125, x1: 125, z0: -135, z1: 95 } as const;

export const AREA_INDEX: Record<AreaId, number> = { moonwell: 0, mistmarsh: 1, pools: 2, hollow: 3, tarn: 4 };

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function cliffFactor(theta: number): number {
  return Math.max(0, 1 - angleGap(theta, NORTH) / 0.75);
}

export type OpenInfo = { o: number; cliff: number; trail: number; trailIndex: number; along: number };

/** The clearing edge's signed distance for one place (negative inside its clearing). */
export function clearingEdge(a: Area, x: number, z: number): number {
  const dx = x - a.center.x;
  const dz = z - a.center.z;
  const r = Math.hypot(dx, dz);
  if (a.id === "moonwell") return r - outerRadius(Math.atan2(dz, dx));
  return r - (a.pond.r + a.clearing);
}

/**
 * Signed distance (metres) from open ground: negative inside a clearing or on a trail, positive in the
 * forest. Also the cliff factor (Moonwell's falls cliff) and the nearest trail (index, distance from its
 * centre line, distance along it).
 */
export function openAt(x: number, z: number, out: OpenInfo): OpenInfo {
  let o = Infinity;
  let moon = Infinity;
  let cliff = 0;
  for (const a of AREAS) {
    const e = clearingEdge(a, x, z);
    if (a.id === "moonwell") {
      moon = e;
      cliff = cliffFactor(Math.atan2(z, x));
    }
    o = o === Infinity ? e : smin(o, e, 5);
  }
  let best = Infinity;
  let bi = -1;
  let along = 0;
  TRAILS.forEach((t, i) => {
    const d = segmentDistance({ x, z }, t.from, t.to);
    if (d < best) {
      best = d;
      bi = i;
      const dx = t.to.x - t.from.x;
      const dz = t.to.z - t.from.z;
      along = ((x - t.from.x) * dx + (z - t.from.z) * dz) / Math.hypot(dx, dz);
    }
  });
  o = smin(o, best - TRAIL_HALF_WIDTH, 5);
  out.o = o;
  out.cliff = cliff * Math.max(0, Math.min(1, 1 - (moon - o) / 4));
  out.trail = best;
  out.trailIndex = bi;
  out.along = along;
  return out;
}

/** True when a point is at least `margin` metres outside every trail. */
export function clearOfTrails(x: number, z: number, margin: number): boolean {
  const p = { x, z };
  return TRAILS.every((t) => segmentDistance(p, t.from, t.to) > TRAIL_HALF_WIDTH + margin);
}

export type PondInfo = { d: number; area: Area; theta: number };

/** Distance outside the nearest pond's edge (negative in the water). */
export function pondAt(x: number, z: number, out: PondInfo): PondInfo {
  let d = Infinity;
  for (const a of AREAS) {
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
  out.d = d;
  return out;
}

/** How much each place owns a point (0..1 each; Moonwell is the baseline, so its weight is the rest). */
export function areaWeights(x: number, z: number, out: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 1; i < AREAS.length; i++) {
    const a = AREAS[i]!;
    const R = a.pond.r + a.clearing;
    const w = 1 - smoothstep(R * 0.7, R + 30, Math.hypot(x - a.center.x, z - a.center.z));
    out[i] = w;
    sum += w;
  }
  if (sum > 1) for (let i = 1; i < AREAS.length; i++) out[i]! /= sum;
  out[0] = Math.max(0, 1 - Math.min(1, sum));
  return out;
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
    grassA: c(0x40885a), grassB: c(0x68ac74), grassC: c(0x9a90d8),
    canopy: [c(0xffffff), c(0xf0f4ff), c(0xfff0f8)],
    waterShallow: c(0xffffff), waterDeep: c(0xffffff), calm: 0,
    fog: c(0xffffff), fogK: 0, fogScale: 1, sunK: 1, hemiK: 1, hemiSky: c(0xffffff), glowAdd: 0, mistAdd: 0, exposureK: 1, grade: c(0xffffff),
  },
  // Misty lily marsh: blue-violet moss, willow purples, lavender haze.
  mistmarsh: {
    grassA: c(0x3a6a72), grassB: c(0x5a8a8a), grassC: c(0x8a7ad0),
    canopy: [c(0xc8a8ff), c(0xb090f0), c(0xe0b8ff)],
    waterShallow: c(0xb8b0ff), waterDeep: c(0x9a80e0), calm: 0.55,
    fog: c(0xb4a4e0), fogK: 0.65, fogScale: 0.55, sunK: 0.8, hemiK: 1.0, hemiSky: c(0xc8b8f0), glowAdd: 0.25, mistAdd: 0.5, exposureK: 0.98, grade: c(0xf4eeff),
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
    waterShallow: c(0xa0c0ff), waterDeep: c(0x7070d8), calm: 0.9,
    fog: c(0x8a9ae0), fogK: 0.5, fogScale: 0.8, sunK: 0.9, hemiK: 0.95, hemiSky: c(0xc0c8ff), glowAdd: 0.3, mistAdd: 0.25, exposureK: 1.0, grade: c(0xeef0ff),
  },
};

export function lookOf(id: AreaId): AreaLook {
  return LOOKS[id];
}
