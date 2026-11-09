"""OpenSail: a local dashboard for ComfyUI workflows, chat and speech.

The HTTP API and static frontend live in :mod:`comfyui_ui.server` and the
``web`` folder. Run the app with ``python app.py``.
"""

from .config import (
    APP_AUTH,
    COMFY_URL,
    DEFAULT_WORKFLOW,
    SERVER_NAME,
    SERVER_PORT,
)

__all__ = [
    "APP_AUTH",
    "COMFY_URL",
    "DEFAULT_WORKFLOW",
    "SERVER_NAME",
    "SERVER_PORT",
]
