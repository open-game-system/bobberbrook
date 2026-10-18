# Round 22 critic

Evidence: scene/ (sheet + full shots), check/, phones/, session.mp4 (171 s, frames pulled at 4, 24, 30, 33, 36.5, 46, 58, 72, 88, 104, 110, 114, 117, 126, 133, 138, 142, 157, 161, 164, 170 s plus 6 fps strips at 35.9-37.1 s and 57.8-59.0 s), audio-report.json, spectrogram, session.log (279 camera_jerk warnings).

## First-time-player read (Onboarding)
What caused each outcome I saw:
1. 24 s: bobber plops, iPad action button turns into a bobber: "I cast, now I wait". Clear.
2. 30-36 s: iPad bobber view shows a dark fish shadow, button turns green with a reel and a ring fills: "hold to reel". Clear from the iPad, **not** from the TV (no visible tug, splash or bent rod on the TV at 30/33 s).
3. 36.5 s: fish held up on TV, same fish big on iPad, ticket at the top, coach says "New fish!". Clear.
4. 125-141 s: Dad's button is orange for ~16 s. On the phone this means "thrashing, let go", but the TV shows nothing thrashing and no line tension, so from across the room the long reel has no visible cause.
5. 55-115 s trail: Juneau's iPad arrow points up-left (72 s), then down-left (104 s, 110 s), then left with a star (114 s). A kid can't tell what the arrow follows (Dad? the new place?), and on the TV the family is still at Moonwell 50 s into the walk (104 s).
6. 157 s: the rod meter fills and resets on a catch, but "Bamboo rods for everyone!" only shows 4 s later over the campfire (161 s). Cause and effect come apart.
7. 133/157 s: 5 catches gave 4/30 → 5/30; the repeat Bluegill gets the same celebration on the iPad as a new one, so the journal's "new" isn't legible to the kid.
I can explain 1, 2 (iPad only), 3 and the discovery star from the screens; 4, 5, 6 need the rules. Row capped at 5.

## Scores

| Row | Score | Evidence |
|---|---|---|
| Art direction & cohesion | 6 | Moonwell (scene/moonwell.png, moonwell_tod-night.png) is the most coherent it has been: painted canopies, stone cottages, teal water. Still two styles: the glossy giant mushroom and smooth cottage roofs in discovery.png, plastic doll faces in double-catch.png, and a pink-magenta veil that flattens Mistmarsh (mistmarsh.png) into one value. Far from ref-night.jpg's depth and glow. |
| Environment & set dressing | 6 | Moonwell reads as a place (waterfall cliff, dock, lily pads, cottages). Mistmarsh is a pond with pads, a gazebo and a boardwalk on flat grass with visible dark ground tiles (mistmarsh.png bottom centre); no colossal ancient tree landmark anywhere; the trail (72-110 s) is generic foxglove-and-mushroom forest floor. |
| Water & fishing FX | 6 | Moonwell water has depth and shore glow; night waterfall foam is a white ball (moonwell_tod-night.png ~920,450). Mistmarsh water reads as a flat decal with a pink rim (discovery.png). The reel struggle is invisible on the TV (30/33/126 s: no splash, no line tension, no bent rod). |
| Characters & animation | 5 | Chunky and readable, hats now painted, but the skin and faces are smooth plastic dolls (double-catch.png, campfire.png); Sis holds her arms out wide and the fish floats between them (double-catch.png); fishers stand stiffly on grass far from the water while reeling (126 s, 133 s); name tags float ~1 head above (double-catch.png). |
| Lighting, time of day & mood | 6 | Night Moonwell glows nicely (fireflies, lamps, beams). Mistmarsh is lit the same value everywhere (pink haze, no warm key/cool fill split); golden/dawn shots on the sheet are mostly a hue shift. |
| Camera & composition | 4 | The camera wobbles: 6 fps strips at 35.9-37.1 s (catch push-in) and 57.8-59.0 s swing left and right frame to frame; 279 camera_jerk flags in session.log. Fishers stack: Dad behind Juneau on the Mistmarsh dock (117 s, 126 s, 138 s, 170 s), Mom in front of Dad in four-reel_tod-morning.png (the cover-check failure). The zeppelin envelope crops the right edge of every Moonwell frame (moonwell.png). |
| Catch moment & payoff | 6 | TV, catcher's device and coach agree (36.5 s, 133 s, 142 s); the fish is held up. But the Mistmarsh catch has no push-in (133 s, Dad's back fills the foreground), there's no leap out of the water, and a repeat Bluegill (157 s) gets the same iPad celebration as a new species. |
| Game feel & responsiveness | 5 | Device states change crisply (strip-ipad.png). Dad's reel lasts 16 s of orange (125-141 s) with nothing to see on the TV; the camera judder makes walking feel unstable (58 s); hat picker tap feedback 560 ms (check.log). |
| Kid & little-kid UX | 6 | Wordless and clear at the water (strip-ipad.png); Juneau catches every round. The trail arrow flips direction (72/104/110/114 s) with no anchor on the minimap, and Juneau stands on grass, not at the shore, at Mistmarsh (133 s). |
| Grown-up phone UI | 6 | Coach lines are good ("Ask Juneau which fish they hope to catch next", 4 s). But the coach shows "Explore! Follow a trail…" while Dad is mid-reel at Mistmarsh (138 s), and the Invite chip sits on the controller (check sheet). Dense header for a phone (4 tabs + rod bar + map). |
| Progression & variety | 6 | 5 species, a new place, a rod upgrade, a campfire recap with 5 cards (164 s), a golden swirl call (170 s). Repeats at the new place (Bluegill twice, 133/157 s); the rod upgrade has no beat of its own (157 s → 161 s). |
| Audio | 5 | The music bed runs the whole session, but there's no audible ambience (water, birds, crickets) on the trail (55-115 s: the spectrogram is music only). Harshness: 30-33 harsh clicks/min at the Moonwell hooks and catches, 29/min at the last catch (audio-report.json). |
| Onboarding & legibility | 5 | See the first-time read: the reel struggle, the trail arrow and the rod upgrade can't be explained from the screens. |
| Performance & stability | 6 | Programs flat (90/90), soak p95 8-16 ms. Hero p95 16.8 ms in about half the shots (over 16.7). The TV shows an empty navy screen with only the HUD for the first ~4.5 s (start.png strip, 1-4.5 s). 404 on load (scene.log). |

