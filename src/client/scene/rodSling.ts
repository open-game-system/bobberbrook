import { Matrix4, Quaternion, Vector3, type Object3D } from "three";

/**
 * Round 21: the rod rides on the fisher's back while they walk or ride (round 20 session 100/131 s: carried
 * level like a lance, its tip through the ground) and comes to hand at the water and whenever they fish.
 */
/** Seconds standing still before the rod comes to hand (a pause on the trail keeps it slung). */
export const SLING_SETTLE_S = 0.7;

/** Standing at the water, rod in hand: the right arm forward enough that the rod's tip points ~55 degrees up. */
export const READY_ARM_X = -1.0;
/** The right arm's pose (shoulder rotations) holding the rod's butt at the chest while it is carried. */
export const SLING_ARM = { x: -1.2, z: 0.12 };

/** atWater: the fisher could cast from where they stand (the world's castFrom). */
export function slingTarget(s: { mode: string; moving: boolean; stillFor: number; riding: boolean; atWater: boolean }): 0 | 1 {
  // Riding (and stepping ashore after a ride, mode "ride" in the rules) carries the rod like walking.
  if (s.mode === "ride") return 1;
  if (s.mode !== "walk") return 0;
  if (s.riding || s.moving || !s.atWater) return 1;
  return s.stillFor < SLING_SETTLE_S ? 1 : 0;
}

const inv = new Matrix4();
const mA = new Matrix4();
const mB = new Matrix4();
const pA = new Vector3();
const pB = new Vector3();
const qA = new Quaternion();
const qB = new Quaternion();
const sA = new Vector3();
const sB = new Vector3();

/**
 * Puts `rod` (a child of `root`) between the hand mount (w = 0) and the back mount (w = 1); both mounts and
 * root must have current world matrices.
 */
export function placeRod(rod: Object3D, root: Object3D, hand: Object3D, back: Object3D, w: number): void {
  inv.copy(root.matrixWorld).invert();
  mA.multiplyMatrices(inv, hand.matrixWorld).decompose(pA, qA, sA);
  mB.multiplyMatrices(inv, back.matrixWorld).decompose(pB, qB, sB);
  const k = Math.max(0, Math.min(1, w));
  rod.position.copy(pA).lerp(pB, k);
  rod.quaternion.copy(qA).slerp(qB, k);
  rod.scale.copy(sA).lerp(sB, k);
}
