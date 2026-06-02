(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

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
  const PIPE_W = 64;
  const PIPE_GAP = 154;
  const PIPE_SPEED = 2.35;
  const SPAWN_TICKS = 94;
  const HITBOX_PAD = 6;
  const ORB_CHANCE = 0.38;

  const POWERUPS = {
    shield: { label: "Shield", color: "#38bdf8", duration: 540, icon: "◆" },
    slow: { label: "Slow", color: "#a78bfa", duration: 360, icon: "⏱" },
    bonus: { label: "+3", color: "#fbbf24", duration: 0, icon: "+" },
    shrink: { label: "Shrink", color: "#69db7c", duration: 360, icon: "⚪" },
  };

  let state = "menu";
  let accumulator = 0;
  let lastTime = 0;
  let tick = 0;
  let score = 0;
  let best = Number(localStorage.getItem("flappy-power-best") || 0);
  let flash = 0;
  let shake = 0;
  let messageTimer = 0;
  let message = "";
  let audioCtx = null;

  const keys = { down: false, holdTicks: 0 };
  let inputBuffer = 0;
  let flapCooldown = 0;

  const bird = {
    x: 104,
    y: 250,
    r: 15,
    vy: 0,
    rot: 0,
    wing: 0,
    alive: true,
  };

  let pipes = [];
  let particles = [];
  let clouds = [];
  let orbs = [];
  let active = { shield: 0, slow: 0, shrink: 0 };

  function resetWorld(startPlaying = false) {
    state = startPlaying ? "playing" : "menu";
    accumulator = 0;
    tick = 0;
    score = 0;
    flash = 0;
    shake = 0;
    messageTimer = 0;
    message = "";
    inputBuffer = 0;
    flapCooldown = 0;
    keys.down = false;
    keys.holdTicks = 0;
    Object.assign(bird, { x: 104, y: 250, vy: 0, rot: 0, wing: 0, alive: true });
    active = { shield: 0, slow: 0, shrink: 0 };
    pipes = [];
    particles = [];
    orbs = [];
    clouds = Array.from({ length: 7 }, (_, i) => ({
      x: i * 72 + Math.random() * 28,
      y: 42 + Math.random() * 170,
      s: 0.55 + Math.random() * 0.95,
      v: 0.12 + Math.random() * 0.22,
    }));
    if (startPlaying) spawnPipe();
  }

  function ensureAudio() {
    if (!audioCtx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) audioCtx = new Audio();
    }
    if (audioCtx?.state === "suspended") audioCtx.resume();
  }

  function beep(freq = 440, duration = 0.08, type = "sine", gain = 0.045) {
    if (!audioCtx) return;
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

  function inputStart(event) {
    event?.preventDefault?.();
    ensureAudio();
    keys.down = true;
    keys.holdTicks = HOLD_TICKS;
    inputBuffer = BUFFER_TICKS;

    if (state === "menu") {
      resetWorld(true);
      inputBuffer = BUFFER_TICKS;
    } else if (state === "gameover") {
      resetWorld(true);
      inputBuffer = BUFFER_TICKS;
    }
  }

  function inputEnd(event) {
    event?.preventDefault?.();
    keys.down = false;
    keys.holdTicks = 0;
  }

  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) inputStart(event);
    if (event.code === "KeyR" && state === "gameover") inputStart(event);
  });
  window.addEventListener("keyup", (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) inputEnd(event);
  });
  canvas.addEventListener("pointerdown", inputStart);
  window.addEventListener("pointerup", inputEnd);
  window.addEventListener("blur", inputEnd);

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnPipe() {
    const margin = 58;
    const gapY = rand(margin + PIPE_GAP / 2, SKY_H - margin - PIPE_GAP / 2);
    const pipe = {
      x: W + 20,
      gapY,
      passed: false,
      orb: null,
    };
    if (Math.random() < ORB_CHANCE) {
      const types = Object.keys(POWERUPS);
      pipe.orb = {
        x: pipe.x + PIPE_W / 2,
        y: gapY + rand(-PIPE_GAP * 0.26, PIPE_GAP * 0.26),
        r: 12,
        type: types[Math.floor(Math.random() * types.length)],
        collected: false,
        pulse: Math.random() * Math.PI * 2,
      };
    }
    pipes.push(pipe);
  }

  function addParticles(x, y, color, count = 10, power = 2.4) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power, power),
        life: rand(20, 42),
        max: 42,
        color,
        r: rand(1.4, 3.8),
      });
    }
  }

  function flap() {
    bird.vy = FLAP;
    bird.wing = 8;
    flapCooldown = COOLDOWN_TICKS;
    inputBuffer = 0;
    addParticles(bird.x - 8, bird.y + 8, "rgba(255,255,255,.75)", 5, 1.6);
    beep(520, 0.055, "triangle", 0.035);
  }

  function activatePowerup(type) {
    if (type === "bonus") {
      score += 3;
      message = "+3 bonus!";
      messageTimer = 72;
      flash = 10;
      beep(880, 0.09, "square", 0.035);
      return;
    }
    active[type] = POWERUPS[type].duration;
    message = `${POWERUPS[type].label} ready!`;
    messageTimer = 84;
    flash = 8;
    beep(type === "shield" ? 660 : 330, 0.12, "triangle", 0.04);
  }

  function crash() {
    if (active.shield > 0) {
      active.shield = 0;
      bird.vy = FLAP * 0.72;
      shake = 12;
      flash = 18;
      message = "Shield saved you!";
      messageTimer = 90;
      addParticles(bird.x, bird.y, POWERUPS.shield.color, 24, 4.2);
      beep(220, 0.16, "sawtooth", 0.04);
      return;
    }
    state = "gameover";
    bird.alive = false;
    shake = 18;
    flash = 22;
    best = Math.max(best, score);
    localStorage.setItem("flappy-power-best", String(best));
    addParticles(bird.x, bird.y, "#fb7185", 34, 5);
    beep(130, 0.22, "sawtooth", 0.045);
  }

  function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
    const px = Math.max(rx, Math.min(cx, rx + rw));
    const py = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - px;
    const dy = cy - py;
    return dx * dx + dy * dy < cr * cr;
  }

  function updatePlaying() {
    tick += 1;
    if (inputBuffer > 0) inputBuffer -= 1;
    if (flapCooldown > 0) flapCooldown -= 1;
    if (messageTimer > 0) messageTimer -= 1;
    if (flash > 0) flash -= 1;
    if (shake > 0) shake -= 1;
    if (bird.wing > 0) bird.wing -= 1;

    for (const key of Object.keys(active)) {
      if (active[key] > 0) active[key] -= 1;
    }

    if (inputBuffer > 0 && flapCooldown <= 0) flap();
    if (keys.down && keys.holdTicks > 0 && bird.vy < 0) {
      bird.vy += HOLD_BOOST;
      keys.holdTicks -= 1;
    }

    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY);
    bird.y += bird.vy;
    bird.rot = Math.max(-0.55, Math.min(1.25, bird.vy / 9));

    const speedScale = active.slow > 0 ? 0.58 : 1;
    if (tick % SPAWN_TICKS === 0) spawnPipe();

    for (const pipe of pipes) {
      pipe.x -= PIPE_SPEED * speedScale;
      if (pipe.orb && !pipe.orb.collected) {
        pipe.orb.x = pipe.x + PIPE_W / 2;
        pipe.orb.pulse += 0.16;
      }
      if (!pipe.passed && pipe.x + PIPE_W < bird.x - bird.r) {
        pipe.passed = true;
        score += 1;
        flash = 5;
        addParticles(bird.x, bird.y - 20, "#fde68a", 8, 2.2);
        beep(760, 0.06, "sine", 0.03);
      }
    }
    pipes = pipes.filter((pipe) => pipe.x + PIPE_W > -40);

    for (const pipe of pipes) {
      const topH = pipe.gapY - PIPE_GAP / 2;
      const botY = pipe.gapY + PIPE_GAP / 2;
      const effectiveRadius = (active.shrink > 0 ? bird.r * 0.64 : bird.r) - HITBOX_PAD;
      if (
        circleRectCollision(bird.x, bird.y, effectiveRadius, pipe.x, 0, PIPE_W, topH) ||
        circleRectCollision(bird.x, bird.y, effectiveRadius, pipe.x, botY, PIPE_W, SKY_H - botY)
      ) {
        crash();
        break;
      }

      const orb = pipe.orb;
      if (orb && !orb.collected) {
        const dx = bird.x - orb.x;
        const dy = bird.y - orb.y;
        if (dx * dx + dy * dy < (bird.r + orb.r) ** 2) {
          orb.collected = true;
          activatePowerup(orb.type);
          addParticles(orb.x, orb.y, POWERUPS[orb.type].color, 22, 3.3);
        }
      }
    }

    if (bird.y - bird.r < 0) {
      bird.y = bird.r;
      bird.vy = 0;
    }
    if (bird.y + bird.r > SKY_H) crash();

    updateAmbient();
  }

  function updateAmbient() {
    for (const c of clouds) {
      c.x -= c.v;
      if (c.x < -80) {
        c.x = W + 80;
        c.y = 38 + Math.random() * 170;
        c.s = 0.55 + Math.random() * 0.95;
      }
    }
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 1;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function update(dt) {
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

  function drawCloud(c) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#eff6ff";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 18 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 18 * c.s, c.y - 8 * c.s, 22 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 40 * c.s, c.y, 17 * c.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPipe(pipe) {
    const topH = pipe.gapY - PIPE_GAP / 2;
    const botY = pipe.gapY + PIPE_GAP / 2;
    const grad = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_W, 0);
    grad.addColorStop(0, "#16a34a");
    grad.addColorStop(0.5, "#86efac");
    grad.addColorStop(1, "#15803d");
    ctx.fillStyle = grad;
    roundRect(pipe.x, -12, PIPE_W, topH + 12, 10);
    ctx.fill();
    roundRect(pipe.x - 6, topH - 22, PIPE_W + 12, 24, 9);
    ctx.fill();
    roundRect(pipe.x, botY, PIPE_W, SKY_H - botY + 12, 10);
    ctx.fill();
    roundRect(pipe.x - 6, botY, PIPE_W + 12, 24, 9);
    ctx.fill();

    ctx.strokeStyle = "rgba(15, 118, 53, .5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(pipe.x + 10, 0, 1, topH - 22);
    ctx.strokeRect(pipe.x + 10, botY + 24, 1, SKY_H - botY);

    const orb = pipe.orb;
    if (orb && !orb.collected) drawOrb(orb);
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
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = "bold 15px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(power.icon, orb.x, orb.y + 0.5);
    ctx.restore();
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);
    if (active.shield > 0) {
      ctx.strokeStyle = "rgba(56, 189, 248, .72)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, bird.r + 8 + Math.sin(tick * 0.18) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.ellipse(-6, 4, 9, bird.wing > 0 ? 4 : 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fb923c";
    ctx.beginPath();
    ctx.moveTo(12, -2);
    ctx.lineTo(26, 3);
    ctx.lineTo(12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#111827";
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
    for (let x = -40 + ((tick * 1.4) % 40); x < W + 40; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.lineTo(x + 18, H);
      ctx.lineTo(x + 36, y + 14);
      ctx.fill();
    }
  }

  function drawHud() {
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .34)";
    roundRect(14, 14, 114, 44, 18);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 28px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(String(score), 28, 36);
    ctx.font = "700 11px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.fillText(`BEST ${best}`, 70, 37);

    let x = W - 18;
    for (const [type, value] of Object.entries(active)) {
      if (value <= 0) continue;
      const power = POWERUPS[type];
      const w = 86;
      x -= w;
      ctx.fillStyle = "rgba(15, 23, 42, .38)";
      roundRect(x, 14, w, 28, 14);
      ctx.fill();
      ctx.fillStyle = power.color;
      roundRect(x + 4, 18, Math.max(6, (w - 8) * value / power.duration), 20, 10);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "700 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(power.label, x + w / 2, 32);
      x -= 8;
    }

    if (messageTimer > 0) {
      ctx.globalAlpha = Math.min(1, messageTimer / 18);
      ctx.fillStyle = "rgba(15, 23, 42, .72)";
      roundRect(W / 2 - 82, 70, 164, 34, 16);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 15px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(message, W / 2, 92);
    }
    ctx.restore();
  }

  function drawOverlay(title, subtitle, button) {
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, .52)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    roundRect(34, 138, W - 68, 266, 26);
    ctx.fill();
    ctx.strokeStyle = "rgba(15, 23, 42, .10)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.font = "900 32px system-ui";
    ctx.fillText(title, W / 2, 194);
    ctx.font = "600 15px system-ui";
    wrapText(subtitle, W / 2, 228, W - 106, 22);
    ctx.fillStyle = "#f97316";
    roundRect(92, 320, W - 184, 48, 24);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 16px system-ui";
    ctx.fillText(button, W / 2, 350);
    ctx.fillStyle = "#64748b";
    ctx.font = "700 12px system-ui";
    ctx.fillText("Space · click · tap", W / 2, 386);
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.45, rand(-shake, shake) * 0.45);

    const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
    sky.addColorStop(0, "#60a5fa");
    sky.addColorStop(0.55, "#7dd3fc");
    sky.addColorStop(1, "#bae6fd");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    for (const c of clouds) drawCloud(c);
    for (const pipe of pipes) drawPipe(pipe);
    drawGround();
    drawBird();

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawHud();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash / 70})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (state === "menu") {
      drawOverlay("Flappy Power", "Dodge pipes, collect orbs, and use shield or slow-time power-ups to push your best score higher.", "Start game");
    } else if (state === "gameover") {
      drawOverlay("Game over", `Score ${score} · Best ${best}. Try again and chain power-ups for a longer run.`, "Play again");
    }

    ctx.restore();
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

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    accumulator += Math.min(80, time - lastTime);
    lastTime = time;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }

  resetWorld(false);
  requestAnimationFrame(frame);

  window.__flappyDebug = {
    get state() { return state; },
    get score() { return score; },
    get pipes() { return pipes.length; },
    get orbs() { return pipes.filter((p) => p.orb && !p.orb.collected).length; },
    start: () => inputStart(),
    reset: () => resetWorld(false),
  };
})();
