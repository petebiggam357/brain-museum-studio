"""FastAPI + WebSocket server for Muse 2 Studio (Live Monitor, BCI, OSC Bridge, Personal ML)."""

from __future__ import annotations

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bci import BCIEngine
from .bridge import LSLBridge, OSCBridge
from .device import MuseDeviceManager
from .dsp import SignalProcessor
from .ml import PersonalStateClassifier
from .neuro_lab import NeuroLabEngine
from .profiles import ProfileManager
from .recorder import SessionRecorder

if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    # PyInstaller standalone binary paths
    STATIC_DIR = Path(sys._MEIPASS) / "muse2_studio" / "static"
    DATA_ROOT = Path.home() / ".brain-museum-studio"
else:
    BASE_DIR = Path(__file__).resolve().parent
    STATIC_DIR = BASE_DIR / "static"
    DATA_ROOT = BASE_DIR.parent

RECORDINGS_DIR = DATA_ROOT / "recordings"
CONFIG_DIR = DATA_ROOT / "config"
MODELS_DIR = DATA_ROOT / "models"

dsp = SignalProcessor()
recorder = SessionRecorder(RECORDINGS_DIR)
osc_bridge = OSCBridge()
lsl_bridge = LSLBridge()
bci_engine = BCIEngine(CONFIG_DIR / "bci_rules.json", osc_bridge=osc_bridge)
ml_classifier = PersonalStateClassifier(MODELS_DIR)
profile_manager = ProfileManager(CONFIG_DIR / "profiles.json")
neuro_lab = NeuroLabEngine()
_active_prof = profile_manager.active()
neuro_lab.focus_baseline = float(_active_prof["focus_baseline"])
neuro_lab.calm_baseline = float(_active_prof["calm_baseline"])
neuro_lab.focus_threshold = float(_active_prof["focus_threshold"])
neuro_lab.calibrated = bool(_active_prof["calibrated"])
device = MuseDeviceManager(dsp=dsp, on_eeg_raw=recorder.write_eeg)

ws_clients: Set[WebSocket] = set()
_broadcaster_task: asyncio.Task[None] | None = None


class ConnectBLERequest(BaseModel):
    address: str
    name: str = "Muse 2"


class SimStateRequest(BaseModel):
    state: str = "calm"


class SimEventRequest(BaseModel):
    kind: str = "blink"


class FilterConfigRequest(BaseModel):
    notch_hz: Optional[float] = None
    bandpass: Optional[bool] = None
    set_notch: bool = False


class RecordStartRequest(BaseModel):
    label: str = "muse2"


class MarkerRequest(BaseModel):
    label: str = "Marker"


class OSCConfigRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 5000
    enabled: bool = True


class BCIArmRequest(BaseModel):
    armed: bool


class BCIRuleRequest(BaseModel):
    id: Optional[str] = None
    trigger: str
    action_type: str
    target: str = ""
    enabled: bool = True
    cooldown_sec: float = 1.5


class MLCollectRequest(BaseModel):
    label: str


class LabConfigRequest(BaseModel):
    focus_threshold: Optional[float] = None
    cursor_enabled: Optional[bool] = None
    focus_clutch: Optional[bool] = None
    sensitivity: Optional[float] = None
    invert_x: Optional[bool] = None
    invert_y: Optional[bool] = None
    os_mouse_armed: Optional[bool] = None
    os_keyboard_armed: Optional[bool] = None


class LabClickRequest(BaseModel):
    button: str = "left"


class LabTypeRequest(BaseModel):
    text: str


class ProfileCreateRequest(BaseModel):
    name: str


class ProfileSelectRequest(BaseModel):
    profile_id: str


class ProfileCalibrateRequest(BaseModel):
    focus_baseline: float
    calm_baseline: float
    focus_threshold: float
    neutral_tilt: float = 0.0


class ReplayStartRequest(BaseModel):
    filename: str
    speed: float = 1.0


class AutoConnectRequest(BaseModel):
    auto_connect: bool


class LSLToggleRequest(BaseModel):
    enabled: bool


