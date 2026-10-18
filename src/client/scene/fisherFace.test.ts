import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { ADULT_STRETCH, HEAD_R, crownLift, onFace, shapeHead } from "./fisherFace";

const KID = { adult: false };
const ADULT = { adult: true };
/** The shaped head's half width at a height (n.y on the round skull), on the side. */
const halfWidth = (ny: number, s: { adult: boolean }) => {
  const y = 0.24 + ny * HEAD_R;
  const x = Math.sqrt(HEAD_R * HEAD_R - (ny * HEAD_R) ** 2);
  return shapeHead(new Vector3(x, y, 0.02), s).x;
};

describe("fisher heads are not spheres (round 24)", () => {
  it("a kid's cheeks bulge low on the face: wider at the cheeks than a sphere, the chin soft and small", () => {
    const cheek = shapeHead(new Vector3(0.17, 0.16, 0.17), KID);
    expect(Math.hypot(cheek.x, cheek.z)).toBeGreaterThan(Math.hypot(0.17, 0.17) * 1.01);
    expect(halfWidth(-0.85, KID)).toBeLessThan(Math.sqrt(1 - 0.85 ** 2) * HEAD_R);
  });

  it("a grown-up's face is longer with a narrower jaw than the cheekbones", () => {
    const top = shapeHead(new Vector3(0, 0.24 + HEAD_R, 0), ADULT);
    expect(top.y - 0.24).toBeCloseTo(HEAD_R * ADULT_STRETCH, 5);
    expect(crownLift(ADULT)).toBeCloseTo(HEAD_R * (ADULT_STRETCH - 1), 6);
    expect(crownLift(KID)).toBe(0);
    const jawK = halfWidth(-0.7, ADULT) / (Math.sqrt(1 - 0.49) * HEAD_R);
    const cheekK = halfWidth(0, ADULT) / HEAD_R;
    expect(jawK).toBeLessThan(cheekK - 0.08);
  });

  it("the face's front is flatter than a ball's, and features sit on the shaped face", () => {
    const front = shapeHead(new Vector3(0, 0.24, 0.24 + HEAD_R - 0.24), KID);
    expect(front.z).toBeLessThan(HEAD_R);
    const eye = onFace(0.09, 0.255, KID);
    const dy = 0.255 - 0.24;
    const onSphere = shapeHead(new Vector3(0.09, 0.255, Math.sqrt(HEAD_R ** 2 - 0.09 ** 2 - dy * dy)), KID);
    expect(eye.distanceTo(onSphere)).toBeLessThan(1e-9);
    expect(onFace(0.09, 0.255, KID, 0.01).z).toBeCloseTo(eye.z + 0.01, 9);
  });
});
