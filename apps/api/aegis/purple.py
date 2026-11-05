"""Purple-team verification workflow: baseline -> approve -> apply fixture change -> retest -> compare.

Metrics are computed from stored run results. No LLM is involved in any number shown to the user.
"""
from __future__ import annotations

import copy
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit, scenarios, system
from .models import Approval, Job, PurpleCase, Run, Target, User, utcnow
from .policy import Action, evaluate
from .security import sha256_obj

APPROVAL_TTL = timedelta(minutes=15)


class PurpleError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def enqueue_run(db: Session, target: Target, user: User, scenario_id: str, phase: str, case_id: str | None,
                idem: str | None = None) -> tuple[Job, bool]:
    """Create a job after a pre-flight policy check. Returns (job, deduplicated)."""
    scenario = scenarios.get(scenario_id)
    if target.scenario_id != scenario_id:
        raise PurpleError(422, "scenario_mismatch", "This target is not bound to that scenario.")
    ctx = system.policy_context(db)
    scope = system.to_scope(target)
    for action in {s.action for s in scenario.plan(target.fixture_state)}:
        dec = evaluate(ctx, scope, action)
        if not dec.allowed:
            audit.record(db, user.email, "job.create", "denied", target.slug, {"code": dec.code, "action": action})
            raise PurpleError(403, dec.code, dec.reason)
    if idem:
        prior = db.execute(select(Job).where(Job.idempotency_key == idem)).scalar_one_or_none()
        if prior:
            return prior, True
    active = db.execute(
        select(Job).where(Job.target_id == target.id, Job.status.in_(["queued", "running"]))
    ).scalars().first()
    if active:
        return active, True  # no duplicate active run per target
    job = Job(kind="scenario_run", params={"scenario_id": scenario_id, "phase": phase, "case_id": case_id},
              target_id=target.id, created_by=user.id, idempotency_key=idem)
    db.add(job)
    db.flush()
    audit.record(db, user.email, "job.create", "allowed", target.slug,
                 {"job_id": job.id, "scenario": scenario_id, "phase": phase})
    return job, False


def create_case(db: Session, target: Target, user: User) -> tuple[PurpleCase, Job]:
    if not target.scenario_id:
        raise PurpleError(422, "no_scenario", "This target has no scenario bound to it.")
    sc = scenarios.get(target.scenario_id)
    case = PurpleCase(scenario_id=sc.id, scenario_version=sc.version, target_id=target.id, created_by=user.id)
    db.add(case)
    db.flush()
    job, _ = enqueue_run(db, target, user, sc.id, "baseline", case.id)
    audit.record(db, user.email, "case.create", "ok", target.slug, {"case_id": case.id})
    return case, job


def _remediation_hash(case: PurpleCase, params: dict[str, Any]) -> str:
    return sha256_obj({"case": case.id, "remediation": case.scenario_id, "params": params})


def grant_approval(db: Session, case: PurpleCase, user: User, action: str, params: dict[str, Any] | None) -> Approval:
    if user.role not in ("admin", "analyst"):
        audit.record(db, user.email, "approval.grant", "denied", case.id, {"reason": "role"})
        raise PurpleError(403, "forbidden", "Only analysts and admins can approve changes.")
    target = db.get(Target, case.target_id)
    assert target is not None
    sc = scenarios.get(case.scenario_id)
    act = Action.APPLY_FIXTURE_CHANGE if action == "apply" else Action.ROLLBACK_FIXTURE_CHANGE
    dec = evaluate(system.policy_context(db), system.to_scope(target), act.value)
    if not dec.allowed:
        audit.record(db, user.email, "approval.grant", "denied", target.slug, {"code": dec.code})
        raise PurpleError(403, dec.code, dec.reason)
    if act is Action.APPLY_FIXTURE_CHANGE:
        if case.status not in ("baseline_done", "rolled_back", "not_improved", "verified"):
            raise PurpleError(409, "bad_state", "Run the baseline first; it must complete before a change can be approved.")
        p = params or copy.deepcopy(sc.remediation.default_params)
        try:  # validate now so approval never covers a change that cannot be applied
            sc.remediation.apply(copy.deepcopy(target.fixture_state), p)
        except ValueError as exc:
            raise PurpleError(422, "invalid_params", str(exc)) from exc
        detail = {"case_id": case.id, "remediation_id": sc.remediation.id, "params": p,
                  "fixture_version": target.fixture_version, "digest": _remediation_hash(case, p)}
    else:
        if case.prior_state is None:
            raise PurpleError(409, "bad_state", "Nothing to roll back.")
        detail = {"case_id": case.id, "remediation_id": "rollback", "digest": _remediation_hash(case, {}),
                  "fixture_version": target.fixture_version}
    appr = Approval(target_id=target.id, action=act.value, detail=detail, approved_by=user.id,
                    approved_by_name=user.display_name, expires_at=utcnow() + APPROVAL_TTL)
    db.add(appr)
    db.flush()
    audit.record(db, user.email, "approval.grant", "ok", target.slug, {"approval_id": appr.id, "action": act.value,
                                                                       "expires": appr.expires_at.isoformat()})
    return appr


