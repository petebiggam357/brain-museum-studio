# Brain Museum Studio (`0.0.1-alpha`)

Native Linux (and cross-platform macOS/Windows) real-time **Muse 2** EEG & PPG dashboard, signal processor, BCI trigger engine, OSC bridge, and Personal ML lab.

## Features
- **Direct Muse 2 BLE Driver (`bleak`)**: Streams 4-channel EEG (256 Hz: `TP9`, `AF7`, `AF8`, `TP10`), optical PPG (64 Hz IR), 3-axis Accelerometer & Gyroscope (52 Hz), and Battery telemetry directly over BlueZ on Linux.
- **Built-in Simulator Mode**: Test Calm (Alpha), Focus (Beta), Drowsy (Theta), Eye Blinks, Jaw Clenches, and PPG heart rate immediately without wearing the headset.
- **Signal Quality & Real-Time DSP (`numpy` + `scipy`)**:
  - Stateful Butterworth **Notch Filter** (60 Hz / 50 Hz / Off) and **1–45 Hz Bandpass Filter**
  - Band powers (`Delta`, `Theta`, `Alpha`, `Beta`, `Gamma`) + live 1–45 Hz FFT spectrum
  - Focus & Calm indices + 4-electrode Horseshoe fit + per-channel RMS (µV)
  - Blink, Double-Blink, Jaw Clench, and Head Tilt Left/Right detection
  - PPG Heart Rate (BPM) estimator
- **Neuro Lab**: 10-second personal baseline calibration, Neural Levitation focus arena with harmonic audio feedback, Hybrid Gyro+Brain cursor sandbox (+ opt-in Wayland/X11 OS mouse), and a Row-Column Brainwave Virtual Keyboard with speech synthesis.
- **Games — Neuro Runner: Cortex Kingdom**: Mind-controlled Mario-style side-scrolling platformer starring **Musey** (Blink/Jaw to jump, Focus Zone to glide, magnetize Synapse Orbs, stomp Noise Glitches, and collect Alpha Stars for 2× multiplier & shield).
- **BCI Controls & Triggers**: Map gestures to OSC messages, HTTP webhooks, Linux media controls (`playerctl`), or keystrokes (`xdotool`), with a Safe/Armed toggle.
- **Cross-Platform OSC Bridge**: Zero-dependency UDP OSC broadcaster compatible with MuseLab, TouchDesigner, Ableton Live, Unity, Godot, and Max/MSP.
- **Personal ML Lab**: Capture labeled EEG snapshots, train a personal mental state classifier with leave-one-out accuracy, and see live state predictions.
- **Session Recorder**: Saves timestamped 4-channel EEG `.csv` files + `.json` session summaries (including custom event markers) to `recordings/`.

## Quick Start
```bash
cd /media/ptah/Files/Muse/brain-museum-studio
./run.sh
```
Open **http://127.0.0.1:8765** in your browser.

## Run Tests
```bash
.venv/bin/python -m pytest -v
```
