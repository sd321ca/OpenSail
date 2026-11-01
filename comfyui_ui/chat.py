"""Chat tab: stream replies from a local GGUF model.

The model is a ``.gguf`` file (or a folder containing one) anywhere on disk.
Its path is configured in ``configs/constants.json`` and can also be changed
from the Chat tab. The model is loaded **lazily** on the first message and can
be released with the **Unload** button, so the same app can chat and then run
ComfyUI image/music/video workflows without the LLM holding onto memory.

Replies come from an external ``llama-server`` launched as a subprocess: it
exposes an OpenAI-compatible API and offloads to the GPU via ``-ngl``.
Unloading simply terminates the process, which frees its VRAM at once.
``configs/constants.json`` sets the executable (``chat_server_path``) and the
port the server listens on (``chat_server_port``).
"""

import base64
import io
import json
import mimetypes
import os
import queue
import subprocess
import tempfile
import threading
import time

import gradio as gr
import requests

from .config import (
    CHAT_CHAT_FORMAT,
    CHAT_N_CTX,
    CHAT_N_GPU_LAYERS,
    CHAT_N_THREADS,
    CHAT_SERVER_PATH,
    CHAT_SERVER_PORT,
    CHAT_SYSTEM_PROMPT,
)
from .audio import AudioModel
from .audio_models import AUDIO_MODELS
from .models import (
    CHAT_MODEL_CHOICES,
    CHAT_MODEL_MMPROJ,
    DEFAULT_CHAT_MODEL_PATH,
)

# Browser-side helper for the "Speak replies with" choice. The Chat tab can
# speak replies either through the browser's Web Speech API ("browser") or
# through a local audio.cpp PocketTTS server ("pocket"). These flags tell the
# client-side helpers which engine is active; the "pocket" path is driven
# server-side (see ``_speak_reply``), and "browser" reuses the debounced
# ``_VOICE_SPEAK_JS`` below.
_SPEAK_ENGINE_JS = """
(x) => {
    window.__ttsEnabled = (x === "browser");
    window.__pocketSpeak = (x === "pocket");
    if (!window.__ttsEnabled && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    return x;
}
"""

# Voice picker: a native <select> (Gradio sanitizes away inline handlers, so
# the change listener is attached from _VOICE_SETUP_JS). The list of voices is
# only known to the browser, so it is filled client-side from
# speechSynthesis.getVoices() and refreshed on the onvoiceschanged event.
_VOICE_SELECT_HTML = """
<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
  <label for="tts-voice" style="font-weight:600;white-space:nowrap;">Voice</label>
  <select id="tts-voice"
          style="flex:1;padding:6px;border-radius:8px;
                 border:1px solid var(--border-color-primary,#8884);
                 background-color:var(--background-fill-primary,#ffffff);
                 color:var(--body-text-color,#1f2937);">
    <option value="" style="background-color:var(--background-fill-primary,#ffffff);color:var(--body-text-color,#1f2937);">System default</option>
  </select>
</div>
"""

_VOICE_SETUP_JS = """
() => {
    const sel = document.getElementById("tts-voice");
    if (!sel) return;
    const populate = () => {
        const voices = window.speechSynthesis
            ? window.speechSynthesis.getVoices() : [];
        if (!voices.length) return;
        const current = sel.value || window.__ttsVoice || "";
        const optStyle =
            "background-color:var(--background-fill-primary,#ffffff);" +
            "color:var(--body-text-color,#1f2937);";
        sel.innerHTML = "";
        const def = document.createElement("option");
        def.value = "";
        def.textContent = "System default";
        def.style.cssText = optStyle;
        sel.appendChild(def);
        voices.forEach((v) => {
            const opt = document.createElement("option");
            opt.value = v.name;
            opt.textContent = v.name + (v.lang ? " (" + v.lang + ")" : "");
            opt.style.cssText = optStyle;
            sel.appendChild(opt);
        });
        if (current && voices.some((v) => v.name === current)) {
            sel.value = current;
        }
    };
    sel.addEventListener("change", () => { window.__ttsVoice = sel.value; });
    populate();
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = populate;
    }
}
"""

