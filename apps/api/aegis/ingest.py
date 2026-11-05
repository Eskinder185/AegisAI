"""Turn a completed Run's result into canonical Findings and Incidents (idempotent upserts)."""
from __future__ import annotations

import hashlib
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Finding, Incident, Run, Target, utcnow

SEV_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def stable_id(*parts: str, prefix: str = "AEG") -> str:
    return f"{prefix}-" + hashlib.sha256("|".join(parts).encode()).hexdigest()[:8].upper()


def _evidence_for(run: Run, f: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {o["id"]: o for o in run.result.get("observations", [])}
    out = []
    for ref in f.get("evidence_refs", []):
        o = by_id.get(ref)
        if o:
            out.append({"id": o["id"], "source": o["source"], "target": o["target"], "method": o["method"],
                        "timestamp": o["timestamp"], "reproducible": o["reproducible"], "confidence": o["confidence"],
                        "label": o["label"], "excerpt": o["text"], "run_id": run.id})
    return out


def ingest_findings(db: Session, run: Run, target: Target | None, scope_key: str | None = None) -> dict[str, list[str]]:
    """Upsert findings; mark ones absent from this run as VERIFIED_FIXED. Returns id lists."""
    skey = scope_key or (target.slug if target else "adhoc")
    seen: set[str] = set()
    created, regressed, updated = [], [], []
    for f in run.result.get("findings", []):
        sid = stable_id(skey, f["rule_id"], f.get("location", ""))
        seen.add(sid)
        row = db.execute(select(Finding).where(Finding.stable_id == sid)).scalar_one_or_none()
        ev = _evidence_for(run, f)
        if row is None:
            row = Finding(
                stable_id=sid, target_id=target.id if target else None, source=f["source"], rule_id=f["rule_id"],
                title=f["title"], plain_title=f["plain_title"], severity=f["severity"], confidence=f["confidence"],
                evidence_kind=f["evidence_kind"], what=f["what"], why=f["why"], fix=f["fix"], verify=f["verify"],
                observed=f["observed"], inferred=f["inferred"], evidence=ev, mapping=f["mapping"],
                location=f.get("location", ""), first_run_id=run.id, last_run_id=run.id,
                history=[{"at": utcnow().isoformat(), "event": "detected", "run_id": run.id, "phase": run.phase}],
            )
            db.add(row)
            created.append(sid)
        else:
            row.last_run_id = run.id
            row.evidence = ev
            row.observed = f["observed"]
            row.version += 1
            if row.verification == "VERIFIED_FIXED":
                row.status = "open"
                row.verification = "UNVERIFIED"
                row.verified_run_id = None
                row.history = [*row.history, {"at": utcnow().isoformat(), "event": "regressed", "run_id": run.id}]
                regressed.append(sid)
            else:
                updated.append(sid)
    fixed = []
    if target is not None:
        open_rows = db.execute(
            select(Finding).where(Finding.target_id == target.id, Finding.verification != "VERIFIED_FIXED")
        ).scalars().all()
        for row in open_rows:
            if row.stable_id not in seen and row.source in {"red", "blue", "ai_lab", "cloud"}:
                if row.status not in ("accepted", "false_positive"):
                    row.status = "fixed"
                row.verification = "VERIFIED_FIXED"
                row.verified_run_id = run.id
                row.history = [*row.history, {"at": utcnow().isoformat(), "event": "verified_fixed", "run_id": run.id,
                                              "phase": run.phase}]
                fixed.append(row.stable_id)
    db.flush()
    return {"created": created, "updated": updated, "regressed": regressed, "fixed": fixed, "seen": sorted(seen)}


NEXT_STEP = {
    "failed_login_threshold": "Check whether the account owner recognises the activity, review the source address history, and consider a forced credential reset for the targeted account.",
    "distinct_users_per_ip": "Review every account the source address touched (see affected assets), look for any successful login from the same source, and consider rate-limiting or blocking the source in the isolated lab.",
    "WEB-XSS-PROBE": "Confirm the probed parameter is output-encoded and add a Content-Security-Policy; review other requests from the same source.",
}


def ingest_incidents(db: Session, run: Run, target: Target | None) -> list[str]:
    ids: list[str] = []
    if target is None:
        return ids
    events = {e["id"]: e for e in run.result.get("events", [])}
    for d in run.result.get("detections", []):
        if d["rule_id"].startswith("GATE-"):
            continue
        group = d.get("group", "") or d.get("campaign", "")
        sid = stable_id(target.slug, d["rule_id"], str(d.get("rule_version", 1)), str(group), prefix="INC")
        if db.execute(select(Incident).where(Incident.stable_id == sid)).scalar_one_or_none():
            continue
        tp = d.get("true_positive", True)
        evs = [events[i] for i in d.get("event_ids", []) if i in events]
        tl = [{"event_id": e["id"], "t": e["time"], "text": e["detail"]} for e in evs][:40]
        assets = sorted({e["target"] for e in evs} | set(d.get("sources", [])))[:20] or [target.name]
        rule_kind = next((r["kind"] for r in run.result.get("rules", []) if r["id"] == d["rule_id"]), d["rule_id"])
        reason = (
            f"{d.get('n_events', len(evs))} correlated events; "
            f"{'matches a labelled campaign' if tp else 'only benign-labelled events (likely false positive)'}; "
            f"rule {d['rule_id']} v{d.get('rule_version', 1)}."
        )
        inc = Incident(
            stable_id=sid, target_id=target.id, run_id=run.id, title=d["title"] + (f" ({d['rule_id']})" if d.get("group") else ""),
            severity=d["severity"], severity_reason=reason, rule_id=d["rule_id"], rule_version=d.get("rule_version", 1),
            mitre=[m for r in run.result.get("rules", []) if r["id"] == d["rule_id"] for m in r.get("mitre", [])],
            affected_assets=assets, timeline=tl, evidence_event_ids=d.get("event_ids", []),
            next_step=NEXT_STEP.get(rule_kind, "Review the cited events and decide whether to escalate."),
            status="open",
        )
        db.add(inc)
        ids.append(sid)
    db.flush()
    return ids
