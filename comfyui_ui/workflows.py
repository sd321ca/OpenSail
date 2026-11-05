"""Workflow loading, node candidate discovery and value binding.

ComfyUI workflows are stored as JSON files in the ``workflows`` folder. Node
IDs are resolved dynamically by ``class_type`` so the same UI works with any
workflow that uses the standard ComfyUI nodes. Workflows are classified as
image or audio so the UI can show the appropriate controls and output.
"""

import json
import os

from .config import (
    AUDIO_LATENT_NODE_TYPES,
    AUDIO_OUTPUT_NODE_TYPES,
    KIND_AUDIO,
    KIND_IMAGE,
    KIND_VIDEO,
    LOAD_AUDIO_NODE_TYPES,
    LOAD_IMAGE_NODE_TYPES,
    LOAD_VIDEO_NODE_TYPES,
    MUSIC_NODE_TYPES,
    SHOW_UNMATCHED_NODE_INPUTS,
    UPLOAD_INPUT_KEYS,
    VIDEO_OUTPUT_NODE_TYPES,
    WORKFLOWS_DIR,
)
from .fields import get_fields, get_saved_fields, split_binding_entry


def list_workflows() -> list:
    """Return the sorted list of workflow filenames in the workflows folder."""
    if not os.path.isdir(WORKFLOWS_DIR):
        return []
    return sorted(
        name
        for name in os.listdir(WORKFLOWS_DIR)
        if name.lower().endswith(".json")
        and os.path.isfile(os.path.join(WORKFLOWS_DIR, name))
    )


def load_workflow(workflow_name: str) -> dict:
    """Load a ComfyUI API workflow from the workflows folder by filename."""
    path = os.path.join(WORKFLOWS_DIR, workflow_name)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def find_node(workflow: dict, class_types: tuple) -> str | None:
    """Return the ID of the first node whose class_type is in class_types."""
    for node_id, node in workflow.items():
        if node.get("class_type") in class_types:
            return node_id
    return None


def find_nodes(workflow: dict, class_types: tuple) -> list:
    """Return the IDs of all nodes whose class_type is in class_types."""
    return [
        node_id
        for node_id, node in workflow.items()
        if node.get("class_type") in class_types
    ]


def get_workflow_kind(workflow_name: str) -> str:
    """Return KIND_VIDEO, KIND_AUDIO or KIND_IMAGE for a workflow.

    A workflow is treated as video when it has a video output node (e.g.
    SaveVideo), as audio when it has an audio output node (e.g.
    SaveAudioAdvanced) or an audio latent node; otherwise it is an image
    workflow.
    """
    if not workflow_name:
        return KIND_IMAGE
    workflow = load_workflow(workflow_name)
    if find_node(workflow, VIDEO_OUTPUT_NODE_TYPES) is not None:
        return KIND_VIDEO
    if find_node(workflow, AUDIO_OUTPUT_NODE_TYPES) is not None:
        return KIND_AUDIO
    if find_node(workflow, AUDIO_LATENT_NODE_TYPES) is not None:
        return KIND_AUDIO
    return KIND_IMAGE


def list_load_image_nodes(workflow_name: str) -> list:
    """Return a list of (node_id, label) for LoadImage nodes in a workflow.

    The label is derived from the node's _meta title (falling back to the node
    ID) so the UI can show a meaningful name for each image input.
    """
    if not workflow_name:
        return []
    workflow = load_workflow(workflow_name)
    nodes = []
    for node_id in find_nodes(workflow, LOAD_IMAGE_NODE_TYPES):
        title = workflow[node_id].get("_meta", {}).get("title") or f"Image {node_id}"
        nodes.append((node_id, title))
    return nodes


def list_load_audio_nodes(workflow_name: str) -> list:
    """Return a list of (node_id, label) for LoadAudio nodes in a workflow.

    Used by music-cover workflows, which take a reference song as input. The
    label is derived from the node's _meta title (falling back to the node ID).
    """
    if not workflow_name:
        return []
    workflow = load_workflow(workflow_name)
    nodes = []
    for node_id in find_nodes(workflow, LOAD_AUDIO_NODE_TYPES):
        title = workflow[node_id].get("_meta", {}).get("title") or f"Audio {node_id}"
        nodes.append((node_id, title))
    return nodes


def list_load_video_nodes(workflow_name: str) -> list:
    """Return a list of (node_id, label) for LoadVideo nodes in a workflow.

    Used by workflows that take an existing video as input (for example
    Extract Last Frame, or the video upscaler). The label is derived from the
    node's _meta title (falling back to the node ID).
    """
    if not workflow_name:
        return []
    workflow = load_workflow(workflow_name)
    nodes = []
    for node_id in find_nodes(workflow, LOAD_VIDEO_NODE_TYPES):
        title = workflow[node_id].get("_meta", {}).get("title") or f"Video {node_id}"
        nodes.append((node_id, title))
    return nodes


# ---------------------------------------------------------------------------
# Node candidate discovery
# ---------------------------------------------------------------------------


def _widget_accepts_value(widget: str, value) -> bool:
    """Return True when a field widget can edit this literal value type."""
    if widget == "textbox":
        return isinstance(value, str)
    if widget in ("slider", "number"):
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if widget == "checkbox":
        return isinstance(value, bool)
    if widget == "dropdown":
        return isinstance(value, (str, int, float)) and not isinstance(
            value, bool
        )
    return False


