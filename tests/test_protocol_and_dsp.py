"""Unit tests for Muse 2 Studio: Protocol, DSP Filters, OSC Bridge, BCI Engine, ML, and Recorder."""

from __future__ import annotations

import math
import socket
import struct
from pathlib import Path

import numpy as np

from muse2_studio.bci import BCIEngine
from muse2_studio.bridge import OSCBridge, encode_osc_message
from muse2_studio.dsp import SignalProcessor
from muse2_studio.ml import PersonalStateClassifier
from muse2_studio.neuro_lab import NeuroLabEngine
from muse2_studio.protocol import (
    EEG_SAMPLE_RATE,
    PPG_SAMPLE_RATE,
    decode_accel_packet,
    decode_eeg_packet,
    decode_ppg_packet,
    decode_telemetry_packet,
    encode_command,
)
from muse2_studio.recorder import SessionRecorder


def test_encode_command() -> None:
    assert encode_command("p50") == b"\x04p50\n"
    assert encode_command("d") == b"\x02d\n"


def test_decode_eeg_packet_midpoint_and_bounds() -> None:
    header = struct.pack(">H", 42)
    body = bytearray()
    for _ in range(6):
        s0, s1 = 2048, 4095
        b0 = (s0 >> 4) & 0xFF
        b1 = ((s0 & 0x0F) << 4) | ((s1 >> 8) & 0x0F)
        b2 = s1 & 0xFF
        body.extend([b0, b1, b2])
    seq, samples = decode_eeg_packet(header + bytes(body))
    assert seq == 42
    assert len(samples) == 12
    assert abs(samples[0] - 0.0) < 1e-6
    assert abs(samples[1] - (4095 - 2048) * 0.48828125) < 1e-6


def test_decode_ppg_accel_telemetry() -> None:
    ppg_bytes = struct.pack(">H", 7) + b"".join(
        int(100000 + i).to_bytes(3, "big") for i in range(6)
    )
    seq, vals = decode_ppg_packet(ppg_bytes)
    assert seq == 7
    assert vals == [100000, 100001, 100002, 100003, 100004, 100005]

    accel_bytes = struct.pack(">H9h", 9, 0, 0, 16384, 0, 0, 16384, 0, 0, 16384)
    seq_a, acc = decode_accel_packet(accel_bytes)
    assert seq_a == 9
    assert len(acc) == 3
    assert abs(acc[0][2] - 1.0) < 0.01

    tel_bytes = struct.pack(">HHHHh", 1, 25600, 1700, 0, 3200) + b"\x00" * 10
    tel = decode_telemetry_packet(tel_bytes)
    assert tel.battery_pct == 50.0
    assert tel.temperature_c == 32.0


def test_dsp_filters_alpha_spectrum_and_heart_rate() -> None:
    dsp = SignalProcessor()
    # Feed 4 seconds of 10 Hz Alpha + strong 60 Hz mains hum to verify notch + bandpass
    t = np.arange(1024) / EEG_SAMPLE_RATE
    mixed = (30.0 * np.sin(2 * math.pi * 10.0 * t) + 80.0 * np.sin(2 * math.pi * 60.0 * t)).tolist()
    for ch in ("TP9", "AF7", "AF8", "TP10"):
        dsp.push_eeg(ch, mixed)

    frame = dsp.drain_frame()
    assert frame["bands"]["relative"]["alpha"] > 65.0
    assert len(frame["spectrum"]) == 45
    assert dsp.compute_signal_quality()["AF7"] == 2
    assert dsp.get_latest_feature_vector() is not None
    assert len(dsp.get_latest_feature_vector() or []) == 24

    # Feed 8 seconds of synthetic 72 BPM (1.2 Hz) PPG pulse
    t_ppg = np.arange(int(8 * PPG_SAMPLE_RATE)) / PPG_SAMPLE_RATE
    phase = (t_ppg * 1.2) % 1.0
    ppg = [int(120000 + 2500 * math.exp(-((p - 0.25) ** 2) / 0.004)) for p in phase]
    dsp.push_ppg("PPG2", ppg)

    bpm = dsp.compute_heart_rate_bpm()
    assert bpm is not None
    assert 68.0 <= bpm <= 76.0


