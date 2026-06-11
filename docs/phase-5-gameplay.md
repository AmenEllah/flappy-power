# Phase 5 — Gameplay Depth (Implementation Guide)

**Goal:** four new power-ups, a coin economy, new obstacle types by score band, a revive, and difficulty selection. Estimated effort: ~2 days. Requires Phases 1–2 (spawn timer, death sequence, pool). Implement in the order below — each step is shippable alone.

---

## Step 5.1 — New power-ups

Extend the existing `POWERUPS` table; the orb spawn/collect/HUD pipeline already generalizes.

```js
const POWERUPS = {
  shield: { label: "Shield", color: "#38bdf8", duration: 540, icon: "◆" },
  slow:   { label: "Slow",   color: "#a78bfa", duration: 360, icon: "⏱" },
  bonus:  { label: "+3",     color: "#fbbf24", duration: 0,   icon: "+" },
  shrink: { label: "Shrink", color: "#69db7c", duration: 360, icon: "⚪" },
  magnet: { label: "Magnet", color: "#e879f9", duration: 360, icon: "U" },
  ghost:  { label: "Ghost",  color: "#f8fafc", duration: 240, icon: "◌" },
  double: { label: "2×",     color: "#facc15", duration: 480, icon: "×2" },
  rocket: { label: "Rocket", color: "#ef4444", duration: 150, icon: "▶" },
};
```

Also extend `active = { shield: 0, slow: 0, shrink: 0, magnet: 0, ghost: 0, double: 0, rocket: 0 }` (both the declaration and the reset in `resetWorld()`).

**Weighted spawn table** — rocket/double should be rarer. Replace the uniform pick in `spawnPipe()`:

```js
const ORB_WEIGHTS = { shield: 18, slow: 14, bonus: 16, shrink: 14, magnet: 14, ghost: 10, double: 8, rocket: 6 };
function pickOrbType() {
  const total = Object.values(ORB_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [type, w] of Object.entries(ORB_WEIGHTS)) { roll -= w; if (roll <= 0) return type; }
  return "bonus";
}
```

### Magnet (6 s)
In `updatePlaying()`, after pipe movement, lerp nearby collectibles toward the bird:

```js
if (active.magnet > 0) {
  for (const pipe of pipes) {
    const orb = pipe.orb;
    if (!orb || orb.collected) continue;
    const dx = bird.x - orb.x, dy = bird.y - orb.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 90 * 90) { orb.x += dx * 0.08; orb.y += dy * 0.08; orb.magnetized = true; }
  }
  // same loop over coins (Step 5.2)
}
```

When `orb.magnetized`, skip the line that re-anchors `orb.x/orb.y` to the pipe. Visual: draw a faint 90 px circle around the bird while active.

### Ghost (4 s)
- In the collision loop, skip pipe collision when `active.ghost > 0` (orbs/coins still collectible).
- **Risk/reward**: in the `pipe.passed` scoring block, if ghosted, award 0 points and show "ghosted…" instead of `+N` (combo neither breaks nor grows).
- Visual: in `drawBird()`, `ctx.globalAlpha = 0.5` plus a horizontal sine wobble `ctx.translate(Math.sin(tick * 0.4) * 1.5, 0)`.
- **Fairness**: if ghost expires while overlapping a pipe, grant `shieldGrace = 30` so the player isn't killed inside a wall. Check overlap with the existing `circleRectCollision`.

### 2× Score (8 s)
In the scoring block: `const pts = mult * (active.double > 0 ? 2 : 1);` (apply the same factor to near-miss +1 and bonus orbs). HUD: tint the score gold while active.

### Rocket (2.5 s)
- While active: lock `bird.vy = 0; bird.y += (H * 0.42 - bird.y) * 0.06;` (glide to mid-screen), force `pipeSpeed()` × 2 (add `* (active.rocket > 0 ? 2 : 1)` in `pipeSpeed()`), grant invincibility (skip pipe collision), and ignore flap input.
- Pipes passed during rocket still score normally.
- Visual: 3 speed-line particles per tick behind the bird + flame triangle at the tail.
- On expiry, give `shieldGrace = 24` (same overlap fairness as ghost).

**Verify** each with `__flappyDebug.activate("magnet")` etc. The HUD power-up bar (`drawHud()`) already renders any number of active timers; check 3+ active at once still fit (cap row width or shrink `w` to 64 if needed).

---

## Step 5.2 — Coins

1. Constants + state:

   ```js
   const COIN_R = 7;
   const COIN_CHANCE = 0.4;
   let coins = [];                 // active coin entities
   let runCoins = 0;               // collected this run
   let totalCoins = Number(localStorage.getItem("flappy-power-coins") || 0);
   ```

   Reset `coins = []; runCoins = 0;` in `resetWorld()`.

