# Changelog

All notable changes to **Brain Museum Studio** are documented in this file.

## `v0.1.0-beta` — First Beta Release 🚀

**Brain Museum Studio graduates from Alpha (`0.0.x-alpha`) to Beta (`v0.1.0-beta`)!**

### Tightening & Performance Optimizations
- **Whisper-Quiet Long-Session CPU:** Throttled non-waveform DOM text/bar updates in [`app.js`](muse2_studio/static/app.js) (~5 Hz) and [`brain3d.js`](muse2_studio/static/brain3d.js) (~4 Hz) while keeping EEG, 3D Brain, Games, and Meditation canvases locked at silky 60 FPS.
- **Zero Zombie Subprocesses:** Added async daemon subprocess reaping (`_spawn_reaped`) in [`neuro_lab.py`](muse2_studio/neuro_lab.py) so `ydotool` / `wtype` / `xdotool` never leave `<defunct>` processes behind.
- **PWA & Browser Favicon Polish:** Bundled `static/icon.png` for crisp browser tab favicons and standalone PWA installs (`manifest.json`).
- **Expanded Verification:** 11/11 automated `pytest` tests passing in ~0.16s (covering BLE protocol, pure-NumPy biquad DSP, HRV RMSSD/coherence, OSC/LSL, BCI, Personal ML, Profiles, Neuro Lab, and Recorder) + verified cross-platform builds on Linux (`AppImage` + tarball), macOS (`arm64` `.app`), Windows (`x64` `.exe`), and Python wheel.

## `v0.0.9` — True PPG HRV & Coherence, Muse S / 2016 Support, LSL Outlet, Report PNG, Web BLE & MIT License

### New
- **True PPG HRV (RMSSD ms) & Heart–Breath Coherence (`dsp.py`, `bridge.py`):** Computes real beat-to-beat RMSSD and rhythmic heart coherence live in the Monitor, Meditation Sanctuary, and OSC (`/muse/ppg/hrv_rmssd`, `/muse/ppg/coherence`).
- **Shareable Brain Session Report Card PNG & Multi-Session Stillness Trends (`insights.js`):** 1-click export of a crisp 1200×630 PNG neural report card + multi-session stillness sparkline in **Studio+**.
- **Muse S & Muse 2016 Compatibility + Optional LSL Outlet (`device.py`, `bridge.py`):** Auto-detects PPG support (falling back to `p21` on Muse 2016) and adds an optional **Lab Streaming Layer (LSL)** 256 Hz EEG outlet for LabRecorder / MNE-Python (`pip install pylsl`).
- **Browser Web Bluetooth Quick-Pair + PWA Manifest (`manifest.json`) & Open-Source `MIT LICENSE`**, plus updated `macos-15` release runner.

## `v0.0.8` — Studio+ (Neuro-Synth + Web MIDI, Smart Home Bridge, Co-Meditation Synchrony, Session Replay & Saved Muse 2)

