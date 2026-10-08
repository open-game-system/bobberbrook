import { produce, type Draft } from "immer";
import { dayPhase, timeOfDay, type TimeOfDay } from "./daycycle";
import { FISH, JOURNAL_FISH, SHELLS, bitesNow, fishById, type FishDef, type Rarity } from "./fish";
import { between, pickWeighted, rand } from "./rng";
import { REEL_START, integrateReel, type Reel } from "./reel";
import { TRAILS, WALK_SPEED, angleGap, castRingIn, distance, spawnPoint, type Vec, type Water } from "./world";
import { worldFor, type Place, type Platform, type World } from "./regions";

/** A place's id: "moonwell", "mistmarsh"… in the home valley, "i,j" for a generated place. */
export type PlaceId = string;
/** The world everything walks in when a caller doesn't name one (tests, the lab): the home valley and beyond. */
export const HOME_WORLD_SEED = 1;

/** Everything on the lake that changes with time. The room keeps one of these; every screen sees it. */
export const MAX_FISHERS = 4;
export const SEAT_COLORS = ["green", "yellow", "blue", "pink"] as const;
export type SeatColor = (typeof SEAT_COLORS)[number];

export const CAST_FLIGHT_MS = 900;
export const BITE_WINDOW_MS = 2600;
export const EASY_HOOK_DELAY_MS = 450;
export const CATCH_SHOW_MS = 3400;
/** A catch can be skipped (cast again) after this long. */
export const CATCH_SKIP_MS = 1200;
export const RESCUE_REEL_MS = 20_000;
export const SWIRL_LIFE_MS = 100_000;
export const SWIRL_CATCHES = 3;
export const SWIRL_RADIUS = 3.4;
export const GOLDEN_EVERY_MS = 4 * 60_000;
export const GOLDEN_FIRST_MS = 150_000;
export const GOLDEN_LIFE_MS = 50_000;
export const GOLDEN_CATCHES = 2;
/** Rod upgrades at these family shell totals: Willow, Bamboo, Brass, Starlight. */
export const ROD_AT = [0, 12, 40, 100] as const;
export const ROD_NAMES = ["Willow", "Bamboo", "Brass", "Starlight"] as const;
export const MOONFIN_JOURNAL = 8;

export type Mode = "walk" | "cast" | "wait" | "bite" | "reel" | "catch" | "ride";

export type Catch = { fishId: string; cm: number; shells: number; isNew: boolean; golden: boolean; at: number; seq: number };

export type Fisher = {
  seat: number;
  name: string | null;
  color: SeatColor;
  ogsId: string | null;
  easy: boolean;
  pos: Vec;
  vel: Vec;
  /** When pos was last brought up to date. */
  movedAt: number;
  /** When this fisher last touched the stick or the button (an idle fisher tags along after FOLLOW_AFTER_MS). */
  lastInputAt: number;
  /** Walking over to the family by itself. */
  following: boolean;
  facing: number;
  mode: Mode;
  bobber: Vec | null;
  water: Water | null;
  swirlId: number | null;
  castAt: number;
  biteAt: number;
  biteUntil: number;
  nibbles: number[];
  reel: Reel | null;
  catch: Catch | null;
  missSeq: number;
};

export type Swirl = { id: number; area: PlaceId; pos: Vec; theta: number; golden: boolean; since: number; until: number; catches: number };

/** A glowing shell on a trail: walk over it for a shell; it comes back later. */
export type Sparkle = { id: number; pos: Vec; backAt: number };

export type Ride = { platformId: string; kind: "boat" | "zeppelin"; from: Vec; to: Vec; toPlace: PlaceId; departAt: number; arriveAt: number; seats: number[] };

/** The last newly found place (the TV and narrator celebrate it). */
export type Discovery = { area: PlaceId; seat: number; at: number; seq: number };

export type JournalEntry = { count: number; bestCm: number; firstBy: string | null };

export type Lake = {
  seed: number;
  rngN: number;
  startedAt: number;
  now: number;
  fishers: Fisher[];
  swirls: Swirl[];
  swirlSeq: number;
  nextGoldenAt: number;
  journal: Record<string, JournalEntry>;
  shells: number;
  rodTier: number;
  /** Rod upgrades so far this room (the TV celebrates each new one). */
  upgradeSeq: number;
  /** The last few catches, newest last (host strip, campfire). */
  log: { seat: number; fishId: string; cm: number; isNew: boolean; at: number }[];
  catchSeq: number;
  campfire: boolean;
  progressLoaded: boolean;
  /** Places the family has found this room (Moonwell Lake from the start). */
  discovered: PlaceId[];
  discovery: Discovery | null;
  /** The family's world: the same seed always makes the same endless valley. */
  worldSeed: number;
  /** Fog-of-war tiles the family has seen ("i,j" in FOG_TILE-metre tiles). */
  revealed: string[];
  /** Everyone standing at a boat dock or zeppelin tower together: it leaves BOARD_MS after they gathered. */
  boarding: { platformId: string; since: number } | null;
  /** The family's boat or zeppelin trip, while it's under way. */
  ride: Ride | null;
  /** Shell sparkles along the trails, and the last one picked up (the TV and the picker's device chime). */
  sparkles: Sparkle[];
  pickup: { seat: number; sparkleId: number; at: number; seq: number } | null;
};

