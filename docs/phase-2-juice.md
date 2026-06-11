# Phase 2 — Game Feel / "Juice" (Implementation Guide)

**Goal:** make every flap, score, and death *feel* dramatic without changing balance. Estimated effort: ~1 day. Requires Phase 1 (particle pool builds on the fixed loop; death sequence uses the gameover lock).

---

## Step 2.1 — Death sequence (slow-mo + tumbling bird)

Add a new state `"dying"` between `"playing"` and `"gameover"`.

1. Add a global time scale and a dying timer:

   ```js
   let timeScale = 1;
   let dyingTimer = 0;
   ```

2. In `frame()`, apply the time scale to the accumulator:

   ```js
   accumulator += Math.min(80, (time - lastTime) * timeScale);
   ```

3. Rewrite the fatal branch of `crash()`:

   ```js
   state = "dying";
   dyingTimer = 0;
   timeScale = 0.35;            // slow-mo
   bird.alive = false;
   bird.vy = -4.2;              // small death hop
   bird.deathSpin = bird.vy < 0 ? 0.16 : 0.22;
   combo = 0;
   shake = 18;
   flash = 22;
   addParticles(bird.x, bird.y, "#fb7185", 34, 5);
   beep(130, 0.22, "sawtooth", 0.045);
   vibrate(20);
   if (ambientGain) ambientGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.8);
   ```

   (Move `checkUnlocks()` and `updateButtons()` to the moment the bird lands, step 4.)

4. Add an `updateDying()` and route it from `update()`:

   ```js
   function updateDying() {
     tick += 1;
     dyingTimer += 1;
     if (flash > 0) flash -= 1;
     if (shake > 0) shake -= 1;
     if (dyingTimer === 26) timeScale = 1;          // slow-mo lasts ~0.45 s of real time
     bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY);
     bird.y += bird.vy;
     bird.rot += bird.deathSpin;                    // tumble
     if (bird.y + birdRadius() >= SKY_H) {          // ground impact
       bird.y = SKY_H - birdRadius();
       if (bird.vy > 2) {                           // dust burst once
         addParticles(bird.x, SKY_H, "rgba(120,53,15,.8)", 16, 3);
         vibrate(12);
         bird.vy = 0;
       }
       if (dyingTimer > 60) {                       // linger, then show overlay
         state = "gameover";
         gameoverLock = 24;
         checkUnlocks();
         updateButtons();
       }
     }
     updateAmbient(); // keep clouds/particles drifting
   }

   // in update():
   if (state === "playing") updatePlaying();
   else if (state === "dying") updateDying();
   else { /* existing idle branch */ }
   ```

5. In `draw()`, only show the overlay for `"menu" | "gameover" | "paused"` — the `"dying"` state renders the world uncovered. Also make sure `resetWorld()` resets `timeScale = 1`.

**Verify:** crash into a pipe → time dips to slow motion, bird tumbles and thuds into the ground with dust, panel slides in afterward. `__flappyDebug.state` reports `"dying"` then `"gameover"`.

---

## Step 2.2 — Squash & stretch

In `drawBird()`, immediately after `ctx.rotate(bird.rot)`:

```js
const stretch = clamp(bird.vy * 0.018, -0.15, 0.15);
ctx.scale(1 - stretch, 1 + stretch); // long when diving, flat on flap
```

Because it runs after the rotation, the deformation follows the bird's facing direction. No other changes needed — shield rings etc. draw before this and stay round.

**Verify:** bird visibly flattens at the top of a flap and elongates in a dive.

---

## Step 2.3 — Motion trail

1. Add a ring buffer:

   ```js
   const TRAIL_LEN = 6;
   let trail = [];
   ```

   Reset `trail = []` in `resetWorld()`.

2. In `updatePlaying()` (and `updateDying()`), record every 2nd tick:

   ```js
   if (tick % 2 === 0) {
     trail.push({ x: bird.x, y: bird.y });
     if (trail.length > TRAIL_LEN) trail.shift();
   }
   ```

