import type { InstanceReportInput, SessionSnapshot } from "@open-game-system/profile-kit";
import type { Lake } from "../game/lake";
import { sittingReport } from "./sitting";

export type OgsTvReports = {
  /** On the OGS TV (the launcher's ogs:start came with a session). */
  onOgsTv: boolean;
  /** The game token to hand the room ("" off the OGS TV). */
  token: string;
  /** The sitting to report to the OGS app, under the launcher's instance id; null off the OGS TV. */
  sitting: InstanceReportInput | null;
  /** Changes exactly when the sitting report does (so it is sent once per change). */
  sittingKey: string;
};

/** What the TV page tells the OGS launcher, app and room, from the session and the lake. */
export function ogsTvReports(input: { session: SessionSnapshot; roomCode: string; lake: Lake; origin: string }): OgsTvReports {
  const { session, roomCode } = input;
  if (session === null || session === undefined) return { onOgsTv: false, token: "", sitting: null, sittingKey: "" };
  const report = sittingReport({ roomCode, lake: input.lake, resumeUrl: `${input.origin}/join/${roomCode}` });
  const sitting = { ...report, instanceId: session.instanceId };
  return { onOgsTv: true, token: session.token, sitting, sittingKey: JSON.stringify(sitting) };
}
