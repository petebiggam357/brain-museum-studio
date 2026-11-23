/**
 * Brain Museum Studio+ — Neuro-Synth (Brain-to-Music + Web MIDI Out),
 * Smart Home Ambient Triggers, & 2-Headband Co-Meditation / Focus Tug-of-War
 */
(() => {
  const ui = {
    // Neuro-Synth
    btnSynthToggle: document.getElementById("btn-synth-toggle"),
    selSynthScale: document.getElementById("sel-synth-scale"),
    rngSynthVol: document.getElementById("rng-synth-vol"),
    synthNoteReadout: document.getElementById("synth-note-readout"),
    btnMidiInit: document.getElementById("btn-midi-init"),
    selMidiOut: document.getElementById("sel-midi-out"),
    midiStatus: document.getElementById("midi-status"),
    // Smart Home Ambient Bridge
    inpHomeCalm: document.getElementById("inp-home-calm"),
    inpHomeFocus: document.getElementById("inp-home-focus"),
    btnHomeArm: document.getElementById("btn-home-arm"),
    btnHomeTestCalm: document.getElementById("btn-home-test-calm"),
    btnHomeTestFocus: document.getElementById("btn-home-test-focus"),
    homeStatus: document.getElementById("home-status"),
    // Co-Meditation & 2-Player Focus Tug-of-War
    inpPeerWs: document.getElementById("inp-peer-ws"),
    btnPeerConnect: document.getElementById("btn-peer-connect"),
    btnPeerDemo: document.getElementById("btn-peer-demo"),
    peerStatus: document.getElementById("peer-status"),
    syncVal: document.getElementById("peer-sync-val"),
    syncBar: document.getElementById("peer-sync-bar"),
    tugBar: document.getElementById("peer-tug-bar"),
    tugReadout: document.getElementById("peer-tug-readout"),
  };

  // --- 1. NEURO-SYNTH (Web Audio Generative Brain-to-Music + Web MIDI Out) ---
  const SCALES = {
    pentatonic: { name: "C Major Pentatonic", midi: [60, 62, 64, 67, 69, 72, 74, 76, 79] },
    minor:      { name: "A Minor Ambient",    midi: [57, 60, 62, 64, 67, 69, 72, 74, 76] },
    dorian:     { name: "Dorian Dream",       midi: [62, 64, 65, 67, 69, 71, 72, 74, 76] },
    lydian:     { name: "Lydian Cosmic",      midi: [60, 62, 64, 66, 67, 69, 71, 72, 74] },
    zen432:     { name: "432 Hz Zen",         midi: [57, 60, 62, 64, 67, 69, 72, 76, 79], tune: 432 },
  };
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function midiToFreq(m, a4 = 440) {
    return a4 * Math.pow(2, (m - 69) / 12);
  }
  function midiToName(m) {
    return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
  }

  let synthOn = false;
  let audioCtx = null;
  let padFilter = null;
  let padGain = null;
  let padOscs = [];
  let arpTimer = null;
  let arpStep = 0;

  let midiAccess = null;
  let activeMidiOut = null;

  const live = { focus: 40, calm: 40, alpha: 25, theta: 20, beta: 20 };

  function sendMidiNote(note, vel = 80, durMs = 350) {
    if (!activeMidiOut) return;
    try {
      activeMidiOut.send([0x90, note & 0x7f, vel & 0x7f]);
      setTimeout(() => { try { activeMidiOut?.send([0x80, note & 0x7f, 0]); } catch (_) {} }, durMs);
    } catch (_) {}
  }

  function sendMidiCC(cc, norm01) {
    if (!activeMidiOut) return;
    try {
      const val = Math.max(0, Math.min(127, Math.round(norm01 * 127)));
      activeMidiOut.send([0xb0, cc & 0x7f, val]);
    } catch (_) {}
  }

  function playSynthNote(midiNote, dur = 0.7, vol = 0.08, type = "triangle") {
    if (!audioCtx) return;
    const sc = SCALES[ui.selSynthScale?.value || "pentatonic"];
    const freq = midiToFreq(midiNote, sc.tune || 440);
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol * Number(ui.rngSynthVol?.value ?? 0.5), now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(padFilter || audioCtx.destination);
    o.start(now);
    o.stop(now + dur + 0.05);
    if (ui.synthNoteReadout) ui.synthNoteReadout.textContent = `Note: ${midiToName(midiNote)} · Filter: ${Math.round(350 + live.alpha * 40)} Hz`;
    sendMidiNote(midiNote, Math.round(55 + live.focus * 0.6), dur * 700);
  }

  function startSynth() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    stopSynthNodes();

    padFilter = audioCtx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.setValueAtTime(800, audioCtx.currentTime);
    padFilter.connect(audioCtx.destination);

    padGain = audioCtx.createGain();
    padGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    padGain.gain.linearRampToValueAtTime(0.045 * Number(ui.rngSynthVol?.value ?? 0.5), audioCtx.currentTime + 1.2);
    padGain.connect(padFilter);

    const sc = SCALES[ui.selSynthScale?.value || "pentatonic"];
    [sc.midi[0] - 12, sc.midi[2] - 12, sc.midi[4] - 12].forEach((m) => {
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(midiToFreq(m, sc.tune || 440), audioCtx.currentTime);
      o.connect(padGain);
      o.start();
      padOscs.push(o);
    });

    function scheduleArp() {
      if (!synthOn) return;
      const scale = SCALES[ui.selSynthScale?.value || "pentatonic"];
      // Higher focus selects higher, brighter notes & faster arpeggio
      const idx = (arpStep + Math.floor((live.focus / 100) * 4)) % scale.midi.length;
      arpStep += 1;
      playSynthNote(scale.midi[idx], 0.65, 0.08, "triangle");
      const intervalMs = Math.max(240, 820 - live.focus * 5.2);
      arpTimer = setTimeout(scheduleArp, intervalMs);
    }
    scheduleArp();
  }

  function stopSynthNodes() {
    if (arpTimer) { clearTimeout(arpTimer); arpTimer = null; }
    padOscs.forEach((o) => { try { o.stop(); o.disconnect(); } catch (_) {} });
    padOscs = [];
  }

  ui.btnSynthToggle?.addEventListener("click", () => {
    synthOn = !synthOn;
    if (synthOn) {
      startSynth();
      ui.btnSynthToggle.textContent = "Stop Neuro-Synth";
      ui.btnSynthToggle.className = "btn danger small";
    } else {
      stopSynthNodes();
      ui.btnSynthToggle.textContent = "Start Neuro-Synth";
      ui.btnSynthToggle.className = "btn primary small";
    }
  });

  ui.btnMidiInit?.addEventListener("click", async () => {
    if (!navigator.requestMIDIAccess) {
      if (ui.midiStatus) ui.midiStatus.textContent = "Web MIDI not supported in this browser";
      return;
    }
    try {
      midiAccess = await navigator.requestMIDIAccess();
      ui.selMidiOut.innerHTML = `<option value="">None (Internal Web Audio)</option>`;
      for (const out of midiAccess.outputs.values()) {
        const opt = document.createElement("option");
        opt.value = out.id;
        opt.textContent = out.name || out.id;
        ui.selMidiOut.appendChild(opt);
      }
      if (ui.midiStatus) ui.midiStatus.textContent = `${midiAccess.outputs.size} MIDI output(s) found`;
    } catch (e) {
      if (ui.midiStatus) ui.midiStatus.textContent = `MIDI error: ${e.message}`;
    }
  });

  ui.selMidiOut?.addEventListener("change", () => {
    activeMidiOut = midiAccess?.outputs.get(ui.selMidiOut.value) || null;
  });

  // --- 2. SMART HOME AMBIENT BRIDGE (Home Assistant / Webhook Scenes) ---
  let homeArmed = false;
  let calmHoldStart = 0;
  let focusHoldStart = 0;
  let lastHomeFireTs = 0;

  if (ui.inpHomeCalm) ui.inpHomeCalm.value = localStorage.getItem("bms-home-calm") || "";
  if (ui.inpHomeFocus) ui.inpHomeFocus.value = localStorage.getItem("bms-home-focus") || "";
  ui.inpHomeCalm?.addEventListener("change", () => localStorage.setItem("bms-home-calm", ui.inpHomeCalm.value));
  ui.inpHomeFocus?.addEventListener("change", () => localStorage.setItem("bms-home-focus", ui.inpHomeFocus.value));

  async function fireWebhook(url, stateName) {
    if (!url || !url.startsWith("http")) {
      if (ui.homeStatus) ui.homeStatus.textContent = `Set a valid http(s) webhook URL for ${stateName}`;
      return;
    }
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateName, calm: live.calm, focus: live.focus, source: "brain-museum-studio" }),
      });
      if (ui.homeStatus) ui.homeStatus.textContent = `Fired ${stateName} scene at ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      if (ui.homeStatus) ui.homeStatus.textContent = `Webhook error: ${e.message}`;
    }
  }

  ui.btnHomeArm?.addEventListener("click", () => {
    homeArmed = !homeArmed;
    ui.btnHomeArm.textContent = homeArmed ? "Ambient Scenes: ARMED" : "Ambient Scenes: SAFE";
    ui.btnHomeArm.className = homeArmed ? "btn good small" : "btn danger small";
  });
  ui.btnHomeTestCalm?.addEventListener("click", () => fireWebhook(ui.inpHomeCalm?.value, "deep_calm"));
  ui.btnHomeTestFocus?.addEventListener("click", () => fireWebhook(ui.inpHomeFocus?.value, "deep_focus"));

  // --- 3. CO-MEDITATION SYNCHRONY & 2-PLAYER FOCUS TUG-OF-WAR ---
  let peerWs = null;
  let peerDemo = false;
  const peer = { calm: 45, focus: 45, connected: false };

  function updateCoMedUI() {
    if (!peer.connected && !peerDemo) return;
    if (peerDemo) {
      const t = performance.now() / 1000;
      peer.calm = 48 + Math.sin(t * 0.4) * 20;
      peer.focus = 46 + Math.cos(t * 0.5) * 22;
    }
    // Brain-to-Brain Synchrony % (100 - average divergence of Calm & Focus)
    const diff = (Math.abs(live.calm - peer.calm) + Math.abs(live.focus - peer.focus)) / 2;
    const syncPct = Math.max(0, Math.min(100, Math.round(100 - diff * 1.4)));
    if (ui.syncVal) ui.syncVal.textContent = `${syncPct}%`;
    if (ui.syncBar) ui.syncBar.style.width = `${syncPct}%`;

    // 2-Player Focus Tug-of-War (0% = Partner winning, 50% = Tie, 100% = You winning)
    const tugPct = Math.max(5, Math.min(95, 50 + (live.focus - peer.focus) * 0.8));
    if (ui.tugBar) ui.tugBar.style.left = `${tugPct}%`;
    if (ui.tugReadout) ui.tugReadout.textContent = `You ${Math.round(live.focus)} vs Partner ${Math.round(peer.focus)}`;
  }

  ui.btnPeerConnect?.addEventListener("click", () => {
    peerDemo = false;
    if (peerWs) { peerWs.close(); peerWs = null; }
    const url = ui.inpPeerWs?.value.trim();
    if (!url) return;
    try {
      peerWs = new WebSocket(url);
      if (ui.peerStatus) ui.peerStatus.textContent = "Connecting to partner...";
      peerWs.onopen = () => { peer.connected = true; if (ui.peerStatus) ui.peerStatus.textContent = `Linked: ${url}`; };
      peerWs.onmessage = (e) => {
        const f = JSON.parse(e.data);
        if (f.metrics) { peer.calm = f.metrics.calm || 0; peer.focus = f.metrics.focus || 0; }
      };
      peerWs.onclose = () => { peer.connected = false; if (ui.peerStatus) ui.peerStatus.textContent = "Partner disconnected"; };
    } catch (e) {
      if (ui.peerStatus) ui.peerStatus.textContent = `Error: ${e.message}`;
    }
  });

  ui.btnPeerDemo?.addEventListener("click", () => {
    if (peerWs) { peerWs.close(); peerWs = null; }
    peerDemo = !peerDemo;
    if (ui.peerStatus) ui.peerStatus.textContent = peerDemo ? "Demo Partner Active" : "Not connected";
  });

  // --- Live Telemetry Hook ---
  window.BrainMuseumPlus = {
    onFrame(frame) {
      if (frame.metrics) { live.focus = frame.metrics.focus || 0; live.calm = frame.metrics.calm || 0; }
      if (frame.bands?.relative) {
        live.alpha = frame.bands.relative.alpha || 0;
        live.theta = frame.bands.relative.theta || 0;
        live.beta = frame.bands.relative.beta || 0;
      }

      if (synthOn && audioCtx && padFilter) {
        const cutoff = Math.max(240, Math.min(3600, 350 + live.alpha * 42));
        padFilter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.25);
        sendMidiCC(74, live.alpha / 80);
        sendMidiCC(1, live.focus / 100);
        for (const ev of frame.events || []) {
          if (ev.kind === "blink" || ev.kind === "jaw_clench") {
            const sc = SCALES[ui.selSynthScale?.value || "pentatonic"];
            playSynthNote(sc.midi[sc.midi.length - 1] + 12, 0.9, 0.07, "sine");
          }
        }
      }

      if (homeArmed) {
        const now = performance.now();
        if (now - lastHomeFireTs > 20000) {
          if (live.calm >= 65) {
            if (!calmHoldStart) calmHoldStart = now;
            else if (now - calmHoldStart > 8000) { lastHomeFireTs = now; calmHoldStart = 0; fireWebhook(ui.inpHomeCalm?.value, "deep_calm"); }
          } else calmHoldStart = 0;

          if (live.focus >= 65) {
            if (!focusHoldStart) focusHoldStart = now;
            else if (now - focusHoldStart > 8000) { lastHomeFireTs = now; focusHoldStart = 0; fireWebhook(ui.inpHomeFocus?.value, "deep_focus"); }
          } else focusHoldStart = 0;
        }
      }

      updateCoMedUI();
    },
  };
})();
