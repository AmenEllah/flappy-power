# Building a Flappy-Style Web Game with Power-Ups & Better Controls

A complete, phase-by-phase build guide. The code in every phase fits together — follow it top to bottom and you end up with one working game. Stack: **HTML5 Canvas + vanilla JavaScript** (no build tools, no framework, no dependencies).

**How to use this guide:** Each phase has a *Goal*, numbered *Steps*, *Code* you paste in, and a *Checkpoint* describing what should work before you move on. Don't skip the checkpoints — they're how you catch a bug while it's still small.

**Suggested build order:** Phases 1→2→3→5→6→7 gets you a playable game fastest. Then come back for 4 (control feel), 8 (power-ups), 9–11 (states, polish, deploy). The guide is written in numerical order, but this is the order I'd actually code in.

---

## Phase 1 — Project Setup

**Goal:** Three files and a canvas that draws one rectangle, scaled crisply to any screen.

**Steps**

1. Make a folder, e.g. `flappy/`. Inside it create three empty files: `index.html`, `style.css`, `game.js`.
2. Decide on a *logical resolution* and never change it: `400 × 600`. All your physics numbers (gravity, speeds, gaps) are expressed in these units. CSS will stretch the canvas to fit the screen, so the game looks the same everywhere but the math stays fixed.
3. Wire the three files together and confirm JS can draw to the canvas.

**`index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Flap</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="game" width="400" height="600"></canvas>
  <script src="game.js"></script>
</body>
</html>
```

**`style.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  height: 100%;
  background: #1a1a2e;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: manipulation;   /* kills the 300ms tap delay on mobile */
}
#game {
  /* Scale to fit the viewport while keeping the 2:3 aspect ratio.
     image-rendering keeps pixel art crisp; drop it if you use smooth art. */
  max-height: 100vh;
  max-width: 100vw;
  aspect-ratio: 400 / 600;
  height: 100vh;
  image-rendering: pixelated;
  background: #4ec0ca;
  display: block;
}
```

**`game.js`**

```js
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Logical size — match the canvas width/height attributes in HTML.
const W = canvas.width;   // 400
const H = canvas.height;  // 600

// Sanity check: draw one rectangle.
ctx.fillStyle = '#ffd43b';
ctx.fillRect(W / 2 - 15, H / 2 - 15, 30, 30);
```

**Checkpoint:** Open `index.html` in a browser. You see a teal canvas, centered, with a yellow square in the middle. Resize the window — the canvas scales but stays 2:3. If the square is blurry and you *want* crisp pixels, the `image-rendering` rule handles it.

---

## Phase 2 — The Game Loop (fixed timestep)

**Goal:** A loop that updates physics at a constant rate regardless of the monitor's refresh rate. This is the foundation of consistent "feel."

**Why fixed timestep:** If you move the bird "a little each frame," it falls twice as fast on a 120Hz screen as on 60Hz. A fixed timestep accumulates real elapsed time and runs physics in constant-size chunks, so behavior is identical on every device. Rendering still happens once per frame (as fast as the screen allows).

**Steps**

1. Define a fixed step: `STEP = 1000 / 60` ms (i.e. 60 physics ticks per second).
2. In each animation frame, add the real elapsed time to an accumulator. While the accumulator holds at least one `STEP`, run `update()` once and subtract `STEP`.
3. Guard against the "spiral of death": if the tab was backgrounded and a huge time gap arrives, clamp it.
4. Call `render()` once per frame after updates.

**Add to `game.js`** (replace the sanity-check rectangle from Phase 1):

