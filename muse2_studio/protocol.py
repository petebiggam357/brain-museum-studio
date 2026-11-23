"""Muse 2 Bluetooth Low Energy (BLE) GATT protocol definitions and packet decoders.

References standard Muse 2 (MU-03) / Muse S BLE GATT characteristics:
- 4 EEG channels (TP9, AF7, AF8, TP10) + optional Right AUX at 256 Hz
- 3 PPG channels (Ambient, Infrared, Red) at 64 Hz (when preset p50 is enabled)
- 3-axis Accelerometer & Gyroscope at 52 Hz
- Telemetry (battery %, temperature, fuel-gauge voltage)
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Dict, List, Tuple

# Primary Muse GATT Service UUID
MUSE_SERVICE_UUID = "0000fe8d-0000-1000-8000-00805f9b34fb"

# Control characteristic (write commands, receive JSON control responses)
MUSE_GATT_ATTR_STREAM_TOGGLE = "273e0001-4c4d-454d-96be-f03bac821358"

# EEG characteristics (256 Hz, 12 x 12-bit samples per 20-byte packet)
EEG_UUIDS: Dict[str, str] = {
    "TP9": "273e0003-4c4d-454d-96be-f03bac821358",
    "AF7": "273e0004-4c4d-454d-96be-f03bac821358",
    "AF8": "273e0005-4c4d-454d-96be-f03bac821358",
    "TP10": "273e0006-4c4d-454d-96be-f03bac821358",
}
EEG_AUX_UUID = "273e0007-4c4d-454d-96be-f03bac821358"
EEG_CHANNELS: Tuple[str, ...] = ("TP9", "AF7", "AF8", "TP10")

# Motion & Telemetry characteristics
GYRO_UUID = "273e0009-4c4d-454d-96be-f03bac821358"
ACCEL_UUID = "273e000a-4c4d-454d-96be-f03bac821358"
TELEMETRY_UUID = "273e000b-4c4d-454d-96be-f03bac821358"

# PPG optical characteristics (64 Hz, 6 x 24-bit samples per 20-byte packet)
PPG_UUIDS: Dict[str, str] = {
    "PPG1": "273e000f-4c4d-454d-96be-f03bac821358",  # Ambient
    "PPG2": "273e0010-4c4d-454d-96be-f03bac821358",  # Infrared
    "PPG3": "273e0011-4c4d-454d-96be-f03bac821358",  # Red
}

# Sampling rates & scale factors
EEG_SAMPLE_RATE = 256.0
PPG_SAMPLE_RATE = 64.0
IMU_SAMPLE_RATE = 52.0

EEG_SCALE_UV = 0.48828125  # 1000 / 2048 uV per LSB
ACCEL_SCALE_G = 0.0000610352  # 2 / 32768 g per LSB
GYRO_SCALE_DPS = 0.0074768  # deg/s per LSB


@dataclass(slots=True)
class TelemetryPacket:
    sequence: int
    battery_pct: float
    fuel_gauge_mv: float
    temperature_c: float


def encode_command(cmd: str) -> bytes:
    """Encode a Muse control command with 1-byte length prefix and newline."""
    payload = (cmd + "\n").encode("ascii")
    return bytes([len(payload)]) + payload


# Standard Muse 2 control commands
CMD_HALT = encode_command("h")
CMD_PRESET_EEG_PPG = encode_command("p50")  # 4ch EEG + AUX + PPG + IMU
CMD_PRESET_EEG_ONLY = encode_command("p21")  # 4ch EEG + IMU
CMD_RESUME = encode_command("d")
CMD_KEEP_ALIVE = encode_command("k")
CMD_STATUS = encode_command("s")


def decode_eeg_packet(data: bytes) -> Tuple[int, List[float]]:
    """Decode a 20-byte Muse 2 EEG BLE packet into (sequence_num, 12 samples in uV).

    Packet layout:
    - Bytes 0..1: uint16 big-endian sequence counter
    - Bytes 2..19: 12 x 12-bit big-endian unsigned integers packed into 18 bytes
      (every 3 bytes unpack to 2 samples).
    """
    if len(data) < 20:
        raise ValueError(f"Expected 20-byte EEG packet, got {len(data)} bytes")

    seq = struct.unpack(">H", data[0:2])[0]
    samples: List[float] = []
    for i in range(2, 20, 3):
        b0, b1, b2 = data[i], data[i + 1], data[i + 2]
        s0 = (b0 << 4) | (b1 >> 4)
        s1 = ((b1 & 0x0F) << 8) | b2
        samples.append((s0 - 2048) * EEG_SCALE_UV)
        samples.append((s1 - 2048) * EEG_SCALE_UV)
    return seq, samples


def decode_ppg_packet(data: bytes) -> Tuple[int, List[int]]:
    """Decode a 20-byte Muse 2 PPG BLE packet into (sequence_num, 6 x 24-bit uint samples)."""
    if len(data) < 20:
        raise ValueError(f"Expected 20-byte PPG packet, got {len(data)} bytes")

    seq = struct.unpack(">H", data[0:2])[0]
    samples: List[int] = []
    for i in range(2, 20, 3):
        val = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
        samples.append(val)
    return seq, samples


def decode_imu_packet(data: bytes, scale: float) -> Tuple[int, List[Tuple[float, float, float]]]:
    """Decode a 20-byte Muse 2 Accelerometer or Gyroscope packet (3 x (x, y, z) samples)."""
    if len(data) < 20:
        raise ValueError(f"Expected 20-byte IMU packet, got {len(data)} bytes")

    seq = struct.unpack(">H", data[0:2])[0]
    raw = struct.unpack(">9h", data[2:20])
    samples = [
        (raw[i] * scale, raw[i + 1] * scale, raw[i + 2] * scale)
        for i in range(0, 9, 3)
    ]
    return seq, samples


def decode_accel_packet(data: bytes) -> Tuple[int, List[Tuple[float, float, float]]]:
    return decode_imu_packet(data, ACCEL_SCALE_G)


def decode_gyro_packet(data: bytes) -> Tuple[int, List[Tuple[float, float, float]]]:
    return decode_imu_packet(data, GYRO_SCALE_DPS)


def decode_telemetry_packet(data: bytes) -> TelemetryPacket:
    """Decode a 20-byte Muse 2 telemetry packet."""
    if len(data) < 10:
        raise ValueError(f"Expected >=10-byte telemetry packet, got {len(data)} bytes")

    seq, battery_raw, fuel_raw, _adc, temp_raw = struct.unpack(">HHHHh", data[0:10])
    return TelemetryPacket(
        sequence=seq,
        battery_pct=round(battery_raw / 512.0, 1),
        fuel_gauge_mv=round(fuel_raw * 2.2, 1),
        temperature_c=round(temp_raw / 100.0, 1) if abs(temp_raw) > 200 else float(temp_raw),
    )