def _consume(db: Session, case: PurpleCase, approval_id: str, action: Action, user: User) -> Approval:
    appr = db.get(Approval, approval_id)
    if appr is None or appr.target_id != case.target_id or appr.detail.get("case_id") != case.id:
        raise PurpleError(403, "approval_invalid", "Approval does not match this case.")
    if appr.action != action.value:
        raise PurpleError(403, "approval_invalid", "Approval is for a different action.")
    if appr.status != "granted":
        raise PurpleError(403, "approval_used", f"Approval is {appr.status}.")
    if appr.expires_at < utcnow():
        appr.status = "expired"
        raise PurpleError(403, "approval_expired", "Approval has expired; request a new one.")
    target = db.get(Target, case.target_id)
    assert target is not None
    if appr.detail.get("fixture_version") != target.fixture_version:
        raise PurpleError(409, "stale_approval", "The fixture changed after approval; approve again.")
    return appr


def apply_change(db: Session, case: PurpleCase, user: User, approval_id: str) -> PurpleCase:
    if user.role not in ("admin", "analyst"):
        raise PurpleError(403, "forbidden", "Only analysts and admins can apply changes.")
    target = db.get(Target, case.target_id)
    assert target is not None
    ctx = system.policy_context(db)
    dec = evaluate(ctx, system.to_scope(target), Action.APPLY_FIXTURE_CHANGE.value)
    if not dec.allowed:
        audit.record(db, user.email, "change.apply", "denied", target.slug, {"code": dec.code})
        raise PurpleError(403, dec.code, dec.reason)
    appr = _consume(db, case, approval_id, Action.APPLY_FIXTURE_CHANGE, user)
    sc = scenarios.get(case.scenario_id)
    params = appr.detail["params"]
    if appr.detail["digest"] != _remediation_hash(case, params):
        raise PurpleError(403, "approval_invalid", "Approved change does not match the requested change.")
    case.prior_state = copy.deepcopy(target.fixture_state)
    target.fixture_state = sc.remediation.apply(copy.deepcopy(target.fixture_state), params)
    target.fixture_version += 1
    case.remediation_id = sc.remediation.id
    case.status = "remediated"
    appr.status, appr.consumed_at, appr.result = "consumed", utcnow(), "applied to fixture state only"
    audit.record(db, user.email, "change.apply", "ok", target.slug,
                 {"case_id": case.id, "approval_id": appr.id, "remediation": sc.remediation.id,
                  "fixture_version": target.fixture_version})
    return case


def rollback_change(db: Session, case: PurpleCase, user: User, approval_id: str) -> PurpleCase:
    target = db.get(Target, case.target_id)
    assert target is not None
    dec = evaluate(system.policy_context(db), system.to_scope(target), Action.ROLLBACK_FIXTURE_CHANGE.value)
    if not dec.allowed:
        raise PurpleError(403, dec.code, dec.reason)
    appr = _consume(db, case, approval_id, Action.ROLLBACK_FIXTURE_CHANGE, user)
    if case.prior_state is None:
        raise PurpleError(409, "bad_state", "Nothing to roll back.")
    target.fixture_state = copy.deepcopy(case.prior_state)
    target.fixture_version += 1
    case.prior_state = None
    case.status = "rolled_back"
    case.retest_run_id = None
    case.comparison = {}
    appr.status, appr.consumed_at, appr.result = "consumed", utcnow(), "fixture restored"
    audit.record(db, user.email, "change.rollback", "ok", target.slug, {"case_id": case.id, "approval_id": appr.id})
    return case