def _generic_field(input_key: str, value):
    """Return a fallback field definition for an unmatched node input."""
    if isinstance(value, str):
        widget = "textbox"
    elif isinstance(value, bool):
        widget = "checkbox"
    elif isinstance(value, (int, float)):
        widget = "number"
    else:
        return None
    return {
        "key": f"generic:{input_key}",
        "widget": widget,
        "options": {},
    }


def _candidate_field(node: dict, input_key: str, value):
    """Return the field definition that best describes a node input.

    Fields can provide a ``match`` spec to constrain node types and input key
    aliases. Without one, a field matches an input whose key is the same as the
    field key. Inputs with no matching field are offered with a generic widget
    only when ``show_unmatched_node_inputs`` is enabled.
    """
    class_type = node.get("class_type")
    best_field = None
    best_score = -1

    for field in get_fields():
        if not _widget_accepts_value(field.get("widget", ""), value):
            continue

        match = field.get("match")
        if not match:
            score = 10 if input_key == field["key"] else None
        else:
            input_keys = tuple(match.get("input_keys") or ("value",))
            node_types = tuple(match.get("node_types") or ())
            linked_node_types = tuple(match.get("linked_node_types") or ())
            music_key = match.get("music_key")

            score = None
            if (
                music_key
                and input_key == music_key
                and class_type in MUSIC_NODE_TYPES
            ):
                score = 60
            elif class_type in linked_node_types and input_key in input_keys:
                score = 40
            elif class_type in node_types and input_key in input_keys:
                score = 30

        if score is not None and score > best_score:
            best_score = score
            best_field = field

    if best_field is not None:
        return best_field
    if SHOW_UNMATCHED_NODE_INPUTS:
        return _generic_field(input_key, value)
    return None


def list_node_candidates(workflow_name: str) -> list:
    """Return every editable node input in a workflow.

    A candidate is any node input with a literal value that one of the field
    widgets can edit. A candidate ID is ``node_id|input_key``. The field registry
    decides which widget definition a candidate uses.
    """
    if not workflow_name:
        return []

    workflow = load_workflow(workflow_name)
    candidates = []
    for node_id, node in workflow.items():
        class_type = node.get("class_type", "")
        # Inputs backed by a dedicated upload control (image / audio / video)
        # are set when the prompt is queued, so they are not offered here.
        upload_key = UPLOAD_INPUT_KEYS.get(class_type)
        for input_key, value in node.get("inputs", {}).items():
            # Links are not literal values; editing them would break the
            # workflow's node graph.
            if isinstance(value, list) or input_key == upload_key:
                continue
            field = _candidate_field(node, input_key, value)
            if field is None:
                continue
            title = node.get("_meta", {}).get("title") or node.get(
                "class_type", ""
            )
            candidates.append(
                {
                    "id": f"{node_id}|{input_key}",
                    "node": node_id,
                    "input": input_key,
                    "class_type": class_type,
                    "title": title,
                    "field": field["key"],
                    "field_def": field,
                    "label": f"{node_id} · {title} · {input_key}",
                    "value": value,
                }
            )
    return candidates


def get_selected_bindings(workflow_name: str) -> list:
    """Return the selected ``node_id|input_key`` bindings for a workflow.

    Entries can be plain binding-ID strings or objects with an optional
    ``name`` display label. Stale bindings are ignored. A workflow without a
    saved entry selects every editable node input it contains.
    """
    if not workflow_name:
        return []

    candidates = list_node_candidates(workflow_name)
    saved = get_saved_fields(workflow_name)
    if saved is None:
        return [candidate["id"] for candidate in candidates]

    available = {candidate["id"] for candidate in candidates}
    selected = []
    for entry in saved:
        binding_id, _name = split_binding_entry(entry)
        if binding_id in available:
            selected.append(binding_id)
    return list(dict.fromkeys(selected))


def get_display_names(workflow_name: str) -> dict:
    """Return the saved display names for a workflow's selected bindings."""
    if not workflow_name:
        return {}

    names = {}
    for entry in get_saved_fields(workflow_name) or []:
        binding_id, name = split_binding_entry(entry)
        if binding_id and isinstance(name, str) and name.strip():
            names[binding_id] = name.strip()
    return names


def build_workflow_from_bindings(
    workflow_name: str,
    binding_values: dict,
    image_filenames: dict | None = None,
    audio_filenames: dict | None = None,
    video_filenames: dict | None = None,
) -> dict:
    """Return a workflow with node-binding values injected.

    ``binding_values`` maps ``node_id|input_key`` IDs to values. Stale
    bindings are ignored. LoadImage / LoadAudio / LoadVideo uploads are applied
    as usual.
    """
    workflow = load_workflow(workflow_name)

    for binding_id, value in (binding_values or {}).items():
        node_id, separator, input_key = binding_id.partition("|")
        if not separator:
            continue
        node = workflow.get(node_id)
        if node is None:
            continue
        inputs = node.get("inputs", {})
        if input_key in inputs:
            inputs[input_key] = value

    if image_filenames:
        for node_id, filename in image_filenames.items():
            if node_id in workflow and filename:
                workflow[node_id]["inputs"]["image"] = filename

    if audio_filenames:
        for node_id, filename in audio_filenames.items():
            if node_id in workflow and filename:
                workflow[node_id]["inputs"]["audio"] = filename

    if video_filenames:
        for node_id, filename in video_filenames.items():
            if node_id in workflow and filename:
                workflow[node_id]["inputs"]["file"] = filename

    return workflow
