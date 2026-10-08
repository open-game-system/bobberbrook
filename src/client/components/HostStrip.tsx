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
type HostEvent = { type: "EASY"; seat: number; on: boolean } | { type: "CAMPFIRE"; on: boolean } | { type: "RENAME"; seat: number; name: string };

export function HostStrip({ lake, mySeat, now, send }: { lake: Lake; mySeat: number; now: number; send: (e: HostEvent) => void }) {
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
      <div className="rod-line">
        <span className="rod-name">{ROD_NAMES[lake.rodTier]} rod</span>
        <span className="rod-bar">
          <span style={{ width: `${next === undefined ? 100 : Math.round(((lake.shells - (ROD_AT[lake.rodTier] ?? 0)) / (next - (ROD_AT[lake.rodTier] ?? 0))) * 100)}%` }} />
        </span>
        <span className="rod-next">{next !== undefined ? `${ROD_NAMES[lake.rodTier + 1]} at ${next}` : "best rod"}</span>
      </div>
      {sheet === "journal" && <JournalSheet journal={lake.journal} onClose={() => setSheet(null)} />}
      {sheet === "fishers" && (
        <div className="sheet" role="dialog" aria-label="Fishers">
          <div className="sheet-head">
            <h2>Fishers</h2>
            <button type="button" className="sheet-close" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
          <p className="sheet-note">Name the kids here (their iPads join with a hat, no typing). Easy mode hooks the fish by itself and the fish never pulls back: good for little ones.</p>
          <ul className="fisher-list">
            {lake.fishers.map((f) => (
              <li key={f.seat}>
                <span className="dot" style={{ background: SEAT_HEX[f.color] }} />
                <input
                  className="rename-input"
                  aria-label={`Name for the ${f.color} fisher`}
                  defaultValue={f.name ?? ""}
                  placeholder={`${f.color} hat`}
                  maxLength={14}
                  enterKeyHint="done"
                  onBlur={(e) => send({ type: "RENAME", seat: f.seat, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
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
