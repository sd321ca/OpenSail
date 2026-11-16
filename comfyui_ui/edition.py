"""Edition loading: community by default, premium when installed.

The premium package lives outside ``comfyui_ui`` and registers itself through
:func:`load`. Nothing in ``comfyui_ui`` imports it directly, so a checkout
without ``opensail_premium`` runs the community edition and contains none of
its code.

When the package is present it is always loaded. Its own licence check decides
whether accounts switch on, so an unlicensed install behaves exactly like the
community edition while still offering the licence form. The package must
provide::

    def register(capabilities: dict, hooks: dict) -> None: ...
"""

import importlib

# What the current edition can do. The frontend reads this from
# ``/api/bootstrap`` to decide which controls to show.
CAPABILITIES = {
    "accounts": False,
    "quotas": False,
    "licensing": False,
    "admin": False,
}

# Extension points premium fills in. Keeping them in a dict (rather than
# importing premium directly) is what keeps the community edition independent.
HOOKS = {
    # (Request) -> Owner | None. None means "not authenticated".
    "auth_provider": None,
    # FastAPI routers appended to the app.
    "mount_routes": [],
    # Path prefixes reachable before signing in (for example ``/api/login``).
    "public_paths": (),
    # Callables run on startup / shutdown.
    "startup": [],
    "shutdown": [],
    # (Owner, action) -> None; raises AppError when a quota is exhausted.
    "quota_check": None,
    # Human-readable licence state for the settings card.
    "licence_state": None,
}

_EDITION = None


def load() -> str:
    """Load the premium package when present, else the community edition."""
    global _EDITION
    if _EDITION is not None:
        return _EDITION

    try:
        module = importlib.import_module("opensail_premium")
    except ModuleNotFoundError as exc:
        # Only the package itself may be missing without it being a problem;
        # anything else means premium is installed but cannot run.
        if (exc.name or "") != "opensail_premium":
            raise SystemExit(
                "OpenSail Premium is installed but could not be loaded "
                f"({exc.name or exc}). Run `pip install -r requirements.txt`."
            ) from exc
        _EDITION = "community"
        return _EDITION

    module.register(CAPABILITIES, HOOKS)
    _EDITION = "premium"
    return _EDITION


def current() -> str:
    """Return the loaded edition name (community until :func:`load` runs)."""
    return _EDITION or "community"


def can(capability: str) -> bool:
    """Return whether the loaded edition provides a capability."""
    return bool(CAPABILITIES.get(capability))
