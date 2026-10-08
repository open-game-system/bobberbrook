import type { JournalEntry } from "../../game/lake";
import { journalPages } from "../journalPages";

const WHEN = { any: "", day: "daytime", golden: "golden hour", night: "night" } as const;

/** The family journal: every species, a silhouette until someone catches it. */
export function JournalSheet({ journal, discovered, worldSeed, onClose }: { journal: Record<string, JournalEntry>; discovered: readonly string[]; worldSeed: number; onClose: () => void }) {
  return (
    <div className="sheet" role="dialog" aria-label="Family journal">
      <div className="sheet-head">
        <h2>Family journal</h2>
        <button type="button" className="sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
      {journalPages(discovered, worldSeed).map((page) => (
        <section key={page.biome} className={`journal-page ${page.found ? "found" : "unfound"}`}>
          <h3>{page.found ? page.name : "A kind of place you haven't found yet"}</h3>
          <ul className="journal">
            {page.fish.map((f) => {
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
        </section>
      ))}
    </div>
  );
}
