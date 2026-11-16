# Configuration

OpenSail's configuration is split in two:

- **Shared settings** in `configs/` — server, model and backend settings that
  you edit by hand.
- **Workspace files** in `data/users/<id>/` — the Generate page's input
  selection, saved presets, workflow notes and chat personas. The app writes
  these when you press **Save** in the UI, so you never have to touch them.

Both groups are plain JSON and both are read back by the app, so hand edits work
either way. The difference is who owns the file: shared settings apply to
everyone using the install, while a workspace file is rewritten for the account
that saved it.

See the [README](README.md) for installation, running and the UI itself.

## Shared settings

| File | Purpose |
| --- | --- |
| `constants.json` | Server, ComfyUI, chat and audio.cpp settings |
| `chat_models.json` | Chat page model aliases and GGUF paths |
| `audio_models.json` | Text to Speech page audio.cpp models |
| `fields.json` | Input registry and node-matching hints |
| `samplers.json` | Sampler names for the **Sampler** dropdown |
| `schedulers.json` | Scheduler names for the **Scheduler** dropdown |

Files ending in `.example.json` are the committed defaults. On first run,
`constants.json`, `samplers.json`, `schedulers.json` and `fields.json` are
created by copying their example when missing; `chat_models.json` and
`audio_models.json` are optional, and a missing one is treated as empty. The
live copies are git-ignored because they hold machine-specific values, so edit
the example file when you change a default you want to keep.

### `constants.json`

General settings:

- `comfy_url` — base URL of the ComfyUI server
- `comfy_dir` — portable ComfyUI folder containing `python_embeded` and `ComfyUI` (empty to manage it yourself)
- `comfy_python` — optional Python executable override for non-portable installs
- `comfy_main` — optional `main.py` override for non-portable installs
- `comfy_start_args` — JSON list of arguments appended to `python -s main.py`
- `comfy_start_timeout` — seconds to wait for ComfyUI to answer after Start
- `comfy_stop_on_exit` — stop a managed ComfyUI when OpenSail exits (default true)
- `comfy_show_console` — show ComfyUI in its own console window on Windows (default false)
- `server_name` — interface to bind (`0.0.0.0` exposes the UI on the LAN)
- `server_port` — port to serve on
- `server_ssl_certfile` — path to a TLS certificate (defaults to `configs/certs/cert.pem`)
- `server_ssl_keyfile` — path to the matching TLS private key (defaults to `configs/certs/key.pem`)
- `show_unmatched_node_inputs` - when true, node inputs that match no field definition are offered with a generic textbox / number / checkbox (default false)
- `default_workflow` - workflow filename selected when the UI first loads
- `chat_n_ctx` — context window size in tokens
- `chat_n_gpu_layers` — layers to offload to the GPU via `llama-server -ngl`
  (0 for CPU-only, `99` for all)
- `chat_n_threads` — CPU threads for generation (0 to let llama.cpp decide)
- `chat_chat_format` — `llama-server --chat-template` value (`null` to use the
  template from the GGUF metadata, which is correct for most instruct models)
- `chat_system_prompt` — system prompt prepended to every conversation
- `chat_server_path` — path to the `llama-server` executable used by the Chat
  page
- `chat_server_port` — port the app-managed `llama-server` listens on
  (127.0.0.1)
- `audiocpp_server_path` — path to the `audiocpp_server` executable used by the
  Text to Speech page
- `audiocpp_port` — port the app-managed `audiocpp_server` listens on
  (127.0.0.1)
- `audiocpp_backend` — audio.cpp compute backend: `cuda`, `cpu`, `vulkan` or
  `metal`
- `audiocpp_device` — backend device index (`0` = first GPU)
- `audiocpp_threads` — server thread count
- `audiocpp_models_dir` — root folder that `audio_models.json` entries resolve
  their `folder` against
- `audiocpp_model_specs_dir` — folder holding the audio.cpp `model_specs/*.json`
  files (passed to the server as `--model-spec-override`)
- `audiocpp_cuda_bin` — folder holding the CUDA runtime DLLs (cuFFT/cuBLAS/
  cuDART) the CUDA build links against; left empty, a CUDA toolkit `bin`
  folder is auto-detected and added to the server's `PATH`
- `audiocpp_ffmpeg_path` — `ffmpeg` executable used to convert non-WAV voice
  reference clips to WAV; left empty, `ffmpeg` is looked up on `PATH` (with a
  `soundfile` fallback)
- `audiocpp_voice_dir` — folder holding saved voice-cloning references
  (`<name>.wav` plus a `prompt_text` mapping). Voices saved from the
  Text to Speech page land here and are reusable by name in the Chat page; left
  empty, the project's `voices/` folder is used. (Ignored when
  `audiocpp_config_path` is set — add `voice_dir` to that file yourself.)
- `audiocpp_config_path` — optional explicit `server.json` to run the server
  with; when empty, one is generated from `audio_models.json`
- `audiocpp_idle_unload_ms` — unload resident models after this many idle
  milliseconds (`0` disables)

### `chat_models.json`

