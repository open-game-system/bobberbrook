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
pastel). Lerp continuously; the light count stays fixed (no shader recompiles).

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
- `catch`: the fish (its painted sprite as a camera-facing card, with a wiggle) leaps out of the water
  on an arc into the fisher's hands, held up high, with sparkles; `catch.isNew` → a bigger golden burst
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
- **Catch moment**: an eased push toward the catcher for ~2 s then back (only when one catch at a time).
- **Campfire** (`lake.campfire`): the camera settles on the campfire; fishers sit around it.

## HUD (owned by the TV React layer, not the scene)

The scene exposes `focalRect()` (screen rect of the action) so the HUD stays out of it. The React layer
draws edge HUD (journal count, rod meter, time of day). The scene draws name tags and in-world effects.

## Performance

- 1080p p95 frame ≤ 16.7 ms on a real GPU; a `lite` quality tier (software GL) that still reads well.
- Compile every shader at startup (also against the composer's render target); keep light count fixed;
  `renderer.info.programs` must not grow during play (expose under `window.__scene.info()`).
- Instancing for grass, flowers, reeds, lily pads, trees. Guard against NaN (bloom turns a NaN black).
- Dispose replaced meshes.
