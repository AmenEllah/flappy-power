# Phase 3 — Graphics Overhaul (Implementation Guide)

**Goal:** sprite-cached art, a richer animated bird, rotating biomes, deeper parallax, and cheap lighting tricks. Estimated effort: 1–2 days. Requires Phase 1 (DPR setup — sprites are baked at the same density) and benefits from Phase 2's pool.

---

## Step 3.1 — Sprite caching helper

Per-frame gradients and paths are the main render cost. Bake them once.

1. Add a helper near the top:

   ```js
   const SPRITE_SCALE = 2; // bake at 2x for crispness when rotated/scaled

   function makeSprite(w, h, drawFn) {
     const c = document.createElement("canvas");
     c.width = w * SPRITE_SCALE;
     c.height = h * SPRITE_SCALE;
     const sctx = c.getContext("2d");
     sctx.scale(SPRITE_SCALE, SPRITE_SCALE);
     drawFn(sctx, w, h);
     return c;
   }

   function blit(sprite, x, y, w, h) {
     ctx.drawImage(sprite, x, y, w, h);
   }
   ```

2. Convert clouds first (lowest risk): bake 3 cloud variants of the existing `drawCloud` art into sprites at sizes ~80×50, give each cloud a `variant` index in `resetWorld()`, and replace `drawCloud()`'s path work with `blit(cloudSprites[c.variant], c.x - 40 * c.s, c.y - 25 * c.s, 80 * c.s, 50 * c.s)` (keep the 0.7 alpha).

3. Convert pipes next: bake one **pipe body tile** (64×64, vertical gradient + edge highlight) and one **cap** (76×24) per palette (see Step 3.3). In `drawPipe()`, draw the body by tiling/stretching `drawImage` and blit caps — delete the per-frame `createLinearGradient`.

4. The bird is converted in Step 3.2; hills in Step 3.4.

**Verify:** identical look (compare screenshots), and the profiler shows `draw()` time drop noticeably on mobile.

---

## Step 3.2 — Better bird art (sprite sheet per skin)

1. Build a per-skin sprite set lazily, keyed by skin index and wing frame:

   ```js
   const birdSprites = new Map(); // key: `${skinIdx}-${frame}` → canvas

   function birdSprite(skinIdx, frame) {
     const key = `${skinIdx}-${frame}`;
     if (!birdSprites.has(key)) {
       birdSprites.set(key, makeSprite(64, 64, (sctx) => drawBirdArt(sctx, SKINS[skinIdx], frame)));
     }
     return birdSprites.get(key);
   }
   ```

