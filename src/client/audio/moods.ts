import type { Biome } from "../../game/regions";

/**
 * Each kind of place plays the music in its own mode: the chord degrees shift within C major
 * pentatonic (so every sound effect still harmonizes), with its own pace and brightness.
 */
export type Mood = { shift: number; tempo: number; bright: number };

const MOODS: Record<Biome, Mood> = {
  moonwell: { shift: 0, tempo: 1, bright: 1 },
  marsh: { shift: -2, tempo: 0.9, bright: 0.8 },
  pools: { shift: 1, tempo: 1.05, bright: 1.1 },
  hollow: { shift: -1, tempo: 0.95, bright: 0.85 },
  tarn: { shift: 2, tempo: 0.9, bright: 0.95 },
  willow: { shift: 3, tempo: 1, bright: 1 },
  crystal: { shift: 4, tempo: 1.05, bright: 1.3 },
  ember: { shift: -3, tempo: 0.9, bright: 0.9 },
  frost: { shift: 5, tempo: 0.85, bright: 1.15 },
};

export function moodFor(biome: Biome): Mood {
  return MOODS[biome];
}
