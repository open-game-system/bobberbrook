import { useEffect, useRef } from "react";
import type { Lake } from "../game/lake";
import { sfx } from "./audio/sfx";
import { eventCues, liveCues, type DeviceCue, type LiveMemory } from "./deviceCues";

const PLAY: Record<DeviceCue, () => void> = {
  bite: () => sfx.bite(),
  catch: () => sfx.catch(),
  junk: () => sfx.junk(),
  newFish: () => sfx.newFish(),
  missed: () => sfx.missed({ gain: 0.6 }),
  cast: () => sfx.cast(),
  nibble: () => sfx.nibble(),
  thrash: () => sfx.thrash({ gain: 0.5 }),
  reelClick: () => sfx.reelClick(),
  place: () => sfx.golden(),
};

/**
 * The few sounds a controller makes for its own fisher (the TV carries the world's sound): nibbles,
 * the bite alarm, the reel's clicks and a thrash splash, the catch.
 */
export function useDeviceSounds(lake: Lake, seat: number, now: number): void {
  const prev = useRef<Lake | null>(null);
  const mem = useRef<LiveMemory>({ nibbled: new Set(), wasThrash: false, lastClickAt: 0 });
  useEffect(() => {
    for (const cue of eventCues(prev.current, lake, seat)) PLAY[cue]();
    prev.current = lake;
  }, [lake, seat]);
  const me = lake.fishers.find((f) => f.seat === seat);
  useEffect(() => {
    for (const cue of liveCues(me, now, Date.now(), mem.current)) PLAY[cue]();
  });
}
