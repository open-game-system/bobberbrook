import type { LakeEvent } from "./lakeEvents";

/** The narrator's teaching lines (the kids can't read): spoken for each fisher's first few times. */
export type TeachLine = "teach-walk" | "teach-bite" | "teach-hold" | "teach-letgo" | "teach-swirl" | "teach-explore";

/** How many times each line is said per fisher before the game trusts they've got it. */
export const TEACH_TIMES: Record<TeachLine, number> = { "teach-walk": 1, "teach-bite": 2, "teach-hold": 2, "teach-letgo": 2, "teach-swirl": 1, "teach-explore": 1 };

const FOR_EVENT: Partial<Record<LakeEvent["kind"], TeachLine>> = { joined: "teach-walk", bite: "teach-bite", hooked: "teach-hold" };

export type TeachMemory = Map<string, number>;

/** Counts a line for a seat; true when it should still be said. */
export function shouldTeach(line: TeachLine, seat: number | "all", mem: TeachMemory): boolean {
  const key = `${line}:${seat}`;
  const said = mem.get(key) ?? 0;
  if (said >= TEACH_TIMES[line]) return false;
  mem.set(key, said + 1);
  return true;
}

/** The lines to say for these lake moments (a thrash starting is reported by the live loop as "letgo"). */
export function teachFor(events: LakeEvent[], mem: TeachMemory): TeachLine[] {
  const out: TeachLine[] = [];
  for (const e of events) {
    const line = FOR_EVENT[e.kind];
    if (line && "seat" in e && shouldTeach(line, e.seat, mem)) out.push(line);
    // The first time anyone joins, also point at the swirls (once for the whole couch).
    if (e.kind === "joined" && shouldTeach("teach-swirl", "all", mem)) out.push("teach-swirl");
  }
  return out;
}
