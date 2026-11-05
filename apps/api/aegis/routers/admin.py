"""Reports, users, workspace settings, data export/reset, glossary."""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import assistant, audit, reports, seed, system
from ..config import get_settings
from ..db import get_db
from ..deps import ADMIN_ONLY, ANALYST_UP, ApiError, current_user
from ..models import Finding, Incident, PurpleCase, Run, Target, User, UserSession, utcnow
from ..security import hash_password, redact_obj
from ..serialize import case_out, finding_out, incident_out, run_out, target_out, user_out

router = APIRouter()
HTML_HEADERS = {"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "Cache-Control": "no-store"}


# ---------------------------------------------------------------- reports
@router.get("/reports/runs/{rid}.json", tags=["reports"])
def run_json(rid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> JSONResponse:
    r = db.get(Run, rid)
    if not r:
        raise ApiError(404, "not_found", "Run not found.")
    d = run_out(r)
    d["verifier"] = assistant.verifier_report(d)
    audit.record(db, user.email, "report.export", "ok", rid, {"format": "json"})
    return JSONResponse(d, headers={"Content-Disposition": f'attachment; filename="aegis-run-{rid[:8]}.json"'})


@router.get("/reports/runs/{rid}.html", tags=["reports"], response_class=HTMLResponse)
def run_html(rid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> HTMLResponse:
    r = db.get(Run, rid)
    if not r:
        raise ApiError(404, "not_found", "Run not found.")
    t = db.get(Target, r.target_id)
    assert t is not None
    d = run_out(r)
    audit.record(db, user.email, "report.export", "ok", rid, {"format": "html"})
    return HTMLResponse(reports.run_report_html(r, t, assistant.verifier_report(d)), headers=HTML_HEADERS)


@router.get("/reports/cases/{cid}.html", tags=["reports"], response_class=HTMLResponse)
def case_html(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> HTMLResponse:
    c = db.get(PurpleCase, cid)
    if not c:
        raise ApiError(404, "not_found", "Case not found.")
    t = db.get(Target, c.target_id)
    assert t is not None
    base = db.get(Run, c.baseline_run_id) if c.baseline_run_id else None
    ret = db.get(Run, c.retest_run_id) if c.retest_run_id else None
    audit.record(db, user.email, "report.export", "ok", cid, {"format": "html"})
    return HTMLResponse(reports.case_report_html(c, t, base, ret), headers=HTML_HEADERS)


@router.get("/reports/cases/{cid}.json", tags=["reports"])
def case_json(cid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> JSONResponse:
    c = db.get(PurpleCase, cid)
    if not c:
        raise ApiError(404, "not_found", "Case not found.")
    out: dict[str, Any] = {"case": case_out(c)}
    for key, rid in (("baseline", c.baseline_run_id), ("retest", c.retest_run_id)):
        r = db.get(Run, rid) if rid else None
        out[key] = {"manifest": r.manifest, "signature": r.manifest_signature, "metrics": r.metrics,
                    "findings": r.result.get("findings", [])} if r else None
    audit.record(db, user.email, "report.export", "ok", cid, {"format": "json"})
    return JSONResponse(out, headers={"Content-Disposition": f'attachment; filename="aegis-case-{cid[:8]}.json"'})


@router.get("/reports/workspace.html", tags=["reports"], response_class=HTMLResponse)
def workspace_html(user: User = Depends(current_user), db: Session = Depends(get_db)) -> HTMLResponse:
    fs = db.execute(select(Finding)).scalars().all()
    open_f = [f for f in fs if f.verification != "VERIFIED_FIXED" and f.status not in ("accepted", "false_positive")]
    rank = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    open_f.sort(key=lambda f: -rank[f.severity])
    data = {"open": len(open_f), "fixed": sum(1 for f in fs if f.verification == "VERIFIED_FIXED"),
            "incidents": db.scalar(select(func.count()).select_from(Incident).where(Incident.status.in_(["open", "investigating"]))) or 0,
            "verified_cases": db.scalar(select(func.count()).select_from(PurpleCase).where(PurpleCase.status == "verified")) or 0,
            "top": [finding_out(f, full=False) for f in open_f[:10]]}
    return HTMLResponse(reports.workspace_report_html(data), headers=HTML_HEADERS)


# ---------------------------------------------------------------- users (admin)
@router.get("/users", tags=["admin"])
def users_list(user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [user_out(u) for u in db.execute(select(User).order_by(User.created_at)).scalars()]


class UserIn(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    role: Literal["admin", "analyst", "viewer"]
    password: str = Field(min_length=12, max_length=128)


@router.post("/users", status_code=201, tags=["admin"])
def user_create(body: UserIn, admin: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none():
        raise ApiError(409, "duplicate", "A user with that email already exists.")
    u = User(email=body.email.lower(), display_name=body.display_name, role=body.role, password_hash=hash_password(body.password))
    db.add(u)
    db.flush()
    audit.record(db, admin.email, "user.create", "ok", u.email, {"role": u.role})
    return user_out(u)


class UserPatch(BaseModel):
    role: Literal["admin", "analyst", "viewer"] | None = None
    is_active: bool | None = None


@router.patch("/users/{uid}", tags=["admin"])
def user_patch(uid: str, body: UserPatch, admin: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    u = db.get(User, uid)
    if not u:
        raise ApiError(404, "not_found", "User not found.")
    if u.id == admin.id and (body.role not in (None, "admin") or body.is_active is False):
        raise ApiError(409, "self_lockout", "You cannot demote or disable your own account.")
    if body.role:
        u.role = body.role
    if body.is_active is not None:
        u.is_active = body.is_active
        if not body.is_active:
            for s in db.execute(select(UserSession).where(UserSession.user_id == u.id)).scalars():
                db.delete(s)
    audit.record(db, admin.email, "user.update", "ok", u.email, body.model_dump(exclude_none=True))
    return user_out(u)


# ---------------------------------------------------------------- settings / data
@router.get("/settings", tags=["settings"])
def settings_get(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    s = get_settings()
    return {
        "retention_days": system.get_setting(db, "retention", {"days": s.retention_days})["days"],
        "environment": s.environment,
        "model": assistant.get_provider().status(),
        "secrets_note": "Secret values (API keys) are read from environment variables only and are never displayed.",
        "cors_origins": s.cors_origins.split(","),
        "session_ttl_minutes": s.session_ttl_minutes,
    }


class RetentionIn(BaseModel):
    days: int = Field(ge=1, le=3650)


@router.put("/settings/retention", tags=["settings"])
def retention_set(body: RetentionIn, admin: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, int]:
    system.set_setting(db, "retention", {"days": body.days})
    audit.record(db, admin.email, "settings.retention", "ok", None, {"days": body.days})
    return {"days": body.days}


@router.post("/settings/purge-expired", tags=["settings"])
def purge_expired(admin: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, int]:
    days = system.get_setting(db, "retention", {"days": get_settings().retention_days})["days"]
    cutoff = utcnow() - timedelta(days=days)
    n = 0
    for r in db.execute(select(Run).where(Run.started_at < cutoff)).scalars():
        db.delete(r)
        n += 1
    audit.record(db, admin.email, "settings.purge", "ok", None, {"runs_deleted": n, "older_than_days": days})
    return {"runs_deleted": n}


@router.get("/settings/export", tags=["settings"])
def config_export(admin: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> JSONResponse:
    """Safe configuration export: structure and policy, no secrets and no password hashes."""
    s = get_settings()
    out = redact_obj({
        "mode": system.get_mode(db).value, "kill_switch": system.kill_switch_engaged(db),
        "targets": [target_out(t) for t in db.execute(select(Target)).scalars()],
        "users": [{"email": u.email, "role": u.role, "active": u.is_active} for u in db.execute(select(User)).scalars()],
        "model_provider": s.model_provider, "retention_days": s.retention_days,
    })
    audit.record(db, admin.email, "settings.export", "ok")
    return JSONResponse(out, headers={"Content-Disposition": 'attachment; filename="aegis-config.json"'})


@router.get("/settings/export-data", tags=["settings"])
def data_export(admin: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> JSONResponse:
    out = {"findings": [finding_out(f) for f in db.execute(select(Finding)).scalars()],
           "incidents": [incident_out(i) for i in db.execute(select(Incident)).scalars()],
           "cases": [case_out(c) for c in db.execute(select(PurpleCase)).scalars()],
           "runs": [{"id": r.id, "manifest": r.manifest, "signature": r.manifest_signature} for r in db.execute(select(Run)).scalars()]}
    audit.record(db, admin.email, "settings.export_data", "ok")
    return JSONResponse(out, headers={"Content-Disposition": 'attachment; filename="aegis-demo-data.json"'})


class ResetIn(BaseModel):
    confirm: Literal["RESET DEMO DATA"]


@router.post("/settings/reset-demo", tags=["settings"])
def reset_demo(body: ResetIn, admin: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    counts = seed.reset_demo_data(db)
    audit.record(db, admin.email, "settings.reset_demo", "ok", None, counts)
    return {"deleted": counts, "note": "Fixtures restored. The audit log is append-only and was kept."}


GLOSSARY = [
    ("Simulated", "Produced by running checks against a made-up fixture, not a real system. Nothing real was touched."),
    ("Verified (simulated)", "A re-run of the same versioned scenario no longer shows the problem. It proves the fix in the lab, not in production."),
    ("Finding", "Something the tests noticed that could weaken your defences, written as what / why / fix / how we'll know."),
    ("Evidence", "The recorded observation behind a finding: where it came from, when, and how to reproduce it."),
    ("Observed vs. inferred", "Observed means directly seen in the fixture. Inferred is a reasoned guess and is never presented as a confirmed breach."),
    ("Purple team", "Red (attack simulation) and Blue (detection) working together: find, fix, then prove the fix."),
    ("Detection rule", "A saved pattern that raises an alert, for example 'many failed logins from one address'."),
    ("False positive", "An alert on harmless activity. Too many teach people to ignore alerts."),
    ("Recall / Precision", "Recall: how many real attacks were caught. Precision: how many alerts were real. Measured on a small synthetic dataset only."),
    ("Prompt injection", "Hiding instructions inside content an AI reads, hoping it will obey them as if the user wrote them."),
    ("Canary", "A fake secret planted to see if it leaks. It protects nothing real."),
    ("Guardrail", "A code-enforced rule around an AI agent, such as an allowlist of tools it may call."),
    ("Least privilege", "Give a person or program only the permissions it needs, nothing more."),
    ("Kill switch", "One control that immediately stops all running and future tests."),
    ("Scope", "The exact list of things a test is allowed to touch. Anything outside it is blocked."),
    ("Content-Security-Policy", "A browser instruction listing which scripts a page may run, limiting the damage of injected code."),
    ("MITRE ATT&CK", "A public catalogue of attacker techniques, shown here only as a contextual label."),
    ("Exposure points", "AegisAI's simple sum of severity weights (critical 10, high 7, medium 4, low 1). Not CVSS."),
]


@router.get("/glossary", tags=["docs"])
def glossary() -> list[dict[str, str]]:
    return [{"term": t, "definition": d} for t, d in GLOSSARY]


_ = ANALYST_UP
