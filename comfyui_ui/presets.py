"""Per-workflow input presets.

A preset is a named set of values for the Generate tab's controls, so one
workflow can have several ready-made configurations (for example ``Low
quality`` and ``High quality``). Presets are stored in
``configs/workflow_presets.json``::

    {
      "workflow_presets": {
        "Image Gen (Moss) - Text Input.json": {
          "default": "High quality",
          "presets": {
            "High quality": {
              "18:7|steps": 40,
              "18:7|cfg": 7.5
            },
            "Low quality": {
              "18:7|steps": 12,
              "18:7|cfg": 4.0
            }
          }
        }
      }
    }

Values are keyed by binding ID (``node_id|input_key``), the same IDs stored in
``configs/workflow_fields.json``. A preset may therefore hold values for
bindings that are not currently shown; those are simply ignored when it is
loaded. The optional ``default`` preset is applied automatically when the
workflow is selected in the Generate tab.

"""

import json
import math
import os

from .config import WORKFLOW_PRESETS_PATH
from .fields import resolve_choices


def _load_config() -> dict:
    """Load the raw presets config, returning an empty one when unreadable."""
    if not os.path.isfile(WORKFLOW_PRESETS_PATH):
        return {"workflow_presets": {}}
    try:
        with open(WORKFLOW_PRESETS_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"workflow_presets": {}}
    if not isinstance(config, dict):
        return {"workflow_presets": {}}
    return config


def _workflow_entry(config: dict, workflow_name: str) -> dict | None:
    """Return a workflow's config entry, or None when it has none."""
    entries = config.get("workflow_presets")
    if not isinstance(entries, dict):
        return None
    entry = entries.get(workflow_name)
    return entry if isinstance(entry, dict) else None


def _json_value(value):
    """Return a JSON-serializable value, or the ``_SKIP`` sentinel.

    Some widget values can be NumPy scalars, which ``json`` cannot write.
    Values that cannot be represented (and cleared inputs, which are ``None``)
    are skipped instead of breaking the save.
    """
    if value is None:
        return _SKIP
    if isinstance(value, float) and not math.isfinite(value):
        return _SKIP
    if isinstance(value, (str, bool, int, float)):
        return value
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return _json_value(item())
        except (TypeError, ValueError):
            return _SKIP
    return _SKIP


class _Skip:
    """Sentinel type for values that should not be stored in a preset."""

    def __repr__(self) -> str:
        return "<skip>"


_SKIP = _Skip()


def _clean_values(values: dict) -> dict:
    """Return a dict with only JSON-safe, non-None binding values."""
    cleaned = {}
    for binding_id, value in (values or {}).items():
        if not isinstance(binding_id, str):
            continue
        safe = _json_value(value)
        if safe is not _SKIP:
            cleaned[binding_id] = safe
    return cleaned


def _write_config(config: dict) -> None:
    """Write the config atomically, creating the configs folder if needed."""
    os.makedirs(os.path.dirname(WORKFLOW_PRESETS_PATH), exist_ok=True)
    tmp_path = WORKFLOW_PRESETS_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, WORKFLOW_PRESETS_PATH)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def get_presets(workflow_name: str) -> dict:
    """Return the workflow's presets as a ``name -> values`` mapping."""
    if not workflow_name:
        return {}
    entry = _workflow_entry(_load_config(), workflow_name)
    if entry is None:
        return {}
    presets = entry.get("presets")
    if not isinstance(presets, dict):
        return {}
    return {
        name: dict(values)
        for name, values in presets.items()
        if isinstance(name, str) and isinstance(values, dict)
    }


def get_preset_names(workflow_name: str) -> list:
    """Return the workflow's preset names in saved order."""
    return list(get_presets(workflow_name))


def get_preset(workflow_name: str, preset_name: str) -> dict | None:
    """Return one preset's binding values, or None when it does not exist."""
    if not preset_name:
        return None
    return get_presets(workflow_name).get(preset_name)


def get_default_preset(workflow_name: str) -> str | None:
    """Return the name of the preset loaded by default, or None."""
    if not workflow_name:
        return None
    entry = _workflow_entry(_load_config(), workflow_name)
    if entry is None:
        return None
    default = entry.get("default")
    if not isinstance(default, str) or not default.strip():
        return None
    # Ignore a default that no longer names an existing preset.
    return default if default in get_presets(workflow_name) else None


