"""Serialised generation queue with per-job ownership.

One GPU means one workflow at a time (by default). Jobs are queued in arrival
order and run by worker threads, so a second person's request waits instead of
being refused. Each job owns its cancel flag, which is what stops one account
from cancelling another's render.
"""

import json
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Optional

from . import db

ACTIVE_STATES = ("queued", "running")


class JobNotFound(Exception):
    """Raised when a job id does not exist."""


class JobForbidden(Exception):
    """Raised when a job belongs to another owner."""


@dataclass
class Job:
    """One queued or running generation."""

    id: str
    owner_id: int
    workflow: str
    status: str
    created_at: float
    body: Any = None
    prompt_id: Optional[str] = None
    error: str = ""
    result: Optional[dict] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    progress: Optional[dict] = None
    cancel: threading.Event = field(default_factory=threading.Event)


class JobQueue:
    """Run generation jobs one at a time, in submission order.

    ``events_factory(job)`` must return an iterator of the same event dicts the
    generator used to yield: ``phase``/``progress``/``queued``/``result``/
    ``error``/``cancelled``/``done``.
    """

    def __init__(self, events_factory, max_concurrent: int = 1) -> None:
        self._events_factory = events_factory
        self._max_concurrent = max(1, int(max_concurrent))
        self._lock = threading.Lock()
        self._jobs: dict[str, Job] = {}
        self._pending: deque[str] = deque()
        self._workers = 0
        self._latest: dict[int, str] = {}
        self._cleared: dict[int, float] = {}
        db.init()
        db.mark_interrupted()

    # -- public API --------------------------------------------------------

    def submit(self, owner_id: int, workflow: str, body) -> dict:
        """Queue a job and return its snapshot."""
        job = Job(
            id=uuid.uuid4().hex,
            owner_id=owner_id,
            workflow=workflow,
            status="queued",
            created_at=time.time(),
            body=body,
            progress={
                "value": 0,
                "message": "Queued…",
                "indeterminate": True,
            },
        )
        db.insert_job(job)
        with self._lock:
            self._jobs[job.id] = job
            self._pending.append(job.id)
            self._latest[owner_id] = job.id
            self._spawn_workers_locked()
        return self.snapshot(job.id, owner_id)

    def snapshot(self, job_id: str, owner_id: int) -> dict:
        """Return one job's state for its owner."""
        job = self._get(job_id)
        if job.owner_id != owner_id:
            raise JobForbidden("That job belongs to another user.")
        return self._payload(job)

    def latest(self, owner_id: int) -> dict:
        """Return the owner's most recent job, live or from a previous run."""
        # The payload is built outside the lock: it calls ``position()``, which
        # takes the same non-reentrant lock, so building it in here would
        # deadlock the request thread (and freeze the progress bar with it).
        with self._lock:
            job_id = self._latest.get(owner_id)
            job = self._jobs.get(job_id) if job_id else None
        if job is not None:
            return self._payload(job)
        row = db.latest_job(owner_id)
        if row is None:
            return self._empty_payload()
        with self._lock:
            cleared = self._cleared.get(owner_id, 0.0)
        if row["created_at"] <= cleared:
            return self._empty_payload()
        return self._row_payload(row)

    def any_active(self) -> bool:
        """Return True while any owner has a queued or running job."""
        with self._lock:
            return any(
                job.status in ACTIVE_STATES for job in self._jobs.values()
            )

    def clear_latest(self, owner_id: int) -> None:
        """Forget the owner's last job, so status reports idle again."""
        with self._lock:
            job_id = self._latest.pop(owner_id, None)
            job = self._jobs.get(job_id) if job_id else None
            if job is not None:
                cleared = max(self._cleared.get(owner_id, 0.0), job.created_at)
                self._cleared[owner_id] = cleared
                return
            row = db.latest_job(owner_id)
            if row is not None:
                cleared = max(self._cleared.get(owner_id, 0.0), row["created_at"])
                self._cleared[owner_id] = cleared

    def cancel(self, job_id: str, owner_id: int) -> dict:
        """Cancel one of the owner's jobs."""
        job = self._get(job_id)
        if job.owner_id != owner_id:
            raise JobForbidden("That job belongs to another user.")
        return self._cancel_job(job)

    def cancel_latest(self, owner_id: int) -> dict:
        """Cancel the owner's active job, if any."""
        with self._lock:
            job_id = self._latest.get(owner_id)
            job = self._jobs.get(job_id) if job_id else None
            if job is None or job.status not in ACTIVE_STATES:
                return self._empty_payload()
        return self._cancel_job(job)

    def position(self, job_id: str) -> int:
        """Return a queued job's 1-based place in line, or 0 when not queued."""
        with self._lock:
            if job_id not in self._pending:
                return 0
            for index, pending_id in enumerate(self._pending, start=1):
                if pending_id == job_id:
                    return index
        return 0

    # -- internals ---------------------------------------------------------

    def _get(self, job_id: str) -> Job:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is not None:
            return job
        row = db.get_job(job_id)
        if row is None:
            raise JobNotFound("That job no longer exists.")
        return self._job_from_row(row)

    @staticmethod
    def _job_from_row(row) -> Job:
        return Job(
            id=row["id"],
            owner_id=row["user_id"],
            workflow=row["workflow"],
            status=row["status"],
            created_at=row["created_at"],
            prompt_id=row["prompt_id"],
            error=row["error"] or "",
            result=json.loads(row["result"]) if row["result"] else None,
            started_at=row["started_at"],
            finished_at=row["finished_at"],
        )

    def _cancel_job(self, job: Job) -> dict:
        if job.status == "queued":
            with self._lock:
                try:
                    self._pending.remove(job.id)
                except ValueError:
                    pass
                job.status = "cancelled"
                job.error = "Generation cancelled."
                job.finished_at = time.time()
                job.progress = None
            db.update_job(
                job.id,
                status="cancelled",
                error=job.error,
                finished_at=job.finished_at,
            )
            return self._payload(job)
        if job.status == "running":
            job.cancel.set()
            job.progress = {
                "value": (job.progress or {}).get("value"),
                "message": "Cancelling…",
                "indeterminate": True,
            }
            return self._payload(job)
        return self._payload(job)

    def _spawn_workers_locked(self) -> None:
        while self._workers < self._max_concurrent:
            self._workers += 1
            threading.Thread(target=self._work, daemon=True).start()

    def _work(self) -> None:
        retired = False
        try:
            while True:
                job = self._take()
                if job is None:
                    retired = True
                    return
                try:
                    self._run(job)
                except Exception as exc:  # noqa: BLE001 - one job must not stop the queue
                    self._abandon(job, exc)
        finally:
            if not retired:
                # The thread is leaving outside ``_take``'s bookkeeping, which
                # is what happens when recording a job raises. Give the slot
                # back and hand any pending work to a fresh thread, so the queue
                # cannot wedge with jobs nobody will ever pick up.
                with self._lock:
                    self._workers -= 1
                    self._spawn_workers_locked()

    def _abandon(self, job: Job, exc: Exception) -> None:
        """Fail a job whose own bookkeeping raised, keeping the worker alive."""
        job.status = "error"
        job.error = f"Generation failed: {exc}"
        job.finished_at = time.time()
        job.progress = None
        try:
            db.update_job(
                job.id,
                status=job.status,
                error=job.error,
                finished_at=job.finished_at,
            )
        except Exception:  # noqa: BLE001 - the queue must keep running
            pass

    def _take(self) -> Optional[Job]:
        with self._lock:
            while self._pending:
                job_id = self._pending.popleft()
                job = self._jobs.get(job_id)
                if job is None or job.status != "queued":
                    continue
                job.status = "running"
                job.started_at = time.time()
                job.progress = {
                    "value": 0,
                    "message": "Preparing…",
                    "indeterminate": True,
                }
                return job
            self._workers -= 1
            return None

    def _run(self, job: Job) -> None:
        db.update_job(
            job.id,
            status="running",
            started_at=job.started_at,
        )
        try:
            for event in self._events_factory(job):
                self._apply(job, event)
        except Exception as exc:  # noqa: BLE001 - surface it to the client
            self._finish(job, "error", error=f"Generation failed: {exc}")
            return
        if job.status == "running":
            self._finish(job, "error", error="Generation ended unexpectedly.")

    def _apply(self, job: Job, event: dict) -> None:
        kind = event.get("type")
        if kind in ("phase", "progress"):
            job.progress = {
                "value": event.get("value"),
                "message": event.get("message", ""),
                "indeterminate": bool(event.get("indeterminate")),
            }
        elif kind == "queued":
            prompt_id = event.get("prompt_id")
            if prompt_id:
                job.prompt_id = prompt_id
                db.set_prompt_id(job.id, prompt_id)
            job.progress = {
                "value": event.get("value", 0),
                "message": event.get("message", "Queued…"),
                "indeterminate": True,
            }
        elif kind == "result":
            job.result = {
                "kind": event.get("kind"),
                "url": event.get("url"),
                "filename": event.get("filename", ""),
            }
        elif kind == "error":
            self._finish(job, "error", error=event.get("message") or "Generation failed.")
        elif kind == "cancelled":
            self._finish(
                job,
                "cancelled",
                error=event.get("message") or "Generation cancelled.",
            )
        elif kind == "done":
            self._finish(job, "done")

    def _finish(self, job: Job, status: str, error: str = "") -> None:
        job.status = status
        job.finished_at = time.time()
        if error:
            job.error = error
        job.progress = (
            {"value": 1, "message": "Done.", "indeterminate": False}
            if status == "done"
            else None
        )
        db.update_job(
            job.id,
            status=status,
            error=job.error,
            result=json.dumps(job.result) if job.result else None,
            finished_at=job.finished_at,
        )

    def _payload(self, job: Job) -> dict:
        elapsed_ms = 0.0
        if job.started_at:
            end = job.finished_at or time.time()
            elapsed_ms = max(0.0, (end - job.started_at) * 1000.0)
        return {
            "id": job.id,
            "status": job.status,
            "running": job.status in ACTIVE_STATES,
            "workflow": job.workflow,
            "progress": dict(job.progress) if job.progress else None,
            "result": dict(job.result) if job.result else None,
            "error": job.error,
            "elapsed_ms": elapsed_ms,
            "queue_position": self.position(job.id),
        }

    def _row_payload(self, row) -> dict:
        job = self._job_from_row(row)
        payload = self._payload(job)
        payload["running"] = False
        return payload

    @staticmethod
    def _empty_payload() -> dict:
        return {
            "id": None,
            "status": "idle",
            "running": False,
            "workflow": None,
            "progress": None,
            "result": None,
            "error": "",
            "elapsed_ms": 0.0,
            "queue_position": 0,
        }
