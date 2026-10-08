import { useEffect } from "react";
import { reportOgsRoom, reportOgsSitting } from "@open-game-system/profile-kit";
import { useOgsSession } from "@open-game-system/profile-kit/react";
import { RoomContext } from "../room.context";
import { isFramed } from "./framed";
import { tvJoinUi } from "./joinMode";
import { sittingReport } from "./sitting";

const FRAMED = isFramed(window);

/**
 * The TV page on the OGS TV: tells the launcher which room it shows (ogs:room, so the couch's other
 * devices follow into it), labels the sitting, and tells the room who's on the couch. Returns whether
 * the TV shows its join ticket (never on the OGS TV).
 */
export function useOgsTv(): "ticket" | "couch" | "pending" {
  const session = useOgsSession();
  const send = RoomContext.useSend();
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const lake = RoomContext.useSelector((s) => s.public.lake);
  const onOgsTv = session !== null && session !== undefined;
  const token = onOgsTv ? session.token : "";
  useEffect(() => {
    if (onOgsTv) reportOgsRoom(roomCode);
  }, [onOgsTv, roomCode]);
  useEffect(() => {
    if (token) send({ type: "COUCH", ogsToken: token });
  }, [token, send]);
  const report = onOgsTv ? sittingReport({ roomCode, lake, resumeUrl: `${location.origin}/join/${roomCode}` }) : null;
  const reportKey = report ? JSON.stringify({ ...report, instanceId: session?.instanceId }) : "";
  useEffect(() => {
    if (report && session) reportOgsSitting({ ...report, instanceId: session.instanceId });
  }, [reportKey]);
  return tvJoinUi({ framed: FRAMED, session });
}
