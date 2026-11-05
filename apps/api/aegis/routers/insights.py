"""Read-only views derived from stored records: agents, attack-path graph, replay, notifications, search.

Nothing here invents data: every node, frame and notification maps to a stored run, finding, job or approval.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import assistant, scenarios, system
from ..db import get_db
from ..deps import ApiError, current_user
from ..ingest import stable_id
from ..models import Approval, Finding, Incident, Job, Run, Target, User, utcnow
from ..policy import Action

router = APIRouter()

ROLES: dict[str, dict[str, Any]] = {
    "Coordinator": {
        "responsibility": "Turns a scenario into an ordered plan of allowlisted steps. It cannot add steps or tools.",
        "tools": [], "approval": "None: plans are data and are re-checked step by step by the policy engine.",
    },
    "Red Analyst": {
        "responsibility": "Runs bounded checks (header, config, IAM, guardrail suites) against fixtures and records observations.",
        "tools": [Action.PASSIVE_HTTP_CHECK.value, Action.CONFIG_ANALYSIS.value, Action.AGENT_EVAL.value],
        "approval": "Checks need no approval; any change to a fixture needs a named human approval.",
    },
    "Blue Analyst": {
        "responsibility": "Replays recorded telemetry through detection rules and raises incidents with cited events.",
        "tools": [Action.LOG_REPLAY.value], "approval": "Replay needs none; rule changes are fixture changes and need approval.",
    },
    "Verifier": {
        "responsibility": "Checks that every finding cites existing evidence, the policy trail is complete and labels are honest.",
        "tools": [], "approval": "None. Read-only over stored runs.",
    },
}


def _role_map(sid: str) -> dict[str, str]:
    plan = assistant.coordinator_plan(scenarios.get(sid))
    return {s["id"]: s["assigned_to"] for s in plan["steps"]}


@router.get("/agents", tags=["agents"])
def agents(user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    runs = db.execute(select(Run).where(Run.evidence_label != "NONE").order_by(Run.started_at.desc()).limit(40)).scalars().all()
    active = db.execute(select(Job).where(Job.status.in_(["queued", "running"]))).scalars().all()
    history: dict[str, list[dict[str, Any]]] = {r: [] for r in ROLES}
    evidence: dict[str, int] = dict.fromkeys(ROLES, 0)
    for run in runs:
        roles = _role_map(run.scenario_id)
        by_role: dict[str, list[dict[str, Any]]] = {}
        for s in run.steps:
            by_role.setdefault(roles.get(s["step"], "Red Analyst"), []).append(
                {"title": s["title"], "action": s["action"], "decision": "allowed" if s["policy"]["allowed"] else "denied",
                 "at": s.get("at")})
        obs = run.result.get("observations", [])
        for role, steps in by_role.items():
            history[role].append({"run_id": run.id, "scenario": run.scenario_id, "version": run.scenario_version,
                                  "phase": run.phase, "at": run.started_at.isoformat(), "steps": steps,
                                  "outcome": f"{len(run.result.get('findings', []))} finding(s), {len(run.result.get('detections', []))} detection(s)"})
            evidence[role] += sum(1 for o in obs if o["step"] in {s2["step"] for s2 in run.steps if roles.get(s2["step"]) == role})
        ver = assistant.verifier_report({"result": run.result, "steps": run.steps, "scenario_version": run.scenario_version,
                                         "state_hash": run.state_hash, "evidence_label": run.evidence_label})
        history["Verifier"].append({"run_id": run.id, "scenario": run.scenario_id, "version": run.scenario_version,
                                    "phase": run.phase, "at": run.started_at.isoformat(),
                                    "steps": [{"title": c["check"], "action": "verification", "decision": "passed" if c["passed"] else "failed", "at": None}
                                              for c in ver["checks"]],
                                    "outcome": "all checks passed" if ver["passed"] else "checks failed"})
    out = []
    for name, meta in ROLES.items():
        h = history[name]
        out.append({
            "id": name.lower().replace(" ", "-"), "name": name, "type": "Deterministic role (no model required)",
            "responsibility": meta["responsibility"], "allowed_tools": meta["tools"], "approval": meta["approval"],
            "status": "active" if active and name != "Verifier" else "idle",
            "current_task": (active[0].current_step or f"queued: {active[0].params.get('scenario_id')}") if active and name != "Verifier" else None,
            "last_activity": h[0]["at"] if h else None, "executions": len(h), "evidence_count": evidence[name],
            "tokens": None, "cost": None, "usage_note": "Not available: deterministic roles use no model tokens.",
            "history": h[:6],
        })
    tgt = db.execute(select(Target).where(Target.scenario_id == "ai-prompt-injection")).scalar_one_or_none()
    under_test = None
    if tgt:
        st = tgt.fixture_state
        under_test = {"name": st.get("agent"), "target": tgt.slug, "guardrails": st.get("guardrails"),
                      "allowed_tools": st.get("agent_allowed_tools"), "all_tools": st.get("tools"),
                      "note": "A deterministic mock agent used as the subject of the AI Security lab. Its tools are harmless mocks."}
    return {"agents": out, "model": assistant.get_provider().status(), "agent_under_test": under_test,
            "controls": {"pause": False, "cancel_jobs": True, "approve": True,
                         "note": "Per-agent pause is not implemented; use job cancel or the global kill switch."}}


# ---- attack-path graph --------------------------------------------------------------------------
def _graph(run: Run, target: Target) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    def node(i: str, label: str, typ: str, status: str = "observed", **kw: Any) -> None:
        nodes.setdefault(i, {"id": i, "label": label, "type": typ, "status": status, **kw})

    def edge(a: str, b: str, label: str, confirmed: bool) -> None:
        edges.append({"from": a, "to": b, "label": label, "confirmed": confirmed})

    kind = target.kind
    st = run.state_snapshot
    asset = "asset"
    node(asset, target.name, "asset", detail=f"Fixture target `{target.slug}` (criticality {target.criticality}).")
    findings = run.result.get("findings", [])
    fid = {f["rule_id"] + f.get("location", ""): stable_id(target.slug, f["rule_id"], f.get("location", "")) for f in findings}
    if kind == "web":
        node("boundary", "Untrusted web clients (simulated)", "boundary", detail="Anyone who can send requests to the fixture.")
        edge("boundary", asset, "sends requests (seen in synthetic telemetry)", True)
        for h in ("X-Content-Type-Options", "Content-Security-Policy", "X-Frame-Options", "Referrer-Policy"):
            if h.lower() in {k.lower() for k in st["response"]["headers"]}:
                node(f"c:{h}", h, "control", "in_place", detail=f"{h} is set in the fixture response.")
                edge(f"c:{h}", asset, "protects", True)
    elif kind == "iam":
        node("boundary", "Principals allowed to assume the role", "boundary", detail="Defined by the trust policy.")
        edge("boundary", asset, "can assume (per trust policy text)", True)
        for c in run.result.get("access_checks", []):
            if c["expected"] == "deny" and c["ok"]:
                node(f"c:{c['action']}", f"Denied: {c['action']}", "control", "in_place", detail=c["purpose"])
                edge(f"c:{c['action']}", asset, "limits", True)
    elif kind == "auth_logs":
        for c in run.result.get("campaigns", []):
            cid = f"a:{c['campaign']}"
            node(cid, c["title"], "actor", "observed", detail=c["plain"] + " (synthetic labelled events)")
            edge(cid, asset, "login attempts present in synthetic data", True)
            if c["detected"]:
                node(f"c:{c['rule']}", f"Rule {c['rule']}", "control", "in_place", detail="Detection rule that alerted on this campaign.")
                edge(f"c:{c['rule']}", cid, f"detected after {c['latency_seconds']}s (simulated clock)", True)
    elif kind == "ai_agent":
        node("boundary", "Untrusted content (documents, tool results)", "boundary", detail="Text the agent reads but must not obey.")
        edge("boundary", asset, "is read by the agent", True)
        for g, on in (run.result.get("guardrails") or {}).items():
            if on:
                node(f"c:{g}", g, "control", "in_place", detail="Code-enforced guardrail enabled in the mock agent.")
                edge(f"c:{g}", asset, "enforces", True)
    for f in findings:
        sid = fid[f["rule_id"] + f.get("location", "")]
        hyp = f.get("evidence_kind") == "INFERRED"
        vid = f"v:{sid}"
        node(vid, f["plain_title"], "vulnerability", "hypothetical" if hyp else "observed", severity=f["severity"], finding=sid,
             detail=f["what"], why=f["why"], fix=f["fix"], observed=f.get("observed", []), inferred=f.get("inferred", []),
             evidence_ids=[e for e in f.get("evidence_refs", []) if e], evidence_kind=f.get("evidence_kind", "SIMULATED"))
        edge(vid, asset, "weakens (hypothesis)" if hyp else "weakens (observed in fixture)", not hyp)
        if "boundary" in nodes:
            # An exposure PATH is always a hypothesis: AegisAI never demonstrates exploitation.
            edge("boundary", vid, "possible exposure path (not demonstrated)", False)
    return {"nodes": list(nodes.values()), "edges": edges}


@router.get("/runs/{rid}/graph", tags=["runs"])
def run_graph(rid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    r = db.get(Run, rid)
    if not r or r.evidence_label == "NONE":
        raise ApiError(404, "not_found", "Run not found or it was stopped before producing results.")
    t = db.get(Target, r.target_id)
    assert t is not None
    g = _graph(r, t)
    return {**g, "run_id": r.id, "label": "SIMULATED", "scenario": r.scenario_id, "phase": r.phase,
            "legend": "Solid edges are relationships observed in the fixture. Dashed edges are hypotheses: AegisAI never demonstrates "
                      "exploitation, so no path here is a confirmed compromise."}


# ---- replay -------------------------------------------------------------------------------------
@router.get("/runs/{rid}/replay", tags=["runs"])
def run_replay(rid: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    r = db.get(Run, rid)
    if not r or r.evidence_label == "NONE":
        raise ApiError(404, "not_found", "Run not found or it was stopped before producing results.")
    res = r.result
    frames: list[dict[str, Any]] = []
    for e in res.get("events", [])[:600]:
        frames.append({"t": e["time"], "kind": "event", "id": e["id"], "label": e["detail"], "actor": e.get("actor"),
                       "tag": e.get("label") or e.get("kind"), "order": 0})
    for d in res.get("detections", []):
        if d["rule_id"].startswith("GATE-"):
            continue
        frames.append({"t": d.get("first_event_t", 0), "kind": "detection", "id": d["rule_id"], "label": f"ALERT {d['title']}",
                       "actor": None, "tag": "true positive" if d.get("true_positive") else "false positive",
                       "evidence": d.get("event_ids", [])[:12], "order": 1})
    if not frames:  # scenarios without telemetry: replay the recorded observations in order
        for i, o in enumerate(res.get("observations", [])):
            frames.append({"t": i, "kind": "observation", "id": o["id"], "label": o["text"], "actor": None, "tag": o["step"], "order": 0})
    frames.sort(key=lambda f: (f["t"], f["order"]))
    for i, f in enumerate(frames):
        f["i"] = i
    return {"run_id": r.id, "scenario": r.scenario_id, "phase": r.phase, "label": "SIMULATED", "frames": frames,
            "duration": frames[-1]["t"] if frames else 0,
            "note": "Reconstructed from recorded run data. Nothing is being executed during replay."}


# ---- notifications ------------------------------------------------------------------------------
@router.get("/notifications", tags=["notifications"])
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    if system.kill_switch_engaged(db):
        items.append({"id": "kill-switch", "level": "danger", "title": "Kill switch is engaged",
                      "detail": "No job can run until an admin releases it.", "link": "/app/settings", "at": utcnow().isoformat()})
    for j in db.execute(select(Job).order_by(Job.created_at.desc()).limit(12)).scalars():
        lvl = {"running": "info", "queued": "info", "succeeded": "ok", "failed": "danger", "blocked": "warn", "cancelled": "warn"}[j.status]
        items.append({"id": f"job:{j.id}:{j.status}", "level": lvl, "title": f"Job {j.status}: {j.params.get('scenario_id')} ({j.params.get('phase')})",
                      "detail": j.error or "", "link": f"/app/assessments/runs/{j.run_id}" if j.run_id else "/app/assessments",
                      "at": (j.finished_at or j.created_at).isoformat()})
    for a in db.execute(select(Approval).where(Approval.status == "granted", Approval.expires_at > utcnow())).scalars():
        items.append({"id": f"appr:{a.id}", "level": "warn", "title": "Approval granted but not yet used",
                      "detail": f"Expires {a.expires_at.isoformat()}", "link": f"/app/verify/{a.detail.get('case_id')}", "at": a.created_at.isoformat()})
    for f in db.execute(select(Finding).where(Finding.severity.in_(["critical", "high"]), Finding.verification != "VERIFIED_FIXED",
                                              Finding.status.in_(["open", "triaged"])).limit(6)).scalars():
        items.append({"id": f"find:{f.stable_id}:{f.version}", "level": "danger", "title": f"{f.severity.title()} finding open",
                      "detail": f.plain_title, "link": f"/app/findings/{f.id}", "at": f.updated_at.isoformat()})
    for i in db.execute(select(Incident).where(Incident.status.in_(["open", "investigating"])).limit(5)).scalars():
        items.append({"id": f"inc:{i.stable_id}", "level": "warn", "title": "Open incident", "detail": i.title,
                      "link": f"/app/investigations/{i.id}", "at": i.updated_at.isoformat()})
    items.sort(key=lambda x: x["at"], reverse=True)
    return {"items": items[:25], "note": "Derived from live records; read state is stored in your browser only."}


# ---- global search ------------------------------------------------------------------------------
@router.get("/search", tags=["search"])
def search(q: str, user: User = Depends(current_user), db: Session = Depends(get_db, scope="function")) -> dict[str, Any]:
    q = q.strip()[:60]
    if len(q) < 2:
        return {"results": []}
    like = f"%{q}%"
    res: list[dict[str, Any]] = []
    for f in db.execute(select(Finding).where(Finding.title.ilike(like) | Finding.plain_title.ilike(like) | Finding.stable_id.ilike(like)).limit(5)).scalars():
        res.append({"type": "Finding", "title": f.plain_title, "sub": f"{f.stable_id} · {f.severity}", "link": f"/app/findings/{f.id}"})
    for i in db.execute(select(Incident).where(Incident.title.ilike(like) | Incident.stable_id.ilike(like)).limit(5)).scalars():
        res.append({"type": "Incident", "title": i.title, "sub": f"{i.stable_id} · {i.severity}", "link": f"/app/investigations/{i.id}"})
    for t in db.execute(select(Target).where(Target.name.ilike(like) | Target.slug.ilike(like)).limit(5)).scalars():
        res.append({"type": "Lab target", "title": t.name, "sub": t.slug, "link": "/app/lab"})
    for r in db.execute(select(Run).where(Run.id.ilike(f"{q}%") | Run.scenario_id.ilike(like)).order_by(Run.started_at.desc()).limit(5)).scalars():
        res.append({"type": "Run", "title": f"{r.scenario_id} · {r.phase}", "sub": r.id[:8], "link": f"/app/assessments/runs/{r.id}"})
    return {"results": res}
