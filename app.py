"""Entry point for the OpenSail dashboard.

Run with ``python app.py`` and visit http://127.0.0.1:7860. If
``configs/certs/cert.pem`` and ``configs/certs/key.pem`` exist, the app serves
HTTPS instead.
"""

import os

import uvicorn

from comfyui_ui.config import (
    BASE_DIR,
    SERVER_NAME,
    SERVER_PORT,
    SERVER_SSL_CERTFILE,
    SERVER_SSL_KEYFILE,
)
from comfyui_ui.server import app


def _resolve_path(path: str) -> str:
    """Expand ``~`` and make relative certificate paths project-relative."""
    path = os.path.expanduser((path or "").strip())
    if path and not os.path.isabs(path):
        path = os.path.join(BASE_DIR, path)
    return path


def _ssl_paths() -> tuple[str | None, str | None]:
    """Return the certificate/key paths when both files exist, else None."""
    certfile = _resolve_path(SERVER_SSL_CERTFILE)
    keyfile = _resolve_path(SERVER_SSL_KEYFILE)
    cert_exists = bool(certfile) and os.path.isfile(certfile)
    key_exists = bool(keyfile) and os.path.isfile(keyfile)
    if cert_exists and key_exists:
        return certfile, keyfile
    if cert_exists != key_exists:
        print(
            "TLS certificate/key pair is incomplete; serving HTTP. "
            f"Looked for: {certfile} and {keyfile}"
        )
    return None, None


def main() -> None:
    port = int(SERVER_PORT)
    certfile, keyfile = _ssl_paths()
    scheme = "https" if certfile else "http"
    print(f"OpenSail is running at {scheme}://127.0.0.1:{port}")
    uvicorn.run(
        app,
        host=str(SERVER_NAME),
        port=port,
        log_level="info",
        ssl_certfile=certfile,
        ssl_keyfile=keyfile,
    )


if __name__ == "__main__":
    main()
