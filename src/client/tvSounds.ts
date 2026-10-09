import { fishById } from "../game/fish";
import { thrashing as thrashingNow, type Lake } from "../game/lake";
import type { LakeEvent } from "./lakeEvents";
import { sfx } from "./audio/sfx";
import { voice } from "./audio/voice";

/** Pans a fisher's sounds to where they stand on the TV (west left, east right). */
const panOf = (lake: Lake, seat: number) => {
  const f = lake.fishers.find((x) => x.seat === seat);
  return f ? Math.max(-0.8, Math.min(0.8, f.pos.x / 26)) : 0;
};

/** The world's sounds for each moment on the lake (the TV is the only screen that plays them). */
export function playLakeEvents(lake: Lake, events: LakeEvent[]): void {
  for (const e of events) {
    switch (e.kind) {
      case "cast":
        sfx.cast({ pan: panOf(lake, e.seat), gain: 0.5 });
        sfx.plop({ pan: panOf(lake, e.seat), at: 0.85 });
        break;
      case "bite":
        sfx.bite({ pan: panOf(lake, e.seat) });
        break;
      case "missed":
        sfx.missed({ pan: panOf(lake, e.seat) });
        break;
      case "caught": {
        const def = fishById(e.fishId);
        const pan = panOf(lake, e.seat);
        if (def?.rarity === "junk") sfx.junk({ pan });
        else sfx.catch({ pan });
        if (e.isNew) sfx.newFish({ pan: pan * 0.5 });
        voice.fish(e.fishId, e.isNew);
        break;
      }
      case "upgrade":
        sfx.upgrade();
        voice.line("upgrade");
        break;
      case "golden-swirl":
        sfx.golden();
        voice.line("golden");
        break;
      case "campfire":
        if (e.on) voice.line("campfire");
        break;
      case "joined":
      case "hooked":
        break;
    }
  }
}

/** Continuous sounds: nibbles and thrashes as they happen (called every animation tick). */
export function createLiveSounds() {
  const nibbled = new Set<number>();
  const thrashing = new Map<number, boolean>();
  return (lake: Lake, now: number) => {
    for (const f of lake.fishers) {
      if (f.mode === "wait")
        for (const t of f.nibbles)
          if (now >= t && now < t + 300 && !nibbled.has(t)) {
            nibbled.add(t);
            sfx.nibble({ pan: panOf(lake, f.seat) });
          }
      const thrash = thrashingNow(f, now);
      if (thrash && !thrashing.get(f.seat)) sfx.thrash({ pan: panOf(lake, f.seat) });
      thrashing.set(f.seat, thrash);
    }
    if (nibbled.size > 200) nibbled.clear();
  };
}
