import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig, TOP_X, TOP_Y, inKeepOut, keepDrop } from "./camera";

/**
 * Round 26 (round 25 session 263 s and 280 s: the catch ticket at the top centre covered Dad's name tag): the
 * top banner band is a camera keep-out like the join card's corner. Measured on that session, a two-line ticket
 * spans NDC x -0.46..0.45, y 0.89 down to 0.60.
 */
type P = [number, number, number];
/** Name tags: the focus point the rig keeps in frame 4 m over the feet (camera.ts LIFTS). */
const TAG = 4.0;

function run(family: P[], catchAt: (t: number) => { x: number; y: number; z: number; age: number } | null, until: number, probe: (rig: CameraRig, t: number) => void): void {
  const rig = new CameraRig(16 / 9);
  for (let i = 0; i < 60 * until; i++) {
    const t = i / 60;
    rig.beginFocus();
    for (const [x, y, z] of family) {
      rig.addFocus(x, y, z);
      rig.addFisher(x, z);
    }
    rig.update(t, 1 / 60, false, catchAt(t));
    rig.camera.updateMatrixWorld(true);
    probe(rig, t);
  }
}

const tagNdc = (rig: CameraRig, [x, y, z]: P): Vector3 => new Vector3(x, y + TAG, z).project(rig.camera);

describe("the top banner keep-out", () => {
  it("is the top centre band only, and covers the measured ticket", () => {
    expect(TOP_X).toBeGreaterThanOrEqual(0.46);
    expect(TOP_Y).toBeLessThanOrEqual(0.6);
    expect(inKeepOut(0, 0.7)).toBe(true);
    expect(inKeepOut(0.4, TOP_Y + 0.02)).toBe(true);
    expect(inKeepOut(0, TOP_Y - 0.05)).toBe(false);
    expect(inKeepOut(0.8, 0.75)).toBe(false);
    expect(keepDrop(0)).toBeGreaterThan(0);
    expect(keepDrop(0.9)).toBe(0);
  });

  // Dad a few metres behind Juneau (the round 25 Mistmarsh pair): Dad's tag rides high in the frame.
  const PAIR: P[] = [[0, 0.4, 0], [2.2, 0.4, -4.5]];
  it("keeps every name tag out of the band in the settled group framing", () => {
    let worst = -1;
    run(PAIR, () => null, 10, (rig, t) => {
      if (t < 8) return;
      for (const f of PAIR) {
        const p = tagNdc(rig, f);
        if (Math.abs(p.x) < TOP_X) worst = Math.max(worst, p.y);
      }
    });
    expect(worst).toBeLessThan(TOP_Y);
  });

  it("keeps every name tag out of the band through a catch push-in, and still pushes in", () => {
    let worst = -1;
    let before = 0;
    let closest = Infinity;
    run(PAIR, (t) => (t >= 8 && t < 11.1 ? { x: 0, y: 2.2, z: 0, age: t - 8 } : null), 14, (rig, t) => {
      if (t < 8) {
        before = rig.debug().dist;
        return;
      }
      closest = Math.min(closest, rig.debug().dist);
      for (const f of PAIR) {
        const p = tagNdc(rig, f);
        if (Math.abs(p.x) < TOP_X) worst = Math.max(worst, p.y);
      }
    });
    expect(worst).toBeLessThan(TOP_Y);
    expect(closest).toBeLessThan(before * 0.95);
  });
});
