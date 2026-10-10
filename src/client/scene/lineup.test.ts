import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig } from "./camera";
import { Lineup, hidden } from "./lineup";

const EL = 0.32;

describe("lineup: one fisher behind another on the camera axis", () => {
  it("scores nobody hidden for a family side by side", () => {
    expect(hidden([{ x: -2, z: 0 }, { x: 0, z: 0 }, { x: 2, z: 0 }], 0, EL)).toBe(0);
  });

  it("scores a fisher straight behind another (the camera looks north from the south)", () => {
    expect(hidden([{ x: 0, z: 0 }, { x: 0, z: -1.5 }], 0, EL)).toBeGreaterThan(0.4);
  });

  it("leaves the yaw alone when nobody is hidden, and for a lone fisher", () => {
    const l = new Lineup();
    expect(l.update([{ x: -2, z: 0 }, { x: 2, z: 0 }], 0, EL).yaw).toBe(0);
    expect(new Lineup().update([{ x: 0, z: 0 }], 0, EL).yaw).toBe(0);
  });

  it("yaws slightly (never more than 0.5 rad) so both fishers of a pair read", () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -1.5 }];
    const out = new Lineup().update(pts, 0, EL);
    expect(Math.abs(out.yaw)).toBeGreaterThan(0.15);
    expect(Math.abs(out.yaw)).toBeLessThanOrEqual(0.5);
    expect(hidden(pts, out.yaw, EL + out.el)).toBeLessThan(hidden(pts, 0, EL) * 0.5);
  });

  it("keeps its choice while the family barely moves (no flip-flop between left and right)", () => {
    const l = new Lineup();
    const first = l.update([{ x: 0, z: 0 }, { x: 0, z: -1.5 }], 0, EL).yaw;
    for (let i = 0; i < 20; i++) {
      const wob = Math.sin(i) * 0.05;
      expect(Math.sign(l.update([{ x: wob, z: 0 }, { x: -wob, z: -1.5 }], 0, EL).yaw)).toBe(Math.sign(first));
    }
  });
});

describe("group camera with a fisher behind another", () => {
  it("shows both heads apart on screen", () => {
    const feet: [number, number, number][] = [[0, 0.4, 2], [0, 0.4, 0.4]];
    const rig = new CameraRig(16 / 9);
    for (let i = 0; i < 900; i++) {
      rig.beginFocus();
      for (const [x, y, z] of feet) {
        rig.addFocus(x, y, z);
        rig.addFisher(x, z);
      }
      rig.update(i / 60, 1 / 60, false, null);
    }
    rig.camera.updateMatrixWorld(true);
    const head = (x: number, y: number, z: number) => new Vector3(x, y + 1.6, z).project(rig.camera);
    const a = head(...feet[0]!);
    const b = head(...feet[1]!);
    // A head is ~0.8 m wide; at this distance that is ~0.05 NDC. Apart by at least most of a head.
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.035);
  });
});

describe("lineup: a tower deck between the camera and the family (round 14)", () => {
  it("counts a fisher seen through a deck, not one standing on it or beside it", async () => {
    const { blocked } = await import("./lineup");
    const deck = [{ x: 0, z: 6, r: 6.4 }];
    // The camera looks north from the south (yaw 0): the deck straight between it and Juneau.
    expect(blocked([{ x: 0, z: -2 }], deck, 0, 20)).toBeGreaterThan(0.9);
    expect(blocked([{ x: 0, z: 6 }], deck, 0, 20)).toBe(0);
    expect(blocked([{ x: 12, z: -2 }], deck, 0, 20)).toBe(0);
  });

  it("yaws away so the family is not seen through the deck", () => {
    const deck = [{ x: 4, z: 7, r: 6.4 }];
    const pts = [{ x: -1, z: -1 }, { x: 2, z: -1.5 }];
    const out = new Lineup().update(pts, 0, EL, 2, deck, 18);
    expect(Math.abs(out.yaw)).toBeGreaterThan(0.05);
  });

  it("leaves the yaw alone with no blocker in the way", () => {
    const out = new Lineup().update([{ x: -2, z: 0 }, { x: 2, z: 0 }], 0, EL, 2, [{ x: 0, z: -30, r: 6.4 }], 18);
    expect(out.yaw).toBe(0);
  });
});
