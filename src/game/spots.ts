/**
 * Round 26: where a fisher may stand to fish, as the TV will see it.
 *
 * Round 25's session: Juneau fished from inside Moonwell's campfire for 70 s (the fire stood on the bank in
 * front of his spawn spot), and at Mistmarsh Dad stood behind Juneau and the boardwalk's foot posts for all
 * four catches (two spots 3.5 m apart along a bank the camera looked down). So a fishing spot must be clear
 * of the big props on a bank, and two fishers near each other must stand apart *across* the TV's view, not
 * only apart on the ground. The camera's side of a place is pure geometry (the scene's placeView.ts uses the
 * same functions), so the rules can ask it.
 */
import { CAMPFIRE, areaById, distance, pondRadius, type PondPlace, type Vec } from "./world";

/** Wraps an angle into (-pi, pi]. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/** A cheap hash of a place key in [0, 1) per salt. */
export function placeHash(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A place's own camera side (yaw: the camera sits at +(sin yaw, cos yaw)): home places from the south, others hashed. */
export function placeSideYaw(place: { home: boolean; key: string }): number {
  return place.home ? 0 : (placeHash(place.key, 11) - 0.5) * 0.9;
}

/** How far (rad) the camera may sit from straight behind the family before it swings round. */
export const SIDE_SLACK = 0.75;
/** Under this resultant (0..1) the family stands all round the pond: keep the last side. */
const SPREAD_HOLD = 0.3;

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

/** Mistmarsh's boardwalk: 15 points from its north shore end (0) round over the water to its east shore end (14). */
export function boardwalkPath(a: PondPlace): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const th = -1.55 + t * 1.25;
    const r = pondRadius(a, th) + 1.5 - Math.sin(t * Math.PI) * 5.5 - t * 0.5;
    out.push({ x: a.center.x + Math.cos(th) * r, z: a.center.z + Math.sin(th) * r });
  }
  return out;
}

/** A prop on a bank that nobody fishes from: its centre and how far round it stays clear. */
export type KeepClear = { at: Vec; r: number };

const KEEP_CLEAR: Record<string, KeepClear[]> = (() => {
  const walk = boardwalkPath(areaById("mistmarsh"));
  return {
    // The campfire with its logs and string-light poles (round 26: moved back off the bank; kept clear anyway).
    moonwell: [{ at: CAMPFIRE, r: 6 }],
    // The boardwalk's two feet: posts, lanterns and rope rails where it leaves the bank.
    mistmarsh: [{ at: walk[0]!, r: 2.2 }, { at: walk[walk.length - 1]!, r: 2.2 }],
  };
})();

/** The props a place keeps clear of fishers. */
export function keepClear(placeId: string): readonly KeepClear[] {
  return KEEP_CLEAR[placeId] ?? [];
}

/** Clear of every prop the place keeps clear. */
export function clearOfProps(placeId: string, q: Vec): boolean {
  return keepClear(placeId).every((k) => distance(k.at, q) >= k.r);
}

/** Two fishers within this much of each other must also stand apart across the TV's view. */
export const ACROSS_NEAR = 9;
/** At least this far apart across the TV's view (m): a grown-up's silhouette with the rod arm, and a gap. */
export const SPOT_ACROSS = 2.2;

/**
 * The TV camera's sideways directions at a place with the family standing at `feet`: one, or two when the
 * family stands straight across the pond from the place's own side (the scene's camera then keeps whichever
 * way it already turned, which the rules can't know, so a spot must suit both).
 */
export function viewRights(place: PondPlace & { home: boolean; key: string }, feet: readonly Vec[]): Vec[] {
  const pref = placeSideYaw(place);
  const behind = behindYaw(place.center.x, place.center.z, feet);
  const yaws = [placeYaw(pref, behind, pref + 0.1), placeYaw(pref, behind, pref - 0.1)];
  const out = yaws.map((yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) }));
  return Math.abs(out[0]!.x * out[1]!.x + out[0]!.z * out[1]!.z) > 0.999 ? [out[0]!] : out;
}

/** The first of viewRights (tests and the lab). */
export function viewRight(place: PondPlace & { home: boolean; key: string }, feet: readonly Vec[]): Vec {
  return viewRights(place, feet)[0]!;
}

/** No deeper apart (along the view) than this times their distance across it (56 deg off the screen line): side by side, not a queue. */
export const DEPTH_PER_ACROSS = 1.5;

/**
 * Standing at `q`, everyone fishing within ACROSS_NEAR of it is at least SPOT_ACROSS to the side on the TV,
 * and no further apart in depth than across (a pair along a bank the camera looks down reads as a queue).
 */
export function apartAcross(place: PondPlace & { home: boolean; key: string }, q: Vec, taken: readonly Vec[]): boolean {
  const near = taken.filter((t) => distance(t, q) < ACROSS_NEAR);
  if (near.length === 0) return true;
  return viewRights(place, [...near, q]).every((right) =>
    near.every((t) => {
      const across = Math.abs((q.x - t.x) * right.x + (q.z - t.z) * right.z);
      const depth = Math.abs((q.x - t.x) * right.z - (q.z - t.z) * right.x);
      return across >= SPOT_ACROSS && depth <= across * DEPTH_PER_ACROSS;
    }),
  );
}
