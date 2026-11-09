"""Gallery data: list recent generated images, audio and video from ComfyUI.

The dashboard proxies media through its own server so a browser on another
machine on the LAN can view the gallery even when it cannot reach ComfyUI
directly. This module only discovers the items; the HTTP layer in
:mod:`comfyui_ui.server` streams the bytes.
"""

import io
import os
import subprocess
import tempfile
from urllib.parse import urlencode

from PIL import Image

from .audio import _resolve_ffmpeg
from .comfy_client import ComfyUIClient, is_video_filename
from .config import COMFY_MEDIA_DIRS, COMFY_URL, THUMBNAILS_DIR
from .errors import AppError

# Route on the app server that proxies a ComfyUI output file (images, audio and
# video all use the same route).
FILE_PROXY_ROUTE = "/api/gallery/file"
# Route that serves a cached gallery thumbnail by its original filename.
THUMBNAIL_ROUTE = "/api/gallery/thumbnail"

# Longest edge of a gallery thumbnail, in pixels. Images are only ever shrunk,
# never upscaled.
THUMBNAIL_MAX_SIZE = (480, 480)
# JPEG settings shared by image and video thumbnails.
THUMBNAIL_JPEG_QUALITY = 82

# Image sources that can be re-encoded as JPEG without changing the filename.
JPEG_EXTENSIONS = (".jpg", ".jpeg")


def file_proxy_url(ref: dict) -> str:
    """Build a proxy URL for a ComfyUI file reference."""
    params = {
        "filename": ref["filename"],
        "subfolder": ref.get("subfolder", ""),
        "type": ref.get("type", "output"),
    }
    return f"{FILE_PROXY_ROUTE}?" + urlencode(params)


def _thumbnail_name(filename: str) -> str | None:
    """Return the safe, flat filename used for a cached thumbnail."""
    name = os.path.basename(filename or "")
    return name or None


def thumbnail_path(filename: str) -> str | None:
    """Return the local path for a cached thumbnail filename."""
    name = _thumbnail_name(filename)
    if name is None:
        return None
    return os.path.join(THUMBNAILS_DIR, name)


def _image_thumbnail_name(filename: str) -> str | None:
    """Return the cached JPEG filename for an image source.

    JPEG sources keep their filename. Other formats append ``.jpg`` so the
    browser still serves the converted bytes with the correct MIME type.
    """
    name = _thumbnail_name(filename)
    if name is None:
        return None
    if os.path.splitext(name)[1].lower() in JPEG_EXTENSIONS:
        return name
    return f"{name}.jpg"


def _write_jpeg_thumbnail(image: Image.Image, target: str) -> None:
    """Downscale an image and write it as a compact JPEG."""
    thumbnail = image.copy()
    thumbnail.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
    if thumbnail.mode in ("RGBA", "LA") or (
        thumbnail.mode == "P" and "transparency" in thumbnail.info
    ):
        rgba = thumbnail.convert("RGBA")
        opaque = Image.new("RGB", rgba.size, "white")
        opaque.paste(rgba, mask=rgba.split()[-1])
        thumbnail = opaque
    else:
        thumbnail = thumbnail.convert("RGB")
    thumbnail.save(
        target,
        format="JPEG",
        quality=THUMBNAIL_JPEG_QUALITY,
        optimize=True,
        progressive=True,
    )


def thumbnail_url(filename: str) -> str | None:
    """Return the proxy URL for a cached thumbnail, or None if unavailable.

    JPEG images reuse their original filename. Other images and videos use
    ``<filename>.jpg`` because the preview itself is encoded as JPEG.
    """
    name = _thumbnail_name(filename)
    if name is None:
        return None
    for candidate in (name, f"{name}.jpg", f"{name}.png"):
        if os.path.isfile(os.path.join(THUMBNAILS_DIR, candidate)):
            return f"{THUMBNAIL_ROUTE}?" + urlencode({"filename": candidate})
    return None


def save_image_thumbnail(filename: str, content: bytes) -> bool:
    """Save a compact JPEG preview of an image.

    The file is written to :data:`config.THUMBNAILS_DIR`, so the gallery can
    use it as a lightweight preview. Failures are reported by returning False
    rather than raised: a missing thumbnail should never break generation.
    """
    name = _image_thumbnail_name(filename)
    if name is None:
        return False
    target = os.path.join(THUMBNAILS_DIR, name)

    try:
        os.makedirs(THUMBNAILS_DIR, exist_ok=True)
        with Image.open(io.BytesIO(content)) as source:
            image = source.copy()
        _write_jpeg_thumbnail(image, target)
        # Drop a legacy same-name thumbnail (for example a large PNG) so the
        # gallery picks up the new JPEG immediately.
        legacy = thumbnail_path(filename)
        if legacy and legacy != target:
            try:
                os.remove(legacy)
            except OSError:
                pass
        return True
    except Exception:  # noqa: BLE001 - thumbnails are best-effort
        return False