_VOICE_SPEAK_JS = """
(value) => {
    clearTimeout(window.__ttsTimer);
    window.__ttsTimer = setTimeout(() => {
        if (!window.__ttsEnabled) return;
        const msgs = value || [];
        let text = "";
        for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i];
            if (m && m.role === "assistant") {
                text = typeof m.content === "string"
                    ? m.content
                    : (Array.isArray(m.content)
                        ? m.content.map((c) => (c && c.text) || "").join(" ")
                        : "");
                break;
            }
        }
        text = (text || "").trim();
        if (!text || text === window.__ttsLast) return;
        window.__ttsLast = text;
        const synth = window.speechSynthesis;
        if (!synth) return;
        const utter = new SpeechSynthesisUtterance(text);
        const sel = document.getElementById("tts-voice");
        const name = (sel && sel.value) || window.__ttsVoice || "";
        if (name) {
            const voice = synth.getVoices().find((v) => v.name === name);
            if (voice) utter.voice = voice;
        }
        synth.cancel();
        synth.speak(utter);
    }, 1200);
}
"""


def _resolve_model_path(path: str) -> str:
    """Resolve a configured path to a concrete ``.gguf`` file.

    Expands ``~`` and, when ``path`` is a directory, picks the first ``.gguf``
    file inside it (sorted by name) so the config can point at a model folder.
    """
    path = os.path.expanduser((path or "").strip())
    if os.path.isdir(path):
        ggufs = sorted(
            name
            for name in os.listdir(path)
            if name.lower().endswith(".gguf")
        )
        if not ggufs:
            raise gr.Error(f"No .gguf file found in folder: {path}")
        path = os.path.join(path, ggufs[0])
    if not os.path.isfile(path):
        raise gr.Error(f"Model file not found: {path}")
    return path


# Images with more pixels than this are scaled down before being sent, so the
# vision encoder is not fed an oversized image (slower, and rarely more
# accurate). 1 MP = 1,000,000 pixels.
_MAX_IMAGE_PIXELS = 1_000_000


def _encode_image(path: str) -> tuple[str, bytes] | None:
    """Return ``(mime, data)`` for a local image, downscaled to <= 1 MP.

    Images larger than ``_MAX_IMAGE_PIXELS`` are resized proportionally (with
    EXIF orientation applied first) so both dimensions shrink together. Falls
    back to the original bytes if Pillow is unavailable or cannot decode the
    file. Returns ``None`` for a missing/unreadable file.
    """
    if not path or not os.path.isfile(path):
        return None
    mime = mimetypes.guess_type(path)[0] or "image/png"
    try:
        from PIL import Image, ImageOps

        with Image.open(path) as img:
            img = ImageOps.exif_transpose(img)
            width, height = img.size
            if width * height > _MAX_IMAGE_PIXELS:
                scale = (_MAX_IMAGE_PIXELS / (width * height)) ** 0.5
                size = (
                    max(1, int(width * scale)),
                    max(1, int(height * scale)),
                )
                img = img.resize(size, Image.Resampling.LANCZOS)
            as_jpeg = mime in ("image/jpeg", "image/jpg")
            if as_jpeg and img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG" if as_jpeg else "PNG")
            data = buffer.getvalue()
        return ("image/jpeg" if as_jpeg else "image/png"), data
    except Exception:  # noqa: BLE001
        # Not a decodable image (or Pillow missing): send the original bytes.
        try:
            with open(path, "rb") as f:
                return mime, f.read()
        except OSError:
            return None


def _image_content_part(path: str) -> dict | None:
    """Return an OpenAI ``image_url`` content part for a local image file.

    The image is inlined as a base64 data URI so llama-server needs no network
    access. Returns ``None`` for a missing/unreadable file.
    """
    encoded = _encode_image(path)
    if encoded is None:
        return None
    mime, data = encoded
    b64 = base64.b64encode(data).decode("ascii")
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{b64}"},
    }


