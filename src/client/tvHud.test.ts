import { describe, expect, it } from "vitest";
import { BOARD_MS } from "../game/lake";
import { RECAP_EVERY_MS, RECAP_MAX, boardingProgress, campfireRecap, fishOutAt, queueToasts, todChanged } from "./tvHud";

describe("boardingProgress", () => {
  it("fills from 0 to 1 over the boarding wait, and is null when nobody is boarding", () => {
    expect(boardingProgress(null, 5000)).toBeNull();
    expect(boardingProgress({ platformId: "p", since: 1000 }, 1000)).toBe(0);
    expect(boardingProgress({ platformId: "p", since: 1000 }, 1000 + BOARD_MS / 2)).toBeCloseTo(0.5);
    expect(boardingProgress({ platformId: "p", since: 1000 }, 1000 + BOARD_MS * 2)).toBe(1);
  });
});

describe("todChanged", () => {
  it("announces a new time of day, not the first one seen", () => {
    expect(todChanged(null, "morning")).toBeNull();
    expect(todChanged("morning", "morning")).toBeNull();
    expect(todChanged("morning", "golden")).toBe("golden");
  });
});

describe("campfireRecap", () => {
  const log = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ seat: i % 2, fishId: `f${i}`, cm: 10 + i, isNew: i % 3 === 0, at: i * 1000 }));
  it("pops the day's catches up one by one, the last RECAP_MAX of them, oldest first", () => {
    expect(campfireRecap(log, 50_000, 50_000)).toEqual([]);
    expect(campfireRecap(log, 50_000, 50_000 + RECAP_EVERY_MS + 1).map((e) => e.fishId)).toEqual([log[10 - RECAP_MAX]!.fishId]);
    const all = campfireRecap(log, 50_000, 50_000 + RECAP_EVERY_MS * 40);
    expect(all).toHaveLength(RECAP_MAX);
    expect(all.at(-1)?.fishId).toBe("f10");
  });
  it("nothing before the campfire started", () => {
    expect(campfireRecap(log, null, 99_000)).toEqual([]);
  });
});

describe("queueToasts", () => {
  const caught = (id: number, seat: number, fishId: string) => ({ id, kind: "new" as const, fishId, seat, also: [] });
  it("a catch while another catch banner is up or waiting joins it (both show at once, nobody waits)", () => {
    const q = queueToasts([caught(1, 0, "bluegill")], [caught(2, 1, "lily-carp")]);
    expect(q).toHaveLength(1);
    expect(q[0]!.also).toEqual([{ fishId: "lily-carp", seat: 1, star: undefined }]);
  });
  it("at most three catches share a banner; other kinds queue as before, last four kept", () => {
    let q = queueToasts([], [caught(1, 0, "a")]);
    for (let i = 2; i <= 5; i++) q = queueToasts(q, [caught(i, i % 4, `f${i}`)]);
    expect(q[0]!.also).toHaveLength(2);
    expect(q).toHaveLength(2);
    const golden = { id: 9, kind: "golden" as const, also: [] };
    expect(queueToasts(q, [golden]).at(-1)?.kind).toBe("golden");
  });
});

describe("a rod upgrade rides on the catch that earned it", () => {
  it("the upgrade joins the catch banner up or waiting, so it shows with that catch (round 22: 4 s late, over the campfire)", () => {
    const catchBanner = { id: 1, kind: "new" as const, fishId: "bluegill", seat: 1, also: [] };
    const q = queueToasts([], [catchBanner, { id: 2, kind: "upgrade" as const, tier: 1, also: [] }]);
    expect(q).toHaveLength(1);
    expect(q[0]!.rodTier).toBe(1);
  });
  it("with no catch banner around, the upgrade has its own banner", () => {
    expect(queueToasts([], [{ id: 2, kind: "upgrade" as const, tier: 1, also: [] }]).map((t) => t.kind)).toEqual(["upgrade"]);
  });
});

describe("a new species never waits behind other banners", () => {
  it("a starred catch goes right after the banner on screen, ahead of queued rod/place/time banners", () => {
    const up = { id: 1, kind: "upgrade" as const, tier: 1, also: [] };
    const tod = { id: 2, kind: "tod" as const, also: [] };
    const newFish = { id: 3, kind: "new" as const, fishId: "ember-shiner", seat: 1, star: true, also: [] };
    const q = queueToasts([up, tod], [newFish]);
    expect(q.map((t) => t.id)).toEqual([1, 3, 2]);
  });
});

describe("a new time of day shows what it brings (round 24: 'Night falls' changed nothing you could see)", () => {
  it("names the fish that only come out then", () => {
    expect(fishOutAt("night")).toEqual(["moonfin", "aurora-char"]);
    expect(fishOutAt("golden")).toEqual(["golden-koi", "ember-shiner"]);
    expect(fishOutAt("morning")).toEqual([]);
  });
});
