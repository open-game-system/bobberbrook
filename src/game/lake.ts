import { produce, type Draft } from "immer";
import { dayPhase, timeOfDay, type TimeOfDay } from "./daycycle";
import { FISH, JOURNAL_FISH, SHELLS, bitesNow, fishById, type FishDef, type Rarity } from "./fish";
import { between, pickWeighted, rand } from "./rng";
import { REEL_START, integrateReel, type Reel } from "./reel";
import { WALK_SPEED, advance, angleGap, areaAt, areaById, castFrom, castRingIn, distance, spawnPoint, type AreaId, type Vec, type Water } from "./world";

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

export type Mode = "walk" | "cast" | "wait" | "bite" | "reel" | "catch";

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

export type Swirl = { id: number; area: AreaId; pos: Vec; theta: number; golden: boolean; since: number; until: number; catches: number };

/** The last newly found place (the TV and narrator celebrate it). */
export type Discovery = { area: AreaId; seat: number; at: number; seq: number };

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
  discovered: AreaId[];
  discovery: Discovery | null;
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

function spawnSwirl(d: Draft<Lake>, now: number, golden: boolean, area: AreaId): void {
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
    pos: castRingIn(areaById(area), theta),
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
  const away = d.discovered.filter((a) => a !== "moonwell");
  const places = away.length > 0 && roll(d) < 0.75 ? away : d.discovered;
  spawnSwirl(d, now, true, places[Math.floor(roll(d) * places.length)] ?? "moonwell");
}

/** Whoever walks into a place nobody has found yet discovers it: a celebration and a swirl there. */
function discover(d: Draft<Lake>, now: number): void {
  for (const f of d.fishers) {
    const area = areaAt(f.pos);
    if (!area || d.discovered.includes(area.id)) continue;
    d.discovered.push(area.id);
    d.discovery = { area: area.id, seat: f.seat, at: now, seq: (d.discovery?.seq ?? 0) + 1 };
    spawnSwirl(d, now, false, area.id);
  }
}

/** How far a fisher may wander from the rest of the family (the TV keeps everyone in one shot). */
export const LEASH = 30;

/** Pulls any fisher who strayed past LEASH from the others' middle back toward them. */
export function leash(fishers: { pos: Vec }[]): void {
  if (fishers.length < 2) return;
  for (const f of fishers) {
    const others = fishers.filter((o) => o !== f);
    const cx = others.reduce((a, o) => a + o.pos.x, 0) / others.length;
    const cz = others.reduce((a, o) => a + o.pos.z, 0) / others.length;
    const dist = Math.hypot(f.pos.x - cx, f.pos.z - cz);
    if (dist <= LEASH) continue;
    f.pos = advance(f.pos, { x: (cx - f.pos.x) / dist, z: (cz - f.pos.z) / dist }, dist - LEASH);
  }
}

function swirlOf(d: Draft<Lake>, f: Draft<Fisher>): Draft<Swirl> | undefined {
  return f.swirlId === null ? undefined : d.swirls.find((s) => s.id === f.swirlId);
}

function swirlAt(d: Draft<Lake>, bobber: Vec): Swirl | undefined {
  return d.swirls.find((s) => distance(s.pos, bobber) <= SWIRL_RADIUS);
}

// ---------- what bites ----------

