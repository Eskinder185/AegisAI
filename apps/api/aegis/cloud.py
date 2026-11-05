"""Offline cloud posture analysis: AWS IAM policies, a small IAM evaluator, and Terraform snippets.

Everything operates on user-supplied or fixture TEXT. There are no AWS calls, no credentials, and
nothing is fetched. Privilege-escalation pathways are reported as INFERRED hypotheses, never as
confirmed compromise.
"""
from __future__ import annotations

import fnmatch
import json
import re
from typing import Any

import yaml

MAX_INPUT_BYTES = 64 * 1024

# Actions that commonly enable privilege escalation when combined with Resource "*" (hypotheses only).
ESCALATION_ACTIONS = {
    "iam:passrole": "Could allow handing a more powerful role to a service the principal controls.",
    "iam:createaccesskey": "Could allow minting long-lived keys for other users.",
    "iam:attachuserpolicy": "Could allow attaching an administrator policy to a user.",
    "iam:putuserpolicy": "Could allow writing an inline administrator policy.",
    "iam:createpolicyversion": "Could allow replacing a managed policy with a broader one.",
    "iam:updateassumerolepolicy": "Could allow changing who may assume a role.",
    "sts:assumerole": "Could allow assuming other roles if their trust policies permit it.",
    "lambda:updatefunctioncode": "Could allow changing code that runs under a more privileged role.",
}


class AnalysisInputError(ValueError):
    pass


def _listify(x: Any) -> list[Any]:
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def _load_with_lines(text: str) -> tuple[Any, Any]:
    if len(text.encode()) > MAX_INPUT_BYTES:
        raise AnalysisInputError("Input is larger than 64 KiB.")
    try:
        node = yaml.compose(text, Loader=yaml.SafeLoader)
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise AnalysisInputError(f"Could not parse input as JSON/YAML: {str(exc)[:120]}") from exc
    if node is None or not isinstance(data, dict):
        raise AnalysisInputError("Policy document must be a JSON/YAML object.")
    return data, node


def _map_lookup(node: Any, key: str) -> Any:
    if node is None or not hasattr(node, "value") or not isinstance(node.value, list):
        return None
    for k, v in node.value:
        if getattr(k, "value", None) == key:
            return k, v
    return None


def _statement_nodes(root: Any) -> list[Any]:
    hit = _map_lookup(root, "Statement")
    if not hit:
        return []
    _, v = hit
    if hasattr(v, "value") and isinstance(v.value, list) and v.value and isinstance(v.value[0], tuple):
        return [v]  # single statement object
    return list(v.value) if hasattr(v, "value") else []


