"""Client-side assets for the Gradio app.

The stylesheet and the browser scripts live next to this module, in
``mobile.css``, ``fullscreen.js`` and ``slider.js``, so they can be edited with
proper CSS / JS highlighting instead of living inside Python strings. This
module reads them once at import.
"""

from pathlib import Path

ASSETS_DIR = Path(__file__).parent

# Responsive tweaks, the full-screen editor styling and the read-only slider
# readout. Passed to launch(css=).
MOBILE_CSS = (ASSETS_DIR / "mobile.css").read_text(encoding="utf-8")

# Phone-only full-screen editor for fields marked "fullscreen" in
# configs/fields.json.
FULLSCREEN_TEXT_JS = (ASSETS_DIR / "fullscreen.js").read_text(encoding="utf-8")

# Keeps the number box next to each slider visible but read-only.
SLIDER_JS = (ASSETS_DIR / "slider.js").read_text(encoding="utf-8")


def _bundle(*scripts: str) -> str:
    """Combine per-feature scripts into one entry point.

    ``launch(js=...)`` takes a single script, so each feature's script (an arrow
    function) is called from one wrapper that Gradio runs on page load.
    """
    body = "\n".join(f"    ({script.strip()})();" for script in scripts)
    return "() => {\n" + body + "\n}\n"


APP_JS = _bundle(FULLSCREEN_TEXT_JS, SLIDER_JS)
