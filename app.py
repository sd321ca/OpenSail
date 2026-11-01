"""Entry point for the ComfyUI Workflow UI.

Run with ``python app.py`` and visit http://127.0.0.1:7860
"""

from comfyui_ui import (
    GRADIO_AUTH,
    GRADIO_SERVER_NAME,
    GRADIO_SERVER_PORT,
    GRADIO_SERVER_PUBLIC_ACCESS,
    MOBILE_CSS,
    build_ui,
)


def main() -> None:
    demo = build_ui()
    # Bind to all interfaces so other devices on the LAN can reach the UI.
    # share=False (the default) keeps it off the public internet.
    # auth is a (username, password) tuple from the .env file, or None to
    # disable authentication.
    # css holds the responsive tweaks that make the UI work on narrow screens.
    # _app passes the already-built FastAPI app so the custom image-proxy route
    # registered in build_ui survives launch (launch otherwise replaces the
    # app instance, dropping any routes added beforehand).
    demo.launch(
        server_name=GRADIO_SERVER_NAME,
        server_port=int(GRADIO_SERVER_PORT),
        share=GRADIO_SERVER_PUBLIC_ACCESS,
        auth=GRADIO_AUTH,
        css=MOBILE_CSS,
        _app=demo.app,
    )


if __name__ == "__main__":
    main()
