/**
 * Round 24: a fisher's build by role, so the family reads as a family (concept/web/08-characters.jpg):
 * grown-ups tall with long legs and a smaller head for their height, a kid small and chunky with a big
 * head, the little one (easy mode) smaller still. Figure units (the rig is scaled by FISHER_SCALE).
 */
export type Role = "adult" | "kid" | "little";

export type Build = {
  /** Hip pivot height (the top of the legs). */
  hip: number;
  /** Trouser radius at the hip and at the boot. */
  legR: number;
  /** Boot size (1 = the kid's). */
  boot: number;
  /** Torso: centre height, half height, half width, half depth. */
  torsoY: number;
  torsoH: number;
  torsoW: number;
  torsoD: number;
  /** Shoulder pivot height and its distance from the middle. */
  shoulderY: number;
  shoulderX: number;
  /** Shoulder to wrist; sleeve radius. */
  armLen: number;
  armR: number;
  /** The head's pivot (the neck) and the head's scale (1 = the round-23 head, 0.5 across). */
  neckY: number;
  headS: number;
  /** Sitting (campfire): how far the body drops and how far the legs swing forward (radians). */
  sitDrop: number;
  sitLeg: number;
};

export const BUILDS: Record<Role, Build> = {
  adult: { hip: 0.46, legR: 0.075, boot: 1.25, torsoY: 0.68, torsoH: 0.27, torsoW: 0.2, torsoD: 0.15, shoulderY: 0.86, shoulderX: 0.215, armLen: 0.38, armR: 0.052, neckY: 0.93, headS: 0.8, sitDrop: 0.25, sitLeg: -1.15 },
  kid: { hip: 0.2, legR: 0.062, boot: 1, torsoY: 0.35, torsoH: 0.2, torsoW: 0.19, torsoD: 0.16, shoulderY: 0.47, shoulderX: 0.18, armLen: 0.17, armR: 0.05, neckY: 0.54, headS: 0.9, sitDrop: 0.15, sitLeg: -1.45 },
  little: { hip: 0.16, legR: 0.058, boot: 0.92, torsoY: 0.29, torsoH: 0.16, torsoW: 0.17, torsoD: 0.145, shoulderY: 0.39, shoulderX: 0.165, armLen: 0.145, armR: 0.046, neckY: 0.45, headS: 0.86, sitDrop: 0.12, sitLeg: -1.45 },
};

/** The rules' fisher to a role: a named grown-up, a wordless kid, the little one on easy mode. */
export function fisherRole(f: { kid: boolean; easy: boolean }): Role {
  if (!f.kid) return "adult";
  return f.easy ? "little" : "kid";
}

/** Head space: the hat's top above the neck at headS 1. */
export const HAT_TOP = 0.57;
/** Head space: the chin above the neck at headS 1. */
export const CHIN = 0.0;
/** Head space: half the head's width with the hat brim at headS 1. */
export const HEAD_HALF = 0.3;

/** The top of the hat above the feet (figure units). */
export function figureTop(b: Build): number {
  return b.neckY + HAT_TOP * b.headS;
}
