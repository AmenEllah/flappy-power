# Phase 8 — Performance, Accessibility & Code Health (Implementation Guide)

**Goal:** a settings panel, colorblind-safe signals, auto-pause, and a module split once the file justifies it. Ongoing work; first pass ~1 day. Settings storage assumes Phase 6's `save` object (fallback: its own localStorage key).

---

## Step 8.1 — Settings panel

1. Schema with defaults that respect the OS:

   ```js
   const reducedMotionMQ = window.matchMedia?.("(prefers-reduced-motion: reduce)");
   save.settings = {
     shake: !(reducedMotionMQ?.matches),    // default off if OS asks for reduced motion
     flash: !(reducedMotionMQ?.matches),
     musicVol: 0.5,
     sfxVol: 1.0,
     hudLeft: true,                          // HUD on left (flip for left-handed thumb reach)
     ...save.settings,                       // saved values win over defaults
   };
   ```

2. UI: a gear button added to the toolbar in `index.html` (5th button; change the grid to `repeat(5, 1fr)` in `style.css`), opening a `"settings"` state. Render rows with the shared hit-rect mechanism from Phase 6:
   - **Screen shake** [on/off]
   - **Flash effects** [on/off]
   - **Music volume** [—————●——] (drag: on `pointerdown` inside the slider rect, track `pointermove` until `pointerup`, mapping x → 0..1)
   - **SFX volume** (same)
   - **HUD side** [left/right]
   Persist on every change.

3. Apply the settings:
   - In `draw()`: skip the shake translate when `!settings.shake`; skip the white flash fill when `!settings.flash` (keep `flash` ticking so timers behave identically).
   - Audio: `musicGain.gain.value = settings.musicVol`, `sfxGain.gain.value = settings.sfxVol` (set on change and after the graph is built).
   - `drawHud()` / `drawMissions()`: mirror x-coordinates when `!settings.hudLeft` (compute `hx = settings.hudLeft ? 14 : W - 14 - 134` etc.).

4. Live-respond to OS changes: `reducedMotionMQ?.addEventListener("change", ...)` only updates the *defaults* — never overwrite an explicit user choice (track `settings.shakeSetByUser`).

**Verify:** toggles persist; with reduced-motion OS setting and no user override, shake/flash default off; volume sliders audibly work mid-run.

---

## Step 8.2 — Colorblind-safe signals

Color is currently the only differentiator in two places.

1. **Power-up orbs — distinct shapes** (icon glyphs already exist but are small). Give each type a drawn shape behind the icon, in `drawOrb()`:

   ```js
   const ORB_SHAPES = {
     shield: "diamond",  // rotated square
     slow:   "hex",
     bonus:  "star",
     shrink: "circle",
     magnet: "ring",     // donut
     ghost:  "dashedCircle",
     double: "square",
     rocket: "triangle",
   };
   ```

   Implement a `drawShape(s, x, y, r)` switch (5–8 lines per shape with `beginPath`). Also bump the icon font from 15 px to 17 px bold.

2. **Moving pipes — pattern, not just blue.** In the pipe sprite bake (Phase 3.1), when the pipe is a `"moving"` kind, overlay diagonal stripes:

   ```js
   sctx.save();
   sctx.globalAlpha = 0.18; sctx.strokeStyle = "#fff"; sctx.lineWidth = 6;
   for (let x = -64; x < 128; x += 18) {
     sctx.beginPath(); sctx.moveTo(x, 64); sctx.lineTo(x + 64, 0); sctx.stroke();
   }
   sctx.restore();
   ```

   Same idea for crushers (Phase 5.3): the "about to close" telegraph adds a chevron pattern, not only a red tint.

3. **Combo/multiplier text**: already text-based — fine. Mission checkmarks: already ✓/○ — fine.

**Verify:** screenshot the game and run it through a deuteranopia simulator (e.g. browser devtools rendering emulation) — every orb type and pipe behavior must be distinguishable.

---

## Step 8.3 — Auto-pause on tab blur

Mobile players die when a notification steals focus.

```js
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") {
    state = "paused";
    if (music?.stop) music.stop();
    updateButtons();
  }
});
```

Also reset the frame clock on return so the accumulator doesn't try to catch up a long absence (the `Math.min(80, ...)` cap already bounds it, but be explicit):

```js
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) lastTime = 0;   // frame() re-seeds on next rAF
});
```

(Merge both into one listener.) The existing `window blur → inputEnd` listener stays.

**Verify:** switch tabs mid-run → game is paused on return, no time-jump; resume works via tap.

---

## Step 8.4 — Performance pass

Most wins land in earlier phases (sprite cache 3.1, particle pool 2.4). Remaining checklist:

1. **Pipes**: reuse pipe objects with an `alive` flag instead of `pipes.filter(...)` per tick (same pattern as the particle pool; pool size 8 is plenty).
2. **Strings in the HUD**: `\`BEST ${best}\`` etc. allocate every frame. Cache the formatted strings and rebuild only when the underlying value changes (`let hudBestText; if (hudBest !== best) { hudBest = best; hudBestText = \`BEST ${best}\`; }`).
3. **`Object.entries(active)` in `drawHud()`** allocates per frame → iterate a fixed `ACTIVE_KEYS` array.
4. **Audit `ctx.save()/restore()`** pairs — each is cheap but they add up; drop pairs that only set `fillStyle`/`font`.
5. **Measure, don't guess**: add a debug FPS meter behind a query flag (`?fps`):

   ```js
   if (location.search.includes("fps")) { /* count frames per second, fillText top-right */ }
   ```

   Target: steady 60 fps on a mid-range Android phone with 3 power-ups active, snow weather, and 200 live particles.

---

## Step 8.5 — Module split (when `game.js` passes ~1,500 lines)

Keep it bundler-free with native ES modules.

1. `index.html`: `<script type="module" src="src/main.js"></script>`.

2. Proposed layout — split by *system*, share state through a single `game` context object rather than cross-imports:

   ```text
   src/
     main.js        // bootstrap: canvas, DPR, loop, event listeners
     state.js       // game context: state machine, score, save/persist
     physics.js     // bird, gravity, collisions, input buffer
     entities.js    // pipes, orbs, coins, obstacles, particles (pools)
     render.js      // draw* functions, sprite cache, biomes
     audio.js       // graph, music sequencer, sfx
     meta.js        // missions, achievements, shop, daily seed
   ```

3. Migration order (each step keeps the game running):
   1. Extract pure helpers (`clamp`, `rand`, `lerpColor`, `mulberry32`) → `util.js`.
   2. Extract `audio.js` (already self-contained after Phase 4).
   3. Extract `render.js` (takes `ctx` + a read-only view of state).
   4. Extract `entities.js` + `physics.js`.
   5. What remains in `main.js` is the loop and wiring.

4. Caveats: ES modules require HTTP (already true for the PWA); update `service-worker.js`'s precache list to include the new files, and bump its cache version string so clients refresh.

5. Keep `window.__flappyDebug` working — assemble it in `main.js` from the modules' exports; it's the test surface.

---

## Acceptance checklist

- [ ] Settings persist; reduced-motion OS preference respected by default, user override wins.
- [ ] Every orb type/pipe behavior distinguishable in a colorblind simulation.
- [ ] Tab switch auto-pauses; no physics catch-up jump on return.
- [ ] 60 fps on mid-range mobile in the worst-case scene; zero per-frame array allocations in steady state.
- [ ] (When split) service worker precaches all modules; `__flappyDebug` still works.
