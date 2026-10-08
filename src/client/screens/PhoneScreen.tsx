import { useCallback, useEffect, useState } from "react";
import { RoomContext } from "../../room.context";
import { unlockAudio } from "../audio/engine";
import { useStayConnected } from "../wake";
import { useKidLock } from "../kidLock";
import type { Hosting } from "../components/HostPanel";
import { FisherScreen } from "./FisherScreen";
import { NameGate } from "./NameGate";

const TOKEN = /^[0-9a-f-]{36}$/;

/** `?tv=<token>` means this phone started the game (/host): it knows the TV page to cast. */
function readHosting(roomCode: string): Hosting | null {
  const tv = new URLSearchParams(location.search).get("tv");
  if (!tv || !TOKEN.test(tv)) return null;
  return { tvUrl: `${location.origin}/tv/${roomCode}?t=${tv}`, joinUrl: `${location.origin}/join/${roomCode}` };
}

/** A phone or iPad: joins (as its OGS player, or with a typed name), then becomes a fisher. */
export function PhoneScreen() {
  const send = RoomContext.useSend();
  const priv = RoomContext.useSelector((s) => s.private);
  const full = RoomContext.useSelector((s) => s.public.lake.fishers.length >= 4);
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const [hosting] = useState(() => readHosting(roomCode));
  const [joining, setJoining] = useState<string | null>(null);
  useStayConnected();
  useKidLock();
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  const join = useCallback(
    (name: string, ogsToken?: string) => {
      setJoining(name);
      send({ type: "JOIN", name, ogsToken });
    },
    [send],
  );

  if (priv.role === "fisher" && priv.seat !== undefined) return <FisherScreen seat={priv.seat} host={priv.host === true} hosting={hosting} />;
  if (priv.role === "tv") return <div className="phone center"><p>This screen is the TV.</p></div>;
  if (full && !joining) return <div className="phone center"><p>Four fishers are already on the lake.</p></div>;
  if (!joining) return <NameGate full={full} onJoin={join} />;
  return (
    <div className="phone center">
      <p>Joining as {joining}…</p>
    </div>
  );
}
