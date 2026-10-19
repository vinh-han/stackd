"""Background file extraction. Docling takes seconds to minutes, far longer than a request should wait."""

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from .extract import ExtractError, extract
from .schemas import ExtractedChunk, JobStatus

log = logging.getLogger("stackd")
JOB_TTL_S = 3600

# shortcut: jobs live in this process's memory, so a restart drops them, and one worker means one file at a time
# (Docling's models need ~1-2 GB each). Move to a real queue (Supabase) when accounts land.
_executor = ThreadPoolExecutor(max_workers=1)
_jobs: dict[str, tuple[float, JobStatus]] = {}
_lock = threading.Lock()


def submit(filename: str, data: bytes) -> str:
    job_id = uuid.uuid4().hex
    with _lock:
        cutoff = time.time() - JOB_TTL_S
        for old in [k for k, (created, _) in _jobs.items() if created < cutoff]:
            del _jobs[old]
        _jobs[job_id] = (time.time(), JobStatus(status="queued"))
    _executor.submit(_run, job_id, filename, data)
    return job_id


def get(job_id: str) -> JobStatus | None:
    with _lock:
        entry = _jobs.get(job_id)
    return entry[1] if entry else None


def _update(job_id: str, **fields) -> None:
    with _lock:
        if job_id in _jobs:
            created, status = _jobs[job_id]
            _jobs[job_id] = (created, status.model_copy(update=fields))


def _run(job_id: str, filename: str, data: bytes) -> None:
    _update(job_id, status="running")
    try:
        chunks = extract(filename, data, on_progress=lambda done, total: _update(job_id, pages_done=done, pages_total=total))
    except ExtractError as err:
        _update(job_id, status="failed", error=str(err), code="bad_request")
    except Exception:
        log.exception("extract %s failed", filename)
        _update(job_id, status="failed", error="Could not read this file. Try another file or paste the text.", code="upstream")
    else:
        _update(job_id, status="done", chunks=[ExtractedChunk(text=c.text, pages=c.pages) for c in chunks])
