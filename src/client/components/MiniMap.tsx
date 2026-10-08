import { useMemo } from "react";
import { FOG_TILE, type Lake } from "../../game/lake";
import { worldFor } from "../../game/regions";
import { DOCK, TRAIL_HALF_WIDTH, outerRadius, pondOutline } from "../../game/world";
import { positionAt } from "../fisherUi";

export const SEAT_HEX = { green: "#5fbf4a", yellow: "#f2c230", blue: "#3a8fe8", pink: "#f27aa8" } as const;

const pts = (ps: { x: number; z: number }[]) => ps.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ");

/**
 * The valley around a point: trails, clearings, ponds, seas, docks and towers, swirls, the family, and
 * the fog of war over everything nobody has seen yet. North up. `view` is the half-width in metres.
 */
export function ValleyMap({ lake, center, view, mySeat, now, className }: { lake: Lake; center: { x: number; z: number }; view: number; mySeat: number | null; now: number; className: string }) {
  const w = worldFor(lake.worldSeed);
  const cells = Math.ceil(view / 96) + 1;
  const places = w.placesNear(center, cells);
  const trails = w.trailsNear(center, cells);
  const platforms = w.platformsNear(center, cells);
  const fogTiles = useMemo(() => {
    const seen = new Set(lake.revealed);
    const out: { x: number; z: number }[] = [];
    const x0 = Math.floor((center.x - view) / FOG_TILE);
    const z0 = Math.floor((center.z - view) / FOG_TILE);
    const n = Math.ceil((view * 2) / FOG_TILE) + 1;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) if (!seen.has(`${x0 + i},${z0 + j}`)) out.push({ x: (x0 + i) * FOG_TILE, z: (z0 + j) * FOG_TILE });
    return out;
  }, [lake.revealed, Math.round(center.x / FOG_TILE), Math.round(center.z / FOG_TILE), view]);
  const clip = `map-clip-${className}`;
  return (
    <svg className={className} viewBox={`${center.x - view} ${center.z - view} ${view * 2} ${view * 2}`} aria-label="Map">
      <defs>
        <clipPath id={clip}>
          <circle cx={center.x} cy={center.z} r={view} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={center.x - view} y={center.z - view} width={view * 2} height={view * 2} fill="#1d2f3a" />
        {trails.map((t, i) => (
          <line key={i} x1={t.from.x} y1={t.from.z} x2={t.to.x} y2={t.to.z} stroke="#a77a4e" strokeWidth={TRAIL_HALF_WIDTH * 2} strokeLinecap="round" />
        ))}
        {places.map((a) => (
          <g key={a.key}>
            {a.id === "moonwell" ? (
              <polygon points={pts(Array.from({ length: 48 }, (_, i) => ({ x: Math.cos((i / 48) * 2 * Math.PI) * outerRadius((i / 48) * 2 * Math.PI), z: Math.sin((i / 48) * 2 * Math.PI) * outerRadius((i / 48) * 2 * Math.PI) })))} fill="#5f9e4a" />
            ) : (
              <circle cx={a.center.x} cy={a.center.z} r={a.pond.r + a.clearing} fill={lake.discovered.includes(a.id) ? "#5f9e4a" : "#4f7e44"} />
            )}
            <polygon points={pts(pondOutline(a, 40))} fill="#3fbfd0" stroke="#e8f6ff" strokeWidth="0.7" />
          </g>
        ))}
        <rect x={-DOCK.halfWidth} y={DOCK.tipZ} width={DOCK.halfWidth * 2} height={DOCK.rootZ - DOCK.tipZ} fill="#b07a42" rx="0.4" />
        {platforms.map((p) => (
          <g key={p.id} transform={`translate(${p.at.x} ${p.at.z})`} className={`map-${p.kind}`}>
            {p.kind === "boat" ? <path d="M-3 0 h6 l-1.5 2.2 h-3 z M0 0 v-4 l3 2.6 h-3" fill="#f4e2b0" stroke="#5a3a22" strokeWidth="0.4" /> : <ellipse cx="0" cy="-1.5" rx="3.4" ry="1.8" fill="#e8c06a" stroke="#5a3a22" strokeWidth="0.4" />}
          </g>
        ))}
        {lake.sparkles
          .filter((sp) => sp.backAt <= lake.now)
          .map((sp) => (
            <circle key={sp.id} className="map-sparkle" cx={sp.pos.x} cy={sp.pos.z} r="1.4" fill="#ffe9a0" />
          ))}
        {lake.swirls.map((s) => (
          <g key={s.id} transform={`translate(${s.pos.x} ${s.pos.z})`} className={s.golden ? "swirl golden" : "swirl"}>
            <circle r="3.2" fill={s.golden ? "rgba(255,210,80,.65)" : "rgba(255,255,255,.4)"} />
            <path d="M-2 0 a2 2 0 1 1 2 2" stroke={s.golden ? "#fff2b0" : "#fff"} strokeWidth="0.8" fill="none" />
          </g>
        ))}
        {fogTiles.map((t) => (
          <rect key={`${t.x},${t.z}`} className="fog" x={t.x - 0.3} y={t.z - 0.3} width={FOG_TILE + 0.6} height={FOG_TILE + 0.6} fill="rgba(70, 50, 140, 0.92)" />
        ))}
        {lake.fishers.map((f) => {
          const p = positionAt(f, now);
          const mine = f.seat === mySeat;
          return (
            <g key={f.seat} transform={`translate(${p.x} ${p.z})`}>
              {f.bobber && <line x1="0" y1="0" x2={f.bobber.x - p.x} y2={f.bobber.z - p.z} stroke="#fff" strokeWidth="0.4" />}
              {mine && <circle r={view / 10} fill="none" stroke="#fff" strokeWidth={view / 40} className="me-ring" />}
              <circle r={mine ? view / 15 : view / 21} fill={SEAT_HEX[f.color]} stroke="#1d2a1a" strokeWidth={view / 70} />
            </g>
          );
        })}
      </g>
      <circle cx={center.x} cy={center.z} r={view - 0.6} fill="none" stroke="rgba(244,226,176,.8)" strokeWidth={view / 35} />
    </svg>
  );
}

/** North-up, centred on you: the valley within ~42 m. */
export function MiniMap({ lake, mySeat, now, onOpen }: { lake: Lake; mySeat: number; now: number; onOpen?: () => void }) {
  const me = lake.fishers.find((f) => f.seat === mySeat);
  const c = me ? positionAt(me, now) : { x: 0, z: 0 };
  return (
    <button type="button" className="minimap-btn" aria-label="Open the map" onClick={onOpen}>
      <ValleyMap lake={lake} center={c} view={42} mySeat={mySeat} now={now} className="minimap" />
    </button>
  );
}
