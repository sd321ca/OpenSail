# OpenSail

OpenSail is an Open source Suite of AI tools for Local models. The purpose is to allow
you to easily use your local AI models through a mobile-friendly interface over your LAN or over the internet. It has support for
your existing ComfyUI workflows, llama.cpp, and audio.cpp. It provides a local, responsive dashboard for generative media. Run ComfyUI workflows
(image, video, music), chat with local GGUF models
through [llama.cpp](https://github.com/ggml-org/llama.cpp), and generate or
clone speech with [audio.cpp](https://github.com/0xShug0/audio.cpp) — all from
a single interface, with every model running on your own machine. Each backend
is optional, so you can use any one of them on its own or all together.

## Requirements

- Python 3.10 or newer (the code uses `X | None` type hints)
- Optional: a running ComfyUI instance (default: http://127.0.0.1:8188) for the
  **Generate** page and gallery pages
- Optional: a `llama-server` executable from
  [llama.cpp](https://github.com/ggml-org/llama.cpp) for the **Chat** page
- Optional: an `audiocpp_server` executable from
  [audio.cpp](https://github.com/0xShug0/audio.cpp) for the **Text to Speech** page

All three backends are optional and independent: use the app purely as a
ComfyUI front end, a llama.cpp chat client, an audio.cpp speech tool, or any
combination. The UI starts with whatever is available, and each page reports a
clear error if its backend is missing when you try to use it. The
`llama-server` and `audiocpp_server` processes are started and stopped by the
app itself; all three are configured in `configs/constants.json`.

> **Note (ComfyUI flags):** ComfyUI is only ever contacted by the dashboard
> server, and generated media is proxied through it, so `comfy_url` can stay
> at `http://127.0.0.1:8188` whenever ComfyUI runs on the same machine as this
> app — even when you open the UI from another device. The flags below are only
> needed when ComfyUI runs on a _different_ machine than the app:
> start it with `--listen 0.0.0.0 --enable-cors-header` so it accepts
> connections from the app's host, and point `comfy_url` at the address that
> host can reach.
>
> ```bash
> python main.py --listen 0.0.0.0 --enable-cors-header
> ```

## Setup

Create and activate a virtual environment, then install the dependencies:

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
```

The compiled Tailwind stylesheet is committed, so a normal install needs no
Node.js. If you edit the frontend markup or classes, rebuild it with
`npm install` followed by `npm run build:css`.

## Run

```bash
python app.py
```

Visit http://127.0.0.1:7860

The dashboard opens in dark mode and includes a sun/moon button in the header
to switch to light mode. The choice is saved in the browser; on a first visit
the OS color-scheme preference is used.

### HTTPS and microphone access

Browser microphone access (used by the Chat page's hold-to-talk button) requires
a secure context. `http://localhost` and `http://127.0.0.1` count as secure, but
a LAN address such as `http://192.168.1.25:7860` does not.

The app looks for TLS files at `configs/certs/cert.pem` and
`configs/certs/key.pem` by default. Create a self-signed certificate there
(from Git Bash, WSL, or any shell with OpenSSL):

```bash
cd configs/certs
openssl req -new -x509 -keyout key.pem -out cert.pem -days 365 -nodes
```

Restart `python app.py` and open `https://<host>:7860`; HTTPS is used
automatically when both files exist. If either file is missing, the app falls
back to HTTP. The certificate contents are git-ignored.

Because this is a self-signed certificate, the browser will still warn until
you accept/trust it. Modern browsers also require a Subject Alternative Name
(SAN); if the browser rejects the certificate, regenerate it with the hostname
and/or LAN IP included:

```bash
openssl req -new -x509 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=opensail.local" \
  -addext "subjectAltName=DNS:opensail.local,IP:192.168.1.25"
```

To use different paths, set `server_ssl_certfile` and `server_ssl_keyfile` in
`configs/constants.json`. If you want a certificate the browser trusts without
warnings, use mkcert or a publicly trusted certificate instead.

### Starting and stopping ComfyUI

The sidebar's **Start**/**Stop** buttons manage a local ComfyUI process. Set
`comfy_dir` in `configs/constants.json` to the portable install folder (the one
containing `python_embeded` and `ComfyUI`). The app then launches:

```text
python_embeded/python.exe -s ComfyUI/main.py <comfy_start_args>
```

and waits up to `comfy_start_timeout` seconds for `comfy_url` to answer.
`comfy_python` and `comfy_main` override the default paths for non-portable
installs, and `comfy_start_args` is a JSON list of extra arguments.

If ComfyUI is already running, Start is disabled and no second copy is
launched. Stop only terminates a process that OpenSail started; externally
started instances are left alone.

By default, a managed process is stopped when OpenSail exits. Set
`comfy_stop_on_exit` to `false` to leave it running; on the next launch it will
appear as an externally started instance.

With `comfy_show_console` enabled on Windows, ComfyUI opens in its own console
window. Otherwise it runs headless and its output is captured in
`%TEMP%\opensail_comfyui.log`.

## Authentication

The app can require a username and password before the UI is accessible. The
credentials are read from a `.env` file in the project root (or from the
process environment).

Copy the provided template and set your own values:

```bash
cp env.example .env
```

Then edit `.env`:

```dotenv
APP_USERNAME=admin
APP_PASSWORD=changeme
```

- When **both** `APP_USERNAME` and `APP_PASSWORD` are set, the app shows
  a login prompt and requires those credentials.
- When either is missing, authentication is disabled and the app is open to
  anyone who can reach it.

The `.env` file is git-ignored, so your credentials are never committed.
Environment variables set outside the file take priority over the `.env` file.

## Remote access

For remote access, [Tailscale](https://tailscale.com/) is recommended to reach the dashboard privately from your own devices.

## Pages

<img width="287" height="668" alt="features2" src="https://github.com/user-attachments/assets/7a5407f1-ce81-44bb-bc3a-b3bc42ee9e9f" />

- **Chat** — talk to a local GGUF model served by
  [llama-server](https://github.com/ggml-org/llama.cpp), launched as a
  subprocess so it can use the GPU. Pick a **Model** from the dropdown
  (aliases are defined in `chat_models.json`; see below) and press **Load**, or just
  send a message and the server starts automatically. Replies stream
  token-by-token. Attach one or more images to a message to chat with a
  multimodal model (one with an `mmproj` configured in `chat_models.json`);
  images larger than 1 MP are downscaled automatically.
  Under **Chat settings**, the **Persona** dropdown loads a saved bundle of the
  system prompt, speech engine and voice; press **Save** to create or update a
  persona and **Delete** to remove it (personas are stored in
  `configs/chat_personas.json`). The **System prompt** box sets the
  instructions prepended to every conversation (leave empty for none), and the
  **Enable thinking** checkbox toggles the reasoning block for models that
  support it (e.g. Qwen3.5): checked, the model writes its thinking before
  answering; unchecked (the default), it replies directly.
  **Speak replies with** reads each assistant reply aloud, using either your
  browser's built-in speech synthesis (**Browser**) or any text-to-speech model
  listed in `audio_models.json` (for example a local
  [audio.cpp](https://github.com/0xShug0/audio.cpp) model), which shows the
  spoken audio in a player. For **Browser**, the **Voice** dropdown picks the
  installed system voice; for an audio.cpp model, the same **Voice** dropdown
  lists that model's voices (use **Refresh** to load them, including clones
  saved on the Text to Speech page).
  Press **Stop** to abort a reply that is still streaming. Press **Unload** to
  terminate the server and free its VRAM before running a
  ComfyUI workflow. The executable, port and load options come from
  `constants.json` (see below).

  > **Note (GPU):** the Chat page requires a `llama-server` executable built
  > with CUDA. Point `chat_server_path` in `constants.json` at your
  > `llama-server.exe`; the official llama.cpp Windows releases ship one with
  > the CUDA runtime bundled. Offload is controlled by `chat_n_gpu_layers`
  > (`-ngl`) — set it to the number of layers to offload, or `99` for all. No
  > `llama-cpp-python` build is required, which sidesteps the AVX-512
  > incompatibility of its prebuilt CUDA wheels on 12th/13th-gen Intel CPUs.

  <img width="405" height="900" alt="chat-a2" src="https://github.com/user-attachments/assets/d81e5266-de41-4f17-a64a-a5da4b1fb29b" />

  <img width="405" height="694" alt="chat-b2" src="https://github.com/user-attachments/assets/4a254bed-f44b-4cbd-b1c2-3a9ae7e7bef6" />

- **Generate** — pick a workflow, choose which node inputs to control, and
  generate an image, a song or a video. Press **Choose inputs…** to open a
  popup listing every editable node input in the workflow (node ID, title and
  input key). Tick **Show** for the ones you want; each becomes a control bound
  directly to that node input. Use **Order** to set where each control appears
  (lower numbers first) and optionally type a **Display name**. Press **Save
  input selection** to remember the choice and its order. Selections are stored
  per workflow in `configs/workflow_fields.json`, so they can also be edited by
  hand. Use the **Input presets** panel to save the current values under a name
  (for example **Low quality** / **High quality**), load a saved preset, or mark
  one as the workflow default so it pre-fills the controls whenever that
  workflow is selected. Presets are stored per workflow in
  `configs/workflow_presets.json`. For example:
  - **Image workflows** show a prompt / negative prompt and a resolution
    (width/height or aspect ratio + megapixels), and output an image.
  - **Music workflows** (e.g. `Music - Text Input.json`) show **Style** and
    **Lyrics** fields and output an audio player.
  - **Video workflows** (e.g. `Video - Text Input.json`) show a prompt, a
    **Duration** slider and a resolution (aspect ratio + megapixels), and
    output a video player.
  - Workflows with `LoadImage` nodes (e.g. `Image Edit - 1 Input.json`) show
    one **Input images** slot per node. Each slot is an image editor, so you
    can upload a file **or draw a sketch** to use as the input image, or press
    **Load from Gallery** beside the slot to pick one of the images you have
    already generated (press **Use this image** under a thumbnail).
  - Workflows with a `LoadVideo` node (e.g. `Extract Last Frame.json` or
    `Video - Upscale.json`) show an **Input video** upload. The file is sent to
    ComfyUI and used as that node's video before the workflow runs. Press
    **Load from Gallery** beside the heading to pick one of the videos you have
    already generated instead of uploading a file.

<img width="1213" height="541" alt="inputs2" src="https://github.com/user-attachments/assets/a6d0d712-f351-4c2b-bb02-ca02d7d033b5" />

<img width="900" height="1393" alt="generation2" src="https://github.com/user-attachments/assets/bbdc394d-3de2-4d03-9549-cd3049d0da45" />
 
- **Text to Speech** — text-to-speech and voice cloning via
  [audio.cpp](https://github.com/0xShug0/audio.cpp). Pick a model (aliases from
  `audio_models.json`), type the text, optionally choose a **Voice** preset or
  attach a **reference clip** to clone, then press **Generate**. Reference
  clips may be any format the browser accepts (mp3, flac, ogg, m4a, ...); they
  are converted to WAV automatically. Name the clip under **Save clone as
  voice** and press **Save voice** to add it to the shared voice library, after
  which it can be selected by name here and in the Chat page. The
  `audiocpp_server` subprocess starts on the first run and loads models lazily;
  press **Unload** to stop it and free VRAM before running a ComfyUI workflow.
- **Image Gallery** — browse previously generated images pulled from ComfyUI's
  history. Use **Refresh** to reload and the slider to cap how many images are
  loaded. Click a thumbnail to preview it full size. Images generated through
  the Generate page get a compact JPEG preview in the `thumbnails/` folder,
  which the grid uses instead of loading the full-size image.
- **Audio Gallery** — browse previously generated audio (e.g. songs) pulled
  from ComfyUI's history. Each file is shown as an inline audio player labelled
  with the generation metadata embedded in the file (style, mode, duration,
  seed). Use **Refresh** to reload and the slider to cap how many files are
  loaded.
- **Video Gallery** — browse previously generated videos pulled from ComfyUI's
  history. Each file is shown as a clickable thumbnail labelled with its
  filename and prompt; clicking one opens the video player. Videos generated
  through the Generate page get a still frame saved as `<filename>.jpg` in the
  `thumbnails/` folder, which is used as the preview image. Use **Refresh** to
  reload and the slider to cap how many files are loaded. Cached thumbnails are
  checked at startup and when a gallery is refreshed; any whose original
  ComfyUI media file no longer exists are deleted. When the local ComfyUI
  folders are not configured, ComfyUI's history is used as the fallback check.

  <img width="375" height="687" alt="gallery2" src="https://github.com/user-attachments/assets/38088c6f-180e-4fec-afdf-06bf7264449c" />

## Adding workflows

Drop a ComfyUI API-format workflow JSON into the `workflows/` folder. The UI
detects the workflow kind automatically:

- A workflow is treated as **video** when it contains a video output node
  (e.g. `SaveVideo`), as **audio** when it contains an audio output node (e.g.
  `SaveAudioAdvanced`) or an audio latent node (e.g. `EmptyYuE2LatentAudio`);
  otherwise it is treated as an **image** workflow.
- Text nodes such as `PrimitiveString` / `PrimitiveStringMultiline` are
  listed individually, so a workflow that expands the prompt with an LLM can
  expose its user/system prompt `value` inputs without losing the generation
  chain. The same applies to music style / lyrics nodes and to inline
  style / lyrics inputs on `YuE2GenerateMusic`.
- Prompt and negative prompt encoders are listed by node, not by title. Any
  text-encoder input with a literal value is selectable; linked inputs are
  skipped so the graph is not broken.
- Workflows with a `LoadAudio` node (e.g. `Music - Cover.json`) show a
  **Reference audio** input for uploading the source song.
- Workflows with a `LoadVideo` node (e.g. `Extract Last Frame.json`) show an
  **Input video** upload. The uploaded file replaces the node's `file` input.
- Workflows with a `LoadImage` node show one **Input images** slot per node,
  where you can upload an image, draw a sketch, or load one from the gallery.
- Video workflows expose the `RandomNoise` seed, the `BasicScheduler` steps /
  scheduler, and the `PrimitiveFloat` duration `value` as node candidates.

The UI builds the node list by inspecting the workflow's inputs
(`list_node_candidates`): every input with a literal value that one of the
field widgets can edit becomes a selectable candidate. Links to other nodes
are skipped because replacing them with a literal would break the graph.
Title hints and node types only decide which widget and options are used for a
candidate; they do not hide inputs from the picker.

Which node inputs are shown is saved per workflow in
`configs/workflow_fields.json` as `node_id|input_key|visible|display_name`
entries. The order of that list is the order of the controls in the Generate
page. A workflow with no entry shows every editable node input; use the
**Choose inputs…** popup in the Generate page to choose a subset, reorder it and
save it. The file can also be
edited or reordered by hand.

## Configuration

All configuration lives in the `configs/` folder. There are ten files:

| File                    | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `constants.json`        | Server and connection settings                          |
| `chat_models.json`      | Chat page model aliases and GGUF paths                  |
| `chat_personas.json`    | Saved chat personas (prompt, voice engine and voice)    |
| `audio_models.json`     | Text to Speech page audio.cpp TTS models                |
| `fields.json`           | Input registry and node-matching hints                  |
| `workflow_fields.json`  | Per-workflow node selections shown in the Generate page |
| `workflow_presets.json` | Per-workflow saved input presets                        |
| `samplers.json`         | Sampler names offered in the **Sampler** dropdown       |
| `schedulers.json`       | Scheduler names offered in the **Scheduler** dropdown   |
| `workflow_notes.json`   | Per-workflow help notes shown in the Generate page      |

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
- `server_public_access` — kept for compatibility; public tunnels are not used by the built-in server
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
name updates that persona), and **Delete** removes the selected one. The file
is optional and can be edited by hand; an engine that no longer matches a
configured model falls back to `off` in the UI.

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
  `samplers`, `schedulers`, `aspect_ratios`, `music_modes`). For `textbox`,
  `"fullscreen": true` opens the field as a full-screen editor on phones while
  it has focus (the soft keyboard never covers the text); desktop keeps the
  normal inline textarea.
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

### `workflow_fields.json`

This file stores the per-workflow node selections shown in the Generate page.
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
edits the tips shown in the Generate page's notes panel (stored in
`configs/workflow_notes.json`); press **Save notes** there to apply them.

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

You can also edit the notes from the UI: open **Choose inputs…**, expand
**Workflow notes (Markdown)**, edit the text and press **Save notes**. Saving
an empty textbox removes the workflow's entry, which hides its notes panel.
