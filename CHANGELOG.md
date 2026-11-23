# Changelog

All notable changes to **Brain Museum Studio** are documented in this file.

## `v0.0.1-alpha` (Pre-Release)

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
