"""Chat: stream replies from a local GGUF model.

The model is a ``.gguf`` file (or a folder containing one) anywhere on disk.
Its path is configured in ``configs/constants.json`` and can also be changed
from the Chat view. The model is loaded **lazily** on the first message and can
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

import requests

from .config import (
    CHAT_CHAT_FORMAT,
    CHAT_N_CTX,
    CHAT_N_GPU_LAYERS,
    CHAT_N_THREADS,
    CHAT_SERVER_PATH,
    CHAT_SERVER_PORT,
)
from .errors import AppError
from .models import (
    CHAT_MODEL_MMPROJ,
    DEFAULT_CHAT_MODEL_PATH,
)


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
            raise AppError(f"No .gguf file found in folder: {path}")
        path = os.path.join(path, ggufs[0])
    if not os.path.isfile(path):
        raise AppError(f"Model file not found: {path}")
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
    """Convert a stored chat-history item to an OpenAI chat message.

    Plain string content is passed through. A multimodal list of text strings
    and ``{"path": ...}`` image entries is converted to OpenAI content parts.
    Returns ``None`` for items with no usable content.
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
    """Convert a new user message (text or a ``{text, files}`` dict)."""
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
        """A short human-readable status line for the Chat view."""
        if not self.loaded:
            return "No model loaded."
        return f"Loaded (llama-server): {self._loaded_path}"

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
            raise AppError(
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
                raise AppError(f"mmproj file not found: {mmproj}")
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
            raise AppError(f"Failed to start llama-server: {exc}") from exc

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
                raise AppError(message)
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
        raise AppError(message)

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
        return f"Unloaded: {path}"

    def cancel(self) -> None:
        """Request that the in-flight reply stop streaming.

        The streaming loop polls this flag and closes the HTTP request, which
        also stops llama-server from generating the rest of the reply.
        """
        self._cancel_event.set()

    def reset_cancel(self) -> None:
        """Clear a cancel request before starting a new reply."""
        self._cancel_event.clear()

    @property
    def cancelled(self) -> bool:
        """True while the current reply has been asked to stop."""
        return self._cancel_event.is_set()

    def stream(self, messages: list, enable_thinking: bool | None = None):
        """Yield the assistant reply for ``messages``, one chunk at a time.

        ``messages`` is an OpenAI-style list of ``{"role", "content"}`` dicts.
        Yields the **cumulative** reply text (not deltas), which is what the
        dashboard's streaming endpoint forwards to the browser.

        ``enable_thinking`` toggles the reasoning block for models whose chat
        template supports it (e.g. Qwen3.5). ``None`` leaves the model default.
        """
        if not self.loaded:
            self.load()
        # The server clears the flag when a request starts, but it may have
        # been set while the model was loading. Check again so Stop pressed
        # during a lazy load does not start generating anyway.
        if self._cancel_event.is_set():
            return
        yield from self._stream_server(messages, enable_thinking)

    def _stream_server(self, messages: list, enable_thinking: bool | None):
        """Stream a completion, polling ``_cancel_event`` so Stop is responsive.

        The HTTP response is read on a background thread into a queue and the
        generator drains that queue with a short timeout, re-checking the
        cancel flag each time — so a stalled generation can still be aborted
        promptly rather than only at the next token.
        """
        if self._cancel_event.is_set():
            return

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
                    state["error"] = AppError(
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
            if isinstance(error, AppError):
                raise error
            raise AppError(f"Lost connection to llama-server: {error}")
