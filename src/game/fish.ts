import type { Water } from "./world";
import type { TimeOfDay } from "./daycycle";

export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "junk" | "treasure";
export type When = "any" | "day" | "golden" | "night";

export type FishDef = {
  id: string;
  name: string;
  rarity: Rarity;
  waters: readonly Water[];
  when: When;
  /** Size range in centimetres. */
  cm: readonly [number, number];
  /** How it fights: calm stretch and thrash stretch lengths (ms), and how hard a thrash pulls back (0..1.5). */
  fight: { calmMs: readonly [number, number]; thrashMs: readonly [number, number]; pull: number };
  /** Colours for the 3D fish on the TV: body, belly, fins, accent (stripes, spots or glow). */
  colors: { body: string; belly: string; fin: string; accent: string };
  glow?: boolean;
};

const ALL_WATERS: readonly Water[] = ["dock", "lily", "falls", "reeds", "shore"];

export const FISH: readonly FishDef[] = [
  { id: "brook-trout", name: "Brook Trout", rarity: "common", waters: ["shore", "falls", "reeds"], when: "any", cm: [18, 34],
    fight: { calmMs: [1500, 2400], thrashMs: [500, 800], pull: 0.6 }, colors: { body: "#7a6a3a", belly: "#e9a24c", fin: "#d4552f", accent: "#2f2a1a" } },
  { id: "perch", name: "Stripy Perch", rarity: "common", waters: ["reeds", "shore", "dock"], when: "any", cm: [15, 30],
    fight: { calmMs: [1600, 2500], thrashMs: [400, 700], pull: 0.5 }, colors: { body: "#a8a640", belly: "#e8e2a0", fin: "#e0642a", accent: "#2b3318" } },
  { id: "bluegill", name: "Bluegill", rarity: "common", waters: ["lily", "shore", "dock"], when: "any", cm: [12, 24],
    fight: { calmMs: [1700, 2600], thrashMs: [400, 600], pull: 0.4 }, colors: { body: "#3f6f8f", belly: "#e98a35", fin: "#2f4d6a", accent: "#1a2a3a" } },
  { id: "minnow", name: "Silver Minnow", rarity: "common", waters: ALL_WATERS, when: "any", cm: [6, 12],
    fight: { calmMs: [1800, 2800], thrashMs: [300, 500], pull: 0.3 }, colors: { body: "#a9b8bf", belly: "#eef2f2", fin: "#c9d2cf", accent: "#55707a" } },
  { id: "catfish", name: "Whiskers Catfish", rarity: "uncommon", waters: ["dock", "reeds"], when: "any", cm: [30, 70],
    fight: { calmMs: [1300, 2000], thrashMs: [700, 1100], pull: 0.9 }, colors: { body: "#6b6656", belly: "#cfc6a8", fin: "#565041", accent: "#3a362c" } },
  { id: "lily-carp", name: "Lily Carp", rarity: "uncommon", waters: ["lily"], when: "any", cm: [30, 60],
    fight: { calmMs: [1400, 2200], thrashMs: [600, 900], pull: 0.8 }, colors: { body: "#7d7a2e", belly: "#d9c27a", fin: "#b86a22", accent: "#4a4a1a" } },
  { id: "pike", name: "Pond Pike", rarity: "uncommon", waters: ["lily", "reeds"], when: "any", cm: [40, 90],
    fight: { calmMs: [1200, 1900], thrashMs: [700, 1000], pull: 1.0 }, colors: { body: "#6f7a36", belly: "#e2dca0", fin: "#c0702c", accent: "#e8e0a0" } },
  { id: "rainbow-trout", name: "Rainbow Trout", rarity: "uncommon", waters: ["falls", "shore"], when: "day", cm: [25, 50],
    fight: { calmMs: [1300, 2100], thrashMs: [600, 900], pull: 0.8 }, colors: { body: "#7c8a5a", belly: "#e8e6dc", fin: "#9a8a6a", accent: "#e46a7a" } },
  { id: "bass", name: "Big Bass", rarity: "uncommon", waters: ["dock"], when: "any", cm: [30, 60],
    fight: { calmMs: [1200, 2000], thrashMs: [700, 1100], pull: 1.0 }, colors: { body: "#5d7a3a", belly: "#e2e2b0", fin: "#6a7a40", accent: "#2a3a1a" } },
  { id: "golden-koi", name: "Golden Koi", rarity: "rare", waters: ["lily"], when: "golden", cm: [35, 70],
    fight: { calmMs: [1300, 2000], thrashMs: [700, 1000], pull: 0.9 }, colors: { body: "#f4efe4", belly: "#ffffff", fin: "#f7d9a8", accent: "#ef6a1f" } },
  { id: "salmon", name: "Leaping Salmon", rarity: "rare", waters: ["falls"], when: "any", cm: [50, 90],
    fight: { calmMs: [1100, 1700], thrashMs: [800, 1200], pull: 1.2 }, colors: { body: "#e5867a", belly: "#f0e6e0", fin: "#6a6a7a", accent: "#2a3040" } },
  { id: "crystal-char", name: "Crystal Char", rarity: "rare", waters: ["falls"], when: "any", cm: [30, 55],
    fight: { calmMs: [1200, 1800], thrashMs: [700, 1000], pull: 1.0 }, colors: { body: "#9fd0f0", belly: "#e8f6ff", fin: "#bfe4ff", accent: "#ffffff" }, glow: true },
  { id: "ember-shiner", name: "Ember Shiner", rarity: "rare", waters: ["shore", "reeds", "lily"], when: "golden", cm: [15, 30],
    fight: { calmMs: [1300, 1900], thrashMs: [600, 900], pull: 0.8 }, colors: { body: "#ef6a24", belly: "#ffcf6a", fin: "#ffb03a", accent: "#ff3a1a" }, glow: true },
  { id: "sturgeon", name: "Old Sturgeon", rarity: "rare", waters: ["dock"], when: "any", cm: [90, 160],
    fight: { calmMs: [1000, 1600], thrashMs: [900, 1300], pull: 1.3 }, colors: { body: "#56677a", belly: "#c9ced6", fin: "#45556a", accent: "#2a3340" } },
  { id: "glowfin", name: "Glowfin", rarity: "uncommon", waters: ALL_WATERS, when: "night", cm: [20, 40],
    fight: { calmMs: [1400, 2200], thrashMs: [500, 800], pull: 0.7 }, colors: { body: "#2a8a8a", belly: "#8ae6d6", fin: "#3ac6c0", accent: "#9affee" }, glow: true },
  { id: "lanternfish", name: "Lanternfish", rarity: "rare", waters: ["dock", "falls", "shore"], when: "night", cm: [15, 30],
    fight: { calmMs: [1300, 2000], thrashMs: [600, 900], pull: 0.8 }, colors: { body: "#1f2f6a", belly: "#4a5a9a", fin: "#2a3a8a", accent: "#ffd84a" }, glow: true },
  { id: "puffer", name: "Bubble Puffer", rarity: "rare", waters: ALL_WATERS, when: "any", cm: [15, 35],
    fight: { calmMs: [1500, 2300], thrashMs: [500, 800], pull: 0.6 }, colors: { body: "#e9d27a", belly: "#f6eec0", fin: "#d4b04a", accent: "#8a6a2a" } },
  { id: "moonfin", name: "Moonfin", rarity: "legendary", waters: ALL_WATERS, when: "night", cm: [70, 120],
    fight: { calmMs: [1000, 1500], thrashMs: [900, 1300], pull: 1.4 }, colors: { body: "#28307a", belly: "#6a7ad6", fin: "#c8d0ff", accent: "#e8eeff" }, glow: true },
  { id: "boot", name: "Old Boot", rarity: "junk", waters: ["shore", "reeds", "dock"], when: "any", cm: [25, 30],
    fight: { calmMs: [2500, 3000], thrashMs: [200, 300], pull: 0.1 }, colors: { body: "#5a3a22", belly: "#5a3a22", fin: "#3a2616", accent: "#2a1a10" } },
  { id: "teapot", name: "Little Teapot", rarity: "junk", waters: ["lily", "shore", "dock"], when: "any", cm: [15, 20],
    fight: { calmMs: [2500, 3000], thrashMs: [200, 300], pull: 0.1 }, colors: { body: "#f0f2f6", belly: "#f0f2f6", fin: "#2a4aa0", accent: "#2a4aa0" } },
  { id: "chest", name: "Treasure Chest", rarity: "treasure", waters: ALL_WATERS, when: "any", cm: [30, 40],
    fight: { calmMs: [1800, 2500], thrashMs: [400, 600], pull: 0.5 }, colors: { body: "#7a4a22", belly: "#7a4a22", fin: "#d4a83a", accent: "#f0e0c0" } },
];

export const FISH_IDS = FISH.map((f) => f.id);
export type FishId = string;

const BY_ID = new Map(FISH.map((f) => [f.id, f]));
export function fishById(id: string): FishDef | undefined {
  return BY_ID.get(id);
}

/** Species that count in the journal (not junk or treasure). */
export const JOURNAL_FISH = FISH.filter((f) => f.rarity !== "junk" && f.rarity !== "treasure");

export const SHELLS: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 4, legendary: 12, junk: 0, treasure: 8 };

export function bitesNow(def: FishDef, tod: TimeOfDay): boolean {
  if (def.when === "any") return true;
  if (def.when === "night") return tod === "night";
  if (def.when === "golden") return tod === "golden";
  return tod === "morning" || tod === "golden" || tod === "dawn";
}
