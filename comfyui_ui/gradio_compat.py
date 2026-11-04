"""Workarounds for Gradio behaviour that breaks this app.

Gradio caches uploaded files in a content-addressed directory: two uploads with
the same bytes and the same name (for example ``background.png`` sent again by
an ``ImageEditor`` when Generate is pressed a second time) map to the same cache
path. On Windows Gradio cannot rename over the existing file, so it schedules a
background ``shutil.move``, which truncates the destination and copies the bytes
back in. A prediction that opens the file at that moment sees a half-written
image and fails with ``PIL.UnidentifiedImageError``.

The replacement below keeps an existing cache file when it already has the same
size and uses ``os.replace`` otherwise, so readers always see either the old or
the new complete file.
"""

from __future__ import annotations

import os
import shutil


def _move_uploaded_files_to_cache(
    files: list[str], destinations: list[str]
) -> None:
    """Move uploaded files to their cache paths without rewriting them in place.

    ``destinations`` are content-addressed by Gradio, so an existing file at a
    destination already contains the same bytes (unless a previous copy was
    interrupted, which the size check catches).
    """
    for file, dest in zip(files, destinations, strict=False):
        try:
            if (
                os.path.exists(dest)
                and os.path.getsize(dest) == os.path.getsize(file)
            ):
                # Nothing to do: keep the complete file and discard the copy.
                os.remove(file)
            else:
                # Atomic on the same filesystem, so a concurrent reader never
                # observes a truncated file.
                os.replace(file, dest)
        except OSError:
            # Fall back to Gradio's copy-and-delete for edge cases such as a
            # destination on a different filesystem.
            shutil.move(file, dest)


def apply_gradio_fixes() -> None:
    """Install the upload-cache workaround. Safe to call more than once."""
    try:
        from gradio import route_utils, routes
    except ImportError:  # pragma: no cover - Gradio is a hard dependency
        return

    if getattr(routes, "_opensail_upload_fix", False):
        return

    # ``routes`` imports the function by value for its background task, so both
    # module attributes must point at the replacement.
    routes.move_uploaded_files_to_cache = _move_uploaded_files_to_cache
    route_utils.move_uploaded_files_to_cache = _move_uploaded_files_to_cache
    routes._opensail_upload_fix = True