```js
const STEP = 1000 / 60;     // fixed physics step in ms
let accumulator = 0;
let lastTime = performance.now();

function update(dt) {
  // dt is always STEP ms. All physics goes here. (Filled in next phases.)
}

function render() {
  ctx.clearRect(0, 0, W, H);
  // All drawing goes here. (Filled in next phases.)
}

function frame(now) {
  let elapsed = now - lastTime;
  lastTime = now;

  // Clamp: if the tab was hidden, don't try to catch up on 5 seconds at once.
  if (elapsed > 250) elapsed = 250;

  accumulator += elapsed;
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }

  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

**Checkpoint:** Nothing visible yet beyond a cleared screen, but the loop is running (add a `console.log` inside `update` to confirm it ticks ~60×/sec). This structure is what makes everything later feel right.

---

## Phase 3 — The Bird & Physics

**Goal:** A square that falls under gravity and jumps when you flap. Tune three numbers until it *feels* alive.

**The three numbers that define the game:**
- `GRAVITY` — how fast downward velocity builds each tick.
- `FLAP` — the instant upward velocity a tap sets (negative = up, since y grows downward).
- `MAX_FALL` — terminal velocity, so a long drop stays recoverable.

**Steps**

1. Create a `bird` object with position, velocity, and size.
2. In `update`, add gravity to velocity, clamp to `MAX_FALL`, then add velocity to position.
3. Write a `flap()` function that sets `bird.vy = FLAP`.
4. Draw the bird in `render`.
5. Tune. Start with the values below, then adjust by feel.

**Add near the top of `game.js`:**

```js
// --- Tunable physics constants (units are logical px and ticks) ---
const GRAVITY  = 0.45;   // try 0.3 (floaty) to 0.7 (heavy)
const FLAP     = -8;     // try -6 (weak) to -10 (strong)
const MAX_FALL = 11;     // terminal velocity

const bird = {
  x: 100,
  y: H / 2,
  vy: 0,
  w: 30,
  h: 30,
  rotation: 0,   // used for polish in Phase 10
};

function flap() {
  bird.vy = FLAP;
}
```

**Fill in `update`:**

```js
function update(dt) {
  bird.vy += GRAVITY;
  if (bird.vy > MAX_FALL) bird.vy = MAX_FALL;
  bird.y += bird.vy;

  // Temporary floor/ceiling so it doesn't fly off — real collisions in Phase 6.
  if (bird.y + bird.h > H) { bird.y = H - bird.h; bird.vy = 0; }
  if (bird.y < 0)          { bird.y = 0;          bird.vy = 0; }
}
```

**Fill in `render`:**

```js
function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffd43b';
  ctx.fillRect(bird.x, bird.y, bird.w, bird.h);
}
```

**Temporary input** (so you can test — proper input is Phase 4):

```js
window.addEventListener('pointerdown', flap);
```

**Checkpoint:** The square falls and rises when you click/tap. Spend real time here tweaking `GRAVITY`, `FLAP`, `MAX_FALL`. You want it to feel like it has weight but stays controllable. This single tuning pass matters more than any later feature.

---

## Phase 4 — Better Controls (what sets your game apart)

**Goal:** Make input forgiving and responsive. Classic Flappy is punishing largely because input is rigid. We add input buffering, coyote-style grace, an optional held-flap, and multi-device input.

**Steps**

1. **Multi-device input.** Capture pointer (covers mouse + touch), and keyboard (Space / ArrowUp). Always call `e.preventDefault()` on the keys so the page doesn't scroll.
2. **Input buffering.** When the player presses, don't flap instantly — record a small "I want to flap" timer. The physics step consumes it within a few frames. This makes taps that land a hair early still count.
3. **Flap cooldown.** Prevent machine-gun flapping from holding/mashing; require a few ticks between flaps for predictable height gain.
4. **Variable flap (optional).** While the button is *held*, apply a small extra upward nudge for a few ticks, so a quick tap and a held press give different heights → finer control for skilled players.
5. Route everything through the buffer; never call `flap()` directly from the event.

**Replace the temporary input from Phase 3 with this input module:**

```js
// --- Input state ---
const input = {
  bufferTimer: 0,   // ticks remaining where a queued flap is still valid
  held: false,      // is the flap control currently down?
  cooldown: 0,      // ticks until another flap is allowed
};

const BUFFER_TICKS   = 6;   // how long a queued tap stays valid (~100ms)
const COOLDOWN_TICKS = 8;   // min ticks between flaps
const HOLD_TICKS     = 8;   // how long the held-boost lasts after a press
const HOLD_BOOST     = -0.6; // extra upward accel while held
let holdTimer = 0;

function pressFlap() {
  input.bufferTimer = BUFFER_TICKS;   // queue it, don't flap yet
  input.held = true;
  holdTimer = HOLD_TICKS;
}
function releaseFlap() {
  input.held = false;
}

// Pointer (mouse + touch unified)
window.addEventListener('pointerdown', pressFlap);
window.addEventListener('pointerup', releaseFlap);

