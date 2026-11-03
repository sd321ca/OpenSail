"""Client-side assets for the Gradio app.

The stylesheet and the browser script live in ``mobile.css`` and
``fullscreen.js`` next to this module, so they can be edited with proper CSS /
JS highlighting instead of living inside Python strings. This module just reads
them once at import.
"""

from pathlib import Path

ASSETS_DIR = Path(__file__).parent

# Responsive tweaks and the full-screen editor styling. Passed to launch(css=).
MOBILE_CSS = (ASSETS_DIR / "mobile.css").read_text(encoding="utf-8")

# Phone-only full-screen editor for fields marked "fullscreen" in
# configs/fields.json. Passed to launch(js=).
FULLSCREEN_TEXT_JS = (ASSETS_DIR / "fullscreen.js").read_text(encoding="utf-8")
