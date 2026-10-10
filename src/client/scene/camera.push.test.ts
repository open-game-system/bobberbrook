import { describe, expect, it } from "vitest";
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