// Keyboard
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (!e.repeat) pressFlap();   // ignore OS key-repeat
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') releaseFlap();
});
```

**Update the physics in `update` to consume the buffer** (this replaces nothing from Phase 3's gravity — it sits *before* it):

```js
function update(dt) {
  // 1. Consume buffered flap if allowed
  if (input.cooldown > 0) input.cooldown--;
  if (input.bufferTimer > 0) {
    input.bufferTimer--;
    if (input.cooldown === 0) {
      bird.vy = FLAP;
      input.cooldown = COOLDOWN_TICKS;
      input.bufferTimer = 0;
    }
  }

  // 2. Variable flap: small extra lift while held, right after a press
  if (input.held && holdTimer > 0) {
    bird.vy += HOLD_BOOST;
    holdTimer--;
  }

  // 3. Gravity (from Phase 3)
  bird.vy += GRAVITY;
  if (bird.vy > MAX_FALL) bird.vy = MAX_FALL;
  bird.y += bird.vy;

  // temporary bounds (still from Phase 3, removed in Phase 6)
  if (bird.y + bird.h > H) { bird.y = H - bird.h; bird.vy = 0; }
  if (bird.y < 0)          { bird.y = 0;          bird.vy = 0; }
}
```

**Checkpoint:** Tapping feels snappy and a touch forgiving. Pressing slightly early still flaps. Holding gives a little more height than a quick tap. Space, click, and touch all work. Tune `BUFFER_TICKS`, `COOLDOWN_TICKS`, `HOLD_BOOST` to taste — these are the "feel" dials.

---

## Phase 5 — Obstacles (pipes)

**Goal:** Pipe pairs that scroll left with a randomized gap, recycled when off-screen.

**Steps**

1. Define pipe constants: scroll speed, gap height, pipe width, spawn interval.
2. Keep a `pipes` array. Each entry is one *pair*: an x-position and the y-center of the gap.
3. Spawn on a timer (in ticks). Randomize the gap center within safe bounds so it's never impossible.
4. Move every pipe left each tick. Remove pipes once fully off the left edge.
5. Draw top and bottom rectangles for each pair.

**Add constants and state:**

```js
const PIPE_SPEED    = 2.5;   // logical px per tick
const PIPE_GAP      = 160;   // vertical opening (shrink later for difficulty)
const PIPE_WIDTH    = 60;
const SPAWN_TICKS   = 90;    // ticks between spawns (~1.5s)
const GAP_MARGIN    = 80;    // keep gaps away from top/bottom edges

let pipes = [];
let spawnTimer = 0;

function spawnPipe() {
  const minCenter = GAP_MARGIN + PIPE_GAP / 2;
  const maxCenter = H - GAP_MARGIN - PIPE_GAP / 2;
  const gapCenter = minCenter + Math.random() * (maxCenter - minCenter);
  pipes.push({ x: W, gapCenter, scored: false }); // 'scored' used in Phase 7
}
```

**Add to `update`** (after the bird physics):

```js
  // Spawn
  spawnTimer++;
  if (spawnTimer >= SPAWN_TICKS) {
    spawnPipe();
    spawnTimer = 0;
  }

  // Move and cull
  for (const p of pipes) p.x -= PIPE_SPEED;
  pipes = pipes.filter(p => p.x + PIPE_WIDTH > 0);
```

**Add to `render`** (after clearing, before/after the bird as you like):

```js
  ctx.fillStyle = '#5cb85c';
  for (const p of pipes) {
    const topH = p.gapCenter - PIPE_GAP / 2;
    const botY = p.gapCenter + PIPE_GAP / 2;
    ctx.fillRect(p.x, 0, PIPE_WIDTH, topH);          // top pipe
    ctx.fillRect(p.x, botY, PIPE_WIDTH, H - botY);   // bottom pipe
  }
