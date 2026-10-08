import { describe, expect, it } from "vitest";
import { journalPages } from "./journalPages";

describe("journal pages", () => {
  it("has a page per place, in valley order, found or not", () => {
    const pages = journalPages(["moonwell", "hollow"]);
    expect(pages.map((p) => [p.area, p.found])).toEqual([["moonwell", true], ["mistmarsh", false], ["pools", false], ["hollow", true], ["tarn", false]]);
  });
  it("puts each fish where it lives", () => {
    const by = Object.fromEntries(journalPages([]).map((p) => [p.area, p.fish.map((f) => f.id)]));
    expect(by.mistmarsh).toContain("golden-koi");
    expect(by.tarn).toContain("moonfin");
    expect(by.moonwell).not.toContain("moonfin");
    expect(by.hollow).toContain("glowfin");
    expect(by.pools).toContain("salmon");
  });
});
