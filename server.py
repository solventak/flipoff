"""
FlipOff server — serves the static display, config page, REST API, and WebSocket.

Environment variables:
  CONFIG_FILE      Path to config JSON (default: config.json)
  REPO_DIR         Path to the repo root for deploy/rollback (default: parent of this file)
"""

import asyncio
import json
import os
import subprocess
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Any, Union

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent
CONFIG_FILE = Path(os.getenv("CONFIG_FILE", BASE_DIR / "config.json"))
DEFAULT_CONFIG_FILE = BASE_DIR / "config.default.json"
REPO_DIR   = Path(os.getenv("REPO_DIR", BASE_DIR))
SOUNDS_DIR = CONFIG_FILE.parent / "sounds"
SOUNDS_DIR.mkdir(parents=True, exist_ok=True)

BUILTIN_SOUND = "default"
ALLOWED_SOUND_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac"}


def load_config() -> dict:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return json.loads(DEFAULT_CONFIG_FILE.read_text())


def save_config(data: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class IntRange(BaseModel):
    min: int
    max: int


RangeOrInt = Union[int, IntRange]


class GridConfig(BaseModel):
    cols: int = Field(16, description="Number of tile columns")
    rows: int = Field(10, description="Number of tile rows")


class TimingConfig(BaseModel):
    scramble_duration: int = Field(800, description="Total scramble animation duration (ms)")
    flip_duration: int = Field(300, description="Duration of each individual tile flip (ms)")
    stagger_delay: int = Field(25, description="Delay between each tile starting its flip (ms)")
    message_interval: RangeOrInt = Field(4000, description="Time to show a settled message before the next transition (ms). Fixed int or {min, max} for random range.")
    scramble_rounds: RangeOrInt = Field(10, description="Scramble cycles per tile (1–50). Fixed int or {min, max} for random range per message.")
    temp_message_duration: int = Field(30, description="Default duration (seconds) for temporary messages before reverting")


class ColorsConfig(BaseModel):
    scramble_colors: list[str] = Field(
        default=["#00AAFF", "#00FFCC", "#AA00FF", "#FF2D00", "#FFCC00", "#FFFFFF"],
        description="Colors cycled through during the scramble animation"
    )
    accent_colors: list[str] = Field(
        default=["#00FF7F", "#FF4D00", "#AA00FF", "#00AAFF", "#00FFCC"],
        description="Colors used for the accent bars on the display"
    )


class FlipOffConfig(BaseModel):
    grid: GridConfig = Field(default_factory=GridConfig)
    timing: TimingConfig = Field(default_factory=TimingConfig)
    colors: ColorsConfig = Field(default_factory=ColorsConfig)
    messages: list[list[str]] = Field(
        default=[],
        description=(
            "List of messages to display. Each message is a list of strings, one per row. "
            "Use empty strings for blank rows."
        ),
        examples=[
            [["", "HELLO", "WORLD", "", ""], ["", "STAY HUNGRY", "STAY FOOLISH", "- STEVE JOBS", ""]],
        ]
    )


class MessagesUpdate(BaseModel):
    messages: list[list[str]] = Field(
        ...,
        description="Replacement message list. Each message is a list of strings, one per row.",
        examples=[
            [["", "HELLO", "WORLD", "", ""]],
        ]
    )


class TempMessageRequest(BaseModel):
    message: list[str] = Field(
        ...,
        description="The message to display temporarily. A list of strings, one per row.",
        examples=[["", "MEETING IN", "10 MINUTES", "", ""]],
    )
    duration: int | None = Field(
        None,
        description="How long (seconds) to show the message before reverting. Omit to use the global default.",
        examples=[30],
    )


class DeployStatus(BaseModel):
    ok: bool
    output: str


class OkResponse(BaseModel):
    ok: bool = True


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="FlipOff",
    description=(
        "Control API for FlipOff — a retro split-flap display for any TV or monitor.\n\n"
        "Changes to config are persisted and broadcast live to all connected displays via WebSocket."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ---------------------------------------------------------------------------
# WebSocket manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active = [c for c in self.active if c is not ws]

    async def broadcast(self, data: Any):
        payload = json.dumps(data)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()

# Active temp-message timer handle
_temp_timer: asyncio.TimerHandle | None = None


async def _revert_temp():
    global _temp_timer
    _temp_timer = None
    await manager.broadcast({"type": "temp_clear"})


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        await ws.send_text(json.dumps({"type": "config", "data": load_config()}))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ---------------------------------------------------------------------------
# Config API
# ---------------------------------------------------------------------------

@app.get(
    "/api/config",
    response_model=FlipOffConfig,
    summary="Get current config",
    description="Returns the full display configuration.",
    tags=["Config"],
)
async def get_config():
    return JSONResponse(load_config())


@app.post(
    "/api/config",
    response_model=OkResponse,
    summary="Replace full config",
    description="Replace the entire display configuration. Persists and broadcasts live.",
    tags=["Config"],
)
async def post_config(body: FlipOffConfig):
    data = body.model_dump()
    save_config(data)
    await manager.broadcast({"type": "config", "data": data})
    return {"ok": True}


@app.put(
    "/api/messages",
    response_model=OkResponse,
    summary="Update messages only",
    description="Replace just the messages list without touching grid, timing, or color settings.",
    tags=["Messages"],
)
async def put_messages(body: MessagesUpdate):
    config = load_config()
    config["messages"] = body.messages
    save_config(config)
    await manager.broadcast({"type": "config", "data": config})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Temporary message API
# ---------------------------------------------------------------------------

@app.post(
    "/api/temp-message",
    response_model=OkResponse,
    summary="Show a temporary message",
    description=(
        "Immediately displays a temporary message on all connected displays, pausing normal rotation. "
        "Reverts automatically after `duration` seconds (or `timing.temp_message_duration` if omitted). "
        "Calling again replaces the current temp message and resets the timer."
    ),
    tags=["Temp Message"],
)
async def post_temp_message(body: TempMessageRequest):
    global _temp_timer
    config = load_config()

    if _temp_timer is not None:
        _temp_timer.cancel()
        _temp_timer = None

    await manager.broadcast({"type": "temp_start", "data": {"message": body.message}})

    duration = body.duration if body.duration is not None else config.get("timing", {}).get("temp_message_duration", 30)
    loop = asyncio.get_event_loop()
    _temp_timer = loop.call_later(duration, lambda: asyncio.ensure_future(_revert_temp()))

    return {"ok": True}


@app.delete(
    "/api/temp-message",
    response_model=OkResponse,
    summary="Clear temporary message",
    description="Cancels any active temporary message and immediately resumes normal rotation.",
    tags=["Temp Message"],
)
async def delete_temp_message():
    global _temp_timer
    if _temp_timer is not None:
        _temp_timer.cancel()
        _temp_timer = None
    await manager.broadcast({"type": "temp_clear"})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Sounds API
# ---------------------------------------------------------------------------

class SoundInfo(BaseModel):
    name: str
    builtin: bool
    active: bool

class SetActiveSound(BaseModel):
    name: str = Field(..., description="Sound name to set as active. Use 'default' for the built-in sound.")


def _active_sound() -> str:
    return load_config().get("active_sound", BUILTIN_SOUND)


@app.get(
    "/api/sounds",
    response_model=list[SoundInfo],
    summary="List available sounds",
    description="Returns the built-in default sound plus any uploaded sounds.",
    tags=["Sounds"],
)
async def list_sounds():
    active = _active_sound()
    sounds = [SoundInfo(name=BUILTIN_SOUND, builtin=True, active=(active == BUILTIN_SOUND))]
    for f in sorted(SOUNDS_DIR.iterdir()):
        if f.suffix.lower() in ALLOWED_SOUND_EXTS:
            sounds.append(SoundInfo(name=f.stem, builtin=False, active=(active == f.stem)))
    return sounds


@app.post(
    "/api/sounds",
    response_model=OkResponse,
    summary="Upload a sound file",
    description="Upload an audio file (mp3, wav, ogg, m4a, flac). Saved to the sounds directory.",
    tags=["Sounds"],
)
async def upload_sound(file: UploadFile):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_SOUND_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {suffix}")
    stem = Path(file.filename).stem
    dest = SOUNDS_DIR / f"{stem}{suffix}"
    dest.write_bytes(await file.read())
    return {"ok": True}


@app.put(
    "/api/sounds/active",
    response_model=OkResponse,
    summary="Set active sound",
    description="Set which sound plays on tile flips. Use 'default' to revert to the built-in sound.",
    tags=["Sounds"],
)
async def set_active_sound(body: SetActiveSound):
    if body.name != BUILTIN_SOUND:
        matches = list(SOUNDS_DIR.glob(f"{body.name}.*"))
        if not matches:
            raise HTTPException(status_code=404, detail=f"Sound not found: {body.name}")
    config = load_config()
    config["active_sound"] = body.name
    save_config(config)
    # Broadcast so displays reload sound without page refresh
    await manager.broadcast({"type": "sound_changed", "data": {"name": body.name}})
    return {"ok": True}


@app.delete(
    "/api/sounds/{name}",
    response_model=OkResponse,
    summary="Delete an uploaded sound",
    description="Deletes an uploaded sound. Cannot delete the built-in default.",
    tags=["Sounds"],
)
async def delete_sound(name: str):
    if name == BUILTIN_SOUND:
        raise HTTPException(status_code=400, detail="Cannot delete the built-in sound")
    matches = list(SOUNDS_DIR.glob(f"{name}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail=f"Sound not found: {name}")
    for f in matches:
        f.unlink()
    # If deleted sound was active, revert to default
    if _active_sound() == name:
        config = load_config()
        config["active_sound"] = BUILTIN_SOUND
        save_config(config)
        await manager.broadcast({"type": "sound_changed", "data": {"name": BUILTIN_SOUND}})
    return {"ok": True}


@app.get(
    "/api/sounds/{name}/file",
    summary="Get sound file",
    description="Serves the audio file for a sound. Use 'default' to check if built-in (returns 204).",
    tags=["Sounds"],
    include_in_schema=False,
)
async def get_sound_file(name: str):
    if name == BUILTIN_SOUND:
        from fastapi.responses import Response
        return Response(status_code=204)
    matches = list(SOUNDS_DIR.glob(f"{name}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail=f"Sound not found: {name}")
    return FileResponse(matches[0])


# ---------------------------------------------------------------------------
# Deploy / Rollback API
# ---------------------------------------------------------------------------

def _run_script(script: str) -> tuple[bool, str]:
    """Run a shell script from the scripts/ dir, return (success, output)."""
    script_path = REPO_DIR / "scripts" / script
    if not script_path.exists():
        return False, f"Script not found: {script_path}"
    try:
        result = subprocess.run(
            ["bash", str(script_path)],
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "REPO_DIR": str(REPO_DIR)},
        )
        output = result.stdout + result.stderr
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Script timed out after 300s"
    except Exception as e:
        return False, str(e)


@app.post(
    "/api/deploy",
    response_model=DeployStatus,
    summary="Deploy latest code",
    description=(
        "Pulls the latest code from `main`, rebuilds the Docker image, and restarts the container. "
        "The current image is tagged as `flipoff:previous` before rebuilding (enables rollback). "
        "Runs asynchronously — the container will restart during this call."
    ),
    tags=["Deploy"],
)
async def deploy():
    ok, output = await asyncio.to_thread(_run_script, "deploy.sh")
    if not ok:
        raise HTTPException(status_code=500, detail=output)
    return {"ok": True, "output": output}


@app.post(
    "/api/rollback",
    response_model=DeployStatus,
    summary="Roll back to previous version",
    description=(
        "Reverts to the `flipoff:previous` Docker image and restarts the container. "
        "Fails if no previous image exists (i.e. deploy has never been run)."
    ),
    tags=["Deploy"],
)
async def rollback():
    ok, output = await asyncio.to_thread(_run_script, "rollback.sh")
    if not ok:
        raise HTTPException(status_code=500, detail=output)
    return {"ok": True, "output": output}


# ---------------------------------------------------------------------------
# Config page
# ---------------------------------------------------------------------------

@app.get("/config", response_class=HTMLResponse, include_in_schema=False)
async def config_page():
    return (BASE_DIR / "config.html").read_text()


@app.get("/send", response_class=HTMLResponse, include_in_schema=False)
async def send_page():
    return (BASE_DIR / "send.html").read_text()


# ---------------------------------------------------------------------------
# Static files + SPA catch-all
# ---------------------------------------------------------------------------

app.mount("/css", StaticFiles(directory=BASE_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    target = BASE_DIR / full_path
    if target.is_file():
        return FileResponse(target)
    return FileResponse(BASE_DIR / "index.html")
