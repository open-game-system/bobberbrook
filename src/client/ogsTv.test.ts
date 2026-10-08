import { describe, expect, it } from "vitest";
import { newLake } from "../game/lake";
import { ogsTvReports } from "./ogsTv";

const lake = newLake(1, 0);
const session = { players: [], token: "tok", instanceId: "inst-1", mode: "new" as const };

describe("what the TV reports to OGS", () => {
  it("reports nothing off the OGS TV, or while waiting for the launcher", () => {
    const none = { onOgsTv: false, token: "", sitting: null, sittingKey: "" };
    expect(ogsTvReports({ session: null, roomCode: "KQTP", lake, origin: "https://b" })).toEqual(none);
    expect(ogsTvReports({ session: undefined, roomCode: "KQTP", lake, origin: "https://b" })).toEqual(none);
  });
  it("hands the room the game token and reports the sitting under the launcher's instance", () => {
    const tv = ogsTvReports({ session, roomCode: "KQTP", lake, origin: "https://b" });
    expect(tv.onOgsTv).toBe(true);
    expect(tv.token).toBe("tok");
    expect(tv.sitting).toEqual({
      instanceId: "inst-1", appId: "bobberbrook", status: "active", resumeUrl: "https://b/join/KQTP", title: "Room KQTP", detail: undefined,
    });
    expect(tv.sittingKey).toBe(JSON.stringify(tv.sitting));
  });
  it("changes its key when the sitting changes", () => {
    const a = ogsTvReports({ session, roomCode: "KQTP", lake, origin: "https://b" }).sittingKey;
    const fuller = { ...lake, journal: { perch: { count: 1, bestCm: 1, firstBy: null } } };
    expect(ogsTvReports({ session, roomCode: "KQTP", lake: fuller, origin: "https://b" }).sittingKey).not.toBe(a);
    expect(ogsTvReports({ session: { ...session, instanceId: "inst-2" }, roomCode: "KQTP", lake, origin: "https://b" }).sittingKey).not.toBe(a);
  });
});
