/**
 * When a found place's reveal plays (round 18). The game marks a place discovered the moment the first
 * fisher steps into its clearing, often still on the trail well out from the water; the TV's reveal waits
 * until someone has arrived at the water's side of the clearing (ARRIVED of the clearing in from its edge),
 * or REVEAL_WAIT_S at most, so the beat lands on the family arriving.
 */
export const REVEAL_WAIT_S = 6;
const ARRIVED = 0.45;

type Ground = { x: number; z: number };
type Found = { center: Ground; pond: { r: number }; clearing: number };

export function revealReady(fishers: readonly Ground[], place: Found, waited: number): boolean {
  if (fishers.length === 0 || waited >= REVEAL_WAIT_S) return true;
  const reach = place.pond.r + place.clearing * ARRIVED;
  return fishers.some((f) => Math.hypot(f.x - place.center.x, f.z - place.center.z) <= reach);
}
