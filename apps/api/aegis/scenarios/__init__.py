from __future__ import annotations

from . import ai_agent, auth_detection, iam_policy, web_headers
from .base import Scenario

REGISTRY: dict[str, Scenario] = {
    s.id: s
    for s in (web_headers.SCENARIO, iam_policy.SCENARIO, auth_detection.SCENARIO, ai_agent.SCENARIO)
}


def get(scenario_id: str) -> Scenario:
    try:
        return REGISTRY[scenario_id]
    except KeyError as exc:
        raise KeyError(f"Unknown scenario '{scenario_id}'") from exc
