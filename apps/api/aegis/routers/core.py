"""Auth, system status/safety controls, audit, targets (scope manager), scenarios, dashboard."""
from __future__ import annotations

import copy
import secrets
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import assistant, audit, scenarios, system
from ..config import BRAND, get_settings
from ..db import get_db
from ..deps import ADMIN_ONLY, ANALYST_UP, COOKIE, ApiError, LoginThrottle, current_session, current_user, throttle
from ..models import Approval, Finding, Incident, Job, PurpleCase, Run, Target, User, UserSession, utcnow
from ..policy import Action, Mode, evaluate
from ..security import new_token, redact, token_digest, verify_password
from ..serialize import finding_out, incident_out, job_out, run_summary, target_out, user_out

router = APIRouter()


# ---------------------------------------------------------------- auth
class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)


@router.post("/auth/login", tags=["auth"])
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    key = f"{body.email.lower()}|{request.client.host if request.client else '?'}"
    throttle.check(key)
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(user.password_hash, body.password):
        throttle.fail(key)
        audit.record(db, body.email.lower()[:120], "auth.login", "denied", None, {"reason": "bad_credentials"})
        db.commit()
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    throttle.clear(key)
    token, csrf = new_token(), secrets.token_urlsafe(24)
    ttl = timedelta(minutes=get_settings().session_ttl_minutes)
    db.add(UserSession(token_hash=token_digest(token), csrf_token=csrf, user_id=user.id, expires_at=utcnow() + ttl))
    response.set_cookie(COOKIE, token, httponly=True, samesite="strict", secure=get_settings().cookie_secure,
                        max_age=int(ttl.total_seconds()), path="/")
    audit.record(db, user.email, "auth.login", "ok")
    return {"user": user_out(user), "csrf_token": csrf}


@router.post("/auth/logout", tags=["auth"])
def logout(response: Response, sess: UserSession = Depends(current_session), db: Session = Depends(get_db)) -> dict[str, bool]:
    audit.record(db, sess.user.email, "auth.logout")
    db.delete(sess)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me", tags=["auth"])
def me(sess: UserSession = Depends(current_session)) -> dict[str, Any]:
    return {"user": user_out(sess.user), "csrf_token": sess.csrf_token}


class PrefsIn(BaseModel):
    theme: Literal["light", "dark", "system"] | None = None
    view_mode: Literal["guided", "analyst"] | None = None
    onboarded: bool | None = None
    start_choice: Literal["demo", "explain", "connect"] | None = None


@router.patch("/auth/preferences", tags=["auth"])
def set_prefs(body: PrefsIn, sess: UserSession = Depends(current_session), db: Session = Depends(get_db)) -> dict[str, Any]:
    u = sess.user
    prefs = dict(u.preferences or {})
    prefs.update(body.model_dump(exclude_none=True))
    u.preferences = prefs
    return user_out(u)


# ---------------------------------------------------------------- health / status
@router.get("/health", tags=["system"])
def health(db: Session = Depends(get_db)) -> dict[str, Any]:
    db.execute(select(1))
    return {"status": "ok", "brand": BRAND["name"], "version": "0.1.0"}


@router.get("/system/status", tags=["system"])
def status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    beat = system.get_setting(db, "worker_heartbeat", {})
    worker_state = "UNKNOWN"
    if beat.get("at"):
        age = (utcnow() - __import__("datetime").datetime.fromisoformat(beat["at"])).total_seconds()
        worker_state = "ONLINE" if age < 15 else "OFFLINE"
    else:
        worker_state = "OFFLINE"
    queued = db.scalar(select(func.count()).select_from(Job).where(Job.status == "queued")) or 0
    running = db.scalar(select(func.count()).select_from(Job).where(Job.status == "running")) or 0
    prov = assistant.get_provider().status()
    return {
        "brand": BRAND, "mode": system.get_mode(db).value, "kill_switch": system.kill_switch_engaged(db),
        "worker": {"state": worker_state, "last_heartbeat": beat.get("at"), "queued": queued, "running": running},
        "model": prov,
        "integrations": [
            {"id": "aegissoc", "name": "AegisSOC event connector", "state": "UNCONFIGURED",
             "detail": "Read-only normalized-event contract is defined (docs/integrations). Not connected; not required."},
            {"id": "aws", "name": "AWS read-only connector", "state": "UNCONFIGURED",
             "detail": "Disabled. No AWS credentials are requested or used; analysis is offline."},
            {"id": "checkov", "name": "Checkov / Semgrep (optional)", "state": "UNCONFIGURED",
             "detail": "Optional adapters are not installed. Built-in analyzers work without them."},
        ],
        "data_label": "All assessment evidence in this build is SIMULATED against fixtures.",
    }


