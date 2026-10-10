import { rand } from "./rng";
import {
  AREAS, OBSTACLES, STEER_HEADINGS, TRAILS, TRAIL_HALF_WIDTH, castFrom as homeCastFrom, distance, inClearing, inPond, onDock, polarIn, pondRadius,
  castRingIn, segmentDistance, turned, waterAt, type Area, type PondPlace, type Vec, type Water,
} from "./world";

/**
 * The endless valley. The world is a grid of REGION-sized cells; each cell is a place to fish (or open
 * water, "sea"), generated from the family's world seed, so the same seed always gives the same world:
 * anything the family has found stays exactly where it was. The five hand-made places of the home
 * valley sit in the cells round the origin. Neighbouring places are joined by forest trails; boats cross
 * the seas and zeppelins fly between far towers.
 */
export const REGION = 96;
export const BIOMES = ["marsh", "pools", "hollow", "tarn", "willow", "crystal", "ember", "frost"] as const;
export type Biome = (typeof BIOMES)[number] | "moonwell";

export type Cell = { i: number; j: number };

/** A place to fish: a pond in a clearing. The home valley's places are Areas with these extra fields. */
export type Place = PondPlace & { key: string; cell: Cell; biome: Biome; home: boolean; ring: number };

export type Trail = { from: Vec; to: Vec; a: string; b: string };

export type RouteKind = "boat" | "zeppelin";
/** One end of a boat or zeppelin route: stand here together to ride to `to`. */
export type Platform = { id: string; kind: RouteKind; place: string; at: Vec; to: Vec; toPlace: string; path: Vec[] };

const HOME_CELLS: Record<string, Area["id"]> = { "0,0": "moonwell", "-1,0": "mistmarsh", "0,-1": "pools", "1,0": "hollow", "1,-1": "tarn" };
const HOME_BIOME: Record<Area["id"], Biome> = { moonwell: "moonwell", mistmarsh: "marsh", pools: "pools", hollow: "hollow", tarn: "tarn" };
/** Trails out of the home valley into the generated world (from a home cell to a neighbour cell). */
const HOME_EXITS: readonly [string, string][] = [
  ["0,0", "0,1"],
  ["-1,0", "-2,0"],
  ["-1,0", "-1,1"],
  ["0,-1", "0,-2"],
  ["0,-1", "-1,-1"],
  ["1,0", "2,0"],
  ["1,0", "1,1"],
  ["1,-1", "1,-2"],
  ["1,-1", "2,-1"],
];

export const cellKey = (c: Cell) => `${c.i},${c.j}`;
export const cellOf = (p: Vec): Cell => ({ i: Math.round(p.x / REGION), j: Math.round(p.z / REGION) });
const ring = (c: Cell) => Math.max(Math.abs(c.i), Math.abs(c.j));

/** A hash of the seed and some integers, in [0, 1). */
function h(seed: number, ...n: number[]): number {
  let x = seed >>> 0;
  for (const v of n) x = Math.floor(rand(x, v * 7919 + 13) * 4294967296);
  return rand(x, 1);
}

/** Smooth value noise for the seas. */
function noise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const v = (a: number, b: number) => h(seed, 9001, a, b);
  const top = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * s(fx);
  const bottom = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * s(fx);
  return top + (bottom - top) * s(fy);
}

/** Cell-wide open water (seas): never near home. */
export function isSea(seed: number, c: Cell): boolean {
  if (ring(c) < 3) return false;
  return noise(seed, c.i * 0.42 + 0.5, c.j * 0.42 + 0.5) > 0.66;
}

const NAME_PARTS: Record<Exclude<Biome, "moonwell">, { a: readonly string[]; b: readonly string[] }> = {
  marsh: { a: ["Duskreed", "Lantern", "Mossglow", "Fen", "Willowmist", "Bogbloom"], b: ["Marsh", "Mire", "Fen", "Reach"] },
  pools: { a: ["Whisper", "Silverstep", "Cascade", "Moonrill", "Rainbow", "Brightwater"], b: ["Pools", "Falls", "Steps", "Basins"] },
  hollow: { a: ["Glowcap", "Sporelight", "Shroomshade", "Lumen", "Rootdeep", "Twinkle"], b: ["Hollow", "Grotto", "Dell", "Glen"] },
  tarn: { a: ["Starfall", "Moonstone", "Skyglass", "Silverhush", "Nightbloom", "Comet"], b: ["Tarn", "Mere", "Lake", "Water"] },
  willow: { a: ["Weeping", "Softbough", "Greenveil", "Hushwillow", "Lilyshade", "Dreamwood"], b: ["Mere", "Pond", "Glade", "Bend"] },
  crystal: { a: ["Crystal", "Prism", "Gleamstone", "Shardlight", "Glimmer", "Quartz"], b: ["Glade", "Spring", "Basin", "Hollow"] },
  ember: { a: ["Ember", "Amberleaf", "Hearthglow", "Copperwood", "Lanternfall", "Sunset"], b: ["Grove", "Pond", "Dell", "Wood"] },
  frost: { a: ["Frostfall", "Snowpine", "Icebell", "Winterglow", "Hoarfrost", "Starsnow"], b: ["Pond", "Lake", "Tarn", "Hollow"] },
};

