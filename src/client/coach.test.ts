import { describe, expect, it } from "vitest";
import { join, newLake, setCampfire, type Lake } from "../game/lake";
import { coachLine } from "./coach";

function family(): Lake {
  let l = newLake(1, 0);
  l = join(l, { name: "Dad", ogsId: null }).lake;
  l = join(l, { name: "Juneau", ogsId: null }).lake;
  return { ...l, swirls: [] };
}
const withMode = (l: Lake, seat: number, patch: Partial<Lake["fishers"][number]>): Lake => ({
  ...l,
  fishers: l.fishers.map((f) => (f.seat === seat ? { ...f, ...patch } : f)),
});

describe("coachLine", () => {
  it("calls out the kid's bite first", () => {
    expect(coachLine(withMode(family(), 1, { mode: "bite" }), 0, 10)).toBe("Juneau has a bite! Tell them: tap now!");
  });
  it("skips coaching an easy fisher (the game hooks for them)", () => {
    expect(coachLine(withMode(family(), 1, { mode: "bite", easy: true }), 0, 10)).not.toContain("bite");
  });
  it("coaches the reel", () => {
    expect(coachLine(withMode(family(), 1, { mode: "reel" }), 0, 10)).toContain("Juneau is reeling");
  });
  it("announces a new fish with the journal count", () => {
    const l = withMode({ ...family(), journal: { "golden-koi": { count: 1, bestCm: 40, firstBy: "Juneau" } } }, 1, {
      mode: "catch",
      catch: { fishId: "golden-koi", cm: 40, shells: 4, isNew: true, golden: false, at: 0, seq: 1 },
    });
    expect(coachLine(l, 0, 100)).toBe("New fish! Juneau caught a Golden Koi. That's 1 of 18 in the journal.");
  });
  it("calls the golden swirl", () => {
    const l = { ...family(), swirls: [{ id: 1, pos: { x: 0, z: 0 }, theta: Math.PI, golden: true, since: 0, until: 1e9, catches: 0 }] };
    expect(coachLine(l, 0, 0)).toBe("A golden swirl by the lily pads! Race there, everyone!");
  });
  it("says how far the next rod is", () => {
    expect(coachLine(family(), 0, 0)).toBe("20 more shells for everyone's Bamboo rod.");
  });
  it("says it's campfire time", () => {
    expect(coachLine(setCampfire(family(), true, 1), 0, 2)).toContain("Campfire");
  });
});