```

**Checkpoint:** Green pipe pairs scroll in from the right at a steady pace, each with a randomly placed gap, and disappear on the left. The bird passes through them harmlessly (collisions are next).

---

## Phase 6 — Collision Detection

**Goal:** End the run when the bird hits a pipe, the floor, or the ceiling — fairly.

**Steps**

1. Use **AABB** (axis-aligned bounding box) overlap: two rectangles intersect when each axis overlaps.
2. Shrink the bird's *collision* box a few pixels smaller than its sprite. Near-misses then feel fair instead of cheap. This is a real "better control" win.
3. Check the bird against each pipe's top and bottom rectangle, plus floor and ceiling.
4. On any hit, trigger game over (for now, just reset; the state machine in Phase 9 handles it properly).

**Add a helper and a collision check:**

```js
const HITBOX_PAD = 4;  // shrink bird's collision box for fairness

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function birdHits() {
  const bx = bird.x + HITBOX_PAD;
  const by = bird.y + HITBOX_PAD;
  const bw = bird.w - HITBOX_PAD * 2;
  const bh = bird.h - HITBOX_PAD * 2;

  // floor / ceiling
  if (by < 0 || by + bh > H) return true;

  for (const p of pipes) {
    const topH = p.gapCenter - PIPE_GAP / 2;
    const botY = p.gapCenter + PIPE_GAP / 2;
    if (aabb(bx, by, bw, bh, p.x, 0, PIPE_WIDTH, topH)) return true;
    if (aabb(bx, by, bw, bh, p.x, botY, PIPE_WIDTH, H - botY)) return true;
  }
  return false;
}
```

**In `update`,** remove the temporary floor/ceiling clamp from Phase 3/4 and add the check at the end:

```js
  if (birdHits()) {
    // Temporary: hard reset. Phase 9 turns this into a proper GAME_OVER state.
    pipes = [];
    bird.y = H / 2;
    bird.vy = 0;
    spawnTimer = 0;
  }
```

**Checkpoint:** Hitting a pipe, the top, or the bottom resets the game. Brush *just* past a pipe edge and notice the small padding makes it feel generous rather than unfair. Tune `HITBOX_PAD`.

---

## Phase 7 — Scoring

**Goal:** +1 each time the bird clears a pipe pair, plus a session high score.

**Steps**

1. Each pipe pair has a `scored` flag (added in Phase 5).
2. When a pipe's right edge passes the bird's x-position and it hasn't been scored, increment score and mark it.
3. Track `highScore` in a variable; update it on game over.
4. Draw both on screen.

> Note on persistence: keep `highScore` in a JS variable for the session. It resets on page reload. Persisting it across visits needs browser storage or a backend, which the deploy targets in Phase 11 support — but a plain in-memory high score is the right starting point.

**Add state:**

```js
let score = 0;
let highScore = 0;
```

**Add to `update`** (after moving pipes):

```js
  for (const p of pipes) {
    if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
      p.scored = true;
      score++;
    }
  }
```

**Reset score on the temporary game-over in Phase 6** (update that block):

```js
  if (birdHits()) {
    if (score > highScore) highScore = score;
    score = 0;
    pipes = [];
    bird.y = H / 2;
    bird.vy = 0;
    spawnTimer = 0;
  }
```

**Add to `render`:**

```js
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(score, W / 2, 70);
  ctx.font = '16px sans-serif';
  ctx.fillText('Best: ' + highScore, W / 2, 100);
```

**Checkpoint:** You now have a complete, playable game: flap through gaps, score goes up, crashing resets and records your best. Everything from here is enhancement.

---

## Phase 8 — Power-Ups System

**Goal:** A small *generic* system so adding a new power-up is a few lines, not a new code path. Starter set: shield, slow-motion, score multiplier, shrink.

**Design:** Each power-up is a definition with a `type`, `duration` (in ticks), and `onActivate`/`onExpire` hooks. Active effects live in a map of `type → ticks remaining`. Collectibles float in the gaps and, on pickup, activate their effect.

**Steps**

1. Define the power-up types in a lookup table.
2. Maintain `activeEffects` (a `Map` of type → remaining ticks). Each tick, decrement; when one hits zero, call its `onExpire`.
3. Spawn collectible orbs occasionally, centered in a pipe gap, scrolling left like pipes.
4. On AABB overlap between bird and orb, activate that effect and remove the orb.
5. Make the rest of the game *read* the effects: shield cancels a hit, slow-mo scales speed, multiplier scales scoring, shrink reduces the hitbox.

**Add the system:**

```js
// type -> definition
const POWERUPS = {
  shield: {
    color: '#4dabf7', duration: 0,        // shield is "until used", not timed
    onActivate() { state.shield = true; },
    onExpire() { state.shield = false; },
  },
  slowmo: {
    color: '#b197fc', duration: 240,      // ~4s
    onActivate() { state.timeScale = 0.5; },
    onExpire() { state.timeScale = 1; },
  },
  multiplier: {
    color: '#ffd43b', duration: 300,      // ~5s
    onActivate() { state.scoreMult = 2; },
    onExpire() { state.scoreMult = 1; },
  },
  shrink: {
    color: '#69db7c', duration: 360,      // ~6s
    onActivate() { state.shrink = true; },
    onExpire() { state.shrink = false; },
  },
};

