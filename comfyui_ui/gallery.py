"""Gallery: list recent generated images and audio from ComfyUI's history."""

import html
import os
import tempfile
from urllib.parse import urlencode

import gradio as gr

from .audio_meta import extract_audio_metadata, format_audio_caption
from .comfy_client import ComfyUIClient
from .config import COMFY_URL

# Route on the Gradio app that proxies ComfyUI images (see ui.build_ui). The
# browser loads gallery thumbnails through this route so the gallery works
# even when the browser cannot reach ComfyUI directly.
IMAGE_PROXY_ROUTE = "/comfy-image"


def _proxy_url(image: dict) -> str:
    """Build a proxy URL for an image dict (filename/subfolder/type)."""
    params = {
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    }
    return f"{IMAGE_PROXY_ROUTE}?" + urlencode(params)

# Video file extensions. ComfyUI's SaveVideo node reports its result under the
# "images" output key, so these must be filtered out of the image gallery.
VIDEO_EXTENSIONS = (".mp4", ".webm", ".mkv", ".mov", ".avi")


def _is_video(filename: str) -> bool:
    """Return True if a filename looks like a video file."""
    return filename.lower().endswith(VIDEO_EXTENSIONS)


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


def list_gallery_images(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent generated images from ComfyUI's history.

    Each entry is a dict with the image's view URL, filename, subfolder, type
    and the prompt text (when available). Newest images come first. ``limit``
    caps how many history entries are scanned.
    """
    try:
        history = client.get_history()
    except Exception as exc:  # noqa: BLE001
        raise gr.Error(
            f"Could not load gallery from ComfyUI at {COMFY_URL}: {exc}"
        )

    entries = _sorted_history(history)

    images = []
    for entry in entries[:limit]:
        outputs = entry.get("outputs", {})
        prompt_text = _prompt_text(entry)

        for node_output in outputs.values():
            for image_ref in node_output.get("images", []):
                # SaveVideo reports its result under "images"; skip those so
                # videos do not show up as broken images in the gallery.
                if _is_video(image_ref.get("filename", "")):
                    continue
                images.append(
                    {
                        "url": client.image_view_url(image_ref),
                        "filename": image_ref.get("filename", ""),
                        "subfolder": image_ref.get("subfolder", ""),
                        "type": image_ref.get("type", "output"),
                        "prompt": prompt_text,
                    }
                )
    return images


def list_gallery_audio(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent generated audio files from ComfyUI's history.

    Each entry is a dict with the audio's filename, subfolder, type and the
    prompt text (when available). Newest audio comes first. ``limit`` caps how
    many history entries are scanned.
    """
    try:
        history = client.get_history()
    except Exception as exc:  # noqa: BLE001
        raise gr.Error(
            f"Could not load gallery from ComfyUI at {COMFY_URL}: {exc}"
        )

    entries = _sorted_history(history)

    audio = []
    for entry in entries[:limit]:
        outputs = entry.get("outputs", {})
        prompt_text = _prompt_text(entry)

        for node_output in outputs.values():
            for audio_ref in node_output.get("audio", []):
                audio.append(
                    {
                        "filename": audio_ref.get("filename", ""),
                        "subfolder": audio_ref.get("subfolder", ""),
                        "type": audio_ref.get("type", "output"),
                        "prompt": prompt_text,
                    }
                )
    return audio


def list_gallery_videos(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent generated videos from ComfyUI's history.

    Each entry is a dict with the video's filename, subfolder, type and the
    prompt text (when available). Newest videos come first. ``limit`` caps how
    many history entries are scanned.

    ComfyUI's SaveVideo node reports its result under the "images" output key
    (with an "animated" flag), so video files are picked out of that key by
    their file extension.
    """
    try:
        history = client.get_history()
    except Exception as exc:  # noqa: BLE001
        raise gr.Error(
            f"Could not load gallery from ComfyUI at {COMFY_URL}: {exc}"
        )

    entries = _sorted_history(history)

    videos = []
    for entry in entries[:limit]:
        outputs = entry.get("outputs", {})
        prompt_text = _prompt_text(entry)

        for node_output in outputs.values():
            for video_ref in node_output.get("images", []):
                if not _is_video(video_ref.get("filename", "")):
                    continue
                videos.append(
                    {
                        "filename": video_ref.get("filename", ""),
                        "subfolder": video_ref.get("subfolder", ""),
                        "type": video_ref.get("type", "output"),
                        "prompt": prompt_text,
                    }
                )
    return videos


def gallery_html(client: ComfyUIClient, limit: int = 200) -> str:
    """Return an HTML grid of thumbnails that link to the full image.

    Each thumbnail is an ``<a>`` pointing at the app's image proxy route,
    opening in a new tab. The proxy streams the image from ComfyUI, so the
    gallery works even when the browser cannot reach ComfyUI directly. This is
    used instead of ``gr.Gallery`` so a click opens the full image rather than
    Gradio's built-in preview.
    """
    cards = []
    for image in list_gallery_images(client, limit=limit):
        url = _proxy_url(image)
        caption = image["filename"]
        if image["prompt"]:
            caption = f"{caption}\n{image['prompt']}"
        cards.append(
            '<a class="gallery-thumb" href="{url}" target="_blank" '
            'rel="noopener noreferrer" title="{title}">'
            '<img src="{url}" alt="{alt}" loading="lazy" />'
            "</a>".format(
                url=html.escape(url, quote=True),
                title=html.escape(caption, quote=True),
                alt=html.escape(image["filename"], quote=True),
            )
        )

    if not cards:
        return '<p class="gallery-empty">No images found.</p>'

    return '<div class="gallery-html-grid">' + "".join(cards) + "</div>"


def refresh_gallery_html(client: ComfyUIClient, limit: int = 200) -> str:
    """Gradio callback: reload the HTML image gallery from ComfyUI history."""
    return gallery_html(client, limit=limit)


def generated_image_html(image_ref: dict) -> str:
    """Return HTML rendering a single generated image as a clickable link.

    The image is wrapped in an ``<a>`` pointing at the app's image proxy route
    and opening in a new tab, so clicking the result opens the full image in a
    new window (matching the gallery). ``image_ref`` is a ComfyUI image
    reference dict (filename/subfolder/type).
    """
    url = _proxy_url(image_ref)
    filename = image_ref.get("filename", "")
    return (
        '<div class="result-image-wrap">'
        '<a class="result-image-link" href="{url}" target="_blank" '
        'rel="noopener noreferrer" title="Open full image in a new tab">'
        '<img src="{url}" alt="{alt}" />'
        "</a>"
        "</div>".format(
            url=html.escape(url, quote=True),
            alt=html.escape(filename, quote=True),
        )
    )


def audio_gallery_items(client: ComfyUIClient, limit: int = 200) -> list:
    """Return (audio_path, caption) tuples for the audio gallery component.

    Audio is downloaded server-side (rather than linking to ComfyUI's /view
    URL) so the gallery works even when the browser cannot reach ComfyUI
    directly, e.g. when the UI is accessed from another machine on the LAN.

    The caption is built from the generation metadata embedded in the audio
    file (style, mode, duration, seed, ...) when available.
    """
    items = []
    for audio in list_gallery_audio(client, limit=limit):
        try:
            path = client.fetch_audio(
                {
                    "filename": audio["filename"],
                    "subfolder": audio.get("subfolder", ""),
                    "type": audio.get("type", "output"),
                }
            )
        except Exception:  # noqa: BLE001
            # Skip audio that can no longer be fetched (e.g. temp files that
            # have been cleaned up) instead of failing the whole gallery.
            continue

        meta = extract_audio_metadata(path)
        caption = format_audio_caption(audio["filename"], meta)
        items.append((path, caption))
    return items


def refresh_audio_gallery(client: ComfyUIClient, limit: int = 200) -> list:
    """Gradio callback: reload the audio gallery from ComfyUI history.

    Returns a list of ``(audio_path, caption)`` tuples. The UI renders one
    audio player per item (gr.Gallery cannot display audio, so it is not used
    here).
    """
    return audio_gallery_items(client, limit=limit)


def video_gallery_items(client: ComfyUIClient, limit: int = 200) -> list:
    """Return (video_path, caption) tuples for the video gallery component.

    Videos are downloaded server-side (rather than linking to ComfyUI's /view
    URL) so the gallery works even when the browser cannot reach ComfyUI
    directly, e.g. when the UI is accessed from another machine on the LAN.

    The caption is the video's filename plus the prompt text when available.
    """
    items = []
    for video in list_gallery_videos(client, limit=limit):
        try:
            path = client.fetch_video(
                {
                    "filename": video["filename"],
                    "subfolder": video.get("subfolder", ""),
                    "type": video.get("type", "output"),
                }
            )
        except Exception:  # noqa: BLE001
            # Skip videos that can no longer be fetched (e.g. temp files that
            # have been cleaned up) instead of failing the whole gallery.
            continue

        caption = video["filename"]
        if video["prompt"]:
            caption = f"{caption}\n{video['prompt']}"
        items.append((path, caption))
    return items


def refresh_video_gallery(client: ComfyUIClient, limit: int = 200) -> list:
    """Gradio callback: reload the video gallery from ComfyUI history.

    Returns a list of ``(video_path, caption)`` tuples. The UI renders one
    video player per item.
    """
    return video_gallery_items(client, limit=limit)


# Local copies of gallery images used by the Generate tab's "Load from
# Gallery" picker, keyed by (filename, subfolder, type). Generated outputs
# never change, so a downloaded copy can be reused; re-downloading the whole
# gallery every time the picker opens would make it slow.
_PICKER_FILES: dict = {}

# Cap the number of cached copies so a long-lived session cannot fill the temp
# directory. The oldest entry is evicted first; files already shown in the
# picker keep working because Gradio serves its own cached copy.
_PICKER_CACHE_LIMIT = 240


def _picker_file(client: ComfyUIClient, image: dict) -> str | None:
    """Return a local file path for a gallery image, downloading it once."""
    key = (
        image["filename"],
        image.get("subfolder", ""),
        image.get("type", "output"),
    )
    cached = _PICKER_FILES.get(key)
    if cached and os.path.exists(cached):
        return cached

    try:
        content, _content_type = client.fetch_image_bytes(image)
    except Exception:  # noqa: BLE001
        # Skip images that can no longer be fetched (e.g. temp files that have
        # been cleaned up) instead of failing the whole picker.
        return None

    if len(_PICKER_FILES) >= _PICKER_CACHE_LIMIT:
        oldest = next(iter(_PICKER_FILES))
        try:
            os.remove(_PICKER_FILES.pop(oldest))
        except OSError:
            pass

    suffix = os.path.splitext(image["filename"])[1] or ".png"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(content)
    _PICKER_FILES[key] = path
    return path


def gallery_picker_items(client: ComfyUIClient, limit: int = 60) -> list:
    """Return (image_path, caption) tuples for the Load-from-Gallery picker.

    The images are downloaded server-side (rather than linked to ComfyUI's
    /view URL) so the picker works even when the browser cannot reach ComfyUI
    directly, matching the audio and video galleries. ``limit`` caps how many
    history entries are scanned, keeping the first open of the picker quick.
    """
    items = []
    for image in list_gallery_images(client, limit=limit):
        path = _picker_file(client, image)
        if path is None:
            continue
        items.append((path, image["filename"]))
    return items
