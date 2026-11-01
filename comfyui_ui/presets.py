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

The module also builds the Generate tab's preset controls
(``build_preset_panel``) and the callbacks behind them, keeping all preset
logic out of ``ui.py``.
"""

import json
import math
import os
import uuid

import gradio as gr

from .config import WORKFLOW_PRESETS_PATH
from .fields import resolve_choices
from .workflows import list_node_candidates


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

    Gradio widgets can return NumPy scalar values, which ``json`` cannot
    write. Values that cannot be represented (and cleared inputs, which are
    ``None``) are skipped instead of breaking the save.
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
# Gradio controls
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


def _preset_status(workflow_name: str, message: str = "") -> str:
    """Return the status line shown under the preset controls."""
    names = get_preset_names(workflow_name)
    if not names:
        return (
            "No presets saved for this workflow yet. Set the inputs, type a "
            "name and press **Save preset**."
        )
    default = get_default_preset(workflow_name)
    default_note = f" Default: **{default}**." if default else ""
    if message:
        return message + default_note
    return f"**{len(names)}** preset(s) saved.{default_note}"


def _candidates_for_state(state: dict) -> list:
    """Return the candidate definitions for the bindings in a render state."""
    workflow_name = (state or {}).get("workflow")
    binding_ids = (state or {}).get("bindings", [])
    if not workflow_name:
        return []
    available = {
        candidate["id"]: candidate
        for candidate in list_node_candidates(workflow_name)
    }
    return [
        available[binding_id]
        for binding_id in binding_ids
        if binding_id in available
    ]


def load_input_preset(
    workflow_name: str,
    preset_name: str,
    state: dict,
    current_values: dict,
):
    """Return an updated render state, values and status for a loaded preset.

    Loading re-renders the controls with the preset values, so the preset panel
    can live outside the dynamic control area. Values the preset does not
    mention keep their current value rather than resetting to the workflow
    default.
    """
    if not preset_name:
        raise gr.Error("Select a preset to load.")
    values = get_preset(workflow_name, preset_name)
    if values is None:
        raise gr.Error(f"Preset **{preset_name}** no longer exists.")

    merged = dict(current_values or {})
    applied = 0
    for candidate in _candidates_for_state(state):
        value = _preset_control_value(candidate, values.get(candidate["id"]))
        if value is _PRESET_UNSET:
            continue
        merged[candidate["id"]] = value
        applied += 1

    new_state = {
        **(state or {}),
        "workflow": workflow_name,
        "defaults": merged,
        # Force a re-render even when the values are unchanged, so pressing
        # Load also resets controls the user has edited since the last load.
        "nonce": uuid.uuid4().hex,
    }
    status = _preset_status(
        workflow_name,
        f"Loaded preset **{preset_name}** ({applied} value(s)).",
    )
    return new_state, merged, status


def save_input_preset(
    workflow_name: str,
    preset_name: str,
    selected_preset: str | None,
    values: dict,
):
    """Save the current control values as a preset.

    The name box takes priority; when it is blank, the selected preset is
    overwritten. Returns the dropdown update and the status line.
    """
    if not workflow_name:
        raise gr.Error("Select a workflow first.")
    name = (preset_name or "").strip() or (selected_preset or "").strip()
    if not name:
        raise gr.Error(
            "Type a preset name, or select an existing preset to overwrite."
        )
    if not values:
        raise gr.Error("There are no inputs to save for this workflow.")

    try:
        save_preset(workflow_name, name, values)
    except (OSError, ValueError) as exc:
        raise gr.Error(f"Could not save the preset: {exc}") from exc

    return (
        gr.update(choices=_preset_choices(workflow_name), value=name),
        _preset_status(workflow_name, f"Saved preset **{name}**."),
    )


def set_default_input_preset(workflow_name: str, preset_name: str):
    """Make the selected preset load automatically for this workflow."""
    if not preset_name:
        raise gr.Error("Select a preset to make the default.")
    try:
        set_default_preset(workflow_name, preset_name)
    except (OSError, ValueError) as exc:
        raise gr.Error(f"Could not set the default preset: {exc}") from exc

    return (
        gr.update(choices=_preset_choices(workflow_name), value=preset_name),
        _preset_status(
            workflow_name,
            f"**{preset_name}** will load when this workflow is selected.",
        ),
    )


def delete_input_preset(workflow_name: str, preset_name: str):
    """Delete the selected preset and refresh the dropdown."""
    if not preset_name:
        raise gr.Error("Select a preset to delete.")
    try:
        removed = delete_preset(workflow_name, preset_name)
    except OSError as exc:
        raise gr.Error(f"Could not delete the preset: {exc}") from exc
    if not removed:
        raise gr.Error(f"Preset **{preset_name}** no longer exists.")

    names = get_preset_names(workflow_name)
    return (
        gr.update(
            choices=_preset_choices(workflow_name),
            value=names[0] if names else None,
        ),
        _preset_status(workflow_name, f"Deleted preset **{preset_name}**."),
    )


def refresh_preset_panel(workflow_name: str):
    """Return dropdown and status updates for a newly selected workflow."""
    return (
        gr.update(
            choices=_preset_choices(workflow_name),
            value=get_default_preset(workflow_name),
        ),
        _preset_status(workflow_name),
    )


def build_preset_panel(workflow_dropdown, render_state, values_state) -> None:
    """Build the **Input presets** accordion and wire its buttons.

    ``workflow_dropdown`` is the Generate tab's workflow selector.
    ``render_state`` and ``values_state`` drive the dynamic controls: loading a
    preset updates both so the controls re-render with the preset values. Must
    be called inside the active Gradio Blocks context.
    """
    workflow_name = workflow_dropdown.value
    with gr.Accordion("Input presets", open=False):
        gr.Markdown(
            "Save the current values under a name to reuse them later (for "
            "example **Low quality** / **High quality**). Leave the name box "
            "blank to overwrite the selected preset. **Set default** loads a "
            "preset automatically whenever this workflow is selected."
        )
        with gr.Row():
            preset_dropdown = gr.Dropdown(
                choices=_preset_choices(workflow_name),
                value=get_default_preset(workflow_name),
                label="Preset",
                scale=3,
                interactive=True,
                filterable=False,
                allow_custom_value=False,
            )
            load_preset_btn = gr.Button("Load", size="sm", scale=1)
        with gr.Row():
            preset_name = gr.Textbox(
                label="New preset name",
                placeholder="e.g. High quality",
                scale=3,
            )
            save_preset_btn = gr.Button("Save preset", size="sm", scale=1)
            default_preset_btn = gr.Button("Set default", size="sm", scale=1)
            delete_preset_btn = gr.Button("Delete", size="sm", scale=1)
        preset_status = gr.Markdown(_preset_status(workflow_name))

    # The panel is outside the dynamic control area, so it has to refresh its
    # own choices and status when the workflow changes.
    workflow_dropdown.change(
        fn=refresh_preset_panel,
        inputs=[workflow_dropdown],
        outputs=[preset_dropdown, preset_status],
    )

    load_preset_btn.click(
        fn=load_input_preset,
        inputs=[
            workflow_dropdown,
            preset_dropdown,
            render_state,
            values_state,
        ],
        outputs=[render_state, values_state, preset_status],
    )

    save_preset_btn.click(
        fn=save_input_preset,
        inputs=[workflow_dropdown, preset_name, preset_dropdown, values_state],
        outputs=[preset_dropdown, preset_status],
    )

    default_preset_btn.click(
        fn=set_default_input_preset,
        inputs=[workflow_dropdown, preset_dropdown],
        outputs=[preset_dropdown, preset_status],
    )

    delete_preset_btn.click(
        fn=delete_input_preset,
        inputs=[workflow_dropdown, preset_dropdown],
        outputs=[preset_dropdown, preset_status],
    )