export function newLake(seed: number, now: number): Lake {
  const lake: Lake = {
    seed,
    rngN: 0,
    startedAt: now,
    now,
    fishers: [],
    swirls: [],
    swirlSeq: 0,
    nextGoldenAt: now + GOLDEN_FIRST_MS,
    journal: {},
    shells: 0,
    rodTier: 0,
    upgradeSeq: 0,
    log: [],
    catchSeq: 0,
    campfire: false,
    progressLoaded: false,
    discovered: ["moonwell"],
    discovery: null,
    sparkles: trailSparkles(),
    pickup: null,
    worldSeed: HOME_WORLD_SEED,
    revealed: [],
    boarding: null,
    ride: null,
  };
  return produce(lake, (d) => {
    spawnSwirl(d, now, false, "moonwell");
    spawnSwirl(d, now, false, "moonwell");
  });
}

function roll(d: Draft<Lake>): number {
  d.rngN += 1;
  return rand(d.seed, d.rngN);
}

function rollBetween(d: Draft<Lake>, min: number, max: number): number {
  return min + (max - min) * roll(d);
}

export function todOf(lake: Pick<Lake, "startedAt" | "now">): TimeOfDay {
  return timeOfDay(dayPhase(lake.startedAt, lake.now));
}

export function rodTierFor(shells: number): number {
  let tier = 0;
  ROD_AT.forEach((at, i) => {
    if (shells >= at) tier = i;
  });
  return tier;
}

export function speciesCount(journal: Record<string, JournalEntry>): number {
  return JOURNAL_FISH.filter((f) => (journal[f.id]?.count ?? 0) > 0).length;
}

// ---------- swirls ----------

function spawnSwirl(d: Draft<Lake>, now: number, golden: boolean, area: PlaceId): void {
  const place = worldFor(d.worldSeed).placeById(area);
  if (!place) return;
  const others = d.swirls.filter((s) => s.area === area).map((s) => s.theta);
  let theta = 0;
  for (let i = 0; i < 12; i++) {
    theta = roll(d) * 2 * Math.PI;
    if (others.every((o) => angleGap(o, theta) > 1.0)) break;
  }
  d.swirlSeq += 1;
  d.swirls.push({
    id: d.swirlSeq,
    area,
    pos: castRingIn(place, theta),
    theta,
    golden,
    since: now,
    until: now + (golden ? GOLDEN_LIFE_MS : SWIRL_LIFE_MS),
    catches: 0,
  });
}

/** A swirl is spent when its time is up or it has given its catches. */
export function swirlSpent(s: Pick<Swirl, "until" | "catches" | "golden">, now: number): boolean {
  return now >= s.until || s.catches >= (s.golden ? GOLDEN_CATCHES : SWIRL_CATCHES);
}

function refreshSwirls(d: Draft<Lake>, now: number): void {
  const spent = d.swirls.filter((s) => swirlSpent(s, now));
  if (spent.length === 0 && now < d.nextGoldenAt) return;
  const gone = new Set(spent.map((s) => s.id));
  d.swirls = d.swirls.filter((s) => !gone.has(s.id));
  for (const s of spent) if (!s.golden) spawnSwirl(d, now, false, s.area);
  if (now >= d.nextGoldenAt) bringGolden(d, now);
  freeFishers(d, gone);
}

/** A fisher whose swirl moved on keeps fishing the plain water there. */
function freeFishers(d: Draft<Lake>, gone: ReadonlySet<number>): void {
  for (const f of d.fishers) if (f.swirlId !== null && gone.has(f.swirlId)) f.swirlId = null;
}

function bringGolden(d: Draft<Lake>, now: number): void {
  d.nextGoldenAt = now + GOLDEN_EVERY_MS;
  if (d.swirls.some((s) => s.golden)) return;
  // The golden swirl shows up somewhere the family has been, more often away from home.
  const w = worldFor(d.worldSeed);
  const near = d.discovered.filter((id) => {
    const p = w.placeById(id);
    return p !== null && (d.fishers.length === 0 || d.fishers.some((f) => distance(f.pos, p.center) < 2.2 * 96));
  });
  const away = near.filter((a) => a !== "moonwell");
  const places = away.length > 0 && roll(d) < 0.75 ? away : near.length > 0 ? near : d.discovered;
  spawnSwirl(d, now, true, places[Math.floor(roll(d) * places.length)] ?? "moonwell");
}

/** Whoever walks into a place nobody has found yet discovers it: a celebration and a swirl there. */
function discover(d: Draft<Lake>, now: number): void {
  for (const f of d.fishers) {
    const area = worldFor(d.worldSeed).areaAt(f.pos);
    if (!area || d.discovered.includes(area.id)) continue;
    d.discovered.push(area.id);
    d.discovery = { area: area.id, seat: f.seat, at: now, seq: (d.discovery?.seq ?? 0) + 1 };
    spawnSwirl(d, now, false, area.id);
  }
}

export const SPARKLES_PER_TRAIL = 4;
export const SPARKLE_BACK_MS = 3 * 60_000;
const SPARKLE_REACH = 1.6;

/** Sparkles spaced evenly along each trail (not at the ends, which are in the places). */
export function trailSparkles(): Sparkle[] {
  return TRAILS.flatMap((t, ti) =>
    Array.from({ length: SPARKLES_PER_TRAIL }, (_, i) => {
      const k = (i + 1) / (SPARKLES_PER_TRAIL + 1);
      // A little side-to-side so they zig-zag down the path.
      const side = (i % 2 === 0 ? 1 : -1) * 1.1;
      const dx = t.to.x - t.from.x;
      const dz = t.to.z - t.from.z;
      const len = Math.hypot(dx, dz) || 1;
      return { id: ti * 10 + i, pos: { x: t.from.x + dx * k + (-dz / len) * side, z: t.from.z + dz * k + (dx / len) * side }, backAt: 0 };
    }),
  );
}

