"""Declarative input-field registry.

The Generate tab's controls are described in ``configs/fields.json`` rather
than being hard-coded in ``ui.py``. This module loads that config and exposes
helpers so the UI can be built generically and new inputs can be added by
editing the config file alone.

The selected node bindings (``node_id|input_key``) for each workflow are stored
separately in ``configs/workflow_fields.json``. The Generate tab writes that
mapping back to the file when the user saves a selection, so it survives
restarts and stays easy to edit by hand.

Each field entry has the shape::

    {
        "key": "steps",                 # field key + candidate field name
        "widget": "slider",             # textbox/slider/dropdown/number/checkbox
        "options": {...},               # widget-specific kwargs
        # Optional. Omit it to match a node input with the same key.
        "match": {                      # how node inputs map to this widget
            "node_types": ["KSampler"],
            "input_keys": ["steps"],
            # optional: text primitive node types (e.g. PrimitiveString)
            "linked_node_types": ["PrimitiveString", "PrimitiveStringMultiline"],
            "music_key": "style"           # optional: inline on music node
        }
    }

``options`` are passed to the dashboard's matching control, except for two
registry-only keys: ``choices_source`` (dropdown choices, see
``resolve_choices``) and ``fullscreen`` (textbox only, kept for backwards
compatibility with older field registries).
"""

import json
import os

from .config import (
    ASPECT_RATIOS,
    FIELDS_PATH,
    MUSIC_MODES,
    SAMPLERS_PATH,
    SCHEDULERS_PATH,
    WORKFLOW_FIELDS_PATH,
)


def _load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_choices(source: str) -> list:
    """Resolve a ``choices_source`` name to a list of dropdown choices."""
    if source == "samplers":
        return _load_json(SAMPLERS_PATH)
    if source == "schedulers":
        return _load_json(SCHEDULERS_PATH)
    if source == "aspect_ratios":
        return list(ASPECT_RATIOS)
    if source == "music_modes":
        return list(MUSIC_MODES)
    return []


def load_field_config() -> dict:
    """Load the raw field registry from ``configs/fields.json``."""
    if not os.path.isfile(FIELDS_PATH):
        return {"fields": []}
    return _load_json(FIELDS_PATH)


def load_workflow_fields_config() -> dict:
    """Load the raw per-workflow selection config.

    The selections live in ``configs/workflow_fields.json`` so they can be
    edited or versioned separately from the field definitions.
    """
    if not os.path.isfile(WORKFLOW_FIELDS_PATH):
        return {"workflow_fields": {}}
    try:
        config = _load_json(WORKFLOW_FIELDS_PATH)
    except (OSError, json.JSONDecodeError):
        return {"workflow_fields": {}}
    if not isinstance(config, dict):
        return {"workflow_fields": {}}
    return config


def load_workflow_fields() -> dict:
    """Return the workflow -> binding-list mapping."""
    config = load_workflow_fields_config()
    selections = config.get("workflow_fields")
    return selections if isinstance(selections, dict) else {}


FIELDS = load_field_config().get("fields", [])

# Per-workflow node selections. Maps a workflow filename to a list of binding
# IDs (``node_id|input_key``). A workflow without an entry shows every editable
# node input it contains.
_WORKFLOW_FIELDS = load_workflow_fields()

def get_fields() -> list:
    """Return all field definitions in config order."""
    return FIELDS


def resolve_choices(field: dict) -> list:
    """Return the dropdown choices for a field (empty for non-dropdowns)."""
    options = field.get("options", {})
    source = options.get("choices_source")
    if not source:
        return []
    return _load_choices(source)


def parse_binding_entry(entry) -> tuple[str | None, str | None, bool]:
    """Return ``(binding_id, display_name, visible)`` for a saved entry.

    Entries use ``node_id|input_key|visible|display_name``. The alias may be
    empty but the trailing separator is kept, so every entry has the same
    shape. ``visible`` is ``true`` or ``false``.
    """
    if not isinstance(entry, str):
        return None, None, True
    parts = entry.split("|", 3)
    if len(parts) < 4:
        return None, None, True
    binding_id = f"{parts[0]}|{parts[1]}"
    visible = parts[2].strip().lower() != "false"
    name = parts[3].strip() or None
    return binding_id, name, visible


def get_saved_fields(workflow_name: str) -> list | None:
    """Return the saved node-binding list for a workflow, or None.

    Entries use ``node_id|input_key|visible|display_name``; use
    ``parse_binding_entry`` to read them. ``None`` means the workflow has no
    entry in ``workflow_fields`` yet, in which case the UI shows every editable
    node input. An empty list is a saved selection that hides every node
    control.
    """
    saved = _WORKFLOW_FIELDS.get(workflow_name)
    return list(saved) if isinstance(saved, list) else None


def save_workflow_fields(workflow_name: str, entries: list) -> None:
    """Persist a workflow's selected bindings and hidden aliases.

    Every entry is written as ``node_id|input_key|visible|display_name``, where
    ``visible`` is ``true`` or ``false`` and the alias may be empty. Hidden
    entries without an alias are omitted. They are stored under the top-level
    ``workflow_fields`` mapping in ``configs/workflow_fields.json`` in the given
    order. The file is re-read before writing so manual edits made while the app
    is running are preserved, then written atomically.
    """
    global _WORKFLOW_FIELDS

    ordered = []
    seen = set()
    for entry in entries or []:
        binding_id, name, visible = parse_binding_entry(entry)
        if not binding_id or binding_id in seen:
            continue
        seen.add(binding_id)
        name = name or ""
        if not visible and not name:
            continue
        ordered.append(
            f"{binding_id}|{'true' if visible else 'false'}|{name}"
        )

    config = load_workflow_fields_config()
    workflow_fields = config.get("workflow_fields")
    if not isinstance(workflow_fields, dict):
        workflow_fields = {}
        config["workflow_fields"] = workflow_fields
    workflow_fields[workflow_name] = ordered

    tmp_path = WORKFLOW_FIELDS_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, WORKFLOW_FIELDS_PATH)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    _WORKFLOW_FIELDS = workflow_fields
