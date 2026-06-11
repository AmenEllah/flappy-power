# Flappy Power — Expert Review & Improvement Plan

> Each phase has a detailed step-by-step implementation guide in [`docs/`](docs/):
> [Phase 1](docs/phase-1-foundation.md) · [Phase 2](docs/phase-2-juice.md) · [Phase 3](docs/phase-3-graphics.md) · [Phase 4](docs/phase-4-audio.md) · [Phase 5](docs/phase-5-gameplay.md) · [Phase 6](docs/phase-6-meta.md) · [Phase 7](docs/phase-7-social.md) · [Phase 8](docs/phase-8-polish.md)

## Part 1 — Review of the current build

### What's already good
- **Solid core loop**: fixed 60 Hz timestep with an accumulator (`frame()`), so physics are deterministic and frame-rate independent.
- **Great input feel for a flappy game**: input buffering (`BUFFER_TICKS`), flap cooldown, and a hold-boost — this is better than most clones.
- **Real meta systems**: combo multiplier, per-run rotating missions, near-miss bonus, prestige trails, 8 unlockable skins, moving pipes after score 30, day→night sky shift.
- **Good platform hygiene**: PWA manifest + service worker, haptics, Web Share API, fullscreen, mute persistence, a `__flappyDebug` test hook.

### Weaknesses & bugs found (ordered by impact)
1. **Blurry rendering on every modern phone/laptop.** The canvas backing store is fixed at 400×600 but CSS-scaled up. There is no `devicePixelRatio` handling, so on a 2×–3× display everything is upscaled and soft. This is the single biggest *graphics* win available.
2. **Pipe spawn bug**: `if (tick % pipeSpawnTicks() === 0) spawnPipe()` — `pipeSpawnTicks()` *changes with difficulty*, so the modulo can skip spawn points entirely (e.g. tick 99 with spawn interval moving from 98→97), producing uneven gaps between pipes. Should be a countdown timer, not a modulo.
3. **Visuals are all flat vector primitives** drawn every frame: flat circle bird, gradient rect pipes, one biome, static ground texture. Functional but not memorable.
4. **Audio is minimal**: one never-ending 82 Hz sine drone (the oscillator is never stopped — it runs forever once created, even while paused) plus single-oscillator beeps. No melody, no layering, ambient keeps playing while paused.
5. **No death drama**: crash → instant game-over overlay. No slow-mo, no falling/tumbling bird, no "watch your corpse bounce" moment. This is where flappy games earn their "one more try".
6. **One obstacle type** (pipes, later moving pipes). Difficulty only scales speed/gap, so runs feel samey past score ~30.
7. **No currency / nothing to spend**: skins unlock purely by best score, so a mid-skill player sees no progression between best-score jumps.
8. **No object pooling**: particles and pipes are spliced/filtered arrays — fine now, but will GC-stutter once particle counts grow (see Phase 2).
9. **Skin selector hitbox overlaps the restart tap zone** on the game-over screen — easy to fat-finger a skin when you meant to restart.
10. **Accessibility gaps**: no reduced-motion option (screen shake/flash always on), no difficulty/zen option for casual players.

---

## Part 2 — Step-by-step improvement plan

Phases are ordered so each one ships a playable improvement. Quick wins first, big features later.

### Phase 1 — Foundation fixes (½ day, do first)
1. **Hi-DPI rendering.** On load (and on resize): set `canvas.width = 400 * dpr`, `canvas.height = 600 * dpr`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, keep CSS size as-is. All game math stays in 400×600 logical units — zero gameplay changes, instantly crisp.
2. **Fix pipe spawning.** Replace the modulo with `spawnTimer -= 1; if (spawnTimer <= 0) { spawnPipe(); spawnTimer = pipeSpawnTicks(); }`. Guarantees consistent spacing while difficulty ramps.
3. **Audio lifecycle.** Stop/suspend the ambient oscillator when paused, on game over, and when muted (suspend the whole `AudioContext` when muted rather than only zeroing gain — saves battery on mobile).
4. **Separate restart zone from skin selector.** On game over, require the tap to hit the "Play again" button area (or anywhere above the selector); first tap after death within ~20 ticks is ignored (death-tap protection) so players don't instantly restart by accident mid-tap-spam.

