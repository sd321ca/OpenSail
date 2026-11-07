"""Start and stop a local ComfyUI process from the dashboard.

OpenSail normally points at an already-running ComfyUI instance. This module
adds optional lifecycle management for a local install: it can launch the
portable ``python_embeded`` build and terminate the process again. Only a
process started by this module is tracked; an instance started by the user
elsewhere is detected but never killed.
"""

import os
import subprocess
import tempfile
import time

import requests

from .config import (
    COMFY_DIR,
    COMFY_MAIN,
    COMFY_PYTHON,
    COMFY_SHOW_CONSOLE,
    COMFY_START_ARGS,
    COMFY_START_TIMEOUT,
    COMFY_URL,
)
from .errors import AppError


class ComfyUIProcess:
    """Lazy manager for a local ComfyUI subprocess."""

    def __init__(self) -> None:
        self._process = None
        self._log_file = None
        self._log_path: str | None = None

    @property
    def running(self) -> bool:
        """True while the ComfyUI process started by OpenSail is alive."""
        return self._process is not None and self._process.poll() is None

    @property
    def configured(self) -> bool:
        """True when the Python executable and main.py can be found."""
        return bool(
            COMFY_PYTHON
            and COMFY_MAIN
            and os.path.isfile(COMFY_PYTHON)
            and os.path.isfile(COMFY_MAIN)
        )

    def reachable(self) -> bool:
        """True when the configured ComfyUI HTTP endpoint answers."""
        try:
            response = requests.get(
                f"{COMFY_URL.rstrip('/')}/history", timeout=2
            )
            return response.status_code < 500
        except requests.RequestException:
            return False

    def status(self) -> str:
        """A short human-readable status line for the sidebar."""
        if self.running:
            return f"ComfyUI is running (started by OpenSail, pid {self._process.pid})."
        if self.reachable():
            return "ComfyUI is running (started outside OpenSail)."
        return "ComfyUI is not running."

    # -- process management -------------------------------------------------

    def _log_tail(self, lines: int = 20) -> str:
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

    def _terminate(self, process) -> None:
        """Stop ``process`` and any children it spawned."""
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            try:
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creationflags,
                )
            except OSError:
                pass
        else:
            try:
                process.terminate()
            except OSError:
                pass
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass

    def _close(self) -> None:
        """Terminate the managed process (if alive) and close its log."""
        process, self._process = self._process, None
        if process is not None and process.poll() is None:
            self._terminate(process)
        self._close_log()

    def start(self) -> str:
        """Start ComfyUI and wait for its HTTP endpoint to answer."""
        if self.running:
            return self.status()
        if self.reachable():
            return "ComfyUI is already running."
        if not self.configured:
            raise AppError(
                "ComfyUI is not configured. Set `comfy_dir` in "
                "configs/constants.json to the folder containing "
                "python_embeded and ComfyUI."
            )

        if self._process is not None:
            self._close()

        cmd = [COMFY_PYTHON, "-s", COMFY_MAIN, *COMFY_START_ARGS]
        cwd = COMFY_DIR or os.path.dirname(COMFY_MAIN) or None
        show_console = os.name == "nt" and COMFY_SHOW_CONSOLE
        if show_console:
            creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
            stdout = None
            stderr = None
        else:
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            self._log_path = os.path.join(
                tempfile.gettempdir(), "opensail_comfyui.log"
            )
            self._log_file = open(
                self._log_path, "w", encoding="utf-8", errors="replace"
            )
            stdout = self._log_file
            stderr = subprocess.STDOUT
        try:
            self._process = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=stdout,
                stderr=stderr,
                creationflags=creationflags,
            )
        except OSError as exc:
            self._close_log()
            raise AppError(f"Failed to start ComfyUI: {exc}") from exc

        deadline = time.monotonic() + COMFY_START_TIMEOUT
        while time.monotonic() < deadline:
            code = self._process.poll()
            if code is not None:
                tail = self._log_tail()
                self._close()
                message = f"ComfyUI exited during startup (code {code})."
                if tail:
                    message += f"\n\n{tail}"
                raise AppError(message)
            if self.reachable():
                return self.status()
            time.sleep(1.0)

        tail = self._log_tail()
        self._close()
        message = "Timed out waiting for ComfyUI to start."
        if tail:
            message += f"\n\n{tail}"
        raise AppError(message)

    def stop(self) -> str:
        """Stop the ComfyUI process started by OpenSail."""
        if self.running:
            self._close()
            return "ComfyUI stopped."
        if self._process is not None:
            self._close()
        if self.reachable():
            raise AppError(
                "ComfyUI is running, but it was not started by OpenSail. "
                "Stop it manually."
            )
        return "ComfyUI is not running."

    def unload(self) -> str:
        """Stop a managed process on app shutdown, without raising errors."""
        if self.running:
            self._close()
            return "ComfyUI stopped."
        if self._process is not None:
            self._close()
        return "ComfyUI is not running."
