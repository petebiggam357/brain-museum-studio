"""BCI Controls & Trigger Engine for Muse 2 Studio.

Maps detected brain/face/head gestures (double_blink, blink, jaw_clench,
head_tilt_left, head_tilt_right) to safe, configurable actions:
- OSC trigger message (works everywhere)
- Webhook HTTP POST (OBS, Home Assistant, n8n, custom servers)
- Linux desktop media/key actions (via playerctl or xdotool, opt-in when Armed)
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import time
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from .bridge import OSCBridge

logger = logging.getLogger("muse2_studio.bci")

VALID_TRIGGERS = (
    "double_blink",
    "blink",
    "jaw_clench",
    "head_tilt_left",
    "head_tilt_right",
)

VALID_ACTION_TYPES = (
    "osc",
    "webhook",
    "media_play_pause",
    "media_next",
    "keystroke",
)


@dataclass
class BCIRule:
    id: str
    trigger: str
    action_type: str
    target: str  # OSC path, webhook URL, or xdotool key name (e.g. "space", "Right")
    enabled: bool = True
    cooldown_sec: float = 1.5


DEFAULT_RULES: List[Dict[str, Any]] = [
    {
        "id": "r_double_blink_media",
        "trigger": "double_blink",
        "action_type": "media_play_pause",
        "target": "play-pause",
        "enabled": True,
        "cooldown_sec": 2.0,
    },
    {
        "id": "r_jaw_osc",
        "trigger": "jaw_clench",
        "action_type": "osc",
        "target": "/bci/jaw_clench",
        "enabled": True,
        "cooldown_sec": 1.5,
    },
    {
        "id": "r_tilt_right_next",
        "trigger": "head_tilt_right",
        "action_type": "media_next",
        "target": "next",
        "enabled": False,
        "cooldown_sec": 2.5,
    },
]


class BCIEngine:
    """Evaluates live Muse 2 events against user-configured BCI trigger rules."""

    def __init__(self, config_path: Path, osc_bridge: OSCBridge) -> None:
        self.config_path = config_path
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.osc = osc_bridge

        self.armed: bool = False  # Safe dry-run by default until user clicks Arm
        self.rules: List[BCIRule] = []
        self._last_fired: Dict[str, float] = {}
        self.history: List[Dict[str, Any]] = []

        self._has_playerctl = shutil.which("playerctl") is not None
        self._has_xdotool = shutil.which("xdotool") is not None
        self._load_rules()

    def _load_rules(self) -> None:
        if self.config_path.is_file():
            try:
                raw = json.loads(self.config_path.read_text(encoding="utf-8"))
                self.rules = [BCIRule(**item) for item in raw]
                return
            except Exception as exc:
                logger.warning("Failed to load BCI rules, resetting defaults: %s", exc)
        self.rules = [BCIRule(**item) for item in DEFAULT_RULES]
        self._save_rules()

    def _save_rules(self) -> None:
        self.config_path.write_text(
            json.dumps([asdict(r) for r in self.rules], indent=2),
            encoding="utf-8",
        )

    def set_armed(self, armed: bool) -> Dict[str, Any]:
        self.armed = bool(armed)
        return self.status()

    def upsert_rule(self, rule_data: Dict[str, Any]) -> Dict[str, Any]:
        trigger = str(rule_data.get("trigger", "double_blink"))
        action_type = str(rule_data.get("action_type", "osc"))
        if trigger not in VALID_TRIGGERS:
            raise ValueError(f"Unsupported trigger: {trigger}")
        if action_type not in VALID_ACTION_TYPES:
            raise ValueError(f"Unsupported action_type: {action_type}")

        rid = str(rule_data.get("id") or f"r_{int(time.time() * 1000)}")
        new_rule = BCIRule(
            id=rid,
            trigger=trigger,
            action_type=action_type,
            target=str(rule_data.get("target", "")).strip(),
            enabled=bool(rule_data.get("enabled", True)),
            cooldown_sec=max(0.3, float(rule_data.get("cooldown_sec", 1.5))),
        )
        for i, existing in enumerate(self.rules):
            if existing.id == rid:
                self.rules[i] = new_rule
                break
        else:
            self.rules.append(new_rule)

        self._save_rules()
        return self.status()

    def delete_rule(self, rule_id: str) -> Dict[str, Any]:
        self.rules = [r for r in self.rules if r.id != rule_id]
        self._save_rules()
        return self.status()

    def process_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        fired_now: List[Dict[str, Any]] = []
        now = time.time()
        for ev in events:
            kind = ev.get("kind")
            for rule in self.rules:
                if not rule.enabled or rule.trigger != kind:
                    continue
                if (now - self._last_fired.get(rule.id, 0.0)) < rule.cooldown_sec:
                    continue
                self._last_fired[rule.id] = now
                outcome = self._execute_rule(rule, dry_run=not self.armed)
                entry = {
                    "ts": round(now, 3),
                    "rule_id": rule.id,
                    "trigger": rule.trigger,
                    "action_type": rule.action_type,
                    "target": rule.target,
                    "armed": self.armed,
                    "result": outcome,
                }
                self.history.insert(0, entry)
                self.history = self.history[:40]
                fired_now.append(entry)
        return fired_now

    def test_rule(self, rule_id: str) -> Dict[str, Any]:
        for rule in self.rules:
            if rule.id == rule_id:
                outcome = self._execute_rule(rule, dry_run=False)
                entry = {
                    "ts": round(time.time(), 3),
                    "rule_id": rule.id,
                    "trigger": f"TEST:{rule.trigger}",
                    "action_type": rule.action_type,
                    "target": rule.target,
                    "armed": True,
                    "result": outcome,
                }
                self.history.insert(0, entry)
                self.history = self.history[:40]
                return entry
        raise KeyError(f"Rule not found: {rule_id}")

    def _execute_rule(self, rule: BCIRule, dry_run: bool) -> str:
        if dry_run:
            return "dry-run (unarmed)"

        try:
            if rule.action_type == "osc":
                addr = rule.target or f"/bci/{rule.trigger}"
                ok = self.osc.send(addr, 1)
                return f"sent OSC {addr}" if ok else "OSC bridge disabled"

            if rule.action_type == "webhook":
                if not rule.target.startswith(("http://", "https://")):
                    return "invalid webhook URL"
                payload = json.dumps(
                    {"event": rule.trigger, "ts": time.time(), "source": "brain-museum-studio"}
                ).encode("utf-8")
                req = urllib.request.Request(
                    rule.target,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    return f"HTTP {resp.status}"

            if rule.action_type == "media_play_pause":
                if not self._has_playerctl:
                    return "playerctl not installed"
                subprocess.Popen(["playerctl", "play-pause"])
                return "playerctl play-pause"

            if rule.action_type == "media_next":
                if not self._has_playerctl:
                    return "playerctl not installed"
                subprocess.Popen(["playerctl", "next"])
                return "playerctl next"

            if rule.action_type == "keystroke":
                if not self._has_xdotool:
                    return "xdotool not installed"
                key = rule.target or "space"
                subprocess.Popen(["xdotool", "key", key])
                return f"xdotool key {key}"

        except Exception as exc:
            return f"error: {exc}"
        return "noop"

    def status(self) -> Dict[str, Any]:
        return {
            "armed": self.armed,
            "rules": [asdict(r) for r in self.rules],
            "history": self.history[:15],
            "capabilities": {
                "playerctl": self._has_playerctl,
                "xdotool": self._has_xdotool,
            },
        }