def analyze_iam_policy(text: str, kind: str = "identity") -> dict[str, Any]:
    """Return {findings, statements, summary}. `kind` is 'identity' or 'trust' (assume-role policy)."""
    data, root = _load_with_lines(text)
    stmts = _listify(data.get("Statement"))
    stmt_nodes = _statement_nodes(root)
    findings: list[dict[str, Any]] = []
    lines = text.splitlines()

    def line_of(i: int, key: str | None = None) -> tuple[int, str]:
        node = stmt_nodes[i] if i < len(stmt_nodes) else None
        if node is None:
            return 1, ""
        if key:
            hit = _map_lookup(node, key)
            if hit:
                k, _ = hit
                ln = k.start_mark.line + 1
                return ln, lines[ln - 1].strip() if ln - 1 < len(lines) else ""
        ln = node.start_mark.line + 1
        return ln, lines[ln - 1].strip() if ln - 1 < len(lines) else ""

    def add(i: int, key: str | None, rule: str, sev: str, title: str, plain: str, why: str, fix: str,
            kind_: str = "SIMULATED", conf: str = "high", inferred: list[str] | None = None) -> None:
        ln, snippet = line_of(i, key)
        findings.append(
            {
                "rule_id": rule,
                "title": title,
                "plain_title": plain,
                "severity": sev,
                "confidence": conf,
                "evidence_kind": kind_,
                "what": f"Statement #{i + 1} (line {ln}): {snippet}",
                "why": why,
                "fix": fix,
                "verify": "Re-run the analyzer and the access simulation: the risky action must be denied while required actions still work.",
                "observed": [f"Line {ln}: `{snippet}`"],
                "inferred": inferred or [],
                "location": f"Statement[{i}]" + (f".{key}" if key else ""),
                "line": ln,
                "mapping": ["CIS AWS Foundations: least privilege", "MITRE ATT&CK T1078.004 (context only)"],
            }
        )

    for i, st in enumerate(stmts):
        if not isinstance(st, dict):
            continue
        effect = st.get("Effect")
        actions = [str(a) for a in _listify(st.get("Action"))]
        resources = [str(r) for r in _listify(st.get("Resource"))]
        has_cond = bool(st.get("Condition"))
        if effect != "Allow":
            continue
        if "NotAction" in st:
            add(i, "NotAction", "IAM-NOTACTION-ALLOW", "high", "Allow with NotAction",
                "This statement allows everything except a short list of actions.",
                "NotAction + Allow grants an enormous, hard-to-audit set of permissions.",
                "Replace NotAction with an explicit list of required Action values.")
        if kind == "trust":
            principals = st.get("Principal")
            vals: list[str] = []
            if principals == "*":
                vals = ["*"]
            elif isinstance(principals, dict):
                for v in principals.values():
                    vals += [str(x) for x in _listify(v)]
            if "*" in vals and not has_cond:
                add(i, "Principal", "IAM-TRUST-PUBLIC", "critical", "Role trust policy allows any principal",
                    "Anyone who can reach the role's sign-in could be allowed to assume it.",
                    "A wildcard principal without conditions makes the role's permissions broadly assumable.",
                    "Name explicit principals (account or role ARNs) and add Condition keys such as aws:PrincipalOrgID or sts:ExternalId.")
            continue
        if "*" in actions:
            add(i, "Action", "IAM-ACTION-STAR", "critical" if "*" in resources else "high",
                "Allow Action: * (full administrator access)",
                "This permission lets the holder do anything in the account." if "*" in resources
                else "This permission lets the holder do anything on the listed resources.",
                "Full wildcard actions violate least privilege; a stolen credential would inherit total control.",
                "List only the specific actions the workload needs (for example s3:GetObject, s3:PutObject).")
        else:
            wild = [a for a in actions if a.endswith(":*")]
            if wild:
                add(i, "Action", "IAM-SERVICE-WILDCARD", "medium", f"Service-wide wildcard action(s): {', '.join(wild)}",
                    "This permission covers every operation of a service, including destructive ones.",
                    "Service-wide wildcards include delete/modify operations that the workload rarely needs.",
                    "Replace service wildcards with the minimum set of read/write actions.")
        if "*" in resources and "*" not in actions:
            add(i, "Resource", "IAM-RESOURCE-STAR", "medium", "Allowed on every resource (Resource: *)",
                "The permission is not limited to the resources the workload actually uses.",
                "Unscoped resources widen the blast radius of any compromised credential.",
                "Scope Resource to specific ARNs (bucket, table, queue).")
        esc = [a for a in actions if a.lower() in ESCALATION_ACTIONS]
        if esc and "*" in resources and not has_cond:
            hyp = [f"{a}: {ESCALATION_ACTIONS[a.lower()]}" for a in esc]
            add(i, "Action", "IAM-ESCALATION-PATH", "high", f"Possible privilege-escalation pathway ({', '.join(esc)} on *)",
                "This combination might let a holder grant themselves more access. This is a hypothesis, not a confirmed breach.",
                "Permissions that create or pass roles/keys on all resources are well-known escalation building blocks.",
                "Restrict to specific role ARNs and add Condition (for example iam:PassedToService).",
                kind_="INFERRED", conf="medium", inferred=hyp)
    sev_order = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    findings.sort(key=lambda f: (-sev_order[f["severity"]], f["line"], f["rule_id"]))
    return {
        "kind": "iam",
        "statements": len(stmts),
        "findings": findings,
        "summary": {s: sum(1 for f in findings if f["severity"] == s) for s in ("critical", "high", "medium", "low")},
    }


# --- minimal deterministic IAM evaluator (fixture behaviour check) ----------------------------------
def _match(patterns: list[str], value: str, ci: bool = False) -> bool:
    v = value.lower() if ci else value
    return any(fnmatch.fnmatchcase(v, (p.lower() if ci else p)) for p in patterns)


def evaluate_access(policy: dict[str, Any], action: str, resource: str) -> str:
    """Return 'allow' or 'deny' (explicit deny wins; default deny). Conditions make a statement not match."""
    allowed = False
    for st in _listify(policy.get("Statement")):
        if not isinstance(st, dict) or st.get("Condition"):
            continue
        acts = [str(a) for a in _listify(st.get("Action"))]
        ress = [str(r) for r in _listify(st.get("Resource"))]
        if _match(acts, action, ci=True) and _match(ress, resource):
            if st.get("Effect") == "Deny":
                return "deny"
            if st.get("Effect") == "Allow":
                allowed = True
    return "allow" if allowed else "deny"


# --- Terraform (naive block scanner; no HCL evaluation) -----------------------------------------------
_RES = re.compile(r'^\s*resource\s+"(?P<type>[\w-]+)"\s+"(?P<name>[\w-]+)"\s*\{')


def _blocks(text: str) -> list[tuple[str, str, int, int]]:
    lines = text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        m = _RES.match(lines[i])
        if m:
            depth = lines[i].count("{") - lines[i].count("}")
            j = i
            while depth > 0 and j + 1 < len(lines):
                j += 1
                depth += lines[j].count("{") - lines[j].count("}")
            out.append((m["type"], m["name"], i, j))
            i = j
        i += 1
    return out


