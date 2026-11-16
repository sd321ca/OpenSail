"""Request identity: which owner is using the dashboard right now.

The community edition always resolves to :data:`LOCAL_OWNER`. Premium installs
an authentication provider through :mod:`comfyui_ui.edition`, and the HTTP
middleware in :mod:`comfyui_ui.server` stores the result in a context variable
for the duration of the request.

A context variable keeps route signatures unchanged while remaining
request-scoped: Starlette copies the current context into the worker thread it
uses for synchronous endpoints, and background jobs carry their owner in the
job record instead of relying on this value.
"""

from contextvars import ContextVar, Token
from dataclasses import dataclass

from .config import LOCAL_OWNER_ID


@dataclass(frozen=True)
class Owner:
    """One account (or the single local owner in the community edition)."""

    id: int
    username: str
    is_admin: bool = True


LOCAL_OWNER = Owner(id=LOCAL_OWNER_ID, username="owner", is_admin=True)

_OWNER: ContextVar[Owner | None] = ContextVar("opensail_owner", default=None)


def current_owner() -> Owner:
    """Return the owner of the current request."""
    return _OWNER.get() or LOCAL_OWNER


def set_owner(owner: Owner) -> Token:
    """Bind ``owner`` to the rest of this request."""
    return _OWNER.set(owner)


def reset_owner(token: Token) -> None:
    """Undo :func:`set_owner`."""
    _OWNER.reset(token)
