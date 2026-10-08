export type TimeOfDay = "morning" | "golden" | "night" | "dawn";

/** One full day on the lake. */
export const DAY_MS = 12 * 60_000;
/** A new room starts mid-morning. */
export const DAY_START = 0.08;

/** Where in the day it is, 0..1 (0 = sunrise). */
export function dayPhase(startedAt: number, now: number): number {
  const p = DAY_START + Math.max(0, now - startedAt) / DAY_MS;
  return p - Math.floor(p);
}

export function timeOfDay(phase: number): TimeOfDay {
  if (phase < 0.36) return "morning";
  if (phase < 0.5) return "golden";
  if (phase < 0.86) return "night";
  return "dawn";
}
