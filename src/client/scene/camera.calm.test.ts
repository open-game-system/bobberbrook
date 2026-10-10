import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CAMPFIRE } from "../../game/world";
import { CameraRig } from "./camera";

type Feet = [number, number, number][];

function frame(rig: CameraRig, feet: Feet, t: number, campfire = false): void {
  rig.beginFocus();
  for (const [x, y, z] of feet) {
    rig.addFocus(x, y, z);
    rig.addFisher(x, z);
  }
  rig.update(t, 1 / 60, campfire, null);
}

describe("a calm group camera", () => {
  it("stays put while the family shuffles in place", () => {
    const rig = new CameraRig(16 / 9);
    const base: Feet = [[-3, 0.4, 4], [2, 0.4, 3], [5, 0.4, 6]];
    for (let i = 0; i < 600; i++) frame(rig, base, i / 60);
    const p0 = rig.camera.position.clone();
    let worst = 0;
    for (let i = 600; i < 1200; i++) {
      // Each fisher sways ±0.4 m (idle steps, casting, turning).
      const feet: Feet = base.map(([x, y, z], k) => [x + 0.4 * Math.sin(i * 0.05 + k), y, z + 0.4 * Math.cos(i * 0.07 + k * 2)]);
      frame(rig, feet, i / 60);
      worst = Math.max(worst, rig.camera.position.distanceTo(p0));
    }
    expect(worst).toBeLessThan(0.12);
  });

  it("leaves the campfire straight onto the family (no swing half round the fire)", () => {
    const rig = new CameraRig(16 / 9);
    const seats: Feet = [[CAMPFIRE.x - 1.5, 0.4, CAMPFIRE.z - 1], [CAMPFIRE.x + 1.5, 0.4, CAMPFIRE.z - 1]];
    for (let i = 0; i < 400; i++) frame(rig, seats, i / 60, true);
    // Back at their spots by a pond 40 m away.
    const family: Feet = [[CAMPFIRE.x + 30, 0.4, CAMPFIRE.z + 25], [CAMPFIRE.x + 33, 0.4, CAMPFIRE.z + 24]];
    const look = new Vector3();
    for (let i = 400; i < 700; i++) {
      frame(rig, family, i / 60);
      // From the first frame on, the camera looks at the family from the south (yaw near 0): its forward
      // vector points north (-z), never back toward the fire.
      rig.camera.getWorldDirection(look);
      expect(look.z).toBeLessThan(-0.5);
      for (const [x, y, z] of family) {
        const p = new Vector3(x, y + 1, z).project(rig.camera);
        expect(Math.abs(p.x)).toBeLessThan(1);
        expect(Math.abs(p.y)).toBeLessThan(1);
      }
    }
  });
});