def _history_to_message(item: dict) -> dict | None:
    """Convert one Gradio chat-history item to an OpenAI chat message.

    Plain string content is passed through. The multimodal list form Gradio
    produces (text strings plus ``{"path": ...}`` image entries) is converted
    to OpenAI content parts. Returns ``None`` for items with no usable content.
    """
    if not isinstance(item, dict):
        return None
    role = item.get("role")
    content = item.get("content")
    if not role:
        return None
    if isinstance(content, str):
        return {"role": role, "content": content}
    if not isinstance(content, list):
        return None

    parts = []
    for part in content:
        if isinstance(part, str):
            if part:
                parts.append({"type": "text", "text": part})
        elif isinstance(part, dict) and part.get("path"):
            image = _image_content_part(part["path"])
            if image is not None:
                parts.append(image)
    if not parts:
        return None
    # Collapse text-only content back to a plain string.
    if all(part.get("type") == "text" for part in parts):
        return {"role": role, "content": "".join(p["text"] for p in parts)}
    return {"role": role, "content": parts}


def _user_to_message(message) -> dict:
    """Convert the new user message (str or Gradio multimodal dict)."""
    if isinstance(message, str):
        return {"role": "user", "content": message}
    text = (message or {}).get("text", "") or ""
    files = (message or {}).get("files", []) or []
    images = []
    for path in files:
        if isinstance(path, dict):
            path = path.get("path")
        image = _image_content_part(path)
        if image is not None:
            images.append(image)
    if not images:
        return {"role": "user", "content": text}
    parts = list(images)
    if text:
        parts.append({"type": "text", "text": text})
    return {"role": "user", "content": parts}


