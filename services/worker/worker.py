"""Standalone AegisAI worker. Polls the database job queue; safe to run multiple copies.

Run from the repository root:   apps/api/.venv/Scripts/python services/worker/worker.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps" / "api"))

from aegis import system  # noqa: E402
from aegis.db import session_scope  # noqa: E402
from aegis.models import utcnow  # noqa: E402
from aegis.runner import claim_next, run_job  # noqa: E402


def heartbeat() -> None:
    with session_scope() as db:
        system.set_setting(db, "worker_heartbeat", {"at": utcnow().isoformat(), "pid": os.getpid()})


def main() -> None:
    poll = float(os.environ.get("AEGIS_WORKER_POLL_SECONDS", "0.5"))
    print(json.dumps({"event": "worker_started", "pid": os.getpid()}), flush=True)
    last_beat = 0.0
    while True:
        try:
            if time.monotonic() - last_beat > 5:
                heartbeat()
                last_beat = time.monotonic()
            with session_scope() as db:
                job = claim_next(db)
                jid = job.id if job else None
            if jid:
                status = run_job(jid)
                print(json.dumps({"event": "job_finished", "job": jid, "status": status}), flush=True)
            else:
                time.sleep(poll)
        except KeyboardInterrupt:
            print(json.dumps({"event": "worker_stopped"}), flush=True)
            return
        except Exception as exc:  # noqa: BLE001 - keep the loop alive; error is logged without payloads
            print(json.dumps({"event": "worker_error", "error": type(exc).__name__}), flush=True)
            time.sleep(2)


if __name__ == "__main__":
    main()
