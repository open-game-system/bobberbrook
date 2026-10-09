import { produce, type Draft } from "immer";
import { dayPhase, timeOfDay, type TimeOfDay } from "./daycycle";
import { FISH, JOURNAL_FISH, SHELLS, bitesNow, fishById, type FishDef } from "./fish";
import { between, pickWeighted, rand } from "./rng";
import { REEL_START, integrateReel, thrashingAt, type Reel } from "./reel";
import { WALK_SPEED, advance, angleGap, castFrom, castRing, distance, spawnPoint, type Vec, type Water } from "./world";

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
export const ROD_AT = [0, 20, 60, 140] as const;
export const ROD_NAMES = ["Willow", "Bamboo", "Brass", "Starlight"] as const;
export const MOONFIN_JOURNAL = 10;

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

export type Swirl = { id: number; pos: Vec; theta: number; golden: boolean; since: number; until: number; catches: number };

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
  };
  return produce(lake, (d) => {
    spawnSwirl(d, now, false);
    spawnSwirl(d, now, false);
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

function spawnSwirl(d: Draft<Lake>, now: number, golden: boolean): void {
  const others = d.swirls.map((s) => s.theta);
  let theta = 0;
  for (let i = 0; i < 12; i++) {
    theta = roll(d) * 2 * Math.PI;
    if (others.every((o) => angleGap(o, theta) > 1.0)) break;
  }
  d.swirlSeq += 1;
  d.swirls.push({
    id: d.swirlSeq,
    pos: castRing(theta),
    theta,
    golden,
    since: now,
    until: now + (golden ? GOLDEN_LIFE_MS : SWIRL_LIFE_MS),
    catches: 0,
  });
}

function refreshSwirls(d: Draft<Lake>, now: number): void {
  const spent = d.swirls.filter((s) => now >= s.until || s.catches >= (s.golden ? GOLDEN_CATCHES : SWIRL_CATCHES));
  if (spent.length === 0 && now < d.nextGoldenAt) return;
  const gone = new Set(spent.map((s) => s.id));
  d.swirls = d.swirls.filter((s) => !gone.has(s.id));
  for (const s of spent) if (!s.golden) spawnSwirl(d, now, false);
  if (now >= d.nextGoldenAt) {
    d.nextGoldenAt = now + GOLDEN_EVERY_MS;
    if (!d.swirls.some((s) => s.golden)) spawnSwirl(d, now, true);
  }
  // A fisher whose swirl moved on keeps fishing the plain water there.
  for (const f of d.fishers) if (f.swirlId !== null && gone.has(f.swirlId)) f.swirlId = null;
}

function swirlAt(d: Draft<Lake>, bobber: Vec): Swirl | undefined {
  return d.swirls.find((s) => distance(s.pos, bobber) <= SWIRL_RADIUS);
}

// ---------- what bites ----------

export type BiteContext = { water: Water; tod: TimeOfDay; tier: number; swirl: "none" | "plain" | "golden"; species: number; known: (id: string) => boolean };

/** Chooses what bites: treasure, junk, the Moonfin, or a fish that lives in this water at this time. */
export function chooseCatch(ctx: BiteContext, r: () => number): FishDef {
  const treasure = fishById("chest")!;
  if (r() < (ctx.swirl === "golden" ? 0.1 : 0.02)) return treasure;
  if (ctx.swirl === "none") {
    const junk = FISH.filter((f) => f.rarity === "junk" && f.waters.includes(ctx.water));
    if (junk.length > 0 && r() < 0.05) return junk[Math.floor(r() * junk.length)]!;
  }
  const moonfin = fishById("moonfin")!;
  if (ctx.swirl !== "none" && ctx.tod === "night" && ctx.species >= MOONFIN_JOURNAL && r() < 0.3) return moonfin;
  const here = (golden: boolean) =>
    JOURNAL_FISH.filter((f) => f.rarity !== "legendary" && f.waters.includes(ctx.water) && bitesNow(f, ctx.tod) && (!golden || f.rarity === "rare"));
  let pool = here(ctx.swirl === "golden");
  if (pool.length === 0) pool = here(false);
  const weights = pool.map((f) => {
    const base = f.rarity === "common" ? 60 : f.rarity === "uncommon" ? 30 + 5 * ctx.tier : 9 + 4 * ctx.tier;
    const swirlBoost = ctx.swirl === "plain" ? (f.rarity === "rare" ? 2.5 : f.rarity === "uncommon" ? 1.5 : 1) : 1;
    // Species the family hasn't met yet come along a little more often: the journal keeps filling.
    return base * swirlBoost * (ctx.known(f.id) ? 1 : 1.6);
  });
  return pool[pickWeighted(weights, r())]!;
}

function biteWait(d: Draft<Lake>, f: Draft<Fisher>, swirl: Swirl | undefined): number {
  const base = swirl?.golden ? rollBetween(d, 900, 1800) : swirl ? rollBetween(d, 1200, 2600) : rollBetween(d, 2800, 6500) * (1 - 0.1 * d.rodTier);
  return base * (f.easy ? 0.75 : 1);
}

function scheduleBite(d: Draft<Lake>, f: Draft<Fisher>, from: number): void {
  const swirl = f.swirlId === null ? undefined : d.swirls.find((s) => s.id === f.swirlId);
  f.biteAt = from + biteWait(d, f, swirl);
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
  const swirl = f.swirlId === null ? undefined : d.swirls.find((s) => s.id === f.swirlId);
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

function land(d: Draft<Lake>, f: Draft<Fisher>, at: number): void {
  const reel = f.reel;
  if (!reel) return;
  const def = fishById(reel.fishId)!;
  const swirl = f.swirlId === null ? undefined : d.swirls.find((s) => s.id === f.swirlId);
  const golden = swirl?.golden === true;
  const counts = def.rarity !== "junk" && def.rarity !== "treasure";
  const isNew = counts && (d.journal[def.id]?.count ?? 0) === 0;
  const shells = SHELLS[def.rarity] * (golden ? 2 : 1);
  if (counts) {
    const entry = d.journal[def.id] ?? { count: 0, bestCm: 0, firstBy: null };
    d.journal[def.id] = { count: entry.count + 1, bestCm: Math.max(entry.bestCm, reel.cm), firstBy: entry.firstBy ?? f.name };
  }
  if (swirl) swirl.catches += 1;
  d.shells += shells;
  const tier = rodTierFor(d.shells);
  if (tier > d.rodTier) {
    d.rodTier = tier;
    d.upgradeSeq += 1;
  }
  d.catchSeq += 1;
  f.catch = { fishId: def.id, cm: reel.cm, shells, isNew, golden, at, seq: d.catchSeq };
  d.log.push({ seat: f.seat, fishId: def.id, cm: reel.cm, isNew, at });
  if (d.log.length > 40) d.log.splice(0, d.log.length - 40);
  f.mode = "catch";
  f.reel = null;
  f.bobber = null;
}

/**
 * When the room next moves this fisher on by itself, if nobody touches it: the cast lands, the bite
 * comes, the bite gets away (or hooks itself for an easy fisher), the catch card ends. Null when nothing
 * is scheduled: walking, or reeling (the reel moves continuously). The room steps the fisher exactly at
 * this moment; a screen that waits on it ticks the room once it has passed.
 */
export function deadlineOf(f: Fisher): number | null {
  switch (f.mode) {
    case "cast":
      return f.castAt + CAST_FLIGHT_MS;
    case "wait":
      return f.biteAt;
    case "bite":
      return f.easy ? f.biteAt + EASY_HOOK_DELAY_MS : f.biteUntil;
    case "catch":
      return f.catch ? f.catch.at + CATCH_SHOW_MS : null;
    case "walk":
    case "reel":
      return null;
  }
}

/** Whether this fisher's hooked fish is thrashing (pulling back) at `now`. False unless reeling. */
export function thrashing(f: Fisher, now: number): boolean {
  if (f.mode !== "reel" || !f.reel) return false;
  const def = fishById(f.reel.fishId);
  return def !== undefined && thrashingAt(def.fight, f.reel, now);
}

function stepFisher(d: Draft<Lake>, f: Draft<Fisher>, now: number): void {
  settle(f, now);
  // Each step either moves the fisher on to its next mode at its deadline, or stops.
  for (let guard = 0; guard < 8; guard++) {
    if (f.mode === "reel" && f.reel) {
      const def = fishById(f.reel.fishId)!;
      const r = integrateReel(f.reel, def.fight, now, { easy: f.easy, tier: d.rodTier });
      f.reel = r;
      if (r.progress >= 1 || now >= r.hookAt + RESCUE_REEL_MS) land(d, f, now);
      break;
    }
    const due = deadlineOf(f);
    if (due === null || now < due) break;
    if (f.mode === "cast") {
      f.mode = "wait";
      scheduleBite(d, f, due);
    } else if (f.mode === "wait") {
      f.mode = "bite";
    } else if (f.mode === "bite" && f.easy) {
      hook(d, f, due);
    } else if (f.mode === "bite") {
      // It got away: a splash, and the bobber waits for the next one.
      f.missSeq += 1;
      f.mode = "wait";
      scheduleBite(d, f, due);
    } else if (f.mode === "catch") {
      f.mode = "walk";
    }
  }
}

/** Brings the whole lake up to `now`: walking, bites, reels, swirls, the golden swirl. */
export function step(lake: Lake, now: number): Lake {
  if (now < lake.now) return lake;
  return produce(lake, (d) => {
    d.now = now;
    for (const f of d.fishers) stepFisher(d, f, now);
    refreshSwirls(d, now);
  });
}

// ---------- what players do ----------

export function join(lake: Lake, input: { name: string | null; ogsId: string | null }): { lake: Lake; seat: number | null } {
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
      color: SEAT_COLORS[seat]!,
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
  return withFisher(lake, seat, now, (d, f) => {
    const len = Math.hypot(stick.x, stick.y);
    const k = len > 1 ? 1 / len : 1;
    const vx = stick.x * k * WALK_SPEED;
    const vz = -stick.y * k * WALK_SPEED;
    const moving = len > 0.15;
    if (f.mode === "reel" || (f.mode === "catch" && f.catch && now < f.catch.at + CATCH_SKIP_MS)) {
      f.vel = { x: 0, z: 0 };
      return;
    }
    if (moving && (f.mode === "cast" || f.mode === "wait" || f.mode === "bite" || f.mode === "catch")) {
      f.mode = "walk";
      f.bobber = null;
      f.swirlId = null;
    }
    f.vel = moving ? { x: vx, z: vz } : { x: 0, z: 0 };
    if (moving) f.facing = Math.atan2(vz, vx);
  });
}

/** The one big button: cast at the water's edge, hook on a bite, skip a shown catch. */
export function action(lake: Lake, seat: number, now: number): Lake {
  return withFisher(lake, seat, now, (d, f) => {
    if (f.mode === "bite") {
      hook(d, f, now);
      return;
    }
    const canCast = f.mode === "walk" || (f.mode === "catch" && f.catch !== null && now >= f.catch.at + CATCH_SKIP_MS);
    if (!canCast) return;
    const cast = castFrom(f.pos);
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

export type Progress = { journal: Record<string, JournalEntry>; shells: number };

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
  });
}

export function progressOf(lake: Lake): Progress {
  return { journal: lake.journal, shells: lake.shells };
}

