"""A thin client for the ComfyUI HTTP API.

Wraps the handful of endpoints this app needs: submitting prompts, polling
history, downloading/uploading images and listing recent outputs.
"""

import io
import json
import os
import tempfile
import time
import uuid
from urllib.parse import urlencode, urlparse

import requests
from PIL import Image

from .config import COMFY_URL

try:  # websockets is optional; progress falls back to polling without it.
    import websockets
except ImportError:  # pragma: no cover - exercised only when not installed
    websockets = None


class ComfyUIError(RuntimeError):
    """Raised when ComfyUI returns an error or cannot be reached."""


class ComfyUIClient:
    """Client for a running ComfyUI instance."""

    def __init__(self, base_url: str = COMFY_URL, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- Prompt execution --------------------------------------------------

    def queue_prompt(self, workflow: dict, client_id: str) -> str:
        """Submit a workflow to ComfyUI and return the prompt_id."""
        payload = {"prompt": workflow, "client_id": client_id}
        resp = requests.post(
            f"{self.base_url}/prompt", json=payload, timeout=self.timeout
        )
        resp.raise_for_status()
        data = resp.json()
        if "prompt_id" not in data:
            raise ComfyUIError(f"ComfyUI did not return a prompt_id: {data}")
        return data["prompt_id"]

    def cancel_prompt(self, prompt_id: str | None = None) -> None:
        """Ask ComfyUI to stop the running prompt and drop it from the queue.

        Calls ``/interrupt`` to stop the currently executing prompt, then
        removes any still-queued entries (including ``prompt_id`` if given)
        via ``/queue``. Errors are swallowed so cancellation is best-effort:
        the prompt may already have finished, in which case there is nothing
        to cancel.
        """
        try:
            requests.post(
                f"{self.base_url}/interrupt", timeout=self.timeout
            )
        except requests.RequestException:
            pass

        try:
            resp = requests.get(
                f"{self.base_url}/queue", timeout=self.timeout
            )
            resp.raise_for_status()
            queue = resp.json()
        except (requests.RequestException, ValueError):
            return

        # ComfyUI reports pending/running items as [number, prompt_id, ...].
        for key in ("queue_pending", "queue_running"):
            for item in queue.get(key, []):
                if len(item) < 2:
                    continue
                item_id = item[1]
                if prompt_id is not None and item_id != prompt_id:
                    continue
                try:
                    requests.post(
                        f"{self.base_url}/queue",
                        json={"delete": [item_id]},
                        timeout=self.timeout,
                    )
                except requests.RequestException:
                    pass

    def _ws_url(self, client_id: str) -> str:
        """Build the ComfyUI WebSocket URL for a client id."""
        parsed = urlparse(self.base_url)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        return f"{scheme}://{parsed.netloc}/ws?clientId={client_id}"

    def stream_progress(
        self, prompt_id: str, client_id: str, timeout: float = 1800.0
    ):
        """Yield progress updates for a queued prompt.

        Connects to ComfyUI's WebSocket and yields ``(value, max, node)``
        tuples as the workflow executes, where ``value``/``max`` are the
        current and total step counts and ``node`` is the executing node id
        (or None). Yields ``(None, None, node)`` for non-progress events so
        callers can still show which node is running.

        Events are filtered by ``prompt_id`` so other clients' prompts do not
        interfere. The stream always terminates: it stops on the prompt's
        terminal event, when the prompt appears in history, or after
        ``timeout`` seconds.

        If the ``websockets`` package is unavailable, this falls back to
        yielding a single indeterminate update and returning, so callers can
        still poll for the result.
        """
        if websockets is None:
            yield (None, None, None)
            return

        import asyncio

        async def _listen():
            async with websockets.connect(
                self._ws_url(client_id), max_size=None
            ) as ws:
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    except asyncio.TimeoutError:
                        # No message this second; check history as a safety
                        # net so we never hang if a terminal event is missed.
                        if self._prompt_finished(prompt_id):
                            return
                        continue

                    if isinstance(raw, bytes):
                        # Binary frames carry preview images; ignore them.
                        continue

                    message = json.loads(raw)
                    msg_type = message.get("type")
                    data = message.get("data", {})

                    # Ignore events that belong to a different prompt.
                    event_prompt = data.get("prompt_id")
                    if event_prompt is not None and event_prompt != prompt_id:
                        continue

                    if msg_type == "progress":
                        yield (
                            data.get("value"),
                            data.get("max"),
                            data.get("node"),
                        )
                    elif msg_type == "executing":
                        node = data.get("node")
                        if node is None:
                            # Execution finished for this prompt.
                            return
                        yield (None, None, node)
                    elif msg_type in ("execution_success", "execution_error"):
                        return

        async def _run():
            async for update in _listen():
                yield update

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            agen = _run()
            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    update = loop.run_until_complete(agen.__anext__())
                except StopAsyncIteration:
                    break
                yield update
        finally:
            loop.close()

    def _prompt_finished(self, prompt_id: str) -> bool:
        """Return True if the prompt has an entry in ComfyUI's history."""
        try:
            resp = requests.get(
                f"{self.base_url}/history/{prompt_id}", timeout=self.timeout
            )
            resp.raise_for_status()
            return prompt_id in resp.json()
        except requests.RequestException:
            return False

    def wait_for_image(
        self, prompt_id: str, client_id: str, timeout: float = 300.0
    ) -> dict:
        """Poll history until the prompt finishes; return the first image ref."""
        return self.wait_for_output(prompt_id, client_id, "images", timeout)

    def wait_for_audio(
        self, prompt_id: str, client_id: str, timeout: float = 600.0
    ) -> dict:
        """Poll history until the prompt finishes; return the first audio ref."""
        return self.wait_for_output(prompt_id, client_id, "audio", timeout)

    def wait_for_video(
        self, prompt_id: str, client_id: str, timeout: float = 1800.0
    ) -> dict:
        """Poll history until the prompt finishes; return the first video ref.

        ComfyUI's SaveVideo node reports its result under the "images" key
        (with an "animated" flag), not a "video" key, so the video file ref is
        read from there.
        """
        return self.wait_for_output(prompt_id, client_id, "images", timeout)

    def wait_for_output(
        self,
        prompt_id: str,
        client_id: str,
        output_key: str,
        timeout: float = 300.0,
    ) -> dict:
        """Poll history until the prompt finishes; return the first output ref.

        ``output_key`` is the key under a node's output that holds the result,
        e.g. "images" for image workflows or "audio" for audio workflows.
        """
        start = time.time()
        while time.time() - start < timeout:
            resp = requests.get(
                f"{self.base_url}/history/{prompt_id}", timeout=self.timeout
            )
            resp.raise_for_status()
            history = resp.json()

            if prompt_id in history:
                outputs = history[prompt_id].get("outputs", {})
                for node_output in outputs.values():
                    results = node_output.get(output_key)
                    if results:
                        return results[0]
                raise ComfyUIError(
                    f"Workflow finished but produced no {output_key}."
                )

            time.sleep(1.0)

        raise TimeoutError(
            f"Timed out waiting for ComfyUI to finish the {output_key}."
        )

    # -- Images ------------------------------------------------------------

    def fetch_audio(self, audio_ref: dict) -> str:
        """Download an audio file from ComfyUI and return a local file path.

        Gradio's Audio component accepts a filepath, so the bytes are written
        to a temporary file whose suffix matches the source filename.
        """
        params = {
            "filename": audio_ref["filename"],
            "subfolder": audio_ref.get("subfolder", ""),
            "type": audio_ref.get("type", "output"),
        }
        resp = requests.get(
            f"{self.base_url}/view", params=params, timeout=120
        )
        resp.raise_for_status()

        suffix = os.path.splitext(audio_ref.get("filename", ""))[1] or ".mp3"
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(resp.content)
        return path

    def fetch_video(self, video_ref: dict) -> str:
        """Download a video file from ComfyUI and return a local file path.

        Gradio's Video component accepts a filepath, so the bytes are written
        to a temporary file whose suffix matches the source filename.
        """
        params = {
            "filename": video_ref["filename"],
            "subfolder": video_ref.get("subfolder", ""),
            "type": video_ref.get("type", "output"),
        }
        resp = requests.get(
            f"{self.base_url}/view", params=params, timeout=300
        )
        resp.raise_for_status()

        suffix = os.path.splitext(video_ref.get("filename", ""))[1] or ".mp4"
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(resp.content)
        return path

    def image_view_url(self, image_ref: dict) -> str:
        """Build a direct ComfyUI /view URL for an image reference."""
        params = {
            "filename": image_ref["filename"],
            "subfolder": image_ref.get("subfolder", ""),
            "type": image_ref.get("type", "output"),
        }
        return f"{self.base_url}/view?" + urlencode(params)

    def fetch_image_bytes(self, image_ref: dict) -> tuple[bytes, str]:
        """Download an image from ComfyUI and return (bytes, content_type).

        Used by the proxy route so the browser can load gallery images through
        the Gradio server even when it cannot reach ComfyUI directly.
        """
        params = {
            "filename": image_ref["filename"],
            "subfolder": image_ref.get("subfolder", ""),
            "type": image_ref.get("type", "output"),
        }
        resp = requests.get(
            f"{self.base_url}/view", params=params, timeout=60
        )
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/png")
        return resp.content, content_type

    def upload_image(self, image: Image.Image, prefix: str = "input") -> str:
        """Upload a PIL image to ComfyUI and return the stored filename.

        Transparent areas are composited onto white before encoding, so a
        sketch drawn on the image editor's blank (transparent) canvas uploads
        as a normal opaque image instead of a solid black one.
        """
        if image.mode in ("RGBA", "LA", "P"):
            rgba = image.convert("RGBA")
            opaque = Image.new("RGB", rgba.size, "white")
            opaque.paste(rgba, mask=rgba.split()[-1])
            image = opaque
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="PNG")
        buffer.seek(0)
        filename = f"{prefix}_{uuid.uuid4().hex}.png"
        files = {"image": (filename, buffer, "image/png")}
        data = {"overwrite": "true"}
        resp = requests.post(
            f"{self.base_url}/upload/image",
            files=files,
            data=data,
            timeout=60,
        )
        resp.raise_for_status()
        result = resp.json()
        # ComfyUI returns the stored name (and optional subfolder).
        name = result.get("name", filename)
        subfolder = result.get("subfolder", "")
        return f"{subfolder}/{name}" if subfolder else name

    def upload_audio(self, audio_path: str, prefix: str = "input") -> str:
        """Upload an audio file to ComfyUI and return the stored filename.

        ComfyUI's /upload/image endpoint accepts any file type, so it is used
        here for audio inputs (e.g. a music-cover reference song).
        """
        filename = f"{prefix}_{uuid.uuid4().hex}{os.path.splitext(audio_path)[1]}"
        with open(audio_path, "rb") as f:
            files = {"image": (filename, f, "application/octet-stream")}
            data = {"overwrite": "true"}
            resp = requests.post(
                f"{self.base_url}/upload/image",
                files=files,
                data=data,
                timeout=120,
            )
        resp.raise_for_status()
        result = resp.json()
        name = result.get("name", filename)
        subfolder = result.get("subfolder", "")
        return f"{subfolder}/{name}" if subfolder else name

    # -- History -----------------------------------------------------------

    def get_history(self) -> dict:
        """Return the raw ComfyUI history mapping (prompt_id -> entry)."""
        resp = requests.get(f"{self.base_url}/history", timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()
