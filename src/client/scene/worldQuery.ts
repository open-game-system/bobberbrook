import { HOME_WORLD_SEED } from "../../game/lake";
import { REGION, isSea, worldFor, type Place, type Platform, type World } from "../../game/regions";
import { TRAIL_HALF_WIDTH, outerRadius, segmentDistance } from "../../game/world";
import { fbm } from "./noise";

/**
 * The scene's fast, read-only view of the endless world: the active world (the family's seed), places,
 * trails, platforms and seas round a point, cached per cell so per-vertex queries (terrain, forest) stay
 * cheap. Everything here is a pure function of the seed: the same world rebuilds identically.
 */

export type SceneTrail = { key: string; from: { x: number; z: number }; to: { x: number; z: number }; ux: number; uz: number; len: number; a: string; b: string };

let world: World = worldFor(HOME_WORLD_SEED);
let epoch = 0;
const placeCache = new Map<number, Place | null>();
const seaCache = new Map<number, boolean>();
const trailCache = new Map<number, SceneTrail[]>();
const placeNear = new Map<number, Place[]>();
const platCache = new Map<number, Platform[]>();
const channelCache = new Map<number, Channel[]>();

type Channel = { ax: number; az: number; bx: number; bz: number; w: number };

const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

/** Switches to the family's world (clears every cache). Returns true when it changed. */
export function setWorld(seed: number): boolean {
  if (seed === world.seed) return false;
  world = worldFor(seed);
  placeCache.clear();
  seaCache.clear();
  trailCache.clear();
  placeNear.clear();
  platCache.clear();
  channelCache.clear();
  towerCache.clear();
  epoch++;
  return true;
}

export function activeWorld(): World {
  return world;
}

/** Bumped every time the world changes (streams rebuild). */
export function worldEpoch(): number {
  return epoch;
}

export const cellI = (x: number) => Math.round(x / REGION);

export function placeIn(i: number, j: number): Place | null {
  const k = key(i, j);
  let p = placeCache.get(k);
  if (p === undefined) {
    p = world.placeAt({ i, j });
    placeCache.set(k, p);
  }
  return p;
}

export function seaCell(i: number, j: number): boolean {
  const k = key(i, j);
  let s = seaCache.get(k);
  if (s === undefined) {
    s = isSea(world.seed, { i, j });
    seaCache.set(k, s);
  }
  return s;
}

/** Places in the 3x3 cells round a point's cell (every place whose clearing or pond can reach it). */
export function placesAround(x: number, z: number): Place[] {
  const i = cellI(x);
  const j = cellI(z);
  const k = key(i, j);
  let hit = placeNear.get(k);
  if (!hit) {
    hit = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const p = placeIn(i + di, j + dj);
      if (p) hit.push(p);
    }
    placeNear.set(k, hit);
  }
  return hit;
}

/** Places within `cells` cells of a point. */
export function placesWithin(x: number, z: number, cells: number): Place[] {
  const i = cellI(x);
  const j = cellI(z);
  const out: Place[] = [];
  for (let di = -cells; di <= cells; di++) for (let dj = -cells; dj <= cells; dj++) {
    const p = placeIn(i + di, j + dj);
    if (p) out.push(p);
  }
  return out;
}

/** Trails that can pass near a point (from the 3x3 cells round it). */
export function trailsAround(x: number, z: number): SceneTrail[] {
  const i = cellI(x);
  const j = cellI(z);
  const k = key(i, j);
  let hit = trailCache.get(k);
  if (!hit) {
    hit = world.trailsNear({ x: i * REGION, z: j * REGION }, 1).map((t) => {
      const dx = t.to.x - t.from.x;
      const dz = t.to.z - t.from.z;
      const len = Math.hypot(dx, dz) || 1;
      return { key: [t.a, t.b].sort().join("|"), from: t.from, to: t.to, ux: dx / len, uz: dz / len, len, a: t.a, b: t.b };
    });
    trailCache.set(k, hit);
  }
  return hit;
}

/** Trails within `cells` cells of a point (deduplicated). */
export function trailsWithin(x: number, z: number, cells: number): SceneTrail[] {
  const seen = new Set<string>();
  const out: SceneTrail[] = [];
  const i = cellI(x);
  const j = cellI(z);
  for (let di = -cells; di <= cells; di++) for (let dj = -cells; dj <= cells; dj++)
    for (const t of trailsAround((i + di) * REGION, (j + dj) * REGION)) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      out.push(t);
    }
  return out;
}

/** Boat docks and zeppelin moorings of the 3x3 cells round a point. */
export function platformsAround(x: number, z: number): Platform[] {
  const i = cellI(x);
  const j = cellI(z);
  const k = key(i, j);
  let hit = platCache.get(k);
  if (!hit) {
    hit = world.platformsNear({ x: i * REGION, z: j * REGION }, 1);
    platCache.set(k, hit);
  }
  return hit;
}

