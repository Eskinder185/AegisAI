"""SQLAlchemy 2 models. UUID string PKs, explicit FKs, indexed timestamps."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base


def _id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class TZDateTime(TypeDecorator):  # type: ignore[type-arg]
    """Timezone-aware UTC datetimes (SQLite drops tzinfo, so we re-attach it on read)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):  # type: ignore[no-untyped-def]
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC) if value is not None else None

    def process_result_value(self, value, dialect):  # type: ignore[no-untyped-def]
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # admin | analyst | viewer
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    dev_seeded: Mapped[bool] = mapped_column(Boolean, default=False)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(TZDateTime(), index=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)
    user: Mapped[User] = relationship()


class Target(Base):
    """Target Registry entry. In v1 every target is a fixture or an AegisAI-managed demo service."""

    __tablename__ = "targets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    owner: Mapped[str] = mapped_column(String(120))
    purpose: Mapped[str] = mapped_column(Text)
    environment: Mapped[str] = mapped_column(String(20))  # fixture | lab_container | external
    kind: Mapped[str] = mapped_column(String(30))  # web | iam | auth_logs | ai_agent
    scenario_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    hosts: Mapped[list[str]] = mapped_column(JSON, default=list)
    cidrs: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_actions: Mapped[list[str]] = mapped_column(JSON, default=list)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    criticality: Mapped[str] = mapped_column(String(10), default="medium")
    approval_status: Mapped[str] = mapped_column(String(12), default="pending")  # approved|pending|revoked
    window_start: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    rate_limit_per_min: Mapped[int] = mapped_column(Integer, default=60)
    fixture_state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    fixture_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    target_id: Mapped[str] = mapped_column(ForeignKey("targets.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # exact change, e.g. remediation_id
    status: Mapped[str] = mapped_column(String(12), default="granted")  # granted|consumed|expired|revoked
    approved_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    approved_by_name: Mapped[str] = mapped_column(String(120), default="")
    expires_at: Mapped[datetime] = mapped_column(TZDateTime())
    consumed_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    kind: Mapped[str] = mapped_column(String(30))  # scenario_run
    status: Mapped[str] = mapped_column(String(12), default="queued", index=True)
    # queued|running|succeeded|failed|cancelled|blocked
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    idempotency_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    target_id: Mapped[str] = mapped_column(ForeignKey("targets.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    progress_done: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)
    current_step: Mapped[str | None] = mapped_column(String(160), nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    started_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_jobs_idem"),)


class Run(Base):
    """Record of one scenario execution (versioned scenario + fixture snapshot hash + signed manifest)."""

    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    scenario_id: Mapped[str] = mapped_column(String(60), index=True)
    scenario_version: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[str] = mapped_column(ForeignKey("targets.id", ondelete="CASCADE"), index=True)
    phase: Mapped[str] = mapped_column(String(12))  # baseline | retest | adhoc
    case_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    state_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    state_hash: Mapped[str] = mapped_column(String(64))
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    manifest: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    manifest_signature: Mapped[str] = mapped_column(String(64), default="")
    evidence_label: Mapped[str] = mapped_column(String(12), default="SIMULATED")
    started_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(TZDateTime(), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class PurpleCase(Base):
    __tablename__ = "purple_cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    scenario_id: Mapped[str] = mapped_column(String(60))
    scenario_version: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[str] = mapped_column(ForeignKey("targets.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    # open | baseline_done | remediated | verified | not_improved | rolled_back
    baseline_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    retest_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    remediation_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    prior_state: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    comparison: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)


class Finding(Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    stable_id: Mapped[str] = mapped_column(String(24))  # AEG-xxxxxxxx
    target_id: Mapped[str | None] = mapped_column(ForeignKey("targets.id", ondelete="CASCADE"), nullable=True)
    source: Mapped[str] = mapped_column(String(20))  # red | blue | ai_lab | cloud
    rule_id: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(200))
    plain_title: Mapped[str] = mapped_column(String(300))
    severity: Mapped[str] = mapped_column(String(10))  # info|low|medium|high|critical
    confidence: Mapped[str] = mapped_column(String(10))  # low|medium|high
    status: Mapped[str] = mapped_column(String(14), default="open")
    # open|triaged|accepted|false_positive|fixed
    verification: Mapped[str] = mapped_column(String(16), default="UNVERIFIED")
    # UNVERIFIED | VERIFIED_FIXED | VERIFIED_PRESENT
    evidence_kind: Mapped[str] = mapped_column(String(12))  # SIMULATED|MEASURED|INFERRED
    what: Mapped[str] = mapped_column(Text)
    why: Mapped[str] = mapped_column(Text)
    fix: Mapped[str] = mapped_column(Text)
    verify: Mapped[str] = mapped_column(Text)
    observed: Mapped[list[str]] = mapped_column(JSON, default=list)
    inferred: Mapped[list[str]] = mapped_column(JSON, default=list)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    mapping: Mapped[list[str]] = mapped_column(JSON, default=list)
    location: Mapped[str] = mapped_column(String(200), default="")
    first_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    verified_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)
    __table_args__ = (UniqueConstraint("stable_id", name="uq_findings_stable"), Index("ix_findings_sev", "severity"))


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    stable_id: Mapped[str] = mapped_column(String(24), unique=True)
    target_id: Mapped[str | None] = mapped_column(ForeignKey("targets.id", ondelete="CASCADE"), nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    severity: Mapped[str] = mapped_column(String(10))
    severity_reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(14), default="open")  # open|investigating|resolved|false_positive
    owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rule_id: Mapped[str] = mapped_column(String(80))
    rule_version: Mapped[int] = mapped_column(Integer, default=1)
    mitre: Mapped[list[str]] = mapped_column(JSON, default=list)
    affected_assets: Mapped[list[str]] = mapped_column(JSON, default=list)
    timeline: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    evidence_event_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    next_step: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)


class AuditEntry(Base):
    """Append-only, hash-chained audit log. Edits are detectable via GET /audit/verify."""

    __tablename__ = "audit_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    outcome: Mapped[str] = mapped_column(String(12))  # allowed|denied|ok|error
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    prev_hash: Mapped[str] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64))


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow, onupdate=utcnow)


class DetectionRuleVersion(Base):
    """Versioned detection rules authored in the isolated lab (never touches real SIEMs)."""

    __tablename__ = "detection_rule_versions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    target_id: Mapped[str] = mapped_column(ForeignKey("targets.id", ondelete="CASCADE"), index=True)
    rule_id: Mapped[str] = mapped_column(String(60))
    version: Mapped[int] = mapped_column(Integer)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON)
    change_note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)
    __table_args__ = (UniqueConstraint("target_id", "rule_id", "version", name="uq_rule_version"),)


class AnalysisReport(Base):
    """Stored results of offline cloud/IaC analyses (user-supplied text, never fetched)."""

    __tablename__ = "analyses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    kind: Mapped[str] = mapped_column(String(20))  # iam | terraform
    label: Mapped[str] = mapped_column(String(120))
    input_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(TZDateTime(), default=utcnow)
