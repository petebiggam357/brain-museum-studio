"""Neuro Lab — Personal Neurofeedback Calibration, Hybrid Brain+IMU Cursor, & OS Input Bridge.

Designed for Muse 2 on Linux (Wayland/COSMIC & X11) and cross-platform:
- 10-second resting baseline calibration (personalized Focus & Calm thresholds)
- Hybrid Cursor: Gyroscope steering + optional Focus-Clutch + Blink/Jaw/Focus clicks
- Opt-in OS Mouse & Keyboard bridge via ydotool (Wayland/COSMIC), wtype, or xdotool (X11)
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from typing import Any, Dict, List, Optional


class NeuroLabEngine:
    """Manages Neurofeedback calibration, hybrid cursor physics, and optional OS input."""

    def __init__(self) -> None:
        # Personal calibration state
        self.calibrating: bool = False
        self._cal_start_ts: float = 0.0
        self._cal_duration_sec: float = 10.0
        self._cal_focus_samples: List[float] = []
        self._cal_calm_samples: List[float] = []

        self.focus_baseline: float = 35.0
        self.calm_baseline: float = 35.0
        self.focus_threshold: float = 50.0
        self.calibrated: bool = False

        # Hybrid Cursor state (normalized 0.0 .. 1.0 in sandbox)
        self.cursor_x: float = 0.5
        self.cursor_y: float = 0.5
        self.cursor_enabled: bool = False
        self.focus_clutch: bool = False  # If True, cursor only moves when focus >= focus_threshold
        self.sensitivity: float = 1.0
        self.deadzone_dps: float = 4.0
        self.invert_x: bool = False
        self.invert_y: bool = False

        # Opt-in OS desktop control (always SAFE / False on boot)
        self.os_mouse_armed: bool = False
        self.os_keyboard_armed: bool = False

        # Neurofeedback streak stats
        self.in_zone: bool = False
        self._zone_enter_ts: Optional[float] = None
        self.current_streak_sec: float = 0.0
        self.best_streak_sec: float = 0.0

        # Detect Linux display session & available input tools
        self.session_type = os.environ.get("XDG_SESSION_TYPE", "unknown")
        self.desktop = os.environ.get("XDG_CURRENT_DESKTOP", "unknown")
        self._has_ydotool = shutil.which("ydotool") is not None
        self._has_wtype = shutil.which("wtype") is not None
        self._has_xdotool = shutil.which("xdotool") is not None
        self._move_proc: Optional[subprocess.Popen[Any]] = None

    def start_calibration(self, duration_sec: float = 10.0) -> Dict[str, Any]:
        self.calibrating = True
        self._cal_start_ts = time.time()
        self._cal_duration_sec = max(3.0, min(30.0, float(duration_sec)))
        self._cal_focus_samples = []
        self._cal_calm_samples = []
        return self.status()

    def recenter_cursor(self) -> Dict[str, Any]:
        self.cursor_x = 0.5
        self.cursor_y = 0.5
        return self.status()

    def configure(self, cfg: Dict[str, Any]) -> Dict[str, Any]:
        if "focus_threshold" in cfg and cfg["focus_threshold"] is not None:
            self.focus_threshold = max(5.0, min(95.0, float(cfg["focus_threshold"])))
        if "cursor_enabled" in cfg and cfg["cursor_enabled"] is not None:
            self.cursor_enabled = bool(cfg["cursor_enabled"])
        if "focus_clutch" in cfg and cfg["focus_clutch"] is not None:
            self.focus_clutch = bool(cfg["focus_clutch"])
        if "sensitivity" in cfg and cfg["sensitivity"] is not None:
            self.sensitivity = max(0.2, min(4.0, float(cfg["sensitivity"])))
        if "invert_x" in cfg and cfg["invert_x"] is not None:
            self.invert_x = bool(cfg["invert_x"])
        if "invert_y" in cfg and cfg["invert_y"] is not None:
            self.invert_y = bool(cfg["invert_y"])
        if "os_mouse_armed" in cfg and cfg["os_mouse_armed"] is not None:
            self.os_mouse_armed = bool(cfg["os_mouse_armed"])
        if "os_keyboard_armed" in cfg and cfg["os_keyboard_armed"] is not None:
            self.os_keyboard_armed = bool(cfg["os_keyboard_armed"])
        return self.status()

    def update(self, frame: Dict[str, Any], dt: float = 0.05) -> Dict[str, Any]:
        """Advance calibration, focus-zone streaks, and hybrid cursor physics at ~20 FPS."""
        now = time.time()
        metrics = frame.get("metrics", {})
        focus = float(metrics.get("focus") or 0.0)
        calm = float(metrics.get("calm") or 0.0)

        # 1. Baseline calibration
        cal_progress = 0.0
        if self.calibrating:
            elapsed = now - self._cal_start_ts
            cal_progress = min(1.0, elapsed / self._cal_duration_sec)
            if focus > 0:
                self._cal_focus_samples.append(focus)
            if calm > 0:
                self._cal_calm_samples.append(calm)
            if elapsed >= self._cal_duration_sec:
                self.calibrating = False
                if self._cal_focus_samples:
                    self.focus_baseline = round(
                        sum(self._cal_focus_samples) / len(self._cal_focus_samples), 1
                    )
                    self.focus_threshold = round(min(90.0, self.focus_baseline * 1.2), 1)
                if self._cal_calm_samples:
                    self.calm_baseline = round(
                        sum(self._cal_calm_samples) / len(self._cal_calm_samples), 1
                    )
                self.calibrated = True

        # 2. Neurofeedback In-Zone streak
        if focus >= self.focus_threshold:
            if not self.in_zone:
                self.in_zone = True
                self._zone_enter_ts = now
            self.current_streak_sec = round(now - (self._zone_enter_ts or now), 1)
            if self.current_streak_sec > self.best_streak_sec:
                self.best_streak_sec = self.current_streak_sec
        else:
            self.in_zone = False
            self._zone_enter_ts = None
            self.current_streak_sec = 0.0

        # 3. Hybrid Gyro + Focus-Clutch Cursor
        imu = frame.get("imu", {})
        gyro = imu.get("gyro") or [0.0, 0.0, 0.0]
        gx, gy, gz = float(gyro[0]), float(gyro[1]), float(gyro[2])

        clutch_ok = (not self.focus_clutch) or self.in_zone
        if self.cursor_enabled and clutch_ok:
            # Map yaw (gz) -> horizontal dx, pitch (gy) -> vertical dy (head down => cursor down)
            dx_dps = 0.0 if abs(gz) < self.deadzone_dps else (gz - (self.deadzone_dps if gz > 0 else -self.deadzone_dps))
            dy_dps = 0.0 if abs(gy) < self.deadzone_dps else (gy - (self.deadzone_dps if gy > 0 else -self.deadzone_dps))

            sign_x = 1.0 if self.invert_x else -1.0
            sign_y = -1.0 if self.invert_y else 1.0

            # Normalized sandbox movement
            norm_dx = sign_x * dx_dps * dt * 0.006 * self.sensitivity
            norm_dy = sign_y * dy_dps * dt * 0.006 * self.sensitivity
            self.cursor_x = max(0.02, min(0.98, self.cursor_x + norm_dx))
            self.cursor_y = max(0.02, min(0.98, self.cursor_y + norm_dy))

            # Optional real OS cursor movement
            if self.os_mouse_armed and (abs(dx_dps) > 0.1 or abs(dy_dps) > 0.1):
                px_dx = int(round(sign_x * dx_dps * dt * 11.0 * self.sensitivity))
                px_dy = int(round(sign_y * dy_dps * dt * 11.0 * self.sensitivity))
                if px_dx != 0 or px_dy != 0:
                    self._os_move_mouse(px_dx, px_dy)

        return {
            "calibrating": self.calibrating,
            "cal_progress": round(cal_progress, 2),
            "calibrated": self.calibrated,
            "focus_baseline": self.focus_baseline,
            "calm_baseline": self.calm_baseline,
            "focus_threshold": self.focus_threshold,
            "in_zone": self.in_zone,
            "current_streak_sec": self.current_streak_sec,
            "best_streak_sec": self.best_streak_sec,
            "cursor": {
                "x": round(self.cursor_x, 4),
                "y": round(self.cursor_y, 4),
                "enabled": self.cursor_enabled,
                "focus_clutch": self.focus_clutch,
                "clutch_active": clutch_ok,
                "sensitivity": self.sensitivity,
                "invert_x": self.invert_x,
                "invert_y": self.invert_y,
            },
            "os_mouse_armed": self.os_mouse_armed,
            "os_keyboard_armed": self.os_keyboard_armed,
        }

    def trigger_os_click(self, button: str = "left") -> Dict[str, Any]:
        if not self.os_mouse_armed:
            return {"ok": False, "detail": "OS mouse is unarmed (sandbox only)"}
        try:
            if self._has_ydotool:
                btn = "1" if button == "left" else "2"
                subprocess.Popen(
                    ["ydotool", "click", "--delay", "0", btn],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return {"ok": True, "detail": f"ydotool click {button}"}
            if self._has_xdotool and self.session_type != "wayland":
                btn = "1" if button == "left" else "3"
                subprocess.Popen(
                    ["xdotool", "click", btn],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return {"ok": True, "detail": f"xdotool click {button}"}
            return {"ok": False, "detail": "Install ydotool for Wayland OS mouse control"}
        except Exception as exc:
            return {"ok": False, "detail": str(exc)}

    def trigger_os_type(self, text: str) -> Dict[str, Any]:
        if not self.os_keyboard_armed:
            return {"ok": False, "detail": "OS keyboard is unarmed (in-app composer only)"}
        if not text:
            return {"ok": False, "detail": "Empty text"}
        try:
            if self._has_wtype and self.session_type == "wayland":
                subprocess.Popen(
                    ["wtype", text],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return {"ok": True, "detail": f"wtype '{text}'"}
            if self._has_ydotool:
                subprocess.Popen(
                    ["ydotool", "type", text],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return {"ok": True, "detail": f"ydotool type '{text}'"}
            if self._has_xdotool and self.session_type != "wayland":
                subprocess.Popen(
                    ["xdotool", "type", "--delay", "20", text],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return {"ok": True, "detail": f"xdotool type '{text}'"}
            return {"ok": False, "detail": "Install wtype or ydotool for Wayland OS typing"}
        except Exception as exc:
            return {"ok": False, "detail": str(exc)}

    def _os_move_mouse(self, dx: int, dy: int) -> None:
        # Never pile up overlapping subprocesses if the previous move is still running
        if self._move_proc is not None and self._move_proc.poll() is None:
            return
        try:
            if self._has_ydotool:
                self._move_proc = subprocess.Popen(
                    ["ydotool", "mousemove", "--delay", "0", "--", str(dx), str(dy)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            elif self._has_xdotool and self.session_type != "wayland":
                self._move_proc = subprocess.Popen(
                    ["xdotool", "mousemove_relative", "--", str(dx), str(dy)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        except Exception:
            pass

    def status(self) -> Dict[str, Any]:
        return {
            "calibrating": self.calibrating,
            "calibrated": self.calibrated,
            "focus_baseline": self.focus_baseline,
            "calm_baseline": self.calm_baseline,
            "focus_threshold": self.focus_threshold,
            "in_zone": self.in_zone,
            "current_streak_sec": self.current_streak_sec,
            "best_streak_sec": self.best_streak_sec,
            "cursor": {
                "x": round(self.cursor_x, 4),
                "y": round(self.cursor_y, 4),
                "enabled": self.cursor_enabled,
                "focus_clutch": self.focus_clutch,
                "sensitivity": self.sensitivity,
                "invert_x": self.invert_x,
                "invert_y": self.invert_y,
            },
            "os_mouse_armed": self.os_mouse_armed,
            "os_keyboard_armed": self.os_keyboard_armed,
            "environment": {
                "session_type": self.session_type,
                "desktop": self.desktop,
                "ydotool": self._has_ydotool,
                "wtype": self._has_wtype,
                "xdotool": self._has_xdotool,
            },
        }
