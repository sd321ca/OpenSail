"""Gallery data: list recent images, audio and video from ComfyUI and the
optional local media folder.

The dashboard proxies media through its own server so a browser on another
machine on the LAN can view the gallery even when it cannot reach ComfyUI
directly. This module only discovers the items; the HTTP layer in
:mod:`comfyui_ui.server` streams the bytes.
"""

import io
import os
import subprocess
import tempfile
import threading
from urllib.parse import urlencode

from PIL import Image

from .audio import _resolve_ffmpeg
from .comfy_client import ComfyUIClient, VIDEO_EXTENSIONS, is_video_filename
from .config import COMFY_MEDIA_DIRS, COMFY_URL, LOCAL_MEDIA_DIR, THUMBNAILS_DIR
from .errors import AppError

# Route on the app server that proxies a ComfyUI output file (images, audio and
# video all use the same route).
FILE_PROXY_ROUTE = "/api/gallery/file"
# Route that serves a cached gallery thumbnail by its original filename.
THUMBNAIL_ROUTE = "/api/gallery/thumbnail"
# Route that generates and serves a thumbnail for a local media file.
LOCAL_THUMBNAIL_ROUTE = "/api/gallery/local-thumbnail"
# Local media thumbnails live in their own subfolder so their names can mirror
# the media folder structure without colliding with ComfyUI history thumbnails.
LOCAL_THUMBNAILS_SUBDIR = "local"
# ``type`` value for gallery references backed by the local media folder.
LOCAL_MEDIA_TYPE = "local"

# Longest edge of a gallery thumbnail, in pixels. Images are only ever shrunk,
# never upscaled.
THUMBNAIL_MAX_SIZE = (480, 480)
# JPEG settings shared by image and video thumbnails.
THUMBNAIL_JPEG_QUALITY = 82

# Image sources that can be re-encoded as JPEG without changing the filename.
JPEG_EXTENSIONS = (".jpg", ".jpeg")

# File types picked up from the optional local media folder. Videos use the
# same extension list as ComfyUI's output detection.
IMAGE_EXTENSIONS = (
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".avif",
)
AUDIO_EXTENSIONS = (
    ".wav",
    ".mp3",
    ".flac",
    ".ogg",
    ".oga",
    ".m4a",
    ".aac",
    ".opus",
    ".wma",
)


def file_proxy_url(ref: dict) -> str:
    """Build a proxy URL for a ComfyUI file reference."""
    params = {
        "filename": ref["filename"],
        "subfolder": ref.get("subfolder", ""),
        "type": ref.get("type", "output"),
    }
    return f"{FILE_PROXY_ROUTE}?" + urlencode(params)


def local_media_path(subfolder: str, filename: str) -> str | None:
    """Resolve a local media reference to a file inside the media folder.

    Returns None when the reference is empty or escapes :data:`LOCAL_MEDIA_DIR`,
    so neither the gallery nor the file route can serve arbitrary files.
    """
    if not filename:
        return None
    root = os.path.realpath(LOCAL_MEDIA_DIR)
    candidate = os.path.realpath(
        os.path.join(root, subfolder or "", filename)
    )
    try:
        common = os.path.commonpath([root, candidate])
    except ValueError:  # Different drives on Windows.
        return None
    if os.path.normcase(common) != os.path.normcase(root):
        return None
    return candidate if os.path.isfile(candidate) else None


def local_thumbnail_url(filename: str, subfolder: str = "") -> str:
    """Build the on-demand thumbnail URL for a local media file."""
    params = {"filename": filename, "subfolder": subfolder}
    return f"{LOCAL_THUMBNAIL_ROUTE}?" + urlencode(params)


def _list_local_media(
    extensions: tuple[str, ...], limit: int | None = None
) -> list[tuple[str, str]]:
    """Return ``(filename, subfolder)`` pairs from the local media folder.

    Entries are sorted newest-first by modification time. Hidden files and
    folders are skipped, and subfolders are scanned recursively.
    """
    if not os.path.isdir(LOCAL_MEDIA_DIR):
        return []

    root_dir = os.path.abspath(LOCAL_MEDIA_DIR)
    found = []
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [name for name in dirs if not name.startswith(".")]
        for name in files:
            if name.startswith("."):
                continue
            if os.path.splitext(name)[1].lower() not in extensions:
                continue
            try:
                modified = os.path.getmtime(os.path.join(root, name))
            except OSError:
                continue
            subfolder = os.path.relpath(root, root_dir)
            if subfolder == ".":
                subfolder = ""
            else:
                subfolder = subfolder.replace(os.sep, "/")
            found.append((modified, name, subfolder))

    found.sort(key=lambda entry: entry[0], reverse=True)
    items = [(name, subfolder) for _modified, name, subfolder in found]
    return items[:limit] if limit is not None else items


