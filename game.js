(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const shareBtn = document.getElementById("shareBtn");

  const W = canvas.width;
  const H = canvas.height;
  const STEP = 1000 / 60;
  const GROUND_H = 76;
  const SKY_H = H - GROUND_H;
  const GRAVITY = 0.42;
  const FLAP = -7.55;
  const HOLD_BOOST = -0.23;
  const MAX_FALL = 9.2;
  const BUFFER_TICKS = 8;
  const COOLDOWN_TICKS = 7;
  const HOLD_TICKS = 12;
  const BASE_PIPE_W = 64;
  const BASE_PIPE_GAP = 162;
  const BASE_PIPE_SPEED = 2.22;
  const BASE_SPAWN_TICKS = 98;
  const HITBOX_PAD = 6;
  const ORB_CHANCE = 0.36;
  const SHIELD_GRACE_TICKS = 90;
  const SHRINK_SCALE = 0.58;
  const NEAR_MISS_THRESHOLD = 14;
  const PRESTIGE_TRAILS = ["#f0abfc", "#fde68a", "#67e8f9", "#fb7185", "#a78bfa", "#fdba74"];

  const POWERUPS = {
    shield: { label: "Shield", color: "#38bdf8", duration: 540, icon: "◆" },
    slow:   { label: "Slow",   color: "#a78bfa", duration: 360, icon: "⏱" },
    bonus:  { label: "+3",     color: "#fbbf24", duration: 0,   icon: "+" },
    shrink: { label: "Shrink", color: "#69db7c", duration: 360, icon: "⚪" },
  };

  const SKINS = [
    { name: "Sunny",  unlock: 0,  body: "#facc15", wing: "#f59e0b", beak: "#fb923c", eye: "#111827", glow: "#fde68a" },
    { name: "Bubble", unlock: 10, body: "#38bdf8", wing: "#0ea5e9", beak: "#fbbf24", eye: "#082f49", glow: "#bae6fd" },
    { name: "Mint",   unlock: 20, body: "#4ade80", wing: "#16a34a", beak: "#fde047", eye: "#052e16", glow: "#bbf7d0" },
    { name: "Rose",   unlock: 30, body: "#fb7185", wing: "#e11d48", beak: "#f97316", eye: "#4c0519", glow: "#fecdd3" },
    { name: "Violet", unlock: 40, body: "#a78bfa", wing: "#7c3aed", beak: "#facc15", eye: "#2e1065", glow: "#ddd6fe" },
    { name: "Cyber",  unlock: 50, body: "#22d3ee", wing: "#f0abfc", beak: "#f97316", eye: "#020617", glow: "#67e8f9" },
    { name: "Lava",   unlock: 60, body: "#f97316", wing: "#dc2626", beak: "#fde047", eye: "#431407", glow: "#fed7aa" },
    { name: "Ghost",  unlock: 70, body: "#e2e8f0", wing: "#94a3b8", beak: "#38bdf8", eye: "#0f172a", glow: "#f8fafc" },
  ];

  // Step 8: rotating mission pool — 3 random missions are picked per run
  const MISSION_POOL = [
    { label: "Pass 5 pipes",        test: (s) => s.pipesPassed >= 5 },
    { label: "Pass 15 pipes",       test: (s) => s.pipesPassed >= 15 },
    { label: "Collect 3 power-ups", test: (s) => s.powerupsCollected >= 3 },
    { label: "Collect 5 power-ups", test: (s) => s.powerupsCollected >= 5 },
    { label: "Reach combo x5",      test: (s) => s.maxCombo >= 5 },
    { label: "Reach combo x8",      test: (s) => s.maxCombo >= 8 },
    { label: "Collect 2 shields",   test: (s) => s.shieldsCollected >= 2 },
    { label: "Score 10 points",     test: (s) => s.score >= 10 },
    { label: "Score 20 points",     test: (s) => s.score >= 20 },
    { label: "Get 3x multiplier",   test: (s) => s.maxMultiplier >= 3 },
  ];

  // per-run counters used by mission tests
  const missionStats = { pipesPassed: 0, powerupsCollected: 0, maxCombo: 0, shieldsCollected: 0, score: 0, maxMultiplier: 1 };

  let state = "menu";
  let accumulator = 0;
  let lastTime = 0;
  let tick = 0;
  let score = 0;
  let combo = 0;
  let best = Number(localStorage.getItem("flappy-power-best") || 0);
  let selectedSkin = Number(localStorage.getItem("flappy-power-skin") || 0);
  let muted = localStorage.getItem("flappy-power-muted") === "1";
  let flash = 0;
  let shake = 0;
  let messageTimer = 0;
  let message = "";
  let powerupsCollected = 0;
  let shieldGrace = 0;
  let newBest = false;        // Step 2: tracks if this run set a new best
  let activeMissions = [];    // Step 8: missions for the current run
  let audioCtx = null;
  let ambientGain = null;     // Step 9: gain node for the ambient bass loop
  let lastUnlockedIndex = unlockedSkinCount() - 1;

  const keys = { down: false, holdTicks: 0 };
  let inputBuffer = 0;
  let flapCooldown = 0;

  const bird = { x: 104, y: 250, r: 15, vy: 0, rot: 0, wing: 0, alive: true };
  let pipes = [];
  let particles = [];
  let clouds = [];
  let hills = [];
  let stars = [];
  let active = { shield: 0, slow: 0, shrink: 0 };

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function rand(min, max) { return min + Math.random() * (max - min); }

  // Step 5: two-phase difficulty — caps at 1.0 up to score 65, then creeps slowly forever
  function difficulty() {
    if (score <= 65) return score / 65;
    return 1 + (score - 65) * 0.004;
  }

  // Step 3: combo score multiplier — every 5 combo = +1x
  function comboMultiplier() { return Math.max(1, Math.floor(combo / 5)); }

  function pipeSpeed() {
    const d = Math.min(difficulty(), 2.5);
    return (BASE_PIPE_SPEED + d * 1.42) * (active.slow > 0 ? 0.58 : 1);
  }
  function pipeGap() { return Math.max(104, BASE_PIPE_GAP - Math.min(difficulty(), 1) * 34); }
  function pipeSpawnTicks() { return Math.max(62, Math.round(BASE_SPAWN_TICKS - Math.min(difficulty(), 1) * 20)); }
  function birdRadius() { return active.shrink > 0 ? bird.r * SHRINK_SCALE : bird.r; }
  function unlockedSkinCount() { return clamp(Math.floor(best / 10) + 1, 1, SKINS.length); }
  function skin() { return SKINS[clamp(selectedSkin, 0, unlockedSkinCount() - 1)]; }

  // Step 7: prestige level (every 25 pts past score 80) and its trail colour
  function prestige() { return score > 80 ? Math.floor((score - 80) / 25) : 0; }
  function prestigeColor() { return PRESTIGE_TRAILS[prestige() % PRESTIGE_TRAILS.length]; }

  function pickMissions() {
    const pool = [...MISSION_POOL];
    const picked = [];
    while (picked.length < 3 && pool.length > 0) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
  }

  // Step 1: haptic feedback helper
  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function resetWorld(startPlaying = false) {
    state = startPlaying ? "playing" : "menu";
    accumulator = 0;
    tick = 0;
    score = 0;
    combo = 0;
    flash = 0;
    shake = 0;
    messageTimer = 0;
    message = startPlaying ? "Mission: pass pipes + collect orbs" : "";
    powerupsCollected = 0;
    shieldGrace = 0;
    newBest = false;
    inputBuffer = 0;
    flapCooldown = 0;
    keys.down = false;
    keys.holdTicks = 0;
    Object.assign(bird, { x: 104, y: 250, vy: 0, rot: 0, wing: 0, alive: true });
    active = { shield: 0, slow: 0, shrink: 0 };
    pipes = [];
    particles = [];
    clouds = Array.from({ length: 7 }, (_, i) => ({ x: i * 72 + rand(0, 28), y: rand(38, 190), s: rand(0.55, 1.25), v: rand(0.10, 0.24) }));
    hills = Array.from({ length: 5 }, (_, i) => ({ x: i * 108 - 20, y: SKY_H - rand(30, 80), s: rand(0.75, 1.35), v: rand(0.34, 0.48) }));
    stars = Array.from({ length: 26 }, () => ({ x: rand(0, W), y: rand(16, 190), tw: rand(0, Math.PI * 2) }));
    Object.assign(missionStats, { pipesPassed: 0, powerupsCollected: 0, maxCombo: 0, shieldsCollected: 0, score: 0, maxMultiplier: 1 });
    activeMissions = pickMissions();
    if (startPlaying) {
      spawnPipe();
      // Step 9: fade ambient back in when a run starts
      if (ambientGain) ambientGain.gain.setTargetAtTime(0.008, audioCtx.currentTime, 0.5);
    }
    updateButtons();
  }

  function ensureAudio() {
    if (muted) return;
    if (!audioCtx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        audioCtx = new Audio();
        startAmbient();
      }
    }
    if (audioCtx?.state === "suspended") audioCtx.resume().then(() => { if (!ambientGain) startAmbient(); });
  }

  // Step 9: looping low-frequency bass pad for atmosphere
  function startAmbient() {
    if (!audioCtx || ambientGain || muted) return;
    const osc = audioCtx.createOscillator();
    ambientGain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 82;
    ambientGain.gain.value = 0.008;
    osc.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);
    osc.start();
  }

  function beep(freq = 440, duration = 0.08, type = "sine", gain = 0.045) {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, now);
    osc.type = type;
    vol.gain.setValueAtTime(0.0001, now);
    vol.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(vol);
    vol.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function addParticles(x, y, color, count = 10, power = 2.4) {
    for (let i = 0; i < count; i++) {
      particles.push({ x, y, vx: rand(-power, power), vy: rand(-power, power), life: rand(20, 46), max: 46, color, r: rand(1.4, 4.2) });
    }
  }

  function spawnPipe() {
    const gap = pipeGap();
    const margin = 54;
    const gapY = rand(margin + gap / 2, SKY_H - margin - gap / 2);
    // Step 6: pipes move vertically once score >= 30
    const moving = score >= 30;
    const pipe = {
      x: W + 22,
      gapY,
      baseGapY: gapY,
      gap,
      w: BASE_PIPE_W,
      passed: false,
      orb: null,
      moveAmp:   moving ? rand(18, 36) : 0,
      movePhase: moving ? rand(0, Math.PI * 2) : 0,
      moveSpeed: moving ? rand(0.022, 0.038) : 0,
    };
    if (Math.random() < ORB_CHANCE) {
      const types = Object.keys(POWERUPS);
      const orbOffsetY = rand(-gap * 0.27, gap * 0.27);
      pipe.orb = {
        x: pipe.x + pipe.w / 2,
        y: gapY + orbOffsetY,
        orbOffsetY,
        r: 12,
        type: types[Math.floor(Math.random() * types.length)],
        collected: false,
        pulse: rand(0, Math.PI * 2),
      };
    }
    pipes.push(pipe);
  }

  function flap() {
    bird.vy = FLAP;
    bird.wing = 8;
    flapCooldown = COOLDOWN_TICKS;
    inputBuffer = 0;
    // Step 7: prestige trail colour on flap particles
    const trailColor = prestige() > 0 ? prestigeColor() : "rgba(255,255,255,.75)";
    addParticles(bird.x - 8, bird.y + 8, trailColor, 5, 1.6);
    beep(520, 0.055, "triangle", 0.035);
  }

  function showMessage(text, ticks = 84) {
    message = text;
    messageTimer = ticks;
  }

  function activatePowerup(type) {
    if (type === "bonus") {
      // Step 3: bonus orb score is also multiplied by current combo multiplier
      const pts = 3 * comboMultiplier();
      score += pts;
      combo += 1;
      missionStats.score = score;
      showMessage(`+${pts} bonus!`, 72);
      flash = 10;
      beep(880, 0.09, "square", 0.035);
      vibrate(10);
      checkUnlocks();
      return;
    }
    active[type] = POWERUPS[type].duration;
    showMessage(`${POWERUPS[type].label}!`, 90);
    flash = 8;
    beep(type === "shield" ? 660 : type === "shrink" ? 590 : 330, 0.12, "triangle", 0.04);
    vibrate(10);
    if (type === "shield") missionStats.shieldsCollected += 1;
  }

  function checkUnlocks() {
    const previousBest = best;
    best = Math.max(best, score);
    localStorage.setItem("flappy-power-best", String(best));
    // Step 2: flag new best so the game-over overlay can show the banner
    if (best > previousBest) newBest = true;
    const unlocked = unlockedSkinCount() - 1;
    if (best > previousBest && unlocked > lastUnlockedIndex) {
      lastUnlockedIndex = unlocked;
      selectedSkin = unlocked;
      localStorage.setItem("flappy-power-skin", String(selectedSkin));
      showMessage(`Unlocked ${SKINS[unlocked].name} skin!`, 140);
      flash = 18;
      addParticles(bird.x, bird.y, SKINS[unlocked].glow, 36, 4.6);
    }
  }

  function crash(sourcePipe = null) {
    if (shieldGrace > 0) return;
    if (active.shield > 0) {
      active.shield = 0;
      shieldGrace = SHIELD_GRACE_TICKS;
      combo = 0;
      bird.vy = FLAP * 0.72;
      shake = 12;
      flash = 18;
      showMessage("Shield saved you!", 90);
      if (sourcePipe) {
        sourcePipe.passed = true;
        sourcePipe.x = -sourcePipe.w - 80;
        addParticles(sourcePipe.x + sourcePipe.w / 2, sourcePipe.gapY, POWERUPS.shield.color, 18, 5.2);
      }
      addParticles(bird.x, bird.y, POWERUPS.shield.color, 24, 4.2);
      beep(220, 0.16, "sawtooth", 0.04);
      vibrate(20);
      return;
    }
    state = "gameover";
    bird.alive = false;
    combo = 0;
    shake = 18;
    flash = 22;
    checkUnlocks();
    addParticles(bird.x, bird.y, "#fb7185", 34, 5);
    beep(130, 0.22, "sawtooth", 0.045);
    vibrate(20);
    // Step 9: fade ambient out on game over
    if (ambientGain) ambientGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.8);
    updateButtons();
  }

  function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
    const px = Math.max(rx, Math.min(cx, rx + rw));
    const py = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - px;
    const dy = cy - py;
    return dx * dx + dy * dy < cr * cr;
  }

  function inputStart(event) {
    event?.preventDefault?.();
    ensureAudio();
    keys.down = true;
    keys.holdTicks = HOLD_TICKS;
    inputBuffer = BUFFER_TICKS;
    if (state === "menu" || state === "gameover") {
      resetWorld(true);
      inputBuffer = BUFFER_TICKS;
    } else if (state === "paused") {
      state = "playing";
      updateButtons();
    }
  }

  function inputEnd(event) {
    event?.preventDefault?.();
    keys.down = false;
    keys.holdTicks = 0;
  }

  function updatePlaying() {
    tick += 1;
    if (inputBuffer > 0) inputBuffer -= 1;
    if (flapCooldown > 0) flapCooldown -= 1;
    if (messageTimer > 0) messageTimer -= 1;
    if (flash > 0) flash -= 1;
    if (shake > 0) shake -= 1;
    if (shieldGrace > 0) shieldGrace -= 1;
    if (bird.wing > 0) bird.wing -= 1;
    for (const key of Object.keys(active)) if (active[key] > 0) active[key] -= 1;

    if (inputBuffer > 0 && flapCooldown <= 0) flap();
    if (keys.down && keys.holdTicks > 0 && bird.vy < 0) {
      bird.vy += HOLD_BOOST;
      keys.holdTicks -= 1;
    }

    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY);
    bird.y += bird.vy;
    bird.rot = clamp(bird.vy / 9, -0.55, 1.25);

    if (tick % pipeSpawnTicks() === 0) spawnPipe();
    const speed = pipeSpeed();
    for (const pipe of pipes) {
      pipe.x -= speed;

      // Step 6: oscillate gapY for moving pipes
      if (pipe.moveAmp > 0) {
        pipe.movePhase += pipe.moveSpeed;
        pipe.gapY = pipe.baseGapY + Math.sin(pipe.movePhase) * pipe.moveAmp;
      }

      if (pipe.orb && !pipe.orb.collected) {
        pipe.orb.x = pipe.x + pipe.w / 2;
        // orb stays at its fixed offset relative to the (possibly moving) gap centre
        pipe.orb.y = pipe.gapY + pipe.orb.orbOffsetY;
        pipe.orb.pulse += 0.16;
      }

      if (!pipe.passed && pipe.x + pipe.w < bird.x - birdRadius()) {
        pipe.passed = true;

        // Step 3: score scales with combo multiplier
        const mult = comboMultiplier();
        score += mult;
        combo += 1;
        missionStats.pipesPassed += 1;
        missionStats.score = score;
        if (combo > missionStats.maxCombo) missionStats.maxCombo = combo;
        if (mult > missionStats.maxMultiplier) missionStats.maxMultiplier = mult;
        flash = 5;

        // Step 4: near-miss bonus — tight vertical clearance earns +1
        const topH = pipe.gapY - pipe.gap / 2;
        const botY = pipe.gapY + pipe.gap / 2;
        const topClear = (bird.y - birdRadius()) - topH;
        const botClear = botY - (bird.y + birdRadius());
        const minClear = Math.min(topClear, botClear);
        if (minClear >= 0 && minClear < NEAR_MISS_THRESHOLD) {
          score += 1;
          missionStats.score = score;
          showMessage("Close! +1", 60);
          addParticles(bird.x, bird.y, "#ffffff", 8, 2.2);
          beep(1100, 0.04, "sine", 0.025);
          vibrate(8);
        } else {
          addParticles(bird.x, bird.y - 20, combo >= 5 ? "#f0abfc" : "#fde68a", combo >= 5 ? 14 : 8, 2.4);
          beep(combo >= 5 ? 960 : 760, 0.06, "sine", 0.03);
        }

        if (combo === 5 || combo === 10 || combo === 20) {
          showMessage(`Combo x${combo}! ${mult > 1 ? `×${mult} score` : ""}`, 84);
          vibrate(15);
        }
        checkUnlocks();
      }
    }
    pipes = pipes.filter((pipe) => pipe.x + pipe.w > -40);

    for (const pipe of pipes) {
      const topH = pipe.gapY - pipe.gap / 2;
      const botY = pipe.gapY + pipe.gap / 2;
      const r = Math.max(4, birdRadius() - HITBOX_PAD);
      if (shieldGrace <= 0 && (circleRectCollision(bird.x, bird.y, r, pipe.x, 0, pipe.w, topH) || circleRectCollision(bird.x, bird.y, r, pipe.x, botY, pipe.w, SKY_H - botY))) {
        crash(pipe);
        break;
      }
      const orb = pipe.orb;
      if (orb && !orb.collected) {
        const dx = bird.x - orb.x;
        const dy = bird.y - orb.y;
        if (dx * dx + dy * dy < (birdRadius() + orb.r) ** 2) {
          orb.collected = true;
          powerupsCollected += 1;
          missionStats.powerupsCollected += 1;
          activatePowerup(orb.type);
          addParticles(orb.x, orb.y, POWERUPS[orb.type].color, 24, 3.4);
        }
      }
    }

    const radius = birdRadius();
    if (bird.y - radius < 0) {
      bird.y = radius;
      bird.vy = 0;
    }
    if (bird.y + radius > SKY_H) {
      bird.y = SKY_H - radius;
      crash();
    }
    updateAmbient();
  }

  function updateAmbient() {
    for (const c of clouds) {
      c.x -= c.v;
      if (c.x < -80) Object.assign(c, { x: W + 80, y: rand(38, 190), s: rand(0.55, 1.25), v: rand(0.10, 0.24) });
    }
    for (const h of hills) {
      h.x -= h.v;
      if (h.x < -130) Object.assign(h, { x: W + rand(20, 70), y: SKY_H - rand(30, 80), s: rand(0.75, 1.35) });
    }
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 1;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function update() {
    if (state === "playing") updatePlaying();
    else {
      tick += 1;
      if (flash > 0) flash -= 1;
      if (shake > 0) shake -= 1;
      updateAmbient();
      bird.y += Math.sin(tick * 0.05) * 0.18;
      bird.rot = Math.sin(tick * 0.04) * 0.08;
    }
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawCloud(c) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#eff6ff";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 18 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 18 * c.s, c.y - 8 * c.s, 22 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 40 * c.s, c.y, 17 * c.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHill(h) {
    ctx.fillStyle = "rgba(34, 197, 94, .24)";
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 70 * h.s, 72 * h.s, 82 * h.s, 0, Math.PI, 0);
    ctx.fill();
  }

  function drawPipe(pipe) {
    const topH = pipe.gapY - pipe.gap / 2;
    const botY = pipe.gapY + pipe.gap / 2;
    // Step 6: moving pipes use blue gradient to warn the player
    const moving = pipe.moveAmp > 0;
    const grad = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.w, 0);
    grad.addColorStop(0,   moving ? "#1d4ed8" : "#16a34a");
    grad.addColorStop(0.5, moving ? "#93c5fd" : "#86efac");
    grad.addColorStop(1,   moving ? "#1e40af" : "#15803d");
    ctx.fillStyle = grad;
    roundRect(pipe.x, -12, pipe.w, topH + 12, 10); ctx.fill();
    roundRect(pipe.x - 6, topH - 22, pipe.w + 12, 24, 9); ctx.fill();
    roundRect(pipe.x, botY, pipe.w, SKY_H - botY + 12, 10); ctx.fill();
    roundRect(pipe.x - 6, botY, pipe.w + 12, 24, 9); ctx.fill();
    ctx.strokeStyle = moving ? "rgba(30, 64, 175, .5)" : "rgba(15, 118, 53, .5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(pipe.x + 10, 0, 1, Math.max(0, topH - 22));
    ctx.strokeRect(pipe.x + 10, botY + 24, 1, Math.max(0, SKY_H - botY));
    if (pipe.orb && !pipe.orb.collected) drawOrb(pipe.orb);
  }

  function drawOrb(orb) {
    const power = POWERUPS[orb.type];
    const pulse = Math.sin(orb.pulse) * 2;
    ctx.save();
    ctx.shadowColor = power.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = power.color;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.r + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.86)";
    ctx.font = "bold 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(power.icon, orb.x, orb.y + 0.5);
    ctx.restore();
  }

  function drawBird() {
    const current = skin();
    const radius = birdRadius();
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);
    if (active.shield > 0 || shieldGrace > 0) {
      ctx.strokeStyle = shieldGrace > 0 ? "rgba(125, 211, 252, .92)" : "rgba(56, 189, 248, .72)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 8 + Math.sin(tick * 0.18) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Step 7: pulsing prestige aura ring
    if (prestige() > 0) {
      ctx.strokeStyle = prestigeColor();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + Math.sin(tick * 0.12) * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 13 + Math.sin(tick * 0.09) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (active.shrink > 0) {
      ctx.scale(SHRINK_SCALE, SHRINK_SCALE);
      ctx.shadowColor = POWERUPS.shrink.color;
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowColor = current.glow;
      ctx.shadowBlur = 5;
    }
    ctx.fillStyle = current.body;
    ctx.beginPath();
    ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = current.wing;
    ctx.beginPath();
    ctx.ellipse(-6, 4, 9, bird.wing > 0 ? 4 : 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = current.beak;
    ctx.beginPath();
    ctx.moveTo(12, -2); ctx.lineTo(26, 3); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = current.eye;
    ctx.beginPath();
    ctx.arc(6, -6, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGround() {
    const y = SKY_H;
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(0, y, W, GROUND_H);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(0, y, W, 14);
    ctx.fillStyle = "rgba(120, 53, 15, .22)";
    for (let x = -40 + ((tick * pipeSpeed()) % 40); x < W + 40; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x + 18, H); ctx.lineTo(x + 36, y + 14); ctx.fill();
    }
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .36)";
    roundRect(14, 14, 134, 46, 18); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 28px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(String(score), 28, 36);
    ctx.font = "700 11px system-ui"; ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText(`BEST ${best}`, 70, 29);

    // Step 3: show multiplier in combo line; Step 7: show prestige when idle
    const mult = comboMultiplier();
    if (combo >= 2) {
      ctx.fillStyle = mult > 1 ? "#fde68a" : "rgba(255,255,255,.75)";
      ctx.fillText(`COMBO x${combo}${mult > 1 ? ` ×${mult}` : ""}`, 70, 44);
    } else if (prestige() > 0) {
      ctx.fillStyle = prestigeColor();
      ctx.fillText(`❖ PRESTIGE ${prestige()}`, 70, 44);
    } else {
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText(`SKIN ${skin().name}`, 70, 44);
    }

    let x = W - 18;
    for (const [type, value] of Object.entries(active)) {
      if (value <= 0) continue;
      const power = POWERUPS[type];
      const w = 82; x -= w;
      ctx.fillStyle = "rgba(15, 23, 42, .42)"; roundRect(x, 14, w, 28, 14); ctx.fill();
      ctx.fillStyle = power.color; roundRect(x + 4, 18, Math.max(6, (w - 8) * value / power.duration), 20, 10); ctx.fill();
      ctx.fillStyle = "white"; ctx.font = "700 11px system-ui"; ctx.textAlign = "center"; ctx.fillText(power.label, x + w / 2, 32);
      x -= 8;
    }

    drawMissions();
    if (messageTimer > 0) {
      ctx.globalAlpha = Math.min(1, messageTimer / 18);
      ctx.fillStyle = "rgba(15, 23, 42, .76)"; roundRect(W / 2 - 112, 74, 224, 34, 16); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 14px system-ui"; ctx.textAlign = "center"; ctx.fillText(message, W / 2, 96);
    }
    ctx.restore();
  }

  // Step 8: use activeMissions picked per-run instead of fixed list
  function drawMissions() {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(15, 23, 42, .32)";
    roundRect(14, 66, 154, 72, 16); ctx.fill();
    ctx.font = "700 10px system-ui";
    ctx.textAlign = "left";
    activeMissions.forEach((m, i) => {
      const done = m.test(missionStats);
      ctx.fillStyle = done ? "#86efac" : "rgba(255,255,255,.76)";
      ctx.fillText(`${done ? "✓" : "○"} ${m.label}`, 26, 86 + i * 18);
    });
    ctx.restore();
  }

  function drawSkinSelector() {
    const unlocked = unlockedSkinCount();
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .40)";
    roundRect(28, 408, W - 56, 86, 20); ctx.fill();
    ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "900 13px system-ui";
    ctx.fillText(`Skins: best score unlocks one every 10 points`, W / 2, 428);
    const startX = 48;
    SKINS.forEach((s, i) => {
      const x = startX + i * 43;
      const locked = i >= unlocked;
      ctx.globalAlpha = locked ? 0.32 : 1;
      ctx.fillStyle = selectedSkin === i && !locked ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.10)";
      roundRect(x - 17, 442, 34, 34, 12); ctx.fill();
      ctx.fillStyle = locked ? "#64748b" : s.body;
      ctx.beginPath(); ctx.arc(x, 459, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = locked ? "#cbd5e1" : s.beak;
      ctx.beginPath(); ctx.moveTo(x + 8, 456); ctx.lineTo(x + 18, 461); ctx.lineTo(x + 8, 465); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = locked ? "#cbd5e1" : "#fff"; ctx.font = "800 8px system-ui";
      ctx.fillText(locked ? String(s.unlock) : "✓", x, 488);
    });
    ctx.restore();
  }

  function drawOverlay(title, subtitle, button) {
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .54)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.93)"; roundRect(26, 120, W - 52, 300, 26); ctx.fill();
    ctx.strokeStyle = "rgba(15, 23, 42, .10)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.font = "900 32px system-ui"; ctx.fillText(title, W / 2, 170);
    ctx.font = "600 14px system-ui"; wrapText(subtitle, W / 2, 202, W - 92, 21);

    // Step 2: gold "NEW BEST!" badge above the play-again button
    if (state === "gameover" && newBest) {
      ctx.fillStyle = "#fbbf24";
      roundRect(W / 2 - 62, 310, 124, 26, 13); ctx.fill();
      ctx.fillStyle = "#0f172a"; ctx.font = "900 13px system-ui";
      ctx.fillText("★ NEW BEST! ★", W / 2, 327);
    }

    const btnY = state === "gameover" && newBest ? 346 : 330;
    ctx.fillStyle = "#f97316"; roundRect(92, btnY, W - 184, 48, 24); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "900 16px system-ui"; ctx.fillText(button, W / 2, btnY + 30);
    ctx.fillStyle = "#64748b"; ctx.font = "700 12px system-ui"; ctx.fillText("Tap canvas or press Space", W / 2, btnY + 54);
    drawSkinSelector();
    ctx.restore();
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) { ctx.fillText(line, x, y); line = word; y += lineHeight; }
      else line = next;
    }
    if (line) ctx.fillText(line, x, y);
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.45, rand(-shake, shake) * 0.45);
    // Step 5: clamp difficulty to 1 for the sky colour so it stays night at 65+
    const night = Math.min(1, difficulty());
    const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
    sky.addColorStop(0, night > 0.55 ? "#312e81" : "#60a5fa");
    sky.addColorStop(0.55, night > 0.55 ? "#4338ca" : "#7dd3fc");
    sky.addColorStop(1, night > 0.55 ? "#0f172a" : "#bae6fd");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (night > 0.45) {
      for (const s of stars) {
        ctx.globalAlpha = 0.25 + Math.sin(tick * 0.04 + s.tw) * 0.2 + night * 0.35;
        ctx.fillStyle = "#fefce8"; ctx.fillRect(s.x, s.y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    for (const c of clouds) drawCloud(c);
    for (const h of hills) drawHill(h);
    for (const pipe of pipes) drawPipe(pipe);
    drawGround();
    drawBird();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    drawHud();
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash / 70})`; ctx.fillRect(0, 0, W, H); }
    if (state === "menu") drawOverlay("Flappy Power", "Dodge pipes, collect orbs, build combos, complete missions, and unlock a new bird skin every 10 best-score points.", "Start game");
    else if (state === "gameover") drawOverlay("Game over", `Score ${score} · Best ${best}. ${unlockedSkinCount()} / ${SKINS.length} skins unlocked.`, "Play again");
    else if (state === "paused") drawOverlay("Paused", "Take a break. Tap the canvas or Pause button to continue your run.", "Resume");
    ctx.restore();
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    accumulator += Math.min(80, time - lastTime);
    lastTime = time;
    while (accumulator >= STEP) { update(); accumulator -= STEP; }
    draw();
    requestAnimationFrame(frame);
  }

  function updateButtons() {
    pauseBtn.textContent = state === "paused" ? "Resume" : "Pause";
    muteBtn.textContent = muted ? "Muted" : "Sound on";
  }

  function togglePause(event) {
    event?.preventDefault?.();
    if (state === "playing") state = "paused";
    else if (state === "paused") state = "playing";
    updateButtons();
  }

  function toggleMute(event) {
    event?.preventDefault?.();
    muted = !muted;
    localStorage.setItem("flappy-power-muted", muted ? "1" : "0");
    // Step 9: sync ambient gain with mute toggle
    if (ambientGain) ambientGain.gain.setTargetAtTime(muted ? 0 : 0.008, audioCtx.currentTime, 0.3);
    updateButtons();
  }

  function toggleFullscreen(event) {
    event?.preventDefault?.();
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  async function shareScore(event) {
    event?.preventDefault?.();
    const text = `I scored ${score} in Flappy Power and unlocked ${unlockedSkinCount()} skins!`;
    try {
      if (navigator.share) await navigator.share({ title: "Flappy Power", text, url: location.href });
      else {
        await navigator.clipboard.writeText(`${text} ${location.href}`);
        showMessage("Score copied!", 90);
      }
    } catch (_) {}
  }

  function pickSkinAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (W / rect.width);
    const y = (clientY - rect.top) * (H / rect.height);
    if ((state !== "menu" && state !== "gameover") || y < 438 || y > 496) return false;
    const unlocked = unlockedSkinCount();
    const idx = Math.round((x - 48) / 43);
    if (idx >= 0 && idx < unlocked && idx < SKINS.length) {
      selectedSkin = idx;
      localStorage.setItem("flappy-power-skin", String(selectedSkin));
      showMessage(`${SKINS[idx].name} selected`, 80);
      return true;
    }
    return false;
  }

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) inputStart(event);
    if (event.code === "KeyP") togglePause(event);
    if (event.code === "KeyM") toggleMute(event);
  });
  window.addEventListener("keyup", (event) => { if (["Space", "ArrowUp", "KeyW"].includes(event.code)) inputEnd(event); });
  canvas.addEventListener("pointerdown", (event) => { if (!pickSkinAt(event.clientX, event.clientY)) inputStart(event); });
  window.addEventListener("pointerup", inputEnd);
  window.addEventListener("blur", inputEnd);
  pauseBtn.addEventListener("click", togglePause);
  muteBtn.addEventListener("click", toggleMute);
  fullscreenBtn.addEventListener("click", toggleFullscreen);
  shareBtn.addEventListener("click", shareScore);

  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./service-worker.js").catch(() => {});

  resetWorld(false);
  requestAnimationFrame(frame);

  window.__flappyDebug = {
    get state() { return state; },
    get score() { return score; },
    get best() { return best; },
    get combo() { return combo; },
    get multiplier() { return comboMultiplier(); },
    get prestige() { return prestige(); },
    get skin() { return { selectedSkin, unlocked: unlockedSkinCount(), current: skin().name }; },
    get active() { return { ...active, shieldGrace }; },
    get pipes() { return pipes.length; },
    get missions() { return activeMissions.map((m) => ({ label: m.label, done: m.test(missionStats) })); },
    start: () => inputStart(),
    reset: () => resetWorld(false),
    setBest: (value) => { best = Number(value); localStorage.setItem("flappy-power-best", String(best)); return unlockedSkinCount(); },
    selectSkin: (idx) => { selectedSkin = clamp(Number(idx), 0, unlockedSkinCount() - 1); localStorage.setItem("flappy-power-skin", String(selectedSkin)); return skin().name; },
    activate: activatePowerup,
    forceShieldCrash: () => { active.shield = 60; crash({ x: bird.x, gapY: bird.y, w: BASE_PIPE_W, passed: false }); return { state, active: { ...active, shieldGrace } }; },
    forceShrink: () => { activatePowerup("shrink"); return { state, radius: birdRadius(), active: { ...active, shieldGrace } }; },
  };
})();
