"""Chat model alias registry.

The Chat tab's selectable models are described in ``configs/chat_models.json``
so aliases and paths can be edited without touching code. The file has a single
top-level ``models`` key listing entries of the shape::

    {
        "alias": "Qwen3.5 4B",                        # shown in the dropdown
        "path": "C:/models/qwen3.5-4b/Qwen3.5.gguf",  # .gguf file or folder
        "mmproj": "C:/models/qwen3.5-4b/mmproj.gguf"  # optional vision model
    }

``mmproj`` is optional; set it for multimodal models so llama-server is
launched with ``--mmproj``. ``CHAT_MODEL_CHOICES`` is a list of ``(alias, path)``
pairs used by the dashboard (the alias is displayed, the path is the value) and
``CHAT_MODEL_MMPROJ`` maps a model path to its projector.
"""

import json
import os

from .config import MODELS_PATH


def load_chat_models() -> list:
    """Return ``(alias, path, mmproj)`` triples from chat_models.json.

    Entries missing an alias or a path are skipped; ``mmproj`` is ``""`` when
    unset. A missing file yields an empty list, so the rest of the app still
    starts.
    """
    if not os.path.isfile(MODELS_PATH):
        return []
    with open(MODELS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    models = []
    for entry in data.get("models", []):
        alias = str(entry.get("alias", "")).strip()
        path = str(entry.get("path", "")).strip()
        mmproj = str(entry.get("mmproj", "")).strip()
        if alias and path:
            models.append((alias, path, mmproj))
    return models


# (alias, path, mmproj) triples loaded once at import time.
CHAT_MODELS = load_chat_models()

# Dropdown choices: the alias is displayed, the path is the value.
CHAT_MODEL_CHOICES = [(alias, path) for alias, path, _ in CHAT_MODELS]

# Model path -> multimodal projector path (only for entries that set one).
CHAT_MODEL_MMPROJ = {
    path: mmproj for _alias, path, mmproj in CHAT_MODELS if mmproj
}

# Path of the first configured model, used as the initial dropdown selection.
DEFAULT_CHAT_MODEL_PATH = CHAT_MODELS[0][1] if CHAT_MODELS else ""