async def _broadcast_loop() -> None:
    """Broadcast ~20 FPS telemetry frames, run BCI rules, ML inference, Neuro Lab, and OSC bridge."""
    while True:
        await asyncio.sleep(0.05)
        frame = dsp.drain_frame()

        # Personal ML live prediction
        feat_vec = dsp.get_latest_feature_vector()
        ml_pred = ml_classifier.predict(feat_vec)
        frame["ml_prediction"] = ml_pred

        # Neuro Lab calibration, Focus-zone streak, & hybrid cursor physics
        frame["lab"] = neuro_lab.update(frame, dt=0.05)

        # Evaluate BCI rules on any newly detected events
        bci_fired = bci_engine.process_events(frame.get("events", []))
        frame["bci_fired"] = bci_fired

        # Broadcast over UDP OSC & optional LSL
        osc_bridge.broadcast_frame(frame)
        lsl_bridge.push_frame(frame)

        # Record summary if recording active
        if recorder.active:
            recorder.record_frame_summary(frame)

        frame["device"] = device.status()
        frame["recording"] = recorder.status()
        frame["osc"] = osc_bridge.status()
        frame["lsl"] = lsl_bridge.status()
        frame["bci"] = {"armed": bci_engine.armed}
        frame["ml"] = ml_classifier.status()

        if not ws_clients:
            continue

        payload = json.dumps(frame)
        stale: list[WebSocket] = []
        for ws in list(ws_clients):
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            ws_clients.discard(ws)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _broadcaster_task
    _broadcaster_task = asyncio.create_task(_broadcast_loop())
    try:
        yield
    finally:
        if _broadcaster_task is not None:
            _broadcaster_task.cancel()
        osc_bridge.stop()
        if recorder.active:
            recorder.stop()
        await device.disconnect()


app = FastAPI(title="Brain Museum Studio", version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
async def api_status() -> Dict[str, Any]:
    return {
        "device": device.status(),
        "recording": recorder.status(),
        "filters": dsp.filter_config(),
        "osc": osc_bridge.status(),
        "bci": bci_engine.status(),
        "ml": ml_classifier.status(),
        "lab": neuro_lab.status(),
        "profiles": profile_manager.status(),
    }


# --- Device & Simulator ---
@app.post("/api/scan")
async def api_scan() -> Dict[str, Any]:
    try:
        devices = await device.scan(timeout=5.0)
        return {"devices": devices}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"BLE scan failed: {exc}") from exc


@app.post("/api/connect/ble")
async def api_connect_ble(req: ConnectBLERequest) -> Dict[str, Any]:
    try:
        st = await device.connect_ble(req.address, req.name)
        profile_manager.update_last_device(req.address, req.name)
        return st
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"BLE connect failed: {exc}") from exc


@app.post("/api/replay/start")
async def api_replay_start(req: ReplayStartRequest) -> Dict[str, Any]:
    safe_name = Path(req.filename).name
    target = RECORDINGS_DIR / safe_name
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Recording CSV not found")
    return await device.connect_replay(target, speed=req.speed)


@app.post("/api/profiles/autoconnect")
async def api_profiles_autoconnect(req: AutoConnectRequest) -> Dict[str, Any]:
    return profile_manager.update_last_device("", "", auto_connect=req.auto_connect)


@app.post("/api/connect/sim")
async def api_connect_sim(req: SimStateRequest) -> Dict[str, Any]:
    return await device.connect_simulator(state=req.state)


@app.post("/api/sim/state")
async def api_sim_state(req: SimStateRequest) -> Dict[str, Any]:
    return device.set_sim_state(req.state)


@app.post("/api/sim/event")
async def api_sim_event(req: SimEventRequest) -> Dict[str, Any]:
    device.trigger_sim_event(req.kind)
    return {"ok": True, "kind": req.kind}


@app.post("/api/disconnect")
async def api_disconnect() -> Dict[str, Any]:
    if recorder.active:
        recorder.stop()
    return await device.disconnect()


# --- DSP Filters ---
@app.post("/api/filters")
async def api_filters(req: FilterConfigRequest) -> Dict[str, Any]:
    return dsp.configure_filters(
        notch_hz=req.notch_hz,
        bandpass=req.bandpass,
        set_notch=req.set_notch,
    )


# --- Recorder ---
@app.post("/api/record/start")
async def api_record_start(req: RecordStartRequest) -> Dict[str, Any]:
    return recorder.start(label=req.label, source_name=device.device_name or "disconnected")


@app.post("/api/record/stop")
async def api_record_stop() -> Dict[str, Any]:
    return recorder.stop()


@app.post("/api/marker")
async def api_marker(req: MarkerRequest) -> Dict[str, Any]:
    marker = recorder.add_marker(req.label)
    return {"marker": marker}


@app.get("/api/recordings")
async def api_recordings() -> Dict[str, Any]:
    return {"recordings": recorder.list_recordings()}


