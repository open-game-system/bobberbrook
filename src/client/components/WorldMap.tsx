import type { Lake } from "../../game/lake";
import { FOG_TILE } from "../../game/lake";
import { ValleyMap } from "./MiniMap";

/** Everything the family has explored, fitted to the screen, with the fog round it. Tap to close. */
export function WorldMap({ lake, mySeat, now, onClose }: { lake: Lake; mySeat: number; now: number; onClose: () => void }) {
  const xs = lake.revealed.map((k) => Number(k.split(",")[0]) * FOG_TILE);
  const zs = lake.revealed.map((k) => Number(k.split(",")[1]) * FOG_TILE);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(0, ...xs) + FOG_TILE;
  const minZ = Math.min(0, ...zs);
  const maxZ = Math.max(0, ...zs) + FOG_TILE;
  const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const view = Math.max(60, (Math.max(maxX - minX, maxZ - minZ) / 2) * 1.15);
  return (
    <div className="world-map" role="dialog" aria-label="Map of everything you've explored" onClick={onClose}>
      <ValleyMap lake={lake} center={center} view={view} mySeat={mySeat} now={now} className="world-map-svg" />
    </div>
  );
}
