# BACKROOMS: NO-CLIP

An online, multiplayer, first-person **Backrooms** survival game that runs in the browser.
Find the exit, manage your sanity with Almond Water, evade the Smiler, descend deeper, and
outlast the other players. Round winners take a **Solana** prize pool (devnet by default).

Built with native ES modules + Three.js (no bundler) and a Node `ws` server. Textures and
audio are generated procedurally — there are **no binary assets to download**.

## Run it

```sh
npm install            # installs three + ws (and verifies vendored Three.js)
npm start              # serves the game + multiplayer on http://localhost:8080
```

Open http://localhost:8080 in two browser tabs to see real multiplayer. Click to lock the
mouse. **WASD** move, **mouse** look, **Shift** sprint, **E** to grab Almond Water / use an
exit, **Esc** to release the mouse.

> Node isn't on PATH? A portable Node 20 lives at
> `C:\Users\alexa\AppData\Local\node-portable\node-v20.18.0-win-x64`.

## The AI playtester & self-improvement loop

```sh
npm run bot            # a "pro gamer" bot pathfinds the level and writes docs/METRICS.md
npm run loop           # one improvement cycle: health-check → playtest → next action
```

- `docs/SELF_PROMPT.md` — the directive the AI re-reads each cycle (what "good" means).
- `docs/METRICS.md` — the latest playtest report; the top finding is the next thing to fix.
- `docs/CHANGELOG.md` — every cycle's change, why, and the metric it targeted.

The loop has two halves: a **deterministic** half (`tools/improve-cycle.js` runs the bot and
surfaces the top finding) and a **creative** half (Claude implements the fix). Run it on a
timer with the Claude Code `/loop` skill, e.g. `/loop 10m run one improvement cycle`.

## Prizes / crypto — READ FIRST

Prizes run on **Solana devnet** (valueless test SOL) by default. The prize logic is real;
the money is not. Real-money mainnet is gated behind `docs/COMPLIANCE.md` — the server
**refuses to start** in mainnet mode unless compliance has been signed off. Don't flip it
without a lawyer. 18+. Skill-based contest (no buy-in to play).

## Layout

```
client/   Three.js game (engine/, net/, crypto/, ui)
server/   ws multiplayer + round manager + prize pool + static host
shared/   maze gen, scoring, constants (runs in browser AND node)
bot/      AI playtester
tools/    improvement-cycle orchestrator + asset verifier
docs/     SELF_PROMPT, DESIGN, COMPLIANCE, CHANGELOG, METRICS
```