def _local_media_ref(
    filename: str, subfolder: str, thumbnail: bool = False
) -> dict:
    """Build a gallery entry for a file in the local media folder."""
    ref = {
        "filename": filename,
        "subfolder": subfolder,
        "type": LOCAL_MEDIA_TYPE,
        "source": LOCAL_MEDIA_TYPE,
        "prompt": "",
    }
    ref["url"] = file_proxy_url(ref)
    if thumbnail:
        ref["thumbnail_url"] = local_thumbnail_url(filename, subfolder)
    return ref


def _history_media_refs(entry: dict) -> list[dict]:
    """Return the unique media file references in a history entry."""
    refs = []
    seen = set()
    for node_output in entry.get("outputs", {}).values():
        for key in ("images", "audio", "video"):
            for raw in node_output.get(key) or []:
                if not isinstance(raw, dict):
                    continue
                filename = raw.get("filename")
                if not filename:
                    continue
                ref = {
                    "filename": filename,
                    "subfolder": raw.get("subfolder", ""),
                    "type": raw.get("type", "output"),
                }
                signature = (ref["filename"], ref["subfolder"], ref["type"])
                if signature in seen:
                    continue
                seen.add(signature)
                refs.append(ref)
    return refs


def _move_target(filename: str) -> str:
    """Choose a non-colliding destination inside the local media folder."""
    os.makedirs(LOCAL_MEDIA_DIR, exist_ok=True)
    name = os.path.basename(filename or "") or "media"
    stem, extension = os.path.splitext(name)
    target = os.path.join(LOCAL_MEDIA_DIR, name)
    counter = 1
    while os.path.exists(target):
        target = os.path.join(
            LOCAL_MEDIA_DIR, f"{stem} ({counter}){extension}"
        )
        counter += 1
    return target


def move_history_to_media(
    client: ComfyUIClient, prompt_ids: list[str]
) -> dict:
    """Copy history outputs to the media folder and drop moved entries.

    Every output of each selected history entry is copied, so batch siblings
    are preserved even when only one tile was selected. An entry is removed
    from ComfyUI's history only after all of its files were copied.
    """
    history = client.get_history()
    moved = 0
    failed = 0
    deleted = 0

    for prompt_id in dict.fromkeys(prompt_ids):
        entry = history.get(prompt_id)
        if not isinstance(entry, dict):
            failed += 1
            continue
        refs = _history_media_refs(entry)
        if not refs:
            failed += 1
            continue

        copied = []
        try:
            for ref in refs:
                target = _move_target(ref["filename"])
                client.download_file(ref, target)
                copied.append(target)
                moved += 1
        except Exception:  # noqa: BLE001 - keep the history entry intact
            for path in copied:
                try:
                    os.remove(path)
                except OSError:
                    pass
            moved -= len(copied)
            failed += 1
            continue

        try:
            client.delete_history([prompt_id])
            deleted += 1
        except Exception:  # noqa: BLE001 - files are already safe in media
            failed += 1

    return {"moved": moved, "failed": failed, "deleted_history": deleted}


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


def _write_video_thumbnail(video_path: str, target: str) -> bool:
    """Extract a still frame from a video and write it as a JPEG."""
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg or not os.path.isfile(video_path):
        return False

    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
    except OSError:
        return False

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


def save_video_thumbnail(filename: str, video_path: str) -> bool:
    """Extract a still frame and save it as the video's cached thumbnail.

    The image is written as ``<video filename>.jpg`` in
    :data:`config.THUMBNAILS_DIR`. Video decoding needs ffmpeg; when it is not
    available, or extraction fails, this returns False without raising.
    """
    name = _thumbnail_name(filename)
    if name is None:
        return False
    os.makedirs(THUMBNAILS_DIR, exist_ok=True)
    return _write_video_thumbnail(
        video_path, os.path.join(THUMBNAILS_DIR, f"{name}.jpg")
    )


