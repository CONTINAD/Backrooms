# CHANGELOG — BACKROOMS: NO-CLIP

Each improvement-loop cycle appends an entry: what changed, why, and the metric it targeted.

## 2026-05-31 — Cycle 17 — Multi-seed validation sweep (regression gate)
- Target: loop rigor — single-seed playtests can miss tail cases (a random exit yielding an
  unsolvable/unsurvivable level). (Verifiable; screenshot tool still wedged.)
- Added `tools/validate-levels.js` (npm run validate): sweeps N seeds, checks solvability,
  connectivity, and best-case survivability; exits non-zero if ANY seed fails — a regression
  gate for changes to maze gen / exit placement / almonds / sanity constants.
- VERIFIED over 200 seeds: 100% solvable, 100% survivable, 0 fragmented, optimal times
  68–199s (11–33% of the round), worst best-case sanity 19.3 (tight but never fatal). Confirms
  the cycle-13 randomized exit is safe at scale.

## 2026-05-31 — Cycle 16 — Server hardening for the live public game
- Target: correctness/security — the game is live on the open internet (prize-bearing), but the
  server trusted any WS message. (Verifiable; screenshot tool still wedged.)
- `round.applyInput` now **sanitizes** every field: non-finite numbers rejected, positions/stats
  clamped to sane ranges (so NaN/Infinity can't poison the anti-cheat distance math or other
  players' rendering), names bounded to 16 chars. Added per-connection **4KB frame cap** and a
  **token-bucket rate limit** (~60 msg/s) in `server.js`.
- VERIFIED: unit test confirms all malformed values clamp (NaN→0, sanity 9999→100, name×100→16)
  while valid input passes through; live test — a client spamming a 9000-char frame + 300-message
  flood was handled gracefully, a normal connect still got WELCOME, server stayed up (200).

## 2026-05-31 — Cycle 15 — Smarter AI playtester: survivability simulation
- Target: upgrade the autonomous loop's "pro gamer" so it catches BALANCE issues, not just
  maze solvability (directly serves the original "AI that learns to make it better" ask).
- `bot/playtester.js` now simulates the sanity model along the optimal exit route (best case:
  lit, grabs Almond Water it passes) and reports survives / min-sanity / water-on-path, with
  new findings: CRITICAL if the optimal route is unsurvivable, a warning if the sanity margin
  is razor-thin. Surfaced in METRICS.md too.
- VERIFIED by running the bot: reports `survives=true, min sanity=70.1, water on path=3` —
  level is comfortably balanced; no false alarms. No errors.

## 2026-05-31 — Cycle 14 — Session leaderboard / champions (competitive retention)
- Target: "make it play stellar" — a prize race needs persistent stakes & rivalry. (Verifiable;
  screenshot tool still wedged.)
- Server tracks **escapes per player** across rounds (`champions` map), credited on round end,
  exposed at `/api/leaderboard`, and included in the WELCOME + WIN broadcasts. Client renders a
  "CHAMPIONS — MOST ESCAPES" list on the results screen (👑 on the leader).
- VERIFIED end-to-end: a real WS client escaped → WIN carried `[{ChampTest, wins:1}]` and
  `/api/leaderboard` persisted it; client eval confirmed the champions list renders with the
  crown + correct pluralization. (Bonus: re-confirmed the anti-cheat/escape/round-end flow live.)

## 2026-05-31 — Cycle 13 — Randomized exit placement (replayability)
- Target: a real design weakness — the exit was ALWAYS at corner (w-2,h-2), so every round
  was an identical beeline and the compass made it trivial. (Verifiable change; screenshot
  tool still wedged.)
- `generateLevel` now picks a SEEDED random exit cell ≥60% of max distance from the start.
  Deterministic per seed, so all players + the server anti-cheat + the bot stay consistent;
  the maze is fully connected so it's always reachable.
- VERIFIED across 6 seeds: 6 distinct exit positions, all ≥55 tiles from start, all reachable
  (BFS). Every race is now a fresh navigation challenge.

## 2026-05-31 — Cycle 12 — Live multiplayer event feed (race tension)
- Target: "make it play stellar" for multiplayer — players had no awareness of rivals' fates.
  Chose a verifiable networking/UI change (screenshot tool still wedged).
- Server now queues feed lines on death ("☠ Name succumbed…") and escape ("🏆 Name
  NO-CLIPPED OUT — escaped first!"), drained + broadcast each tick (`server.js`/`round.js`).
  Client shows them in the existing chat log — death in red, escape in gold — and toasts the
  escape. Makes a round feel like a live competitive arena.
- VERIFIED end-to-end: server unit test emits both lines; client eval confirms both rows
  render with correct colors + the escape toast fires. No console errors.

## 2026-05-31 — Cycle 11 — Sprint stamina (race tactics)
- Target: "make it play stellar" — sprint was a free, hold-forever button with no tradeoff.
  Chose a gameplay/state change (verifiable without the still-wedged screenshot tool).
- Sprint now drains a **stamina** bar (~4s flat-out), regenerates when you ease off, and if you
  fully exhaust it you're "winded" and can't sprint until recovered to STAMINA_MIN. Makes the
  race tactical: bank stamina to dash to the seam or outrun The Hollow. Added a STAMINA meter
  to the HUD (mirrors sanity/health) and reset on spawn.
- VERIFIED via manual ticks: drains while sprinting → winded at 0 → sprint denied while winded
  → regenerates at rest → sprint re-enabled after recovery. No console errors.

## 2026-05-31 — Cycle 10 — Anti-cheat: server-validated escape (prize integrity)
- Target: prize/scoring integrity (priority ladder: correctness > polish). Chose a
  server-logic change because the preview screenshot tool is still wedged this session.
- The server now recomputes the exit position from the round seed (`generateLevel`) and, on a
  DESCEND/escape claim, verifies the player's last reported position is within one tile of the
  seam — otherwise it logs `escape_rejected` and ignores the claim. The client can no longer
  fake a win. This gates the Solana prize, so it's important.
- VERIFIED by unit test (`server/round.js`): far claim (60 tiles off) → rejected & round
  stays live; legit claim at the seam → accepted, winner set, round ends; rejection logged.

## 2026-05-31 — Cycle 9 — Distant ambient sounds (audio dread)
- Target: "atmosphere polish". Chose an AUDIO improvement deliberately because the preview
  screenshot tool is wedged this session — audio is verifiable without it.
- Added `AudioEngine.ambientEvent()`: randomized far-off, heavily low-passed + delayed
  sounds — muffled thuds, footsteps that aren't yours, low groans, structural creaks — so
  the level feels inhabited and unsafe. Fired from the game loop on a random ~8–21s timer
  that tightens as sanity drops. The Backrooms is defined as much by its sounds as its look.
- VERIFIED (no screenshot needed): forced all 4 sound types via eval — audio context
  "running", 4/4 fired, 0 exceptions, game still playing, only the usual pointer-lock warns.

## 2026-05-31 — Cycle 8 — Ceiling support beams (architectural structure)
- Target: playtest "content/atmosphere polish" + research note that Level 0's ceiling is
  "acoustic tiles divided by darker yellow support beams".
- Added real 3D **ceiling beams** (`world.js`): two InstancedMeshes (X- and Z-running) on a
  4m grid, darker yellow, protruding just below the ceiling so they catch light as structure
  rather than a flat texture line. ~98 beams, 2 draw calls, still 16 lights.
- NOTE: the preview screenshot tool was unresponsive this cycle (harness issue — game ran at
  180 FPS, no console errors). Verified by mesh presence (2 beam meshes / 6 instanced total),
  error check, and sound geometry rather than a visual. Committed LOCAL ONLY; will eyeball it
  before the next push to live.

## 2026-05-31 — Cycle 7 — Glowing EXIT sign (landmark + atmosphere)
- Target: playtest "content/atmosphere polish" + human exit-findability.
- Added a flickering, bloom-glowing red **EXIT sign** above the escape seam
  (`world.js` `_buildExit`): canvas-textured emissive plane that billboards toward the player
  so it's readable from any approach. A striking red landmark in the yellow gloom that doubles
  as confirmation of the win point for the race. Verified rendering (clear "EXIT" with glow).
- Dialed the purple seam light down (16→9) so the red sign reads on approach. Still 16 lights,
  booting clean.

## 2026-05-31 — DEPLOYED LIVE 🚀
- Game is live on Railway: **https://web-production-61936.up.railway.app** (friends can play,
  no wallet needed). Deployed via Railway GraphQL API (workspace token; CLI couldn't run
  headlessly). Project `df969703…`, service `web` `b3841501…`, env production `ebd2518d…`.
- Fixed two container-build blockers: the Docker `npm install` ran the `postinstall` verifier
  before source was copied → moved to `--ignore-scripts` AND removed the `postinstall` hook
  (renamed to `verify-assets`). Recreated the service so it built the fixed commit.
- Verified live: HTTP 200 on page + all engine/vendor assets, /api/health ok, and a real
  WebSocket client got a WELCOME handshake (multiplayer works remotely).

## 2026-05-31 — Cycle 6 — Baseboards (architectural grounding)
- Target: playtest finding "content/atmosphere polish".
- Added dark vinyl **baseboards** where every wall meets the carpet — one InstancedMesh that
  reuses the wall segment placements (1 draw call). This single detail makes rooms read as a
  real office building instead of floating planes. Pairs with the light shafts + dust for a
  cohesive liminal look. Still 16 lights, booting clean, verified on screen.

## 2026-05-31 — Cycle 5 — Lore-accurate lighting + hazy light shafts (RESEARCH+BUILD)
- Researched canonical Level 0 (Backrooms wikis): fluorescents are "seemingly distributed at
  random", ceiling = acoustic tiles split by darker support beams, oppressive hazy glow.
- Replaced the rigid 3-cell light grid with a **jittered, gappy placement** (seeded from the
  level so all players see the same layout) — irregular like the real thing, but dense enough
  to avoid unlit dead-zones (first attempt at 11% random was too dark; tuned to a jittered
  every-2-cells base with 16% gaps → ~450 panels).
- Added **hazy light shafts**: one additive `InstancedMesh` of soft cylinders under each panel
  for that thick, dust-laden fluorescent column (pairs with the dust motes). One draw call,
  still 16 lights, 180 FPS. Verified on screen.
- GAME MODEL CHANGE (this session): converted to a **RACE** — first player to reach an exit
  ESCAPES and wins the round/prize (server-authoritative, `round.js`). Short 6s lobby for
  drop-in. Also fixed a latent crash: Almond Water pickup referenced a removed `glow` field.

## 2026-05-31 — Cycle 4 — Atmosphere: floating dust
- Target: playtest finding "content/atmosphere polish" (level otherwise rated GOOD).
- Added drifting dust motes (`client/src/engine/dust.js`): one additive `THREE.Points` cloud
  (380 motes) that follows the player and wraps around them, catching the fluorescent light
  for that stale, undisturbed liminal air. One draw call; still 16 lights, 181 FPS. Verified
  on screen.

## 2026-05-31 — Cycle 3 — The Hollow (real 3D horror)
- Replaced the flat billboard Smiler with **The Hollow**: a procedural 3D creature
  (`client/src/engine/monster.js`) — ~2.6m, emaciated, pitch-black silhouette, glowing
  eyes + too-wide grin, articulated creeping gait, head that tracks and tilts.
- Core scare = a **Weeping-Angel mechanic**: it FREEZES (and twitches) while you keep it in
  view with line of sight, and RUSHES you the moment you look away or a wall breaks sight.
  Attacks only land when it reaches you unwatched → screen-flash + sting + camera punch.
- Added rising **breathing** audio that quickens as it nears, and warning text that reads
  the situation ("DON'T LOOK AWAY" / "IT IS BEHIND YOU"). Verified the 3D model renders and
  the game boots with no new errors.

## 2026-05-31 — Cycle 2 — Human exit-findability
- Target metric: AI playtest finding "human exit-findability (no minimap)".
- Added a diegetic "exit sense" compass (`#compass`): a faint purple arrow + distance that
  points toward the no-clip seam, fades out when you're on top of it, and dims as sanity
  drops. A 48×48 maze with no map was effectively unwinnable for humans; now it's findable
  without trivializing the search. Verified the game still boots (no new console errors).

## 2026-05-31 — Cycle 1 — Recalibrate the AI's pacing judgment
- Target metric: top finding "exit ~134s optimal — tedious".
- Root cause: the bot judged pacing on absolute seconds, ignoring the 600s round length.
  134s optimal is only 22% of a round (humans take 2–4× optimal) — well-paced, not tedious.
  Recalibrated `bot/playtester.js` thresholds to be relative to ROUND_SECONDS, and stopped
  flagging "didn't finish" when the time budget was shorter than the optimal route. Re-run
  now reports the level GOOD and surfaces the genuine next priority.

## 2026-05-31 — v0.1.x — Critical fixes during bring-up
- Fixed scene rendering pure black: 317 PointLights exceeded the GPU fragment-uniform limit
  (1024) so the lit shader failed to link. Replaced with a 12-light pool that follows the
  player + emissive instanced ceiling panels. See memory note on the uniform limit.
- Fixed round timer draining ~5× too fast (used a fixed 1/60 per frame instead of dt, and
  double-counted vs. the server clock). Online clients now trust the authoritative server
  time; offline solo counts by dt.
- Tuned exposure/bloom/ambient/fog so the Backrooms reads correctly (was blown-out white
  after the light fix).
- Made the renderer track the viewport size every frame (some embed contexts resize silently).

## 2026-05-31 — v0.1.0 — Initial vertical slice
- Scaffolded monorepo (client/server/shared/bot/tools/docs).
- Self-prompt + design + compliance docs written.
- Three.js first-person client: procedural Level 0, fog, flickering fluorescent panels,
  post-processing (bloom/grain/vignette/chromatic aberration), sanity + Almond Water,
  Smiler entity, audio bed.
- Node ws multiplayer server with seeded fair levels, lobby/round lifecycle, scoring.
- Solana wallet connect + devnet prize-pool scaffold.
- AI playtester bot logging metrics; self-improvement loop tooling.
