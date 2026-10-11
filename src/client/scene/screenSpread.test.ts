import { describe, expect, it } from "vitest";
import { ASHORE_STEP, LINE_SIDE, ashoreOffset, spreadAcross } from "./screenSpread";
import type { Spot } from "./personalSpace";

const spot = (seat: number, x: number, z: number): Spot => ({ seat, x, z, ox: 0, oz: 0 });
// The camera looks north (-z): its right is +x.
const FWD = { x: 0, z: -1 };
const side = (a: Spot, b: Spot) => Math.abs(a.x + a.ox - b.x - b.ox);

describe("spreadAcross (round 21: fishers on a dock never line up on the camera axis)", () => {
  it("opens two fishers standing one behind the other into LINE_SIDE side by side on screen", () => {
    const s = [spot(2, 0, 0), spot(0, 0.2, -2.5)];
    spreadAcross(s, FWD);
    expect(side(s[0]!, s[1]!)).toBeGreaterThanOrEqual(LINE_SIDE - 1e-6);
    // Each moves half, sideways only.
    expect(s[0]!.oz).toBeCloseTo(0);
    expect(s[1]!.oz).toBeCloseTo(0);
    expect(Math.abs(s[0]!.ox)).toBeCloseTo(Math.abs(s[1]!.ox));
  });

  it("leaves fishers already side by side, and a pair far apart in depth", () => {
    const s = [spot(0, 0, 0), spot(1, 1.6, -1)];
    spreadAcross(s, FWD);
    expect(s.every((p) => p.ox === 0 && p.oz === 0)).toBe(true);
    const far = [spot(0, 0, 0), spot(1, 0, -9)];
    spreadAcross(far, FWD);
    expect(far.every((p) => p.ox === 0 && p.oz === 0)).toBe(true);
  });

  it("works for any camera heading", () => {
    // Looking east (+x): right is +z; two in line along x.
    const s = [spot(0, 0, 0), spot(1, 2, 0.1)];
    spreadAcross(s, { x: 1, z: 0 });
    expect(Math.abs(s[0]!.z + s[0]!.oz - s[1]!.z - s[1]!.oz)).toBeGreaterThanOrEqual(LINE_SIDE - 1e-6);
  });

  it("keeps a fisher on a walk on it: the push goes along the walk", () => {
    // A boardwalk running north-east; the fisher on it slides along it, the one ashore sideways.
    const t = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
    const s = [spot(2, 0, 0), spot(0, 0, -2.5)];
    spreadAcross(s, FWD, (x, z) => (z < -1 ? t : null));
    const o = s[1]!;
    // Offset parallel to the walk (cross product ~0).
    expect(Math.abs(o.ox * t.z - o.oz * t.x)).toBeLessThan(1e-6);
    expect(side(s[0]!, s[1]!)).toBeGreaterThan(LINE_SIDE * 0.9);
  });

  it("never flings anyone far (offsets capped)", () => {
    const s = [0, 1, 2, 3].map((i) => spot(i, 0.05 * i, -1.2 * i));
    spreadAcross(s, FWD);
    for (const p of s) expect(Math.hypot(p.ox, p.oz)).toBeLessThanOrEqual(1.6 + 1e-6);
  });
});

describe("ashoreOffset (round 21: riders step ashore side by side across the screen)", () => {
  it("lines n riders up across the view, centred, ASHORE_STEP apart", () => {
    const right = { x: 0, z: 2 };
    const pts = [0, 1, 2, 3].map((i) => ashoreOffset(i, 4, right));
    expect(pts.reduce((a, p) => a + p.z, 0)).toBeCloseTo(0);
    for (const p of pts) expect(p.x).toBeCloseTo(0);
    for (let i = 1; i < 4; i++) expect(pts[i]!.z - pts[i - 1]!.z).toBeCloseTo(ASHORE_STEP);
    expect(ashoreOffset(0, 1, right)).toEqual({ x: 0, z: 0 });
  });
});
