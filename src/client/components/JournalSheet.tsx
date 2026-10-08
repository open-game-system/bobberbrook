import { JOURNAL_FISH } from "../../game/fish";
import type { JournalEntry } from "../../game/lake";

const WHEN = { any: "", day: "daytime", golden: "golden hour", night: "night" } as const;

/** The family journal: every species, a silhouette until someone catches it. */
export function JournalSheet({ journal, onClose }: { journal: Record<string, JournalEntry>; onClose: () => void }) {
  return (
    <div className="sheet" role="dialog" aria-label="Family journal">
      <div className="sheet-head">
        <h2>Family journal</h2>
        <button type="button" className="sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="journal">
        {JOURNAL_FISH.map((f) => {
          const e = journal[f.id];
          const got = (e?.count ?? 0) > 0;
          return (
            <li key={f.id} className={`${got ? "got" : "missing"} rarity-${f.rarity}`}>
              <img src={`/art/fish/${f.id}.webp`} alt="" draggable={false} />
              <span className="j-name">{got ? f.name : "???"}</span>
              <span className="j-meta">
                {got ? `${e?.count} caught · best ${e?.bestCm} cm${e?.firstBy ? ` · first: ${e.firstBy}` : ""}` : [f.rarity, WHEN[f.when]].filter(Boolean).join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
