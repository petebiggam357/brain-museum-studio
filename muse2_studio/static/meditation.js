/**
 * Brain Museum Studio — Zen Meditation & Enlightenment Sanctuary
 *
 * Features:
 * - True Stereo Binaural Beat Synthesizer (Static Presets, Multi-Stage Frequency Journeys, & Custom Carrier/Beat Hz)
 * - Live Muse 2 Biofeedback Weather (Ocean/Wind quiets with Calm, Singing Bowl warms, Stillness Chimes reward streaks)
 * - 6 Fullscreen-Capable Animated Zen Scenes (Aurora, Kyoto Pond, Mandala, Mountain Dawn, Temple Lanterns, Cosmic Flower of Life)
 * - Guided Breath Pacer (Box 4-4-4-4, 4-7-8, Coherent 5.5s, or Off) + Optional Contemplative Prompts & Interval Bells
 * - Post-Session Enlightenment Summary & Local Meditation Journal
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
    selIntervalBell: document.getElementById("sel-med-bell-int"),
    chkBioWeather: document.getElementById("chk-med-bio"),
    chkPrompts: document.getElementById("chk-med-prompts"),
    rngCarrier: document.getElementById("rng-med-carrier"),
    valCarrier: document.getElementById("val-med-carrier"),
    rngBeat: document.getElementById("rng-med-beat"),
    valBeat: document.getElementById("val-med-beat"),
    customWrap: document.getElementById("med-custom-wrap"),
    rngBinauralVol: document.getElementById("rng-med-binaural"),
    rngAmbientVol: document.getElementById("rng-med-ambient"),
    freqReadout: document.getElementById("med-freq-readout"),
    timerReadout: document.getElementById("med-timer-readout"),
    breathPrompt: document.getElementById("med-breath-prompt"),
    cueText: document.getElementById("med-cue-text"),
    bioReadout: document.getElementById("med-bio-readout"),
    summaryCard: document.getElementById("med-summary-card"),
    sumDuration: document.getElementById("med-sum-dur"),
    sumStillness: document.getElementById("med-sum-still"),
    sumStreak: document.getElementById("med-sum-streak"),
    sumChimes: document.getElementById("med-sum-chimes"),
    journalInput: document.getElementById("med-journal-note"),
    btnSaveJournal: document.getElementById("btn-med-save-journal"),
    journalList: document.getElementById("med-journal-list"),
  };

  const PRESETS = {
    gateway:  { name: "Journey: Gateway to Stillness", carrier: 216, beat: 10.0, band: "theta", journey: [[0.0, 12.0], [0.25, 8.0], [0.75, 5.5], [1.0, 10.0]] },
    nondual:  { name: "Journey: Non-Dual Insight",     carrier: 216, beat: 7.83, band: "alpha", journey: [[0.0, 10.0], [0.4, 4.5], [0.75, 40.0], [1.0, 10.0]] },
    sleep:    { name: "Journey: Deep Sleep Descent",   carrier: 174, beat: 6.0,  band: "delta", journey: [[0.0, 10.0], [0.4, 6.0], [1.0, 2.0]] },
    delta:    { name: "Delta Deep Rest",               carrier: 174, beat: 2.5,  band: "delta" },
    theta:    { name: "Theta Deep Meditation",         carrier: 196, beat: 6.0,  band: "theta" },
    schumann: { name: "Schumann Resonance",            carrier: 216, beat: 7.83, band: "theta" },
    alpha:    { name: "Alpha Calm Flow",               carrier: 216, beat: 10.0, band: "alpha" },
    gamma:    { name: "Gamma Lucid Clarity",           carrier: 256, beat: 40.0, band: "gamma" },
    custom:   { name: "Custom Solfeggio / Beat",       carrier: 216, beat: 7.83, band: "alpha" },
  };

  const CUES = [
    "Soften your jaw, shoulders, and forehead…",
    "Rest your attention lightly on the breath…",
    "Let thoughts pass like clouds across an open sky…",
    "Notice the quiet space between each breath…",
    "Simply witness — nothing to force, nowhere to go…",
    "Rest in luminous, effortless awareness…",
    "Gently return to the room with clarity and calm…",
  ];

  // Live Muse 2 biofeedback
  const bio = {
    calm: 40,
    focus: 40,
    bpm: null,
    bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
  };

  let running = false;
  let elapsedSec = 0;
  let targetSec = 600;
  let animTime = 0;
  let nextIntervalBellSec = 0;

  // Session analytics
  let calmSamples = 0;
  let stillSamples = 0;
  let currentStillStreak = 0;
  let bestStillStreak = 0;
  let chimesEarned = 0;
  let lastChimeSec = -10;
  let lastSessionStats = null;

  // Web Audio Nodes
  let ctx = null;
  let oscL = null, oscR = null;
  let binauralGain = null;
  let ambientGain = null;
  let bowlGain = null;
  let noiseSrc = null;
  let noiseFilter = null;
  let bowlOsc1 = null, bowlOsc2 = null;

  function currentFrequencies() {
    const key = ui.selPreset?.value || "gateway";
    const p = PRESETS[key] || PRESETS.theta;
    if (key === "custom") {
      return {
        carrier: Number(ui.rngCarrier?.value || 216),
        beat: Number(ui.rngBeat?.value || 7.83),
        band: "alpha",
      };
    }
    let beat = p.beat;
    if (p.journey && running) {
      const denom = targetSec > 0 ? targetSec : 600;
      const prog = Math.min(1, elapsedSec / denom);
      for (let i = 0; i < p.journey.length - 1; i++) {
        const [t0, f0] = p.journey[i];
        const [t1, f1] = p.journey[i + 1];
        if (prog >= t0 && prog <= t1) {
          const frac = (prog - t0) / Math.max(0.0001, t1 - t0);
          beat = f0 + (f1 - f0) * frac;
          break;
        }
      }
    }
    return { carrier: p.carrier, beat: Number(beat.toFixed(2)), band: p.band };
  }

  function startAudio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    stopAudioNodes();
    const { carrier, beat } = currentFrequencies();
    const bVol = Number(ui.rngBinauralVol?.value ?? 0.30);
    const aVol = Number(ui.rngAmbientVol?.value ?? 0.28);

    // 1. True Stereo Binaural Oscillators
    binauralGain = ctx.createGain();
    binauralGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    binauralGain.gain.linearRampToValueAtTime(bVol * 0.26, ctx.currentTime + 1.8);
    binauralGain.connect(ctx.destination);

    oscL = ctx.createOscillator();
    oscR = ctx.createOscillator();
    oscL.type = "sine";
    oscR.type = "sine";
    oscL.frequency.setValueAtTime(carrier, ctx.currentTime);
    oscR.frequency.setValueAtTime(carrier + beat, ctx.currentTime);

    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.setValueAtTime(-1, ctx.currentTime);
    panR.pan.setValueAtTime(1, ctx.currentTime);
    oscL.connect(panL).connect(binauralGain);
    oscR.connect(panR).connect(binauralGain);
    oscL.start();
    oscR.start();

    // 2. Biofeedback Ocean/Wind Wash
    ambientGain = ctx.createGain();
    ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    ambientGain.gain.linearRampToValueAtTime(aVol * 0.20, ctx.currentTime + 2.0);
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

    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(340, ctx.currentTime);
    noiseSrc.connect(noiseFilter).connect(ambientGain);
    noiseSrc.start();

    // 3. Harmonic Singing-Bowl Drone
    bowlGain = ctx.createGain();
    bowlGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    bowlGain.gain.linearRampToValueAtTime(aVol * 0.06, ctx.currentTime + 2.5);
    bowlGain.connect(ctx.destination);

    bowlOsc1 = ctx.createOscillator();
    bowlOsc2 = ctx.createOscillator();
    bowlOsc1.type = "sine";
    bowlOsc2.type = "sine";
    bowlOsc1.frequency.setValueAtTime(carrier * 0.5, ctx.currentTime);
    bowlOsc2.frequency.setValueAtTime(carrier * 0.75, ctx.currentTime);
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
        ambientGain?.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        bowlGain?.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
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
      g.gain.exponentialRampToValueAtTime(0.0001, now + 4.4);
      o.connect(g).connect(ctx.destination);
      o.start(now);
      o.stop(now + 4.5);
    });
  }

  function playStillnessChime() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [528, 660, 792, 1056];
    const f = notes[Math.floor(Math.random() * notes.length)];
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime((Math.random() - 0.5) * 1.2, now);
    o.type = "sine";
    o.frequency.setValueAtTime(f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.045, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    o.connect(pan).connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + 2.5);
  }

  function syncAudioParams() {
    const key = ui.selPreset?.value || "gateway";
    ui.customWrap?.classList.toggle("hidden", key !== "custom");
    if (ui.valCarrier) ui.valCarrier.textContent = `${ui.rngCarrier?.value || 216} Hz`;
    if (ui.valBeat) ui.valBeat.textContent = `${ui.rngBeat?.value || 7.83} Hz`;

    const { carrier, beat } = currentFrequencies();
    if (ui.freqReadout) {
      ui.freqReadout.textContent = `L ${carrier} Hz · R ${(carrier + beat).toFixed(2).replace(/\.00$/, "")} Hz (${beat} Hz beat)`;
    }
    if (!ctx || !running) return;
    const now = ctx.currentTime;
    const bVol = Number(ui.rngBinauralVol?.value ?? 0.30);
    const aVol = Number(ui.rngAmbientVol?.value ?? 0.28);
    oscL?.frequency.setTargetAtTime(carrier, now, 0.3);
    oscR?.frequency.setTargetAtTime(carrier + beat, now, 0.3);
    bowlOsc1?.frequency.setTargetAtTime(carrier * 0.5, now, 0.5);
    bowlOsc2?.frequency.setTargetAtTime(carrier * 0.75, now, 0.5);
    binauralGain?.gain.setTargetAtTime(bVol * 0.26, now, 0.15);
    if (!ui.chkBioWeather?.checked) {
      ambientGain?.gain.setTargetAtTime(aVol * 0.20, now, 0.2);
    }
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
    ui.btnExitFull?.classList.toggle("hidden", !document.fullscreenElement);
  });
  document.querySelectorAll(".seg-tab").forEach((t) => t.addEventListener("click", invalidate));

  // --- Guided Breathing Cadences ---
  function computeBreath(t) {
    const mode = ui.selBreath?.value || "coherent";
    if (mode === "off") return { scale: 0.5 + 0.12 * Math.sin(t * 0.45), label: "" };
    if (mode === "coherent") {
      // Heart-rate variability resonant breathing: 5.5s inhale / 5.5s exhale
      const cycle = t % 11.0;
      if (cycle < 5.5) return { scale: cycle / 5.5, label: `Inhale Gently · ${Math.ceil(5.5 - cycle)}s` };
      return { scale: 1 - (cycle - 5.5) / 5.5, label: `Exhale Slowly · ${Math.ceil(11.0 - cycle)}s` };
    }
    if (mode === "478") {
      const cycle = t % 19;
      if (cycle < 4) return { scale: cycle / 4, label: `Inhale · ${Math.ceil(4 - cycle)}s` };
      if (cycle < 11) return { scale: 1.0, label: `Hold · ${Math.ceil(11 - cycle)}s` };
      return { scale: 1 - (cycle - 11) / 8, label: `Exhale · ${Math.ceil(19 - cycle)}s` };
    }
    const cycle = t % 16;
    if (cycle < 4) return { scale: cycle / 4, label: `Inhale · ${Math.ceil(4 - cycle)}s` };
    if (cycle < 8) return { scale: 1.0, label: `Hold · ${Math.ceil(8 - cycle)}s` };
    if (cycle < 12) return { scale: 1 - (cycle - 8) / 4, label: `Exhale · ${Math.ceil(12 - cycle)}s` };
    return { scale: 0.0, label: `Rest · ${Math.ceil(16 - cycle)}s` };
  }

  // Scene particles
  const stars = Array.from({ length: 75 }, () => ({
    x: Math.random(), y: Math.random() * 0.8, r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6.28,
  }));
  const lanterns = Array.from({ length: 22 }, () => ({
    x: Math.random(), y: Math.random(), sz: 10 + Math.random() * 14, spd: 0.015 + Math.random() * 0.025, ph: Math.random() * 6.28,
  }));

  function drawScene(c, w, h, breath) {
    const scene = ui.selScene?.value || "aurora";
    const calmNorm = Math.min(1, bio.calm / 80);

    if (scene === "aurora") {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#040712"); g.addColorStop(0.6, "#091224"); g.addColorStop(1, "#0b1a2a");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (const s of stars) {
        const a = 0.25 + 0.65 * Math.abs(Math.sin(animTime * 0.7 + s.ph));
        c.fillStyle = `rgba(226, 232, 240, ${a})`;
        c.beginPath(); c.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); c.fill();
      }
      for (let r = 0; r < 3; r++) {
        c.beginPath();
        const baseY = h * (0.28 + r * 0.14);
        c.moveTo(0, baseY);
        for (let x = 0; x <= w; x += 24) {
          c.lineTo(x, baseY + Math.sin(x * 0.004 + animTime * (0.35 + r * 0.12) + r) * (34 + breath.scale * 22));
        }
        c.lineTo(w, h); c.lineTo(0, h); c.closePath();
        const ag = c.createLinearGradient(0, baseY - 60, 0, baseY + 180);
        const col = r === 0 ? "48, 213, 200" : r === 1 ? "94, 92, 230" : "48, 209, 88";
        ag.addColorStop(0, `rgba(${col}, ${0.22 + calmNorm * 0.16})`); ag.addColorStop(1, `rgba(${col}, 0)`);
        c.fillStyle = ag; c.fill();
      }
    } else if (scene === "pond") {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#07101f"); g.addColorStop(0.55, "#0d2236"); g.addColorStop(1, "#071724");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const mx = w * 0.5, my = h * 0.28;
      const mg = c.createRadialGradient(mx, my, 12, mx, my, 140);
      mg.addColorStop(0, "rgba(254, 249, 195, 0.85)"); mg.addColorStop(0.35, "rgba(48, 213, 200, 0.22)"); mg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = mg; c.beginPath(); c.arc(mx, my, 140, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fef9c3"; c.beginPath(); c.arc(mx, my, 34, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 5; i++) {
        const prog = ((animTime * 0.22 + i * 0.2) % 1);
        const rad = 25 + prog * Math.min(w, h) * 0.45;
        c.strokeStyle = `rgba(48, 213, 200, ${(1 - prog) * 0.45})`;
        c.lineWidth = 1.6; c.beginPath(); c.ellipse(w * 0.5, h * 0.7, rad, rad * 0.34, 0, 0, Math.PI * 2); c.stroke();
      }
    } else if (scene === "mandala") {
      c.fillStyle = "#080910"; c.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * (0.24 + breath.scale * 0.14);
      for (let ring = 3; ring >= 1; ring--) {
        const petals = ring * 8, r = maxR * (ring / 3);
        c.save(); c.translate(cx, cy); c.rotate(animTime * (ring % 2 === 0 ? 0.12 : -0.1));
        for (let i = 0; i < petals; i++) {
          c.save(); c.rotate((i / petals) * Math.PI * 2);
          c.strokeStyle = ring === 1 ? "rgba(48, 213, 200, 0.65)" : ring === 2 ? "rgba(191, 90, 242, 0.5)" : "rgba(10, 132, 255, 0.4)";
          c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, -r * 0.65, r * 0.18, r * 0.45, 0, 0, Math.PI * 2); c.stroke();
          c.restore();
        }
        c.restore();
      }
    } else if (scene === "lanterns") {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0b0816"); g.addColorStop(0.6, "#1f1326"); g.addColorStop(1, "#2d171c");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (const L of lanterns) {
        L.y -= L.spd * 0.016 * (0.8 + calmNorm * 0.8);
        if (L.y < -0.1) { L.y = 1.1; L.x = Math.random(); }
        const lx = L.x * w + Math.sin(animTime * 0.6 + L.ph) * 18;
        const ly = L.y * h;
        const glow = c.createRadialGradient(lx, ly, 2, lx, ly, L.sz * 2.6);
        glow.addColorStop(0, "rgba(255, 205, 112, 0.85)");
        glow.addColorStop(0.45, "rgba(255, 140, 40, 0.28)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = glow; c.beginPath(); c.arc(lx, ly, L.sz * 2.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#fde68a";
        c.beginPath(); c.roundRect(lx - L.sz * 0.4, ly - L.sz * 0.55, L.sz * 0.8, L.sz * 1.1, 4); c.fill();
      }
    } else if (scene === "flower") {
      c.fillStyle = "#05060d"; c.fillRect(0, 0, w, h);
      for (const s of stars) {
        c.fillStyle = `rgba(196, 181, 253, ${0.2 + 0.45 * Math.abs(Math.sin(animTime * 0.5 + s.ph))})`;
        c.beginPath(); c.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); c.fill();
      }
      // Sacred Flower of Life geometry breathing with Calm
      const cx = w / 2, cy = h / 2;
      const rad = Math.min(w, h) * (0.11 + breath.scale * 0.045);
      c.save(); c.translate(cx, cy); c.rotate(animTime * 0.05);
      c.strokeStyle = `rgba(191, 90, 242, ${0.35 + calmNorm * 0.45})`;
      c.lineWidth = 1.3;
      c.beginPath(); c.arc(0, 0, rad, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        c.beginPath(); c.arc(Math.cos(a) * rad, Math.sin(a) * rad, rad, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(Math.cos(a) * rad * 1.732, Math.sin(a) * rad * 1.732, rad, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    } else {
      // Misty Mountain Dawn
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#17142b"); g.addColorStop(0.5, "#3a284b"); g.addColorStop(0.82, "#7c4a62"); g.addColorStop(1, "#1e1b2e");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const sunR = 44 + breath.scale * 16;
      const sg = c.createRadialGradient(w * 0.5, h * 0.62, 8, w * 0.5, h * 0.62, sunR * 3);
      sg.addColorStop(0, "rgba(255, 198, 125, 0.75)"); sg.addColorStop(1, "rgba(255, 159, 10, 0)");
      c.fillStyle = sg; c.beginPath(); c.arc(w * 0.5, h * 0.62, sunR * 3, 0, Math.PI * 2); c.fill();
      [
        { y: 0.64, amp: 55, col: "rgba(30, 27, 56, 0.55)", spd: 0.06 },
        { y: 0.74, amp: 42, col: "rgba(20, 20, 40, 0.78)", spd: 0.1 },
        { y: 0.85, amp: 28, col: "#0d0f1a", spd: 0.15 },
      ].forEach((L, idx) => {
        c.fillStyle = L.col; c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= w + 30; x += 30) {
          c.lineTo(x, h * L.y - Math.sin(x * 0.005 + idx * 2 + animTime * L.spd) * L.amp - Math.cos(x * 0.011 + idx) * (L.amp * 0.4));
        }
        c.lineTo(w, h); c.closePath(); c.fill();
      });
    }

    // Center Soft Breathing Coherence Ring
    if ((ui.selBreath?.value || "coherent") !== "off") {
      const cx = w / 2, cy = h / 2;
      const r = 28 + breath.scale * 44;
      const og = c.createRadialGradient(cx, cy, 4, cx, cy, r * 1.45);
      og.addColorStop(0, "rgba(255, 255, 255, 0.28)");
      og.addColorStop(0.6, `rgba(48, 213, 200, ${0.12 + calmNorm * 0.14})`);
      og.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = og; c.beginPath(); c.arc(cx, cy, r * 1.45, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(255, 255, 255, 0.38)";
      c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    }
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  // Local Meditation Journal
  function renderJournal() {
    if (!ui.journalList) return;
    const entries = JSON.parse(localStorage.getItem("bms-med-journal") || "[]");
    ui.journalList.innerHTML = "";
    for (const e of entries.slice(0, 12)) {
      const li = document.createElement("li");
      li.innerHTML = `<span><strong>${e.preset}</strong> · ${e.duration} · Stillness ${e.stillnessPct}%${e.note ? ` — <em>"${e.note}"</em>` : ""}</span><span class="muted mono">${e.date}</span>`;
      ui.journalList.appendChild(li);
    }
  }
  renderJournal();

  function showSummary() {
    const stillnessPct = calmSamples > 0 ? Math.round((stillSamples / calmSamples) * 100) : 0;
    lastSessionStats = {
      preset: PRESETS[ui.selPreset?.value || "gateway"]?.name || "Meditation",
      duration: formatTime(elapsedSec),
      stillnessPct,
      bestStreak: `${bestStillStreak.toFixed(1)}s`,
      chimes: chimesEarned,
      date: new Date().toLocaleDateString(),
    };
    if (ui.sumDuration) ui.sumDuration.textContent = lastSessionStats.duration;
    if (ui.sumStillness) ui.sumStillness.textContent = `${stillnessPct}%`;
    if (ui.sumStreak) ui.sumStreak.textContent = lastSessionStats.bestStreak;
    if (ui.sumChimes) ui.sumChimes.textContent = String(chimesEarned);
    ui.summaryCard?.classList.remove("hidden");
  }

  ui.btnSaveJournal?.addEventListener("click", () => {
    if (!lastSessionStats) return;
    const entries = JSON.parse(localStorage.getItem("bms-med-journal") || "[]");
    entries.unshift({ ...lastSessionStats, note: (ui.journalInput?.value || "").trim() });
    localStorage.setItem("bms-med-journal", JSON.stringify(entries.slice(0, 50)));
    if (ui.journalInput) ui.journalInput.value = "";
    renderJournal();
  });

  function toggleSession() {
    running = !running;
    if (running) {
      elapsedSec = 0;
      targetSec = Number(ui.selTimer?.value || 600);
      const bellInt = Number(ui.selIntervalBell?.value || 0);
      nextIntervalBellSec = bellInt > 0 ? bellInt : 0;
      calmSamples = stillSamples = currentStillStreak = bestStillStreak = chimesEarned = 0;
      lastChimeSec = -10;
      ui.summaryCard?.classList.add("hidden");
      startAudio();
      if (ui.btnPlay) { ui.btnPlay.textContent = "End Session"; ui.btnPlay.className = "btn danger small"; }
    } else {
      stopAudio();
      if (ui.btnPlay) { ui.btnPlay.textContent = "Start Meditation"; ui.btnPlay.className = "btn primary small"; }
      if (elapsedSec >= 5) showSummary();
    }
  }

  ui.btnPlay?.addEventListener("click", toggleSession);
  ui.btnBell?.addEventListener("click", ringZenBell);
  ui.selPreset?.addEventListener("change", syncAudioParams);
  ui.rngCarrier?.addEventListener("input", syncAudioParams);
  ui.rngBeat?.addEventListener("input", syncAudioParams);
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
      if (ui.cueText) {
        if (running && ui.chkPrompts?.checked) {
          const cueIdx = Math.floor(elapsedSec / 25) % CUES.length;
          ui.cueText.textContent = CUES[cueIdx];
        } else {
          ui.cueText.textContent = "";
        }
      }

      if (running) {
        elapsedSec += dt;
        // Live journey frequency ramp
        syncAudioParams();

        // Interval bell
        const bellInt = Number(ui.selIntervalBell?.value || 0);
        if (bellInt > 0 && nextIntervalBellSec > 0 && elapsedSec >= nextIntervalBellSec) {
          ringZenBell();
          nextIntervalBellSec += bellInt;
        }

        // Stillness analytics & biofeedback chimes
        calmSamples += 1;
        if (bio.calm >= 52) {
          stillSamples += 1;
          currentStillStreak += dt;
          if (currentStillStreak > bestStillStreak) bestStillStreak = currentStillStreak;
          if (currentStillStreak >= 5.0 && (elapsedSec - lastChimeSec) >= 9.0 && ui.chkBioWeather?.checked) {
            lastChimeSec = elapsedSec;
            chimesEarned += 1;
            playStillnessChime();
          }
        } else {
          currentStillStreak = 0;
        }

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

      const { band } = currentFrequencies();
      const bandPct = Math.round(bio.bands[band] || 0);
      if (ui.bioReadout) {
        const bpmTxt = bio.bpm ? ` · ${Math.round(bio.bpm)} BPM` : "";
        ui.bioReadout.textContent = `Calm ${Math.round(bio.calm)} · ${band.toUpperCase()} ${bandPct}%${bpmTxt}`;
      }

      // Live Biofeedback Weather: ocean/wind softens as Calm rises, singing bowl warms
      if (running && ctx && ui.chkBioWeather?.checked) {
        const aVol = Number(ui.rngAmbientVol?.value ?? 0.28);
        const calmNorm = Math.min(1, bio.calm / 85);
        const windLevel = aVol * (0.30 - 0.20 * calmNorm);
        const bowlLevel = aVol * (0.03 + 0.09 * calmNorm);
        ambientGain?.gain.setTargetAtTime(Math.max(0.01, windLevel), ctx.currentTime, 0.5);
        noiseFilter?.frequency.setTargetAtTime(520 - 300 * calmNorm, ctx.currentTime, 0.5);
        bowlGain?.gain.setTargetAtTime(bowlLevel, ctx.currentTime, 0.6);
      }
    },
  };
})();
