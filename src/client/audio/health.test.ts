import { describe, expect, it } from "vitest";
import { audioStalled } from "./health";

describe("audioStalled", () => {
  it("a running context whose clock keeps up with the wall clock is healthy", () => {
    expect(audioStalled({ state: "running", advanced: 1.9, wall: 2 })).toBe(false);
  });
  it("a context that isn't running, or whose clock barely moves, is stalled (nothing reaches the speakers)", () => {
    expect(audioStalled({ state: "suspended", advanced: 0, wall: 2 })).toBe(true);
    expect(audioStalled({ state: "running", advanced: 0.01, wall: 2 })).toBe(true);
  });
  it("no context yet (sound not started) is not reported as stalled", () => {
    expect(audioStalled(null)).toBe(false);
  });
});
