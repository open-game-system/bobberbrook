import { describe, expect, it } from "vitest";
import { readColor, writeColor } from "./colorPref";
import type { KeyValue } from "./progressStore";

const mem = (): KeyValue => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe("colour preference", () => {
  it("remembers a seat colour", () => {
    const s = mem();
    expect(readColor(s)).toBeNull();
    writeColor(s, "blue");
    expect(readColor(s)).toBe("blue");
  });
  it("ignores anything that isn't a seat colour", () => {
    const s = mem();
    s.setItem("bobberbrook:color", "purple");
    expect(readColor(s)).toBeNull();
    expect(readColor(null)).toBeNull();
  });
});
