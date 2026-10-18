import { describe, expect, it } from "vitest";
import { join, newLake, setCampfire, type Lake } from "../game/lake";
import { catchLine, coachLine } from "./coach";
import { worldFor } from "../game/regions";

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
  it("tells the host about their own bite first", () => {
    expect(coachLine(withMode(withMode(family(), 0, { mode: "bite" }), 1, { mode: "bite" }), 0, 10)).toBe("Your bobber dipped: tap now!");
  });
  it("calls out the kid's bite first", () => {
    expect(coachLine(withMode(family(), 1, { mode: "bite" }), 0, 10)).toBe("Juneau has a bite! Tell them: tap now!");
  });
  it("skips coaching an easy fisher (the game hooks for them)", () => {
    expect(coachLine(withMode(family(), 1, { mode: "bite", easy: true }), 0, 10)).not.toContain("bite");
  });
  it("says why a fish got away, for a moment after the miss (the kid's first)", () => {
    const missed = withMode(family(), 1, { mode: "wait", missAt: 1000 });
    expect(coachLine(missed, 0, 2000)).toBe("Juneau's fish got away: tap as soon as the bobber dips. Another one is coming!");
    expect(coachLine(withMode(family(), 0, { mode: "wait", missAt: 1000 }), 0, 2000)).toBe("Too slow, it got away! Tap the moment it dips. Another one is coming.");
    expect(coachLine(missed, 0, 1000 + 4500)).not.toContain("got away");
  });
  it("uses 'an' before a vowel: an Ember Perch, an Old Sturgeon", () => {
    expect(catchLine(family(), "Dad", { fishId: "ember-perch", isNew: false, cm: 20 })).toBe("Dad caught an Ember Perch, 20 cm.");
    expect(catchLine(family(), "Dad", { fishId: "sturgeon", isNew: true, cm: 99 })).toContain("Dad caught an Old Sturgeon");
  });
  it("when nothing is happening, alternates the rod tip with a prompt that gets Dad talking to the kid", () => {
    expect(coachLine(family(), 0, 15_000)).toMatch(/Juneau/);
    expect(coachLine(family(), 0, 15_000)).not.toMatch(/shells/);
    expect(coachLine(family(), 0, 30_000)).toMatch(/shells/);
  });
  it("my own fresh catch beats coaching the kid's reel (Dad's card is up)", () => {
    const l = withMode(withMode(family(), 0, { mode: "catch", catch: { fishId: "minnow", cm: 9, shells: 1, isNew: false, golden: false, at: 900, seq: 1 } }), 1, { mode: "reel" });
    expect(coachLine(l, 0, 1000)).toMatch(/^Dad caught/);
  });
  it("an unnamed kid is 'your fishing buddy' in a talk prompt, never a seat colour", () => {
    const l = withMode(family(), 1, { name: null });
    expect(coachLine(l, 0, 15_000)).toMatch(/your fishing buddy/);
    expect(coachLine(l, 0, 15_000)).not.toMatch(/Yellow|Green|Blue|Pink/);
  });
  it("coaches my own reel before any tip (round 22: 'Explore!' showed while Dad was mid-reel)", () => {
    const l = { ...withMode(family(), 0, { mode: "reel" }), catchSeq: 2 };
    expect(coachLine(l, 0, 10)).toBe("Hold to reel it in. Let go while it splashes!");
  });
  it("the kid's fish getting away is said at once, even while I reel (round 25: 11 s late)", () => {
    const l = withMode(withMode(family(), 0, { mode: "reel" }), 1, { mode: "wait", missAt: 1000 });
    expect(coachLine(l, 0, 1300)).toMatch(/^Juneau's fish got away/);
  });
  it("the kid's reel still comes before my own", () => {
    expect(coachLine(withMode(withMode(family(), 0, { mode: "reel" }), 1, { mode: "reel" }), 0, 10)).toContain("Juneau is reeling");
  });
  it("coaches the reel", () => {
    expect(coachLine(withMode(family(), 1, { mode: "reel" }), 0, 10)).toContain("Juneau is reeling");
  });
  it("announces a new fish with the journal count", () => {
    const l = withMode({ ...family(), journal: { "golden-koi": { count: 1, bestCm: 40, firstBy: "Juneau" } } }, 1, {
      mode: "catch",
      catch: { fishId: "golden-koi", cm: 40, shells: 4, isNew: true, golden: false, at: 0, seq: 1 },
    });
    expect(coachLine(l, 0, 100)).toBe("New fish! Juneau caught a Golden Koi. That's 1 of 30 in the journal.");
  });
  it("calls the golden swirl", () => {
    const l = { ...family(), swirls: [{ id: 1, area: "moonwell" as const, pos: { x: 0, z: 0 }, theta: Math.PI, golden: true, since: 0, until: 1e9, catches: 0 }] };
    expect(coachLine(l, 0, 0)).toBe("A golden swirl by the lily pads! Race there, everyone!");
  });
  it("says how far the next rod is", () => {
    expect(coachLine(family(), 0, 0)).toBe("12 more shells for everyone's Bamboo rod.");
  });
  it("says it's campfire time", () => {
    expect(coachLine(setCampfire(family(), true, 1), 0, 2)).toContain("Campfire");
  });

  it("names junk, treasure and repeat catches", () => {
    const l = family();
    expect(catchLine(l, "Juneau", { fishId: "boot", isNew: false, cm: 28 })).toBe("Juneau fished up an old boot! Silly.");
    expect(catchLine(l, "Juneau", { fishId: "teapot", isNew: false, cm: 16 })).toBe("Juneau fished up a little teapot! Silly.");
    expect(catchLine(l, "Juneau", { fishId: "chest", isNew: false, cm: 30 })).toBe("Juneau found a treasure chest full of shells!");
    expect(catchLine(l, "Dad", { fishId: "perch", isNew: false, cm: 22 })).toBe("Dad caught a Stripy Perch, 22 cm.");
  });
  it("gives a time-of-day tip at night and golden hour", () => {
    const at = (phase: number) => ({ ...family(), startedAt: 0, now: (phase - 0.08) * 12 * 60_000 });
    expect(coachLine(at(0.4), 0, 0)).toContain("Golden Koi");
    expect(coachLine(at(0.6), 0, 0)).toContain("glowing fish");
    const full = { ...at(0.6), journal: Object.fromEntries(["brook-trout", "perch", "bluegill", "minnow", "catfish", "lily-carp", "pike", "rainbow-trout", "bass", "golden-koi"].map((id) => [id, { count: 1, bestCm: 1, firstBy: null }])) };
    expect(coachLine(full, 0, 0)).toContain("Moonfin");
  });
  it("points at the swirls once the best rod is in hand", () => {
    expect(coachLine({ ...family(), rodTier: 3, shells: 200 }, 0, 0)).toBe("Fish the swirls: that's where the rare fish are.");
  });

  it("celebrates a newly found place with what lives there, when the TV shows it (round 23: 14 s early, still on the trail)", () => {
    const l = { ...family(), discovered: ["moonwell" as const, "mistmarsh" as const], discovery: { area: "mistmarsh" as const, seat: 1, at: 100, seq: 1 } };
    const mist = worldFor(l.worldSeed).placeById("mistmarsh")!;
    // Still on the trail (the family at Moonwell): not yet.
    expect(coachLine(l, 0, 200)).not.toContain("found Mistmarsh");
    // Arrived at the water: the line, as the TV reveals the place.
    const there = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: { x: mist.center.x + mist.pond.r + 1, z: mist.center.z } })) };
    expect(coachLine(there, 0, 3000)).toBe("Juneau found Mistmarsh! Golden Koi and Ember Shiners come out at golden hour.");
    // The TV reveals anyway after its wait: so does the coach; then it moves on.
    expect(coachLine(l, 0, 100 + 6500)).toContain("found Mistmarsh");
    expect(coachLine(there, 0, 100 + 12_500)).not.toContain("found Mistmarsh");
  });
  it("sends the family exploring once they've caught a couple here", () => {
    expect(coachLine({ ...family(), catchSeq: 2 }, 0, 0)).toBe("Explore! Follow a trail into the fog: every new place has its own fish. 1 place found so far.");
  });
  it("no 'Explore!' while someone is still fishing (round 24: it showed through Mistmarsh's last catches)", () => {
    expect(coachLine(withMode({ ...family(), catchSeq: 2 }, 1, { mode: "wait" }), 0, 0)).not.toMatch(/^Explore!/);
  });
  it("just arrived somewhere new: fish here first, no 'Explore!' until a couple of catches here (round 23)", () => {
    const found = { area: "mistmarsh" as const, seat: 1, at: 1000, seq: 1 };
    const arrived = { ...family(), catchSeq: 4, discovered: ["moonwell" as const, "mistmarsh" as const], discovery: found, log: [{ seat: 0, fishId: "minnow", cm: 9, isNew: false, at: 500 }] };
    expect(coachLine(arrived, 0, 40_000)).not.toMatch(/^Explore!/);
    const fished = { ...arrived, log: [...arrived.log, { seat: 0, fishId: "minnow", cm: 9, isNew: false, at: 20_000 }, { seat: 1, fishId: "minnow", cm: 9, isNew: false, at: 30_000 }] };
    expect(coachLine(fished, 0, 40_000)).toMatch(/^Explore!/);
  });
  it("names the far place a golden swirl is in", () => {
    const l = { ...family(), swirls: [{ id: 2, area: "hollow" as const, pos: { x: 70, z: -8 }, theta: 0, golden: true, since: 0, until: 1e9, catches: 0 }] };
    expect(coachLine(l, 0, 0)).toBe("A golden swirl at Glowshroom Hollow! Race there, everyone!");
  });

  it("tells Dad when the family has split as far as the leash lets it", () => {
    const l = family();
    const ahead = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: f.seat === 0 ? { x: 0, z: 20 } : { x: -29.5, z: 20 } })) };
    expect(coachLine(ahead, 0, 0)).toBe("Juneau is far away on the trail: get back together!");
  });
  it("two banks of the same lake are not 'far away' (both at Moonwell)", () => {
    const l = family();
    const across = { ...l, fishers: l.fishers.map((f) => ({ ...f, pos: f.seat === 0 ? { x: -22, z: 0 } : { x: 22, z: 2 } })) };
    expect(coachLine(across, 0, 0)).not.toContain("far away");
  });
});