### New
- **Neuro-Synth (Brain-to-Music + Web MIDI Out):** Real-time generative Web Audio synth (5 scales including 432 Hz Zen) driven by Alpha (pad filter), Focus (arpeggio motion), and Blinks (harp accents) + **Web MIDI Out** (Notes + CC#74 + CC#1) for Ableton, Bitwig, Ardour, and hardware synths.
- **Smart Home Ambient Bridge:** Safe/Armed webhook automation for Home Assistant / Hue scenes when sustaining Deep Calm (`Calm ≥ 65%` for 8s) or Deep Focus (`Focus ≥ 65%` for 8s), with 1-click Test buttons.
- **2-Headband Co-Meditation Synchrony & Focus Tug-of-War:** Link a partner’s Brain Museum Studio over local Wi-Fi WebSocket (or try Demo Partner solo) for live **Brain-to-Brain Synchrony %** and a **2-Player Focus Tug-of-War**.
- **Recorded Session Replay (`▶ Replay`):** Stream any recorded EEG `.csv` back through the live Monitor, 3D Brain, and Spectrogram with one click.
- **Remember My Muse 2:** Automatically remembers your last paired Muse 2 headband per profile so **Connect** is ready immediately without re-scanning.

## `v0.0.7` — Interactive 3D Brain Visualizer, Guided Calibration Wizard, Multi-User Profiles & Ultra-Fast Boot

### New
- **3D Interactive Brain Tab (`brain3d.js`):** Real-time 360° rotatable dual-hemisphere holographic cortex showing live regional firing (`AF7`, `AF8`, `TP9`, `TP10`) by frequency band, animated **3D neural coherence arcs** showing brain regions talking to each other, **Frontal Alpha Asymmetry (`AF8 − AF7`)** balance gauge, and a **Scrolling Live Spectrogram Heatmap** (`1–45 Hz`).
- **4-Step Guided Calibration Wizard & Multi-User Brain Profiles (`profiles.py`, `studio_extras.js`):** Switch or create profiles in the top bar and run a guided Fit Check → 8s Calm Baseline → 8s Focus Baseline → Head Center setup persisted to `config/profiles.json`.
- **Neuro-Pomodoro Deep Work Sprint Timer:** 15/25/45-minute work sprint timer with live EEG Deep Work Focus Score.

### Performance
- **Zero-SciPy Pure-NumPy Biquad Filters (`dsp.py`):** Replaced heavy `scipy.signal` import with exact stateful biquad Notch & 1–45 Hz Bandpass filters and excluded `scipy`/`matplotlib`/`pytest` from PyInstaller bundles — shrinking AppImage size by ~70 MB and making startup noticeably faster!

## `v0.0.6` — 6-Game Brain Museum Arcade, Graphics Overhaul & Instant-Start AppImage

### New
- **3 New Mind-Controlled Games (6 Total, All with Web Audio SFX):**
  - **Focus Flight:** Aurora Canyon origami glider — raise Focus to climb, relax to glide, Blink/Space to flap through crystal pillars & golden Flow Rings.
  - **Synapse Invaders:** Head-Gyro/Tilt Neuro-Ship space defender — Blink/Jaw to fire Plasma Bolts and Focus Zone for Twin Hyper-Beam.
  - **Theta Memory Pulse:** 4-quadrant glowing Cortex Ring Simon sequence trainer with pentatonic audio and 2× Calm bonus.
- **Graphics Upgrade Across All 6 Games:** Twinkling starfields, multi-layer parallax skies, glowing comet/motion trails, swimming koi fish in *Alpha Zen Garden*, beveled neon glass bricks in *Blink Breakout*, and floating `+pts` score popups!
- **Instant-Start Linux AppImage (`--onedir`):** Eliminates `/tmp` double-extraction so `BrainMuseumStudio-x86_64.AppImage` launches in ~1–2 seconds!

## `v0.0.5` — Universal Linux GLIBC 2.35 AppImage, Chromeless App Fallback & Graphical Alerts

### Fixed
- **Universal Linux GLIBC Compatibility (`ubuntu-22.04`):** Built the Linux AppImage on Ubuntu 22.04 (glibc 2.35) instead of `ubuntu-latest` (glibc 2.42+), fixing `GLIBC_2.42 / GLIBC_2.43 not found` errors on Pop!_OS 24.04, Ubuntu 24.04, and other Linux distros.
- **Clean Host Environment for Subprocesses:** Strips PyInstaller's bundled `LD_LIBRARY_PATH` before spawning external browser/desktop commands so host tools (`xdg-open`, `flatpak`, `zenity`) never load mismatched shared libraries.
- **Chromeless `--app=` Window Fallback & Graphical Error Alerts:** If Qt/GTK is unavailable on an exotic distro, automatically opens a dedicated tabless desktop window via Chromium/Chrome/Brave (`--app=`) and displays native graphical error alerts (`zenity` / `kdialog` / `osascript` / `tkinter`) on startup failures.

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
