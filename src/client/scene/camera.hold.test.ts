import { describe, expect, it } from "vitest";
import { CameraRig, catchWeight, rampAt, type CatchAt } from "./camera";

/**
 * Round 26 (round 25 session 84 -> 84.7 s: the catch push pulled out abruptly; 262-280 s at Mistmarsh, two
 * catches together): the push holds at full for 2.5 s, eases out over a second, and a catch landing while the
 * last push eases out picks it up where it is.
 */
type P = [number, number];
const FAMILY: P[] = [[0, 0], [3, 0.5]];

function frame(rig: CameraRig, t: number, catchAt: CatchAt | null): void {
  rig.beginFocus();
  for (const [x, z] of FAMILY) {
    rig.addFocus(x, 0.4, z);
    rig.addFisher(x, z);
  }
  rig.update(t, 1 / 60, false, catchAt);
}

describe("the catch push's timeline", () => {
  it("holds at full weight for at least 2.5 s and takes a second to ease out", () => {
    let full = 0;
    for (let a = 0; a < 5; a += 0.01) if (catchWeight(a) === 1) full += 0.01;
    expect(full).toBeGreaterThanOrEqual(2.5);
    expect(catchWeight(3.4 + 0.5)).toBeGreaterThan(0.3);
    expect(catchWeight(4.4)).toBe(0);
  });
  it("rampAt inverts the way in", () => {
    for (const w of [0.1, 0.5, 0.9]) expect(catchWeight(rampAt(w))).toBeCloseTo(w, 3);
  });
  it("in the rig: full push for 2.5 s, no step on the way out", () => {
    const rig = new CameraRig(16 / 9);
    const ws: number[] = [];
    for (let i = 0; i < 60 * 12; i++) {
      const t = i / 60;
      // The scene drops the catch focus at ~3.1 s; the rig carries on on its own clock.
      frame(rig, t, t >= 5 && t < 8.1 ? { x: 0, y: 2.2, z: 0, age: t - 5 } : null);
      if (t >= 5) ws.push(rig.debug().catchW);
    }
    expect(ws.filter((w) => w > 0.999).length / 60).toBeGreaterThanOrEqual(2.5);
    for (let i = 1; i < ws.length; i++) expect(Math.abs(ws[i]! - ws[i - 1]!)).toBeLessThan(0.05);
  });
  it("a second catch while the first push eases out continues it, never dropping back to nothing", () => {
    const rig = new CameraRig(16 / 9);
    const ws: number[] = [];
    for (let i = 0; i < 60 * 14; i++) {
      const t = i / 60;
      const first = t >= 5 && t < 8.1 ? { x: 0, y: 2.2, z: 0, age: t - 5 } : null;
      const second = t >= 8.9 && t < 12 ? { x: 3, y: 2.2, z: 0.5, age: t - 8.9 } : null;
      frame(rig, t, first ?? second);
      if (t >= 5 && t < 12) ws.push(rig.debug().catchW);
    }
    expect(Math.min(...ws.slice(60))).toBeGreaterThan(0.5);
    for (let i = 1; i < ws.length; i++) expect(Math.abs(ws[i]! - ws[i - 1]!)).toBeLessThan(0.05);
  });
  it("a second catcher joining during the hold (the scene's age steps back to theirs) holds the push 2.5 s more", () => {
    const rig = new CameraRig(16 / 9);
    const ws: [number, number][] = [];
    for (let i = 0; i < 60 * 16; i++) {
      const t = i / 60;
      // Dad's catch at 5 s; Juneau's at 7 s while Dad's fish is still up (fishers.ts catchFocus: the latest age).
      const catchAt = t >= 5 && t < 10.1 ? { x: t < 7 ? 0 : 1.5, y: 2.2, z: 0, age: t < 7 ? t - 5 : t - 7 } : null;
      frame(rig, t, catchAt);
      if (t >= 5) ws.push([t, rig.debug().catchW]);
    }
    // Full from ~5.9 s and for 2.5 s after Juneau's catch, never easing out in between.
    for (const [t, w] of ws) if (t > 6 && t < 9.45) expect(w, `at ${t.toFixed(2)} s`).toBeGreaterThan(0.999);
    expect(ws.find(([t]) => t > 10.6)?.[1]).toBeLessThan(0.01);
  });
});
