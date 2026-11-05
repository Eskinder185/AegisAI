"""Deterministic development seed. Dev users exist ONLY when this is explicitly invoked."""
from __future__ import annotations

import copy
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import scenarios
from .config import get_settings
from .models import (
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
from .security import hash_password

DEV_USERS = [
    ("admin@aegis.local", "Ada Admin", "admin"),
    ("analyst@aegis.local", "Ana Analyst", "analyst"),
    ("viewer@aegis.local", "Vic Viewer", "viewer"),
]

FIXTURE_ACTIONS = {
    "web": ["passive_http_check", "config_analysis", "log_replay", "apply_fixture_change", "rollback_fixture_change"],
    "iam": ["config_analysis", "apply_fixture_change", "rollback_fixture_change"],
    "auth_logs": ["log_replay", "apply_fixture_change", "rollback_fixture_change"],
    "ai_agent": ["agent_eval", "apply_fixture_change", "rollback_fixture_change"],
}

TARGETS = [
    dict(slug="demo-web", name="Demo web service", kind="web", scenario_id="web-headers", criticality="medium",
         purpose="Fixture web service used to practise passive web-hardening checks.", hosts=["demo-web.fixture"]),
    dict(slug="demo-aws-iam", name="Demo AWS IAM role (offline fixture)", kind="iam", scenario_id="iam-least-privilege",
         criticality="high", purpose="Synthetic IAM policy documents. No AWS account is involved.", hosts=["demo-iam.fixture"]),
    dict(slug="demo-auth-logs", name="Demo sign-in logs & detection rules", kind="auth_logs",
         scenario_id="auth-detection-gap", criticality="high",
         purpose="Labelled synthetic login events replayed through an isolated rule set.", hosts=["demo-auth.fixture"]),
    dict(slug="demo-ai-agent", name="Demo mock AI agent", kind="ai_agent", scenario_id="ai-prompt-injection",
         criticality="medium", purpose="Deterministic mock agent with harmless tools and a synthetic canary.",
         hosts=["demo-agent.fixture"]),
]


def seed_users(db: Session) -> None:
    pw = get_settings().dev_seed_password
    for email, name, role in DEV_USERS:
        if not db.execute(select(User).where(User.email == email)).scalar_one_or_none():
            db.add(User(email=email, display_name=name, role=role, password_hash=hash_password(pw), dev_seeded=True))


def seed_targets(db: Session) -> None:
    for t in TARGETS:
        if db.execute(select(Target).where(Target.slug == t["slug"])).scalar_one_or_none():
            continue
        sc = scenarios.get(t["scenario_id"])
        db.add(Target(
            slug=t["slug"], name=t["name"], owner="AegisAI demo workspace", purpose=t["purpose"], environment="fixture",
            kind=t["kind"], scenario_id=t["scenario_id"], hosts=t["hosts"], cidrs=[],
            allowed_actions=FIXTURE_ACTIONS[t["kind"]], tags=["demo", "synthetic"], criticality=t["criticality"],
            approval_status="approved", window_start=None, window_end=None, fixture_state=sc.initial_state(),
        ))
    # An AegisAI-managed lab container that is registered but NOT approved: demonstrates fail-closed scope.
    if not db.execute(select(Target).where(Target.slug == "lab-web-container")).scalar_one_or_none():
        db.add(Target(
            slug="lab-web-container", name="Lab web container (not started)", owner="AegisAI demo workspace",
            purpose="Example of a lab-container target. Pending approval and requires LOCAL_LAB mode; no container ships in v1.",
            environment="lab_container", kind="web", scenario_id=None, hosts=["lab-web"], cidrs=["172.28.0.0/24"],
            allowed_actions=["passive_http_check"], tags=["example", "disabled"], criticality="low",
            approval_status="pending", window_end=utcnow() + timedelta(days=1),
        ))
    if not db.execute(select(Target).where(Target.slug == "example-external")).scalar_one_or_none():
        db.add(Target(
            slug="example-external", name="External host (example, always blocked)", owner="n/a",
            purpose="Shows that external targets are refused: EXTERNAL_AUTHORIZED mode is disabled in v1.",
            environment="external", kind="web", scenario_id=None, hosts=["example.com"], cidrs=[],
            allowed_actions=["passive_http_check"], tags=["example", "blocked"], criticality="low", approval_status="pending",
        ))


def seed_all(db: Session) -> None:
    seed_users(db)
    seed_targets(db)
    db.flush()
    _seed_rule_versions(db)


def _seed_rule_versions(db: Session) -> None:
    t = db.execute(select(Target).where(Target.slug == "demo-auth-logs")).scalar_one_or_none()
    if t and not db.execute(select(DetectionRuleVersion).where(DetectionRuleVersion.target_id == t.id)).first():
        for r in t.fixture_state["rules"]:
            db.add(DetectionRuleVersion(target_id=t.id, rule_id=r["id"], version=r["version"], definition=r,
                                        change_note="Initial lab rule", created_by="seed"))


def reset_demo_data(db: Session) -> dict[str, int]:
    """Delete generated demo records and restore fixture state. The audit log is intentionally kept."""
    counts = {}
    for model, name in ((Approval, "approvals"), (Incident, "incidents"), (Finding, "findings"), (Job, "jobs"),
                        (PurpleCase, "cases"), (Run, "runs"), (AnalysisReport, "analyses"),
                        (DetectionRuleVersion, "rule_versions")):
        counts[name] = db.execute(delete(model)).rowcount or 0
    for t in db.execute(select(Target)).scalars():
        if t.scenario_id:
            t.fixture_state = copy.deepcopy(scenarios.get(t.scenario_id).initial_state())
            t.fixture_version = 1
    db.flush()
    _seed_rule_versions(db)
    return counts
