"""Jobs, runs, purple-team cases, findings, incidents, detection lab, cloud analysis, assistant."""
from __future__ import annotations

import copy
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import assistant, audit, cloud, purple, scenarios, system
from ..db import get_db
from ..deps import ANALYST_UP, ApiError, current_user
from ..models import (
    AnalysisReport,
    Approval,
    DetectionRuleVersion,
    Finding,
    Incident,
    Job,
    PurpleCase,
    Run,
    Target,
    User,
    utcnow,
)
from ..scenarios import auth_detection
from ..security import hmac_sign, sha256_obj
from ..serialize import (
    approval_out,
    case_out,
    finding_out,
    incident_out,
    job_out,
    run_out,
    run_summary,
    target_out,
)

router = APIRouter()


def _page(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, 200)), max(0, offset)


def _purple_err(exc: purple.PurpleError) -> ApiError:
    return ApiError(exc.status, exc.code, exc.message)


# ---------------------------------------------------------------- jobs
class JobIn(BaseModel):
    target_id: str
    scenario_id: str | None = None


@router.post("/jobs", status_code=202, tags=["jobs"])
def job_create(body: JobIn, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function"),
               idempotency_key: str | None = Header(default=None, max_length=80)) -> dict[str, Any]:
    t = db.get(Target, body.target_id)
    if not t:
        raise ApiError(404, "not_found", "Target not found.")
    try:
        job, dedup = purple.enqueue_run(db, t, user, body.scenario_id or t.scenario_id or "", "adhoc", None, idempotency_key)
    except purple.PurpleError as e:
        raise _purple_err(e) from e
    except KeyError as e:
        raise ApiError(404, "not_found", str(e)) from e
    return {**job_out(job), "deduplicated": dedup}