### Phase 2 — Game feel / "juice" (1 day, biggest fun-per-hour payoff)
5. **Death sequence.** On crash: 0.35 s slow-motion (run update at 0.3× timestep), bird tumbles with rotation + gravity until it hits the ground, ground-hit dust burst, *then* slide in the game-over panel. This single change makes dying feel fair and replayable.
6. **Squash & stretch.** Scale the bird `(1 + vy * 0.02, 1 - vy * 0.02)` clamped to ±15% — stretched while diving, squashed on flap. Two lines in `drawBird()`, huge perceived quality.
7. **Motion trail.** Keep the last 6 bird positions, draw fading ghost circles behind the bird (use the prestige color when prestiged). Replaces the current sparse flap particles as the primary motion read.
8. **Particle object pool.** Pre-allocate ~300 particles, reuse dead ones. Needed because phases 2–3 triple particle counts.
9. **Score pop animation.** When passing a pipe, spawn a floating `+1`/`+2×` text particle that rises and fades at the gap position; pulse the HUD score (scale 1.3 → 1.0 over 8 ticks).
10. **Camera polish.** Tiny upward camera nudge on flap (1–2 px), directional shake on crash (along the impact normal) instead of random jitter.

### Phase 3 — Graphics overhaul (1–2 days)
11. **Sprite caching.** Render the bird (per skin), pipe caps, clouds, and hills once to offscreen canvases at 2× resolution, then `drawImage` them. Kills per-frame gradient/path costs and enables richer art (outlines, shading, highlights) for free.
12. **Better bird art.** Even staying procedural: body with a 2-tone belly, 3-frame wing flap animation (up/mid/down driven by `bird.wing`), blink animation every ~3 s, tail feathers. Draw once per skin into the sprite cache.
13. **Biome system.** Replace the single day→night tint with rotating biomes every 25 points: **Day meadow → Sunset desert → Night city (silhouette skyline + window lights) → Snow peaks (falling snow particles) → Space (stars + low gravity ±5%)**. Each biome = palette + background layer set + optional weather particles. Crossfade over ~2 s. This is the #1 "the game keeps surprising me" feature.
14. **Richer parallax.** Add a third far layer (mountains/skyline at 0.1× speed) and a foreground layer (grass blades / fence posts at 1.2× speed, drawn over the ground). Five depth layers total.
15. **Pipe variety in art**: per-biome pipe palettes (cactus-green in desert, ice-blue in snow, neon in city), subtle vertical highlight strip, moss/snow cap detail on the rims.
16. **Ambient occlusion cheats**: soft shadow ellipse under the bird projected on the ground, slight dark vignette around canvas edges (one cached radial-gradient overlay).

### Phase 4 — Audio overhaul (1 day)
17. **Procedural music sequencer.** Replace the sine drone with a tiny step sequencer on `audioCtx` time: 4-chord loop (e.g. C–Am–F–G), triangle-wave bass on beats, soft square arpeggio on 8ths, low-pass filtered. ~60 lines, no assets, loops cleanly. Intensity scales with difficulty (add arpeggio layer past score 20, drums past 40).
18. **Layered SFX**: two-oscillator flap "whoosh" (noise burst + pitch sweep), distinct per-power-up jingles (3-note motifs), combo milestone fanfare that rises with combo level, descending death sting.
19. **Music ducking**: drop music gain 50% for 0.3 s on death/shield-break so SFX read clearly.

### Phase 5 — Gameplay depth (2 days)
20. **New power-ups** (extend the existing `POWERUPS` table — the architecture already supports it):
    - **Magnet** (purple, 6 s): orbs within 90 px lerp toward the bird.
    - **Ghost** (white, 4 s): pass through pipes, 50% alpha bird + wavy shader-ish offset; can't collect score while ghosted (risk/reward).
    - **2× Score** (gold, 8 s): doubles all points, stacks visually with combo multiplier.
    - **Rocket** (red, 2.5 s): auto-fly forward at 2× speed through everything, screen streaks, +1 per pipe passed.
