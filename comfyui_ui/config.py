"""Configuration: filesystem paths, constants and settings loading."""

import json
import os
import shlex
import shutil

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOWS_DIR = os.path.join(BASE_DIR, "workflows")
CONFIGS_DIR = os.path.join(BASE_DIR, "configs")
# Slow-loading image previews for the gallery are cached here, using the same
# filename as the generated image.
THUMBNAILS_DIR = os.path.join(BASE_DIR, "thumbnails")
# Optional drop folder for local media (images, audio and video). Files placed
# here are listed in the galleries alongside ComfyUI history, and can be used
# as inputs on the Generate page. Subfolders are scanned too.
LOCAL_MEDIA_DIR = os.path.join(BASE_DIR, "media")
# Optional .env file at the project root, holding secrets such as the dashboard
# login credentials. Values already present in the environment take priority.
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)
SAMPLERS_PATH = os.path.join(CONFIGS_DIR, "samplers.json")
SCHEDULERS_PATH = os.path.join(CONFIGS_DIR, "schedulers.json")
# Templates for the two files above. Both are git-ignored because their
# contents depend on the local ComfyUI install, so a fresh checkout only has
# the ``.example.json`` versions; they are copied into place on first run.
SAMPLERS_EXAMPLE_PATH = os.path.join(CONFIGS_DIR, "samplers.example.json")
SCHEDULERS_EXAMPLE_PATH = os.path.join(CONFIGS_DIR, "schedulers.example.json")
CONSTANTS_PATH = os.path.join(CONFIGS_DIR, "constants.json")
# Machine-specific server settings; copied from the example on first run.
CONSTANTS_EXAMPLE_PATH = os.path.join(CONFIGS_DIR, "constants.example.json")
# Per-workflow help notes shown in the Generate tab. Maps a workflow filename
# to a Markdown string of tips / information.
WORKFLOW_NOTES_PATH = os.path.join(CONFIGS_DIR, "workflow_notes.json")
# Declarative registry of the Generate tab's input controls. Adding a new
# entry here adds a new input to the UI without editing ui.py.
FIELDS_PATH = os.path.join(CONFIGS_DIR, "fields.json")
# Machine-specific input registry; copied from the example on first run.
FIELDS_EXAMPLE_PATH = os.path.join(CONFIGS_DIR, "fields.example.json")
# Per-workflow selection of node bindings shown in the Generate tab. Managed
# by the Generate tab's input picker and editable by hand.
WORKFLOW_FIELDS_PATH = os.path.join(CONFIGS_DIR, "workflow_fields.json")
# Per-workflow saved input presets (for example "High quality" / "Low
# quality"), plus the preset loaded by default for each workflow. Managed by
# the Generate tab's preset bar and editable by hand.
WORKFLOW_PRESETS_PATH = os.path.join(CONFIGS_DIR, "workflow_presets.json")
# Chat tab model alias registry: maps friendly aliases to GGUF model paths.
MODELS_PATH = os.path.join(CONFIGS_DIR, "chat_models.json")
# audio.cpp model alias registry: maps friendly aliases to audio.cpp model
# entries (family + folder, for the "TextToSpeech" tab).
AUDIO_MODELS_PATH = os.path.join(CONFIGS_DIR, "audio_models.json")

# Node class types used for workflow inspection.
LOAD_IMAGE_NODE_TYPES = ("LoadImage",)

# --- Audio / music workflows ----------------------------------------------
AUDIO_OUTPUT_NODE_TYPES = ("SaveAudio", "SaveAudioAdvanced", "SaveAudioMP3")
AUDIO_LATENT_NODE_TYPES = ("EmptyYuE2LatentAudio",)
# The node that generates the music. It exposes music-specific settings such
# as max_duration and mode, and may hold the style / lyrics inline.
MUSIC_NODE_TYPES = ("YuE2GenerateMusic",)
# Audio input node used by music-cover workflows (a reference song).
LOAD_AUDIO_NODE_TYPES = ("LoadAudio",)

# Generation modes exposed for music workflows.
MUSIC_MODES = ["full", "instrumental", "vocals", "melody"]

# --- Video workflows ------------------------------------------------------
VIDEO_OUTPUT_NODE_TYPES = ("SaveVideo",)
# Video input node used by workflows that take an existing video (for example
# Extract Last Frame, or the video upscaler).
LOAD_VIDEO_NODE_TYPES = ("LoadVideo",)

# Node inputs that are supplied by a dedicated upload control on the Generate
# tab instead of an editable field in the node picker. Skipping them keeps the
# filename textbox out of the picker: the upload sets the value at queue time.
UPLOAD_INPUT_KEYS = {
    "LoadImage": "image",
    "LoadAudio": "audio",
    "LoadVideo": "file",
}

# Workflow kinds, used to decide which controls and output component to show.
KIND_IMAGE = "image"
KIND_AUDIO = "audio"
KIND_VIDEO = "video"

