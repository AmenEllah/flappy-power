# Phase 1 — Foundation Fixes (Implementation Guide)

**Goal:** crisp rendering on hi-DPI screens, consistent pipe spacing, clean audio lifecycle, and no accidental restarts. No gameplay changes. Estimated effort: ~half a day.

All edits are in `game.js` unless stated otherwise.

---

## Step 1.1 — Hi-DPI rendering

Today `W`/`H` are read from the canvas attributes (400×600) and the backing store never changes, so browsers upscale it.

1. Replace the size derivation near the top of the IIFE:

   ```js
   // Before
   const W = canvas.width;
   const H = canvas.height;

   // After
   const W = 400;
   const H = 600;

   function setupHiDPI() {
     const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3x to bound fill cost
     canvas.width = W * dpr;
     canvas.height = H * dpr;
     ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
   }
   setupHiDPI();
   window.addEventListener("resize", setupHiDPI);
   ```

2. Nothing else changes: every draw call already works in 400×600 logical units, and `draw()` wraps everything in `ctx.save()`/`ctx.restore()`, so the DPR transform set by `setTransform` survives the screen-shake `translate`.

3. `index.html` keeps `width="400" height="600"` as a fallback; the script overwrites them on load.

**Verify:** open on a retina display (or set browser zoom to 200%) — text and the bird outline should be sharp. `window.__flappyDebug.state` still works; gameplay identical.

---

## Step 1.2 — Fix pipe spawn timing

`updatePlaying()` currently does `if (tick % pipeSpawnTicks() === 0) spawnPipe();`. Because `pipeSpawnTicks()` shrinks as difficulty rises, the modulo can skip spawn ticks and produce uneven gaps.

1. Add a module-level variable next to `tick`:

   ```js
   let spawnTimer = 0;
   ```

2. In `resetWorld()`, after the existing `spawnPipe()` call inside `if (startPlaying)`:

   ```js
   spawnTimer = pipeSpawnTicks();
   ```

3. In `updatePlaying()`, replace the modulo line:

   ```js
   // Before
   if (tick % pipeSpawnTicks() === 0) spawnPipe();

   // After
   spawnTimer -= 1;
   if (spawnTimer <= 0) {
     spawnPipe();
     spawnTimer = pipeSpawnTicks();
   }
   ```

**Verify:** play to score 30+; horizontal spacing between consecutive pipes should be visually constant at any difficulty (it shrinks smoothly, never doubles).

---

## Step 1.3 — Audio lifecycle

Problems: the ambient oscillator runs forever once created (even paused/muted — only its gain is zeroed), wasting battery.

1. Keep a reference to the oscillator in `startAmbient()`:

   ```js
   let ambientOsc = null; // next to ambientGain

   function startAmbient() {
     if (!audioCtx || ambientGain || muted) return;
     ambientOsc = audioCtx.createOscillator();
     ambientGain = audioCtx.createGain();
     ambientOsc.type = "sine";
     ambientOsc.frequency.value = 82;
     ambientGain.gain.value = 0.008;
     ambientOsc.connect(ambientGain);
     ambientGain.connect(audioCtx.destination);
     ambientOsc.start();
   }
   ```

2. Suspend the whole context when muted (this silences *and* stops processing), resume on unmute. In `toggleMute()`:

   ```js
   muted = !muted;
   localStorage.setItem("flappy-power-muted", muted ? "1" : "0");
   if (audioCtx) {
     if (muted) audioCtx.suspend();
     else audioCtx.resume();
   }
   updateButtons();
   ```

   (The existing `ambientGain.setTargetAtTime` line can be deleted — suspension covers it.)

3. Fade ambient on pause/resume. In `togglePause()` after the state flip:

   ```js
   if (ambientGain && audioCtx) {
     const target = state === "playing" ? 0.008 : 0;
     ambientGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.3);
   }
   ```

> Note: Phase 4 replaces this drone entirely with a music sequencer; keep this step minimal.

**Verify:** mute mid-run → CPU/audio meter goes silent immediately; unmute → drone returns. Pause → drone fades out; resume → fades back.

---

## Step 1.4 — Death-tap protection + restart zone

Players tap-spamming at the moment of death instantly restart and/or fat-finger the skin selector.

1. Add a lock counter:

   ```js
   let gameoverLock = 0; // ticks during which restart input is ignored
   ```

2. In `crash()` (the non-shield branch, right after `state = "gameover"`):

   ```js
   gameoverLock = 24; // ~0.4 s
   ```

3. Decrement it in the non-playing branch of `update()`:

   ```js
   if (gameoverLock > 0) gameoverLock -= 1;
   ```

4. Guard `inputStart()`:

   ```js
   if (state === "menu" || state === "gameover") {
     if (state === "gameover" && gameoverLock > 0) return; // swallow the death tap
     resetWorld(true);
     inputBuffer = BUFFER_TICKS;
   }
   ```

5. Optional polish: dim the "Play again" button while locked. In `drawOverlay()`, multiply the button alpha by `gameoverLock > 0 ? 0.45 : 1`.

The skin-selector mis-tap is already partially handled by `pickSkinAt()` running first in the `pointerdown` listener; with the lock in place a death tap can no longer restart *or* race the selector, which resolves the overlap complaint.

**Verify:** die while spamming taps — the game-over panel stays for ~0.4 s before a tap restarts. Selecting a skin on the game-over screen never restarts the run.

---

## Acceptance checklist

- [ ] Canvas is sharp at devicePixelRatio 2 and 3; no gameplay/physics change.
- [ ] Pipe spacing is uniform across the whole difficulty curve.
- [ ] Mute suspends the AudioContext; pause fades the ambient out and back.
- [ ] Restart requires a deliberate tap ≥ 0.4 s after death; skin taps never restart.
- [ ] `__flappyDebug` getters all still return sane values.
