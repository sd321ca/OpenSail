"""HTTP API and static dashboard for OpenSail.

The frontend is a small vanilla-JavaScript single-page app in ``web/`` built
with Tailwind CSS. This module exposes the JSON/SSE API it uses and serves the
static files. All heavy lifting (ComfyUI, llama-server, audio.cpp) still lives in
the sibling modules.
"""

from __future__ import annotations

import asyncio
import io
import json
import mimetypes
import os
import random
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

from . import db, edition, identity, storage
from .audio import (
    AudioModel,
    _convert_to_wav,
    _sanitize_voice_name,
    _save_voice_reference,
    delete_saved_voice,
    list_saved_voices,
)
from .audio_models import AUDIO_MODELS
from .chat import ChatModel, _image_content_part
from .comfy_client import ComfyUIClient
from .comfy_process import ComfyUIProcess
from .config import (
    AUDIOCPP_VOICE_DIR,
    BASE_DIR,
    CHAT_SYSTEM_PROMPT,
    COMFY_STOP_ON_EXIT,
    COMFY_URL,
    DEFAULT_WORKFLOW,
    GENERATION_MAX_CONCURRENT,
    KIND_AUDIO,
    KIND_VIDEO,
    LOCAL_MEDIA_DIR,
    LOCAL_OWNER_ID,
    MAX_IMAGE_INPUTS,
    SERVER_NAME,
    SERVER_PORT,
    THUMBNAILS_DIR,
)
from .errors import AppError
from .fields import (
    get_saved_fields,
    resolve_choices,
    save_workflow_fields,
)
from .gallery import (
    IMAGE_EXTENSIONS,
    LOCAL_MEDIA_TYPE,
    cleanup_orphaned_thumbnails,
    clear_comfy_media_dirs,
    delete_local_media,
    ensure_local_thumbnail,
    file_proxy_url,
    list_gallery_audio,
    list_gallery_images,
    list_gallery_videos,
    local_media_path,
    move_history_to_media,
    save_image_thumbnail,
    save_video_thumbnail,
    thumbnail_path,
)
from .image_meta import extract_image_metadata, extract_image_metadata_path
from .jobs import JobForbidden, JobNotFound, JobQueue
from .models import CHAT_MODELS, DEFAULT_CHAT_MODEL_PATH
from .notes import get_workflow_notes, save_workflow_notes
from .personas import delete_persona, get_personas, save_persona
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
os.makedirs(THUMBNAILS_DIR, exist_ok=True)
os.makedirs(LOCAL_MEDIA_DIR, exist_ok=True)

# Per-user data lives under ``data/users/<id>/``. Make sure its directory tree
# exists before any request can read it.
storage.ensure_owner_tree(LOCAL_OWNER_ID)