def save_video_thumbnail(filename: str, video_path: str) -> bool:
    """Extract a still frame and save it as the video's cached thumbnail.

    The image is written as ``<video filename>.jpg`` in
    :data:`config.THUMBNAILS_DIR`. Video decoding needs ffmpeg; when it is not
    available, or extraction fails, this returns False without raising.
    """
    name = _thumbnail_name(filename)
    ffmpeg = _resolve_ffmpeg()
    if name is None or not ffmpeg or not os.path.isfile(video_path):
        return False

    os.makedirs(THUMBNAILS_DIR, exist_ok=True)
    fd, frame_path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    try:
        # Seek past a black or title frame when possible, then fall back to the
        # very first frame for very short clips.
        for seek in ("0.5", "0"):
            proc = subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    seek,
                    "-i",
                    video_path,
                    "-frames:v",
                    "1",
                    frame_path,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=creationflags,
                timeout=30,
            )
            if (
                proc.returncode == 0
                and os.path.isfile(frame_path)
                and os.path.getsize(frame_path) > 0
            ):
                break
        else:
            return False

        with Image.open(frame_path) as source:
            thumbnail = source.convert("RGB")
        thumbnail.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)

        target = os.path.join(THUMBNAILS_DIR, f"{name}.jpg")
        thumbnail.save(
            target,
            format="JPEG",
            quality=THUMBNAIL_JPEG_QUALITY,
            optimize=True,
            progressive=True,
        )
        return True
    except Exception:  # noqa: BLE001 - thumbnails are best-effort
        return False
    finally:
        try:
            os.remove(frame_path)
        except OSError:
            pass


def _thumbnail_source_name(name: str, sources: set[str]) -> str:
    """Return the media filename a cached thumbnail was created from.

    JPEG image thumbnails may keep the original filename, while other image
    and video thumbnails append an image extension. Older thumbnails used the
    full original filename, so both shapes are checked.
    """
    if name in sources:
        return name
    for extension in (".jpg", ".png"):
        if name.lower().endswith(extension):
            candidate = name[: -len(extension)]
            if candidate in sources:
                return candidate
    return name


def _known_source_filenames(client: ComfyUIClient | None) -> set[str] | None:
    """Return filenames known to still exist, or None when this is unknown.

    When the ComfyUI install is on this machine, its media folders are scanned
    directly. Otherwise ComfyUI's history is used as a conservative fallback.
    """

    def raise_walk_error(error: OSError) -> None:
        # Let an unreadable folder abort the cleanup instead of treating every
        # thumbnail as orphaned.
        raise error

    filenames = set()
    scanned = False
    for directory in COMFY_MEDIA_DIRS:
        if not os.path.isdir(directory):
            continue
        scanned = True
        for _root, _dirs, files in os.walk(directory, onerror=raise_walk_error):
            filenames.update(files)
    if scanned:
        return filenames
    if client is None:
        return None

    try:
        history = client.get_history()
    except Exception:  # noqa: BLE001 - cleanup must never break a request
        return None

    for entry in history.values():
        outputs = entry.get("outputs", {})
        for node_output in outputs.values():
            for key in ("images", "video", "audio"):
                for ref in node_output.get(key) or []:
                    filename = ref.get("filename") if isinstance(ref, dict) else None
                    if filename:
                        filenames.add(os.path.basename(filename))
    return filenames


def cleanup_orphaned_thumbnails(
    client: ComfyUIClient | None = None,
) -> list[str]:
    """Delete cached thumbnails whose original media file no longer exists.

    Returns the filenames that were removed. The check is skipped when neither
    local ComfyUI media folders nor its history can be read.
    """
    removed = []
    if not os.path.isdir(THUMBNAILS_DIR):
        return removed

    sources = _known_source_filenames(client)
    if sources is None:
        return removed

    for name in os.listdir(THUMBNAILS_DIR):
        path = os.path.join(THUMBNAILS_DIR, name)
        if not os.path.isfile(path):
            continue
        if _thumbnail_source_name(name, sources) in sources:
            continue
        try:
            os.remove(path)
            removed.append(name)
        except OSError:
            pass
    return removed


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
                # Only images generated through OpenSail have a cached
                # thumbnail; older ComfyUI history falls back to the full URL.
                ref["thumbnail_url"] = thumbnail_url(ref["filename"])
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
                ref["thumbnail_url"] = thumbnail_url(ref["filename"])
                videos.append(ref)
    return videos
