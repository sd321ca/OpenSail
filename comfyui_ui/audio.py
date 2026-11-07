"""Text-to-speech and voice cloning via audio.cpp.

audio.cpp (https://github.com/0xShug0/audio.cpp) ships ``audiocpp_server``, an
OpenAI-compatible HTTP server over its ggml audio models. This module manages
that server as an external subprocess, exactly like the Chat tab manages
``llama-server``: it is started **lazily** on the first request and can be
stopped from the dashboard to free RAM/VRAM.

The selectable models live in ``configs/audio_models.json`` (see
:mod:`comfyui_ui.audio_models`). Their entries are compiled into a temporary
``server.json`` that the server is launched with, unless an explicit config is
set with ``audiocpp_config_path`` in ``configs/constants.json``.

Speech is generated through ``POST /v1/audio/speech`` (OpenAI-style), with an
optional ``voice`` (a preset or model-native voice id) or ``voice_ref`` (a
reference clip for voice cloning). ``audiocpp_server_path``, ``audiocpp_port``
and the backend settings also live in ``configs/constants.json``.
"""

import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

import requests

from .audio_models import AUDIO_MODELS
from .config import (
    AUDIOCPP_BACKEND,
    AUDIOCPP_CONFIG_PATH,
    AUDIOCPP_CUDA_BIN,
    AUDIOCPP_DEVICE,
    AUDIOCPP_FFMPEG_PATH,
    AUDIOCPP_IDLE_UNLOAD_MS,
    AUDIOCPP_MODEL_SPECS_DIR,
    AUDIOCPP_PORT,
    AUDIOCPP_SERVER_PATH,
    AUDIOCPP_THREADS,
    AUDIOCPP_VOICE_DIR,
)
from .errors import AppError


def _find_cuda_bin_dirs() -> list:
    """Return CUDA runtime directories to add to the server's ``PATH``.

    The Windows build of ``audiocpp_server`` links ``cufft64_12.dll`` (and uses
    cuBLAS/cuDART through ``ggml-cuda.dll``), which are not bundled with the
    release. When ``audiocpp_cuda_bin`` is set it is used as-is; otherwise the
    CUDA toolkit install folders are scanned (newest first) for a folder that
    provides ``cufft64_12.dll``. Returns an empty list when nothing is found.
    """
    configured = os.path.expanduser((AUDIOCPP_CUDA_BIN or "").strip())
    if configured:
        return [configured] if os.path.isdir(configured) else []

    toolkit = os.path.join(
        os.environ.get("ProgramFiles", r"C:\Program Files"),
        "NVIDIA GPU Computing Toolkit",
        "CUDA",
    )
    if not os.path.isdir(toolkit):
        return []

    found = []
    for version in sorted(os.listdir(toolkit), reverse=True):
        for sub in (os.path.join("bin", "x64"), "bin"):
            folder = os.path.join(toolkit, version, sub)
            if os.path.isfile(os.path.join(folder, "cufft64_12.dll")):
                found.append(folder)
    return found


def _port_listener_pids(port: int) -> list:
    """Return PIDs with a TCP endpoint on ``port`` (best effort, Windows only).

    Parses ``netstat`` and matches the local address column, so it does not
    depend on the (localized) connection-state text. Returns an empty list on
    other platforms or when ``netstat`` is unavailable.
    """
    if os.name != "nt":
        return []
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        out = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            creationflags=creationflags,
        ).stdout
    except OSError:
        return []
    pids = set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0].upper() != "TCP":
            continue
        if not parts[1].endswith(f":{port}"):
            continue
        try:
            pid = int(parts[4])
        except ValueError:
            continue
        if pid > 0:
            pids.add(pid)
    return sorted(pids)


def _is_audiocpp_process(pid: int) -> bool:
    """True when ``pid`` is an ``audiocpp_server`` process (best effort)."""
    if os.name != "nt":
        return False
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        out = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            creationflags=creationflags,
        ).stdout.strip()
    except OSError:
        return False
    return (
        out.startswith('"')
        and out[1:].split('"', 1)[0].lower() == "audiocpp_server.exe"
    )


