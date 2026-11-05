"""Demo 1 - Web hardening: missing security headers on a FIXTURE web service (no network is touched)."""
from __future__ import annotations

import copy
from typing import Any

from .base import SIM_EPOCH, Acc, Remediation, Scenario, Step, exposure_points

HOST = "demo-web.fixture"

REQUIRED_HEADERS = [
    ("Content-Security-Policy", "medium", "CSP-MISSING",
     "The site does not tell browsers which scripts it trusts",
     "Without a Content-Security-Policy, injected script (for example via a reflected XSS bug) runs with full page privileges.",
     "Add `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'`.", ["OWASP A05:2021 Security Misconfiguration"]),
    ("X-Frame-Options", "medium", "XFO-MISSING",
     "Other websites may be able to display this page inside a hidden frame",
     "Missing framing protection enables clickjacking: a hostile page overlays invisible frames to trick clicks.",
     "Add `X-Frame-Options: DENY` (or CSP frame-ancestors).", ["OWASP A05:2021 Security Misconfiguration"]),
    ("Referrer-Policy", "low", "REFERRER-MISSING",
     "The site may leak full page addresses to other sites",
     "URLs with identifiers can leak to third parties through the Referer header.",
     "Add `Referrer-Policy: strict-origin-when-cross-origin`.", ["OWASP A05:2021 Security Misconfiguration"]),
]


def initial_state() -> dict[str, Any]:
    return {
        "service": "demo-web",
        "host": HOST,
        "response": {
            "status": 200,
            "headers": {
                "Server": "nginx",
                "Content-Type": "text/html; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
            },
            "set_cookie": ["sessionid=SYNTHETIC-DEMO-VALUE; Path=/"],
        },
        # Synthetic WAF/access telemetry (clearly fake; documentation address ranges only).
        "telemetry": [
            {"id": "web-001", "t": 0, "src": "198.51.100.7", "method": "GET", "path": "/", "status": 200},
            {"id": "web-002", "t": 14, "src": "198.51.100.7", "method": "GET", "path": "/pricing", "status": 200},
            {"id": "web-003", "t": 31, "src": "203.0.113.44", "method": "GET", "path": "/search?q=%3Cscript%3Ealert(1)%3C/script%3E", "status": 200},
            {"id": "web-004", "t": 33, "src": "203.0.113.44", "method": "GET", "path": "/search?q=%3Cimg+src%3Dx+onerror%3Dalert(1)%3E", "status": 200},
            {"id": "web-005", "t": 60, "src": "192.0.2.19", "method": "GET", "path": "/docs", "status": 200},
            {"id": "web-006", "t": 75, "src": "192.0.2.19", "method": "POST", "path": "/login", "status": 302},
            {"id": "web-007", "t": 90, "src": "198.51.100.88", "method": "GET", "path": "/about", "status": 200},
        ],
    }


def _fetch(state: dict[str, Any], acc: dict[str, Any]) -> None:
    r = state["response"]
    oid = Acc.observe(acc, "fetch", HOST, "passive GET / (fixture response)",
                      f"Fixture responded HTTP {r['status']} with {len(r['headers'])} response headers.",
                      {"status": r["status"], "headers": r["headers"]})
    acc["extra"]["fetch_obs"] = oid


def _headers(state: dict[str, Any], acc: dict[str, Any]) -> None:
    hdrs = {k.lower(): v for k, v in state["response"]["headers"].items()}
    for name, sev, rid, plain, why, fix, mapping in REQUIRED_HEADERS:
        present = name.lower() in hdrs
        oid = Acc.observe(acc, "headers", HOST, f"check header {name}",
                          f"{name}: {'present (' + hdrs[name.lower()] + ')' if present else 'absent'}",
                          {"header": name, "present": present})
        if name == "X-Frame-Options" and "frame-ancestors" in hdrs.get("content-security-policy", ""):
            present = True
        if not present:
            Acc.finding(acc, rule_id=f"WEB-{rid}", title=f"Missing {name} header", plain_title=plain, severity=sev,
                        what=f"The response from {HOST} does not include the {name} header.", why=why, fix=fix,
                        verify=f"Re-run the same passive check; `{name}` should be present in the fixture response.",
                        observed=[f"{name} header absent in fixture response ({oid})"],
                        inferred=["Risk depends on whether the application has an injection/framing weakness (not tested)."],
                        location=f"response.headers.{name}", mapping=mapping,
                        evidence_refs=[oid, acc["extra"].get("fetch_obs", "")], source="red")


