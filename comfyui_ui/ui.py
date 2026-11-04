"""Gradio UI: the Generate and Gallery tabs and their callbacks.

The Generate tab's input controls are not hard-coded here. They are described
declaratively in ``configs/fields.json`` (see ``comfyui_ui.fields``) and the
UI is built from that registry, so adding a new input is a config change
rather than a code change.
"""

import os
import random
import uuid
from functools import partial

import gradio as gr
import requests
from fastapi import Response

from .audio import AudioModel, build_audio_tab
from .chat import ChatModel, build_chat_tab
from .comfy_client import ComfyUIClient
from .config import (
    COMFY_URL,
    DEFAULT_WORKFLOW,
    KIND_AUDIO,
    KIND_VIDEO,
    MAX_IMAGE_INPUTS,
)
from .fields import (
    get_saved_fields,
    resolve_choices,
    save_workflow_fields,
)
from .gallery import (
    IMAGE_PROXY_ROUTE,
    gallery_picker_items,
    generated_image_html,
    refresh_audio_gallery,
    refresh_gallery_html,
    refresh_video_gallery,
)
from .notes import build_notes_editor, reset_notes_editor
from .presets import (
    build_preset_panel,
    candidate_with_preset_value,
    get_default_preset_values,
)
from .workflows import (
    build_workflow_from_bindings,
    get_display_names,
    get_selected_bindings,
    get_workflow_kind,
    list_load_audio_nodes,
    list_load_image_nodes,
    list_node_candidates,
    list_workflows,
)

# Class given to textareas whose field sets "fullscreen": true. The script that
# promotes them to a full-screen editor on phones is in fullscreen.js (see
# comfyui_ui.assets.FULLSCREEN_TEXT_JS): there is no web API for the OS's native
# full-screen text editor, so the focused textarea is pinned to the visual
# viewport (above the soft keyboard) with a Done button to dismiss it. Desktop
# widths keep the normal inline textarea.
FULLSCREEN_TEXT_CLASS = "fullscreen-text"

# Class given to every slider. Its number box stays visible as a readout but
# cannot be typed into (slider.js + mobile.css): the value is set by dragging.
READONLY_SLIDER_CLASS = "slider-readonly"


# ---------------------------------------------------------------------------
# Widget construction
# ---------------------------------------------------------------------------
# Maps a field's "widget" name to a factory that builds the Gradio component
# from the field's options. Adding a new widget type is a one-line addition
# here; adding a new *field* of an existing type needs no code at all.


def _widget_kwargs(field: dict) -> dict:
    """Return the Gradio kwargs for a field, from its options block."""
    options = dict(field.get("options", {}))
    # These are registry-only keys, not Gradio kwargs.
    for key in ("choices_source", "fullscreen"):
        options.pop(key, None)
    return options


def _with_class(options: dict, name: str) -> dict:
    """Append ``name`` to an options dict's ``elem_classes``, in place."""
    classes = options.get("elem_classes") or []
    if isinstance(classes, str):
        classes = [classes]
    options["elem_classes"] = [*classes, name]
    return options


def _build_candidate_widget(candidate: dict):
    """Create the control for one node/input candidate.

    The field registry supplies the widget kind and options; the candidate
    supplies the node-specific label and current workflow value.
    """
    field = candidate["field_def"]
    widget = field["widget"]
    label = candidate["label"]
    value = candidate["value"]
    options = _widget_kwargs(field)

    if widget == "textbox":
        if field.get("options", {}).get("fullscreen"):
            # Tag the textbox so the launched script (fullscreen.js) can
            # promote it to a full-screen editor on phones when it gains focus.
            _with_class(options, FULLSCREEN_TEXT_CLASS)
        return gr.Textbox(
            label=label, value=value, interactive=True, **options
        )

    if widget == "slider":
        minimum = options.pop("minimum", 0)
        maximum = options.pop("maximum", 1)
        # The number box beside the slider is only a readout (slider.js makes
        # it read-only), so the value can only be changed by dragging.
        _with_class(options, READONLY_SLIDER_CLASS)
        return gr.Slider(
            minimum,
            maximum,
            label=label,
            value=value,
            interactive=True,
            **options,
        )

    if widget == "dropdown":
        choices = list(resolve_choices(field))
        if value not in choices:
            choices.append(value)
        return gr.Dropdown(
            choices, value=value, label=label, interactive=True, **options
        )

    if widget == "number":
        return gr.Number(
            label=label, value=value, interactive=True, **options
        )

    if widget == "checkbox":
        return gr.Checkbox(
            label=label, value=value, interactive=True, **options
        )

    raise ValueError(f"Unknown widget type: {widget!r}")


# ---------------------------------------------------------------------------
# Generate callback
# ---------------------------------------------------------------------------


def _image_from_input(value):
    """Return the PIL image held by a Generate-tab image input.

    Image inputs use ``gr.ImageEditor`` so the user can either upload a file
    or draw a sketch. Its value is a dict with ``background``, ``layers`` and
    ``composite`` entries; ``composite`` is the background with any drawn
    layers flattened on top, which is what should be sent to ComfyUI. A value
    that is already a plain image (or None) is passed through unchanged.
    """
    if isinstance(value, dict):
        return value.get("composite") or value.get("background")
    return value


