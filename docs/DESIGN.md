# BACKROOMS: NO-CLIP — Design

## Fantasy
You no-clipped out of reality. You're in **Level 0** — endless mono-yellow rooms, damp
carpet, the buzz of fluorescent lights, ~600 million sq mi of randomly segmented empty
rooms. You are not alone. Find an exit, manage your sanity, descend, survive, win.

## Core loop (a Round)
1. **Lobby** → players join, connect wallet (optional), ready up. Round starts on timer.
2. **Spawn** → all players drop into a *seeded* Level 0 (identical maze = fair race).
3. **Survive** → a **Sanity** meter drains over time and faster near entities/in the dark.
   - **Almond Water** bottles scattered around restore sanity.
   - Sanity at 0 → you start taking damage and entities lock onto you.
4. **Descend** → find an **Exit** (a no-clip seam) to drop a level. Deeper = more score,
   more danger, better loot.
5. **End** → round ends on a timer or last-survivor. Score is ranked. Winner takes pool.

## Scoring
`score = depth*1000 + survivalSeconds*2 + almondCollected*50 + exitsFound*250`
Ties split the pool evenly. Fully deterministic from the server's event log → verifiable.

## Entities (progressive threat)
- **The Hum** (ambient) — not a creature, the pressure of the place; drains sanity slowly.
- **Smiler** — appears as a grin + eyes in dark corners; if you stare/linger, it lunges.
- **Hound** — patrols corridors, chases on sight, fast but loses you around corners.
- **Skin-Stealer** (deep levels) — mimics other players' nametags. Trust no one.

## Levels (ship Level 0 first, expand via loop)
- **Level 0 — The Lobby:** the classic yellow rooms. Baseline.
- **Level 1 — Habitable Zone:** warehouse, concrete, sparse lights, more space.
- **Level 2 — Pipe Dreams:** tight maintenance tunnels, steam, Hounds.
- **Level !  — Run For Your Life:** scripted chase. High reward.

## Feel / Graphics targets
- Mono-yellow `#c1a34a`-ish wallpaper, slightly emissive ceiling panels that flicker.
- Heavy fog (exponential), short draw distance → claustrophobia + perf win.
- Post: UnrealBloom (the lights glow), film grain, vignette, subtle chromatic aberration.
- Audio: constant fluorescent buzz bed, footsteps, heartbeat at low sanity, entity stings.
- 60 FPS on a mid laptop. Instanced geometry, pooled rooms, frustum culling.

## Multiplayer model
- Authoritative-lite: server owns round state (seed, timer, scores, who's alive, pickups).
- Clients send position/look at ~15 Hz; server rebroadcasts; clients interpolate others.
- Pickups & damage validated server-side to keep scoring honest.

## Prizes (see COMPLIANCE.md)
- Phantom wallet connect. Prize pool escrowed. **Devnet by default.**
- Outcome (event log + final scores) is signed by the server so winners are auditable.
