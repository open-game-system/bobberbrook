# Bobberbrook spec

A cozy 3D fishing game for the family couch, cast through OGS. Everyone runs their own little
fisher around a hand-painted lake on the TV, fishes at the shore, and fills one shared family journal.
No losing, no reading needed on a kid's device.

**Audience:** family. Dad (phone), Juneau (5, iPad), his sister (almost 3, iPad, easy mode),
Mom (phone). Works with 1–4 fishers.

## Roles

| Screen | Who | Shows | Rule |
|---|---|---|---|
| TV | everyone | The 3D lake: every fisher, swirling fish pools, bobbers, catch reveals, time of day | Nobody touches it. Nothing covers the middle |
| Host phone | the grown-up who started it | The fisher controller **plus** a words strip: what's biting where, who caught what, Easy toggles, Campfire (end) | Words are for reading aloud |
| Fisher device | anyone (kid iPad, other phones) | Wordless controller: joystick, one big action button, mini-map, bobber view, fish card | Every press gets instant feedback here |

## Flow

1. The host phone opens `/host` (OGS start page): makes the room and declares the TV page.
2. The TV shows the lake right away (no lobby). Each device that joins gets a fisher on the dock
   in its colour (green, yellow, blue, pink, by seat).
3. **Walk**: the left joystick runs your fisher around the shore. The mini-map shows you, the others
   and the swirling pools.
4. **Cast**: at the water's edge the big button shows a rod. Press: the bobber flies out and plops.
5. **Wait**: little nibbles wiggle the bobber, then a big **splash**: the button flashes HOOK (fish icon).
   Tap within 2.5 s. Missed: the fish splashes away, the bobber waits for the next one. Easy: auto-hook.
6. **Reel**: hold the button. Calm fish (green) come closer; a thrashing fish (orange splash) pulls back,
   so let go until it calms. The line never breaks. Easy: thrashing never pulls back.
7. **Catch**: the fish leaps out, the TV moves in on that fisher, the fish's name is spoken, its card shows
   on the catcher's device. New species fill a journal page with sparkles.
8. Shells from each catch fill the family's rod meter; a full meter upgrades **everyone's** rod (Willow,
   Bamboo, Brass, Starlight): fancier rod on the TV, quicker bites, rarer fish.
9. **Swirling pools** (fish schools) drift to new spots by the shore every few catches: faster bites and
   better fish. A **golden swirl** sometimes appears: everyone race there.
10. **Time of day** turns over about every 12 minutes (morning, golden hour, night, dawn). Some fish only bite
    at golden hour or at night. The legendary Moonfin rises in a swirl at night once the journal has 10 species.
11. **Campfire** (host phone): the family sits at the fire on the TV, today's catches pop up one by one.
    Then back to fishing.

## Screens

- **TV:** the lake (group camera framing all fishers), name tags over fishers, small edge HUD (journal
  count, rod meter, time of day), catch reveal close-up, journal-page sparkle, rod upgrade, campfire.
- **Host phone:** controller + strip: "Swirl by the waterfall!", "Juneau caught a Golden Koi!", journal
  list, Easy toggle per fisher, Campfire button.
- **Fisher device:** joystick (left thumb), action button (right thumb), mini-map (top), bobber/reel
  panel (centre), fish card on catch. Landscape iPad first.

## Events

| Event | Who sends it | Payload |
|---|---|---|
| `JOIN` | any phone | `name?`, `ogsToken?` |
| `MOVE` | fisher | `x, y` joystick, quantized (−1..1) |
| `ACTION` | fisher | none (cast / hook / nothing, by fisher state) |
| `REEL` | fisher | `holding: boolean` |
| `EASY` | host | `seat`, `on` |
| `CAMPFIRE` | host | `on` |
| `PROGRESS` | host phone | saved journal + shells + rod (parsed with Zod) |
| `TICK` | TV (4 Hz) and any device past a deadline | none: the room advances to its own clock |
| `COUCH` | TV | OGS TV token |
| `RESUME` | actor-kit system | room restored from storage |

## The endless valley (owner, 2026-10-08)

- **World:** a grid of 96 m cells generated from the family's world seed (`src/game/regions.ts`,
  `worldFor(seed)`): each land cell is a place to fish (one of 8 biomes: marsh, pools, hollow, tarn, willow,
  crystal, ember, frost) with a generated name, pond, clearing and landmark; some cells are open sea.
  The five hand-made places (Moonwell Lake, Mistmarsh, Whisperfall Pools, Glowshroom Hollow, Starfall Tarn)
  are the home valley at the centre. Neighbouring places are joined by forest trails.
- **Persistent:** the seed, the places found, the fog of war and the journal live in the family's save on the
  host phone (`PROGRESS`); the same seed always makes the same world.
- **Fog of war:** 24 m tiles revealed round everyone as they walk (wider from a zeppelin); the device
  mini-map, the full map (tap the mini-map, or Map on the host phone) and the TV show the fog.
- **Boats and zeppelins:** a boat crosses each sea from a dock; a zeppelin tower in each 5×5 block of cells
  (Moonwell's on its east shore) flies to the neighbouring blocks' towers. Everyone stands on a mooring
  together for 3 s and it leaves; a tagging-along kid walks onto the mooring by itself.
- **Tagging along:** a fisher who hasn't touched the stick for 6 s and is over 9 m from the family walks to
  them (by trail, round ponds); the family stays within a 30 m leash. When the one they follow is fishing,
  they walk down to a free shore spot (3.5 m apart) beside them instead, ready to cast (round 23).
- **Trail treasures:** glowing shells along trails, a shell each, back after 3 minutes.
- **Fish:** 30 species (rarer ones more likely farther from home); the Moonfin rises at Starfall Tarn at night.

## Decisions and assumptions

- 3D renders on the TV page only (streamed to the Chromecast); devices are 2D controllers with a
  mini-map. Per-device 3D (the concept page's first idea) is out for the first version: it doubles the
  render cost and the sync work, and a 5-year-old looks at the TV anyway.
- Positions are server-authoritative (joystick vectors in, positions lazily integrated); the TV
  dead-reckons between updates.
- One zone (Bobberbrook Lake) with five fishing kinds of water: dock, lily pads, waterfall pool, reeds,
  open shore. More zones only after the family has played it.
- Progress lives on the host phone (localStorage), sent as `PROGRESS` on join.
- Audio: synthesized foley and instrument; voice lines (fish names, cheers) generated once with Gemini TTS.
- Name: Bobberbrook (working title, owner may rename).
- Rod upgrades at 12 / 40 / 100 family shells (was 20 / 60 / 140): the first upgrade lands within a
  few minutes of play, an early reward for the kids (2026-10-08, round 01).
