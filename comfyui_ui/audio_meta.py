"""Extract generation metadata embedded in ComfyUI audio files.

ComfyUI's audio save nodes (e.g. SaveAudioAdvanced) embed the full workflow
JSON in a ``prompt`` tag: a Vorbis comment for FLAC/OGG and an ID3v2 TXXX
frame for MP3. This module reads that tag and pulls out the music settings
(style, lyrics, mode, duration, seed, ...) so the gallery can show them.

Parsing is done with the standard library only, so no extra dependency is
needed. Any failure returns an empty dict rather than raising.
"""

import json
import struct


def _read_flac_prompt(path: str) -> str | None:
    """Return the ``prompt`` Vorbis comment from a FLAC file, or None."""
    with open(path, "rb") as f:
        if f.read(4) != b"fLaC":
            return None
        while True:
            header = f.read(4)
            if len(header) < 4:
                return None
            is_last = header[0] & 0x80
            block_type = header[0] & 0x7F
            length = struct.unpack(">I", b"\x00" + header[1:4])[0]

            if block_type == 4:  # VORBIS_COMMENT
                data = f.read(length)
                return _parse_vorbis_comment(data)
            f.seek(length, 1)
            if is_last:
                return None


def _parse_vorbis_comment(data: bytes) -> str | None:
    """Return the value of the ``prompt`` comment in a Vorbis block."""
    if len(data) < 4:
        return None
    vendor_len = struct.unpack("<I", data[:4])[0]
    pos = 4 + vendor_len
    if pos + 4 > len(data):
        return None
    count = struct.unpack("<I", data[pos : pos + 4])[0]
    pos += 4
    for _ in range(count):
        if pos + 4 > len(data):
            return None
        clen = struct.unpack("<I", data[pos : pos + 4])[0]
        pos += 4
        comment = data[pos : pos + clen].decode("utf-8", "replace")
        pos += clen
        if comment.lower().startswith("prompt="):
            return comment[len("prompt=") :]
    return None


def _read_mp3_prompt(path: str) -> str | None:
    """Return the ``prompt`` ID3v2 TXXX frame from an MP3 file, or None."""
    with open(path, "rb") as f:
        head = f.read(10)
        if len(head) < 10 or head[:3] != b"ID3":
            return None
        # ID3v2 size is a 28-bit synchsafe integer.
        size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]
        body = f.read(size)

    pos = 0
    while pos + 10 <= len(body):
        frame_id = body[pos : pos + 4]
        if not frame_id.strip(b"\x00"):
            break
        frame_size = (
            (body[pos + 4] << 21)
            | (body[pos + 5] << 14)
            | (body[pos + 6] << 7)
            | body[pos + 7]
        )
        data = body[pos + 10 : pos + 10 + frame_size]
        if frame_id == b"TXXX":
            # TXXX layout: encoding byte, description, 0x00, value.
            if data and data[0] in (0, 3):
                text = data[1:].decode("utf-8", "replace")
                desc, _, value = text.partition("\x00")
                if desc.lower() == "prompt":
                    return value
        pos += 10 + frame_size
    return None


def read_embedded_workflow(path: str) -> dict | None:
    """Return the workflow dict embedded in an audio file, or None."""
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    try:
        if ext == "flac":
            raw = _read_flac_prompt(path)
        elif ext == "mp3":
            raw = _read_mp3_prompt(path)
        else:
            # Try FLAC first, then MP3, so unknown extensions still work.
            raw = _read_flac_prompt(path) or _read_mp3_prompt(path)
    except Exception:  # noqa: BLE001
        return None

    if not raw:
        return None
    # Some tags (e.g. MP3 TXXX) append a trailing NUL terminator; strip any
    # trailing whitespace/NULs so the JSON parses cleanly.
    raw = raw.strip().rstrip("\x00").strip()
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


def _resolve_value(workflow: dict, value):
    """Resolve a node input that may be a literal or a [node_id, index] link.

    Style / lyrics are sometimes stored on a separate text node and referenced
    by the music node via a link like ``["33:36", 0]``. When ``value`` is such
    a link, look up the referenced node and return its text value.
    """
    if (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], str)
        and isinstance(value[1], int)
    ):
        node = workflow.get(value[0])
        if isinstance(node, dict):
            inputs = node.get("inputs", {})
            for key in ("value", "text", "string"):
                if key in inputs:
                    return inputs[key]
    return value


def _find_music_node(workflow: dict) -> dict | None:
    """Return the inputs of the music generation node, or None."""
    for node in workflow.values():
        if node.get("class_type") == "YuE2GenerateMusic":
            return node.get("inputs", {})
    return None


def _find_sampler_node(workflow: dict) -> dict | None:
    """Return the inputs of the KSampler node, or None."""
    for node in workflow.values():
        if node.get("class_type") == "KSampler":
            return node.get("inputs", {})
    return None


def extract_audio_metadata(path: str) -> dict:
    """Return a dict of music metadata embedded in an audio file.

    Keys are only present when the corresponding value exists. Recognised
    keys: ``style``, ``lyrics``, ``mode``, ``max_duration``, ``seed``,
    ``steps``, ``cfg``, ``sampler_name``, ``scheduler``.
    """
    workflow = read_embedded_workflow(path)
    if not workflow:
        return {}

    meta = {}

    music = _find_music_node(workflow)
    if music:
        for key in ("style", "lyrics", "mode", "max_duration"):
            if key in music:
                meta[key] = _resolve_value(workflow, music[key])

    sampler = _find_sampler_node(workflow)
    if sampler:
        for key in ("seed", "steps", "cfg", "sampler_name", "scheduler"):
            if key in sampler:
                meta[key] = sampler[key]

    return meta


def format_audio_caption(filename: str, meta: dict) -> str:
    """Build a short multi-line caption from audio metadata.

    The caption lists the filename followed by the most useful settings, so
    the gallery tile conveys what the clip is without opening it.
    """
    lines = [filename]
    if meta.get("style"):
        lines.append(f"Style: {meta['style']}")
    if meta.get("mode"):
        lines.append(f"Mode: {meta['mode']}")
    if meta.get("max_duration") is not None:
        lines.append(f"Duration: {meta['max_duration']}s")
    if meta.get("seed") is not None:
        lines.append(f"Seed: {meta['seed']}")
    return "\n".join(lines)
