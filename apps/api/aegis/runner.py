"""Job execution: claim -> per-step policy re-check -> observations -> Run + signed manifest -> findings.

The same code path is used by the standalone worker (services/worker) and by tests.
Policy is re-evaluated immediately before EVERY step; kill switch and cancellation are re-read from the
database between steps so they take effect mid-run.
"""
from __future__ import annotations

import copy
import time
from datetime import timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from . import audit, scenarios, system
from .config import get_settings
from .db import session_scope
from .ingest import ingest_findings, ingest_incidents
from .models import Job, Run, Target, utcnow
from .policy import RateLimiter, evaluate
from .security import hmac_sign, sha256_obj

_limiter = RateLimiter(time.monotonic)
STALE_AFTER = timedelta(seconds=45)
MAX_ATTEMPTS = 3


class JobAborted(Exception):
    def __init__(self, status: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def claim_next(db: Session) -> Job | None:
    """Atomically claim the oldest queued job (conditional UPDATE works on SQLite and Postgres)."""
    # recover jobs whose worker died (stale heartbeat)
    stale = db.execute(
        select(Job).where(Job.status == "running", Job.heartbeat_at < utcnow() - STALE_AFTER)
    ).scalars().all()
    for j in stale:
        if j.attempts >= MAX_ATTEMPTS:
            j.status, j.error, j.finished_at = "failed", "Worker lost; retry limit reached.", utcnow()
        else:
            j.status, j.current_step = "queued", None
    db.flush()
    cand = db.execute(select(Job).where(Job.status == "queued").order_by(Job.created_at).limit(1)).scalar_one_or_none()
    if cand is None:
        return None
    res = db.execute(
        update(Job).where(Job.id == cand.id, Job.status == "queued")
        .values(status="running", started_at=utcnow(), heartbeat_at=utcnow(), attempts=Job.attempts + 1)
    )
    db.flush()
    if res.rowcount != 1:
        return None
    db.refresh(cand)
    return cand


def _check_stop(db: Session, job: Job) -> None:
    db.refresh(job)
    if job.cancel_requested:
        raise JobAborted("cancelled", "Cancelled by user.")
    if system.kill_switch_engaged(db):
        raise JobAborted("blocked", "Global kill switch engaged; run stopped.")


def run_job(job_id: str) -> str:
    """Execute one claimed job. Returns final status. Never raises for expected policy/cancel outcomes."""
    settings = get_settings()
    with session_scope() as db:
        job = db.get(Job, job_id)
        assert job is not None
        target = db.get(Target, job.target_id)
        assert target is not None
        scenario = scenarios.get(job.params["scenario_id"])
        state = copy.deepcopy(target.fixture_state)
        state_hash = sha256_obj(state)
        steps = scenario.plan(state)
        job.progress_total = len(steps)
        started = time.monotonic()
        acc = scenarios.base.Acc.new(scenario.id)
        trail: list[dict[str, Any]] = []
        try:
            for step in steps:
                _check_stop(db, job)
                if time.monotonic() - started > settings.max_job_seconds:
                    raise JobAborted("failed", "Job exceeded the maximum run time.")
                scope = system.to_scope(target)
                ctx = system.policy_context(db)
                dec = evaluate(ctx, scope, step.action, step.destination)
                if dec.allowed and not _limiter.allow(f"{target.id}:{step.action}", scope.rate_limit_per_min):
                    from .policy import PolicyDecision
                    dec = PolicyDecision(False, "rate_limited", "Per-target rate limit reached; try again shortly.")
                entry = {"step": step.id, "title": step.title, "action": step.action, "destination": step.destination,
                         "policy": dec.as_dict(), "at": utcnow().isoformat()}
                trail.append(entry)
                audit.record(db, f"job:{job.id[:8]}", "policy.step", "allowed" if dec.allowed else "denied",
                             target.slug, {"step": step.id, "code": dec.code})
                if not dec.allowed:
                    raise JobAborted("blocked", f"Policy blocked step '{step.title}': {dec.reason}")
                if dec.requires_approval:
                    raise JobAborted("blocked", "Step requires a human approval record.")
                job.current_step = step.title
                job.heartbeat_at = utcnow()
                db.commit()
                delay = float(__import__("os").environ.get("AEGIS_STEP_DELAY_MS", "0")) / 1000.0
                if delay:
                    time.sleep(delay)
                step.fn(state, acc)
                entry["status"] = "done"
                job.progress_done += 1
                db.commit()
            result = scenario.finalize(state, acc)
            result.pop("_seq", None)
            result["rules"] = result.get("rules", state.get("rules", []))
            rules_hash = sha256_obj(result)
            run = Run(
                scenario_id=scenario.id, scenario_version=scenario.version, target_id=target.id,
                phase=job.params.get("phase", "adhoc"), case_id=job.params.get("case_id"),
                state_snapshot=state, state_hash=state_hash, steps=trail, result=result, metrics=result["metrics"],
                created_by=job.created_by, finished_at=utcnow(),
            )
            manifest = {
                "scenario_id": scenario.id, "scenario_version": scenario.version, "target": target.slug,
                "fixture_version": target.fixture_version, "state_hash": state_hash, "result_hash": rules_hash,
                "metrics": result["metrics"], "evidence_label": "SIMULATED", "phase": run.phase,
                "mode": system.get_mode(db).value, "generator": "aegisai-0.1.0",
            }
            run.manifest = manifest
            run.manifest_signature = hmac_sign(system.manifest_key(db), manifest)
            db.add(run)
            db.flush()
            ing = ingest_findings(db, run, target)
            inc = ingest_incidents(db, run, target)
            run.manifest = {**manifest, "findings_seen": ing["seen"]}
            run.manifest_signature = hmac_sign(system.manifest_key(db), run.manifest)
            job.run_id = run.id
            job.status = "succeeded"
            job.finished_at = utcnow()
            job.current_step = None
            audit.record(db, f"job:{job.id[:8]}", "run.completed", "ok", target.slug,
                         {"run_id": run.id, "findings": len(ing["seen"]), "incidents": len(inc)})
            from . import purple
            purple.on_run_finished(db, run)
            return "succeeded"
        except JobAborted as ab:
            db.rollback()
            job = db.get(Job, job_id)
            assert job is not None
            job.status = ab.status
            job.error = ab.message
            job.finished_at = utcnow()
            job.current_step = None
            # persist partial trail so the denial is inspectable
            part = Run(
                scenario_id=scenario.id, scenario_version=scenario.version, target_id=target.id,
                phase=job.params.get("phase", "adhoc"), case_id=job.params.get("case_id"), state_snapshot=state,
                state_hash=state_hash, steps=trail, result={"aborted": ab.status, "reason": ab.message}, metrics={},
                evidence_label="NONE", finished_at=utcnow(), created_by=job.created_by,
            )
            db.add(part)
            db.flush()
            job.run_id = part.id
            audit.record(db, f"job:{job.id[:8]}", f"run.{ab.status}", "denied" if ab.status == "blocked" else "ok",
                         target.slug, {"reason": ab.message})
            return ab.status
        except Exception as exc:  # noqa: BLE001 - last-resort handler, message is sanitised
            db.rollback()
            job = db.get(Job, job_id)
            assert job is not None
            job.status = "failed"
            job.error = f"{type(exc).__name__}: {str(exc)[:200]}"
            job.finished_at = utcnow()
            audit.record(db, f"job:{job.id[:8]}", "run.failed", "error", target.slug, {"error": job.error})
            return "failed"


def run_pending(limit: int = 20) -> int:
    """Process queued jobs synchronously (tests and the worker loop use this)."""
    n = 0
    while n < limit:
        with session_scope() as db:
            job = claim_next(db)
            jid = job.id if job else None
        if jid is None:
            break
        run_job(jid)
        n += 1
    return n
