# Project Rules

## Declarative field registry

Applies to: `comfyui_ui/**/*.py`, `web/src/**/*.ts`, `configs/fields.json`.

The Generate page's input controls are defined declaratively in `configs/fields.json` and loaded via `comfyui_ui/fields.py`. To add or change an input, edit `configs/fields.json` (add a `fields` entry) rather than hard-coding a control in `web/src/pages/generate.ts`. Node candidates, widget selection and current values are driven by each field's optional `match` spec (or key-based fallback) via `comfyui_ui/workflows.py` (`list_node_candidates`, `get_selected_bindings`, `build_workflow_from_bindings`). Which node inputs each workflow shows is saved per workflow in the owner's `workflow_fields.json` (under `data/users/<id>/`, not `configs/`) as `node_id|input_key|visible|display_name` entries, where `visible` is `true` or `false`. The Generate page updates it through `comfyui_ui/fields.py` (`get_saved_fields`, `save_workflow_fields`) and the API in `comfyui_ui/server.py`.

## Frontend build

Applies to: `web/**`, `tailwind.config.js`, `package.json`, `vite.config.mts`, `tsconfig.json`.

The dashboard client is TypeScript built with Vite. Sources live in `web/src/` (`app.ts` is the shell, `pages/*.ts` the page renderers, `api.ts`/`ui.ts`/`audio.ts` the shared helpers, `types.ts` the payload interfaces). Vite bundles them to `web/assets/app.js`, which `web/index.html` loads from its stable `/assets/app.js` URL; `comfyui_ui/server.py` serves that directory unchanged, so the build output—not the sources—is what the browser runs. The build output is generated locally and git-ignored, so run `npm install` once and then build before starting the app.

Two commands, both of which must run after a client change:

- `npm run typecheck` — `tsc --noEmit`; the project is `strict`.
- `npm run build:js` — Vite build (or `npm run watch:js` while iterating). `npm run build` runs the JS build and `npm run build:css`.

`npm run dev` runs the Vite dev server on :5173 with HMR, proxying `/api`, `/free`, `/history` and `/favicon.ico` to the FastAPI app on :7860; run `python app.py` alongside it. A dev-only plugin rewrites the `index.html` script tag to `/src/app.ts`, so `web/index.html` keeps pointing at the built bundle.

Tailwind scans `web/index.html`, `web/assets/pages/*.html` and `web/src/**/*.ts` (see `tailwind.config.js`) and writes `web/assets/styles.css` (`npm run build:css`). Both generated artefacts—`web/assets/app.js` and `web/assets/styles.css`—are git-ignored so client changes produce small diffs; `node_modules/` is not committed, and source maps are git-ignored because `npm run build:js` regenerates them.

The palette is driven by CSS variables in `web/assets/input.css`: `:root` holds the dark theme and `html.light` the light theme. Prefer the `ink-*` / `slate-*` utilities so both themes follow automatically; add explicit `html.light` overrides when introducing a fixed colour or white-alpha surface. For repeated surfaces and separators use the semantic `bg-raised`, `border-subtle`, and `border-strong` utilities; their dark/light values live in `--surface-raised` and `--line-*`, so contrast changes happen in one place.

## Machine-specific config files

Applies to: `configs/*.json`, `configs/*.example.json`, `comfyui_ui/config.py`, `comfyui_ui/storage.py`.

`configs/chat_models.json`, `audio_models.json`, `samplers.json`, `schedulers.json`, `constants.json` and `fields.json` are git-ignored because they hold machine-specific values. Where a `.example.json` twin exists, that twin is the committed source of truth: change the example file when you change the defaults, because edits to the ignored copy never reach the repo. `samplers.json`, `schedulers.json`, `constants.json` and `fields.json` are copied from their examples on first run when missing (`_create_from_example` in `comfyui_ui/config.py`) and are never overwritten; `chat_models.json` and `audio_models.json` are optional, and a missing one is treated as empty.

The four workspace files - `workflow_fields.json`, `workflow_presets.json`, `workflow_notes.json` and `chat_personas.json` - are not shared configuration. They are per-owner files written by the app under `data/users/<id>/` (see _Editions and per-user storage_), created on the first save from the UI and treated as empty when missing.

## Editions and per-user storage

Applies to: `comfyui_ui/**`, `opensail_premium/**`.

Two editions ship from one repository. Everything outside `opensail_premium/` is MIT; that package is proprietary and source-available. `comfyui_ui` must never import `opensail_premium` directly - `comfyui_ui/edition.py` imports it by name at start-up whenever the package is importable, and premium registers capabilities, an auth provider and routes through the hooks dict. Without a valid licence it registers only the licence routes and leaves every capability off, so an unlicensed install behaves as the community edition.

`comfyui_ui/config.py` separates `BASE_DIR` (code) from `DATA_ROOT` (`$OPENSAIL_HOME`, else the source checkout, else the current directory). Per-user data lives under `data/users/<id>/` and is resolved through `comfyui_ui/storage.py` (`owner_file`, `owner_dir`); do not build per-user paths by hand. Workspace files (presets, field selection, notes, personas) and generated media are per-owner; shared configuration (`fields.json` definitions, samplers, schedulers, models) stays in `configs/`.

Generation runs through `comfyui_ui/jobs.py`, which serialises work on the single GPU and records each job's owner and ComfyUI `prompt_id` in `data/opensail.db`. Gallery listings, file routes and delete/move actions must go through the ownership helpers in `comfyui_ui/server.py` (`_visible_prompt_ids`, `_owns_media`, `_owned_prompt_ids`) rather than trusting client-supplied ids. Global destructive actions (`POST /history`, `/api/comfy/media/clear`) are administrator-only.

Distribution is source-only: both editions run from the same checkout, with no build step that splits them. Premium is unlocked by a licence, not by a separate artefact - the package loads whenever it is present and a LemonSqueezy key is activated through the licence routes, with the resulting state stored in `data/opensail.db`.
