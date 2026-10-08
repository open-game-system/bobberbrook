import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportOgsSitting } from "@open-game-system/profile-kit";
import { RoomContext } from "../../room.context";
import { progressOf } from "../../game/lake";
import { ActionButton } from "../components/ActionButton";
import { BobberWindow } from "../components/BobberWindow";
import { CatchCard } from "../components/CatchCard";
import { HostPanel, type Hosting } from "../components/HostPanel";
import { HostStrip } from "../components/HostStrip";
import { Joystick } from "../components/Joystick";
import { MiniMap, SEAT_HEX } from "../components/MiniMap";
import { buttonState, needsTick } from "../fisherUi";
import { localStore, readProgress, writeProgress } from "../progressStore";
import { createServerClock } from "../serverClock";
import { sittingReport } from "../sitting";
import type { Stick } from "../stick";
import { sfx } from "../audio/sfx";
import { useDeviceSounds } from "../useDeviceSounds";

/** Re-renders this often so time-driven pictures (nibbles, the bite, the reel) stay current. */
const FRAME_MS = 100;

/**
 * A fisher's controller: walk with the left thumb, one big button on the right, the lake's map on top
 * and your bobber up close in the middle. The host's phone adds the words (HostStrip).
 */
export function FisherScreen({ seat, host, hosting }: { seat: number; host: boolean; hosting: Hosting | null }) {
  const send = RoomContext.useSend();
  const lake = RoomContext.useSelector((s) => s.public.lake);
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const clock = useMemo(() => createServerClock(), []);
  clock.observe(lake.now);
  const [, setFrame] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setFrame((n) => n + 1), FRAME_MS);
    return () => window.clearInterval(id);
  }, []);
  const now = clock.now();
  const me = lake.fishers.find((f) => f.seat === seat);
  const state = me ? buttonState(lake, me, now) : null;

  // Nudge the room's clock when a deadline this screen waits on has passed (the TV ticks too).
  const lastTick = useRef(0);
  useEffect(() => {
    if (!me || !needsTick(me, now) || Date.now() - lastTick.current < 300) return;
    lastTick.current = Date.now();
    send({ type: "TICK" });
  });

  // The host phone keeps the family's journal: send it once, save it as it grows.
  const sentProgress = useRef(false);
  useEffect(() => {
    if (!host || sentProgress.current) return;
    sentProgress.current = true;
    const saved = readProgress(localStore());
    if (saved) send({ type: "PROGRESS", progress: saved });
  }, [host, send]);
  const progressKey = `${lake.shells}:${lake.catchSeq}`;
  useEffect(() => {
    if (host && lake.progressLoaded) writeProgress(localStore(), progressOf(lake));
    // progressKey changes whenever the journal or shells do.
  }, [host, progressKey, lake.progressLoaded]);
  // A host with no saved progress still marks the room loaded after its first catch.
  useEffect(() => {
    if (host && !lake.progressLoaded && lake.catchSeq > 0) send({ type: "PROGRESS", progress: { journal: {}, shells: 0 } });
  }, [host, lake.progressLoaded, lake.catchSeq, send]);

  const report = sittingReport({ roomCode, lake, resumeUrl: location.origin + location.pathname + location.search });
  const reportKey = JSON.stringify(report);
  useEffect(() => {
    reportOgsSitting(report);
  }, [reportKey]);

  useDeviceSounds(lake, seat, now);

  const onStick = useCallback((s: Stick) => send({ type: "MOVE", x: s.x, y: s.y }), [send]);
  const onPress = useCallback(() => {
    if (!state) return;
    if (state.kind === "cast" || state.kind === "bite" || (state.kind === "caught" && state.canRecast)) {
      sfx.tap();
      send({ type: "ACTION" });
    } else sfx.nope();
  }, [state, send]);
  const onHold = useCallback((holding: boolean) => send({ type: "REEL", holding }), [send]);

  if (!me || !state) return <div className="phone center"><p>Getting your rod…</p></div>;
  const color = SEAT_HEX[me.color];
  return (
    <div className={`fisher ${host ? "host" : "kid"} ${state.kind}`} style={{ "--seat": color }}>
      <div className="fisher-top">
        <MiniMap lake={lake} mySeat={seat} now={now} />
        {host && <HostStrip lake={lake} mySeat={seat} now={now} send={send} />}
      </div>
      <div className="fisher-middle">
        <BobberWindow state={state} />
        {me.catch && me.mode === "catch" && <CatchCard c={me.catch} words={host} />}
      </div>
      <div className="fisher-bottom">
        <Joystick onStick={onStick} color={color} />
        <ActionButton state={state} onPress={onPress} onHold={onHold} />
      </div>
      {host && hosting && <HostPanel hosting={hosting} />}
    </div>
  );
}