def request_retest(db: Session, case: PurpleCase, user: User) -> Job:
    if case.status not in ("remediated", "not_improved", "verified"):
        raise PurpleError(409, "bad_state", "Apply an approved change before re-testing.")
    target = db.get(Target, case.target_id)
    assert target is not None
    job, _ = enqueue_run(db, target, user, case.scenario_id, "retest", case.id)
    return job


# ---- comparison ------------------------------------------------------------------------------
def _fid(f: dict[str, Any], slug: str) -> str:
    from .ingest import stable_id
    return stable_id(slug, f["rule_id"], f.get("location", ""))


def _row(label: str, before: Any, after: Any, better: str = "lower", unit: str = "") -> dict[str, Any]:
    good: bool | None = None
    if isinstance(before, (int, float)) and isinstance(after, (int, float)) and before != after:
        good = after < before if better == "lower" else after > before
    return {"label": label, "before": before, "after": after, "unit": unit, "improved": good,
            "changed": before != after}


def compare(base: Run, retest: Run, slug: str) -> dict[str, Any]:
    bm, rm = base.metrics, retest.metrics
    b_ids = {_fid(f, slug): f for f in base.result.get("findings", [])}
    r_ids = {_fid(f, slug): f for f in retest.result.get("findings", [])}
    resolved = sorted(set(b_ids) - set(r_ids))
    remaining = sorted(set(b_ids) & set(r_ids))
    new = sorted(set(r_ids) - set(b_ids))
    rows = [
        _row("Findings", bm.get("findings_total", 0), rm.get("findings_total", 0)),
        _row("Exposure points (AegisAI method)", bm.get("exposure_points", 0), rm.get("exposure_points", 0)),
        _row("Detections triggered", bm.get("detections_triggered", 0), rm.get("detections_triggered", 0), "higher"),
    ]
    for k, label, better in (("recall", "Attack campaigns detected (recall)", "higher"),
                             ("precision", "Alert precision", "higher"),
                             ("false_positive_alerts", "False-positive alerts", "lower"),
                             ("mean_time_to_detect_seconds", "Mean time to detect (simulated seconds)", "lower"),
                             ("tests_passed", "Guardrail tests passed", "higher"),
                             ("unsafe_tool_calls_executed", "Unsafe tool calls executed", "lower"),
                             ("canary_leaks", "Canary leaks", "lower"),
                             ("policy_denials", "Policy-gate denials (blocked attempts)", "higher"),
                             ("required_access_working", "Required access still works", "higher"),
                             ("risky_access_blocked", "Risky access blocked", "higher")):
        if k in bm or k in rm:
            rows.append(_row(label, bm.get(k), rm.get(k), better))
    regression_notes = []
    if rm.get("required_access_ok") is False:
        regression_notes.append("Required access broke after the change.")
    if new:
        regression_notes.append(f"{len(new)} new finding(s) appeared after the change.")
    if b_ids and not remaining and not regression_notes:
        verdict = "verified"
    elif resolved and not regression_notes:
        verdict = "partial"
    elif regression_notes:
        verdict = "regression"
    else:
        verdict = "not_improved"
    return {
        "verdict": verdict, "resolved": resolved, "remaining": remaining, "new": new,
        "resolved_titles": {i: b_ids[i]["title"] for i in resolved},
        "remaining_titles": {i: b_ids[i]["title"] for i in remaining},
        "new_titles": {i: r_ids[i]["title"] for i in new},
        "rows": rows, "regression_notes": regression_notes,
        "baseline_run_id": base.id, "retest_run_id": retest.id,
        "same_scenario_version": base.scenario_version == retest.scenario_version,
        "scenario_version": retest.scenario_version,
        "evidence_label": "SIMULATED",
        "supporting_events": {"before": [d for d in base.result.get("detections", [])][:20],
                              "after": [d for d in retest.result.get("detections", [])][:20]},
    }


def on_run_finished(db: Session, run: Run) -> None:
    if not run.case_id:
        return
    case = db.get(PurpleCase, run.case_id)
    if case is None:
        return
    target = db.get(Target, case.target_id)
    assert target is not None
    if run.phase == "baseline":
        case.baseline_run_id = run.id
        if case.status in ("open", "rolled_back"):
            case.status = "baseline_done"
    elif run.phase == "retest":
        case.retest_run_id = run.id
        base = db.get(Run, case.baseline_run_id) if case.baseline_run_id else None
        if base is not None:
            case.comparison = compare(base, run, target.slug)
            v = case.comparison["verdict"]
            case.status = "verified" if v == "verified" else "not_improved"
    db.flush()
