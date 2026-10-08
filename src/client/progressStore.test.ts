import { describe, expect, it } from "vitest";
import { readProgress, writeProgress, type KeyValue } from "./progressStore";

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("progress on the host phone", () => {
  it("round-trips", () => {
    const s = memory();
    const p = { journal: { perch: { count: 2, bestCm: 20, firstBy: "Dad" } }, shells: 7 };
    writeProgress(s, p);
    expect(readProgress(s)).toEqual(p);
  });
  it("ignores missing, broken or wrong-shaped saves", () => {
    const s = memory();
    expect(readProgress(s)).toBeNull();
    s.data.set("bobberbrook:progress:v1", "{nope");
    expect(readProgress(s)).toBeNull();
    s.data.set("bobberbrook:progress:v1", JSON.stringify({ shells: -1, journal: {} }));
    expect(readProgress(s)).toBeNull();
    expect(readProgress(null)).toBeNull();
  });
  it("survives a store that throws", () => {
    const bad: KeyValue = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readProgress(bad)).toBeNull();
    expect(() => writeProgress(bad, { journal: {}, shells: 1 })).not.toThrow();
  });
});