# mimetypes misses a few modern formats on some platforms (notably WebP and
# AVIF on Windows). Local gallery files are served inline, so supply them.
_EXTRA_MEDIA_TYPES = {
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


def _local_media_type(path: str) -> str | None:
    """Return the content type to serve a local media file with."""
    extension = os.path.splitext(path)[1].lower()
    return mimetypes.guess_type(path)[0] or _EXTRA_MEDIA_TYPES.get(extension)


# Long-lived backend managers. They start their subprocesses lazily.
client = ComfyUIClient()
comfy_process = ComfyUIProcess()
chat_model = ChatModel()
audio_model = AudioModel()

# ComfyUI generation runs on a background worker so a job outlives the browser
# connection, and so requests from several accounts queue instead of failing.
# The dashboard polls /api/generate/status to catch up after navigation, a
# reload, or the phone screen turning off.
queue = JobQueue(lambda job: _generate_events(job), GENERATION_MAX_CONCURRENT)

# In-memory stores. Tokens are unguessable and short-lived; the files themselves
# are cleaned up after a day.
_store_lock = threading.Lock()
_uploads: dict[str, dict] = {}
_media: dict[str, dict] = {}
_STORE_TTL = 24 * 60 * 60

# Orphaned thumbnails are checked at startup and when a gallery is opened. A
# short throttle keeps switching between gallery tabs from rescanning the
# ComfyUI media folders repeatedly.
_thumbnail_cleanup_lock = threading.Lock()
_last_thumbnail_cleanup = 0.0
_THUMBNAIL_CLEANUP_INTERVAL = 60.0

TTS_MODELS = [entry for entry in AUDIO_MODELS if entry.get("task", "tts") == "tts"]
TTS_MODEL_IDS = {entry["id"] for entry in TTS_MODELS}


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


def _cleanup_thumbnails(force: bool = False) -> None:
    """Remove cached thumbnails whose source media file is gone."""
    global _last_thumbnail_cleanup
    now = time.time()
    if not force and now - _last_thumbnail_cleanup < _THUMBNAIL_CLEANUP_INTERVAL:
        return

    with _thumbnail_cleanup_lock:
        now = time.time()
        if not force and now - _last_thumbnail_cleanup < _THUMBNAIL_CLEANUP_INTERVAL:
            return
        _last_thumbnail_cleanup = now
        try:
            cleanup_orphaned_thumbnails(client)
        except Exception:  # noqa: BLE001 - cleanup is best-effort
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


def _media_ref_path(
    ref: Optional[dict], kind: str = "file", owner_id: int = LOCAL_OWNER_ID
) -> Optional[str]:
    """Resolve an upload or gallery reference to a local file path."""
    if not ref:
        return None
    upload_id = ref.get("upload")
    if upload_id:
        return _upload_item(upload_id)["path"]
    gallery = ref.get("gallery")
    if gallery:
        if gallery.get("type") == LOCAL_MEDIA_TYPE:
            path = local_media_path(
                owner_id,
                gallery.get("subfolder", ""),
                gallery.get("filename", ""),
            )
            if path is None:
                raise AppError("That file is no longer in the local media folder.")
            return path
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


def _image_ref_image(
    ref: Optional[dict], owner_id: int = LOCAL_OWNER_ID
) -> Image.Image | None:
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
        if gallery.get("type") == LOCAL_MEDIA_TYPE:
            path = local_media_path(
                owner_id,
                gallery.get("subfolder", ""),
                gallery.get("filename", ""),
            )
            if path is None:
                return None
            with Image.open(path) as image:
                return image.copy()
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


def _visible_prompt_ids(owner_id: int):
    """Return the ComfyUI prompt ids an owner may see, or None for all."""
    if not edition.can("accounts"):
        return None
    ids = db.prompt_ids_for(owner_id)
    if not ids and owner_id == LOCAL_OWNER_ID:
        # An installation that predates accounts has no recorded prompt ids
        # yet, so its original owner keeps seeing the existing history.
        return None
    return ids


def _require_admin() -> None:
    """Refuse an action that affects every account."""
    if not identity.current_owner().is_admin:
        raise HTTPException(
            status_code=403, detail="Administrator access required."
        )


def _owns_media(owner_id: int, filename: str) -> bool:
    """Return whether an owner produced this ComfyUI output file."""
    if not edition.can("accounts"):
        return True
    owner = db.media_owner(filename)
    if owner is None:
        # Files generated before accounts existed belong to the first owner.
        return owner_id == LOCAL_OWNER_ID
    return owner == owner_id


def _owns_thumbnail(owner_id: int, name: str) -> bool:
    """Return whether an owner produced the image behind a thumbnail."""
    if not edition.can("accounts"):
        return True
    candidates = [name]
    if name.lower().endswith(".jpg"):
        candidates.append(name[:-4])
    return any(db.media_owner(candidate) == owner_id for candidate in candidates)


def _owned_prompt_ids(owner_id: int, prompt_ids: list[str]) -> list[str]:
    """Keep only the prompt ids that belong to ``owner_id``."""
    if not edition.can("accounts"):
        return prompt_ids
    owned = db.prompt_ids_for(owner_id)
    if not owned and owner_id == LOCAL_OWNER_ID:
        return prompt_ids
    return [prompt_id for prompt_id in prompt_ids if prompt_id in owned]


def _workflow_payload(owner_id: int, workflow_name: str) -> dict:
    candidates = list_node_candidates(workflow_name)
    selected = get_selected_bindings(workflow_name, owner_id)
    names = get_display_names(workflow_name, owner_id)
    defaults = get_default_preset_values(owner_id, workflow_name)
    presets = get_presets(owner_id, workflow_name)
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
        "default_preset": get_default_preset(owner_id, workflow_name),
        "notes": get_workflow_notes(owner_id, workflow_name),
        "saved_selection": get_saved_fields(owner_id, workflow_name) is not None,
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


def _synthesize_reply(
    text: str, voice: str | None, model_id: str | None
) -> str | None:
    """Synthesize text with an audio.cpp model and return a media URL, or None."""
    model_id = (model_id or "").strip()
    if audio_model is None or not model_id or not text.strip():
        return None
    path = None
    for _status, audio in audio_model.generate(model_id, text, voice=voice):
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
    visible: bool = True


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


class GalleryItemRef(BaseModel):
    filename: str = ""
    subfolder: str = ""
    type: str = ""
    prompt_id: str = ""


class GallerySelectionBody(BaseModel):
    items: list[GalleryItemRef] = []


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


class PersonaBody(BaseModel):
    name: str
    system_prompt: str = ""
    voice_engine: str = "off"
    voice: str = ""


class PersonaNameBody(BaseModel):
    name: str = ""


class AudioLoadBody(BaseModel):
    model_id: str


class SaveVoiceBody(BaseModel):
    model_id: str
    name: str
    upload: str
    transcript: str = ""


class DeleteVoiceBody(BaseModel):
    name: str


class TTSBody(BaseModel):
    model_id: str
    text: str
    voice: Optional[str] = None
    speed: float = 1.0
    seed: Optional[int] = 0
    max_tokens: Optional[int] = 0
    voice_ref: Optional[str] = None
    reference_text: str = ""


class FreeBody(BaseModel):
    unload_models: bool = False
    free_memory: bool = False


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------


def _install_loop_exception_handler() -> None:
    """Silence benign Proactor connection-reset callbacks on Windows.

    When the browser aborts an SSE/media request, Windows' Proactor event loop
    calls ``_call_connection_lost`` on a socket the peer already reset. That
    raises ``ConnectionResetError`` inside an asyncio callback and the default
    handler prints a full traceback. The connection is gone either way, so the
    report is not actionable; keep every other loop error visible.
    """
    loop = asyncio.get_running_loop()
    previous = loop.get_exception_handler()

    def handle(loop, context):
        exc = context.get("exception")
        callback = getattr(context.get("handle"), "_callback", None)
        if (
            isinstance(exc, ConnectionError)
            and getattr(callback, "__name__", "") == "_call_connection_lost"
        ):
            return
        if previous is not None:
            previous(loop, context)
        else:
            loop.default_exception_handler(context)

    loop.set_exception_handler(handle)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    _install_loop_exception_handler()
    for hook in edition.HOOKS.get("startup") or []:
        try:
            hook()
        except Exception:  # noqa: BLE001 - an edition hook must not block startup
            pass
    # Scan in the background so a large ComfyUI output folder does not delay
    # startup.
    threading.Thread(
        target=_cleanup_thumbnails,
        kwargs={"force": True},
        daemon=True,
    ).start()
    yield
    for hook in edition.HOOKS.get("shutdown") or []:
        try:
            hook()
        except Exception:  # noqa: BLE001
            pass
    for manager in (chat_model, audio_model):
        try:
            manager.unload()
        except Exception:  # noqa: BLE001
            pass
    if COMFY_STOP_ON_EXIT:
        try:
            comfy_process.unload()
        except Exception:  # noqa: BLE001
            pass


# Load the selected edition before the app is built. Premium registers its
# capabilities, authentication provider and routes; the community edition
# leaves every default in place.
edition.load()

app = FastAPI(title="OpenSail", lifespan=_lifespan)

for _router in edition.HOOKS.get("mount_routes") or []:
    app.include_router(_router)


def _is_public_path(path: str) -> bool:
    """Return whether a path must be reachable before signing in."""
    if path in ("/", "/favicon.ico") or path.startswith("/assets/"):
        return True
    for prefix in edition.HOOKS.get("public_paths") or ():
        prefix = prefix.rstrip("/")
        if path == prefix or path.startswith(prefix + "/"):
            return True
    return False


@app.middleware("http")
async def _owner_middleware(request: Request, call_next):
    """Resolve who is calling and expose it to the rest of the request."""
    if _is_public_path(request.url.path):
        return await call_next(request)

    provider = edition.HOOKS.get("auth_provider")
    owner = (
        provider(request) if provider is not None else identity.LOCAL_OWNER
    )
    if owner is None:
        if request.url.path.startswith("/api/"):
            return JSONResponse(
                status_code=401, content={"detail": "Authentication required."}
            )
        return Response(status_code=401, content="Authentication required.")

    token = identity.set_owner(owner)
    try:
        return await call_next(request)
    finally:
        identity.reset_owner(token)


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
    owner = identity.current_owner()
    licence_hook = edition.HOOKS.get("licence_state")
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
        "chat_system_prompt": CHAT_SYSTEM_PROMPT,
        "chat_personas": get_personas(owner.id),
        "chat_loaded": chat_model.loaded,
        "chat_model": chat_model.loaded_name,
        "chat_status": chat_model.status(),
        "audio_loaded": audio_model.loaded,
        "audio_status": audio_model.status(),
        "max_image_inputs": MAX_IMAGE_INPUTS,
        "comfy_url": COMFY_URL,
        "comfy_configured": comfy_process.configured,
        "comfy_managed": comfy_process.running,
        "server_name": SERVER_NAME,
        "server_port": SERVER_PORT,
        "edition": edition.current(),
        "capabilities": dict(edition.CAPABILITIES),
        "user": {
            "id": owner.id,
            "username": owner.username,
            "is_admin": owner.is_admin,
        },
        "licence": licence_hook() if licence_hook else None,
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
            "chat_model": chat_model.loaded_name,
            "audio_loaded": audio_model.loaded,
        }
    except requests.RequestException:
        return {
            "comfy": False,
            "comfy_managed": comfy_process.running,
            "comfy_configured": comfy_process.configured,
            "chat_loaded": chat_model.loaded,
            "chat_model": chat_model.loaded_name,
            "audio_loaded": audio_model.loaded,
        }


