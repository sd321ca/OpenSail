# SPDX-License-Identifier: LicenseRef-Proprietary-OpenSail
"""LemonSqueezy licence activation and storage.

A licence key is activated against LemonSqueezy and the resulting state is
stored in SQLite so premium features remain enabled across restarts.
"""

import json
import platform
import socket
import threading
import time
from dataclasses import dataclass

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from comfyui_ui import db, edition

LEMONSQUEEZY_ACTIVATE_URL = "https://api.lemonsqueezy.com/v1/licenses/activate"
LEMONSQUEEZY_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate"
REQUEST_TIMEOUT = 15
# The store sells one product: a lifetime licence with unlimited seats. The
# column stays for compatibility with the account limit check, but every
# valid licence is stored at this value.
UNLIMITED_SEATS = 9999

MIGRATIONS = [
    (
        "premium:0002",
        """
        CREATE TABLE IF NOT EXISTS licence_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          valid INTEGER NOT NULL DEFAULT 0,
          license_key TEXT NOT NULL DEFAULT '',
          instance_id TEXT NOT NULL DEFAULT '',
          licence_id TEXT NOT NULL DEFAULT '',
          holder TEXT NOT NULL DEFAULT '',
          seats INTEGER NOT NULL DEFAULT 0,
          issued TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          activated_at INTEGER NOT NULL DEFAULT 0,
          raw TEXT NOT NULL DEFAULT ''
        );
        """,
    ),
]

router = APIRouter()


class ActivateBody(BaseModel):
    key: str
    username: str = ""
    password: str = ""


@dataclass
class LicenceState:
    """The result of checking the installed licence."""

    valid: bool
    reason: str = ""
    licence_id: str = ""
    holder: str = ""
    seats: int = 0
    issued: str = ""
    source: str = ""


_SCHEMA_LOCK = threading.Lock()
_SCHEMA_READY = False


def ensure_schema() -> None:
    """Create the licence storage table once per process."""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        db.apply_migrations(MIGRATIONS)
        _SCHEMA_READY = True


def _instance_name() -> str:
    host = socket.gethostname() or platform.node() or "opensail"
    return f"opensail-{host}"


def _parse_holder(data: dict) -> str:
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    lk = data.get("license_key") if isinstance(data.get("license_key"), dict) else {}
    for source in (meta, lk, data):
        for key in ("customer_name", "customer_email", "user_name", "user_email"):
            value = source.get(key)
            if value:
                return str(value)
    return ""


def _parse_issued(data: dict) -> str:
    lk = data.get("license_key") if isinstance(data.get("license_key"), dict) else {}
    for source in (lk, data):
        value = source.get("created_at") or source.get("activated_at")
        if value:
            return str(value)[:10]
    return time.strftime("%Y-%m-%d")


def _parse_instance_id(data: dict) -> str:
    inst = data.get("instance") if isinstance(data.get("instance"), dict) else {}
    value = inst.get("id") or data.get("instance_id") or ""
    return str(value)


def _parse_licence_id(data: dict, license_key: str) -> str:
    lk = data.get("license_key") if isinstance(data.get("license_key"), dict) else {}
    value = lk.get("id") or lk.get("key") or ""
    if value:
        return str(value)
    # Avoid storing/echoing the full key as an id; use a short suffix.
    key = (license_key or "").strip()
    return f"ls_{key[-8:]}" if len(key) >= 8 else "ls_licence"


def _row_state(row) -> LicenceState:
    if row is None:
        return LicenceState(False, "No licence is installed.")
    valid = bool(row["valid"])
    if valid:
        return LicenceState(
            valid=True,
            licence_id=row["licence_id"] or "",
            holder=row["holder"] or "",
            seats=UNLIMITED_SEATS,
            issued=row["issued"] or "",
            source="database",
        )
    reason = row["reason"] or "The licence is not active."
    return LicenceState(False, reason, source="database")


def load_state() -> LicenceState:
    """Return the stored LemonSqueezy licence state, if any."""
    try:
        ensure_schema()
        with db.connect() as conn:
            row = conn.execute(
                "SELECT * FROM licence_state WHERE id = 1"
            ).fetchone()
        return _row_state(row)
    except Exception:
        return LicenceState(False, "Could not read the stored licence.")


