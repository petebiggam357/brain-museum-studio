"""Cross-platform OSC (Open Sound Control) UDP broadcaster & optional LSL bridge.

Zero external dependencies for OSC — implements OSC 1.0 packet encoding directly
so live Muse 2 EEG, band powers, PPG, IMU, and BCI events can stream to MuseLab,
TouchDesigner, Ableton Live, Unity, Godot, Max/MSP, or any custom app.
"""

from __future__ import annotations

import socket
import struct
from typing import Any, Dict, Iterable, List, Optional, Union

OscArg = Union[int, float, str]


def _pad4(data: bytes) -> bytes:
    rem = len(data) % 4
    return data if rem == 0 else data + b"\x00" * (4 - rem)


def encode_osc_message(address: str, *args: OscArg) -> bytes:
    """Encode an OSC 1.0 message into UDP-ready bytes."""
    if not address.startswith("/"):
        address = "/" + address
    addr_bytes = _pad4(address.encode("utf-8") + b"\x00")

    tags = [","]
    payload = bytearray()
    for arg in args:
        if isinstance(arg, bool):
            tags.append("i")
            payload.extend(struct.pack(">i", 1 if arg else 0))
        elif isinstance(arg, int):
            tags.append("i")
            payload.extend(struct.pack(">i", arg))
        elif isinstance(arg, float):
            tags.append("f")
            payload.extend(struct.pack(">f", arg))
        else:
            tags.append("s")
            payload.extend(_pad4(str(arg).encode("utf-8") + b"\x00"))

    tag_bytes = _pad4("".join(tags).encode("ascii") + b"\x00")
    return addr_bytes + tag_bytes + bytes(payload)


class OSCBridge:
    """Streams live Muse 2 telemetry & BCI events over UDP OSC."""

    def __init__(self, host: str = "127.0.0.1", port: int = 5000) -> None:
        self.host = host
        self.port = port
        self.enabled: bool = False
        self.packets_sent: int = 0
        self._sock: Optional[socket.socket] = None

    def configure(self, host: str, port: int, enabled: bool) -> Dict[str, Any]:
        self.host = host.strip() or "127.0.0.1"
        self.port = max(1, min(65535, int(port)))
        if enabled:
            self.start()
        else:
            self.stop()
        return self.status()

    def start(self) -> None:
        if self._sock is None:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.enabled = True

    def stop(self) -> None:
        self.enabled = False
        if self._sock is not None:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None

    def send(self, address: str, *args: OscArg) -> bool:
        if not self.enabled or self._sock is None:
            return False
        try:
            pkt = encode_osc_message(address, *args)
            self._sock.sendto(pkt, (self.host, self.port))
            self.packets_sent += 1
            return True
        except Exception:
            return False

    def broadcast_frame(self, frame: Dict[str, Any]) -> None:
        """Broadcast a full Muse 2 Studio telemetry frame using MuseLab-style OSC addresses."""
        if not self.enabled:
            return

        # Latest EEG sample across 4 channels
        eeg = frame.get("eeg", {})
        if all(eeg.get(ch) for ch in ("TP9", "AF7", "AF8", "TP10")):
            self.send(
                "/muse/eeg",
                float(eeg["TP9"][-1]),
                float(eeg["AF7"][-1]),
                float(eeg["AF8"][-1]),
                float(eeg["TP10"][-1]),
            )

        # Relative band powers
        rel = frame.get("bands", {}).get("relative", {})
        for band in ("delta", "theta", "alpha", "beta", "gamma"):
            if band in rel:
                self.send(f"/muse/elements/{band}_relative", float(rel[band]) / 100.0)

        # Metrics
        metrics = frame.get("metrics", {})
        if metrics.get("focus") is not None:
            self.send("/muse/metrics/focus", float(metrics["focus"]) / 100.0)
        if metrics.get("calm") is not None:
            self.send("/muse/metrics/calm", float(metrics["calm"]) / 100.0)
        if metrics.get("heart_rate_bpm") is not None:
            self.send("/muse/ppg/bpm", float(metrics["heart_rate_bpm"]))
        if metrics.get("hrv_rmssd_ms") is not None:
            self.send("/muse/ppg/hrv_rmssd", float(metrics["hrv_rmssd_ms"]))
        if metrics.get("hrv_coherence") is not None:
            self.send("/muse/ppg/coherence", float(metrics["hrv_coherence"]) / 100.0)

        # IMU
        imu = frame.get("imu", {})
        accel = imu.get("accel")
        if accel and len(accel) == 3:
            self.send("/muse/acc", float(accel[0]), float(accel[1]), float(accel[2]))
        gyro = imu.get("gyro")
        if gyro and len(gyro) == 3:
            self.send("/muse/gyro", float(gyro[0]), float(gyro[1]), float(gyro[2]))

        # ML prediction if present
        ml_pred = frame.get("ml_prediction")
        if ml_pred and ml_pred.get("label"):
            self.send("/muse/ml/state", str(ml_pred["label"]), float(ml_pred.get("confidence", 0.0)))

        # Events
        for ev in frame.get("events", []):
            kind = ev.get("kind", "")
            if kind in ("blink", "double_blink", "jaw_clench", "head_tilt_left", "head_tilt_right"):
                self.send(f"/muse/elements/{kind}", 1)

    def status(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "host": self.host,
            "port": self.port,
            "packets_sent": self.packets_sent,
        }


class LSLBridge:
    """Optional Lab Streaming Layer (LSL) 4-channel EEG outlet for researchers (LabRecorder / MNE-Python)."""

    def __init__(self) -> None:
        self.enabled: bool = False
        self.samples_pushed: int = 0
        self._outlet: Any = None
        try:
            import pylsl  # type: ignore  # noqa: F401
            self.available = True
        except ImportError:
            self.available = False

    def set_enabled(self, enabled: bool) -> Dict[str, Any]:
        if enabled and not self.available:
            self.enabled = False
            return self.status()
        if enabled and self._outlet is None:
            import pylsl  # type: ignore

            info = pylsl.StreamInfo("BrainMuseumEEG", "EEG", 4, 256, "float32", "brain_museum_muse2")
            self._outlet = pylsl.StreamOutlet(info)
            self.enabled = True
        elif not enabled:
            self.enabled = False
            self._outlet = None
        return self.status()

    def push_frame(self, frame: Dict[str, Any]) -> None:
        if not self.enabled or self._outlet is None:
            return
        eeg = frame.get("eeg", {})
        if not all(eeg.get(ch) for ch in ("TP9", "AF7", "AF8", "TP10")):
            return
        n = min(len(eeg["TP9"]), len(eeg["AF7"]), len(eeg["AF8"]), len(eeg["TP10"]))
        for i in range(n):
            self._outlet.push_sample([eeg["TP9"][i], eeg["AF7"][i], eeg["AF8"][i], eeg["TP10"][i]])
            self.samples_pushed += 1

    def status(self) -> Dict[str, Any]:
        return {
            "available": self.available,
            "enabled": self.enabled,
            "samples_pushed": self.samples_pushed,
        }