// Effect & modifier state read by the rest of the game
const state = {
  shield: false,
  timeScale: 1,
  scoreMult: 1,
  shrink: false,
};

const activeEffects = new Map();   // type -> ticks remaining
let orbs = [];                     // collectibles on screen
const ORB_RADIUS = 14;
const ORB_CHANCE = 0.35;           // chance a new pipe also spawns an orb

function activatePowerup(type) {
  const def = POWERUPS[type];
  def.onActivate();
  if (def.duration > 0) activeEffects.set(type, def.duration);
}

function tickEffects() {
  for (const [type, t] of activeEffects) {
    const left = t - 1;
    if (left <= 0) {
      POWERUPS[type].onExpire();
      activeEffects.delete(type);
    } else {
      activeEffects.set(type, left);
    }
  }
}
```

**Spawn an orb alongside some pipes** — in `spawnPipe()`, before the `push`, optionally attach one:

```js
function spawnPipe() {
  const minCenter = GAP_MARGIN + PIPE_GAP / 2;
  const maxCenter = H - GAP_MARGIN - PIPE_GAP / 2;
  const gapCenter = minCenter + Math.random() * (maxCenter - minCenter);
  pipes.push({ x: W, gapCenter, scored: false });

  if (Math.random() < ORB_CHANCE) {
    const types = Object.keys(POWERUPS);
    const type = types[Math.floor(Math.random() * types.length)];
    orbs.push({ x: W + PIPE_WIDTH / 2, y: gapCenter, type });
  }
}
```

**In `update`,** drive everything through `timeScale`, move orbs, handle pickup, and use the effects. Replace the relevant parts so it reads like this:

```js
function update(dt) {
  tickEffects();
  const speed = PIPE_SPEED * state.timeScale;   // slow-mo affects world speed

  // ... (buffered flap + variable flap + gravity, scaled by timeScale if you want) ...
  bird.vy += GRAVITY * state.timeScale;
  if (bird.vy > MAX_FALL) bird.vy = MAX_FALL;
  bird.y += bird.vy * state.timeScale;

  // spawn
  spawnTimer += state.timeScale;
  if (spawnTimer >= SPAWN_TICKS) { spawnPipe(); spawnTimer = 0; }

  // move pipes + orbs
  for (const p of pipes) p.x -= speed;
  for (const o of orbs) o.x -= speed;
  pipes = pipes.filter(p => p.x + PIPE_WIDTH > 0);
  orbs  = orbs.filter(o => o.x + ORB_RADIUS > 0);

  // scoring with multiplier
  for (const p of pipes) {
    if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
      p.scored = true;
      score += state.scoreMult;
    }
  }

  // orb pickup (circle vs shrunk bird box is fine as AABB-ish)
  const pad = state.shrink ? bird.w * 0.3 : HITBOX_PAD;
  for (const o of orbs) {
    if (aabb(bird.x + pad, bird.y + pad, bird.w - pad*2, bird.h - pad*2,
             o.x - ORB_RADIUS, o.y - ORB_RADIUS, ORB_RADIUS*2, ORB_RADIUS*2)) {
      activatePowerup(o.type);
      o.dead = true;
    }
  }
  orbs = orbs.filter(o => !o.dead);

  // collision, now shield-aware (replaces the Phase 6/7 block)
  if (birdHits()) {
    if (state.shield) {
      state.shield = false;
      activeEffects.delete('shield');
      // brief mercy: nudge up so you don't immediately re-hit
      bird.vy = FLAP;
    } else {
      if (score > highScore) highScore = score;
      score = 0;
      pipes = []; orbs = [];
      activeEffects.clear();
      state.shield = false; state.timeScale = 1; state.scoreMult = 1; state.shrink = false;
      bird.y = H / 2; bird.vy = 0; spawnTimer = 0;
    }
  }
}
```

**Make `birdHits()` respect shrink** — change its padding line:

```js
  const pad = state.shrink ? bird.w * 0.3 : HITBOX_PAD;
  const bx = bird.x + pad, by = bird.y + pad;
  const bw = bird.w - pad * 2, bh = bird.h - pad * 2;
