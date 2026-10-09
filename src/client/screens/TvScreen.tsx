import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { RoomContext } from "../../room.context";
import { JOURNAL_FISH, fishById } from "../../game/fish";
import { ROD_AT, ROD_NAMES, speciesCount, todOf, type Lake } from "../../game/lake";
import { createLakeScene, type LakeScene } from "../scene";
import { lakeEvents } from "../lakeEvents";
import { createLiveSounds, playLakeEvents } from "../tvSounds";
import { startWorld, setTimeOfDayMood, setTraveling } from "../audio/world";
import { unlockAudio } from "../audio/engine";
import { voice } from "../audio/voice";
import { sfx } from "../audio/sfx";
import { FISH_IDS } from "../../game/fish";
import { useOgsTv } from "../useOgsTv";
import { AREAS } from "../../game/world";
import { worldFor } from "../../game/regions";
import { shouldTeach, teachFor, type TeachMemory } from "../teach";
import { thrashingAt } from "../../game/reel";
import { createServerClock } from "../serverClock";
import { SEAT_HEX } from "../components/MiniMap";
import { BoatIcon, RodIcon, ShellIcon, ZeppelinIcon } from "../components/Icons";
import { boardingProgress, todChanged } from "../tvHud";
import type { TimeOfDay } from "../../game/daycycle";
import { qualityFor, rendererName } from "../gpu";

const TICK_MS = 250;

function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 2);
}

type Toast = { id: number; kind: "new" | "upgrade" | "golden" | "place" | "tod"; fishId?: string; seat?: number; tier?: number; place?: string; ride?: "boat" | "zeppelin"; tod?: TimeOfDay };

