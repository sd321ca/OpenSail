"""Per-workflow Markdown notes.

Notes live in each owner's ``workflow_notes.json``, which maps a workflow
filename to a Markdown string shown in the Generate view. They let a workflow
document its own tips without editing the workflow file itself.
"""

import json
import os

from . import storage


def _notes_path(owner_id: int) -> str:
    return storage.owner_file(owner_id, "workflow_notes.json")


def load_workflow_notes(owner_id: int) -> dict:
    """Return the raw workflow -> Markdown notes mapping for one owner.

    Returns an empty dict when the file is missing, unreadable, or not a JSON
    object.
    """
    path = _notes_path(owner_id)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    return config if isinstance(config, dict) else {}


def get_workflow_notes(owner_id: int, workflow_name: str) -> str:
    """Return the Markdown notes (tips) for a workflow, or ""."""
    if not workflow_name:
        return ""
    notes = load_workflow_notes(owner_id).get(workflow_name, "")
    return notes if isinstance(notes, str) else ""


def save_workflow_notes(owner_id: int, workflow_name: str, notes: str) -> str:
    """Persist a workflow's Markdown notes, returning the cleaned-up text.

    Blank notes delete the workflow's entry, which hides its notes panel. The
    file is re-read before writing so entries added by hand while the app is
    running are preserved, then written atomically.
    """
    if not workflow_name:
        raise ValueError("A workflow name is required to save notes.")

    text = (notes or "").replace("\r\n", "\n").strip()
    config = load_workflow_notes(owner_id)
    if text:
        config[workflow_name] = text
    else:
        config.pop(workflow_name, None)

    storage.write_json_atomic(_notes_path(owner_id), config)
    return text