function pickUpSparkles(d: Draft<Lake>, now: number): void {
  for (const s of d.sparkles) {
    if (now < s.backAt) continue;
    const f = d.fishers.find((x) => distance(x.pos, s.pos) <= SPARKLE_REACH);
    if (!f) continue;
    s.backAt = now + SPARKLE_BACK_MS;
    d.shells += 1;
    const tier = rodTierFor(d.shells);
    if (tier > d.rodTier) {
      d.rodTier = tier;
      d.upgradeSeq += 1;
    }
    d.pickup = { seat: f.seat, sparkleId: s.id, at: now, seq: (d.pickup?.seq ?? 0) + 1 };
  }
}

/** An idle fisher left far behind walks over to the family by itself (a toddler needn't steer the whole trail). */
export const FOLLOW_AFTER_MS = 6000;
export const FOLLOW_FAR = 9;
export const FOLLOW_NEAR = 4;
const FOLLOW_SPEED = WALK_SPEED * 0.85;

type Tagger = Pick<Fisher, "pos" | "vel" | "mode" | "lastInputAt" | "following" | "movedAt" | "seat">;

/** Steers each idle, walking fisher toward the nearest other fisher, by trail and round the ponds, and stops them close by. */
export function tagAlong(fishers: Tagger[], now: number, w: World = worldFor(HOME_WORLD_SEED)): void {
  for (const f of fishers) {
    const others = fishers.filter((o) => o !== f);
    if (others.length === 0 || resting(f, now)) continue;
    tagStep(f, nearestOf(f, others), w);
  }
}

/** Not walking, or touched the controls lately: left alone. */
function resting(f: Tagger, now: number): boolean {
  return f.mode !== "walk" || now - f.lastInputAt < FOLLOW_AFTER_MS;
}

function nearestOf(f: Tagger, others: Tagger[]): Tagger {
  return others.reduce((b, o) => (distance(o.pos, f.pos) < distance(b.pos, f.pos) ? o : b));
}

/** One fisher's tag-along move toward `near`, the closest of the others. */
function tagStep(f: Tagger, near: Tagger, w: World): void {
  // Someone waiting at a dock or tower: walk right up onto that one so the trip can start.
  const platform = mooringAt(w, near.pos, PLATFORM_REACH);
  const mine = mooringAt(w, f.pos, PLATFORM_REACH - 1);
  const target = boardingTarget(f, near, platform, mine);
  if (target) return steer(f, target.at, w, arrivalSpeed(distance(target.at, f.pos)));
  // On the family's mooring, or waiting on your own at a dock or tower: stay put.
  if (platform || mine || closeEnough(f, distance(near.pos, f.pos))) return halt(f);
  steer(f, near.pos, w, FOLLOW_SPEED);
}

function mooringAt(w: World, p: Vec, reach: number): Platform | undefined {
  return w.platformsNear(p, 0).find((q) => distance(q.at, p) <= reach);
}

/** The mooring to walk onto, if any. Waiting at different moorings: the lower seat (the host, usually) holds, the other walks over. */
export function boardingTarget(f: Pick<Tagger, "pos" | "seat">, near: Pick<Tagger, "seat">, platform: Platform | undefined, mine: Platform | undefined): Platform | undefined {
  if (!platform || holdsMine(f, near, platform, mine) || distance(platform.at, f.pos) <= PLATFORM_REACH - 1) return undefined;
  return platform;
}

function holdsMine(f: Pick<Tagger, "seat">, near: Pick<Tagger, "seat">, platform: Platform, mine: Platform | undefined): boolean {
  return mine !== undefined && (platform.id === mine.id || f.seat < near.seat);
}

/** Slow down on arrival so they stop on the mooring instead of overshooting it. */
export function arrivalSpeed(dist: number): number {
  return FOLLOW_SPEED * Math.min(1, Math.max(0.15, (dist - 0.6) / 2.5));
}

/** Close enough to stop; once stopped, they wait until the gap opens past FOLLOW_FAR. */
export function closeEnough(f: Pick<Tagger, "following">, gap: number): boolean {
  return gap <= FOLLOW_NEAR || (!f.following && gap <= FOLLOW_FAR);
}

function halt(f: Tagger): void {
  if (f.following) f.vel = { x: 0, z: 0 };
  f.following = false;
}

function steer(f: Tagger, to: Vec, w: World, speed: number): void {
  const way = w.navNext(f.pos, to);
  const d = distance(way, f.pos) || 1;
  f.following = true;
  f.vel = { x: ((way.x - f.pos.x) / d) * speed, z: ((way.z - f.pos.z) / d) * speed };
}

/** How far a fisher may wander from the rest of the family (the TV keeps everyone in one shot). */
export const LEASH = 30;

/** Pulls any fisher who strayed past LEASH from the others' middle back toward them. */
export function leash(fishers: { pos: Vec }[], w: World = worldFor(HOME_WORLD_SEED)): void {
  if (fishers.length < 2) return;
  for (const f of fishers) {
    const others = fishers.filter((o) => o !== f);
    const cx = others.reduce((a, o) => a + o.pos.x, 0) / others.length;
    const cz = others.reduce((a, o) => a + o.pos.z, 0) / others.length;
    const dist = Math.hypot(f.pos.x - cx, f.pos.z - cz);
    if (dist <= LEASH) continue;
    f.pos = w.advance(f.pos, { x: (cx - f.pos.x) / dist, z: (cz - f.pos.z) / dist }, dist - LEASH);
  }
}