def _stop_stale_servers(port: int, keep_pids=()) -> list:
    """Terminate stale ``audiocpp_server`` listeners on ``port``.

    A server from an earlier run can outlive the app (crash or reload) and keep
    holding the port. The next server then binds alongside it (the Windows
    socket is reusable), and requests — including the voice list — are answered
    by the stale instance. Killing the stale listeners first makes the new
    server the only one on the port. Returns the PIDs terminated.
    """
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    stopped = []
    for pid in _port_listener_pids(port):
        if pid in keep_pids or pid == os.getpid():
            continue
        if not _is_audiocpp_process(pid):
            continue
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
            stopped.append(pid)
        except OSError:
            pass
    return stopped


def _is_wav(path: str) -> bool:
    """Return True when ``path`` is a RIFF/WAVE file."""
    try:
        with open(path, "rb") as f:
            header = f.read(12)
    except OSError:
        return False
    return header[:4] == b"RIFF" and header[8:12] == b"WAVE"


def _resolve_ffmpeg() -> str | None:
    """Return the ffmpeg executable to use, or None when it is unavailable."""
    configured = os.path.expanduser((AUDIOCPP_FFMPEG_PATH or "").strip())
    if configured and os.path.isfile(configured):
        return configured
    return shutil.which("ffmpeg")


def _convert_to_wav(path: str) -> str:
    """Convert an audio file to a temporary PCM WAV and return its path.

    Tries ffmpeg first (broad format support: mp3, flac, ogg/opus, m4a, webm,
    ...), then the ``soundfile`` library as a fallback. Already-WAV files are
    returned unchanged. Raises ``AppError`` when no conversion is possible.
    """
    if _is_wav(path):
        return path

    out_path = os.path.join(
        tempfile.gettempdir(), f"audiocpp_ref_{uuid.uuid4().hex}.wav"
    )

    ffmpeg = _resolve_ffmpeg()
    if ffmpeg:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        try:
            proc = subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    path,
                    "-acodec",
                    "pcm_s16le",
                    out_path,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=creationflags,
            )
        except OSError as exc:
            raise AppError(f"Could not run ffmpeg: {exc}") from exc
        if proc.returncode == 0 and os.path.isfile(out_path):
            return out_path
        detail = proc.stderr.decode("utf-8", "replace").strip()[:300]
        raise AppError(
            f"Could not convert the reference clip to WAV with ffmpeg: {detail}"
        )

    # No ffmpeg: fall back to soundfile (WAV/FLAC/OGG and, with a recent
    # libsndfile, MP3).
    try:
        import soundfile as sf

        data, samplerate = sf.read(path, dtype="int16")
        sf.write(out_path, data, samplerate, subtype="PCM_16", format="WAV")
        return out_path
    except Exception as exc:  # noqa: BLE001
        raise AppError(
            "Could not convert the reference clip to WAV. Install ffmpeg (and "
            "set `audiocpp_ffmpeg_path` in configs/constants.json if it is not "
            f"on PATH) or upload a WAV file. ({exc})"
        ) from exc


def _sanitize_voice_name(name: str) -> str:
    """Return a filesystem-safe voice name, or "" when nothing usable is left.

    Keeps letters, digits, spaces, ``_`` and ``-`` (spaces become ``_``) and
    replaces everything else, so a name can never escape the voice directory.
    """
    cleaned = "".join(
        ch if (ch.isalnum() or ch in " _-") else "_"
        for ch in str(name or "").strip()
    )
    return cleaned.replace(" ", "_").strip("._-")


