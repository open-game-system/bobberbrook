import { describe, expect, it } from "vitest";
import { BOARD_MS } from "../game/lake";
import { boardingProgress, todChanged } from "./tvHud";

describe("boardingProgress", () => {
  it("fills from 0 to 1 over the boarding wait, and is null when nobody is boarding", () => {
    expect(boardingProgress(null, 5000)).toBeNull();
    expect(boardingProgress({ platformId: "p", since: 1000 }, 1000)).toBe(0);
    expect(boardingProgress({ platformId: "p", since: 1000 }, 1000 + BOARD_MS / 2)).toBeCloseTo(0.5);
    expect(boardingProgress({ platformId: "p", since: 1000 }, 1000 + BOARD_MS * 2)).toBe(1);
  });
});

describe("todChanged", () => {
  it("announces a new time of day, not the first one seen", () => {
    expect(todChanged(null, "morning")).toBeNull();
    expect(todChanged("morning", "morning")).toBeNull();
    expect(todChanged("morning", "golden")).toBe("golden");
  });
});
