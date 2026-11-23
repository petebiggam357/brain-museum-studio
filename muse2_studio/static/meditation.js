/**
 * Brain Museum Studio — Zen Meditation Room
 * True Stereo Binaural Beat Synthesizer + Procedural Ocean/Singing-Bowl Soundscape
 * + 4 Fullscreen-Capable Animated Zen Sanctuaries + Guided Breath Pacer + Muse 2 Biofeedback
 */
(() => {
  const canvas = document.getElementById("med-canvas");
  if (!canvas) return;

  const ui = {
    stage: document.getElementById("med-stage"),
    btnPlay: document.getElementById("btn-med-play"),
    btnFull: document.getElementById("btn-med-fullscreen"),
    btnExitFull: document.getElementById("btn-med-exit-full"),
    btnBell: document.getElementById("btn-med-bell"),
    selPreset: document.getElementById("sel-med-preset"),
    selScene: document.getElementById("sel-med-scene"),
    selBreath: document.getElementById("sel-med-breath"),
    selTimer: document.getElementById("sel-med-timer"),
    rngBinauralVol: document.getElementById("rng-med-binaural"),
    rngAmbientVol: document.getElementById("rng-med-ambient"),
    freqReadout: document.getElementById("med-freq-readout"),
    timerReadout: document.getElementById("med-timer-readout"),
    breathPrompt: document.getElementById("med-breath-prompt"),
    bioReadout: document.getElementById("med-bio-readout"),
  };

  const PRESETS = {
    delta:    { name: "Delta Deep Rest",      carrier: 160, beat: 2.5,  band: "delta", desc: "2.5 Hz · Deep restorative rest" },
    theta:    { name: "Theta Meditation",     carrier: 180, beat: 6.0,  band: "theta", desc: "6.0 Hz · Deep meditative stillness" },
    schumann: { name: "Schumann Resonance",   carrier: 196, beat: 7.83, band: "theta", desc: "7.83 Hz · Alpha–Theta grounding" },
    alpha:    { name: "Alpha Calm Flow",      carrier: 216, beat: 10.0, band: "alpha", desc: "10.0 Hz · Relaxed serene awareness" },
    gamma:    { name: "Gamma Lucid Clarity",  carrier: 240, beat: 40.0, band: "gamma", desc: "40.0 Hz · Crisp meditative insight" },
  };

  // Live Muse 2 biofeedback
  const bio = {
    calm: 40,
    focus: 40,
    bpm: null,
    bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  };

  let running = false;
  let elapsedSec = 0;
  let targetSec = 600; // 10 min default
  let animTime = 0;
  let breathPhase = 0;

  // Web Audio Stereo Binaural + Ocean Rain + Singing Bowl Engine
  let ctx = null;
  let oscL = null, oscR = null;
  let binauralGain = null;
  let ambientGain = null;
  let bowlGain = null;
  let noiseSrc = null;
  let bowlOsc1 = null, bowlOsc2 = null;

  function startAudio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    stopAudioNodes();
    const p = PRESETS[ui.selPreset?.value || "theta"];
    const bVol = Number(ui.rngBinauralVol?.value ?? 0.25);
    const aVol = Number(ui.rngAmbientVol?.value ?? 0.22);

    // 1. Stereo Binaural Oscillators (Left = carrier, Right = carrier + beat)
    binauralGain = ctx.createGain();
    binauralGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    binauralGain.gain.linearRampToValueAtTime(bVol * 0.28, ctx.currentTime + 1.5);
    binauralGain.connect(ctx.destination);

    oscL = ctx.createOscillator();
    oscR = ctx.createOscillator();
    oscL.type = "sine";
    oscR.type = "sine";
    oscL.frequency.setValueAtTime(p.carrier, ctx.currentTime);
    oscR.frequency.setValueAtTime(p.carrier + p.beat, ctx.currentTime);

    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.setValueAtTime(-1, ctx.currentTime);
    panR.pan.setValueAtTime(1, ctx.currentTime);

    oscL.connect(panL).connect(binauralGain);
    oscR.connect(panR).connect(binauralGain);
    oscL.start();
    oscR.start();

    // 2. Soft Pink/Brown Ocean Wash (Filtered Noise)
    ambientGain = ctx.createGain();
    ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    ambientGain.gain.linearRampToValueAtTime(aVol * 0.22, ctx.currentTime + 2.0);
    ambientGain.connect(ctx.destination);

    const bufLen = ctx.sampleRate * 3;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 2.5;
    }
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(340, ctx.currentTime);
    noiseSrc.connect(lp).connect(ambientGain);
    noiseSrc.start();

    // 3. Warm Singing-Bowl Biofeedback Drone (swells gently with Calm)
    bowlGain = ctx.createGain();
    bowlGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    bowlGain.gain.linearRampToValueAtTime(aVol * 0.06, ctx.currentTime + 2.5);
    bowlGain.connect(ctx.destination);

    bowlOsc1 = ctx.createOscillator();
    bowlOsc2 = ctx.createOscillator();
    bowlOsc1.type = "sine";
    bowlOsc2.type = "sine";
    bowlOsc1.frequency.setValueAtTime(p.carrier * 0.5, ctx.currentTime);
    bowlOsc2.frequency.setValueAtTime(p.carrier * 0.75, ctx.currentTime);
    bowlOsc1.connect(bowlGain);
    bowlOsc2.connect(bowlGain);
    bowlOsc1.start();
    bowlOsc2.start();

    ringZenBell();
  }

  function stopAudioNodes() {
    [oscL, oscR, noiseSrc, bowlOsc1, bowlOsc2].forEach((n) => {
      try { n?.stop(); n?.disconnect(); } catch (_) {}
    });
    oscL = oscR = noiseSrc = bowlOsc1 = bowlOsc2 = null;
  }

  function stopAudio() {
    if (ctx && binauralGain) {
      try {
        binauralGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        if (ambientGain) ambientGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        if (bowlGain) bowlGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      } catch (_) {}
      setTimeout(stopAudioNodes, 400);
    } else {
      stopAudioNodes();
    }
  }

  function ringZenBell() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    [216, 432, 648.5].forEach((freq, idx) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now);
      const amp = idx === 0 ? 0.09 : idx === 1 ? 0.045 : 0.02;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(amp, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
      o.connect(g).connect(ctx.destination);
      o.start(now);
      o.stop(now + 4.3);
    });
  }

  function syncAudioParams() {
    const p = PRESETS[ui.selPreset?.value || "theta"];
    if (ui.freqReadout) {
      ui.freqReadout.textContent = `L ${p.carrier} Hz · R ${(p.carrier + p.beat).toFixed(2).replace(/\.00$/, "")} Hz (${p.beat} Hz beat)`;
    }
    if (!ctx || !running) return;
    const now = ctx.currentTime;
    const bVol = Number(ui.rngBinauralVol?.value ?? 0.25);
    const aVol = Number(ui.rngAmbientVol?.value ?? 0.22);
    oscL?.frequency.setTargetAtTime(p.carrier, now, 0.25);
    oscR?.frequency.setTargetAtTime(p.carrier + p.beat, now, 0.25);
    bowlOsc1?.frequency.setTargetAtTime(p.carrier * 0.5, now, 0.4);
    bowlOsc2?.frequency.setTargetAtTime(p.carrier * 0.75, now, 0.4);
    binauralGain?.gain.setTargetAtTime(bVol * 0.28, now, 0.15);
    ambientGain?.gain.setTargetAtTime(aVol * 0.22, now, 0.15);
  }

  // --- Cached Retina Canvas ---
  let cachedDims = null;
  function prepCanvas() {
    if (cachedDims) return cachedDims;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(240, Math.floor(rect.height));
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    cachedDims = { c, w, h };
    return cachedDims;
  }
  const invalidate = () => { cachedDims = null; };
  window.addEventListener("resize", invalidate);
  document.addEventListener("fullscreenchange", () => {
    invalidate();
    const isFull = !!document.fullscreenElement;
    ui.btnExitFull?.classList.toggle("hidden", !isFull);
  });
  document.querySelectorAll(".seg-tab").forEach((t) => t.addEventListener("click", invalidate));

  // --- Guided Breathing Cadence ---
  function computeBreath(t) {
    const mode = ui.selBreath?.value || "box";
    if (mode === "off") return { scale: 0.5 + 0.15 * Math.sin(t * 0.5), label: "" };
    if (mode === "478") {
      const cycle = t % 19;
      if (cycle < 4) return { scale: cycle / 4, label: `Inhale · ${Math.ceil(4 - cycle)}s` };
      if (cycle < 11) return { scale: 1.0, label: `Hold · ${Math.ceil(11 - cycle)}s` };
      return { scale: 1 - (cycle - 11) / 8, label: `Exhale · ${Math.ceil(19 - cycle)}s` };
    }
    // Box breathing 4-4-4-4
    const cycle = t % 16;
    if (cycle < 4) return { scale: cycle / 4, label: `Inhale · ${Math.ceil(4 - cycle)}s` };
    if (cycle < 8) return { scale: 1.0, label: `Hold · ${Math.ceil(8 - cycle)}s` };
    if (cycle < 12) return { scale: 1 - (cycle - 8) / 4, label: `Exhale · ${Math.ceil(12 - cycle)}s` };
    return { scale: 0.0, label: `Rest · ${Math.ceil(16 - cycle)}s` };
  }

  // --- 4 Animated Zen Scenes ---
  const stars = Array.from({ length: 65 }, () => ({
    x: Math.random(), y: Math.random() * 0.72, r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6.28,
  }));

  function drawScene(c, w, h, breath) {
    const scene = ui.selScene?.value || "aurora";
    const calmNorm = Math.min(1, bio.calm / 80);

    if (scene === "aurora") {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#040712");
      g.addColorStop(0.6, "#091224");
      g.addColorStop(1, "#0b1a2a");
      c.fillStyle = g; c.fillRect(0, 0, w, h);

      // Stars
      for (const s of stars) {
        const a = 0.25 + 0.65 * Math.abs(Math.sin(animTime * 0.7 + s.ph));
        c.fillStyle = `rgba(226, 232, 240, ${a})`;
        c.beginPath(); c.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); c.fill();
      }
      // Flowing Aurora Ribbons
      for (let r = 0; r < 3; r++) {
        c.beginPath();
        const baseY = h * (0.28 + r * 0.14);
        c.moveTo(0, baseY);
        for (let x = 0; x <= w; x += 24) {
          const y = baseY + Math.sin(x * 0.004 + animTime * (0.35 + r * 0.12) + r) * (34 + breath.scale * 22);
          c.lineTo(x, y);
        }
        c.lineTo(w, h); c.lineTo(0, h); c.closePath();
        const ag = c.createLinearGradient(0, baseY - 60, 0, baseY + 180);
        const col = r === 0 ? "48, 213, 200" : r === 1 ? "94, 92, 230" : "48, 209, 88";
        ag.addColorStop(0, `rgba(${col}, ${0.22 + calmNorm * 0.16})`);
        ag.addColorStop(1, `rgba(${col}, 0)`);
        c.fillStyle = ag;
        c.fill();
      }
    } else if (scene === "pond") {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#07101f"); g.addColorStop(0.55, "#0d2236"); g.addColorStop(1, "#071724");
      c.fillStyle = g; c.fillRect(0, 0, w, h);

      // Glowing Moon
      const mx = w * 0.5, my = h * 0.28;
      const mg = c.createRadialGradient(mx, my, 12, mx, my, 140);
      mg.addColorStop(0, "rgba(254, 249, 195, 0.85)");
      mg.addColorStop(0.35, "rgba(48, 213, 200, 0.22)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = mg; c.beginPath(); c.arc(mx, my, 140, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fef9c3"; c.beginPath(); c.arc(mx, my, 34, 0, Math.PI * 2); c.fill();

      // Expanding concentric pond ripples
      for (let i = 0; i < 5; i++) {
        const prog = ((animTime * 0.22 + i * 0.2) % 1);
        const rad = 25 + prog * Math.min(w, h) * 0.45;
        c.strokeStyle = `rgba(48, 213, 200, ${(1 - prog) * 0.45})`;
        c.lineWidth = 1.6;
        c.beginPath(); c.ellipse(w * 0.5, h * 0.7, rad, rad * 0.34, 0, 0, Math.PI * 2); c.stroke();
      }
    } else if (scene === "mandala") {
      c.fillStyle = "#080910"; c.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * (0.24 + breath.scale * 0.14);
      for (let ring = 3; ring >= 1; ring--) {
        const petals = ring * 8;
        const r = maxR * (ring / 3);
        c.save();
        c.translate(cx, cy);
        c.rotate(animTime * (ring % 2 === 0 ? 0.12 : -0.1));
        for (let i = 0; i < petals; i++) {
          c.save();
          c.rotate((i / petals) * Math.PI * 2);
          c.strokeStyle = ring === 1 ? "rgba(48, 213, 200, 0.65)" : ring === 2 ? "rgba(191, 90, 242, 0.5)" : "rgba(10, 132, 255, 0.4)";
          c.lineWidth = 1.5;
          c.beginPath(); c.ellipse(0, -r * 0.65, r * 0.18, r * 0.45, 0, 0, Math.PI * 2); c.stroke();
          c.restore();
        }
        c.restore();
      }
    } else {
      // Misty Mountain Dawn
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#17142b"); g.addColorStop(0.5, "#3a284b"); g.addColorStop(0.82, "#7c4a62"); g.addColorStop(1, "#1e1b2e");
      c.fillStyle = g; c.fillRect(0, 0, w, h);

      const sunR = 44 + breath.scale * 16;
      const sg = c.createRadialGradient(w * 0.5, h * 0.62, 8, w * 0.5, h * 0.62, sunR * 3);
      sg.addColorStop(0, "rgba(255, 198, 125, 0.75)");
      sg.addColorStop(1, "rgba(255, 159, 10, 0)");
      c.fillStyle = sg; c.beginPath(); c.arc(w * 0.5, h * 0.62, sunR * 3, 0, Math.PI * 2); c.fill();

      const layers = [
        { y: 0.64, amp: 55, col: "rgba(30, 27, 56, 0.55)", spd: 0.06 },
        { y: 0.74, amp: 42, col: "rgba(20, 20, 40, 0.78)", spd: 0.1 },
        { y: 0.85, amp: 28, col: "#0d0f1a", spd: 0.15 },
      ];
      layers.forEach((L, idx) => {
        c.fillStyle = L.col;
        c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= w + 30; x += 30) {
          const y = h * L.y - Math.sin(x * 0.005 + idx * 2 + animTime * L.spd) * L.amp - Math.cos(x * 0.011 + idx) * (L.amp * 0.4);
          c.lineTo(x, y);
        }
        c.lineTo(w, h); c.closePath(); c.fill();
      });
    }

    // Center Soft Breathing Orb (subtle guide)
    if ((ui.selBreath?.value || "box") !== "off") {
      const cx = w / 2, cy = h / 2;
      const r = 28 + breath.scale * 42;
      const og = c.createRadialGradient(cx, cy, 4, cx, cy, r * 1.4);
      og.addColorStop(0, "rgba(255, 255, 255, 0.28)");
      og.addColorStop(0.6, "rgba(48, 213, 200, 0.14)");
      og.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = og; c.beginPath(); c.arc(cx, cy, r * 1.4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(255, 255, 255, 0.35)";
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    }
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  function toggleSession() {
    running = !running;
    if (running) {
      elapsedSec = 0;
      targetSec = Number(ui.selTimer?.value || 600);
      startAudio();
      if (ui.btnPlay) { ui.btnPlay.textContent = "End Session"; ui.btnPlay.className = "btn danger small"; }
    } else {
      stopAudio();
      if (ui.btnPlay) { ui.btnPlay.textContent = "Start Meditation"; ui.btnPlay.className = "btn primary small"; }
    }
  }

  ui.btnPlay?.addEventListener("click", toggleSession);
  ui.btnBell?.addEventListener("click", ringZenBell);
  ui.selPreset?.addEventListener("change", syncAudioParams);
  ui.rngBinauralVol?.addEventListener("input", syncAudioParams);
  ui.rngAmbientVol?.addEventListener("input", syncAudioParams);

  ui.btnFull?.addEventListener("click", () => {
    if (!document.fullscreenElement) ui.stage?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });
  ui.btnExitFull?.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  });

  let lastTs = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    animTime += dt;

    const panel = document.getElementById("panel-meditation");
    if (panel && !panel.classList.contains("hidden")) {
      const { c, w, h } = prepCanvas();
      const breath = computeBreath(running ? elapsedSec : animTime);
      drawScene(c, w, h, breath);

      if (ui.breathPrompt) ui.breathPrompt.textContent = breath.label || "Breathe Naturally";

      if (running) {
        elapsedSec += dt;
        if (targetSec > 0) {
          const rem = Math.max(0, targetSec - elapsedSec);
          if (ui.timerReadout) ui.timerReadout.textContent = formatTime(rem);
          if (rem <= 0) {
            ringZenBell();
            toggleSession();
          }
        } else if (ui.timerReadout) {
          ui.timerReadout.textContent = formatTime(elapsedSec);
        }
      }
    }
    requestAnimationFrame(loop);
  }
  syncAudioParams();
  requestAnimationFrame(loop);

  window.BrainMuseumMeditation = {
    onFrame(frame) {
      const m = frame.metrics || {};
      bio.calm = m.calm || 0;
      bio.focus = m.focus || 0;
      bio.bpm = m.heart_rate_bpm;
      if (frame.bands && frame.bands.relative) bio.bands = frame.bands.relative;

      const p = PRESETS[ui.selPreset?.value || "theta"];
      const bandPct = Math.round(bio.bands[p.band] || 0);
      if (ui.bioReadout) {
        const bpmTxt = bio.bpm ? ` · ${Math.round(bio.bpm)} BPM` : "";
        ui.bioReadout.textContent = `Calm ${Math.round(bio.calm)} · ${p.band.toUpperCase()} ${bandPct}%${bpmTxt}`;
      }
      // Subtle biofeedback: singing-bowl drone warms gently as Calm rises
      if (running && ctx && bowlGain) {
        const aVol = Number(ui.rngAmbientVol?.value ?? 0.22);
        const swell = aVol * (0.03 + 0.08 * Math.min(1, bio.calm / 85));
        bowlGain.gain.setTargetAtTime(swell, ctx.currentTime, 0.6);
      }
    },
  };
})();
