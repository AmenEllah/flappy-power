(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const shareBtn = document.getElementById("shareBtn");

  // C5: render at devicePixelRatio for crisp output; all logic stays in 400x600 logical px
  const W = 400;
  const H = 600;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

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
  const BASE_SPAWN_DIST = 218;
  const HITBOX_PAD = 6;
  const ORB_CHANCE = 0.36;
  const SHIELD_GRACE_TICKS = 90;
  const SHRINK_SCALE = 0.58;
  const NEAR_MISS_THRESHOLD = 14;
  const PRESTIGE_TRAILS = ["#f0abfc", "#fde68a", "#67e8f9", "#fb7185", "#a78bfa", "#fdba74"];
  const TITLE_FONT = "'Lilita One', system-ui";

  const POWERUPS = {
    shield: { label: "Shield", color: "#38bdf8", duration: 540, icon: "◆" },
    slow:   { label: "Slow",   color: "#a78bfa", duration: 360, icon: "⏱" },
    bonus:  { label: "+3",     color: "#fbbf24", duration: 0,   icon: "+" },
    shrink: { label: "Shrink", color: "#69db7c", duration: 360, icon: "⚪" },
    magnet: { label: "Magnet", color: "#f472b6", duration: 420, icon: "◎" },
    star:   { label: "2× Score", color: "#fde047", duration: 480, icon: "★" },
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

  // C2: parallax biomes, one every 25 points, crossfaded
  const BIOMES = [
    { name: "Meadow", type: "meadow", skyTop: "#60a5fa", skyMid: "#7dd3fc", skyBot: "#bae6fd", pipe: ["#16a34a", "#86efac", "#15803d"], ground: "#f59e0b", grass: "#22c55e", hill: "#22c55e", hillA: 0.24 },
    { name: "Sunset City", type: "city", skyTop: "#7c2d12", skyMid: "#f97316", skyBot: "#fde68a", pipe: ["#0f766e", "#5eead4", "#115e59"], ground: "#92400e", grass: "#65a30d", hill: "#1e293b", hillA: 0 },
    { name: "Night", type: "night", skyTop: "#312e81", skyMid: "#4338ca", skyBot: "#0f172a", pipe: ["#15803d", "#4ade80", "#166534"], ground: "#78350f", grass: "#16a34a", hill: "#14532d", hillA: 0.2 },
    { name: "Snowfield", type: "snow", skyTop: "#bfdbfe", skyMid: "#e0f2fe", skyBot: "#f8fafc", pipe: ["#0e7490", "#67e8f9", "#155e75"], ground: "#cbd5e1", grass: "#f1f5f9", hill: "#94a3b8", hillA: 0.25 },
  ];

  const PIPE_COLORS = {
    mover:  ["#1d4ed8", "#93c5fd", "#1e40af"],
    breath: ["#7c3aed", "#c4b5fd", "#6d28d9"],
  };

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

  const missionStats = { pipesPassed: 0, powerupsCollected: 0, maxCombo: 0, shieldsCollected: 0, score: 0, maxMultiplier: 1 };

  let state = "menu"; // menu | playing | dying | gameover | paused
  let accumulator = 0;
  let lastTime = 0;
  let tick = 0;
  let score = 0;
  let combo = 0;
  let best = Number(localStorage.getItem("flappy-power-best") || 0);
  let selectedSkin = Number(localStorage.getItem("flappy-power-skin") || 0);
  let muted = localStorage.getItem("flappy-power-muted") === "1";
  let hapticsOn = localStorage.getItem("flappy-power-haptics") !== "0";
  let assist = localStorage.getItem("flappy-power-assist") === "1";
  let daily = false;
  let flash = 0;
  let shake = 0;
  let messageTimer = 0;
  let message = "";
  let powerupsCollected = 0;
  let shieldGrace = 0;
  let newBest = false;
  let activeMissions = [];
  let audioCtx = null;
  let ambientGain = null;
  let lastUnlockedIndex = unlockedSkinCount() - 1;

  // A1: death sequence state
  let deathTimer = 0;
  let deathBounced = false;
  let deathRest = 0;
  let gameoverTicks = 0;
  let displayScore = 0;

  // A3: distance-based pipe spawning
  let distSinceSpawn = 0;

  // C2: biome crossfade state
  let biomePrev = 0;
  let biomeCur = 0;
  let biomeFade = 1;

  // A5: seeded RNG for daily runs
  let courseRand = Math.random;

  const keys = { down: false, holdTicks: 0 };
  let inputBuffer = 0;
  let flapCooldown = 0;

  const bird = { x: 104, y: 250, r: 15, vy: 0, rot: 0, wing: 0, wingPhase: 0, alive: true };
  let pipes = [];
  let particles = [];
  let popups = [];
  let trail = [];
  let clouds = [];
  let hills = [];
  let stars = [];
  let buildings = [];
  let snowflakes = [];
  let active = { shield: 0, slow: 0, shrink: 0, magnet: 0, star: 0 };

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function rand(min, max) { return min + Math.random() * (max - min); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dateSeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function dailyKey() { return `flappy-power-daily-${dateSeed()}`; }
  function dailyBest() { return Number(localStorage.getItem(dailyKey()) || 0); }

  function difficulty() {
    if (score <= 65) return score / 65;
    return 1 + (score - 65) * 0.004;
  }

  function comboMultiplier() { return Math.max(1, Math.floor(combo / 5)); }

  function pipeSpeed() {
    const d = Math.min(difficulty(), 2.5);
    return (BASE_PIPE_SPEED + d * 1.42) * (active.slow > 0 ? 0.58 : 1) * (assist ? 0.75 : 1);
  }
  function pipeGap() { return Math.max(104, BASE_PIPE_GAP - Math.min(difficulty(), 1) * 34) + (assist ? 26 : 0); }
  function spawnDistance() { return Math.max(176, BASE_SPAWN_DIST - Math.min(difficulty(), 1) * 30); }
  function birdRadius() { return active.shrink > 0 ? bird.r * SHRINK_SCALE : bird.r; }
  function unlockedSkinCount() { return clamp(Math.floor(best / 10) + 1, 1, SKINS.length); }
  function skin() { return SKINS[clamp(selectedSkin, 0, unlockedSkinCount() - 1)]; }
  function prestige() { return score > 80 ? Math.floor((score - 80) / 25) : 0; }
  function prestigeColor() { return PRESTIGE_TRAILS[prestige() % PRESTIGE_TRAILS.length]; }

  function medalFor(s) {
    if (s >= 80) return { name: "Platinum", color: "#a5f3fc", rim: "#22d3ee" };
    if (s >= 50) return { name: "Gold", color: "#fde047", rim: "#eab308" };
    if (s >= 25) return { name: "Silver", color: "#e2e8f0", rim: "#94a3b8" };
    if (s >= 10) return { name: "Bronze", color: "#f59e0b", rim: "#b45309" };
    return null;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(hexA, hexB, t) {
    const pa = parseInt(hexA.slice(1), 16);
    const pb = parseInt(hexB.slice(1), 16);
    const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const b = Math.round(lerp(pa & 255, pb & 255, t));
    return `rgb(${r},${g},${b})`;
  }

  function blendedPalette() {
    const a = BIOMES[biomePrev];
    const b = BIOMES[biomeCur];
    const t = biomeFade;
    return {
      skyTop: lerpColor(a.skyTop, b.skyTop, t),
      skyMid: lerpColor(a.skyMid, b.skyMid, t),
      skyBot: lerpColor(a.skyBot, b.skyBot, t),
      pipe: [lerpColor(a.pipe[0], b.pipe[0], t), lerpColor(a.pipe[1], b.pipe[1], t), lerpColor(a.pipe[2], b.pipe[2], t)],
      ground: lerpColor(a.ground, b.ground, t),
      grass: lerpColor(a.grass, b.grass, t),
      hill: lerpColor(a.hill, b.hill, t),
      hillA: lerp(a.hillA, b.hillA, t),
    };
  }

  function biomeTypeWeight(type) {
    let w = 0;
    if (BIOMES[biomeCur].type === type) w += biomeFade;
    if (BIOMES[biomePrev].type === type) w += 1 - biomeFade;
    return Math.min(1, w);
  }

  function pickMissions() {
    const pool = [...MISSION_POOL];
    const picked = [];
    while (picked.length < 3 && pool.length > 0) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
  }

  function vibrate(ms) {
    if (hapticsOn && navigator.vibrate) navigator.vibrate(ms);
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
    message = startPlaying ? (daily ? "Daily run — same course for everyone!" : "Mission: pass pipes + collect orbs") : "";
    powerupsCollected = 0;
    shieldGrace = 0;
    newBest = false;
    deathTimer = 0;
    deathBounced = false;
    deathRest = 0;
    gameoverTicks = 0;
    displayScore = 0;
    distSinceSpawn = 0;
    biomePrev = 0;
    biomeCur = 0;
    biomeFade = 1;
    inputBuffer = 0;
    flapCooldown = 0;
    keys.down = false;
    keys.holdTicks = 0;
    Object.assign(bird, { x: 104, y: 250, vy: 0, rot: 0, wing: 0, wingPhase: 0, alive: true });
    active = { shield: 0, slow: 0, shrink: 0, magnet: 0, star: 0 };
    pipes = [];
    particles = [];
    popups = [];
    trail = [];
    clouds = Array.from({ length: 7 }, (_, i) => ({ x: i * 72 + rand(0, 28), y: rand(38, 190), s: rand(0.55, 1.25), v: rand(0.10, 0.24) }));
    hills = Array.from({ length: 5 }, (_, i) => ({ x: i * 108 - 20, y: SKY_H - rand(30, 80), s: rand(0.75, 1.35), v: rand(0.34, 0.48) }));
    stars = Array.from({ length: 26 }, () => ({ x: rand(0, W), y: rand(16, 190), tw: rand(0, Math.PI * 2) }));
    buildings = Array.from({ length: 9 }, (_, i) => ({ x: i * 52 + rand(-8, 8), w: rand(32, 50), h: rand(56, 150), v: 0.3, lit: Math.random() < 0.7 }));
    snowflakes = Array.from({ length: 42 }, () => ({ x: rand(0, W), y: rand(0, SKY_H), r: rand(1, 2.6), v: rand(0.4, 1.1), drift: rand(0, Math.PI * 2) }));
    Object.assign(missionStats, { pipesPassed: 0, powerupsCollected: 0, maxCombo: 0, shieldsCollected: 0, score: 0, maxMultiplier: 1 });
    activeMissions = pickMissions();
    courseRand = daily ? mulberry32(dateSeed()) : Math.random;
    if (startPlaying) {
      spawnPipe();
      if (ambientGain) ambientGain.gain.setTargetAtTime(muted ? 0 : 0.008, audioCtx.currentTime, 0.5);
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

  // C4: floating score popups at the action, not just the center banner
  function spawnPopup(x, y, text, color = "#ffffff") {
    popups.push({ x, y, text, color, life: 52, max: 52 });
  }

  // A2: weighted pipe-type table that evolves with score
  function choosePipeType() {
    const r = courseRand();
    if (score >= 50 && r < 0.10) return "double";
    if (score >= 40) {
      if (r < 0.28) return "breath";
      if (r < 0.55) return "mover";
      return "static";
    }
    if (score >= 15) return r < 0.25 ? "mover" : "static";
    return "static";
  }

  function makePipe(x, gapY, type) {
    const gap = pipeGap();
    const pipe = {
      x, gapY, baseGapY: gapY, gap, baseGap: gap, w: BASE_PIPE_W, passed: false, orb: null, type,
      moveAmp: type === "mover" ? 18 + courseRand() * 18 : 0,
      movePhase: courseRand() * Math.PI * 2,
      moveSpeed: 0.022 + courseRand() * 0.016,
      breathAmp: type === "breath" ? 10 : 0,
    };
    return pipe;
  }

  function spawnPipe() {
    const gap = pipeGap();
    const margin = 54;
    const gapY = margin + gap / 2 + courseRand() * (SKY_H - 2 * margin - gap);
    const type = choosePipeType();
    const pipe = makePipe(W + 22, gapY, type === "double" ? "static" : type);
    if (courseRand() < ORB_CHANCE) {
      const r = courseRand();
      let orbType, orbOffsetY;
      if (r < 0.08) {
        // A4: star orbs are rare and parked near a gap edge — tempting but risky
        orbType = "star";
        orbOffsetY = (courseRand() < 0.5 ? -1 : 1) * gap * 0.38;
      } else {
        const types = ["shield", "slow", "bonus", "shrink", "magnet"];
        orbType = types[Math.floor(((r - 0.08) / 0.92) * types.length) % types.length];
        orbOffsetY = (courseRand() * 2 - 1) * gap * 0.27;
      }
      pipe.orb = { x: pipe.x + pipe.w / 2, y: gapY + orbOffsetY, orbOffsetY, r: 12, type: orbType, collected: false, free: false, pulse: courseRand() * Math.PI * 2 };
    }
    pipes.push(pipe);
    if (type === "double") {
      const gap2Y = clamp(gapY + (courseRand() * 180 - 90), margin + gap / 2, SKY_H - margin - gap / 2);
      pipes.push(makePipe(W + 22 + 118, gap2Y, "static"));
      distSinceSpawn = -118;
    }
  }

  function flap() {
    bird.vy = FLAP;
    bird.wing = 8;
    flapCooldown = COOLDOWN_TICKS;
    inputBuffer = 0;
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
      const pts = 3 * comboMultiplier();
      score += pts;
      combo += 1;
      missionStats.score = score;
      spawnPopup(bird.x + 20, bird.y - 16, `+${pts}`, POWERUPS.bonus.color);
      flash = 10;
      beep(880, 0.09, "square", 0.035);
      vibrate(10);
      checkUnlocks();
      return;
    }
    active[type] = POWERUPS[type].duration;
    showMessage(`${POWERUPS[type].label}!`, 90);
    flash = 8;
    beep(type === "shield" ? 660 : type === "star" ? 990 : type === "shrink" ? 590 : 330, 0.12, "triangle", 0.04);
    vibrate(10);
    if (type === "shield") missionStats.shieldsCollected += 1;
  }

  function checkUnlocks() {
    if (assist) return; // assist runs don't count toward best/unlocks
    const previousBest = best;
    best = Math.max(best, score);
    localStorage.setItem("flappy-power-best", String(best));
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
    // A1: enter the dying state — slow-mo tumble, then the game-over card
    state = "dying";
    bird.alive = false;
    combo = 0;
    deathTimer = 0;
    deathBounced = false;
    deathRest = 0;
    bird.vy = -3.2;
    shake = 18;
    flash = 22;
    checkUnlocks();
    if (daily && score > dailyBest()) localStorage.setItem(dailyKey(), String(score));
    addParticles(bird.x, bird.y, "#fb7185", 34, 5);
    beep(130, 0.22, "sawtooth", 0.045);
    vibrate(20);
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
    if (state === "dying") return; // let the death animation play out
    if (state === "menu" || (state === "gameover" && gameoverTicks > 15)) {
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

    // C2: advance biome crossfade
    const targetBiome = Math.floor(score / 25) % BIOMES.length;
    if (targetBiome !== biomeCur) {
      biomePrev = biomeCur;
      biomeCur = targetBiome;
      biomeFade = 0;
      showMessage(`Entering ${BIOMES[biomeCur].name}!`, 96);
    }
    if (biomeFade < 1) biomeFade = Math.min(1, biomeFade + 1 / 90);

    if (inputBuffer > 0 && flapCooldown <= 0) flap();
    if (keys.down && keys.holdTicks > 0 && bird.vy < 0) {
      bird.vy += HOLD_BOOST;
      keys.holdTicks -= 1;
    }

    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY);
    bird.y += bird.vy;
    bird.rot = clamp(bird.vy / 9, -0.55, 1.25);
    bird.wingPhase += bird.wing > 0 ? 0.55 : 0.18;

    if (tick % 2 === 0) {
      trail.push({ x: bird.x - 10, y: bird.y + 4 });
      if (trail.length > 10) trail.shift();
    }

    // A3: spawn by distance traveled so spacing stays even at any speed
    const speed = pipeSpeed();
    distSinceSpawn += speed;
    if (distSinceSpawn >= spawnDistance()) {
      spawnPipe();
      distSinceSpawn = 0;
    }

    for (const pipe of pipes) {
      pipe.x -= speed;

      if (pipe.moveAmp > 0) {
        pipe.movePhase += pipe.moveSpeed;
        pipe.gapY = pipe.baseGapY + Math.sin(pipe.movePhase) * pipe.moveAmp;
      }
      if (pipe.breathAmp > 0) {
        pipe.movePhase += pipe.moveSpeed;
        pipe.gap = pipe.baseGap + Math.sin(pipe.movePhase) * pipe.breathAmp;
      }

      const orb = pipe.orb;
      if (orb && !orb.collected) {
        if (!orb.free) {
          orb.x = pipe.x + pipe.w / 2;
          orb.y = pipe.gapY + orb.orbOffsetY;
        }
        orb.pulse += 0.16;
        // A4: magnet pulls nearby orbs to the bird
        if (active.magnet > 0) {
          const dx = bird.x - orb.x;
          const dy = bird.y - orb.y;
          const d = Math.hypot(dx, dy) || 1;
          if (orb.free || d < 90) {
            orb.free = true;
            orb.x += (dx / d) * 3;
            orb.y += (dy / d) * 3;
          }
        }
      }

      if (!pipe.passed && pipe.x + pipe.w < bird.x - birdRadius()) {
        pipe.passed = true;
        const starMult = active.star > 0 ? 2 : 1;
        const pts = comboMultiplier() * starMult;
        score += pts;
        combo += 1;
        missionStats.pipesPassed += 1;
        missionStats.score = score;
        if (combo > missionStats.maxCombo) missionStats.maxCombo = combo;
        if (comboMultiplier() > missionStats.maxMultiplier) missionStats.maxMultiplier = comboMultiplier();
        flash = 5;
        spawnPopup(bird.x + 18, bird.y - 14, `+${pts}${starMult > 1 ? " ★" : ""}`, starMult > 1 ? "#fde047" : "#ffffff");

        const topH = pipe.gapY - pipe.gap / 2;
        const botY = pipe.gapY + pipe.gap / 2;
        const topClear = (bird.y - birdRadius()) - topH;
        const botClear = botY - (bird.y + birdRadius());
        const minClear = Math.min(topClear, botClear);
        if (minClear >= 0 && minClear < NEAR_MISS_THRESHOLD) {
          score += 1;
          missionStats.score = score;
          spawnPopup(bird.x + 18, bird.y + 10, "Close! +1", "#fef3c7");
          addParticles(bird.x, bird.y, "#ffffff", 8, 2.2);
          beep(1100, 0.04, "sine", 0.025);
          vibrate(8);
        } else {
          addParticles(bird.x, bird.y - 20, combo >= 5 ? "#f0abfc" : "#fde68a", combo >= 5 ? 14 : 8, 2.4);
          beep(combo >= 5 ? 960 : 760, 0.06, "sine", 0.03);
        }

        if (combo === 5 || combo === 10 || combo === 20) {
          showMessage(`Combo x${combo}! ${comboMultiplier() > 1 ? `×${comboMultiplier()} score` : ""}`, 84);
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

    if (state !== "playing") { updateAmbient(); return; }

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

  // A1: slow-mo tumble, single bounce, then rest → game over card
  function updateDying() {
    tick += 1;
    deathTimer += 1;
    if (flash > 0) flash -= 1;
    if (shake > 0) shake -= 1;
    const ts = deathTimer < 45 ? 0.45 : 1;
    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * ts);
    bird.y += bird.vy * ts;
    bird.rot += 0.14 * ts;
    const radius = birdRadius();
    if (bird.y + radius >= SKY_H) {
      bird.y = SKY_H - radius;
      if (!deathBounced) {
        deathBounced = true;
        bird.vy = -3.4;
        addParticles(bird.x, bird.y + radius, "#d6d3d1", 12, 2.6);
        vibrate(12);
      } else {
        bird.vy = 0;
        deathRest += 1;
        if (deathRest > 22) {
          state = "gameover";
          gameoverTicks = 0;
          displayScore = 0;
          updateButtons();
        }
      }
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
    for (const b of buildings) {
      b.x -= b.v;
      if (b.x + b.w < -10) Object.assign(b, { x: W + rand(0, 30), w: rand(32, 50), h: rand(56, 150), lit: Math.random() < 0.7 });
    }
    for (const f of snowflakes) {
      f.y += f.v;
      f.x += Math.sin(tick * 0.02 + f.drift) * 0.4;
      if (f.y > SKY_H) { f.y = -4; f.x = rand(0, W); }
    }
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 1;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) {
      p.y -= 0.7;
      p.life -= 1;
    }
    popups = popups.filter((p) => p.life > 0);
  }

  function update() {
    if (state === "playing") updatePlaying();
    else if (state === "dying") updateDying();
    else {
      tick += 1;
      if (state === "gameover") {
        gameoverTicks += 1;
        displayScore = Math.min(score, displayScore + Math.max(0.5, score / 50));
      }
      if (flash > 0) flash -= 1;
      if (shake > 0) shake -= 1;
      updateAmbient();
      if (state === "menu") {
        bird.y += Math.sin(tick * 0.05) * 0.18;
        bird.rot = Math.sin(tick * 0.04) * 0.08;
        bird.wingPhase += 0.14;
      }
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

  function drawHill(h, pal) {
    if (pal.hillA <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = pal.hillA;
    ctx.fillStyle = pal.hill;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 70 * h.s, 72 * h.s, 82 * h.s, 0, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }

  function drawBuildings(alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    for (const b of buildings) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(b.x, SKY_H - b.h, b.w, b.h);
      if (b.lit) {
        ctx.fillStyle = "rgba(253, 230, 138, .8)";
        for (let wy = SKY_H - b.h + 10; wy < SKY_H - 12; wy += 18) {
          ctx.fillRect(b.x + 6, wy, 5, 7);
          if (b.w > 40) ctx.fillRect(b.x + b.w - 12, wy, 5, 7);
        }
      }
    }
    ctx.restore();
  }

  function drawSnow(alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = "#f8fafc";
    for (const f of snowflakes) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPipe(pipe, pal, snowW) {
    const topH = pipe.gapY - pipe.gap / 2;
    const botY = pipe.gapY + pipe.gap / 2;
    const colors = PIPE_COLORS[pipe.type] || pal.pipe;
    const grad = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.w, 0);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.5, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.fillStyle = grad;
    roundRect(pipe.x, -12, pipe.w, topH + 12, 10); ctx.fill();
    roundRect(pipe.x, botY, pipe.w, SKY_H - botY + 12, 10); ctx.fill();
    // C3: rim shadow under the caps for depth
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(pipe.x, topH - 2, pipe.w, 4);
    ctx.fillRect(pipe.x, botY + 22, pipe.w, 3);
    ctx.fillStyle = grad;
    roundRect(pipe.x - 6, topH - 22, pipe.w + 12, 24, 9); ctx.fill();
    roundRect(pipe.x - 6, botY, pipe.w + 12, 24, 9); ctx.fill();
    // C3: vertical highlight strip
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(pipe.x + 8, 0, 4, Math.max(0, topH - 22));
    ctx.fillRect(pipe.x + 8, botY + 24, 4, Math.max(0, SKY_H - botY - 24));
    // C3: snow caps in the snow biome
    if (snowW > 0.5) {
      ctx.fillStyle = "rgba(248, 250, 252, .92)";
      roundRect(pipe.x - 6, topH - 22, pipe.w + 12, 7, 4); ctx.fill();
      roundRect(pipe.x - 6, botY, pipe.w + 12, 7, 4); ctx.fill();
    }
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

  function drawTrail() {
    if (state !== "playing") return;
    const color = prestige() > 0 ? prestigeColor() : skin().glow;
    ctx.save();
    ctx.fillStyle = color;
    trail.forEach((t, i) => {
      ctx.globalAlpha = (i / trail.length) * 0.35;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2 + i * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // C1: upgraded bird — wing cycle, belly, outlined body, tracking pupil, squash & stretch
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
    if (prestige() > 0) {
      ctx.strokeStyle = prestigeColor();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + Math.sin(tick * 0.12) * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 13 + Math.sin(tick * 0.09) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const sy = clamp(1 - bird.vy * 0.014, 0.9, 1.12);
    const sx = clamp(1 + bird.vy * 0.009, 0.92, 1.08);
    ctx.scale(sx, sy);
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
    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.30)";
    ctx.beginPath();
    ctx.arc(1, 5, bird.r * 0.62, 0, Math.PI);
    ctx.fill();
    const wingRy = 5.5 + Math.sin(bird.wingPhase) * 2.8;
    const wingRot = -0.4 + Math.sin(bird.wingPhase) * 0.22;
    ctx.fillStyle = current.wing;
    ctx.beginPath();
    ctx.ellipse(-6, 4, 9, wingRy, wingRot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = current.beak;
    if (bird.wing > 0) {
      ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(26, 0); ctx.lineTo(12, 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(12, 4); ctx.lineTo(24, 6); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(26, 3); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(7, -6, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = current.eye;
    ctx.beginPath();
    ctx.arc(8.2, -6 + clamp(bird.vy * 0.25, -1.6, 2), 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGround(pal) {
    const y = SKY_H;
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, y, W, GROUND_H);
    ctx.fillStyle = pal.grass;
    ctx.fillRect(0, y, W, 14);
    ctx.fillStyle = "rgba(0, 0, 0, .14)";
    const scroll = (tick * pipeSpeed()) % 40;
    for (let x = -40 + scroll; x < W + 40; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x + 18, H); ctx.lineTo(x + 36, y + 14); ctx.fill();
    }
    // C4: front grass tufts for a second parallax layer
    ctx.fillStyle = "rgba(0,0,0,.16)";
    const tuftScroll = (tick * pipeSpeed() * 1.3) % 56;
    for (let x = -56 + tuftScroll; x < W + 56; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, y + 14); ctx.lineTo(x + 4, y + 5); ctx.lineTo(x + 8, y + 14);
      ctx.moveTo(x + 8, y + 14); ctx.lineTo(x + 12, y + 7); ctx.lineTo(x + 16, y + 14);
      ctx.fill();
    }
  }

  function drawPopups() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life / 18);
      ctx.font = `800 14px ${TITLE_FONT}`;
      ctx.strokeStyle = "rgba(15,23,42,.6)";
      ctx.lineWidth = 3;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .36)";
    roundRect(14, 14, 134, 46, 18); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `28px ${TITLE_FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(String(score), 28, 36);
    ctx.font = "700 11px system-ui"; ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText(`BEST ${best}`, 70, 29);

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

    let tagX = 14;
    for (const tag of [assist ? "ASSIST" : null, daily ? "DAILY" : null]) {
      if (!tag) continue;
      ctx.fillStyle = "rgba(15, 23, 42, .42)";
      roundRect(tagX, 144, 56, 20, 10); ctx.fill();
      ctx.fillStyle = tag === "ASSIST" ? "#86efac" : "#fde047";
      ctx.font = "800 9px system-ui"; ctx.textAlign = "center";
      ctx.fillText(tag, tagX + 28, 155);
      ctx.textAlign = "left";
      tagX += 62;
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

  function drawMiniBird(x, y, s, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = s.body;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = s.wing;
    ctx.beginPath(); ctx.ellipse(-4, 3, 6, 4.5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = s.beak;
    ctx.beginPath(); ctx.moveTo(8, -1); ctx.lineTo(18, 2); ctx.lineTo(8, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(5, -4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = s.eye;
    ctx.beginPath(); ctx.arc(5.8, -4, 1.5, 0, Math.PI * 2); ctx.fill();
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
      if (locked) {
        ctx.fillStyle = "#64748b";
        ctx.beginPath(); ctx.arc(x, 459, 11, 0, Math.PI * 2); ctx.fill();
      } else {
        drawMiniBird(x, 459, s, 1);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = locked ? "#cbd5e1" : "#fff"; ctx.font = "800 8px system-ui"; ctx.textAlign = "center";
      ctx.fillText(locked ? String(s.unlock) : "✓", x, 488);
    });
    ctx.restore();
  }

  function drawCard() {
    ctx.fillStyle = "rgba(15, 23, 42, .54)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.93)"; roundRect(26, 120, W - 52, 300, 26); ctx.fill();
    ctx.strokeStyle = "rgba(15, 23, 42, .10)"; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawButton(y, label) {
    ctx.fillStyle = "#f97316"; roundRect(92, y, W - 184, 48, 24); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `16px ${TITLE_FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, W / 2, y + 25);
  }

  // B1: menu — title, animated bird, best scores, icon hints, daily toggle
  function drawMenu() {
    ctx.save();
    drawCard();
    ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `34px ${TITLE_FONT}`;
    ctx.fillText("Flappy Power", W / 2 + 14, 162);
    drawMiniBird(64, 160, skin(), 1.4 + Math.sin(tick * 0.06) * 0.08);
    ctx.font = "800 13px system-ui"; ctx.fillStyle = "#64748b";
    ctx.fillText(`BEST ${best}   ·   DAILY BEST ${dailyBest()}`, W / 2, 196);
    ctx.font = "600 13px system-ui"; ctx.fillStyle = "#334155"; ctx.textAlign = "left";
    ctx.fillText("👆  Tap or Space to flap", 78, 226);
    ctx.fillText("◉  Grab orbs for power-ups", 78, 250);
    ctx.fillText("★  Chain combos for ×score", 78, 274);
    // daily toggle pill
    ctx.textAlign = "center";
    ctx.fillStyle = daily ? "#fde047" : "rgba(15,23,42,.08)";
    roundRect(W / 2 - 74, 292, 148, 28, 14); ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,.18)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#0f172a"; ctx.font = "800 12px system-ui";
    ctx.fillText(`Daily run: ${daily ? "ON" : "OFF"}`, W / 2, 307);
    drawButton(330, "Start game");
    ctx.fillStyle = "#64748b"; ctx.font = "700 12px system-ui";
    ctx.fillText("Tap canvas or press Space · D toggles daily", W / 2, 398);
    drawSkinSelector();
    ctx.restore();
  }

  function drawMedal(x, y, medal) {
    ctx.save();
    // ribbon
    ctx.fillStyle = "#ef4444";
    ctx.beginPath(); ctx.moveTo(x - 12, y - 30); ctx.lineTo(x - 4, y - 8); ctx.lineTo(x - 20, y - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath(); ctx.moveTo(x + 12, y - 30); ctx.lineTo(x + 20, y - 4); ctx.lineTo(x + 4, y - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = medal.color;
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = medal.rim; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = medal.rim;
    ctx.font = "900 20px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("★", x, y + 1);
    ctx.fillStyle = "#475569"; ctx.font = "800 10px system-ui";
    ctx.fillText(medal.name.toUpperCase(), x, y + 38);
    ctx.restore();
  }

  // B2: game-over card — medal, count-up score, mission recap, new-best ribbon
  function drawGameOver() {
    ctx.save();
    drawCard();
    ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `30px ${TITLE_FONT}`;
    ctx.fillText("Game over", W / 2, 156);

    const medal = medalFor(score);
    if (medal) drawMedal(96, 222, medal);
    else {
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath(); ctx.arc(96, 222, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#94a3b8"; ctx.font = "800 11px system-ui";
      ctx.fillText("10+ for", 96, 216);
      ctx.fillText("a medal", 96, 230);
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b"; ctx.font = "800 11px system-ui";
    ctx.fillText("SCORE", 170, 196);
    ctx.fillStyle = "#0f172a"; ctx.font = `34px ${TITLE_FONT}`;
    ctx.fillText(String(Math.floor(displayScore)), 170, 222);
    ctx.fillStyle = "#64748b"; ctx.font = "800 11px system-ui";
    ctx.fillText(`BEST ${best}${daily ? `  ·  DAILY ${dailyBest()}` : ""}`, 170, 250);

    const done = activeMissions.filter((m) => m.test(missionStats)).length;
    ctx.textAlign = "center";
    ctx.fillStyle = done === 3 ? "#16a34a" : "#475569"; ctx.font = "700 13px system-ui";
    ctx.fillText(`Missions complete: ${done} / 3 ${done === 3 ? "✓" : ""}`, W / 2, 290);
    ctx.fillStyle = "#94a3b8"; ctx.font = "700 11px system-ui";
    ctx.fillText(`${unlockedSkinCount()} / ${SKINS.length} skins unlocked`, W / 2, 310);

    if (newBest && Math.floor(displayScore) >= score) {
      ctx.save();
      ctx.translate(W - 78, 148);
      ctx.rotate(0.5);
      ctx.fillStyle = "#fbbf24";
      roundRect(-58, -12, 116, 24, 12); ctx.fill();
      ctx.fillStyle = "#0f172a"; ctx.font = "900 12px system-ui";
      ctx.fillText("★ NEW BEST ★", 0, 1);
      ctx.restore();
    }

    drawButton(330, "Play again");
    ctx.fillStyle = "#64748b"; ctx.font = "700 12px system-ui";
    ctx.fillText("Tap canvas or press Space", W / 2, 398);
    drawSkinSelector();
    ctx.restore();
  }

  // B3: pause sheet with sound / haptics / assist toggles
  function drawPause() {
    ctx.save();
    drawCard();
    ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `30px ${TITLE_FONT}`;
    ctx.fillText("Paused", W / 2, 160);
    const rows = [
      { label: "Sound", on: !muted },
      { label: "Haptics", on: hapticsOn },
      { label: "Assist mode (easier, no best)", on: assist },
    ];
    rows.forEach((row, i) => {
      const y = 196 + i * 42;
      ctx.fillStyle = "rgba(15,23,42,.05)";
      roundRect(50, y, W - 100, 34, 17); ctx.fill();
      ctx.fillStyle = "#334155"; ctx.font = "700 12px system-ui"; ctx.textAlign = "left";
      ctx.fillText(row.label, 66, y + 18);
      ctx.fillStyle = row.on ? "#22c55e" : "#cbd5e1";
      roundRect(W - 110, y + 6, 44, 22, 11); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(row.on ? W - 77 : W - 99, y + 17, 8, 0, Math.PI * 2); ctx.fill();
    });
    ctx.textAlign = "center";
    drawButton(330, "Resume");
    ctx.fillStyle = "#64748b"; ctx.font = "700 12px system-ui";
    ctx.fillText("P pauses · M mutes", W / 2, 398);
    ctx.restore();
  }

  function draw() {
    const pal = blendedPalette();
    const nightW = biomeTypeWeight("night");
    const cityW = biomeTypeWeight("city");
    const snowW = biomeTypeWeight("snow");
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.45, rand(-shake, shake) * 0.45);
    const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(0.55, pal.skyMid);
    sky.addColorStop(1, pal.skyBot);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (nightW > 0.05) {
      for (const s of stars) {
        ctx.globalAlpha = (0.35 + Math.sin(tick * 0.04 + s.tw) * 0.2) * nightW;
        ctx.fillStyle = "#fefce8"; ctx.fillRect(s.x, s.y, 2, 2);
      }
      ctx.globalAlpha = 1;
      // moon
      ctx.globalAlpha = nightW;
      ctx.fillStyle = "#fef9c3";
      ctx.beginPath(); ctx.arc(W - 70, 70, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal.skyTop;
      ctx.beginPath(); ctx.arc(W - 62, 64, 19, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawBuildings(cityW);
    for (const c of clouds) drawCloud(c);
    for (const h of hills) drawHill(h, pal);
    drawSnow(snowW);
    for (const pipe of pipes) drawPipe(pipe, pal, snowW);
    drawGround(pal);
    drawTrail();
    drawBird();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    drawPopups();
    // C4: combo glow vignette at combo 10+
    if (state === "playing" && combo >= 10) {
      const a = 0.14 + 0.07 * Math.sin(tick * 0.15);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.62);
      g.addColorStop(0, "rgba(240,171,252,0)");
      g.addColorStop(1, `rgba(240,171,252,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (state === "playing" || state === "dying" || state === "paused") drawHud();
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash / 70})`; ctx.fillRect(0, 0, W, H); }
    if (state === "menu") drawMenu();
    else if (state === "gameover") drawGameOver();
    else if (state === "paused") drawPause();
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
    if (ambientGain) ambientGain.gain.setTargetAtTime(muted ? 0 : 0.008, audioCtx.currentTime, 0.3);
    updateButtons();
  }

  function toggleHaptics() {
    hapticsOn = !hapticsOn;
    localStorage.setItem("flappy-power-haptics", hapticsOn ? "1" : "0");
  }

  function toggleAssist() {
    assist = !assist;
    localStorage.setItem("flappy-power-assist", assist ? "1" : "0");
  }

  function toggleDaily() {
    daily = !daily;
    showMessage(daily ? "Daily run on — seeded course" : "Daily run off", 80);
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

  function canvasPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * (W / rect.width), y: (clientY - rect.top) * (H / rect.height) };
  }

  // Returns true when the tap hit a UI control (so it shouldn't also flap/restart/resume)
  function handleUiClick(x, y) {
    if (state === "menu" || state === "gameover") {
      if (y >= 438 && y <= 496) {
        const unlocked = unlockedSkinCount();
        const idx = Math.round((x - 48) / 43);
        if (idx >= 0 && idx < unlocked && idx < SKINS.length) {
          selectedSkin = idx;
          localStorage.setItem("flappy-power-skin", String(selectedSkin));
          showMessage(`${SKINS[idx].name} selected`, 80);
        }
        return true;
      }
      if (state === "menu" && x >= W / 2 - 74 && x <= W / 2 + 74 && y >= 292 && y <= 320) {
        toggleDaily();
        return true;
      }
    }
    if (state === "paused" && x >= 50 && x <= W - 50) {
      for (let i = 0; i < 3; i++) {
        const ry = 196 + i * 42;
        if (y >= ry && y <= ry + 34) {
          if (i === 0) toggleMute();
          else if (i === 1) toggleHaptics();
          else toggleAssist();
          return true;
        }
      }
    }
    return false;
  }

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) inputStart(event);
    if (event.code === "KeyP") togglePause(event);
    if (event.code === "KeyM") toggleMute(event);
    if (event.code === "KeyD" && state === "menu") toggleDaily();
  });
  window.addEventListener("keyup", (event) => { if (["Space", "ArrowUp", "KeyW"].includes(event.code)) inputEnd(event); });
  canvas.addEventListener("pointerdown", (event) => {
    const pos = canvasPos(event.clientX, event.clientY);
    if (handleUiClick(pos.x, pos.y)) { event.preventDefault(); return; }
    inputStart(event);
  });
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
    get biome() { return { current: BIOMES[biomeCur].name, fade: biomeFade }; },
    get skin() { return { selectedSkin, unlocked: unlockedSkinCount(), current: skin().name }; },
    get active() { return { ...active, shieldGrace }; },
    get pipes() { return pipes.length; },
    get missions() { return activeMissions.map((m) => ({ label: m.label, done: m.test(missionStats) })); },
    get settings() { return { muted, hapticsOn, assist, daily }; },
    start: () => inputStart(),
    reset: () => resetWorld(false),
    setBest: (value) => { best = Number(value); localStorage.setItem("flappy-power-best", String(best)); return unlockedSkinCount(); },
    setScore: (value) => { score = Number(value); missionStats.score = score; return score; },
    selectSkin: (idx) => { selectedSkin = clamp(Number(idx), 0, unlockedSkinCount() - 1); localStorage.setItem("flappy-power-skin", String(selectedSkin)); return skin().name; },
    toggleDaily,
    toggleAssist,
    activate: activatePowerup,
    forceShieldCrash: () => { active.shield = 60; crash({ x: bird.x, gapY: bird.y, w: BASE_PIPE_W, passed: false }); return { state, active: { ...active, shieldGrace } }; },
    forceShrink: () => { activatePowerup("shrink"); return { state, radius: birdRadius(), active: { ...active, shieldGrace } }; },
  };
})();