def _local_thumbnail_path(source_path: str) -> str | None:
    """Return the cache path for a local media file, or None if it escapes."""
    root = os.path.realpath(LOCAL_MEDIA_DIR)
    source = os.path.realpath(source_path)
    try:
        relative = os.path.relpath(source, root)
    except ValueError:  # Different drives on Windows.
        return None
    if relative == os.pardir or relative.startswith(os.pardir + os.sep):
        return None
    return os.path.join(
        THUMBNAILS_DIR, LOCAL_THUMBNAILS_SUBDIR, relative + ".jpg"
    )


def delete_local_media(subfolder: str, filename: str) -> bool:
    """Delete a local media file and its cached thumbnail.

    Returns True when the source file was removed. Paths are resolved through
    :func:`local_media_path`, so only files inside the media folder qualify.
    """
    path = local_media_path(subfolder, filename)
    if path is None:
        return False
    target = _local_thumbnail_path(path)
    try:
        os.remove(path)
    except OSError:
        return False
    if target is not None:
        try:
            os.remove(target)
        except OSError:
            pass
    return True


def _write_image_file_thumbnail(source_path: str, target: str) -> bool:
    """Downscale an image file and write it as a compact JPEG."""
    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with Image.open(source_path) as source:
            image = source.copy()
        _write_jpeg_thumbnail(image, target)
        return True
    except Exception:  # noqa: BLE001 - thumbnails are best-effort
        return False


# Generating a thumbnail can be slow (video frame extraction especially), so
# concurrent requests for the same file wait for the first one instead of
# decoding it several times.
_local_thumbnail_locks: dict[str, threading.Lock] = {}
_local_thumbnail_locks_guard = threading.Lock()


def _local_thumbnail_lock(target: str) -> threading.Lock:
    with _local_thumbnail_locks_guard:
        return _local_thumbnail_locks.setdefault(target, threading.Lock())


def _local_thumbnail_is_fresh(target: str, source_path: str) -> bool:
    try:
        return (
            os.path.isfile(target)
            and os.path.getmtime(target) >= os.path.getmtime(source_path)
        )
    except OSError:
        return False


def ensure_local_thumbnail(source_path: str) -> str | None:
    """Return a cached thumbnail for a local media file, creating it if needed.

    Images are decoded with Pillow and videos use ffmpeg. Returns None when the
    source is not a supported media file or the thumbnail cannot be produced.
    """
    target = _local_thumbnail_path(source_path)
    if target is None:
        return None
    if _local_thumbnail_is_fresh(target, source_path):
        return target

    extension = os.path.splitext(source_path)[1].lower()
    with _local_thumbnail_lock(target):
        if _local_thumbnail_is_fresh(target, source_path):
            return target
        if extension in IMAGE_EXTENSIONS:
            generated = _write_image_file_thumbnail(source_path, target)
        elif extension in VIDEO_EXTENSIONS:
            generated = _write_video_thumbnail(source_path, target)
        else:
            return None

    return target if generated and os.path.isfile(target) else None


