"""Shared application error type.

The HTTP API raises :class:`AppError` for problems that should be shown to the
user; the server turns it into a JSON error response with the same
human-readable message.
"""


class AppError(RuntimeError):
    """A user-facing error that should be shown as-is in the dashboard."""
