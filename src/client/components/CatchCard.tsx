import { fishById } from "../../game/fish";
import type { Catch } from "../../game/lake";
import { ShellIcon } from "./Icons";

/** The fish you just caught, big, with a star if it's new for the journal and the shells it earned. */
export function CatchCard({ c, words }: { c: Catch; words: boolean }) {
  const def = fishById(c.fishId);
  return (
    <div className={`catch-card ${c.isNew ? "new" : ""} ${c.golden ? "golden" : ""} rarity-${def?.rarity ?? "common"}`} key={c.seq}>
      <div className="cc-rays" aria-hidden="true" />
      <img className="cc-fish" src={`/art/fish/${c.fishId}.webp`} alt={def?.name ?? "fish"} draggable={false} />
      {c.isNew && (
        <svg className="cc-star" viewBox="0 0 100 100" aria-label="New for the journal">
          <path d="M50 6 L62 38 L96 38 L68 58 L79 92 L50 72 L21 92 L32 58 L4 38 L38 38z" fill="#ffd84a" stroke="#c98a1a" strokeWidth="4" />
        </svg>
      )}
      <div className="cc-shells" aria-label={`${c.shells} shells`}>
        {Array.from({ length: Math.min(c.shells, 12) }, (_, i) => (
          <span key={i} className="cc-shell" style={{ "--i": i }}>
            <ShellIcon />
          </span>
        ))}
      </div>
      {words && def && (
        <p className="cc-name">
          {def.name} · {c.cm} cm
        </p>
      )}
    </div>
  );
}
