"""Session recorder for Muse 2 EEG packets, band powers, and event markers.

Saves:
- `<session>_eeg.csv` — timestamped 4-channel EEG samples (uV)
- `<session>_summary.json` — metadata, band-power averages, heart rate stats, and markers
"""

from __future__ import annotations

import csv
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .protocol import EEG_CHANNELS


def _slugify(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip())
    return cleaned.strip("_") or "session"


class SessionRecorder:
    """Streams live Muse 2 EEG rows to CSV and tracks session metadata/markers."""

    def __init__(self, recordings_dir: Path) -> None:
        self.recordings_dir = recordings_dir
        self.recordings_dir.mkdir(parents=True, exist_ok=True)

        self.active: bool = False
        self.session_id: Optional[str] = None
        self.started_at: float = 0.0
        self.source_name: str = ""
        self._csv_file: Any = None
        self._csv_writer: Any = None
        self._eeg_rows: int = 0
        self._markers: List[Dict[str, Any]] = []
        self._band_snapshots: List[Dict[str, float]] = []
        self._hr_values: List[float] = []
        self._latest_eeg: Dict[str, float] = {ch: 0.0 for ch in EEG_CHANNELS}

    def start(self, label: str = "muse2", source_name: str = "unknown") -> Dict[str, Any]:
        if self.active:
            return self.status()

        ts_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        self.session_id = f"{ts_str}_{_slugify(label)}"
        self.started_at = time.time()
        self.source_name = source_name
        self._eeg_rows = 0
        self._markers = []
        self._band_snapshots = []
        self._hr_values = []
        self._latest_eeg = {ch: 0.0 for ch in EEG_CHANNELS}

        csv_path = self.recordings_dir / f"{self.session_id}_eeg.csv"
        self._csv_file = csv_path.open("w", newline="", encoding="utf-8")
        self._csv_writer = csv.writer(self._csv_file)
        self._csv_writer.writerow(["timestamp", "TP9", "AF7", "AF8", "TP10"])
        self.active = True
        return self.status()

    def write_eeg(self, channel: str, samples: List[float], ts: float) -> None:
        if not self.active or self._csv_writer is None:
            return
        if channel not in EEG_CHANNELS:
            return
        # Record aligned rows whenever TP10 arrives (last channel in packet cycle)
        if channel != "TP10":
            if samples:
                self._latest_eeg[channel] = samples[-1]
            return

        dt = 1.0 / 256.0
        base_ts = ts - dt * len(samples)
        for idx, val in enumerate(samples):
            self._latest_eeg["TP10"] = val
            row_ts = base_ts + idx * dt
            self._csv_writer.writerow(
                [
                    f"{row_ts:.6f}",
                    f"{self._latest_eeg['TP9']:.3f}",
                    f"{self._latest_eeg['AF7']:.3f}",
                    f"{self._latest_eeg['AF8']:.3f}",
                    f"{self._latest_eeg['TP10']:.3f}",
                ]
            )
            self._eeg_rows += 1

    def record_frame_summary(self, frame: Dict[str, Any]) -> None:
        if not self.active:
            return
        rel = frame.get("bands", {}).get("relative")
        if rel and any(v > 0 for v in rel.values()):
            self._band_snapshots.append(rel)
        hr = frame.get("metrics", {}).get("heart_rate_bpm")
        if hr is not None:
            self._hr_values.append(float(hr))
        for ev in frame.get("events", []):
            self._markers.append(ev)

    def add_marker(self, label: str) -> Optional[Dict[str, Any]]:
        marker = {
            "ts": round(time.time(), 3),
            "kind": "marker",
            "label": label.strip() or "Marker",
            "confidence": 1.0,
        }
        if self.active:
            self._markers.append(marker)
        return marker

    def stop(self) -> Dict[str, Any]:
        if not self.active:
            return {"active": False}

        duration_sec = round(time.time() - self.started_at, 2)
        if self._csv_file is not None:
            self._csv_file.flush()
            self._csv_file.close()
            self._csv_file = None
            self._csv_writer = None

        avg_bands: Dict[str, float] = {}
        if self._band_snapshots:
            keys = self._band_snapshots[0].keys()
            avg_bands = {
                k: round(sum(s[k] for s in self._band_snapshots) / len(self._band_snapshots), 2)
                for k in keys
            }

        summary = {
            "session_id": self.session_id,
            "source": self.source_name,
            "started_at_utc": datetime.fromtimestamp(self.started_at, tz=timezone.utc).isoformat(),
            "duration_sec": duration_sec,
            "eeg_samples_recorded": self._eeg_rows,
            "avg_relative_bands_pct": avg_bands,
            "avg_heart_rate_bpm": (
                round(sum(self._hr_values) / len(self._hr_values), 1)
                if self._hr_values
                else None
            ),
            "markers": self._markers,
            "csv_file": f"{self.session_id}_eeg.csv",
        }

        summary_path = self.recordings_dir / f"{self.session_id}_summary.json"
        summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

        self.active = False
        self.session_id = None
        return summary

    def status(self) -> Dict[str, Any]:
        return {
            "active": self.active,
            "session_id": self.session_id,
            "duration_sec": round(time.time() - self.started_at, 1) if self.active else 0.0,
            "samples": self._eeg_rows,
            "markers_count": len(self._markers),
        }

    def list_recordings(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for p in sorted(self.recordings_dir.glob("*_summary.json"), reverse=True):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                data["summary_file"] = p.name
                items.append(data)
            except Exception:
                continue
        return items
