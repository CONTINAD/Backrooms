# CHANGELOG — BACKROOMS: NO-CLIP

Each improvement-loop cycle appends an entry: what changed, why, and the metric it targeted.

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