# Common aspect ratios exposed when a workflow uses a ResolutionSelector.
ASPECT_RATIOS = [
    "1:1 (Square)",
    "2:3 (Portrait Photo)",
    "3:2 (Photo)",
    "3:4 (Portrait Standard)",
    "4:3 (Standard)",
    "9:16 (Portrait Widescreen)",
    "16:9 (Widescreen)",
    "21:9 (Ultrawide)",
]

# Maximum number of LoadImage inputs we expose at once. Extra LoadImage nodes
# beyond this are left at their workflow defaults.
MAX_IMAGE_INPUTS = 4


def _create_from_example(path: str, example_path: str) -> None:
    """Create ``path`` from ``example_path`` when it does not exist yet.

    Used for the machine-specific config files that are git-ignored, so a
    fresh checkout starts with working defaults instead of a crash. Existing
    files are never overwritten, and a missing example file is not an error.
    """
    if os.path.exists(path) or not os.path.isfile(example_path):
        return
    shutil.copyfile(example_path, path)


_create_from_example(SAMPLERS_PATH, SAMPLERS_EXAMPLE_PATH)
_create_from_example(SCHEDULERS_PATH, SCHEDULERS_EXAMPLE_PATH)
_create_from_example(CONSTANTS_PATH, CONSTANTS_EXAMPLE_PATH)
_create_from_example(FIELDS_PATH, FIELDS_EXAMPLE_PATH)


