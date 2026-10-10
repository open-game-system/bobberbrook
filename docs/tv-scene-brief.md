# TV scene brief: Bobberbrook Lake

The TV page's 3D scene. Three.js r186, WebGL2, procedural geometry and painted canvas textures,
plus the 21 painted fish sprites in `public/art/fish/<id>.webp`. Rendered at 1920×1080, 30–60 fps,
by a cloud GPU Chrome and streamed to a Chromecast. References: `concept/web/*.jpg` (01 key art,
02 catch moment, 03 hub, 13 group pool are the closest to the target).

## Look

- **Hand-painted fantasy-MMO diorama.** Chunky low-poly shapes with soft bevels, oversized rounded
  trees (clustered blob canopies), fat rounded rocks, saturated warm-cool colour, painted gradients
  baked into vertex colours or canvas textures, minimal specular. Toon-ish wrap lighting, soft
  shadows at 20–30 % of lit brightness, never black. `NeutralToneMapping`. A gentle grade and bloom.
- **Painted texture kit** (`public/art/textures/`, cut from one Codex sheet by `scripts/slice-textures.py`):
  WoW reads as hand-painted diffuse textures on simple shapes. Ground blends grass / moss / path / rock /
  lakebed in world space; canopies are clumps of alpha leaf cards (leaves-violet, leaves-fern) round a
  dark core; trunks get bark, boulders and cliffs rock, tower stone the stone tiles. New surfaces get a
  painted texture, never flat vertex colour alone.
- **Painted kit part 2** (round 11, `setPaintImages` in `painter.ts`): the prop texture array takes the
  Codex planks (docks, boardwalks, gangplanks, tower deck) and canvas (the airship) in place of the code
  painting, plus shingles (cottage roofs), runestone (tarn and moon-gate stones) and snow (frost rim,
  drifts, snow caps) layers; one program, the kind picks the layer.
- **Painted cards** (round 11, `cards.ts`): the campfire burns Codex flame licks (flame-a/flame-b crossfaded,
  swaying, half mirrored) with a rising embers card; the ride clouds are the cloud-a/cloud-b cumulus
  (premultiplied value cuts the black-keyed fringe, each card fades at its edges); lamp pools are the
  painted warm pool, additive. A builder with no card registered keeps its code painting.
- **Painted kit part 3** (round 12): Codex cards are cleaned for mipmaps at load (`cleanCardPixels` in `cards.ts`:
  opaque colour bled into every non-opaque texel). Pines carry the pine-spray boughs, frost pines the snow-laden
  pine-snow (snowy cones stay as the far stand-in); teal canopies use leaves-teal; every canopy's outer 22 % of
  cards (`splitRim`) use leaves-glow, whose bright strokes self-light at night; willows and giant trees hang
  painted wisteria curtains (`wisteriaCards`); bluebells, foxgloves and glow-caps (blue and violet planes) are the
  Codex cards (the code-painted fern rosette and grass stay: the Codex ones carpeted the foreground); crystals
  carry the crystal texture as an emissive gradient map (`crystal.ts`); pools of moonlight (pool-cool, additive,
  by moon) lie on the Moonwell lawn and in each clearing. Not used: embers-logs, forest-floor, glow-moss.
- **Painted giant mushrooms** (round 15, `giantCap.ts`): the Hollow's giant caps carry the Codex cap-teal / cap-violet
  painting laid on from above (planar, one painting per cap, the rim just inside its edge) and the radial gills painting
  fanned four times, mirrored, under the cap; one shared glow material (`bobber-giant-cap`, compiled at prewarm, never
  disposed with a place); the vertex colours carry only the cap's hue, the painted top-left light and a lifted rim lip;
  stems take the grain brushwork run up them.
