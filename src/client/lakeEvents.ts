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
  const fishers = next.fishers.flatMap((f) => fisherEvents(prev.fishers.find((p) => p.seat === f.seat), f));
  return [...fishers, ...LAKE_MOMENTS.map((m) => m(prev, next)).filter((e): e is LakeEvent => e !== null)];
}

type Moment = (prev: Lake, next: Lake) => LakeEvent | null;

/** The lake-wide moments, in the order they are reported (after every fisher's own). */
const LAKE_MOMENTS: readonly Moment[] = [
  (prev, next) => (next.upgradeSeq > prev.upgradeSeq ? { kind: "upgrade", tier: next.rodTier } : null),
  (prev, next) => (newGoldenSwirl(prev, next) ? { kind: "golden-swirl" } : null),
  (prev, next) => (next.campfire !== prev.campfire ? { kind: "campfire", on: next.campfire } : null),
  (prev, next) => (next.discovery && next.discovery.seq !== prev.discovery?.seq ? { kind: "discovered", seat: next.discovery.seat, area: next.discovery.area } : null),
  (prev, next) => (next.pickup && next.pickup.seq !== prev.pickup?.seq ? { kind: "treasure", seat: next.pickup.seat } : null),
  (prev, next) => (next.ride && !prev.ride ? { kind: "ride", vehicle: next.ride.kind, to: rideName(next.worldSeed, next.ride.toPlace), toPlace: next.ride.toPlace } : null),
  (prev, next) => (!next.ride && prev.ride ? { kind: "arrived", place: prev.ride.toPlace } : null),
];

/** Where a ride is going, by name ("somewhere new" if the world doesn't know it). */
export function rideName(worldSeed: number, toPlace: string): string {
  return worldFor(worldSeed).placeById(toPlace)?.name ?? "somewhere new";
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
