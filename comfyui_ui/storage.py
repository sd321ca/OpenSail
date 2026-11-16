"""Owner-scoped storage for per-user data.

The community edition has a single owner (:data:`config.LOCAL_OWNER_ID`);
premium creates one directory per account. Files that describe a workspace
(presets, field selection, notes, personas) and the media a user generates live
under ``data/users/<id>/``, so two accounts never read or write the same file.
"""

import json
import os

from .config import USERS_DIR

# Per-owner directories, created on demand.
OWNER_DIRS = ("media", "thumbnails", "uploads")

# Saved voice references share a single directory, because audio.cpp is given
# one ``voice_dir`` when it starts. Files are namespaced as ``u<id>__<name>``
# so every account only sees its own voices (see ``audio.list_saved_voices``).
VOICE_PREFIX = "u{owner}__"


def owner_root(owner_id: int) -> str:
    """Return the directory that holds one owner's data."""
    return os.path.join(USERS_DIR, str(int(owner_id)))


def owner_path(owner_id: int, name: str) -> str:
    """Return a path inside an owner's directory without creating it."""
    return os.path.join(owner_root(owner_id), name)


def owner_file(owner_id: int, name: str) -> str:
    """Return the path of one of an owner's workspace JSON files."""
    return owner_path(owner_id, name)


def owner_dir(owner_id: int, name: str) -> str:
    """Return an owner's directory, creating it when missing."""
    path = owner_path(owner_id, name)
    os.makedirs(path, exist_ok=True)
    return path


def ensure_owner_tree(owner_id: int) -> None:
    """Create every directory an owner needs."""
    os.makedirs(owner_root(owner_id), exist_ok=True)
    for name in OWNER_DIRS:
        owner_dir(owner_id, name)


def voice_prefix(owner_id: int) -> str:
    """Return the filename prefix that namespaces one owner's voices."""
    return VOICE_PREFIX.format(owner=int(owner_id))


def list_owners() -> list[int]:
    """Return the ids of the owners that have a data directory."""
    if not os.path.isdir(USERS_DIR):
        return []
    try:
        names = os.listdir(USERS_DIR)
    except OSError:
        return []
    return sorted(int(name) for name in names if name.isdigit())


def write_json_atomic(path: str, data) -> None:
    """Write ``data`` as JSON, replacing ``path`` atomically.

    Parent directories are created when missing, and a failed write leaves the
    previous file untouched because the temporary file is renamed into place.
    """
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp_path = path + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
