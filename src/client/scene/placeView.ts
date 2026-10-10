/**
 * Round 20: which side of a place the group camera looks from.
 *
 * Moonwell reads best because the family fishes its near (south) shore: the camera stands behind them and
 * looks over their shoulders across the water. Every other place kept a fixed side (home places all looked
 * from the south), so where the family fished the far shore (Mistmarsh, which the trail reaches from the
 * north-east) the camera looked at them across the whole pond, through the boardwalk, their lines running
 * toward the lens. Now the camera keeps the place's own side while the family stands on that side of the
 * water, and swings round when they fish further round the pond, until it stands no more than SIDE_SLACK
 * off straight behind them (Moonwell's own widest three-quarter, Dad at its west shore).
 */

/** How far (rad) the camera may sit from straight behind the family before it swings round. */
export const SIDE_SLACK = 0.75;
/** Under this resultant (0..1) the family stands all round the pond: keep the last side. */
const SPREAD_HOLD = 0.3;

/** Wraps an angle into (-pi, pi]. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/**
 * The yaw (the camera sits at +(sin yaw, cos yaw) from what it looks at) behind the family as seen from
 * the pond's centre: the mean direction from the centre to each fisher. Null when they stand all round it.
 */
export function behindYaw(cx: number, cz: number, feet: readonly { x: number; z: number }[]): number | null {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const f of feet) {
    const dx = f.x - cx;
    const dz = f.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) continue;
    sx += dx / d;
    sz += dz / d;
    n++;
  }
  if (n === 0 || Math.hypot(sx, sz) / n < SPREAD_HOLD) return null;
  return Math.atan2(sx, sz);
}

/**
 * The group camera's yaw at a place: the place's own yaw `pref` while the family is within SIDE_SLACK of
 * it, else as far round toward behind them as leaves SIDE_SLACK. Continuous in the family's position; the
 * result is unwrapped next to `prev` (the springs never spin the long way round), and a family straight
 * across the pond keeps the side the camera already swung to.
 */
export function placeYaw(pref: number, behind: number | null, prev: number): number {
  if (behind === null) return prev;
  const d = wrapAngle(behind - pref);
  const prevD = wrapAngle(prev - pref);
  let dd = d;
  // Straight across: keep turning the way the camera already went (measured the long way round if need be).
  if (Math.abs(d) > Math.PI - 0.5 && Math.abs(prevD) > 0.05 && Math.sign(prevD) !== Math.sign(d)) dd = d + Math.sign(prevD) * Math.PI * 2;
  const side = Math.sign(dd);
  const off = Math.max(0, Math.abs(dd) - SIDE_SLACK);
  const yaw = pref + side * off;
  return prev + wrapAngle(yaw - prev);
}
