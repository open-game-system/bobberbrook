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
- **Catch moment**: an eased push toward the catcher for ~2 s then back, only when one catch is up at a time
  (`catchFocus` drops the push for a catch that ever shares the screen with another).
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
