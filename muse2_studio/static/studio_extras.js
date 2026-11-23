/**
 * Brain Museum Studio — Multi-User Profiles, 4-Step Guided Calibration Wizard, & Neuro-Pomodoro
 */
(() => {
  const ui = {
    selProfile: document.getElementById("sel-profile"),
    btnNewProfile: document.getElementById("btn-new-profile"),
    btnWizardOpen: document.getElementById("btn-open-wizard"),
    wizModal: document.getElementById("wizard-modal"),
    btnWizClose: document.getElementById("btn-wiz-close"),
    wizTitle: document.getElementById("wiz-step-title"),
    wizDesc: document.getElementById("wiz-step-desc"),
    wizProgress: document.getElementById("wiz-progress-fill"),
    wizLive: document.getElementById("wiz-live-readout"),
    btnWizAction: document.getElementById("btn-wiz-action"),
    btnWizSkip: document.getElementById("btn-wiz-skip"),
    // Neuro-Pomodoro
    pomoTimer: document.getElementById("pomo-timer"),
    pomoStatus: document.getElementById("pomo-status"),
    pomoScore: document.getElementById("pomo-score"),
    selPomoMin: document.getElementById("sel-pomo-min"),
    btnPomoToggle: document.getElementById("btn-pomo-toggle"),
  };

  async function api(url, method = "GET", body = null) {
    const opts = { method, headers: {} };
    if (body !== null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  // --- Multi-User Brain Profiles ---
  function renderProfiles(data) {
    if (!ui.selProfile || !data?.profiles) return;
    ui.selProfile.innerHTML = "";
    for (const p of data.profiles) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name}${p.calibrated ? " ✓" : ""}`;
      if (p.id === data.active_id) opt.selected = true;
      ui.selProfile.appendChild(opt);
    }
  }

  ui.selProfile?.addEventListener("change", async () => {
    try {
      const st = await api("/api/profiles/select", "POST", { profile_id: ui.selProfile.value });
      renderProfiles(st);
    } catch (_) {}
  });

  ui.btnNewProfile?.addEventListener("click", async () => {
    const name = window.prompt("New Brain Profile name (e.g. Pete, Guest):");
    if (!name || !name.trim()) return;
    try {
      const st = await api("/api/profiles/create", "POST", { name: name.trim() });
      renderProfiles(st);
      openWizard();
    } catch (e) {
      alert(e.message);
    }
  });

  // --- 4-Step First-Time Guided Calibration Wizard ---
  let wizStep = 0; // 0=Fit, 1=Calm(8s), 2=Focus(8s), 3=Head Center & Save
  let wizCollecting = false;
  let wizStartTs = 0;
  let calmSamples = [];
  let focusSamples = [];
  let latestFrame = null;

  function openWizard() {
    wizStep = 0;
    wizCollecting = false;
    calmSamples = [];
    focusSamples = [];
    ui.wizModal?.classList.remove("hidden");
    renderWizStep();
  }

  function closeWizard() {
    wizCollecting = false;
    ui.wizModal?.classList.add("hidden");
  }

  function renderWizStep() {
    if (ui.wizProgress) ui.wizProgress.style.width = `${(wizStep / 4) * 100}%`;
    if (wizStep === 0) {
      ui.wizTitle.textContent = "Step 1 of 4 · Sensor Fit Check";
      ui.wizDesc.textContent = "Connect your Muse 2 (or Sim) and adjust the headband until TP9, AF7, AF8, and TP10 show green contact.";
      ui.btnWizAction.textContent = "Fit Looks Good → Next";
      ui.btnWizAction.disabled = false;
    } else if (wizStep === 1) {
      ui.wizTitle.textContent = "Step 2 of 4 · Eyes-Closed Calm Baseline (8s)";
      ui.wizDesc.textContent = "Close your eyes, relax your jaw, and breathe softly for 8 seconds while we measure your personal Alpha/Calm signature.";
      ui.btnWizAction.textContent = wizCollecting ? "Measuring Calm..." : "Start 8s Calm Scan";
      ui.btnWizAction.disabled = wizCollecting;
    } else if (wizStep === 2) {
      ui.wizTitle.textContent = "Step 3 of 4 · Active Focus Baseline (8s)";
      ui.wizDesc.textContent = "Open your eyes and do mental math (e.g., count backward from 100 by 7s) for 8 seconds to calibrate your personal Focus threshold.";
      ui.btnWizAction.textContent = wizCollecting ? "Measuring Focus..." : "Start 8s Focus Scan";
      ui.btnWizAction.disabled = wizCollecting;
    } else if (wizStep === 3) {
      ui.wizTitle.textContent = "Step 4 of 4 · Head Center & Save Profile";
      ui.wizDesc.textContent = "Look straight ahead at the center of your screen and click Save Profile to lock your personal thresholds across Neuro Lab, Games & Meditation!";
      ui.btnWizAction.textContent = "Save Personal Brain Profile";
      ui.btnWizAction.disabled = false;
    }
  }

  ui.btnWizardOpen?.addEventListener("click", openWizard);
  ui.btnWizClose?.addEventListener("click", closeWizard);
  ui.btnWizSkip?.addEventListener("click", closeWizard);

  ui.btnWizAction?.addEventListener("click", async () => {
    if (wizStep === 0) {
      wizStep = 1;
      renderWizStep();
    } else if (wizStep === 1 || wizStep === 2) {
      wizCollecting = true;
      wizStartTs = performance.now();
      renderWizStep();
    } else if (wizStep === 3) {
      const calmBase = calmSamples.length ? calmSamples.reduce((a, b) => a + b, 0) / calmSamples.length : 38.0;
      const focusBase = focusSamples.length ? focusSamples.reduce((a, b) => a + b, 0) / focusSamples.length : 42.0;
      const threshold = Math.min(88, Math.max(25, (calmBase * 0.35 + focusBase * 0.85)));
      const neutralTilt = Number(latestFrame?.imu?.accel?.[1] || 0);
      try {
        const st = await api("/api/profiles/calibrate", "POST", {
          focus_baseline: focusBase,
          calm_baseline: calmBase,
          focus_threshold: threshold,
          neutral_tilt: neutralTilt,
        });
        renderProfiles(st);
        localStorage.setItem("bms-wiz-done", "1");
        closeWizard();
      } catch (e) {
        alert(e.message);
      }
    }
  });

  // --- Neuro-Pomodoro Deep Work Sprint Timer ---
  let pomoRunning = false;
  let pomoRemSec = 1500;
  let pomoTicks = 0;
  let pomoFocusedTicks = 0;
  let pomoInterval = null;

  function fmtMinSec(s) {
    const m = Math.floor(s / 60), rem = Math.max(0, Math.floor(s % 60));
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  ui.btnPomoToggle?.addEventListener("click", () => {
    pomoRunning = !pomoRunning;
    if (pomoRunning) {
      pomoRemSec = (Number(ui.selPomoMin?.value) || 25) * 60;
      pomoTicks = 0; pomoFocusedTicks = 0;
      ui.btnPomoToggle.textContent = "Stop Sprint";
      ui.btnPomoToggle.className = "btn danger small";
      if (ui.pomoStatus) ui.pomoStatus.textContent = "Deep Work Active";
      pomoInterval = setInterval(() => {
        pomoRemSec -= 1;
        if (ui.pomoTimer) ui.pomoTimer.textContent = fmtMinSec(pomoRemSec);
        if (pomoRemSec <= 0) {
          clearInterval(pomoInterval);
          pomoRunning = false;
          ui.btnPomoToggle.textContent = "Start Sprint";
          ui.btnPomoToggle.className = "btn primary small";
          if (ui.pomoStatus) ui.pomoStatus.textContent = "Sprint Complete! Take a 5-min Alpha break.";
        }
      }, 1000);
    } else {
      clearInterval(pomoInterval);
      ui.btnPomoToggle.textContent = "Start Sprint";
      ui.btnPomoToggle.className = "btn primary small";
      if (ui.pomoStatus) ui.pomoStatus.textContent = "Idle";
    }
  });

  // --- Live Telemetry Hook ---
  window.BrainMuseumExtras = {
    initProfiles: renderProfiles,
    onFrame(frame) {
      latestFrame = frame;
      // Neuro-Pomodoro Focus Score
      if (pomoRunning && frame.metrics) {
        pomoTicks += 1;
        if (frame.lab?.in_zone || (frame.metrics.focus || 0) >= 48) pomoFocusedTicks += 1;
        const pct = Math.round((pomoFocusedTicks / Math.max(1, pomoTicks)) * 100);
        if (ui.pomoScore) ui.pomoScore.textContent = `Deep Work Score: ${pct}%`;
      }

      // Calibration Wizard live feedback
      if (!ui.wizModal || ui.wizModal.classList.contains("hidden")) return;
      if (wizStep === 0 && frame.quality) {
        const q = frame.quality;
        const lbl = (v) => (v === 2 ? "🟢" : v === 1 ? "🟡" : "🔴");
        ui.wizLive.textContent = `TP9 ${lbl(q.TP9)}  ·  AF7 ${lbl(q.AF7)}  ·  AF8 ${lbl(q.AF8)}  ·  TP10 ${lbl(q.TP10)}`;
      } else if (wizCollecting && (wizStep === 1 || wizStep === 2)) {
        const elapsed = (performance.now() - wizStartTs) / 1000;
        const prog = Math.min(1, elapsed / 8.0);
        if (ui.wizProgress) ui.wizProgress.style.width = `${((wizStep + prog) / 4) * 100}%`;
        if (wizStep === 1 && frame.metrics?.calm) calmSamples.push(frame.metrics.calm);
        if (wizStep === 2 && frame.metrics?.focus) focusSamples.push(frame.metrics.focus);
        ui.wizLive.textContent = `${wizStep === 1 ? "Calm" : "Focus"}: ${Math.round(wizStep === 1 ? (frame.metrics?.calm || 0) : (frame.metrics?.focus || 0))} · ${Math.max(0, 8 - elapsed).toFixed(1)}s left`;
        if (elapsed >= 8.0) {
          wizCollecting = false;
          wizStep += 1;
          renderWizStep();
        }
      } else if (wizStep === 3) {
        const tilt = Number(frame.imu?.accel?.[1] || 0).toFixed(2);
        ui.wizLive.textContent = `Current Head Tilt: ${tilt} g · Ready to save!`;
      }
    },
  };
})();