def get_default_preset_values(workflow_name: str) -> dict:
    """Return the binding values of the workflow's default preset."""
    default = get_default_preset(workflow_name)
    if not default:
        return {}
    return get_preset(workflow_name, default) or {}


def save_preset(workflow_name: str, preset_name: str, values: dict) -> None:
    """Create or replace a workflow preset and persist it.

    The config is re-read before writing so manual edits made while the app is
    running are preserved. The preset keeps its position when it already
    exists; new presets are appended.
    """
    if not workflow_name:
        raise ValueError("A workflow is required to save a preset.")
    name = (preset_name or "").strip()
    if not name:
        raise ValueError("A preset name is required.")

    config = _load_config()
    entries = config.get("workflow_presets")
    if not isinstance(entries, dict):
        entries = {}
        config["workflow_presets"] = entries
    entry = entries.get(workflow_name)
    if not isinstance(entry, dict):
        entry = {}
        entries[workflow_name] = entry
    presets = entry.get("presets")
    if not isinstance(presets, dict):
        presets = {}
        entry["presets"] = presets

    cleaned = _clean_values(values)
    if not cleaned:
        raise ValueError("A preset needs at least one input value.")
    presets[name] = cleaned
    _write_config(config)


def delete_preset(workflow_name: str, preset_name: str) -> bool:
    """Delete a workflow preset. Returns True when one was removed."""
    name = (preset_name or "").strip()
    if not workflow_name or not name:
        return False

    config = _load_config()
    entry = _workflow_entry(config, workflow_name)
    if entry is None:
        return False
    presets = entry.get("presets")
    if not isinstance(presets, dict) or name not in presets:
        return False

    del presets[name]
    if entry.get("default") == name:
        entry.pop("default", None)

    # Keep the file tidy when the workflow has no presets left.
    if not presets:
        entries = config.get("workflow_presets")
        if isinstance(entries, dict):
            entries.pop(workflow_name, None)

    _write_config(config)
    return True


def set_default_preset(workflow_name: str, preset_name: str | None) -> None:
    """Make a preset the workflow's default, or clear the default with None."""
    config = _load_config()
    entry = _workflow_entry(config, workflow_name)
    if entry is None:
        raise ValueError("That workflow has no presets.")

    name = (preset_name or "").strip()
    if not name:
        entry.pop("default", None)
    else:
        presets = entry.get("presets")
        if not isinstance(presets, dict) or name not in presets:
            raise ValueError(f"Preset {name!r} does not exist.")
        entry["default"] = name

    _write_config(config)


# ---------------------------------------------------------------------------
# Preset value validation
# ---------------------------------------------------------------------------

# Sentinel returned when a preset value cannot be applied to a control (for
# example a dropdown option that was removed from the config).
_PRESET_UNSET = object()


def _preset_choices(workflow_name: str) -> list:
    """Return preset dropdown choices, marking the workflow's default."""
    default = get_default_preset(workflow_name)
    return [
        (f"{name} (default)" if name == default else name, name)
        for name in get_preset_names(workflow_name)
    ]


def _preset_control_value(candidate: dict, value):
    """Return a value the candidate's widget can display, or ``_PRESET_UNSET``.

    Presets are plain JSON, so a file edited by hand (or written before a
    config change) can hold values the current widget cannot accept. Those are
    skipped rather than raising an error.
    """
    if value is None:
        return _PRESET_UNSET
    field = candidate.get("field_def", {})
    widget = field.get("widget")
    if widget == "textbox":
        return value if isinstance(value, str) else _PRESET_UNSET
    if widget in ("slider", "number"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return _PRESET_UNSET
        if not math.isfinite(value):
            return _PRESET_UNSET
        return value
    if widget == "checkbox":
        return value if isinstance(value, bool) else _PRESET_UNSET
    if widget == "dropdown":
        return value if value in resolve_choices(field) else _PRESET_UNSET
    return _PRESET_UNSET


def candidate_with_preset_value(candidate: dict, values: dict) -> dict:
    """Return a candidate with its value replaced by a valid preset value.

    Used when controls are first built, so the workflow's default preset
    pre-fills them. Candidates without a usable value are returned unchanged.
    """
    value = _preset_control_value(
        candidate, (values or {}).get(candidate.get("id"))
    )
    if value is _PRESET_UNSET:
        return candidate
    return {**candidate, "value": value}
