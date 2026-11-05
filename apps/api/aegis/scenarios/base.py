"""Scenario contract: AssessmentPlan -> PolicyDecision -> ApprovedStep -> Observation -> Finding -> Verification.

Scenarios are pure and deterministic: the same (scenario version, fixture state) always produces
the same `result` (byte-identical canonical JSON). Nothing here touches the network or filesystem.
"""
from __future__ import annotations

import copy
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

SIM_EPOCH = "2026-01-15T10:00:00Z"  # fixed simulated clock origin for all fixture timestamps

SEVERITY_WEIGHT = {"critical": 10, "high": 7, "medium": 4, "low": 1, "info": 0}


@dataclass
class Step:
    id: str
    title: str
    action: str  # policy Action value
    destination: str | None
    fn: Callable[[dict[str, Any], dict[str, Any]], None]  # (state, acc) -> None


@dataclass
class Remediation:
    id: str
    title: str
    explanation: str
    tradeoffs: list[str]
    rollback: str
    apply: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]  # (state, params) -> new state
    default_params: dict[str, Any] = field(default_factory=dict)
    diff: Callable[[dict[str, Any], dict[str, Any]], list[str]] | None = None  # human-readable preview

    def preview(self, state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
        new = self.apply(copy.deepcopy(state), params or self.default_params)
        return {"lines": self.diff(state, new) if self.diff else [], "after_state": new}


@dataclass
class Scenario:
    id: str
    version: str
    title: str
    summary: str
    plain_summary: str
    kind: str  # web | iam | auth_logs | ai_agent
    demo_no: int
    initial_state: Callable[[], dict[str, Any]]
    plan: Callable[[dict[str, Any]], list[Step]]
    finalize: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]  # (state, acc) -> result
    remediation: Remediation
    primary_target_slug: str
    host: str
    actors: dict[str, str] = field(default_factory=dict)  # which assistants participate

    def public(self) -> dict[str, Any]:
        r = self.remediation
        return {
            "id": self.id,
            "version": self.version,
            "title": self.title,
            "summary": self.summary,
            "plain_summary": self.plain_summary,
            "kind": self.kind,
            "demo_no": self.demo_no,
            "target_slug": self.primary_target_slug,
            "remediation": {
                "id": r.id,
                "title": r.title,
                "explanation": r.explanation,
                "tradeoffs": r.tradeoffs,
                "rollback": r.rollback,
                "default_params": r.default_params,
            },
        }


class Acc:
    """Accumulator helpers used by step functions to record observations/findings consistently."""

    @staticmethod
    def new(scenario_id: str) -> dict[str, Any]:
        return {
            "scenario": scenario_id,
            "observations": [],
            "findings": [],
            "detections": [],
            "events": [],
            "extra": {},
            "_seq": 0,
        }

    @staticmethod
    def observe(
        acc: dict[str, Any],
        step_id: str,
        target: str,
        method: str,
        text: str,
        data: dict[str, Any] | None = None,
        confidence: str = "high",
    ) -> str:
        acc["_seq"] += 1
        oid = f"OBS-{acc['scenario'][:8].upper()}-{acc['_seq']:03d}"
        acc["observations"].append(
            {
                "id": oid,
                "step": step_id,
                "kind": "observation",
                "source": "aegis-scenario-engine",
                "target": target,
                "method": method,
                "timestamp": SIM_EPOCH,
                "text": text,
                "data": data or {},
                "reproducible": True,
                "confidence": confidence,
                "label": "SIMULATED",
            }
        )
        return oid

    @staticmethod
    def finding(acc: dict[str, Any], **kw: Any) -> None:
        defaults = {
            "evidence_kind": "SIMULATED",
            "confidence": "high",
            "observed": [],
            "inferred": [],
            "mapping": [],
            "location": "",
            "evidence_refs": [],
            "source": "red",
        }
        defaults.update(kw)
        acc["findings"].append(defaults)


def exposure_points(findings: list[dict[str, Any]]) -> int:
    """Transparent AegisAI exposure score: sum of severity weights. Not CVSS; documented in the UI."""
    return sum(SEVERITY_WEIGHT.get(f["severity"], 0) for f in findings)
