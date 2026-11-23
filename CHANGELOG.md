# Changelog

All notable changes to **Brain Museum Studio** are documented in this file.

## `v0.0.4` — Self-Contained Linux AppImage PyQt6 Bundling & Auto-Port Fix

### Fixed
- **Linux AppImage Native Window (`PyQt6` + `QtWebEngine`):** Explicitly bundled `PyQt6`, `PyQt6.QtWebEngineWidgets`, and `webview.platforms.qt` in PyInstaller (`--collect-all PyQt6`) and pinned `QT_API=pyqt6` / `PYWEBVIEW_GUI=qt` so `BrainMuseumStudio-x86_64.AppImage` launches directly in its own native desktop app window without `No Qt bindings could be found`.
- **Automatic Free-Port Fallback:** Always picks an available local port if `8765` is already in use, preventing `[Errno 98] address already in use`.

## `v0.0.3` — Expanded Zen Meditation & Enlightenment Sanctuary

### New
- **Multi-Stage Binaural Frequency Journeys:** Smoothly ramp your stereo binaural beats across the session (*Gateway to Stillness* `12→5.5→10 Hz`, *Non-Dual Insight* `10→4.5→40→10 Hz`, *Deep Sleep Descent* `10→6→2 Hz`), plus **Custom Solfeggio Carrier (`110–432 Hz`) & Beat (`1–42 Hz`)** sliders.
- **Muse-Style Biofeedback Weather & Stillness Chimes:** Ocean/wind gently quiets as your Muse 2 Calm rises, singing-bowl resonance warms, and crystalline stereo chimes blossom when you hold Deep Stillness streaks.
- **2 New Fullscreen Zen Scenes (6 Total):** Added *Temple Lanterns* and *Cosmic Flower of Life* alongside *Aurora Cosmos*, *Kyoto Moon Pond*, *Breathing Mandala*, and *Misty Mountain Dawn*.
- **Coherent 5.5s HRV Breath Pacer, Guided Contemplative Cues, & Interval Bells** (`Every 2m` / `Every 5m`).
- **Post-Session Stillness Reflection & Meditation Journal:** Tracks Duration, Stillness %, Peak Streak, Chimes Earned, and saves personal reflection notes locally.

## `v0.0.2` — Self-Contained Native Desktop App & Full AppImage Icon

### New
- **Dedicated Native Desktop App Window (`pywebview`):** Standalone releases (`BrainMuseumStudio-x86_64.AppImage`, macOS, and Windows `.exe`) now launch inside their own native desktop window with the Brain Museum Studio icon — no browser tab or console window required! (Pass `--browser` anytime if you still want to open it in a browser.)
- **Native App Icons Everywhere:** Added 256×256 PNG (`packaging/brain-museum-studio.png`), multi-size Windows ICO (`packaging/brain-museum-studio.ico`), and proper Linux AppImage `.DirIcon` + hicolor icon integration so your desktop dock and launcher show the Brain Museum Studio icon cleanly.

## `v0.0.1` — First Public Release

### Highlights
- **Native Linux & Cross-Platform Muse 2 BLE Driver (`bleak`):** Direct Bluetooth LE streaming for 4-channel EEG (256 Hz: `TP9`, `AF7`, `AF8`, `TP10`), 64 Hz optical PPG, 52 Hz Accelerometer/Gyroscope, and Battery telemetry, plus a built-in realistic **Simulator Mode**.
- **Apple + Google Inspired HiDPI Web Studio:** Frosted-glass segmented navigation, Obsidian Dark & Porcelain Light themes, Retina-crisp canvases, Activity Rings for Focus & Calm, and a context-aware interactive **Help Center** (`?`).
- **Real-Time Signal Processing (`numpy` + `scipy`):** Stateful Butterworth Notch (`60 Hz` / `50 Hz` / `Off`) and `1–45 Hz` Bandpass filters, live `1–45 Hz` FFT Power Spectrum, per-channel RMS (µV), Electrode Fit horseshoe, PPG Heart Rate (BPM), and Blink / Double-Blink / Jaw Clench / Head-Tilt detectors.
- **Neuro Lab:** 10-second Santa Cruz-style personal baseline calibration, Neural Levitation focus arena with harmonic Web Audio chimes, Hybrid Gyro+Brain Mind Cursor (with live Clutch/Gyro/Last-Action cockpit telemetry, Invert Y, 8°/s anti-drift deadzone, 1.5s click cooldown, `STOP OS (Esc)` emergency disarm, and throttled `ydotool` OS control), and a Row-Column Brainwave Virtual Keyboard with rising-edge Focus Surge protection and speech synthesis.
- **Zen Meditation Room (Binaural Beats + Fullscreen Sanctuary):** True stereo Web Audio binaural beat synthesizer (Delta `2.5 Hz`, Theta `6.0 Hz`, Schumann `7.83 Hz`, Alpha `10.0 Hz`, Gamma `40.0 Hz`), procedural ocean wash & biofeedback singing-bowl drone, 4 fullscreen-capable animated Zen scenes (*Aurora Cosmos*, *Kyoto Moon Pond*, *Breathing Mandala*, *Misty Mountain Dawn*), guided Box & 4-7-8 breath pacer, and session timer.
- **Brain Museum Arcade (3 Playable Mind-Controlled Games with Web Audio SFX):**
  - *Neuro Runner: Cortex Kingdom* — Mario-style side-scrolling platformer starring **Musey** with 3 BCI control modes, Synapse Orbs, Noise Glitches, Alpha Stars, and Focus 2× multiplier.
  - *Alpha Zen Garden* — Calm/Alpha neurofeedback botanical koi pond with blooming lotuses, fireflies, water ripples, and generative pentatonic chimes.
  - *Blink Breakout* — Head-Gyro/Tilt neon paddle arcade with Blink/Jaw Twin Lasers, ascending pentatonic brick-hit audio, and Focus Wide-Paddle + Piercing Power Ball.
- **BCI Trigger Engine & OSC 1.0 Bridge:** Safe/Armed gesture automation (`playerctl`, `xdotool`, webhooks, OSC) and zero-dependency UDP OSC streaming for MuseLab, TouchDesigner, Ableton Live, Unity, and Godot.
- **Personal ML Lab & Session Recorder:** 24-feature EEG mental-state classifier with Leave-One-Out accuracy + live inference, and CSV/JSON session recording with custom event markers.
- **Cross-Platform Release Packaging:** Automated GitHub Actions builds for **Linux AppImage (`BrainMuseumStudio-x86_64.AppImage`)**, Linux (`x64` tarball), macOS (`arm64`), Windows (`x64` zip), and Python wheels.