def generate(
    client: ComfyUIClient,
    workflow_name: str,
    binding_values: dict,
    randomize_seed: bool,
    reference_audio: str | None,
    cancel_flag: dict | None = None,
    progress: gr.Progress = gr.Progress(),
    *image_inputs,
):
    """Gradio callback: run the workflow and stream progress, then the output.

    ``binding_values`` maps ``node_id|input_key`` bindings to the values the
    user entered. The values are written straight into those node inputs, so
    the callback does not need to know about individual controls.

    ``image_inputs`` are the images for the workflow's LoadImage nodes, in the
    same order as ``list_load_image_nodes(workflow_name)``. Each may be either
    an uploaded image or a sketch drawn in the built-in editor.
    ``reference_audio`` is the uploaded reference song for music-cover
    workflows (LoadAudio nodes).

    This is a generator so the UI can show a live progress bar. It yields the
    current ``(image_html, audio, video)`` outputs on each update (initially
    empty), and the final yield carries the generated result.

    ``cancel_flag`` is a shared mutable dict (a ``gr.State``) that the Stop
    button sets to ``{"cancel": True}``. It is checked between progress
    updates; when set, the running prompt is interrupted on ComfyUI and the
    callback returns early.
    """
    if not workflow_name:
        raise gr.Error("Please select a workflow.")

    # Reset the shared cancel flag for this run.
    if cancel_flag is not None:
        cancel_flag["cancel"] = False

    def _cancelled() -> bool:
        return bool(cancel_flag and cancel_flag.get("cancel"))

    kind = get_workflow_kind(workflow_name)

    # Randomize every selected seed input to the same new value.
    if randomize_seed:
        seed = random.randint(0, 2**32 - 1)
        binding_values = {
            binding_id: (
                seed
                if binding_id.partition("|")[2] in ("seed", "noise_seed")
                else value
            )
            for binding_id, value in binding_values.items()
        }

    # Clear the previous result while the new one is being generated.
    yield "", None, None

    try:
        # Upload any provided images and map them to their LoadImage nodes.
        # Each input may be an uploaded image or a sketch drawn in the editor.
        progress(0.0, desc="Uploading inputs...")
        image_filenames = {}
        load_nodes = list_load_image_nodes(workflow_name)
        for (node_id, _label), image_input in zip(load_nodes, image_inputs):
            image = _image_from_input(image_input)
            if image is not None:
                image_filenames[node_id] = client.upload_image(
                    image, prefix=f"node_{node_id}"
                )

        # Upload the reference song for music-cover workflows (LoadAudio).
        audio_filenames = {}
        audio_nodes = list_load_audio_nodes(workflow_name)
        if audio_nodes and reference_audio:
            audio_filenames[audio_nodes[0][0]] = client.upload_audio(
                reference_audio, prefix=f"node_{audio_nodes[0][0]}"
            )

        workflow = build_workflow_from_bindings(
            workflow_name=workflow_name,
            binding_values=binding_values,
            image_filenames=image_filenames,
            audio_filenames=audio_filenames,
        )

        client_id = str(uuid.uuid4())
        prompt_id = client.queue_prompt(workflow, client_id)

        # Stream step progress from ComfyUI's WebSocket. The progress bar is
        # driven by the sampler's step count; other nodes show an
        # indeterminate "running" state.
        progress(0.0, desc="Queued...")
        for value, maximum, node in client.stream_progress(
            prompt_id, client_id
        ):
            if _cancelled():
                client.cancel_prompt(prompt_id)
                yield "", None, None
                return
            if value is not None and maximum:
                progress(
                    value / maximum,
                    desc=f"Sampling step {value}/{maximum}",
                )
            elif node is not None:
                progress(0.0, desc=f"Running node {node}...")

        # The prompt may have been cancelled while the stream was winding
        # down; don't fetch a result in that case.
        if _cancelled():
            client.cancel_prompt(prompt_id)
            yield "", None, None
            return

        # Fetch the finished output. Only one of the three output components
        # is used per workflow kind; the others are cleared by returning None.
        progress(1.0, desc="Fetching result...")
        image_html = ""
        audio_output = None
        video_output = None
        if kind == KIND_AUDIO:
            audio_ref = client.wait_for_audio(prompt_id, client_id)
            audio_output = client.fetch_audio(audio_ref)
        elif kind == KIND_VIDEO:
            video_ref = client.wait_for_video(prompt_id, client_id)
            video_output = client.fetch_video(video_ref)
        else:
            image_ref = client.wait_for_image(prompt_id, client_id)
            # Render the image as a link to the full-size proxy URL so a click
            # opens it in a new tab, matching the gallery behaviour.
            image_html = generated_image_html(image_ref)
    except requests.exceptions.ConnectionError:
        raise gr.Error(
            f"Could not connect to ComfyUI at {COMFY_URL}. "
            "Make sure ComfyUI is running and the URL is correct."
        )
    except Exception as exc:  # noqa: BLE001
        raise gr.Error(f"Generation failed: {exc}")

    yield image_html, audio_output, video_output


def request_cancel(cancel_flag: dict | None) -> dict:
    """Gradio callback for the Stop button: signal the running generation.

    Sets the shared cancel flag so the ``generate`` generator interrupts the
    prompt on its next progress update. Returns the flag so it can be written
    back to the ``gr.State``.
    """
    if cancel_flag is None:
        cancel_flag = {}
    cancel_flag["cancel"] = True
    return cancel_flag