function swirlOf(d: Draft<Lake>, f: Draft<Fisher>): Draft<Swirl> | undefined {
  return f.swirlId === null ? undefined : d.swirls.find((s) => s.id === f.swirlId);
}

function swirlAt(d: Draft<Lake>, bobber: Vec): Swirl | undefined {
  return d.swirls.find((s) => distance(s.pos, bobber) <= SWIRL_RADIUS);
}

// ---------- what bites ----------

export type BiteContext = { water: Water; tod: TimeOfDay; tier: number; swirl: "none" | "plain" | "golden"; species: number; known: (id: string) => boolean; ring?: number };

/** Chooses what bites: treasure, junk, the Moonfin, or a fish that lives in this water at this time. */
export function chooseCatch(ctx: BiteContext, r: () => number): FishDef {
  if (r() < (ctx.swirl === "golden" ? 0.1 : 0.02)) return fishById("chest")!;
  const junk = ctx.swirl === "none" ? junkRoll(ctx.water, r) : undefined;
  if (junk) return junk;
  if (moonfinRises(ctx) && r() < 0.3) return fishById("moonfin")!;
  const pool = biterPool(ctx);
  return pool[pickWeighted(pool.map((f) => catchWeight(f, ctx)), r())]!;
}

/** Outside swirls, now and then the line brings up junk from this water. */
function junkRoll(water: Water, r: () => number): FishDef | undefined {
  const junk = FISH.filter((f) => f.rarity === "junk" && f.waters.includes(water));
  if (junk.length > 0 && r() < 0.05) return junk[Math.floor(r() * junk.length)];
  return undefined;
}

/** The Moonfin can rise from a swirl at night once the journal is full enough. */
function moonfinRises(ctx: BiteContext): boolean {
  return ctx.water === "tarn" && ctx.swirl !== "none" && ctx.tod === "night" && ctx.species >= MOONFIN_JOURNAL;
}

/** The journal fish that bite here now (only rare ones in a golden swirl, when there are any). */
export function biterPool(ctx: Pick<BiteContext, "water" | "tod" | "swirl">): FishDef[] {
  const here = (golden: boolean) =>
    JOURNAL_FISH.filter((f) => f.rarity !== "legendary" && f.waters.includes(ctx.water) && bitesNow(f, ctx.tod) && (!golden || f.rarity === "rare"));
  const pool = here(ctx.swirl === "golden");
  return pool.length > 0 ? pool : here(false);
}

const RARITY_BASE: Partial<Record<Rarity, (tier: number) => number>> = {
  common: () => 60,
  uncommon: (tier) => 30 + 5 * tier,
};
const PLAIN_SWIRL_BOOST: Partial<Record<Rarity, number>> = { rare: 2.5, uncommon: 1.5 };

/** How likely a fish is to be the one that bites, relative to the others in the pool. */
export function catchWeight(f: FishDef, ctx: Pick<BiteContext, "tier" | "swirl" | "known" | "ring">): number {
  const base = (RARITY_BASE[f.rarity] ?? ((tier: number) => 9 + 4 * tier))(ctx.tier);
  const swirlBoost = ctx.swirl === "plain" ? (PLAIN_SWIRL_BOOST[f.rarity] ?? 1) : 1;
  // The farther from home, the likelier the rare ones (up to triple).
  const farBoost = f.rarity === "rare" ? Math.min(3, 1 + 0.25 * Math.max(0, (ctx.ring ?? 0) - 1)) : 1;
  // Species the family hasn't met yet come along a little more often: the journal keeps filling.
  return base * swirlBoost * farBoost * (ctx.known(f.id) ? 1 : 1.6);
}

function biteWait(d: Draft<Lake>, f: Draft<Fisher>, swirl: Swirl | undefined): number {
  const base = swirl?.golden ? rollBetween(d, 900, 1800) : swirl ? rollBetween(d, 1200, 2600) : rollBetween(d, 2800, 6500) * (1 - 0.1 * d.rodTier);
  return base * (f.easy ? 0.75 : 1);
}

function scheduleBite(d: Draft<Lake>, f: Draft<Fisher>, from: number): void {
  f.biteAt = from + biteWait(d, f, swirlOf(d, f));
  f.biteUntil = f.biteAt + BITE_WINDOW_MS;
  const n = 1 + Math.floor(roll(d) * 3);
  const span = f.biteAt - from;
  f.nibbles = Array.from({ length: n }, (_, i) => from + span * ((i + 0.4 + roll(d) * 0.4) / (n + 0.5)));
}

// ---------- time ----------

function settle(f: Draft<Fisher>, now: number, w: World): void {
  if (f.vel.x !== 0 || f.vel.z !== 0) f.pos = w.advance(f.pos, f.vel, (now - f.movedAt) / 1000);
  f.movedAt = now;
}