def _save_voice_reference(
    voice_dir: str, name: str, wav_path: str, transcript: str
) -> str:
    """Copy ``wav_path`` into ``voice_dir`` as ``name`` and record its text.

    audio.cpp reads a ``prompt_text`` file of ``<name>|<transcript>`` lines, so
    an existing entry for ``name`` is replaced and the transcript is collapsed
    onto one line. Returns the saved wav path.
    """
    os.makedirs(voice_dir, exist_ok=True)
    dest = os.path.join(voice_dir, f"{name}.wav")
    shutil.copyfile(wav_path, dest)

    prompt_path = os.path.join(voice_dir, "prompt_text")
    lines = []
    if os.path.isfile(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            lines = [
                line
                for line in f.read().splitlines()
                if not line.startswith(f"{name}|")
            ]
    one_line = " ".join(str(transcript or "").split())
    lines.append(f"{name}|{one_line}")
    with open(prompt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return dest


def _build_server_config() -> dict:
    """Return an audio.cpp ``server.json`` mapping built from the registry.

    Only the fields audio.cpp understands are emitted; each registry entry's
    optional passthrough keys (``load_options``, ``session_options``,
    ``default_request_options``, ``voice_presets``, ``default_voice_preset``)
    are copied when present.
    """
    models = []
    for entry in AUDIO_MODELS:
        model = {
            "id": entry["id"],
            "family": entry["family"],
            "path": entry["path"],
            "task": entry.get("task", "tts"),
            "mode": entry.get("mode", "offline"),
        }
        for key in (
            "load_options",
            "session_options",
            "default_request_options",
            "voice_presets",
            "default_voice_preset",
        ):
            if entry.get(key):
                model[key] = entry[key]
        models.append(model)

    config = {
        "host": "127.0.0.1",
        "port": AUDIOCPP_PORT,
        "backend": AUDIOCPP_BACKEND,
        "device": AUDIOCPP_DEVICE,
        "threads": AUDIOCPP_THREADS,
        "lazy_load": True,
        "models": models,
    }
    if AUDIOCPP_IDLE_UNLOAD_MS > 0:
        config["idle_unload_ms"] = AUDIOCPP_IDLE_UNLOAD_MS
    # A shared voice-cloning library: the server lists its wavs alongside the
    # model's own voices and clones any ``voice`` matching a basename. The
    # directory must exist when the server starts, so create it here.
    if AUDIOCPP_VOICE_DIR:
        os.makedirs(AUDIOCPP_VOICE_DIR, exist_ok=True)
        config["voice_dir"] = AUDIOCPP_VOICE_DIR
    return config


class AudioModel:
    """Lazy manager for an external ``audiocpp_server`` subprocess.

    The server is started on the first speech request and released when the
    process is terminated, so the same app can generate audio and then run
    ComfyUI image/music/video workflows without the audio models holding onto
    VRAM. A lock guards loading/unloading so concurrent requests cannot spawn
    two servers at once.
    """

    def __init__(self):
        self._server = None
        self._base_url: str | None = None
        self._log_file = None
        self._log_path: str | None = None
        self._config_path: str | None = None
        self._cancel_event = threading.Event()
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        """True while the server process is live."""
        return self._server is not None and self._server.poll() is None

    def status(self) -> str:
        """A short human-readable status line for the TTS view."""
        if not self.loaded:
            return "audio.cpp server not running (it starts on the first generation)."
        return f"audio.cpp server running on {self._base_url}"

    # -- process management -------------------------------------------------

    def _write_config_locked(self) -> str:
        """Write the generated ``server.json`` and return its path."""
        config_path = os.path.join(
            tempfile.gettempdir(), f"audiocpp_server_{AUDIOCPP_PORT}.json"
        )
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(_build_server_config(), f, indent=2)
        self._config_path = config_path
        return config_path

    def _start_locked(self) -> None:
        """Spawn audiocpp_server (after clearing any stale listener) and wait."""
        server_path = os.path.expanduser((AUDIOCPP_SERVER_PATH or "").strip())
        if not server_path or not os.path.isfile(server_path):
            raise AppError(
                "audiocpp_server not found. Set `audiocpp_server_path` in "
                "configs/constants.json to your audiocpp_server executable."
            )
        if not AUDIO_MODELS:
            raise AppError(
                "No audio.cpp models configured. Add entries to "
                "configs/audio_models.json (see the _example there)."
            )

        config_path = AUDIOCPP_CONFIG_PATH or self._write_config_locked()
        config_path = os.path.abspath(os.path.expanduser(config_path))
        cmd = [server_path, "--config", config_path]
        if AUDIOCPP_BACKEND:
            cmd += ["--backend", AUDIOCPP_BACKEND]
        # Help the server find model_specs/<family>.json when it is not run
        # from its own install folder.
        if AUDIOCPP_MODEL_SPECS_DIR and os.path.isdir(AUDIOCPP_MODEL_SPECS_DIR):
            cmd += ["--model-spec-override", AUDIOCPP_MODEL_SPECS_DIR]

        # A server from an earlier run can outlive the app and keep holding the
        # port; the process we are about to start would then share it and lose
        # requests (including the voice list) to the stale one. Clear any stale
        # audiocpp_server listeners first, and refuse to run if something else
        # still owns the port.
        own_pid = self._server.pid if self._server is not None else os.getpid()
        _stop_stale_servers(AUDIOCPP_PORT, keep_pids={own_pid})
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline and _port_listener_pids(AUDIOCPP_PORT):
            time.sleep(0.2)
        if _port_listener_pids(AUDIOCPP_PORT):
            raise AppError(
                f"Port {AUDIOCPP_PORT} is already in use by another process. "
                "Stop it (or change `audiocpp_port` in configs/constants.json) "
                "and try again."
            )

        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        # The server looks for its CUDA runtime DLLs on PATH; add the detected
        # (or configured) CUDA bin folder so it does not need a system-wide
        # PATH change.
        env = os.environ.copy()
        cuda_dirs = _find_cuda_bin_dirs()
        if cuda_dirs:
            env["PATH"] = os.pathsep.join(cuda_dirs + [env.get("PATH", "")])
        # Capture the server log so a startup failure reports the real reason.
        self._log_path = os.path.join(
            tempfile.gettempdir(), f"audiocpp_server_{AUDIOCPP_PORT}.log"
        )
        self._log_file = open(
            self._log_path, "w", encoding="utf-8", errors="replace"
        )
        try:
            self._server = subprocess.Popen(
                cmd,
                cwd=os.path.dirname(server_path) or None,
                env=env,
                stdout=self._log_file,
                stderr=subprocess.STDOUT,
                creationflags=creationflags,
            )
        except OSError as exc:
            self._close_log()
            raise AppError(f"Failed to start audiocpp_server: {exc}") from exc

        self._base_url = f"http://127.0.0.1:{AUDIOCPP_PORT}"
        self._wait_for_server()

    def _log_tail(self, lines: int = 15) -> str:
        """Return the last few lines of the captured server output."""
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
        """Close and remove the server log file (if any)."""
        log_file, self._log_file = self._log_file, None
        if log_file is not None:
            try:
                log_file.close()
            except OSError:
                pass
        # Keep the log on disk when the server failed, so the reason survives
        # the error dialog; only remove it on a clean close.
        self._log_path = None

    def _wait_for_server(self, timeout: float = 300.0) -> None:
        """Block until the server answers its health check, or raise."""
        deadline = time.monotonic() + timeout
        health = f"{self._base_url}/health"
        while time.monotonic() < deadline:
            if self._server is not None and self._server.poll() is not None:
                code = self._server.returncode
                tail = self._log_tail()
                self._close_locked()
                message = f"audiocpp_server exited during startup (code {code})."
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
        message = "Timed out waiting for audiocpp_server to become ready."
        if tail:
            message += f"\n\n{tail}"
        raise AppError(message)

    def _close_locked(self) -> None:
        """Terminate the server and reclaim its memory. Lock must be held."""
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

    def load(self) -> str:
        """Start the server if it is not running and return a status line."""
        with self._lock:
            if not self.loaded:
                self._start_locked()
        return self.status()

    def unload(self) -> str:
        """Stop the server and return a status message."""
        with self._lock:
            if not self.loaded:
                return self.status()
            self._close_locked()
        return "audio.cpp server stopped."

    def cancel(self) -> None:
        """Request that an in-flight generation stop being awaited."""
        self._cancel_event.set()

    # -- API ----------------------------------------------------------------

    def list_voices(self, model_id: str) -> list:
        """Return the voice ids / preset names the server offers for a model."""
        self.load()
        try:
            resp = requests.get(
                f"{self._base_url}/v1/audio/voices",
                params={"model": model_id},
                timeout=30,
            )
            resp.raise_for_status()
            return list(resp.json().get("voices", []))
        except requests.RequestException as exc:
            raise AppError(f"Could not list voices: {exc}") from exc

    def generate(
        self,
        model_id: str,
        text: str,
        voice: str | None = None,
        speed: float | None = None,
        seed: int | None = None,
        max_tokens: int | None = None,
        voice_ref_path: str | None = None,
        reference_text: str | None = None,
    ):
        """Generate speech, yielding ``(status, audio_path)`` while it works.

        The HTTP request runs on a background thread so the Stop button can
        make the generator return promptly; the final yield carries the WAV
        path. Raises :class:`AppError` on failure.

        ``voice`` (a preset/native id) and ``voice_ref_path`` (a clone clip) are
        mutually exclusive; when a reference clip is given it takes precedence
        and ``voice`` is not sent.
        """
        if not text or not str(text).strip():
            raise AppError("Please enter the text to speak.")
        if not model_id:
            raise AppError("Please select a model.")

        self.load()
        # A fresh request clears any previous cancel request.
        self._cancel_event.clear()

        payload: dict = {
            "model": model_id,
            "input": str(text),
            "response_format": "wav",
        }
        # A reference clip overrides the Voice preset: audio.cpp (and PocketTTS
        # in particular) rejects a request that names both a preset and a clone.
        use_ref = bool(voice_ref_path and os.path.isfile(voice_ref_path))
        if voice and not use_ref:
            payload["voice"] = voice
        # Only send a non-default speed. Some sessions (e.g. PocketTTS) reject
        # any runtime speed/style control, including an explicit 1.0.
        if speed and float(speed) != 1.0:
            payload["speed"] = float(speed)
        if seed not in (None, ""):
            # audio.cpp accepts uint64 seeds; send a string to avoid float
            # precision loss for large values.
            payload["seed"] = str(int(seed))
        if max_tokens:
            payload["max_tokens"] = int(max_tokens)
        # The audio.cpp default build only decodes WAV references, so convert
        # any other upload format (mp3, flac, ogg/opus, m4a, ...) to WAV first.
        converted_ref = None
        if use_ref:
            converted_ref = _convert_to_wav(voice_ref_path)
            payload["voice_ref"] = os.path.abspath(converted_ref)
            if reference_text and str(reference_text).strip():
                payload["reference_text"] = str(reference_text)

        url = f"{self._base_url}/v1/audio/speech"
        result: dict = {
            "bytes": None,
            "error": None,
            "done": False,
            "resp": None,
            "closing": False,
        }

        def _run() -> None:
            try:
                resp = requests.post(
                    url, json=payload, stream=True, timeout=(10, None)
                )
                result["resp"] = resp
                if resp.status_code != 200:
                    detail = resp.text[:500]
                    result["error"] = AppError(
                        f"audiocpp_server error {resp.status_code}: {detail}"
                    )
                    return
                data = bytearray()
                for chunk in resp.iter_content(chunk_size=16384):
                    if self._cancel_event.is_set():
                        break
                    if chunk:
                        data.extend(chunk)
                result["bytes"] = bytes(data)
            except Exception as exc:  # noqa: BLE001
                # A close triggered by cancel() is expected, not an error.
                if not self._cancel_event.is_set() and not result["closing"]:
                    result["error"] = exc
            finally:
                result["done"] = True

        reader = threading.Thread(
            target=_run, name="audiocpp-speech", daemon=True
        )
        reader.start()

        try:
            yield "Generating audio...", None
            while not result["done"]:
                if self._cancel_event.is_set():
                    result["closing"] = True
                    resp = result.get("resp")
                    if resp is not None:
                        try:
                            resp.close()
                        except Exception:  # noqa: BLE001
                            pass
                    yield "Cancelled.", None
                    return
                time.sleep(0.25)

            if self._cancel_event.is_set():
                yield "Cancelled.", None
                return

            error = result["error"]
            if error is not None:
                if isinstance(error, AppError):
                    raise error
                raise AppError(f"Lost connection to audiocpp_server: {error}")

            data = result["bytes"] or b""
            if not data:
                raise AppError("audiocpp_server returned no audio.")

            out_path = os.path.join(
                tempfile.gettempdir(), f"audiocpp_{uuid.uuid4().hex}.wav"
            )
            with open(out_path, "wb") as f:
                f.write(data)
            yield "Done.", out_path
        finally:
            # Remove the converted reference copy (the original is left alone).
            if converted_ref and converted_ref != voice_ref_path:
                try:
                    os.remove(converted_ref)
                except OSError:
                    pass