def _generating_buttons():
    """Button updates for the start of a generation.

    Disables Generate (so a second run can't be queued) and enables Stop.
    """
    return gr.update(interactive=False), gr.update(interactive=True)


def _idle_buttons():
    """Button updates for when no generation is running.

    Enables Generate and disables Stop.
    """
    return gr.update(interactive=True), gr.update(interactive=False)


# ---------------------------------------------------------------------------
# Workflow-driven control updates
# ---------------------------------------------------------------------------


def _truthy(value) -> bool:
    """Interpret a Dataframe checkbox value from Gradio."""
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "y", "on")
    return bool(value)


def _order_value(value):
    """Parse the Order column into a float.

    Blank cells (and the NaN that Gradio produces for empty numeric cells)
    return ``None`` so they sort after every explicit position.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        # NaN is the only value that is not equal to itself.
        return None if value != value else float(value)
    text = str(value).strip()
    if not text or text.lower() in ("nan", "none"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _table_rows(table_value) -> list:
    """Return ``(show, label, display_name, order)`` rows from the picker."""
    if table_value is None:
        return []
    if hasattr(table_value, "values"):
        table_value = table_value.values.tolist()
    rows = []
    for row in table_value:
        if not isinstance(row, (list, tuple)) or len(row) < 3:
            continue
        name = ""
        if len(row) > 3 and row[3] is not None:
            name = str(row[3]).strip()
        rows.append((_truthy(row[0]), str(row[2]), name, _order_value(row[1])))
    return rows


def _picker_rows(workflow_name: str, selected_ids, names: dict) -> list:
    """Build the table rows shown in the node picker popup.

    Selected inputs are listed first, in their saved order, and carry a
    1-based position in the Order column so the order can be edited. The
    remaining candidates keep the workflow's node order with a blank Order;
    ticking a blank one appends it after the inputs that have a position.
    """
    positions = {}
    for index, binding_id in enumerate(selected_ids or [], start=1):
        positions.setdefault(binding_id, index)

    rows = []
    for candidate in list_node_candidates(workflow_name):
        position = positions.get(candidate["id"])
        rows.append(
            [
                position is not None,
                position if position is not None else "",
                candidate["label"],
                names.get(candidate["id"], ""),
            ]
        )

    # Stable sort: selected rows in saved order, unselected rows unchanged.
    rows.sort(key=lambda row: (not row[0], row[1] if row[0] else 0))
    return rows


def _selected_candidate_ids(workflow_name: str, selected_ids) -> list:
    """Return selected binding IDs that still exist, keeping their order."""
    available = {c["id"] for c in list_node_candidates(workflow_name)}
    ordered = []
    seen = set()
    for binding_id in selected_ids or []:
        if binding_id in available and binding_id not in seen:
            seen.add(binding_id)
            ordered.append(binding_id)
    return ordered


def _selection_summary(workflow_name: str, selected_ids=None) -> str:
    """Return a compact summary of the selected node inputs."""
    if not workflow_name:
        return ""
    candidates = list_node_candidates(workflow_name)
    if selected_ids is None:
        selected_ids = get_selected_bindings(workflow_name)
    count = len(_selected_candidate_ids(workflow_name, selected_ids))
    return f"Showing **{count}** of **{len(candidates)}** node input(s)."


def _selection_status(workflow_name: str, selected_ids=None) -> str:
    """Describe whether the workflow has a saved node selection."""
    if not workflow_name:
        return "Select a workflow to choose which node inputs it shows."
    candidates = list_node_candidates(workflow_name)
    if selected_ids is None:
        selected_ids = get_selected_bindings(workflow_name)
    count = len(_selected_candidate_ids(workflow_name, selected_ids))
    if get_saved_fields(workflow_name) is None:
        return (
            f"`{workflow_name}` — showing all {len(candidates)} node input(s). "
            "Choose a subset and press **Save input selection** to store it "
            "for this workflow."
        )
    return (
        f"`{workflow_name}` — showing {count} of {len(candidates)} node "
        "input(s)."
    )


def _set_binding_value(values, value, binding_id):
    """Return a binding-value map with one control's value updated."""
    updated = dict(values or {})
    updated[binding_id] = value
    return updated


def _binding_values(workflow_name: str, binding_ids, overrides=None) -> dict:
    """Return control values for a workflow's selected node bindings.

    ``overrides`` maps binding IDs to preset values, which take priority over
    the workflow's stored values.
    """
    if not workflow_name:
        return {}
    available = {
        candidate["id"]: candidate
        for candidate in list_node_candidates(workflow_name)
    }
    values = {}
    for binding_id in binding_ids or []:
        candidate = available.get(binding_id)
        if candidate is None:
            continue
        display = candidate_with_preset_value(candidate, overrides or {})
        if display.get("value") is not None:
            values[binding_id] = display["value"]
    return values


