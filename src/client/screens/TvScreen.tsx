import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { RoomContext } from "../../room.context";
import { JOURNAL_FISH, fishById } from "../../game/fish";
import { ROD_AT, ROD_NAMES, speciesCount, todOf, type Lake } from "../../game/lake";
import { createLakeScene, type LakeScene } from "../scene";
import { lakeEvents } from "../lakeEvents";
import { createLiveSounds, playLakeEvents } from "../tvSounds";
import { startWorld, setTimeOfDayMood } from "../audio/world";
import { unlockAudio } from "../audio/engine";
import { voice } from "../audio/voice";
import { FISH_IDS } from "../../game/fish";
import { useOgsTv } from "../useOgsTv";
import { createServerClock } from "../serverClock";
import { SEAT_HEX } from "../components/MiniMap";
import { ShellIcon } from "../components/Icons";
import { qualityFor, rendererName } from "../gpu";

const TICK_MS = 250;

function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 2);
}

type Toast = { id: number; kind: "new" | "upgrade" | "golden"; fishId?: string; seat?: number; tier?: number };

/**
 * The TV: the 3D lake (scene/), the room's clock (TICK at 4 Hz), the world's sound, and a small HUD at
 * the edges. Outside OGS it also shows how to join (QR + code); on the OGS TV the launcher does that.
 */
export function TvScreen({ joinUrl, autoSound }: { joinUrl: string; autoSound: boolean }) {
  const send = RoomContext.useSend();
  const lake = RoomContext.useSelector((s) => s.public.lake);
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<LakeScene | null>(null);
  const latest = useRef<Lake>(lake);
  latest.current = lake;
  const prev = useRef<Lake | null>(null);
  const clock = useMemo(() => createServerClock(), []);
  clock.observe(lake.now);
  const joinUi = useOgsTv();
  const [sound, setSound] = useState(autoSound);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => send({ type: "TICK" }), TICK_MS);
    return () => window.clearInterval(id);
  }, [send]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let disposed = false;
    const params = new URLSearchParams(location.search);
    void createLakeScene(el, { quality: qualityFor(rendererName(), params.get("quality")) }).then((s) => {
      if (disposed) return s.dispose();
      scene.current = s;
      s.update(latest.current, performance.now());
      Reflect.set(window, "__focalRect", () => s.focalRect());
    });
    const onResize = () => scene.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update(lake, performance.now());
    const events = lakeEvents(prev.current, lake);
    prev.current = lake;
    if (sound) playLakeEvents(lake, events);
    setTimeOfDayMood(todOf({ startedAt: lake.startedAt, now: clock.now() }));
    const fresh: Toast[] = [];
    for (const e of events) {
      if (e.kind === "caught" && e.isNew) fresh.push({ id: ++toastId.current, kind: "new", fishId: e.fishId, seat: e.seat });
      if (e.kind === "upgrade") fresh.push({ id: ++toastId.current, kind: "upgrade", tier: e.tier });
      if (e.kind === "golden-swirl") fresh.push({ id: ++toastId.current, kind: "golden" });
    }
    if (fresh.length > 0) {
      setToasts((t) => [...t, ...fresh].slice(-3));
      for (const f of fresh) window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), 4200);
    }
  }, [lake, sound, clock]);

  useEffect(() => {
    if (!sound) return;
    unlockAudio();
    startWorld();
    voice.enable([...FISH_IDS.map((id) => `fish-${id}`), "new", "upgrade", "golden", "campfire"]);
    const live = createLiveSounds();
    let raf = 0;
    const loop = () => {
      live(latest.current, clock.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sound, clock]);

  const species = speciesCount(lake.journal);
  const next = ROD_AT[lake.rodTier + 1];
  const base = ROD_AT[lake.rodTier] ?? 0;
  const meter = next === undefined ? 1 : (lake.shells - base) / (next - base);
  const tod = todOf({ startedAt: lake.startedAt, now: clock.now() });
  const qr = useMemo(() => qrDataUrl(joinUrl), [joinUrl]);

  return (
    <div className="tv">
      <canvas ref={canvas} className="tv-canvas" />
      <div className="hud hud-left">
        <div className="hud-chip journal-chip" aria-label={`Journal ${species} of ${JOURNAL_FISH.length}`}>
          <span className={`tod-icon ${tod}`} aria-hidden="true" />
          <span className="journal-fish">
            {JOURNAL_FISH.map((f) => (
              <img key={f.id} src={`/art/fish/${f.id}.webp`} alt="" className={(lake.journal[f.id]?.count ?? 0) > 0 ? "got" : ""} />
            ))}
          </span>
          <span className="hud-count">
            {species}/{JOURNAL_FISH.length}
          </span>
        </div>
      </div>
      <div className="hud hud-right">
        <div className="hud-chip rod-chip" aria-label={`${ROD_NAMES[lake.rodTier]} rod`}>
          <span className="shell">
            <ShellIcon />
          </span>
          <span className="rod-meter">
            <span style={{ width: `${Math.round(meter * 100)}%` }} />
          </span>
          <span className={`rod-tier tier-${lake.rodTier}`} />
        </div>
      </div>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === "new" && t.fishId && (
              <>
                <img src={`/art/fish/${t.fishId}.webp`} alt="" />
                <span className="toast-text">
                  <b style={{ color: SEAT_HEX[lake.fishers.find((f) => f.seat === t.seat)?.color ?? "green"] }}>
                    {lake.fishers.find((f) => f.seat === t.seat)?.name ?? ""}
                  </b>{" "}
                  {fishById(t.fishId)?.name}
                </span>
                <span className="toast-star" aria-hidden="true">★</span>
              </>
            )}
            {t.kind === "upgrade" && <span className="toast-text">{ROD_NAMES[t.tier ?? 0]} rods for everyone!</span>}
            {t.kind === "golden" && <span className="toast-text">Golden swirl!</span>}
          </div>
        ))}
      </div>
      {joinUi === "ticket" && (
        <div className="ticket">
          <img src={qr} alt="" />
          <div>
            <p className="ticket-kicker">Scan to fish</p>
            <p className="ticket-code">{roomCode}</p>
          </div>
        </div>
      )}
      {!sound && (
        <button type="button" className="sound-chip" onClick={() => setSound(true)}>
          Sound on
        </button>
      )}
    </div>
  );
}
