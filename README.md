# OpenSail

OpenSail is an Open source Suite of AI tools for Local models. The purpose is to allow
you to easily use your local AI models through a mobile-friendly interface over your LAN or over the internet. It has support for
your existing ComfyUI workflows, llama.cpp, and audio.cpp. It provides a local, responsive dashboard for generative media. Run ComfyUI workflows
(image, video, music), chat with local GGUF models
through [llama.cpp](https://github.com/ggml-org/llama.cpp), and generate or
clone speech with [audio.cpp](https://github.com/0xShug0/audio.cpp) — all from
a single interface, with every model running on your own machine. Each backend
is optional, so you can use any one of them on its own or all together.

## Editions

Two editions run from this repository:

|         | Community             | Premium                                 |
| ------- | --------------------- | --------------------------------------- |
| Licence | MIT                   | Commercial, source-available            |
| Users   | One owner, no sign-in | Multiple accounts with a profile picker |
| Price   | Free                  | Lifetime, unlimited users               |

The community edition is everything outside `opensail_premium/` and is fully
open source. Premium adds accounts, a shared-GPU queue and licence activation;
its source is public and auditable, but using it requires a licence.
A single licence covers unlimited users on the installation. There is no
automatic conversion to open source.

## Requirements

- Python 3.10 or newer (the code uses `X | None` type hints)
- Node.js 20.19 or newer (to build the dashboard client and stylesheet)
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

Install from a source checkout: the dashboard client is compiled locally, so
both Python and Node are needed.

Create and activate a virtual environment, then install the dependencies:

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
```

The dashboard client and stylesheet are generated at build time and are not
committed, so install the frontend dependencies and build them once (and again
after editing anything in `web/src/` or `web/assets/input.css`):

```bash
npm install
npm run build
```

See `AGENTS.md` for the TypeScript/Vite layout and the `npm run dev` workflow.

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

The sidebar's **Local services** panel shows ComfyUI, the chat model, and the
audio.cpp server. Its **Start**/**Stop** buttons manage a local ComfyUI process.
Set `comfy_dir` in `configs/constants.json` to the portable install folder (the
one containing `python_embeded` and `ComfyUI`). The app then launches:

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

The community edition has no authentication: it serves a single local owner and
assumes the machine or network is trusted. Do not expose it directly to the
internet.

Multi-user sign-in is a Premium feature. It adds local accounts with passwords
or PINs, and sessions are kept in `data/opensail.db`.

## Remote access

For remote access, [Tailscale](https://tailscale.com/) is recommended to reach the dashboard privately from your own devices.

## Pages

<img width="287" height="668" alt="features2" src="https://github.com/user-attachments/assets/7a5407f1-ce81-44bb-bc3a-b3bc42ee9e9f" />

- **Chat** — talk to a local GGUF model served by
  [llama-server](https://github.com/ggml-org/llama.cpp), launched as a
  subprocess so it can use the GPU. Pick a **Model** from the dropdown
  (aliases are defined in `chat_models.json`; see
  [`CONFIGURATION.md`](CONFIGURATION.md#chat_modelsjson)) and press **Load**,
  or just send a message and the server starts automatically. Replies stream
  token-by-token. Attach one or more images to a message to chat with a
  multimodal model (one with an `mmproj` configured in `chat_models.json`);
  images larger than 1 MP are downscaled automatically.
  Under **Chat settings**, the **Persona** dropdown loads a saved bundle of the
  system prompt, speech engine and voice; press **Save** to create or update a
  persona and **Delete** to remove it (personas are saved in your workspace;
  see [`CONFIGURATION.md`](CONFIGURATION.md#chat_personasjson)). The **System
  prompt** box sets the
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
  `constants.json` (see
  [`CONFIGURATION.md`](CONFIGURATION.md#constantsjson)).

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
  input selection** to remember the choice and its order; the app stores it per
  workflow, for your account. Use the **Input presets** panel to save the
  current values under a name
  (for example **Low quality** / **High quality**), load a saved preset, or mark
  one as the workflow default so it pre-fills the controls whenever that
  workflow is selected. Presets are saved the same way. See
  [`CONFIGURATION.md`](CONFIGURATION.md#workspace-files) for where both files
  live. For example:
  - **Image workflows** show a prompt / negative prompt and a resolution
    (width/height or aspect ratio + megapixels), and output an image.
  - **Music workflows** (e.g. `Music - Text Input.json`) show **Style** and
    **Lyrics** fields and output an audio player.
  - **Video workflows** (e.g. `Video - Text Input.json`) show a prompt, a
    **Duration** slider and a resolution (aspect ratio + megapixels), and
    output a video player.
  - Workflows with `LoadImage` nodes (e.g. `Image Edit - 1 Input.json`) show
    one **Input images** slot per node. Each slot is an image editor, so you
    can upload a file, **draw a sketch**, or **crop** the selected image, or
    press **Load from Gallery** beside the slot to pick one of the images you
    have already generated (press **Use this image** under a thumbnail).
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
  loaded. Click a thumbnail to preview it full size; the preview also shows the
  ComfyUI metadata embedded in the file (model, prompts, sampler settings and
  the raw prompt/workflow JSON). Images generated through the Generate page get
  a compact JPEG preview in the `thumbnails/` folder, which the grid uses
  instead of loading the full-size image.
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

All three galleries also show files from the `media/` folder beside
`thumbnails/`. Drop images, audio or video into it (subfolders are scanned
too) and press **Refresh**; they appear alongside ComfyUI history and can be
reused as inputs on the Generate page. The folder is created automatically on
startup. Local images and videos get cached thumbnails in
`thumbnails/local/`, generated on demand the first time a tile is viewed and
refreshed when the source file changes. Each item is labelled **Media** or
**ComfyUI** so its source is clear. Tick the checkbox in an item's bottom-right
corner to select it; **Move to media** and **Delete selected** buttons appear
in the header. Deleting removes the selected entries from
ComfyUI's history (all outputs from the same generation are removed
together), and local media files are deleted from the `media/` folder. Moving
copies every output of the selected ComfyUI generations into `media/` and
removes those history entries, keeping the content safe from ComfyUI's own
cleanup.

  <img width="375" height="687" alt="gallery2" src="https://github.com/user-attachments/assets/38088c6f-180e-4fec-afdf-06bf7264449c" />

- **Other** — clear ComfyUI's generation history, or delete every file in
  ComfyUI's `output`, `input` and `temp` folders. Clearing the generations
  removes generated media and uploaded inputs, but leaves the dashboard's
  `media/` folder and saved workflows untouched; history entries remain until
  you also clear the history.

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
  where you can upload an image, draw a sketch, crop the selected image, or
  load one from the gallery.
- Video workflows expose the `RandomNoise` seed, the `BasicScheduler` steps /
  scheduler, and the `PrimitiveFloat` duration `value` as node candidates.

The UI builds the node list by inspecting the workflow's inputs
(`list_node_candidates`): every input with a literal value that one of the
field widgets can edit becomes a selectable candidate. Links to other nodes
are skipped because replacing them with a literal would break the graph.
Title hints and node types only decide which widget and options are used for a
candidate; they do not hide inputs from the picker.

Which node inputs are shown is saved per workflow as
`node_id|input_key|visible|display_name` entries; see
[`CONFIGURATION.md`](CONFIGURATION.md#workflow_fieldsjson) for the format. The
order of that list is the order of the controls in the Generate page. A workflow
with no entry shows every editable node input; use the **Choose inputs…** popup
in the Generate page to choose a subset, reorder it and save it.

## Configuration

Two kinds of JSON, both plain and readable:

- **`configs/`** — shared settings you edit by hand: `constants.json`,
  `chat_models.json`, `audio_models.json`, `fields.json`, `samplers.json` and
  `schedulers.json`. The live files are machine-specific and git-ignored, while
  their `.example.json` twins are the committed defaults; `constants.json`,
  `samplers.json`, `schedulers.json` and `fields.json` are created from those
  examples on first run.
- **`data/users/<id>/`** — workspace files the app writes when you press
  **Save**: `workflow_fields.json` (which inputs each workflow shows),
  `workflow_presets.json`, `workflow_notes.json` and `chat_personas.json`. You
  do not need to create or edit these; a missing file is treated as empty.

See [`CONFIGURATION.md`](CONFIGURATION.md) for every setting, each file's format
and how the Generate page input registry works.
