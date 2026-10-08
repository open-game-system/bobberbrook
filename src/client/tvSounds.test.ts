import { describe, expect, it } from "vitest";
import { join, newLake, type Fisher, type Lake } from "../game/lake";
import { createLiveSounds, cuesFor, nibblesDue, panFor, playCue, playLakeEvents, thrashingNow } from "./tvSounds";

const pan = (seat: number) => seat / 10;

describe("the sounds for each moment", () => {
  it("swishes and plops a cast, panned to the fisher", () => {
    expect(cuesFor([{ kind: "cast", seat: 2 }], pan)).toEqual([
      { kind: "sfx", id: "cast", opts: { pan: 0.2, gain: 0.5 } },
      { kind: "sfx", id: "plop", opts: { pan: 0.2, at: 0.85 } },
    ]);
  });
  it("tugs on a bite and splashes on a miss", () => {
    expect(cuesFor([{ kind: "bite", seat: 1 }, { kind: "missed", seat: 3 }], pan)).toEqual([
      { kind: "sfx", id: "bite", opts: { pan: 0.1 } },
      { kind: "sfx", id: "missed", opts: { pan: 0.3 } },
    ]);
  });
  it("cheers a catch, chimes a new species, and says the fish's name", () => {
    expect(cuesFor([{ kind: "caught", seat: 4, fishId: "pike", isNew: true, golden: false, shells: 2 }], pan)).toEqual([
      { kind: "sfx", id: "catch", opts: { pan: 0.4 } },
      { kind: "sfx", id: "newFish", opts: { pan: 0.2 } },
      { kind: "fish", fishId: "pike", isNew: true },
    ]);
  });
  it("clunks junk, with no new-species chime for a known fish", () => {
    expect(cuesFor([{ kind: "caught", seat: 0, fishId: "boot", isNew: false, golden: false, shells: 0 }], pan)).toEqual([
      { kind: "sfx", id: "junk", opts: { pan: 0 } },
      { kind: "fish", fishId: "boot", isNew: false },
    ]);
  });
  it("announces a rod upgrade and a golden swirl", () => {
    expect(cuesFor([{ kind: "upgrade", tier: 2 }, { kind: "golden-swirl" }], pan)).toEqual([
      { kind: "sfx", id: "upgrade", opts: {} },
      { kind: "line", line: "upgrade" },
      { kind: "sfx", id: "golden", opts: {} },
      { kind: "line", line: "golden" },
    ]);
  });
  it("calls the campfire when it starts, not when it ends", () => {
    expect(cuesFor([{ kind: "campfire", on: true }], pan)).toEqual([{ kind: "line", line: "campfire" }]);
    expect(cuesFor([{ kind: "campfire", on: false }], pan)).toEqual([]);
  });
  it("stays quiet for a join and a hook (the phone plays those)", () => {
    expect(cuesFor([{ kind: "joined", seat: 0 }, { kind: "hooked", seat: 0 }], pan)).toEqual([]);
  });
});

describe("panning", () => {
  const lake: Lake = join(join(newLake(1, 0), { name: "A", ogsId: null }).lake, { name: "B", ogsId: null }).lake;
  const placed = (x: number): Lake => ({ ...lake, fishers: lake.fishers.map((f) => (f.seat === 0 ? { ...f, pos: { x, z: 0 } } : f)) });
  /** Two fishers mirrored about x = 0, so the family's middle (the camera's view) is x = 0. */
  const pair = (x: number): Lake => ({
    ...lake,
    fishers: [lake.fishers[0]!, { ...lake.fishers[0]!, seat: 1 }].map((f) => ({ ...f, pos: { x: f.seat === 0 ? x : -x, z: 0 } })),
  });
  it("pans each fisher by where they stand from the family's middle, never all the way", () => {
    expect(panFor(pair(9))(0)).toBeCloseTo(0.5, 9);
    expect(panFor(pair(9))(1)).toBeCloseTo(-0.5, 9);
    expect(panFor(pair(100))(0)).toBe(0.8);
    expect(panFor(pair(100))(1)).toBe(-0.8);
    expect(panFor({ ...lake, fishers: [{ ...lake.fishers[0]!, pos: { x: 60, z: 0 } }] })(0)).toBe(0); // alone: always mid-shot
  });
  it("centres a seat nobody sits in", () => {
    expect(panFor(placed(13))(3)).toBe(0);
  });
});

