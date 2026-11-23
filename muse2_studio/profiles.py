"""Multi-User Brain Profile Manager for Brain Museum Studio.

Stores personalized calibration baselines (focus/calm thresholds, neutral head tilt)
per user profile so multiple people can share one Muse 2 headset without overwriting
each other's tuned settings.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", name.strip().lower()).strip("_")
    return s or "default"


class ProfileManager:
    """Persists multi-user brain profiles in config/profiles.json."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.active_id: str = "default"
        self.profiles: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _default_profile(self, pid: str, name: str) -> Dict[str, Any]:
        return {
            "id": pid,
            "name": name,
            "calibrated": False,
            "calibrated_at": None,
            "focus_baseline": 35.0,
            "calm_baseline": 35.0,
            "focus_threshold": 50.0,
            "neutral_tilt": 0.0,
            "last_device_address": "",
            "last_device_name": "",
            "auto_connect": False,
        }

    def _load(self) -> None:
        if self.path.is_file():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self.profiles = data.get("profiles") or {}
                self.active_id = data.get("active_id") or "default"
            except Exception:
                self.profiles = {}
        if "default" not in self.profiles:
            self.profiles["default"] = self._default_profile("default", "Default Profile")
        if self.active_id not in self.profiles:
            self.active_id = "default"
        self._save()

    def _save(self) -> None:
        payload = {"active_id": self.active_id, "profiles": self.profiles}
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def active(self) -> Dict[str, Any]:
        return self.profiles[self.active_id]

    def create(self, name: str) -> Dict[str, Any]:
        clean = name.strip()
        if not clean:
            raise ValueError("Profile name cannot be empty")
        pid = _slug(clean)
        if pid not in self.profiles:
            self.profiles[pid] = self._default_profile(pid, clean)
        self.active_id = pid
        self._save()
        return self.status()

    def select(self, profile_id: str) -> Dict[str, Any]:
        if profile_id not in self.profiles:
            raise KeyError(f"Profile not found: {profile_id}")
        self.active_id = profile_id
        self._save()
        return self.status()

    def update_calibration(
        self,
        focus_baseline: float,
        calm_baseline: float,
        focus_threshold: float,
        neutral_tilt: float = 0.0,
    ) -> Dict[str, Any]:
        p = self.profiles[self.active_id]
        p["calibrated"] = True
        p["calibrated_at"] = round(time.time(), 1)
        p["focus_baseline"] = round(float(focus_baseline), 1)
        p["calm_baseline"] = round(float(calm_baseline), 1)
        p["focus_threshold"] = round(max(10.0, min(92.0, float(focus_threshold))), 1)
        p["neutral_tilt"] = round(float(neutral_tilt), 4)
        self._save()
        return self.status()

    def update_last_device(self, address: str, name: str, auto_connect: bool | None = None) -> Dict[str, Any]:
        p = self.profiles[self.active_id]
        if address:
            p["last_device_address"] = address
        if name:
            p["last_device_name"] = name
        if auto_connect is not None:
            p["auto_connect"] = bool(auto_connect)
        self._save()
        return self.status()

    def status(self) -> Dict[str, Any]:
        items: List[Dict[str, Any]] = list(self.profiles.values())
        return {
            "active_id": self.active_id,
            "active": self.active(),
            "profiles": items,
        }