2. `drawBirdArt(sctx, s, frame)` draws, centered at (32, 32), using the skin's palette:
   - **Body**: existing 15 px circle in `s.body`.
   - **Belly**: lighter half-ellipse (`s.glow` at 55% alpha) on the lower front quarter.
   - **Tail**: two small triangles behind the body in `s.wing`.
   - **Wing, 3 frames**: ellipse rotated −0.9 (frame 0 = up), −0.4 (frame 1 = mid, today's look), +0.3 (frame 2 = down), in `s.wing`.
   - **Beak + eye**: as today, plus a 1.5 px white eye highlight dot.

3. Replace the body/wing/beak/eye section of `drawBird()` with:

   ```js
   const frame = bird.wing > 5 ? 0 : bird.wing > 0 ? 1 : 2;
   ctx.drawImage(birdSprite(selectedSkin, frame), -32, -32, 64, 64);
   ```

   Keep the shield ring, prestige aura, squash/stretch, and shrink scaling around it (they wrap the sprite fine). The glow `shadowBlur` can be dropped — bake a soft glow into the sprite instead (draw the body twice, first pass blurred via `sctx.filter = "blur(4px)"`).

4. **Blink**: add `let blinkTimer = rand(120, 260);` — decrement each tick; when ≤ 6, draw a small skin-colored rect over the eye (a 6-tick blink), then reset to `rand(120, 260)`. Since the eye is baked, draw the blink as an overlay rect in `drawBird()` at the eye's local position (6, −6).

**Verify:** wing visibly flaps in 3 frames on each tap; bird blinks every few seconds; all 8 skins still render with their palettes (use `__flappyDebug.setBest(70)` + `selectSkin(i)` to check each).

---

## Step 3.3 — Biome system

Replace the binary day→night tint with rotating biomes every 25 points.

1. Define the data table:

   ```js
   const BIOMES = [
     { name: "Meadow", sky: ["#60a5fa", "#7dd3fc", "#bae6fd"], hill: "rgba(34,197,94,.24)",
       pipe: ["#16a34a", "#86efac", "#15803d"], ground: ["#f59e0b", "#22c55e"], weather: null,  stars: false },
     { name: "Sunset", sky: ["#7c2d12", "#fb923c", "#fde68a"], hill: "rgba(154,52,18,.30)",
       pipe: ["#b45309", "#fcd34d", "#92400e"], ground: ["#c2410c", "#fb923c"], weather: null,  stars: false },
     { name: "Night City", sky: ["#0f172a", "#1e293b", "#334155"], hill: "rgba(2,6,23,.55)",
       pipe: ["#0e7490", "#67e8f9", "#155e75"], ground: ["#1e293b", "#475569"], weather: null,  stars: true },
     { name: "Snow Peaks", sky: ["#475569", "#94a3b8", "#e2e8f0"], hill: "rgba(241,245,249,.5)",
       pipe: ["#0369a1", "#bae6fd", "#075985"], ground: ["#cbd5e1", "#f8fafc"], weather: "snow", stars: false },
     { name: "Space", sky: ["#020617", "#1e1b4b", "#312e81"], hill: "rgba(99,102,241,.18)",
       pipe: ["#6d28d9", "#c4b5fd", "#4c1d95"], ground: ["#1e1b4b", "#6366f1"], weather: null,  stars: true, gravity: 0.95 },
   ];

   function biomeIndex() { return Math.floor(score / 25) % BIOMES.length; }
   ```

2. **Crossfade**: track `let biomeBlend = 1; let prevBiome = 0;`. In `updatePlaying()`, when `biomeIndex()` changes, set `prevBiome` to the old index and `biomeBlend = 0`, then ramp `biomeBlend = Math.min(1, biomeBlend + 1/120)` (2 s). Add a color lerp helper:

   ```js
   function lerpColor(a, b, t) { // a, b: "#rrggbb"
     const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
     const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
     const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
     const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
     return `rgb(${r},${g},${bl})`;
   }
   ```

   In `draw()`, build the sky gradient from `lerpColor(BIOMES[prevBiome].sky[i], BIOMES[biomeIndex()].sky[i], biomeBlend)` — this replaces the `night > 0.55` ternaries. Show `showMessage(\`Entering ${biome.name}!\`)` on each transition.

3. **Per-biome pipes/ground**: pipe sprites (Step 3.1) are baked per biome palette on first use (key the cache by biome index). `drawGround()` reads `biome.ground` colors. During a crossfade just snap pipes/ground to the *new* biome — only the sky lerps; it reads fine.

4. **Weather**: when `biome.weather === "snow"`, maintain ~40 snow particles (slow fall, sine drift, respawn at top); `"rain"` (if you add a storm biome later) = fast diagonal 2px lines. Drive them from `updateAmbient()` and reuse the particle pool with gravity disabled (`vy` fixed).

5. **Space gravity**: in `updatePlaying()`, multiply `GRAVITY` by `biome.gravity ?? 1` — a *subtle* floatiness, ±5% only, so muscle memory survives.

6. Keep the existing `stars` array; gate drawing on `biome.stars` instead of `night > 0.45`.

**Verify:** with `__flappyDebug`, push score across 25/50/75/100 — each boundary crossfades the sky over ~2 s, pipes/ground restyle, snow falls in Snow Peaks, stars in Night City/Space. Score < 25 looks identical to today's day look.

---

## Step 3.4 — Deeper parallax (5 layers)

Current layers: clouds (0.10–0.24×), hills (0.34–0.48×), pipes (1×), ground texture (1×).

1. **Far layer — mountains/skyline** at 0.1× pipe speed: an array of 4 wide triangles (or rectangles with antenna lines for Night City) drawn behind clouds in the biome's `hill` color at 50% alpha. Same recycle pattern as `hills`.

2. **Foreground layer** at 1.2× pipe speed: grass blade clumps / fence posts (per biome: cacti in Sunset, snow tufts in Snow Peaks) drawn *after* `drawGround()` and *before* the HUD, anchored at `y = SKY_H + 8`. ~6 items, recycle like clouds.

3. Scale every layer's drift with `pipeSpeed()` (multiply `c.v`, `h.v` by `pipeSpeed() / BASE_PIPE_SPEED` in `updateAmbient()`), so the whole world accelerates together with difficulty and the slow power-up slows *everything* — a free, very satisfying effect.

**Verify:** the slow-time orb visibly slows clouds/mountains/foreground, not just pipes.

---

## Step 3.5 — Lighting cheats

1. **Bird ground shadow**: in `draw()` after `drawGround()`:

   ```js
   const sh = clamp(1 - (SKY_H - bird.y) / SKY_H, 0.25, 1);
   ctx.globalAlpha = 0.25 * sh;
   ctx.fillStyle = "#000";
   ctx.beginPath();
   ctx.ellipse(bird.x, SKY_H + 8, 16 * sh + 6, 4, 0, 0, Math.PI * 2);
   ctx.fill();
   ctx.globalAlpha = 1;
   ```

2. **Vignette**: bake once with `makeSprite(W, H, ...)` — a radial gradient from transparent center to `rgba(2,6,23,0.28)` edges — and blit it after particles, before the HUD.

**Verify:** shadow grows/sharpens as the bird flies low; corners are subtly darkened in every state.

---

## Acceptance checklist

- [ ] No `createLinearGradient`/complex paths in the hot draw loop (clouds, pipes, bird are blits).
- [ ] Bird has 3 wing frames, belly, tail, blink; all 8 skins correct.
- [ ] 5 biomes rotate every 25 pts with 2 s sky crossfade + announcement message.
- [ ] 5 parallax depths, all scaled by current pipe speed (slow-mo slows the world).
- [ ] Shadow + vignette present; stable 60 fps on a mid-range phone.
