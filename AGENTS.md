# Project Rules

## Declarative field registry

Applies to: `comfyui_ui/**/*.py`, `web/assets/**/*.js`, `configs/fields.json`, `configs/workflow_fields.json`.

The Generate page's input controls are defined declaratively in `configs/fields.json` and loaded via `comfyui_ui/fields.py`. To add or change an input, edit `configs/fields.json` (add a `fields` entry) rather than hard-coding a control in `web/assets/pages/generate.js`. Node candidates, widget selection and current values are driven by each field's optional `match` spec (or key-based fallback) via `comfyui_ui/workflows.py` (`list_node_candidates`, `get_selected_bindings`, `build_workflow_from_bindings`). Which node inputs each workflow shows is saved per workflow in `configs/workflow_fields.json` as `node_id|input_key|visible|display_name` entries, where `visible` is `true` or `false`. The Generate page updates it through `comfyui_ui/fields.py` (`get_saved_fields`, `save_workflow_fields`) and the API in `comfyui_ui/server.py`.

## Frontend build

Applies to: `web/**`, `tailwind.config.js`, `package.json`.

The dashboard is a static single-page app in `web/` using Tailwind CSS. UI changes go in `web/assets/pages/*.js`; shared helpers are in `web/assets/ui.js` and API/SSE plumbing in `web/assets/api.js`. After changing classes or markup, rebuild the committed stylesheet with `npm run build:css` (Tailwind scans `web/**/*.{html,js}`). The generated `web/assets/styles.css` is committed; `node_modules/` is not.

The palette is driven by CSS variables in `web/assets/input.css`: `:root` holds the dark theme and `html.light` the light theme. Prefer the `ink-*` / `slate-*` utilities so both themes follow automatically; add explicit `html.light` overrides when introducing a fixed colour or white-alpha surface. For repeated surfaces and separators use the semantic `bg-raised`, `border-subtle`, and `border-strong` utilities; their dark/light values live in `--surface-raised` and `--line-*`, so contrast changes happen in one place.

## Machine-specific config files

Applies to: `configs/*.json`, `configs/*.example.json`, `comfyui_ui/config.py`.

`configs/chat_models.json`, `audio_models.json`, `samplers.json`, `schedulers.json`, `constants.json`, `fields.json`, `workflow_fields.json`, `workflow_notes.json`, `workflow_presets.json` and `chat_personas.json` are git-ignored because they hold machine-specific values. Where a `.example.json` twin exists, that twin is the committed source of truth: change the example file when you change the defaults, because edits to the ignored copy never reach the repo. `samplers.json`, `schedulers.json`, `constants.json` and `fields.json` are copied from their examples on first run when missing (`_create_from_example` in `comfyui_ui/config.py`) and are never overwritten; the other files are optional, and a missing one is treated as empty.
