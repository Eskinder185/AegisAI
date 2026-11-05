"""Append-only, hash-chained audit log. Tampering with any row breaks the chain (detected by verify)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .models import AuditEntry, Setting, utcnow
from .security import redact_obj, sha256_obj

GENESIS = "0" * 64


def _hash(prev: str, e: dict[str, Any]) -> str:
    return sha256_obj({"prev": prev, **e})


def _lock(db: Session) -> None:
    """Serialise audit writers across processes. The UPDATE takes a write lock (database-wide on SQLite, row lock on
    PostgreSQL) that is held until commit, so the 'last hash' read below cannot race with another writer."""
    res = db.execute(update(Setting).where(Setting.key == "audit_lock").values(value={"t": utcnow().isoformat()}))
    if res.rowcount == 0:  # type: ignore[attr-defined]
        db.merge(Setting(key="audit_lock", value={"t": utcnow().isoformat()}))
        db.flush()


def record(
    db: Session,
    actor: str,
    action: str,
    outcome: str = "ok",
    target_ref: str | None = None,
    detail: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> AuditEntry:
    _lock(db)
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
