"""Real-time DSP engine for Muse 2 EEG, PPG, and IMU streams.

Features:
- Real-time stateful Butterworth Notch (50/60 Hz) & Bandpass (1-45 Hz) filters
- Band powers (Delta, Theta, Alpha, Beta, Gamma) + 1-45 Hz FFT spectrum
- Per-channel band features (24-dim vector) for Personal ML state classification
- Cognitive indices (Focus, Calm) & electrode contact quality
- Event detection: Blink, Double-Blink, Jaw Clench, Head Tilt Left/Right
- PPG Heart Rate (BPM) estimation
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional, Tuple

import numpy as np
from scipy.signal import butter, iirnotch, sosfilt, sosfilt_zi, tf2sos

from .protocol import EEG_CHANNELS, EEG_SAMPLE_RATE, PPG_SAMPLE_RATE

BANDS: Dict[str, Tuple[float, float]] = {
    "delta": (1.0, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 44.0),
}


@dataclass(slots=True)
class DetectedEvent:
    timestamp: float
    kind: str  # "blink" | "double_blink" | "jaw_clench" | "head_tilt_left" | "head_tilt_right" | "marker"
    label: str
    confidence: float = 1.0


class _ChannelFilterBank:
    """Stateful IIR Notch + Bandpass filter bank for one EEG channel."""

    def __init__(self, fs: float, notch_hz: Optional[float], bandpass: bool) -> None:
        self.fs = fs
        self.notch_hz = notch_hz
        self.bandpass = bandpass
        self._notch_sos: Optional[np.ndarray] = None
        self._notch_zi: Optional[np.ndarray] = None
        self._bp_sos: Optional[np.ndarray] = None
        self._bp_zi: Optional[np.ndarray] = None
        self._initialized = False
        self._build()

    def _build(self) -> None:
        if self.notch_hz in (50.0, 60.0):
            b, a = iirnotch(self.notch_hz, Q=30.0, fs=self.fs)
            self._notch_sos = tf2sos(b, a)
        else:
            self._notch_sos = None

        if self.bandpass:
            self._bp_sos = butter(4, [1.0, 45.0], btype="bandpass", fs=self.fs, output="sos")
        else:
            self._bp_sos = None

        self._notch_zi = None
        self._bp_zi = None
        self._initialized = False

    def process(self, samples: np.ndarray) -> np.ndarray:
        y = samples.astype(np.float64, copy=True)
        if not self._initialized and len(y) > 0:
            x0 = float(y[0])
            if self._notch_sos is not None:
                self._notch_zi = sosfilt_zi(self._notch_sos) * x0
            if self._bp_sos is not None:
                self._bp_zi = sosfilt_zi(self._bp_sos) * x0
            self._initialized = True

        if self._notch_sos is not None and self._notch_zi is not None:
            y, self._notch_zi = sosfilt(self._notch_sos, y, zi=self._notch_zi)
        if self._bp_sos is not None and self._bp_zi is not None:
            y, self._bp_zi = sosfilt(self._bp_sos, y, zi=self._bp_zi)
        return y


class SignalProcessor:
    """Stateful real-time ring-buffer DSP engine for Muse 2 streams."""

    def __init__(
        self,
        eeg_window_sec: float = 2.0,
        ppg_window_sec: float = 8.0,
    ) -> None:
        self.eeg_fs = EEG_SAMPLE_RATE
        self.ppg_fs = PPG_SAMPLE_RATE
        self.eeg_len = int(eeg_window_sec * self.eeg_fs)  # 512 samples
        self.ppg_len = int(ppg_window_sec * self.ppg_fs)  # 512 samples

        self.notch_hz: Optional[float] = 60.0  # 60.0, 50.0, or None
        self.bandpass_enabled: bool = True

        self._filters: Dict[str, _ChannelFilterBank] = {}
        self._rebuild_filters()

        self._eeg_buffers: Dict[str, Deque[float]] = {
            ch: deque(maxlen=self.eeg_len) for ch in EEG_CHANNELS
        }
        self._eeg_raw_buffers: Dict[str, Deque[float]] = {
            ch: deque(maxlen=128) for ch in EEG_CHANNELS
        }
        self._eeg_pending: Dict[str, List[float]] = {ch: [] for ch in EEG_CHANNELS}

        self._ppg_ir: Deque[float] = deque(maxlen=self.ppg_len)
        self._ppg_pending: List[float] = []

        self._accel: Tuple[float, float, float] = (0.0, 0.0, 1.0)
        self._gyro: Tuple[float, float, float] = (0.0, 0.0, 0.0)
        self._battery_pct: Optional[float] = None

        self._last_blink_ts: float = 0.0
        self._prev_blink_ts: float = 0.0
        self._last_double_blink_ts: float = 0.0
        self._last_jaw_ts: float = 0.0
        self._last_tilt_ts: float = 0.0
        self._events: List[DetectedEvent] = []

        # Precompute FFT window and frequency bins for 512-sample EEG buffer
        self._hann = np.hanning(self.eeg_len)
        self._freqs = np.fft.rfftfreq(self.eeg_len, d=1.0 / self.eeg_fs)
        self._band_masks = {
            name: (self._freqs >= lo) & (self._freqs < hi)
            for name, (lo, hi) in BANDS.items()
        }
        self._last_spectrum: List[float] = [0.0] * 45
        self._last_feature_vec: Optional[List[float]] = None

    def _rebuild_filters(self) -> None:
        self._filters = {
            ch: _ChannelFilterBank(self.eeg_fs, self.notch_hz, self.bandpass_enabled)
            for ch in EEG_CHANNELS
        }

    def configure_filters(
        self,
        notch_hz: Optional[float] = None,
        bandpass: Optional[bool] = None,
        set_notch: bool = False,
    ) -> Dict[str, Any]:
        if set_notch:
            self.notch_hz = notch_hz if notch_hz in (50.0, 60.0) else None
        if bandpass is not None:
            self.bandpass_enabled = bool(bandpass)
        self._rebuild_filters()
        return self.filter_config()

    def filter_config(self) -> Dict[str, Any]:
        return {
            "notch_hz": self.notch_hz,
            "bandpass": self.bandpass_enabled,
        }

    def reset(self) -> None:
        for ch in EEG_CHANNELS:
            self._eeg_buffers[ch].clear()
            self._eeg_raw_buffers[ch].clear()
            self._eeg_pending[ch].clear()
        self._ppg_ir.clear()
        self._ppg_pending.clear()
        self._events.clear()
        self._battery_pct = None
        self._last_spectrum = [0.0] * 45
        self._last_feature_vec = None
        self._rebuild_filters()

    def push_eeg(self, channel: str, samples: List[float], ts: Optional[float] = None) -> None:
        if channel not in self._eeg_buffers:
            return
        now = ts if ts is not None else time.time()
        raw_arr = np.asarray(samples, dtype=np.float64)
        self._eeg_raw_buffers[channel].extend(samples)

        filtered = self._filters[channel].process(raw_arr)
        filt_list = filtered.tolist()
        self._eeg_buffers[channel].extend(filt_list)
        self._eeg_pending[channel].extend(filt_list)

        # Blink & Double-Blink detection on frontal channels (AF7 / AF8)
        if channel in ("AF7", "AF8") and (now - self._last_blink_ts) > 0.35:
            buf = self._eeg_raw_buffers[channel]
            if len(buf) >= 48:
                baseline = float(np.median(list(buf)[-48:]))
                peak_dev = float(np.max(np.abs(raw_arr - baseline)))
                if 135.0 < peak_dev < 850.0:
                    gap = now - self._prev_blink_ts
                    self._prev_blink_ts = self._last_blink_ts
                    self._last_blink_ts = now
                    self._events.append(
                        DetectedEvent(
                            timestamp=now,
                            kind="blink",
                            label=f"Eye Blink ({channel})",
                            confidence=min(1.0, peak_dev / 260.0),
                        )
                    )
                    # Double-blink if two blinks happen within 0.35s..0.95s
                    if 0.30 <= gap <= 0.95 and (now - self._last_double_blink_ts) > 1.2:
                        self._last_double_blink_ts = now
                        self._events.append(
                            DetectedEvent(
                                timestamp=now,
                                kind="double_blink",
                                label="Double Blink",
                                confidence=0.95,
                            )
                        )

    def push_ppg(self, channel: str, samples: List[int]) -> None:
        if channel == "PPG2":
            floats = [float(s) for s in samples]
            self._ppg_ir.extend(floats)
            self._ppg_pending.extend(floats)

    def push_accel(self, samples: List[Tuple[float, float, float]]) -> None:
        if not samples:
            return
        self._accel = samples[-1]
        ax, ay, _az = self._accel
        now = time.time()
        # Head tilt gesture detection (lateral roll on X/Y > 0.42g with 1.5s cooldown)
        if (now - self._last_tilt_ts) > 1.5:
            if ay > 0.42:
                self._last_tilt_ts = now
                self._events.append(
                    DetectedEvent(timestamp=now, kind="head_tilt_right", label="Head Tilt Right", confidence=min(1.0, ay))
                )
            elif ay < -0.42:
                self._last_tilt_ts = now
                self._events.append(
                    DetectedEvent(timestamp=now, kind="head_tilt_left", label="Head Tilt Left", confidence=min(1.0, abs(ay)))
                )

    def push_gyro(self, samples: List[Tuple[float, float, float]]) -> None:
        if samples:
            self._gyro = samples[-1]

    def push_battery(self, battery_pct: float) -> None:
        self._battery_pct = battery_pct

    def compute_band_powers(self) -> Dict[str, Dict[str, float]]:
        """Return absolute (log10 uV^2/Hz) & relative (%) band powers, plus FFT spectrum & ML features."""
        abs_acc = {b: [] for b in BANDS}
        rel_acc = {b: [] for b in BANDS}
        per_channel_rel: Dict[str, Dict[str, float]] = {}
        high_emg_power: List[float] = []
        psd_stack: List[np.ndarray] = []

        for ch in EEG_CHANNELS:
            buf = self._eeg_buffers[ch]
            if len(buf) < self.eeg_len:
                continue
            sig = np.asarray(buf, dtype=np.float64)
            sig = sig - np.mean(sig)
            spec = np.abs(np.fft.rfft(sig * self._hann)) ** 2
            psd = spec / (self.eeg_fs * np.sum(self._hann**2))
            psd_stack.append(psd)

            total_power = float(
                np.sum(psd[(self._freqs >= 1.0) & (self._freqs < 44.0)])
            ) + 1e-12

            ch_rel: Dict[str, float] = {}
            for bname, mask in self._band_masks.items():
                bp = float(np.sum(psd[mask])) + 1e-12
                abs_acc[bname].append(float(np.log10(bp)))
                rel_pct = 100.0 * bp / total_power
                rel_acc[bname].append(rel_pct)
                ch_rel[bname] = rel_pct
            per_channel_rel[ch] = ch_rel

            if ch in ("TP9", "TP10"):
                emg_mask = (self._freqs >= 35.0) & (self._freqs <= 55.0)
                high_emg_power.append(float(np.mean(psd[emg_mask])))

        # Update 1-45 Hz binned FFT spectrum (log10 PSD)
        if psd_stack:
            mean_psd = np.mean(psd_stack, axis=0)
            bins: List[float] = []
            for hz in range(1, 46):
                mask = (self._freqs >= hz - 0.5) & (self._freqs < hz + 0.5)
                val = float(np.mean(mean_psd[mask])) if np.any(mask) else 1e-12
                bins.append(round(float(np.log10(val + 1e-12)), 3))
            self._last_spectrum = bins

        # Jaw clench detection (high-frequency EMG burst on temporal channels)
        now = time.time()
        if high_emg_power and (now - self._last_jaw_ts) > 1.2:
            mean_emg = float(np.mean(high_emg_power))
            if mean_emg > 35.0:
                self._last_jaw_ts = now
                self._events.append(
                    DetectedEvent(
                        timestamp=now,
                        kind="jaw_clench",
                        label="Jaw Clench",
                        confidence=min(1.0, mean_emg / 100.0),
                    )
                )

        if not abs_acc["alpha"]:
            empty = {b: 0.0 for b in BANDS}
            return {"absolute": empty, "relative": empty}

        rel_mean = {b: round(float(np.mean(v)), 1) for b, v in rel_acc.items()}
        abs_mean = {b: round(float(np.mean(v)), 3) for b, v in abs_acc.items()}

        # Build 24-dim feature vector for Personal ML classifier if all 4 channels are ready
        if len(per_channel_rel) == len(EEG_CHANNELS):
            vec: List[float] = []
            for ch in EEG_CHANNELS:
                for b in BANDS:
                    vec.append(per_channel_rel[ch][b])
            alpha = rel_mean["alpha"] + 1e-3
            beta = rel_mean["beta"] + 1e-3
            theta = rel_mean["theta"] + 1e-3
            delta = rel_mean["delta"] + 1e-3
            vec.extend([beta / (alpha + theta), alpha / (beta + theta), theta / delta, beta / alpha])
            self._last_feature_vec = [round(v, 4) for v in vec]

        return {"absolute": abs_mean, "relative": rel_mean}

    def get_latest_feature_vector(self) -> Optional[List[float]]:
        return self._last_feature_vec

    def compute_signal_quality(self) -> Dict[str, int]:
        """Estimate electrode fit quality per channel: 2=Good, 1=Fair, 0=Poor."""
        quality: Dict[str, int] = {}
        for ch in EEG_CHANNELS:
            buf = self._eeg_buffers[ch]
            if len(buf) < 64:
                quality[ch] = 0
                continue
            arr = np.asarray(list(buf)[-128:], dtype=np.float64)
            std = float(np.std(arr))
            if std < 1.5 or std > 350.0:
                quality[ch] = 0
            elif std > 120.0:
                quality[ch] = 1
            else:
                quality[ch] = 2
        return quality

    def compute_channel_rms(self) -> Dict[str, float]:
        rms: Dict[str, float] = {}
        for ch in EEG_CHANNELS:
            buf = self._eeg_buffers[ch]
            if len(buf) < 32:
                rms[ch] = 0.0
            else:
                arr = np.asarray(list(buf)[-128:], dtype=np.float64)
                rms[ch] = round(float(np.sqrt(np.mean(arr**2))), 1)
        return rms

    def compute_heart_rate_bpm(self) -> Optional[float]:
        """Estimate heart rate (BPM) from the 8-second PPG IR ring buffer."""
        if len(self._ppg_ir) < int(4.0 * self.ppg_fs):
            return None

        sig = np.asarray(self._ppg_ir, dtype=np.float64)
        win = max(5, int(0.75 * self.ppg_fs))
        kernel = np.ones(win) / win
        trend = np.convolve(sig, kernel, mode="same")
        ac = sig - trend
        smooth_k = np.ones(7) / 7.0
        ac = np.convolve(ac, smooth_k, mode="same")[win:-win]
        if len(ac) < 64:
            return None

        std = float(np.std(ac))
        if std < 1e-6:
            return None

        min_dist = int(0.38 * self.ppg_fs)
        thresh = 0.45 * std
        peaks: List[int] = []
        i = 1
        while i < len(ac) - 1:
            if ac[i] > thresh and ac[i] >= ac[i - 1] and ac[i] >= ac[i + 1]:
                if not peaks or (i - peaks[-1]) >= min_dist:
                    peaks.append(i)
                    i += min_dist
                    continue
            i += 1

        if len(peaks) < 3:
            return None

        intervals = np.diff(peaks) / self.ppg_fs
        valid = intervals[(intervals >= 0.375) & (intervals <= 1.5)]
        if len(valid) < 2:
            return None

        bpm = 60.0 / float(np.median(valid))
        return round(bpm, 1)

    def drain_frame(self) -> Dict[str, Any]:
        """Pop pending waveform chunks and compute current snapshot for WebSocket streaming."""
        eeg_chunks: Dict[str, List[float]] = {}
        for ch in EEG_CHANNELS:
            raw = self._eeg_pending[ch]
            self._eeg_pending[ch] = []
            eeg_chunks[ch] = [round(v, 2) for v in raw[::2]]

        ppg_raw = self._ppg_pending
        self._ppg_pending = []
        if ppg_raw and len(self._ppg_ir) >= 16:
            mean_ir = float(np.mean(list(self._ppg_ir)[-64:]))
            ppg_chunk = [round(v - mean_ir, 1) for v in ppg_raw]
        else:
            ppg_chunk = []

        bands = self.compute_band_powers()
        rel = bands["relative"]
        alpha = rel.get("alpha", 0.0)
        beta = rel.get("beta", 0.0)
        theta = rel.get("theta", 0.0)

        focus_raw = beta / (alpha + theta + 1e-6)
        calm_raw = alpha / (beta + theta + 1e-6)
        focus_score = round(min(100.0, max(0.0, focus_raw * 55.0)), 1)
        calm_score = round(min(100.0, max(0.0, calm_raw * 60.0)), 1)

        events = [
            {
                "ts": round(e.timestamp, 3),
                "kind": e.kind,
                "label": e.label,
                "confidence": round(e.confidence, 2),
            }
            for e in self._events
        ]
        self._events.clear()

        return {
            "ts": round(time.time(), 3),
            "eeg": eeg_chunks,
            "ppg": ppg_chunk,
            "bands": bands,
            "spectrum": self._last_spectrum,
            "filters": self.filter_config(),
            "metrics": {
                "focus": focus_score,
                "calm": calm_score,
                "heart_rate_bpm": self.compute_heart_rate_bpm(),
                "battery_pct": self._battery_pct,
            },
            "quality": self.compute_signal_quality(),
            "rms": self.compute_channel_rms(),
            "imu": {
                "accel": [round(v, 3) for v in self._accel],
                "gyro": [round(v, 2) for v in self._gyro],
            },
            "events": events,
        }