function placeName(seed: number, c: Cell, biome: Exclude<Biome, "moonwell">): string {
  const parts = NAME_PARTS[biome];
  const a = parts.a[Math.floor(h(seed, 31, c.i, c.j) * parts.a.length)]!;
  const b = parts.b[Math.floor(h(seed, 37, c.i, c.j) * parts.b.length)]!;
  return `${a} ${b}`;
}

/** Which way is inward (toward home) for a cell, among its land neighbours: the always-open trail. */
function inwardNeighbour(seed: number, c: Cell): Cell | null {
  const options = DIRS.map((d) => ({ i: c.i + d.i, j: c.j + d.j })).filter((n) => ring(n) < ring(c) && !isSea(seed, n));
  if (options.length === 0) return null;
  return options[Math.floor(h(seed, 41, c.i, c.j) * options.length)]!;
}

const DIRS: readonly Cell[] = [
  { i: 1, j: 0 },
  { i: -1, j: 0 },
  { i: 0, j: 1 },
  { i: 0, j: -1 },
];

const sameCell = (a: Cell, b: Cell) => a.i === b.i && a.j === b.j;

/** Next-door cells (no diagonals). */
export const adjacent = (a: Cell, b: Cell) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1;

/** The pair {x, y} is the pair {a, b}, either way round. */
export const samePair = (x: string, y: string, a: string, b: string) => (x === a && y === b) || (x === b && y === a);

/** Whether a trail joins two neighbouring cells when either is in the home valley: hand-made trails, or the home exits. */
export function homeLinked(ka: string, kb: string): boolean {
  const ha = HOME_CELLS[ka];
  const hb = HOME_CELLS[kb];
  if (ha !== undefined && hb !== undefined) return TRAILS.some((t) => samePair(t.joins[0], t.joins[1], ha, hb));
  return HOME_EXITS.some(([x, y]) => samePair(x, y, ka, kb));
}

/** Whether a trail joins two neighbouring generated land cells: always toward home, else by the seed (55%). */
export function wildLinked(seed: number, a: Cell, b: Cell): boolean {
  if (pointsAt(inwardNeighbour(seed, a), b) || pointsAt(inwardNeighbour(seed, b), a)) return true;
  const [lo, hi] = cellKey(a) < cellKey(b) ? [a, b] : [b, a];
  return h(seed, 51, lo.i, lo.j, hi.i, hi.j) < 0.55;
}

const pointsAt = (n: Cell | null, c: Cell) => (n ? sameCell(n, c) : false);

/** The first land cell 2–6 cells out across the sea from `c` in direction `d` (null if it is all sea). */
export function farShore(seed: number, c: Cell, d: Cell): Cell | null {
  for (let k = 2; k <= 6; k++) {
    const far = { i: c.i + d.i * k, j: c.j + d.j * k };
    if (!isSea(seed, far)) return far;
  }
  return null;
}

/** Walks predecessors back from `to` to `from`; [] when `to` was never reached. */
export function tracePath(prev: ReadonlyMap<string, Cell>, from: Cell, to: Cell): Cell[] {
  const path: Cell[] = [to];
  while (!sameCell(path[0]!, from)) {
    const p = prev.get(cellKey(path[0]!));
    if (!p) return [];
    path.unshift(p);
  }
  return path;
}

