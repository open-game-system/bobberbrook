import { between } from "./rng";
import type { FishDef } from "./fish";

/**
 * The reel tug-of-war. A hooked fish alternates calm stretches (hold to reel it in) and thrashes (it
 * pulls back while you hold; let go and it can't). The schedule is fixed by the hook's seed, so the
 * room can integrate progress exactly between any two moments without a ticking clock.
 */
export type Reel = {
  fishId: string;
  cm: number;
  hookAt: number;
  seed: number;
  /** Progress at `at` (0..1; 1 = landed). */
  progress: number;
  at: number;
  holding: boolean;
};

export const REEL_START = 0.12;
const MIN_PROGRESS = 0.05;
const MAX_PHASES = 400;

export type Fight = FishDef["fight"];

/** Length of the k-th stretch (even k calm, odd k thrash). */
export function phaseLength(fight: Fight, seed: number, k: number): number {
  const [lo, hi] = k % 2 === 0 ? fight.calmMs : fight.thrashMs;
  return between(seed, 1000 + k, lo, hi);
}

/** Whether the fish is thrashing at time t. */
export function thrashingAt(fight: Fight, reel: Pick<Reel, "hookAt" | "seed">, t: number): boolean {
  let start = reel.hookAt;
  for (let k = 0; k < MAX_PHASES; k++) {
    const end = start + phaseLength(fight, reel.seed, k);
    if (t < end) return k % 2 === 1;
    start = end;
  }
  return false;
}

/** Reel speed per second in each situation. Bigger tiers reel faster; easy fishers never lose ground. */
export function reelRate(opts: { thrashing: boolean; holding: boolean; easy: boolean; tier: number; pull: number }): number {
  const { thrashing, holding, easy, tier, pull } = opts;
  if (!thrashing) return holding ? (0.3 * (1 + 0.12 * tier)) / (0.8 + pull * 0.35) : easy ? 0 : -0.03;
  if (!holding) return 0;
  return easy ? 0.08 : -0.16 * pull;
}

/** Advances a reel's progress to time `to`, stretch by stretch. */
export function integrateReel(reel: Reel, fight: Fight, to: number, opts: { easy: boolean; tier: number }): Reel {
  if (to <= reel.at) return reel;
  let progress = reel.progress;
  let t = reel.at;
  let start = reel.hookAt;
  for (let k = 0; k < MAX_PHASES && t < to; k++) {
    const end = start + phaseLength(fight, reel.seed, k);
    if (end > t) {
      const until = Math.min(end, to);
      const rate = reelRate({ thrashing: k % 2 === 1, holding: reel.holding, easy: opts.easy, tier: opts.tier, pull: fight.pull });
      progress = Math.min(1, Math.max(MIN_PROGRESS, progress + (rate * (until - t)) / 1000));
      t = until;
      if (progress >= 1) break;
    }
    start = end;
  }
  return { ...reel, progress, at: to };
}

/** When the reel will reach 1 if nothing changes (null if it won't within the horizon). */
export function landsAt(reel: Reel, fight: Fight, opts: { easy: boolean; tier: number }, horizonMs = 60_000): number | null {
  const step = 50;
  let r = reel;
  for (let t = reel.at + step; t <= reel.at + horizonMs; t += step) {
    r = integrateReel(r, fight, t, opts);
    if (r.progress >= 1) return t;
  }
  return null;
}