def load_config() -> dict:
    """Load settings from configs/constants.json."""
    with open(CONSTANTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


CONFIG = load_config()
# Workflow selected by default in the UI.
DEFAULT_WORKFLOW = CONFIG["default_workflow"]
COMFY_URL = CONFIG["comfy_url"]


# --- Managed ComfyUI process ----------------------------------------------
def _config_path(value: str) -> str:
    """Expand ``~`` and resolve relative paths against the project root."""
    path = os.path.expanduser(str(value or "").strip())
    if path and not os.path.isabs(path):
        path = os.path.join(BASE_DIR, path)
    return path


# Root of a ComfyUI portable install (the folder containing ``python_embeded``
# and ``ComfyUI``). Leave empty to manage/start ComfyUI yourself.
COMFY_DIR = _config_path(CONFIG.get("comfy_dir", ""))
# Optional explicit overrides for non-portable installs.
COMFY_PYTHON = _config_path(CONFIG.get("comfy_python", ""))
if not COMFY_PYTHON and COMFY_DIR:
    COMFY_PYTHON = os.path.join(COMFY_DIR, "python_embeded", "python.exe")
COMFY_MAIN = _config_path(CONFIG.get("comfy_main", ""))
if not COMFY_MAIN and COMFY_DIR:
    COMFY_MAIN = os.path.join(COMFY_DIR, "ComfyUI", "main.py")
# Directories where ComfyUI stores generated and uploaded media. They are used
# to tell whether a cached gallery thumbnail's source file still exists.
COMFY_MEDIA_DIRS = []
if COMFY_MAIN:
    _COMFY_ROOT = os.path.dirname(COMFY_MAIN)
    COMFY_MEDIA_DIRS = [
        os.path.join(_COMFY_ROOT, name) for name in ("output", "input", "temp")
    ]
_configured_args = CONFIG.get("comfy_start_args", ["--listen", "0.0.0.0"])
if isinstance(_configured_args, str):
    _configured_args = shlex.split(_configured_args)
COMFY_START_ARGS = [str(arg) for arg in _configured_args]
COMFY_START_TIMEOUT = float(CONFIG.get("comfy_start_timeout", 300))
# Keep the process running when OpenSail exits. It will then appear as an
# externally started ComfyUI on the next launch (and won't be stoppable here).
COMFY_STOP_ON_EXIT = bool(CONFIG.get("comfy_stop_on_exit", True))
# Show ComfyUI in its own console window (Windows). When false, output is
# captured in a log file instead.
COMFY_SHOW_CONSOLE = bool(CONFIG.get("comfy_show_console", False))

# The HTTP server.
SERVER_NAME = CONFIG["server_name"]
SERVER_PORT = CONFIG["server_port"]
# Optional TLS. These default to configs/certs/{cert,key}.pem; generate a
# certificate there (mkcert or openssl) to serve the dashboard over HTTPS.
# When either file is absent the app falls back to HTTP. Browsers require a
# secure context for microphone access unless the page is on localhost/127.0.0.1.
CERTS_DIR = os.path.join(CONFIGS_DIR, "certs")
SERVER_SSL_CERTFILE = CONFIG.get("server_ssl_certfile") or os.path.join(
    CERTS_DIR, "cert.pem"
)
SERVER_SSL_KEYFILE = CONFIG.get("server_ssl_keyfile") or os.path.join(
    CERTS_DIR, "key.pem"
)
# When True, node inputs with no matching field definition are still offered
# in the picker with a generic widget based on their value type.
SHOW_UNMATCHED_NODE_INPUTS = bool(
    CONFIG.get("show_unmatched_node_inputs", False)
)

# --- Chat / LLM settings --------------------------------------------------
# The Chat tab serves a local GGUF model via an external llama-server
# subprocess. The selectable models (aliases -> GGUF paths) are defined in
# configs/chat_models.json. The server is started lazily on the first message and
# can be stopped to free RAM/VRAM for ComfyUI generation.
CHAT_N_CTX = int(CONFIG.get("chat_n_ctx", 4096))
CHAT_N_GPU_LAYERS = int(CONFIG.get("chat_n_gpu_layers", 0))
# 0 (or unset) lets llama.cpp choose the thread count.
CHAT_N_THREADS = int(CONFIG.get("chat_n_threads", 0))
# None (or unset) reads the chat template from the GGUF metadata.
CHAT_CHAT_FORMAT = CONFIG.get("chat_chat_format") or None
CHAT_SYSTEM_PROMPT = CONFIG.get(
    "chat_system_prompt", "You are a helpful assistant."
)

# Path to the llama-server executable that serves the Chat tab.
CHAT_SERVER_PATH = CONFIG.get("chat_server_path", "")
# Port the app-managed llama-server listens on (bound to 127.0.0.1).
CHAT_SERVER_PORT = int(CONFIG.get("chat_server_port", 8081))
# Named chat personas (system prompt + voice engine/voice), managed by the
# Chat tab and editable by hand.
CHAT_PERSONAS_PATH = os.path.join(CONFIGS_DIR, "chat_personas.json")

# --- audio.cpp settings ---------------------------------------------------
# The "TextToSpeech" tab serves text-to-speech (and voice cloning) through
# an external ``audiocpp_server`` subprocess, mirroring the Chat tab's
# llama-server management. The selectable models (aliases -> audio.cpp model
# entries) are defined in configs/audio_models.json. The server is started
# lazily on the first request and can be stopped to free RAM/VRAM.
#
# Path to the audiocpp_server executable.
AUDIOCPP_SERVER_PATH = CONFIG.get("audiocpp_server_path", "")
# Port the app-managed audiocpp_server listens on (bound to 127.0.0.1).
AUDIOCPP_PORT = int(CONFIG.get("audiocpp_port", 8088))
# Compute backend: "cuda", "cpu", "vulkan" or "metal".
AUDIOCPP_BACKEND = CONFIG.get("audiocpp_backend", "cuda")
# Backend device index (0 = first GPU).
AUDIOCPP_DEVICE = int(CONFIG.get("audiocpp_device", 0))
# Threads the server uses.
AUDIOCPP_THREADS = int(CONFIG.get("audiocpp_threads", 1))
# Root directory that registry entries may reference with a "folder" key.
AUDIOCPP_MODELS_DIR = CONFIG.get("audiocpp_models_dir", "")
# Directory holding the model_specs/*.json files (used to help the server find
# the spec for each family when it is not running from its install folder).
AUDIOCPP_MODEL_SPECS_DIR = CONFIG.get("audiocpp_model_specs_dir", "")
# Directory holding the CUDA runtime DLLs the server links against (cuFFT,
# cuBLAS, cuDART, ...). When empty, a CUDA toolkit bin folder is auto-detected.
AUDIOCPP_CUDA_BIN = CONFIG.get("audiocpp_cuda_bin", "")
# Path to an ffmpeg executable used to convert uploaded voice-cloning reference
# clips to WAV. When empty, ffmpeg is looked up on PATH.
AUDIOCPP_FFMPEG_PATH = CONFIG.get("audiocpp_ffmpeg_path", "")
# Directory of reusable voice-cloning references shared by the TextToSpeech and
# Chat tabs. Each ``<name>.wav`` is a saved voice, and a ``prompt_text`` file
# holds one ``<name>|<transcript>`` line per voice. Passed to the server as its
# ``voice_dir``; when empty, ``<project>/voices`` is used.
AUDIOCPP_VOICE_DIR = CONFIG.get("audiocpp_voice_dir", "") or os.path.join(
    BASE_DIR, "voices"
)
# Optional explicit server.json. When set, it is used as-is instead of
# generating one from configs/audio_models.json. When a path is given for a
# model, it is resolved exactly as written.
AUDIOCPP_CONFIG_PATH = CONFIG.get("audiocpp_config_path", "")
# Unload every resident model after this many idle milliseconds (0 disables).
AUDIOCPP_IDLE_UNLOAD_MS = int(CONFIG.get("audiocpp_idle_unload_ms", 0))


def _load_auth() -> tuple[str, str] | None:
    """Return the dashboard login credentials from the environment, if set.

    Reads ``APP_USERNAME`` / ``APP_PASSWORD`` from the ``.env`` file or the
    process environment. When both are set, returns a ``(username, password)``
    tuple for HTTP Basic auth; otherwise returns ``None`` so the app runs
    without authentication.
    """
    username = os.environ.get("APP_USERNAME")
    password = os.environ.get("APP_PASSWORD")
    if username and password:
        return (username, password)
    return None


# Login credentials for the dashboard, or None to disable authentication.
APP_AUTH = _load_auth()