export type World = {
  seed: number;
  /** Where a place's zeppelin tower stands (only tower places have one). */
  towerAt(p: Place): Vec;
  placeAt(c: Cell): Place | null;
  /** A place by its id: "moonwell", "mistmarsh"… for the home valley, "i,j" for generated places. */
  placeById(id: string): Place | null;
  /** The place a point is in (its clearing), or null on a trail, at sea or in the forest. */
  areaAt(p: Vec): Place | null;
  /** Places within `cells` cells of a point (the scene and maps draw these). */
  placesNear(p: Vec, cells: number): Place[];
  trailsNear(p: Vec, cells: number): Trail[];
  platformsNear(p: Vec, cells: number): Platform[];
  linked(a: Cell, b: Cell): boolean;
  onLand(p: Vec): boolean;
  walkable(p: Vec): boolean;
  advance(pos: Vec, vel: Vec, dt: number): Vec;
  castFrom(p: Vec): { bobber: Vec; water: Water; place: Place } | null;
  /** The nearest spot within `range` to stand and cast from (just up the bank), or null when no water is that close. */
  fishingSpot(p: Vec, range: number, taken?: Vec[]): Vec | null;
  /** Next point to head for on the way from `from` to `to` (round ponds, along trails). */
  navNext(from: Vec, to: Vec): Vec;
};

/** Fishing spots: tried every 7.5° round each pond, this far up the bank. */
const SPOT_ANGLES = 48;
const SPOT_BACK = 1.2;
/** Each fisher's own bit of bank: at least this far from where the others stand or are heading. */
const SPOT_APART = 3.5;

const worlds = new Map<number, World>();
/** The world for a seed (cached: the room, the TV and every phone share one per seed). */
export function worldFor(seed: number): World {
  const hit = worlds.get(seed);
  if (hit) return hit;
  const w = createWorld(seed);
  worlds.set(seed, w);
  if (worlds.size > 8) worlds.delete(worlds.keys().next().value ?? seed);
  return w;
}