```

**Draw orbs and an active-effect indicator in `render`:**

```js
  for (const o of orbs) {
    ctx.beginPath();
    ctx.fillStyle = POWERUPS[o.type].color;
    ctx.arc(o.x, o.y, ORB_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  // simple effect HUD
  let hudY = 130;
  ctx.font = '13px sans-serif';
  for (const [type, t] of activeEffects) {
    ctx.fillStyle = POWERUPS[type].color;
    ctx.fillText(`${type} ${(t / 60).toFixed(1)}s`, W / 2, hudY);
    hudY += 18;
  }
  if (state.shield) {
    ctx.strokeStyle = POWERUPS.shield.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(bird.x - 4, bird.y - 4, bird.w + 8, bird.h + 8);
  }
```

**Checkpoint:** Colored orbs appear in some gaps. Grabbing one triggers its effect: shield outlines the bird and eats one hit; slow-mo visibly slows the world; multiplier makes score jump by 2; shrink makes near-misses easier. Adding a *fifth* power-up is now just one entry in `POWERUPS` plus reading its state somewhere.

---

## Phase 9 — Game States

**Goal:** Replace the hacky in-loop reset with a clean state machine: `MENU → PLAYING → GAME_OVER`.

**Steps**

1. Add a `gameState` variable and a `reset()` that returns the world to a fresh PLAYING setup.
2. Branch `update` and `render` on the state. In MENU and GAME_OVER, physics is paused (or just the bird bobbing).
3. Make input context-sensitive: a press in MENU starts the game; in PLAYING it flaps; in GAME_OVER it returns to MENU (add a short delay so you don't instantly restart on the same tap).

**Add state and reset:**

```js
const MENU = 'MENU', PLAYING = 'PLAYING', GAME_OVER = 'GAME_OVER';
let gameState = MENU;
let gameOverTimer = 0;

function reset() {
  bird.y = H / 2; bird.vy = 0;
  pipes = []; orbs = []; spawnTimer = 0;
  score = 0;
  activeEffects.clear();
  state.shield = false; state.timeScale = 1; state.scoreMult = 1; state.shrink = false;
}
```

**Rework `pressFlap()` to be state-aware:**

```js
function pressFlap() {
  if (gameState === MENU) {
    reset();
    gameState = PLAYING;
  } else if (gameState === PLAYING) {
    input.bufferTimer = BUFFER_TICKS;
    input.held = true;
    holdTimer = HOLD_TICKS;
  } else if (gameState === GAME_OVER && gameOverTimer <= 0) {
    gameState = MENU;
  }
}
```

**Wrap `update` so physics only runs while PLAYING.** The collision block now sets state instead of resetting inline:

```js
function update(dt) {
  if (gameState === GAME_OVER && gameOverTimer > 0) gameOverTimer--;
  if (gameState !== PLAYING) return;

  // ... all the Phase 8 physics, spawning, scoring, pickups ...

  if (birdHits()) {
    if (state.shield) {
      state.shield = false; activeEffects.delete('shield'); bird.vy = FLAP;
    } else {
      if (score > highScore) highScore = score;
      gameState = GAME_OVER;
      gameOverTimer = 40;   // ticks before a tap can restart
    }
  }
}
```

**Branch `render`:**

```js
function render() {
  ctx.clearRect(0, 0, W, H);
  // world (pipes, orbs, bird, score) — draw in every state so the menu has a backdrop
  drawWorld();

  if (gameState === MENU) {
    drawCenterText('FLAP', 'Tap to start');
  } else if (gameState === GAME_OVER) {
    drawCenterText('Game Over', 'Tap to continue');
  }
}

function drawCenterText(title, sub) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 20);
  ctx.font = '18px sans-serif';
  ctx.fillText(sub, W / 2, H / 2 + 20);
}
```

Move your pipe/orb/bird/score drawing into a `drawWorld()` function so both `render` branches can reuse it.

**Checkpoint:** You start on a menu, tap to play, crash into a clear Game Over screen, and tap (after a brief beat) to return to the menu. No more silent in-loop resets.

---

## Phase 10 — Polish ("juice")

**Goal:** The small touches that make it feel *good*. None are required to function; all are cheap and high-impact.

**Steps & snippets** (add incrementally, test each):

1. **Bird rotation toward velocity.** In `drawWorld`, rotate the bird so it points up on a flap and dives on a fall:

```js
function drawBird() {
  // map velocity to a tilt angle, clamped
  const target = Math.max(-0.5, Math.min(1.2, bird.vy / 12));
  bird.rotation += (target - bird.rotation) * 0.2; // smooth toward target
  ctx.save();
  ctx.translate(bird.x + bird.w / 2, bird.y + bird.h / 2);
  ctx.rotate(bird.rotation);
  ctx.fillStyle = '#ffd43b';
  ctx.fillRect(-bird.w / 2, -bird.h / 2, bird.w, bird.h);
  ctx.restore();
}
```

2. **Screen shake on crash.** Keep a `shake` value; offset the canvas by a random jitter while it decays:

```js
let shake = 0;
// on a real (non-shield) hit:  shake = 12;
// at the top of render, before drawing:
if (shake > 0) {
  ctx.save();
  ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  shake *= 0.85;
  if (shake < 0.5) shake = 0;
}
// ...draw everything...
// at the very end of render, if you called save():  ctx.restore();
```

3. **Particles on flap and pickup.** A tiny array of short-lived dots:

```js
let particles = [];
function burst(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      life: 20, color,
    });
  }
}
function updateParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life--; }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life / 20;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}
// call burst() inside the flap branch and on orb pickup;
// call updateParticles() in update, drawParticles() in drawWorld.
```

4. **Sound.** Use the Web Audio API for zero-asset blips, or short audio files. Minimal beep:

```js
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq = 600, dur = 0.07) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.connect(gain); gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.start(); osc.stop(audioCtx.currentTime + dur);
}
// beep(700) on flap, beep(900) on score, beep(200,0.2) on crash.
// Note: browsers require audio to start from a user gesture — the first
// flap (a click/tap) satisfies that, so you're fine.
```

5. **Power-up flash.** When an effect activates, draw a brief full-screen tint in that power-up's color, fading over ~10 frames.

6. **Difficulty ramp.** Slowly shrink `PIPE_GAP` or raise `PIPE_SPEED` as score climbs, with a floor/ceiling so it stays possible.

**Checkpoint:** Flapping kicks up particles, the bird tilts naturally, crashes shake the screen and thud, scoring chirps. The game now *feels* finished even though mechanically it's the same as end of Phase 9.

---

## Phase 11 — Deploy

**Goal:** A public URL. Your game is static files, so hosting is free and instant.

**Option A — GitHub Pages**
1. Create a GitHub repo and push your three files.
2. Repo → Settings → Pages → Source: deploy from `main`, root folder.
3. Wait ~1 minute; your game is live at `https://<user>.github.io/<repo>/`.

