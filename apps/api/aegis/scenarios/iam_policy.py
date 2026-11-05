"""Demo 2 - AWS IAM offline assessment of a deliberately over-broad FIXTURE policy. No AWS calls."""
from __future__ import annotations

import copy
import json
from typing import Any

from .. import cloud
from .base import Acc, Remediation, Scenario, Step, exposure_points

HOST = "demo-iam.fixture"
ROLE = "arn:aws:iam::000000000000:role/ci-deployer"  # synthetic account id

# Behaviour contract the fixture must satisfy after the fix.
REQUIRED = [
    ("s3:GetObject", "arn:aws:s3:::acme-demo-app/releases/app.zip", "allow", "Deploy job reads the release artifact"),
    ("s3:PutObject", "arn:aws:s3:::acme-demo-app/logs/deploy.log", "allow", "Deploy job writes its log"),
    ("logs:PutLogEvents", "arn:aws:logs:us-east-1:000000000000:log-group:/ci/deploy:*", "allow", "Deploy job ships logs"),
]
FORBIDDEN = [
    ("iam:CreateAccessKey", "arn:aws:iam::000000000000:user/admin", "deny", "Must not mint keys for other users"),
    ("s3:DeleteBucket", "arn:aws:s3:::acme-demo-prod-data", "deny", "Must not delete unrelated buckets"),
    ("ec2:TerminateInstances", "arn:aws:ec2:us-east-1:000000000000:instance/i-0abc", "deny", "Must not terminate instances"),
]

BROAD_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {"Sid": "DeployArtifacts", "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"],
         "Resource": "arn:aws:s3:::acme-demo-app/*"},
        {"Sid": "ConvenienceAdmin", "Effect": "Allow", "Action": "*", "Resource": "*"},
        {"Sid": "PassAnyRole", "Effect": "Allow", "Action": ["iam:PassRole", "iam:CreateAccessKey"], "Resource": "*"},
        {"Sid": "LogsEverything", "Effect": "Allow", "Action": "logs:*", "Resource": "*"},
    ],
}
TRUST = {
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": "*", "Action": "sts:AssumeRole"}],
}


def initial_state() -> dict[str, Any]:
    return {"role": ROLE, "policy_text": json.dumps(BROAD_POLICY, indent=2), "trust_text": json.dumps(TRUST, indent=2)}


def _analyze(state: dict[str, Any], acc: dict[str, Any]) -> None:
    res = cloud.analyze_iam_policy(state["policy_text"], "identity")
    trust = cloud.analyze_iam_policy(state["trust_text"], "trust")
    for src, label in ((res, "permissions policy"), (trust, "trust policy")):
        for f in src["findings"]:
            oid = Acc.observe(acc, "analyze", HOST, f"static analysis rule {f['rule_id']}",
                              f"{label}: {f['what']}", {"rule": f["rule_id"], "line": f["line"]})
            f2 = {k: v for k, v in f.items() if k != "line"}
            f2["evidence_refs"] = [oid]
            f2["source"] = "cloud"
            f2["location"] = f"{'trust' if label.startswith('trust') else 'policy'}:{f['location']}"
            acc["findings"].append(f2)
    acc["extra"]["statements"] = res["statements"]


def _simulate(state: dict[str, Any], acc: dict[str, Any]) -> None:
    policy = json.loads(state["policy_text"])
    checks = []
    for action, resource, expect, why in REQUIRED + FORBIDDEN:
        got = cloud.evaluate_access(policy, action, resource)
        ok = got == expect
        checks.append({"action": action, "resource": resource, "expected": expect, "actual": got, "ok": ok, "purpose": why})
        Acc.observe(acc, "simulate", HOST, "fixture access simulation",
                    f"{action} on {resource.split(':')[-1]} -> {got} (expected {expect}) {'OK' if ok else 'MISMATCH'}",
                    {"action": action, "actual": got, "expected": expect})
    acc["extra"]["access_checks"] = checks