def update_workflow_fields(workflow_name: str):
    """Refresh the node picker when the selected workflow changes.

    Returns the table update (all node candidates with saved names), the popup
    status, the compact summary, the render state that drives the dynamic
    controls, and the initial values for those controls.
    """
    selected = get_selected_bindings(workflow_name)
    names = get_display_names(workflow_name)
    default_values = get_default_preset_values(workflow_name)
    return (
        gr.update(value=_picker_rows(workflow_name, selected, names)),
        _selection_status(workflow_name, selected),
        _selection_summary(workflow_name, selected),
        {
            "workflow": workflow_name,
            "bindings": selected,
            "names": names,
            # Applied once when the workflow is selected, so the workflow's
            # default preset pre-fills the controls without overriding values
            # the user has since edited.
            "defaults": default_values,
        },
        _binding_values(workflow_name, selected, default_values),
    )


def save_field_selection(workflow_name: str, table_value):
    """Persist the selected node bindings, display names and their order.

    Rows are stored in Order-column order; rows left blank keep their table
    position and are appended after the explicitly ordered ones.
    """
    if not workflow_name:
        raise gr.Error("Select a workflow first.")

    candidates = list_node_candidates(workflow_name)
    by_label = {candidate["label"]: candidate["id"] for candidate in candidates}

    ordered = []
    for position, (show, label, name, order) in enumerate(
        _table_rows(table_value)
    ):
        binding_id = by_label.get(label)
        if binding_id is None or not show:
            continue
        ordered.append(
            (
                float("inf") if order is None else order,
                position,
                binding_id,
                name,
            )
        )
    ordered.sort(key=lambda row: (row[0], row[1]))

    entries = []
    binding_ids = []
    names = {}
    for _order, _position, binding_id, name in ordered:
        binding_ids.append(binding_id)
        if name:
            names[binding_id] = name
            entries.append(f"{binding_id}|{name}")
        else:
            entries.append(binding_id)

    try:
        save_workflow_fields(workflow_name, entries)
    except OSError as exc:
        raise gr.Error(f"Could not save the input selection: {exc}") from exc

    return (
        f"Saved **{len(binding_ids)}** node input(s) for this workflow in "
        "`configs/workflow_fields.json`.",
        _selection_summary(workflow_name, binding_ids),
        {
            "workflow": workflow_name,
            "bindings": binding_ids,
            "names": names,
            # Keep the values the user already has when re-rendering after a
            # selection change; don't re-apply the default preset.
            "defaults": {},
        },
        _binding_values(workflow_name, binding_ids),
        gr.update(value=_picker_rows(workflow_name, binding_ids, names)),
    )


def mark_selection_unsaved(workflow_name: str, selection):
    """Status update while the picker has unsaved changes."""
    return (
        f"`{workflow_name}` — unsaved selection. Press **Save input selection** "
        "to apply it."
    )


def close_field_picker(workflow_name: str, render_state):
    """Close the popup and discard unsaved changes.

    This reverts unsaved node-selection edits and restores the workflow's saved
    notes to the picker editor.
    """
    applied = (render_state or {}).get("bindings", [])
    names = (render_state or {}).get("names", {})
    selected = _selected_candidate_ids(workflow_name, applied)
    notes_update, notes_status_update = reset_notes_editor(workflow_name)
    return (
        gr.update(value=_picker_rows(workflow_name, selected, names)),
        _selection_status(workflow_name, selected),
        _selection_summary(workflow_name, selected),
        gr.update(visible=False),
        notes_update,
        notes_status_update,
    )


def update_workflow_layout(
    image_slots,
    workflow_name: str,
):
    """Show/hide the image/audio inputs and the correct output component.

    Visibility is applied to wrapper Columns rather than to the ImageEditor /
    Audio components themselves: layout containers update reliably, while an
    ImageEditor visibility update can leave the editor visible and raise a
    frontend state error.
    """
    kind = get_workflow_kind(workflow_name)
    is_audio = kind == KIND_AUDIO
    is_video = kind == KIND_VIDEO

    updates = []

    image_nodes = list_load_image_nodes(workflow_name)
    audio_nodes = list_load_audio_nodes(workflow_name)

    has_images = bool(image_nodes)
    updates.append(gr.update(visible=has_images))
    updates.append(gr.update(visible=has_images))
    for i in range(len(image_slots)):
        if i < len(image_nodes):
            _node_id, label = image_nodes[i]
            updates.append(gr.update(visible=True))
            updates.append(gr.update(value=f"**{label}**"))
        else:
            updates.append(gr.update(visible=False))
            updates.append(gr.update(value=""))

    has_audio = bool(audio_nodes)
    updates.append(gr.update(visible=has_audio))
    updates.append(gr.update(visible=has_audio))

    updates.append(gr.update(visible=not is_audio and not is_video))
    updates.append(gr.update(visible=is_audio))
    updates.append(gr.update(visible=is_video))
    return updates


def _layout_outputs(
    image_slots,
    image_labels,
    image_group,
    image_heading,
    audio_group,
    audio_heading,
    outputs,
):
    """Return components updated by ``update_workflow_layout``, in order."""
    ordered = [image_group, image_heading]
    for i in range(len(image_slots)):
        ordered.extend([image_slots[i], image_labels[i]])
    ordered.extend([audio_group, audio_heading])
    ordered.append(outputs["image"])
    ordered.append(outputs["audio"])
    ordered.append(outputs["video"])
    return ordered


# ---------------------------------------------------------------------------
# Load-from-Gallery picker
# ---------------------------------------------------------------------------


