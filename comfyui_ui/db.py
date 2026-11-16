"""SQLite storage for the generation queue.

The database is shared by both editions. Core owns the ``jobs`` table and the
``schema_migrations`` bookkeeping; premium adds its own tables through
:func:`apply_migrations` with ids prefixed ``premium:`` so the two sets never
collide.
"""

import os
import sqlite3
import time
from contextlib import contextmanager
from typing import Iterator

from .config import DB_PATH

CORE_MIGRATIONS = [
    (
        "core:0001",
        """
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          workflow TEXT NOT NULL,
          prompt_id TEXT,
          status TEXT NOT NULL,
          error TEXT NOT NULL DEFAULT '',
          result TEXT,
          created_at REAL NOT NULL,
          started_at REAL,
          finished_at REAL
        );
        CREATE INDEX IF NOT EXISTS jobs_user_created
          ON jobs(user_id, created_at);
        CREATE INDEX IF NOT EXISTS jobs_prompt
          ON jobs(prompt_id);
        """,
    ),
    (
        "core:0002",
        """
        CREATE TABLE IF NOT EXISTS media (
          owner_id INTEGER NOT NULL,
          filename TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '',
          created_at REAL NOT NULL,
          PRIMARY KEY (owner_id, filename)
        );
        CREATE INDEX IF NOT EXISTS media_filename ON media(filename);
        """,
    ),
]

JOB_COLUMNS = (
    "user_id",
    "workflow",
    "prompt_id",
    "status",
    "error",
    "result",
    "created_at",
    "started_at",
    "finished_at",
)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open a connection to the shared database for one operation.

    A fresh connection per operation keeps this thread-safe without a global
    lock; the write volume here is a handful of rows per generation. The
    transaction is committed when the block ends (rolled back when it raises)
    and the connection is always closed, so a dashboard that polls every second
    does not pile up open handles.
    """
    directory = os.path.dirname(DB_PATH)
    if directory:
        os.makedirs(directory, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def apply_migrations(migrations=CORE_MIGRATIONS) -> list[str]:
    """Apply any migrations that have not run yet, returning their ids."""
    applied_now = []
    with connect() as conn:
        # WAL is a property of the database file, so it is set once here rather
        # than on every connection: changing the journal mode takes a lock of
        # its own, which would otherwise make concurrent readers collide with a
        # writer that is only trying to open the database.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)"
        )
        applied = {
            row["id"] for row in conn.execute("SELECT id FROM schema_migrations")
        }
        for migration_id, script in migrations:
            if migration_id in applied:
                continue
            conn.executescript(script)
            conn.execute(
                "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
                (migration_id, int(time.time())),
            )
            applied_now.append(migration_id)
    return applied_now


def init() -> None:
    """Create the database and apply the core schema."""
    apply_migrations(CORE_MIGRATIONS)


def insert_job(job) -> None:
    """Insert a newly queued job."""
    with connect() as conn:
        conn.execute(
            "INSERT INTO jobs (id, user_id, workflow, prompt_id, status, error,"
            " result, created_at, started_at, finished_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                job.id,
                job.owner_id,
                job.workflow,
                job.prompt_id,
                job.status,
                job.error,
                None,
                job.created_at,
                job.started_at,
                job.finished_at,
            ),
        )


def update_job(job_id: str, **fields) -> None:
    """Update one job row, ignoring unknown fields."""
    updates = {key: value for key, value in fields.items() if key in JOB_COLUMNS}
    if not updates:
        return
    assignments = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values())
    values.append(job_id)
    with connect() as conn:
        conn.execute(f"UPDATE jobs SET {assignments} WHERE id = ?", values)


def set_prompt_id(job_id: str, prompt_id: str) -> None:
    """Record the ComfyUI prompt id once the workflow has been queued."""
    with connect() as conn:
        conn.execute(
            "UPDATE jobs SET prompt_id = ? WHERE id = ?", (prompt_id, job_id)
        )


def get_job(job_id: str) -> sqlite3.Row | None:
    """Return one job row, or None."""
    with connect() as conn:
        return conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()


def latest_job(owner_id: int) -> sqlite3.Row | None:
    """Return an owner's most recently created job, or None."""
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM jobs WHERE user_id = ?"
            " ORDER BY created_at DESC LIMIT 1",
            (owner_id,),
        ).fetchone()


def prompt_ids_for(owner_id: int) -> set[str]:
    """Return the ComfyUI prompt ids an owner has generated."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT prompt_id FROM jobs WHERE user_id = ? AND prompt_id IS NOT NULL",
            (owner_id,),
        )
        return {row["prompt_id"] for row in rows}


def mark_interrupted() -> int:
    """Mark jobs left queued or running by a previous process as interrupted."""
    with connect() as conn:
        cursor = conn.execute(
            "UPDATE jobs SET status = 'interrupted', finished_at = ?"
            " WHERE status IN ('queued', 'running')",
            (time.time(),),
        )
        return cursor.rowcount


# ---------------------------------------------------------------------------
# Generated media ownership
# ---------------------------------------------------------------------------


def record_media(owner_id: int, filename: str, kind: str = "") -> None:
    """Remember which owner produced a ComfyUI output file.

    Filenames are what the gallery and file routes receive, so this is the only
    key available when deciding whether a request may read a file.
    """
    name = (filename or "").strip()
    if not name:
        return
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO media (owner_id, filename, kind, created_at)"
            " VALUES (?, ?, ?, ?)",
            (owner_id, name, kind, time.time()),
        )


def media_owner(filename: str) -> int | None:
    """Return the owner that produced ``filename``, or None if unknown."""
    name = (filename or "").strip()
    if not name:
        return None
    with connect() as conn:
        row = conn.execute(
            "SELECT owner_id FROM media WHERE filename = ?"
            " ORDER BY created_at DESC LIMIT 1",
            (name,),
        ).fetchone()
    return int(row["owner_id"]) if row is not None else None
