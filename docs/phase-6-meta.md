# Phase 6 — Meta Progression (Implementation Guide)

**Goal:** a coin shop (skins, trails, hats), achievements with lifetime stats, a seeded daily challenge, and a stats screen. Estimated effort: 1–2 days. Requires Phase 5 (coins).

---

## Step 6.0 — One persistence object (do this first)

LocalStorage keys are multiplying. Consolidate into a single versioned save:

```js
const SAVE_KEY = "flappy-power-save-v1";
const save = loadSave();

function defaultSave() {
  return {
    version: 1,
    coins: 0,
    best: { chill: 0, classic: 0, insane: 0 },
    dailyBest: {},                 // { "2026-06-11": 17 }
    skin: 0, muted: false, difficulty: "classic",
    owned: { skins: [0], trails: ["none"], hats: [] },
    equipped: { trail: "none", hat: null },
    achievements: [],              // unlocked ids
    lifetime: { runs: 0, pipes: 0, coins: 0, powerups: 0, playTicks: 0, shieldSaves: 0, revives: 0 },
    settings: {},                  // Phase 8
  };
}

function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (raw?.version === 1) return { ...defaultSave(), ...raw };
  } catch (_) {}
  // migrate legacy keys once
  const s = defaultSave();
  s.best.classic = Number(localStorage.getItem("flappy-power-best") || 0);
  s.coins = Number(localStorage.getItem("flappy-power-coins") || 0);
  s.skin = Number(localStorage.getItem("flappy-power-skin") || 0);
  s.muted = localStorage.getItem("flappy-power-muted") === "1";
  return s;
}

function persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
```

Replace every direct `localStorage` read/write in `game.js` with `save.*` + `persist()`. Keep `persist()` calls at event boundaries (run end, purchase, toggle) — not per tick.

---

## Step 6.1 — Coin shop

1. Catalog:

   ```js
   const SHOP = {
     trails: [
       { id: "none",    label: "None",    cost: 0 },
       { id: "sparkle", label: "Sparkle", cost: 150 },  // white twinkle particles
       { id: "rainbow", label: "Rainbow", cost: 300 },  // hue-cycling trail color
       { id: "fire",    label: "Fire",    cost: 300 },  // orange→red particles w/ upward drift
       { id: "bubbles", label: "Bubbles", cost: 200 },  // hollow circles floating up
     ],
     hats: [
       { id: "cap",     label: "Cap",     cost: 200 },
       { id: "crown",   label: "Crown",   cost: 500 },
       { id: "halo",    label: "Halo",    cost: 350 },
     ],
     skins: SKINS.map((s, i) => ({ id: i, label: s.name, cost: 80 * i })), // alt path to score unlocks
   };
   ```

2. New state `"shop"`, entered from a "Shop 🪙 {coins}" button on the menu overlay (add its rect to the menu hit-test from Phase 5.5). Render: three labeled rows (Trails / Hats / Skins) of item tiles — owned = full color + "equip" on tap; unowned = grayed with cost; tap with enough coins = buy + equip + `persist()` + confetti `addParticles`. A back button returns to `"menu"`.

3. Tile hit-testing: build a `shopHitRects` array each `drawShop()` frame (`{x, y, w, h, onTap}`), and a generic `pickAt(x, y)` in the pointer handler that consults whichever rect list the current state exposes. (This generalizes `pickSkinAt` — refactor it onto the same mechanism.)

4. Skin unlock logic update: a skin is usable if `i < unlockedSkinCount() || save.owned.skins.includes(i)`.

5. Rendering equipped cosmetics:
   - **Trail styles** plug into the Phase 2 trail draw: `sparkle` adds 1 white twinkle particle per 4 ticks; `rainbow` sets `trailColor = \`hsl(${tick * 3 % 360}, 90%, 70%)\``; `fire` spawns 2 orange/red pool particles per tick with `vy: -0.5`; `bubbles` draws stroked circles instead of filled.
   - **Hats** draw in `drawBird()` after the sprite, in local coords (rotates with the bird): cap = visor polygon at (−2, −14); crown = 3-spike gold polygon; halo = gold ellipse outline at (0, −22) that does NOT rotate (draw before `ctx.rotate`).

**Verify:** buy/equip persists across reload; coins decrease; every cosmetic renders in-run and on the menu idle bird.

---

## Step 6.2 — Achievements + lifetime stats

1. Track lifetime stats at the same places `missionStats` is updated (pipe pass, orb collect, shield save, run end, revive). Increment `save.lifetime.playTicks` once per run from the run's `tick` at death.