@app.post("/history")
def clear_history() -> dict:
    """Clear ComfyUI's generation history and the last-run dashboard state."""
    _require_admin()
    try:
        response = requests.post(
            f"{COMFY_URL.rstrip('/')}/history",
            json={"clear": True},
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise AppError(f"Could not clear ComfyUI history: {exc}") from exc

    # The Generate page restores the workflow and output of the most recent
    # run from this snapshot. Clearing history should also forget that run so
    # it is not reopened afterwards. Leave an in-flight generation untouched.
    if not queue.any_active():
        queue.clear_latest(identity.current_owner().id)
    return {"status": "History cleared."}


@app.post("/api/comfy/media/clear")
def clear_comfy_media() -> dict:
    """Delete the contents of ComfyUI's output, input and temp folders."""
    _require_admin()
    if queue.any_active():
        raise AppError(
            "Wait for the current generation to finish before deleting "
            "ComfyUI's media files."
        )

    result = clear_comfy_media_dirs()

    # The last result now points at a deleted file, so forget that run.
    queue.clear_latest(identity.current_owner().id)

    deleted = result["deleted"]
    failed = result["failed"]
    message = f"Deleted {deleted} file{'' if deleted == 1 else 's'}."
    if failed:
        message += f" {failed} could not be deleted."
    return {"status": message, **result}


@app.post("/free")
def free_memory(body: FreeBody = Body(default=FreeBody())) -> dict:
    """Ask ComfyUI to unload models and/or free cached memory."""
    if queue.any_active():
        raise AppError(
            "Wait for the current generation to finish before freeing memory."
        )
    try:
        response = requests.post(
            f"{COMFY_URL.rstrip('/')}/free",
            json=body.model_dump(),
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise AppError(f"Could not free ComfyUI memory: {exc}") from exc

    actions = []
    if body.unload_models:
        actions.append("Models unloaded")
    if body.free_memory:
        actions.append("Memory freed")
    return {"status": " and ".join(actions) + "." if actions else "Nothing to do."}


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
    return _workflow_payload(identity.current_owner().id, _workflow_name(workflow_name))


@app.put("/api/workflows/{workflow_name}/fields")
def put_workflow_fields(workflow_name: str, body: FieldSelection) -> dict:
    name = _workflow_name(workflow_name)
    candidates = list_node_candidates(name)
    valid = {candidate["id"] for candidate in candidates}
    entries = []
    seen = set()
    for entry in body.bindings:
        if entry.id not in valid or entry.id in seen:
            continue
        seen.add(entry.id)
        clean_name = entry.name.strip()
        if not entry.visible and not clean_name:
            # A hidden input with no alias carries no state worth storing.
            continue
        visible = "true" if entry.visible else "false"
        entries.append(f"{entry.id}|{visible}|{clean_name}")

    try:
        save_workflow_fields(identity.current_owner().id, name, entries)
    except OSError as exc:
        raise AppError(f"Could not save the input selection: {exc}") from exc
    return _workflow_payload(identity.current_owner().id, name)


@app.put("/api/workflows/{workflow_name}/notes")
def put_workflow_notes(workflow_name: str, body: NotesBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        notes = save_workflow_notes(identity.current_owner().id, name, body.notes)
    except OSError as exc:
        raise AppError(f"Could not save the workflow notes: {exc}") from exc
    return {"notes": notes}


@app.post("/api/workflows/{workflow_name}/presets")
def post_preset(workflow_name: str, body: PresetBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        save_preset(
            identity.current_owner().id, name, body.name, body.values
        )
    except (OSError, ValueError) as exc:
        raise AppError(f"Could not save the preset: {exc}") from exc
    return _workflow_payload(identity.current_owner().id, name)


@app.post("/api/workflows/{workflow_name}/presets/delete")
def post_delete_preset(workflow_name: str, body: PresetNameBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        removed = delete_preset(identity.current_owner().id, name, body.name or "")
    except OSError as exc:
        raise AppError(f"Could not delete the preset: {exc}") from exc
    if not removed:
        raise AppError("That preset no longer exists.")
    return _workflow_payload(identity.current_owner().id, name)


@app.post("/api/workflows/{workflow_name}/presets/default")
def post_default_preset(workflow_name: str, body: PresetNameBody) -> dict:
    name = _workflow_name(workflow_name)
    try:
        set_default_preset(identity.current_owner().id, name, body.name)
    except (OSError, ValueError) as exc:
        raise AppError(f"Could not set the default preset: {exc}") from exc
    return _workflow_payload(identity.current_owner().id, name)


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


def _generate_events(job):
    """Yield generation events while a ComfyUI workflow runs."""
    body = job.body
    owner_id = job.owner_id
    prompt_id = None

    def cancelled() -> bool:
        return job.cancel.is_set()

    try:
        workflow_name = _workflow_name(body.workflow)
        kind = get_workflow_kind(workflow_name)
        values = dict(body.values or {})

        if body.randomize_seed:
            seed = random.randint(0, 2**32 - 1)
            # Apply the same fresh seed to every seed input in the workflow,
            # whether or not its control is currently shown.
            seed_ids = {
                candidate["id"]
                for candidate in list_node_candidates(workflow_name)
                if candidate["input"] in ("seed", "noise_seed")
            }
            seed_ids.update(
                binding_id
                for binding_id in values
                if binding_id.partition("|")[2] in ("seed", "noise_seed")
            )
            values = {**values, **{binding_id: seed for binding_id in seed_ids}}

        yield {"type": "phase", "message": "Uploading inputs..."}
        yield {
            "type": "progress",
            "value": 0,
            "indeterminate": True,
            "message": "Uploading inputs...",
        }

        image_filenames = {}
        load_nodes = list_load_image_nodes(workflow_name)[:MAX_IMAGE_INPUTS]
        for index, (node_id, _label) in enumerate(load_nodes):
            ref = body.images[index] if index < len(body.images) else None
            image = _image_ref_image(
                ref.model_dump() if ref else None, owner_id
            )
            if image is not None:
                image_filenames[node_id] = client.upload_image(
                    image, prefix=f"node_{node_id}"
                )

        if cancelled():
            yield {"type": "cancelled", "message": "Generation cancelled."}
            return

        audio_filenames = {}
        audio_nodes = list_load_audio_nodes(workflow_name)
        if audio_nodes and body.audio:
            path = _media_ref_path(body.audio.model_dump(), "audio", owner_id)
            if path:
                audio_filenames[audio_nodes[0][0]] = client.upload_audio(
                    path, prefix=f"node_{audio_nodes[0][0]}"
                )

        video_filenames = {}
        video_nodes = list_load_video_nodes(workflow_name)
        if video_nodes and body.video:
            path = _media_ref_path(body.video.model_dump(), "video", owner_id)
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
        yield {
            "type": "queued",
            "prompt_id": prompt_id,
            "value": 0,
            "indeterminate": True,
            "message": "Queued...",
        }

        for value, maximum, node in client.stream_progress(prompt_id, client_id):
            if cancelled():
                client.cancel_prompt(prompt_id)
                yield {"type": "cancelled", "message": "Generation cancelled."}
                return
            if value is not None and maximum:
                yield {
                    "type": "progress",
                    "value": value / maximum,
                    "indeterminate": False,
                    "message": f"Sampling step {value}/{maximum}",
                }
            elif node is not None:
                yield {
                    "type": "progress",
                    "value": 0,
                    "indeterminate": True,
                    "message": f"Running node {node}...",
                }

        if cancelled():
            client.cancel_prompt(prompt_id)
            yield {"type": "cancelled", "message": "Generation cancelled."}
            return

        yield {
            "type": "progress",
            "value": 1,
            "indeterminate": False,
            "message": "Fetching result...",
        }

        if kind == KIND_AUDIO:
            audio_ref = client.wait_for_audio(prompt_id, client_id)
            path = client.fetch_audio(audio_ref)
            db.record_media(owner_id, audio_ref.get("filename", ""), "audio")
            yield {
                "type": "result",
                "kind": "audio",
                "url": _store_media(path),
                "filename": audio_ref.get("filename", ""),
            }
        elif kind == KIND_VIDEO:
            video_ref = client.wait_for_video(prompt_id, client_id)
            path = client.fetch_video(video_ref)
            db.record_media(owner_id, video_ref.get("filename", ""), "video")
            # Cache a still frame for the Video Gallery's preview poster.
            # This is best-effort: a failure here must not fail generation.
            try:
                save_video_thumbnail(
                    owner_id, video_ref.get("filename", ""), path
                )
            except Exception:  # noqa: BLE001
                pass
            yield {
                "type": "result",
                "kind": "video",
                "url": _store_media(path),
                "filename": video_ref.get("filename", ""),
            }
        else:
            image_ref = client.wait_for_image(prompt_id, client_id)
            db.record_media(owner_id, image_ref.get("filename", ""), "image")
            # Cache a downscaled copy for the Image Gallery's preview tiles.
            # This is best-effort: a failure here must not fail generation.
            try:
                content, _content_type = client.fetch_image_bytes(image_ref)
                save_image_thumbnail(
                    owner_id, image_ref.get("filename", ""), content
                )
            except Exception:  # noqa: BLE001
                pass
            yield {
                "type": "result",
                "kind": "image",
                "url": file_proxy_url(image_ref),
                "filename": image_ref.get("filename", ""),
            }
        yield {"type": "done"}
    except requests.exceptions.ConnectionError:
        yield {
            "type": "error",
            "message": (
                f"Could not connect to ComfyUI at {COMFY_URL}. Make sure "
                "ComfyUI is running and the URL is correct."
            ),
        }
    except (AppError, HTTPException) as exc:
        message = exc.detail if isinstance(exc, HTTPException) else str(exc)
        yield {"type": "error", "message": message}
    except Exception as exc:  # noqa: BLE001
        yield {"type": "error", "message": f"Generation failed: {exc}"}


def _job_error(exc: Exception) -> HTTPException:
    """Map a queue error to the HTTP status the dashboard expects."""
    if isinstance(exc, JobNotFound):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=403, detail=str(exc))


@app.post("/api/generate")
def generate(body: GenerateBody) -> dict:
    """Queue a generation and return its first snapshot."""
    return queue.submit(identity.current_owner().id, body.workflow, body)


@app.get("/api/generate/status")
def generation_status() -> JSONResponse:
    """Return the live state of the caller's latest generation."""
    return JSONResponse(
        queue.latest(identity.current_owner().id), headers={"Cache-Control": "no-store"}
    )


@app.get("/api/generate/status/{job_id}")
def generation_status_by_id(job_id: str) -> JSONResponse:
    """Return one of the caller's jobs by id."""
    try:
        snapshot = queue.snapshot(job_id, identity.current_owner().id)
    except (JobNotFound, JobForbidden) as exc:
        raise _job_error(exc) from exc
    return JSONResponse(snapshot, headers={"Cache-Control": "no-store"})


@app.post("/api/generate/cancel")
def cancel_generation() -> dict:
    """Cancel the caller's active generation, if any."""
    return queue.cancel_latest(identity.current_owner().id)


@app.post("/api/generate/cancel/{job_id}")
def cancel_generation_by_id(job_id: str) -> dict:
    """Cancel one of the caller's generations."""
    try:
        return queue.cancel(job_id, identity.current_owner().id)
    except (JobNotFound, JobForbidden) as exc:
        raise _job_error(exc) from exc


# ---------------------------------------------------------------------------
# Gallery
# ---------------------------------------------------------------------------


@app.get("/api/gallery/images")
def gallery_images(limit: int = Query(200, ge=1, le=1000)) -> dict:
    _cleanup_thumbnails()
    owner_id = identity.current_owner().id
    return {
        "items": list_gallery_images(
            client,
            owner_id,
            limit=limit,
            allowed_prompt_ids=_visible_prompt_ids(owner_id),
        )
    }


@app.get("/api/gallery/image-metadata")
def gallery_image_metadata(
    filename: str,
    subfolder: str = "",
    type: str = "output",
) -> dict:
    """Return the ComfyUI generation metadata embedded in a gallery image."""
    if type == LOCAL_MEDIA_TYPE:
        path = local_media_path(identity.current_owner().id, subfolder, filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Media file not found.")
        return {
            "filename": filename,
            "metadata": extract_image_metadata_path(path),
        }

    try:
        content, _content_type = client.fetch_image_bytes(
            {"filename": filename, "subfolder": subfolder, "type": type}
        )
    except Exception as exc:  # noqa: BLE001
        raise AppError(
            f"Could not read metadata from ComfyUI at {COMFY_URL}: {exc}"
        ) from exc

    return {"filename": filename, "metadata": extract_image_metadata(content)}


@app.get("/api/gallery/audio")
def gallery_audio(limit: int = Query(200, ge=1, le=1000)) -> dict:
    owner_id = identity.current_owner().id
    return {
        "items": list_gallery_audio(
            client,
            owner_id,
            limit=limit,
            allowed_prompt_ids=_visible_prompt_ids(owner_id),
        )
    }


@app.get("/api/gallery/videos")
def gallery_videos(limit: int = Query(200, ge=1, le=1000)) -> dict:
    _cleanup_thumbnails()
    owner_id = identity.current_owner().id
    return {
        "items": list_gallery_videos(
            client,
            owner_id,
            limit=limit,
            allowed_prompt_ids=_visible_prompt_ids(owner_id),
        )
    }


@app.post("/api/gallery/delete")
def gallery_delete(body: GallerySelectionBody) -> dict:
    """Delete selected ComfyUI history entries and local media files."""
    prompt_ids = []
    local_items = []
    for item in body.items:
        if item.type == LOCAL_MEDIA_TYPE:
            local_items.append(item)
        elif item.prompt_id:
            prompt_ids.append(item.prompt_id)

    prompt_ids = list(dict.fromkeys(prompt_ids))
    if prompt_ids:
        allowed = _owned_prompt_ids(
            identity.current_owner().id, prompt_ids
        )
        if len(allowed) != len(prompt_ids):
            raise HTTPException(
                status_code=403,
                detail="Those items belong to another user.",
            )
        prompt_ids = allowed
        try:
            client.delete_history(prompt_ids)
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                f"Could not delete from ComfyUI history: {exc}"
            ) from exc

    deleted_local = sum(
        1
        for item in local_items
        if delete_local_media(
            identity.current_owner().id, item.subfolder, item.filename
        )
    )
    if not prompt_ids and not deleted_local:
        raise AppError("None of the selected items could be deleted.")
    return {
        "deleted_history": len(prompt_ids),
        "deleted_local": deleted_local,
    }


@app.post("/api/gallery/move")
def gallery_move(body: GallerySelectionBody) -> dict:
    """Copy selected history outputs into the media folder and clear them."""
    prompt_ids = [
        item.prompt_id
        for item in body.items
        if item.type != LOCAL_MEDIA_TYPE and item.prompt_id
    ]
    prompt_ids = list(dict.fromkeys(prompt_ids))
    allowed = _owned_prompt_ids(identity.current_owner().id, prompt_ids)
    if len(allowed) != len(prompt_ids):
        raise HTTPException(
            status_code=403,
            detail="Those items belong to another user.",
        )
    prompt_ids = allowed
    if not prompt_ids:
        raise AppError("Select one or more ComfyUI items to move.")

    try:
        result = move_history_to_media(client, identity.current_owner().id, prompt_ids)
    except Exception as exc:  # noqa: BLE001
        raise AppError(f"Could not move media to the media folder: {exc}") from exc

    if not result["moved"] and not result["deleted_history"]:
        raise AppError("None of the selected items could be moved.")
    return result


@app.get("/api/gallery/thumbnail")
def gallery_thumbnail(filename: str):
    """Serve a cached gallery thumbnail by its original filename."""
    if not _owns_thumbnail(identity.current_owner().id, filename):
        raise HTTPException(status_code=404, detail="Thumbnail not found.")
    path = thumbnail_path(identity.current_owner().id, filename)
    if path is None or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Thumbnail not found.")
    return FileResponse(path)


@app.get("/api/gallery/local-thumbnail")
def gallery_local_thumbnail(filename: str, subfolder: str = ""):
    """Generate and serve a thumbnail for a local media file."""
    path = local_media_path(identity.current_owner().id, subfolder, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Media file not found.")

    thumbnail = ensure_local_thumbnail(identity.current_owner().id, path)
    if thumbnail is not None:
        return FileResponse(thumbnail, media_type="image/jpeg")

    # If an image cannot be converted (an unsupported format, for example),
    # serve the original so the browser can still try to display it. Videos
    # return 404 so the gallery falls back to its placeholder icon.
    extension = os.path.splitext(path)[1].lower()
    if extension in IMAGE_EXTENSIONS:
        return FileResponse(path, media_type=_local_media_type(path))
    raise HTTPException(status_code=404, detail="Thumbnail not available.")


@app.get("/api/gallery/file")
def gallery_file(
    request: Request,
    filename: str,
    subfolder: str = "",
    type: str = "output",
):
    """Proxy a ComfyUI output file, or serve one from the local media folder."""
    if type == LOCAL_MEDIA_TYPE:
        path = local_media_path(identity.current_owner().id, subfolder, filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Media file not found.")
        return FileResponse(path, media_type=_local_media_type(path))

    if not _owns_media(identity.current_owner().id, filename):
        raise HTTPException(status_code=404, detail="File not found.")
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
            body.speak_engine in TTS_MODEL_IDS
            and text.strip()
            and not chat_model.cancelled
        ):
            yield _sse(
                {"type": "phase", "message": "Synthesizing the reply..."}
            )
            try:
                url = _synthesize_reply(text, body.voice, body.speak_engine)
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
# Chat personas
# ---------------------------------------------------------------------------


@app.get("/api/chat/personas")
def chat_personas() -> dict:
    return {"personas": get_personas(identity.current_owner().id)}


@app.post("/api/chat/personas")
def post_chat_persona(body: PersonaBody) -> dict:
    try:
        save_persona(identity.current_owner().id, body.name, body.model_dump())
    except (OSError, ValueError) as exc:
        raise AppError(f"Could not save the persona: {exc}") from exc
    return {"personas": get_personas(identity.current_owner().id)}


@app.post("/api/chat/personas/delete")
def post_delete_chat_persona(body: PersonaNameBody) -> dict:
    try:
        removed = delete_persona(identity.current_owner().id, body.name)
    except OSError as exc:
        raise AppError(f"Could not delete the persona: {exc}") from exc
    if not removed:
        raise AppError("That persona no longer exists.")
    return {"personas": get_personas(identity.current_owner().id)}


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


@app.get("/api/audio/saved-voices")
def audio_saved_voices() -> dict:
    return {"voices": list_saved_voices(
            AUDIOCPP_VOICE_DIR, identity.current_owner().id
        )}


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
        _save_voice_reference(
            AUDIOCPP_VOICE_DIR, identity.current_owner().id, clean, wav, body.transcript
        )
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


@app.post("/api/audio/delete-voice")
def audio_delete_voice(body: DeleteVoiceBody) -> dict:
    clean = _sanitize_voice_name(body.name)
    if not clean:
        raise AppError("Choose a saved voice to delete.")
    if not delete_saved_voice(
            AUDIOCPP_VOICE_DIR, identity.current_owner().id, clean
        ):
        raise AppError("That saved voice no longer exists.")
    return {
        "status": f"Deleted saved voice {clean}.",
        "name": clean,
        "voices": list_saved_voices(
            AUDIOCPP_VOICE_DIR, identity.current_owner().id
        ),
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
