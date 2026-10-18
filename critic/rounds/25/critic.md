# Round 25 critic

## First-time-player read of session.mp4 (Onboarding)

What happened, and what on screen caused it:

1. **Dad's Bluegill (81–84 s): explained.** Bobber splash on the TV, orange fish button on the phone, coach line "Your bobber dipped: tap now!", then the green reel dial and "Hold to reel it in". Cause and effect are readable.
2. **Juneau's first fish gets away (74.6 → 75.6 s): not explained.** The iPad shows the orange fish button. One second later it is back to a resting bobber, and a dark shadow slides off in the bobber view. Nothing on the TV marks the escape. The coach explains it ("Juneau's fish got away: tap as soon as the bobber dips") only at 86.5 s, 11 s late and over Dad's catch. I can't tell whether Juneau was late or the fish escaped mid-reel.
3. **Juneau gets no catch for 50 s (76–128 s): not explained.** He stands on the shore while bites come and go. The coach repeats "got away" lines (121 s), and the TV shows no hint of a missed bite.
4. **Juneau's Brook Trout (133–139 s): explained.** Reel dial, ring fills, push-in on Juneau holding the trout, and the card on the iPad.
5. **The family leaves Moonwell (142 s): half explained.** "Explore! Follow a trail into the fog" appears only on Dad's phone. The TV gives no cue.
6. **Golden swirl (160–215 s): not explained.** The coach says "A golden swirl along the shore! Race there". A yellow arrow appears on the iPad and the beam shows on the TV (160 s). Nobody fishes it, and the next line drops it.
7. **Mistmarsh found (230 s): explained.** A "NEW PLACE Mistmarsh" banner on the TV and a pink star burst on the iPad. Good.
8. **Bamboo rods for everyone (280 s): weakly explained.** The shell meter fills, but the upgrade is the third line in a stacked ticket box. There is no rod-swap beat on the TV.

Four of the eight outcomes can't be explained from the screens alone, so Onboarding is capped at 5.

## Scores

| Row | Score | Evidence |
|---|---|---|
| Art direction & cohesion | 6 | The Ashenvale palette holds across the TV, iPad and phone, and the moonwell-teal water with violet canopies is cohesive (moonwell_tod-night). The golden-hour sky is a flat orange cut-out band with a jagged edge behind the canopies (moonwell_tod-golden, four-reel_tod-golden). Hollow's giant mushrooms are smooth vinyl caps (hollow.png). The fishers still read as glossy toys. |
| Environment & set dressing | 6 | Moonwell has identity: waterfall cliff, dock, purple cottages, tower deck. Mistmarsh at night has a flat, empty blue floor across its bottom third and a thin generic boardwalk (mistmarsh_tod-night). Moonwell's campfire sits right on the fishing bank, so Juneau fishes from inside it (66–139 s). |
| Water & fishing FX | 6 | Glowing painted water, a crisp bite splash with rings (80 s, hollow.png). The swirl is a flat glowing disc (moonwell_tod-night, right). No shore foam. Mistmarsh water is flat lavender. Juneau's bobber lands in Dad's lane and the lines cross (100 s zoom). |
| Characters & animation | 6 | Concept faces read well in push-ins (mistmarsh-catch, 139 s). The held fish is a flat sprite pasted over the chest with sausage-blob hands on top (mistmarsh-catch). Flames and embers pass through Juneau's legs for about 70 s (100 s crop). Dad snaps from back-turned to facing the camera with the fish between 81 and 82 s. |
| Lighting, time of day & mood | 6 | Moonwell night is the best frame in the set: moon, god rays, lamp glows. Golden hour is a pasted orange sky over magenta trees (moonwell_tod-golden). Mistmarsh night is a monochrome blue wash with no warm key on the fishers (mistmarsh_tod-night). |
| Camera & composition | 5 | Moonwell push-ins land (83 s Dad, 139 s Juneau). Mistmarsh catches get no push-in, and Dad sits behind Juneau and the dock posts for all four catches (252–280 s). Juneau walks inside Dad's silhouette on the trail (240 s). The lab four-reel stack check fails at golden, night and dawn (0.021–0.032). The stacked ticket box covers Dad's name tag (263 s, 280 s). |
| Catch moment & payoff | 6 | The fish is held up, and the TV ticket, iPad card and coach line sync (84 s, 139 s). The beat is about 3 s and pulls out abruptly (84 → 84.7 s). The Mistmarsh double catches stay wide and small (262–280 s). New species are marked only by a ★ in the ticket. |
| Game feel & responsiveness | 5 | Device button states change instantly: rod, bobber, fish, reel dial. A hook press at 74.6 s becomes "got away" at 75.6 s with no tactile or visible reason. Thrash shows only as the reel button turning orange (263 s), with nothing on the TV line. |
| Kid & little-kid UX | 6 | Wordless iPad with big, clear states, and the discovery star burst lands (230 s). "Hold" vs "tap" isn't signalled: the reel dial icon looks like a tap button. The miss is a vague shadow. The green follow arrow on the iPad flips direction tile to tile (session-tiles, rows 2–4). A pencil "type your name" icon is still on the kid hat picker (check/kid-hat-picker), which risks the no-words veto. |
| Grown-up phone UI | 6 | Coach lines prompt talk ("Ask Juneau which fish they hope to catch next"). They also go stale or point at the wrong person: "Juneau has a bite! Tell them: tap now!" while Dad is reeling (phones/5-reel-phone), and "Juneau's fish got away" over Dad's catch (86.5 s). The phone text is about 9 pt at 393 px wide. The four-tile menu and the rod bar feel like a settings panel. |
| Progression & variety | 6 | Journal 5/30, rod meter to Bamboo, a new place with its own fish (Lily Carp, Pond Pike, Stripy Perch), and the campfire recap strip (286–289 s). The golden swirl is called and then abandoned (160 s). The rod upgrade is buried (280 s). |
| Audio | 5 | The mix sits at -11 to -14 dBFS RMS the whole session (audio-report), which is hot for a cozy TV bed. Juneau's Moonwell catch hits 32 harsh/min, and the campfire 8/min. The spectrogram shows a dense constant tonal bed with sting spikes to about 10 kHz. Mistmarsh stings are softer (0–9/min). |
| Onboarding & legibility | 5 | 4 of 8 outcomes are unexplained (see above). The coach line arrives 11 s after the event it explains (75.6 → 86.5 s). |
| Performance & stability | 6 | Lab p95 is 16.8 ms almost everywhere and shader programs stay flat (90/91). Mistmarsh p95 is 33 ms at morning, golden and night (scene.log). Four hero moments weren't reached. The painted still is up at 4 s (tv-empty-lake). 457 camera_jerk flags were recorded under load. |