describe("live sounds", () => {
  const f = join(newLake(1, 0), { name: "A", ogsId: null }).lake.fishers[0]!;
  const waiting: Fisher = { ...f, mode: "wait", nibbles: [1000, 2000] };
  it("hears each nibble once, for 300 ms after it", () => {
    expect(nibblesDue(waiting, 999, new Set())).toEqual([]);
    expect(nibblesDue(waiting, 1000, new Set())).toEqual([1000]);
    expect(nibblesDue(waiting, 1299, new Set())).toEqual([1000]);
    expect(nibblesDue(waiting, 1300, new Set())).toEqual([]);
    expect(nibblesDue(waiting, 1100, new Set([1000]))).toEqual([]);
    expect(nibblesDue({ ...waiting, mode: "bite" }, 1000, new Set())).toEqual([]);
  });
  it("knows when a hooked fish thrashes", () => {
    const reel = { fishId: "boot", cm: 25, hookAt: 0, seed: 1, progress: 0.2, at: 0, holding: false };
    const reeling: Fisher = { ...f, mode: "reel", reel };
    // An old boot is calm for its first 2.5 s at least.
    expect(thrashingNow(reeling, 100)).toBe(false);
    const times = Array.from({ length: 100 }, (_, i) => i * 100);
    expect(times.some((t) => thrashingNow(reeling, t))).toBe(true);
    expect(times.some((t) => thrashingNow({ ...reeling, mode: "catch" }, t))).toBe(false);
    expect(times.some((t) => thrashingNow({ ...reeling, reel: null }, t))).toBe(false);
    expect(times.some((t) => thrashingNow({ ...reeling, reel: { ...reel, fishId: "nope" } }, t))).toBe(false);
  });
});

describe("playing", () => {
  function speakers() {
    const heard: unknown[] = [];
    return {
      heard,
      out: {
        sfx: (id: string, opts: object) => heard.push(["sfx", id, opts]),
        voice: { fish: (id: string, isNew: boolean) => heard.push(["fish", id, isNew]), line: (line: string) => heard.push(["line", line]) },
      },
    };
  }
  it("plays each moment's cues on the synth and the voice, in order", () => {
    const s = speakers();
    const lake = join(newLake(1, 0), { name: "A", ogsId: null }).lake;
    playLakeEvents(lake, [{ kind: "caught", seat: 0, fishId: "pike", isNew: false, golden: false, shells: 2 }, { kind: "upgrade", tier: 1 }], s.out);
    const pan = panFor(lake)(0);
    expect(s.heard).toEqual([["sfx", "catch", { pan }], ["fish", "pike", false], ["sfx", "upgrade", {}], ["line", "upgrade"]]);
  });
  it("plays a single cue", () => {
    const s = speakers();
    playCue({ kind: "line", line: "golden" }, s.out);
    expect(s.heard).toEqual([["line", "golden"]]);
  });
});

describe("the live sound loop", () => {
  const base = join(newLake(1, 0), { name: "A", ogsId: null }).lake;
  const withF = (over: Partial<Fisher>): Lake => ({ ...base, fishers: base.fishers.map((f) => ({ ...f, ...over })) });
  it("plays each nibble once", () => {
    const heard: string[] = [];
    const tick = createLiveSounds((id) => heard.push(id));
    const lake = withF({ mode: "wait", nibbles: [100, 500] });
    tick(lake, 100);
    tick(lake, 150);
    tick(lake, 500);
    expect(heard).toEqual(["nibble", "nibble"]);
  });
  it("forgets heard nibbles once it has heard over 200", () => {
    const heard: string[] = [];
    const tick = createLiveSounds((id) => heard.push(id));
    const many = Array.from({ length: 201 }, (_, i) => 1000 + i);
    tick(withF({ mode: "wait", nibbles: many }), 1200);
    expect(heard).toHaveLength(201);
    tick(withF({ mode: "wait", nibbles: many }), 1200);
    expect(heard).toHaveLength(402);
    const few = Array.from({ length: 200 }, (_, i) => 1000 + i);
    const tick2 = createLiveSounds((id) => heard.push(id));
    tick2(withF({ mode: "wait", nibbles: few }), 1199);
    tick2(withF({ mode: "wait", nibbles: few }), 1199);
    expect(heard).toHaveLength(602);
  });
  it("thrashes once at the start of each thrash", () => {
    const heard: string[] = [];
    const tick = createLiveSounds((id) => heard.push(id));
    const reel = { fishId: "boot", cm: 25, hookAt: 0, seed: 1, progress: 0.2, at: 0, holding: false };
    const lake = withF({ mode: "reel", reel });
    const times = Array.from({ length: 200 }, (_, i) => i * 50);
    let thrashes = 0;
    let was = false;
    for (const t of times) {
      tick(lake, t);
      const now = thrashingNow(lake.fishers[0]!, t);
      if (now && !was) thrashes++;
      was = now;
    }
    expect(thrashes).toBeGreaterThan(0);
    expect(heard).toEqual(Array.from({ length: thrashes }, () => "thrash"));
  });
});
