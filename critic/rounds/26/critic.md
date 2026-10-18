# Round 26 critic

Evidence: scene/ (lab shots, metrics), check/, session.mp4 (89 s, TV | Dad | Juneau), phones/ strips, audio-report.json, spectrogram. Graded against the named references and TASTE.md only.

## First-time-player read of session.mp4 (what caused each outcome)

| t | Outcome | Can I explain it from the screens? |
|---|---|---|
| 8-15 s | Dad catches a Bubble Puffer | Yes. His bobber close-up dips, the button turns into an orange fish (tap), then a green reel dial with "hold, let go when it splashes" on the coach line, then the catch card. |
| 12.5-30 s | Juneau reels for about 17 s before his Brook Trout lands | No. His iPad flips between the green and orange dial about 6 times. The TV shows nothing at his bobber that says "winning" or "losing", and nothing on any screen says whether the fish nearly got away. The marks log "Juneau casts" at 25.1 s mid-reel, so either the rig mislabelled it or the fish got loose and was re-hooked with no cue. Either way it's unreadable. |
| 33-47 s | Everyone walks to Mistmarsh | Yes. The coach says "Explore! Follow a trail into the fog", the iPad shows a big green arrow, and there's a NEW PLACE Mistmarsh ticket plus a pink star burst on the iPad at 46-47 s. |
| 51.8 s | "Juneau tagged along" | No. Juneau walked there himself. Nothing on the TV or the iPad shows a tag-along beat. |
| 57.9 / 71.6 s | Juneau hooks | Partly. His iPad never shows a bite state: the button stays a bobber, and the close-up only gets a faint shadow (phones/4-bite-ipad.png against the phone's orange fish in 4-bite-phone.png). Then it jumps to the reel dial. I can't tell whether he hooked it or it auto-hooked. |
| 79 s | "Bamboo rods for everyone!" | Partly. The only cause on screen is a thin shell bar at the TV's top right and an earlier coach line, "12 more shells...". The TV never ties shells to catches. |
| 79.5 s | Campfire | Yes, through Dad's Campfire tile, and the recap cards fill in along the bottom. |

Four or five of seven are explainable, and the two core-loop outcomes (the kid's reel and the kid's hook) are not. Onboarding stays at 5.

## Scores

| Row | Score | Evidence |
|---|---|---|
| Art direction & cohesion | 6 | The violet/teal palette holds across the TV, iPad and phone (moonwell.png, f5). The fishers still read as glossy vinyl toys (campfire.png faces and hands), and the Hollow giant mushroom caps are smooth plastic discs (hollow.png). Side by side with ref-night.jpg, there's no painted brushwork on the hero assets. |
| Environment & set dressing | 6 | Moonwell has a waterfall cliff, cottages, a tower, lily pads and bluebells (moonwell.png). Mistmarsh is a grass lawn with a pond cut into it. The bottom third of mistmarsh.png and hollow.png is empty dark lawn, and there's no Ashenvale-scale colossal tree in frame. |
| Water & fishing FX | 6 | Moonwell's teal shallows-to-deep gradient is good (four-reel_tod-night.png). Mistmarsh water is flat lavender with no depth (mistmarsh.png). The reel thrash is a couple of thin rings at Dad's feet (reel-thrash.png). The golden swirl is a soft glow decal (golden-swirl.png). |
| Characters & animation | 6 | The concept builds and faces read (campfire.png, double-catch.png). The held fish are out of scale: a 20 cm Bluegill covers Dad's whole torso (session 55.4 s). The idle and walk on the trail (36-46 s) are stiff, with no secondary motion. |
| Lighting, time of day & mood | 6 | Night is the best frame (four-reel_tod-night.png). Golden hour is only a pink sky tint over the same twilight (moonwell_tod-golden.png against moonwell.png). The lighting is flat across the Mistmarsh lawn: no warm key pools on the fishers. |
| Camera & composition | 5 | Juneau stands shoulder to shoulder with Dad at the Moonwell dock foot (9-30 s), and his line is drawn across Dad. At Mistmarsh they stack at the dock foot from 52 to 77 s, with dock lantern posts behind Juneau (61.8 s). Dad is edge-cropped on the trail at 40-42 s. There are 34 camera_jerk warnings (30, 42, 47, 62 and 76 s). |
| Catch moment & payoff | 6 | The TV ticket, the held fish, Dad's card and Juneau's star card all sync (25-30 s, 61-62 s, the double ticket at 76 s). There's no leap out of the water. The push-in is mild. The Mistmarsh double catch has no audible sting (audio sections from 70.8 s: -19 to -26 dBFS, 0 onsets). New species aren't staged any differently from repeats. |
| Game feel & responsiveness | 5 | Presses answer on the device, but Juneau's 17 s reel (12.5-30 s) is a tug of war with no readable state on the TV. Bobbers land a metre from the fishers' feet (golden-swirl.png, reel-thrash.png), so the cast has no arc or distance. |
| Kid & little-kid UX | 6 | It's wordless, the trail arrow and the big buttons are good, and the catch card is big (strip-ipad.png). The iPad has no bite state (4-bite-ipad.png is the same button as 3-waiting), and the reel only flips colour. A 5-year-old won't know when to tap. |
| Grown-up phone UI | 6 | The coach lines are good and timely ("Juneau is reeling: hold the button, let go when the fish splashes!", "Point at the TV: can Juneau spot the swirling fish?"). The tile row and the rod bar are tiny at 393 px. "Ask Juneau which fish they hope to catch next" (45 s) is generic. It still feels like a dev panel, not first-party. |
| Progression & variety | 6 | New species at the new place (Bluegill, Stripy Perch, Lily Carp), the journal count at 6/30, a live Bamboo rod upgrade and the campfire recap strip. The upgrade cause (shells) is invisible on the TV. |
| Audio | 5 | Moonwell hooks hit 50 harsh/min and catches 33 harsh/min. Juneau casts at Mistmarsh hit 32 harsh/min. The Mistmarsh hooks and the double catch are near silent (0 onsets, -26 dBFS). The trail (33-47 s) is almost bare in the spectrogram. |
| Onboarding & legibility | 5 | See the table above. The kid's reel outcome and his hook are not explainable, and "tagged along" has no visible beat. |
| Performance & stability | 6 | Most lab p95s are 16.8 ms, but far-place and mistmarsh p95 hit 33.3 ms. The session froze for 1.1-2.6 s and had a pop-in at 3.47 s, and the phone panels are blank grey for the first ~3 s. The check rig timed out on an iPad click, and a TV ticket overlaps the focal area by 86 px (check.log tv-empty-lake). |

## Largest actionable gap

**The kid's fishing loop isn't readable on the iPad or the TV.** Juneau gets no bite state, a 17 s reel whose only feedback is the button flipping green and orange, and no TV-side tension cue at his bobber. A 5-year-old can't tell when to tap, whether he's winning, or why the fish landed. This one gap holds down Feel, Kid UX, Onboarding and Catch together.

## Top 8 fixes (score impact per effort)

1. **[ui] Give the iPad a real bite state.** On the bite, swap the bobber button for the same orange fish-icon button the phone gets (4-bite-phone.png). Add a pulse, plunge the bobber in the close-up, and fire a one-shot haptic and sound. Today 4-bite-ipad.png looks the same as 3-waiting. (Kid UX, Onboard, Feel)
2. **[scene] Make the reel tension readable on the TV.** Draw a taut, bent line plus a thrash splash and ring burst at the hooked fisher's bobber while the fish pulls, and calm water while you may reel. Today 12.5-30 s shows nothing at Juneau's bobber, and reel-thrash.png is two thin rings. (Water, Feel, Onboard)
3. **[rules] Cap the kids' reel at about 5-6 s, or at most 3 pull/let-go cycles.** Then any lost fish needs a visible, gentle got-away beat (no fin, nothing scary). Juneau's 12.5-30 s reel is 3x a 5-year-old's attention, and the 25.1 s "casts" mark mid-reel needs explaining. (Feel, Kid UX)
4. **[scene] Hard minimum spacing between fishing spots in screen space, and move Mistmarsh's kid spot off the dock foot.** Dad and Juneau touch at 9-30 s (Moonwell dock) and 52-77 s (Mistmarsh dock foot), with Juneau's line across Dad and lantern posts behind Juneau (61.8 s). Spread them along the bank like moonwell.png already does for three fishers. (Camera)
5. **[audio] Fix the catch and hook sting mix.** Low-pass or soften the hook and catch transients above 3 kHz at Moonwell (50 and 33 harsh/min). Make sure the Mistmarsh hook and catch play at all: the sections from 70.8 to 79 s are 0 onsets at -19 to -26 dBFS. Add trail ambience (birds and wind) for 33-47 s. (Audio, Catch)
6. **[scene] Scale the held fish by species length, and give the catch a leap.** A 20 cm Bluegill should sit in two hands at the chest, not cover the torso (55.4 s). Add a short arc where the fish leaps from the water to the hands before the hold-up, then push in. (Chars, Catch)
7. **[scene] Paint the hero shapes.** Put the texture kit's brushwork on the fisher clothing and skin (reduce specular to near zero) and on the Hollow mushroom caps (hollow.png). Add a foreground Ashenvale colossal trunk or root framing to the Mistmarsh and Hollow compositions to fill the empty dark lawn in the bottom third. (Art, Env)
8. **[rig] Fix the rig.** Fix the 1.1-2.6 s frozen start and the grey phone panels. Fix the iPad check click timeout. Log got-away and auto-hook events so outcomes like 12.5-30 s and the 25.1 s "casts" mark can be told apart. Re-run the TV ticket focal-overlap check (86 px on tv-empty-lake). (Perf, Onboard evidence)

## Log row

| 26 | 6 | 6 | 6 | 6 | 6 | 5 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 5 | Moonwell night, catch sync (TV + phone + iPad star card), trail arrow, live Bamboo upgrade and campfire recap land; iPad has no bite state and Juneau's 17 s reel (12.5-30 s) is unreadable on the TV; Dad and Juneau touch at both dock feet (9-30, 52-77 s); 20 cm Bluegill covers Dad's torso; Mistmarsh flat water, double catch silent, Moonwell stings 33-50 harsh/min; glossy fishers and plastic Hollow caps; 34 camera jerks, frozen start |
