# SPDX-License-Identifier: LicenseRef-Proprietary-OpenSail
"""OpenSail Premium: accounts, seats and LemonSqueezy licence activation.

This package is proprietary and source-available; see LICENSE in this
directory. It is loaded by :func:`comfyui_ui.edition.load` whenever it can be
imported, and is never imported by ``comfyui_ui`` directly. A licence turns its
features on; without one it registers only the licence routes.
"""

from . import accounts, licence

__version__ = "1.0.0"


def register(capabilities: dict, hooks: dict) -> None:
    """Install the premium edition into the running app.

    Called once by :func:`comfyui_ui.edition.load`. Routes are always mounted so
    a licence can be activated without restarting; the account system itself
    only takes over authentication once a valid licence is present.
    """
    state = licence.load_state()

    hooks["licence_state"] = licence.state_payload
    hooks["mount_routes"].extend([licence.router, accounts.router])

    if not state.valid:
        # Behave exactly like the community edition until a key is activated.
        return

    accounts.ensure_schema()
    capabilities.update(accounts=True, admin=True, licensing=True)
    hooks["auth_provider"] = accounts.owner_from_session
    hooks["public_paths"] = tuple(hooks.get("public_paths") or ()) + (
        "/api/login",
        "/api/logout",
        "/api/profiles",
    )
    hooks["startup"].append(accounts.startup)


def activate(capabilities: dict, hooks: dict) -> None:
    """Enable the account system after a key is activated at runtime."""
    capabilities.update(accounts=True, admin=True, licensing=True)
    hooks["auth_provider"] = accounts.owner_from_session
    existing = tuple(hooks.get("public_paths") or ())
    for path in ("/api/login", "/api/logout", "/api/profiles"):
        if path not in existing:
            existing += (path,)
    hooks["public_paths"] = existing
    if accounts.startup not in hooks["startup"]:
        hooks["startup"].append(accounts.startup)