def open_gallery_picker(client, slot_index):
    """Open the gallery picker for one image input slot.

    Returns the slot the click belongs to, the gallery's ``(path, caption)``
    items (stored in a State so a thumbnail's "Use this image" button can map
    its index back to a file), the hint shown above the thumbnails, and the
    update that opens the popup.
    """
    items = gallery_picker_items(client)
    if items:
        hint = (
            "Press **Use this image** under a thumbnail to use it as the "
            "input for this slot."
        )
    else:
        hint = (
            "No images found in the gallery yet. Generate an image first, or "
            "upload one in the image editor."
        )
    return (
        slot_index,
        items,
        hint,
        gr.update(visible=True),
    )


def load_gallery_image(index, slot_index, items, slot_count: int):
    """Load one gallery image into its image input slot.

    Returns one update per image input (unchanged for the other slots) and the
    update that closes the picker. ``items`` are the picker's ``(path,
    caption)`` tuples; ``index`` is the thumbnail whose path is set as the
    editor's value, so it becomes that slot's input image.
    """
    updates = [gr.update() for _ in range(slot_count)]
    if (
        isinstance(index, int)
        and 0 <= index < len(items or [])
        and isinstance(slot_index, int)
        and 0 <= slot_index < slot_count
    ):
        updates[slot_index] = gr.update(value=items[index][0])
    return (*updates, gr.update(visible=False))


def render_node_controls(
    state,
    client,
    workflow_name,
    image_inputs,
    audio_inputs,
    cancel_flag,
    outputs,
    input_values_state,
):
    """Render one control per selected node binding.

    This runs inside a ``gr.render`` block, so it rebuilds the control area
    whenever the workflow or the applied binding selection changes. Values
    from the workflow's default preset (``state["defaults"]``) pre-fill the
    controls. Each control also feeds its value into ``input_values_state`` so
    the preset panel above the controls can save the current values.
    """
    current_workflow = (state or {}).get("workflow")
    binding_ids = (state or {}).get("bindings", [])
    display_names = (state or {}).get("names", {})
    default_values = (state or {}).get("defaults") or {}
    if not current_workflow:
        gr.Markdown("Select a workflow to configure it.")
        return

    available = {
        candidate["id"]: candidate
        for candidate in list_node_candidates(current_workflow)
    }
    selected = [
        available[binding_id]
        for binding_id in binding_ids
        if binding_id in available
    ]
    if not selected:
        gr.Markdown(
            "No node inputs selected. Use **Choose inputs…** to add controls."
        )

    controls = []
    control_ids = []
    for candidate in selected:
        display = candidate
        custom_name = display_names.get(candidate["id"])
        if custom_name:
            display = {**candidate, "label": custom_name}
        display = candidate_with_preset_value(display, default_values)
        control = _build_candidate_widget(display)
        # Keep the shared value map in sync so "Save preset" can read it even
        # though the panel lives outside this render block.
        control.change(
            fn=partial(_set_binding_value, binding_id=candidate["id"]),
            inputs=[input_values_state, control],
            outputs=[input_values_state],
        )
        controls.append(control)
        control_ids.append(candidate["id"])

    has_seed = any(
        candidate["input"] in ("seed", "noise_seed")
        for candidate in selected
    )
    randomize_seed = gr.Checkbox(
        label="Randomize seed",
        value=True,
        visible=has_seed,
        interactive=True,
    )

    with gr.Row():
        generate_btn = gr.Button("Generate", variant="primary")
        # Stop starts disabled; it is enabled while a generation is running.
        stop_btn = gr.Button("Stop", variant="stop", interactive=False)

    values_state = gr.State({})

    def _collect(*raw_values):
        return dict(zip(control_ids, raw_values))

    generate_step = (
        generate_btn.click(
            fn=_generating_buttons,
            inputs=None,
            outputs=[generate_btn, stop_btn],
        )
        .then(
            fn=_collect,
            inputs=controls,
            outputs=[values_state],
        )
        .then(
            fn=partial(generate, client),
            inputs=[
                workflow_name,
                values_state,
                randomize_seed,
                audio_inputs[0],
                cancel_flag,
                *image_inputs,
            ],
            outputs=[
                outputs["image"],
                outputs["audio"],
                outputs["video"],
            ],
        )
    )

    # Restore the idle button state once the run ends, including on errors.
    generate_step.then(
        fn=_idle_buttons,
        inputs=None,
        outputs=[generate_btn, stop_btn],
    )
    generate_step.failure(
        fn=_idle_buttons,
        inputs=None,
        outputs=[generate_btn, stop_btn],
    )

    # Stop only signals the shared cancel flag.
    stop_btn.click(
        fn=request_cancel,
        inputs=[cancel_flag],
        outputs=[cancel_flag],
    ).then(
        fn=lambda: gr.update(interactive=False),
        inputs=None,
        outputs=[stop_btn],
    )


# ---------------------------------------------------------------------------
# UI construction
# ---------------------------------------------------------------------------


