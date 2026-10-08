import type { Fisher, Lake } from "../game/lake";
import { fishById } from "../game/fish";
import { thrashingAt } from "../game/reel";
import { lakeEvents, type LakeEvent } from "./lakeEvents";

/** A sound the controller plays for its own fisher. */
export type DeviceCue = "bite" | "catch" | "junk" | "newFish" | "missed" | "cast" | "nibble" | "thrash" | "reelClick";

const EVENT_CUES: Partial<Record<LakeEvent["kind"], (e: LakeEvent) => DeviceCue[]>> = {
  bite: () => ["bite"],
  missed: () => ["missed"],
  cast: () => ["cast"],
  caught: (e) => {
    if (e.kind !== "caught") return [];
    const junk = fishById(e.fishId)?.rarity === "junk";
    return [junk ? "junk" : "catch", ...(e.isNew ? (["newFish"] as const) : [])];
  },
};

/** Cues for what just happened to this seat between two lake states. */
export function eventCues(prev: Lake | null, next: Lake, seat: number): DeviceCue[] {
  return lakeEvents(prev, next)
    .filter((e) => "seat" in e && e.seat === seat)
    .flatMap((e) => EVENT_CUES[e.kind]?.(e) ?? []);
}

/** Memory between animation ticks, so each nibble and each thrash sounds once. */
export type LiveMemory = { nibbled: Set<number>; wasThrash: boolean; lastClickAt: number };

function nibbleCues(me: Fisher, now: number, mem: LiveMemory): DeviceCue[] {
  if (me.mode !== "wait") return [];
  const fresh = me.nibbles.filter((t) => now >= t && now < t + 300 && !mem.nibbled.has(t));
  for (const t of fresh) mem.nibbled.add(t);
  return fresh.map(() => "nibble");
}

function isThrashing(me: Fisher, now: number): boolean {
  const def = me.reel ? fishById(me.reel.fishId) : undefined;
  return me.mode === "reel" && me.reel !== null && def !== undefined && thrashingAt(def.fight, me.reel, now);
}

function thrashCues(me: Fisher, now: number, mem: LiveMemory): DeviceCue[] {
  const thrash = isThrashing(me, now);
  const started = thrash && !mem.wasThrash;
  mem.wasThrash = thrash;
  return started ? ["thrash"] : [];
}

function clickCues(me: Fisher, wallNow: number, mem: LiveMemory): DeviceCue[] {
  if (me.mode !== "reel" || !me.reel?.holding || wallNow - mem.lastClickAt <= 90) return [];
  mem.lastClickAt = wallNow;
  return ["reelClick"];
}

/** Continuous cues for this fisher right now: nibbles as they happen, the start of a thrash, reel clicks while holding. */
export function liveCues(me: Fisher | undefined, now: number, wallNow: number, mem: LiveMemory): DeviceCue[] {
  if (!me) return [];
  return [...nibbleCues(me, now, mem), ...thrashCues(me, now, mem), ...clickCues(me, wallNow, mem)];
}
