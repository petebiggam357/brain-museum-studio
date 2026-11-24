"""Unified Muse 2 device controller supporting Native Linux BLE (bleak) & Simulator mode."""

from __future__ import annotations

import asyncio
import csv
import logging
import math
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import numpy as np
from bleak import BleakClient, BleakScanner

from .dsp import SignalProcessor
from .protocol import (
    ACCEL_UUID,
    CMD_HALT,
    CMD_KEEP_ALIVE,
    CMD_PRESET_EEG_ONLY,
    CMD_PRESET_EEG_PPG,
    CMD_RESUME,
    EEG_CHANNELS,
    EEG_SAMPLE_RATE,
    EEG_UUIDS,
    GYRO_UUID,
    MUSE_GATT_ATTR_STREAM_TOGGLE,
    PPG_SAMPLE_RATE,
    PPG_UUIDS,
    TELEMETRY_UUID,
    decode_accel_packet,
    decode_eeg_packet,
    decode_gyro_packet,
    decode_ppg_packet,
    decode_telemetry_packet,
)

logger = logging.getLogger("muse2_studio.device")


class MuseDeviceManager:
    """Manages either a real BLE Muse 2 headset or the built-in synthetic Muse 2 simulator."""

    def __init__(
        self,
        dsp: SignalProcessor,
        on_eeg_raw: Optional[Callable[[str, List[float], float], None]] = None,
    ) -> None:
        self.dsp = dsp
        self.on_eeg_raw = on_eeg_raw

        self.mode: str = "disconnected"  # "disconnected" | "ble" | "simulator"
        self.device_name: str = ""
        self.device_address: str = ""
        self.sim_state: str = "calm"  # "calm" | "focus" | "drowsy"

        self._client: Optional[BleakClient] = None
        self._keepalive_task: Optional[asyncio.Task[None]] = None
        self._sim_task: Optional[asyncio.Task[None]] = None
        self._replay_task: Optional[asyncio.Task[None]] = None
        self._sim_inject_blink: bool = False
        self._sim_inject_jaw: bool = False
        self._last_packet_ts: float = 0.0
        self._resume_attempts: int = 0

    def status(self) -> Dict[str, Any]:
        now = time.time()
        ble_alive = (
            self.mode == "ble"
            and self._client is not None
            and self._client.is_connected
        )
        connected = ble_alive or self.mode in ("simulator", "replay")
        stream_healthy = (
            self.mode in ("simulator", "replay")
            or (ble_alive and (now - self._last_packet_ts) < 4.0)
        )
        return {
            "mode": self.mode if connected else "disconnected",
            "connected": connected,
            "stream_healthy": stream_healthy,
            "device_name": self.device_name if connected else "",
            "device_address": self.device_address if connected else "",
            "sim_state": self.sim_state,
        }

    async def scan(self, timeout: float = 5.0) -> List[Dict[str, Any]]:
        """Scan for nearby Muse BLE headbands."""
        found: List[Dict[str, Any]] = []
        devices = await BleakScanner.discover(timeout=timeout, return_adv=True)
        for addr, (dev, adv) in devices.items():
            name = dev.name or adv.local_name or ""
            if "muse" in name.lower():
                found.append(
                    {
                        "name": name,
                        "address": addr,
                        "rssi": adv.rssi,
                    }
                )
        found.sort(key=lambda d: d.get("rssi") or -100, reverse=True)
        return found

    async def connect_ble(self, address: str, name: str = "Muse 2") -> Dict[str, Any]:
        """Connect to a real Muse 2 over BLE and begin streaming EEG, PPG, IMU, and Telemetry."""
        await self.disconnect()
        self.dsp.reset()

        client = BleakClient(address, timeout=15.0)
        await client.connect()
        self._client = client
        self.mode = "ble"
        self.device_address = address
        self.device_name = name or address

        # Subscribe to EEG channels
        for ch_name, uuid in EEG_UUIDS.items():
            await client.start_notify(uuid, self._make_eeg_handler(ch_name))

        # Subscribe to PPG, IMU, Telemetry (best-effort so Muse 2016 without PPG still works cleanly)
        ppg_supported = False
        for ppg_name, uuid in PPG_UUIDS.items():
            try:
                await client.start_notify(uuid, self._make_ppg_handler(ppg_name))
                ppg_supported = True
            except Exception as exc:
                logger.warning("PPG channel %s unavailable (Muse 2016 or older FW): %s", ppg_name, exc)

        for label, uuid, handler in (
            ("ACCEL", ACCEL_UUID, self._handle_accel),
            ("GYRO", GYRO_UUID, self._handle_gyro),
            ("TELEMETRY", TELEMETRY_UUID, self._handle_telemetry),
        ):
            try:
                await client.start_notify(uuid, handler)
            except Exception as exc:
                logger.warning("%s unavailable: %s", label, exc)

        # Configure preset p50 (Muse 2 / Muse S with PPG) or p21 (Muse 2016 EEG-only) and start streaming
        preset_cmd = CMD_PRESET_EEG_PPG if ppg_supported else CMD_PRESET_EEG_ONLY
        await client.write_gatt_char(MUSE_GATT_ATTR_STREAM_TOGGLE, CMD_HALT, response=False)
        await asyncio.sleep(0.08)
        await client.write_gatt_char(
            MUSE_GATT_ATTR_STREAM_TOGGLE, preset_cmd, response=False
        )
        await asyncio.sleep(0.08)
        await client.write_gatt_char(MUSE_GATT_ATTR_STREAM_TOGGLE, CMD_RESUME, response=False)

        self._last_packet_ts = time.time()
        self._resume_attempts = 0
        self._keepalive_task = asyncio.create_task(self._ble_keepalive_loop())
        logger.info("Connected to Muse 2 BLE: %s (%s)", self.device_name, address)
        return self.status()

    async def connect_simulator(self, state: str = "calm") -> Dict[str, Any]:
        """Start the built-in Muse 2 realistic signal simulator."""
        await self.disconnect()
        self.dsp.reset()
        self.mode = "simulator"
        self.device_name = "Muse 2 (Simulator)"
        self.device_address = "SIM-00:11:22:33"
        self.sim_state = state if state in ("calm", "focus", "drowsy") else "calm"
        self.dsp.push_battery(88.5)
        self._sim_task = asyncio.create_task(self._simulator_loop())
        return self.status()

    async def connect_replay(self, csv_path: Path, speed: float = 1.0) -> Dict[str, Any]:
        """Replay a recorded 4-channel EEG CSV file through the live DSP & 3D Brain pipeline."""
        if not csv_path.is_file():
            raise FileNotFoundError(f"Recording not found: {csv_path.name}")
        await self.disconnect()
        self.dsp.reset()
        self.mode = "replay"
        self.device_name = f"Replay: {csv_path.name}"
        self.device_address = "REPLAY"
        self._replay_task = asyncio.create_task(self._replay_loop(csv_path, max(0.25, min(4.0, float(speed)))))
        return self.status()

    async def _replay_loop(self, csv_path: Path, speed: float) -> None:
        rows: List[Tuple[float, float, float, float]] = []
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    rows.append((float(row["TP9"]), float(row["AF7"]), float(row["AF8"]), float(row["TP10"])))
                except Exception:
                    continue
        if not rows:
            self.mode = "disconnected"
            return

        chunk = 12
        step_sec = (chunk / EEG_SAMPLE_RATE) / speed
        idx = 0
        while True:
            batch = rows[idx : idx + chunk]
            if len(batch) < chunk:
                idx = 0
                batch = rows[0:chunk]
            else:
                idx += chunk
            now = time.time()
            for ch_i, ch in enumerate(EEG_CHANNELS):
                self.dsp.push_eeg(ch, [r[ch_i] for r in batch], ts=now)
            await asyncio.sleep(step_sec)

    def set_sim_state(self, state: str) -> Dict[str, Any]:
        if state in ("calm", "focus", "drowsy"):
            self.sim_state = state
        return self.status()

    def trigger_sim_event(self, kind: str) -> None:
        if kind == "blink":
            self._sim_inject_blink = True
        elif kind == "jaw":
            self._sim_inject_jaw = True

    async def disconnect(self) -> Dict[str, Any]:
        if self._sim_task is not None:
            self._sim_task.cancel()
            try:
                await self._sim_task
            except asyncio.CancelledError:
                pass
            self._sim_task = None

        if self._replay_task is not None:
            self._replay_task.cancel()
            try:
                await self._replay_task
            except asyncio.CancelledError:
                pass
            self._replay_task = None

        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
            try:
                await self._keepalive_task
            except asyncio.CancelledError:
                pass
            self._keepalive_task = None

        if self._client is not None:
            try:
                if self._client.is_connected:
                    await self._client.write_gatt_char(
                        MUSE_GATT_ATTR_STREAM_TOGGLE, CMD_HALT, response=False
                    )
                    await self._client.disconnect()
            except Exception as exc:
                logger.warning("Error disconnecting BLE: %s", exc)
            self._client = None

        self.mode = "disconnected"
        self.device_name = ""
        self.device_address = ""
        return self.status()

    async def _ble_keepalive_loop(self) -> None:
        """Send Muse 2 keep-alive ('k') every 2s and auto-resume if packets stall."""
        while self._client is not None and self._client.is_connected:
            await asyncio.sleep(2.0)
            if self._client is None or not self._client.is_connected:
                break
            try:
                await self._client.write_gatt_char(
                    MUSE_GATT_ATTR_STREAM_TOGGLE, CMD_KEEP_ALIVE, response=False
                )
                # If EEG packets stalled for > 3.5s, nudge Muse 2 to resume streaming
                if (time.time() - self._last_packet_ts) > 3.5:
                    self._resume_attempts += 1
                    logger.warning(
                        "Muse 2 stream stalled (attempt %d); sending resume ('d')",
                        self._resume_attempts,
                    )
                    await asyncio.sleep(0.05)
                    await self._client.write_gatt_char(
                        MUSE_GATT_ATTR_STREAM_TOGGLE, CMD_RESUME, response=False
                    )
            except Exception as exc:
                logger.warning("Keep-alive failed: %s", exc)
                break

        # If BLE link dropped unexpectedly, mark disconnected cleanly
        if self.mode == "ble" and (self._client is None or not self._client.is_connected):
            logger.warning("Muse 2 BLE connection lost")
            self.mode = "disconnected"
            self.device_name = ""
            self.device_address = ""

    def _make_eeg_handler(self, channel: str) -> Callable[[Any, bytearray], None]:
        def _handler(_sender: Any, data: bytearray) -> None:
            try:
                _seq, samples = decode_eeg_packet(bytes(data))
                now = time.time()
                self._last_packet_ts = now
                self._resume_attempts = 0
                self.dsp.push_eeg(channel, samples, ts=now)
                if self.on_eeg_raw is not None:
                    self.on_eeg_raw(channel, samples, now)
            except Exception as exc:
                logger.debug("EEG decode error (%s): %s", channel, exc)

        return _handler

    def _make_ppg_handler(self, channel: str) -> Callable[[Any, bytearray], None]:
        def _handler(_sender: Any, data: bytearray) -> None:
            try:
                _seq, samples = decode_ppg_packet(bytes(data))
                self.dsp.push_ppg(channel, samples)
            except Exception as exc:
                logger.debug("PPG decode error (%s): %s", channel, exc)

        return _handler

    def _handle_accel(self, _sender: Any, data: bytearray) -> None:
        try:
            _seq, samples = decode_accel_packet(bytes(data))
            self.dsp.push_accel(samples)
        except Exception:
            pass

    def _handle_gyro(self, _sender: Any, data: bytearray) -> None:
        try:
            _seq, samples = decode_gyro_packet(bytes(data))
            self.dsp.push_gyro(samples)
        except Exception:
            pass

    def _handle_telemetry(self, _sender: Any, data: bytearray) -> None:
        try:
            pkt = decode_telemetry_packet(bytes(data))
            self.dsp.push_battery(pkt.battery_pct)
        except Exception:
            pass

    async def _simulator_loop(self) -> None:
        """Generate realistic 256 Hz EEG + 64 Hz PPG + 52 Hz IMU packets."""
        rng = np.random.default_rng()
        eeg_chunk = 12  # matches Muse 2 packet size (12 samples @ 256 Hz => ~46.875 ms)
        dt_eeg = 1.0 / EEG_SAMPLE_RATE
        step_sec = eeg_chunk * dt_eeg
        t_eeg = 0.0
        t_ppg = 0.0
        ppg_per_step = 3  # 3 samples per ~46.875 ms => ~64 Hz
        jaw_remaining = 0

        # Band amplitude profiles (uV) per simulated mental state
        profiles = {
            "calm": {"delta": 8.0, "theta": 10.0, "alpha": 26.0, "beta": 7.0, "gamma": 3.0},
            "focus": {"delta": 6.0, "theta": 7.0, "alpha": 9.0, "beta": 24.0, "gamma": 10.0},
            "drowsy": {"delta": 20.0, "theta": 24.0, "alpha": 11.0, "beta": 5.0, "gamma": 2.0},
        }

        while True:
            t_arr = t_eeg + np.arange(eeg_chunk) * dt_eeg
            t_eeg += step_sec
            prof = profiles.get(self.sim_state, profiles["calm"])
            now = time.time()

            blink_wave = np.zeros(eeg_chunk)
            if self._sim_inject_blink:
                self._sim_inject_blink = False
                blink_wave = 240.0 * np.sin(np.linspace(0, math.pi, eeg_chunk))

            if self._sim_inject_jaw:
                self._sim_inject_jaw = False
                jaw_remaining = 12  # ~0.55s EMG burst

            jaw_active = jaw_remaining > 0
            if jaw_active:
                jaw_remaining -= 1

            for idx, ch in enumerate(EEG_CHANNELS):
                phase = idx * 0.65
                sig = (
                    prof["delta"] * np.sin(2 * math.pi * 2.2 * t_arr + phase)
                    + prof["theta"] * np.sin(2 * math.pi * 6.0 * t_arr + phase)
                    + prof["alpha"] * np.sin(2 * math.pi * 10.2 * t_arr + phase)
                    + prof["beta"] * np.sin(2 * math.pi * 20.5 * t_arr + phase)
                    + prof["gamma"] * np.sin(2 * math.pi * 36.0 * t_arr + phase)
                    + rng.normal(0.0, 4.5, size=eeg_chunk)
                )
                if ch in ("AF7", "AF8"):
                    sig = sig + blink_wave
                if jaw_active and ch in ("TP9", "TP10"):
                    sig = sig + 95.0 * np.sin(2 * math.pi * 44.0 * t_arr) + rng.normal(
                        0.0, 35.0, size=eeg_chunk
                    )

                samples = sig.tolist()
                self.dsp.push_eeg(ch, samples, ts=now)
                if self.on_eeg_raw is not None:
                    self.on_eeg_raw(ch, samples, now)

            # Synthetic PPG (~68 BPM pulse wave with dicrotic notch)
            ppg_t = t_ppg + np.arange(ppg_per_step) / PPG_SAMPLE_RATE
            t_ppg += ppg_per_step / PPG_SAMPLE_RATE
            hr_hz = 68.0 / 60.0 if self.sim_state != "focus" else 76.0 / 60.0
            phase_hr = (ppg_t * hr_hz) % 1.0
            pulse = (
                np.exp(-((phase_hr - 0.22) ** 2) / 0.004)
                + 0.35 * np.exp(-((phase_hr - 0.42) ** 2) / 0.008)
            )
            ppg_vals = [int(120000 + 2200 * p + rng.normal(0, 45)) for p in pulse]
            self.dsp.push_ppg("PPG2", ppg_vals)

            # Gentle synthetic head micro-movement
            self.dsp.push_accel(
                [
                    (
                        0.03 * math.sin(t_eeg * 0.7),
                        -0.02 * math.cos(t_eeg * 0.5),
                        0.99,
                    )
                ]
            )
            self.dsp.push_gyro(
                [
                    (
                        0.4 * math.cos(t_eeg * 0.7),
                        0.3 * math.sin(t_eeg * 0.5),
                        0.1 * math.sin(t_eeg * 0.3),
                    )
                ]
            )

            await asyncio.sleep(step_sec)