export type BiteContext = { water: Water; tod: TimeOfDay; tier: number; swirl: "none" | "plain" | "golden"; species: number; known: (id: string) => boolean };

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
export function catchWeight(f: FishDef, ctx: Pick<BiteContext, "tier" | "swirl" | "known">): number {
  const base = (RARITY_BASE[f.rarity] ?? ((tier: number) => 9 + 4 * tier))(ctx.tier);
  const swirlBoost = ctx.swirl === "plain" ? (PLAIN_SWIRL_BOOST[f.rarity] ?? 1) : 1;
  // Species the family hasn't met yet come along a little more often: the journal keeps filling.
  return base * swirlBoost * (ctx.known(f.id) ? 1 : 1.6);
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

function settle(f: Draft<Fisher>, now: number): void {
  if (f.vel.x !== 0 || f.vel.z !== 0) f.pos = advance(f.pos, f.vel, (now - f.movedAt) / 1000);
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
};

/** At most this many mode changes in one step (cast → wait → bite → miss → wait … stays bounded). */
const MAX_MODE_STEPS = 8;

function stepFisher(d: Draft<Lake>, f: Draft<Fisher>, now: number): void {
  settle(f, now);
  // Each step either moves the fisher on to its next mode at a known moment, or stops.
  for (let guard = 0; guard < MAX_MODE_STEPS && MODE_STEPS[f.mode](d, f, now); guard++);
}

/** Brings the whole lake up to `now`: walking, bites, reels, swirls, the golden swirl. */
export function step(lake: Lake, now: number): Lake {
  if (now < lake.now) return lake;
  return produce(lake, (d) => {
    d.now = now;
    for (const f of d.fishers) stepFisher(d, f, now);
    keepApart(d.fishers);
    leash(d.fishers);
    discover(d, now);
    refreshSwirls(d, now);
  });
}

/** How close two fishers may stand (metres). */
export const FISHER_SPACE = 1.1;

/** Nudges any two fishers standing closer than FISHER_SPACE apart, each half the way, onto walkable ground. */
export function keepApart(fishers: { pos: Vec; seat: number }[]): void {
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
      a.pos = advance(a.pos, { x: -ux, z: -uz }, push);
      b.pos = advance(b.pos, { x: ux, z: uz }, push);
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
  if (!stepped.fishers.some((f) => f.seat === seat) || stepped.campfire) return stepped;
  return produce(stepped, (d) => {
    const f = d.fishers.find((x) => x.seat === seat)!;
    recipe(d, f);
  });
}

/** Joystick: x right, y up (−1..1). Walking reels in a line that's out; reeling and a fresh catch hold you still. */
export function move(lake: Lake, seat: number, stick: { x: number; y: number }, now: number): Lake {
  return withFisher(lake, seat, now, (_d, f) => {
    const vel = stickVelocity(stick);
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
    if (f.mode === "bite") {
      hook(d, f, now);
      return;
    }
    const cast = canCast(f, now) ? castFrom(f.pos) : null;
    if (!cast) return;
    const swirl = swirlAt(d, cast.bobber);
    f.mode = "cast";
    f.vel = { x: 0, z: 0 };
    f.castAt = now;
    f.bobber = swirl ? { ...swirl.pos } : cast.bobber;
    f.water = cast.water;
    f.swirlId = swirl?.id ?? null;
    f.facing = Math.atan2(f.bobber.z - f.pos.z, f.bobber.x - f.pos.x);
    f.catch = null;
  });
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

export type Progress = { journal: Record<string, JournalEntry>; shells: number; discovered?: AreaId[] };

/** The family's saved progress (from the host phone), merged in once per room. */
export function loadProgress(lake: Lake, progress: Progress): Lake {
  if (lake.progressLoaded) return lake;
  return produce(lake, (d) => {
    d.progressLoaded = true;
    for (const [id, e] of Object.entries(progress.journal)) {
      if (!fishById(id)) continue;
      const mine = d.journal[id];
      d.journal[id] = mine
        ? { count: mine.count + e.count, bestCm: Math.max(mine.bestCm, e.bestCm), firstBy: e.firstBy ?? mine.firstBy }
        : { ...e };
    }
    d.shells += progress.shells;
    d.rodTier = rodTierFor(d.shells);
    // Places found on earlier visits stay found (no second celebration), each with its swirl.
    for (const id of progress.discovered ?? []) {
      if (d.discovered.includes(id)) continue;
      d.discovered.push(id);
      spawnSwirl(d, d.now, false, id);
    }
  });
}

export function progressOf(lake: Lake): Progress {
  return { journal: lake.journal, shells: lake.shells, discovered: lake.discovered };
}