Defines the models offered in the Chat page's **Model** dropdown. Each entry
pairs a display **alias** with a GGUF **path** (a `.gguf` file or a folder
containing one). An optional **`mmproj`** points at a multimodal projector so
the model can accept images (llama-server is launched with `--mmproj`):

```json
{
  "models": [
    {
      "alias": "Gemma4 4B",
      "path": "C:/llama_cpp/models/gemma-4-E4B_q4_0-it.gguf",
      "mmproj": "C:/llama_cpp/models/gemma-4-E4B-it-mmproj.gguf"
    }
  ]
}
```

The dropdown shows the alias and uses the path as its value, so the model
never has to be typed in the UI. The first entry is selected by default.

### `audio_models.json`

Defines the models offered in the **Text to Speech** page's **Model** dropdown.
These are [audio.cpp](https://github.com/0xShug0/audio.cpp) models (GGUF
conversions or original checkpoints). Each entry pairs a display **alias** with
an audio.cpp **`id`** and **`family`**, plus a model location given as either a
**`folder`** (resolved against `audiocpp_models_dir`) or an absolute **`path`**:

```json
{
  "models": [
    {
      "alias": "Kokoro 82M",
      "id": "kokoro-tts",
      "family": "kokoro_tts",
      "folder": "Kokoro-82M"
    },
    {
      "alias": "PocketTTS (English)",
      "id": "pocket-tts",
      "family": "pocket_tts",
      "folder": "PocketTTS-GGUF/english",
      "load_options": {
        "language": "english"
      }
    }
  ]
}
```

- `family` must match a file in `model_specs/` (e.g. `kokoro_tts`, `qwen3_tts`,
  `pocket_tts`, `outetts`).
- Optional audio.cpp passthrough keys `load_options`, `session_options`,
  `default_request_options`, `voice_presets` and `default_voice_preset` are
  copied into the generated server config unchanged.
- Entries missing `alias`, `id`, `family` or a resolvable location are skipped.

The dropdown shows the alias and uses the audio.cpp model `id` as its value.
The first entry is selected by default. Every entry whose `task` is `tts` (or
unset) is also offered in the Chat page's **Speak replies with** dropdown, so
adding a model here makes it available for both text-to-speech and spoken chat
replies.

### `fields.json`

The Generate page's input controls are **not hard-coded** in the UI. They are
described declaratively in `fields.json`, and the UI is built from that
registry. Adding a new input is a config change, not a code change.

The file has one top-level key, `fields` (the controls themselves).

**Field entries**

- `key` — the field name used internally to select this widget definition.
- `widget` — one of `textbox`, `slider`, `dropdown`, `number`, `checkbox`.
- `options` — widget-specific kwargs. For `slider`, use `minimum` / `maximum`
  / `step`; the number box beside a slider is a read-only readout, so the value
  is set by dragging the slider. For `dropdown`, use `choices_source` (one of
  `samplers`, `schedulers`, `aspect_ratios`, `music_modes`). For `textbox`, use
  `lines` to set the textarea height.
- `match` — optional. How node inputs map to this widget. If omitted, the
  field matches an input whose key is the same as the field `key`. The block
  supports:
  - `node_types` — node `class_type`s this widget applies to.
  - `input_keys` — the input key(s) this widget can edit.
  - `linked_node_types` — text primitive node types (e.g.
    `PrimitiveStringMultiline`) whose `value` input this widget can edit.
  - `music_key` — an inline input on the music generation node.

UI labels come from the workflow node titles, not from the field registry.

The node picker derives candidates from these specs: every workflow input
with a literal value that one of the widgets can edit is selectable, while
links are skipped. Node type, value type and input keys decide which field
definition supplies the widget and options. Inputs that are supplied by the
dedicated upload controls (`LoadImage.image`, `LoadAudio.audio` and
`LoadVideo.file`) are not listed, because the Generate page sets them from the
uploaded file. Inputs that match no field are hidden unless
`show_unmatched_node_inputs` is enabled in `constants.json`; when enabled they
get a generic textbox / number / checkbox based on their value type.

### `samplers.json`

A JSON array of sampler names shown in the **Sampler** dropdown. These are the
sampler names ComfyUI's `KSampler` node accepts, so the list should match the
samplers available in your ComfyUI install. The file is git-ignored (its
contents are machine-specific); on first run, if `configs/samplers.json` does
not exist, it is created by copying `configs/samplers.example.json`.

### `schedulers.json`

A JSON array of scheduler names shown in the **Scheduler** dropdown, again
matching the schedulers your ComfyUI install supports. Like `samplers.json` it
is git-ignored; on first run, if `configs/schedulers.json` does not exist, it is
created by copying `configs/schedulers.example.json`.

## Workspace files

Per-user state, kept under the data directory (`data/users/1/` by default). The
community edition has a single owner, so that is the only folder; Premium gives
every account its own `data/users/<id>/` directory.

None of these need to be created or edited by hand. The app writes each one the
first time you press **Save** in the matching part of the UI, and a missing file
is treated as empty. They are documented here because they are readable, easy to
back up, and convenient for copying a setup between machines.