def build_ui(client: ComfyUIClient | None = None) -> gr.Blocks:
    """Construct and return the Gradio Blocks UI."""
    client = client or ComfyUIClient()

    workflows = list_workflows()

    # Display workflow names without the ".json" extension while keeping the
    # actual filename as the dropdown value, so downstream code is unaffected.
    workflow_choices = [
        (os.path.splitext(name)[0], name) for name in workflows
    ]

    selected_workflow = (
        DEFAULT_WORKFLOW
        if DEFAULT_WORKFLOW in workflows
        else (workflows[0] if workflows else None)
    )
    initial_bindings = get_selected_bindings(selected_workflow)
    initial_names = get_display_names(selected_workflow)
    initial_defaults = get_default_preset_values(selected_workflow)
    initial_values = _binding_values(
        selected_workflow, initial_bindings, initial_defaults
    )
    initial_rows = _picker_rows(
        selected_workflow, initial_bindings, initial_names
    )

    # The chat model is created once and shared by the Chat tab. It is loaded
    # lazily on the first message and can be unloaded from the tab to free
    # memory before running a ComfyUI workflow.
    chat_model = ChatModel()

    # audio.cpp server manager, shared by the "TextToSpeech" tab. Like the
    # chat model it is started lazily and can be stopped to free memory.
    audio_model = AudioModel()

    with gr.Blocks(title="ComfyUI Workflow UI", fill_width=True) as demo:

        with gr.Tabs(overflow_behavior="wrap"):
            with gr.Tab("Chat"):
                build_chat_tab(chat_model, audio_model)

            with gr.Tab("Generate"):
                with gr.Row(elem_classes="generate-row"):
                    with gr.Column(scale=1):
                        with gr.Row():
                            workflow_name = gr.Dropdown(
                                choices=workflow_choices,
                                value=selected_workflow,
                                label="Workflow",
                                scale=4,
                            )
                            choose_fields_btn = gr.Button(
                                "Choose inputs…", size="sm", scale=1
                            )

                        # State that drives the dynamic node controls below.
                        # The preset panel is built here so it sits directly
                        # under the workflow dropdown, outside the render
                        # block.
                        render_state = gr.State(
                            {
                                "workflow": selected_workflow,
                                "bindings": initial_bindings,
                                "names": initial_names,
                                "defaults": initial_defaults,
                            }
                        )
                        input_values_state = gr.State(initial_values)

                        build_preset_panel(
                            workflow_name, render_state, input_values_state
                        )

                        fields_summary = gr.Markdown(
                            _selection_summary(
                                selected_workflow, initial_bindings
                            )
                        )

                        # Per-workflow tips, configured in
                        # configs/workflow_notes.json. Hidden for workflows
                        # without an entry.
                        with gr.Accordion(
                            "Workflow notes", open=True, visible=False
                        ) as notes_panel:
                            workflow_notes = gr.Markdown()

                        # Input images: one slot per LoadImage node in the
                        # selected workflow (built once up to the maximum,
                        # then shown/hidden when the workflow changes). Each
                        # slot is an image editor, so the user can either upload
                        # a file or draw a sketch to use as the input image.
                        # The slots are Columns: their visibility updates are
                        # reliable, while updating an ImageEditor's own
                        # visibility can leave it visible and raise a frontend
                        # state error.
                        with gr.Column(visible=False) as image_group:
                            image_heading = gr.Markdown(
                                "### Input images "
                                "(upload, draw a sketch, or load from the "
                                "gallery)",
                                visible=False,
                            )
                            image_inputs = []
                            image_slots = []
                            image_labels = []
                            gallery_buttons = []
                            for i in range(MAX_IMAGE_INPUTS):
                                with gr.Column(visible=False) as slot:
                                    with gr.Row():
                                        slot_label = gr.Markdown(scale=4)
                                        # Pick an existing gallery image as
                                        # this slot's input (an alternative to
                                        # uploading or drawing one).
                                        gallery_btn = gr.Button(
                                            "Load from Gallery",
                                            size="sm",
                                            scale=0,
                                        )
                                    img = gr.ImageEditor(
                                        label=f"Image {i + 1}",
                                        show_label=False,
                                        type="pil",
                                        canvas_size=(1024, 1024),
                                    )
                                image_slots.append(slot)
                                image_labels.append(slot_label)
                                image_inputs.append(img)
                                gallery_buttons.append(gallery_btn)

                        # Reference audio for music-cover workflows (the
                        # workflow's LoadAudio node).
                        with gr.Column(visible=False) as audio_group:
                            audio_heading = gr.Markdown(
                                "### Reference audio", visible=False
                            )
                            audio_inputs = [
                                gr.Audio(
                                    label="Reference song",
                                    type="filepath",
                                )
                            ]

                        # Shared flag the Stop button sets and the generate
                        # callback polls to abort a running generation.
                        cancel_flag = gr.State({"cancel": False})

                        @gr.render(inputs=[render_state])
                        def render_controls(state):
                            render_node_controls(
                                state,
                                client,
                                workflow_name,
                                image_inputs,
                                audio_inputs,
                                cancel_flag,
                                outputs,
                                input_values_state,
                            )

                    with gr.Column(scale=1):
                        # The image result is rendered as HTML (not gr.Image)
                        # so clicking it opens the full image in a new tab,
                        # matching the gallery.
                        output_image_html = gr.HTML(
                            value='<p class="gallery-empty">No image yet.</p>',
                            elem_classes="result-image",
                        )
                        output_audio = gr.Audio(
                            label="Result", type="filepath", visible=False
                        )
                        output_video = gr.Video(
                            label="Result", visible=False
                        )

                # Popup field picker. Keeping it out of the main layout leaves
                # the Generate tab compact; the overlay is hidden until the
                # "Choose inputs…" button is pressed.
                with gr.Column(
                    visible=False, elem_classes=["field-picker-overlay"]
                ) as fields_modal:
                    with gr.Group(elem_classes=["field-picker-dialog"]):
                        gr.Markdown("### Node inputs shown for this workflow")
                        gr.Markdown(
                            "Tick **Show** for the controls to display, "
                            "optionally enter a **Display name**, and use "
                            "**Order** to set where each control appears "
                            "(lower numbers first; blank rows keep their "
                            "table position and go last). Selected inputs are "
                            "listed first. Press **Save** to keep the "
                            "selection; **Close** discards unsaved changes. "
                            "Expand **Workflow notes** at the bottom to edit "
                            "this workflow's tips."
                        )
                        field_selection = gr.Dataframe(
                            headers=[
                                "Show",
                                "Order",
                                "Node input",
                                "Display name",
                            ],
                            datatype=["bool", "number", "str", "str"],
                            type="array",
                            value=initial_rows,
                            column_count=(4, "fixed"),
                            static_columns=[2],
                            column_widths=[80, 80, 540, 200],
                            max_height=560,
                            wrap=True,
                            interactive=True,
                            show_label=False,
                        )
                        fields_status = gr.Markdown(
                            _selection_status(
                                selected_workflow, initial_bindings
                            )
                        )
                        notes_editor, notes_status = build_notes_editor(
                            demo,
                            workflow_name,
                            notes_panel,
                            workflow_notes,
                        )
                        with gr.Row():
                            save_fields_btn = gr.Button(
                                "Save input selection", variant="primary"
                            )
                            close_fields_btn = gr.Button("Close")

                # Popup gallery picker for the "Load from Gallery" buttons
                # beside the image inputs. The thumbnails come from ComfyUI's
                # history; pressing "Use this image" loads that image into the
                # slot which opened the popup. Kept out of the main layout like
                # the field picker. gallery_target is the slot index of the slot
                # that opened it and gallery_items the thumbnails it shows.
                gallery_target = gr.State(-1)
                gallery_items = gr.State([])
                with gr.Column(
                    visible=False, elem_classes=["gallery-picker-overlay"]
                ) as gallery_modal:
                    # A plain Column (not a Group) carries the dialog class:
                    # Group renders two nested divs, and both would receive the
                    # fixed-position dialog styling.
                    with gr.Column(elem_classes=["gallery-picker-dialog"]):
                        gr.Markdown("### Load from gallery")
                        gallery_picker_status = gr.Markdown()

                        # One thumbnail per gallery image, each with its own
                        # button. (A Gallery's select event is avoided: it
                        # stops the image inputs above from hiding when a
                        # workflow without an image input is selected.)
                        def _gallery_use_handler(index):
                            """Return a click handler that loads thumbnail index."""

                            def use(slot_index, items):
                                return load_gallery_image(
                                    index,
                                    slot_index,
                                    items,
                                    len(image_inputs),
                                )

                            return use

                        @gr.render(inputs=[gallery_items])
                        def render_gallery_picker(items):
                            if not items:
                                return
                            for start in range(0, len(items), 4):
                                with gr.Row():
                                    for offset, (path, caption) in enumerate(
                                        items[start : start + 4]
                                    ):
                                        with gr.Column(min_width=180):
                                            gr.Image(
                                                value=path,
                                                label=caption,
                                                interactive=False,
                                                height=150,
                                            )
                                            use_btn = gr.Button(
                                                "Use this image", size="sm"
                                            )
                                            use_btn.click(
                                                fn=_gallery_use_handler(
                                                    start + offset
                                                ),
                                                inputs=[
                                                    gallery_target,
                                                    gallery_items,
                                                ],
                                                outputs=[
                                                    *image_inputs,
                                                    gallery_modal,
                                                ],
                                            )

                        with gr.Row():
                            close_gallery_btn = gr.Button("Close")

                outputs = {
                    "image": output_image_html,
                    "audio": output_audio,
                    "video": output_video,
                }

                layout_outputs = _layout_outputs(
                    image_slots,
                    image_labels,
                    image_group,
                    image_heading,
                    audio_group,
                    audio_heading,
                    outputs,
                )
                update_layout = partial(
                    update_workflow_layout,
                    image_slots,
                )

                # When the workflow changes, refresh the node picker and the
                # render state; this re-renders the dynamic controls.
                workflow_name.change(
                    fn=update_workflow_fields,
                    inputs=[workflow_name],
                    outputs=[
                        field_selection,
                        fields_status,
                        fields_summary,
                        render_state,
                        input_values_state,
                    ],
                )
                demo.load(
                    fn=update_workflow_fields,
                    inputs=[workflow_name],
                    outputs=[
                        field_selection,
                        fields_status,
                        fields_summary,
                        render_state,
                        input_values_state,
                    ],
                )

                # Show/hide the image/audio inputs and the matching output.
                workflow_name.change(
                    fn=update_layout,
                    inputs=[workflow_name],
                    outputs=layout_outputs,
                )
                demo.load(
                    fn=update_layout,
                    inputs=[workflow_name],
                    outputs=layout_outputs,
                )

                # Open the gallery picker for the image slot whose "Load from
                # Gallery" button was pressed.
                for slot_index, gallery_btn in enumerate(gallery_buttons):
                    gallery_btn.click(
                        fn=partial(open_gallery_picker, client, slot_index),
                        inputs=None,
                        outputs=[
                            gallery_target,
                            gallery_items,
                            gallery_picker_status,
                            gallery_modal,
                        ],
                    )

                close_gallery_btn.click(
                    fn=lambda: gr.update(visible=False),
                    inputs=None,
                    outputs=[gallery_modal],
                )

                # Open the field picker popup.
                choose_fields_btn.click(
                    fn=lambda: gr.update(visible=True),
                    inputs=None,
                    outputs=[fields_modal],
                )

                # Closing the popup discards unsaved changes.
                close_fields_btn.click(
                    fn=close_field_picker,
                    inputs=[workflow_name, render_state],
                    outputs=[
                        field_selection,
                        fields_status,
                        fields_summary,
                        fields_modal,
                        notes_editor,
                        notes_status,
                    ],
                )

                # Show unsaved changes in the popup status.
                field_selection.input(
                    fn=mark_selection_unsaved,
                    inputs=[workflow_name, field_selection],
                    outputs=[fields_status],
                )

                # Persist the selection and re-render the controls.
                save_fields_btn.click(
                    fn=save_field_selection,
                    inputs=[workflow_name, field_selection],
                    outputs=[
                        fields_status,
                        fields_summary,
                        render_state,
                        input_values_state,
                        field_selection,
                    ],
                )

            with gr.Tab("TextToSpeech"):
                build_audio_tab(audio_model)

            with gr.Tab("Images"):
                refresh_btn = gr.Button("Refresh", variant="primary")

                # A custom HTML grid is used instead of gr.Gallery so that
                # clicking a thumbnail opens the full image URL in a new tab
                # (gr.Gallery only opens Gradio's built-in preview).
                gallery = gr.HTML(
                    value='<p class="gallery-empty">Press Refresh to load images.</p>',
                    elem_classes="gallery-grid",
                )

                refresh_btn.click(
                    fn=lambda: refresh_gallery_html(client),
                    inputs=None,
                    outputs=[gallery],
                )

            with gr.Tab("Audio"):
                audio_refresh_btn = gr.Button(
                    "Refresh", variant="primary"
                )

                # Holds the (path, caption) items so the grid can be
                # re-rendered without re-downloading on every interaction.
                audio_items = gr.State([])

                # gr.Gallery cannot display audio (it renders an <img> tag and
                # shows a broken image), so the audio gallery is a grid of
                # gr.Audio players built with gr.render instead.
                @gr.render(inputs=[audio_items])
                def render_audio_gallery(items):
                    if not items:
                        gr.Markdown("No audio found.")
                        return
                    # Lay the players out in rows of three. The columns wrap
                    # automatically on narrow screens (min_width is small
                    # enough to fit a phone).
                    for start in range(0, len(items), 3):
                        with gr.Row():
                            for path, caption in items[start : start + 3]:
                                with gr.Column(min_width=240):
                                    gr.Audio(
                                        value=path,
                                        label=caption,
                                        type="filepath",
                                    )

                audio_refresh_btn.click(
                    fn=lambda: refresh_audio_gallery(client),
                    inputs=None,
                    outputs=[audio_items],
                )

            with gr.Tab("Videos"):
                video_refresh_btn = gr.Button(
                    "Refresh", variant="primary"
                )

                # Holds the (path, caption) items so the grid can be
                # re-rendered without re-downloading on every interaction.
                video_items = gr.State([])

                # Render one video player per item, laid out in rows of three.
                # A small fixed height keeps each tile compact so several fit on
                # screen at once.
                @gr.render(inputs=[video_items])
                def render_video_gallery(items):
                    if not items:
                        gr.Markdown("No videos found.")
                        return
                    columns = 3
                    for start in range(0, len(items), columns):
                        chunk = items[start : start + columns]
                        with gr.Row():
                            for path, caption in chunk:
                                with gr.Column(min_width=200):
                                    gr.Video(
                                        value=path,
                                        label=caption,
                                        height=180,
                                    )
                            # Empty spacers stop a short last row from
                            # stretching its tiles across the full width.
                            for _ in range(columns - len(chunk)):
                                with gr.Column(min_width=200):
                                    pass

                video_refresh_btn.click(
                    fn=lambda: refresh_video_gallery(client),
                    inputs=None,
                    outputs=[video_items],
                )

    # Proxy route: stream ComfyUI images through the Gradio server so the
    # gallery works even when the browser cannot reach ComfyUI directly. This
    # must be registered after the Blocks context exits, because gr.Blocks
    # replaces its FastAPI app instance when the context manager closes.
    @demo.app.get(IMAGE_PROXY_ROUTE)
    def _proxy_comfy_image(
        filename: str, subfolder: str = "", type: str = "output"
    ):
        try:
            content, content_type = client.fetch_image_bytes(
                {
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": type,
                }
            )
        except Exception:  # noqa: BLE001
            return Response(status_code=404)
        return Response(content=content, media_type=content_type)

    return demo