## Largest actionable gap
**Camera & composition (4).** The group camera visibly judders frame to frame (35.9-37.1 s, 57.8-59.0 s; 279 jerk flags) and lets fishers stack on docks (117-170 s, four-reel morning). Every hero moment, catch push-in included, is shot through a shaking lens, and that drags down Feel, Catch and Onboarding too.

## Top 8 fixes (score impact per effort)
1. [scene] **Camera smoothing at the source.** Feed the group camera from the TV's dead-reckoned fisher positions through a critically damped spring (position and look-at, ~0.6 s), with a dead zone, never from raw 4 Hz room updates. Target: 0 camera_jerk flags at 36 s and 58 s. (Camera +1, Feel, Catch)
2. [rules] **Stand-off spacing at fishing spots.** Snap each fisher's cast position to a free shore slot ≥ 1.8 m from the others, so nobody stands behind another (Mistmarsh dock 117/126/138/170 s; four-reel_tod-morning.png). At Mistmarsh, put Juneau at the shoreline, not on grass (133 s).
3. [scene] **Make the reel visible on the TV.** A bent rod, a taut line that vibrates, a splash ring at the bobber that grows when the fish thrashes and an orange splash burst on thrash (30/33/126 s). Pull a light push-in during the reel. (Water, Feel, Onboarding)
4. [scene] **Fix the opening.** Render the lake (or the logo over the lake) from frame 0, never 4.5 s of empty navy with the HUD (1-4.5 s). (Perf)
5. [ui] **Own beat for the rod upgrade.** When the meter fills (157 s), show the rod swap on the TV at once (every fisher's rod glints, one ticket) instead of deferring it into the campfire (161 s). Mark repeat catches on the iPad with a smaller card (no star burst, a "+1" shell) so new species stay special (157 s).
6. [audio] **Soften the catch and hook stings and add ambience.** Low-pass the transients above 4 kHz and give them a 15-20 ms attack, to bring the 30/min at Moonwell hooks and the 29/min at the last catch toward 0. Add a water lap + bird/cricket bed per place, especially on the trail (55-115 s).
7. [ui] **Coach priority and the kid's trail arrow.** The coach shows the live state of Dad's own reel or catch before "Explore" (138 s). Anchor the iPad arrow to a fixed target (the family leader's dot pulsing on the minimap) and stop it flipping (72/104/110 s).
8. [scene] **Mistmarsh depth and lingering vinyl.** Thin the pink veil so the pond has a dark-to-glow value range (mistmarsh.png); give the giant mushroom (discovery.png) and the waterfall foam ball (moonwell_tod-night.png) painted texture and soft alpha. Move the zeppelin envelope out of the Moonwell frame edge.

## Log row
| 22 | 6 | 6 | 6 | 5 | 6 | 4 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 4 | Moonwell and painted cottages best yet, every hook lands, TV+iPad+coach catch sync, campfire recap; camera judders frame to frame (36/58 s, 279 jerk flags), fishers stack on the Mistmarsh dock (117-170 s), reel invisible on TV, 4.5 s empty TV at start, rod upgrade deferred to campfire, trail arrow flips, 30 harsh/min stings, no trail ambience |
