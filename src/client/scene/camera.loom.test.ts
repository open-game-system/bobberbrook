import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig } from "./camera";
import { FISHER_SCALE } from "./character";

/**
 * Round 18 (round 17 session 20 s): two fishers close together, one a few metres nearer the lens, and the
 * group framing pushed in until the near one's back filled the middle of the TV (about a quarter of the
 * frame tall). No fisher's body (feet to hat, FISHER_SCALE m; focus points sit 0.4 m up) stands taller than
 * NEAR_H of the frame in the group framing (a catch push-in may go closer).
 */
const NEAR_H = 0.19;

function settle(feet: [number, number, number][]): CameraRig {
  const rig = new CameraRig(16 / 9);
  for (let i = 0; i < 600; i++) {
    rig.beginFocus();
    for (const [x, y, z] of feet) {
      rig.addFocus(x, y, z);
      rig.addFisher(x, z);
    }
    rig.update(i / 60, 1 / 60, false, null);
  }
  return rig;
}

function screenHeight(rig: CameraRig, x: number, y: number, z: number): number {
  rig.camera.updateMatrixWorld(true);
  const a = new Vector3(x, y - 0.4, z).project(rig.camera);
  const b = new Vector3(x, y - 0.4 + FISHER_SCALE, z).project(rig.camera);
  return Math.abs(b.y - a.y) / 2;
}

describe("no fisher looms over the frame", () => {
  for (const [name, fam] of [
    ["one just in front of the other", [[0, 0.4, -2], [0.6, 0.4, 3.5]]],
    ["one a step nearer, half a body to the side", [[0, 0.4, -2], [1.5, 0.4, 3.5]]],
  ] as [string, [number, number, number][]][]) {
    it(`${name}: the near body stays under ${NEAR_H * 100}% of the frame tall`, () => {
      const rig = settle(fam);
      for (const [x, y, z] of fam) expect(screenHeight(rig, x, y, z)).toBeLessThan(NEAR_H);
    });
  }
  it("a bobber out on the water behind a lone fisher keeps the close framing", () => {
    const rig = new CameraRig(16 / 9);
    for (let i = 0; i < 600; i++) {
      rig.beginFocus();
      rig.addFocus(0, 0.4, 0);
      rig.addFisher(0, 0);
      rig.addFocus(0.5, 0, -6);
      rig.update(i / 60, 1 / 60, false, null);
    }
    expect(screenHeight(rig, 0, 0.4, 0)).toBeGreaterThan(NEAR_H);
  });
  // Semantic stability: a lone fisher or a side-by-side pair keeps the round-09 close framing.
  for (const [name, fam] of [
    ["side by side", [[-1, 0.4, 2], [1, 0.4, 2]]],
    ["a lone fisher", [[0, 0.4, 0]]],
  ] as [string, [number, number, number][]][]) {
    it(`${name}: keeps the close framing (body over ${NEAR_H * 100}% of the frame)`, () => {
      const rig = settle(fam);
      for (const [x, y, z] of fam) expect(screenHeight(rig, x, y, z)).toBeGreaterThan(NEAR_H);
    });
  }
});
