# SELF-PROMPT — "BACKROOMS: NO-CLIP" autonomous build & improvement directive

> This is the prompt Claude wrote for itself, per the user's request, and re-reads at the
> start of every improvement cycle. Treat it as the contract for what "good" means here.

## Mission
Build and continuously improve **BACKROOMS: NO-CLIP** — a fully online, multiplayer,
first-person Backrooms survival game that runs in the browser, looks genuinely good,
plays great, and awards a Solana-based prize pool to round winners.

## Pillars (never regress these)
1. **Atmosphere first.** It must *feel* like the Backrooms: mono-yellow wallpaper, damp
   carpet, buzzing fluorescent panels, oppressive hum, fog, liminal dread. Audio + light +
   fog do 80% of the work. Bloom, grain, vignette, chromatic aberration.
2. **It must run.** 60 FPS target on a mid laptop. Never ship a build that fails to load.
   A playable mediocre frame beats a broken beautiful one.
3. **Real multiplayer.** Multiple humans in the same level, seeing each other move, in
   timed rounds with a winner. Server-authoritative round state.
4. **Objectives & stakes.** Survive, manage sanity (Almond Water), descend levels, evade
   entities. A round produces a ranked outcome → a winner → a prize.
5. **Fair, transparent prizes.** Solana wallet connect; prize pool on devnet by default.
   Outcomes verifiable. Never move real funds without an explicit mainnet config + the
   compliance checklist in docs/COMPLIANCE.md being satisfied.

## What a "round" is
- Lobby fills (or timer starts with whoever's present, min 1 for solo practice).
- All players spawn in Level 0 from the same seed → identical maze for fairness.
- Sanity drains over time; Almond Water restores it; low sanity attracts entities.
- Exits let you descend to deeper levels (more reward, more danger).
- Round ends on timer or last-survivor. Score = depth*W1 + survivalTime*W2 + almond*W3.
- Highest score wins the pool. Ties split.

## Improvement loop contract (run each cycle)
1. Read this file + docs/METRICS.md (latest playtest report) + docs/CHANGELOG.md.
2. Launch the AI playtester bot against the live server; collect metrics:
   FPS, load success, time-to-first-exit, deaths, sanity deaths, stuck/wall-hug ratio,
   pathing failures, JS errors from console.
3. Pick the SINGLE highest-leverage improvement (bug > crash > feel > content > polish).
4. Implement it. Keep the game bootable at every step — verify load before finishing.
5. Append a dated entry to docs/CHANGELOG.md and update docs/METRICS.md.
6. Never delete working features to "simplify" unless replacing with something better.

## Priority ladder when choosing the next improvement
1. Game won't load / server crashes / multiplayer desync  → fix immediately.
2. Bot reports it can't find exits / gets stuck            → level-gen or nav fix.
3. Performance below 50 FPS                                → perf pass.
4. Atmosphere gaps (looks flat, too bright, no sound)      → art/audio pass.
5. Missing objective/entity/level content                 → content pass.
6. Crypto/lobby/UX polish                                  → polish pass.

## The AI playtester persona ("pro gamer")
A skilled, impatient speedrunner. It wants to: find the exit fast, hoard Almond Water,
dodge entities, win. If it can't, that's a design/bug signal. It logs *frustration*:
walls it bumped, loops it walked, frames it dropped, deaths it felt were unfair.
Its report is the to-do list.

## Design authority
For ANY visual, lighting, post-processing, level, or monster/scare work, follow the
**backrooms-design** skill (`.claude/skills/backrooms-design/SKILL.md`) — palette,
the ≲16-lights performance rule, and the creature-design pattern (silhouette + glowing
focal feature + a behavioral scare rule). Render and screenshot every visual change.

## Tech constraints
- Client: native ES modules + Three.js (local copy, no bundler) for durability.
- Server: Node, ws for realtime, static file serving. Authoritative round manager.
- Solana: @solana/web3.js, Phantom wallet, devnet by default.
- No build step that can break the boot. Assets downloaded locally under client/assets.

## Definition of done for any cycle
The game loads, a human can move with WASD+mouse, sees the Backrooms, multiplayer
connects, and the changelog reflects exactly what changed and why.
