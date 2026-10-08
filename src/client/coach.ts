import { fishById, JOURNAL_FISH } from "../game/fish";
import { ROD_AT, ROD_NAMES, speciesCount, todOf, type Lake } from "../game/lake";
import { waterAt, type Water } from "../game/world";
import { worldFor, type Biome } from "../game/regions";
import { atLeashEnd } from "./compass";

const WATER_NAME: Record<Water, string> = {
  dock: "off the dock",
  lily: "by the lily pads",
  falls: "by the waterfall",
  reeds: "by the reeds",
  shore: "along the shore",
  marsh: "in the marsh",
  pools: "at the pools",
  hollow: "in the hollow",
  tarn: "at the tarn",
  willow: "by the willows",
  crystal: "by the crystals",
  ember: "in the ember grove",
  frost: "by the frosty shore",
};

const nameOf = (lake: Lake, seat: number) => lake.fishers.find((f) => f.seat === seat)?.name ?? ["Green", "Yellow", "Blue", "Pink"][seat] ?? "Someone";

type Rule = (lake: Lake, mySeat: number, now: number) => string | null;

const campfireLine: Rule = (lake) => (lake.campfire ? "Campfire time. Tell each other about your best catch!" : null);

const myBite: Rule = (lake, mySeat) => {
  const mine = lake.fishers.find((f) => f.seat === mySeat);
  return mine?.mode === "bite" && !mine.easy ? "Your bobber dipped: tap now!" : null;
};

/** A kid who isn't on easy mode and is in this mode right now (easy fishers need no coaching). */
const otherIn = (lake: Lake, mySeat: number, mode: "bite" | "reel") => lake.fishers.find((f) => f.seat !== mySeat && f.mode === mode && !f.easy);

const theirBite: Rule = (lake, mySeat) => {
  const f = otherIn(lake, mySeat, "bite");
  return f ? `${nameOf(lake, f.seat)} has a bite! Tell them: tap now!` : null;
};

const theirReel: Rule = (lake, mySeat) => {
  const f = otherIn(lake, mySeat, "reel");
  return f ? `${nameOf(lake, f.seat)} is reeling: hold the button, let go when the fish splashes!` : null;
};

/** What a fresh catch says, by what came out of the water. */
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

export function catchLine(lake: Lake, who: string, c: { fishId: string; isNew: boolean; cm: number }): string {
  const def = fishById(c.fishId);
  const name = def?.name ?? "fish";
  const special: Partial<Record<string, string>> = {
    junk: `${who} fished up ${article(name)} ${name.toLowerCase()}! Silly.`,
    treasure: `${who} found a treasure chest full of shells!`,
  };
  const line = special[def?.rarity ?? ""];
  if (line) return line;
  return c.isNew ? `New fish! ${who} caught a ${name}. That's ${speciesCount(lake.journal)} of ${JOURNAL_FISH.length} in the journal.` : `${who} caught a ${name}, ${c.cm} cm.`;
}

const freshCatch: Rule = (lake, _mySeat, now) => {
  const f = lake.fishers.find((x) => x.mode === "catch" && x.catch && now - x.catch.at < 3400);
  return f?.catch ? catchLine(lake, nameOf(lake, f.seat), f.catch) : null;
};

const goldenSwirl: Rule = (lake) => {
  const golden = lake.swirls.find((s) => s.golden);
  if (!golden) return null;
  const where = golden.area === "moonwell" ? WATER_NAME[waterAt(golden.theta)] : `at ${worldFor(lake.worldSeed).placeById(golden.area)?.name ?? "a place nearby"}`;
  return `A golden swirl ${where}! Race there, everyone!`;
};

const timeTip: Rule = (lake) => {
  const tod = todOf(lake);
  if (tod === "night") return speciesCount(lake.journal) >= 10 ? "Night time: the Moonfin might rise in a swirl. Fish the swirls!" : "Night time: glowing fish are biting all over the lake.";
  return tod === "golden" ? "Golden hour: the Golden Koi comes out by the lily pads." : null;
};

const rodTip: Rule = (lake) => {
  const next = ROD_AT[lake.rodTier + 1];
  return next !== undefined ? `${next - lake.shells} more shells for everyone's ${ROD_NAMES[lake.rodTier + 1]} rod.` : null;
};

