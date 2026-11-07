"""HTTP API and static dashboard for OpenSail.

The frontend is a small vanilla-JavaScript single-page app in ``web/`` built
with Tailwind CSS. This module exposes the JSON/SSE API it uses and serves the
static files. All heavy lifting (ComfyUI, llama-server, audio.cpp) still lives in
the sibling modules.
"""

from __future__ import annotations

import base64
import io
import json
import mimetypes
import os
import random
import secrets
import tempfile
import threading
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Optional

import requests
from fastapi import Body, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    Response,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

from .audio import (
    AudioModel,
    _convert_to_wav,
    _sanitize_voice_name,
    _save_voice_reference,
)
from .audio_models import AUDIO_MODELS
from .chat import ChatModel, _image_content_part
from .comfy_client import ComfyUIClient
from .comfy_process import ComfyUIProcess
from .config import (
    APP_AUTH,
    AUDIOCPP_VOICE_DIR,
    BASE_DIR,
    CHAT_SYSTEM_PROMPT,
    COMFY_URL,
    DEFAULT_WORKFLOW,
    KIND_AUDIO,
    KIND_VIDEO,
    MAX_IMAGE_INPUTS,
    SERVER_NAME,
    SERVER_PORT,
)
from .errors import AppError
from .fields import (
    get_saved_fields,
    resolve_choices,
    save_workflow_fields,
)
from .gallery import (
    file_proxy_url,
    list_gallery_audio,
    list_gallery_images,
    list_gallery_videos,
)
from .models import CHAT_MODELS, DEFAULT_CHAT_MODEL_PATH
from .notes import get_workflow_notes, save_workflow_notes
from .presets import (
    candidate_with_preset_value,
    delete_preset,
    get_default_preset,
    get_default_preset_values,
    get_presets,
    save_preset,
    set_default_preset,
)
from .workflows import (
    build_workflow_from_bindings,
    get_display_names,
    get_selected_bindings,
    get_workflow_kind,
    list_load_audio_nodes,
    list_load_image_nodes,
    list_load_video_nodes,
    list_node_candidates,
    list_workflows,
)

