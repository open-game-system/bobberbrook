import { useEffect, useRef } from "react";
import type { Lake } from "../game/lake";
import { thrashingAt } from "../game/reel";
import { fishById } from "../game/fish";
import { lakeEvents } from "./lakeEvents";
import { sfx } from "./audio/sfx";

/**
 * The few sounds a controller makes for its own fisher (the TV carries the world's sound): nibbles,
 * the bite alarm, the reel's clicks and a thrash splash, the catch.
 */
export function useDeviceSounds(lake: Lake, seat: number, now: number): void {
  const prev = useRef<Lake | null>(null);
  const nibbled = useRef(new Set<number>());
  const lastClick = useRef(0);
  const wasThrash = useRef(false);
  useEffect(() => {
    for (const e of lakeEvents(prev.current, lake)) {
      if (!("seat" in e) || e.seat !== seat) continue;
      if (e.kind === "bite") sfx.bite();
      if (e.kind === "caught") {
        const def = fishById(e.fishId);
        if (def?.rarity === "junk") sfx.junk();
        else sfx.catch();
        if (e.isNew) sfx.newFish();
      }
      if (e.kind === "missed") sfx.missed({ gain: 0.6 });
      if (e.kind === "cast") sfx.cast();
    }
    prev.current = lake;
  }, [lake, seat]);
  const me = lake.fishers.find((f) => f.seat === seat);
  useEffect(() => {
    if (!me) return;
    if (me.mode === "wait")
      for (const t of me.nibbles)
        if (now >= t && now < t + 300 && !nibbled.current.has(t)) {
          nibbled.current.add(t);
          sfx.nibble();
        }
    if (me.mode === "reel" && me.reel) {
      const def = fishById(me.reel.fishId);
      const thrash = def ? thrashingAt(def.fight, me.reel, now) : false;
      if (thrash && !wasThrash.current) sfx.thrash({ gain: 0.5 });
      wasThrash.current = thrash;
      if (me.reel.holding && Date.now() - lastClick.current > 90) {
        lastClick.current = Date.now();
        sfx.reelClick();
      }
    }
  });
}
