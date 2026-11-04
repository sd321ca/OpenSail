# Project Rules

## Declarative field registry

Applies to: `comfyui_ui/**/*.py`, `configs/fields.json`, `configs/workflow_fields.json`.

The Generate tab's input controls are defined declaratively in `configs/fields.json` and loaded via `comfyui_ui/fields.py`. To add or change an input, edit `configs/fields.json` (add a `fields` entry) rather than hard-coding Gradio components in `comfyui_ui/ui.py`. Node candidates, widget selection and current values are driven by each field's optional `match` spec (or key-based fallback) via `comfyui_ui/workflows.py` (`list_node_candidates`, `get_selected_bindings`, `build_workflow_from_bindings`). Which node inputs each workflow shows is saved per workflow in `configs/workflow_fields.json` as `node_id|input_key` bindings, optionally with a display name; the Generate tab updates it through `comfyui_ui/fields.py` (`get_saved_fields`, `save_workflow_fields`) and `comfyui_ui/workflows.py` (`list_node_candidates`, `get_selected_bindings`, `build_workflow_from_bindings`).

## Machine-specific config files

Applies to: `configs/*.json`, `configs/*.example.json`, `comfyui_ui/config.py`.

`configs/chat_models.json`, `audio_models.json`, `samplers.json`, `schedulers.json`, `constants.json`, `fields.json`, `workflow_fields.json`, `workflow_notes.json` and `workflow_presets.json` are git-ignored because they hold machine-specific values. Where a `.example.json` twin exists, that twin is the committed source of truth: change the example file when you change the defaults, because edits to the ignored copy never reach the repo. `samplers.json`, `schedulers.json`, `constants.json` and `fields.json` are copied from their examples on first run when missing (`_create_from_example` in `comfyui_ui/config.py`) and are never overwritten; the other files are optional, and a missing one is treated as empty.
