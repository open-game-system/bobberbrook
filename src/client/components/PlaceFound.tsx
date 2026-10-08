import type { Biome } from "../../game/regions";

export const BIOME_COLOR: Record<Biome, string> = {
  moonwell: "#48e0d4",
  marsh: "#f29ac8",
  pools: "#7ff0e4",
  hollow: "#9a7aff",
  tarn: "#e8eeff",
  willow: "#b8e08a",
  crystal: "#c8a8ff",
  ember: "#ffb05a",
  frost: "#bfe4ff",
};

/** A new place was found: a big star burst in that kind of place's colour, no words (the TV says the name). */
export function PlaceFound({ biome, seq }: { biome: Biome; seq: number }) {
  return (
    <div className="place-found" key={seq} style={{ "--seat": BIOME_COLOR[biome] }} aria-hidden="true">
      <div className="pf-rays" />
      <svg className="pf-star" viewBox="0 0 100 100">
        <path d="M50 4 L60 38 L96 38 L66 58 L78 94 L50 72 L22 94 L34 58 L4 38 L40 38z" fill="var(--seat)" stroke="#fff" strokeWidth="4" />
      </svg>
    </div>
  );
}