- **Tent canvas** (round 15, `valance.ts`): the Codex tent canvas (violet cloth, gold trim) is layer 16 of the prop
  array, by explicit texture coordinates and keeping its own colour; the Mistmarsh pavilion and every lantern shrine
  hang a scalloped drape under their shingled eaves (the pavilion's lanterns hang just under its hem), and the boat's
  cabin canopy is tent canvas.
- **Round 16 (painted, not plastic)**: skin is its own painted kind (`PK.skin`: faint brush mottle, a top light to a
  warm rosy shade, a warm terminator band in the Lambert patch, a low rim; eyes, smile, glasses and freckles stay clean),
  the hat brim bakes a shadow over the brow, the blush is soft, and the character fill models the form (pow 1.35). The
  Hollow's roots are slim tubes under leafy fern/glow-rim garlands (the old tubes were jittered in world space into
  jagged dark planks); the giant trees' boughs carry leaf cards; giant caps push their painting's contrast, glow along
  the brightest strokes and darken inside the rim. Every small glowing toadstool (shore, giants, clearings, trails) is a
  Codex glow-cap card. Lamp and moon pools fade radially; the sky is a three-stop painted gradient with brush streaks
  and a broad sun/moon halo; the day haze is lilac, not grey; mist puffs take the sky light; the sea's shallows ramp is
  wide and noisy and fades at the coast; the boat wake is soft lines. The held fish sits in a plane through the
  mittens (each half in front of it), tilted head up, with a thin soft rim instead of a thick white halo.
- **Round 17 (soft light, soft water, soft fog)**: the golden swirl's pillar is a soft additive column (light by
  facing^3, so no edge faces the camera; rising noise streaks fray its top) standing in a glowing ring on the water; the
  sea's waterline is drawn from its signed distance, not the coarse ground cells (no water rectangle with a white rim at
  a boat dock); the fog of war is billowing painted mist that thins near the camera, its flat blanket layers fading as
  they turn edge-on; far oaks, willows and birches (75-300 m) are leaf-card clumps, not blobs; ponds darken toward the
  middle by the share of the way in, mirror a canopy line along the far banks, and lap with soft broken foam.
- **Painted ground underfoot** (round 13, `decking.ts`): everything the family stands on is painted. Boardwalk
  planks each carry one board of the Codex planks along the walk (explicit texture coordinates: `aPaint.x >= PK_UV`);
  decks, plinths, stepping stones and terraces are lathe-turned discs (`disc`) with a bevelled lip that takes a painted
  highlight and baked occlusion at the foot and under rails; the prop array adds stone tiles, rock and moss layers
  (tops and sides picked per triangle, `surfBy`); shrine and pavilion roofs are shingled.
- **Fewer, bigger, painted plants** (round 09-B): no carpet of small glossy props. Ground flora is a
  few clumps of painted alpha-card plants (`src/client/scene/plants.ts`: ferns, bluebells, foxgloves,
  glow-cap clusters, fallen-leaf drifts; canvas brushwork, matte, wind sway, only bell mouths and cap
  rims glow) with open painted ground between them, especially in the band in front of the camera.
  Mushrooms are matte painted (Lambert, baked light), glowing only at the rim (`matte.ts`).
- **Not** the previous OGS games' looks (no papercraft, no ink outlines, no felt).
- **No faces on objects** (bobbers, rods, boats, houses, the sun, the moon). Fishers have simple faces.
- No text in the 3D world except fisher name tags.

## The set (all positions come from `src/game/world.ts`)

- The lake: `lakeRadius(theta)` edge, water with painted depth gradient (turquoise shallows, deep teal
  middle), soft shoreline foam, gentle ripples, reflections of the sky and trees.
- West (`waterAt` = lily): lily pads and pink-white water lilies, cattails.
- North (falls): a stepped cliff with a big waterfall into the lake, mist, spray particles, mossy rocks.
- East (reeds): reed beds, a little fallen log.
- South: the wooden dock (`DOCK`), posts with rope, a lantern at its tip, a rowboat moored beside it.
- Land ring between the edge and `outerRadius(theta)`: grass with painted variation, wildflowers,
  `OBSTACLES` (oaks, pines, rocks exactly at those positions and radii), paths.
