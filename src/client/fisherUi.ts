import { CATCH_SKIP_MS, PLATFORM_REACH, WADE_RANGE, type Fisher, type Lake } from "../game/lake";
import { fishById } from "../game/fish";
import { thrashingAt } from "../game/reel";
import { worldFor } from "../game/regions";

/** What the one big button shows and does right now. */
export type ButtonState =
  | { kind: "walk-to-water" }
  | { kind: "cast"; wade?: boolean }
  | { kind: "waiting"; nibble: boolean }
  | { kind: "bite" }
  | { kind: "reel"; progress: number; thrashing: boolean; holding: boolean }
  | { kind: "caught"; fishId: string; canRecast: boolean }
  | { kind: "campfire" }
  | { kind: "riding"; vehicle: "boat" | "zeppelin" }
  | { kind: "board"; vehicle: "boat" | "zeppelin" };

/** Walking: at a dock or tower the button shows the ride (wait here for the family); near the water, the rod. */
function walkView(lake: Lake, me: Fisher): ButtonState {
  const w = worldFor(lake.worldSeed);
  const ride = w.platformsNear(me.pos, 0).find((p) => Math.hypot(p.at.x - me.pos.x, p.at.z - me.pos.z) <= PLATFORM_REACH);
  if (ride) return { kind: "board", vehicle: ride.kind };
  // Near the water the rod shows: a press walks the fisher down to the bank and casts.
  if (w.castFrom(me.pos)) return { kind: "cast", wade: false };
  return w.fishingSpot(me.pos, WADE_RANGE) ? { kind: "cast", wade: true } : { kind: "walk-to-water" };
}

type ModeView = (lake: Lake, me: Fisher, now: number) => ButtonState;

function reelView(me: Fisher, now: number): ButtonState {
  const reel = me.reel;
  const def = reel ? fishById(reel.fishId) : undefined;
  if (!reel || !def) return { kind: "reel", progress: 0, thrashing: false, holding: false };
  return { kind: "reel", progress: reel.progress, thrashing: thrashingAt(def.fight, reel, now), holding: reel.holding };
}

const VIEWS: Record<Fisher["mode"], ModeView> = {
  walk: (lake, me) => walkView(lake, me),
  cast: () => ({ kind: "waiting", nibble: false }),
  // Past the bite moment the room will say "bite" on its next tick: show it now.
  wait: (_lake, me, now) => (now >= me.biteAt ? { kind: "bite" } : { kind: "waiting", nibble: me.nibbles.some((t) => now >= t && now < t + 450) }),
  bite: (_lake, me, now) => (now < me.biteUntil ? { kind: "bite" } : { kind: "waiting", nibble: false }),
  reel: (_lake, me, now) => reelView(me, now),
  catch: (lake, me, now) => ({
    kind: "caught",
    fishId: me.catch?.fishId ?? "minnow",
    canRecast: me.catch !== null && now >= me.catch.at + CATCH_SKIP_MS && worldFor(lake.worldSeed).castFrom(me.pos) !== null,
  }),
  ride: (lake) => ({ kind: "riding", vehicle: lake.ride?.kind ?? "boat" }),
};

export function buttonState(lake: Lake, me: Fisher, now: number): ButtonState {
  return lake.campfire ? { kind: "campfire" } : VIEWS[me.mode](lake, me, now);
}

/** The fisher's position now, walked on from the last snapshot (the minimap's dots). */
export function positionAt(f: Fisher, now: number): { x: number; z: number } {
  const dt = Math.max(0, Math.min(1.5, (now - f.movedAt) / 1000));
  return { x: f.pos.x + f.vel.x * dt, z: f.pos.z + f.vel.z * dt };
}

/** The moment, in each mode, after which the room owes this screen an update (null: nothing pending). */
const DUE: Record<Fisher["mode"], (me: Fisher) => number | null> = {
  walk: () => null,
  cast: (me) => me.castAt + 900,
  wait: (me) => me.biteAt,
  bite: (me) => me.biteUntil,
  reel: () => 0,
  catch: (me) => (me.catch ? me.catch.at + 3400 : null),
  // Riding: the room owes an update at arrival (the TV's ticks bring it; nothing to nudge here).
  ride: () => null,
};

/** Whether this screen should nudge the room's clock (a deadline it is waiting on has passed). */
export function needsTick(me: Fisher, now: number): boolean {
  const due = DUE[me.mode](me);
  return due !== null && now >= due;
}
