from __future__ import annotations

from typing import Any

from .models import Approval, Finding, Incident, Job, PurpleCase, Run, Target, User


def iso(d: Any) -> str | None:
    return d.isoformat() if d else None


def user_out(u: User) -> dict[str, Any]:
    return {"id": u.id, "email": u.email, "display_name": u.display_name, "role": u.role, "is_active": u.is_active,
            "dev_seeded": u.dev_seeded, "preferences": u.preferences or {}}


def target_out(t: Target, full: bool = False) -> dict[str, Any]:
    d = {"id": t.id, "slug": t.slug, "name": t.name, "owner": t.owner, "purpose": t.purpose, "environment": t.environment,
         "kind": t.kind, "scenario_id": t.scenario_id, "hosts": t.hosts, "cidrs": t.cidrs, "allowed_actions": t.allowed_actions,
         "tags": t.tags, "criticality": t.criticality, "approval_status": t.approval_status, "window_start": iso(t.window_start),
         "window_end": iso(t.window_end), "rate_limit_per_min": t.rate_limit_per_min, "fixture_version": t.fixture_version,
         "updated_at": iso(t.updated_at)}
    if full:
        d["fixture_state"] = t.fixture_state
    return d


def job_out(j: Job) -> dict[str, Any]:
    return {"id": j.id, "kind": j.kind, "status": j.status, "params": j.params, "target_id": j.target_id,
            "progress_done": j.progress_done, "progress_total": j.progress_total, "current_step": j.current_step,
            "cancel_requested": j.cancel_requested, "attempts": j.attempts, "error": j.error, "run_id": j.run_id,
            "created_at": iso(j.created_at), "started_at": iso(j.started_at), "finished_at": iso(j.finished_at)}


def run_summary(r: Run) -> dict[str, Any]:
    return {"id": r.id, "scenario_id": r.scenario_id, "scenario_version": r.scenario_version, "target_id": r.target_id,
            "phase": r.phase, "case_id": r.case_id, "metrics": r.metrics, "evidence_label": r.evidence_label,
            "state_hash": r.state_hash, "started_at": iso(r.started_at), "finished_at": iso(r.finished_at),
            "aborted": r.result.get("aborted")}


def run_out(r: Run) -> dict[str, Any]:
    d = run_summary(r)
    d.update({"steps": r.steps, "result": r.result, "manifest": r.manifest, "manifest_signature": r.manifest_signature,
              "state_snapshot": r.state_snapshot})
    return d


def finding_out(f: Finding, full: bool = True) -> dict[str, Any]:
    d = {"id": f.id, "stable_id": f.stable_id, "target_id": f.target_id, "source": f.source, "rule_id": f.rule_id,
         "title": f.title, "plain_title": f.plain_title, "severity": f.severity, "confidence": f.confidence,
         "status": f.status, "verification": f.verification, "evidence_kind": f.evidence_kind, "location": f.location,
         "first_run_id": f.first_run_id, "last_run_id": f.last_run_id, "verified_run_id": f.verified_run_id,
         "version": f.version, "created_at": iso(f.created_at), "updated_at": iso(f.updated_at)}
    if full:
        d.update({"what": f.what, "why": f.why, "fix": f.fix, "verify": f.verify, "observed": f.observed,
                  "inferred": f.inferred, "evidence": f.evidence, "mapping": f.mapping, "history": f.history})
    return d


def incident_out(i: Incident, full: bool = True) -> dict[str, Any]:
    d = {"id": i.id, "stable_id": i.stable_id, "target_id": i.target_id, "run_id": i.run_id, "title": i.title,
         "severity": i.severity, "status": i.status, "owner": i.owner, "rule_id": i.rule_id, "rule_version": i.rule_version,
         "created_at": iso(i.created_at), "updated_at": iso(i.updated_at)}
    if full:
        d.update({"severity_reason": i.severity_reason, "mitre": i.mitre, "affected_assets": i.affected_assets,
                  "timeline": i.timeline, "evidence_event_ids": i.evidence_event_ids, "next_step": i.next_step,
                  "notes": i.notes})
    return d


def approval_out(a: Approval) -> dict[str, Any]:
    return {"id": a.id, "target_id": a.target_id, "action": a.action, "detail": a.detail, "status": a.status,
            "approved_by": a.approved_by_name, "expires_at": iso(a.expires_at), "consumed_at": iso(a.consumed_at),
            "result": a.result, "created_at": iso(a.created_at)}


def case_out(c: PurpleCase) -> dict[str, Any]:
    return {"id": c.id, "scenario_id": c.scenario_id, "scenario_version": c.scenario_version, "target_id": c.target_id,
            "status": c.status, "baseline_run_id": c.baseline_run_id, "retest_run_id": c.retest_run_id,
            "remediation_id": c.remediation_id, "can_rollback": c.prior_state is not None, "comparison": c.comparison,
            "created_at": iso(c.created_at), "updated_at": iso(c.updated_at)}
