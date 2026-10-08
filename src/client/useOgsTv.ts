import { useEffect } from "react";
import { reportOgsRoom, reportOgsSitting } from "@open-game-system/profile-kit";
import { useOgsSession } from "@open-game-system/profile-kit/react";
import { RoomContext } from "../room.context";
import { isFramed } from "./framed";
import { tvJoinUi } from "./joinMode";
import { ogsTvReports } from "./ogsTv";

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
  const tv = ogsTvReports({ session, roomCode, lake, origin: location.origin });
  useEffect(() => {
    if (tv.onOgsTv) reportOgsRoom(roomCode);
  }, [tv.onOgsTv, roomCode]);
  useEffect(() => {
    if (tv.token) send({ type: "COUCH", ogsToken: tv.token });
  }, [tv.token, send]);
  useEffect(() => {
    if (tv.sitting) reportOgsSitting(tv.sitting);
  }, [tv.sittingKey]);
  return tvJoinUi({ framed: FRAMED, session });
}
