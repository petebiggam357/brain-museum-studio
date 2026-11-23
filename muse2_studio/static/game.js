/**
 * Brain Museum Arcade — 3 Mind-Controlled Games with Web Audio Soundscapes & SFX
 *
 * 1. Neuro Runner: Cortex Kingdom  (Mario-style side-scroller starring Musey)
 * 2. Alpha Zen Garden              (Calm/Alpha relaxation bloom & generative pentatonic chimes)
 * 3. Blink Breakout                (Head-Gyro paddle + Blink/Jaw laser & Focus wide-paddle)
 */
(() => {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  const ui = {
    eyebrow: document.getElementById("game-eyebrow"),
    title: document.getElementById("game-title"),
    btnStart: document.getElementById("btn-game-start"),
    modeWrap: document.getElementById("game-mode-wrap"),
    selMode: document.getElementById("sel-game-mode"),
    brkCalWrap: document.getElementById("breakout-cal-wrap"),
    btnBrkCal: document.getElementById("btn-brk-cal"),
    rngBrkSens: document.getElementById("rng-brk-sens"),
    chkAudio: document.getElementById("chk-game-audio"),
    score: document.getElementById("game-score"),
    best: document.getElementById("game-best"),
    mult: document.getElementById("game-mult"),
    status: document.getElementById("game-status"),
    legend: document.getElementById("game-legend"),
  };

  // --- Shared Web Audio Engine (SFX + Pentatonic Chimes) ---
  let audioCtx = null;
  function getAudio() {
    if (!ui.chkAudio?.checked) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function sfx(freq, endFreq, dur = 0.14, type = "sine", vol = 0.08) {
    const ctx = getAudio();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch (_) {}
  }

  function playChord(freqs, dur = 0.45, type = "sine", vol = 0.05) {
    freqs.forEach((f, i) => {
      setTimeout(() => sfx(f, f * 1.005, dur, type, vol), i * 55);
    });
  }

  const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];

  // --- Live BCI State from app.js ---
  const bci = {
    focus: 0,
    calm: 0,
    threshold: 50,
    inZone: false,
    tiltY: 0,
    yawDps: 0,
  };

  let activeGame = "runner"; // "runner" | "zen" | "breakout"
  let animTime = 0;
  let keyFocusHeld = false;
  let keyLeftHeld = false;
  let keyRightHeld = false;

  // Cached HiDPI canvas dimensions (zero layout thrashing)
  let cachedDims = null;
  function prepCanvas() {
    if (cachedDims) return cachedDims;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(220, Math.floor(rect.height));
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cachedDims = { ctx, w, h };
    return cachedDims;
  }
  window.addEventListener("resize", () => { cachedDims = null; });
  document.querySelectorAll(".seg-tab").forEach((t) => {
    t.addEventListener("click", () => { cachedDims = null; });
  });

  // =========================================================================
  // GAME 1: NEURO RUNNER — CORTEX KINGDOM
  // =========================================================================
  const runner = {
    running: false,
    gameOver: false,
    score: 0,
    best: Number(localStorage.getItem("bms-runner-best") || "0"),
    distance: 0,
    scrollSpeed: 235,
    shieldTimer: 0,
    player: { x: 130, y: 0, vy: 0, w: 36, h: 40, grounded: true, jumpsLeft: 2, squash: 1.0 },
    platforms: [],
    orbs: [],
    enemies: [],
    stars: [],
    particles: [],
    spawnCursor: 420,
  };

  function emitParticles(list, x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 140;
      list.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        color,
        r: 2.5 + Math.random() * 3,
      });
    }
  }

  function runnerSpawnChunk(startX, groundY) {
    const platW = 110 + Math.random() * 90;
    const platY = groundY - (75 + Math.random() * 75);
    runner.platforms.push({ x: startX, y: platY, w: platW, h: 14 });

    for (let i = 0; i < 4; i++) {
      const ox = startX + 18 + i * 28;
      const arc = Math.sin((i / 3) * Math.PI) * 28;
      runner.orbs.push({ x: ox, y: platY - 26 - arc, r: 9, collected: false });
    }
    if (Math.random() < 0.7) {
      for (let i = 0; i < 3; i++) {
        runner.orbs.push({ x: startX + platW + 65 + i * 30, y: groundY - 26, r: 9, collected: false });
      }
    }
    if (Math.random() < 0.75) {
      runner.enemies.push({
        x: startX + platW + 90 + Math.random() * 70,
        y: groundY - 30,
        w: 32, h: 30,
        vx: -45 - Math.random() * 35,
        alive: true,
      });
    }
    if (Math.random() < 0.28) {
      runner.stars.push({ x: startX + platW / 2, y: platY - 78, r: 13, collected: false });
    }
    return startX + platW + 250 + Math.random() * 120;
  }

  function runnerStart() {
    const { w, h } = prepCanvas();
    const groundY = h * 0.82;
    runner.score = 0;
    runner.distance = 0;
    runner.scrollSpeed = 235;
    runner.shieldTimer = 0;
    runner.gameOver = false;
    runner.running = true;

    runner.player = { x: Math.min(140, w * 0.18), y: groundY - 40, vy: 0, w: 36, h: 40, grounded: true, jumpsLeft: 2, squash: 1.0 };
    runner.platforms = [];
    runner.orbs = [];
    runner.enemies = [];
    runner.stars = [];
    runner.particles = [];
    runner.spawnCursor = w * 0.55;
    while (runner.spawnCursor < w + 600) {
      runner.spawnCursor = runnerSpawnChunk(runner.spawnCursor, groundY);
    }
    playChord([392, 523.25, 659.25], 0.2, "triangle", 0.06);
    if (ui.btnStart) ui.btnStart.textContent = "Restart";
    if (ui.status) ui.status.textContent = "Running · Collect Synapse Orbs & Stomp Noise Glitches!";
    updateHud();
  }

  function runnerJump() {
    if (!runner.running || runner.gameOver) return;
    if (runner.player.jumpsLeft > 0) {
      runner.player.vy = runner.player.grounded ? -500 : -430;
      runner.player.grounded = false;
      runner.player.jumpsLeft -= 1;
      runner.player.squash = 1.28;
      emitParticles(runner.particles, runner.player.x + 18, runner.player.y + 40, "#0a84ff", 8);
      sfx(340, 680, 0.13, "sine", 0.08);
    }
  }

  function runnerAddScore(base) {
    const inFocus = bci.inZone || keyFocusHeld || runner.shieldTimer > 0;
    runner.score += base * (inFocus ? 2 : 1);
    if (runner.score > runner.best) {
      runner.best = runner.score;
      localStorage.setItem("bms-runner-best", String(runner.best));
    }
  }

  function runnerStep(dt, w, h) {
    if (!runner.running || runner.gameOver) return;
    const groundY = h * 0.82;
    const mode = ui.selMode?.value || "focus_blink";
    const inFocus = bci.inZone || keyFocusHeld;
    if (runner.shieldTimer > 0) runner.shieldTimer = Math.max(0, runner.shieldTimer - dt);

    let speedMod = mode === "jaw_tilt" ? Math.max(0.65, Math.min(1.45, 1.0 + bci.tiltY * 0.8)) : inFocus ? 1.15 : 1.0;
    runner.scrollSpeed = Math.min(390, 235 + runner.distance * 0.012);
    const dx = runner.scrollSpeed * speedMod * dt;
    runner.distance += dx;

    const p = runner.player;
    if (mode === "focus_jetpack") {
      p.vy += (460 + (inFocus ? -780 : 0)) * dt;
      p.vy = Math.max(-320, Math.min(340, p.vy));
      if (inFocus && Math.random() < 0.45) emitParticles(runner.particles, p.x + 18, p.y + 40, "#30d158", 1);
    } else {
      const gliding = inFocus && p.vy > 0 && !p.grounded;
      p.vy += (gliding ? 360 : 1280) * dt;
      if (gliding && p.vy > 130) p.vy = 130;
    }

    const prevBottom = p.y + p.h;
    p.y += p.vy * dt;
    p.squash += (1.0 - p.squash) * Math.min(1, dt * 10);
    if (p.y < 14) { p.y = 14; if (p.vy < 0) p.vy = 0; }

    p.grounded = false;
    for (const pl of runner.platforms) {
      pl.x -= dx;
      if (p.x + p.w - 6 > pl.x && p.x + 6 < pl.x + pl.w && p.vy >= 0 && prevBottom <= pl.y + 8 && p.y + p.h >= pl.y) {
        p.y = pl.y - p.h; p.vy = 0; p.grounded = true; p.jumpsLeft = 2;
      }
    }
    if (p.y + p.h >= groundY) {
      if (p.vy > 200) p.squash = 0.78;
      p.y = groundY - p.h; p.vy = 0; p.grounded = true; p.jumpsLeft = 2;
    }

    const px = p.x + p.w / 2, py = p.y + p.h / 2;
    for (const o of runner.orbs) {
      o.x -= dx;
      if (o.collected) continue;
      const dist = Math.hypot(o.x - px, o.y - py);
      if (inFocus && dist < 115) {
        o.x += (px - o.x) * Math.min(1, dt * 8);
        o.y += (py - o.y) * Math.min(1, dt * 8);
      }
      if (dist < 28) {
        o.collected = true;
        runnerAddScore(10);
        emitParticles(runner.particles, o.x, o.y, "#ff9f0a", 6);
        sfx(740, 1080, 0.09, "sine", 0.06);
      }
    }
    for (const s of runner.stars) {
      s.x -= dx;
      if (s.collected) continue;
      if (Math.hypot(s.x - px, s.y - py) < 32) {
        s.collected = true;
        runner.shieldTimer = 5.5;
        runnerAddScore(50);
        emitParticles(runner.particles, s.x, s.y, "#30d158", 16);
        playChord([523.25, 659.25, 783.99, 1046.5], 0.22, "triangle", 0.07);
      }
    }
    for (const e of runner.enemies) {
      e.x -= dx - e.vx * dt;
      if (!e.alive) continue;
      if (p.x + p.w - 6 > e.x && p.x + 6 < e.x + e.w && p.y + p.h > e.y && p.y < e.y + e.h) {
        const stomping = p.vy > 0 && prevBottom <= e.y + 14;
        if (stomping || runner.shieldTimer > 0) {
          e.alive = false;
          if (stomping) p.vy = -380;
          runnerAddScore(25);
          emitParticles(runner.particles, e.x + 16, e.y + 15, "#ff375f", 14);
          sfx(280, 620, 0.14, "square", 0.06);
        } else {
          runner.gameOver = true;
          runner.running = false;
          emitParticles(runner.particles, px, py, "#ff453a", 22);
          sfx(300, 110, 0.35, "sawtooth", 0.08);
          if (ui.status) ui.status.textContent = `Run Complete · Final Score: ${runner.score}`;
          if (ui.btnStart) ui.btnStart.textContent = "Play Again";
        }
      }
    }

    runner.platforms = runner.platforms.filter((pl) => pl.x + pl.w > -40);
    runner.orbs = runner.orbs.filter((o) => !o.collected && o.x > -30);
    runner.stars = runner.stars.filter((s) => !s.collected && s.x > -30);
    runner.enemies = runner.enemies.filter((e) => e.alive && e.x + e.w > -40);
    runner.spawnCursor -= dx;
    while (runner.spawnCursor < w + 500) runner.spawnCursor = runnerSpawnChunk(runner.spawnCursor, groundY);
    for (const pt of runner.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 320 * dt; pt.life -= dt; }
    runner.particles = runner.particles.filter((pt) => pt.life > 0);
  }

  function runnerDraw(ctx, w, h) {
    const groundY = h * 0.82;
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isLight) { sky.addColorStop(0, "#dbeafe"); sky.addColorStop(1, "#f5f3ff"); }
    else { sky.addColorStop(0, "#0b1021"); sky.addColorStop(0.6, "#141933"); sky.addColorStop(1, "#1d1b38"); }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = isLight ? "rgba(99, 102, 241, 0.12)" : "rgba(94, 92, 230, 0.18)";
    ctx.beginPath(); ctx.moveTo(0, groundY);
    for (let x = 0; x <= w + 40; x += 40) {
      const hill = Math.sin((x + runner.distance * 0.18) * 0.008) * 34 + Math.cos((x + runner.distance * 0.18) * 0.004) * 20;
      ctx.lineTo(x, groundY - 46 - hill);
    }
    ctx.lineTo(w, groundY); ctx.closePath(); ctx.fill();

    ctx.fillStyle = isLight ? "#e2e8f0" : "#181d2b"; ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = "#30d158"; ctx.fillRect(0, groundY, w, 4);

    for (const pl of runner.platforms) {
      ctx.fillStyle = isLight ? "#ffffff" : "#252b3d";
      ctx.beginPath(); ctx.roundRect(pl.x, pl.y, pl.w, pl.h, 7); ctx.fill();
      ctx.fillStyle = "#0a84ff";
      ctx.beginPath(); ctx.roundRect(pl.x, pl.y, pl.w, 4, [7, 7, 0, 0]); ctx.fill();
    }
    for (const o of runner.orbs) {
      const bob = Math.sin(animTime * 5 + o.x * 0.04) * 3;
      ctx.fillStyle = "rgba(255, 159, 10, 0.25)"; ctx.beginPath(); ctx.arc(o.x, o.y + bob, o.r + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff9f0a"; ctx.beginPath(); ctx.arc(o.x, o.y + bob, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff7ed"; ctx.beginPath(); ctx.arc(o.x - 2.5, o.y + bob - 2.5, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const s of runner.stars) {
      const pulse = 1 + Math.sin(animTime * 7) * 0.12;
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(pulse, pulse);
      ctx.fillStyle = "#30d158"; ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? s.r : s.r * 0.48;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (const e of runner.enemies) {
      const cx = e.x + 16, cy = e.y + 15;
      ctx.fillStyle = "#ff375f"; ctx.beginPath(); ctx.roundRect(e.x, e.y + 4, e.w, e.h - 4, 10); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(cx - 8, cy - 3, 5, 5); ctx.fillRect(cx + 3, cy - 3, 5, 5);
      ctx.fillStyle = "#0b0f17"; ctx.fillRect(cx - 7, cy - 1, 2.5, 2.5); ctx.fillRect(cx + 4, cy - 1, 2.5, 2.5);
    }

    const p = runner.player;
    const inFocus = bci.inZone || keyFocusHeld;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (inFocus || runner.shieldTimer > 0) {
      ctx.strokeStyle = runner.shieldTimer > 0 ? "rgba(48, 209, 88, 0.75)" : "rgba(10, 132, 255, 0.55)";
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 28 + Math.sin(animTime * 10) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save(); ctx.translate(cx, p.y + p.h); ctx.scale(2 - p.squash, p.squash); ctx.translate(-p.w / 2, -p.h);
    const bg = ctx.createLinearGradient(0, 0, 0, p.h);
    bg.addColorStop(0, inFocus ? "#30d158" : "#0a84ff"); bg.addColorStop(1, "#5e5ce6");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 4, p.w, p.h - 4, 12); ctx.fill();
    ctx.fillStyle = "#f5f5f7"; ctx.beginPath(); ctx.roundRect(2, 10, p.w - 4, 6, 3); ctx.fill();
    ctx.fillStyle = inFocus ? "#30d158" : "#30d5c8";
    ctx.beginPath(); ctx.arc(10, 13, 2, 0, Math.PI * 2); ctx.arc(18, 13, 2, 0, Math.PI * 2); ctx.arc(26, 13, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(22, 23, 3.2, 0, Math.PI * 2); ctx.arc(30, 23, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b0f17"; ctx.beginPath(); ctx.arc(23.2, 23, 1.5, 0, Math.PI * 2); ctx.arc(31.2, 23, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    for (const pt of runner.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!runner.running) {
      drawOverlay(ctx, w, h, runner.gameOver ? `Run Complete — ${runner.score} pts` : "Neuro Runner: Cortex Kingdom", "Click Start Game (or Space) · Blink/Jaw to Jump · Hold Focus to Glide & 2× Score");
    }
  }

  // =========================================================================
  // GAME 2: ALPHA ZEN GARDEN (Relaxation Bloom & Generative Soundscape)
  // =========================================================================
  const zen = {
    running: false,
    score: 0,
    best: Number(localStorage.getItem("bms-zen-best") || "0"),
    bloomTimer: 0,
    chimeTimer: 0,
    lotuses: [],
    ripples: [],
    fireflies: [],
  };

  function zenStart() {
    const { w, h } = prepCanvas();
    zen.running = true;
    zen.score = 0;
    zen.bloomTimer = 0;
    zen.chimeTimer = 0;
    zen.lotuses = [];
    zen.ripples = [];
    zen.fireflies = Array.from({ length: 24 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h * 0.85,
      phase: Math.random() * Math.PI * 2,
      spd: 0.5 + Math.random() * 1.1,
    }));
    playChord([261.63, 329.63, 392.0, 523.25], 0.7, "sine", 0.05);
    if (ui.btnStart) ui.btnStart.textContent = "Reset Garden";
    if (ui.status) ui.status.textContent = "Breathe slowly & relax — Alpha/Calm blooms lotuses & chimes!";
    updateHud();
  }

  function zenAddRipple(x, y, golden = false) {
    zen.ripples.push({ x, y, r: 8, maxR: golden ? 130 : 85, alpha: 0.85, color: golden ? "#ff9f0a" : "#30d5c8" });
    const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    sfx(note, note * 1.003, 0.65, "sine", 0.055);
  }

  function zenStep(dt, w, h) {
    if (!zen.running) return;
    const calmLevel = keyFocusHeld ? 75 : bci.calm;
    const isCalm = calmLevel >= 35;

    zen.bloomTimer += dt * (isCalm ? 1.0 + calmLevel / 55 : 0.2);
    if (zen.bloomTimer >= 2.2) {
      zen.bloomTimer = 0;
      const golden = calmLevel >= 60;
      const lx = 60 + Math.random() * (w - 120);
      const ly = h * 0.42 + Math.random() * (h * 0.45);
      zen.lotuses.push({
        x: lx, y: ly,
        scale: 0.05,
        targetScale: 0.85 + Math.random() * 0.5,
        petals: 7 + Math.floor(Math.random() * 3),
        color: golden ? "#ff9f0a" : ["#30d5c8", "#30d158", "#bf5af2", "#ff375f"][Math.floor(Math.random() * 4)],
        golden,
      });
      if (zen.lotuses.length > 26) zen.lotuses.shift();
      zen.score += golden ? 50 : 15;
      if (zen.score > zen.best) {
        zen.best = zen.score;
        localStorage.setItem("bms-zen-best", String(zen.best));
      }
      zenAddRipple(lx, ly, golden);
    }

    for (const l of zen.lotuses) l.scale += (l.targetScale - l.scale) * Math.min(1, dt * 2.2);
    for (const r of zen.ripples) { r.r += dt * 42; r.alpha = Math.max(0, 1 - r.r / r.maxR); }
    zen.ripples = zen.ripples.filter((r) => r.alpha > 0.02);

    for (const f of zen.fireflies) {
      f.phase += dt * f.spd;
      f.x += Math.cos(f.phase) * dt * (12 + calmLevel * 0.2);
      f.y += Math.sin(f.phase * 1.3) * dt * 10;
      if (f.x < 0) f.x = w; if (f.x > w) f.x = 0;
      if (f.y < 10) f.y = h * 0.8; if (f.y > h * 0.9) f.y = 20;
    }
  }

  function zenDraw(ctx, w, h) {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    if (isLight) { bg.addColorStop(0, "#ecfeff"); bg.addColorStop(1, "#e0f2fe"); }
    else { bg.addColorStop(0, "#07131c"); bg.addColorStop(0.5, "#0b1e29"); bg.addColorStop(1, "#0a1724"); }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    // Subtle moon / calm halo
    const calmNorm = Math.min(1, (keyFocusHeld ? 75 : bci.calm) / 80);
    const moonR = 32 + calmNorm * 24;
    const halo = ctx.createRadialGradient(w * 0.5, h * 0.22, 6, w * 0.5, h * 0.22, moonR * 2.4);
    halo.addColorStop(0, "rgba(48, 213, 200, 0.55)");
    halo.addColorStop(1, "rgba(48, 213, 200, 0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.22, moonR * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isLight ? "#ffffff" : "#cffafe";
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.22, moonR * 0.55, 0, Math.PI * 2); ctx.fill();

    // Water ripples
    for (const r of zen.ripples) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.alpha * 0.65;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Lotuses
    for (const l of zen.lotuses) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.scale(l.scale, l.scale);
      // Lily pad
      ctx.fillStyle = "rgba(48, 209, 88, 0.28)";
      ctx.beginPath(); ctx.ellipse(0, 4, 24, 11, 0, 0, Math.PI * 2); ctx.fill();
      // Petals
      for (let i = 0; i < l.petals; i++) {
        ctx.save();
        ctx.rotate((i / l.petals) * Math.PI * 2 + Math.sin(animTime + l.x) * 0.04);
        ctx.fillStyle = l.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(0, -10, 5.5, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fef08a";
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Fireflies
    for (const f of zen.fireflies) {
      const a = 0.35 + 0.55 * Math.sin(f.phase * 2.4);
      ctx.fillStyle = `rgba(253, 224, 71, ${a})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    if (!zen.running) {
      drawOverlay(ctx, w, h, "Alpha Zen Garden", "Click Start Garden · Sustain Calm (Alpha) to bloom Lotuses & pentatonic chimes · Blink to ripple");
    }
  }

  // =========================================================================
  // GAME 3: BLINK BREAKOUT (Head-Gyro Paddle + Blink Laser + Focus Wide Paddle)
  // =========================================================================
  const brk = {
    running: false,
    gameOver: false,
    score: 0,
    best: Number(localStorage.getItem("bms-breakout-best") || "0"),
    lives: 3,
    wave: 1,
    combo: 0,
    paddleX: 0.5,
    paddleW: 110,
    neutralTilt: 0.0,
    steerSens: 2.0,
    ball: { x: 200, y: 200, vx: 210, vy: -240, r: 8 },
    bricks: [],
    lasers: [],
    particles: [],
  };

  function brkBuildBricks(w) {
    const colors = ["#ff375f", "#ff9f0a", "#30d158", "#30d5c8", "#5e5ce6"];
    const cols = 9, rows = 5;
    const margin = 36, gap = 8;
    const bw = (w - margin * 2 - gap * (cols - 1)) / cols;
    const bh = 20;
    brk.bricks = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        brk.bricks.push({
          x: margin + c * (bw + gap),
          y: 42 + r * (bh + gap),
          w: bw, h: bh,
          color: colors[r % colors.length],
          alive: true,
        });
      }
    }
  }

  function brkStart() {
    const { w, h } = prepCanvas();
    brk.running = true;
    brk.gameOver = false;
    brk.score = 0;
    brk.lives = 3;
    brk.wave = 1;
    brk.combo = 0;
    brk.paddleX = 0.5;
    brk.neutralTilt = bci.tiltY; // Auto-zero neutral head angle on Start
    brk.lasers = [];
    brk.particles = [];
    brk.ball = { x: w * 0.5, y: h - 55, vx: 210 * (Math.random() < 0.5 ? 1 : -1), vy: -250, r: 8 };
    brkBuildBricks(w);
    playChord([329.63, 440, 587.33], 0.2, "triangle", 0.06);
    if (ui.btnStart) ui.btnStart.textContent = "Restart";
    if (ui.status) ui.status.textContent = "Turn head (or ←/→) to steer · Blink/Jaw (or Space) for Twin Lasers!";
    updateHud();
  }

  function brkFireLaser() {
    if (!brk.running || brk.gameOver) return;
    const { w, h } = prepCanvas();
    const px = brk.paddleX * w;
    brk.lasers.push({ x: px - brk.paddleW * 0.35, y: h - 38, vy: -520 });
    brk.lasers.push({ x: px + brk.paddleW * 0.35, y: h - 38, vy: -520 });
    sfx(880, 320, 0.1, "sawtooth", 0.05);
  }

  function brkAddScore(pts) {
    const mult = (bci.inZone || keyFocusHeld) ? 2 : 1;
    brk.score += pts * mult;
    if (brk.score > brk.best) {
      brk.best = brk.score;
      localStorage.setItem("bms-breakout-best", String(brk.best));
    }
  }

  function brkStep(dt, w, h) {
    if (!brk.running || brk.gameOver) return;
    const inFocus = bci.inZone || keyFocusHeld;
    brk.paddleW = inFocus ? 148 : 104;

    // Steer paddle with calibrated Head Gyro Yaw + Zeroed Head Tilt OR Arrow Keys
    let move = 0;
    const sens = brk.steerSens || 2.0;
    if (Math.abs(bci.yawDps) > 4.0) {
      const yawAdj = bci.yawDps > 0 ? bci.yawDps - 4.0 : bci.yawDps + 4.0;
      move -= yawAdj * 0.016 * sens;
    }
    const relTilt = bci.tiltY - brk.neutralTilt;
    if (Math.abs(relTilt) > 0.06) {
      move += relTilt * 1.6 * sens;
    }
    if (keyLeftHeld) move -= 1.35;
    if (keyRightHeld) move += 1.35;
    brk.paddleX = Math.max(0.06, Math.min(0.94, brk.paddleX + move * dt));

    const b = brk.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); sfx(260, 290, 0.06, "sine", 0.05); }
    if (b.x + b.r > w) { b.x = w - b.r; b.vx = -Math.abs(b.vx); sfx(260, 290, 0.06, "sine", 0.05); }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); sfx(300, 330, 0.06, "sine", 0.05); }

    // Paddle bounce
    const px = brk.paddleX * w;
    const py = h - 28;
    if (b.vy > 0 && b.y + b.r >= py && b.y - b.r <= py + 12 && Math.abs(b.x - px) <= brk.paddleW / 2 + b.r) {
      const hitNorm = (b.x - px) / (brk.paddleW / 2);
      const speed = Math.min(460, Math.hypot(b.vx, b.vy) * 1.02);
      b.vx = hitNorm * speed * 0.85;
      b.vy = -Math.sqrt(Math.max(120 * 120, speed * speed - b.vx * b.vx));
      brk.combo = 0;
      sfx(440, 560, 0.09, "triangle", 0.07);
    }

    // Brick collisions (ball & lasers)
    for (const brick of brk.bricks) {
      if (!brick.alive) continue;
      if (b.x + b.r > brick.x && b.x - b.r < brick.x + brick.w && b.y + b.r > brick.y && b.y - b.r < brick.y + brick.h) {
        brick.alive = false;
        if (!inFocus) b.vy = -b.vy; // Focus Power Ball pierces bricks!
        brk.combo = Math.min(PENTATONIC.length - 1, brk.combo + 1);
        brkAddScore(15);
        emitParticles(brk.particles, brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 10);
        const f = PENTATONIC[brk.combo];
        sfx(f, f * 1.15, 0.11, "sine", 0.07);
        break;
      }
      for (const lz of brk.lasers) {
        if (lz.x > brick.x && lz.x < brick.x + brick.w && lz.y > brick.y && lz.y < brick.y + brick.h) {
          brick.alive = false;
          lz.y = -50;
          brkAddScore(15);
          emitParticles(brk.particles, brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 8);
          sfx(660, 880, 0.08, "sine", 0.05);
        }
      }
    }

    for (const lz of brk.lasers) lz.y += lz.vy * dt;
    brk.lasers = brk.lasers.filter((lz) => lz.y > -10);

    // Wave clear
    if (brk.bricks.every((br) => !br.alive)) {
      brk.wave += 1;
      brkAddScore(50);
      brkBuildBricks(w);
      playChord([523.25, 659.25, 783.99, 1046.5], 0.25, "triangle", 0.07);
    }

    // Ball lost
    if (b.y > h + 20) {
      brk.lives -= 1;
      sfx(240, 100, 0.3, "sawtooth", 0.08);
      if (brk.lives <= 0) {
        brk.gameOver = true;
        brk.running = false;
        if (ui.status) ui.status.textContent = `Game Over · Score: ${brk.score} (Wave ${brk.wave})`;
        if (ui.btnStart) ui.btnStart.textContent = "Play Again";
      } else {
        b.x = px; b.y = h - 55; b.vx = 200 * (Math.random() < 0.5 ? 1 : -1); b.vy = -240;
      }
    }

    for (const pt of brk.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    brk.particles = brk.particles.filter((pt) => pt.life > 0);
  }

  function brkDraw(ctx, w, h) {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    ctx.fillStyle = isLight ? "#f8fafc" : "#0b0e18";
    ctx.fillRect(0, 0, w, h);

    // Bricks
    for (const br of brk.bricks) {
      if (!br.alive) continue;
      ctx.fillStyle = br.color;
      ctx.beginPath(); ctx.roundRect(br.x, br.y, br.w, br.h, 6); ctx.fill();
    }

    // Lasers
    ctx.fillStyle = "#30d5c8";
    for (const lz of brk.lasers) ctx.fillRect(lz.x - 2, lz.y - 12, 4, 14);

    // Paddle
    const inFocus = bci.inZone || keyFocusHeld;
    const px = brk.paddleX * w;
    const py = h - 28;
    ctx.fillStyle = inFocus ? "#30d158" : "#0a84ff";
    ctx.beginPath(); ctx.roundRect(px - brk.paddleW / 2, py, brk.paddleW, 12, 6); ctx.fill();

    // Ball
    ctx.fillStyle = inFocus ? "#ff9f0a" : "#ffffff";
    ctx.beginPath(); ctx.arc(brk.ball.x, brk.ball.y, brk.ball.r, 0, Math.PI * 2); ctx.fill();

    // Lives & Wave HUD
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "600 12px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillText(`Wave ${brk.wave}  ·  Lives: ${"●".repeat(Math.max(0, brk.lives))}`, 14, 24);

    for (const pt of brk.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!brk.running) {
      drawOverlay(ctx, w, h, brk.gameOver ? `Game Over — ${brk.score} pts` : "Blink Breakout", "Click Start Game · Head Gyro/Tilt (or ←/→) steers · Blink/Jaw (or Space) fires Twin Lasers");
    }
  }

  function drawOverlay(ctx, w, h, headline, sub) {
    ctx.fillStyle = "rgba(8, 9, 12, 0.56)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "700 22px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillText(headline, w / 2, h / 2 - 12);
    ctx.font = "500 13px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillStyle = "#d4d4d8";
    ctx.fillText(sub, w / 2, h / 2 + 16);
    ctx.textAlign = "left";
  }

  // --- Unified HUD & Game Switcher ---
  const GAME_META = {
    runner: {
      eyebrow: "Mind-Controlled Side-Scroller · Character: Musey",
      title: "Neuro Runner: Cortex Kingdom",
      startLbl: "Start Game",
      showMode: true,
      legend: "<span>Synapse Orb <b>+10</b></span><span>Stomp Glitch <b>+25</b></span><span>Alpha Star <b>+50 + Shield</b></span><span>Focus Zone <b>2×</b></span>",
      status: "Ready · Blink/Jaw (or Space) to Jump · Hold Focus (or Shift) to Glide & Magnetize Orbs",
    },
    zen: {
      eyebrow: "Calm & Alpha Neurofeedback · Generative Pentatonic Audio",
      title: "Alpha Zen Garden",
      startLbl: "Start Garden",
      showMode: false,
      legend: "<span>Lotus Bloom <b>+15</b></span><span>Golden Lotus (Deep Calm) <b>+50</b></span><span>Blink / Jaw <b>Water Ripple + Chime</b></span>",
      status: "Ready · Breathe slowly & sustain Calm (Alpha) to bloom lotuses and chimes",
    },
    breakout: {
      eyebrow: "Gyro Paddle + Blink Twin Lasers + Focus Power Ball",
      title: "Blink Breakout",
      startLbl: "Start Game",
      showMode: false,
      legend: "<span>Brick <b>+15</b></span><span>Wave Clear <b>+50</b></span><span>Blink/Jaw <b>Twin Lasers</b></span><span>Focus <b>Wide Paddle + Piercing Ball</b></span>",
      status: "Ready · Turn head (or ←/→) to steer paddle · Blink/Jaw (or Space) for Twin Lasers",
    },
  };

  function updateHud() {
    const inFocus = bci.inZone || keyFocusHeld;
    if (activeGame === "runner") {
      if (ui.score) ui.score.textContent = String(runner.score);
      if (ui.best) ui.best.textContent = String(runner.best);
      if (ui.mult) {
        ui.mult.textContent = runner.shieldTimer > 0 ? "2× SHIELD" : inFocus ? "2× FOCUS" : "1×";
        ui.mult.className = (inFocus || runner.shieldTimer > 0) ? "pill-chip on" : "pill-chip";
      }
    } else if (activeGame === "zen") {
      if (ui.score) ui.score.textContent = String(zen.score);
      if (ui.best) ui.best.textContent = String(zen.best);
      if (ui.mult) {
        const calmVal = Math.round(bci.calm);
        ui.mult.textContent = `Calm ${calmVal}`;
        ui.mult.className = calmVal >= 45 ? "pill-chip on" : "pill-chip";
      }
    } else if (activeGame === "breakout") {
      if (ui.score) ui.score.textContent = String(brk.score);
      if (ui.best) ui.best.textContent = String(brk.best);
      if (ui.mult) {
        ui.mult.textContent = inFocus ? "2× POWER" : `Wave ${brk.wave}`;
        ui.mult.className = inFocus ? "pill-chip on" : "pill-chip";
      }
    }
  }

  function selectGame(gameId) {
    activeGame = gameId;
    const m = GAME_META[gameId];
    if (ui.eyebrow) ui.eyebrow.textContent = m.eyebrow;
    if (ui.title) ui.title.textContent = m.title;
    if (ui.btnStart) ui.btnStart.textContent = m.startLbl;
    if (ui.modeWrap) ui.modeWrap.classList.toggle("hidden", !m.showMode);
    if (ui.brkCalWrap) ui.brkCalWrap.classList.toggle("hidden", gameId !== "breakout");
    if (ui.legend) ui.legend.innerHTML = m.legend;
    if (ui.status) ui.status.textContent = m.status;
    document.querySelectorAll(".game-card-select").forEach((c) => {
      c.classList.toggle("active-game-card", c.dataset.game === gameId);
    });
    updateHud();
  }

  document.querySelectorAll(".game-card-select").forEach((card) => {
    card.addEventListener("click", () => selectGame(card.dataset.game));
  });

  ui.btnBrkCal?.addEventListener("click", () => {
    brk.neutralTilt = bci.tiltY;
    brk.paddleX = 0.5;
    sfx(523.25, 659.25, 0.12, "sine", 0.06);
    if (ui.status) ui.status.textContent = "Head center calibrated! Gentle turns now reach both edges.";
  });
  ui.rngBrkSens?.addEventListener("input", () => {
    brk.steerSens = Number(ui.rngBrkSens.value) || 2.0;
  });

  ui.btnStart?.addEventListener("click", () => {
    if (activeGame === "runner") runnerStart();
    else if (activeGame === "zen") zenStart();
    else if (activeGame === "breakout") brkStart();
  });

  window.addEventListener("keydown", (e) => {
    const panel = document.getElementById("panel-games");
    if (!panel || panel.classList.contains("hidden") || document.activeElement?.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      if (activeGame === "runner") { if (!runner.running) runnerStart(); else runnerJump(); }
      else if (activeGame === "zen") { if (!zen.running) zenStart(); else { const { w, h } = prepCanvas(); zenAddRipple(w * (0.2 + Math.random() * 0.6), h * (0.4 + Math.random() * 0.4)); } }
      else if (activeGame === "breakout") { if (!brk.running) brkStart(); else brkFireLaser(); }
    }
    if (e.key === "Shift") keyFocusHeld = true;
    if (e.key === "ArrowLeft") keyLeftHeld = true;
    if (e.key === "ArrowRight") keyRightHeld = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") keyFocusHeld = false;
    if (e.key === "ArrowLeft") keyLeftHeld = false;
    if (e.key === "ArrowRight") keyRightHeld = false;
  });

  let lastTs = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    animTime += dt;
    const panel = document.getElementById("panel-games");
    if (panel && !panel.classList.contains("hidden")) {
      const { ctx, w, h } = prepCanvas();
      if (activeGame === "runner") { runnerStep(dt, w, h); runnerDraw(ctx, w, h); }
      else if (activeGame === "zen") { zenStep(dt, w, h); zenDraw(ctx, w, h); }
      else if (activeGame === "breakout") { brkStep(dt, w, h); brkDraw(ctx, w, h); }
      updateHud();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  selectGame("runner");

  // Bridge called by app.js on every Muse 2 frame
  window.BrainMuseumGame = {
    onFrame(frame) {
      const m = frame.metrics || {};
      bci.focus = m.focus || 0;
      bci.calm = m.calm || 0;
      if (frame.lab) {
        bci.threshold = frame.lab.focus_threshold || 50;
        bci.inZone = !!frame.lab.in_zone;
        bci.yawDps = frame.lab.cursor?.yaw_dps || 0;
      }
      if (frame.imu && frame.imu.accel) bci.tiltY = Number(frame.imu.accel[1]) || 0;

      for (const ev of frame.events || []) {
        const isTrigger = ev.kind === "blink" || ev.kind === "double_blink" || ev.kind === "jaw_clench";
        if (!isTrigger) continue;

        if (activeGame === "runner") {
          const mode = ui.selMode?.value || "focus_blink";
          if (mode === "focus_blink" || (mode === "jaw_tilt" && ev.kind === "jaw_clench")) runnerJump();
        } else if (activeGame === "zen" && zen.running) {
          const { w, h } = prepCanvas();
          zenAddRipple(w * (0.2 + Math.random() * 0.6), h * (0.4 + Math.random() * 0.45), bci.calm >= 55);
        } else if (activeGame === "breakout" && brk.running) {
          brkFireLaser();
        }
      }
    },
  };
})();
