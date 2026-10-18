import type { Lake } from "../game/lake";
import { worldFor } from "../game/regions";
import { REVEAL_WAIT_S, revealReady } from "./scene/revealGate";

/** Past the TV's wait by this much, a discovery is old news (a screen that joins later). */
const STALE_MS = 3000;

export type Revealed = { seq: number; at: number };

/**
 * When the latest found place's reveal started, as the TV plays it (the family at the water, or after the
 * TV's wait): `memo` is what this screen remembered last time. Null until it starts.
 */
export function revealedAt(memo: Revealed | null, lake: Lake, now: number): Revealed | null {
  const d = lake.discovery;
  if (!d) return null;
  if (memo?.seq === d.seq) return memo;
  if (now - d.at > REVEAL_WAIT_S * 1000 + STALE_MS) return null;
  const place = worldFor(lake.worldSeed).placeById(d.area);
  if (!place || !revealReady(lake.fishers.map((f) => f.pos), place, (now - d.at) / 1000)) return null;
  return { seq: d.seq, at: now };
}
