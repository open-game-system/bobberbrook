import { useState } from "react";
import { JOURNAL_FISH } from "../../game/fish";
import { ROD_AT, ROD_NAMES, speciesCount, type Lake } from "../../game/lake";
import { coachLine } from "../coach";
import { JournalSheet } from "./JournalSheet";
import { SEAT_HEX } from "./MiniMap";

/**
 * The host phone's words: one line to read aloud, the journal, who's on easy mode, and the campfire.
 * The kids' screens have no words; this is where the talking starts.
 */
export function HostStrip({ lake, mySeat, now, send }: { lake: Lake; mySeat: number; now: number; send: (e: { type: "EASY"; seat: number; on: boolean } | { type: "CAMPFIRE"; on: boolean }) => void }) {
  const [sheet, setSheet] = useState<"journal" | "fishers" | null>(null);
  const next = ROD_AT[lake.rodTier + 1];
  return (
    <div className="host-strip">
      <p className="coach" aria-live="polite">
        {coachLine(lake, mySeat, now)}
      </p>
      <div className="host-buttons">
        <button type="button" onClick={() => setSheet("journal")}>
          Journal {speciesCount(lake.journal)}/{JOURNAL_FISH.length}
        </button>
        <button type="button" onClick={() => setSheet("fishers")}>
          Fishers
        </button>
        <button type="button" className={lake.campfire ? "on" : ""} onClick={() => send({ type: "CAMPFIRE", on: !lake.campfire })}>
          {lake.campfire ? "Back to fishing" : "Campfire"}
        </button>
      </div>
      <p className="rod-line">
        {ROD_NAMES[lake.rodTier]} rod{next !== undefined ? ` · ${lake.shells}/${next} shells to ${ROD_NAMES[lake.rodTier + 1]}` : " · the best rod"}
      </p>
      {sheet === "journal" && <JournalSheet journal={lake.journal} onClose={() => setSheet(null)} />}
      {sheet === "fishers" && (
        <div className="sheet" role="dialog" aria-label="Fishers">
          <div className="sheet-head">
            <h2>Fishers</h2>
            <button type="button" className="sheet-close" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
          <p className="sheet-note">Easy mode hooks the fish by itself and the fish never pulls back. Good for little ones.</p>
          <ul className="fisher-list">
            {lake.fishers.map((f) => (
              <li key={f.seat}>
                <span className="dot" style={{ background: SEAT_HEX[f.color] }} />
                <span className="f-name">{f.name ?? f.color}</span>
                <label className="toggle">
                  <input type="checkbox" checked={f.easy} onChange={(e) => send({ type: "EASY", seat: f.seat, on: e.target.checked })} />
                  Easy
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
