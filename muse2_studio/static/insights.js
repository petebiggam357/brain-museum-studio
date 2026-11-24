/**
 * Brain Museum Studio — Shareable Brain Report Card PNG Exporter,
 * Multi-Session Progress Trends, LSL Bridge Toggle, & Browser Web Bluetooth Helper
 */
(() => {
  const ui = {
    btnReportPng: document.getElementById("btn-export-report"),
    trendCanvas: document.getElementById("insights-trend-canvas"),
    btnLslToggle: document.getElementById("btn-lsl-toggle"),
    lslBadge: document.getElementById("lsl-status-badge"),
    btnWebBle: document.getElementById("btn-web-ble"),
    hrvReadout: document.getElementById("val-hrv"),
  };

  let latestFrame = null;
  let lslEnabled = false;

  // --- 1. Shareable 1200x630 Brain Session Report Card PNG ---
  function exportReportPNG() {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 630;
    const ctx = c.getContext("2d");

    // Apple-style Obsidian gradient card
    const bg = ctx.createLinearGradient(0, 0, 1200, 630);
    bg.addColorStop(0, "#080b16");
    bg.addColorStop(0.55, "#11172a");
    bg.addColorStop(1, "#18122b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 630);

    // Subtle border
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(24, 24, 1152, 582, 26);
    ctx.stroke();

    // Header
    ctx.fillStyle = "#0a84ff";
    ctx.font = "700 18px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillText("BRAIN MUSEUM STUDIO · NEURAL SESSION REPORT", 64, 84);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 40px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillText("Live Brainwave & HRV Snapshot", 64, 134);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 18px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillText(new Date().toLocaleString(), 64, 168);

    const m = latestFrame?.metrics || {};
    const rel = latestFrame?.bands?.relative || { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

    // 4 Metric Tiles
    const tiles = [
      { label: "FOCUS", val: m.focus != null ? `${Math.round(m.focus)}` : "--", col: "#ff9f0a" },
      { label: "CALM", val: m.calm != null ? `${Math.round(m.calm)}` : "--", col: "#30d5c8" },
      { label: "HEART RATE", val: m.heart_rate_bpm != null ? `${Math.round(m.heart_rate_bpm)} BPM` : "--", col: "#ff375f" },
      { label: "HRV (RMSSD)", val: m.hrv_rmssd_ms != null ? `${Math.round(m.hrv_rmssd_ms)} ms` : "--", col: "#30d158" },
    ];
    tiles.forEach((t, idx) => {
      const tx = 64 + idx * 272;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.roundRect(tx, 206, 250, 126, 18); ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 14px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(t.label, tx + 22, 240);
      ctx.fillStyle = t.col;
      ctx.font = "700 42px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(t.val, tx + 22, 302);
    });

    // 5 Band Power Bars
    const bands = [
      { k: "delta", name: "Delta (1–4 Hz)", col: "#5e5ce6" },
      { k: "theta", name: "Theta (4–8 Hz)", col: "#30d5c8" },
      { k: "alpha", name: "Alpha (8–13 Hz)", col: "#30d158" },
      { k: "beta",  name: "Beta (13–30 Hz)", col: "#ff9f0a" },
      { k: "gamma", name: "Gamma (30–44 Hz)", col: "#ff375f" },
    ];
    bands.forEach((b, idx) => {
      const by = 374 + idx * 38;
      const pct = Math.min(100, Math.max(0, rel[b.k] || 0));
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 16px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(b.name, 64, by + 15);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath(); ctx.roundRect(240, by, 790, 18, 9); ctx.fill();
      ctx.fillStyle = b.col;
      ctx.beginPath(); ctx.roundRect(240, by, Math.max(12, 7.9 * pct), 18, 9); ctx.fill();
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(`${Math.round(pct)}%`, 1052, by + 15);
    });

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 14px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillText("github.com/petebiggam357/brain-museum-studio · Open-Source Muse 2 / Muse S Neurotech Studio", 64, 586);

    const a = document.createElement("a");
    a.download = `brain-museum-report-${Date.now()}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  }
  ui.btnReportPng?.addEventListener("click", exportReportPNG);

  // --- 2. Multi-Session Stillness Trend Chart ---
  function drawTrends() {
    if (!ui.trendCanvas) return;
    const ctx = ui.trendCanvas.getContext("2d");
    const w = (ui.trendCanvas.width = 520);
    const h = (ui.trendCanvas.height = 120);
    ctx.fillStyle = "#080b14";
    ctx.fillRect(0, 0, w, h);

    const entries = JSON.parse(localStorage.getItem("bms-med-journal") || "[]").slice(0, 14).reverse();
    if (entries.length < 2) {
      ctx.fillStyle = "#6e7380";
      ctx.font = "500 13px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText("Complete 2+ Meditation sessions to plot your Stillness % trend here", 20, h / 2 + 4);
      return;
    }

    ctx.strokeStyle = "#30d158";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    entries.forEach((e, idx) => {
      const x = 24 + (idx / (entries.length - 1)) * (w - 48);
      const y = h - 22 - ((e.stillnessPct || 0) / 100) * (h - 44);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    entries.forEach((e, idx) => {
      const x = 24 + (idx / (entries.length - 1)) * (w - 48);
      const y = h - 22 - ((e.stillnessPct || 0) / 100) * (h - 44);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    });
  }
  drawTrends();

  // --- 3. Optional LSL (Lab Streaming Layer) Toggle ---
  ui.btnLslToggle?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/lsl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !lslEnabled }),
      });
      const st = await res.json();
      updateLsl(st);
    } catch (_) {}
  });

  function updateLsl(st) {
    if (!st) return;
    lslEnabled = !!st.enabled;
    if (ui.lslBadge) {
      ui.lslBadge.textContent = !st.available ? "pip install pylsl" : lslEnabled ? `Streaming (${st.samples_pushed})` : "Ready (Off)";
      ui.lslBadge.className = lslEnabled ? "pill-chip on" : "pill-chip";
    }
    if (ui.btnLslToggle) {
      ui.btnLslToggle.disabled = !st.available;
      ui.btnLslToggle.textContent = lslEnabled ? "Stop LSL Outlet" : "Start LSL Outlet";
    }
  }

  // --- 4. Browser-Native Web Bluetooth Quick-Pair (Chrome/Brave/Android) ---
  if (ui.btnWebBle && navigator.bluetooth) {
    ui.btnWebBle.classList.remove("hidden");
    ui.btnWebBle.addEventListener("click", async () => {
      try {
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [0xfe8d] }],
          optionalServices: [0xfe8d],
        });
        alert(`Web Bluetooth paired with ${device.name || "Muse"}! For full 256 Hz DSP & recording on desktop, use Scan → Connect.`);
      } catch (e) {
        if (e.name !== "NotFoundError") alert(`Web Bluetooth: ${e.message}`);
      }
    });
  }

  window.BrainMuseumInsights = {
    onFrame(frame) {
      latestFrame = frame;
      if (frame.lsl) updateLsl(frame.lsl);
      const m = frame.metrics || {};
      if (ui.hrvReadout) {
        const rmssd = m.hrv_rmssd_ms != null ? `${Math.round(m.hrv_rmssd_ms)} ms` : "--";
        const coh = m.hrv_coherence != null ? ` · Coh ${Math.round(m.hrv_coherence)}%` : "";
        ui.hrvReadout.textContent = `HRV ${rmssd}${coh}`;
      }
    },
    refreshTrends: drawTrends,
  };
})();
