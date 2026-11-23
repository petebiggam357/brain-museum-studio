/**
 * Neuro Runner: Cortex Kingdom — Mind-Controlled Mario-Style Side-Scroller
 * Part of Brain Museum Studio
 *
 * Character: Musey (a glowing neural sprite wearing a Muse 2 headband)
 * Collect Synapse Orbs (+10), Stomp Noise Glitches (+25), Grab Alpha Stars (+50 + Shield)
 * Stay in Focus Zone for 2x Multiplier + Neural Glide!
 */
(() => {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  const ui = {
    btnStart: document.getElementById("btn-game-start"),
    selMode: document.getElementById("sel-game-mode"),
    chkAudio: document.getElementById("chk-game-audio"),
    score: document.getElementById("game-score"),
    best: document.getElementById("game-best"),
    mult: document.getElementById("game-mult"),
    status: document.getElementById("game-status"),
  };

  let audioCtx = null;
  function sfx(freq, endFreq, dur = 0.14, type = "sine", vol = 0.08) {
    if (!ui.chkAudio?.checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), audioCtx.currentTime + dur);
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur + 0.02);
    } catch (_) {}
  }

  // Live BCI inputs fed from app.js
  const bci = {
    focus: 0,
    calm: 0,
    threshold: 50,
    inZone: false,
    tiltY: 0,
  };

  // Game state
  let running = false;
  let gameOver = false;
  let score = 0;
  let bestScore = Number(localStorage.getItem("bms-runner-best") || "0");
  let distance = 0;
  let scrollSpeed = 240; // px/sec
  let shieldTimer = 0;
  let animTime = 0;
  let keyFocusHeld = false;

  if (ui.best) ui.best.textContent = String(bestScore);

  const GROUND_RATIO = 0.82;
  const player = {
    x: 130,
    y: 0,
    vy: 0,
    w: 36,
    h: 40,
    grounded: true,
    jumpsLeft: 2,
    squash: 1.0,
  };

  let platforms = [];
  let orbs = [];
  let enemies = [];
  let stars = [];
  let particles = [];
  let spawnCursor = 420;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

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

  function emitParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 140;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        color,
        r: 2.5 + Math.random() * 3,
      });
    }
  }

  function spawnChunk(startX, groundY) {
    // 1. Floating platform with Synapse Orb arc above it
    const platW = 110 + Math.random() * 90;
    const platY = groundY - (75 + Math.random() * 75);
    platforms.push({ x: startX, y: platY, w: platW, h: 14 });

    // Arc of 4 Synapse Orbs
    for (let i = 0; i < 4; i++) {
      const ox = startX + 18 + i * 28;
      const arc = Math.sin((i / 3) * Math.PI) * 28;
      orbs.push({ x: ox, y: platY - 26 - arc, r: 9, collected: false });
    }

    // 2. Ground coins leading into next section
    if (Math.random() < 0.7) {
      for (let i = 0; i < 3; i++) {
        orbs.push({ x: startX + platW + 65 + i * 30, y: groundY - 26, r: 9, collected: false });
      }
    }

    // 3. Patrolling Noise Glitch enemy on ground
    if (Math.random() < 0.75) {
      enemies.push({
        x: startX + platW + 90 + Math.random() * 70,
        y: groundY - 30,
        w: 32,
        h: 30,
        vx: -45 - Math.random() * 35,
        alive: true,
      });
    }

    // 4. Rare Alpha Star power-up
    if (Math.random() < 0.28) {
      stars.push({
        x: startX + platW / 2,
        y: platY - 78,
        r: 13,
        collected: false,
      });
    }

    return startX + platW + 250 + Math.random() * 120;
  }

  function resetGame() {
    const { w, h } = prepCanvas();
    const groundY = h * GROUND_RATIO;
    score = 0;
    distance = 0;
    scrollSpeed = 235;
    shieldTimer = 0;
    gameOver = false;
    running = true;

    player.x = Math.min(140, w * 0.18);
    player.y = groundY - player.h;
    player.vy = 0;
    player.grounded = true;
    player.jumpsLeft = 2;
    player.squash = 1.0;

    platforms = [];
    orbs = [];
    enemies = [];
    stars = [];
    particles = [];
    spawnCursor = w * 0.55;
    while (spawnCursor < w + 600) {
      spawnCursor = spawnChunk(spawnCursor, groundY);
    }

    updateHud();
    if (ui.btnStart) ui.btnStart.textContent = "Restart";
    if (ui.status) ui.status.textContent = "Running · Collect Synapse Orbs!";
    sfx(440, 660, 0.16, "triangle");
  }

  function triggerJump() {
    if (!running || gameOver) return;
    if (player.jumpsLeft > 0) {
      player.vy = player.grounded ? -500 : -430;
      player.grounded = false;
      player.jumpsLeft -= 1;
      player.squash = 1.28;
      emitParticles(player.x + player.w / 2, player.y + player.h, "#0a84ff", 8);
      sfx(340, 680, 0.13, "sine");
    }
  }

  function addScore(base) {
    const inFocus = bci.inZone || keyFocusHeld || shieldTimer > 0;
    const mult = inFocus ? 2 : 1;
    score += base * mult;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem("bms-runner-best", String(bestScore));
    }
    updateHud();
  }

  function updateHud() {
    const inFocus = bci.inZone || keyFocusHeld || shieldTimer > 0;
    if (ui.score) ui.score.textContent = String(score);
    if (ui.best) ui.best.textContent = String(bestScore);
    if (ui.mult) {
      ui.mult.textContent = shieldTimer > 0 ? "2× SHIELD" : inFocus ? "2× FOCUS" : "1×";
      ui.mult.className = inFocus ? "pill-chip on" : "pill-chip";
    }
  }

  function step(dt, w, h) {
    animTime += dt;
    if (!running || gameOver) return;

    const groundY = h * GROUND_RATIO;
    const mode = ui.selMode?.value || "focus_blink";
    const inFocus = bci.inZone || keyFocusHeld;
    if (shieldTimer > 0) shieldTimer = Math.max(0, shieldTimer - dt);

    // Progressive gentle speed ramp
    let speedMod = 1.0;
    if (mode === "jaw_tilt") {
      speedMod = Math.max(0.65, Math.min(1.45, 1.0 + bci.tiltY * 0.8));
    } else if (inFocus) {
      speedMod = 1.15;
    }
    scrollSpeed = Math.min(390, 235 + distance * 0.012);
    const dx = scrollSpeed * speedMod * dt;
    distance += dx;

    // Player vertical physics
    if (mode === "focus_jetpack") {
      const lift = inFocus ? -780 : 0;
      const gravity = 460;
      player.vy += (gravity + lift) * dt;
      player.vy = Math.max(-320, Math.min(340, player.vy));
      if (inFocus && Math.random() < 0.45) {
        emitParticles(player.x + player.w / 2, player.y + player.h, "#30d158", 1);
      }
    } else {
      // Mario gravity + Neural Glide when holding Focus while descending
      const gliding = inFocus && player.vy > 0 && !player.grounded;
      const gravity = gliding ? 360 : 1280;
      player.vy += gravity * dt;
      if (gliding && player.vy > 130) player.vy = 130;
    }

    const prevBottom = player.y + player.h;
    player.y += player.vy * dt;
    player.squash += (1.0 - player.squash) * Math.min(1, dt * 10);

    // Ceiling clamp
    if (player.y < 14) {
      player.y = 14;
      if (player.vy < 0) player.vy = 0;
    }

    // Platform landing (one-way Mario platforms)
    player.grounded = false;
    for (const p of platforms) {
      p.x -= dx;
      const overlapsX = player.x + player.w - 6 > p.x && player.x + 6 < p.x + p.w;
      if (overlapsX && player.vy >= 0 && prevBottom <= p.y + 8 && player.y + player.h >= p.y) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.jumpsLeft = 2;
      }
    }

    // Ground landing
    if (player.y + player.h >= groundY) {
      if (player.vy > 200) player.squash = 0.78;
      player.y = groundY - player.h;
      player.vy = 0;
      player.grounded = true;
      player.jumpsLeft = 2;
    }

    // Synapse Orbs (with Focus Magnet!)
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    for (const o of orbs) {
      o.x -= dx;
      if (o.collected) continue;
      const dist = Math.hypot(o.x - px, o.y - py);
      if (inFocus && dist < 115) {
        o.x += (px - o.x) * Math.min(1, dt * 8);
        o.y += (py - o.y) * Math.min(1, dt * 8);
      }
      if (dist < 28) {
        o.collected = true;
        addScore(10);
        emitParticles(o.x, o.y, "#ff9f0a", 6);
        sfx(740, 1080, 0.09, "sine", 0.06);
      }
    }

    // Alpha Stars
    for (const s of stars) {
      s.x -= dx;
      if (s.collected) continue;
      if (Math.hypot(s.x - px, s.y - py) < 32) {
        s.collected = true;
        shieldTimer = 5.5;
        addScore(50);
        emitParticles(s.x, s.y, "#30d158", 16);
        sfx(523, 1046, 0.25, "triangle", 0.09);
      }
    }

    // Noise Glitches (Enemies)
    for (const e of enemies) {
      e.x -= dx - e.vx * dt;
      if (!e.alive) continue;
      const hitX = player.x + player.w - 6 > e.x && player.x + 6 < e.x + e.w;
      const hitY = player.y + player.h > e.y && player.y < e.y + e.h;
      if (hitX && hitY) {
        const stomping = player.vy > 0 && prevBottom <= e.y + 14;
        if (stomping || shieldTimer > 0) {
          e.alive = false;
          if (stomping) player.vy = -380;
          addScore(25);
          emitParticles(e.x + e.w / 2, e.y + e.h / 2, "#ff375f", 14);
          sfx(280, 620, 0.14, "square", 0.06);
        } else {
          // Game Over!
          gameOver = true;
          running = false;
          emitParticles(px, py, "#ff453a", 22);
          sfx(300, 110, 0.35, "sawtooth", 0.08);
          if (ui.status) ui.status.textContent = `Run Complete · Final Score: ${score} (Click Restart or Blink)`;
          if (ui.btnStart) ui.btnStart.textContent = "Play Again";
        }
      }
    }

    // Recycle off-screen entities & spawn ahead
    platforms = platforms.filter((p) => p.x + p.w > -40);
    orbs = orbs.filter((o) => !o.collected && o.x > -30);
    stars = stars.filter((s) => !s.collected && s.x > -30);
    enemies = enemies.filter((e) => e.alive && e.x + e.w > -40);

    spawnCursor -= dx;
    while (spawnCursor < w + 500) {
      spawnCursor = spawnChunk(spawnCursor, groundY);
    }

    // Particles
    for (const pt of particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 320 * dt;
      pt.life -= dt;
    }
    particles = particles.filter((pt) => pt.life > 0);
    updateHud();
  }

  function draw(ctx, w, h) {
    const groundY = h * GROUND_RATIO;
    const isLight = document.documentElement.getAttribute("data-theme") === "light";

    // Sky gradient (Cortex Kingdom Aurora)
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isLight) {
      sky.addColorStop(0, "#dbeafe");
      sky.addColorStop(1, "#f5f3ff");
    } else {
      sky.addColorStop(0, "#0b1021");
      sky.addColorStop(0.6, "#141933");
      sky.addColorStop(1, "#1d1b38");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Subtle parallax mountain hills
    ctx.fillStyle = isLight ? "rgba(99, 102, 241, 0.12)" : "rgba(94, 92, 230, 0.18)";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= w + 40; x += 40) {
      const hill = Math.sin((x + distance * 0.18) * 0.008) * 34 + Math.cos((x + distance * 0.18) * 0.004) * 20;
      ctx.lineTo(x, groundY - 46 - hill);
    }
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // Ground track
    ctx.fillStyle = isLight ? "#e2e8f0" : "#181d2b";
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = "#30d158";
    ctx.fillRect(0, groundY, w, 4);

    // Floating Focus Platforms
    for (const p of platforms) {
      ctx.fillStyle = isLight ? "#ffffff" : "#252b3d";
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 7);
      ctx.fill();
      ctx.fillStyle = "#0a84ff";
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, 4, [7, 7, 0, 0]);
      ctx.fill();
    }

    // Synapse Orbs (Golden Coins)
    for (const o of orbs) {
      const bob = Math.sin(animTime * 5 + o.x * 0.04) * 3;
      ctx.fillStyle = "rgba(255, 159, 10, 0.25)";
      ctx.beginPath();
      ctx.arc(o.x, o.y + bob, o.r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff9f0a";
      ctx.beginPath();
      ctx.arc(o.x, o.y + bob, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff7ed";
      ctx.beginPath();
      ctx.arc(o.x - 2.5, o.y + bob - 2.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Alpha Stars
    for (const s of stars) {
      const pulse = 1 + Math.sin(animTime * 7) * 0.12;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#30d158";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? s.r : s.r * 0.48;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Noise Glitches (Static Cloud Enemies)
    for (const e of enemies) {
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      ctx.fillStyle = "#ff375f";
      ctx.beginPath();
      ctx.roundRect(e.x, e.y + 4, e.w, e.h - 4, 10);
      ctx.fill();
      // Angry pixel eyes
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - 8, cy - 3, 5, 5);
      ctx.fillRect(cx + 3, cy - 3, 5, 5);
      ctx.fillStyle = "#0b0f17";
      ctx.fillRect(cx - 7, cy - 1, 2.5, 2.5);
      ctx.fillRect(cx + 4, cy - 1, 2.5, 2.5);
    }

    // Main Character: MUSEY (Neural Sprite with Muse 2 Headband!)
    const inFocus = bci.inZone || keyFocusHeld;
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;

    if (inFocus || shieldTimer > 0) {
      ctx.strokeStyle = shieldTimer > 0 ? "rgba(48, 209, 88, 0.75)" : "rgba(10, 132, 255, 0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 28 + Math.sin(animTime * 10) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, player.y + player.h);
    ctx.scale(2 - player.squash, player.squash);
    ctx.translate(-player.w / 2, -player.h);

    // Body
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, player.h);
    bodyGrad.addColorStop(0, inFocus ? "#30d158" : "#0a84ff");
    bodyGrad.addColorStop(1, "#5e5ce6");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(0, 4, player.w, player.h - 4, 12);
    ctx.fill();

    // Muse 2 Headband across forehead
    ctx.fillStyle = "#f5f5f7";
    ctx.beginPath();
    ctx.roundRect(2, 10, player.w - 4, 6, 3);
    ctx.fill();
    // Glowing sensor LEDs on headband
    ctx.fillStyle = inFocus ? "#30d158" : "#30d5c8";
    ctx.beginPath();
    ctx.arc(10, 13, 2, 0, Math.PI * 2);
    ctx.arc(18, 13, 2, 0, Math.PI * 2);
    ctx.arc(26, 13, 2, 0, Math.PI * 2);
    ctx.fill();

    // Friendly eyes
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(22, 23, 3.2, 0, Math.PI * 2);
    ctx.arc(30, 23, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0f17";
    ctx.beginPath();
    ctx.arc(23.2, 23, 1.5, 0, Math.PI * 2);
    ctx.arc(31.2, 23, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Particles
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Overlay prompt when idle or game over
    if (!running) {
      ctx.fillStyle = "rgba(8, 9, 12, 0.52)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "700 22px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(gameOver ? `Run Complete — ${score} pts` : "Neuro Runner: Cortex Kingdom", w / 2, h / 2 - 12);
      ctx.font = "500 13px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillStyle = "#d4d4d8";
      ctx.fillText("Click Start Game (or press Space) · Blink/Jaw to Jump · Hold Focus to Glide & 2× Score", w / 2, h / 2 + 16);
      ctx.textAlign = "left";
    }
  }

  let lastTs = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    const panel = document.getElementById("panel-games");
    if (panel && !panel.classList.contains("hidden")) {
      const { ctx, w, h } = prepCanvas();
      step(dt, w, h);
      draw(ctx, w, h);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Controls
  ui.btnStart?.addEventListener("click", resetGame);
  window.addEventListener("keydown", (e) => {
    const panel = document.getElementById("panel-games");
    if (!panel || panel.classList.contains("hidden")) return;
    if (e.code === "Space" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      if (!running) resetGame();
      else triggerJump();
    }
    if (e.key === "Shift") keyFocusHeld = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") keyFocusHeld = false;
  });

  // Public bridge called by app.js on every Muse 2 WebSocket frame
  window.BrainMuseumGame = {
    onFrame(frame) {
      const m = frame.metrics || {};
      bci.focus = m.focus || 0;
      bci.calm = m.calm || 0;
      if (frame.lab) {
        bci.threshold = frame.lab.focus_threshold || 50;
        bci.inZone = !!frame.lab.in_zone;
      }
      if (frame.imu && frame.imu.accel) {
        bci.tiltY = Number(frame.imu.accel[1]) || 0;
      }
      const mode = ui.selMode?.value || "focus_blink";
      for (const ev of frame.events || []) {
        if (mode === "focus_blink" && (ev.kind === "blink" || ev.kind === "double_blink" || ev.kind === "jaw_clench")) {
          triggerJump();
        } else if (mode === "jaw_tilt" && ev.kind === "jaw_clench") {
          triggerJump();
        }
      }
    },
  };
})();
