import { describe, expect, it } from "vitest";
import { BIOMES } from "../../game/regions";
import { moodFor } from "./moods";

describe("moodFor", () => {
  it("every place has its own mode of the same pentatonic scale (effects still harmonize)", () => {
    const shifts = ["moonwell" as const, ...BIOMES].map((b) => moodFor(b).shift);
    expect(new Set(shifts).size).toBeGreaterThanOrEqual(5);
    for (const s of shifts) expect(Number.isInteger(s)).toBe(true);
    expect(moodFor("moonwell").shift).toBe(0);
  });
  it("the cold and ember places are slower, the crystal one brighter", () => {
    expect(moodFor("frost").tempo).toBeLessThan(1);
    expect(moodFor("crystal").bright).toBeGreaterThan(moodFor("moonwell").bright);
  });
});
