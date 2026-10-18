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
import { CAMPFIRE, areaById, distance, pondRadius, polarIn, segmentDistance, type PondPlace, type Vec } from "./world";

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

/**
 * Round 28 (round 27 session 119-146 s: Juneau fished standing in the water at Mistmarsh's boardwalk foot): the
 * TV draws a pond's water 0.9 m past its edge and the bank rises above it only after that, while anyone could
 * fish from 0.4 m up. A fisher the rules place fishes with their feet at least this far up the bank (spots are 1.6 m up).
 */
export const DRY_BANK = 1.5;
/** Round the feet (this far any way, about their ring) no water is drawn either (the TV draws it to 0.9 m up: a bay or a lobe). */
const DRY_RING = 0.6;
const DRY_NEAR = 0.9;

/** How far up the bank from a pond's edge a point stands (negative: in the water), measured out from the centre. */
export function upBank(a: PondPlace, q: Vec): number {
  const { r, theta } = polarIn(a, q);
  return r - pondRadius(a, theta);
}

/** Feet on dry land by this pond: DRY_BANK up its bank, and no water just round them either. */
export function dryBank(a: PondPlace, q: Vec): boolean {
  if (upBank(a, q) < DRY_BANK) return false;
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    if (upBank(a, { x: q.x + Math.cos(t) * DRY_RING, z: q.z + Math.sin(t) * DRY_RING }) < DRY_NEAR) return false;
  }
  return true;
}

/** Round 28: the boardwalk's feet keep this clear (was 2.2: Dad and Juneau fished shoulder to shoulder at the east foot). */
export const FOOT_CLEAR = 3.5;

/** A prop on a bank that nobody fishes from: its centre and how far round it stays clear. */
export type KeepClear = { at: Vec; r: number };

const KEEP_CLEAR: Record<string, KeepClear[]> = (() => {
  const walk = boardwalkPath(areaById("mistmarsh"));
  return {
    // The campfire with its logs and string-light poles (round 26: moved back off the bank; kept clear anyway).
    moonwell: [{ at: CAMPFIRE, r: 6 }],
    // The boardwalk's two feet: posts, lanterns and rope rails where it leaves the bank.
    mistmarsh: [{ at: walk[0]!, r: FOOT_CLEAR }, { at: walk[walk.length - 1]!, r: FOOT_CLEAR }],
  };
})();

/** The props a place keeps clear of fishers. */
export function keepClear(placeId: string): readonly KeepClear[] {
  return KEEP_CLEAR[placeId] ?? [];
}

/**
 * Round 28 (round 27 session 119-146 s; lab mistmarsh-foot-tag): past its east foot Mistmarsh's boardwalk runs
 * along the bank for metres, its posts, lanterns and rails beside anyone fishing there and the shallows it
 * crosses at their feet. A fisher keeps this far from the walk anywhere along it (the feet keep FOOT_CLEAR).
 */
export const RAIL_CLEAR = 2.7;
const WALKS: Record<string, Vec[]> = { mistmarsh: boardwalkPath(areaById("mistmarsh")) };

/** Clear of the place's walk along its whole length. */
export function clearOfWalk(placeId: string, q: Vec): boolean {
  const walk = WALKS[placeId];
  if (!walk) return true;
  for (let i = 1; i < walk.length; i++) if (segmentDistance(q, walk[i - 1]!, walk[i]!) < RAIL_CLEAR) return false;
  return true;
}

/** Mistmarsh's pavilion on the bank (the scene builds it here): theta and metres up the bank from the water. */
export const PAVILION = { theta: -2.35, up: 4.5 };
/** Round 28 (lab mistmarsh-dock-foot: Juneau fished from under its roof): its roof is 4 m round; fishers keep 5 m off. */
const PAVILION_CLEAR = 5;
export function pavilionAt(a: PondPlace): Vec {
  const r = pondRadius(a, PAVILION.theta) + PAVILION.up;
  return { x: a.center.x + Math.cos(PAVILION.theta) * r, z: a.center.z + Math.sin(PAVILION.theta) * r };
}
const ROOFS: Record<string, KeepClear[]> = { mistmarsh: [{ at: pavilionAt(areaById("mistmarsh")), r: PAVILION_CLEAR }] };

/** Clear of every prop the place keeps clear (round 28: and of its boardwalk and from under its pavilion's roof). */
export function clearOfProps(placeId: string, q: Vec): boolean {
  return keepClear(placeId).every((k) => distance(k.at, q) >= k.r) && clearOfWalk(placeId, q) && (ROOFS[placeId] ?? []).every((k) => distance(k.at, q) >= k.r);
}

/** Two fishers within this much of each other must also stand apart across the TV's view. */
export const ACROSS_NEAR = 9;
/** At least this far apart across the TV's view (m): a grown-up's silhouette with the rod arm, and a gap. Round 28: 2.2 -> 2.8 (a body width between catchers on screen; the held fish is 1.2 m+ wide). */
export const SPOT_ACROSS = 2.8;

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
