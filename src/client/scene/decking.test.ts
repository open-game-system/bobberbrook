import { describe, expect, it } from "vitest";
import { BoxGeometry, Color } from "three";
import { PLANK_BOARDS, disc, discProfile, plankUV, surfBy } from "./decking";
import { prep } from "./geo";
import { PK, PK_UV } from "./painter";

describe("plankUV", () => {
  it("lays one painted board along the plank, its edges on the plank's edges", () => {
    const g = plankUV(prep(new BoxGeometry(2, 0.1, 0.34)), 2, 0.34, 2, 0.25);
    const a = g.getAttribute("aPaint");
    const [v0, v1] = PLANK_BOARDS[2]!;
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (let i = 0; i < a.count; i++) {
      expect(a.getX(i)).toBe(PK_UV + PK.planks);
      uMin = Math.min(uMin, a.getY(i));
      uMax = Math.max(uMax, a.getY(i));
      vMin = Math.min(vMin, a.getZ(i));
      vMax = Math.max(vMax, a.getZ(i));
    }
    expect(vMin).toBeCloseTo(v0, 5);
    expect(vMax).toBeCloseTo(v1, 5);
    expect(uMin).toBeCloseTo(0.25, 5);
    expect(uMax - uMin).toBeCloseTo(2 / 2.8, 5);
  });

  it("wraps any board index into the strips", () => {
    const g = plankUV(prep(new BoxGeometry(1, 0.1, 0.3)), 1, 0.3, -1, 0);
    const a = g.getAttribute("aPaint");
    const [v0, v1] = PLANK_BOARDS[PLANK_BOARDS.length - 1]!;
    for (let i = 0; i < a.count; i++) {
      expect(a.getZ(i)).toBeGreaterThanOrEqual(v0 - 1e-6);
      expect(a.getZ(i)).toBeLessThanOrEqual(v1 + 1e-6);
    }
  });
});

describe("surfBy", () => {
  it("gives every triangle one kind, picked by its face normal", () => {
    const g = surfBy(prep(new BoxGeometry(1, 1, 1)), (_c, n) => (n.y > 0.5 ? PK.moss : PK.rock));
    const a = g.getAttribute("aPaint");
    const pos = g.getAttribute("position");
    let tops = 0;
    for (let t = 0; t < a.count; t += 3) {
      const k = a.getX(t);
      expect(a.getX(t + 1)).toBe(k);
      expect(a.getX(t + 2)).toBe(k);
      const isTop = pos.getY(t) > 0.49 && pos.getY(t + 1) > 0.49 && pos.getY(t + 2) > 0.49;
      expect(k).toBe(isTop ? PK.moss : PK.rock);
      if (isTop) tops++;
    }
    expect(tops).toBe(2);
  });
});

describe("disc", () => {
  it("turns a profile from the top centre out over a lip and down to the foot", () => {
    const p = discProfile({ r: 2, top: 0.4, bottom: -0.2, lip: 0.2, flare: 0.1, rings: 3 });
    expect(p[0]!.x).toBeLessThan(0.01);
    expect(p[0]!.y).toBe(0.4);
    for (let i = 1; i < p.length; i++) {
      expect(p[i]!.x).toBeGreaterThanOrEqual(p[i - 1]!.x);
      expect(p[i]!.y).toBeLessThanOrEqual(p[i - 1]!.y);
    }
    expect(p.at(-1)!.y).toBe(-0.2);
    expect(p.at(-1)!.x).toBeCloseTo(2.1, 6);
  });

  it("paints the lip apart from the top and the foot", () => {
    const seen = { lip: 0, top: 0, foot: 0 };
    disc({ r: 1, top: 0.3, bottom: 0, lip: 0.15 }, 8, (_rho, h, lip, out) => {
      if (lip) seen.lip++;
      else if (h > 0.99) seen.top++;
      else seen.foot++;
      out.set(new Color(1, 1, 1));
    });
    expect(seen.lip).toBeGreaterThan(0);
    expect(seen.top).toBeGreaterThan(0);
    expect(seen.foot).toBeGreaterThan(0);
  });
});
