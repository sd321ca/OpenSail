"""audio.cpp model alias registry for the "TextToSpeech" tab.

The tab's selectable text-to-speech models are described in
``configs/audio_models.json`` so aliases and paths can be edited without
touching code. Each entry has the shape::

    {
        "alias": "Kokoro 82M",          # shown in the dropdown
        "id": "kokoro-tts",             # id the audio.cpp server exposes
        "family": "kokoro_tts",         # audio.cpp model family
        "task": "tts",                  # "tts" (this tab), "asr", ...
        "folder": "Kokoro-82M",         # model dir under audiocpp_models_dir
        # ...or an absolute path instead of "folder":
        "path": "D:/models/Kokoro-82M",
        "mode": "offline"               # optional (default "offline")
    }

An entry may also carry the audio.cpp server fields ``load_options``,
``session_options``, ``default_request_options``, ``voice_presets`` and
``default_voice_preset``; they are passed through to the generated server
config unchanged.

``folder`` is resolved against ``audiocpp_models_dir`` (configs/constants.json);
``path`` is used verbatim (with ``~`` expanded). ``AUDIO_MODEL_CHOICES`` is a
list of ``(alias, id)`` pairs used by the dashboard.
"""

import json
import os

from .config import AUDIO_MODELS_PATH, AUDIOCPP_MODELS_DIR


def _resolve_path(entry: dict) -> str:
    """Return the model directory/file for an entry, or "" when unset."""
    path = str(entry.get("path", "")).strip()
    if path:
        return os.path.normpath(os.path.expanduser(path))
    folder = str(entry.get("folder", "")).strip()
    if folder and AUDIOCPP_MODELS_DIR:
        return os.path.normpath(
            os.path.join(os.path.expanduser(AUDIOCPP_MODELS_DIR), folder)
        )
    return ""


def load_audio_models() -> list:
    """Return the configured audio.cpp model entries from audio_models.json.

    Entries missing an alias, id, family or a resolvable path are skipped, so a
    half-filled registry still starts. A missing file yields an empty list.
    """
    if not os.path.isfile(AUDIO_MODELS_PATH):
        return []
    with open(AUDIO_MODELS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    models = []
    for entry in data.get("models", []):
        alias = str(entry.get("alias", "")).strip()
        model_id = str(entry.get("id", "")).strip()
        family = str(entry.get("family", "")).strip()
        path = _resolve_path(entry)
        if not (alias and model_id and family and path):
            continue
        model = dict(entry)
        model["alias"] = alias
        model["id"] = model_id
        model["family"] = family
        model["path"] = path
        model.setdefault("task", "tts")
        model.setdefault("mode", "offline")
        models.append(model)
    return models


# Resolved model entries, loaded once at import time.
AUDIO_MODELS = load_audio_models()

# Dropdown choices: the alias is displayed, the audio.cpp model id is the value.
AUDIO_MODEL_CHOICES = [(m["alias"], m["id"]) for m in AUDIO_MODELS]

# Id of the first configured model, used as the initial dropdown selection.
DEFAULT_AUDIO_MODEL_ID = AUDIO_MODELS[0]["id"] if AUDIO_MODELS else ""