class ChatModel:
    """Lazy manager for an external ``llama-server`` subprocess.

    The model is loaded into memory (and, with layers offloaded, VRAM) when
    the server starts, and released when the process is terminated, so the
    same app can chat and then run ComfyUI image/music/video workflows without
    the LLM holding onto VRAM.

    A lock guards loading/unloading so concurrent chat requests cannot spawn
    two servers at once.
    """

    def __init__(self, path: str | None = None):
        self.path = path or DEFAULT_CHAT_MODEL_PATH
        self._server = None
        self._base_url: str | None = None
        self._loaded_path: str | None = None
        self._log_file = None
        self._log_path: str | None = None
        self._cancel_event = threading.Event()
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        """True while the server process is live."""
        return self._server is not None and self._server.poll() is None

    def status(self) -> str:
        """A short human-readable status line for the Chat tab."""
        if not self.loaded:
            return "No model loaded."
        return f"Loaded (llama-server): `{self._loaded_path}`"

    def load(self, path: str | None = None) -> str:
        """Start (or restart) llama-server and return a status message."""
        path = _resolve_model_path(path or self.path)
        with self._lock:
            if self.loaded and path == self._loaded_path:
                return self.status()
            if self.loaded:
                self._close_locked()
            self._start_locked(path)
            self._loaded_path = path
            self.path = path
        return self.status()

    def _start_locked(self, path: str) -> None:
        """Spawn llama-server for ``path`` and wait for it to become ready."""
        server_path = os.path.expanduser((CHAT_SERVER_PATH or "").strip())
        if not server_path or not os.path.isfile(server_path):
            raise gr.Error(
                "llama-server not found. Set `chat_server_path` in "
                "configs/constants.json to your llama-server executable."
            )

        cmd = [
            server_path,
            "-m", path,
            "-ngl", str(CHAT_N_GPU_LAYERS),
            "-c", str(CHAT_N_CTX),
            "--host", "127.0.0.1",
            "--port", str(CHAT_SERVER_PORT),
            "--jinja",
        ]
        if CHAT_N_THREADS:
            cmd += ["--threads", str(CHAT_N_THREADS)]
        if CHAT_CHAT_FORMAT:
            cmd += ["--chat-template", str(CHAT_CHAT_FORMAT)]

        # Multimodal models need their projector passed via --mmproj.
        mmproj = CHAT_MODEL_MMPROJ.get(path)
        if mmproj:
            mmproj = os.path.expanduser(mmproj)
            if not os.path.isfile(mmproj):
                raise gr.Error(f"mmproj file not found: {mmproj}")
            cmd += ["--mmproj", mmproj]

        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        # Capture llama-server's output so a startup failure can report the
        # real reason (e.g. an unsupported model architecture) rather than just
        # an exit code. The log is removed when the server is closed.
        self._log_path = os.path.join(
            tempfile.gettempdir(), f"llama_server_{CHAT_SERVER_PORT}.log"
        )
        self._log_file = open(
            self._log_path, "w", encoding="utf-8", errors="replace"
        )
        try:
            self._server = subprocess.Popen(
                cmd,
                cwd=os.path.dirname(server_path) or None,
                stdout=self._log_file,
                stderr=subprocess.STDOUT,
                creationflags=creationflags,
            )
        except OSError as exc:
            self._close_log()
            raise gr.Error(f"Failed to start llama-server: {exc}") from exc

        self._base_url = f"http://127.0.0.1:{CHAT_SERVER_PORT}"
        self._wait_for_server()

    def _log_tail(self, lines: int = 12) -> str:
        """Return the last few lines of llama-server's captured output."""
        if not self._log_path:
            return ""
        try:
            with open(
                self._log_path, "r", encoding="utf-8", errors="replace"
            ) as f:
                return "".join(f.readlines()[-lines:]).strip()
        except OSError:
            return ""

    def _close_log(self) -> None:
        """Close and remove the llama-server log file (if any)."""
        log_file, self._log_file = self._log_file, None
        if log_file is not None:
            try:
                log_file.close()
            except OSError:
                pass
        log_path, self._log_path = self._log_path, None
        if log_path and os.path.isfile(log_path):
            try:
                os.remove(log_path)
            except OSError:
                pass

    def _wait_for_server(self, timeout: float = 180.0) -> None:
        """Block until the server answers its health check, or raise."""
        deadline = time.monotonic() + timeout
        health = f"{self._base_url}/health"
        while time.monotonic() < deadline:
            if self._server is not None and self._server.poll() is not None:
                code = self._server.returncode
                tail = self._log_tail()
                self._close_locked()
                message = f"llama-server exited during startup (code {code})."
                if tail:
                    message += f"\n\n{tail}"
                raise gr.Error(message)
            try:
                resp = requests.get(health, timeout=2)
                if resp.status_code == 200:
                    return
            except requests.RequestException:
                pass
            time.sleep(0.3)
        tail = self._log_tail()
        self._close_locked()
        message = "Timed out waiting for llama-server to become ready."
        if tail:
            message += f"\n\n{tail}"
        raise gr.Error(message)

    def _close_locked(self) -> None:
        """Terminate the server and reclaim its memory. Lock must be held."""
        # Interrupt any request that is still streaming.
        self._cancel_event.set()
        proc, self._server = self._server, None
        self._base_url = None
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        self._close_log()
        self._loaded_path = None

    def unload(self) -> str:
        """Stop the server and return a status message."""
        with self._lock:
            if not self.loaded:
                return self.status()
            path = self._loaded_path
            self._close_locked()
        return f"Unloaded: `{path}`"

    def cancel(self) -> None:
        """Request that the in-flight reply stop streaming.

        The streaming loop polls this flag and closes the HTTP request, which
        also stops llama-server from generating the rest of the reply.
        """
        self._cancel_event.set()

    def stream(self, messages: list, enable_thinking: bool | None = None):
        """Yield the assistant reply for ``messages``, one chunk at a time.

        ``messages`` is an OpenAI-style list of ``{"role", "content"}`` dicts.
        Yields the **cumulative** reply text (not deltas), which is what
        ``gr.ChatInterface`` expects from a streaming function.

        ``enable_thinking`` toggles the reasoning block for models whose chat
        template supports it (e.g. Qwen3.5). ``None`` leaves the model default.
        """
        if not self.loaded:
            self.load()
        # A fresh request clears any previous cancel request.
        self._cancel_event.clear()
        yield from self._stream_server(messages, enable_thinking)

    def _stream_server(self, messages: list, enable_thinking: bool | None):
        """Stream a completion, polling ``_cancel_event`` so Stop is responsive.

        The HTTP response is read on a background thread into a queue and the
        generator drains that queue with a short timeout, re-checking the
        cancel flag each time — so a stalled generation can still be aborted
        promptly rather than only at the next token.
        """
        payload: dict = {"messages": messages, "stream": True}
        if enable_thinking is not None:
            payload["chat_template_kwargs"] = {
                "enable_thinking": bool(enable_thinking)
            }
        url = f"{self._base_url}/v1/chat/completions"

        chunks: "queue.Queue[str | None]" = queue.Queue()
        state: dict = {"resp": None, "error": None}

        def _read() -> None:
            try:
                resp = requests.post(
                    url, json=payload, stream=True, timeout=(10, None)
                )
                state["resp"] = resp
                # llama-server streams UTF-8, but requests defaults text/*
                # responses that omit a charset to ISO-8859-1, which would
                # mangle non-ASCII characters (e.g. curly quotes). Force UTF-8.
                resp.encoding = "utf-8"
                if resp.status_code != 200:
                    state["error"] = gr.Error(
                        f"llama-server error {resp.status_code}: {resp.text}"
                    )
                    return
                for line in resp.iter_lines(decode_unicode=True):
                    if self._cancel_event.is_set():
                        break
                    chunks.put(line)
            except Exception as exc:  # noqa: BLE001
                # A close triggered by cancel() is expected, not an error.
                if not self._cancel_event.is_set():
                    state["error"] = exc
            finally:
                chunks.put(None)

        reader = threading.Thread(
            target=_read, name="llama-server-stream", daemon=True
        )
        reader.start()

        text = ""
        try:
            while not self._cancel_event.is_set():
                try:
                    line = chunks.get(timeout=0.2)
                except queue.Empty:
                    continue
                if line is None:
                    break
                if not line:
                    continue
                if line.startswith("data: "):
                    line = line[len("data: "):]
                if line == "[DONE]":
                    break
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = delta.get("content")
                if content:
                    text += content
                    yield text
        finally:
            # Abort the HTTP request so llama-server stops generating too.
            resp = state.get("resp")
            if resp is not None:
                try:
                    resp.close()
                except Exception:  # noqa: BLE001
                    pass

        error = state.get("error")
        if error is not None and not self._cancel_event.is_set():
            if isinstance(error, gr.Error):
                raise error
            raise gr.Error(f"Lost connection to llama-server: {error}")


