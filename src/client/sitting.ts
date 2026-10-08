import type { InstanceReportInput } from "@open-game-system/profile-kit";
import { JOURNAL_FISH } from "../game/fish";
import { speciesCount, type Lake } from "../game/lake";

export const APP_ID = "bobberbrook";

/** The sitting as the OGS app shows it: "Journal 7 of 18", with the room as detail. */
export function sittingReport(input: { roomCode: string; lake: Lake; resumeUrl: string }): InstanceReportInput {
  const n = speciesCount(input.lake.journal);
  return {
    instanceId: `${APP_ID}:${input.roomCode}`,
    appId: APP_ID,
    status: "active",
    resumeUrl: input.resumeUrl,
    title: n > 0 ? `Journal ${n} of ${JOURNAL_FISH.length}` : `Room ${input.roomCode}`,
    detail: n > 0 ? `Room ${input.roomCode}` : undefined,
  };
}