export function platformsWithin(x: number, z: number, cells: number): Platform[] {
  const seen = new Set<string>();
  const out: Platform[] = [];
  const i = cellI(x);
  const j = cellI(z);
  for (let di = -cells; di <= cells; di += 1) for (let dj = -cells; dj <= cells; dj += 1)
    for (const p of world.platformsNear({ x: (i + di) * REGION, z: (j + dj) * REGION }, 0)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  return out;
}

const towerCache = new Map<number, { x: number; z: number; y: number }[]>();

/** Zeppelin towers of the 3x3 cells round a point (centre and foot height). */
export function towersAround(x: number, z: number, groundAt: (x: number, z: number) => number): { x: number; z: number; y: number }[] {
  const k = key(cellI(x), cellI(z));
  let hit = towerCache.get(k);
  if (!hit) {
    const seen = new Set<string>();
    hit = [];
    for (const p of platformsAround(x, z)) {
      if (p.kind !== "zeppelin" || seen.has(p.place)) continue;
      seen.add(p.place);
      const place = world.placeById(p.place);
      if (!place) continue;
      const t = world.towerAt(place);
      hit.push({ x: t.x, z: t.z, y: Math.max(0, groundAt(t.x, t.z)) });
    }
    towerCache.set(k, hit);
  }
  return hit;
}

/** Distance to the nearest zeppelin tower round a point (Infinity when none). */
export function towerDist(x: number, z: number, groundAt: (x: number, z: number) => number): number {
  let d = Infinity;
  for (const t of towersAround(x, z, groundAt)) d = Math.min(d, Math.hypot(t.x - x, t.z - z));
  return d;
}

/** Distance to the nearest boat dock round a point (the dock and its moored boat, ~14 m out from the land end). */
export function dockDist(x: number, z: number): number {
  let d = Infinity;
  PP.x = x;
  PP.z = z;
  for (const p of platformsAround(x, z)) {
    if (p.kind !== "boat") continue;
    const dx = p.to.x - p.at.x;
    const dz = p.to.z - p.at.z;
    const len = Math.hypot(dx, dz) || 1;
    PA.x = p.at.x - (dx / len) * 3;
    PA.z = p.at.z - (dz / len) * 3;
    PB.x = p.at.x + (dx / len) * 14;
    PB.z = p.at.z + (dz / len) * 14;
    d = Math.min(d, segmentDistance(PP, PA, PB));
  }
  return d;
}

/** Signed distance outside a place's clearing (negative inside). */
export function clearingEdge(a: Place, x: number, z: number): number {
  const dx = x - a.center.x;
  const dz = z - a.center.z;
  const r = Math.hypot(dx, dz);
  if (a.id === "moonwell") return r - outerRadius(Math.atan2(dz, dx));
  return r - (a.pond.r + a.clearing);
}

/** Where a boat's water channel runs: from just past its dock out to sea and in to the far dock. */
function channelsAround(x: number, z: number): Channel[] {
  const i = cellI(x);
  const j = cellI(z);
  const k = key(i, j);
  let hit = channelCache.get(k);
  if (!hit) {
    hit = [];
    for (const p of platformsAround(x, z)) {
      if (p.kind !== "boat") continue;
      const dx = p.to.x - p.at.x;
      const dz = p.to.z - p.at.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      hit.push({ ax: p.at.x + ux * 7, az: p.at.z + uz * 7, bx: p.to.x - ux * 7, bz: p.to.z - uz * 7, w: 6 });
    }
    channelCache.set(k, hit);
  }
  return hit;
}

const HALF = REGION / 2;
const ROUND = 22;
const PA = { x: 0, z: 0 };
const PB = { x: 0, z: 0 };
const PP = { x: 0, z: 0 };

/**
 * Signed distance to open sea (metres): positive on land, negative at sea. Sea cells are rounded,
 * wobbly-coasted squares; each boat route cuts a channel in to its docks. Clearings always stay land.
 */
export function seaDist(x: number, z: number): number {
  const i = cellI(x);
  const j = cellI(z);
  let d = 1e9;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const ci = i + di;
    const cj = j + dj;
    if (!seaCell(ci, cj)) continue;
    // A rounded box per sea cell, its coast 8 m inside the cell (neighbouring clearings keep a margin),
    // reaching on into any sea neighbour so the seas merge without seams.
    const ext = (si: number, sj: number) => (seaCell(si, sj) ? HALF + ROUND + 6 : HALF - 8);
    const x0 = ci * REGION - ext(ci - 1, cj);
    const x1 = ci * REGION + ext(ci + 1, cj);
    const z0 = cj * REGION - ext(ci, cj - 1);
    const z1 = cj * REGION + ext(ci, cj + 1);
    const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - ROUND);
    const qz = Math.abs(z - (z0 + z1) / 2) - ((z1 - z0) / 2 - ROUND);
    d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - ROUND);
  }
  if (d < 1e8) d += (fbm(x * 0.03, z * 0.03, 3, 404) - 0.5) * 16;
  for (const c of channelsAround(x, z)) {
    PA.x = c.ax; PA.z = c.az; PB.x = c.bx; PB.z = c.bz; PP.x = x; PP.z = z;
    const w = c.w + (fbm(x * 0.08, z * 0.08, 2, 405) - 0.5) * 3;
    d = Math.min(d, segmentDistance(PP, PA, PB) - w);
  }
  if (d > 40) return d;
  // Clearings and trails stay dry.
  let open = 1e9;
  for (const a of placesAround(x, z)) open = Math.min(open, clearingEdge(a, x, z));
  for (const t of trailsAround(x, z)) {
    PP.x = x; PP.z = z;
    open = Math.min(open, segmentDistance(PP, t.from, t.to) - TRAIL_HALF_WIDTH);
  }
  return Math.max(d, 3 - open);
}