def _cookies(state: dict[str, Any], acc: dict[str, Any]) -> None:
    for c in state["response"].get("set_cookie", []):
        name = c.split("=", 1)[0]
        flags = {p.strip().lower() for p in c.split(";")[1:]}
        missing = [f for f in ("httponly", "secure") if f not in flags]
        samesite = any(p.startswith("samesite") for p in flags)
        if not samesite:
            missing.append("samesite")
        oid = Acc.observe(acc, "cookies", HOST, f"inspect Set-Cookie {name}",
                          f"Cookie '{name}' flags missing: {', '.join(missing) or 'none'}.",
                          {"cookie": name, "missing": missing})
        if missing:
            Acc.finding(acc, rule_id="WEB-COOKIE-FLAGS", title=f"Session cookie '{name}' lacks protective flags ({', '.join(missing)})",
                        plain_title="The login cookie is missing settings that protect it from theft", severity="medium",
                        what=f"Cookie '{name}' is set without: {', '.join(missing)}.",
                        why="Without HttpOnly scripts can read it; without Secure it can travel over plain HTTP; without SameSite it is sent on cross-site requests.",
                        fix="Set `HttpOnly; Secure; SameSite=Lax` on session cookies.",
                        verify="Re-run the passive check; the Set-Cookie line should contain all three flags.",
                        observed=[f"Set-Cookie for {name} missing {', '.join(missing)} ({oid})"], location=f"response.set_cookie.{name}",
                        mapping=["OWASP A05:2021 Security Misconfiguration"], evidence_refs=[oid], confidence="high")


def _telemetry(state: dict[str, Any], acc: dict[str, Any]) -> None:
    """Blue assistant: deterministic detection rule on synthetic access telemetry."""
    hits = [e for e in state["telemetry"] if "<script" in e["path"].lower() or "%3cscript" in e["path"].lower()
            or "onerror" in e["path"].lower()]
    acc["events"] = [{"id": e["id"], "time": e["t"], "actor": e["src"], "kind": "http_request",
                      "target": HOST, "detail": f"{e['method']} {e['path']} -> {e['status']}"} for e in state["telemetry"]]
    for e in hits:
        Acc.observe(acc, "telemetry", HOST, "rule WEB-XSS-PROBE on synthetic access log",
                    f"Event {e['id']} from {e['src']} contains script-injection markers in the query string.", {"event": e["id"]})
    if hits:
        acc["detections"].append({
            "rule_id": "WEB-XSS-PROBE", "rule_version": 1, "title": "Script-injection probe in query string",
            "severity": "medium", "event_ids": [e["id"] for e in hits], "first_event_t": hits[0]["t"],
            "latency_seconds": 2, "true_positive": True, "campaign": "xss-probe-203.0.113.44",
            "note": "Probe requests were seen. Whether they could execute depends on the missing CSP/encoding (not tested here).",
        })


def _plan(state: dict[str, Any]) -> list[Step]:
    dest = f"fixture://{HOST}/"
    return [
        Step("fetch", "Passive request to fixture service", "passive_http_check", dest, _fetch),
        Step("headers", "Check required security headers", "config_analysis", dest, _headers),
        Step("cookies", "Inspect session cookie flags", "config_analysis", dest, _cookies),
        Step("telemetry", "Blue Assistant: review synthetic access telemetry", "log_replay", dest, _telemetry),
    ]


def _finalize(state: dict[str, Any], acc: dict[str, Any]) -> dict[str, Any]:
    findings = acc["findings"]
    det = acc["detections"]
    return {
        "scenario": acc["scenario"],
        "observations": acc["observations"],
        "findings": findings,
        "detections": det,
        "events": acc["events"],
        "metrics": {
            "findings_total": len(findings),
            "exposure_points": exposure_points(findings),
            "detections_triggered": len(det),
            "events_reviewed": len(acc["events"]),
            "detection_coverage": {"covered": len(det), "expected": 1},
        },
    }


def _apply(state: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    s = copy.deepcopy(state)
    h = s["response"]["headers"]
    h["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
    h["X-Frame-Options"] = "DENY"
    h["Referrer-Policy"] = "strict-origin-when-cross-origin"
    s["response"]["set_cookie"] = [c.split(";")[0] + "; Path=/; HttpOnly; Secure; SameSite=Lax" for c in s["response"]["set_cookie"]]
    return s


def _diff(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    out = []
    for k, v in after["response"]["headers"].items():
        if before["response"]["headers"].get(k) != v:
            out.append(f"+ {k}: {v}")
    out.append("~ Set-Cookie: add HttpOnly; Secure; SameSite=Lax")
    return out


SCENARIO = Scenario(
    id="web-headers", version="1.0.0", title="Web hardening: missing security headers",
    summary="Passive check of a fixture web service for missing browser security headers and weak cookie flags; Blue reviews synthetic telemetry.",
    plain_summary="We look at the settings a website sends to browsers, find protections that are switched off, and then prove that turning them on works.",
    kind="web", demo_no=1, initial_state=initial_state, plan=_plan, finalize=_finalize,
    remediation=Remediation(
        id="web-add-baseline-headers", title="Add baseline security headers and cookie flags (fixture only)",
        explanation="Changes the fixture service's simulated response configuration. No real server, firewall or network setting is changed.",
        tradeoffs=["A strict CSP can break pages that load third-party scripts; the fixture has none, a real site would need testing in report-only mode first.",
                   "Secure cookies require HTTPS end-to-end."],
        rollback="Use 'Roll back' on the case to restore the exact previous fixture configuration.",
        apply=_apply, diff=_diff),
    primary_target_slug="demo-web", host=HOST, actors={"red": "Red Analyst", "blue": "Blue Analyst"},
)
_ = SIM_EPOCH
