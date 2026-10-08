import type { Fisher, Lake } from "../game/lake";
import { worldFor } from "../game/regions";


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
  | { kind: "campfire"; on: boolean }
  | { kind: "discovered"; seat: number; area: string }
  | { kind: "treasure"; seat: number }
  | { kind: "ride"; vehicle: "boat" | "zeppelin"; to: string; toPlace: string }
  | { kind: "arrived"; place: string };

export function lakeEvents(prev: Lake | null, next: Lake): LakeEvent[] {
  if (!prev) return [];
  const out = next.fishers.flatMap((f) => fisherEvents(prev.fishers.find((p) => p.seat === f.seat), f));
  if (next.upgradeSeq > prev.upgradeSeq) out.push({ kind: "upgrade", tier: next.rodTier });
  if (newGoldenSwirl(prev, next)) out.push({ kind: "golden-swirl" });
  if (next.campfire !== prev.campfire) out.push({ kind: "campfire", on: next.campfire });
  const d = next.discovery;
  if (d && d.seq !== prev.discovery?.seq) out.push({ kind: "discovered", seat: d.seat, area: d.area });
  if (next.pickup && next.pickup.seq !== prev.pickup?.seq) out.push({ kind: "treasure", seat: next.pickup.seat });
  if (next.ride && !prev.ride) out.push({ kind: "ride", vehicle: next.ride.kind, to: worldFor(next.worldSeed).placeById(next.ride.toPlace)?.name ?? "somewhere new", toPlace: next.ride.toPlace });
  if (!next.ride && prev.ride) out.push({ kind: "arrived", place: prev.ride.toPlace });
  return out;
}

/** Entering these modes is a moment of its own. */
const ENTERED = [
  ["cast", "cast"],
  ["bite", "bite"],
  ["reel", "hooked"],
] as const;

/** One fisher's moments between two states (`was` is undefined for a fisher who just joined). */
export function fisherEvents(was: Fisher | undefined, f: Fisher): LakeEvent[] {
  if (!was) return [{ kind: "joined", seat: f.seat }];
  const out: LakeEvent[] = ENTERED.filter(([mode]) => f.mode === mode && was.mode !== mode).map(([, kind]) => ({ kind, seat: f.seat }));
  if (f.missSeq > was.missSeq) out.push({ kind: "missed", seat: f.seat });
  if (f.catch && f.catch.seq !== was.catch?.seq) {
    out.push({ kind: "caught", seat: f.seat, fishId: f.catch.fishId, isNew: f.catch.isNew, golden: f.catch.golden, shells: f.catch.shells });
  }
  return out;
}

function newGoldenSwirl(prev: Lake, next: Lake): boolean {
  const goldenBefore = new Set(prev.swirls.filter((s) => s.golden).map((s) => s.id));
  return next.swirls.some((s) => s.golden && !goldenBefore.has(s.id));
}
