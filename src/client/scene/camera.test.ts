import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig } from "./camera";

/** Runs the group camera for a while on a fixed family (feet positions) and returns it settled. */
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

// The family spread round the Moonwell (round 08's moonwell shot): Dad west, Juneau on the dock, Mom east.
const SPREAD: [number, number, number][] = [
  [-22, 0.4, 6],
  [0, 0.6, -2],
  [20, 0.4, 8],
];
const HUDDLE: [number, number, number][] = [
  [-2, 0.4, 4],
  [1, 0.4, 3],
  [3, 0.4, 5],
];

describe("group camera framing", () => {
  for (const [name, fam] of [["spread", SPREAD], ["huddled", HUDDLE]] as const) {
    it(`keeps every ${name} fisher (feet to name tag) on screen with margin`, () => {
      const rig = settle([...fam]);
      for (const [x, y, z] of fam) {
        for (const lift of [-0.7, 4.0]) {
          const p = ndc(rig, x, y + lift, z);
          expect(Math.abs(p.x)).toBeLessThan(0.92);
          expect(p.y).toBeGreaterThan(-0.92);
          expect(p.y).toBeLessThan(0.75);
        }
      }
    });

    it(`keeps the foreground below the ${name} fishers short (feet in the lower part of the frame)`, () => {
      const rig = settle([...fam]);
      const lowest = Math.min(...fam.map(([x, y, z]) => ndc(rig, x, y - 0.7, z).y));
      // Round 08 put the lowest feet at NDC -0.5 (a quarter of the frame of foreground carpet below them).
      expect(lowest).toBeLessThan(-0.62);
    });

    it(`frames the ${name} family lower and closer than the old high three-quarter`, () => {
      const rig = settle([...fam]);
      const cam = rig.camera.position;
      const t = rig.focus;
      const el = Math.atan2(cam.y - t.y, Math.hypot(cam.x - t.x, cam.z - t.z));
      expect(el).toBeLessThan(0.4);
      expect(el).toBeGreaterThan(0.22);
    });
  }

  it("still looks north from the south (north is up on the joystick)", () => {
    const rig = settle([...SPREAD]);
    const cam = rig.camera.position;
    const t = rig.focus;
    expect(cam.z).toBeGreaterThan(t.z);
    expect(Math.abs(cam.x - t.x)).toBeLessThan(0.5);
  });

  it("keeps every fisher inside a 10% safe margin, settled and through a catch push-in", () => {
    // Round 09 moonwell: Mom stood at the edge of frame; night-tarn: Dad left the frame on Juneau's catch.
    const fam = SPREAD;
    const rig = new CameraRig(16 / 9);
    const check = () => {
      for (const [x, y, z] of fam) {
        for (const lift of [-0.7, 4.0]) {
          const p = ndc(rig, x, y + lift, z);
          expect(Math.abs(p.x)).toBeLessThan(0.8);
          expect(p.y).toBeGreaterThan(-0.8);
          expect(p.y).toBeLessThan(0.8);
        }
      }
    };
    for (let i = 0; i < 900; i++) {
      rig.beginFocus();
      for (const [x, y, z] of fam) rig.addFocus(x, y, z);
      // A catch by the fisher on the east bank from 10 s to 13.3 s.
      const t = i / 60;
      const catchAt = t >= 10 && t < 13.3 ? { x: 20, y: 2.2, z: 8, age: t - 10 } : null;
      rig.update(t, 1 / 60, false, catchAt);
      if (i >= 540) check();
    }
  });
});
