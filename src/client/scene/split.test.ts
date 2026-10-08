import { describe, expect, it } from "vitest";
import { SplitFocus, type Member } from "./split";

const m = (seat: number, x: number, z: number, activity: Member["activity"] = "idle", inputAt = 0, place: string | null = null): Member => ({ seat, x, z, activity, inputAt, place });

describe("SplitFocus", () => {
  it("frames everyone when the family is together", () => {
    const s = new SplitFocus();
    const r = s.update([m(0, 0, 0, "line"), m(1, 10, 0), m(2, 4, 8)], 0);
    expect(r.split).toBe(false);
    expect([...r.framed]).toEqual([0, 1, 2]);
  });

  it("frames the fisher with a line in the water when the family is spread", () => {
    const s = new SplitFocus();
    const r = s.update([m(0, -25, 0), m(2, 5, 0, "line")], 0);
    expect(r.split).toBe(true);
    expect([...r.framed]).toEqual([2]);
    expect(r.lead).toBe(2);
  });

  it("keeps the lead's neighbours in the shot", () => {
    const s = new SplitFocus();
    const r = s.update([m(0, -30, 0), m(1, 0, 0, "line"), m(2, 6, 3)], 0);
    expect([...r.framed].sort()).toEqual([1, 2]);
  });

  it("with nobody fishing, frames the most recent mover", () => {
    const s = new SplitFocus();
    const r = s.update([m(0, -25, 0, "idle", 900), m(1, 5, 0, "idle", 200)], 1000);
    expect(r.lead).toBe(0);
  });

  it("a bite elsewhere takes the camera at once", () => {
    const s = new SplitFocus();
    s.update([m(0, -25, 0, "line"), m(1, 5, 0, "line")], 0);
    const r = s.update([m(0, -25, 0, "line"), m(1, 5, 0, "hot")], 300);
    expect(r.lead).toBe(1);
  });

  it("does not flick between two equal places", () => {
    const s = new SplitFocus();
    const a = s.update([m(0, -25, 0, "line", 0), m(1, 5, 0, "line", 0)], 0);
    const b = s.update([m(0, -25, 0, "line", 0), m(1, 5, 0, "line", 0.5)], 0.6);
    expect(b.lead).toBe(a.lead);
  });

  it("only regroups once the family has come back together (hysteresis)", () => {
    const s = new SplitFocus();
    expect(s.update([m(0, -25, 0), m(1, 0, 0, "line")], 0).split).toBe(true);
    expect(s.update([m(0, -20, 0), m(1, 0, 0, "line")], 100).split).toBe(true);
    expect(s.update([m(0, -14, 0), m(1, 0, 0, "line")], 200).split).toBe(false);
  });

  it("never splits a family round the same pond, however wide it is", () => {
    const s = new SplitFocus();
    const r = s.update([m(0, -17, 0, "line", 0, "moonwell"), m(1, 17, 0, "line", 0, "moonwell"), m(2, 0, 17, "idle", 0, "moonwell")], 0);
    expect(r.split).toBe(false);
    expect(r.framed.size).toBe(3);
  });

  it("an empty or single family is never split", () => {
    const s = new SplitFocus();
    expect(s.update([], 0).split).toBe(false);
    expect(s.update([m(3, 40, 40)], 0).split).toBe(false);
  });
});