2. Spawn formations in `spawnPipe()` (after the orb roll; skip if this pipe got an orb to avoid clutter):

   ```js
   if (!pipe.orb && Math.random() < COIN_CHANCE) {
     const n = 3 + Math.floor(Math.random() * 3);          // 3–5 coins
     const arc = Math.random() < 0.5;
     for (let i = 0; i < n; i++) {
       coins.push({
         x: pipe.x + pipe.w + 40 + i * 26,
         y: pipe.gapY + (arc ? Math.sin((i / (n - 1)) * Math.PI) * -34 : 0),
         collected: false, spin: rand(0, Math.PI * 2),
       });
     }
   }
   ```

3. Update/collect in `updatePlaying()`:

   ```js
   for (const c of coins) {
     c.x -= speed; c.spin += 0.15;
     if (active.magnet > 0) { /* same lerp as orbs */ }
     if (!c.collected) {
       const dx = bird.x - c.x, dy = bird.y - c.y;
       if (dx * dx + dy * dy < (birdRadius() + COIN_R) ** 2) {
         c.collected = true;
         runCoins += 1;
         spawnParticle({ x: c.x, y: c.y, vx: 0, vy: -1, life: 30, max: 30, color: "#fde047", r: 0, text: "+1" });
         sfx.coin();   // short 1320 Hz sine ping, pitch +20 Hz per coin in quick succession
       }
     }
   }
   coins = coins.filter((c) => !c.collected && c.x > -20);
   ```

4. Bank on run end (fatal `crash()` path): `totalCoins += runCoins; localStorage.setItem("flappy-power-coins", String(totalCoins));`

5. Draw: spinning effect via `ctx.scale(Math.abs(Math.cos(c.spin)), 1)` on a gold circle with a darker `$`-less inner ring. HUD: small `🪙 {runCoins}` chip under the score box; show `totalCoins` on menu/game-over.

**Verify:** coins arc between pipes, magnet hoovers them, total persists across reloads.

---

## Step 5.3 — Obstacle variety by score band

Keep one `pipes` array; give pipes a `kind` field. `spawnPipe()` picks from a score-weighted table:

```js
function pickObstacleKind() {
  const table = [{ kind: "normal", w: 10 }];
  if (score >= 15) table.push({ kind: "double", w: 4 });
  if (score >= 30) table.push({ kind: "moving", w: 5 });   // existing behavior, now opt-in per spawn
  if (score >= 45) table.push({ kind: "gate", w: 3 });
  if (score >= 60) table.push({ kind: "crusher", w: 3 });
  const total = table.reduce((a, r) => a + r.w, 0);
  let roll = Math.random() * total;
  for (const r of table) { roll -= r.w; if (roll <= 0) return r.kind; }
  return "normal";
}
```

Refactor: the current "moving if score >= 30" logic moves into `kind === "moving"`.

### Double pipes (score 15+)
Spawn two normal pipes 110 px apart with **gap +26 px each** (compensation) and gap centers within ±60 px of each other (always traversable). Easiest: `spawnPipe()` spawns the pair itself and `spawnTimer` gets +45 extra ticks after a double.

### Rotating gate (score 45+)
A bar spinning slowly inside an extra-wide gap (`gap + 30`):

```js
pipe.gate = { angle: rand(0, Math.PI), speed: 0.018 * (Math.random() < 0.5 ? 1 : -1), len: pipe.gap * 0.42 };
```

Update: `gate.angle += gate.speed`. Collision — treat the bar as ~6 sample circles along its length:

```js
for (let i = -1; i <= 1; i += 0.4) {
  const gx = pipe.x + pipe.w / 2 + Math.cos(gate.angle) * gate.len * i;
  const gy = pipe.gapY + Math.sin(gate.angle) * gate.len * i;
  const dx = bird.x - gx, dy = bird.y - gy;
  if (dx * dx + dy * dy < (birdRadius() - HITBOX_PAD + 5) ** 2) { crash(pipe); break; }
}
```

Draw: a rounded bar with warning-yellow ends, plus a hub circle at the gap center.

### Crusher pipes (score 60+)
Gap oscillates between fully open and `gap × 0.55`, slowly, with a telegraph:

```js
pipe.crush = { phase: rand(0, Math.PI * 2), speed: 0.02 };
// update:
pipe.crush.phase += pipe.crush.speed;
const closeness = (Math.sin(pipe.crush.phase) + 1) / 2;       // 0 open → 1 closed
pipe.gap = pipe.baseGap * (1 - 0.45 * closeness);
```