def _cleanup_orphaned_local_thumbnails() -> list[str]:
    """Delete local media thumbnails whose source file no longer exists."""
    root = os.path.join(THUMBNAILS_DIR, LOCAL_THUMBNAILS_SUBDIR)
    removed = []
    if not os.path.isdir(root):
        return removed

    for walk_root, _dirs, files in os.walk(root, topdown=False):
        for name in files:
            if not name.lower().endswith(".jpg"):
                continue
            path = os.path.join(walk_root, name)
            relative = os.path.relpath(path, root)
            source = os.path.join(LOCAL_MEDIA_DIR, relative[:-4])
            if os.path.isfile(source):
                continue
            try:
                os.remove(path)
                removed.append(relative.replace(os.sep, "/"))
            except OSError:
                pass
        try:
            if not os.listdir(walk_root):
                os.rmdir(walk_root)
        except OSError:
            pass
    return removed


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

    Returns the filenames that were removed. ComfyUI thumbnails are skipped
    when neither its media folders nor its history can be read, but thumbnails
    for the local media folder are always checked.
    """
    removed = _cleanup_orphaned_local_thumbnails()
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


def _sorted_history(history: dict) -> list[tuple[str, dict]]:
    """Return ``(prompt_id, entry)`` pairs sorted newest-first.

    History is keyed by prompt_id. Each entry's "prompt" is a list shaped like
    [queue_number, prompt_id, prompt_dict, extra_data, outputs]. Sort by the
    queue number so the most recent generations appear first.
    """

    def sort_key(item):
        _prompt_id, entry = item
        prompt_meta = entry.get("prompt")
        if isinstance(prompt_meta, list) and prompt_meta and isinstance(
            prompt_meta[0], (int, float)
        ):
            return prompt_meta[0]
        return 0

    return sorted(history.items(), key=sort_key, reverse=True)


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


def _load_history(client: ComfyUIClient) -> list[tuple[str, dict]]:
    try:
        return _sorted_history(client.get_history())
    except Exception as exc:  # noqa: BLE001
        raise AppError(
            f"Could not load gallery from ComfyUI at {COMFY_URL}: {exc}"
        ) from exc


def _gallery_history(
    client: ComfyUIClient, has_local: bool
) -> list[tuple[str, dict]]:
    """Load ComfyUI history, keeping local media visible when it is offline."""
    try:
        return _load_history(client)
    except AppError:
        if has_local:
            return []
        raise


def list_gallery_images(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent images from ComfyUI's history and the local media folder.

    Each entry is a dict with the image's filename, subfolder, type, proxy URL
    and the prompt text (when available). Local media comes first, then newest
    history images. ``limit`` caps how many files of each source are listed.
    """
    images = [
        _local_media_ref(filename, subfolder, thumbnail=True)
        for filename, subfolder in _list_local_media(IMAGE_EXTENSIONS, limit)
    ]
    for prompt_id, entry in _gallery_history(client, bool(images))[:limit]:
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
                    "prompt_id": prompt_id,
                    "prompt": prompt_text,
                }
                ref["url"] = file_proxy_url(ref)
                # Only images generated through OpenSail have a cached
                # thumbnail; older ComfyUI history falls back to the full URL.
                ref["thumbnail_url"] = thumbnail_url(ref["filename"])
                images.append(ref)
    return images


def list_gallery_audio(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent audio from ComfyUI's history and the local media folder.

    Each entry is a dict with the audio's filename, subfolder, type, proxy URL
    and the prompt text (when available). Local media comes first, then newest
    history audio. ``limit`` caps how many files of each source are listed.
    """
    audio = [
        _local_media_ref(filename, subfolder)
        for filename, subfolder in _list_local_media(AUDIO_EXTENSIONS, limit)
    ]
    for prompt_id, entry in _gallery_history(client, bool(audio))[:limit]:
        outputs = entry.get("outputs", {})
        prompt_text = _prompt_text(entry)

        for node_output in outputs.values():
            for audio_ref in node_output.get("audio", []):
                ref = {
                    "filename": audio_ref.get("filename", ""),
                    "subfolder": audio_ref.get("subfolder", ""),
                    "type": audio_ref.get("type", "output"),
                    "prompt_id": prompt_id,
                    "prompt": prompt_text,
                }
                ref["url"] = file_proxy_url(ref)
                audio.append(ref)
    return audio


def list_gallery_videos(client: ComfyUIClient, limit: int = 200) -> list:
    """Return recent videos from ComfyUI's history and the local media folder.

    ComfyUI's SaveVideo node reports its result under the "images" output key
    (with an "animated" flag), so history video files are picked out of that key
    by their file extension. Local media comes first, then newest history
    videos. ``limit`` caps how many files of each source are listed.
    """
    videos = [
        _local_media_ref(filename, subfolder, thumbnail=True)
        for filename, subfolder in _list_local_media(VIDEO_EXTENSIONS, limit)
    ]
    for prompt_id, entry in _gallery_history(client, bool(videos))[:limit]:
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
                    "prompt_id": prompt_id,
                    "prompt": prompt_text,
                }
                ref["url"] = file_proxy_url(ref)
                ref["thumbnail_url"] = thumbnail_url(ref["filename"])
                videos.append(ref)
    return videos
