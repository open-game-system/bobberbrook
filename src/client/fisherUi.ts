import { CATCH_SKIP_MS, deadlineOf, thrashing, type Fisher, type Lake } from "../game/lake";
import { fishById } from "../game/fish";
import { castFrom } from "../game/world";

/** What the one big button shows and does right now. */
export type ButtonState =
  | { kind: "walk-to-water" }
  | { kind: "cast" }
  | { kind: "waiting"; nibble: boolean }
  | { kind: "bite" }
  | { kind: "reel"; progress: number; thrashing: boolean; holding: boolean }
  | { kind: "caught"; fishId: string; canRecast: boolean }
  | { kind: "campfire" };

export function buttonState(lake: Lake, me: Fisher, now: number): ButtonState {
  if (lake.campfire) return { kind: "campfire" };
  switch (me.mode) {
    case "walk":
      return castFrom(me.pos) ? { kind: "cast" } : { kind: "walk-to-water" };
    case "cast":
      return { kind: "waiting", nibble: false };
    case "wait":
      // Past the bite moment the room will say "bite" on its next tick: show it now.
      if (now >= me.biteAt) return { kind: "bite" };
      return { kind: "waiting", nibble: me.nibbles.some((t) => now >= t && now < t + 450) };
    case "bite":
      return now < me.biteUntil ? { kind: "bite" } : { kind: "waiting", nibble: false };
    case "reel": {
      const reel = me.reel;
      const def = reel ? fishById(reel.fishId) : undefined;
      if (!reel || !def) return { kind: "reel", progress: 0, thrashing: false, holding: false };
      return { kind: "reel", progress: reel.progress, thrashing: thrashing(me, now), holding: reel.holding };
    }
    case "catch":
      return { kind: "caught", fishId: me.catch?.fishId ?? "minnow", canRecast: me.catch !== null && now >= me.catch.at + CATCH_SKIP_MS && castFrom(me.pos) !== null };
  }
}

/** The fisher's position now, walked on from the last snapshot (the minimap's dots). */
export function positionAt(f: Fisher, now: number): { x: number; z: number } {
  const dt = Math.max(0, Math.min(1.5, (now - f.movedAt) / 1000));
  return { x: f.pos.x + f.vel.x * dt, z: f.pos.z + f.vel.z * dt };
}

/** Whether this screen should nudge the room's clock (a deadline it is waiting on has passed). */
export function needsTick(me: Fisher, now: number): boolean {
  if (me.mode === "reel") return true;
  // A bite: this screen waits on the bite window's end, also for an easy fisher (whose bite hooks itself
  // earlier, at its deadline, on the TV's tick).
  if (me.mode === "bite") return now >= me.biteUntil;
  const due = deadlineOf(me);
  return due !== null && now >= due;
}
