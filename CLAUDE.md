# Bobberbrook

## Project
- **What:** a cozy 3D family fishing game for the OGS couch. The TV renders a hand-painted lake
  (three.js); every phone and iPad is a wordless fisher controller; the grown-up's phone coaches.
- **Stack:** TypeScript, Cloudflare Worker + one Durable Object per room (actor-kit + XState v5), React
  controllers, three.js TV scene, esbuild, Vitest, Playwright seam tests. pnpm.
- **Audience:** family (Juneau 5 on an iPad, his sister almost 3 on easy mode, grown-ups on phones).
- **Dev port:** 8841. Repo: github.com/open-game-system/bobberbrook. OGS appId `bobberbrook`.

## Feedback commands (in order, all must pass before committing)
1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:seam` (needs `wrangler dev` on 8841 with `--var OGS_JWKS_URL:http://localhost:8831/.well-known/jwks.json`)

## Knowledge base (load only when relevant)
| Topic | Where |
|---|---|
| Game spec, events, decisions | docs/bobberbrook-spec.md |
| TV scene contract and look | docs/tv-scene-brief.md |
| Art style and prompts | docs/art-style.md |
| AAA scorecard, taste vetoes, rounds | critic/aaa/SCORECARD.md, critic/TASTE.md, critic/rounds/ |
| Status / resume here | STATUS.md |
| Concept art | concept/web/*.jpg, concept/index.html |

## Core principles
- The lake rules are pure functions in `src/game/` (lake.ts, world.ts, reel.ts, fish.ts); the room
  machine only routes events to them. Server-authoritative, lazily integrated with the room clock;
  the TV ticks at 4 Hz, devices tick when a deadline they wait on passes.
- `src/game/world.ts` is the one source of geometry for the room and the scene.
- Kids' devices have no words. Words live on the host phone.
- Parse at the boundary (Zod: boot payload, saved progress, client events). No `any`, no `as`.

## Keeping docs current
| If you change… | Update… |
|---|---|
| fishing rules, events | docs/bobberbrook-spec.md |
| what the TV shows | docs/tv-scene-brief.md |
| the OGS contract use (pause, room, sitting, tokens) | e2e/ogs-*.seam.test.ts |

## Off-limits
- Don't raise caps in `.asset-budget.json`; generate art only through ~/src/skills/ai-art-assets scripts.
- Never commit `.dev.vars`, keys or `certs/`.

## Git
- `main`, push to origin. Deploy: `pnpm run deploy` (never `pnpm deploy`), `git status` first.