def build_chat_tab(
    model: ChatModel | None = None,
    audio_model: AudioModel | None = None,
) -> ChatModel:
    """Render the Chat tab inside the current Blocks context.

    Shows a model dropdown (aliases from ``configs/chat_models.json``) with
    **Load** / **Unload** buttons above a ``gr.ChatInterface``. Assistant
    replies can be spoken either with the browser's built-in voices or, when
    ``audio_model`` is given, synthesized locally with audio.cpp PocketTTS.
    Returns the :class:`ChatModel` manager so callers can unload it elsewhere.
    """
    model = model or ChatModel()

    def _speak_with_audio(text: str, voice: str | None):
        """Synthesize ``text`` with PocketTTS; return a WAV path or None."""
        if audio_model is None or not default_speech_model:
            return None
        path = None
        for _status, audio in audio_model.generate(
            default_speech_model, text, voice=voice
        ):
            path = audio
        return path

    def respond(
        message, history, system_prompt, enable_thinking, engine, voice
    ):
        """Stream a reply; speak it once complete when PocketTTS is chosen.

        Yields ``(reply_text, audio, stop)``: ``audio`` is left unchanged while
        the reply streams and is set to the generated WAV at the end, and
        ``stop`` shows the Stop button only while the reply is being generated.
        Because synthesis only happens after the model has finished, the reply
        is never spoken in overlapping fragments (which previously caused the
        player to restart repeatedly). ``message`` is a string or Gradio's
        ``{"text", "files"}`` dict; attached images become base64 content parts.
        """
        messages = []
        if system_prompt and system_prompt.strip():
            messages.append(
                {"role": "system", "content": system_prompt.strip()}
            )
        for item in history or []:
            converted = _history_to_message(item)
            if converted is not None:
                messages.append(converted)
        messages.append(_user_to_message(message))

        text = ""
        # Show the Stop button for the whole reply: up as soon as the request
        # starts, down once it finishes (or fails).
        yield "", gr.update(), gr.update(visible=True)
        try:
            for text in model.stream(
                messages, enable_thinking=enable_thinking
            ):
                yield text, gr.update(), gr.update(visible=True)
        except gr.Error:
            yield text, gr.update(), gr.update(visible=False)
            raise
        except Exception as exc:  # noqa: BLE001
            yield text, gr.update(), gr.update(visible=False)
            raise gr.Error(f"Chat failed: {exc}")

        # The reply is complete: synthesize it once, if requested.
        if engine != "pocket" or not text.strip():
            yield text, gr.update(), gr.update(visible=False)
            return
        yield text, _speak_with_audio(text, voice), gr.update(visible=False)

    def do_load(path_value: str) -> str:
        try:
            return model.load(path_value)
        except gr.Error as exc:
            return f"Error: {exc}"
        except Exception as exc:  # noqa: BLE001
            return f"Error: {exc}"

    def do_unload() -> str:
        try:
            return model.unload()
        except Exception as exc:  # noqa: BLE001
            return f"Error: {exc}"

    # Text-to-speech models available for the "PocketTTS" speech engine, and
    # the default model for it (the pocket_tts family if configured). Voices
    # come from the server once the model is loaded.
    tts_models = [
        (entry["alias"], entry["id"])
        for entry in AUDIO_MODELS
        if entry.get("task", "tts") == "tts"
    ]
    default_speech_model = next(
        (entry["id"] for entry in AUDIO_MODELS if entry.get("family") == "pocket_tts"),
        tts_models[0][1] if tts_models else None,
    )

    def _engine_change(engine):
        """Show/label the controls for the selected speech engine.

        Selecting PocketTTS also fills the voice dropdown from the server (its
        model loads lazily, so this only starts the server process).
        """
        browser = engine == "browser"
        pocket = engine == "pocket"
        voice_update = gr.update(visible=pocket)
        if pocket and audio_model is not None and default_speech_model:
            try:
                voices = audio_model.list_voices(default_speech_model)
            except Exception:  # noqa: BLE001
                voices = []
            if voices:
                voice_update = gr.update(
                    visible=True, choices=voices, value=voices[0]
                )
        return (
            voice_update,                     # pocket voice
            gr.update(visible=browser),       # browser voice picker
            gr.update(visible=pocket),        # spoken-reply audio player
            gr.update(visible=pocket),        # refresh voices button
        )

    def do_refresh_speech_voices():
        """Re-list the PocketTTS voices, including newly saved clones."""
        if audio_model is None or not default_speech_model:
            return gr.update(choices=[], value=None)
        try:
            voices = audio_model.list_voices(default_speech_model)
        except Exception:  # noqa: BLE001
            return gr.update()
        if not voices:
            return gr.update(choices=[], value=None)
        return gr.update(choices=voices, value=voices[0])

    # Choices are (alias, path) pairs from configs/chat_models.json, so the alias is
    # shown in the dropdown while the value passed to the callback is the path.
    choices = list(CHAT_MODEL_CHOICES)
    values = [path for _alias, path in choices]
    default_path = model.path or DEFAULT_CHAT_MODEL_PATH
    if default_path not in values:
        default_path = values[0] if values else None

    with gr.Row():
        model_dd = gr.Dropdown(
            choices=choices,
            value=default_path,
            label="Model",
            scale=4,
        )
        load_btn = gr.Button("Load", variant="primary", scale=1)
        unload_btn = gr.Button("Unload", variant="stop", scale=1)

    status = gr.Markdown(model.status())

    load_btn.click(fn=do_load, inputs=[model_dd], outputs=[status])
    unload_btn.click(fn=do_unload, inputs=None, outputs=[status])

    # Speech settings. The browser engine uses the Web Speech API (voice list
    # filled client-side by _VOICE_SETUP_JS); the PocketTTS engine uses the
    # shared audio.cpp server. "speak_engine" and "speech_voice" are passed to
    # the chat function as additional inputs; "reply_audio" receives the WAV.
    engine_choices = [
        ("Off", "off"),
        ("Browser (system voices)", "browser"),
    ]
    if audio_model is not None and tts_models:
        engine_choices.append(("PocketTTS (audio.cpp)", "pocket"))

    speak_engine = gr.Dropdown(
        choices=engine_choices,
        value="off",
        label="Speak replies with",
    )
    with gr.Row():
        speech_voice = gr.Dropdown(
            choices=[],
            value=None,
            label="PocketTTS voice",
            allow_custom_value=True,
            visible=False,
            scale=4,
        )
        refresh_voices_btn = gr.Button("Refresh", scale=1, visible=False)

    voice_select = gr.HTML(
        _VOICE_SELECT_HTML, elem_classes="tts-voice", visible=False
    )
    voice_select.load(fn=None, js=_VOICE_SETUP_JS)

    reply_audio = gr.Audio(
        label="Spoken reply",
        type="filepath",
        autoplay=True,
        visible=False,
    )

    speak_engine.change(
        fn=_engine_change,
        inputs=[speak_engine],
        outputs=[speech_voice, voice_select, reply_audio, refresh_voices_btn],
        js=_SPEAK_ENGINE_JS,
    )
    refresh_voices_btn.click(
        fn=do_refresh_speech_voices, inputs=None, outputs=[speech_voice]
    )

    system_box = gr.Textbox(
        label="System prompt",
        value=CHAT_SYSTEM_PROMPT,
        lines=3,
        info="Instructions prepended to the conversation. Leave empty for none.",
    )
    thinking_cb = gr.Checkbox(
        label="Enable thinking",
        value=False,
        info=(
            "Let reasoning models (e.g. Qwen3.5) write their thinking block "
            "before answering. Uncheck for direct answers."
        ),
    )

    # Declared unrendered so it can be a ChatInterface additional output, then
    # rendered below the chat box. It stays hidden until a reply streams.
    stop_btn = gr.Button("Stop", variant="stop", visible=False, render=False)

    chat = gr.ChatInterface(
        fn=respond,
        multimodal=True,
        textbox=gr.MultimodalTextbox(
            file_types=["image"],
            file_count="multiple",
            placeholder="Send a message or attach an image...",
        ),
        additional_inputs=[
            system_box,
            thinking_cb,
            speak_engine,
            speech_voice,
        ],
        additional_inputs_accordion="Chat settings",
        additional_outputs=[reply_audio, stop_btn],
        title="Chat",
        description=(
            "Replies stream from a local GGUF model served by llama-server "
            "(GPU). Attach an image to chat with a multimodal model that has "
            "an `mmproj` configured. Set **Speak replies with** to read "
            "replies aloud using the browser or a local audio.cpp PocketTTS "
            "voice. The model loads on the first message; press **Unload** to "
            "free VRAM before running a ComfyUI workflow."
        ),
        flagging_mode="never",
        fill_width=True,
    )

    # Below the chat box: rendered after the ChatInterface so it sits under it,
    # and only ever shown while a reply is streaming (see ``respond``).
    with gr.Row():
        stop_btn.render()
    # Abort the in-flight reply. concurrency_limit=None lets it run while the
    # streaming submit event is still active (otherwise it would queue behind).
    stop_btn.click(
        fn=model.cancel, inputs=None, outputs=None, concurrency_limit=None
    )

    # Browser engine speaks the settled reply client-side (see _VOICE_SPEAK_JS);
    # the PocketTTS engine is spoken inside ``respond`` (see additional_outputs).
    chat.chatbot.change(
        fn=None, inputs=[chat.chatbot], js=_VOICE_SPEAK_JS
    )

    return model
