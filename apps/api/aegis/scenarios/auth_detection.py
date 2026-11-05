"""Demo 3 - Detection gap: replay synthetic login events through versioned, isolated detection rules.

Events use RFC 5737 documentation IP ranges and fake usernames only. Labels (benign / campaign id)
let us compute precision, recall and detection latency on this synthetic data - nothing more.
"""
from __future__ import annotations

import copy
from collections import defaultdict
from typing import Any

from .base import Acc, Remediation, Scenario, Step, exposure_points

HOST = "demo-auth.fixture"
USERS = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi", "ivan", "judy", "mallory", "niaj",
         "olivia", "peggy", "rupert", "sybil", "trent", "uma", "victor", "wendy", "xavier", "yara", "zane", "amy",
         "ben", "cat", "dan", "eve", "fay", "gus", "hal", "ian", "jo", "kim", "lee", "svc-backup", "admin"]

CAMPAIGNS = {
    "brute-force-admin": {"title": "Brute force against 'admin'", "ips": ["203.0.113.50"], "plain": "One attacker hammering one account."},
    "spray-198.51.100.23": {"title": "Password spraying from 198.51.100.23", "ips": ["198.51.100.23"],
                            "plain": "One attacker trying a few passwords against many accounts, staying under per-account limits."},
}

RULE_V1 = {
    "id": "AUTH-BRUTE-001", "name": "Repeated failed logins for one account", "kind": "failed_login_threshold", "version": 1,
    "enabled": True, "params": {"group_by": "user", "threshold": 8, "window_seconds": 300},
    "mitre": ["T1110.001 Password Guessing (context)"],
}
RECOMMENDED_RULE = {
    "id": "AUTH-SPRAY-002", "name": "Many accounts failing from one source", "kind": "distinct_users_per_ip", "version": 1,
    "enabled": True, "params": {"distinct_users": 10, "window_seconds": 600},
    "mitre": ["T1110.003 Password Spraying (context)"],
}
RULE_LIMITS = {
    "failed_login_threshold": {"threshold": (2, 200), "window_seconds": (30, 3600), "group_by": ("user", "source_ip")},
    "distinct_users_per_ip": {"distinct_users": (2, 200), "window_seconds": (30, 3600)},
}


def build_events() -> list[dict[str, Any]]:
    ev: list[dict[str, Any]] = []
    n = 0

    def add(t: int, user: str, ip: str, outcome: str, label: str) -> None:
        nonlocal n
        n += 1
        ev.append({"id": f"auth-{n:04d}", "t": t, "user": user, "src_ip": ip, "outcome": outcome, "label": label, "app": "vpn-portal"})

    # Benign background: deterministic successes + occasional typos
    for i in range(48):
        u = USERS[(i * 7) % 33]
        add(60 + i * 140, u, f"192.0.2.{20 + (i % 9)}", "success", "benign")
        if i % 11 == 5:
            add(60 + i * 140 - 20, u, f"192.0.2.{20 + (i % 9)}", "failure", "benign")
    # Benign: one user forgot their password (5 failures, then success)
    for k in range(5):
        add(1800 + k * 35, "judy", "192.0.2.77", "failure", "benign")
    add(1990, "judy", "192.0.2.77", "success", "benign")
    # Benign noise: shared office NAT, 18 failures across 12 users spread over ~50 minutes
    for k in range(18):
        add(600 + k * 170, USERS[10 + (k % 12)], "192.0.2.10", "failure", "benign")
    # Campaign A: brute force on admin (14 failures, 10s apart) then success
    for k in range(14):
        add(4000 + k * 10, "admin", "203.0.113.50", "failure", "brute-force-admin")
    add(4150, "admin", "203.0.113.50", "success", "brute-force-admin")
    # Campaign B: spray, 30 distinct users, 18s apart, then success on svc-backup
    spray_users = [u for u in USERS if u not in {"admin", "svc-backup"}][:30]
    for k, u in enumerate(spray_users):
        add(5000 + k * 18, u, "198.51.100.23", "failure", "spray-198.51.100.23")
    add(5580, "svc-backup", "198.51.100.23", "success", "spray-198.51.100.23")
    ev.sort(key=lambda e: (e["t"], e["id"]))
    for i, e in enumerate(ev):  # re-number after sort so ids are chronological and stable
        e["id"] = f"auth-{i + 1:04d}"
    return ev


def _ts(t: int) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"2026-01-15T{10 + h:02d}:{m:02d}:{s:02d}Z"