WEB_DIR = os.path.join(BASE_DIR, "web")
MEDIA_DIR = os.path.join(tempfile.gettempdir(), "opensail_media")
UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "opensail_uploads")
os.makedirs(MEDIA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Long-lived backend managers. They start their subprocesses lazily.
client = ComfyUIClient()
comfy_process = ComfyUIProcess()
chat_model = ChatModel()
audio_model = AudioModel()

# Cancellation flag for ComfyUI generation. The HTTP request that started a run
# sets it through /api/generate/cancel.
_generation_cancel = threading.Event()

# In-memory stores. Tokens are unguessable and short-lived; the files themselves
# are cleaned up after a day.
_store_lock = threading.Lock()
_uploads: dict[str, dict] = {}
_media: dict[str, dict] = {}
_STORE_TTL = 24 * 60 * 60

TTS_MODELS = [entry for entry in AUDIO_MODELS if entry.get("task", "tts") == "tts"]
DEFAULT_SPEECH_MODEL = next(
    (entry["id"] for entry in AUDIO_MODELS if entry.get("family") == "pocket_tts"),
    TTS_MODELS[0]["id"] if TTS_MODELS else None,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sse(event: dict) -> str:
    """Serialize one server-sent event."""
    return "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"


def _sse_response(events) -> StreamingResponse:
    """Wrap an event generator in a no-buffering SSE response."""
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _cleanup_stores() -> None:
    """Drop stored uploads/media older than the TTL."""
    now = time.time()
    with _store_lock:
        for store in (_uploads, _media):
            for token, item in list(store.items()):
                if now - item["created"] > _STORE_TTL:
                    store.pop(token, None)
                    try:
                        os.remove(item["path"])
                    except OSError:
                        pass


def _store_upload(path: str, content_type: str, name: str) -> dict:
    token = uuid.uuid4().hex
    item = {
        "path": path,
        "content_type": content_type,
        "name": name,
        "created": time.time(),
    }
    with _store_lock:
        _uploads[token] = item
    return {
        "id": token,
        "url": f"/api/uploads/{token}",
        "name": name,
        "content_type": content_type,
        "size": os.path.getsize(path),
    }


def _store_media(path: str, content_type: str | None = None) -> str:
    token = uuid.uuid4().hex + (os.path.splitext(path)[1] or "")
    if content_type is None:
        content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with _store_lock:
        _media[token] = {
            "path": path,
            "content_type": content_type,
            "created": time.time(),
        }
    return f"/api/media/{token}"


def _upload_item(upload_id: str | None) -> dict:
    item = _uploads.get(upload_id or "")
    if item is None or not os.path.isfile(item["path"]):
        raise AppError("That upload is no longer available. Choose the file again.")
    return item


def _media_ref_path(ref: Optional[dict], kind: str = "file") -> Optional[str]:
    """Resolve an upload or gallery reference to a local file path."""
    if not ref:
        return None
    upload_id = ref.get("upload")
    if upload_id:
        return _upload_item(upload_id)["path"]
    gallery = ref.get("gallery")
    if gallery:
        try:
            if kind == "video":
                return client.fetch_video(gallery)
            if kind == "audio":
                return client.fetch_audio(gallery)
            content, _content_type = client.fetch_image_bytes(gallery)
        except Exception as exc:  # noqa: BLE001
            raise AppError(f"Could not load that gallery file: {exc}") from exc
        suffix = os.path.splitext(gallery.get("filename", ""))[1] or ".png"
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        return path
    return None


def _image_ref_image(ref: Optional[dict]) -> Image.Image | None:
    """Open an upload/gallery image reference as a PIL image."""
    if not ref:
        return None
    upload_id = ref.get("upload")
    if upload_id:
        path = _upload_item(upload_id)["path"]
        with Image.open(path) as image:
            return image.copy()
    gallery = ref.get("gallery")
    if gallery:
        content, _content_type = client.fetch_image_bytes(gallery)
        with Image.open(io.BytesIO(content)) as image:
            return image.copy()
    return None


def _workflow_name(value: str) -> str:
    """Validate a workflow filename and return it."""
    if value not in list_workflows():
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return value


def _candidate_payload(candidate: dict, names: dict, defaults: dict) -> dict:
    field = dict(candidate["field_def"])
    if field.get("widget") == "dropdown":
        field["choices"] = list(resolve_choices(field))
    display = candidate_with_preset_value(candidate, defaults)
    return {
        "id": candidate["id"],
        "node": candidate["node"],
        "input": candidate["input"],
        "class_type": candidate["class_type"],
        "title": candidate["title"],
        "field": candidate["field"],
        "label": candidate["label"],
        "display_name": names.get(candidate["id"], ""),
        "value": display.get("value"),
        "field_def": field,
    }


def _binding_values(candidates: list, selected: list, overrides: dict) -> dict:
    available = {candidate["id"]: candidate for candidate in candidates}
    values = {}
    for binding_id in selected:
        candidate = available.get(binding_id)
        if candidate is None:
            continue
        display = candidate_with_preset_value(candidate, overrides or {})
        if display.get("value") is not None:
            values[binding_id] = display["value"]
    return values


def _workflow_payload(workflow_name: str) -> dict:
    candidates = list_node_candidates(workflow_name)
    selected = get_selected_bindings(workflow_name)
    names = get_display_names(workflow_name)
    defaults = get_default_preset_values(workflow_name)
    presets = get_presets(workflow_name)
    return {
        "name": workflow_name,
        "kind": get_workflow_kind(workflow_name),
        "candidates": [
            _candidate_payload(candidate, names, defaults)
            for candidate in candidates
        ],
        "selected": selected,
        "names": names,
        "values": _binding_values(candidates, selected, defaults),
        "image_nodes": [
            {"id": node_id, "label": label}
            for node_id, label in list_load_image_nodes(workflow_name)[
                :MAX_IMAGE_INPUTS
            ]
        ],
        "audio_nodes": [
            {"id": node_id, "label": label}
            for node_id, label in list_load_audio_nodes(workflow_name)
        ],
        "video_nodes": [
            {"id": node_id, "label": label}
            for node_id, label in list_load_video_nodes(workflow_name)
        ],
        "presets": presets,
        "preset_names": list(presets),
        "default_preset": get_default_preset(workflow_name),
        "notes": get_workflow_notes(workflow_name),
        "saved_selection": get_saved_fields(workflow_name) is not None,
    }


def _audio_model_payload() -> list:
    return [
        {
            "alias": entry["alias"],
            "id": entry["id"],
            "family": entry["family"],
            "task": entry.get("task", "tts"),
        }
        for entry in AUDIO_MODELS
    ]


def _chat_model_payload() -> list:
    return [
        {
            "alias": alias,
            "path": path,
            # A vision projector is what makes image attachments usable.
            "multimodal": bool(mmproj),
        }
        for alias, path, mmproj in CHAT_MODELS
    ]


def _synthesize_reply(text: str, voice: str | None) -> str | None:
    """Synthesize text with audio.cpp and return a media URL, or None."""
    if audio_model is None or not DEFAULT_SPEECH_MODEL or not text.strip():
        return None
    path = None
    for _status, audio in audio_model.generate(
        DEFAULT_SPEECH_MODEL, text, voice=voice
    ):
        path = audio
    if not path:
        return None
    return _store_media(path, "audio/wav")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class FieldEntry(BaseModel):
    id: str
    name: str = ""


class FieldSelection(BaseModel):
    bindings: list[FieldEntry] = []


class NotesBody(BaseModel):
    notes: str = ""


class PresetBody(BaseModel):
    name: str
    values: dict[str, Any] = {}


class PresetNameBody(BaseModel):
    name: Optional[str] = None


class MediaRef(BaseModel):
    upload: Optional[str] = None
    gallery: Optional[dict] = None


class GenerateBody(BaseModel):
    workflow: str
    values: dict[str, Any] = {}
    randomize_seed: bool = True
    images: list[Optional[MediaRef]] = []
    audio: Optional[MediaRef] = None
    video: Optional[MediaRef] = None


class ChatMessage(BaseModel):
    role: str
    content: str = ""
    images: list[str] = []


class ChatBody(BaseModel):
    messages: list[ChatMessage] = []
    system_prompt: str = ""
    enable_thinking: bool = False
    speak_engine: str = "off"
    voice: Optional[str] = None
    model_path: Optional[str] = None


class ChatLoadBody(BaseModel):
    path: Optional[str] = None


class AudioLoadBody(BaseModel):
    model_id: str


class SaveVoiceBody(BaseModel):
    model_id: str
    name: str
    upload: str
    transcript: str = ""


class TTSBody(BaseModel):
    model_id: str
    text: str
    voice: Optional[str] = None
    speed: float = 1.0
    seed: Optional[int] = 0
    max_tokens: Optional[int] = 0
    voice_ref: Optional[str] = None
    reference_text: str = ""


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    yield
    for manager in (chat_model, audio_model, comfy_process):
        try:
            manager.unload()
        except Exception:  # noqa: BLE001
            pass


app = FastAPI(title="OpenSail", lifespan=_lifespan)


@app.middleware("http")
async def _basic_auth(request: Request, call_next):
    """Protect the dashboard with HTTP Basic auth when credentials are set."""
    if not APP_AUTH:
        return await call_next(request)

    header = request.headers.get("authorization", "")
    if header.lower().startswith("basic "):
        try:
            decoded = base64.b64decode(header[6:]).decode("utf-8")
            username, _, password = decoded.partition(":")
        except (ValueError, UnicodeDecodeError):
            username = password = ""
        expected_user, expected_password = APP_AUTH
        if secrets.compare_digest(username, expected_user) and secrets.compare_digest(
            password, expected_password
        ):
            return await call_next(request)

    return Response(
        status_code=401,
        content="Authentication required.",
        headers={"WWW-Authenticate": 'Basic realm="OpenSail"'},
    )


@app.exception_handler(AppError)
async def _app_error_handler(_request: Request, exc: AppError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# ---------------------------------------------------------------------------
# Bootstrap and workflow configuration
# ---------------------------------------------------------------------------


def _default_workflow(workflows: list[str]) -> str | None:
    """Pick the initial workflow, tolerating a stale configured default.

    When ``default_workflow`` names a file that no longer exists, prefer the
    first workflow that actually exposes editable node inputs. That avoids
    opening on an empty utility workflow (for example a file-input-only one)
    after a workflow has been renamed.
    """
    if not workflows:
        return None
    if DEFAULT_WORKFLOW in workflows:
        return DEFAULT_WORKFLOW
    lowered = DEFAULT_WORKFLOW.lower()
    for name in workflows:
        if name.lower() == lowered:
            return name
    for name in workflows:
        try:
            if list_node_candidates(name):
                return name
        except Exception:  # noqa: BLE001
            continue
    return workflows[0]


@app.get("/api/bootstrap")
def bootstrap() -> dict:
    workflows = list_workflows()
    default = _default_workflow(workflows)
    return {
        "workflows": [
            {"name": name, "label": os.path.splitext(name)[0]} for name in workflows
        ],
        "default_workflow": default,
        "chat_models": _chat_model_payload(),
        "default_chat_model": DEFAULT_CHAT_MODEL_PATH,
        "audio_models": _audio_model_payload(),
        "default_audio_model": AUDIO_MODELS[0]["id"] if AUDIO_MODELS else None,
        "tts_models": [
            {"alias": entry["alias"], "id": entry["id"]} for entry in TTS_MODELS
        ],
        "default_speech_model": DEFAULT_SPEECH_MODEL,
        "chat_system_prompt": CHAT_SYSTEM_PROMPT,
        "chat_loaded": chat_model.loaded,
        "chat_status": chat_model.status(),
        "audio_loaded": audio_model.loaded,
        "audio_status": audio_model.status(),
        "max_image_inputs": MAX_IMAGE_INPUTS,
        "comfy_url": COMFY_URL,
        "comfy_configured": comfy_process.configured,
        "comfy_managed": comfy_process.running,
        "server_name": SERVER_NAME,
        "server_port": SERVER_PORT,
        "auth_enabled": APP_AUTH is not None,
    }


@app.get("/api/status")
def status() -> dict:
    """Report whether ComfyUI is reachable, for the dashboard status chip."""
    try:
        response = requests.get(
            f"{COMFY_URL.rstrip('/')}/history", timeout=4
        )
        return {
            "comfy": response.status_code < 500,
            "comfy_managed": comfy_process.running,
            "comfy_configured": comfy_process.configured,
            "chat_loaded": chat_model.loaded,
            "audio_loaded": audio_model.loaded,
        }
    except requests.RequestException:
        return {
            "comfy": False,
            "comfy_managed": comfy_process.running,
            "comfy_configured": comfy_process.configured,
            "chat_loaded": chat_model.loaded,
            "audio_loaded": audio_model.loaded,
        }


@app.post("/api/comfy/start")
def comfy_start() -> dict:
    try:
        message = comfy_process.start()
    except AppError as exc:
        raise AppError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Could not start ComfyUI: {exc}") from exc
    return {
        "status": message,
        "comfy": comfy_process.reachable(),
        "comfy_managed": comfy_process.running,
        "comfy_configured": comfy_process.configured,
    }


@app.post("/api/comfy/stop")
def comfy_stop() -> dict:
    try:
        message = comfy_process.stop()
    except AppError as exc:
        raise AppError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Could not stop ComfyUI: {exc}") from exc
    return {
        "status": message,
        "comfy": comfy_process.reachable(),
        "comfy_managed": comfy_process.running,
        "comfy_configured": comfy_process.configured,
    }


@app.get("/api/workflows/{workflow_name}")
def get_workflow_config(workflow_name: str) -> dict:
    return _workflow_payload(_workflow_name(workflow_name))


@app.put("/api/workflows/{workflow_name}/fields")
def put_workflow_fields(workflow_name: str, body: FieldSelection) -> dict:
    name = _workflow_name(workflow_name)
    candidates = list_node_candidates(name)
    valid = {candidate["id"] for candidate in candidates}
    entries = []
    seen = set()
    for entry in body.bindings:
        if entry.id in valid and entry.id not in seen:
            seen.add(entry.id)
            clean_name = entry.name.strip()
            entries.append(f"{entry.id}|{clean_name}" if clean_name else entry.id)
    try:
        save_workflow_fields(name, entries)
    except OSError as exc:
        raise AppError(f"Could not save the input selection: {exc}") from exc
    return _workflow_payload(name)


@app.put("/api/workflows/{workflow_name}/notes")
def put_workflow_notes(workflow_name: str, body: NotesBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        notes = save_workflow_notes(name, body.notes)
    except OSError as exc:
        raise AppError(f"Could not save the workflow notes: {exc}") from exc
    return {"notes": notes}


@app.post("/api/workflows/{workflow_name}/presets")
def post_preset(workflow_name: str, body: PresetBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        save_preset(name, body.name, body.values)
    except (OSError, ValueError) as exc:
        raise AppError(f"Could not save the preset: {exc}") from exc
    return _workflow_payload(name)


@app.post("/api/workflows/{workflow_name}/presets/delete")
def post_delete_preset(workflow_name: str, body: PresetNameBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        removed = delete_preset(name, body.name or "")
    except OSError as exc:
        raise AppError(f"Could not delete the preset: {exc}") from exc
    if not removed:
        raise AppError("That preset no longer exists.")
    return _workflow_payload(name)


@app.post("/api/workflows/{workflow_name}/presets/default")
def post_default_preset(workflow_name: str, body: PresetNameBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        set_default_preset(name, body.name)
    except (OSError, ValueError) as exc:
        raise AppError(f"Could not set the default preset: {exc}") from exc
    return _workflow_payload(name)


# ---------------------------------------------------------------------------
# Uploads and generated media
# ---------------------------------------------------------------------------


@app.post("/api/uploads")
async def upload_file(file: UploadFile = File(...)) -> dict:
    _cleanup_stores()
    suffix = os.path.splitext(file.filename or "")[1]
    fd, path = tempfile.mkstemp(suffix=suffix, dir=UPLOAD_DIR)
    size = 0
    with os.fdopen(fd, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            out.write(chunk)
    content_type = (
        file.content_type
        or mimetypes.guess_type(file.filename or "")[0]
        or "application/octet-stream"
    )
    return _store_upload(path, content_type, file.filename or "upload")


@app.get("/api/uploads/{token}")
def get_upload(token: str) -> FileResponse:
    item = _uploads.get(token)
    if item is None or not os.path.isfile(item["path"]):
        raise HTTPException(status_code=404, detail="Upload not found.")
    return FileResponse(
        item["path"],
        media_type=item["content_type"],
        filename=item["name"],
        content_disposition_type="inline",
    )


@app.get("/api/media/{token}")
def get_media(token: str) -> FileResponse:
    item = _media.get(token)
    if item is None or not os.path.isfile(item["path"]):
        raise HTTPException(status_code=404, detail="Media not found.")
    return FileResponse(item["path"], media_type=item["content_type"])


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


def _generate_events(body: GenerateBody):
    """Yield SSE events while a ComfyUI workflow runs."""
    _generation_cancel.clear()
    prompt_id = None

    def cancelled() -> bool:
        return _generation_cancel.is_set()

    try:
        workflow_name = _workflow_name(body.workflow)
        kind = get_workflow_kind(workflow_name)
        values = dict(body.values or {})

        if body.randomize_seed:
            seed = random.randint(0, 2**32 - 1)
            values = {
                binding_id: (
                    seed
                    if binding_id.partition("|")[2] in ("seed", "noise_seed")
                    else value
                )
                for binding_id, value in values.items()
            }

        yield _sse({"type": "phase", "message": "Uploading inputs..."})
        yield _sse(
            {"type": "progress", "value": 0, "indeterminate": True,
             "message": "Uploading inputs..."}
        )

        image_filenames = {}
        load_nodes = list_load_image_nodes(workflow_name)[:MAX_IMAGE_INPUTS]
        for index, (node_id, _label) in enumerate(load_nodes):
            ref = body.images[index] if index < len(body.images) else None
            image = _image_ref_image(ref.model_dump() if ref else None)
            if image is not None:
                image_filenames[node_id] = client.upload_image(
                    image, prefix=f"node_{node_id}"
                )

        if cancelled():
            yield _sse({"type": "cancelled", "message": "Generation cancelled."})
            return

        audio_filenames = {}
        audio_nodes = list_load_audio_nodes(workflow_name)
        if audio_nodes and body.audio:
            path = _media_ref_path(body.audio.model_dump(), "audio")
            if path:
                audio_filenames[audio_nodes[0][0]] = client.upload_audio(
                    path, prefix=f"node_{audio_nodes[0][0]}"
                )

        video_filenames = {}
        video_nodes = list_load_video_nodes(workflow_name)
        if video_nodes and body.video:
            path = _media_ref_path(body.video.model_dump(), "video")
            if path:
                video_filenames[video_nodes[0][0]] = client.upload_video(
                    path, prefix=f"node_{video_nodes[0][0]}"
                )

        workflow = build_workflow_from_bindings(
            workflow_name=workflow_name,
            binding_values=values,
            image_filenames=image_filenames,
            audio_filenames=audio_filenames,
            video_filenames=video_filenames,
        )

        client_id = str(uuid.uuid4())
        prompt_id = client.queue_prompt(workflow, client_id)
        yield _sse(
            {"type": "progress", "value": 0, "indeterminate": True,
             "message": "Queued..."}
        )

        for value, maximum, node in client.stream_progress(prompt_id, client_id):
            if cancelled():
                client.cancel_prompt(prompt_id)
                yield _sse(
                    {"type": "cancelled", "message": "Generation cancelled."}
                )
                return
            if value is not None and maximum:
                yield _sse(
                    {
                        "type": "progress",
                        "value": value / maximum,
                        "indeterminate": False,
                        "message": f"Sampling step {value}/{maximum}",
                    }
                )
            elif node is not None:
                yield _sse(
                    {
                        "type": "progress",
                        "value": 0,
                        "indeterminate": True,
                        "message": f"Running node {node}...",
                    }
                )

        if cancelled():
            client.cancel_prompt(prompt_id)
            yield _sse({"type": "cancelled", "message": "Generation cancelled."})
            return

        yield _sse(
            {"type": "progress", "value": 1, "indeterminate": False,
             "message": "Fetching result..."}
        )

        if kind == KIND_AUDIO:
            audio_ref = client.wait_for_audio(prompt_id, client_id)
            path = client.fetch_audio(audio_ref)
            yield _sse(
                {
                    "type": "result",
                    "kind": "audio",
                    "url": _store_media(path),
                    "filename": audio_ref.get("filename", ""),
                }
            )
        elif kind == KIND_VIDEO:
            video_ref = client.wait_for_video(prompt_id, client_id)
            path = client.fetch_video(video_ref)
            yield _sse(
                {
                    "type": "result",
                    "kind": "video",
                    "url": _store_media(path),
                    "filename": video_ref.get("filename", ""),
                }
            )
        else:
            image_ref = client.wait_for_image(prompt_id, client_id)
            yield _sse(
                {
                    "type": "result",
                    "kind": "image",
                    "url": file_proxy_url(image_ref),
                    "filename": image_ref.get("filename", ""),
                }
            )
        yield _sse({"type": "done"})
    except requests.exceptions.ConnectionError:
        yield _sse(
            {
                "type": "error",
                "message": (
                    f"Could not connect to ComfyUI at {COMFY_URL}. Make sure "
                    "ComfyUI is running and the URL is correct."
                ),
            }
        )
    except (AppError, HTTPException) as exc:
        message = exc.detail if isinstance(exc, HTTPException) else str(exc)
        yield _sse({"type": "error", "message": message})
    except Exception as exc:  # noqa: BLE001
        yield _sse({"type": "error", "message": f"Generation failed: {exc}"})


@app.post("/api/generate")
def generate(body: GenerateBody):
    return _sse_response(_generate_events(body))


@app.post("/api/generate/cancel")
def cancel_generation() -> dict:
    _generation_cancel.set()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Gallery
# ---------------------------------------------------------------------------


@app.get("/api/gallery/images")
def gallery_images(limit: int = Query(200, ge=1, le=1000)) -> dict:
    return {"items": list_gallery_images(client, limit=limit)}


@app.get("/api/gallery/audio")
def gallery_audio(limit: int = Query(200, ge=1, le=1000)) -> dict:
    return {"items": list_gallery_audio(client, limit=limit)}


@app.get("/api/gallery/videos")
def gallery_videos(limit: int = Query(200, ge=1, le=1000)) -> dict:
    return {"items": list_gallery_videos(client, limit=limit)}


@app.get("/api/gallery/file")
def gallery_file(
    request: Request,
    filename: str,
    subfolder: str = "",
    type: str = "output",
):
    """Proxy a ComfyUI output file (image, audio or video) to the browser."""
    params = {"filename": filename, "subfolder": subfolder, "type": type}
    headers = {}
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    try:
        upstream = requests.get(
            f"{COMFY_URL.rstrip('/')}/view",
            params=params,
            stream=True,
            timeout=300,
            headers=headers,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if upstream.status_code >= 400:
        upstream.close()
        raise HTTPException(status_code=upstream.status_code)

    response_headers = {}
    for key in (
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
        "Last-Modified",
        "ETag",
    ):
        value = upstream.headers.get(key)
        if value:
            response_headers[key] = value
    response_headers.setdefault("Content-Disposition", "inline")

    def _iter():
        try:
            yield from upstream.iter_content(chunk_size=64 * 1024)
        finally:
            upstream.close()

    return StreamingResponse(
        _iter(),
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=upstream.headers.get("Content-Type"),
    )


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


def _chat_messages(body: ChatBody) -> list:
    messages = []
    if body.system_prompt and body.system_prompt.strip():
        messages.append(
            {"role": "system", "content": body.system_prompt.strip()}
        )
    for item in body.messages:
        role = item.role if item.role in ("user", "assistant", "system") else "user"
        parts = []
        for upload_id in item.images:
            try:
                path = _upload_item(upload_id)["path"]
            except AppError:
                continue
            image = _image_content_part(path)
            if image is not None:
                parts.append(image)
        if parts:
            if item.content:
                parts.append({"type": "text", "text": item.content})
            messages.append({"role": role, "content": parts})
        elif item.content:
            messages.append({"role": role, "content": item.content})
    return messages


def _chat_events(body: ChatBody):
    # A cancel clicked after the previous stream ended can still be in flight;
    # clear it here so it cannot abort this new reply.
    chat_model.reset_cancel()
    try:
        messages = _chat_messages(body)
        if not messages:
            yield _sse({"type": "error", "message": "Send a message first."})
            return
        selected_model = (body.model_path or "").strip()
        needs_load = not chat_model.loaded or (
            selected_model
            and os.path.normpath(chat_model.path) != os.path.normpath(selected_model)
        )
        if needs_load:
            yield _sse(
                {"type": "phase", "message": "Loading the chat model..."}
            )
            chat_model.load(selected_model or None)
            yield _sse(
                {
                    "type": "model",
                    "status": chat_model.status(),
                    "loaded": chat_model.loaded,
                }
            )
        yield _sse({"type": "phase", "message": "Thinking..."})

        text = ""
        try:
            for text in chat_model.stream(
                messages, enable_thinking=body.enable_thinking
            ):
                yield _sse({"type": "chunk", "text": text})
        except AppError as exc:
            yield _sse({"type": "error", "message": str(exc)})
            return
        except Exception as exc:  # noqa: BLE001
            yield _sse({"type": "error", "message": f"Chat failed: {exc}"})
            return

        if (
            body.speak_engine == "pocket"
            and text.strip()
            and not chat_model.cancelled
        ):
            yield _sse(
                {"type": "phase", "message": "Synthesizing the reply..."}
            )
            try:
                url = _synthesize_reply(text, body.voice)
                if url:
                    yield _sse({"type": "audio", "url": url})
            except Exception as exc:  # noqa: BLE001
                yield _sse(
                    {
                        "type": "warning",
                        "message": f"Could not speak the reply: {exc}",
                    }
                )
        yield _sse({"type": "done"})
    except AppError as exc:
        yield _sse({"type": "error", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        yield _sse({"type": "error", "message": f"Chat failed: {exc}"})


@app.post("/api/chat/stream")
def chat_stream(body: ChatBody):
    return _sse_response(_chat_events(body))


@app.post("/api/chat/load")
def chat_load(body: ChatLoadBody = Body(default=ChatLoadBody())) -> dict:
    try:
        status = chat_model.load(body.path)
    except AppError as exc:
        raise AppError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Could not load the chat model: {exc}") from exc
    return {"status": status, "loaded": chat_model.loaded}


@app.post("/api/chat/unload")
def chat_unload() -> dict:
    try:
        status = chat_model.unload()
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Could not unload the chat model: {exc}") from exc
    return {"status": status, "loaded": chat_model.loaded}


@app.post("/api/chat/cancel")
def chat_cancel() -> dict:
    chat_model.cancel()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Text to speech
# ---------------------------------------------------------------------------


@app.get("/api/audio/voices")
def audio_voices(model_id: str) -> dict:
    try:
        voices = audio_model.list_voices(model_id)
    except AppError as exc:
        raise AppError(str(exc)) from exc
    return {"voices": voices}


@app.post("/api/audio/load")
def audio_load(body: AudioLoadBody) -> dict:
    try:
        status = audio_model.load()
        voices = audio_model.list_voices(body.model_id)
    except AppError as exc:
        raise AppError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Could not load the audio model: {exc}") from exc
    return {"status": status, "voices": voices, "loaded": audio_model.loaded}


@app.post("/api/audio/unload")
def audio_unload() -> dict:
    try:
        status = audio_model.unload()
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Could not unload the audio model: {exc}") from exc
    return {"status": status, "voices": [], "loaded": audio_model.loaded}


@app.post("/api/audio/save-voice")
def audio_save_voice(body: SaveVoiceBody) -> dict:
    clean = _sanitize_voice_name(body.name)
    if not clean:
        raise AppError("Enter a name for the voice.")
    path = _upload_item(body.upload)["path"]
    try:
        wav = _convert_to_wav(path)
    except AppError as exc:
        raise AppError(str(exc)) from exc
    try:
        _save_voice_reference(AUDIOCPP_VOICE_DIR, clean, wav, body.transcript)
    except OSError as exc:
        raise AppError(f"Could not save voice: {exc}") from exc
    finally:
        if wav != path:
            try:
                os.remove(wav)
            except OSError:
                pass
    try:
        voices = audio_model.list_voices(body.model_id)
    except Exception:  # noqa: BLE001
        voices = []
    return {
        "status": f"Saved voice {clean}. It is also available in Chat.",
        "name": clean,
        "voices": voices or [clean],
    }


def _tts_events(body: TTSBody):
    try:
        voice_ref_path = None
        if body.voice_ref:
            voice_ref_path = _upload_item(body.voice_ref)["path"]
        yield _sse({"type": "phase", "message": "Generating audio..."})
        path = None
        for status, audio in audio_model.generate(
            model_id=body.model_id,
            text=body.text,
            voice=body.voice,
            speed=body.speed,
            seed=body.seed,
            max_tokens=body.max_tokens,
            voice_ref_path=voice_ref_path,
            reference_text=body.reference_text,
        ):
            if audio:
                path = audio
            elif status:
                yield _sse({"type": "phase", "message": status})
                if status.strip().lower().startswith("cancel"):
                    yield _sse(
                        {"type": "cancelled", "message": "Speech generation cancelled."}
                    )
                    return
        if not path:
            yield _sse({"type": "error", "message": "No audio was produced."})
            return
        yield _sse(
            {
                "type": "result",
                "kind": "audio",
                "url": _store_media(path, "audio/wav"),
            }
        )
        yield _sse({"type": "done"})
    except AppError as exc:
        yield _sse({"type": "error", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        yield _sse({"type": "error", "message": f"Audio generation failed: {exc}"})


@app.post("/api/audio/generate")
def audio_generate(body: TTSBody):
    return _sse_response(_tts_events(body))


@app.post("/api/audio/cancel")
def audio_cancel() -> dict:
    audio_model.cancel()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------

if os.path.isdir(os.path.join(WEB_DIR, "assets")):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(WEB_DIR, "assets")),
        name="assets",
    )


@app.get("/")
def index() -> FileResponse:
    return FileResponse(os.path.join(WEB_DIR, "index.html"), media_type="text/html")


@app.get("/favicon.ico")
def favicon():
    path = os.path.join(WEB_DIR, "assets", "favicon.svg")
    if os.path.isfile(path):
        return FileResponse(path, media_type="image/svg+xml")
    return Response(status_code=204)