## Single largest actionable gap

**Where fishers stand.** The game picks shore spots that ignore props and the camera, so on every lake someone is hidden or clipping. Juneau fishes from inside the Moonwell campfire for about 70 s (66–139 s, flames through his legs). Dad stands behind Juneau and the dock posts for all four Mistmarsh catches (252–280 s). The lab four-reel stack check fails at three times of day. This one system drags down Camera, Characters, Catch and Environment together.

## Top 8 fixes (score impact per effort)

1. **[rules][scene] Make the shore-spot picker aware of props and the camera.** Exclude prop footprints (campfire, dock posts, lamp posts, boat) with a radius check, and use the place's camera yaw to spread fishers along the screen x-axis, at least one silhouette width apart, rather than only 3.5 m along the bank. Move Moonwell's campfire off the fishing bank. Targets: Juneau in the fire (100 s), the Mistmarsh dock stack (262, 280 s), lab four-reel@golden/night/dawn.
2. **[scene] Give every catch a push-in, including simultaneous ones.** Mistmarsh catches stay wide (262–280 s). Frame both catchers in a two-shot for a double catch. Hold the push-in at least 2.5 s and ease out over about 0.8 s, rather than the 84 → 84.7 s snap.
3. **[ui] Turn the catch ticket into one line at the top edge.** Queue it (one visible at a time), and never let it cover a name tag (263 s, 280 s). Give "Bamboo rods for everyone!" its own beat: a TV rod-swap sparkle on every fisher plus a rod icon pulse on each device, rather than a third ticket line (280 s).
4. **[rules][ui] Make "got away" legible at the moment it happens.** Show a tail-flick splash on the TV bobber, a bobber pop and empty ripple on the iPad, and the coach line within 0.5 s rather than 11 s later (74.6–86.5 s). If a press inside the hook window can still lose the fish, either remove that for kids or show why (the line went slack while the button was released).
5. **[audio] Re-gain the master.** Bring the ambient bed to about -20 dBFS RMS with 6 dB of headroom for stings. Low-pass the catch sting above about 4 kHz with a softer attack: the Moonwell Juneau catch is 32 harsh/min, the campfire 8/min. Duck the music bed under catch voice lines.
6. **[ui] Ground coach lines in the current state.** Pick the line from the reader's own fisher first, then the kid's. Drop event lines older than 3 s. Never tell Dad "Juneau has a bite" while Dad is the one reeling (phones/5-reel-phone). When the golden swirl expires or the family leaves, say so instead of dropping it silently (160 → 215 s).
7. **[scene] Replace the golden-hour sky.** Swap the flat orange cut-out band (moonwell_tod-golden, four-reel_tod-golden) for a painted gradient skydome with cloud bands and horizon haze. Fill Mistmarsh's empty night foreground floor with textured ground blend and ground cover (mistmarsh_tod-night). Add a warm lamp key near the fishers at night.
8. **[scene] Give the held fish some volume.** Use a slight bend or two crossed cards with thickness, hands gripping from behind, and a 2–3 frame tail wiggle, rather than a flat sticker with blob hands in front (mistmarsh-catch). Repaint Hollow's vinyl mushroom caps with the painted texture kit (hollow.png).

[rig] notes: four lab hero moments weren't reached (morning@0.97 and four-reel at golden, night and dawn). The tv-empty-lake overlay is still up at 4 s under load. The session recorder froze 7 times between 48 and 120 s.

## Log row

| 25 | 6 | 6 | 6 | 6 | 6 | 5 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 5 | Moonwell night and push-ins best yet, Mistmarsh discovery beat lands, campfire recap; Juneau fishes from inside the Moonwell campfire (66-139 s), Dad stacked behind Juneau + dock posts for all Mistmarsh catches with no push-in (262-280 s), lab four-reel stack fails x3; got-away unexplained (74.6 s, coach 11 s late); rod upgrade buried in ticket stack (280 s); flat orange golden-hour sky; mix -13 dBFS, 32 harsh/min Moonwell catch |