const TOD_NAMES: Record<TimeOfDay, string> = { morning: "Morning", golden: "Golden hour", night: "Night falls", dawn: "Dawn" };

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
  const lastTod = useRef<TimeOfDay | null>(null);
  const toastId = useRef(0);
  const teachMem = useRef<TeachMemory>(new Map());

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
    if (sound) {
      playLakeEvents(lake, events);
      for (const line of teachFor(events, teachMem.current)) voice.line(line);
      // After a few catches at home, nudge the family down a trail (once).
      if (events.some((e) => e.kind === "caught") && lake.catchSeq >= 3 && lake.discovered.length === 1 && shouldTeach("teach-explore", "all", teachMem.current)) voice.line("teach-explore");
    }
    const todNow = todOf({ startedAt: lake.startedAt, now: clock.now() });
    setTimeOfDayMood(todNow);
    const fresh: Toast[] = [];
    const turned = todChanged(lastTod.current, todNow);
    lastTod.current = todNow;
    if (turned) fresh.push({ id: ++toastId.current, kind: "tod", tod: turned });
    for (const e of events) {
      if (e.kind === "caught" && e.isNew) fresh.push({ id: ++toastId.current, kind: "new", fishId: e.fishId, seat: e.seat });
      if (e.kind === "upgrade") fresh.push({ id: ++toastId.current, kind: "upgrade", tier: e.tier });
      if (e.kind === "golden-swirl") fresh.push({ id: ++toastId.current, kind: "golden" });
      if (e.kind === "discovered") fresh.unshift({ id: ++toastId.current, kind: "place", place: worldFor(lake.worldSeed).placeById(e.area)?.name ?? "A new place", seat: e.seat });
      if (e.kind === "ride") fresh.unshift({ id: ++toastId.current, kind: "place", place: e.to, seat: 0, ride: e.vehicle });
    }
    if (fresh.length > 0) setToasts((t) => [...t, ...fresh].slice(-4));
  }, [lake, sound, clock]);

  // One banner at a time: the first in the queue shows for 3.2 s, then the next.
  const showing = toasts[0];
  useEffect(() => {
    if (!showing) return;
    const id = window.setTimeout(() => setToasts((t) => t.slice(1)), 3200);
    return () => window.clearTimeout(id);
  }, [showing]);

  useEffect(() => {
    if (!sound) return;
    unlockAudio();
    startWorld();
    voice.enable([...FISH_IDS.map((id) => `fish-${id}`), "new", "upgrade", "golden", "campfire", "teach-walk", "teach-bite", "teach-hold", "teach-letgo", "teach-swirl", "teach-explore", "new-place", "all-aboard", "here-we-are", ...AREAS.map((a) => `area-${a.id}`)]);
    const live = createLiveSounds();
    const thrashing = new Set<number>();
    const stepAt = new Map<number, number>();
    let raf = 0;
    const loop = () => {
      const now = clock.now();
      live(latest.current, now);
      setTraveling(latest.current.fishers.some((f) => f.vel.x !== 0 || f.vel.z !== 0));
      // Soft footsteps for whoever is walking (the trails were silent).
      const nowMs = performance.now();
      for (const f of latest.current.fishers) {
        const moving = f.vel.x !== 0 || f.vel.z !== 0;
        if (moving && nowMs - (stepAt.get(f.seat) ?? 0) > 340) {
          stepAt.set(f.seat, nowMs);
          sfx.step({ pan: Math.max(-0.6, Math.min(0.6, (f.pos.x - latest.current.fishers.reduce((a, x) => a + x.pos.x, 0) / latest.current.fishers.length) / 18)) });
        }
      }
      // "It's splashing! Let go!": each fisher's first two thrashes.
      for (const f of latest.current.fishers) {
        const def = f.reel ? fishById(f.reel.fishId) : undefined;
        const on = f.mode === "reel" && !f.easy && f.reel !== null && def !== undefined && thrashingAt(def.fight, f.reel, now);
        if (on && !thrashing.has(f.seat) && shouldTeach("teach-letgo", f.seat, teachMem.current)) voice.line("teach-letgo");
        if (on) thrashing.add(f.seat);
        else thrashing.delete(f.seat);
      }
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
            {JOURNAL_FISH.filter((f) => (lake.journal[f.id]?.count ?? 0) > 0)
              .slice(-5)
              .map((f) => (
                <img key={f.id} src={`/art/fish/${f.id}.webp`} alt="" className="got" />
              ))}
          </span>
          <span className="hud-count">
            {species}/{JOURNAL_FISH.length}
          </span>
        </div>
      </div>
      <div className="hud hud-right">
        <div className="hud-chip places-chip" aria-label={`${lake.discovered.length} places found`}>
          <svg className="places-icon" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 4 C11 4 6 11 6 17 C6 27 20 36 20 36 C20 36 34 27 34 17 C34 11 29 4 20 4z" fill="#c9b0ff" stroke="#fff" strokeWidth="2.5" />
            <circle cx="20" cy="17" r="5" fill="#2a1f5a" />
          </svg>
          <span className="hud-count">{lake.discovered.length}</span>
        </div>
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
      {(() => {
        const p = lake.ride ? null : boardingProgress(lake.boarding, clock.now());
        if (p === null) return null;
        const kind = lake.boarding ? worldFor(lake.worldSeed).platformsNear(lake.fishers[0]?.pos ?? { x: 0, z: 0 }, 1).find((q) => q.id === lake.boarding?.platformId)?.kind : undefined;
        return (
          <div className="all-aboard" aria-label="All aboard">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="44" fill="rgba(24,16,60,.85)" stroke="rgba(255,255,255,.2)" strokeWidth="8" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="#f0c96a" strokeWidth="8" strokeLinecap="round" pathLength={1} strokeDasharray={`${p} 1`} transform="rotate(-90 50 50)" />
            </svg>
            <span className="all-aboard-icon">{kind === "boat" ? <BoatIcon /> : <ZeppelinIcon />}</span>
          </div>
        );
      })()}
      <div className="toasts">
        {toasts.slice(0, 1).map((t) => (
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
            {t.kind === "upgrade" && (
              <>
                <span className="toast-icon">
                  <RodIcon />
                </span>
                <span className="toast-text">{ROD_NAMES[t.tier ?? 0]} rods for everyone!</span>
              </>
            )}
            {t.kind === "tod" && t.tod && (
              <>
                <span className={`tod-icon big ${t.tod}`} aria-hidden="true" />
                <span className="toast-text">{TOD_NAMES[t.tod]}</span>
              </>
            )}
            {t.kind === "golden" && <span className="toast-text">Golden swirl!</span>}
            {t.kind === "place" && (
              <span className="toast-text">
                <span className="toast-kicker">{t.ride === "zeppelin" ? "Zeppelin to" : t.ride === "boat" ? "Boat to" : "New place"}</span> {t.place}
              </span>
            )}
          </div>
        ))}
      </div>
      {joinUi === "ticket" && (
        <div className={`ticket ${lake.fishers.length > 0 ? "compact" : ""}`}>
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