@app.get("/api/recordings/{filename}")
async def api_download_recording(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    target = RECORDINGS_DIR / safe_name
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Recording not found")
    return FileResponse(target, filename=safe_name)


# --- OSC Bridge ---
@app.get("/api/osc")
async def api_osc_status() -> Dict[str, Any]:
    return osc_bridge.status()


@app.post("/api/osc")
async def api_osc_configure(req: OSCConfigRequest) -> Dict[str, Any]:
    return osc_bridge.configure(host=req.host, port=req.port, enabled=req.enabled)


@app.get("/api/lsl")
async def api_lsl_status() -> Dict[str, Any]:
    return lsl_bridge.status()


@app.post("/api/lsl")
async def api_lsl_toggle(req: LSLToggleRequest) -> Dict[str, Any]:
    return lsl_bridge.set_enabled(req.enabled)


# --- BCI Controls ---
@app.get("/api/bci")
async def api_bci_status() -> Dict[str, Any]:
    return bci_engine.status()


@app.post("/api/bci/arm")
async def api_bci_arm(req: BCIArmRequest) -> Dict[str, Any]:
    return bci_engine.set_armed(req.armed)


@app.post("/api/bci/rules")
async def api_bci_upsert_rule(req: BCIRuleRequest) -> Dict[str, Any]:
    try:
        return bci_engine.upsert_rule(req.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/bci/rules/{rule_id}")
async def api_bci_delete_rule(rule_id: str) -> Dict[str, Any]:
    return bci_engine.delete_rule(rule_id)


@app.post("/api/bci/rules/{rule_id}/test")
async def api_bci_test_rule(rule_id: str) -> Dict[str, Any]:
    try:
        return bci_engine.test_rule(rule_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# --- Personal ML State Classifier ---
@app.get("/api/ml")
async def api_ml_status() -> Dict[str, Any]:
    return ml_classifier.status()


@app.post("/api/ml/collect")
async def api_ml_collect(req: MLCollectRequest) -> Dict[str, Any]:
    feat = dsp.get_latest_feature_vector()
    try:
        return ml_classifier.add_sample(req.label, feat or [])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/ml/train")
async def api_ml_train() -> Dict[str, Any]:
    try:
        return ml_classifier.train()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/ml/clear")
async def api_ml_clear() -> Dict[str, Any]:
    return ml_classifier.clear_dataset()


# --- Neuro Lab (Calibration, Focus Arena, Hybrid Mouse & Virtual Keyboard) ---
@app.get("/api/lab")
async def api_lab_status() -> Dict[str, Any]:
    return neuro_lab.status()


@app.post("/api/lab/calibrate")
async def api_lab_calibrate() -> Dict[str, Any]:
    return neuro_lab.start_calibration(duration_sec=10.0)


@app.post("/api/lab/config")
async def api_lab_config(req: LabConfigRequest) -> Dict[str, Any]:
    return neuro_lab.configure(req.model_dump(exclude_none=True))


@app.post("/api/lab/recenter")
async def api_lab_recenter() -> Dict[str, Any]:
    return neuro_lab.recenter_cursor()


@app.post("/api/lab/disarm")
async def api_lab_disarm() -> Dict[str, Any]:
    return neuro_lab.disarm_all()


@app.post("/api/lab/click")
async def api_lab_click(req: LabClickRequest) -> Dict[str, Any]:
    return neuro_lab.trigger_os_click(req.button)


@app.post("/api/lab/type")
async def api_lab_type(req: LabTypeRequest) -> Dict[str, Any]:
    return neuro_lab.trigger_os_type(req.text)


# --- Multi-User Brain Profiles & Guided Calibration ---
def _apply_active_profile() -> None:
    p = profile_manager.active()
    neuro_lab.focus_baseline = float(p["focus_baseline"])
    neuro_lab.calm_baseline = float(p["calm_baseline"])
    neuro_lab.focus_threshold = float(p["focus_threshold"])
    neuro_lab.calibrated = bool(p["calibrated"])


@app.get("/api/profiles")
async def api_profiles() -> Dict[str, Any]:
    return profile_manager.status()


@app.post("/api/profiles/create")
async def api_profiles_create(req: ProfileCreateRequest) -> Dict[str, Any]:
    try:
        st = profile_manager.create(req.name)
        _apply_active_profile()
        return st
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/profiles/select")
async def api_profiles_select(req: ProfileSelectRequest) -> Dict[str, Any]:
    try:
        st = profile_manager.select(req.profile_id)
        _apply_active_profile()
        return st
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/profiles/calibrate")
async def api_profiles_calibrate(req: ProfileCalibrateRequest) -> Dict[str, Any]:
    st = profile_manager.update_calibration(
        focus_baseline=req.focus_baseline,
        calm_baseline=req.calm_baseline,
        focus_threshold=req.focus_threshold,
        neutral_tilt=req.neutral_tilt,
    )
    _apply_active_profile()
    return st


# --- WebSocket ---
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    ws_clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_clients.discard(ws)
    except Exception:
        ws_clients.discard(ws)
