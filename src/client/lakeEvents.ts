import type { Lake } from "../game/lake";

/** Moments worth a sound, a voice line or an effect, found by comparing two lake states. */
export type LakeEvent =
  | { kind: "joined"; seat: number }
  | { kind: "cast"; seat: number }
  | { kind: "bite"; seat: number }
  | { kind: "hooked"; seat: number }
  | { kind: "missed"; seat: number }
  | { kind: "caught"; seat: number; fishId: string; isNew: boolean; golden: boolean; shells: number }
  | { kind: "upgrade"; tier: number }
  | { kind: "golden-swirl" }
  | { kind: "campfire"; on: boolean };

export function lakeEvents(prev: Lake | null, next: Lake): LakeEvent[] {
  if (!prev) return [];
  const out: LakeEvent[] = [];
  for (const f of next.fishers) {
    const was = prev.fishers.find((p) => p.seat === f.seat);
    if (!was) {
      out.push({ kind: "joined", seat: f.seat });
      continue;
    }
    if (f.mode === "cast" && was.mode !== "cast") out.push({ kind: "cast", seat: f.seat });
    if (f.mode === "bite" && was.mode !== "bite") out.push({ kind: "bite", seat: f.seat });
    if (f.mode === "reel" && was.mode !== "reel") out.push({ kind: "hooked", seat: f.seat });
    if (f.missSeq > was.missSeq) out.push({ kind: "missed", seat: f.seat });
    if (f.catch && f.catch.seq !== was.catch?.seq) {
      out.push({ kind: "caught", seat: f.seat, fishId: f.catch.fishId, isNew: f.catch.isNew, golden: f.catch.golden, shells: f.catch.shells });
    }
  }
  if (next.upgradeSeq > prev.upgradeSeq) out.push({ kind: "upgrade", tier: next.rodTier });
  const goldenBefore = new Set(prev.swirls.filter((s) => s.golden).map((s) => s.id));
  if (next.swirls.some((s) => s.golden && !goldenBefore.has(s.id))) out.push({ kind: "golden-swirl" });
  if (next.campfire !== prev.campfire) out.push({ kind: "campfire", on: next.campfire });
  return out;
}
