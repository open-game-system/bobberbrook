import { useMemo } from "react";
import type { Lake } from "../../game/lake";
import { AREAS, DOCK, TRAILS, TRAIL_HALF_WIDTH, outerRadius, pondOutline } from "../../game/world";
import { positionAt } from "../fisherUi";

export const SEAT_HEX = { green: "#5fbf4a", yellow: "#f2c230", blue: "#3a8fe8", pink: "#f27aa8" } as const;

/** How many metres of the valley the map shows around you (north up, you in the middle). */
const VIEW = 42;

const pts = (ps: { x: number; z: number }[]) => ps.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ");

/**
 * The valley around you: the trails, the places' clearings and ponds (the ones nobody has found yet
 * hidden in purple mist), the swirls, the family. North up, centred on you.
 */
export function MiniMap({ lake, mySeat, now }: { lake: Lake; mySeat: number; now: number }) {
  const shapes = useMemo(
    () =>
      AREAS.map((a) => ({
        a,
        pond: pts(pondOutline(a, 48)),
        clearing:
          a.id === "moonwell"
            ? pts(Array.from({ length: 48 }, (_, i) => ({ x: Math.cos((i / 48) * 2 * Math.PI) * outerRadius((i / 48) * 2 * Math.PI), z: Math.sin((i / 48) * 2 * Math.PI) * outerRadius((i / 48) * 2 * Math.PI) })))
            : null,
      })),
    [],
  );
  const me = lake.fishers.find((f) => f.seat === mySeat);
  const c = me ? positionAt(me, now) : { x: 0, z: 0 };
  return (
    <svg className="minimap" viewBox={`${c.x - VIEW} ${c.z - VIEW} ${VIEW * 2} ${VIEW * 2}`} aria-label="Map">
      <defs>
        <clipPath id="map-disc">
          <circle cx={c.x} cy={c.z} r={VIEW} />
        </clipPath>
      </defs>
      <g clipPath="url(#map-disc)">
        <circle cx={c.x} cy={c.z} r={VIEW} fill="#1d2f3a" />
        {TRAILS.map((t, i) => (
          <line key={i} x1={t.from.x} y1={t.from.z} x2={t.to.x} y2={t.to.z} stroke="#a77a4e" strokeWidth={TRAIL_HALF_WIDTH * 2} strokeLinecap="round" />
        ))}
        {shapes.map(({ a, pond, clearing }) => {
          const found = lake.discovered.includes(a.id);
          return (
            <g key={a.id} className={found ? "place found" : "place hidden"}>
              {clearing ? <polygon points={clearing} fill="#5f9e4a" /> : <circle cx={a.center.x} cy={a.center.z} r={a.pond.r + a.clearing} fill="#5f9e4a" />}
              <polygon points={pond} fill={found ? "#3fbfd0" : "#3a3270"} stroke="#e8f6ff" strokeWidth="0.7" />
              {!found && <circle className="place-mist" cx={a.center.x} cy={a.center.z} r={a.pond.r + a.clearing} fill="rgba(120, 90, 200, 0.75)" />}
              {!found && <path className="place-spark" transform={`translate(${a.center.x} ${a.center.z})`} d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#fff6c0" />}
            </g>
          );
        })}
        <rect x={-DOCK.halfWidth} y={DOCK.tipZ} width={DOCK.halfWidth * 2} height={DOCK.rootZ - DOCK.tipZ} fill="#b07a42" rx="0.4" />
        {lake.swirls.map((s) => (
          <g key={s.id} transform={`translate(${s.pos.x} ${s.pos.z})`} className={s.golden ? "swirl golden" : "swirl"}>
            <circle r="3.2" fill={s.golden ? "rgba(255,210,80,.65)" : "rgba(255,255,255,.4)"} />
            <path d="M-2 0 a2 2 0 1 1 2 2" stroke={s.golden ? "#fff2b0" : "#fff"} strokeWidth="0.8" fill="none" />
          </g>
        ))}
        {lake.fishers.map((f) => {
          const p = positionAt(f, now);
          const mine = f.seat === mySeat;
          return (
            <g key={f.seat} transform={`translate(${p.x} ${p.z})`}>
              {f.bobber && <line x1="0" y1="0" x2={f.bobber.x - p.x} y2={f.bobber.z - p.z} stroke="#fff" strokeWidth="0.4" />}
              {mine && <circle r="4.2" fill="none" stroke="#fff" strokeWidth="1" className="me-ring" />}
              <circle r={mine ? 2.8 : 2} fill={SEAT_HEX[f.color]} stroke="#1d2a1a" strokeWidth="0.6" />
            </g>
          );
        })}
      </g>
      <circle cx={c.x} cy={c.z} r={VIEW - 0.6} fill="none" stroke="rgba(244,226,176,.8)" strokeWidth="1.2" />
    </svg>
  );
}