def test_osc_encoding_and_udp_loopback() -> None:
    pkt = encode_osc_message("/muse/eeg", 1.5, -2.5, 0.0, 3.25)
    assert pkt.startswith(b"/muse/eeg\x00\x00\x00,ffff\x00\x00\x00")
    assert len(pkt) % 4 == 0

    recv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    recv.bind(("127.0.0.1", 0))
    port = recv.getsockname()[1]
    recv.settimeout(1.0)

    bridge = OSCBridge("127.0.0.1", port)
    bridge.start()
    assert bridge.send("/bci/test", 1) is True
    data, _addr = recv.recvfrom(1024)
    assert data.startswith(b"/bci/test\x00")
    bridge.stop()
    recv.close()


def test_bci_engine_safe_and_armed(tmp_path: Path) -> None:
    bridge = OSCBridge("127.0.0.1", 59999)
    bridge.start()
    engine = BCIEngine(tmp_path / "bci_rules.json", osc_bridge=bridge)

    # Default is unarmed (dry-run)
    fired = engine.process_events([{"kind": "jaw_clench", "label": "Jaw Clench"}])
    assert len(fired) == 1
    assert fired[0]["result"] == "dry-run (unarmed)"

    # Arm and test custom rule
    engine.set_armed(True)
    engine.upsert_rule(
        {
            "id": "r_test_tilt",
            "trigger": "head_tilt_left",
            "action_type": "osc",
            "target": "/bci/left",
            "enabled": True,
            "cooldown_sec": 0.5,
        }
    )
    fired2 = engine.process_events([{"kind": "head_tilt_left", "label": "Head Tilt Left"}])
    assert len(fired2) == 1
    assert fired2[0]["result"] == "sent OSC /bci/left"
    bridge.stop()


def test_personal_ml_classifier_train_and_predict(tmp_path: Path) -> None:
    clf = PersonalStateClassifier(tmp_path)
    rng = np.random.default_rng(42)
    # Two separable 24-dim synthetic states
    for _ in range(5):
        clf.add_sample("Relaxed", (np.ones(24) * 5.0 + rng.normal(0, 0.3, 24)).tolist())
        clf.add_sample("Deep Work", (np.ones(24) * 20.0 + rng.normal(0, 0.3, 24)).tolist())

    st = clf.train()
    assert st["trained"] is True
    assert st["loo_accuracy_pct"] == 100.0

    pred_relax = clf.predict((np.ones(24) * 5.1).tolist())
    pred_work = clf.predict((np.ones(24) * 19.8).tolist())
    assert pred_relax is not None and pred_relax["label"] == "Relaxed"
    assert pred_work is not None and pred_work["label"] == "Deep Work"


def test_session_recorder_csv_and_summary(tmp_path: Path) -> None:
    rec = SessionRecorder(tmp_path)
    rec.start(label="test_run", source_name="Simulator")
    for ch in ("TP9", "AF7", "AF8", "TP10"):
        rec.write_eeg(ch, [1.0, 2.0, 3.0], ts=1000.0)
    rec.add_marker("Eyes Closed")
    summary = rec.stop()

    assert summary["eeg_samples_recorded"] == 3
    assert len(summary["markers"]) == 1
    assert (tmp_path / summary["csv_file"]).is_file()
    assert len(rec.list_recordings()) == 1


def test_neuro_lab_calibration_and_hybrid_cursor() -> None:
    lab = NeuroLabEngine()
    lab.configure({"focus_threshold": 50.0, "cursor_enabled": True, "focus_clutch": True})

    # Below threshold with focus_clutch=True => cursor should stay centered
    st1 = lab.update({"metrics": {"focus": 30.0, "calm": 40.0}, "imu": {"gyro": [0.0, 20.0, 20.0]}})
    assert st1["in_zone"] is False
    assert st1["cursor"]["x"] == 0.5

    # Above threshold => in_zone=True and gyro moves cursor
    st2 = lab.update({"metrics": {"focus": 72.0, "calm": 25.0}, "imu": {"gyro": [0.0, 25.0, 25.0]}})
    assert st2["in_zone"] is True
    assert st2["cursor"]["x"] != 0.5
    assert st2["cursor"]["y"] != 0.5

    # Recenter works
    lab.recenter_cursor()
    assert lab.cursor_x == 0.5 and lab.cursor_y == 0.5

