import { describe, expect, it } from "vitest";
import { DAY_MS, DAY_START, dayPhase, timeOfDay } from "./daycycle";

describe("the day", () => {
  it("starts mid-morning and wraps round after a full day", () => {
    expect(dayPhase(1000, 1000)).toBe(DAY_START);
    expect(dayPhase(1000, 1000 + DAY_MS / 2)).toBeCloseTo(DAY_START + 0.5, 9);
    expect(dayPhase(1000, 1000 + DAY_MS)).toBeCloseTo(DAY_START, 9);
    expect(dayPhase(1000, 1000 + 0.95 * DAY_MS)).toBeCloseTo(0.03, 9);
  });
  it("never runs backwards from the start", () => {
    expect(dayPhase(1000, 0)).toBe(DAY_START);
  });
  it("goes morning, golden hour, night, dawn", () => {
    expect(timeOfDay(0)).toBe("morning");
    expect(timeOfDay(0.3599)).toBe("morning");
    expect(timeOfDay(0.36)).toBe("golden");
    expect(timeOfDay(0.4999)).toBe("golden");
    expect(timeOfDay(0.5)).toBe("night");
    expect(timeOfDay(0.8599)).toBe("night");
    expect(timeOfDay(0.86)).toBe("dawn");
    expect(timeOfDay(0.999)).toBe("dawn");
  });
});