def run_rule(rule: dict[str, Any], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deterministic sliding-window evaluation. Returns alerts (one per group per episode)."""
    if not rule.get("enabled", True):
        return []
    p = rule["params"]
    win = int(p["window_seconds"])
    fails = [e for e in events if e["outcome"] == "failure"]
    alerts: list[dict[str, Any]] = []
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    kind = rule["kind"]
    if kind == "failed_login_threshold":
        key = "user" if p["group_by"] == "user" else "src_ip"
        for e in fails:
            groups[e[key]].append(e)
    elif kind == "distinct_users_per_ip":
        for e in fails:
            groups[e["src_ip"]].append(e)
    else:
        raise ValueError(f"unknown rule kind {kind}")
    for g, evs in sorted(groups.items()):
        left = 0
        suppress_until = -1
        for right, e in enumerate(evs):
            while evs[left]["t"] < e["t"] - win:
                left += 1
            window = evs[left : right + 1]
            if kind == "failed_login_threshold":
                hit = len(window) >= int(p["threshold"])
            else:
                hit = len({w["user"] for w in window}) >= int(p["distinct_users"])
            if hit and e["t"] > suppress_until:
                suppress_until = e["t"] + win
                alerts.append({"rule_id": rule["id"], "rule_version": rule["version"], "group": g, "t": e["t"],
                               "event_ids": [w["id"] for w in window], "events": window})
    alerts.sort(key=lambda a: (a["t"], a["group"]))
    return alerts


def score(rules: list[dict[str, Any]], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Precision/recall/latency against labelled synthetic campaigns."""
    by_id = {e["id"]: e for e in events}
    alerts = [a for r in rules for a in run_rule(r, events)]
    camp_first: dict[str, int] = {}
    camp_success: dict[str, int] = {}
    for e in events:
        if e["label"] != "benign":
            camp_first.setdefault(e["label"], e["t"])
            if e["outcome"] == "success":
                camp_success[e["label"]] = e["t"]
    scored = []
    detected: dict[str, dict[str, Any]] = {}
    for a in alerts:
        labels = [by_id[i]["label"] for i in a["event_ids"]]
        top = max(set(labels), key=labels.count)
        tp = top != "benign" and labels.count(top) / len(labels) >= 0.5
        item = {"rule_id": a["rule_id"], "rule_version": a["rule_version"], "group": a["group"], "t": a["t"],
                "time": _ts(a["t"]), "event_ids": a["event_ids"], "true_positive": tp, "campaign": top if tp else None,
                "n_events": len(a["event_ids"]),
                "distinct_users": len({by_id[i]["user"] for i in a["event_ids"]}),
                "sources": sorted({by_id[i]["src_ip"] for i in a["event_ids"]})}
        scored.append(item)
        if tp and top not in detected:
            detected[top] = item
    tp_n = sum(1 for s in scored if s["true_positive"])
    fp_n = len(scored) - tp_n
    camp_results = []
    for cid, meta in CAMPAIGNS.items():
        d = detected.get(cid)
        camp_results.append({
            "campaign": cid, "title": meta["title"], "plain": meta["plain"], "detected": d is not None,
            "first_event_t": camp_first[cid], "latency_seconds": (d["t"] - camp_first[cid]) if d else None,
            "alert_before_success": bool(d and cid in camp_success and d["t"] < camp_success[cid]),
            "success_t": camp_success.get(cid), "rule": d["rule_id"] if d else None,
        })
    lat = [c["latency_seconds"] for c in camp_results if c["latency_seconds"] is not None]
    return {
        "alerts": scored,
        "campaigns": camp_results,
        "precision": round(tp_n / len(scored), 3) if scored else None,
        "recall": round(len(detected) / len(CAMPAIGNS), 3),
        "false_positive_alerts": fp_n,
        "true_positive_alerts": tp_n,
        "mean_time_to_detect_seconds": round(sum(lat) / len(lat), 1) if lat else None,
    }


def initial_state() -> dict[str, Any]:
    return {"dataset": "auth-2026-01-15 (synthetic)", "rules": [copy.deepcopy(RULE_V1)], "events": build_events()}


def _load(state: dict[str, Any], acc: dict[str, Any]) -> None:
    ev = state["events"]
    Acc.observe(acc, "load", HOST, "load synthetic dataset",
                f"Loaded {len(ev)} synthetic login events ({sum(1 for e in ev if e['outcome']=='failure')} failures).",
                {"events": len(ev)})
    acc["events"] = [{"id": e["id"], "time": e["t"], "actor": e["src_ip"], "kind": f"login_{e['outcome']}",
                      "target": e["user"], "label": e["label"], "detail": f"{e['user']} from {e['src_ip']}: {e['outcome']}"}
                     for e in ev]


def _replay(state: dict[str, Any], acc: dict[str, Any]) -> None:
    sc = score(state["rules"], state["events"])
    acc["extra"]["score"] = sc
    for r in state["rules"]:
        Acc.observe(acc, "replay", HOST, f"replay rule {r['id']} v{r['version']}",
                    f"Rule '{r['name']}' ({r['kind']}) params {r['params']} produced "
                    f"{sum(1 for a in sc['alerts'] if a['rule_id']==r['id'])} alert(s).", {"rule": r["id"]})


def _evaluate(state: dict[str, Any], acc: dict[str, Any]) -> None:
    sc = acc["extra"]["score"]
    for a in sc["alerts"]:
        acc["detections"].append({
            "rule_id": a["rule_id"], "rule_version": a["rule_version"], "title": f"Alert on {a['group']}",
            "severity": "high" if a["true_positive"] else "low", "event_ids": a["event_ids"], "group": a["group"],
            "first_event_t": a["t"], "time": a["time"], "true_positive": a["true_positive"], "campaign": a["campaign"],
            "n_events": a["n_events"], "distinct_users": a["distinct_users"], "sources": a["sources"],
            "note": ("Matches a labelled attack campaign in the synthetic dataset." if a["true_positive"] else
                     "Matches only benign labelled activity: a false positive on this dataset."),
        })
    for c in sc["campaigns"]:
        if not c["detected"]:
            ids = [e["id"] for e in state["events"] if e["label"] == c["campaign"]][:60]
            oid = Acc.observe(acc, "evaluate", HOST, "compare alerts to labelled campaigns",
                              f"No alert covers campaign '{c['campaign']}' ({len(ids)} labelled events).", {"campaign": c["campaign"]})
            Acc.finding(
                acc, source="blue", rule_id=f"AUTH-GAP-{c['campaign'].split('-')[0].upper()}", title=f"Detection gap: {c['title']} was not alerted",
                plain_title="An attack in the sample data went unnoticed by the current alert rules",
                severity="high", what=f"None of the enabled rules fired for '{c['campaign']}'. {c['plain']}",
                why="An attacker following this pattern would not generate an alert, delaying response until after account misuse.",
                fix="Add or tune a rule that matches the pattern (for spraying: count distinct accounts failing from one source address).",
                verify="Replay the same versioned dataset: an alert must cover the campaign before its first successful login.",
                observed=[f"No alert matched {len(ids)} labelled events of this campaign ({oid})"],
                inferred=["Real-world attackers may vary timing; this result applies to the synthetic dataset only."],
                location=f"campaign:{c['campaign']}", mapping=["MITRE ATT&CK T1110 Brute Force (context)"],
                evidence_refs=[oid], evidence_kind="SIMULATED")
    if sc["false_positive_alerts"]:
        Acc.finding(
            acc, source="blue", rule_id="AUTH-NOISY-RULE", title=f"Noisy rule: {sc['false_positive_alerts']} false-positive alert(s)",
            plain_title="Alert rules are firing on normal activity", severity="medium",
            what=f"{sc['false_positive_alerts']} alert(s) matched only benign-labelled events.",
            why="False alarms train analysts to ignore alerts.", fix="Raise thresholds or widen/narrow the window; replay to confirm.",
            verify="Replay: false-positive alert count should drop to zero while recall stays 100%.",
            observed=[f"{sc['false_positive_alerts']} FP alert(s) in replay"], location="rules", evidence_kind="SIMULATED")


def _plan(state: dict[str, Any]) -> list[Step]:
    dest = f"fixture://{HOST}/"
    return [
        Step("load", "Load synthetic login dataset", "log_replay", dest, _load),
        Step("replay", "Replay events through enabled detection rules", "log_replay", dest, _replay),
        Step("evaluate", "Score alerts against labelled campaigns", "log_replay", dest, _evaluate),
    ]


def _finalize(state: dict[str, Any], acc: dict[str, Any]) -> dict[str, Any]:
    sc = acc["extra"]["score"]
    f = acc["findings"]
    return {
        "scenario": acc["scenario"], "observations": acc["observations"], "findings": f,
        "detections": acc["detections"], "events": acc["events"], "campaigns": sc["campaigns"],
        "rules": state["rules"],
        "metrics": {
            "findings_total": len(f), "exposure_points": exposure_points(f), "detections_triggered": len(sc["alerts"]),
            "precision": sc["precision"], "recall": sc["recall"], "false_positive_alerts": sc["false_positive_alerts"],
            "true_positive_alerts": sc["true_positive_alerts"], "mean_time_to_detect_seconds": sc["mean_time_to_detect_seconds"],
            "campaigns_detected": sum(1 for c in sc["campaigns"] if c["detected"]),
            "detection_coverage": {"covered": sum(1 for c in sc["campaigns"] if c["detected"]), "expected": len(CAMPAIGNS)},
            "events_reviewed": len(state["events"]), "dataset_note": "Synthetic labelled data; 2 campaigns. Not a measure of real-world accuracy.",
        },
    }


def validate_rule(rule: dict[str, Any]) -> list[str]:
    """Return a list of validation errors (empty if valid). Parameterized rules only - no free-form code."""
    errs = []
    kind = rule.get("kind")
    if kind not in RULE_LIMITS:
        return [f"Unknown rule kind '{kind}'. Allowed: {', '.join(RULE_LIMITS)}"]
    lim = RULE_LIMITS[kind]
    p = rule.get("params") or {}
    for k, rng in lim.items():
        v = p.get(k)
        if k == "group_by":
            if v not in rng:
                errs.append(f"params.group_by must be one of {rng}")
        elif not isinstance(v, int) or isinstance(v, bool) or not (rng[0] <= v <= rng[1]):
            errs.append(f"params.{k} must be an integer between {rng[0]} and {rng[1]}")
    extra = set(p) - set(lim)
    if extra:
        errs.append(f"Unexpected params: {sorted(extra)}")
    if not isinstance(rule.get("id"), str) or not rule["id"].replace("-", "").isalnum() or len(rule["id"]) > 40:
        errs.append("id must be alphanumeric/hyphen, max 40 chars")
    if not isinstance(rule.get("name"), str) or not (1 <= len(rule["name"]) <= 120):
        errs.append("name must be 1-120 characters")
    return errs


def _apply(state: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    s = copy.deepcopy(state)
    new = copy.deepcopy(params.get("rule") or RECOMMENDED_RULE)
    errs = validate_rule(new)
    if errs:
        raise ValueError("; ".join(errs))
    new.setdefault("enabled", True)
    existing = [r for r in s["rules"] if r["id"] == new["id"]]
    new["version"] = (existing[0]["version"] + 1) if existing else 1
    s["rules"] = [r for r in s["rules"] if r["id"] != new["id"]] + [new]
    return s


def _diff(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    b = {r["id"]: r for r in before["rules"]}
    out = []
    for r in after["rules"]:
        if r["id"] not in b:
            out.append(f"+ rule {r['id']} v{r['version']} ({r['kind']}) params={r['params']}")
        elif b[r["id"]] != r:
            out.append(f"~ rule {r['id']} v{b[r['id']]['version']} -> v{r['version']} params={r['params']}")
    return out


SCENARIO = Scenario(
    id="auth-detection-gap", version="1.0.0", title="Detection gap: password spraying vs. alert rules",
    summary="Replays a labelled synthetic login dataset through versioned rules; measures precision, recall and detection latency; remediation adds a guided rule.",
    plain_summary="We replay a day of fake login activity that contains two attacks. One goes unnoticed. We add a rule, replay again, and check it catches it without crying wolf.",
    kind="auth_logs", demo_no=3, initial_state=initial_state, plan=_plan, finalize=_finalize,
    remediation=Remediation(
        id="auth-add-spray-rule", title="Add rule: many accounts failing from one source (isolated rule set)",
        explanation="Adds a versioned rule to the fixture's isolated rule set. No real SIEM, Wazuh or Suricata configuration is changed.",
        tradeoffs=["Lowering 'distinct users' too far flags shared office networks (try 3 and watch the false-positive count).",
                   "Slow sprays that stay below the window threshold would still evade this rule."],
        rollback="Use 'Roll back' to remove the added rule version and restore the previous rule set.",
        default_params={"rule": RECOMMENDED_RULE}, apply=_apply, diff=_diff),
    primary_target_slug="demo-auth-logs", host=HOST, actors={"red": "Red Analyst", "blue": "Blue Analyst"},
)
