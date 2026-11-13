# Project Rules

## Declarative field registry

Applies to: `comfyui_ui/**/*.py`, `web/src/**/*.ts`, `configs/fields.json`, `configs/workflow_fields.json`.

The Generate page's input controls are defined declaratively in `configs/fields.json` and loaded via `comfyui_ui/fields.py`. To add or change an input, edit `configs/fields.json` (add a `fields` entry) rather than hard-coding a control in `web/src/pages/generate.ts`. Node candidates, widget selection and current values are driven by each field's optional `match` spec (or key-based fallback) via `comfyui_ui/workflows.py` (`list_node_candidates`, `get_selected_bindings`, `build_workflow_from_bindings`). Which node inputs each workflow shows is saved per workflow in `configs/workflow_fields.json` as `node_id|input_key|visible|display_name` entries, where `visible` is `true` or `false`. The Generate page updates it through `comfyui_ui/fields.py` (`get_saved_fields`, `save_workflow_fields`) and the API in `comfyui_ui/server.py`.

## Frontend build

Applies to: `web/**`, `tailwind.config.js`, `package.json`, `vite.config.mts`, `tsconfig.json`.

The dashboard client is TypeScript built with Vite. Sources live in `web/src/` (`app.ts` is the shell, `pages/*.ts` the page renderers, `api.ts`/`ui.ts`/`audio.ts` the shared helpers, `types.ts` the payload interfaces). Vite bundles them to the committed `web/assets/app.js`, which `web/index.html` loads from its stable `/assets/app.js` URL; `comfyui_ui/server.py` serves that directory unchanged, so the build output—not the sources—is what the browser runs.

Two commands, both of which must run after a client change:

- `npm run typecheck` — `tsc --noEmit`; the project is `strict`.
- `npm run build:js` — Vite build (or `npm run watch:js` while iterating). `npm run build` runs the JS build and `npm run build:css`.

`npm run dev` runs the Vite dev server on :5173 with HMR, proxying `/api`, `/free`, `/history` and `/favicon.ico` to the FastAPI app on :7860; run `python app.py` alongside it. A dev-only plugin rewrites the `index.html` script tag to `/src/app.ts`, so `web/index.html` keeps pointing at the built bundle.

Tailwind scans `web/index.html`, `web/assets/pages/*.html` and `web/src/**/*.ts` (see `tailwind.config.js`) and writes the committed `web/assets/styles.css` (`npm run build:css`). Both generated artefacts—`web/assets/app.js` and `web/assets/styles.css`—are committed so a normal install needs only Python; `node_modules/` is not committed, and source maps are git-ignored because `npm run build:js` regenerates them.

The palette is driven by CSS variables in `web/assets/input.css`: `:root` holds the dark theme and `html.light` the light theme. Prefer the `ink-*` / `slate-*` utilities so both themes follow automatically; add explicit `html.light` overrides when introducing a fixed colour or white-alpha surface. For repeated surfaces and separators use the semantic `bg-raised`, `border-subtle`, and `border-strong` utilities; their dark/light values live in `--surface-raised` and `--line-*`, so contrast changes happen in one place.

## Machine-specific config files

Applies to: `configs/*.json`, `configs/*.example.json`, `comfyui_ui/config.py`.

`configs/chat_models.json`, `audio_models.json`, `samplers.json`, `schedulers.json`, `constants.json`, `fields.json`, `workflow_fields.json`, `workflow_notes.json`, `workflow_presets.json` and `chat_personas.json` are git-ignored because they hold machine-specific values. Where a `.example.json` twin exists, that twin is the committed source of truth: change the example file when you change the defaults, because edits to the ignored copy never reach the repo. `samplers.json`, `schedulers.json`, `constants.json` and `fields.json` are copied from their examples on first run when missing (`_create_from_example` in `comfyui_ui/config.py`) and are never overwritten; the other files are optional, and a missing one is treated as empty.