def analyze_terraform(text: str) -> dict[str, Any]:
    if len(text.encode()) > MAX_INPUT_BYTES:
        raise AnalysisInputError("Input is larger than 64 KiB.")
    lines = text.splitlines()
    findings: list[dict[str, Any]] = []

    def add(typ: str, name: str, ln: int, rule: str, sev: str, title: str, plain: str, why: str, fix: str) -> None:
        snippet = lines[ln].strip() if ln < len(lines) else ""
        findings.append(
            {
                "rule_id": rule, "title": title, "plain_title": plain, "severity": sev, "confidence": "high",
                "evidence_kind": "SIMULATED", "what": f"{typ}.{name} (line {ln + 1}): {snippet}", "why": why, "fix": fix,
                "verify": "Re-run the analyzer after editing the snippet; the rule should no longer match.",
                "observed": [f"Line {ln + 1}: `{snippet}`"], "inferred": [], "location": f"{typ}.{name}", "line": ln + 1,
                "mapping": ["CIS AWS Foundations (context)"],
            }
        )

    blocks = _blocks(text)
    for typ, name, a, b in blocks:
        body = lines[a : b + 1]

        def find(rx: str, _body: list[str] = body, _a: int = a) -> int | None:
            for k, ln in enumerate(_body):
                if re.search(rx, ln):
                    return _a + k
            return None

        if typ == "aws_s3_bucket":
            ln = find(r'acl\s*=\s*"(public-read|public-read-write)"')
            if ln is not None:
                add(typ, name, ln, "TF-S3-PUBLIC-ACL", "high", "S3 bucket ACL is public",
                    "Files in this storage bucket may be readable by anyone on the internet.",
                    "Public ACLs are a leading cause of data exposure.", 'Use acl = "private" and add aws_s3_bucket_public_access_block.')
        if typ == "aws_s3_bucket_public_access_block":
            for key in ("block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"):
                ln = find(rf"{key}\s*=\s*false")
                if ln is not None:
                    add(typ, name, ln, "TF-S3-PAB-OFF", "high", f"S3 public access block disabled ({key})",
                        "A safety switch that stops accidental public access is turned off.",
                        "Disabling the block removes a guard-rail.", f"Set {key} = true.")
        if typ == "aws_security_group":
            for k, ln in enumerate(body):
                if "0.0.0.0/0" in ln and "cidr_blocks" in ln:
                    window = "\n".join(body[max(0, k - 6) : k + 6])
                    port = re.search(r"from_port\s*=\s*(\d+)", window)
                    to_port = re.search(r"to_port\s*=\s*(\d+)", window)
                    if "egress" in "\n".join(body[max(0, k - 8) : k]).lower() and "ingress" not in "\n".join(
                        body[max(0, k - 8) : k]
                    ).lower():
                        continue
                    p = int(port[1]) if port else -1
                    tp = int(to_port[1]) if to_port else -1
                    if p in (22, 3389) or (p == 0 and tp in (0, 65535)):
                        add(typ, name, a + k, "TF-SG-OPEN-ADMIN", "critical", f"Port {p} open to the whole internet",
                            "A remote administration port can be reached from anywhere.",
                            "Internet-wide admin ports invite credential guessing.", "Restrict cidr_blocks to a trusted range or use SSM Session Manager.")
                    else:
                        add(typ, name, a + k, "TF-SG-OPEN-WORLD", "medium", "Security group allows 0.0.0.0/0",
                            "A network rule accepts traffic from anywhere.", "Broad ingress increases exposure.",
                            "Limit ingress to required sources.")
        if typ in ("aws_db_instance", "aws_rds_cluster"):
            ln = find(r"publicly_accessible\s*=\s*true")
            if ln is not None:
                add(typ, name, ln, "TF-DB-PUBLIC", "high", "Database is publicly accessible",
                    "The database can be reached from the internet.", "Databases should live in private subnets.", "Set publicly_accessible = false.")
            if find(r"storage_encrypted\s*=\s*true") is None:
                add(typ, name, a, "TF-DB-UNENCRYPTED", "medium", "Database storage encryption not enabled",
                    "Data on disk is not encrypted.", "Encryption at rest is a baseline control.", "Set storage_encrypted = true.")
        if typ == "aws_ebs_volume":
            ln = find(r"encrypted\s*=\s*false")
            if ln is not None:
                add(typ, name, ln, "TF-EBS-UNENCRYPTED", "medium", "EBS volume not encrypted",
                    "Disk data is not encrypted.", "Encryption at rest is a baseline control.", "Set encrypted = true.")
        if typ in ("aws_iam_policy", "aws_iam_role_policy"):
            ln = find(r'(?i)"?Action"?\s*[:=]\s*"\*"')
            if ln is not None:
                add(typ, name, ln, "TF-IAM-ACTION-STAR", "critical", "IAM policy grants Action: *",
                    "A permission grants every action.", "Violates least privilege.", "List specific actions.")
    order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    findings.sort(key=lambda f: (-order[f["severity"]], f["line"]))
    return {
        "kind": "terraform",
        "resources": len(blocks),
        "findings": findings,
        "summary": {s: sum(1 for f in findings if f["severity"] == s) for s in ("critical", "high", "medium", "low")},
    }


def parse_json_policy(text: str) -> dict[str, Any]:
    try:
        d = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AnalysisInputError("Policy is not valid JSON.") from exc
    if not isinstance(d, dict):
        raise AnalysisInputError("Policy must be an object.")
    return d