def _plan(state: dict[str, Any]) -> list[Step]:
    dest = f"fixture://{HOST}/"
    return [
        Step("analyze", "Static analysis of IAM policy and trust policy", "config_analysis", dest, _analyze),
        Step("simulate", "Fixture access simulation (needed vs forbidden actions)", "config_analysis", dest, _simulate),
    ]


def _finalize(state: dict[str, Any], acc: dict[str, Any]) -> dict[str, Any]:
    checks = acc["extra"]["access_checks"]
    needed_ok = sum(1 for c in checks if c["expected"] == "allow" and c["ok"])
    needed = sum(1 for c in checks if c["expected"] == "allow")
    risky_blocked = sum(1 for c in checks if c["expected"] == "deny" and c["ok"])
    risky = sum(1 for c in checks if c["expected"] == "deny")
    f = acc["findings"]
    return {
        "scenario": acc["scenario"], "observations": acc["observations"], "findings": f, "detections": [], "events": [],
        "access_checks": checks,
        "metrics": {
            "findings_total": len(f), "exposure_points": exposure_points(f),
            "required_access_working": f"{needed_ok}/{needed}", "risky_access_blocked": f"{risky_blocked}/{risky}",
            "required_access_ok": needed_ok == needed, "risky_blocked_all": risky_blocked == risky,
            "detections_triggered": 0, "detection_coverage": {"covered": 0, "expected": 0},
        },
    }


def _apply(state: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    s = copy.deepcopy(state)
    least = {
        "Version": "2012-10-17",
        "Statement": [
            {"Sid": "DeployArtifacts", "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"],
             "Resource": "arn:aws:s3:::acme-demo-app/*"},
            {"Sid": "ShipLogs", "Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": "arn:aws:logs:us-east-1:000000000000:log-group:/ci/deploy:*"},
        ],
    }
    trust = {
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Principal": {"AWS": "arn:aws:iam::000000000000:role/ci-runner"},
                       "Action": "sts:AssumeRole",
                       "Condition": {"StringEquals": {"sts:ExternalId": "demo-external-id"}}}],
    }
    s["policy_text"] = json.dumps(least, indent=2)
    s["trust_text"] = json.dumps(trust, indent=2)
    return s


def _diff(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    return [
        '- {"Sid": "ConvenienceAdmin", "Action": "*", "Resource": "*"}',
        '- {"Sid": "PassAnyRole", "Action": ["iam:PassRole", "iam:CreateAccessKey"], "Resource": "*"}',
        '- {"Sid": "LogsEverything", "Action": "logs:*", "Resource": "*"}',
        '+ {"Sid": "ShipLogs", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"], "Resource": "…log-group:/ci/deploy:*"}',
        '~ Trust policy: Principal "*" -> role/ci-runner with ExternalId condition',
    ]


SCENARIO = Scenario(
    id="iam-least-privilege", version="1.0.0", title="Cloud access: over-broad IAM policy (offline fixture)",
    summary="Deterministic analysis of a synthetic IAM role policy and trust policy, plus a fixture access simulation to prove the fix keeps needed access.",
    plain_summary="A deployment robot was given the keys to the whole building. We find exactly which lines grant too much, shrink them, and check the robot can still do its job.",
    kind="iam", demo_no=2, initial_state=initial_state, plan=_plan, finalize=_finalize,
    remediation=Remediation(
        id="iam-apply-least-privilege", title="Replace broad statements with a least-privilege policy (fixture only)",
        explanation="Rewrites the fixture role's policy text. No AWS API is called and no real IAM resource exists.",
        tradeoffs=["Narrow policies may block steps nobody remembered the deploy job needs; the access simulation lists the known required actions.",
                   "Trust policy now needs the caller to present the ExternalId condition."],
        rollback="Use 'Roll back' to restore the previous policy documents exactly.",
        apply=_apply, diff=_diff),
    primary_target_slug="demo-aws-iam", host=HOST, actors={"red": "Red Analyst", "blue": "Verifier"},
)
