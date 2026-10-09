import { fishById, JOURNAL_FISH } from "../game/fish";
import { ROD_AT, ROD_NAMES, deadlineOf, speciesCount, todOf, type Lake } from "../game/lake";
import { waterAt, type Water } from "../game/world";

const WATER_NAME: Record<Water, string> = {
  dock: "off the dock",
  lily: "by the lily pads",
  falls: "by the waterfall",
  reeds: "by the reeds",
  shore: "along the shore",
};

const nameOf = (lake: Lake, seat: number) => lake.fishers.find((f) => f.seat === seat)?.name ?? ["Green", "Yellow", "Blue", "Pink"][seat] ?? "Someone";

/**
 * The host phone's one line to read aloud. The grown-up is the coach: what's happening to the kids
 * right now comes first, then news, then a tip about where to go.
 */
export function coachLine(lake: Lake, mySeat: number, now: number): string {
  if (lake.campfire) return "Campfire time. Tell each other about your best catch!";
  const others = lake.fishers.filter((f) => f.seat !== mySeat);
  const bite = others.find((f) => f.mode === "bite" && !f.easy);
  if (bite) return `${nameOf(lake, bite.seat)} has a bite! Tell them: tap now!`;
  const reeling = others.find((f) => f.mode === "reel" && !f.easy);
  if (reeling) return `${nameOf(lake, reeling.seat)} is reeling: hold the button, let go when the fish splashes!`;
  // A catch card still showing: its deadline (the card ending) is still ahead.
  const fresh = lake.fishers.find((f) => f.mode === "catch" && now < (deadlineOf(f) ?? now));
  if (fresh?.catch) {
    const def = fishById(fresh.catch.fishId);
    const who = nameOf(lake, fresh.seat);
    if (def?.rarity === "junk") return `${who} fished up a ${def.name.toLowerCase()}! Silly.`;
    if (def?.rarity === "treasure") return `${who} found a treasure chest full of shells!`;
    if (fresh.catch.isNew) return `New fish! ${who} caught a ${def?.name ?? "fish"}. That's ${speciesCount(lake.journal)} of ${JOURNAL_FISH.length} in the journal.`;
    return `${who} caught a ${def?.name ?? "fish"}, ${fresh.catch.cm} cm.`;
  }
  const golden = lake.swirls.find((s) => s.golden);
  if (golden) return `A golden swirl ${WATER_NAME[waterAt(golden.theta)]}! Race there, everyone!`;
  const tod = todOf(lake);
  if (tod === "night" && speciesCount(lake.journal) >= 10) return "Night time: the Moonfin might rise in a swirl. Fish the swirls!";
  if (tod === "night") return "Night time: glowing fish are biting all over the lake.";
  if (tod === "golden") return "Golden hour: the Golden Koi comes out by the lily pads.";
  const next = ROD_AT[lake.rodTier + 1];
  if (next !== undefined) return `${next - lake.shells} more shells for everyone's ${ROD_NAMES[lake.rodTier + 1]} rod.`;
  return "Fish the swirls: that's where the rare fish are.";
}