- Beyond the walkable ring: rolling hills with trees, a few village cottages with warm windows on the
  south-east hill, distant purple mountains, a painted sky dome with clouds.
- The campfire at `CAMPFIRE`: stones, logs to sit on, string lights between two trees.

## Time of day (`dayPhase(lake.startedAt, now)`, `timeOfDay`)

Morning (clear, warm-white sun, blue sky), golden hour (low orange sun, long shadows, pink clouds),
night (deep blue, stars, moon, fireflies, glowing windows and lanterns, the dock lantern), dawn (mist,
pastel). Night (round 10) keeps the indigo mood but reads: a silver moon key, a teal bounce from the
glowing water, warm pools of lamplight on the ground round lamps and cottages (`pools.ts`), a moon road
on the water, and a warm fill plus a cool rim on the fishers so their faces read on the TV. Lerp continuously; the light count stays fixed (no shader recompiles). By the campfire (round 11) the fishers' warm fill comes from the
fire itself (`CHAR_LIGHT.fire`, view-space fire position): the side away from it falls into shade and a cool
rim sits on it, so the family is lit by the fire, not self-lit. Sparkles and confetti fade where they would
cover a fisher's face (`Particles.setFaces`), and the catch bursts are capped (legendary 36 + 12/s).

## Fishers (from `lake.fishers`)

- Chunky big-headed little fishers (head ≈ 40 % of height), each in a seat colour (green, yellow,
  blue, pink) with a matching hat (bucket hat, rain hat, sun hat, flower hat), vest, boots, simple face.
- Walk/run cycle when moving (interpolate `pos` + `vel` from `movedAt`, smooth toward new server
  positions, never snap), idle sway, turning toward `facing`.
- **Painted clothes** (round 15, `character.ts`, `figurePaint.ts`): the Codex fishers' kit in the prop texture
  array (layers quilt 11, felt 12, leather 13, knit 14, rod wood 15; `PK_UV` moved 16 -> 32): quilted coats and
  sleeves, felt hats and trousers (fuzz band only), leather boots, belts and packs, knitted collars, hat bands and
  bedrolls, all neutral and tinted by the seat colour; rods 0-2 carry the rod wood along the shaft. Clothing parts
  bake soft occlusion from the figure's bulk (head, coat, arms, legs, pack as spheres) and a top light from shaded
  boots to lit shoulders into their vertex colours. The cool character rim follows the painted detail's value on
  clothes (no clean vinyl edge). Skin, faces, hair and the starlight rod are untouched.
- A small name tag (pill in the seat colour) above each head, readable at TV distance.
- Rod by tier `lake.rodTier`: 0 willow branch, 1 bamboo, 2 polished wood + brass reel, 3 starlight
  (glowing, sparkles). Visible change when `upgradeSeq` grows: a burst of light around every fisher.

## Fishing (per fisher `mode`)

- `cast`: rod swings, the bobber (red/white) flies on an arc to `bobber` over `CAST_FLIGHT_MS`, plop
  splash + ring ripples.
- `wait`: the line is a gentle catenary from rod tip to bobber; the bobber bobs; at each `nibbles[i]`
  a little dip and ripple.
- `bite`: a big splash, the bobber dives, a ring of white water. Clearly the most exciting thing on screen.
- `reel`: the rod bends, the line goes taut, a fish shadow thrashes at the bobber; when thrashing
  (`thrashingAt(fishDef.fight, reel, now)` from `src/game/reel.ts`) a splashing white-water burst; the
  bobber drifts toward the fisher with `reel.progress`.
- `catch`: the fish (its painted sprite as a camera-facing card, with a slight wiggle) is lifted out of the water
  in 0.3 s (from at most 2.2 m out toward the bobber, so a double catch never puts a fish between two fishers) into
  the fisher's hands and held across the chest with both arms forward, a mitten at each end (round 13; `chestHold()` in
  `holdCard.ts`: the visible fish fits between the chin and the feet, so it never covers a face; a big fish is held
  lower; the card sits on the view ray through the chest point, in front of the body; the visible fish is still capped
  at 2.8 m wide and 20 % of the screen), with sparkles; `catch.isNew` → a bigger golden burst
  and rays; `catch.golden` → gold confetti; junk (boot/teapot) gets a comic plop.
