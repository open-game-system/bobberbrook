# Bobberbrook hill-climb progress (rounds 22–28, 2026-10-17/18)

**Gameplay video (final build, round 28, TV | Dad's phone | Juneau's iPad with TV audio, 127 s):**
`/Users/jonathanmumm/src/bobberbrook/.claude/worktrees/hillclimb-207936/recordings/gameplay-final.mp4`
(also `recordings/progress/round-28.mp4`; git-ignored, local only)

## Scores (fresh critic each round; 8 = first-party ship bar)

| Round | Art | Env | Water | Chars | Light | Camera | Catch | Feel | Kid UX | Phone UI | Progress | Audio | Onboard | Perf | Min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 22 | 6 | 6 | 6 | 5 | 6 | 4 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 4 |
| 23 | 6 | 6 | 6 | 5 | 6 | 4 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 4 |
| 24 | 6 | 6 | 6 | 6 | 6 | 4 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 4 |
| 25 (pivot: rules-level fishing slots) | 6 | 6 | 6 | 6 | 6 | 5 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 5 |
| 26 | 6 | 6 | 6 | 6 | 6 | 5 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 5 |
| 27 (veto regression: wisteria over push-ins) | 6 | 6 | 6 | 6 | 6 | 4 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 4 |
| 28 (regression fixed) | 6 | 6 | 6 | 6 | 6 | 5 | 6 | 5 | 6 | 6 | 6 | 5 | 5 | 6 | 5 |

Stopped by the stop rule: the minimum went 4 → 5 at the round-25 pivot, then stayed at 5 through round 28.

## What landed
- Camera: judder traced and removed (push-in on its own clock, held yaw choices), screen-space spacing on drawn positions, push-in on every catch, QR-corner and top-banner keep-outs, per-frame cover check during push-ins.
- Rules: a spot of your own (step aside, dry feet, apart across the TV's view, clear of props), campfire off the bank, a kid tagging along walks to their own shore spot, a new place gives only unmet species first, kids' reels shorter, `Fisher.kid` (wordless join).
- Characters: grown-up / kid / little builds, concept faces, vests/bandanas/belts, contact shadows, held fish sized by length with a leap into the hands.
- Look: painted opening still (no navy screen), half-timbered cottages, painted golden-hour sky, Mistmarsh water depth and night lamps, reel foam/fountain/tail flick.
- UI/audio: coach timing fixes (reel, misses, discovery, no Explore mid-fishing), follow arrow in the leader's hat colour, rod upgrade beat, TV shell +N, time-of-day fish, campfire banner and hearth bed, trail soundscape, softer/steeper-filtered stings, mix 4 dB quieter.
- Rig: dead-reckoned bot steering, bank-and-press opening, kid reaction time, strip waits for the bite, stuck-walker log.

## Rows stuck at 5 and why
- **Feel / Onboarding / Kid UX: the reel.** The tug-of-war (hold on calm, let go on a splash) is the core verb and still reads as a green/red flicker with a resetting ring; on the TV the fisher barely moves. This is a design problem, not polish.
- **Camera:** framing a moving family in an endless world with keep-outs, push-ins and cover fades is now mostly right; the critics still find one catch per session without a push-in or with an overlap.
- **Audio:** synthesized stings and a TTS narrator; per-place ambience is thin. The harshness metric also counts speech consonants.

## Directions (recommendation first)
1. **Redesign the reel for a 5-year-old (recommended):** one hold-to-reel with a fish sliding toward the fisher on a fill-only meter, splashes as a brief "let go" pulse, kid reels capped ~4–5 s; mirror it on the TV with body language (lean back, rod bend). Likely moves Feel, Onboarding, Kid UX and Catch together.
2. **Real-device family playtest** (iPad, phone, Chromecast) before more critic rounds: the critic has plateaued on the same issues for many rounds; the family's reaction outranks it.
3. **Audio pass with real recorded/generated foley and per-place beds** (ElevenLabs, needs a budget decision; caps are 0 now). Codex image generation is currently failing on a Codex model setting ("gpt-5.5 not supported with a ChatGPT account"), not a usage limit.
