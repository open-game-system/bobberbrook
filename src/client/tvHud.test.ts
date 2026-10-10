import { describe, expect, it } from "vitest";
import { BOARD_MS } from "../game/lake";
import { RECAP_EVERY_MS, RECAP_MAX, boardingProgress, campfireRecap, queueToasts, todChanged } from "./tvHud";

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
