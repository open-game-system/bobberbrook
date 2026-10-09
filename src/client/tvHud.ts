import type { TimeOfDay } from "../game/daycycle";
import { BOARD_MS, type Lake } from "../game/lake";

/** How full the TV's "all aboard" ring is (0..1), or null when nobody waits at a mooring. */
export function boardingProgress(boarding: Lake["boarding"], now: number): number | null {
  if (!boarding) return null;
  return Math.min(1, Math.max(0, (now - boarding.since) / BOARD_MS));
}

/** The time of day to announce on the TV when it turns over (null at the first look or no change). */
export function todChanged(prev: TimeOfDay | null, next: TimeOfDay): TimeOfDay | null {
  return prev !== null && prev !== next ? next : null;
}
