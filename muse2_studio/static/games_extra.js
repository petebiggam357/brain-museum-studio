/**
 * Brain Museum Arcade — 3 Additional Mind-Controlled Games with Web Audio SFX
 *
 * 4. Focus Flight         (Aurora Canyon Glider — Focus lifts, Calm glides, Blink boosts)
 * 5. Synapse Invaders     (Head-Gyro Neuro-Ship + Blink Plasma Bolts + Focus Hyper-Beam)
 * 6. Theta Memory Pulse   (4-Quadrant Neural Simon Sequence with Pentatonic Chimes)
 */
(() => {
  const A = window.BrainMuseumArcade;
  if (!A) return;
  const { bci, keys, ui, PENTATONIC, sharedStars, sfx, playChord, emitParticles, addPopup, drawPopups, drawOverlay, prepCanvas } = A;

  // =========================================================================
  // GAME 4: FOCUS FLIGHT (Aurora Canyon Mind Glider)
  // =========================================================================
  const flight = {
    running: false, gameOver: false, score: 0,
    best: Number(localStorage.getItem("bms-flight-best") || "0"),
    y: 160, vy: 0, trail: [], pillars: [], rings: [], particles: [], popups: [], spawnX: 500,
  };

  function flightSpawn(x, h) {
    const gapH = 118;
    const gapY = 65 + Math.random() * (h - 130 - gapH);
    flight.pillars.push({ x, w: 38, gapY, gapH, passed: false });
    flight.rings.push({ x: x + 19, y: gapY + gapH / 2, r: 14, collected: false });
    return x + 235 + Math.random() * 55;
  }

  function flightStart() {
    const { w, h } = prepCanvas();
    Object.assign(flight, { running: true, gameOver: false, score: 0, y: h * 0.5, vy: 0, trail: [], pillars: [], rings: [], particles: [], popups: [], spawnX: w * 0.72 });
    while (flight.spawnX < w + 500) flight.spawnX = flightSpawn(flight.spawnX, h);
    playChord([329.63, 440, 659.25], 0.25, "sine", 0.06);
    if (ui.btnStart) ui.btnStart.textContent = "Restart";
    if (ui.status) ui.status.textContent = "Raise Focus (or Hold Shift) to climb · Blink (or Space) to flap!";
  }

  function flightFlap() {
    if (!flight.running || flight.gameOver) return;
    flight.vy = -255;
    emitParticles(flight.particles, 120, flight.y, "#30d5c8", 8);
    sfx(420, 680, 0.11, "sine", 0.06);
  }

  A.register("flight", {
    meta: {
      eyebrow: "Focus Altitude Glider · Aurora Canyon",
      title: "Focus Flight",
      startLbl: "Start Flight",
      showMode: false,
      showCal: false,
      legend: "<span>Pass Crystal Pillar <b>+15</b></span><span>Flow Ring <b>+20</b></span><span>Focus <b>Climb</b> · Blink/Space <b>Flap</b></span>",
      status: "Ready · Raise Focus to climb smoothly, relax to glide, or Blink/Space to flap",
    },
    start: flightStart,
    onTrigger() { flightFlap(); },
    onSpace() { if (!flight.running) flightStart(); else flightFlap(); },
    hud() { const inF = bci.inZone || keys.focus; return { score: flight.score, best: flight.best, mult: inF ? "CLIMBING" : "GLIDING", multOn: inF }; },
    step(dt, w, h) {
      if (!flight.running || flight.gameOver) return;
      const inFocus = bci.inZone || keys.focus;
      const accel = inFocus ? -420 : 340;
      flight.vy = Math.max(-260, Math.min(270, flight.vy + accel * dt));
      flight.y += flight.vy * dt;
      if (flight.y < 18) { flight.y = 18; flight.vy = 0; }
      if (flight.y > h - 18) { flight.y = h - 18; flight.vy = 0; }

      const bx = 120;
      flight.trail.push({ x: bx, y: flight.y, life: 0.35 });
      const spd = 175 * dt;
      for (const t of flight.trail) { t.x -= spd; t.life -= dt; }
      flight.trail = flight.trail.filter((t) => t.life > 0);

      for (const p of flight.pillars) {
        p.x -= spd;
        if (!p.passed && p.x + p.w < bx) {
          p.passed = true; flight.score += 15;
          if (flight.score > flight.best) { flight.best = flight.score; localStorage.setItem("bms-flight-best", String(flight.best)); }
          addPopup(flight.popups, bx, flight.y - 18, "+15", "#30d158");
          sfx(523.25, 659.25, 0.1, "sine", 0.05);
        }
        if (bx + 12 > p.x && bx - 12 < p.x + p.w && (flight.y - 12 < p.gapY || flight.y + 12 > p.gapY + p.gapH)) {
          flight.gameOver = true; flight.running = false;
          emitParticles(flight.particles, bx, flight.y, "#ff453a", 20); sfx(260, 100, 0.3, "sawtooth", 0.07);
          if (ui.status) ui.status.textContent = `Flight Ended · Score: ${flight.score}`;
          if (ui.btnStart) ui.btnStart.textContent = "Fly Again";
        }
      }
      for (const r of flight.rings) {
        r.x -= spd;
        if (!r.collected && Math.hypot(r.x - bx, r.y - flight.y) < 28) {
          r.collected = true; flight.score += 20;
          if (flight.score > flight.best) { flight.best = flight.score; localStorage.setItem("bms-flight-best", String(flight.best)); }
          addPopup(flight.popups, r.x, r.y - 12, "+20 FLOW", "#ff9f0a");
          emitParticles(flight.particles, r.x, r.y, "#ff9f0a", 12);
          sfx(784, 1046, 0.12, "triangle", 0.07);
        }
      }
      flight.pillars = flight.pillars.filter((p) => p.x + p.w > -40);
      flight.rings = flight.rings.filter((r) => !r.collected && r.x > -30);
      flight.spawnX -= spd;
      while (flight.spawnX < w + 420) flight.spawnX = flightSpawn(flight.spawnX, h);
      for (const pt of flight.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
      flight.particles = flight.particles.filter((pt) => pt.life > 0);
    },
    draw(ctx, w, h, dt) {
      const t = A.getAnimTime();
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#050916"); sky.addColorStop(0.55, "#0d1b32"); sky.addColorStop(1, "#171430");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      for (const s of sharedStars) {
        ctx.fillStyle = `rgba(226,232,240,${0.25 + 0.6 * Math.abs(Math.sin(t + s.ph))})`;
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill();
      }
      // Crystal pillars
      for (const p of flight.pillars) {
        const pg = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
        pg.addColorStop(0, "#5e5ce6"); pg.addColorStop(1, "#0a84ff");
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.roundRect(p.x, 0, p.w, p.gapY, [0, 0, 8, 8]); ctx.fill();
        ctx.beginPath(); ctx.roundRect(p.x, p.gapY + p.gapH, p.w, h - (p.gapY + p.gapH), [8, 8, 0, 0]); ctx.fill();
      }
      // Flow rings
      for (const r of flight.rings) {
        ctx.strokeStyle = "#ff9f0a"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      // Bird ribbon trail
      for (const tr of flight.trail) {
        ctx.globalAlpha = (tr.life / 0.35) * 0.45; ctx.fillStyle = "#30d5c8";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, 7 * (tr.life / 0.35), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Luminous Origami Glider Bird
      ctx.save(); ctx.translate(120, flight.y); ctx.rotate(Math.max(-0.5, Math.min(0.5, flight.vy * 0.0018)));
      ctx.fillStyle = (bci.inZone || keys.focus) ? "#30d158" : "#30d5c8";
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-14, -12); ctx.lineTo(-7, 0); ctx.lineTo(-14, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(6, -2, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      for (const pt of flight.particles) { ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife); ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      flight.popups = drawPopups(ctx, flight.popups, dt);
      if (!flight.running) drawOverlay(ctx, w, h, flight.gameOver ? `Flight Ended — ${flight.score} pts` : "Focus Flight", "Click Start Flight · Raise Focus (or Shift) to climb · Blink (or Space) to flap through Flow Rings");
    },
  });

  // =========================================================================
  // GAME 5: SYNAPSE INVADERS (Gyro Neuro-Ship + Blink Plasma + Focus Beam)
  // =========================================================================
  const inv = {
    running: false, gameOver: false, score: 0, best: Number(localStorage.getItem("bms-inv-best") || "0"),
    wave: 1, lives: 3, shipX: 0.5, neutralTilt: 0, steerSens: 2.0,
    drones: [], shots: [], enemyShots: [], particles: [], popups: [], dir: 1, fireCd: 0,
  };

  function invSpawnWave(w) {
    inv.drones = [];
    const cols = 8, rows = 3, spacingX = Math.min(68, (w - 140) / cols);
    const startX = (w - (cols - 1) * spacingX) / 2;
    const colsArr = ["#ff375f", "#bf5af2", "#ff9f0a"];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      inv.drones.push({ x: startX + c * spacingX, y: 52 + r * 42, r: 13, color: colsArr[r % 3], alive: true });
    }
  }

  function invStart() {
    const { w } = prepCanvas();
    Object.assign(inv, { running: true, gameOver: false, score: 0, wave: 1, lives: 3, shipX: 0.5, neutralTilt: bci.tiltY, shots: [], enemyShots: [], particles: [], popups: [], dir: 1 });
    invSpawnWave(w);
    playChord([293.66, 440, 587.33], 0.22, "sawtooth", 0.05);
    if (ui.btnStart) ui.btnStart.textContent = "Restart";
    if (ui.status) ui.status.textContent = "Turn head (or ←/→) to aim · Blink/Jaw (or Space) to fire · Focus = Hyper-Beam!";
  }

  function invFire() {
    if (!inv.running || inv.gameOver) return;
    const { w, h } = prepCanvas();
    const sx = inv.shipX * w;
    const hyper = bci.inZone || keys.focus;
    if (hyper) {
      inv.shots.push({ x: sx - 10, y: h - 44, vy: -580, col: "#30d158" }, { x: sx + 10, y: h - 44, vy: -580, col: "#30d158" });
      sfx(760, 1240, 0.11, "triangle", 0.06);
    } else {
      inv.shots.push({ x: sx, y: h - 44, vy: -520, col: "#0a84ff" });
      sfx(620, 320, 0.09, "square", 0.05);
    }
  }

  A.register("invaders", {
    meta: {
      eyebrow: "Mind Space Defender · Gyro Aim + Blink Plasma",
      title: "Synapse Invaders",
      startLbl: "Start Defense",
      showMode: false,
      showCal: true,
      legend: "<span>Distraction Drone <b>+20</b></span><span>Wave Clear <b>+60</b></span><span>Blink/Jaw <b>Plasma</b> · Focus <b>Twin Hyper-Beam</b></span>",
      status: "Ready · Click Center Head · Turn head (or ←/→) to steer · Blink/Space to fire",
    },
    start: invStart,
    calibrate() { inv.neutralTilt = bci.tiltY; inv.shipX = 0.5; },
    setSens(v) { inv.steerSens = v; },
    onTrigger() { invFire(); },
    onSpace() { if (!inv.running) invStart(); else invFire(); },
    hud() { const inF = bci.inZone || keys.focus; return { score: inv.score, best: inv.best, mult: inF ? "HYPER-BEAM" : `Wave ${inv.wave}`, multOn: inF }; },
    step(dt, w, h) {
      if (!inv.running || inv.gameOver) return;
      let move = 0;
      const sens = inv.steerSens || 2.0;
      if (Math.abs(bci.yawDps) > 4.0) move -= (bci.yawDps > 0 ? bci.yawDps - 4.0 : bci.yawDps + 4.0) * 0.016 * sens;
      const relTilt = bci.tiltY - inv.neutralTilt;
      if (Math.abs(relTilt) > 0.06) move += relTilt * 1.6 * sens;
      if (keys.left) move -= 1.3; if (keys.right) move += 1.3;
      inv.shipX = Math.max(0.06, Math.min(0.94, inv.shipX + move * dt));

      // Move drones
      let hitEdge = false;
      const dSpd = (45 + inv.wave * 12) * dt * inv.dir;
      for (const d of inv.drones) {
        if (!d.alive) continue;
        d.x += dSpd;
        if (d.x < 30 || d.x > w - 30) hitEdge = true;
      }
      if (hitEdge) { inv.dir *= -1; for (const d of inv.drones) if (d.alive) d.y += 16; }

      // Random enemy fire
      inv.fireCd -= dt;
      const alive = inv.drones.filter((d) => d.alive);
      if (inv.fireCd <= 0 && alive.length) {
        inv.fireCd = Math.max(0.55, 1.4 - inv.wave * 0.1);
        const shooter = alive[Math.floor(Math.random() * alive.length)];
        inv.enemyShots.push({ x: shooter.x, y: shooter.y + 12, vy: 210 + inv.wave * 20 });
      }

      for (const s of inv.shots) {
        s.y += s.vy * dt;
        for (const d of inv.drones) {
          if (d.alive && Math.hypot(s.x - d.x, s.y - d.y) < d.r + 6) {
            d.alive = false; s.y = -50;
            const pts = (bci.inZone || keys.focus) ? 40 : 20;
            inv.score += pts; if (inv.score > inv.best) { inv.best = inv.score; localStorage.setItem("bms-inv-best", String(inv.best)); }
            addPopup(inv.popups, d.x, d.y - 10, `+${pts}`, d.color);
            emitParticles(inv.particles, d.x, d.y, d.color, 12); sfx(520, 920, 0.1, "triangle", 0.06);
          }
        }
      }
      inv.shots = inv.shots.filter((s) => s.y > -20);

      const sx = inv.shipX * w, sy = h - 30;
      for (const es of inv.enemyShots) {
        es.y += es.vy * dt;
        if (Math.hypot(es.x - sx, es.y - sy) < 20) {
          es.y = h + 50; inv.lives -= 1;
          emitParticles(inv.particles, sx, sy, "#ff453a", 16); sfx(220, 90, 0.28, "sawtooth", 0.08);
          if (inv.lives <= 0) { inv.gameOver = true; inv.running = false; if (ui.status) ui.status.textContent = `Cortex Breached · Score: ${inv.score}`; if (ui.btnStart) ui.btnStart.textContent = "Play Again"; }
        }
      }
      inv.enemyShots = inv.enemyShots.filter((es) => es.y < h + 20);

      if (alive.length === 0) {
        inv.wave += 1; inv.score += 60;
        if (inv.score > inv.best) { inv.best = inv.score; localStorage.setItem("bms-inv-best", String(inv.best)); }
        addPopup(inv.popups, w / 2, h / 2, `WAVE ${inv.wave} +60`, "#30d158");
        invSpawnWave(w); playChord([523.25, 659.25, 783.99, 1046.5], 0.25, "triangle", 0.07);
      }
      for (const pt of inv.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
      inv.particles = inv.particles.filter((pt) => pt.life > 0);
    },
    draw(ctx, w, h, dt) {
      const t = A.getAnimTime();
      ctx.fillStyle = "#060812"; ctx.fillRect(0, 0, w, h);
      for (const s of sharedStars) {
        ctx.fillStyle = `rgba(148,163,184,${0.2 + 0.5 * Math.abs(Math.sin(t + s.ph))})`;
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill();
      }
      for (const d of inv.drones) {
        if (!d.alive) continue;
        ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0b0f17"; ctx.fillRect(d.x - 6, d.y - 3, 4, 4); ctx.fillRect(d.x + 2, d.y - 3, 4, 4);
      }
      for (const s of inv.shots) { ctx.fillStyle = s.col; ctx.fillRect(s.x - 2, s.y - 10, 4, 14); }
      for (const es of inv.enemyShots) { ctx.fillStyle = "#ff453a"; ctx.beginPath(); ctx.arc(es.x, es.y, 4, 0, Math.PI * 2); ctx.fill(); }
      const sx = inv.shipX * w, sy = h - 30;
      ctx.fillStyle = (bci.inZone || keys.focus) ? "#30d158" : "#0a84ff";
      ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.lineTo(sx - 18, sy + 12); ctx.lineTo(sx + 18, sy + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#94a3b8"; ctx.font = "600 12px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(`Wave ${inv.wave}  ·  Shields: ${"●".repeat(Math.max(0, inv.lives))}`, 14, 24);
      for (const pt of inv.particles) { ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife); ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      inv.popups = drawPopups(ctx, inv.popups, dt);
      if (!inv.running) drawOverlay(ctx, w, h, inv.gameOver ? `Defense Ended — ${inv.score} pts` : "Synapse Invaders", "Click Start Defense · Center Head + Turn to steer · Blink/Jaw (or Space) to fire Plasma");
    },
  });

  // =========================================================================
  // GAME 6: THETA MEMORY PULSE (4-Quadrant Neural Simon + Pentatonic Audio)
  // =========================================================================
  const mem = {
    running: false, score: 0, best: Number(localStorage.getItem("bms-mem-best") || "0"),
    seq: [], userIdx: 0, showing: false, showStep: 0, showTimer: 0, litQuad: -1, litTimer: 0,
    cursorQuad: 0, popups: [],
  };
  const QUAD_META = [
    { name: "TP9",  col: "#0a84ff", freq: 329.63 },
    { name: "AF7",  col: "#30d158", freq: 392.00 },
    { name: "AF8",  col: "#ff9f0a", freq: 440.00 },
    { name: "TP10", col: "#bf5af2", freq: 523.25 },
  ];

  function memFlash(q, dur = 0.45) {
    mem.litQuad = q; mem.litTimer = dur;
    sfx(QUAD_META[q].freq, QUAD_META[q].freq * 1.004, 0.35, "sine", 0.08);
  }

  function memNextRound() {
    mem.seq.push(Math.floor(Math.random() * 4));
    mem.userIdx = 0; mem.showing = true; mem.showStep = 0; mem.showTimer = 0.4;
    if (ui.status) ui.status.textContent = `Round ${mem.seq.length} — Watch & Listen...`;
  }

  function memStart() {
    Object.assign(mem, { running: true, score: 0, seq: [], userIdx: 0, showing: false, litQuad: -1, litTimer: 0, popups: [] });
    if (ui.btnStart) ui.btnStart.textContent = "Restart";
    memNextRound();
  }

  function memPick(q) {
    if (!mem.running || mem.showing) return;
    memFlash(q, 0.32);
    const { w, h } = prepCanvas();
    if (q === mem.seq[mem.userIdx]) {
      mem.userIdx += 1;
      if (mem.userIdx >= mem.seq.length) {
        const pts = (bci.calm >= 45 ? 40 : 20) * mem.seq.length;
        mem.score += pts;
        if (mem.score > mem.best) { mem.best = mem.score; localStorage.setItem("bms-mem-best", String(mem.best)); }
        addPopup(mem.popups, w / 2, h / 2, `+${pts} CLEAR!`, "#30d158");
        setTimeout(() => { if (mem.running) memNextRound(); }, 750);
      }
    } else {
      mem.running = false;
      sfx(220, 110, 0.4, "sawtooth", 0.08);
      if (ui.status) ui.status.textContent = `Sequence Ended at Round ${mem.seq.length} · Score: ${mem.score}`;
      if (ui.btnStart) ui.btnStart.textContent = "Play Again";
    }
  }

  A.register("memory", {
    meta: {
      eyebrow: "Neural Sequence Trainer · Pentatonic Cortex Ring",
      title: "Theta Memory Pulse",
      startLbl: "Start Sequence",
      showMode: false,
      showCal: false,
      legend: "<span>Clear Round <b>+20×Round</b></span><span>Calm Bonus <b>2×</b></span><span>Click quadrant, press <b>1–4</b>, or Tilt + Blink</span>",
      status: "Ready · Watch & listen to the Cortex Ring, then repeat the sequence!",
    },
    start: memStart,
    onClick(nx, ny) {
      if (!mem.running) { memStart(); return; }
      const q = (ny < 0.5 ? (nx < 0.5 ? 0 : 1) : (nx < 0.5 ? 2 : 3));
      memPick(q);
    },
    onDigit(idx) { memPick(idx); },
    onTrigger() { if (mem.running && !mem.showing) memPick(mem.cursorQuad); },
    onSpace() { if (!mem.running) memStart(); else memPick(mem.cursorQuad); },
    hud() { return { score: mem.score, best: mem.best, mult: bci.calm >= 45 ? "2× CALM" : `Round ${mem.seq.length}`, multOn: bci.calm >= 45 }; },
    step(dt) {
      if (mem.litTimer > 0) { mem.litTimer -= dt; if (mem.litTimer <= 0) mem.litQuad = -1; }
      // Head tilt maps smoothly across the 4 quadrants
      if (bci.tiltY < -0.22) mem.cursorQuad = 0;
      else if (bci.tiltY < 0.0) mem.cursorQuad = 1;
      else if (bci.tiltY < 0.22) mem.cursorQuad = 2;
      else mem.cursorQuad = 3;

      if (mem.running && mem.showing) {
        mem.showTimer -= dt;
        if (mem.showTimer <= 0) {
          if (mem.showStep < mem.seq.length) {
            memFlash(mem.seq[mem.showStep], 0.42);
            mem.showStep += 1;
            mem.showTimer = 0.65;
          } else {
            mem.showing = false;
            if (ui.status) ui.status.textContent = "Your Turn! Click quadrant, press 1–4, or Tilt + Blink";
          }
        }
      }
    },
    draw(ctx, w, h, dt) {
      ctx.fillStyle = "#080912"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, outerR = Math.min(w, h) * 0.4, innerR = outerR * 0.36;
      const arcs = [
        [Math.PI, Math.PI * 1.5],     // 0: Top-Left (TP9)
        [Math.PI * 1.5, Math.PI * 2], // 1: Top-Right (AF7)
        [Math.PI * 0.5, Math.PI],     // 2: Bottom-Left (AF8)
        [0, Math.PI * 0.5],           // 3: Bottom-Right (TP10)
      ];
      arcs.forEach(([a0, a1], idx) => {
        const lit = mem.litQuad === idx;
        const hovered = mem.running && !mem.showing && mem.cursorQuad === idx;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, lit ? outerR + 8 : outerR, a0 + 0.05, a1 - 0.05);
        ctx.arc(cx, cy, innerR, a1 - 0.05, a0 + 0.05, true);
        ctx.closePath();
        ctx.fillStyle = QUAD_META[idx].col;
        ctx.globalAlpha = lit ? 0.95 : hovered ? 0.48 : 0.24;
        ctx.fill();
        ctx.lineWidth = hovered ? 3 : 1.5;
        ctx.strokeStyle = QUAD_META[idx].col;
        ctx.globalAlpha = lit ? 1 : 0.7;
        ctx.stroke();
        const midA = (a0 + a1) / 2, lr = (outerR + innerR) / 2;
        ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.9;
        ctx.font = "700 13px -apple-system, BlinkMacSystemFont, Inter, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`${idx + 1} · ${QUAD_META[idx].name}`, cx + Math.cos(midA) * lr, cy + Math.sin(midA) * lr + 4);
        ctx.restore();
      });
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
      ctx.font = "700 16px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(mem.showing ? "LISTEN" : mem.running ? "REPEAT" : "READY", cx, cy + 5);
      ctx.textAlign = "left";
      mem.popups = drawPopups(ctx, mem.popups, dt);
      if (!mem.running) drawOverlay(ctx, w, h, "Theta Memory Pulse", "Click Start Sequence · Repeat the glowing musical Cortex Ring (Click, 1–4, or Tilt + Blink)");
    },
  });
})();
