import { JOURNAL_FISH, type FishDef } from "../game/fish";
import { worldFor, type Biome } from "../game/regions";
import type { Water } from "../game/world";

/** The journal's chapters: one per kind of place (the waters each kind of place has). */
export const CHAPTERS: readonly { biome: Biome; name: string; waters: readonly Water[] }[] = [
  { biome: "moonwell", name: "Moonwell Lake", waters: ["dock", "lily", "falls", "reeds", "shore"] },
  { biome: "marsh", name: "Misty marshes", waters: ["marsh"] },
  { biome: "pools", name: "Falls and pools", waters: ["pools"] },
  { biome: "hollow", name: "Glowshroom hollows", waters: ["hollow"] },
  { biome: "tarn", name: "Starfall tarns", waters: ["tarn"] },
  { biome: "willow", name: "Willow meres", waters: ["willow"] },
  { biome: "crystal", name: "Crystal glades", waters: ["crystal"] },
  { biome: "ember", name: "Ember groves", waters: ["ember"] },
  { biome: "frost", name: "Frost ponds", waters: ["frost"] },
];

export type JournalPage = { biome: Biome; name: string; found: boolean; fish: FishDef[] };

/** The journal as a chapter per kind of place; a chapter opens once the family has found such a place. */
export function journalPages(discovered: readonly string[], worldSeed: number): JournalPage[] {
  const w = worldFor(worldSeed);
  const found = new Set(discovered.map((id) => w.placeById(id)?.biome).filter((b): b is Biome => b !== undefined));
  return CHAPTERS.map((c) => ({ biome: c.biome, name: c.name, found: found.has(c.biome), fish: JOURNAL_FISH.filter((f) => f.waters.some((x) => c.waters.includes(x))) }));
}