2. Definitions (~20; same `test` pattern as missions, but against `{ run: missionStats, life: save.lifetime, extra }`):

   ```js
   const ACHIEVEMENTS = [
     { id: "first10",    label: "Double Digits",  test: (c) => c.run.score >= 10 },
     { id: "pipes100",   label: "Centurion",      test: (c) => c.life.pipes >= 100 },
     { id: "pipes1000",  label: "Pipe Dream",     test: (c) => c.life.pipes >= 1000 },
     { id: "allPowers",  label: "Collector",      test: (c) => c.extra.runPowerTypes.size >= Object.keys(POWERUPS).length },
     { id: "frugal",     label: "Minimalist",     test: (c) => c.run.score >= 10 && c.extra.runFlaps <= 15 },
     { id: "phoenix",    label: "Phoenix",        test: (c) => c.extra.scoredAfterShieldSave >= 10 },
     { id: "rich",       label: "Dragon Hoard",   test: (c) => save.coins >= 1000 },
     { id: "nightOwl",   label: "Night Owl",      test: (c) => c.run.score >= 50 },
     // ... combos, near-misses, revives, daily streaks, each biome reached, etc.
   ];
   ```

   Track the small `extra` counters where they happen: `runFlaps += 1` in `flap()`, `runPowerTypes.add(type)` in `activatePowerup()`, `scoredAfterShieldSave` = score delta since last shield save (set a marker in the shield branch of `crash()`).

3. Check + toast:

   ```js
   const toastQueue = [];
   function checkAchievements() {
     for (const a of ACHIEVEMENTS) {
       if (save.achievements.includes(a.id)) continue;
       if (a.test(ctxObj())) {
         save.achievements.push(a.id);
         toastQueue.push({ label: a.label, t: 150 });
         persist();
         sfx.comboMilestone(10);
       }
     }
   }
   ```

   Call it on pipe pass, power-up collect, and run end (it's cheap — early-exits on unlocked ids). Draw toasts top-center: slide down, hold, slide up; one at a time from the queue.

4. Menu: "Achievements {n}/{total}" button → `"achievements"` state listing all with locked ones grayed (reuse the shop's rect/scroll mechanism; with ~20 items use two columns, no scrolling needed).

**Verify:** unlocking shows a toast mid-run without interrupting play; list persists; no achievement re-triggers.

---

## Step 6.3 — Daily challenge (seeded runs)

Everyone, everywhere, gets the same layout on the same date.

1. Seeded RNG:

   ```js
   function mulberry32(seed) {
     return () => {
       seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
       let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
       t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
   }
   function dateSeed() {
     const d = new Date();
     const s = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
     let h = 0;
     for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
     return { key: s, seed: h };
   }
   ```

2. **Route all gameplay randomness through one function.** Add `let rng = Math.random;` and change `rand()` to use it: `function rand(min, max) { return min + rng() * (max - min); }`. Then audit `game.js` for remaining bare `Math.random()` calls in *gameplay* code (orb chance/type, coin chance, obstacle kind, gate spin direction, mission picks) and convert them to `rng()`. Cosmetic randomness (particles, clouds, shake) may stay on `Math.random` — determinism only needs to cover what affects play.

3. Mode flag: `let dailyMode = false;`. A "Daily" button on the menu starts a run with:

   ```js
   const { key, seed } = dateSeed();
   rng = mulberry32(seed);
   dailyMode = true;
   resetWorld(true);
   ```

   Normal starts set `rng = Math.random; dailyMode = false;`. In daily mode force `difficultyKey = "classic"` (level playing field) and pick missions with `rng` too (same 3 for everyone).

4. Scorekeeping: on run end, `save.dailyBest[key] = Math.max(save.dailyBest[key] || 0, score)`. Daily runs don't touch regular bests or skin unlocks (decide and document; recommended: coins still count). Menu shows "Daily #{daysSinceEpoch}: best {n} · resets in {hh:mm}" (`86400e3 - (Date.now() % 86400e3)` for UTC reset).

5. Share hook: when sharing after a daily run, format as `Flappy Power Daily #{n}: {score} pts 🐤` — this is the viral loop.

**Verify:** two browsers on the same date produce identical pipe sequences; tomorrow differs; daily best stored under the date key; regular mode still fully random.

---

## Step 6.4 — Stats screen

A `"stats"` state from a menu button. Read-only render of `save.lifetime` + computed values:

- Runs played / total pipes / total coins earned
- Best per difficulty + daily streak (consecutive `dailyBest` date keys)
- Total play time (`playTicks / 60 / 60` minutes)
- Favorite power-up (track `lifetime.powerupCounts[type]`)
- Achievements unlocked n/total

Layout: two-column key/value list in the overlay panel style (`roundRect` card + `wrapText`). Back button → menu.

**Verify:** numbers accumulate across sessions; nothing here writes to `save`.

---

## Acceptance checklist

- [ ] Single versioned save object; legacy keys migrate once and cleanly.
- [ ] Shop: buy/equip trails, hats, skins; coins deduct; all render in-game.
- [ ] ~20 achievements with toasts; lifetime stats tracked at all event sites.
- [ ] Daily: same seed ⇒ same run worldwide; separate best; share string with daily number.
- [ ] Stats screen renders from save without mutating it.