| File | Written by |
| --- | --- |
| `workflow_fields.json` | **Choose inputs…** → **Save input selection** |
| `workflow_presets.json` | **Input presets** → **Save preset** / **Set default** |
| `workflow_notes.json` | **Choose inputs…** → **Workflow notes** → **Save notes** |
| `chat_personas.json` | **Chat settings** → **Persona** → **Save** / **Delete** |

Saving from the UI rewrites the entries for the workflow or persona you changed
and leaves everything else in the file alone, so a hand edit to one workflow's
entry survives until you save that same workflow from the UI.

### `workflow_fields.json`

Stores the per-workflow node selections shown in the Generate page.
`workflow_fields` maps a workflow filename to the list of node bindings. Every
entry uses `node_id|input_key|visible|display_name`, where `visible` is `true`
or `false` and the display name may be empty (keep the trailing `|`):

```json
"workflow_fields": {
  "Image Gen (Moss) - Text Input.json": [
    "18:17|value|true|Prompt",
    "18:5|text|true|Negative prompt",
    "18:7|seed|true|Seed",
    "19|aspect_ratio|true|",
    "19|megapixels|true|",
    "18:7|cfg|false|Cfg"
  ]
}
```

In the **Choose inputs…** popup, tick **Show** for each control, optionally
type a **Display name**, and set its position with **Order**. Named controls
use that label in the Generate page. The popup's **Workflow notes** section
edits the tips shown in the Generate page's notes panel (stored in the
workspace's `workflow_notes.json`); press **Save notes** there to apply them.

**Order** sets where each control appears in the Generate page: lower numbers
first. Rows left blank keep their table position and are placed after the
explicitly ordered ones, and equal numbers fall back to table order. The popup
lists selected inputs first, numbered `1..n`; after **Save input selection**
the table is renumbered to match what was stored.

- The list order is the control order: the first binding becomes the top
  control in the Generate page.
- A workflow with no entry shows every editable node input it contains.
- An empty list hides every node control for that workflow.
- Stale bindings are ignored, so renaming or removing a node is safe.
- Changing the selection, names or order in the UI and pressing **Save input
  selection** rewrites this mapping; the rest of `workflow_fields.json` is
  preserved.
- Hiding a node control only affects the UI. The workflow still keeps that
  node's stored value when generating.
- The `visible` flag is stored for every binding. Hidden bindings with an alias
  keep it in the same list, so re-showing an input restores its display name
  without retyping it.

### `workflow_presets.json`

Stores named sets of input values for each workflow, so one workflow can have
several ready-made configurations. In the Generate page, open **Input presets**,
type a name and press **Save preset** to store the current control values.
Select a preset and press **Load** to apply it, or **Delete** to remove it.

`workflow_presets` maps a workflow filename to its presets:

```json
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
```

- Values are keyed by `node_id|input_key`, the same binding IDs used in
  `workflow_fields.json`.
- A preset may contain bindings that are not currently shown; those values are
  ignored when it is loaded.
- Saving with a blank name overwrites the selected preset. Saving with a new
  name appends a preset; the rest of the file is preserved.
- The optional `default` names the preset applied automatically when the
  workflow is selected. Use **Set default** to change it. Only the node input
  values are stored — uploaded images and reference audio are not.
- Hand edits are supported. Invalid values (for example a dropdown option that
  no longer exists) are skipped when the preset is loaded.

### `workflow_notes.json`

Lets you show workflow-specific tips and information in the Generate page,
without editing the workflow itself. It maps a workflow filename to a Markdown
string; the notes are rendered in a **Workflow notes** panel that appears
under the workflow dropdown whenever a workflow with notes is selected.

```json
{
  "Music - Cover.json": "### Music cover\n\n1. Upload a reference song.\n2. Describe the **Style**.\n3. Leave **Lyrics** blank to keep the original vocals."
}
```

Workflows without an entry simply show no notes panel. The value is raw
Markdown, so headings, lists, links and emphasis all work.

The usual way to edit them is the UI: open **Choose inputs…**, expand
**Workflow notes (Markdown)**, edit the text and press **Save notes**. Saving an
empty textbox removes the workflow's entry, which hides its notes panel.

### `chat_personas.json`

Stores named chat personas created with the Chat page's **Persona** controls.
A persona bundles the **system prompt**, the **voice engine** and the **voice**
for that engine, so the same settings can be applied in one step:

```json
{
  "personas": {
    "Storyteller": {
      "system_prompt": "You are a vivid storyteller.",
      "voice_engine": "pocket-tts",
      "voice": "af_heart"
    },
    "Code helper": {
      "system_prompt": "Answer with concise, correct code.",
      "voice_engine": "off",
      "voice": ""
    }
  }
}
```

`voice_engine` is `off`, `browser`, or a text-to-speech model id from
`audio_models.json`; `voice` is the matching browser voice name or audio.cpp
voice id (empty when the engine is `off`). Select a persona to apply it.
**Save** stores the current settings under the name you enter (using an existing
name updates that persona), and **Delete** removes the selected one. An engine
that no longer matches a configured model falls back to `off` in the UI.