@router.get("/jobs", tags=["jobs"])
def jobs_list(limit: int = 50, offset: int = 0, status: str | None = None, user: User = Depends(current_user),
              db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    limit, offset = _page(limit, offset)
    q = select(Job).order_by(Job.created_at.desc())
    if status:
        q = q.where(Job.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    return {"total": total, "items": [job_out(j) for j in db.execute(q.limit(limit).offset(offset)).scalars()]}


@router.get("/jobs/{jid}", tags=["jobs"])
def job_get(jid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    j = db.get(Job, jid)
    if not j:
        raise ApiError(404, "not_found", "Job not found.")
    return job_out(j)


@router.post("/jobs/{jid}/cancel", tags=["jobs"])
def job_cancel(jid: str, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    j = db.get(Job, jid)
    if not j:
        raise ApiError(404, "not_found", "Job not found.")
    if j.status in ("succeeded", "failed", "cancelled", "blocked"):
        return job_out(j)  # idempotent
    j.cancel_requested = True
    if j.status == "queued":
        j.status, j.finished_at, j.error = "cancelled", utcnow(), "Cancelled before start."
    audit.record(db, user.email, "job.cancel", "ok", j.id)
    return job_out(j)


# ---------------------------------------------------------------- runs
@router.get("/runs", tags=["runs"])
def runs_list(limit: int = 50, offset: int = 0, target_id: str | None = None, user: User = Depends(current_user),
              db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    limit, offset = _page(limit, offset)
    q = select(Run).order_by(Run.started_at.desc())
    if target_id:
        q = q.where(Run.target_id == target_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    return {"total": total, "items": [run_summary(r) for r in db.execute(q.limit(limit).offset(offset)).scalars()]}


@router.get("/runs/{rid}", tags=["runs"])
def run_get(rid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    r = db.get(Run, rid)
    if not r:
        raise ApiError(404, "not_found", "Run not found.")
    d = run_out(r)
    d["verifier"] = assistant.verifier_report(d)
    return d


@router.get("/runs/{rid}/verify-manifest", tags=["runs"])
def run_verify(rid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    r = db.get(Run, rid)
    if not r:
        raise ApiError(404, "not_found", "Run not found.")
    sig = hmac_sign(system.manifest_key(db), r.manifest)
    result_ok = sha256_obj(r.result) == r.manifest.get("result_hash")
    state_ok = sha256_obj(r.state_snapshot) == r.manifest.get("state_hash")
    return {"signature_valid": sig == r.manifest_signature, "result_hash_matches": result_ok, "state_hash_matches": state_ok,
            "note": "HMAC-SHA256 with a workspace-local key: detects tampering within this workspace; it is not a public-key signature."}


# ---------------------------------------------------------------- purple cases
class CaseIn(BaseModel):
    target_id: str


@router.post("/purple/cases", status_code=201, tags=["purple"])
def case_create(body: CaseIn, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    t = db.get(Target, body.target_id)
    if not t:
        raise ApiError(404, "not_found", "Target not found.")
    try:
        case, job = purple.create_case(db, t, user)
    except purple.PurpleError as e:
        raise _purple_err(e) from e
    return {"case": case_out(case), "job": job_out(job)}


@router.get("/purple/cases", tags=["purple"])
def cases_list(user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> list[dict[str, Any]]:
    return [case_out(c) for c in db.execute(select(PurpleCase).order_by(PurpleCase.created_at.desc())).scalars()]


@router.get("/purple/cases/{cid}", tags=["purple"])
def case_get(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    c = db.get(PurpleCase, cid)
    if not c:
        raise ApiError(404, "not_found", "Case not found.")
    t = db.get(Target, c.target_id)
    assert t is not None
    sc = scenarios.get(c.scenario_id)
    prev = sc.remediation.preview(copy.deepcopy(t.fixture_state))
    jobs = [j for j in db.execute(select(Job).where(Job.target_id == t.id).order_by(Job.created_at)).scalars()
            if (j.params or {}).get("case_id") == c.id]
    appr = db.execute(select(Approval).where(Approval.target_id == t.id).order_by(Approval.created_at.desc())).scalars().all()
    appr = [a for a in appr if a.detail.get("case_id") == c.id]
    base = db.get(Run, c.baseline_run_id) if c.baseline_run_id else None
    ret = db.get(Run, c.retest_run_id) if c.retest_run_id else None
    return {
        "case": case_out(c), "target": target_out(t), "scenario": sc.public(),
        "remediation_preview": {"lines": prev["lines"]},
        "jobs": [job_out(j) for j in jobs], "approvals": [approval_out(a) for a in appr[:5]],
        "baseline": run_summary(base) if base else None, "retest": run_summary(ret) if ret else None,
    }


class ApproveIn(BaseModel):
    action: Literal["apply", "rollback"] = "apply"
    params: dict[str, Any] | None = None
    confirm: bool = Field(default=False, description="Must be true: records an explicit human confirmation.")


@router.post("/purple/cases/{cid}/approve", tags=["purple"])
def case_approve(cid: str, body: ApproveIn, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    c = db.get(PurpleCase, cid)
    if not c:
        raise ApiError(404, "not_found", "Case not found.")
    if not body.confirm:
        raise ApiError(422, "confirmation_required", "Explicit confirmation is required to grant an approval.")
    try:
        a = purple.grant_approval(db, c, user, body.action, body.params)
    except purple.PurpleError as e:
        db.commit()
        raise _purple_err(e) from e
    return approval_out(a)


class ApplyIn(BaseModel):
    approval_id: str


@router.post("/purple/cases/{cid}/apply", tags=["purple"])
def case_apply(cid: str, body: ApplyIn, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    c = db.get(PurpleCase, cid)
    if not c:
        raise ApiError(404, "not_found", "Case not found.")
    try:
        c = purple.apply_change(db, c, user, body.approval_id)
    except purple.PurpleError as e:
        db.commit()
        raise _purple_err(e) from e
    return case_out(c)


@router.post("/purple/cases/{cid}/rollback", tags=["purple"])
def case_rollback(cid: str, body: ApplyIn, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    c = db.get(PurpleCase, cid)
    if not c:
        raise ApiError(404, "not_found", "Case not found.")
    try:
        c = purple.rollback_change(db, c, user, body.approval_id)
    except purple.PurpleError as e:
        db.commit()
        raise _purple_err(e) from e
    return case_out(c)


@router.post("/purple/cases/{cid}/retest", status_code=202, tags=["purple"])
def case_retest(cid: str, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    c = db.get(PurpleCase, cid)
    if not c:
        raise ApiError(404, "not_found", "Case not found.")
    try:
        job = purple.request_retest(db, c, user)
    except purple.PurpleError as e:
        raise _purple_err(e) from e
    return job_out(job)


# ---------------------------------------------------------------- findings
@router.get("/findings", tags=["findings"])
def findings_list(limit: int = 50, offset: int = 0, severity: str | None = None, status: str | None = None,
                  source: str | None = None, verification: str | None = None, q: str | None = None,
                  user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    limit, offset = _page(limit, offset)
    stmt = select(Finding)
    if severity:
        stmt = stmt.where(Finding.severity == severity)
    if status:
        stmt = stmt.where(Finding.status == status)
    if source:
        stmt = stmt.where(Finding.source == source)
    if verification:
        stmt = stmt.where(Finding.verification == verification)
    if q:
        like = f"%{q[:60]}%"
        stmt = stmt.where(Finding.title.ilike(like) | Finding.plain_title.ilike(like) | Finding.stable_id.ilike(like))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(Finding.created_at.desc()).limit(limit).offset(offset)).scalars().all()
    sev = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    rows.sort(key=lambda f: -sev[f.severity])
    return {"total": total, "items": [finding_out(f, full=False) for f in rows]}


@router.get("/findings/{fid}", tags=["findings"])
def finding_get(fid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    f = db.get(Finding, fid) or db.execute(select(Finding).where(Finding.stable_id == fid)).scalar_one_or_none()
    if not f:
        raise ApiError(404, "not_found", "Finding not found.")
    out = finding_out(f)
    out["explanation"] = assistant.explain_finding(out, use_model=False).as_dict()
    return out


class TriageIn(BaseModel):
    status: Literal["open", "triaged", "accepted", "false_positive"]
    note: str | None = Field(default=None, max_length=500)


@router.patch("/findings/{fid}", tags=["findings"])
def finding_triage(fid: str, body: TriageIn, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    f = db.get(Finding, fid)
    if not f:
        raise ApiError(404, "not_found", "Finding not found.")
    f.status = body.status
    f.history = [*f.history, {"at": utcnow().isoformat(), "event": f"triage:{body.status}", "by": user.email, "note": body.note}]
    audit.record(db, user.email, "finding.triage", "ok", f.stable_id, {"status": body.status})
    return finding_out(f)


@router.post("/findings/{fid}/explain", tags=["findings"])
def finding_explain(fid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    f = db.get(Finding, fid)
    if not f:
        raise ApiError(404, "not_found", "Finding not found.")
    audit.record(db, user.email, "assistant.explain", "ok", f.stable_id, {})
    return assistant.explain_finding(finding_out(f), use_model=True).as_dict()


# ---------------------------------------------------------------- incidents
@router.get("/incidents", tags=["incidents"])
def incidents_list(limit: int = 50, offset: int = 0, status: str | None = None, user: User = Depends(current_user),
                   db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    limit, offset = _page(limit, offset)
    q = select(Incident).order_by(Incident.created_at.desc())
    if status:
        q = q.where(Incident.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    return {"total": total, "items": [incident_out(i, full=False) for i in db.execute(q.limit(limit).offset(offset)).scalars()]}


@router.get("/incidents/{iid}", tags=["incidents"])
def incident_get(iid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    i = db.get(Incident, iid)
    if not i:
        raise ApiError(404, "not_found", "Incident not found.")
    out = incident_out(i)
    out["summary"] = {
        "label": "DETERMINISTIC",
        "text": f"{i.title}: {i.severity_reason} Affected: {', '.join(i.affected_assets[:6])}. "
                f"Evidence events cited: {len(i.evidence_event_ids)}.",
        "insufficient_evidence": len(i.evidence_event_ids) == 0,
    }
    return out


class IncidentPatch(BaseModel):
    status: Literal["open", "investigating", "resolved", "false_positive"] | None = None
    owner: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)


@router.patch("/incidents/{iid}", tags=["incidents"])
def incident_patch(iid: str, body: IncidentPatch, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    i = db.get(Incident, iid)
    if not i:
        raise ApiError(404, "not_found", "Incident not found.")
    if body.status:
        i.status = body.status
    if body.owner is not None:
        i.owner = body.owner or None
    if body.note:
        i.notes = [*i.notes, {"at": utcnow().isoformat(), "by": user.display_name, "text": body.note}]
    audit.record(db, user.email, "incident.update", "ok", i.stable_id, body.model_dump(exclude_none=True, exclude={"note"}))
    return incident_out(i)


# ---------------------------------------------------------------- detection lab
@router.get("/detection/rules", tags=["detection"])
def rules_get(user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    t = db.execute(select(Target).where(Target.scenario_id == "auth-detection-gap")).scalar_one_or_none()
    if not t:
        raise ApiError(404, "not_found", "Detection lab target missing.")
    versions = db.execute(select(DetectionRuleVersion).where(DetectionRuleVersion.target_id == t.id)
                          .order_by(DetectionRuleVersion.created_at)).scalars().all()
    return {"target_id": t.id, "rules": t.fixture_state["rules"], "limits": {k: {kk: list(vv) for kk, vv in v.items()}
                                                                              for k, v in auth_detection.RULE_LIMITS.items()},
            "recommended": auth_detection.RECOMMENDED_RULE,
            "history": [{"rule_id": v.rule_id, "version": v.version, "definition": v.definition, "note": v.change_note,
                         "by": v.created_by, "at": v.created_at.isoformat()} for v in versions]}


class RuleTestIn(BaseModel):
    rules: list[dict[str, Any]] = Field(max_length=10)


@router.post("/detection/test", tags=["detection"])
def rules_test(body: RuleTestIn, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    """Replay the labelled synthetic dataset through DRAFT rules. Nothing is saved or changed."""
    t = db.execute(select(Target).where(Target.scenario_id == "auth-detection-gap")).scalar_one_or_none()
    if not t:
        raise ApiError(404, "not_found", "Detection lab target missing.")
    ctx = system.policy_context(db)
    from ..policy import evaluate
    dec = evaluate(ctx, system.to_scope(t), "log_replay")
    if not dec.allowed:
        raise ApiError(403, dec.code, dec.reason)
    rules = []
    for r in body.rules:
        errs = auth_detection.validate_rule(r)
        if errs:
            raise ApiError(422, "invalid_rule", "; ".join(errs))
        rules.append({**r, "version": int(r.get("version", 1)), "enabled": r.get("enabled", True)})
    sc = auth_detection.score(rules, t.fixture_state["events"])
    for a in sc["alerts"]:
        a.pop("event_ids", None)
    return {"label": "SIMULATED", "score": sc, "dataset": t.fixture_state["dataset"],
            "caveat": "Scored on a small labelled synthetic dataset (2 campaigns); not a measure of real-world accuracy."}


# ---------------------------------------------------------------- cloud checks
SAMPLES = {
    "iam": {"label": "Over-broad deploy role policy (sample)", "text": None},
    "terraform": {"label": "Risky Terraform snippet (sample)", "text": '''resource "aws_s3_bucket" "assets" {
  bucket = "acme-demo-assets"
  acl    = "public-read"
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_security_group" "admin" {
  name = "admin-access"
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "main" {
  engine              = "postgres"
  instance_class      = "db.t3.micro"
  publicly_accessible = true
  storage_encrypted   = false
}
'''},
}


@router.get("/cloud/samples", tags=["cloud"])
def cloud_samples(user: User = Depends(current_user)) -> dict[str, Any]:
    from ..scenarios import iam_policy
    s = copy.deepcopy(SAMPLES)
    s["iam"]["text"] = iam_policy.initial_state()["policy_text"]
    s["iam_trust"] = {"label": "Wildcard trust policy (sample)", "text": iam_policy.initial_state()["trust_text"]}
    return s


class AnalyzeIn(BaseModel):
    kind: Literal["iam", "iam_trust", "terraform"]
    text: str = Field(min_length=2, max_length=cloud.MAX_INPUT_BYTES)
    label: str = Field(default="Pasted input", max_length=120)


@router.post("/cloud/analyze", tags=["cloud"])
def cloud_analyze(body: AnalyzeIn, user: User = Depends(ANALYST_UP), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        if body.kind == "terraform":
            res = cloud.analyze_terraform(body.text)
        else:
            res = cloud.analyze_iam_policy(body.text, "trust" if body.kind == "iam_trust" else "identity")
    except cloud.AnalysisInputError as e:
        raise ApiError(422, "invalid_input", str(e)) from e
    res["label"] = "SIMULATED"
    res["note"] = "Static analysis of the text you supplied. Nothing was fetched and no cloud API was called."
    rec = AnalysisReport(kind=body.kind, label=body.label, input_hash=sha256_obj(body.text), result=res, created_by=user.email)
    db.add(rec)
    db.flush()
    audit.record(db, user.email, "cloud.analyze", "ok", rec.id, {"kind": body.kind, "findings": len(res["findings"])})
    return {"id": rec.id, **res}


@router.get("/cloud/analyses", tags=["cloud"])
def cloud_list(user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> list[dict[str, Any]]:
    rows = db.execute(select(AnalysisReport).order_by(AnalysisReport.created_at.desc()).limit(20)).scalars().all()
    return [{"id": r.id, "kind": r.kind, "label": r.label, "created_at": r.created_at.isoformat(),
             "summary": r.result.get("summary"), "findings": len(r.result.get("findings", []))} for r in rows]


@router.get("/cloud/analyses/{aid}", tags=["cloud"])
def cloud_get(aid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    r = db.get(AnalysisReport, aid)
    if not r:
        raise ApiError(404, "not_found", "Analysis not found.")
    return {"id": r.id, "kind": r.kind, "label": r.label, **r.result}


# ---------------------------------------------------------------- AI security lab info
@router.get("/ai-lab/cases", tags=["ai-lab"])
def ai_cases(user: User = Depends(current_user)) -> dict[str, Any]:
    from ..scenarios import ai_agent
    return {"seed": ai_agent.SEED, "canary_note": "The canary is synthetic and protects nothing real.",
            "tools": ai_agent.TOOLS, "guardrails": list(ai_agent.GUARDRAILS),
            "cases": [{k: c[k] for k in ("id", "title", "category", "severity", "plain", "user", "doc", "tool_result")} for c in ai_agent.CASES]}


@router.get("/assistant/plan/{sid}", tags=["assistant"])
def assistant_plan(sid: str, user: User = Depends(current_user)) -> dict[str, Any]:
    try:
        return assistant.coordinator_plan(scenarios.get(sid))
    except KeyError as e:
        raise ApiError(404, "not_found", "Unknown scenario.") from e


_ = Request
