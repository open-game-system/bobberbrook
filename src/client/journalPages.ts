import { JOURNAL_FISH, type FishDef } from "../game/fish";
import { AREAS, type AreaId, type Water } from "../game/world";

/** The waters you fish in each place (Moonwell Lake has five of its own). */
export const PLACE_WATERS: Record<AreaId, readonly Water[]> = {
  moonwell: ["dock", "lily", "falls", "reeds", "shore"],
  mistmarsh: ["marsh"],
  pools: ["pools"],
  hollow: ["hollow"],
  tarn: ["tarn"],
};

export type JournalPage = { area: AreaId; name: string; found: boolean; fish: FishDef[] };

/** The journal as a page per place: the fish that live there (a fish can live in more than one place). */
export function journalPages(discovered: readonly AreaId[]): JournalPage[] {
  return AREAS.map((a) => ({
    area: a.id,
    name: a.name,
    found: discovered.includes(a.id),
    fish: JOURNAL_FISH.filter((f) => f.waters.some((w) => PLACE_WATERS[a.id].includes(w))),
  }));
}