function hook(d: Draft<Lake>, f: Draft<Fisher>, at: number): void {
  const swirl = swirlOf(d, f);
  const def = chooseCatch(
    {
      water: f.water ?? "shore",
      tod: todOf({ startedAt: d.startedAt, now: at }),
      tier: d.rodTier,
      swirl: swirl ? (swirl.golden ? "golden" : "plain") : "none",
      species: speciesCount(d.journal),
      known: (id) => (d.journal[id]?.count ?? 0) > 0,
      ring: worldFor(d.worldSeed).areaAt(f.pos)?.ring ?? 0,
    },
    () => roll(d),
  );
  const cm = Math.round(def.cm[0] + (def.cm[1] - def.cm[0]) * Math.pow(roll(d), 1.4));
  f.mode = "reel";
  f.reel = { fishId: def.id, cm, hookAt: at, seed: Math.floor(roll(d) * 2 ** 31), progress: REEL_START, at, holding: false };
}

export const LOG_LENGTH = 40;

/** Whether a catch goes in the journal (junk and treasure don't). */
export function countsInJournal(def: Pick<FishDef, "rarity">): boolean {
  return def.rarity !== "junk" && def.rarity !== "treasure";
}

/** The journal entry after one more of this fish: count, best size, and who caught the first. */
export function journalAfter(entry: JournalEntry | undefined, cm: number, by: string | null): JournalEntry {
  const e = entry ?? { count: 0, bestCm: 0, firstBy: null };
  return { count: e.count + 1, bestCm: Math.max(e.bestCm, cm), firstBy: e.firstBy ?? by };
}

/** What a landed fish is worth: its shells (doubled from a golden swirl) and whether it is new to the journal. */
export function landedCatch(def: FishDef, cm: number, golden: boolean, journal: Record<string, JournalEntry>): Omit<Catch, "at" | "seq"> {
  const isNew = countsInJournal(def) && (journal[def.id]?.count ?? 0) === 0;
  return { fishId: def.id, cm, shells: SHELLS[def.rarity] * (golden ? 2 : 1), isNew, golden };
}

/** Adds shells to the family total and upgrades the rod when a milestone is passed. */
function addShells(d: Draft<Lake>, shells: number): void {
  d.shells += shells;
  const tier = rodTierFor(d.shells);
  if (tier > d.rodTier) {
    d.rodTier = tier;
    d.upgradeSeq += 1;
  }
}

function pushLog(d: Draft<Lake>, entry: Lake["log"][number]): void {
  d.log.push(entry);
  if (d.log.length > LOG_LENGTH) d.log.splice(0, d.log.length - LOG_LENGTH);
}

function land(d: Draft<Lake>, f: Draft<Fisher>, at: number): void {
  const reel = f.reel;
  if (!reel) return;
  const def = fishById(reel.fishId)!;
  const swirl = swirlOf(d, f);
  const landed = landedCatch(def, reel.cm, swirl?.golden === true, d.journal);
  if (countsInJournal(def)) d.journal[def.id] = journalAfter(d.journal[def.id], reel.cm, f.name);
  if (swirl) swirl.catches += 1;
  addShells(d, landed.shells);
  d.catchSeq += 1;
  f.catch = { ...landed, at, seq: d.catchSeq };
  pushLog(d, { seat: f.seat, fishId: def.id, cm: reel.cm, isNew: landed.isNew, at });
  f.mode = "catch";
  f.reel = null;
  f.bobber = null;
}

/** One step of a fisher's mode: true when it moved on to another mode (so the next one may follow). */
type ModeStep = (d: Draft<Lake>, f: Draft<Fisher>, now: number) => boolean;

const stepCast: ModeStep = (d, f, now) => {
  if (now < f.castAt + CAST_FLIGHT_MS) return false;
  f.mode = "wait";
  scheduleBite(d, f, f.castAt + CAST_FLIGHT_MS);
  return true;
};

const stepWait: ModeStep = (_d, f, now) => {
  if (now < f.biteAt) return false;
  f.mode = "bite";
  return true;
};

const stepBite: ModeStep = (d, f, now) => {
  if (f.easy && now >= f.biteAt + EASY_HOOK_DELAY_MS) {
    hook(d, f, f.biteAt + EASY_HOOK_DELAY_MS);
    return true;
  }
  if (now < f.biteUntil) return false;
  // It got away: a splash, and the bobber waits for the next one.
  f.missSeq += 1;
  f.mode = "wait";
  scheduleBite(d, f, f.biteUntil);
  return true;
};

/** Reeling never hands on within a step: a landed fish shows its catch from this moment. */
const stepReel: ModeStep = (d, f, now) => {
  if (!f.reel) return false;
  const def = fishById(f.reel.fishId)!;
  const r = integrateReel(f.reel, def.fight, now, { easy: f.easy, tier: d.rodTier });
  f.reel = r;
  if (r.progress >= 1 || now >= r.hookAt + RESCUE_REEL_MS) land(d, f, now);
  return false;
};

const stepCatch: ModeStep = (_d, f, now) => {
  if (!f.catch || now < f.catch.at + CATCH_SHOW_MS) return false;
  f.mode = "walk";
  return true;
};

const MODE_STEPS: Record<Mode, ModeStep> = {
  walk: () => false,
  cast: stepCast,
  wait: stepWait,
  bite: stepBite,
  reel: stepReel,
  catch: stepCatch,
  ride: () => false,
};

/** At most this many mode changes in one step (cast → wait → bite → miss → wait … stays bounded). */
const MAX_MODE_STEPS = 8;

