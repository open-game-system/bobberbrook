import { fishById } from "../game/fish";
import type { Fisher, Lake } from "../game/lake";
import { thrashingAt } from "../game/reel";
import type { LakeEvent } from "./lakeEvents";
import { sfx } from "./audio/sfx";
import { voice, type Line } from "./audio/voice";

export type SfxId = keyof typeof sfx;
type SfxOpts = { pan?: number; gain?: number; at?: number };

/** One sound to play: a synth sound (panned to its fisher), a fish's name, or a voice line. */
export type Cue =
  | { kind: "sfx"; id: SfxId; opts: SfxOpts }
  | { kind: "fish"; fishId: string; isNew: boolean }
  | { kind: "line"; line: Line };

type Pan = (seat: number) => number;
type EventOf<K extends LakeEvent["kind"]> = Extract<LakeEvent, { kind: K }>;
type CueTable = { [K in LakeEvent["kind"]]: (e: EventOf<K>, pan: Pan) => Cue[] };

const caughtCues = (e: EventOf<"caught">, pan: Pan): Cue[] => {
  const p = pan(e.seat);
  const cues: Cue[] = [{ kind: "sfx", id: fishById(e.fishId)?.rarity === "junk" ? "junk" : "catch", opts: { pan: p } }];
  if (e.isNew) cues.push({ kind: "sfx", id: "newFish", opts: { pan: p * 0.5 } });
  cues.push({ kind: "fish", fishId: e.fishId, isNew: e.isNew });
  return cues;
};

/** The world's sounds for each moment on the lake. */
const CUES: CueTable = {
  cast: (e, pan) => [
    { kind: "sfx", id: "cast", opts: { pan: pan(e.seat), gain: 0.5 } },
    { kind: "sfx", id: "plop", opts: { pan: pan(e.seat), at: 0.85 } },
  ],
  bite: (e, pan) => [{ kind: "sfx", id: "bite", opts: { pan: pan(e.seat) } }],
  missed: (e, pan) => [{ kind: "sfx", id: "missed", opts: { pan: pan(e.seat) } }],
  caught: caughtCues,
  upgrade: () => [{ kind: "sfx", id: "upgrade", opts: {} }, { kind: "line", line: "upgrade" }],
  "golden-swirl": () => [{ kind: "sfx", id: "golden", opts: {} }, { kind: "line", line: "golden" }],
  campfire: (e) => (e.on ? [{ kind: "line", line: "campfire" }] : []),
  joined: () => [],
  hooked: () => [],
  discovered: (e) => [{ kind: "sfx", id: "golden", opts: {} }, { kind: "line", line: `area-${e.area}` }],
};

function cueOf<K extends LakeEvent["kind"]>(e: EventOf<K>, pan: Pan): Cue[] {
  const cues: CueTable[K] = CUES[e.kind];
  return cues(e, pan);
}

/** The sounds for some moments, in order. */
export function cuesFor(events: LakeEvent[], pan: Pan): Cue[] {
  return events.flatMap((e) => cueOf(e, pan));
}

/** Pans a fisher's sounds to where they stand on the TV (west left, east right). */
export function panFor(lake: Lake): Pan {
  return (seat) => {
    // Relative to the family's middle, where the TV camera looks.
    const f = lake.fishers.find((x) => x.seat === seat);
    const mid = lake.fishers.reduce((a, x) => a + x.pos.x, 0) / Math.max(1, lake.fishers.length);
    return f ? Math.max(-0.8, Math.min(0.8, (f.pos.x - mid) / 18)) : 0;
  };
}

/** Where cues are played: the synth and the voice (fakes in tests). */
export type Speakers = { sfx: (id: SfxId, opts: SfxOpts) => void; voice: Pick<typeof voice, "fish" | "line"> };
const playSfx = (id: SfxId, opts: SfxOpts) => sfx[id](opts);
const SPEAKERS: Speakers = { sfx: playSfx, voice };

export function playCue(cue: Cue, out: Speakers = SPEAKERS): void {
  if (cue.kind === "sfx") out.sfx(cue.id, cue.opts);
  else if (cue.kind === "fish") out.voice.fish(cue.fishId, cue.isNew);
  else out.voice.line(cue.line);
}

/** The world's sounds for each moment on the lake (the TV is the only screen that plays them). */
export function playLakeEvents(lake: Lake, events: LakeEvent[], out: Speakers = SPEAKERS): void {
  for (const cue of cuesFor(events, panFor(lake))) playCue(cue, out);
}

/** Nibble times of a waiting line that are sounding now and haven't been heard yet. */
export function nibblesDue(f: Pick<Fisher, "mode" | "nibbles">, now: number, heard: ReadonlySet<number>): number[] {
  return f.mode === "wait" ? f.nibbles.filter((t) => now >= t && now < t + 300 && !heard.has(t)) : [];
}

/** Whether this fisher's hooked fish is thrashing now. */
export function thrashingNow(f: Pick<Fisher, "mode" | "reel">, now: number): boolean {
  if (f.mode !== "reel" || !f.reel) return false;
  const def = fishById(f.reel.fishId);
  return def !== undefined && thrashingAt(def.fight, f.reel, now);
}

/** Continuous sounds: nibbles and thrashes as they happen (called every animation tick). */
export function createLiveSounds(out: Speakers["sfx"] = playSfx) {
  const nibbled = new Set<number>();
  const thrashing = new Map<number, boolean>();
  return (lake: Lake, now: number) => {
    const pan = panFor(lake);
    for (const f of lake.fishers) {
      for (const t of nibblesDue(f, now, nibbled)) {
        nibbled.add(t);
        out("nibble", { pan: pan(f.seat) });
      }
      const thrash = thrashingNow(f, now);
      if (thrash && !thrashing.get(f.seat)) out("thrash", { pan: pan(f.seat) });
      thrashing.set(f.seat, thrash);
    }
    if (nibbled.size > 200) nibbled.clear();
  };
}
