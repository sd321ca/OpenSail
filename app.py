"""Entry point for the OpenSail dashboard.

Run with ``python app.py`` and visit http://127.0.0.1:7860
"""

import uvicorn

from comfyui_ui.config import SERVER_NAME, SERVER_PORT
from comfyui_ui.server import app


def main() -> None:
    port = int(SERVER_PORT)
    print(f"OpenSail is running at http://127.0.0.1:{port}")
    uvicorn.run(app, host=str(SERVER_NAME), port=port, log_level="info")


if __name__ == "__main__":
    main()