function stepFisher(d: Draft<Lake>, f: Draft<Fisher>, now: number): void {
  if (f.mode === "ride") return;
  settle(f, now, worldFor(d.worldSeed));
  // Each step either moves the fisher on to its next mode at a known moment, or stops.
  for (let guard = 0; guard < MAX_MODE_STEPS && MODE_STEPS[f.mode](d, f, now); guard++);
}

/** Brings the whole lake up to `now`: walking, bites, reels, swirls, the golden swirl. */
export function step(lake: Lake, now: number): Lake {
  if (now < lake.now) return lake;
  return produce(lake, (d) => {
    d.now = now;
    const w = worldFor(d.worldSeed);
    if (d.ride) {
      ride(d, now);
    } else {
      for (const f of d.fishers) stepFisher(d, f, now);
      keepApart(d.fishers, w);
      leash(d.fishers, w);
      tagAlong(d.fishers, now, w);
      board(d, now, w);
    }
    pickUpSparkles(d, now);
    reveal(d);
    discover(d, now);
    keepSwirlsNear(d, now, w);
    refreshSwirls(d, now);
  });
}

// ---------- boats and zeppelins ----------

/** How close to a dock or tower everyone must stand to board, and how long they wait there. */
export const PLATFORM_REACH = 2.6;
export const BOARD_MS = 3000;
const RIDE_SPEED = { boat: 12, zeppelin: 20 } as const;
export const RIDE_MIN_MS = 10_000;
export const RIDE_MAX_MS = 26_000;

/** When the whole family stands together at a dock or tower, it leaves after BOARD_MS. */
function board(d: Draft<Lake>, now: number, w: World): void {
  const walking = d.fishers.filter((f) => f.mode === "walk");
  if (d.fishers.length === 0 || walking.length !== d.fishers.length) {
    d.boarding = null;
    return;
  }
  const mid = { x: d.fishers.reduce((a, f) => a + f.pos.x, 0) / d.fishers.length, z: d.fishers.reduce((a, f) => a + f.pos.z, 0) / d.fishers.length };
  const platform = w
    .platformsNear(mid, 1)
    .filter((p) => d.fishers.every((f) => distance(f.pos, p.at) <= PLATFORM_REACH))
    // The mooring everyone stands closest to, all together (moorings round one tower sit side by side).
    .sort((a, b) => d.fishers.reduce((t, f) => t + distance(f.pos, a.at), 0) - d.fishers.reduce((t, f) => t + distance(f.pos, b.at), 0))[0];
  if (!platform) {
    d.boarding = null;
    return;
  }
  if (d.boarding?.platformId !== platform.id) {
    d.boarding = { platformId: platform.id, since: now };
    return;
  }
  if (now - d.boarding.since < BOARD_MS) return;
  const ms = Math.max(RIDE_MIN_MS, Math.min(RIDE_MAX_MS, (distance(platform.at, platform.to) / RIDE_SPEED[platform.kind]) * 1000));
  d.ride = { platformId: platform.id, kind: platform.kind, from: platform.at, to: platform.to, toPlace: platform.toPlace, departAt: now, arriveAt: now + ms, seats: d.fishers.map((f) => f.seat) };
  d.boarding = null;
  for (const f of d.fishers) {
    f.mode = "ride";
    f.bobber = null;
    f.swirlId = null;
    f.catch = null;
  }
  ride(d, now);
}

/** Moves the riders along the way, and sets them down at the far dock or tower on arrival. */
function ride(d: Draft<Lake>, now: number): void {
  const r = d.ride;
  if (!r) return;
  const k = Math.min(1, (now - r.departAt) / (r.arriveAt - r.departAt));
  const dur = (r.arriveAt - r.departAt) / 1000;
  const v = { x: (r.to.x - r.from.x) / dur, z: (r.to.z - r.from.z) / dur };
  d.fishers.forEach((f, i) => {
    const off = { x: Math.cos(i * 1.7) * 0.9, z: Math.sin(i * 1.7) * 0.9 };
    f.pos = { x: r.from.x + (r.to.x - r.from.x) * k + off.x, z: r.from.z + (r.to.z - r.from.z) * k + off.z };
    f.movedAt = now;
    f.vel = k < 1 ? v : { x: 0, z: 0 };
  });
  if (k < 1) return;
  for (const f of d.fishers) {
    f.mode = "walk";
    f.lastInputAt = now;
    f.following = false;
  }
  // Step off the platform a little so nobody boards straight back.
  const w = worldFor(d.worldSeed);
  const place = w.placeById(r.toPlace);
  if (place) for (const f of d.fishers) f.pos = w.advance(f.pos, { x: place.center.x - f.pos.x, z: place.center.z - f.pos.z }, 4 / Math.max(1, distance(place.center, f.pos)));
  d.ride = null;
}

// ---------- fog of war ----------

export const FOG_TILE = 24;
const tileKey = (p: Vec) => `${Math.floor(p.x / FOG_TILE)},${Math.floor(p.z / FOG_TILE)}`;

/** Clears the fog round everyone (wider from a zeppelin). */
function reveal(d: Draft<Lake>): void {
  const seen = new Set(d.revealed);
  const radius = d.ride?.kind === "zeppelin" ? 3 : 2;
  for (const f of d.fishers)
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 1) continue;
        const k = tileKey({ x: f.pos.x + dx * FOG_TILE, z: f.pos.z + dz * FOG_TILE });
        if (!seen.has(k)) {
          seen.add(k);
          d.revealed.push(k);
        }
      }
}

export function isRevealed(lake: Pick<Lake, "revealed">, p: Vec): boolean {
  return lake.revealed.includes(tileKey(p));
}

