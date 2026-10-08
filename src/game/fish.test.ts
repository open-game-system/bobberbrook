import { describe, expect, it } from "vitest";
import { FISH, FISH_IDS, JOURNAL_FISH, bitesNow, fishById } from "./fish";

describe("the fish", () => {
  it("lists every catch by id", () => {
    expect(FISH_IDS).toEqual(FISH.map((f) => f.id));
    expect(FISH_IDS).toContain("chest");
    expect(fishById("perch")?.name).toBe("Stripy Perch");
    expect(fishById("nope")).toBeUndefined();
  });
  it("keeps junk and treasure out of the journal (18 species to find)", () => {
    expect(JOURNAL_FISH).toHaveLength(18);
    expect(JOURNAL_FISH.map((f) => f.id)).not.toContain("boot");
    expect(JOURNAL_FISH.map((f) => f.id)).not.toContain("chest");
    expect(JOURNAL_FISH.map((f) => f.id)).toContain("moonfin");
  });
  it("lets each fish bite at its time of day", () => {
    const at = (id: string) => (["morning", "golden", "night", "dawn"] as const).filter((tod) => bitesNow(fishById(id)!, tod));
    expect(at("perch")).toEqual(["morning", "golden", "night", "dawn"]);
    expect(at("rainbow-trout")).toEqual(["morning", "golden", "dawn"]);
    expect(at("golden-koi")).toEqual(["golden"]);
    expect(at("moonfin")).toEqual(["night"]);
    expect(at("glowfin")).toEqual(["morning", "golden", "night", "dawn"]); // always glowing in the Hollow
  });
});