def _save_state(
    *,
    valid: bool,
    license_key: str = "",
    instance_id: str = "",
    licence_id: str = "",
    holder: str = "",
    seats: int = UNLIMITED_SEATS,
    issued: str = "",
    status: str = "",
    reason: str = "",
    raw: dict | None = None,
) -> LicenceState:
    ensure_schema()
    now = int(time.time())
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO licence_state (
              id, valid, license_key, instance_id, licence_id, holder, seats,
              issued, status, reason, activated_at, raw
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              valid=excluded.valid,
              license_key=excluded.license_key,
              instance_id=excluded.instance_id,
              licence_id=excluded.licence_id,
              holder=excluded.holder,
              seats=excluded.seats,
              issued=excluded.issued,
              status=excluded.status,
              reason=excluded.reason,
              activated_at=excluded.activated_at,
              raw=excluded.raw
            """,
            (
                1 if valid else 0,
                license_key,
                instance_id,
                licence_id,
                holder,
                seats,
                issued,
                status,
                reason,
                now if valid else 0,
                json.dumps(raw or {}, ensure_ascii=False),
            ),
        )
    return load_state()


def _post(url: str, payload: dict) -> dict | None:
    """POST to the licence API, returning a JSON object or None."""
    try:
        response = requests.post(
            url,
            json=payload,
            timeout=REQUEST_TIMEOUT,
            headers={"Accept": "application/json"},
        )
    except requests.RequestException:
        return None
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _parse_status(data: dict) -> str:
    lk = data.get("license_key") if isinstance(data.get("license_key"), dict) else {}
    return str(lk.get("status") or "active")


def _activated_state(data: dict, key: str) -> dict:
    """Build ``_save_state`` arguments from an activate/validate response."""
    return {
        "valid": True,
        "license_key": key,
        "instance_id": _parse_instance_id(data),
        "licence_id": _parse_licence_id(data, key),
        "holder": _parse_holder(data),
        "seats": UNLIMITED_SEATS,
        "issued": _parse_issued(data),
        "status": _parse_status(data),
        "reason": "",
        "raw": data,
    }


def _stored_key() -> str:
    """Return the licence key currently stored, if any."""
    ensure_schema()
    with db.connect() as conn:
        row = conn.execute(
            "SELECT license_key FROM licence_state WHERE id = 1"
        ).fetchone()
    return str(row["license_key"] or "") if row is not None else ""


def activate_with_lemonsqueezy(license_key: str) -> LicenceState:
    """Activate a licence key with LemonSqueezy and persist the result.

    Activation registers this installation as an instance, which is what the
    LemonSqueezy dashboard shows. A key that is already activated elsewhere
    still validates as a real licence, so it is accepted too; the alternative
    would strand anyone who reinstalled or moved to a new machine. A failed
    attempt is never written to the database, so a typo cannot turn off a
    working licence.
    """
    key = (license_key or "").strip()
    if not key:
        return LicenceState(False, "Enter a licence key to activate.")

    activation = _post(
        LEMONSQUEEZY_ACTIVATE_URL,
        {"license_key": key, "instance_name": _instance_name()},
    )
    if activation is None:
        return LicenceState(
            False,
            "Could not reach LemonSqueezy. Check your connection and try again.",
        )
    if activation.get("activated"):
        return _save_state(**_activated_state(activation, key))

    # Activation can fail when the key is already active on this (or another)
    # installation. Validation tells a real licence apart from a bad key.
    validation = _post(LEMONSQUEEZY_VALIDATE_URL, {"license_key": key})
    if validation is not None and validation.get("valid"):
        current = load_state()
        if current.valid and _stored_key() == key:
            # Re-submitting the installed key must not replace richer
            # activation data (seats, holder, instance) with the thinner
            # validation payload.
            return current
        return _save_state(**_activated_state(validation, key))

    reason = ""
    for source in (activation, validation):
        if source:
            reason = str(source.get("error") or source.get("message") or "").strip()
            if reason:
                break
    return LicenceState(False, reason or "The licence key could not be activated.")


def state_payload() -> dict:
    """Return the licence state for ``/api/bootstrap`` and the settings card."""
    state = load_state()
    return {
        "valid": state.valid,
        "reason": state.reason,
        "id": state.licence_id,
        "holder": state.holder,
        "seats": state.seats,
        # The store has one product with no per-seat limit. The flag keeps the
        # client from printing the internal sentinel as a user count.
        "unlimited": state.valid and state.seats >= UNLIMITED_SEATS,
        "issued": state.issued,
        "edition": edition.current(),
        # True when a licence record exists in the database.
        "installed": bool(state.source),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/api/licence")
def get_licence() -> dict:
    """Return the installed licence, if any."""
    return {"licence": state_payload()}


@router.post("/api/licence")
def activate_licence(body: ActivateBody) -> dict:
    """Activate a LemonSqueezy licence key and enable premium features.

    Activating takes effect immediately: the premium package flips its
    capabilities and installs the session-based auth provider, so no restart is
    needed. An existing administrator can replace the key later.
    """
    import opensail_premium

    from comfyui_ui import identity

    from . import accounts

    owner = identity.current_owner()
    if not owner.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required.")

    accounts.ensure_schema()
    username = (body.username or "").strip()
    password = body.password or ""
    first_admin = accounts.user_count() == 0
    # Check this before calling LemonSqueezy: a key that activates but then
    # lacks admin credentials would leave a half-finished activation behind.
    if first_admin and (not username or not password):
        raise HTTPException(
            status_code=400,
            detail="Set an administrator name and password to finish activation.",
        )

    state = activate_with_lemonsqueezy(body.key or "")
    if not state.valid:
        raise HTTPException(status_code=400, detail=state.reason or "Invalid licence.")

    created = False
    if first_admin and accounts.user_count() == 0:
        accounts.create_admin(username, password)
        created = True

    opensail_premium.activate(edition.CAPABILITIES, edition.HOOKS)
    return {
        "licence": state_payload(),
        "admin_created": created,
    }