**Option B — Netlify / Vercel (drag-and-drop)**
1. Sign in at netlify.com (or vercel.com).
2. Drag your project folder onto the dashboard's deploy area.
3. You get a live URL immediately; optionally connect the Git repo for auto-deploys on push.

**Pre-deploy checklist**
- Test on an actual phone — touch input, scaling, and the no-scroll behavior (`touch-action`, `user-scalable=no`).
- Confirm the canvas fills the screen on both portrait phones and desktop.
- Make sure the first interaction unlocks audio (it will, since the first flap is a tap/click).
- If you added persistence later, verify it works on the deployed origin, not just locally.

**Checkpoint:** You can send someone a link and they can play on their phone. Done.

---

## Where to go next

- **Persistent high scores / leaderboard:** add a tiny backend (or a serverless function on Vercel/Netlify) and store scores there.
- **Sprites & animation:** swap the rectangles for a sprite sheet; animate wing flaps by cycling frames.
- **More power-ups:** the Phase 8 system means each new one is one table entry plus reading its state.
- **Juice deeper:** parallax background layers, a trail behind the bird, easing on the score popup, a combo system.

## Quick reference — the tunable constants

| Constant | Phase | What it controls |
|---|---|---|
| `GRAVITY`, `FLAP`, `MAX_FALL` | 3 | Core game feel |
| `BUFFER_TICKS`, `COOLDOWN_TICKS`, `HOLD_BOOST` | 4 | Control forgiveness/responsiveness |
| `PIPE_SPEED`, `PIPE_GAP`, `SPAWN_TICKS` | 5 | Difficulty/pacing |
| `HITBOX_PAD` | 6 | Collision fairness |
| `ORB_CHANCE`, per-power-up `duration` | 8 | Power-up frequency & strength |

Tune feel-related constants (Phases 3–4) *first and most*; everything downstream depends on the bird feeling right.
