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
- **Round 18 (fishers in the painting)**: the character mask is three-level (`CHAR_MASK` in `painter.ts`): the face's
  features write alpha 0 (never painted), skin 0.1 (a faint brush, 0.16), clothes, hats, boots and packs 0.22 (a gentler
  brush than the world, 0.4 vs 0.58); clothes take the world's grade and part of its painted value bands (0.45) and a
  banded character fill, so the family no longer reads as smooth vinyl figures pasted on a brushed world.
- **Round 18 (last glossy props)**: the boat has a round wooden gunwale and bow post, a shingled cabin roof and a tent
  canvas sail; the zeppelin's nose and tail cone are carved wood and its fins and flaps tent canvas; the campfire seat
  logs carry the rod-wood grain with pale cut ends; giant caps are hand-shaped (wavering rim, lumpy crown, banded
  painted light) and their pale strokes settle into the cap colour toward the rim; ride cloud banks are 14 smaller
  cards (cover from the painting's alpha, a long soft value ramp, hazier back cards).
- **Round 19 (painted figures, soft light, deep marsh water, hero silhouettes)**: the fishers' hair is painted in
  strands with a ragged edge of locks under every hat (sideburns, a fringe of three, locks round the back;
  `fisherShape.ts`, never in the face), felt brims wave (calm at the front), mittens have thumbs and knitted cuffs,
  the skull carries painted planes (cool rosy sides and back, hairline shadow, warm cheeks, a lighter brow), skin
  takes half the clothes' light bands and the fire fill on skin keeps half its colour. The golden pillar is a soft
  cone at ~0.4 of its old light that thins as it rises, with golden motes drifting up (`PILLAR_GAIN`). Mistmarsh
  water keeps Moonwell's cyan shallows and bright rim over a violet deep (calm 0.3). Falling water is drawn as
  painted droplet streaks along their flight (no round white discs, no ring of white puffs at a leap). Foreground
  plants and crystal shards within ~1 m of a sight line to a fisher dissolve (`applySightFade`). Cuts into and out
  of the campfire are brushed over by a painted dissolve of the last frame (`dissolve.ts`, 0.9 s; the camera still
  lands at once). Every generated place has a hero silhouette on its far side (`heroes.ts`): a colossal ancient
  tree with an elven platform (ring deck, upswept violet roof, hanging lanterns), or, beside a giant-tree
  landmark and sometimes otherwise, a hamlet of three larger cottages.
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

- A family by build (round 24, `fisherBuild.ts`): a named grown-up (`kid` false) stands ~1.3x a kid with long legs and a
  head ~29 % of the height; a kid (`kid` true) is small and chunky (head ~43 %); the little one (`kid` and `easy`) ~0.9x
  the kid. Each in a seat colour (green, yellow, blue, pink) carried by the hat and the vest (and a kid's shirt).
- Walk/run cycle when moving (interpolate `pos` + `vel` from `movedAt`, smooth toward new server
  positions, never snap), idle sway, turning toward `facing`.
- **Painted clothes** (round 15, `character.ts`, `figurePaint.ts`): the Codex fishers' kit in the prop texture
  array (layers quilt 11, felt 12, leather 13, knit 14, rod wood 15; `PK_UV` moved 16 -> 32): quilted coats and
  sleeves, felt hats and trousers (fuzz band only), leather boots, belts and packs, knitted collars, hat bands and
  bedrolls, all neutral and tinted by the seat colour; rods 0-2 carry the rod wood along the shaft. Clothing parts
  bake soft occlusion from the figure's bulk (head, coat, arms, legs, pack as spheres) and a top light from shaded
  boots to lit shoulders into their vertex colours. The cool character rim follows the painted detail's value on
  clothes (no clean vinyl edge). Skin, faces, hair and the starlight rod are untouched.
- **Rod carried, not levelled** (round 21, `rodSling.ts`): walking, riding and stepping ashore, the rod rests over the right
  shoulder (butt in the mitten at the chest, tip up and back over the pack); standing still at the water (where the
  world's `castFrom` would cast, after 0.7 s) it comes to hand held ready, tip up; fishing modes always hold it in hand.
  The rods hang off the fisher's root and are blended each frame between the hand and shoulder mounts.
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
- **Round 18**: Mistmarsh's boardwalk posts and rope rails dissolve with the lamp posts; entering the campfire lands on
  the fire with the family seated (like leaving it), never a flight over the land; when a fisher stands in line a few
  metres in front of another in a tight framing, the group camera steps back up to 16% so the near back never looms.
- **Catch moment** (round 17): an eased push toward the catcher (~1 s in, held while the fish is up, ~1 s out); a second
  catch while the first fish is up keeps the push on the middle of both catchers (the safe-margin fit decides how deep).
- **Round 20, every place framed like Moonwell**: the group camera keeps a place's own side while the family fishes
  that side of the pond and swings round when they fish further round, until it stands no more than 0.75 rad off
  straight behind them, looking over their shoulders across the water (`placeView.ts`; Mistmarsh's boardwalk shore was
  framed from across the pond). Bobbers, the pond point and a golden swirl are soft focus points: they shape the group
  shot but a catch push-in may leave them, and the push aims 1.2 m up the catcher (it aimed at the fish overhead, so
  only the weakest push fitted). Lines are drawn taut over a walk over the water and a reeled bobber stops at its outer
  edge (`walkways.ts`).
- **Round 21, nothing over a fisher, generally** (`cover.ts`): every scenery material in the scene takes the cover fade by
  default (patched before the shader prewarm and on whatever the streams build later), so no new prop class can break the
  veto; only subtrees marked `userData.coverExempt` keep their look (the fishers, ground, water, sky, effects, the vehicles
  the family rides, the campfire seat logs). Per fragment, anything inside a framed fisher's screen box (body +-0.5 m, feet
  to hat), not behind the fisher at that height and above their feet (decks and paths stay), and anything in the near band
  (nearer than 0.42-0.62 of the nearest fisher's depth: a push-in clears hanging strands and drapes across the frame)
  dithers to 0.15 of its pixels. Every program compiled at prewarm is kept alive (`keepPrograms.ts`), so the showroom's
  disposal never forces a mid-play compile. The lab's cover check (`window.__scene.coverCheck()`, an ID-mask pass with the
  dither off, in `shoot-scene.mjs` for every shot) fails a shot where scenery still covers more than 2 % of a fisher's body.
- **Round 21, never lined up on the camera axis** (`screenSpread.ts`): after personal space, any two fishers within 5 m
  of each other along the view and nearer than 1.3 m across it are drawn eased apart across the screen (each half, along
  the camera's right); a fisher on Moonwell's dock or Mistmarsh's boardwalk slides along it instead (`walkTangent`), so a
  family on a dock spreads along it; offsets are capped at 1.6 m and the rules' positions are untouched. Riders step aboard
  and ashore in a row across the view (`ashoreOffset`, 1.4 m apart), not on a ring.
- **Round 22, a friendly miss, painted cottages, a cheaper fade**: a missed fish shows a bright orange forked tail (two round
  lobes, golden tips) turned flat to the camera; it pops up, waggles twice, slaps and dives (`escape.ts`, `tailPose`), the
  bobber springs back up from its dive (`missBob`) and a wider ring spreads after the splash; never a dark fin. Cottage walls
  are the kit's carved stone tiles (plinth rock, grain eave band). Mistmarsh's haze is thinner and bluer (fog K 0.34 at the
  full distance, mist 0.3, a cooler fill) over deeper moss. Leaf and wisteria cards take the cover fade per card corner
  (`userData.coverPerVertex`, box padded 0.9 m) and draw their outermost cards first, which put Mistmarsh back in budget;
  the prewarm draws the fisher set in front of the lens so the first catch builds nothing. The cover check leaves out the
  seat ring at a fisher's feet (a ground decal, `userData.coverCheckSkip`).
- **Discovery** (round 17; round 18: it waits, up to 6 s, until a fisher is within the pond plus 45 % of the clearing, so it plays as the family arrives at the water, `revealGate.ts`): a 5 s reveal swings round behind the family (a three-quarter yaw that keeps every fisher
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

## Round 23

- **A steady camera** (`camera.ts`, `cameraJudder.ts`, `scripts/camera-trace.mts`): the catch push-in runs on its own
  clock (`catchWeight`: in 0.9 s, held to 2.2 s, out by 3.2 s, continued after the scene drops the catch) and is laid
  on top of the followed framing after the springs (`pushPose`), its strength chosen once per catch; the framing under
  it holds still. The lineup holds a turn at least 1.6 s and eases back only after 4 s. The discovery look is an
  absolute yaw (no doubling when the place's side swings mid-reveal). The look-ahead follows the fishers' feet only;
  the follow hurries for fishers only. Measure: no pan or turn over 0.4 degrees, or zoom over 8 %, that turns back
  within 1 s (`camera.judder.test.ts` replays 48 s of a live Moonwell trace).
- **Nobody behind anybody on an end-on dock** (`screenSpread.ts`): the fisher on the bank takes the whole push when the
  other stands on a walk running along the view; two on such a walk part along it in depth. 1.6 m across, 7 m deep.
- **The reel reads from across the room** (`fishers.ts`, `fx.ts`): a deeper bend and a rod tip that whips side to side
  on a thrash, rings pulsing out from the bobber that grow as the fish comes in, a bright crown burst every 0.45 s and
  a jerking bobber while the fish thrashes. Water and light only. Lab: `reel-thrash`.
- **No empty TV at start** (`opening.ts`): a painted still of the establishing view (`public/art/scene/establish.webp`)
  covers the canvas while the scene compiles and dissolves into the live lake after its first frame.
- **Last vinyl**: falls spray is a faint drifting veil (no white ball at night); Mistmarsh's deep is dark indigo and its
  own blue haze wins over the golden hour's rose; giant caps carry a painted value break-up; an idle airship moored on
  its tower's camera side stays up and away until boarded (`placeSideYaw`), so no envelope cuts Moonwell's frame edge.

## Round 24

- **A family, not four peg dolls** (`fisherBuild.ts`, `character.ts`): the build comes from the rules (`Fisher.kid`,
  `Fisher.easy`); grown-ups have a lathe-turned chest and waist, long legs, a smaller head; kids a round tummy and a
  big head. Name tags sit 0.3 m above the hat of that build. The catch is held against the chest with the mittens
  under the fish (not arms wide); reeling braces the feet apart and rocks with the crank; grown-ups walk with longer,
  slower steps and sit on the log with their feet on the ground. The lab marks Juneau and Sis as kids, Sis easy.
- **Faces** (`fisherFace.ts`): shaped heads (a kid's full low cheeks, a grown-up's longer face, jaw and chin), eyes with
  whites, brown irises, pupils, two shines, an upper lid and lashes (all but Dad), arched brows, a nose; Dad's beard
  in strands with a moustache; peach skin (0xf4cbb0). Natural faces on fishers only.
- **Clothes from concept 08**: a shirt (cream; a kid's tinted by the seat colour) under an open vest with chest
  pockets, a bandana at the neck, belt pouches, knee patches, boot cuffs, a grown-up's sleeves rolled to the elbow.
- **Nobody stacked as the TV sees them** (`screenStack.ts`): after the world spacing, each fisher's body box (feet to
  hat, the brim or a held fish included) is projected with the TV camera and overlapping pairs ease apart across the
  screen, staying on ground anyone can stand on. A pair keeps its side until one has really walked past the other
  (`pairSide`, 0.8 m), so nobody swaps sides on screen. Lab: `mistmarsh-dock-foot`, `__scene.stackCheck()` and the
  shoot's stack threshold (2 % of a fisher or their held fish covered by another fisher).
- **The catch push keeps whole bodies in frame** (`camera.ts`, `PUSH_PAD` 0.8 m either side of every fisher).
- **Golden hour is light, not a tint** (`tod.ts`): a low amber key from the west over a cool lilac-blue and teal fill,
  lilac fog, a near-neutral grade.

## Round 25

- **Nothing in front of a fisher, part 2** (`geo.ts` `setBeside`): posts, lantern posts, rope collars, rails and
  every lamp glass dissolve inside each framed fisher's screen box (padded 0.9 m either side, feet to hat) from
  the lens to 4 m behind the fisher, so no lantern stands between or just behind two fishers at a catch. One
  material per kind with the trees' program (`occluderMaterial(u, 1)`, a uniform apart), registered as the fade
  material for posts.
- **The join card is a keep-out corner** (`camera.ts` `KEEP_X`/`KEEP_Y`, `keepLift`, `inKeepOut`): left of NDC
  -0.62 the fit's floor is -0.63 instead of -0.74, and the push and the follow's hurry treat the card's corner
  as outside the safe box. Tested in `camera.keepout.test.ts` (the lab has no TV HUD).
- **Spacing from where walkers are drawn** (`fishers.ts`): the spacing passes start from each fisher's
  dead-reckoned position, not the last snapshot (walkers are drawn up to 1.2 s ahead, each by its own lead, so
  a trail walk stacked although the passes saw it apart). Lab: `trail-file` (the family single file).
- **The lab checks measure the still** (`scripts/shoot-scene.mjs`): the rules pause, the cover and stack checks
  run in one task and the still is taken right after; frame times and programs are read before the checks.
- **Cottages** (`kit.ts` `cottageGeometry`): half-timbered: a carved stone course, warm cream plaster, timber
  posts, rails, braces and rafter tails, a carved door frame on a step, window sills, lintels and mullions, amber
  glass at the hamlets.
- **Giant caps** (`giantCap.ts`): matte: the painting's broad light divided out, its big pale spots painted over
  (small chalky cores kept), mottling at two scales, a dark rim band and lip, a value ceiling; darker gills;
  fibrous stems.
- **Fishers**: painted vests with dark piping, a leather strap and buckle and big pocket flaps; a grown-up's
  waist and shoulders; a soft contact shadow under every fisher; a walk with a wider arm swing, a roll and a nod.
- **Golden hour**: a paler amber key (canopies no longer go red under it).

## Round 26

- **Where fishers stand** (rules, `src/game/spots.ts`): fishing spots keep clear of the bank's props (Moonwell's
  campfire, Mistmarsh's two boardwalk feet) and, near anyone fishing, stand at least 2.2 m to the side of them as
  the TV sees the place (the group camera's side of a place is the same `placeYaw` the scene uses, now in the
  rules) and no more than 1.5x that apart in depth. Moonwell's campfire moved back off the south bank to
  (0.5, 27.2), below the spawn row: the campfire shot is unchanged in kind, the fishing bank has no fire on it.
  Lab: `moonwell-spawn`, `mistmarsh-tag`, `mistmarsh-tag-wait` (a kid who never steers, tagging along and
  pressing the big button by the rules).
- **A push-in on every catch, held** (`camera.ts`): the push holds at full for 2.5 s (to 3.4 s, the rules' catch
  show) and eases out over a second; a catch landing while a push is on continues it from its weight, and a second
  catcher joining during the hold holds it 2.5 s more (the scene reports the latest catcher's age); the framing under
  the push is released as it starts easing out. The held fish stays up to 3.0 s.
- **The top banner band is a keep-out** (`TOP_X`/`TOP_Y`, `keepDrop`): no name tag or body above NDC 0.6 within
  0.5 of the centre (the catch ticket), like the join card's corner; the push aims 1.4 m up the catcher. Pushes are
  a little shallower where a deeper one would lift a tag into the band.
- **Golden hour's sky** (`sky.ts`): a painted gradient from under the true horizon (the TV sees the sky over the hills
  at or below it, where the dome was one flat colour): warm on the sun's side, peach, rose, then the air's own lilac
  before the zenith; the sun's halo is laid over the gradient instead of added past what the tone map shows.
- **Mistmarsh at night**: two lanterns in the shallows of the near (south) shore with warm pools of light spilling up
  the bank round the fishers' feet; more ferns, flowers and bluebells in marsh clearings.
- **The held fish has volume** (`fishviz.ts` `CatchCard`): its own subdivided card bows toward the lens and the tail
  end flicks while it is held; the painted sprite carries a darker back, a lit band along the flank, a shaded belly
  and the far side of the body showing under it. The mittens still cross in front of the fish (not fixed this round).
- **Giant caps** (`landmarks.ts`): a deeper wavering rim, a lumpier crown, a rim that droops here and curls there,
  a soft dent off the crown.
