import { useMemo } from "react";
import type { Lake } from "../../game/lake";
import { DOCK, lakeOutline, outerRadius } from "../../game/world";
import { positionAt } from "../fisherUi";

export const SEAT_HEX = { green: "#5fbf4a", yellow: "#f2c230", blue: "#3a8fe8", pink: "#f27aa8" } as const;

const VIEW = 34;

/** North-up map of the lake: you (big, ringed), the others, and the swirling fish. */
export function MiniMap({ lake, mySeat, now }: { lake: Lake; mySeat: number; now: number }) {
  const shore = useMemo(() => lakeOutline(72).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(" "), []);
  const land = useMemo(
    () =>
      Array.from({ length: 72 }, (_, i) => {
        const t = (i / 72) * 2 * Math.PI;
        const r = outerRadius(t);
        return `${(Math.cos(t) * r).toFixed(2)},${(Math.sin(t) * r).toFixed(2)}`;
      }).join(" "),
    [],
  );
  return (
    <svg className="minimap" viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} aria-label="Map of the lake">
      <polygon points={land} fill="#6fae4f" stroke="#4e8a3a" strokeWidth="0.8" />
      <polygon points={shore} fill="#3fa7c9" stroke="#e8f6ff" strokeWidth="0.7" />
      <rect x={-DOCK.halfWidth} y={DOCK.tipZ} width={DOCK.halfWidth * 2} height={DOCK.rootZ - DOCK.tipZ} fill="#b07a42" rx="0.4" />
      {lake.swirls.map((s) => (
        <g key={s.id} transform={`translate(${s.pos.x} ${s.pos.z})`} className={s.golden ? "swirl golden" : "swirl"}>
          <circle r="3.2" fill={s.golden ? "rgba(255,210,80,.55)" : "rgba(255,255,255,.35)"} />
          <path d="M-2 0 a2 2 0 1 1 2 2" stroke={s.golden ? "#fff2b0" : "#fff"} strokeWidth="0.7" fill="none" />
        </g>
      ))}
      {lake.fishers.map((f) => {
        const p = positionAt(f, now);
        const mine = f.seat === mySeat;
        return (
          <g key={f.seat} transform={`translate(${p.x} ${p.z})`}>
            {f.bobber && <line x1="0" y1="0" x2={f.bobber.x - p.x} y2={f.bobber.z - p.z} stroke="#fff" strokeWidth="0.3" />}
            {mine && <circle r="3.6" fill="none" stroke="#fff" strokeWidth="0.9" className="me-ring" />}
            <circle r={mine ? 2.4 : 1.7} fill={SEAT_HEX[f.color]} stroke="#1d2a1a" strokeWidth="0.5" />
          </g>
        );
      })}
    </svg>
  );
}
