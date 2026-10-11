import { describe, expect, it } from "vitest";
import { SLAP_AT, tailPose } from "./escape";

describe("escape: a missed fish waves its tail and dives (round 22, friendly, not a fin)", () => {
  it("starts under the water, is fully up through the lab's miss moment (0.38-0.52 s), and is gone by the end", () => {
    expect(tailPose(0).rise).toBe(0);
    for (const a of [0.38, 0.45, 0.52]) expect(tailPose(a).rise).toBeGreaterThan(0.9);
    expect(tailPose(SLAP_AT + 0.32).rise).toBeLessThan(0.01);
  });

  it("waggles side to side while up (both ways), and only tips back once it slaps", () => {
    const sw = Array.from({ length: 40 }, (_, i) => tailPose(0.16 + (i / 40) * (SLAP_AT - 0.16)).swish);
    expect(Math.max(...sw)).toBeGreaterThan(0.3);
    expect(Math.min(...sw)).toBeLessThan(-0.3);
    expect(tailPose(SLAP_AT - 0.01).lean).toBe(0);
    expect(tailPose(SLAP_AT + 0.2).lean).toBeGreaterThan(0.3);
  });

  it("slaps after the hero window, so the lab's still shows the tail up", () => {
    expect(SLAP_AT).toBeGreaterThan(0.52);
  });
});
