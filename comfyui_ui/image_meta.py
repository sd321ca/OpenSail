"""Read ComfyUI generation metadata embedded in saved images.

ComfyUI's image save nodes write the full API prompt and the editor workflow
into PNG text chunks (``prompt`` and ``workflow``). This module reads those
chunks with Pillow and pulls out the settings a user is most likely to want
(model, prompts, sampler settings, ...) so the gallery can show them.

Any failure returns an empty dict rather than raising: metadata is a bonus, and
a file without it should still open normally.
"""

import io
import json

from PIL import Image

# Text chunks written by ComfyUI. Both hold a JSON string.
PROMPT_KEY = "prompt"
WORKFLOW_KEY = "workflow"
# Other common metadata chunks (A1111-style parameters, comments, ...).
TEXT_KEYS = ("parameters", "Comment", "Description", "Title")
_READ_KEYS = (PROMPT_KEY, WORKFLOW_KEY, *TEXT_KEYS)

# Node input keys that name a model file, mapped to the label shown in the UI.
_MODEL_KEYS = (
    ("ckpt_name", "Checkpoint"),
    ("unet_name", "Diffusion model"),
    ("model_name", "Model"),
    ("vae_name", "VAE"),
    ("clip_name", "CLIP"),
    ("lora_name", "LoRA"),
    ("control_net_name", "ControlNet"),
)

# Node input keys that may hold the prompt text directly.
_TEXT_INPUT_KEYS = ("text", "string", "value", "prompt")


def _decode_text(value) -> str | None:
    """Return metadata bytes/strings as text, or None when unsupported."""
    if isinstance(value, str):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return None


def _read_text_fields(source) -> dict:
    """Return the recognised text metadata chunks from an image."""
    try:
        with Image.open(source) as image:
            text = dict(getattr(image, "text", {}) or {})
            # JPEG/WebP and other formats expose metadata through ``info``.
            for key in _READ_KEYS:
                if key not in text and key in image.info:
                    text[key] = image.info[key]
    except Exception:  # noqa: BLE001 - metadata is best-effort
        return {}

    fields = {}
    for key in _READ_KEYS:
        value = _decode_text(text.get(key))
        if value:
            fields[key] = value
    return fields


def _parse_json(value: str):
    """Parse an embedded JSON chunk, returning None when it is not JSON."""
    try:
        return json.loads(value.strip().rstrip("\x00"))
    except (ValueError, TypeError):
        return None


def _resolve_link(prompt: dict, value, depth: int = 0):
    """Resolve a ``[node_id, output_index]`` link to the node's text value."""
    if (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], str)
        and isinstance(value[1], int)
        and depth < 8
    ):
        node = prompt.get(value[0])
        if isinstance(node, dict):
            inputs = node.get("inputs")
            if isinstance(inputs, dict):
                for key in _TEXT_INPUT_KEYS:
                    if key in inputs:
                        return _resolve_link(prompt, inputs[key], depth + 1)
    return value


def _input_text(prompt: dict, value) -> str:
    """Return a stripped text value from a direct input or a link."""
    resolved = _resolve_link(prompt, value)
    return resolved.strip() if isinstance(resolved, str) else ""


def _sampler_inputs(prompt: dict) -> dict:
    """Return the inputs of the primary sampler node, if any."""
    fallback = None
    for node in prompt.values():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type") or "")
        inputs = node.get("inputs")
        if "Sampler" not in class_type or not isinstance(inputs, dict):
            continue
        if "steps" in inputs or "cfg" in inputs:
            return inputs
        if fallback is None:
            fallback = inputs
    return fallback or {}


def _text_nodes(prompt: dict) -> list[str]:
    """Return distinct prompt texts found on text nodes."""
    texts = []
    for node in prompt.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key in _TEXT_INPUT_KEYS:
            if key in inputs:
                text = _input_text(prompt, inputs[key])
                if text and text not in texts:
                    texts.append(text)
                break
    return texts


def _add(rows: list, label: str, value) -> None:
    """Add a summary row unless it is empty or already present."""
    if value is None or value == "":
        return
    row = {"label": label, "value": str(value)}
    if row not in rows:
        rows.append(row)


def summarize_prompt(prompt: dict) -> list[dict]:
    """Build readable ``{label, value}`` rows from an API-format prompt."""
    if not isinstance(prompt, dict):
        return []

    sampler = _sampler_inputs(prompt)
    positive = _input_text(prompt, sampler.get("positive"))
    negative = _input_text(prompt, sampler.get("negative"))
    if not positive and not negative:
        texts = _text_nodes(prompt)
        positive = texts[0] if texts else ""

    rows = []
    _add(rows, "Positive prompt", positive)
    _add(rows, "Negative prompt", negative)

    for node in prompt.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, label in _MODEL_KEYS:
            if key in inputs:
                _add(rows, label, _resolve_link(prompt, inputs[key]))

    _add(rows, "Seed", sampler.get("seed", sampler.get("noise_seed")))
    _add(rows, "Steps", sampler.get("steps"))
    _add(rows, "CFG", sampler.get("cfg"))
    _add(rows, "Sampler", sampler.get("sampler_name"))
    _add(rows, "Scheduler", sampler.get("scheduler"))
    denoise = sampler.get("denoise")
    if denoise is not None and denoise != 1:
        _add(rows, "Denoise", denoise)

    for node in prompt.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        width = inputs.get("width")
        height = inputs.get("height")
        if isinstance(width, int) and isinstance(height, int):
            size = f"{width} × {height}"
            batch = inputs.get("batch_size")
            if isinstance(batch, int) and batch > 1:
                size += f" ({batch} images)"
            _add(rows, "Size", size)
            break

    return rows


def _metadata_from_fields(fields: dict) -> dict:
    """Build the public metadata dict from the raw text chunks."""
    if not fields:
        return {}

    metadata = {}
    for key in (PROMPT_KEY, WORKFLOW_KEY):
        if key not in fields:
            continue
        parsed = _parse_json(fields[key])
        metadata[key] = fields[key] if parsed is None else parsed

    for key in TEXT_KEYS:
        if key in fields:
            metadata[key.lower()] = fields[key]

    prompt = metadata.get(PROMPT_KEY)
    if isinstance(prompt, dict):
        summary = summarize_prompt(prompt)
        if summary:
            metadata["summary"] = summary

    return metadata


def extract_image_metadata(content: bytes) -> dict:
    """Return the ComfyUI metadata embedded in an image's bytes.

    Recognised keys: ``prompt`` (API workflow), ``workflow`` (UI workflow),
    ``parameters`` and ``summary`` (readable rows built from ``prompt``). Keys
    are only present when the corresponding value exists.
    """
    return _metadata_from_fields(_read_text_fields(io.BytesIO(content)))


def extract_image_metadata_path(path: str) -> dict:
    """Return the ComfyUI metadata embedded in an image file."""
    return _metadata_from_fields(_read_text_fields(path))
