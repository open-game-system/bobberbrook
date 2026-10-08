import { describe, expect, it } from "vitest";
import { journalPages } from "./journalPages";

describe("journal chapters", () => {
  it("has a chapter per kind of place, opened by finding one", () => {
    const pages = journalPages(["moonwell", "hollow"], 1);
    expect(pages.map((p) => p.biome)).toEqual(["moonwell", "marsh", "pools", "hollow", "tarn", "willow", "crystal", "ember", "frost"]);
    expect(pages.filter((p) => p.found).map((p) => p.biome)).toEqual(["moonwell", "hollow"]);
  });
  it("puts each fish where it lives", () => {
    const by = Object.fromEntries(journalPages([], 1).map((p) => [p.biome, p.fish.map((f) => f.id)]));
    expect(by.marsh).toContain("golden-koi");
    expect(by.tarn).toContain("moonfin");
    expect(by.frost).toContain("aurora-char");
    expect(by.crystal).toContain("geode-puffer");
    expect(by.moonwell).not.toContain("moonfin");
  });
});
