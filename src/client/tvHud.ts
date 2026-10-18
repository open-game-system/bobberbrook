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

/** The campfire recap: one catch pops up every RECAP_EVERY_MS, the day's last RECAP_MAX, oldest first. */
export const RECAP_EVERY_MS = 700;
export const RECAP_MAX = 8;

export function campfireRecap(log: Lake["log"], since: number | null, now: number): Lake["log"] {
  if (since === null) return [];
  const shown = Math.floor((now - since) / RECAP_EVERY_MS);
  return log.slice(-RECAP_MAX).slice(0, Math.max(0, shown));
}

/** A TV banner. A catch banner can carry up to two more catches that landed while it was up. */
export type Toast = {
  id: number;
  kind: "new" | "upgrade" | "golden" | "place" | "tod";
  fishId?: string;
  seat?: number;
  tier?: number;
  place?: string;
  ride?: "boat" | "zeppelin";
  tod?: TimeOfDay;
  star?: boolean;
  /** A rod upgrade the catch earned, shown on the catch's own banner. */
  rodTier?: number;
  also: { fishId: string; seat: number; star: boolean | undefined }[];
};

/**
 * Adds fresh banners to the queue. A catch joins a catch banner already up or waiting (up to three per
 * banner), so a second catch never waits behind the first (round 18: Dad's showed only at the campfire).
 */
export function queueToasts(queue: Toast[], fresh: Toast[]): Toast[] {
  const out = queue.map((t) => ({ ...t, also: [...t.also] }));
  for (const t of fresh) {
    const earnedBy = t.kind === "upgrade" ? [...out].reverse().find((q) => q.kind === "new") : undefined;
    if (earnedBy && t.tier !== undefined) {
      earnedBy.rodTier = t.tier;
      continue;
    }
    const host = t.kind === "new" && t.fishId && t.seat !== undefined ? out.find((q) => q.kind === "new" && q.also.length < 2) : undefined;
    if (host && t.fishId && t.seat !== undefined) host.also.push({ fishId: t.fishId, seat: t.seat, star: t.star });
    // A new species jumps the queue: right after the banner on screen (round 19: it waited behind the rod toast).
    else if (t.kind === "new" && t.star && out.length > 0) out.splice(1, 0, t);
    else out.push(t);
  }
  return out.slice(-4);
}
