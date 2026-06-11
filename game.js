(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const shareBtn = document.getElementById("shareBtn");
  const dailyBtn = document.getElementById("dailyBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  let prevStateBeforeSettings = "menu";

  const W = 400;
  const H = 600;

  function setupHiDPI() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupHiDPI();
  window.addEventListener("resize", setupHiDPI);
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

  const BIOMES = [
    { name: "Meadow",    sky: ["#60a5fa", "#7dd3fc", "#bae6fd"], hill: "rgba(34,197,94,.24)",
      pipeA: "#16a34a", pipeB: "#86efac", pipeC: "#15803d", groundA: "#f59e0b", groundB: "#22c55e", stars: false, weather: null },
    { name: "Sunset",   sky: ["#7c2d12", "#fb923c", "#fde68a"], hill: "rgba(154,52,18,.30)",
      pipeA: "#b45309", pipeB: "#fcd34d", pipeC: "#92400e", groundA: "#c2410c", groundB: "#fb923c", stars: false, weather: null },
    { name: "Night City", sky: ["#0f172a", "#1e293b", "#334155"], hill: "rgba(2,6,23,.55)",
      pipeA: "#0e7490", pipeB: "#67e8f9", pipeC: "#155e75", groundA: "#1e293b", groundB: "#475569", stars: true, weather: null },
    { name: "Snow Peaks", sky: ["#475569", "#94a3b8", "#e2e8f0"], hill: "rgba(241,245,249,.5)",
      pipeA: "#0369a1", pipeB: "#bae6fd", pipeC: "#075985", groundA: "#cbd5e1", groundB: "#f8fafc", stars: false, weather: "snow" },
    { name: "Space",    sky: ["#020617", "#1e1b4b", "#312e81"], hill: "rgba(99,102,241,.18)",
      pipeA: "#6d28d9", pipeB: "#c4b5fd", pipeC: "#4c1d95", groundA: "#1e1b4b", groundB: "#6366f1", stars: true, weather: null, gravity: 0.95 },
  ];

  function lerpColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
    const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
    const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
    return `rgb(${r},${g},${bl})`;
  }

  const POWERUPS = {
    shield: { label: "Shield", color: "#38bdf8", duration: 540, icon: "◆" },
    slow:   { label: "Slow",   color: "#a78bfa", duration: 360, icon: "⏱" },
    bonus:  { label: "+3",     color: "#fbbf24", duration: 0,   icon: "+" },
    shrink: { label: "Shrink", color: "#69db7c", duration: 360, icon: "⚪" },
    magnet: { label: "Magnet", color: "#e879f9", duration: 360, icon: "U"  },
    ghost:  { label: "Ghost",  color: "#f8fafc", duration: 240, icon: "◌"  },
    double: { label: "2×",     color: "#facc15", duration: 480, icon: "×2" },
    rocket: { label: "Rocket", color: "#ef4444", duration: 150, icon: "▶"  },
  };

  const ORB_WEIGHTS = { shield: 18, slow: 14, bonus: 16, shrink: 14, magnet: 14, ghost: 10, double: 8, rocket: 6 };
  function pickOrbType() {
    const total = Object.values(ORB_WEIGHTS).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [type, w] of Object.entries(ORB_WEIGHTS)) { roll -= w; if (roll <= 0) return type; }
    return "bonus";
  }

  const SAVE_KEY = "flappy-power-save-v1";
  function defaultSave() {
    return {
      version: 1, coins: 0, best: 0, skin: 0, muted: false, difficulty: "classic",
      dailyBest: {}, achievements: [],
      lifetime: { runs: 0, pipes: 0, coins: 0, powerups: 0, playTicks: 0, shieldSaves: 0, revives: 0, powerupCounts: {} },
    };
  }
  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (raw?.version === 1) return Object.assign(defaultSave(), raw);
    } catch (_) {}
    const s = defaultSave();
    s.best = Number(localStorage.getItem("flappy-power-best") || 0);
    s.coins = Number(localStorage.getItem("flappy-power-coins") || 0);
    s.skin = Number(localStorage.getItem("flappy-power-skin") || 0);
    s.muted = localStorage.getItem("flappy-power-muted") === "1";
    s.difficulty = localStorage.getItem("flappy-power-diff") || "classic";
    return s;
  }
  function persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  const save = loadSave();

  const DIFFICULTIES = {
    chill:   { label: "Chill",   speed: 0.85, gap: +24, movingFrom: 999, coinMult: 1 },
    classic: { label: "Classic", speed: 1.0,  gap: 0,   movingFrom: 30,  coinMult: 1 },
    insane:  { label: "Insane",  speed: 1.15, gap: -12, movingFrom: 10,  coinMult: 2 },
  };
  let difficultyKey = save.difficulty;
  function diff() { return DIFFICULTIES[difficultyKey]; }

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

  let best = save.best;
  let selectedSkin = save.skin;
  let muted = save.muted;
  let dailyMode = false;
  let rng = Math.random;

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
    let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return { key: s, seed: h };
  }
  function dayNumber() {
    return Math.floor(Date.now() / 86400e3);
  }
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
  let ambientOsc = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let noiseBuf = null;
  const music = { timer: null, step: 0, nextTime: 0, intensity: 0 };

  const BPM = 92;
  const STEP_DUR = 60 / BPM / 2;
  const CHORDS = [
    [220.0, 261.6, 329.6],
    [174.6, 220.0, 261.6],
    [130.8, 164.8, 196.0],
    [196.0, 246.9, 293.7],
  ];
  let spawnTimer = 0;
  let gameoverLock = 0;
  let timeScale = 1;
  let dyingTimer = 0;
  let scorePulse = 0;
  let camY = 0;
  let shakeAngle = 0;
  let blinkTimer = 180;
  let prevBiomeIdx = 0;
  let biomeBlend = 1;
  let weatherParticles = [];
  let farLayer = [];
  let fgLayer = [];
  let coins = [];
  let runCoins = 0;
  let totalCoins = save.coins;
  let lastRunDate = 0;
  let reviveUsed = false;
  const reducedMotionMQ = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!save.settings) save.settings = {};
  const settings = Object.assign({
    shake: !(reducedMotionMQ?.matches),
    flash: !(reducedMotionMQ?.matches),
    hudLeft: true,
  }, save.settings);
  function saveSetting(k, v) { settings[k] = v; save.settings[k] = v; persist(); }
  let reviveWindow = 0;
  let reviveTaps = 0;
  let runFlaps = 0;
  const runPowerTypes = new Set();
  const toastQueue = [];

  const ACHIEVEMENTS = [
    { id: "first10",    label: "Double Digits",    test: (c) => c.run.score >= 10 },
    { id: "first50",    label: "High Flyer",       test: (c) => c.run.score >= 50 },
    { id: "pipes100",   label: "Centurion",        test: (c) => c.life.pipes >= 100 },
    { id: "pipes1000",  label: "Pipe Dream",       test: (c) => c.life.pipes >= 1000 },
    { id: "combo10",    label: "Combo King",       test: (c) => c.run.maxCombo >= 10 },
    { id: "allPowers",  label: "Collector",        test: (c) => c.extra.powerTypes >= 6 },
    { id: "frugal",     label: "Minimalist",       test: (c) => c.run.score >= 10 && c.extra.flaps <= 15 },
    { id: "rich",       label: "Dragon Hoard",     test: (c) => c.life.coins >= 500 },
    { id: "nightOwl",   label: "Night Owl",        test: (c) => c.run.score >= 50 },
    { id: "shieldSave", label: "Close Call",       test: (c) => c.life.shieldSaves >= 5 },
    { id: "revive1",    label: "Rise Again",       test: (c) => c.life.revives >= 1 },
    { id: "coins200",   label: "Coin Collector",   test: (c) => c.life.coins >= 200 },
    { id: "daily1",     label: "Daily Player",     test: (c) => Object.keys(save.dailyBest || {}).length >= 1 },
    { id: "runs50",     label: "Dedicated",        test: (c) => c.life.runs >= 50 },
    { id: "insane1",    label: "Daredevil",        test: (c) => c.extra.difficulty === "insane" && c.run.score >= 10 },
  ];

  function checkAchievements() {
    const ctx2 = {
      run: missionStats,
      life: save.lifetime,
      extra: { flaps: runFlaps, powerTypes: runPowerTypes.size, difficulty: difficultyKey },
    };
    for (const a of ACHIEVEMENTS) {
      if (save.achievements.includes(a.id)) continue;
      if (a.test(ctx2)) {
        save.achievements.push(a.id);
        toastQueue.push({ label: `🏆 ${a.label}`, t: 150 });
        persist();
      }
    }
  }
  let lastUnlockedIndex = unlockedSkinCount() - 1;

  const keys = { down: false, holdTicks: 0 };
  let inputBuffer = 0;
  let flapCooldown = 0;

  const bird = { x: 104, y: 250, r: 15, vy: 0, rot: 0, wing: 0, alive: true };
  let pipes = [];
  let clouds = [];
  let hills = [];
  let stars = [];
  let active = { shield: 0, slow: 0, shrink: 0 };
  const TRAIL_LEN = 6;
  let trail = [];

  const PARTICLE_POOL_SIZE = 300;
  const particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: "", r: 1, text: null,
  }));

  function spawnParticle(props) {
    const p = particles.find((q) => !q.alive);
    if (!p) return;
    Object.assign(p, { alive: true, text: null }, props);
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function rand(min, max) { return min + rng() * (max - min); }
  function randFree(min, max) { return min + Math.random() * (max - min); }

  // Step 5: two-phase difficulty — caps at 1.0 up to score 65, then creeps slowly forever
  function difficulty() {
    if (score <= 65) return score / 65;
    return 1 + (score - 65) * 0.004;
  }

  // Step 3: combo score multiplier — every 5 combo = +1x
  function comboMultiplier() { return Math.max(1, Math.floor(combo / 5)); }

  function pipeSpeed() {
    const d = Math.min(difficulty(), 2.5);
    const rocketMult = active.rocket > 0 ? 2 : 1;
    return (BASE_PIPE_SPEED + d * 1.42) * (active.slow > 0 ? 0.58 : 1) * diff().speed * rocketMult;
  }
  function pipeGap() { return Math.max(104, BASE_PIPE_GAP - Math.min(difficulty(), 1) * 34 + diff().gap); }
  function pipeSpawnTicks() { return Math.max(62, Math.round(BASE_SPAWN_TICKS - Math.min(difficulty(), 1) * 20)); }
  function birdRadius() { return active.shrink > 0 ? bird.r * SHRINK_SCALE : bird.r; }
  function unlockedSkinCount() { return clamp(Math.floor(best / 10) + 1, 1, SKINS.length); }
  function skin() { return SKINS[clamp(selectedSkin, 0, unlockedSkinCount() - 1)]; }

  // Step 7: prestige level (every 25 pts past score 80) and its trail colour
  function prestige() { return score > 80 ? Math.floor((score - 80) / 25) : 0; }
  function prestigeColor() { return PRESTIGE_TRAILS[prestige() % PRESTIGE_TRAILS.length]; }
  function biomeIndex() { return Math.floor(score / 25) % BIOMES.length; }
  function currentBiome() { return BIOMES[biomeIndex()]; }

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
    Object.assign(bird, { x: 104, y: 250, vy: 0, rot: 0, wing: 0, alive: true, deathSpin: 0 });
    active = { shield: 0, slow: 0, shrink: 0, magnet: 0, ghost: 0, double: 0, rocket: 0 };
    pipes = [];
    coins = [];
    runCoins = 0;
    reviveUsed = false;
    reviveWindow = 0;
    reviveTaps = 0;
    runFlaps = 0;
    runPowerTypes.clear();
    for (const p of particles) p.alive = false;
    trail = [];
    timeScale = 1;
    dyingTimer = 0;
    scorePulse = 0;
    camY = 0;
    clouds = Array.from({ length: 7 }, (_, i) => ({ x: i * 72 + randFree(0, 28), y: randFree(38, 190), s: randFree(0.55, 1.25), v: randFree(0.10, 0.24) }));
    hills = Array.from({ length: 5 }, (_, i) => ({ x: i * 108 - 20, y: SKY_H - randFree(30, 80), s: randFree(0.75, 1.35), v: randFree(0.34, 0.48) }));
    stars = Array.from({ length: 26 }, () => ({ x: randFree(0, W), y: randFree(16, 190), tw: randFree(0, Math.PI * 2) }));
    farLayer = Array.from({ length: 4 }, (_, i) => ({ x: i * 110, y: SKY_H - randFree(60, 120), w: randFree(80, 140), v: 0.28 }));
    fgLayer = Array.from({ length: 6 }, (_, i) => ({ x: i * 70, v: 1.0, kind: 0 }));
    weatherParticles = [];
    prevBiomeIdx = 0;
    biomeBlend = 1;
    Object.assign(missionStats, { pipesPassed: 0, powerupsCollected: 0, maxCombo: 0, shieldsCollected: 0, score: 0, maxMultiplier: 1 });
    activeMissions = pickMissions();
    if (startPlaying) {
      spawnPipe();
      spawnTimer = pipeSpawnTicks();
      music.stop();
      if (audioCtx) music.start();
    }
    gameoverLock = 0;
    updateButtons();
  }

  function ensureAudio() {
    if (muted) return;
    if (!audioCtx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioCtx = new Audio();
      masterGain = audioCtx.createGain();
      musicGain = audioCtx.createGain();
      sfxGain = audioCtx.createGain();
      musicGain.gain.value = 0.5;
      sfxGain.gain.value = 1.0;
      masterGain.gain.value = 1.0;
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function getNoise() {
    if (!noiseBuf) {
      noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function note(freq, t, dur, type, gainVal, dest) {
    if (!audioCtx) return;
    dest = dest || musicGain;
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(gainVal, t + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(vol); vol.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noiseHit(t, dur, gainVal, filterFreq) {
    if (!audioCtx) return;
    const src = audioCtx.createBufferSource();
    src.buffer = getNoise();
    const f = audioCtx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = filterFreq;
    const vol = audioCtx.createGain();
    vol.gain.setValueAtTime(gainVal, t);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(vol); vol.connect(sfxGain);
    src.start(t); src.stop(t + dur);
  }

  function duck() {
    if (!musicGain || !audioCtx) return;
    const t = audioCtx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(0.25, t);
    musicGain.gain.linearRampToValueAtTime(0.5, t + 0.35);
  }

  function scheduleStep(step, t) {
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    if (step % 8 === 0) note(chord[0] / 2, t, STEP_DUR * 7, "triangle", 0.05);
    if (step % 4 === 2) note(chord[0], t, STEP_DUR * 2, "sine", 0.022);
    if (music.intensity >= 1) note(chord[step % 3] * 2, t, STEP_DUR * 0.9, "square", 0.012);
    if (music.intensity >= 2 && step % 2 === 0) note(2200 + (step % 4) * 180, t, 0.03, "square", 0.008);
  }

  music.start = () => {
    if (music.timer || !audioCtx) return;
    music.step = 0;
    music.nextTime = audioCtx.currentTime + 0.1;
    music.timer = setInterval(() => {
      if (!audioCtx) return;
      while (music.nextTime < audioCtx.currentTime + 0.12) {
        scheduleStep(music.step, music.nextTime);
        music.nextTime += STEP_DUR;
        music.step = (music.step + 1) % 32;
      }
    }, 25);
  };

  music.stop = () => { clearInterval(music.timer); music.timer = null; };

  function beep(freq = 440, duration = 0.08, type = "sine", gainVal = 0.045) {
    if (muted || !audioCtx || !sfxGain) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, t);
    osc.type = type;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(gainVal, t + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(vol);
    vol.connect(sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function sfxFlap() {
    if (!audioCtx || muted) return;
    const t = audioCtx.currentTime;
    noiseHit(t, 0.08, 0.04, 1200);
    const osc = audioCtx.createOscillator(); const vol = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.07);
    vol.gain.setValueAtTime(0.03, t);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(vol); vol.connect(sfxGain); osc.start(t); osc.stop(t + 0.1);
  }

  function sfxPowerup(type) {
    if (!audioCtx || muted) return;
    const motifs = {
      shield: [440, 587, 880], slow: [660, 495, 330], shrink: [590, 740, 880],
      bonus: [880, 1320], magnet: [392, 523, 659], ghost: [330, 247, 196],
      double: [523, 659, 784, 1047], rocket: [440, 660, 880, 1320],
    };
    const freqs = motifs[type] || [880];
    const t = audioCtx.currentTime;
    freqs.forEach((f, i) => note(f, t + i * 0.09, 0.12, "triangle", 0.035, sfxGain));
  }

  function sfxComboFanfare(c) {
    if (!audioCtx || muted) return;
    const t = audioCtx.currentTime;
    const semis = Math.min(c / 5, 5);
    [523, 659, 784, 1047].forEach((f, i) => {
      note(f * Math.pow(2, semis / 12), t + i * 0.07, 0.12, "triangle", 0.04, sfxGain);
    });
  }

  function addParticles(x, y, color, count = 10, power = 2.4) {
    for (let i = 0; i < count; i++) {
      const life = rand(20, 46);
      spawnParticle({ x, y, vx: rand(-power, power), vy: rand(-power, power), life, max: life, color, r: rand(1.4, 4.2) });
    }
  }

  function spawnPipe() {
    const gap = pipeGap();
    const margin = 54;
    const gapY = rand(margin + gap / 2, SKY_H - margin - gap / 2);
    const moving = score >= diff().movingFrom;
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
      const orbOffsetY = rand(-gap * 0.27, gap * 0.27);
      pipe.orb = {
        x: pipe.x + pipe.w / 2,
        y: gapY + orbOffsetY,
        orbOffsetY,
        r: 12,
        type: pickOrbType(),
        collected: false,
        pulse: rand(0, Math.PI * 2),
      };
    } else if (Math.random() < 0.4) {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        coins.push({
          x: pipe.x + pipe.w + 40 + i * 26,
          y: gapY + Math.sin((i / (n - 1)) * Math.PI) * -30,
          collected: false, spin: rand(0, Math.PI * 2),
        });
      }
    }
    pipes.push(pipe);
  }

  function flap() {
    bird.vy = FLAP;
    bird.wing = 8;
    flapCooldown = COOLDOWN_TICKS;
    inputBuffer = 0;
    runFlaps += 1;
    camY = 2;
    const trailColor = prestige() > 0 ? prestigeColor() : "rgba(255,255,255,.75)";
    addParticles(bird.x - 8, bird.y + 8, trailColor, 2, 1.6);
    sfxFlap();
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
      sfxPowerup("bonus");
      vibrate(10);
      checkUnlocks();
      return;
    }
    active[type] = POWERUPS[type].duration;
    runPowerTypes.add(type);
    showMessage(`${POWERUPS[type].label}!`, 90);
    flash = 8;
    sfxPowerup(type);
    vibrate(10);
    if (type === "shield") missionStats.shieldsCollected += 1;
  }

  function checkUnlocks() {
    totalCoins += runCoins;
    runCoins = 0;
    save.coins = totalCoins;
    const previousBest = best;
    best = Math.max(best, score);
    save.best = best;
    save.lifetime.runs += 1;
    save.lifetime.pipes += missionStats.pipesPassed;
    save.lifetime.coins = totalCoins;
    save.lifetime.powerups += missionStats.powerupsCollected;
    if (dailyMode) {
      const { key } = dateSeed();
      save.dailyBest[key] = Math.max(save.dailyBest[key] || 0, score);
    }
    checkAchievements();
    lastRunDate = Date.now();
    save.runs = save.runs || [];
    save.runs.push({ score, coins: save.coins - (save._prevCoins || 0), date: lastRunDate, diff: difficultyKey, daily: dailyMode });
    save._prevCoins = save.coins;
    save.runs.sort((a, b) => b.score - a.score);
    save.runs = save.runs.slice(0, 10);
    persist();
    if (best > previousBest) newBest = true;
    const unlocked = unlockedSkinCount() - 1;
    if (best > previousBest && unlocked > lastUnlockedIndex) {
      lastUnlockedIndex = unlocked;
      selectedSkin = unlocked;
      save.skin = selectedSkin;
      persist();
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
      save.lifetime.shieldSaves += 1;
      showMessage("Shield saved you!", 90);
      if (sourcePipe) {
        sourcePipe.passed = true;
        sourcePipe.x = -sourcePipe.w - 80;
        addParticles(sourcePipe.x + sourcePipe.w / 2, sourcePipe.gapY, POWERUPS.shield.color, 18, 5.2);
      }
      addParticles(bird.x, bird.y, POWERUPS.shield.color, 24, 4.2);
      noiseHit(audioCtx ? audioCtx.currentTime : 0, 0.18, 0.06, 800);
      vibrate(20);
      return;
    }
    state = "dying";
    dyingTimer = 0;
    timeScale = 0.35;
    bird.alive = false;
    bird.vy = -4.2;
    bird.deathSpin = 0.18;
    combo = 0;
    shake = 18;
    flash = 22;
    shakeAngle = Math.atan2(bird.vy, 2);
    addParticles(bird.x, bird.y, "#fb7185", 34, 5);
    if (audioCtx) {
      const t = audioCtx.currentTime;
      noiseHit(t, 0.25, 0.08, 500);
      note(220, t, 0.15, "sawtooth", 0.04, sfxGain);
      note(110, t + 0.12, 0.2, "sawtooth", 0.04, sfxGain);
      duck();
      music.stop();
    }
    vibrate(20);
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
    if (state === "reviveOffer") {
      reviveTaps += 1;
      if (reviveTaps >= 5) {
        reviveUsed = true;
        let cost = 50;
        if (runCoins >= cost) { runCoins -= cost; }
        else { const rem = cost - runCoins; runCoins = 0; totalCoins -= rem; }
        totalCoins = Math.max(0, totalCoins);
        localStorage.setItem("flappy-power-coins", String(totalCoins));
        state = "playing";
        bird.y = H * 0.4; bird.vy = FLAP * 0.6; bird.alive = true; bird.rot = 0; bird.deathSpin = 0;
        shieldGrace = 90; flash = 14; timeScale = 1;
        pipes = pipes.filter((p) => p.x > bird.x + 60 || p.x + p.w < bird.x - 60);
        music.start();
        showMessage("Revived!", 90);
      }
      return;
    }
    if (state === "menu" || state === "gameover") {
      if (state === "gameover" && gameoverLock > 0) return;
      rng = Math.random;
      dailyMode = false;
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
    const wasGhost = active.ghost > 0;
    const wasRocket = active.rocket > 0;
    for (const key of Object.keys(active)) if (active[key] > 0) active[key] -= 1;
    if ((wasGhost && active.ghost <= 0) || (wasRocket && active.rocket <= 0)) shieldGrace = Math.max(shieldGrace, 30);

    if (inputBuffer > 0 && flapCooldown <= 0) flap();
    if (keys.down && keys.holdTicks > 0 && bird.vy < 0) {
      bird.vy += HOLD_BOOST;
      keys.holdTicks -= 1;
    }

    if (active.rocket > 0) {
      bird.vy = 0;
      bird.y += (H * 0.42 - bird.y) * 0.06;
      if (tick % 2 === 0) addParticles(bird.x - 10, bird.y, "#ef4444", 2, 1.2);
    } else {
      bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * (currentBiome().gravity ?? 1));
      bird.y += bird.vy;
    }
    bird.rot = clamp(bird.vy / 9, -0.55, 1.25);

    spawnTimer -= 1;
    if (spawnTimer <= 0) { spawnPipe(); spawnTimer = pipeSpawnTicks(); }
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

        const mult = comboMultiplier();
        const pts = mult * (active.double > 0 ? 2 : 1);
        score += pts;
        combo += 1;
        missionStats.pipesPassed += 1;
        missionStats.score = score;
        if (combo > missionStats.maxCombo) missionStats.maxCombo = combo;
        if (mult > missionStats.maxMultiplier) missionStats.maxMultiplier = mult;
        flash = 5;
        scorePulse = 10;
        spawnParticle({ x: pipe.x + pipe.w / 2, y: pipe.gapY, vx: 0, vy: -1.1, life: 40, max: 40, color: "#fff", r: 0, text: `+${pts}` });

        // near-miss bonus — tight vertical clearance earns +1
        const topH = pipe.gapY - pipe.gap / 2;
        const botY = pipe.gapY + pipe.gap / 2;
        const topClear = (bird.y - birdRadius()) - topH;
        const botClear = botY - (bird.y + birdRadius());
        const minClear = Math.min(topClear, botClear);
        if (minClear >= 0 && minClear < NEAR_MISS_THRESHOLD) {
          score += active.double > 0 ? 2 : 1;
          missionStats.score = score;
          showMessage("Close! +1", 60);
          addParticles(bird.x, bird.y, "#ffffff", 8, 2.2);
          beep(1100, 0.04, "sine", 0.025);
          vibrate(8);
        } else {
          addParticles(bird.x, bird.y - 20, combo >= 5 ? "#f0abfc" : "#fde68a", combo >= 5 ? 14 : 8, 2.4);
          const pitch = (combo >= 5 ? 760 : 680) * Math.pow(2, Math.min(combo, 12) / 24);
          beep(pitch, 0.06, "sine", 0.03);
        }

        if (combo === 5 || combo === 10 || combo === 20) {
          showMessage(`Combo x${combo}! ${mult > 1 ? `×${mult} score` : ""}`, 84);
          sfxComboFanfare(combo);
          duck();
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
      if (shieldGrace <= 0 && active.ghost <= 0 && active.rocket <= 0 &&
          (circleRectCollision(bird.x, bird.y, r, pipe.x, 0, pipe.w, topH) || circleRectCollision(bird.x, bird.y, r, pipe.x, botY, pipe.w, SKY_H - botY))) {
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

    const speed2 = pipeSpeed();
    for (const c of coins) {
      c.x -= speed2;
      c.spin += 0.15;
      if (active.magnet > 0) {
        const dx = bird.x - c.x, dy = bird.y - c.y;
        if (dx * dx + dy * dy < 90 * 90) { c.x += dx * 0.08; c.y += dy * 0.08; }
      }
      if (!c.collected) {
        const dx = bird.x - c.x, dy = bird.y - c.y;
        if (dx * dx + dy * dy < (birdRadius() + 7) ** 2) {
          c.collected = true;
          runCoins += diff().coinMult;
          spawnParticle({ x: c.x, y: c.y, vx: 0, vy: -1, life: 30, max: 30, color: "#fde047", r: 0, text: "+1" });
          beep(1320 + runCoins * 8, 0.04, "sine", 0.02);
        }
      }
    }
    coins = coins.filter((c) => !c.collected && c.x > -20);

    const radius = birdRadius();
    if (bird.y - radius < 0) {
      bird.y = radius;
      bird.vy = 0;
    }
    if (bird.y + radius > SKY_H) {
      bird.y = SKY_H - radius;
      crash();
    }

    if (tick % 2 === 0) {
      trail.push({ x: bird.x, y: bird.y });
      if (trail.length > TRAIL_LEN) trail.shift();
    }
    if (scorePulse > 0) scorePulse -= 1;
    camY *= 0.82;
    if (blinkTimer > 0) blinkTimer -= 1;
    music.intensity = score >= 40 ? 2 : score >= 20 ? 1 : 0;
    updateAmbient();
  }

  function updateDying() {
    tick += 1;
    dyingTimer += 1;
    if (flash > 0) flash -= 1;
    if (shake > 0) shake -= 1;
    if (dyingTimer === 26) timeScale = 1;
    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY);
    bird.y += bird.vy;
    bird.rot += bird.deathSpin;
    if (bird.y + birdRadius() >= SKY_H) {
      bird.y = SKY_H - birdRadius();
      if (bird.vy > 2) {
        addParticles(bird.x, SKY_H - 4, "rgba(120,53,15,.8)", 16, 3);
        vibrate(12);
        bird.vy = 0;
      }
      if (dyingTimer > 60) {
        if (!reviveUsed && totalCoins + runCoins >= 50) {
          state = "reviveOffer";
          reviveWindow = 120;
          reviveTaps = 0;
        } else {
          state = "gameover";
          gameoverLock = 24;
          checkUnlocks();
          updateButtons();
        }
      }
    }
    updateAmbient();
  }

  function updateReviveOffer() {
    tick += 1;
    reviveWindow -= 1;
    if (reviveWindow <= 0) {
      totalCoins += runCoins;
      localStorage.setItem("flappy-power-coins", String(totalCoins));
      state = "gameover";
      gameoverLock = 24;
      checkUnlocks();
      updateButtons();
    }
    updateAmbient();
  }

  function updateAmbient() {
    const speedMult = pipeSpeed() / BASE_PIPE_SPEED;
    for (const c of clouds) {
      c.x -= c.v * speedMult;
      if (c.x < -80) Object.assign(c, { x: W + 80, y: randFree(38, 190), s: randFree(0.55, 1.25), v: randFree(0.10, 0.24) });
    }
    for (const h of hills) {
      h.x -= h.v * speedMult;
      if (h.x < -130) Object.assign(h, { x: W + randFree(20, 70), y: SKY_H - randFree(30, 80), s: randFree(0.75, 1.35) });
    }
    for (const f of farLayer) {
      f.x -= f.v * speedMult * 0.45;
      if (f.x + f.w < -20) Object.assign(f, { x: W + 20, y: SKY_H - randFree(60, 120), w: randFree(80, 140) });
    }
    for (const f of fgLayer) {
      f.x -= f.v * speedMult * 1.2;
      if (f.x < -20) f.x = W + randFree(0, 30);
    }
    const bi = biomeIndex();
    if (bi !== prevBiomeIdx) { prevBiomeIdx = bi; biomeBlend = 0; showMessage(`${BIOMES[bi].name}!`, 90); }
    biomeBlend = Math.min(1, biomeBlend + 1 / 120);
    const biome = currentBiome();
    if (biome.weather === "snow") {
      if (weatherParticles.length < 40 && Math.random() < 0.5) {
        weatherParticles.push({ x: randFree(0, W), y: 0, vx: randFree(-0.3, 0.3), vy: randFree(0.8, 1.4), size: randFree(2, 4) });
      }
      for (const s of weatherParticles) {
        s.x += s.vx + Math.sin(tick * 0.02 + s.y) * 0.3;
        s.y += s.vy;
      }
      weatherParticles = weatherParticles.filter((s) => s.y < SKY_H);
    } else {
      weatherParticles = [];
    }
    for (const p of particles) {
      if (!p.alive) continue;
      p.x += p.vx;
      p.y += p.vy;
      if (!p.text) p.vy += 0.05;
      p.life -= 1;
      if (p.life <= 0) p.alive = false;
    }
  }

  function update() {
    if (state === "playing") updatePlaying();
    else if (state === "dying") updateDying();
    else if (state === "reviveOffer") updateReviveOffer();
    else if (state === "settings") { tick += 1; updateAmbient(); }
    else {
      tick += 1;
      if (flash > 0) flash -= 1;
      if (shake > 0) shake -= 1;
      if (gameoverLock > 0) gameoverLock -= 1;
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

  function drawHill(h, biome) {
    ctx.fillStyle = biome ? biome.hill : "rgba(34,197,94,.24)";
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 70 * h.s, 72 * h.s, 82 * h.s, 0, Math.PI, 0);
    ctx.fill();
  }

  function drawPipe(pipe) {
    const biome = currentBiome();
    const topH = pipe.gapY - pipe.gap / 2;
    const botY = pipe.gapY + pipe.gap / 2;
    const moving = pipe.moveAmp > 0;
    const grad = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.w, 0);
    grad.addColorStop(0,   moving ? "#1d4ed8" : biome.pipeA);
    grad.addColorStop(0.5, moving ? "#93c5fd" : biome.pipeB);
    grad.addColorStop(1,   moving ? "#1e40af" : biome.pipeC);
    ctx.fillStyle = grad;
    roundRect(pipe.x, -12, pipe.w, topH + 12, 10); ctx.fill();
    roundRect(pipe.x - 6, topH - 22, pipe.w + 12, 24, 9); ctx.fill();
    roundRect(pipe.x, botY, pipe.w, SKY_H - botY + 12, 10); ctx.fill();
    roundRect(pipe.x - 6, botY, pipe.w + 12, 24, 9); ctx.fill();
    if (moving) {
      ctx.save();
      ctx.globalAlpha = 0.18; ctx.strokeStyle = "#fff"; ctx.lineWidth = 6;
      for (let sx = pipe.x - 64; sx < pipe.x + 128; sx += 18) {
        ctx.beginPath(); ctx.moveTo(sx, topH); ctx.lineTo(sx + 64, 0); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = moving ? "rgba(30,64,175,.5)" : "rgba(15,118,53,.5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(pipe.x + 10, 0, 1, Math.max(0, topH - 22));
    ctx.strokeRect(pipe.x + 10, botY + 24, 1, Math.max(0, SKY_H - botY));
    if (pipe.orb && !pipe.orb.collected) drawOrb(pipe.orb);
  }

  const ORB_SHAPES = { shield: "diamond", slow: "hex", bonus: "star", shrink: "circle", magnet: "ring", ghost: "dashedCircle", double: "square", rocket: "triangle" };
  function drawOrbShape(s, x, y, r, type) {
    s.beginPath();
    if (type === "diamond") { s.moveTo(x, y - r); s.lineTo(x + r, y); s.lineTo(x, y + r); s.lineTo(x - r, y); s.closePath(); }
    else if (type === "hex") { for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 - Math.PI / 6; (i === 0 ? s.moveTo : s.lineTo).call(s, x + Math.cos(a) * r, y + Math.sin(a) * r); } s.closePath(); }
    else if (type === "star") { for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 === 0 ? r : r * 0.45; (i === 0 ? s.moveTo : s.lineTo).call(s, x + Math.cos(a) * rr, y + Math.sin(a) * rr); } s.closePath(); }
    else if (type === "square") { s.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5); }
    else if (type === "triangle") { s.moveTo(x, y - r); s.lineTo(x + r, y + r * 0.7); s.lineTo(x - r, y + r * 0.7); s.closePath(); }
    else { s.arc(x, y, r, 0, Math.PI * 2); }
  }

  function drawOrb(orb) {
    const power = POWERUPS[orb.type];
    const pulse = Math.sin(orb.pulse) * 2;
    const r = orb.r + pulse;
    const shape = ORB_SHAPES[orb.type] || "circle";
    ctx.save();
    ctx.shadowColor = power.color; ctx.shadowBlur = 16;
    ctx.fillStyle = power.color;
    if (shape === "ring") {
      ctx.beginPath(); ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      ctx.arc(orb.x, orb.y, r * 0.55, 0, Math.PI * 2, true); ctx.fill();
    } else if (shape === "dashedCircle") {
      ctx.setLineDash([4, 3]); ctx.strokeStyle = power.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      drawOrbShape(ctx, orb.x, orb.y, r, shape); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(power.icon, orb.x, orb.y + 0.5);
    ctx.restore();
  }

  function drawBird() {
    const current = skin();
    const radius = birdRadius();
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);
    const stretch = clamp(bird.vy * 0.018, -0.15, 0.15);
    ctx.scale(1 - stretch, 1 + stretch);
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
    if (blinkTimer <= 6) {
      ctx.fillStyle = current.body;
      ctx.fillRect(3, -9, 7, 6);
      if (blinkTimer === 0) blinkTimer = Math.floor(rand(120, 260));
    }
    ctx.restore();
  }

  function drawGround() {
    const biome = currentBiome();
    const y = SKY_H;
    ctx.fillStyle = biome.groundA;
    ctx.fillRect(0, y, W, GROUND_H);
    ctx.fillStyle = biome.groundB;
    ctx.fillRect(0, y, W, 14);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    for (let x = -40 + ((tick * pipeSpeed()) % 40); x < W + 40; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x + 18, H); ctx.lineTo(x + 36, y + 14); ctx.fill();
    }
    for (const f of fgLayer) {
      ctx.fillStyle = biome.groundB;
      ctx.beginPath();
      ctx.moveTo(f.x, SKY_H);
      ctx.lineTo(f.x + 5, SKY_H - 10);
      ctx.lineTo(f.x + 10, SKY_H);
      ctx.fill();
    }
    if (biome.weather === "snow") {
      for (const s of weatherParticles) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#f0f9ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const sh = clamp(1 - (SKY_H - bird.y) / SKY_H, 0.15, 1);
    ctx.globalAlpha = 0.22 * sh;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(bird.x, SKY_H + 6, 18 * sh + 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .36)";
    roundRect(14, 14, 134, 46, 18); ctx.fill();
    ctx.fillStyle = "#ffffff";
    const pulseSize = Math.round(28 * (1 + scorePulse / 33));
    ctx.font = `800 ${pulseSize}px system-ui`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
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

    ctx.fillStyle = "#fde047"; ctx.font = "700 11px system-ui"; ctx.textAlign = "left";
    ctx.fillText(`🪙 ${runCoins}`, 28, 56);

    if (toastQueue.length > 0) {
      const toast = toastQueue[0];
      toast.t -= 1;
      if (toast.t <= 0) toastQueue.shift();
      else {
        const alpha = Math.min(1, toast.t / 20);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#fbbf24"; roundRect(W / 2 - 100, 110, 200, 30, 14); ctx.fill();
        ctx.fillStyle = "#0f172a"; ctx.font = "800 12px system-ui"; ctx.textAlign = "center";
        ctx.fillText(toast.label, W / 2, 129);
        ctx.globalAlpha = 1;
      }
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
    if (state === "gameover" && save.runs?.length) {
      const rows = save.runs.slice(0, 5);
      ctx.font = "700 11px system-ui";
      rows.forEach((r, i) => {
        const isThis = r.date === lastRunDate;
        ctx.fillStyle = isThis ? "#f97316" : "#64748b";
        ctx.textAlign = "left";
        ctx.fillText(`${i + 1}. ${r.score} pts${r.daily ? " ★" : ""}`, 52, 266 + i * 16);
        ctx.textAlign = "right";
        const ago = Math.floor((Date.now() - r.date) / 60000);
        ctx.fillText(`${r.diff[0].toUpperCase()} · ${ago < 1 ? "now" : ago < 60 ? ago + "m" : Math.floor(ago / 60) + "h"}`, W - 52, 266 + i * 16);
      });
    }

    if (state === "menu") {
      const diffKeys = Object.keys(DIFFICULTIES);
      const pillW = 72, pillH = 26, pillGap = 8;
      const totalW = diffKeys.length * pillW + (diffKeys.length - 1) * pillGap;
      let px = W / 2 - totalW / 2;
      ctx.font = "800 11px system-ui"; ctx.textAlign = "center";
      diffKeys.forEach((k) => {
        const isActive = k === difficultyKey;
        ctx.fillStyle = isActive ? "#f97316" : "rgba(15,23,42,.18)";
        roundRect(px, 386, pillW, pillH, 13); ctx.fill();
        ctx.fillStyle = isActive ? "#fff" : "#334155";
        ctx.fillText(DIFFICULTIES[k].label, px + pillW / 2, 403);
        px += pillW + pillGap;
      });
    }
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

  function drawCoins() {
    for (const c of coins) {
      if (c.collected) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(Math.abs(Math.cos(c.spin)), 1);
      ctx.fillStyle = "#fde047";
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#92400e";
      ctx.font = "bold 7px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 0.5);
      ctx.restore();
    }
  }

  const settingsHitRects = [];
  function drawSettings() {
    settingsHitRects.length = 0;
    ctx.save();
    ctx.fillStyle = "rgba(15,23,42,.7)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.95)"; roundRect(30, 100, W - 60, 360, 24); ctx.fill();
    ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.font = "900 22px system-ui";
    ctx.fillText("Settings", W / 2, 140);
    const rows = [
      { label: "Screen shake", key: "shake" },
      { label: "Flash effects", key: "flash" },
      { label: "HUD on left",  key: "hudLeft" },
    ];
    rows.forEach((r, i) => {
      const y = 175 + i * 52;
      ctx.fillStyle = "#334155"; ctx.font = "700 14px system-ui"; ctx.textAlign = "left";
      ctx.fillText(r.label, 60, y + 10);
      const on = settings[r.key];
      const bx = W - 100, by = y - 4;
      ctx.fillStyle = on ? "#22c55e" : "#94a3b8";
      roundRect(bx, by, 54, 28, 14); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(on ? bx + 38 : bx + 16, by + 14, 10, 0, Math.PI * 2); ctx.fill();
      settingsHitRects.push({ x: bx, y: by, w: 54, h: 28, key: r.key });
    });
    ctx.fillStyle = "#475569"; ctx.font = "700 12px system-ui"; ctx.textAlign = "center";
    ctx.fillText(`Achievements: ${save.achievements.length} / ${ACHIEVEMENTS.length}`, W / 2, 380);
    ctx.fillText(`Total coins: 🪙 ${totalCoins}  ·  Runs: ${save.lifetime.runs}`, W / 2, 400);
    ctx.fillText(`Pipes: ${save.lifetime.pipes}  ·  Best: ${best}`, W / 2, 420);
    ctx.fillStyle = "#f97316"; roundRect(W / 2 - 60, 430, 120, 36, 18); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 14px system-ui"; ctx.fillText("Close", W / 2, 452);
    settingsHitRects.push({ x: W / 2 - 60, y: 430, w: 120, h: 36, key: "_close" });
    ctx.restore();
  }

  function drawReviveOffer() {
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .7)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.95)"; roundRect(40, 160, W - 80, 220, 24); ctx.fill();
    ctx.fillStyle = "#0f172a"; ctx.textAlign = "center"; ctx.font = "900 24px system-ui";
    ctx.fillText("REVIVE?", W / 2, 210);
    ctx.font = "600 13px system-ui";
    ctx.fillText("Tap 5 times fast — costs 50 🪙", W / 2, 240);
    ctx.font = "900 28px system-ui"; ctx.fillStyle = "#f97316";
    ctx.fillText(`${reviveTaps} / 5`, W / 2, 282);
    const barW = W - 120;
    const barX = 60;
    ctx.fillStyle = "rgba(15,23,42,.15)"; roundRect(barX, 300, barW, 12, 6); ctx.fill();
    ctx.fillStyle = "#38bdf8"; roundRect(barX, 300, barW * reviveWindow / 120, 12, 6); ctx.fill();
    ctx.fillStyle = "#64748b"; ctx.font = "600 12px system-ui";
    ctx.fillText(`🪙 ${totalCoins + runCoins} available`, W / 2, 340);
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0 && settings.shake) {
      const a = shakeAngle + randFree(-0.5, 0.5);
      const m = shake * 0.45;
      ctx.translate(Math.cos(a) * randFree(-m, m), Math.sin(a) * randFree(-m, m));
    }
    ctx.translate(0, camY);
    const biome = currentBiome();
    const prev = BIOMES[prevBiomeIdx === biomeIndex() ? biomeIndex() : prevBiomeIdx];
    const bl = biomeBlend;
    const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
    sky.addColorStop(0,    lerpColor(prev.sky[0], biome.sky[0], bl));
    sky.addColorStop(0.55, lerpColor(prev.sky[1], biome.sky[1], bl));
    sky.addColorStop(1,    lerpColor(prev.sky[2], biome.sky[2], bl));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (biome.stars) {
      for (const s of stars) {
        ctx.globalAlpha = (0.25 + Math.sin(tick * 0.04 + s.tw) * 0.2) * bl;
        ctx.fillStyle = "#fefce8"; ctx.fillRect(s.x, s.y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    for (const f of farLayer) {
      ctx.fillStyle = biome.hill;
      ctx.beginPath();
      ctx.moveTo(f.x, SKY_H);
      ctx.lineTo(f.x + f.w / 2, f.y);
      ctx.lineTo(f.x + f.w, SKY_H);
      ctx.closePath();
      ctx.fill();
    }
    for (const c of clouds) drawCloud(c);
    for (const h of hills) drawHill(h, biome);
    for (const pipe of pipes) drawPipe(pipe);
    drawGround();
    drawCoins();
    const trailColor = prestige() > 0 ? prestigeColor() : skin().glow;
    trail.forEach((t, i) => {
      ctx.globalAlpha = (i + 1) / TRAIL_LEN * 0.25;
      ctx.fillStyle = trailColor;
      ctx.beginPath();
      ctx.arc(t.x, t.y, birdRadius() * (0.4 + 0.6 * (i + 1) / TRAIL_LEN), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawBird();
    for (const p of particles) {
      if (!p.alive) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.text) {
        ctx.font = "900 16px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawHud();
    if (flash > 0 && settings.flash) { ctx.fillStyle = `rgba(255,255,255,${flash / 70})`; ctx.fillRect(0, 0, W, H); }
    if (state === "menu") drawOverlay("Flappy Power", "Dodge pipes, collect orbs, build combos, unlock skins. Earn coins every run!", "Start game");
    else if (state === "gameover") drawOverlay("Game over", `Score ${score} · Best ${best} · 🪙 ${totalCoins}`, "Play again");
    else if (state === "paused") drawOverlay("Paused", "Take a break. Tap the canvas or Pause button to continue your run.", "Resume");
    else if (state === "reviveOffer") drawReviveOffer();
    else if (state === "settings") drawSettings();
    else if (state === "dying") { /* world renders, no overlay */ }
    ctx.restore();
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    accumulator += Math.min(80, (time - lastTime) * timeScale);
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
    if (audioCtx) {
      if (state === "playing") music.start();
      else music.stop();
    }
    updateButtons();
  }

  function toggleMute(event) {
    event?.preventDefault?.();
    muted = !muted;
    save.muted = muted;
    persist();
    if (audioCtx) {
      if (muted) { audioCtx.suspend(); music.stop(); }
      else { audioCtx.resume(); if (state === "playing") music.start(); }
    }
    updateButtons();
  }

  function toggleFullscreen(event) {
    event?.preventDefault?.();
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  function renderShareCard() {
    const c = document.createElement("canvas");
    c.width = 1200; c.height = 630;
    const s = c.getContext("2d");
    const biome = currentBiome();
    const skyG = s.createLinearGradient(0, 0, 0, 630);
    biome.sky.forEach((col, i) => skyG.addColorStop(i / (biome.sky.length - 1), col));
    s.fillStyle = skyG; s.fillRect(0, 0, 1200, 630);
    s.fillStyle = biome.groundA; s.fillRect(0, 580, 1200, 50);
    s.fillStyle = "rgba(15,23,42,.55)"; s.fillRect(0, 0, 680, 630);
    s.fillStyle = "#fff"; s.textAlign = "left"; s.font = "900 58px system-ui";
    s.fillText("Flappy Power", 70, 120);
    s.font = "900 200px system-ui"; s.fillStyle = active.double > 0 ? "#fde047" : "#fff";
    s.fillText(String(score), 70, 370);
    s.font = "700 38px system-ui"; s.fillStyle = "#fde68a";
    s.fillText(dailyMode ? `Daily #${dayNumber()}` : `Best: ${best}`, 70, 440);
    s.font = "600 28px system-ui"; s.fillStyle = "rgba(255,255,255,.85)";
    s.fillText(`${biome.name} · ${skin().name} skin · 🪙 ${totalCoins}`, 70, 500);
    s.fillText(location.host + location.pathname, 70, 570);
    const sk = skin();
    s.save(); s.translate(950, 330); s.rotate(-0.12);
    s.fillStyle = sk.body; s.beginPath(); s.arc(0, 0, 90, 0, Math.PI * 2); s.fill();
    s.fillStyle = sk.beak; s.beginPath(); s.moveTo(72, -12); s.lineTo(130, 18); s.lineTo(72, 48); s.closePath(); s.fill();
    s.fillStyle = sk.eye; s.beginPath(); s.arc(36, -36, 16, 0, Math.PI * 2); s.fill();
    s.restore();
    return c;
  }

  async function shareScore(event) {
    event?.preventDefault?.();
    const text = dailyMode
      ? `Flappy Power Daily #${dayNumber()}: ${score} pts 🐤`
      : `I scored ${score} in Flappy Power! 🐤 ${unlockedSkinCount()}/${SKINS.length} skins unlocked.`;
    try {
      const blob = await new Promise((res) => renderShareCard().toBlob(res, "image/png"));
      const file = new File([blob], "flappy-power.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Flappy Power", text });
      } else if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showMessage("Card copied!", 90);
      } else if (navigator.share) {
        await navigator.share({ title: "Flappy Power", text, url: location.href });
      } else {
        await navigator.clipboard.writeText(`${text} ${location.href}`);
        showMessage("Score copied!", 90);
      }
    } catch (_) {}
  }

  function pickSkinAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (W / rect.width);
    const y = (clientY - rect.top) * (H / rect.height);
    if (state === "settings") {
      for (const r of settingsHitRects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          if (r.key === "_close") { state = prevStateBeforeSettings; updateButtons(); }
          else saveSetting(r.key, !settings[r.key]);
          return true;
        }
      }
      return true;
    }
    if (state === "menu" && y >= 386 && y <= 412) {
      const diffKeys = Object.keys(DIFFICULTIES);
      const pillW = 72, pillGap = 8;
      const totalW = diffKeys.length * pillW + (diffKeys.length - 1) * pillGap;
      let px = W / 2 - totalW / 2;
      for (const k of diffKeys) {
        if (x >= px && x <= px + pillW) {
          difficultyKey = k;
          save.difficulty = k;
          persist();
          showMessage(`${DIFFICULTIES[k].label} mode!`, 80);
          return true;
        }
        px += pillW + pillGap;
      }
    }
    if ((state !== "menu" && state !== "gameover") || y < 438 || y > 496) return false;
    const unlocked = unlockedSkinCount();
    const idx = Math.round((x - 48) / 43);
    if (idx >= 0 && idx < unlocked && idx < SKINS.length) {
      selectedSkin = idx;
      save.skin = selectedSkin;
      persist();
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
  settingsBtn.addEventListener("click", (event) => {
    event?.preventDefault?.();
    if (state === "settings") { state = prevStateBeforeSettings; updateButtons(); }
    else if (state !== "playing" && state !== "dying") {
      prevStateBeforeSettings = state;
      state = "settings";
      updateButtons();
    }
  });

  dailyBtn.addEventListener("click", (event) => {
    event?.preventDefault?.();
    ensureAudio();
    const { key, seed } = dateSeed();
    rng = mulberry32(seed);
    dailyMode = true;
    resetWorld(true);
    showMessage(`Daily #${dayNumber()} — good luck!`, 120);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state === "playing") { state = "paused"; if (audioCtx) music.stop(); updateButtons(); }
    } else {
      lastTime = 0;
    }
  });

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
