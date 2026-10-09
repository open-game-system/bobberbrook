import type { Compass } from "../compass";
import { BoatIcon, ZeppelinIcon } from "./Icons";

/**
 * While walking: a big arrow in the middle of the controller pointing to the fish (the nearest swirl,
 * or the golden one), shrinking as you get close, and a glowing "here" ring when you've arrived.
 */
export function SwirlCompass({ c }: { c: Compass }) {
  const near = Math.max(0.75, Math.min(1.1, 0.7 + c.distance / 80));
  return (
    <div className={`compass ${c.golden ? "golden" : ""} ${c.explore ? "explore" : ""} ${c.family ? "family" : ""} ${c.arrived ? "arrived" : ""}`} aria-hidden="true">
      <div className="compass-swirl" />
      {c.vehicle && <div className="compass-vehicle">{c.vehicle === "zeppelin" ? <ZeppelinIcon /> : <BoatIcon />}</div>}
      {!c.arrived && (
        <svg className="compass-arrow" viewBox="-50 -50 100 100" style={{ transform: `rotate(${c.angle}rad) scale(${near})` }}>
          <path d="M-30 -11 L14 -11 L14 -26 L44 0 L14 26 L14 11 L-30 11 Z" fill={c.golden ? "#ffd25a" : c.family ? "#ffffff" : c.explore ? "#c9b0ff" : "#7ff0e4"} stroke="rgba(20,16,50,.6)" strokeWidth="4" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
