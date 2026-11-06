"""Per-workflow Markdown notes.

Notes live in ``configs/workflow_notes.json``, which maps a workflow filename to
a Markdown string shown in the Generate view. They let a workflow document its
own tips without editing the workflow file itself.
"""

import json
import os

from .config import WORKFLOW_NOTES_PATH


def load_workflow_notes() -> dict:
    """Return the raw workflow -> Markdown notes mapping.

    Returns an empty dict when the file is missing, unreadable, or not a JSON
    object.
    """
    if not os.path.isfile(WORKFLOW_NOTES_PATH):
        return {}
    try:
        with open(WORKFLOW_NOTES_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    return config if isinstance(config, dict) else {}


def get_workflow_notes(workflow_name: str) -> str:
    """Return the Markdown notes (tips) for a workflow, or ""."""
    if not workflow_name:
        return ""
    notes = load_workflow_notes().get(workflow_name, "")
    return notes if isinstance(notes, str) else ""


def save_workflow_notes(workflow_name: str, notes: str) -> str:
    """Persist a workflow's Markdown notes, returning the cleaned-up text.

    Blank notes delete the workflow's entry, which hides its notes panel. The
    file is re-read before writing so entries added by hand while the app is
    running are preserved, then written atomically.
    """
    if not workflow_name:
        raise ValueError("A workflow name is required to save notes.")

    text = (notes or "").replace("\r\n", "\n").strip()
    config = load_workflow_notes()
    if text:
        config[workflow_name] = text
    else:
        config.pop(workflow_name, None)

    tmp_path = WORKFLOW_NOTES_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, WORKFLOW_NOTES_PATH)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    return text
