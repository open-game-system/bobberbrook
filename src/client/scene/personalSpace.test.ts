import { describe, expect, it } from "vitest";
import { SPACE, spaceOut, type Spot } from "./personalSpace";

const spot = (seat: number, x: number, z: number): Spot => ({ seat, x, z, ox: 0, oz: 0 });
const gap = (a: Spot, b: Spot) => Math.hypot(a.x + a.ox - b.x - b.ox, a.z + a.oz - b.z - b.oz);

describe("spaceOut (round 20: four fishers set down on one spot by the rules read as four on the TV)", () => {
  it("leaves fishers already apart where they are", () => {
    const s = [spot(0, 0, 0), spot(1, 3, 0)];
    spaceOut(s);
    expect(s.every((p) => p.ox === 0 && p.oz === 0)).toBe(true);
  });
  it("opens two close fishers to SPACE, each moving half, along the line between them", () => {
    const s = [spot(0, 0, 0), spot(1, 0.6, 0)];
    spaceOut(s);
    expect(gap(s[0]!, s[1]!)).toBeCloseTo(SPACE, 5);
    expect(s[0]!.ox).toBeCloseTo(-(SPACE - 0.6) / 2, 5);
    expect(s[0]!.oz).toBeCloseTo(0, 5);
  });
  it("splits a pair on the very same spot", () => {
    const s = [spot(1, 2, 2), spot(2, 2, 2)];
    spaceOut(s);
    expect(gap(s[0]!, s[1]!)).toBeGreaterThan(SPACE * 0.95);
  });
  it("spreads the arrival huddle (the rules' 0.9 m ring) so every pair is nearly SPACE apart", () => {
    const s = [0, 1, 2, 3].map((i) => spot(i, Math.cos(i * 1.7) * 0.9, Math.sin(i * 1.7) * 0.9));
    spaceOut(s);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(gap(s[i]!, s[j]!)).toBeGreaterThan(SPACE * 0.85);
    // Nobody is flung far: offsets stay under a body or so.
    for (const p of s) expect(Math.hypot(p.ox, p.oz)).toBeLessThan(1.2);
  });
});
