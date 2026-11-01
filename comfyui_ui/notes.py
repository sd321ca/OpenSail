"""Per-workflow Markdown notes and the popup editor behind them.

Notes live in ``configs/workflow_notes.json``, which maps a workflow filename to
a Markdown string shown in the Generate tab's **Workflow notes** panel. They let
a workflow document its own tips without editing the workflow file itself.

The module also builds the notes editor in the **Choose inputs…** popup and
holds the callbacks behind it, so all notes logic stays out of ``ui.py``.
"""

import json
import os

import gradio as gr

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
    """Return the Markdown notes (tips) for a workflow, or "".

    Returns an empty string when the file is missing, unreadable, or has no
    entry for the workflow.
    """
    if not workflow_name:
        return ""
    notes = load_workflow_notes().get(workflow_name, "")
    return notes if isinstance(notes, str) else ""


def save_workflow_notes(workflow_name: str, notes: str) -> None:
    """Persist a workflow's Markdown notes, removing the entry when blank.

    Blank notes delete the workflow's entry, which hides its notes panel in the
    Generate tab. The file is re-read before writing so entries added by hand
    while the app is running are preserved, then written atomically.
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


# ---------------------------------------------------------------------------
# Gradio controls
# ---------------------------------------------------------------------------


def _notes_status(workflow_name: str, notes: str | None = None) -> str:
    """Describe whether a workflow has saved notes.

    ``notes`` lets callers pass the already-loaded text; otherwise it is read
    from ``configs/workflow_notes.json``.
    """
    if not workflow_name:
        return "Select a workflow to edit its notes."
    if notes is None:
        notes = get_workflow_notes(workflow_name)
    if notes:
        return (
            f"`{workflow_name}` — notes are shown in the **Workflow notes** "
            "panel. Edit the Markdown above and press **Save notes** to "
            "update them."
        )
    return (
        f"`{workflow_name}` — no notes yet. Add Markdown above and press "
        "**Save notes** to show them on the Generate tab."
    )


def update_workflow_notes(workflow_name: str):
    """Show the selected workflow's notes panel when it has notes.

    Returns updates for the notes accordion, its Markdown, and the popup's
    notes editor and status.
    """
    notes = get_workflow_notes(workflow_name)
    return (
        gr.update(visible=bool(notes)),
        gr.update(value=notes),
        gr.update(value=notes),
        _notes_status(workflow_name, notes),
    )


def mark_notes_unsaved(workflow_name: str, notes: str):
    """Status update while the popup's notes editor has unsaved changes."""
    if not workflow_name:
        return "Select a workflow to edit its notes."
    saved = get_workflow_notes(workflow_name)
    if (notes or "").replace("\r\n", "\n").strip() == saved:
        return _notes_status(workflow_name, saved)
    return (
        f"`{workflow_name}` — unsaved notes. Press **Save notes** to keep "
        "them."
    )


def save_notes_from_picker(workflow_name: str, notes: str):
    """Save the notes edited in the input picker.

    An empty textbox removes the workflow's entry and hides its notes panel.
    Returns the picker's notes status, the cleaned-up editor value, and
    updates for the Generate tab's notes panel.
    """
    if not workflow_name:
        raise gr.Error("Select a workflow first.")
    try:
        save_workflow_notes(workflow_name, notes)
    except OSError as exc:
        raise gr.Error(f"Could not save the workflow notes: {exc}") from exc

    saved = get_workflow_notes(workflow_name)
    if saved:
        status = (
            f"Saved notes for `{workflow_name}` in "
            "`configs/workflow_notes.json`."
        )
    else:
        status = f"Cleared notes for `{workflow_name}`."
    return (
        status,
        gr.update(value=saved),
        gr.update(visible=bool(saved)),
        gr.update(value=saved),
    )


def reset_notes_editor(workflow_name: str):
    """Return updates that restore the popup editor to the saved notes.

    Used by the popup's **Close** button, which discards unsaved notes edits.
    """
    notes = get_workflow_notes(workflow_name)
    return gr.update(value=notes), _notes_status(workflow_name, notes)


def build_notes_editor(
    demo,
    workflow_dropdown,
    notes_panel,
    notes_markdown,
):
    """Build the notes editor shown in the **Choose inputs…** popup.

    ``demo`` is the Blocks instance, wired so notes load on page load as well
    as when the workflow changes. ``notes_panel`` and ``notes_markdown`` are
    the Generate tab's notes accordion and Markdown, which are refreshed when
    notes are saved. Returns the editor and status components so the popup's
    Close button can reset them. Must be called inside the active Gradio
    Blocks context.
    """
    workflow_name = workflow_dropdown.value
    with gr.Accordion("Workflow notes (Markdown)", open=False):
        gr.Markdown(
            "Shown in the **Workflow notes** panel on the Generate tab. "
            "Leave blank and save to remove this workflow's notes."
        )
        notes_editor = gr.Textbox(
            value=get_workflow_notes(workflow_name),
            show_label=False,
            lines=8,
            max_lines=18,
            placeholder="### Tips\n\n- Add workflow-specific tips here.",
        )
        notes_status = gr.Markdown(_notes_status(workflow_name))
        save_notes_btn = gr.Button("Save notes", size="sm")

    # The picker and the Generate tab's panel follow the workflow selection.
    notes_outputs = [
        notes_panel,
        notes_markdown,
        notes_editor,
        notes_status,
    ]
    workflow_dropdown.change(
        fn=update_workflow_notes,
        inputs=[workflow_dropdown],
        outputs=notes_outputs,
    )
    demo.load(
        fn=update_workflow_notes,
        inputs=[workflow_dropdown],
        outputs=notes_outputs,
    )

    save_notes_btn.click(
        fn=save_notes_from_picker,
        inputs=[workflow_dropdown, notes_editor],
        outputs=[
            notes_status,
            notes_editor,
            notes_panel,
            notes_markdown,
        ],
    )

    # Show unsaved notes edits in the picker status.
    notes_editor.input(
        fn=mark_notes_unsaved,
        inputs=[workflow_dropdown, notes_editor],
        outputs=[notes_status],
    )

    return notes_editor, notes_status
