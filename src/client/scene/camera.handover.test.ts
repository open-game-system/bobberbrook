import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CameraRig, type RigFrame } from "./camera";
import { CATCHES_TRACE } from "./fixtures/cameraTraceCatches";
import { panReversals, turnReversals, zoomReversals, type Pose } from "./cameraJudder";

/**
 * Round 27 (judder replay of the round 26 bot session): the push panned toward Dad's catch and straight back
 * when Juneau's landed 0.7 s later, and eased out sideways just as the family set off the other way (4.6 deg
 * one way, 7.5 back). A joining catcher no longer re-aims a push under way, and the push hands its aim to the
 * framing as it eases out (a zoom out, not a pan back).
 */
const nums = z.array(z.array(z.number()));
const Frame = z.object({
  t: z.number(),
  dt: z.number(),
  campfire: z.boolean(),
  catchAt: z.object({ x: z.number(), y: z.number(), z: z.number(), age: z.number() }).nullable(),
  trail: z.number(),
  reveal: z.object({ x: z.number(), z: z.number(), age: z.number(), r: z.number().optional() }).nullable(),
  pts: nums,
  feet: nums,
  blockers: nums,
  placeYaw: z.number(),
  minDist: z.number(),
  rateK: z.number(),
  ride: z.object({ heading: z.number(), kind: z.number() }).nullable(),
  board: z.object({ ux: z.number(), uz: z.number(), kind: z.number() }).nullable(),
  out: z.array(z.number()),
});
const TraceFile = z.object({ frames: z.array(Frame) });

describe("the catch push hands over to the framing (recorded catches, round 26 bot)", () => {
  it("two catches 0.7 s apart and the walk-off replay with no back-and-forth", () => {
    const frames: RigFrame[] = TraceFile.parse(JSON.parse(CATCHES_TRACE)).frames;
    expect(frames.filter((f) => f.catchAt !== null).length).toBeGreaterThan(200);
    const rig = new CameraRig(16 / 9);
    const poses: Pose[] = [];
    for (const f of frames) {
      rig.replay(f);
      const d = rig.debug();
      poses.push({ t: f.t, x: d.target[0] ?? 0, z: d.target[2] ?? 0, dist: d.dist, yaw: d.yaw, el: d.el });
    }
    const settled = poses.slice(120);
    expect([...panReversals(settled), ...turnReversals(settled), ...zoomReversals(settled, 0.08)]).toEqual([]);
  });
});
