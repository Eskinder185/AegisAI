"""Append-only, hash-chained audit log. Tampering with any row breaks the chain (detected by verify)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEntry, utcnow
from .security import redact_obj, sha256_obj

GENESIS = "0" * 64


def _hash(prev: str, e: dict[str, Any]) -> str:
    return sha256_obj({"prev": prev, **e})


def record(
    db: Session,
    actor: str,
    action: str,
    outcome: str = "ok",
    target_ref: str | None = None,
    detail: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> AuditEntry:
    last = db.execute(select(AuditEntry).order_by(AuditEntry.id.desc()).limit(1)).scalar_one_or_none()
    prev = last.entry_hash if last else GENESIS
    ts = utcnow()
    clean = redact_obj(detail or {})
    body = {"ts": ts.isoformat(), "actor": actor, "action": action, "outcome": outcome, "target_ref": target_ref,
            "detail": clean, "request_id": request_id}
    entry = AuditEntry(ts=ts, actor=actor, action=action, outcome=outcome, target_ref=target_ref, detail=clean,
                       request_id=request_id, prev_hash=prev, entry_hash=_hash(prev, body))
    db.add(entry)
    db.flush()
    return entry


def verify(db: Session) -> dict[str, Any]:
    prev = GENESIS
    n = 0
    for e in db.execute(select(AuditEntry).order_by(AuditEntry.id)).scalars():
        body = {"ts": e.ts.isoformat(), "actor": e.actor, "action": e.action, "outcome": e.outcome,
                "target_ref": e.target_ref, "detail": e.detail, "request_id": e.request_id}
        if e.prev_hash != prev or e.entry_hash != _hash(prev, body):
            return {"ok": False, "checked": n, "broken_at": e.id}
        prev = e.entry_hash
        n += 1
    return {"ok": True, "checked": n, "broken_at": None}
