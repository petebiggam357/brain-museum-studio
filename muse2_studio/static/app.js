(() => {
  const CHANNELS = ["TP9", "AF7", "AF8", "TP10"];
  const CH_COLORS = {
    TP9: "#0a84ff",
    AF7: "#30d158",
    AF8: "#ff9f0a",
    TP10: "#bf5af2",
  };

  const EEG_BUF_LEN = 512;
  const PPG_BUF_LEN = 256;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34; // r = 34

  const eegBuf = Object.fromEntries(CHANNELS.map((c) => [c, new Array(EEG_BUF_LEN).fill(0)]));
  const ppgBuf = new Array(PPG_BUF_LEN).fill(0);
  let fftSpectrum = new Array(45).fill(-3);

  const el = {
    dot: document.getElementById("conn-dot"),
    status: document.getElementById("conn-status"),
    mlLivePill: document.getElementById("ml-live-pill"),
    btnEmergencyStop: document.getElementById("btn-emergency-stop"),
    btnScan: document.getElementById("btn-scan"),
    bleSelect: document.getElementById("ble-select"),
    btnConnectBle: document.getElementById("btn-connect-ble"),
    btnSim: document.getElementById("btn-sim"),
    btnDisconnect: document.getElementById("btn-disconnect"),
    btnTheme: document.getElementById("btn-theme"),
    btnHelp: document.getElementById("btn-help"),
    btnHelpClose: document.getElementById("btn-help-close"),
    helpModal: document.getElementById("help-modal"),
    icoSun: document.getElementById("ico-sun"),
    icoMoon: document.getElementById("ico-moon"),
    simBar: document.getElementById("sim-bar"),
    btnSimBlink: document.getElementById("btn-sim-blink"),
    btnSimJaw: document.getElementById("btn-sim-jaw"),
    selNotch: document.getElementById("sel-notch"),
    chkBandpass: document.getElementById("chk-bandpass"),
    eegCanvas: document.getElementById("eeg-canvas"),
    fftCanvas: document.getElementById("fft-canvas"),
    ppgCanvas: document.getElementById("ppg-canvas"),
    horseshoe: document.getElementById("horseshoe"),
    rmsReadout: document.getElementById("rms-readout"),
    battery: document.getElementById("battery-readout"),
    focus: document.getElementById("val-focus"),
    calm: document.getElementById("val-calm"),
    ringFocus: document.getElementById("ring-focus"),
    ringCalm: document.getElementById("ring-calm"),
    bpm: document.getElementById("val-bpm"),
    imu: document.getElementById("imu-readout"),
    eventLog: document.getElementById("event-log"),
    markerInput: document.getElementById("marker-input"),
    btnMarker: document.getElementById("btn-marker"),
    recLabel: document.getElementById("rec-label"),
    btnRecord: document.getElementById("btn-record"),
    recStatus: document.getElementById("rec-status"),
    recList: document.getElementById("rec-list"),
    // BCI
    bciNavBadge: document.getElementById("bci-nav-badge"),
    bciCaps: document.getElementById("bci-caps"),
    btnBciArm: document.getElementById("btn-bci-arm"),
    bciTrigger: document.getElementById("bci-trigger"),
    bciAction: document.getElementById("bci-action"),
    bciTarget: document.getElementById("bci-target"),
    bciCooldown: document.getElementById("bci-cooldown"),
    btnBciAdd: document.getElementById("btn-bci-add"),
    bciRulesList: document.getElementById("bci-rules-list"),
    bciHistory: document.getElementById("bci-history"),
    // OSC
    oscNavBadge: document.getElementById("osc-nav-badge"),
    oscStatusBadge: document.getElementById("osc-status-badge"),
    oscHost: document.getElementById("osc-host"),
    oscPort: document.getElementById("osc-port"),
    btnOscToggle: document.getElementById("btn-osc-toggle"),
    oscPackets: document.getElementById("osc-packets"),
    // ML
    mlLabel: document.getElementById("ml-label"),
    btnMlCapture: document.getElementById("btn-ml-capture"),
    btnMlBurst: document.getElementById("btn-ml-burst"),
    btnMlTrain: document.getElementById("btn-ml-train"),
    btnMlClear: document.getElementById("btn-ml-clear"),
    mlDatasetSummary: document.getElementById("ml-dataset-summary"),
    mlHint: document.getElementById("ml-hint"),
    mlCountsList: document.getElementById("ml-counts-list"),
    mlAccuracyBadge: document.getElementById("ml-accuracy-badge"),
    mlPredLabel: document.getElementById("ml-pred-label"),
    mlPredConf: document.getElementById("ml-pred-conf"),
    mlProbsContainer: document.getElementById("ml-probs-container"),
    // Neuro Lab
    btnLabCal: document.getElementById("btn-lab-cal"),
    chkLabAudio: document.getElementById("chk-lab-audio"),
    rngLabThresh: document.getElementById("rng-lab-thresh"),
    valLabThresh: document.getElementById("val-lab-thresh"),
    labEnvBadge: document.getElementById("lab-env-badge"),
    labCalWrap: document.getElementById("lab-cal-wrap"),
    labCalFill: document.getElementById("lab-cal-fill"),
    labZoneBadge: document.getElementById("lab-zone-badge"),
    labOrbCanvas: document.getElementById("lab-orb-canvas"),
    labStreak: document.getElementById("lab-streak"),
    labBestStreak: document.getElementById("lab-best-streak"),
    labBaseline: document.getElementById("lab-baseline"),
    chkCursorOn: document.getElementById("chk-cursor-on"),
    chkFocusClutch: document.getElementById("chk-focus-clutch"),
    chkInvertY: document.getElementById("chk-invert-y"),
    selClickTrigger: document.getElementById("sel-click-trigger"),
    btnCursorRecenter: document.getElementById("btn-cursor-recenter"),
    btnOsMouseArm: document.getElementById("btn-os-mouse-arm"),
    labClutchState: document.getElementById("lab-clutch-state"),
    labGyroLive: document.getElementById("lab-gyro-live"),
    labLastAction: document.getElementById("lab-last-action"),
    labCursorCanvas: document.getElementById("lab-cursor-canvas"),
    labHits: document.getElementById("lab-hits"),
    rngCursorSens: document.getElementById("rng-cursor-sens"),
    labOsHint: document.getElementById("lab-os-hint"),
    selKbdTrigger: document.getElementById("sel-kbd-trigger"),
    selKbdSpeed: document.getElementById("sel-kbd-speed"),
    btnKbdToggle: document.getElementById("btn-kbd-toggle"),
    btnKbdSpeak: document.getElementById("btn-kbd-speak"),
    btnKbdClear: document.getElementById("btn-kbd-clear"),
    btnOsKbdArm: document.getElementById("btn-os-kbd-arm"),
    kbdOutput: document.getElementById("kbd-output"),
    kbdPhaseBadge: document.getElementById("kbd-phase-badge"),
    bciKeyboard: document.getElementById("bci-keyboard"),
  };

  let isRecording = false;
  let bciArmed = false;
  let oscEnabled = false;
  let osMouseArmed = false;
  let osKeyboardArmed = false;

  // Neuro Lab live state
  let latestFocus = 0;
  let labState = {
    focus_threshold: 50,
    in_zone: false,
    cursor: { x: 0.5, y: 0.5, enabled: false, clutch_active: true },
  };
  let orbSmoothY = 0.78;
  let targetPos = { x: 0.35 + Math.random() * 0.3, y: 0.3 + Math.random() * 0.4 };
  let targetHits = 0;
  let clickFlashAlpha = 0;
  let dwellStartTs = 0;
  let lastClickTs = 0;
  let prevInZone = false;

  // Gentle Web Audio Harmonic Feedback for Neurofeedback "In-Zone"
  let audioCtx = null;
  let lastChimeTs = 0;
  function playChime(freq = 528) {
    if (!el.chkLabAudio.checked) return;
    const now = performance.now();
    if (now - lastChimeTs < 900) return;
    lastChimeTs = now;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.09, audioCtx.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.75);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch (_) {}
  }

  // Brainwave Virtual Keyboard (Row-Column BCI Speller)
  const KBD_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M", "⌫"],
    ["SPACE", "CLEAR", "SPEAK"],
  ];
  let kbdRunning = false;
  let kbdPhase = "idle"; // "idle" | "row" | "col"
  let kbdRowIdx = 0;
  let kbdColIdx = 0;
  let kbdTimer = null;
  let lastKbdSelectTs = 0;

  function buildKeyboard() {
    el.bciKeyboard.innerHTML = "";
    KBD_ROWS.forEach((row, rIdx) => {
      const rowDiv = document.createElement("div");
      rowDiv.className = "kbd-row";
      rowDiv.dataset.row = String(rIdx);
      row.forEach((key, cIdx) => {
        const btn = document.createElement("button");
        btn.className = "kbd-key" + (key.length > 1 ? " wide" : "");
        btn.textContent = key;
        btn.dataset.row = String(rIdx);
        btn.dataset.col = String(cIdx);
        btn.addEventListener("click", () => commitKey(key, btn));
        rowDiv.appendChild(btn);
      });
      el.bciKeyboard.appendChild(rowDiv);
    });
  }
  buildKeyboard();

  function updateKeyboardHighlights() {
    el.bciKeyboard.querySelectorAll(".kbd-row").forEach((rEl) => {
      const r = Number(rEl.dataset.row);
      rEl.classList.toggle("row-scan", kbdRunning && kbdPhase === "row" && r === kbdRowIdx);
      rEl.classList.toggle("row-locked", kbdRunning && kbdPhase === "col" && r === kbdRowIdx);
    });
    el.bciKeyboard.querySelectorAll(".kbd-key").forEach((kEl) => {
      const r = Number(kEl.dataset.row);
      const c = Number(kEl.dataset.col);
      kEl.classList.toggle("key-scan", kbdRunning && kbdPhase === "col" && r === kbdRowIdx && c === kbdColIdx);
    });
    el.kbdPhaseBadge.textContent = !kbdRunning
      ? "Idle"
      : kbdPhase === "row"
        ? `Scanning Row ${kbdRowIdx + 1}`
        : `Row ${kbdRowIdx + 1} · Key ${KBD_ROWS[kbdRowIdx][kbdColIdx]}`;
  }

  function commitKey(key, btnEl = null) {
    if (btnEl) {
      btnEl.classList.add("key-flash");
      setTimeout(() => btnEl.classList.remove("key-flash"), 220);
    }
    playChime(660);
    if (key === "SPACE") {
      el.kbdOutput.value += " ";
      if (osKeyboardArmed) api("/api/lab/type", "POST", { text: " " }).catch(() => {});
    } else if (key === "⌫") {
      el.kbdOutput.value = el.kbdOutput.value.slice(0, -1);
    } else if (key === "CLEAR") {
      el.kbdOutput.value = "";
    } else if (key === "SPEAK") {
      if ("speechSynthesis" in window && el.kbdOutput.value.trim()) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(el.kbdOutput.value));
      }
    } else {
      el.kbdOutput.value += key;
      if (osKeyboardArmed) api("/api/lab/type", "POST", { text: key }).catch(() => {});
    }
  }

  function triggerKeyboardSelection() {
    if (!kbdRunning) return;
    const now = performance.now();
    if (now - lastKbdSelectTs < 700) return;
    lastKbdSelectTs = now;

    if (kbdPhase === "row") {
      kbdPhase = "col";
      kbdColIdx = 0;
      playChime(528);
      updateKeyboardHighlights();
    } else if (kbdPhase === "col") {
      const key = KBD_ROWS[kbdRowIdx][kbdColIdx];
      const btnEl = el.bciKeyboard.querySelector(`.kbd-key[data-row="${kbdRowIdx}"][data-col="${kbdColIdx}"]`);
      commitKey(key, btnEl);
      kbdPhase = "row";
      kbdRowIdx = (kbdRowIdx + 1) % KBD_ROWS.length;
      updateKeyboardHighlights();
    }
  }

  function startStopKeyboard(run) {
    kbdRunning = run;
    if (kbdTimer) {
      clearInterval(kbdTimer);
      kbdTimer = null;
    }
    el.btnKbdToggle.textContent = run ? "Stop Scanner" : "Start Scanner";
    el.btnKbdToggle.className = run ? "btn danger small" : "btn primary small";
    if (!run) {
      kbdPhase = "idle";
      updateKeyboardHighlights();
      return;
    }
    kbdPhase = "row";
    kbdRowIdx = 0;
    kbdColIdx = 0;
    updateKeyboardHighlights();
    const stepMs = Number(el.selKbdSpeed.value) || 1300;
    kbdTimer = setInterval(() => {
      if (kbdPhase === "row") {
        kbdRowIdx = (kbdRowIdx + 1) % KBD_ROWS.length;
      } else if (kbdPhase === "col") {
        kbdColIdx = (kbdColIdx + 1) % KBD_ROWS[kbdRowIdx].length;
      }
      updateKeyboardHighlights();
    }, stepMs);
  }

  function fireCursorClick() {
    const now = performance.now();
    if (now - lastClickTs < 1500) return; // 1.5s safety cooldown prevents rapid click storms
    lastClickTs = now;
    clickFlashAlpha = 1.0;
    const cx = labState.cursor.x;
    const cy = labState.cursor.y;
    const dist = Math.hypot(cx - targetPos.x, cy - targetPos.y);
    if (dist < 0.095) {
      targetHits += 1;
      el.labHits.textContent = String(targetHits);
      playChime(784);
      targetPos = { x: 0.14 + Math.random() * 0.72, y: 0.18 + Math.random() * 0.64 };
    }
    if (osMouseArmed) {
      api("/api/lab/click", "POST", { button: "left" }).catch(() => {});
    }
  }

  // Cached theme colors (zero getComputedStyle inside requestAnimationFrame)
  const themeColors = {
    canvasBg: "#0c0e13",
    canvasGrid: "rgba(255, 255, 255, 0.045)",
    textTertiary: "#6e7380",
  };
  function refreshThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    themeColors.canvasBg = cs.getPropertyValue("--canvas-bg").trim() || "#0c0e13";
    themeColors.canvasGrid = cs.getPropertyValue("--canvas-grid").trim() || "rgba(255,255,255,0.05)";
    themeColors.textTertiary = cs.getPropertyValue("--text-tertiary").trim() || "#6e7380";
  }

  // Theme management (Apple Dark Obsidian / Porcelain Light)
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("bms-theme", theme);
    el.icoSun.classList.toggle("hidden", theme === "light");
    el.icoMoon.classList.toggle("hidden", theme !== "light");
    refreshThemeColors();
  }
  applyTheme(localStorage.getItem("bms-theme") || "dark");
  el.btnTheme.addEventListener("click", () => {
    const curr = document.documentElement.getAttribute("data-theme");
    applyTheme(curr === "dark" ? "light" : "dark");
  });

  // Interactive Help Center Modal
  function openHelp(section = null) {
    el.helpModal.classList.remove("hidden");
    if (section) {
      document.querySelectorAll("#help-tabs .chip").forEach((c) => {
        c.classList.toggle("active", c.dataset.help === section);
      });
      document.querySelectorAll(".help-section").forEach((s) => {
        s.classList.toggle("hidden", s.dataset.helpPanel !== section);
      });
    }
  }
  function closeHelp() {
    el.helpModal.classList.add("hidden");
  }
  el.btnHelp?.addEventListener("click", () => {
    const activeTab = document.querySelector(".seg-tab.active")?.dataset.tab;
    const map = { monitor: "monitor", lab: "lab", games: "games", bci: "bci-osc", osc: "bci-osc", ml: "ml" };
    openHelp(map[activeTab] || "quickstart");
  });
  el.btnHelpClose?.addEventListener("click", closeHelp);
  el.helpModal?.addEventListener("click", (e) => {
    if (e.target === el.helpModal) closeHelp();
  });
  document.querySelectorAll("#help-tabs .chip").forEach((chip) => {
    chip.addEventListener("click", () => openHelp(chip.dataset.help));
  });
  async function emergencyDisarm() {
    if (!osMouseArmed && !osKeyboardArmed) return;
    renderLabConfig(await api("/api/lab/disarm", "POST"));
  }
  el.btnEmergencyStop?.addEventListener("click", emergencyDisarm);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!el.helpModal.classList.contains("hidden")) closeHelp();
      if (osMouseArmed || osKeyboardArmed) emergencyDisarm();
    }
  });

  // HiDPI Retina Canvas helper with cached dimensions (zero layout thrashing in rAF)
  const canvasDims = new WeakMap();
  function measureCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(100, Math.floor(rect.width));
    const h = Math.max(60, Math.floor(rect.height));
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const entry = { ctx, w, h };
    canvasDims.set(canvas, entry);
    return entry;
  }
  function prepCanvas(canvas) {
    return canvasDims.get(canvas) || measureCanvas(canvas);
  }
  function invalidateCanvasSizes() {
    [el.eegCanvas, el.fftCanvas, el.ppgCanvas, el.labOrbCanvas, el.labCursorCanvas].forEach((c) => {
      if (c) canvasDims.delete(c);
    });
  }
  window.addEventListener("resize", invalidateCanvasSizes);

  async function api(url, method = "GET", body = null) {
    const opts = { method, headers: {} };
    if (body !== null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }
    return res.json();
  }

  // Segmented Tab Switching
  document.querySelectorAll(".seg-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".seg-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
      tabBtn.classList.add("active");
      document.getElementById(`panel-${tabBtn.dataset.tab}`).classList.remove("hidden");
      invalidateCanvasSizes();
    });
  });

  function setRing(circleEl, pct) {
    const clamped = Math.max(0, Math.min(100, pct || 0));
    const offset = RING_CIRCUMFERENCE * (1 - clamped / 100);
    circleEl.style.strokeDashoffset = offset.toFixed(1);
  }

  function appendEvent(ev) {
    const li = document.createElement("li");
    const t = new Date(ev.ts * 1000).toLocaleTimeString([], { hour12: false });
    li.innerHTML = `<span><span class="tag ${ev.kind}">${ev.kind.replace(/_/g, " ")}</span> ${ev.label}</span><span class="muted mono">${t}</span>`;
    el.eventLog.prepend(li);
    while (el.eventLog.children.length > 30) el.eventLog.removeChild(el.eventLog.lastChild);
  }

  function prependBciHistory(entry) {
    const li = document.createElement("li");
    const t = new Date(entry.ts * 1000).toLocaleTimeString([], { hour12: false });
    li.innerHTML = `<span><strong>${entry.trigger}</strong> → ${entry.action_type} <small class="muted">(${entry.result})</small></span><span class="muted mono">${t}</span>`;
    el.bciHistory.prepend(li);
    while (el.bciHistory.children.length > 25) el.bciHistory.removeChild(el.bciHistory.lastChild);
  }

  async function refreshRecordings() {
    try {
      const data = await api("/api/recordings");
      el.recList.innerHTML = "";
      for (const rec of data.recordings || []) {
        const li = document.createElement("li");
        li.innerHTML = `
          <span>${rec.session_id} <small class="muted">(${rec.duration_sec}s)</small></span>
          <span class="rec-links">
            <a href="/api/recordings/${encodeURIComponent(rec.csv_file)}" download>CSV</a>
            <a href="/api/recordings/${encodeURIComponent(rec.summary_file)}" download>JSON</a>
          </span>`;
        el.recList.appendChild(li);
      }
    } catch (_) {}
  }

  function renderBci(data) {
    bciArmed = !!data.armed;
    el.bciNavBadge.textContent = bciArmed ? "ARMED" : "SAFE";
    el.bciNavBadge.className = bciArmed ? "pill-chip armed" : "pill-chip";
    el.btnBciArm.textContent = bciArmed ? "Disarm (ARMED)" : "Arm Triggers (SAFE)";
    el.btnBciArm.className = bciArmed ? "btn good small" : "btn danger small";

    if (data.capabilities) {
      const p = data.capabilities.playerctl ? "playerctl ✓" : "playerctl ✗";
      const x = data.capabilities.xdotool ? "xdotool ✓" : "xdotool ✗";
      el.bciCaps.textContent = `Linux: ${p} · ${x}`;
    }

    el.bciRulesList.innerHTML = "";
    for (const r of data.rules || []) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>
          <span class="tag ${r.trigger}">${r.trigger.replace(/_/g, " ")}</span>
          → <strong>${r.action_type}</strong>
          <small class="muted">${r.target || ""} · ${r.cooldown_sec}s</small>
        </span>
        <span class="controls">
          <button class="btn tonal small" data-test="${r.id}">Test</button>
          <button class="btn small ${r.enabled ? "good" : "tonal"}" data-toggle="${r.id}">${r.enabled ? "On" : "Off"}</button>
          <button class="btn tonal danger-text small" data-del="${r.id}">✕</button>
        </span>`;
      li.querySelector(`[data-test="${r.id}"]`).addEventListener("click", async () => {
        const entry = await api(`/api/bci/rules/${encodeURIComponent(r.id)}/test`, "POST");
        prependBciHistory(entry);
      });
      li.querySelector(`[data-toggle="${r.id}"]`).addEventListener("click", async () => {
        const updated = await api("/api/bci/rules", "POST", { ...r, enabled: !r.enabled });
        renderBci(updated);
      });
      li.querySelector(`[data-del="${r.id}"]`).addEventListener("click", async () => {
        const updated = await api(`/api/bci/rules/${encodeURIComponent(r.id)}`, "DELETE");
        renderBci(updated);
      });
      el.bciRulesList.appendChild(li);
    }

    if (data.history) {
      el.bciHistory.innerHTML = "";
      for (const h of data.history) prependBciHistory(h);
    }
  }

  function renderOsc(data) {
    oscEnabled = !!data.enabled;
    el.oscNavBadge.textContent = oscEnabled ? "ON" : "OFF";
    el.oscNavBadge.className = oscEnabled ? "pill-chip on" : "pill-chip";
    el.oscStatusBadge.textContent = oscEnabled ? `${data.host}:${data.port}` : "Stopped";
    el.oscStatusBadge.className = oscEnabled ? "pill-chip on" : "pill-chip";
    el.btnOscToggle.textContent = oscEnabled ? "Stop OSC Stream" : "Start OSC Stream";
    el.btnOscToggle.className = oscEnabled ? "btn danger" : "btn primary";
    el.oscPackets.textContent = `${data.packets_sent ?? 0} packets`;
  }

  function renderMlStatus(data) {
    const counts = data.label_counts || {};
    const numStates = Object.keys(counts).length;
    el.mlDatasetSummary.textContent = `Dataset: ${data.total_samples || 0} samples across ${numStates} state${numStates === 1 ? "" : "s"}`;
    el.mlCountsList.innerHTML = "";
    for (const [lbl, cnt] of Object.entries(counts)) {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${lbl}</strong><span class="pill-chip">${cnt} samples</span>`;
      el.mlCountsList.appendChild(li);
    }
    const ready = numStates >= 2 && Object.values(counts).every((c) => c >= 2);
    el.btnMlTrain.disabled = !ready;
    if (el.mlHint) {
      if (numStates === 0) el.mlHint.textContent = "Step 1: Pick a state above (e.g. Relaxed) and click Auto 5x.";
      else if (numStates === 1) el.mlHint.textContent = "Step 2: Pick a 2nd state (e.g. Deep Focus or Eyes Closed) and click Auto 5x to unlock Training.";
      else if (!ready) el.mlHint.textContent = "Capture at least 2 samples for each state to train.";
      else el.mlHint.textContent = data.trained ? "" : "Ready! Click Train Personal Model.";
    }
    el.mlAccuracyBadge.textContent = data.trained ? `LOO Acc: ${data.loo_accuracy_pct}%` : "Not Trained";
    el.mlAccuracyBadge.className = data.trained ? "pill-chip on" : "pill-chip";
  }

  document.querySelectorAll(".ml-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.mlLabel.value = btn.dataset.label;
    });
  });

  // --- Controls ---
  el.btnScan.addEventListener("click", async () => {
    el.btnScan.disabled = true;
    const span = el.btnScan.querySelector("span");
    span.textContent = "Scanning...";
    try {
      const data = await api("/api/scan", "POST");
      el.bleSelect.innerHTML = "";
      if (!data.devices.length) {
        el.bleSelect.innerHTML = `<option value="">No Muse 2 found</option>`;
        el.btnConnectBle.disabled = true;
      } else {
        for (const d of data.devices) {
          const opt = document.createElement("option");
          opt.value = d.address;
          opt.dataset.name = d.name;
          opt.textContent = `${d.name} (${d.rssi ?? ""} dBm)`;
          el.bleSelect.appendChild(opt);
        }
        el.btnConnectBle.disabled = false;
      }
    } catch (e) {
      alert(e.message);
    } finally {
      el.btnScan.disabled = false;
      span.textContent = "Scan";
    }
  });

  el.btnConnectBle.addEventListener("click", async () => {
    const addr = el.bleSelect.value;
    if (!addr) return;
    const name = el.bleSelect.selectedOptions[0]?.dataset.name || "Muse 2";
    el.btnConnectBle.disabled = true;
    el.btnConnectBle.textContent = "Connecting...";
    try {
      await api("/api/connect/ble", "POST", { address: addr, name });
    } catch (e) {
      el.btnConnectBle.textContent = "Connect";
      el.btnConnectBle.className = "btn primary";
      el.btnConnectBle.disabled = false;
      alert(e.message);
    }
  });

  el.btnSim.addEventListener("click", () => api("/api/connect/sim", "POST", { state: "calm" }).catch((e) => alert(e.message)));
  el.btnDisconnect.addEventListener("click", async () => {
    await api("/api/disconnect", "POST");
    refreshRecordings();
  });

  document.querySelectorAll(".sim-state").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".sim-state").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await api("/api/sim/state", "POST", { state: btn.dataset.state });
    });
  });

  el.btnSimBlink.addEventListener("click", () => api("/api/sim/event", "POST", { kind: "blink" }));
  el.btnSimJaw.addEventListener("click", () => api("/api/sim/event", "POST", { kind: "jaw" }));

  el.selNotch.addEventListener("change", () => {
    const val = Number(el.selNotch.value);
    api("/api/filters", "POST", { notch_hz: val || null, set_notch: true });
  });
  el.chkBandpass.addEventListener("change", () => {
    api("/api/filters", "POST", { bandpass: el.chkBandpass.checked });
  });

  el.btnMarker.addEventListener("click", async () => {
    const label = el.markerInput.value.trim() || "Marker";
    const res = await api("/api/marker", "POST", { label });
    if (res.marker) appendEvent(res.marker);
    el.markerInput.value = "";
  });

  el.btnRecord.addEventListener("click", async () => {
    if (!isRecording) {
      await api("/api/record/start", "POST", { label: el.recLabel.value || "brain_session" });
    } else {
      await api("/api/record/stop", "POST");
      refreshRecordings();
    }
  });

  el.btnBciArm.addEventListener("click", async () => renderBci(await api("/api/bci/arm", "POST", { armed: !bciArmed })));
  el.btnBciAdd.addEventListener("click", async () => {
    try {
      const data = await api("/api/bci/rules", "POST", {
        trigger: el.bciTrigger.value,
        action_type: el.bciAction.value,
        target: el.bciTarget.value,
        cooldown_sec: Number(el.bciCooldown.value) || 1.5,
        enabled: true,
      });
      el.bciTarget.value = "";
      renderBci(data);
    } catch (e) {
      alert(e.message);
    }
  });

  el.btnOscToggle.addEventListener("click", async () => {
    try {
      renderOsc(
        await api("/api/osc", "POST", {
          host: el.oscHost.value || "127.0.0.1",
          port: Number(el.oscPort.value) || 5000,
          enabled: !oscEnabled,
        })
      );
    } catch (e) {
      alert(e.message);
    }
  });

  el.btnMlCapture.addEventListener("click", async () => {
    try {
      renderMlStatus(await api("/api/ml/collect", "POST", { label: el.mlLabel.value }));
    } catch (e) {
      alert(e.message);
    }
  });

  el.btnMlBurst.addEventListener("click", async () => {
    el.btnMlBurst.disabled = true;
    try {
      for (let i = 0; i < 5; i++) {
        renderMlStatus(await api("/api/ml/collect", "POST", { label: el.mlLabel.value }));
        if (i < 4) await new Promise((r) => setTimeout(r, 600));
      }
    } catch (e) {
      alert(e.message);
    } finally {
      el.btnMlBurst.disabled = false;
    }
  });

  el.btnMlTrain.addEventListener("click", async () => {
    try {
      renderMlStatus(await api("/api/ml/train", "POST"));
    } catch (e) {
      alert(e.message);
    }
  });

  el.btnMlClear.addEventListener("click", async () => {
    renderMlStatus(await api("/api/ml/clear", "POST"));
    el.mlPredLabel.textContent = "Awaiting Trained Model";
    el.mlPredConf.textContent = "Collect at least 2 states and train to begin live inference";
    el.mlProbsContainer.innerHTML = "";
    el.mlLivePill.classList.add("hidden");
  });

  // --- Neuro Lab Listeners ---
  function renderLabConfig(data) {
    if (!data) return;
    osMouseArmed = !!data.os_mouse_armed;
    osKeyboardArmed = !!data.os_keyboard_armed;
    el.btnOsMouseArm.textContent = osMouseArmed ? "OS Mouse: ARMED" : "OS Mouse: SAFE";
    el.btnOsMouseArm.className = osMouseArmed ? "btn good small" : "btn danger small";
    el.btnOsKbdArm.textContent = osKeyboardArmed ? "OS Type: ARMED" : "OS Type: SAFE";
    el.btnOsKbdArm.className = osKeyboardArmed ? "btn good small" : "btn danger small";
    el.btnEmergencyStop?.classList.toggle("hidden", !(osMouseArmed || osKeyboardArmed));
    if (data.focus_threshold != null) {
      el.rngLabThresh.value = Math.round(data.focus_threshold);
      el.valLabThresh.textContent = Math.round(data.focus_threshold);
    }
    if (data.cursor) {
      el.chkCursorOn.checked = !!data.cursor.enabled;
      el.chkFocusClutch.checked = !!data.cursor.focus_clutch;
      if (el.chkInvertY) el.chkInvertY.checked = !!data.cursor.invert_y;
    }
    if (data.environment) {
      const e = data.environment;
      const tool = e.ydotool ? "ydotool ✓" : e.wtype ? "wtype ✓" : e.xdotool ? "xdotool ✓" : "no OS input tool";
      el.labEnvBadge.textContent = `${e.desktop} (${e.session_type}) · ${tool}`;
      if (!e.ydotool && e.session_type === "wayland") {
        el.labOsHint.textContent = "Sandbox ready · For real Wayland OS mouse/type: sudo apt install ydotool";
      }
    }
  }

  el.btnLabCal.addEventListener("click", () => api("/api/lab/calibrate", "POST"));
  el.rngLabThresh.addEventListener("input", () => {
    el.valLabThresh.textContent = el.rngLabThresh.value;
    api("/api/lab/config", "POST", { focus_threshold: Number(el.rngLabThresh.value) });
  });
  el.chkCursorOn.addEventListener("change", () => api("/api/lab/config", "POST", { cursor_enabled: el.chkCursorOn.checked }));
  el.chkFocusClutch.addEventListener("change", () => api("/api/lab/config", "POST", { focus_clutch: el.chkFocusClutch.checked }));
  el.chkInvertY?.addEventListener("change", () => api("/api/lab/config", "POST", { invert_y: el.chkInvertY.checked }));
  el.rngCursorSens.addEventListener("input", () => api("/api/lab/config", "POST", { sensitivity: Number(el.rngCursorSens.value) }));
  el.btnCursorRecenter.addEventListener("click", () => api("/api/lab/recenter", "POST"));
  el.btnOsMouseArm.addEventListener("click", async () => renderLabConfig(await api("/api/lab/config", "POST", { os_mouse_armed: !osMouseArmed })));
  el.btnOsKbdArm.addEventListener("click", async () => renderLabConfig(await api("/api/lab/config", "POST", { os_keyboard_armed: !osKeyboardArmed })));
  el.btnKbdToggle.addEventListener("click", () => startStopKeyboard(!kbdRunning));
  el.selKbdSpeed.addEventListener("change", () => { if (kbdRunning) startStopKeyboard(true); });
  el.btnKbdClear.addEventListener("click", () => { el.kbdOutput.value = ""; });
  el.btnKbdSpeak.addEventListener("click", () => {
    if ("speechSynthesis" in window && el.kbdOutput.value.trim()) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(el.kbdOutput.value));
    }
  });

  // --- Retina-Crisp Canvas Rendering ---
  function drawEEG() {
    const { ctx, w, h } = prepCanvas(el.eegCanvas);
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    // Subtle vertical time grid (every 1s across 4s window)
    ctx.strokeStyle = themeColors.canvasGrid;
    ctx.lineWidth = 1;
    for (let g = 1; g < 8; g++) {
      const gx = (w / 8) * g;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }

    const rowH = h / CHANNELS.length;
    CHANNELS.forEach((ch, idx) => {
      const midY = rowH * idx + rowH / 2;

      // Baseline hairline
      ctx.strokeStyle = themeColors.canvasGrid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      // Channel badge pill
      ctx.fillStyle = CH_COLORS[ch];
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(ch, 12, rowH * idx + 18);

      // Smooth waveform trace
      const data = eegBuf[ch];
      const scaleY = (rowH * 0.38) / 140.0;
      ctx.strokeStyle = CH_COLORS[ch];
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * w;
        const y = midY - Math.max(-rowH * 0.44, Math.min(rowH * 0.44, data[i] * scaleY));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  function drawFFT() {
    const { ctx, w, h } = prepCanvas(el.fftCanvas);
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    const n = fftSpectrum.length;
    const barW = w / n;
    for (let i = 0; i < n; i++) {
      const hz = i + 1;
      let color = "#ff375f";
      if (hz < 4) color = "#5e5ce6";
      else if (hz < 8) color = "#30d5c8";
      else if (hz < 13) color = "#30d158";
      else if (hz < 30) color = "#ff9f0a";

      const norm = Math.max(0, Math.min(1, (fftSpectrum[i] + 2.5) / 5.0));
      const bh = Math.max(2, norm * (h - 20));
      const x = i * barW + 1.5;
      const bw = Math.max(2, barW - 3);
      const y = h - 16 - bh;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, [3, 3, 0, 0]);
      ctx.fill();
    }

    ctx.fillStyle = themeColors.textTertiary;
    ctx.font = "500 10px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    [1, 8, 13, 30, 45].forEach((hz) => {
      const x = ((hz - 1) / n) * w;
      ctx.fillText(`${hz}Hz`, Math.min(w - 28, x + 2), h - 3);
    });
  }

  function drawPPG() {
    const { ctx, w, h } = prepCanvas(el.ppgCanvas);
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    const maxAbs = Math.max(500, ...ppgBuf.map((v) => Math.abs(v)));
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255, 55, 95, 0.28)");
    grad.addColorStop(1, "rgba(255, 55, 95, 0.0)");

    ctx.beginPath();
    for (let i = 0; i < ppgBuf.length; i++) {
      const x = (i / (ppgBuf.length - 1)) * w;
      const y = h * 0.52 - (ppgBuf[i] / maxAbs) * (h * 0.36);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#ff375f";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Soft Apple Health-style gradient fill under pulse curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawLabOrb() {
    const { ctx, w, h } = prepCanvas(el.labOrbCanvas);
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    const threshNorm = 1 - Math.max(0.1, Math.min(0.9, (labState.focus_threshold || 50) / 100));
    const threshY = h * threshNorm;

    // Target zone band above threshold
    const zoneGrad = ctx.createLinearGradient(0, 0, 0, threshY);
    zoneGrad.addColorStop(0, labState.in_zone ? "rgba(48, 209, 88, 0.22)" : "rgba(10, 132, 255, 0.08)");
    zoneGrad.addColorStop(1, "rgba(48, 209, 88, 0.02)");
    ctx.fillStyle = zoneGrad;
    ctx.fillRect(0, 0, w, threshY);

    // Threshold dashed line
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = labState.in_zone ? "#30d158" : "#0a84ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Smoothly interpolate orb height from Focus (0..100)
    const targetY = 1 - Math.max(0.08, Math.min(0.92, latestFocus / 100));
    orbSmoothY += (targetY - orbSmoothY) * 0.12;
    const cx = w / 2;
    const cy = orbSmoothY * h;

    // Glowing aura
    const r = labState.in_zone ? 34 : 26;
    const aura = ctx.createRadialGradient(cx, cy, 4, cx, cy, r * 2.1);
    aura.addColorStop(0, labState.in_zone ? "rgba(48, 209, 88, 0.85)" : "rgba(10, 132, 255, 0.75)");
    aura.addColorStop(0.5, labState.in_zone ? "rgba(48, 213, 200, 0.25)" : "rgba(191, 90, 242, 0.2)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Core orb
    ctx.fillStyle = labState.in_zone ? "#30d158" : "#0a84ff";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 13px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(latestFocus)), cx, cy + 4);
    ctx.textAlign = "left";
  }

  function drawLabCursor() {
    const { ctx, w, h } = prepCanvas(el.labCursorCanvas);
    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = themeColors.canvasGrid;
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 6) * i, 0);
      ctx.lineTo((w / 6) * i, h);
      ctx.stroke();
    }
    for (let j = 1; j < 4; j++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * j);
      ctx.lineTo(w, (h / 4) * j);
      ctx.stroke();
    }

    // Target ring
    const tx = targetPos.x * w;
    const ty = targetPos.y * h;
    ctx.strokeStyle = "#ff9f0a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(tx, ty, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 159, 10, 0.16)";
    ctx.fill();
    ctx.fillStyle = "#ff9f0a";
    ctx.beginPath();
    ctx.arc(tx, ty, 4, 0, Math.PI * 2);
    ctx.fill();

    // Hybrid Mind Cursor
    const cx = (labState.cursor?.x ?? 0.5) * w;
    const cy = (labState.cursor?.y ?? 0.5) * h;
    const active = labState.cursor?.enabled && labState.cursor?.clutch_active;

    if (clickFlashAlpha > 0.02) {
      ctx.strokeStyle = `rgba(48, 209, 88, ${clickFlashAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 26 * (1.4 - clickFlashAlpha * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      clickFlashAlpha *= 0.86;
    }

    ctx.fillStyle = active ? "#0a84ff" : "#86868b";
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function renderLoop() {
    if (!document.getElementById("panel-monitor").classList.contains("hidden")) {
      drawEEG();
      drawFFT();
      drawPPG();
    }
    if (!document.getElementById("panel-lab").classList.contains("hidden")) {
      drawLabOrb();
      drawLabCursor();
    }
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  // --- WebSocket Stream ---
  function connectWS() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (evt) => {
      const frame = JSON.parse(evt.data);

      const dev = frame.device || {};
      el.dot.className = "dot" + (dev.mode === "ble" ? " online" : dev.mode === "simulator" ? " sim" : "");
      el.status.textContent = dev.connected ? dev.device_name : "Disconnected";
      el.btnDisconnect.disabled = !dev.connected;
      el.simBar.classList.toggle("hidden", dev.mode !== "simulator");

      // Sync Connect button visual state (Green "Connected" when BLE is active)
      if (dev.mode === "ble" && dev.connected) {
        el.btnConnectBle.textContent = "Connected";
        el.btnConnectBle.className = "btn good";
        el.btnConnectBle.disabled = true;
        if (dev.device_address && !Array.from(el.bleSelect.options).some((o) => o.value === dev.device_address)) {
          el.bleSelect.innerHTML = `<option value="${dev.device_address}" data-name="${dev.device_name || "Muse 2"}">${dev.device_name || dev.device_address}</option>`;
        }
      } else if (el.btnConnectBle.textContent !== "Connecting...") {
        el.btnConnectBle.textContent = "Connect";
        el.btnConnectBle.className = "btn primary";
        el.btnConnectBle.disabled = !el.bleSelect.value;
      }

      const rec = frame.recording || {};
      isRecording = !!rec.active;
      el.btnRecord.textContent = isRecording ? "Stop" : "Record";
      el.btnRecord.className = isRecording ? "btn danger small" : "btn primary small";
      el.recStatus.textContent = isRecording ? `● ${rec.duration_sec}s · ${rec.samples}` : "Idle";
      el.recStatus.className = isRecording ? "rec-indicator live" : "rec-indicator";

      if (frame.osc) renderOsc(frame.osc);

      for (const ch of CHANNELS) {
        const chunk = (frame.eeg && frame.eeg[ch]) || [];
        if (chunk.length) {
          eegBuf[ch].push(...chunk);
          if (eegBuf[ch].length > EEG_BUF_LEN) eegBuf[ch].splice(0, eegBuf[ch].length - EEG_BUF_LEN);
        }
      }
      if (frame.ppg && frame.ppg.length) {
        ppgBuf.push(...frame.ppg);
        if (ppgBuf.length > PPG_BUF_LEN) ppgBuf.splice(0, ppgBuf.length - PPG_BUF_LEN);
      }
      if (frame.spectrum && frame.spectrum.length) fftSpectrum = frame.spectrum;

      const q = frame.quality || {};
      el.horseshoe.querySelectorAll(".node").forEach((node) => {
        node.className = `node q${q[node.dataset.ch] ?? 0}`;
      });

      if (frame.rms) {
        el.rmsReadout.innerHTML = `<span>TP9 <b>${frame.rms.TP9}</b></span><span>AF7 <b>${frame.rms.AF7}</b></span><span>AF8 <b>${frame.rms.AF8}</b></span><span>TP10 <b>${frame.rms.TP10}</b></span>`;
      }

      const m = frame.metrics || {};
      const focusVal = m.focus != null ? Math.round(m.focus) : null;
      const calmVal = m.calm != null ? Math.round(m.calm) : null;
      latestFocus = m.focus || 0;
      el.focus.textContent = focusVal != null ? focusVal : "--";
      el.calm.textContent = calmVal != null ? calmVal : "--";
      setRing(el.ringFocus, focusVal || 0);
      setRing(el.ringCalm, calmVal || 0);
      el.bpm.textContent = m.heart_rate_bpm != null ? Math.round(m.heart_rate_bpm) : "--";
      el.battery.innerHTML = `<svg class="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="16" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/></svg> ${m.battery_pct != null ? m.battery_pct + "%" : "--%"}`;

      const rel = (frame.bands && frame.bands.relative) || {};
      document.querySelectorAll("#bands-container .band-row").forEach((row) => {
        const pct = rel[row.dataset.band] || 0;
        row.querySelector(".bar-fill").style.width = `${Math.min(100, pct)}%`;
        row.querySelector(".band-pct").textContent = `${pct.toFixed(0)}%`;
      });

      if (frame.imu && frame.imu.accel) {
        const [ax, ay, az] = frame.imu.accel;
        el.imu.textContent = `${ax.toFixed(2)}, ${ay.toFixed(2)}, ${az.toFixed(2)} g`;
      }

      for (const ev of frame.events || []) {
        appendEvent(ev);
        // Trigger Neuro Lab cursor click or virtual keyboard selection from gestures
        if (el.selClickTrigger.value === ev.kind && labState.cursor?.enabled) {
          fireCursorClick();
        }
        if (kbdRunning && el.selKbdTrigger.value === ev.kind) {
          triggerKeyboardSelection();
        }
      }
      for (const f of frame.bci_fired || []) prependBciHistory(f);
      if (window.BrainMuseumGame) window.BrainMuseumGame.onFrame(frame);

      // Update Neuro Lab telemetry
      if (frame.lab) {
        labState = frame.lab;
        el.labCalWrap.classList.toggle("hidden", !frame.lab.calibrating);
        if (frame.lab.calibrating) {
          el.labCalFill.style.width = `${Math.round((frame.lab.cal_progress || 0) * 100)}%`;
        }
        el.labStreak.textContent = `${frame.lab.current_streak_sec}s`;
        el.labBestStreak.textContent = `${frame.lab.best_streak_sec}s`;
        el.labBaseline.textContent = String(Math.round(frame.lab.focus_baseline));
        el.labZoneBadge.textContent = frame.lab.in_zone ? "In The Zone" : "Below Threshold";
        el.labZoneBadge.className = frame.lab.in_zone ? "pill-chip on" : "pill-chip";

        // Update Live Control Cockpit strip
        const c = frame.lab.cursor || {};
        if (el.labClutchState) {
          el.labClutchState.textContent = !c.enabled
            ? "DISABLED"
            : c.clutch_active
              ? (c.focus_clutch ? "ENGAGED (Moving)" : "ALWAYS MOVING")
              : "LOCKED (Raise Focus)";
        }
        if (el.labGyroLive && c.yaw_dps != null) {
          el.labGyroLive.textContent = `Yaw ${c.yaw_dps.toFixed(1)} · Pitch ${c.pitch_dps.toFixed(1)}°/s`;
        }
        if (el.labLastAction && frame.lab.last_os_action) {
          el.labLastAction.textContent = frame.lab.last_os_action;
        }
        el.btnEmergencyStop?.classList.toggle("hidden", !(frame.lab.os_mouse_armed || frame.lab.os_keyboard_armed));

        // Rising-edge Focus Surge for Virtual Keyboard (must dip below threshold before re-triggering)
        const focusRisingEdge = frame.lab.in_zone && !prevInZone;
        prevInZone = !!frame.lab.in_zone;

        if (frame.lab.in_zone) {
          playChime(528);
          if (kbdRunning && el.selKbdTrigger.value === "focus_surge" && focusRisingEdge) {
            triggerKeyboardSelection();
          }
          if (el.selClickTrigger.value === "focus_dwell" && labState.cursor?.enabled) {
            if (!dwellStartTs) dwellStartTs = performance.now();
            else if (performance.now() - dwellStartTs > 1200) {
              dwellStartTs = 0;
              fireCursorClick();
            }
          }
        } else {
          dwellStartTs = 0;
        }
      }

      const pred = frame.ml_prediction;
      if (pred && pred.label) {
        const pct = Math.round(pred.confidence * 100);
        el.mlLivePill.textContent = `${pred.label} · ${pct}%`;
        el.mlLivePill.classList.remove("hidden");
        el.mlPredLabel.textContent = pred.label;
        el.mlPredConf.textContent = `Confidence ${pct}%`;
        el.mlProbsContainer.innerHTML = Object.entries(pred.probabilities || {})
          .map(
            ([cls, p]) => `
            <div class="band-row">
              <span class="band-name">${cls}</span>
              <div class="bar-track"><div class="bar-fill ml" style="width:${Math.round(p * 100)}%"></div></div>
              <span class="band-pct">${Math.round(p * 100)}%</span>
            </div>`
          )
          .join("");
      }
    };
    ws.onclose = () => setTimeout(connectWS, 1500);
  }

  async function init() {
    try {
      const st = await api("/api/status");
      if (st.bci) renderBci(st.bci);
      if (st.osc) renderOsc(st.osc);
      if (st.ml) renderMlStatus(st.ml);
      if (st.lab) renderLabConfig(st.lab);
    } catch (_) {}
    refreshRecordings();
    connectWS();
  }

  init();
})();