/** Generated places keep a swirl while someone is there; their swirls fade when everyone is far away (the home valley's stay). */
function keepSwirlsNear(d: Draft<Lake>, now: number, w: World): void {
  const kept = keptSwirls(d.swirls, d.fishers);
  if (kept.length !== d.swirls.length) d.swirls = kept;
  for (const f of d.fishers) {
    const place = w.areaAt(f.pos);
    if (wantsSwirl(d, place)) spawnSwirl(d, now, false, place.id);
  }
}

const HOME_SWIRL_AREAS = new Set(["moonwell", "mistmarsh", "pools", "hollow", "tarn"]);

/** The swirls that stay: golden ones, the home valley's, and any with a fisher within two cells. Nobody here: all stay. */
export function keptSwirls<S extends Pick<Swirl, "golden" | "area" | "pos">>(swirls: S[], fishers: { pos: Vec }[]): S[] {
  if (fishers.length === 0) return swirls;
  const far = (s: S) => fishers.every((f) => distance(f.pos, s.pos) > 2.2 * 96);
  return swirls.filter((s) => s.golden || HOME_SWIRL_AREAS.has(s.area) || !far(s));
}

/** A found generated place someone stands in, with no swirl of its own yet. */
export function wantsSwirl(d: Pick<Lake, "discovered" | "swirls">, place: Place | null): place is Place {
  return place !== null && !place.home && d.discovered.includes(place.id) && !d.swirls.some((s) => s.area === place.id);
}

/** How close two fishers may stand (metres). */
export const FISHER_SPACE = 1.8;

/** Nudges any two fishers standing closer than FISHER_SPACE apart, each half the way, onto walkable ground. */
export function keepApart(fishers: { pos: Vec; seat: number }[], w: World = worldFor(HOME_WORLD_SEED)): void {
  for (let i = 0; i < fishers.length; i++)
    for (let j = i + 1; j < fishers.length; j++) {
      const a = fishers[i]!;
      const b = fishers[j]!;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= FISHER_SPACE) continue;
      // Exactly on top of each other: part them by seat, east–west.
      const ux = dist > 1e-6 ? dx / dist : b.seat > a.seat ? 1 : -1;
      const uz = dist > 1e-6 ? dz / dist : 0;
      const push = (FISHER_SPACE - dist) / 2;
      a.pos = w.advance(a.pos, { x: -ux, z: -uz }, push);
      b.pos = w.advance(b.pos, { x: ux, z: uz }, push);
    }
}

// ---------- what players do ----------

/** The colour a joining device gets: the one it asked for if free, else the first free one. */
export function colorFor(asked: SeatColor | undefined, taken: SeatColor[]): SeatColor {
  if (asked && !taken.includes(asked)) return asked;
  return SEAT_COLORS.find((c) => !taken.includes(c)) ?? SEAT_COLORS[0];
}

export function join(lake: Lake, input: { name: string | null; ogsId: string | null; color?: SeatColor }): { lake: Lake; seat: number | null } {
  if (input.ogsId) {
    const back = lake.fishers.find((f) => f.ogsId === input.ogsId);
    if (back) return { lake, seat: back.seat };
  }
  const used = new Set(lake.fishers.map((f) => f.seat));
  const seat = [0, 1, 2, 3].find((s) => !used.has(s));
  if (seat === undefined) return { lake, seat: null };
  const pos = spawnPoint(seat);
  const next = produce(lake, (d) => {
    d.fishers.push({
      seat,
      name: input.name,
      color: colorFor(input.color, d.fishers.map((f) => f.color)),
      ogsId: input.ogsId,
      easy: false,
      pos,
      vel: { x: 0, z: 0 },
      movedAt: d.now,
      lastInputAt: d.now,
      following: false,
      facing: -Math.PI / 2,
      mode: "walk",
      bobber: null,
      water: null,
      swirlId: null,
      castAt: 0,
      biteAt: 0,
      biteUntil: 0,
      nibbles: [],
      reel: null,
      catch: null,
      missSeq: 0,
    });
    d.fishers.sort((a, b) => a.seat - b.seat);
    reveal(d);
  });
  return { lake: next, seat };
}

/** A typed name, tidied: trimmed, inner spaces collapsed, at most 14 characters; blank = null. */
export function tidyName(raw: string | undefined): string | null {
  const name = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 14).trim();
  return name.length > 0 ? name : null;
}

/** The host names a fisher (kids join wordlessly). */
export function rename(lake: Lake, seat: number, name: string): Lake {
  if (!lake.fishers.some((f) => f.seat === seat)) return lake;
  return produce(lake, (d) => {
    const f = d.fishers.find((x) => x.seat === seat);
    if (f) f.name = tidyName(name);
  });
}

function withFisher(lake: Lake, seat: number, now: number, recipe: (d: Draft<Lake>, f: Draft<Fisher>) => void): Lake {
  const stepped = step(lake, now);
  if (!stepped.fishers.some((f) => f.seat === seat) || stepped.campfire || stepped.ride) return stepped;
  return produce(stepped, (d) => {
    const f = d.fishers.find((x) => x.seat === seat)!;
    recipe(d, f);
  });
}

