/**
 * Brain Museum Studio — Interactive 3D Real-Time Brain Visualizer & Live Spectrogram
 *
 * Pure Canvas 3D software-projected holographic cortex (100% offline, zero CDN, 60 FPS):
 * - Dual-hemisphere anatomical brain point cloud + cerebellum
 * - Real-time regional firing glow mapped to Muse 2 electrodes (AF7, AF8, TP9, TP10)
 * - Animated 3D curved synaptic coherence arcs showing brain regions talking in real time
 * - Drag to orbit 360° + Auto-Orbit toggle + Band filter (Dominant, Alpha, Beta, Theta, Gamma, Delta)
 * - Live Scrolling Spectrogram Waterfall Heatmap + Frontal Alpha Asymmetry readout
 */
(() => {
  const canvas = document.getElementById("brain3d-canvas");
  const specCanvas = document.getElementById("spectrogram-canvas");
  if (!canvas) return;

  const ui = {
    selBand: document.getElementById("sel-brain3d-band"),
    chkOrbit: document.getElementById("chk-brain3d-orbit"),
    chkArcs: document.getElementById("chk-brain3d-arcs"),
    asymVal: document.getElementById("brain3d-asym-val"),
    asymFill: document.getElementById("brain3d-asym-fill"),
    cohList: document.getElementById("brain3d-coh-list"),
    lobeSummary: document.getElementById("brain3d-lobe-summary"),
  };

  const BAND_COLORS = {
    delta: [94, 92, 230],
    theta: [48, 213, 200],
    alpha: [48, 209, 88],
    beta:  [255, 159, 10],
    gamma: [255, 55, 95],
  };

  // 3D Anatomical Sensor Anchors (normalized brain space: x=L/R, y=Up/Down, z=Front/Back)
  const SENSORS = {
    AF7:  { x: -0.44, y: 0.14, z: 0.78, label: "AF7 · Left Frontal" },
    AF8:  { x:  0.44, y: 0.14, z: 0.78, label: "AF8 · Right Frontal" },
    TP9:  { x: -0.82, y: -0.18, z: -0.30, label: "TP9 · Left Temporal" },
    TP10: { x:  0.82, y: -0.18, z: -0.30, label: "TP10 · Right Temporal" },
  };

  const COH_PAIRS = [
    { key: "AF7-AF8",   a: "AF7", b: "AF8",  name: "Frontal Sync (L↔R)" },
    { key: "TP9-TP10",  a: "TP9", b: "TP10", name: "Temporal Sync (L↔R)" },
    { key: "AF7-TP9",   a: "AF7", b: "TP9",  name: "Left Hemisphere" },
    { key: "AF8-TP10",  a: "AF8", b: "TP10", name: "Right Hemisphere" },
    { key: "AF7-TP10",  a: "AF7", b: "TP10", name: "Cross-Cortex L→R" },
    { key: "AF8-TP9",   a: "AF8", b: "TP9",  name: "Cross-Cortex R→L" },
  ];

  // Generate ~820 anatomical dual-hemisphere cortex + cerebellum points
  const cortexPts = [];
  function buildBrainMesh() {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 360; i++) {
        // Fibonacci sphere distribution shaped into an anatomical cerebral hemisphere
        const u = (i + 0.5) / 360;
        const phi = Math.acos(1 - 2 * u);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        let sx = Math.sin(phi) * Math.cos(theta);
        let sy = Math.cos(phi);
        let sz = Math.sin(phi) * Math.sin(theta);

        // Flatten medial wall along longitudinal fissure & elongate front-to-back
        const medial = side > 0 ? Math.max(0.05, Math.abs(sx)) : -Math.max(0.05, Math.abs(sx));
        const x = medial * 0.78 + side * 0.08;
        const y = sy * 0.62 + (sz < -0.2 ? -0.08 : 0.05);
        const z = sz * 0.98;

        // Subtle gyri/sulci organic ripple
        const ripple = 1.0 + 0.045 * Math.sin(x * 11 + z * 9) * Math.cos(y * 10);
        const px = x * ripple, py = y * ripple, pz = z * ripple;

        // Find nearest Muse 2 electrode for live color/intensity blending
        let nearest = "AF7", bestD = 99;
        for (const [k, s] of Object.entries(SENSORS)) {
          const d = Math.hypot(px - s.x, py - s.y, pz - s.z);
          if (d < bestD) { bestD = d; nearest = k; }
        }
        cortexPts.push({ x: px, y: py, z: pz, sensor: nearest, dist: bestD, phase: Math.random() * 6.28 });
      }
    }
    // Cerebellum (back-bottom)
    for (let i = 0; i < 90; i++) {
      const u = (i + 0.5) / 90;
      const phi = Math.acos(1 - 2 * u);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const px = Math.sin(phi) * Math.cos(theta) * 0.52;
      const py = Math.cos(phi) * 0.25 - 0.54;
      const pz = Math.sin(phi) * Math.sin(theta) * 0.34 - 0.52;
      cortexPts.push({ x: px, y: py, z: pz, sensor: px < 0 ? "TP9" : "TP10", dist: 0.7, phase: Math.random() * 6.28 });
    }
  }
  buildBrainMesh();

  // Live neural telemetry
  const live = {
    channelBands: {},
    coherence: {},
    asymmetry: 0,
    focus: 0,
    calm: 0,
  };

  // Interactive 3D Orbit Camera
  let rotY = 0.45;
  let rotX = -0.22;
  let dragging = false;
  let lastMX = 0, lastMY = 0;
  let animTime = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    rotY += (e.clientX - lastMX) * 0.008;
    rotX = Math.max(-1.2, Math.min(1.2, rotX + (e.clientY - lastMY) * 0.008));
    lastMX = e.clientX; lastMY = e.clientY;
  });
  window.addEventListener("pointerup", () => { dragging = false; });

  // Cached HiDPI canvas dimensions
  let dims3d = null;
  function prep3D() {
    if (dims3d) return dims3d;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(280, Math.floor(rect.width));
    const h = Math.max(240, Math.floor(rect.height));
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dims3d = { ctx, w, h };
    return dims3d;
  }
  const invalidate = () => { dims3d = null; };
  window.addEventListener("resize", invalidate);
  document.querySelectorAll(".seg-tab").forEach((t) => t.addEventListener("click", invalidate));

  function project(x, y, z, w, h) {
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const y2 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;
    const fov = 3.2;
    const scale = Math.min(w, h) * 0.42 * (fov / (fov + z2 + 1.4));
    return { sx: w / 2 + x1 * scale, sy: h / 2 - y2 * scale, z: z2, scale };
  }

  function sensorActivity(sensorKey) {
    const cb = live.channelBands[sensorKey];
    const mode = ui.selBand?.value || "dominant";
    if (!cb) return { rgb: [48, 213, 200], intensity: 0.25, label: "idle" };
    if (mode !== "dominant") {
      const val = (cb[mode] || 0) / 55;
      return { rgb: BAND_COLORS[mode] || [48, 213, 200], intensity: Math.min(1, Math.max(0.15, val)), label: `${mode} ${Math.round(cb[mode] || 0)}%` };
    }
    let bestB = "alpha", bestV = -1;
    for (const [b, v] of Object.entries(cb)) {
      if (v > bestV) { bestV = v; bestB = b; }
    }
    return { rgb: BAND_COLORS[bestB] || [48, 213, 200], intensity: Math.min(1, Math.max(0.2, bestV / 55)), label: `${bestB} ${Math.round(bestV)}%` };
  }

  function drawBrain3D() {
    const { ctx, w, h } = prep3D();
    ctx.fillStyle = "#060811";
    ctx.fillRect(0, 0, w, h);

    // Subtle radial backdrop glow
    const bg = ctx.createRadialGradient(w / 2, h / 2, 12, w / 2, h / 2, Math.min(w, h) * 0.55);
    bg.addColorStop(0, "rgba(10, 132, 255, 0.14)");
    bg.addColorStop(0.6, "rgba(94, 92, 230, 0.06)");
    bg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    const acts = {};
    for (const k of Object.keys(SENSORS)) acts[k] = sensorActivity(k);

    // Project & depth-sort cortex nodes
    const projected = cortexPts.map((pt) => {
      const p = project(pt.x, pt.y, pt.z, w, h);
      return { ...p, sensor: pt.sensor, dist: pt.dist, phase: pt.phase };
    });
    projected.sort((a, b) => b.z - a.z);

    for (const pt of projected) {
      const act = acts[pt.sensor];
      const prox = Math.max(0.25, 1.0 - pt.dist * 0.65);
      const pulse = 0.78 + 0.22 * Math.sin(animTime * (2.5 + act.intensity * 4) + pt.phase);
      const depthAlpha = Math.max(0.14, Math.min(0.95, 0.62 - pt.z * 0.35));
      const [r, g, b] = act.rgb;
      const rad = Math.max(1.2, (1.6 + act.intensity * 2.2 * prox) * (pt.scale / 115));

      ctx.fillStyle = `rgba(${r},${g},${b},${(depthAlpha * (0.35 + act.intensity * 0.65) * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3D Curved Neural Coherence Arcs (Regions talking to each other!)
    if (ui.chkArcs?.checked !== false) {
      for (const pair of COH_PAIRS) {
        const coh = live.coherence[pair.key] || 0;
        if (coh < 0.2) continue;
        const sa = SENSORS[pair.a], sb = SENSORS[pair.b];
        const pa = project(sa.x, sa.y, sa.z, w, h);
        const pb = project(sb.x, sb.y, sb.z, w, h);
        const midX = (sa.x + sb.x) * 0.5, midY = (sa.y + sb.y) * 0.5 + 0.48, midZ = (sa.z + sb.z) * 0.5;
        const pm = project(midX, midY, midZ, w, h);

        ctx.strokeStyle = `rgba(48, 213, 200, ${(0.22 + coh * 0.7).toFixed(2)})`;
        ctx.lineWidth = 1.2 + coh * 2.8;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.quadraticCurveTo(pm.sx, pm.sy, pb.sx, pb.sy);
        ctx.stroke();

        // Traveling synaptic energy pulse along Bezier arc
        const t = (animTime * (0.6 + coh * 1.1)) % 1.0;
        const invT = 1 - t;
        const px = invT * invT * pa.sx + 2 * invT * t * pm.sx + t * t * pb.sx;
        const py = invT * invT * pa.sy + 2 * invT * t * pm.sy + t * t * pb.sy;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(px, py, 2.5 + coh * 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Render 4 glowing Muse 2 Electrode Beacon Labels
    for (const [k, s] of Object.entries(SENSORS)) {
      const p = project(s.x, s.y, s.z, w, h);
      const act = acts[k];
      const [r, g, b] = act.rgb;
      const halo = ctx.createRadialGradient(p.sx, p.sy, 2, p.sx, p.sy, 18 + act.intensity * 14);
      halo.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
      halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p.sx, p.sy, 18 + act.intensity * 14, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = "700 11px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      ctx.fillText(k, p.sx + 8, p.sy + 4);
    }

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 11px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
    ctx.fillText("Drag to rotate 360° · Bright arcs = high region-to-region coherence", 14, h - 12);
  }

  // --- Live Scrolling Spectrogram Waterfall (1-45 Hz over time) ---
  let specCtx = null;
  function pushSpectrogramColumn(spectrum) {
    if (!specCanvas || !spectrum || !spectrum.length) return;
    if (!specCtx) {
      specCanvas.width = 360;
      specCanvas.height = 135;
      specCtx = specCanvas.getContext("2d");
      specCtx.fillStyle = "#060811";
      specCtx.fillRect(0, 0, 360, 135);
    }
    const w = specCanvas.width, h = specCanvas.height;
    // Shift left by 2px
    specCtx.drawImage(specCanvas, -2, 0);
    const binH = h / spectrum.length;
    for (let i = 0; i < spectrum.length; i++) {
      const norm = Math.max(0, Math.min(1, (spectrum[i] + 2.5) / 4.8));
      // Magma/Aurora heatmap ramp
      const r = Math.round(Math.min(255, norm * norm * 320));
      const g = Math.round(Math.min(255, Math.max(0, (norm - 0.25) * 280)));
      const b = Math.round(Math.min(255, 40 + Math.sin(norm * Math.PI) * 215));
      specCtx.fillStyle = `rgb(${r},${g},${b})`;
      specCtx.fillRect(w - 2, h - (i + 1) * binH, 2, Math.ceil(binH));
    }
  }

  let lastTs = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    animTime += dt;
    const panel = document.getElementById("panel-brain3d");
    if (panel && !panel.classList.contains("hidden")) {
      if (!dragging && ui.chkOrbit?.checked !== false) rotY += dt * 0.28;
      drawBrain3D();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.BrainMuseum3D = {
    onFrame(frame) {
      if (frame.channel_bands) live.channelBands = frame.channel_bands;
      if (frame.coherence) live.coherence = frame.coherence;
      if (frame.asymmetry != null) live.asymmetry = frame.asymmetry;
      if (frame.metrics) { live.focus = frame.metrics.focus || 0; live.calm = frame.metrics.calm || 0; }
      if (frame.spectrum) pushSpectrogramColumn(frame.spectrum);

      // Update Frontal Alpha Asymmetry & Coherence HUD when visible
      const panel = document.getElementById("panel-brain3d");
      if (!panel || panel.classList.contains("hidden")) return;

      if (ui.asymVal) {
        const a = live.asymmetry;
        const lean = a > 3 ? "Right Alpha Dominant (Approach / Positive)" : a < -3 ? "Left Alpha Dominant (Reflective)" : "Balanced Hemispheres";
        ui.asymVal.textContent = `${a > 0 ? "+" : ""}${a.toFixed(1)}% · ${lean}`;
      }
      if (ui.asymFill) {
        const pct = Math.max(5, Math.min(95, 50 + live.asymmetry * 1.5));
        ui.asymFill.style.left = `${pct}%`;
      }
      if (ui.cohList) {
        ui.cohList.innerHTML = COH_PAIRS.map((p) => {
          const val = Math.round((live.coherence[p.key] || 0) * 100);
          return `<div class="band-row"><span class="band-name" style="font-size:0.75rem">${p.name}</span><div class="bar-track"><div class="bar-fill theta" style="width:${val}%"></div></div><span class="band-pct">${val}%</span></div>`;
        }).join("");
      }
      if (ui.lobeSummary) {
        ui.lobeSummary.innerHTML = Object.keys(SENSORS)
          .map((k) => {
            const act = sensorActivity(k);
            return `<span>${k} <b>${act.label}</b></span>`;
          })
          .join("");
      }
    },
  };
})();