class ModeIn(BaseModel):
    mode: Mode


@router.put("/system/mode", tags=["system"])
def set_mode(body: ModeIn, user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    if body.mode == Mode.EXTERNAL_AUTHORIZED:
        audit.record(db, user.email, "mode.set", "denied", None, {"mode": body.mode.value})
        db.commit()
        raise ApiError(422, "mode_disabled", "EXTERNAL_AUTHORIZED mode is designed but runtime-disabled in this version.")
    system.set_setting(db, "policy", {"mode": body.mode.value})
    audit.record(db, user.email, "mode.set", "ok", None, {"mode": body.mode.value})
    return {"mode": body.mode.value}


class KillIn(BaseModel):
    engaged: bool


@router.post("/system/kill-switch", tags=["system"])
def kill_switch(body: KillIn, user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    system.set_setting(db, "kill_switch", {"engaged": body.engaged, "by": user.email, "at": utcnow().isoformat()})
    audit.record(db, user.email, "kill_switch", "ok", None, {"engaged": body.engaged})
    return {"engaged": body.engaged}


@router.post("/system/emergency-stop", tags=["system"])
def emergency_stop(user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Engage the kill switch AND cancel every queued/running job."""
    system.set_setting(db, "kill_switch", {"engaged": True, "by": user.email, "at": utcnow().isoformat()})
    n = 0
    for j in db.execute(select(Job).where(Job.status.in_(["queued", "running"]))).scalars():
        j.cancel_requested = True
        if j.status == "queued":
            j.status, j.finished_at, j.error = "cancelled", utcnow(), "Emergency stop"
        n += 1
    audit.record(db, user.email, "emergency_stop", "ok", None, {"jobs_cancelled": n})
    return {"engaged": True, "jobs_cancelled": n}


@router.get("/audit", tags=["audit"])
def audit_list(limit: int = 100, offset: int = 0, action: str | None = None, user: User = Depends(ANALYST_UP),
               db: Session = Depends(get_db)) -> dict[str, Any]:
    from ..models import AuditEntry
    limit = max(1, min(limit, 200))
    q = select(AuditEntry).order_by(AuditEntry.id.desc())
    if action:
        q = q.where(AuditEntry.action == action)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(q.limit(limit).offset(offset)).scalars().all()
    return {"total": total, "items": [{"id": e.id, "ts": e.ts.isoformat(), "actor": e.actor, "action": e.action,
                                       "outcome": e.outcome, "target_ref": e.target_ref, "detail": e.detail,
                                       "hash": e.entry_hash[:16]} for e in rows]}


@router.get("/audit/verify", tags=["audit"])
def audit_verify(user: User = Depends(ANALYST_UP), db: Session = Depends(get_db)) -> dict[str, Any]:
    return audit.verify(db)


# ---------------------------------------------------------------- targets / scope
class TargetIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,58}$")
    name: str = Field(min_length=2, max_length=120)
    owner: str = Field(min_length=2, max_length=120)
    purpose: str = Field(min_length=3, max_length=500)
    environment: Literal["fixture", "lab_container", "external"] = "fixture"
    kind: Literal["web", "iam", "auth_logs", "ai_agent"] = "web"
    hosts: list[str] = Field(default_factory=list, max_length=20)
    cidrs: list[str] = Field(default_factory=list, max_length=20)
    allowed_actions: list[str] = Field(default_factory=list, max_length=10)
    tags: list[str] = Field(default_factory=list, max_length=10)
    criticality: Literal["low", "medium", "high"] = "medium"
    rate_limit_per_min: int = Field(default=60, ge=1, le=600)
    window_hours: int | None = Field(default=None, ge=1, le=24 * 30)


def _validate_target(b: TargetIn) -> None:
    import ipaddress
    for c in b.cidrs:
        try:
            net = ipaddress.ip_network(c, strict=False)
        except ValueError as exc:
            raise ApiError(422, "invalid_cidr", f"'{c}' is not a valid CIDR.") from exc
        if net.prefixlen < (16 if net.version == 4 else 48):
            raise ApiError(422, "scope_too_broad", f"{c} is too broad; the largest permitted network is /16 (IPv4).")
        if not (net.is_private or net.is_loopback):
            raise ApiError(422, "scope_not_private", f"{c} is not a private/loopback network; public ranges cannot be scoped.")
        if net.is_link_local:
            raise ApiError(422, "scope_blocked", f"{c} is link-local/metadata space and can never be in scope.")
    for a in b.allowed_actions:
        try:
            Action(a)
        except ValueError as exc:
            raise ApiError(422, "unknown_action", f"'{a}' is not an allowlisted action.") from exc
    for h in b.hosts:
        if "/" in h or " " in h or "@" in h:
            raise ApiError(422, "invalid_host", f"Host '{h}' must be a bare name or address.")


@router.get("/targets", tags=["targets"])
def targets_list(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [target_out(t) for t in db.execute(select(Target).order_by(Target.created_at, Target.slug)).scalars()]


@router.get("/targets/{tid}", tags=["targets"])
def target_get(tid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    t = db.get(Target, tid)
    if not t:
        raise ApiError(404, "not_found", "Target not found.")
    return target_out(t, full=user.role != "viewer")


@router.post("/targets", status_code=201, tags=["targets"])
def target_create(body: TargetIn, user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    _validate_target(body)
    if db.execute(select(Target).where(Target.slug == body.slug)).scalar_one_or_none():
        raise ApiError(409, "duplicate", "A target with that slug already exists.")
    t = Target(slug=body.slug, name=body.name, owner=body.owner, purpose=body.purpose, environment=body.environment,
               kind=body.kind, hosts=body.hosts, cidrs=body.cidrs, allowed_actions=body.allowed_actions, tags=body.tags,
               criticality=body.criticality, rate_limit_per_min=body.rate_limit_per_min, approval_status="pending",
               window_end=(utcnow() + timedelta(hours=body.window_hours)) if body.window_hours else None)
    db.add(t)
    db.flush()
    audit.record(db, user.email, "target.create", "ok", t.slug, {"environment": t.environment})
    return target_out(t)


class TargetPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    purpose: str | None = Field(default=None, max_length=500)
    allowed_actions: list[str] | None = None
    tags: list[str] | None = None
    criticality: Literal["low", "medium", "high"] | None = None
    approval_status: Literal["approved", "pending", "revoked"] | None = None
    rate_limit_per_min: int | None = Field(default=None, ge=1, le=600)
    window_hours: int | None = Field(default=None, ge=1, le=24 * 30)


@router.patch("/targets/{tid}", tags=["targets"])
def target_patch(tid: str, body: TargetPatch, user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    t = db.get(Target, tid)
    if not t:
        raise ApiError(404, "not_found", "Target not found.")
    data = body.model_dump(exclude_none=True)
    if t.environment == "external" and data.get("approval_status") == "approved":
        audit.record(db, user.email, "target.approve", "denied", t.slug, {"reason": "external"})
        db.commit()
        raise ApiError(422, "external_disabled", "External targets cannot be approved: EXTERNAL_AUTHORIZED is disabled in v1.")
    if "allowed_actions" in data:
        for a in data["allowed_actions"]:
            try:
                Action(a)
            except ValueError as exc:
                raise ApiError(422, "unknown_action", f"'{a}' is not an allowlisted action.") from exc
    wh = data.pop("window_hours", None)
    for k, v in data.items():
        setattr(t, k, v)
    if wh:
        t.window_end = utcnow() + timedelta(hours=wh)
    audit.record(db, user.email, "target.update", "ok", t.slug, {"fields": sorted(data)})
    return target_out(t)


@router.delete("/targets/{tid}", tags=["targets"])
def target_delete(tid: str, user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, bool]:
    t = db.get(Target, tid)
    if not t:
        raise ApiError(404, "not_found", "Target not found.")
    if t.scenario_id:
        raise ApiError(409, "protected", "Built-in demo targets cannot be deleted; use reset instead.")
    slug = t.slug
    db.delete(t)
    audit.record(db, user.email, "target.delete", "ok", slug)
    return {"ok": True}


@router.get("/targets/{tid}/scope-review", tags=["targets"])
def scope_review(tid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    t = db.get(Target, tid)
    if not t:
        raise ApiError(404, "not_found", "Target not found.")
    ctx, scope = system.policy_context(db), system.to_scope(t)
    rows = []
    for a in Action:
        d = evaluate(ctx, scope, a.value)
        rows.append({"action": a.value, **d.as_dict()})
    return {"target": target_out(t), "mode": ctx.mode.value, "kill_switch": ctx.kill_switch, "actions": rows}


class PolicyCheckIn(BaseModel):
    action: str = Field(max_length=60)
    destination: str | None = Field(default=None, max_length=300)


@router.post("/targets/{tid}/policy-check", tags=["targets"])
def policy_check(tid: str, body: PolicyCheckIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Dry-run the policy engine. No network connection is made and no DNS resolution occurs for fixtures."""
    t = db.get(Target, tid)
    if not t:
        raise ApiError(404, "not_found", "Target not found.")
    scope = system.to_scope(t)
    dec = evaluate(system.policy_context(db), scope, body.action, body.destination,
                   resolver=lambda h: [])  # never resolve hostnames during a dry run
    audit.record(db, user.email, "policy.check", "allowed" if dec.allowed else "denied", t.slug,
                 {"action": body.action, "destination": body.destination, "code": dec.code})
    return dec.as_dict()


@router.post("/targets/{tid}/reset-fixture", tags=["targets"])
def reset_fixture(tid: str, user: User = Depends(ADMIN_ONLY), db: Session = Depends(get_db)) -> dict[str, Any]:
    t = db.get(Target, tid)
    if not t or not t.scenario_id:
        raise ApiError(404, "not_found", "Target has no resettable fixture.")
    t.fixture_state = copy.deepcopy(scenarios.get(t.scenario_id).initial_state())
    t.fixture_version += 1
    audit.record(db, user.email, "fixture.reset", "ok", t.slug)
    return target_out(t)


# ---------------------------------------------------------------- scenarios
@router.get("/scenarios", tags=["scenarios"])
def scenarios_list(user: User = Depends(current_user)) -> list[dict[str, Any]]:
    return [s.public() for s in sorted(scenarios.REGISTRY.values(), key=lambda s: s.demo_no)]


@router.get("/scenarios/{sid}", tags=["scenarios"])
def scenario_get(sid: str, user: User = Depends(current_user)) -> dict[str, Any]:
    try:
        sc = scenarios.get(sid)
    except KeyError as exc:
        raise ApiError(404, "not_found", "Unknown scenario.") from exc
    return {**sc.public(), "plan": assistant.coordinator_plan(sc)}


# ---------------------------------------------------------------- dashboard
@router.get("/dashboard", tags=["dashboard"])
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    targets = db.execute(select(Target)).scalars().all()
    findings = db.execute(select(Finding)).scalars().all()
    open_f = [f for f in findings if f.verification != "VERIFIED_FIXED" and f.status not in ("accepted", "false_positive")]
    sev_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    open_f.sort(key=lambda f: (-sev_rank[f.severity], f.created_at))
    incidents = db.execute(select(Incident).order_by(Incident.created_at.desc())).scalars().all()
    cases = db.execute(select(PurpleCase).order_by(PurpleCase.updated_at.desc())).scalars().all()
    runs = db.execute(select(Run).where(Run.evidence_label != "NONE").order_by(Run.started_at.desc()).limit(8)).scalars().all()
    jobs = db.execute(select(Job).order_by(Job.created_at.desc()).limit(6)).scalars().all()
    verified = [c for c in cases if c.status == "verified"]
    scen = []
    for s in sorted(scenarios.REGISTRY.values(), key=lambda s: s.demo_no):
        c = next((c for c in cases if c.scenario_id == s.id), None)
        scen.append({"scenario_id": s.id, "title": s.title, "demo_no": s.demo_no, "case_id": c.id if c else None,
                     "status": c.status if c else "not_started"})
    return {
        "targets": {"total": len(targets), "runnable": sum(1 for t in targets if t.environment == "fixture" and t.approval_status == "approved")},
        "findings": {"open": len(open_f), "verified_fixed": sum(1 for f in findings if f.verification == "VERIFIED_FIXED"),
                     "by_severity": {s: sum(1 for f in open_f if f.severity == s) for s in ("critical", "high", "medium", "low")},
                     "top": [finding_out(f, full=False) for f in open_f[:5]]},
        "incidents": {"open": sum(1 for i in incidents if i.status in ("open", "investigating")),
                      "recent": [incident_out(i, full=False) for i in incidents[:5]]},
        "purple": {"cases": len(cases), "verified": len(verified)},
        "scenarios": scen,
        "recent_runs": [run_summary(r) for r in runs],
        "recent_jobs": [job_out(j) for j in jobs],
        "pending_approvals": db.scalar(select(func.count()).select_from(Approval).where(Approval.status == "granted", Approval.expires_at > utcnow())) or 0,
        "label": "SIMULATED",
    }


# ---------------------------------------------------------------- public feedback (unauthenticated, bounded)
class FeedbackIn(BaseModel):
    message: str = Field(min_length=5, max_length=1000)
    contact: str | None = Field(default=None, max_length=255)


_fb_throttle = LoginThrottle()


@router.post("/public/feedback", status_code=201, tags=["public"])
def public_feedback(body: FeedbackIn, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    key = request.client.host if request.client else "?"
    _fb_throttle.check(key)
    _fb_throttle.fail(key)  # every submission counts toward the window; max 5 per window
    cur = system.get_setting(db, "feedback", {"items": []})["items"]
    cur = [*cur, {"at": utcnow().isoformat(), "message": redact(body.message), "contact": body.contact}][-200:]
    system.set_setting(db, "feedback", {"items": cur})
    return {"saved": True}
