"""Workspace-level runtime state: policy mode, kill switch, manifest key. Stored in the settings table."""
from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy.orm import Session

from .config import get_settings
from .models import Setting, Target
from .policy import Mode, PolicyContext, TargetScope


def get_setting(db: Session, key: str, default: dict[str, Any]) -> dict[str, Any]:
    s = db.get(Setting, key)
    return s.value if s else default


def set_setting(db: Session, key: str, value: dict[str, Any]) -> None:
    s = db.get(Setting, key)
    if s:
        s.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.flush()


def get_mode(db: Session) -> Mode:
    v = get_setting(db, "policy", {"mode": Mode.SIMULATION_ONLY.value})["mode"]
    try:
        return Mode(v)
    except ValueError:
        return Mode.SIMULATION_ONLY


def kill_switch_engaged(db: Session) -> bool:
    return bool(get_setting(db, "kill_switch", {"engaged": False})["engaged"])


def policy_context(db: Session) -> PolicyContext:
    return PolicyContext(mode=get_mode(db), kill_switch=kill_switch_engaged(db))


def manifest_key(db: Session) -> str:
    cfg = get_settings().manifest_key
    if cfg:
        return cfg
    v = get_setting(db, "manifest_key", {})
    if "key" not in v:
        v = {"key": secrets.token_hex(32)}
        set_setting(db, "manifest_key", v)
    return str(v["key"])


def to_scope(t: Target) -> TargetScope:
    return TargetScope(
        id=t.id, name=t.name, environment=t.environment, hosts=tuple(t.hosts or ()), cidrs=tuple(t.cidrs or ()),
        allowed_actions=tuple(t.allowed_actions or ()), approval_status=t.approval_status,
        window_start=t.window_start, window_end=t.window_end, rate_limit_per_min=t.rate_limit_per_min,
    )
