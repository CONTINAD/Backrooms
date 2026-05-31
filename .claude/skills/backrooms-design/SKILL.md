---
name: backrooms-design
description: Art direction and creature/horror design rules for the BACKROOMS NO-CLIP game. Use when adding or improving visuals, lighting, post-processing, monsters/entities, levels, or any "make it scarier / look better" task in this project.
---

# Backrooms: No-Clip — Design & Graphics Skill

Apply this whenever you touch how the game **looks or scares**. The goal is dread through
restraint, not gore. Verify every change by rendering it (preview screenshot) — never ship a
visual change you haven't looked at.

## Palette & atmosphere (Level 0)
- Mono-yellow wallpaper `#b6a444`, damp office carpet `#3a3320`, drop-ceiling `#c9b86a`.
- Warm fluorescent light `#fff0c8`. Keep the world desaturated and slightly sickly.
- Heavy `FogExp2` (~0.04 density) → short sightlines = claustrophobia AND a perf win.
- Post stack: UnrealBloom (subtle, threshold high ~0.9 so only lights bloom), film grain,
  vignette, faint chromatic aberration that **increases as sanity drops**. Exposure ~1.05.

## The hard performance rule (do not break)
**Keep total scene lights ≲16.** ANGLE caps `MAX_FRAGMENT_UNIFORM_VECTORS` at 1024 even on
strong GPUs; too many real lights make the lit shader fail to link and the scene renders
**black**. Use the light **pool** in `world.js` (≈12 PointLights that follow the player) +
emissive `InstancedMesh` panels for the look. Almonds/props glow via emissive, not lights.
Diagnostic: if a scene is black, swap a material to `MeshBasicMaterial` — if it lights up,
it's the light-count limit, not exposure.

## Lighting feel
- Fluorescents should **flicker** (per-light phase/rate, occasional dropouts, ~10% "broken").
- Pools of warm light separated by dark gaps. Darkness should feel unsafe (it drains sanity).

## Creature design (what makes The Hollow work — reuse the pattern)
1. **Silhouette first.** Pitch-black body so it reads as a shape. The ONLY bright things are
   the face features (eyes + grin) — that's the payload your eye locks onto.
2. **Wrong proportions.** Taller than the player (~2.6m), emaciated, limbs too long. "Human
   but wrong" triggers threat instinct better than any texture.
3. **Behavior is the scare, not the model.** The Hollow's Weeping-Angel rule (freeze while
   watched, rush when unwatched, only strikes unseen) creates *sustained* tension. Always
   pair a new monster with a behavioral rule that pressures the player's choices.
4. **Escalation through the senses.** Rising breathing/heartbeat as it nears; emissive
   brightening; post-FX distortion ramps with proximity; a punch (flash + sting + shake) on
   contact. Telegraph, build, release.
5. **Animate cheaply but unsettlingly.** Articulated gait, head that tracks the player with a
   slight tilt, micro-twitches when frozen. Idle perfection is uncanny.

## Assets
Everything is **procedural** (canvas textures, Web Audio, primitive-built models) — no binary
downloads to 404. New art should follow suit unless there's a strong reason; if you add a
binary asset, vendor it under `client/assets/` and have `tools/fetch-assets.js` verify it.

## Checklist before calling a visual change done
- [ ] Rendered it and looked at a screenshot (not just "it compiled").
- [ ] No new console errors; scene not black; FPS still ≳60.
- [ ] Total lights still ≲16.
- [ ] It reads in MOTION and at distance/in fog, not just a posed close-up.
- [ ] Logged the change + the metric/finding it targets in `docs/CHANGELOG.md`.