Store `baseGap` at spawn. Telegraph: tint the pipe caps toward red as `closeness > 0.6` and emit small dust particles when fully closed. Tune `speed` so a full cycle ≈ 5 s — the player must time, never react.

**Verify:** force each kind via a temporary debug hook (`__flappyDebug.forceKind = "gate"` read inside `pickObstacleKind`). Confirm every kind is passable at its introduction score with the gap/speed at that difficulty.

---

## Step 5.4 — Revive (once per run)

1. State: add `"reviveOffer"` between dying and gameover. Add `let reviveUsed = false; let reviveWindow = 0; let reviveTaps = 0;` (reset in `resetWorld()`).

2. In `updateDying()`, when the bird lands: if `!reviveUsed && totalCoins + runCoins >= 50`, set `state = "reviveOffer"; reviveWindow = 120; reviveTaps = 0;` instead of going to gameover.

3. `updateReviveOffer()`: decrement `reviveWindow`; at 0 → `state = "gameover"` (normal flow). Draw a panel: **"REVIVE? Tap fast ×5 — 50 coins"** with a shrinking time bar and a tap counter.

4. In `inputStart()`, when `state === "reviveOffer"`: `reviveTaps += 1;` and on the 5th tap:

   ```js
   reviveUsed = true;
   totalCoins + runCoins >= 50;             // deduct from runCoins first, then totalCoins
   runCoins -= 50; if (runCoins < 0) { totalCoins += runCoins; runCoins = 0; }
   state = "playing";
   bird.y = H * 0.4; bird.vy = FLAP * 0.6; bird.alive = true; bird.rot = 0;
   shieldGrace = 90;                        // 1.5 s safety
   pipes = pipes.filter((p) => p.x > bird.x + 60 || p.x + p.w < bird.x - 60); // clear overlap
   flash = 14; showMessage("Revived!", 90);
   ```

5. Important: the tap-to-revive input must NOT also count as a flap/restart — return early from `inputStart()` after handling it.

**Verify:** die with ≥50 coins → offer appears for 2 s; 5 fast taps resume the run with shield grace; dying again goes straight to game over (once per run).

---

## Step 5.5 — Difficulty selection

1. Presets:

   ```js
   const DIFFICULTIES = {
     chill:   { label: "Chill",   speed: 0.85, gap: +24, moving: false, coinMult: 1 },
     classic: { label: "Classic", speed: 1.0,  gap: 0,   moving: true,  coinMult: 1 },
     insane:  { label: "Insane",  speed: 1.15, gap: -12, moving: true,  movingFrom: 10, coinMult: 2 },
   };
   let difficultyKey = localStorage.getItem("flappy-power-diff") || "classic";
   const diff = () => DIFFICULTIES[difficultyKey];
   ```

2. Apply: multiply in `pipeSpeed()` (`* diff().speed`), add in `pipeGap()` (`+ diff().gap`), gate the `"moving"` row of the obstacle table on `diff().moving` and use `diff().movingFrom ?? 30` as its score threshold, multiply coin pickups by `coinMult`.

3. Menu UI: three pill buttons drawn above the skin selector in `drawOverlay()` (only when `state === "menu"`). Extend `pickSkinAt()`-style hit testing — add a `pickMenuAt(x, y)` that checks the three pill rects first; selecting one sets `difficultyKey`, persists it, and does NOT start the run.

4. Per-difficulty best: change the best-score key to `flappy-power-best-${difficultyKey}` with a one-time migration (`flappy-power-best` → classic). Skin unlocks should read the **max across difficulties** so Chill players still progress:

   ```js
   function bestAny() { return Math.max(...Object.keys(DIFFICULTIES).map(k => Number(localStorage.getItem(`flappy-power-best-${k}`) || 0))); }
   ```

   Use `bestAny()` in `unlockedSkinCount()`.

**Verify:** each preset persists across reloads, HUD shows the active difficulty's best, Insane spawns moving pipes from score 10 and pays double coins.

---

## Acceptance checklist

- [ ] 8 power-up types spawn with sane rarity; HUD shows all active timers.
- [ ] Ghost/rocket never kill the player on expiry inside a pipe (grace applied).
- [ ] Coins spawn/collect/persist; magnet attracts coins and orbs.
- [ ] Obstacle kinds appear at 15/30/45/60; each is fairly passable when introduced.
- [ ] Revive: once per run, costs 50 coins, 2 s window, 5 taps, doesn't double as flap.
- [ ] Three difficulties with separate bests; skins unlock from max best.
