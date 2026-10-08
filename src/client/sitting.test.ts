import { describe, expect, it } from "vitest";
import { newLake } from "../game/lake";
import { sittingReport } from "./sitting";

describe("sittingReport", () => {
  it("names a fresh room by its code", () => {
    const r = sittingReport({ roomCode: "KQTP", lake: newLake(1, 0), resumeUrl: "https://x/join/KQTP" });
    expect(r).toMatchObject({ instanceId: "bobberbrook:KQTP", appId: "bobberbrook", title: "Room KQTP", status: "active" });
  });
  it("names it by the journal once fish are in it", () => {
    const lake = { ...newLake(1, 0), journal: { perch: { count: 1, bestCm: 1, firstBy: null }, boot: { count: 1, bestCm: 1, firstBy: null } } };
    expect(sittingReport({ roomCode: "KQTP", lake, resumeUrl: "u" })).toMatchObject({ title: "Journal 1 of 18", detail: "Room KQTP" });
  });
});