/** What each kind of place is known for. */
const BIOME_TIPS: Record<Biome, string> = {
  moonwell: "Big Bass and catfish bite off the dock.",
  marsh: "Golden Koi and Ember Shiners come out at golden hour.",
  pools: "Rainbow Trout and Leaping Salmon jump in the falls.",
  hollow: "Glowfin and Lanternfish glow there all day long.",
  tarn: "the Moonfin rises in a swirl at night.",
  willow: "Dreamscale Koi drift under the willows.",
  crystal: "Prism Bass and Geode Puffers hide by the crystals.",
  ember: "Ember Perch and the Lanternjaw glow like coals.",
  frost: "Aurora Char shimmer there at night.",
};

const wentAhead: Rule = (lake, mySeat) => {
  const ahead = lake.fishers.find((f) => f.seat !== mySeat && atLeashEnd(lake, f.seat, f.pos));
  if (!ahead) return null;
  const where = worldFor(lake.worldSeed).areaAt(ahead.pos);
  return `${nameOf(lake, ahead.seat)} is far away${where ? ` at ${where.name}` : " on the trail"}: get back together!`;
};

const freshDiscovery: Rule = (lake, _mySeat, now) => {
  const d = lake.discovery;
  if (!d || now - d.at > 6000) return null;
  const place = worldFor(lake.worldSeed).placeById(d.area);
  return place ? `${nameOf(lake, d.seat)} found ${place.name}! ${BIOME_TIPS[place.biome]}` : null;
};

const riding: Rule = (lake) => {
  const r = lake.ride;
  if (!r) return null;
  const to = worldFor(lake.worldSeed).placeById(r.toPlace)?.name ?? "somewhere new";
  return r.kind === "zeppelin" ? `All aboard the zeppelin to ${to}! Look out over the forest.` : `All aboard the boat to ${to}! Wave at the fish.`;
};

const boardingNow: Rule = (lake) => {
  if (!lake.boarding) return null;
  const p = worldFor(lake.worldSeed)
    .platformsNear(lake.fishers[0]?.pos ?? { x: 0, z: 0 }, 1)
    .find((x) => x.id === lake.boarding?.platformId);
  return p ? `Everyone's aboard: off to ${worldFor(lake.worldSeed).placeById(p.toPlace)?.name ?? "somewhere new"}!` : null;
};

const rideNearby: Rule = (lake, mySeat) => {
  const me = lake.fishers.find((f) => f.seat === mySeat);
  if (!me) return null;
  const w = worldFor(lake.worldSeed);
  const p = w.platformsNear(me.pos, 0).find((x) => Math.hypot(x.at.x - me.pos.x, x.at.z - me.pos.z) < 12);
  if (!p) return null;
  const to = w.placeById(p.toPlace)?.name ?? "somewhere far";
  return p.kind === "zeppelin" ? `A zeppelin flies to ${to} from the tower: stand on its platform together to board.` : `A boat sails to ${to} from the dock: stand on it together to board.`;
};

const exploreTip: Rule = (lake) => {
  if (lake.catchSeq < 2) return null;
  const w = worldFor(lake.worldSeed);
  const here = lake.fishers[0]?.pos ?? { x: 0, z: 0 };
  const unfound = w.placesNear(here, 1).find((p) => !lake.discovered.includes(p.id));
  return unfound ? `Explore! Follow a trail into the fog: every new place has its own fish. ${lake.discovered.length} ${lake.discovered.length === 1 ? "place" : "places"} found so far.` : null;
};

/** In priority order: what's happening to someone right now first, then news, then a tip. */
const RULES: Rule[] = [campfireLine, riding, boardingNow, myBite, theirBite, theirReel, freshCatch, wentAhead, freshDiscovery, goldenSwirl, rideNearby, exploreTip, timeTip, rodTip];

/**
 * The host phone's one line to read aloud. The grown-up is the coach: what's happening to the kids
 * right now comes first, then news, then a tip about where to go.
 */
export function coachLine(lake: Lake, mySeat: number, now: number): string {
  for (const rule of RULES) {
    const line = rule(lake, mySeat, now);
    if (line) return line;
  }
  return "Fish the swirls: that's where the rare fish are.";
}
