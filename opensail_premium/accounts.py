# SPDX-License-Identifier: LicenseRef-Proprietary-OpenSail
"""User accounts, sessions and the profile picker.

Accounts are local to the installation: there is no email, no password reset by
link and no external identity provider. The admin creates profiles, and each
one signs in with a password or a short PIN, which keeps a household usable
without turning it into an IT department.
"""

import hashlib
import os
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from comfyui_ui import db, edition, identity, storage
from comfyui_ui.config import SERVER_SSL_CERTFILE
from comfyui_ui.identity import LOCAL_OWNER, Owner

COOKIE_NAME = "opensail_session"
SESSION_SECONDS = 30 * 24 * 60 * 60

MIGRATIONS = [
    (
        "premium:0001",
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          pw_hash BLOB,
          pw_salt BLOB,
          pin_hash BLOB,
          pin_salt BLOB,
          is_admin INTEGER NOT NULL DEFAULT 0,
          disabled INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        """,
    ),
]

def _accounts_enabled() -> None:
    """Hide the account API until a licence enables it."""
    if not edition.can("accounts"):
        raise HTTPException(status_code=404, detail="Not found.")


router = APIRouter(dependencies=[Depends(_accounts_enabled)])

# Failed sign-in attempts, per username: (count, locked_until).
_failures: dict[str, tuple[int, float]] = {}
_MAX_FAILURES = 8
_LOCKOUT_SECONDS = 60


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


def _hash(secret: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        secret.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32
    )


def _matches(secret: str, salt, expected) -> bool:
    if not salt or not expected:
        return False
    return secrets.compare_digest(_hash(secret, bytes(salt)), bytes(expected))


def _secrets(secret: str) -> tuple[bytes, bytes]:
    salt = secrets.token_bytes(16)
    return _hash(secret, salt), salt


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------


def ensure_schema() -> None:
    """Create the premium tables."""
    db.apply_migrations(MIGRATIONS)


def user_count() -> int:
    """Return how many profiles exist."""
    with db.connect() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])


def _user_row(user_id: int):
    with db.connect() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def _user_by_name(username: str):
    with db.connect() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
        ).fetchone()


def list_users() -> list[dict]:
    """Return every profile, without any secret material."""
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT id, username, is_admin, disabled, created_at,"
            " pw_hash IS NOT NULL AS has_password,"
            " pin_hash IS NOT NULL AS has_pin"
            " FROM users ORDER BY id"
        ).fetchall()
    return [
        {
            "id": row["id"],
            "username": row["username"],
            "is_admin": bool(row["is_admin"]),
            "disabled": bool(row["disabled"]),
            "has_password": bool(row["has_password"]),
            "has_pin": bool(row["has_pin"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def owner_from_session(request: Request) -> Optional[Owner]:
    """Resolve the signed-in owner from the session cookie.

    With no profiles yet, the local owner is returned so the installation
    remains usable long enough to create the first account.
    """
    if user_count() == 0:
        return LOCAL_OWNER

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    now = int(time.time())
    with db.connect() as conn:
        row = conn.execute(
            "SELECT u.id, u.username, u.is_admin"
            " FROM sessions s JOIN users u ON u.id = s.user_id"
            " WHERE s.token = ? AND s.expires_at > ? AND u.disabled = 0",
            (token, now),
        ).fetchone()
    if row is None:
        return None
    return Owner(
        id=row["id"], username=row["username"], is_admin=bool(row["is_admin"])
    )


def _create_session(user_id: int, response: Response) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at, created_at)"
            " VALUES (?, ?, ?, ?)",
            (token, user_id, now + SESSION_SECONDS, now),
        )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        secure=os.path.isfile(SERVER_SSL_CERTFILE),
        path="/",
    )
    return token


def _clear_session(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    response.delete_cookie(COOKIE_NAME, path="/")


def startup() -> None:
    """Prepare the account tables and drop expired sessions."""
    ensure_schema()
    now = int(time.time())
    with db.connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))


def create_admin(username: str, password: str) -> int:
    """Create the first administrator, bypassing the HTTP layer."""
    if user_count() > 0:
        raise ValueError("An account already exists.")
    pw_hash, pw_salt = _secrets(password)
    now = int(time.time())
    with db.connect() as conn:
        cursor = conn.execute(
            "INSERT INTO users (username, pw_hash, pw_salt, pin_hash, pin_salt,"
            " is_admin, disabled, created_at) VALUES (?, ?, ?, NULL, NULL, 1, 0, ?)",
            (username, pw_hash, pw_salt, now),
        )
        user_id = int(cursor.lastrowid)
    storage.ensure_owner_tree(user_id)
    return user_id


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class LoginBody(BaseModel):
    username: str
    secret: str = ""


class CreateUserBody(BaseModel):
    username: str
    password: str = ""
    pin: str = ""
    is_admin: bool = False


class UserIdBody(BaseModel):
    user_id: int


class SetSecretBody(BaseModel):
    user_id: int
    password: str = ""
    pin: str = ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


def _require_admin(owner: Owner) -> None:
    if not owner.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required.")


@router.get("/api/profiles")
def profiles() -> dict:
    """List the profiles shown on the sign-in screen."""
    return {
        "profiles": [
            {"id": user["id"], "username": user["username"], "has_pin": user["has_pin"], "has_password": user["has_password"]}
            for user in list_users()
            if not user["disabled"]
        ]
    }


@router.post("/api/login")
def login(body: LoginBody, request: Request, response: Response) -> dict:
    """Sign in with a password, or a PIN for profiles that have one."""
    username = (body.username or "").strip()
    secret = body.secret or ""

    failures, locked_until = _failures.get(username.lower(), (0, 0.0))
    if locked_until > time.time():
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Wait a minute and try again.",
        )

    row = _user_by_name(username) if username else None
    valid = False
    if row is not None and not row["disabled"]:
        if row["pw_hash"]:
            valid = _matches(secret, row["pw_salt"], row["pw_hash"])
        elif row["pin_hash"]:
            valid = _matches(secret, row["pin_salt"], row["pin_hash"])

    if not valid:
        failures += 1
        locked = time.time() + _LOCKOUT_SECONDS if failures >= _MAX_FAILURES else 0.0
        _failures[username.lower()] = (failures if not locked else 0, locked)
        raise HTTPException(status_code=401, detail="Incorrect username or password.")

    _failures.pop(username.lower(), None)
    _create_session(row["id"], response)
    return {
        "user": {
            "id": row["id"],
            "username": row["username"],
            "is_admin": bool(row["is_admin"]),
        }
    }


@router.post("/api/logout")
def logout(request: Request, response: Response) -> dict:
    _clear_session(request, response)
    return {"ok": True}


@router.get("/api/me")
def me() -> dict:
    owner = identity.current_owner()
    return {
        "user": {
            "id": owner.id,
            "username": owner.username,
            "is_admin": owner.is_admin,
        }
    }


@router.get("/api/users")
def get_users() -> dict:
    owner = identity.current_owner()
    _require_admin(owner)
    users = list_users()
    return {"users": users, "count": len(users)}


@router.post("/api/users")
def create_user(body: CreateUserBody) -> dict:
    """Create a profile. The first account becomes the administrator."""
    owner = identity.current_owner()
    if user_count() > 0:
        _require_admin(owner)

    username = (body.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="A name is required.")
    if len(username) > 40:
        raise HTTPException(status_code=400, detail="That name is too long.")
    if _user_by_name(username) is not None:
        raise HTTPException(status_code=400, detail="That name is already taken.")
    if not body.password and not body.pin:
        raise HTTPException(
            status_code=400, detail="Set a password or a PIN for this profile."
        )

    from . import licence

    state = licence.load_state()
    if state.valid and user_count() >= state.seats:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Your licence covers {state.seats} user"
                f"{'' if state.seats == 1 else 's'}. Upgrade the licence to add "
                "more profiles."
            ),
        )

    pw_hash = pw_salt = pin_hash = pin_salt = None
    if body.password:
        pw_hash, pw_salt = _secrets(body.password)
    if body.pin:
        pin_hash, pin_salt = _secrets(body.pin)

    is_admin = 1 if (user_count() == 0 or body.is_admin) else 0
    now = int(time.time())
    with db.connect() as conn:
        cursor = conn.execute(
            "INSERT INTO users (username, pw_hash, pw_salt, pin_hash, pin_salt,"
            " is_admin, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
            (username, pw_hash, pw_salt, pin_hash, pin_salt, is_admin, now),
        )
        user_id = int(cursor.lastrowid)
    storage.ensure_owner_tree(user_id)
    return {"user": {"id": user_id, "username": username, "is_admin": bool(is_admin)}}


@router.post("/api/users/delete")
def delete_user(body: UserIdBody) -> dict:
    owner = identity.current_owner()
    _require_admin(owner)
    if body.user_id == owner.id:
        raise HTTPException(
            status_code=400, detail="You cannot delete the account you are using."
        )
    with db.connect() as conn:
        removed = conn.execute(
            "DELETE FROM users WHERE id = ?", (body.user_id,)
        ).rowcount
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (body.user_id,))
    if not removed:
        raise HTTPException(status_code=404, detail="That profile does not exist.")
    return {"ok": True}


@router.post("/api/users/secret")
def set_secret(body: SetSecretBody) -> dict:
    """Set a profile's password or PIN. Admins may change anyone's."""
    owner = identity.current_owner()
    if body.user_id != owner.id:
        _require_admin(owner)
    row = _user_row(body.user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="That profile does not exist.")

    updates = {}
    if body.password:
        updates["pw_hash"], updates["pw_salt"] = _secrets(body.password)
    if body.pin:
        updates["pin_hash"], updates["pin_salt"] = _secrets(body.pin)
    if not updates:
        raise HTTPException(status_code=400, detail="Set a password or a PIN.")

    assignments = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [body.user_id]
    with db.connect() as conn:
        conn.execute(f"UPDATE users SET {assignments} WHERE id = ?", values)
        # Force a fresh sign-in when credentials change.
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (body.user_id,))
    return {"ok": True}


@router.post("/api/users/disabled")
def set_disabled(body: UserIdBody) -> dict:
    """Toggle a profile between enabled and disabled."""
    owner = identity.current_owner()
    _require_admin(owner)
    if body.user_id == owner.id:
        raise HTTPException(
            status_code=400, detail="You cannot disable the account you are using."
        )
    with db.connect() as conn:
        conn.execute(
            "UPDATE users SET disabled = 1 - disabled WHERE id = ?",
            (body.user_id,),
        )
    return {"ok": True}
