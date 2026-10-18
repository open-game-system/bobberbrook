import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig, KEEP_X, KEEP_Y, inKeepOut, keepLift } from "./camera";

/** Round 25: the TV's join card (bottom left) is a keep-out corner for the group framing (round 24 session 255 s). */
function settle(feet: [number, number, number][]): CameraRig {
  const rig = new CameraRig(16 / 9);
  for (let i = 0; i < 600; i++) {
    rig.beginFocus();
    for (const [x, y, z] of feet) rig.addFocus(x, y, z);
    rig.update(i / 60, 1 / 60, false, null);
  }
  return rig;
}

function ndc(rig: CameraRig, x: number, y: number, z: number): Vector3 {
  rig.camera.updateMatrixWorld(true);
  return new Vector3(x, y, z).project(rig.camera);
}

describe("the join card keep-out", () => {
  it("lifts the floor only in the card's column", () => {
    expect(keepLift(-0.9)).toBeGreaterThan(0.1);
    expect(keepLift(KEEP_X)).toBeGreaterThan(0.1);
    expect(keepLift(KEEP_X + 0.05)).toBeGreaterThan(0);
    expect(keepLift(KEEP_X + 0.05)).toBeLessThan(keepLift(KEEP_X));
    expect(keepLift(KEEP_X + 0.11)).toBe(0);
    expect(keepLift(0.8)).toBe(0);
  });

  it("is the bottom-left corner only", () => {
    expect(inKeepOut(-0.8, -0.8)).toBe(true);
    expect(inKeepOut(-0.8, KEEP_Y + 0.05)).toBe(false);
    expect(inKeepOut(KEEP_X + 0.05, -0.8)).toBe(false);
    expect(inKeepOut(0.8, -0.8)).toBe(false);
  });

  // A family strung out across the view with the left one nearest the lens: without the keep-out the left
  // one's feet land on the bottom line at the left edge, under the card.
  const FAMILY: [number, number, number][] = [
    [-9, 0.4, 7],
    [0, 0.4, 2],
    [9, 0.4, 0],
  ];
  it("never puts a fisher's feet or body under the card", () => {
    const rig = settle(FAMILY);
    for (const [x, y, z] of FAMILY) {
      for (const lift of [-0.7, 0, 1, 2]) {
        const p = ndc(rig, x, y + lift, z);
        expect(inKeepOut(p.x, p.y)).toBe(false);
      }
    }
  });

  it("still keeps the family's feet low in the frame on the right", () => {
    const mirrored = FAMILY.map(([x, y, z]): [number, number, number] => [-x, y, z]);
    const rig = settle(mirrored);
    const lowest = Math.min(...mirrored.map(([x, y, z]) => ndc(rig, x, y - 0.7, z).y));
    expect(lowest).toBeLessThan(-0.62);
  });
});
