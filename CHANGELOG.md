# Changelog

All notable changes to **Brain Museum Studio** are documented in this file.

## `v0.0.1-alpha` (Pre-Release)

### Highlights
- **Native Linux & Cross-Platform Muse 2 BLE Driver (`bleak`):** Direct Bluetooth LE streaming for 4-channel EEG (256 Hz: `TP9`, `AF7`, `AF8`, `TP10`), 64 Hz optical PPG, 52 Hz Accelerometer/Gyroscope, and Battery telemetry, plus a built-in realistic **Simulator Mode**.
- **Apple + Google Inspired HiDPI Web Studio:** Frosted-glass segmented navigation, Obsidian Dark & Porcelain Light themes, Retina-crisp canvases, Activity Rings for Focus & Calm, and a context-aware interactive **Help Center** (`?`).
- **Real-Time Signal Processing (`numpy` + `scipy`):** Stateful Butterworth Notch (`60 Hz` / `50 Hz` / `Off`) and `1–45 Hz` Bandpass filters, live `1–45 Hz` FFT Power Spectrum, per-channel RMS (µV), Electrode Fit horseshoe, PPG Heart Rate (BPM), and Blink / Double-Blink / Jaw Clench / Head-Tilt detectors.
- **Neuro Lab:** 10-second Santa Cruz-style personal baseline calibration, Neural Levitation focus arena with harmonic Web Audio chimes, Hybrid Gyro+Brain Mind Cursor (with live Clutch/Gyro/Last-Action cockpit telemetry, Invert Y, 8°/s anti-drift deadzone, 1.5s click cooldown, `STOP OS (Esc)` emergency disarm, and throttled `ydotool` OS control), and a Row-Column Brainwave Virtual Keyboard with rising-edge Focus Surge protection and speech synthesis.
- **Games — *Neuro Runner: Cortex Kingdom*:** Mind-controlled Mario-style side-scrolling platformer starring **Musey** with 3 BCI control modes, Synapse Orbs, Noise Glitches, Alpha Stars, Focus 2× multiplier, and Web Audio SFX.
- **BCI Trigger Engine & OSC 1.0 Bridge:** Safe/Armed gesture automation (`playerctl`, `xdotool`, webhooks, OSC) and zero-dependency UDP OSC streaming for MuseLab, TouchDesigner, Ableton Live, Unity, and Godot.
- **Personal ML Lab & Session Recorder:** 24-feature EEG mental-state classifier with Leave-One-Out accuracy + live inference, and CSV/JSON session recording with custom event markers.
- **Cross-Platform Release Packaging:** Automated GitHub Actions builds for Linux (`x64`), macOS (`arm64`), Windows (`x64`), and Python wheels.
