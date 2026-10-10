/**
 * Walking to a seat round the campfire (round 13: Dad walked straight through the fire to his seat).
 * A step that would end inside the fire's clear ring is put back on the ring and carried round it,
 * the short way, toward the seat's side, by the length of the step.
 */
export const FIRE_CLEAR = 1.7;

export function aroundFire(
  from: { x: number; z: number },
  next: { x: number; z: number },
  seat: { x: number; z: number },
  fire: { x: number; z: number },
  clear = FIRE_CLEAR,
): { x: number; z: number } {
  const dx = next.x - fire.x;
  const dz = next.z - fire.z;
  const d = Math.hypot(dx, dz);
  if (d >= clear) return next;
  const step = Math.max(1e-4, Math.hypot(next.x - from.x, next.z - from.z));
  // Where on the ring we are (from the step's start, so a walker never flips sides) and where the seat is.
  const a0 = Math.atan2(from.z - fire.z, from.x - fire.x);
  const aSeat = Math.atan2(seat.z - fire.z, seat.x - fire.x);
  let da = aSeat - a0;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const turn = Math.sign(da || 1) * Math.min(Math.abs(da), step / clear);
  const a = a0 + turn;
  return { x: fire.x + Math.cos(a) * clear, z: fire.z + Math.sin(a) * clear };
}