3. In `draw()`, just before `drawBird()`:

   ```js
   const trailColor = prestige() > 0 ? prestigeColor() : skin().glow;
   trail.forEach((t, i) => {
     ctx.globalAlpha = (i + 1) / TRAIL_LEN * 0.25;
     ctx.fillStyle = trailColor;
     ctx.beginPath();
     ctx.arc(t.x, t.y, birdRadius() * (0.4 + 0.6 * (i + 1) / TRAIL_LEN), 0, Math.PI * 2);
     ctx.fill();
   });
   ctx.globalAlpha = 1;
   ```

4. In `flap()`, reduce the flap particle count from 5 to 2 — the trail is now the primary motion read.

**Verify:** smooth fading ghosts behind the bird; prestige runs recolor the trail.

---

## Step 2.4 — Particle object pool

Particle churn grows ~3× in Phases 2–3; pool them to avoid GC hitches.

1. Replace the `particles` array with a fixed pool:

   ```js
   const PARTICLE_POOL_SIZE = 300;
   const particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
     alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: "", r: 1, text: null,
   }));

   function spawnParticle(props) {
     const p = particles.find((q) => !q.alive);
     if (!p) return; // pool exhausted: drop, never allocate
     Object.assign(p, { alive: true, text: null }, props);
   }
   ```

2. Rewrite `addParticles()` to call `spawnParticle()` in a loop (same fields as today).

3. In `updateAmbient()`, replace the filter:

   ```js
   for (const p of particles) {
     if (!p.alive) continue;
     p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 1;
     if (p.life <= 0) p.alive = false;
   }
   ```

4. In `draw()`, skip dead particles (`if (!p.alive) continue;`). Remove `particles = [...]` from `resetWorld()` and instead mark all dead: `for (const p of particles) p.alive = false;`.

**Verify:** behavior identical; `particles.length` is constant at 300 in devtools.

---

## Step 2.5 — Score pops + HUD pulse

1. Text particles: reuse the pool — when `text` is set, draw text instead of a circle:

   ```js
   // in the particle draw loop
   if (p.text) {
     ctx.font = "900 16px system-ui";
     ctx.textAlign = "center";
     ctx.fillStyle = p.color;
     ctx.fillText(p.text, p.x, p.y);
   } else { /* existing arc */ }
   ```

2. On pipe pass (inside the `pipe.passed` block in `updatePlaying()`):

   ```js
   spawnParticle({ x: pipe.x + pipe.w / 2, y: pipe.gapY, vx: 0, vy: -1.1,
                   life: 40, max: 40, color: "#fff", r: 0, text: `+${mult}` });
   scorePulse = 10;
   ```

   Add `let scorePulse = 0;`, decrement it in `updatePlaying()`, reset in `resetWorld()`.

3. In `drawHud()`, pulse the score font:

   ```js
   const pulseScale = 1 + scorePulse / 33; // 1.0 → 1.3
   ctx.font = `800 ${Math.round(28 * pulseScale)}px system-ui`;
   ```

**Verify:** every pass shows a rising `+N` at the gap and the HUD score "pops".

---

## Step 2.6 — Camera polish

1. Flap nudge: add `let camY = 0;`. In `flap()`: `camY = 2;`. In `updatePlaying()`: `camY *= 0.82;`.

2. Directional crash shake: store a direction on crash:

   ```js
   let shakeAngle = 0;
   // in crash(): shakeAngle = Math.atan2(bird.vy, 2); // along impact direction
   ```

3. In `draw()`, replace the random translate:

   ```js
   if (shake > 0) {
     const a = shakeAngle + rand(-0.5, 0.5);
     const m = shake * 0.45;
     ctx.translate(Math.cos(a) * rand(-m, m), Math.sin(a) * rand(-m, m));
   }
   ctx.translate(0, camY);
   ```

**Verify:** a subtle upward kick on flap; crashes shake mostly along the impact direction instead of pure jitter.

---

## Acceptance checklist

- [ ] Death: slow-mo → tumble → ground dust → overlay, in that order.
- [ ] Bird squashes/stretches with velocity; trail follows and fades.
- [ ] `+N` pops at the gap; HUD score pulses on every pass.
- [ ] No new allocations per frame from particles (pool stays at 300).
- [ ] Balance unchanged: same gravity, flap, speeds, gaps.