- `missSeq` grew: the fish splashes away (a small "got away" splash).

## Swirls (`lake.swirls`)

A school of fish circling just under the surface at `pos`: dark fish shadows going round, sparkles,
ripples, a slight lighter patch. `golden`: golden glow, a soft light pillar, golden sparkles. They
appear and fade (`since`, `until`), never pop.

## Camera

- **Group camera**: from the south, looking north over the lake, high three-quarter (like the group
  pool concept). Frames every fisher with margin, eases (no jumps), zooms in when everyone is close
  together, out when spread, within limits. Yaw stays roughly fixed (north is always "up" on the
  joystick). With no fishers: a slow establishing drift over the whole lake.
- **Split family** (round 10): while the widest pair of fishers is within 34 m (released at 38 m) the
  camera frames everyone, zooming out; only past that does it follow the active place and put the others
  on screen-edge markers (`FamilyFrame` / `SplitFocus` in `split.ts`).
- **Nothing between the camera and a fisher** (round 11): trees, lamp posts (path, trail, dock, mooring and
  tower lamps, with their glass), the tower's rails and mast and the moored vehicles dissolve through the
  occluder fade (`registerFade` in `geo.ts`); when one fisher stands behind another on the camera axis the
  group camera yaws (up to 0.5 rad) and lifts a touch until both read (`lineup.ts`, held against shuffling).
- **Calm** (round 11): the group framing sits in a soft dead zone (0.6 m + 3.5 % of the distance, 6 % of the
  distance, 0.03 rad) so shuffling fishers do not drift the shot; past it the critically damped follow takes the
  excess only. Leaving the campfire, and any jump across the world, cuts straight onto the family's own framing
  (25 % wide, a touch high) and settles in, never via the establishing view or a parked vehicle.
- **Framing guard** (round 13): fisher centres fit inside 0.70 NDC across (tags and shoulders reach ~0.08 past the
  centre line, so they stay inside the 10 % safe margin); the calm hold is dropped when it no longer fits, and while
  anyone is past the margin in the live shot the follow hurries (up to x3.2). A discovery frames the new pond whole
  with the family (its rim joins the fit, a little higher). A golden swirl within 40 m of the family joins the
  framing, and its light pillar (on the golden swirl nearest the lens) rises to 34 m from afar as a beacon.
- **Catch moment** (round 17): an eased push toward the catcher (~1 s in, held while the fish is up, ~1 s out); a second
  catch while the first fish is up keeps the push on the middle of both catchers (the safe-margin fit decides how deep).
- **Discovery** (round 17): a 5 s reveal swings round behind the family (a three-quarter yaw that keeps every fisher
  apart, at most 1.6 rad off the place view), up and out until the whole new pond lies beyond them, then back.
- **Campfire** (`lake.campfire`): the camera settles on the campfire; fishers sit around it. The seats are a horseshoe 2.9 m out, open on the camera's axis so the fire burns in the gap and never in
  front of a face (round 13); a fisher walking to a seat goes round the fire (`aroundFire`, 1.7 m clear); the flames add light
  but never alpha, so the character mask stays intact.

## HUD (owned by the TV React layer, not the scene)

The scene exposes `focalRect()` (screen rect of the action) so the HUD stays out of it. The React layer
draws edge HUD (journal count, rod meter, time of day). The scene draws name tags and in-world effects.

## Performance

- 1080p p95 frame ≤ 16.7 ms on a real GPU; a `lite` quality tier (software GL) that still reads well.
- Compile every shader at startup (also against the composer's render target); keep light count fixed;
  `renderer.info.programs` must not grow during play (expose under `window.__scene.info()`).
- Instancing for grass, flowers, reeds, lily pads, trees. Guard against NaN (bloom turns a NaN black).
- Dispose replaced meshes.
