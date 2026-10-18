import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig } from "./camera";

/**
 * Round 20 (round 19 session 229 s and 236 s, Mistmarsh): the catch push-in must read even when a bobber
 * or the pond in front of the family is in the framing. Those points shape the group shot but are soft:
 * a push-in may leave them, never a fisher.
 */
type P = [number, number, number];
const FAMILY: P[] = [[0, 0.4, 0], [2.5, 0.4, 0.5]];
// A bobber far out and the "water in front of them" point the scene adds at a place.
const SOFT: P[] = [[-11, 0, -6], [1, 0, -10]];

function run(softPoints: boolean): { before: number; during: number } {
  const rig = new CameraRig(16 / 9);
  let before = 0;
  let during = Infinity;
  for (let i = 0; i < 60 * 9; i++) {
    const t = i / 60;
    rig.beginFocus();
    for (const [x, y, z] of FAMILY) {
      rig.addFocus(x, y, z);
      rig.addFisher(x, z);
    }
    for (const [x, y, z] of SOFT) rig.addFocus(x, y, z, softPoints);
    const catchAt = t >= 6 && t < 9 ? { x: 0, y: 2.2, z: 0, age: t - 6 } : null;
    rig.update(t, 1 / 60, false, catchAt);
    if (i === 60 * 6 - 1) before = rig.debug().dist;
    if (t > 6) during = Math.min(during, rig.debug().dist);
  }
  return { before, during };
}

describe("catch push-in with soft focus points", () => {
  it("pushes in at least a quarter of the way closer when the far points are soft", () => {
    const { before, during } = run(true);
    expect(during).toBeLessThan(before * 0.75);
  });
  it("pushes in further than when the same points must stay in frame", () => {
    expect(run(true).during).toBeLessThan(run(false).during - 1);
  });
});

/**
 * Round 24 (round 23 session 36.8 s): the push toward Dad's catch let half of Juneau out at the left edge;
 * the fit kept his centre line in the safe margin, not his body. Every fisher's body (0.8 m either side of
 * the feet) stays inside the frame through the whole push.
 */
describe("catch push-in keeps whole bodies in frame", () => {
  it("never crops a fisher standing wide of the catcher", () => {
    const rig = new CameraRig(16 / 9);
    const fam: P[] = [[0, 0.4, 0], [-9, 0.4, 2]];
    let worst = 0;
    for (let i = 0; i < 60 * 10; i++) {
      const t = i / 60;
      rig.beginFocus();
      for (const [x, y, z] of fam) {
        rig.addFocus(x, y, z);
        rig.addFisher(x, z);
      }
      const catchAt = t >= 6 && t < 9 ? { x: 0, y: 2.2, z: 0, age: t - 6 } : null;
      rig.update(t, 1 / 60, false, catchAt);
      if (t < 6) continue;
      const cam = rig.camera;
      cam.updateMatrixWorld(true);
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
      for (const [x, y, z] of fam) {
        for (const s of [-0.75, 0.75]) {
          for (const lift of [0, 2.3]) {
            const p = new Vector3(x + right.x * s, y + lift, z + right.z * s).project(cam);
            worst = Math.max(worst, Math.abs(p.x));
          }
        }
      }
    }
    expect(worst).toBeLessThan(0.97);
  });
});