21. **Coins.** Small gold coins spawn in arcs/lines between pipes (3–5 per formation, ~40% of gaps). Coins persist to `localStorage`, shown on HUD. Magnet pulls them. This gives *every* run progression value, not just best-score runs.
22. **New obstacle types**, introduced by score band so the difficulty curve stays readable:
    - score 15+: **double pipes** (two staggered pipes close together, wider gaps to compensate);
    - score 30+: moving pipes (already exists);
    - score 45+: **rotating gate** — a slowly spinning bar in the gap, time your pass;
    - score 60+: **crusher pipes** — gap slowly closes and reopens on a telegraph.
    Pick obstacle type per spawn from a score-weighted table.
23. **Revive (once per run).** On death, offer "Tap fast ×5 to revive" for 2 s, cost: 50 coins. Resumes with 1.5 s shield. Cheap to build, massive session-length win.
24. **Difficulty selection on menu**: Chill (wider gaps, 0.85× speed, no moving pipes), Classic (current), Insane (1.15× speed, gaps −12, moving pipes from score 10, 2× coins). Stored per-profile; best scores tracked per difficulty.

### Phase 6 — Meta progression (1–2 days)
25. **Coin shop on the menu**: spend coins on skins (alternative path to the score unlocks), **trail styles** (sparkle, rainbow, fire, bubbles) and **hats** (tiny crown/cap drawn on the bird sprite). All cosmetic, all localStorage.
26. **Achievements** (~20, toast on unlock, viewable from menu): "Pass 100 pipes lifetime", "Collect every power-up type in one run", "Score 10 without flapping more than 15 times", "Survive a shield break and reach +10 more", etc. Reuse the mission `test(stats)` pattern with lifetime stats.
27. **Daily challenge.** Seed the RNG from the date (`mulberry32(hash(YYYY-MM-DD))`) so everyone gets the same pipe/orb layout; fixed mission set; separate daily best score. Add a "Daily" button on the menu with a countdown to the next one. Pairs perfectly with the share button ("Daily #142: 27 pts").
28. **Stats screen**: lifetime pipes, runs, coins, best per difficulty, favorite power-up, total play time.

### Phase 7 — Social & share polish (½ day)
29. **Share card image**: render an offscreen 800×418 canvas (score, skin portrait, biome background, daily #) and share it via `navigator.share({ files })` with clipboard-image fallback. Vastly better than text-only share.
30. **Local leaderboard**: top-10 run history (score, date, difficulty) on the game-over screen.

### Phase 8 — Performance, accessibility & code health (ongoing)
31. **Settings panel** (gear button): screen-shake toggle, flash toggle, reduced motion (respect `prefers-reduced-motion` as default), music/SFX volume sliders, left/right-hand HUD flip.
32. **Colorblind support**: power-up orbs already have icons — make icons bigger and add distinct shapes (diamond/clock/star/circle) so color is never the only signal; same for moving-pipe warning (add stripe pattern, not just blue).
33. **Module split** once `game.js` passes ~1,500 lines: `physics.js`, `entities.js`, `render.js`, `audio.js`, `meta.js` with a tiny bundler-free ES-module setup (`<script type="module">`). Keep the single-file simplicity until then.
34. **Pause on tab blur** (`visibilitychange` → auto-pause) so mobile players never die in the background.

---

## Suggested build order (if shipping incrementally)

| Milestone | Phases | Outcome |
|---|---|---|
| v1.1 "Crisp" | 1 + 2 | Sharp rendering, fixed spawns, juicy deaths — same game, feels 2× better |
| v1.2 "Alive" | 3 + 4 | Biomes, real art, music — looks/sounds like a finished product |
| v1.3 "Deep" | 5 | Coins, new power-ups, obstacle variety, difficulties — replayability |
| v1.4 "Sticky" | 6 + 7 | Shop, achievements, daily challenge, share cards — retention |
| v1.5 "Polish" | 8 | Settings, accessibility, perf — store-quality |

The two highest fun-per-line-of-code items in the whole plan: **#5 death slow-mo sequence** and **#13 biome system**. If you only do two things, do those.
