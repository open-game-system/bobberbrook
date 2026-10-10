import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig } from "./camera";
import { CAMPFIRE } from "../../game/world";

/**
 * Round 18 (round 17 session 259-262 s): calling the campfire from a place under 150 m away flew the camera
 * across the land for ~1.5 s while the family already sat at the fire, so the TV showed an empty grassy
 * slope. Going to the campfire lands on the fire with the family seated round it, then settles in.
 */
function seats(): [number, number, number][] {
  return [0, 1, 2, 3].map((i) => {
    const a = Math.PI * 1.5 + (i - 1.5) * 0.7;
    return [CAMPFIRE.x + Math.cos(a) * 2.9, 0.4, CAMPFIRE.z + Math.sin(a) * 2.9];
  });
}

function ndc(rig: CameraRig, x: number, y: number, z: number): Vector3 {
  rig.camera.updateMatrixWorld(true);
  return new Vector3(x, y, z).project(rig.camera);
}

describe("into the campfire", () => {
  for (const away of [60, 120]) {
    it(`from a place ${away} m away, every frame shows the fire and the seated family`, () => {
      const rig = new CameraRig(16 / 9);
      const fam: [number, number, number][] = [
        [CAMPFIRE.x - away, 0.4, CAMPFIRE.z - 4],
        [CAMPFIRE.x - away + 3, 0.4, CAMPFIRE.z - 2],
      ];
      let t = 0;
      for (let i = 0; i < 600; i++, t += 1 / 60) {
        rig.beginFocus();
        for (const [x, y, z] of fam) rig.addFocus(x, y, z);
        rig.update(t, 1 / 60, false, null);
      }
      const seated = seats();
      for (let i = 0; i < 180; i++, t += 1 / 60) {
        rig.beginFocus();
        for (const [x, y, z] of seated) rig.addFocus(x, y, z);
        rig.update(t, 1 / 60, true, null);
        const fire = ndc(rig, CAMPFIRE.x, 0.6, CAMPFIRE.z);
        expect(Math.abs(fire.x), `fire off screen at frame ${i}`).toBeLessThan(0.6);
        expect(Math.abs(fire.y), `fire off screen at frame ${i}`).toBeLessThan(0.7);
        const cam = rig.camera.position;
        expect(Math.hypot(cam.x - CAMPFIRE.x, cam.z - CAMPFIRE.z), `camera far from the fire at frame ${i}`).toBeLessThan(20);
      }
    });
  }
});
