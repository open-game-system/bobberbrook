import { describe, expect, it } from "vitest";
import { join, newLake, type Fisher, type Lake } from "../game/lake";
import { cuesFor, nibblesDue, panFor, thrashingNow } from "./tvSounds";

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
  it("pans west left and east right, never all the way", () => {
    expect(panFor(placed(13))(0)).toBeCloseTo(0.5, 9);
    expect(panFor(placed(-13))(0)).toBeCloseTo(-0.5, 9);
    expect(panFor(placed(100))(0)).toBe(0.8);
    expect(panFor(placed(-100))(0)).toBe(-0.8);
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