/** Joystick: x right, y up (−1..1). Walking reels in a line that's out; reeling and a fresh catch hold you still. */
export function move(lake: Lake, seat: number, stick: { x: number; y: number }, now: number): Lake {
  return withFisher(lake, seat, now, (_d, f) => {
    const vel = stickVelocity(stick);
    f.lastInputAt = now;
    f.following = false;
    if (heldStill(f, now)) {
      f.vel = { x: 0, z: 0 };
      return;
    }
    if (vel && f.mode !== "walk") {
      f.mode = "walk";
      f.bobber = null;
      f.swirlId = null;
    }
    f.vel = vel ?? { x: 0, z: 0 };
    if (vel) f.facing = Math.atan2(vel.z, vel.x);
  });
}

/** The walking velocity a stick asks for (capped at full speed), or null for a stick at rest. */
export function stickVelocity(stick: { x: number; y: number }): Vec | null {
  const len = Math.hypot(stick.x, stick.y);
  if (len <= 0.15) return null;
  const k = len > 1 ? 1 / len : 1;
  return { x: stick.x * k * WALK_SPEED, z: -stick.y * k * WALK_SPEED };
}

/** Reeling, and a catch just shown, hold a fisher still. */
export function heldStill(f: Pick<Fisher, "mode" | "catch">, now: number): boolean {
  return f.mode === "reel" || (f.mode === "catch" && f.catch !== null && now < f.catch.at + CATCH_SKIP_MS);
}

/** The one big button: cast at the water's edge, hook on a bite, skip a shown catch. */
export function action(lake: Lake, seat: number, now: number): Lake {
  return withFisher(lake, seat, now, (d, f) => {
    f.lastInputAt = now;
    halt(f);
    if (f.mode === "bite") return hook(d, f, now);
    const cast = canCast(f, now) ? worldFor(d.worldSeed).castFrom(f.pos) : null;
    if (cast) startCast(d, f, cast, now);
  });
}

/** The line goes out: onto a swirl when the cast lands on one, else where it fell. */
function startCast(d: Draft<Lake>, f: Draft<Fisher>, cast: { bobber: Vec; water: Water }, now: number): void {
  const swirl = swirlAt(d, cast.bobber);
  f.mode = "cast";
  f.vel = { x: 0, z: 0 };
  f.castAt = now;
  f.bobber = swirl ? { ...swirl.pos } : cast.bobber;
  f.water = cast.water;
  f.swirlId = swirl?.id ?? null;
  f.facing = Math.atan2(f.bobber.z - f.pos.z, f.bobber.x - f.pos.x);
  f.catch = null;
}

/** A fisher can cast while walking, or to skip a catch card once it has been seen. */
export function canCast(f: Pick<Fisher, "mode" | "catch">, now: number): boolean {
  return f.mode === "walk" || (f.mode === "catch" && f.catch !== null && now >= f.catch.at + CATCH_SKIP_MS);
}

export function reelHold(lake: Lake, seat: number, holding: boolean, now: number): Lake {
  return withFisher(lake, seat, now, (_d, f) => {
    if (f.mode === "reel" && f.reel) f.reel.holding = holding;
  });
}

export function setEasy(lake: Lake, seat: number, on: boolean): Lake {
  return produce(lake, (d) => {
    const f = d.fishers.find((x) => x.seat === seat);
    if (f) f.easy = on;
  });
}

export function setCampfire(lake: Lake, on: boolean, now: number): Lake {
  return produce(step(lake, now), (d) => {
    d.campfire = on;
    if (on)
      for (const f of d.fishers) {
        if (f.mode === "reel") land(d, f, now);
        f.mode = "walk";
        f.vel = { x: 0, z: 0 };
        f.bobber = null;
        f.swirlId = null;
        f.catch = null;
      }
  });
}

export type Progress = { journal: Record<string, JournalEntry>; shells: number; discovered?: PlaceId[]; worldSeed?: number; revealed?: string[] };

/** The family's saved progress (from the host phone), merged in once per room. */
export function loadProgress(lake: Lake, progress: Progress): Lake {
  if (lake.progressLoaded) return lake;
  return produce(lake, (d) => {
    d.progressLoaded = true;
    for (const [id, e] of Object.entries(progress.journal)) if (fishById(id)) d.journal[id] = mergedEntry(d.journal[id], e);
    d.shells += progress.shells;
    d.rodTier = rodTierFor(d.shells);
    // The family's own endless valley (saved): same seed, same world, everything found stays put.
    if (progress.worldSeed !== undefined) d.worldSeed = progress.worldSeed;
    addUnseen(d.revealed, progress.revealed ?? []);
    // Places found on earlier visits stay found (no second celebration), each with its swirl.
    for (const id of progress.discovered ?? []) {
      if (d.discovered.includes(id)) continue;
      d.discovered.push(id);
      spawnSwirl(d, d.now, false, id);
    }
  });
}

/** A saved journal entry added onto this room's: counts add, best size wins, the saved first-catcher wins. */
export function mergedEntry(mine: JournalEntry | undefined, saved: JournalEntry): JournalEntry {
  return mine ? { count: mine.count + saved.count, bestCm: Math.max(mine.bestCm, saved.bestCm), firstBy: saved.firstBy ?? mine.firstBy } : { ...saved };
}

/** Appends each of `more` not already in `list` (as it was before appending). */
function addUnseen(list: string[], more: string[]): void {
  const seen = new Set(list);
  for (const t of more) if (!seen.has(t)) list.push(t);
}

export function progressOf(lake: Lake): Progress {
  return { journal: lake.journal, shells: lake.shells, discovered: lake.discovered, worldSeed: lake.worldSeed, revealed: lake.revealed };
}

