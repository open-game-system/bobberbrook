import { fishById, JOURNAL_FISH } from "../game/fish";
import { ROD_AT, ROD_NAMES, speciesCount, todOf, type Lake } from "../game/lake";
import { AREAS, areaById, waterAt, type AreaId, type Water } from "../game/world";

const WATER_NAME: Record<Water, string> = {
  dock: "off the dock",
  lily: "by the lily pads",
  falls: "by the waterfall",
  reeds: "by the reeds",
  shore: "along the shore",
  marsh: "in Mistmarsh",
  pools: "at Whisperfall Pools",
  hollow: "in Glowshroom Hollow",
  tarn: "at Starfall Tarn",
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
  const where = golden.area === "moonwell" ? WATER_NAME[waterAt(golden.theta)] : `at ${areaById(golden.area).name}`;
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

/** What each place is known for, and which way its trail leaves Moonwell Lake. */
const PLACE_TIPS: Record<AreaId, { way: string; known: string }> = {
  moonwell: { way: "back at the lake", known: "Big Bass and catfish bite off the dock." },
  mistmarsh: { way: "down the trail to the south-west", known: "Golden Koi and Ember Shiners come out at golden hour." },
  pools: { way: "up the trail to the north-west", known: "Rainbow Trout and Leaping Salmon jump in the falls." },
  hollow: { way: "along the trail to the east", known: "Glowfin and Lanternfish glow there all day long." },
  tarn: { way: "past the Pools or the Hollow, the farthest place", known: "the Moonfin rises there at night." },
};

const freshDiscovery: Rule = (lake, _mySeat, now) => {
  const d = lake.discovery;
  if (!d || now - d.at > 6000) return null;
  return `${nameOf(lake, d.seat)} found ${areaById(d.area).name}! ${PLACE_TIPS[d.area].known}`;
};

const exploreTip: Rule = (lake) => {
  if (lake.catchSeq < 2) return null;
  const next = AREAS.find((a) => !lake.discovered.includes(a.id));
  return next ? `Explore! ${next.name} is ${PLACE_TIPS[next.id].way}: ${PLACE_TIPS[next.id].known}` : null;
};

/** In priority order: what's happening to someone right now first, then news, then a tip. */
const RULES: Rule[] = [campfireLine, myBite, theirBite, theirReel, freshCatch, freshDiscovery, goldenSwirl, exploreTip, timeTip, rodTip];

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