export function createWorld(seed: number): World {
  const places = new Map<string, Place | null>();
  const trailCache = new Map<string, Trail[]>();
  const platformCache = new Map<string, Platform[]>();

  function placeAt(c: Cell): Place | null {
    const key = cellKey(c);
    if (places.has(key)) return places.get(key) ?? null;
    const p = makePlace(c);
    places.set(key, p);
    return p;
  }

  function makePlace(c: Cell): Place | null {
    const key = cellKey(c);
    const homeId = HOME_CELLS[key];
    if (homeId) {
      const area = AREAS.find((a) => a.id === homeId)!;
      return { ...area, key, cell: c, biome: HOME_BIOME[homeId], home: true, ring: ring(c) };
    }
    if (isSea(seed, c)) return null;
    const biome = BIOMES[Math.floor(h(seed, 11, c.i, c.j) * BIOMES.length)]!;
    const r = 9 + 6 * h(seed, 13, c.i, c.j);
    const jitter = (k: number) => (h(seed, k, c.i, c.j) - 0.5) * 30;
    return {
      id: key,
      key,
      cell: c,
      biome,
      home: false,
      ring: ring(c),
      name: placeName(seed, c, biome),
      center: { x: c.i * REGION + jitter(17), z: c.j * REGION + jitter(19) },
      pond: {
        r,
        bumps: [1 + 1.6 * h(seed, 21, c.i, c.j), 0.6 + 1.0 * h(seed, 22, c.i, c.j), 0.3 + 0.7 * h(seed, 23, c.i, c.j)],
        phases: [6.28 * h(seed, 24, c.i, c.j), 6.28 * h(seed, 25, c.i, c.j), 6.28 * h(seed, 26, c.i, c.j)],
      },
      clearing: 10 + 3 * h(seed, 27, c.i, c.j),
      water: biome,
    };
  }

  function linked(a: Cell, b: Cell): boolean {
    if (!adjacent(a, b) || !placeAt(a) || !placeAt(b)) return false;
    const ka = cellKey(a);
    const kb = cellKey(b);
    if (HOME_CELLS[ka] !== undefined || HOME_CELLS[kb] !== undefined) return homeLinked(ka, kb);
    return wildLinked(seed, a, b);
  }

  /** Trails leaving a cell's place (to linked neighbours), as segments from clearing edge to clearing edge. */
  function trailsOf(c: Cell): Trail[] {
    const key = cellKey(c);
    const hit = trailCache.get(key);
    if (hit) return hit;
    const here = placeAt(c);
    const out: Trail[] = [];
    if (here) {
      for (const d of DIRS) {
        const n = { i: c.i + d.i, j: c.j + d.j };
        if (!linked(c, n)) continue;
        const there = placeAt(n)!;
        if (here.home && there.home) {
          const t = TRAILS.find((tr) => tr.joins.some((j) => j === here.id) && tr.joins.some((j) => j === there.id))!;
          out.push({ from: t.from, to: t.to, a: here.key, b: there.key });
          continue;
        }
        const dx = there.center.x - here.center.x;
        const dz = there.center.z - here.center.z;
        const len = Math.hypot(dx, dz);
        const ux = dx / len;
        const uz = dz / len;
        const reachA = edgeReach(here, Math.atan2(uz, ux));
        const reachB = edgeReach(there, Math.atan2(-uz, -ux));
        out.push({
          from: { x: here.center.x + ux * reachA, z: here.center.z + uz * reachA },
          to: { x: there.center.x - ux * reachB, z: there.center.z - uz * reachB },
          a: here.key,
          b: there.key,
        });
      }
    }
    trailCache.set(key, out);
    return out;
  }

  /** How far from a place's centre the trail starts: just inside its clearing. */
  function edgeReach(p: Place, _theta: number): number {
    if (p.id === "moonwell") return 29;
    return p.pond.r + p.clearing - 1.5;
  }

  function cellsAround(p: Vec, cells: number): Cell[] {
    const c = cellOf(p);
    const out: Cell[] = [];
    for (let di = -cells; di <= cells; di++) for (let dj = -cells; dj <= cells; dj++) out.push({ i: c.i + di, j: c.j + dj });
    return out;
  }

  function placesNear(p: Vec, cells: number): Place[] {
    return cellsAround(p, cells)
      .map(placeAt)
      .filter((x): x is Place => x !== null);
  }

  function trailsNear(p: Vec, cells: number): Trail[] {
    const seen = new Set<string>();
    const out: Trail[] = [];
    for (const c of cellsAround(p, cells))
      for (const t of trailsOf(c)) {
        const k = [t.a, t.b].sort().join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
    return out;
  }

  function onTrailHere(p: Vec): boolean {
    return trailsNear(p, 1).some((t) => segmentDistance(p, t.from, t.to) <= TRAIL_HALF_WIDTH);
  }

  function onLand(p: Vec): boolean {
    const near = placesNear(p, 1);
    if (near.some((a) => inPond(a, p, 0.4))) return false;
    if (!near.some((a) => inClearing(a, p)) && !onTrailHere(p)) return false;
    return OBSTACLES.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= o.r + 0.5);
  }

  function walkable(p: Vec): boolean {
    return onDock(p) || onLand(p);
  }

  function hitsObstacle(p: Vec): boolean {
    return !OBSTACLES.every((o) => Math.hypot(p.x - o.x, p.z - o.z) >= o.r + 0.5);
  }

  function advance(pos: Vec, vel: Vec, dt: number): Vec {
    if (dt <= 0 || (vel.x === 0 && vel.z === 0)) return pos;
    let p = pos;
    let left = dt;
    while (left > 1e-9) {
      const step = Math.min(0.05, left);
      left -= step;
      const next = stepOnce(p, vel, step);
      if (!next) break;
      p = next;
    }
    return p;
  }

  /** One small step: straight on if walkable; else steer round a rock, or slide along an edge; undefined when stuck. */
  function stepOnce(p: Vec, vel: Vec, step: number): Vec | undefined {
    const ahead = { x: p.x + vel.x * step, z: p.z + vel.z * step };
    const heads = walkable(ahead) ? [vel] : hitsObstacle(ahead) ? STEER_HEADINGS.map((a) => turned(vel, a)) : [{ x: vel.x, z: 0 }, { x: 0, z: vel.z }];
    return heads.map((v) => ({ x: p.x + v.x * step, z: p.z + v.z * step })).find(walkable);
  }

  function areaAt(p: Vec): Place | null {
    return placesNear(p, 1).find((a) => inClearing(a, p)) ?? null;
  }

  function castFrom(p: Vec): { bobber: Vec; water: Water; place: Place } | null {
    const moonwell = placeAt({ i: 0, j: 0 })!;
    if (onDock(p)) {
      const c = homeCastFrom(p);
      return c ? { ...c, place: moonwell } : null;
    }
    if (!onLand(p)) return null;
    for (const a of placesNear(p, 1)) {
      const { r, theta } = polarIn(a, p);
      if (r - pondRadius(a, theta) > 2.6) continue;
      return { bobber: castRingIn(a, theta), water: a.id === "moonwell" ? waterAt(theta) : a.water, place: a };
    }
    return null;
  }

  function fishingSpot(p: Vec, range: number, taken: Vec[] = []): Vec | null {
    const free = (q: Vec) => taken.every((t) => distance(t, q) >= SPOT_APART);
    if (castFrom(p) && free(p)) return p;
    let best: Vec | null = null;
    let bestD = range;
    for (const a of placesNear(p, 1)) {
      for (let k = 0; k < SPOT_ANGLES; k++) {
        const theta = (k / SPOT_ANGLES) * 2 * Math.PI;
        const r = pondRadius(a, theta) + SPOT_BACK;
        const q = { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
        const d = distance(p, q);
        if (d < bestD && walkable(q) && castFrom(q) && free(q)) {
          best = q;
          bestD = d;
        }
      }
    }
    return best;
  }

  function crossesWater(a: Vec, b: Vec): boolean {
    const n = Math.max(2, Math.ceil(distance(a, b) / 1.5));
    const near = placesNear(a, 1);
    for (let i = 1; i < n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
      if (near.some((ar) => inPond(ar, p, 1.2))) return true;
    }
    return false;
  }

  function roundThePond(from: Vec, to: Vec): Vec {
    if (!crossesWater(from, to)) return to;
    const a = areaAt(from) ?? placesNear(to, 1).find((ar) => inPond(ar, to, 6)) ?? placeAt({ i: 0, j: 0 })!;
    const me = polarIn(a, from);
    const goal = polarIn(a, to);
    let gap = goal.theta - me.theta;
    while (gap > Math.PI) gap -= 2 * Math.PI;
    while (gap < -Math.PI) gap += 2 * Math.PI;
    const theta = me.theta + Math.sign(gap || 1) * Math.min(Math.abs(gap), 0.22);
    const r = pondRadius(a, theta) + 3.2;
    return { x: a.center.x + Math.cos(theta) * r, z: a.center.z + Math.sin(theta) * r };
  }

  /** Places to walk through, by trail, from one cell to another (breadth-first, at most `limit` cells searched). */
  function routeCells(from: Cell, to: Cell, limit = 400): Cell[] {
    return tracePath(searchCells(from, to, limit), from, to);
  }

  /** Breadth-first over linked cells from `from` until `to` or `limit` cells seen: each reached cell's predecessor. */
  function searchCells(from: Cell, to: Cell, limit: number): Map<string, Cell> {
    const prev = new Map<string, Cell>();
    const seen = new Set<string>([cellKey(from)]);
    const queue: Cell[] = [from];
    while (queue.length > 0 && seen.size < limit) {
      const at = queue.shift()!;
      if (sameCell(at, to)) break;
      expandCell(at, seen, prev, queue);
    }
    return prev;
  }

  function expandCell(at: Cell, seen: Set<string>, prev: Map<string, Cell>, queue: Cell[]): void {
    for (const d of DIRS) {
      const n = { i: at.i + d.i, j: at.j + d.j };
      const k = cellKey(n);
      if (seen.has(k) || !linked(at, n)) continue;
      seen.add(k);
      prev.set(k, at);
      queue.push(n);
    }
  }

  function navNext(from: Vec, to: Vec): Vec {
    const here = areaAt(from);
    const there = areaAt(to);
    if (!there || (here && here.key === there.key)) return roundThePond(from, to);
    if (!here) return trailEndToward(from, to);
    return byTrail(here, there, from, to);
  }

  /** On a trail: walk to the end nearer the target. */
  function trailEndToward(from: Vec, to: Vec): Vec {
    const t = trailsNear(from, 1).find((tr) => segmentDistance(from, tr.from, tr.to) <= 4);
    if (!t) return to;
    return distance(t.from, to) < distance(t.to, to) ? t.from : t.to;
  }

  /** In one place, bound for another: round the pond to the trailhead of the first trail on the way, then down it. */
  function byTrail(here: Place, there: Place, from: Vec, to: Vec): Vec {
    const next = routeCells(here.cell, there.cell)[1];
    if (!next) return roundThePond(from, to);
    const t = trailsOf(here.cell).find((tr) => tr.b === cellKey(next));
    if (!t) return to;
    // At the trailhead: set off down the trail.
    if (distance(from, t.from) < 3) return t.to;
    return roundThePond(from, t.from);
  }

  // ---------- boats and zeppelins ----------

  /** A boat crossing from a land cell over open water in one direction, to the first land on the far side. */
  function boatFrom(c: Cell, d: Cell): Platform | null {
    const here = placeAt(c);
    if (!here || !isSea(seed, { i: c.i + d.i, j: c.j + d.j })) return null;
    const far = farShore(seed, c, d);
    return far ? boatTo(here, c, far, d) : null;
  }

  /** The boat from `here` (cell `c`) to the far shore's cell, unless there is no place there or the route isn't run. */
  function boatTo(here: Place, c: Cell, far: Cell, d: Cell): Platform | null {
    const there = placeAt(far);
    if (!there) return null;
    const [lo, hi] = cellKey(c) < cellKey(far) ? [c, far] : [far, c];
    if (h(seed, 61, lo.i, lo.j, hi.i, hi.j) > 0.7) return null;
    const at = dockPoint(here, d);
    const to = dockPoint(there, { i: -d.i, j: -d.j });
    return { id: `boat:${cellKey(c)}>${cellKey(far)}`, kind: "boat", place: here.key, at, to, toPlace: there.key, path: [at, to] };
  }

  /** Where a dock or zeppelin mooring stands: on the clearing's edge, facing a direction. */
  function dockPoint(p: Place, d: Cell): Vec {
    const theta = Math.atan2(d.j, d.i);
    const r = p.id === "moonwell" ? 26 : p.pond.r + p.clearing - 3;
    return { x: p.center.x + Math.cos(theta) * r, z: p.center.z + Math.sin(theta) * r };
  }

  /** A zeppelin tower's foot in a place: Moonwell's on its open east shore, elsewhere on the clearing's south-east. */
  function towerAt(p: Place): Vec {
    if (p.id === "moonwell") return { x: 24.5, z: 4.5 };
    const r = p.pond.r + p.clearing * 0.55;
    return { x: p.center.x + Math.cos(0.8) * r, z: p.center.z + Math.sin(0.8) * r };
  }
  /** Each route's mooring: beside the tower, on the side its zeppelin flies off toward. */
  function mooring(p: Place, d: Cell): Vec {
    const t = towerAt(p);
    return { x: t.x + d.i * 3.5, z: t.z + d.j * 3.5 };
  }

  /** Zeppelin towers: one per 5×5 block of cells (Moonwell Lake's block: at Moonwell), linked to the neighbouring blocks' towers. */
  const BLOCK = 5;
  function towerCell(bi: number, bj: number): Cell | null {
    if (bi === 0 && bj === 0) return { i: 0, j: 0 };
    for (let t = 0; t < 12; t++) {
      const c = { i: bi * BLOCK - 2 + Math.floor(h(seed, 71, bi, bj, t) * BLOCK), j: bj * BLOCK - 2 + Math.floor(h(seed, 73, bi, bj, t) * BLOCK) };
      const p = placeAt(c);
      if (p && !p.home) return c;
    }
    return null;
  }
  const blockOf = (c: Cell) => ({ bi: Math.floor((c.i + 2) / BLOCK), bj: Math.floor((c.j + 2) / BLOCK) });

  function zeppelinsFrom(c: Cell): Platform[] {
    const { bi, bj } = blockOf(c);
    const tower = towerCell(bi, bj);
    if (!tower || !sameCell(tower, c)) return [];
    const here = placeAt(c)!;
    const out: Platform[] = [];
    for (const d of DIRS) {
      const other = towerCell(bi + d.i, bj + d.j);
      if (!other) continue;
      const there = placeAt(other)!;
      const at = mooring(here, d);
      const to = mooring(there, { i: -d.i, j: -d.j });
      out.push({ id: `zeppelin:${cellKey(c)}>${cellKey(other)}`, kind: "zeppelin", place: here.key, at, to, toPlace: there.key, path: [at, to] });
    }
    return out;
  }

  function platformsOf(c: Cell): Platform[] {
    const key = cellKey(c);
    const hit = platformCache.get(key);
    if (hit) return hit;
    const boats = DIRS.map((d) => boatFrom(c, d)).filter((x): x is Platform => x !== null);
    const out = [...boats, ...zeppelinsFrom(c)];
    platformCache.set(key, out);
    return out;
  }

  function platformsNear(p: Vec, cells: number): Platform[] {
    return cellsAround(p, cells).flatMap(platformsOf);
  }

  return {
    seed,
    towerAt,
    placeAt,
    placeById: (id) => {
      const home = Object.entries(HOME_CELLS).find(([, hid]) => hid === id)?.[0] ?? id;
      const [i, j] = home.split(",").map(Number);
      return i === undefined || j === undefined || Number.isNaN(i) || Number.isNaN(j) ? null : placeAt({ i, j });
    },
    areaAt,
    placesNear,
    trailsNear,
    platformsNear,
    linked,
    onLand,
    walkable,
    advance,
    castFrom,
    fishingSpot,
    navNext,
  };

}

