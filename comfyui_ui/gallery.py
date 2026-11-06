"""Gallery data: list recent generated images, audio and video from ComfyUI.

The dashboard proxies media through its own server so a browser on another
machine on the LAN can view the gallery even when it cannot reach ComfyUI
directly. This module only discovers the items; the HTTP layer in
:mod:`comfyui_ui.server` streams the bytes.
"""

from urllib.parse import urlencode

from .comfy_client import ComfyUIClient, is_video_filename
from .config import COMFY_URL
from .errors import AppError

# Route on the app server that proxies a ComfyUI output file (images, audio and
# video all use the same route).
FILE_PROXY_ROUTE = "/api/gallery/file"


def file_proxy_url(ref: dict) -> str:
    """Build a proxy URL for a ComfyUI file reference."""
    params = {
        "filename": ref["filename"],
        "subfolder": ref.get("subfolder", ""),
        "type": ref.get("type", "output"),
    }
    return f"{FILE_PROXY_ROUTE}?" + urlencode(params)


def _sorted_history(history: dict) -> list:
    """Return history entries sorted newest-first.

    History is keyed by prompt_id. Each entry's "prompt" is a list shaped like
    [queue_number, prompt_id, prompt_dict, extra_data, outputs]. Sort by the
    queue number so the most recent generations appear first.
    """

    def sort_key(item):
        prompt_meta = item.get("prompt")
        if isinstance(prompt_meta, list) and prompt_meta and isinstance(
            prompt_meta[0], (int, float)
        ):
            return prompt_meta[0]
        return 0

    return sorted(history.values(), key=sort_key, reverse=True)


def _prompt_text(entry: dict) -> str:
    """Return the prompt text stored in a history entry, or an empty string."""
    prompt_meta = entry.get("prompt")
    if (
        isinstance(prompt_meta, list)
        and len(prompt_meta) > 2
        and isinstance(prompt_meta[2], dict)
    ):
        return prompt_meta[2].get("prompt", "") or ""
    return ""


def _load_history(client: ComfyUIClient) -> list:
    try:
        return _sorted_history(client.get_history())
    except Exception as exc:  # noqa: BLE001
        raise AppError(
            f"Could not load gallery from ComfyUI at {COMFY_URL}: {exc}"
        ) from exc


def list_gallery_images(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent generated images from ComfyUI's history.

    Each entry is a dict with the image's filename, subfolder, type, proxy URL
    and the prompt text (when available). Newest images come first. ``limit``
    caps how many history entries are scanned.
    """
    images = []
    for entry in _load_history(client)[:limit]:
        outputs = entry.get("outputs", {})
        prompt_text = _prompt_text(entry)

        for node_output in outputs.values():
            for image_ref in node_output.get("images", []):
                # SaveVideo reports its result under "images"; skip those so
                # videos do not show up as broken images in the gallery.
                if is_video_filename(image_ref.get("filename", "")):
                    continue
                ref = {
                    "filename": image_ref.get("filename", ""),
                    "subfolder": image_ref.get("subfolder", ""),
                    "type": image_ref.get("type", "output"),
                    "prompt": prompt_text,
                }
                ref["url"] = file_proxy_url(ref)
                images.append(ref)
    return images


def list_gallery_audio(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent generated audio files from ComfyUI's history.

    Each entry is a dict with the audio's filename, subfolder, type, proxy URL
    and the prompt text (when available). Newest audio comes first.
    """
    audio = []
    for entry in _load_history(client)[:limit]:
        outputs = entry.get("outputs", {})
        prompt_text = _prompt_text(entry)

        for node_output in outputs.values():
            for audio_ref in node_output.get("audio", []):
                ref = {
                    "filename": audio_ref.get("filename", ""),
                    "subfolder": audio_ref.get("subfolder", ""),
                    "type": audio_ref.get("type", "output"),
                    "prompt": prompt_text,
                }
                ref["url"] = file_proxy_url(ref)
                audio.append(ref)
    return audio


def list_gallery_videos(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent generated videos from ComfyUI's history.

    ComfyUI's SaveVideo node reports its result under the "images" output key
    (with an "animated" flag), so video files are picked out of that key by
    their file extension.
    """
    videos = []
    for entry in _load_history(client)[:limit]:
        outputs = entry.get("outputs", {})
        prompt_text = _prompt_text(entry)

        for node_output in outputs.values():
            for video_ref in node_output.get("images", []):
                if not is_video_filename(video_ref.get("filename", "")):
                    continue
                ref = {
                    "filename": video_ref.get("filename", ""),
                    "subfolder": video_ref.get("subfolder", ""),
                    "type": video_ref.get("type", "output"),
                    "prompt": prompt_text,
                }
                ref["url"] = file_proxy_url(ref)
                videos.append(ref)
    return videos
