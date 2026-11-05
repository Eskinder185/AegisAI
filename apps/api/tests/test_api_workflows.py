"""End-to-end API workflows for the four golden-path demos, roles, approvals and fail-closed scope."""
import pytest
from sqlalchemy import select

from aegis import db as dbm
from aegis.models import Approval, Finding, Run
from aegis.security import sha256_obj

from .conftest import run_all


def full_flow(api, slug, params=None):
    t = api.target(slug)
    r = api.post("/purple/cases", json={"target_id": t["id"]})
    assert r.status_code == 201, r.text
    case = r.json()["case"]
    assert run_all() == 1
    c = api.get(f"/purple/cases/{case['id']}").json()
    assert c["case"]["status"] == "baseline_done"
    a = api.post(f"/purple/cases/{case['id']}/approve", json={"action": "apply", "confirm": True, "params": params})
    assert a.status_code == 200, a.text
    ap = api.post(f"/purple/cases/{case['id']}/apply", json={"approval_id": a.json()["id"]})
    assert ap.status_code == 200, ap.text
    job = api.post(f"/purple/cases/{case['id']}/retest")
    assert job.status_code == 202, job.text
    run_all()
    return api.get(f"/purple/cases/{case['id']}").json(), t


def test_demo1_web_headers_before_after(analyst):
    c, t = full_flow(analyst, "demo-web")
    cmp_ = c["case"]["comparison"]
    assert c["case"]["status"] == "verified" and cmp_["verdict"] == "verified"
    assert len(cmp_["resolved"]) == 4 and not cmp_["remaining"] and not cmp_["new"]
    rows = {r["label"]: r for r in cmp_["rows"]}
    assert rows["Findings"]["before"] == 4 and rows["Findings"]["after"] == 0
    # detection of the XSS probe is unaffected by a header fix: honest "unchanged"
    assert rows["Detections triggered"]["before"] == rows["Detections triggered"]["after"] == 1
    fs = analyst.get("/findings?verification=VERIFIED_FIXED").json()
    assert fs["total"] == 4
    assert analyst.get(f"/runs/{c['case']['retest_run_id']}/verify-manifest").json()["signature_valid"]


def test_demo2_iam_offline(analyst):
    base_t = analyst.target("demo-aws-iam")
    analyst.post("/purple/cases", json={"target_id": base_t["id"]})
    run_all()
    runs = analyst.get("/runs").json()["items"]
    base = analyst.get(f"/runs/{runs[0]['id']}").json()
    ids = {f["rule_id"] for f in base["result"]["findings"]}
    assert {"IAM-ACTION-STAR", "IAM-ESCALATION-PATH", "IAM-TRUST-PUBLIC", "IAM-SERVICE-WILDCARD"} <= ids
    star = next(f for f in base["result"]["findings"] if f["rule_id"] == "IAM-ACTION-STAR")
    assert "line" not in star and "Statement #2" in star["what"]
    esc = next(f for f in base["result"]["findings"] if f["rule_id"] == "IAM-ESCALATION-PATH")
    assert esc["evidence_kind"] == "INFERRED" and esc["inferred"]
    assert base["metrics"]["risky_blocked_all"] is False and base["metrics"]["required_access_ok"] is True


def test_demo2_iam_fix_verified_and_required_access_kept(analyst):
    c, _ = full_flow(analyst, "demo-aws-iam")
    cmp_ = c["case"]["comparison"]
    assert cmp_["verdict"] == "verified", cmp_
    rows = {r["label"]: r for r in cmp_["rows"]}
    assert rows["Required access still works"]["after"] == "3/3"
    assert rows["Risky access blocked"]["after"] == "3/3"


def test_demo3_detection_gap(analyst):
    c, _ = full_flow(analyst, "demo-auth-logs")
    cmp_ = c["case"]["comparison"]
    assert cmp_["verdict"] == "verified"
    rows = {r["label"]: r for r in cmp_["rows"]}
    assert rows["Attack campaigns detected (recall)"]["before"] == 0.5 and rows["Attack campaigns detected (recall)"]["after"] == 1.0
    assert rows["False-positive alerts"]["after"] == 0
    inc = analyst.get("/incidents").json()["items"]
    assert any("AUTH-SPRAY-002" in i["rule_id"] for i in inc)
    detail = analyst.get(f"/incidents/{inc[0]['id']}").json()
    assert detail["timeline"] and detail["evidence_event_ids"] and detail["next_step"]


def test_demo3_noisy_rule_shows_false_positives(analyst):
    rule = {"id": "AUTH-SPRAY-002", "name": "Too sensitive", "kind": "distinct_users_per_ip", "version": 1,
            "params": {"distinct_users": 3, "window_seconds": 600}}
    r = analyst.post("/detection/test", json={"rules": [rule]})
    assert r.status_code == 200
    assert r.json()["score"]["false_positive_alerts"] > 0
    assert analyst.post("/detection/test", json={"rules": [{**rule, "params": {"distinct_users": 0, "window_seconds": 600}}]}).status_code == 422
    assert analyst.post("/detection/test", json={"rules": [{**rule, "kind": "exec_shell"}]}).status_code == 422


def test_demo4_prompt_injection_guardrails(analyst):
    c, _ = full_flow(analyst, "demo-ai-agent")
    cmp_ = c["case"]["comparison"]
    assert cmp_["verdict"] == "verified"
    rows = {r["label"]: r for r in cmp_["rows"]}
    assert rows["Guardrail tests passed"]["before"] == 1 and rows["Guardrail tests passed"]["after"] == 7
    assert rows["Unsafe tool calls executed"]["before"] > 0 and rows["Unsafe tool calls executed"]["after"] == 0
    assert rows["Canary leaks"]["after"] == 0
    run = analyst.get(f"/runs/{c['case']['retest_run_id']}").json()
    cases = {x["case_id"]: x for x in run["result"]["guardrail_cases"]}
    assert all(x["passed"] for x in cases.values())
    assert any(x["trace"] for x in cases.values())  # gate/data trace recorded
    assert cases["AI-000"]["observed"]["executed_tools"] == ["search_docs"]  # no over-blocking


def test_determinism_same_result_hash(analyst):
    t = analyst.target("demo-web")
    hashes = []
    for _ in range(2):
        analyst.post("/jobs", json={"target_id": t["id"]})
        run_all()
    with dbm.session_scope() as db:
        runs = db.execute(select(Run)).scalars().all()
        hashes = {sha256_obj(r.result) for r in runs}
    assert len(runs) == 2 and len(hashes) == 1


def test_viewer_cannot_mutate(api):
    api.login("viewer")
    t = api.target("demo-web")
    assert api.post("/jobs", json={"target_id": t["id"]}).status_code == 403
    assert api.post("/purple/cases", json={"target_id": t["id"]}).status_code == 403
    assert api.put("/system/mode", json={"mode": "LOCAL_LAB"}).status_code == 403
    assert api.get("/targets").status_code == 200


def test_approval_required_and_bound(analyst):
    t = analyst.target("demo-web")
    case = analyst.post("/purple/cases", json={"target_id": t["id"]}).json()["case"]
    run_all()
    # no approval id -> validation error; fake id -> rejected
    assert analyst.post(f"/purple/cases/{case['id']}/apply", json={"approval_id": "nope"}).status_code == 403
    # approval without explicit confirm is refused
    assert analyst.post(f"/purple/cases/{case['id']}/approve", json={"action": "apply"}).status_code == 422
    a = analyst.post(f"/purple/cases/{case['id']}/approve", json={"action": "apply", "confirm": True}).json()
    assert analyst.post(f"/purple/cases/{case['id']}/apply", json={"approval_id": a["id"]}).status_code == 200
    # approvals are single-use
    assert analyst.post(f"/purple/cases/{case['id']}/apply", json={"approval_id": a["id"]}).status_code == 403
    # a rollback approval cannot be used to apply
    r = analyst.post(f"/purple/cases/{case['id']}/approve", json={"action": "rollback", "confirm": True}).json()
    assert analyst.post(f"/purple/cases/{case['id']}/apply", json={"approval_id": r["id"]}).status_code == 403


def test_expired_approval_rejected(analyst):
    from datetime import timedelta

    from aegis.models import utcnow
    t = analyst.target("demo-web")
    case = analyst.post("/purple/cases", json={"target_id": t["id"]}).json()["case"]
    run_all()
    a = analyst.post(f"/purple/cases/{case['id']}/approve", json={"action": "apply", "confirm": True}).json()
    with dbm.session_scope() as db:
        db.get(Approval, a["id"]).expires_at = utcnow() - timedelta(minutes=1)
    r = analyst.post(f"/purple/cases/{case['id']}/apply", json={"approval_id": a["id"]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "approval_expired"


def test_rollback_restores_fixture(analyst):
    c, t = full_flow(analyst, "demo-web")
    cid = c["case"]["id"]
    assert analyst.get(f"/targets/{t['id']}").json()["fixture_state"]["response"]["headers"].get("X-Frame-Options")
    a = analyst.post(f"/purple/cases/{cid}/approve", json={"action": "rollback", "confirm": True}).json()
    assert analyst.post(f"/purple/cases/{cid}/rollback", json={"approval_id": a["id"]}).status_code == 200
    state = analyst.get(f"/targets/{t['id']}").json()["fixture_state"]
    assert "X-Frame-Options" not in state["response"]["headers"]


def test_scope_fail_closed_api(admin):
    for slug in ("lab-web-container", "example-external"):
        t = admin.target(slug)
        d = admin.post(f"/targets/{t['id']}/policy-check", json={"action": "passive_http_check", "destination": "http://169.254.169.254/"}).json()
        assert d["allowed"] is False
    ext = admin.target("example-external")
    r = admin.patch(f"/targets/{ext['id']}", json={"approval_status": "approved"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "external_disabled"
    assert admin.put("/system/mode", json={"mode": "EXTERNAL_AUTHORIZED"}).status_code == 422
    # even approved lab targets are refused in SIMULATION_ONLY mode
    lab = admin.target("lab-web-container")
    admin.patch(f"/targets/{lab['id']}", json={"approval_status": "approved"})
    d = admin.post(f"/targets/{lab['id']}/policy-check", json={"action": "passive_http_check", "destination": "http://lab-web/"}).json()
    assert d["code"] == "environment_not_permitted"


def test_target_validation_rejects_public_and_broad_scope(admin):
    base = {"slug": "t-one", "name": "T one", "owner": "me", "purpose": "testing scope", "environment": "lab_container",
            "hosts": ["lab-x"], "allowed_actions": ["passive_http_check"]}
    for cidrs, code in ((["8.8.8.8/32"], "scope_not_private"), (["10.0.0.0/8"], "scope_too_broad"),
                        (["169.254.169.0/24"], "scope_blocked"), (["nonsense"], "invalid_cidr")):
        r = admin.post("/targets", json={**base, "cidrs": cidrs})
        assert r.status_code == 422 and r.json()["error"]["code"] == code, (cidrs, r.text)
    assert admin.post("/targets", json={**base, "cidrs": ["172.28.0.0/24"], "allowed_actions": ["nmap_scan"]}).status_code == 422
    assert admin.post("/targets", json={**base, "cidrs": ["172.28.0.0/24"]}).status_code == 201


def test_kill_switch_blocks_new_and_running_jobs(admin):
    t = admin.target("demo-web")
    assert admin.post("/system/kill-switch", json={"engaged": True}).status_code == 200
    r = admin.post("/jobs", json={"target_id": t["id"]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "kill_switch"
    admin.post("/system/kill-switch", json={"engaged": False})
    job = admin.post("/jobs", json={"target_id": t["id"]}).json()
    admin.post("/system/kill-switch", json={"engaged": True})  # engaged AFTER creation, before the worker runs
    run_all()
    j = admin.get(f"/jobs/{job['id']}").json()
    assert j["status"] == "blocked" and "kill switch" in j["error"].lower()
    with dbm.session_scope() as db:
        assert not db.execute(select(Finding)).scalars().all()


def test_emergency_stop_cancels_jobs(admin):
    t = admin.target("demo-web")
    job = admin.post("/jobs", json={"target_id": t["id"]}).json()
    r = admin.post("/system/emergency-stop").json()
    assert r["jobs_cancelled"] == 1
    assert admin.get(f"/jobs/{job['id']}").json()["status"] == "cancelled"


def test_cancel_and_idempotency_and_no_duplicate_active(analyst):
    t = analyst.target("demo-web")
    j1 = analyst.post("/jobs", json={"target_id": t["id"]}, headers={"Idempotency-Key": "abc"}).json()
    j2 = analyst.post("/jobs", json={"target_id": t["id"]}, headers={"Idempotency-Key": "abc"}).json()
    j3 = analyst.post("/jobs", json={"target_id": t["id"]}).json()
    assert j1["id"] == j2["id"] == j3["id"] and j3["deduplicated"]
    c = analyst.post(f"/jobs/{j1['id']}/cancel").json()
    assert c["status"] == "cancelled"
    assert analyst.post(f"/jobs/{j1['id']}/cancel").json()["status"] == "cancelled"  # idempotent
    assert run_all() == 0


def test_cancel_running_job_midway(analyst, monkeypatch):
    from aegis.scenarios import web_headers

    t = analyst.target("demo-web")
    job = analyst.post("/jobs", json={"target_id": t["id"]}).json()
    orig = web_headers._headers

    def cancelling(state, acc):
        with dbm.session_scope() as db:
            from aegis.models import Job
            db.get(Job, job["id"]).cancel_requested = True
        orig(state, acc)

    # patch the plan's step function by wrapping scenario.plan
    sc = web_headers.SCENARIO
    real_plan = sc.plan

    def plan(state):
        steps = real_plan(state)
        for s in steps:
            if s.id == "headers":
                s.fn = cancelling
        return steps

    monkeypatch.setattr(sc, "plan", plan)
    run_all()
    j = analyst.get(f"/jobs/{job['id']}").json()
    assert j["status"] == "cancelled"
    assert analyst.get("/findings").json()["total"] == 0


def test_audit_chain_and_tamper_detection(admin):
    t = admin.target("demo-web")
    admin.post("/jobs", json={"target_id": t["id"]})
    run_all()
    v = admin.get("/audit/verify").json()
    assert v["ok"] and v["checked"] > 3
    from sqlalchemy import update

    from aegis.models import AuditEntry
    with dbm.session_scope() as db:
        db.execute(update(AuditEntry).where(AuditEntry.id == 2).values(actor="mallory"))
    v = admin.get("/audit/verify").json()
    assert v["ok"] is False and v["broken_at"] == 2


def test_csrf_and_auth_required(api):
    assert api.get("/targets").status_code == 401
    api.login("analyst")
    t = api.target("demo-web")
    r = api.c.post("/api/v1/jobs", json={"target_id": t["id"]})  # no CSRF header
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    assert api.post("/auth/logout").status_code == 200
    assert api.get("/targets").status_code == 401


def test_login_throttle(api):
    for _ in range(5):
        assert api.c.post("/api/v1/auth/login", json={"email": "analyst@aegis.local", "password": "wrong"}).status_code == 401
    r = api.c.post("/api/v1/auth/login", json={"email": "analyst@aegis.local", "password": "wrong"})
    assert r.status_code == 429


def test_report_exports(analyst):
    c, _ = full_flow(analyst, "demo-web")
    rid = c["case"]["retest_run_id"]
    h = analyst.c.get(f"/api/v1/reports/runs/{rid}.html")
    assert h.status_code == 200 and "SIMULATED" in h.text and "Verifier checks" in h.text
    assert "default-src 'none'" in h.headers["content-security-policy"]
    j = analyst.get(f"/reports/runs/{rid}.json").json()
    assert j["verifier"]["passed"] and j["manifest_signature"]
    ch = analyst.c.get(f"/api/v1/reports/cases/{c['case']['id']}.html")
    assert "VERIFIED" in ch.text and "Before vs. after" in ch.text
    assert analyst.get("/reports/workspace.html").status_code == 200


def test_reset_demo_keeps_audit(admin):
    t = admin.target("demo-web")
    admin.post("/jobs", json={"target_id": t["id"]})
    run_all()
    assert admin.post("/settings/reset-demo", json={"confirm": "wrong"}).status_code == 422
    r = admin.post("/settings/reset-demo", json={"confirm": "RESET DEMO DATA"}).json()
    assert r["deleted"]["runs"] == 1
    assert admin.get("/findings").json()["total"] == 0
    assert admin.get("/audit/verify").json()["ok"]


def test_config_export_has_no_secrets(admin):
    r = admin.get("/settings/export").text
    assert "password_hash" not in r and "argon2" not in r


def test_user_admin_rules(admin):
    users = admin.get("/users").json()
    me = next(u for u in users if u["email"] == "admin@aegis.local")
    assert admin.patch(f"/users/{me['id']}", json={"role": "viewer"}).status_code == 409
    r = admin.post("/users", json={"email": "new@x.org", "display_name": "N", "role": "viewer", "password": "short"})
    assert r.status_code == 422
    r = admin.post("/users", json={"email": "new@x.org", "display_name": "N", "role": "viewer", "password": "a-long-enough-pass"})
    assert r.status_code == 201 and "password" not in r.text
    assert admin.get("/users").status_code == 200


@pytest.mark.parametrize("path", ["/targets/nope", "/runs/nope", "/findings/nope", "/incidents/nope", "/jobs/nope", "/purple/cases/nope"])
def test_404s_are_structured(analyst, path):
    r = analyst.get(path)
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found" and r.json()["request_id"]


def test_triage_persists_across_reruns(analyst):
    t = analyst.target("demo-web")
    analyst.post("/jobs", json={"target_id": t["id"]})
    run_all()
    f = analyst.get("/findings").json()["items"][0]
    assert analyst.patch(f"/findings/{f['id']}", json={"status": "accepted", "note": "known"}).status_code == 200
    analyst.post("/jobs", json={"target_id": t["id"]})
    run_all()
    again = analyst.get(f"/findings/{f['id']}").json()
    assert again["status"] == "accepted" and again["version"] == 2 and len(analyst.get("/findings").json()["items"]) == 4


def test_job_progress_is_persisted(analyst):
    t = analyst.target("demo-web")
    job = analyst.post("/jobs", json={"target_id": t["id"]}).json()
    run_all()
    j = analyst.get(f"/jobs/{job['id']}").json()
    assert j["status"] == "succeeded" and j["progress_total"] == 4 and j["progress_done"] == 4


def test_load_sanity_fixture_traffic_only(analyst):
    """30 sequential fixture runs complete quickly and leave findings deduplicated (no external targets)."""
    import time
    t = analyst.target("demo-web")
    start = time.perf_counter()
    for _ in range(30):
        analyst.post("/jobs", json={"target_id": t["id"]})
        assert run_all() == 1
    elapsed = time.perf_counter() - start
    assert elapsed < 60
    assert analyst.get("/findings").json()["total"] == 4  # dedupe by stable id
    assert analyst.get("/runs?limit=200").json()["total"] == 30


def test_audit_chain_survives_concurrent_writers(app_db):
    """Regression: API and worker processes both append audit rows; the chain must never fork."""
    import threading

    from aegis import audit

    errors: list[Exception] = []

    def writer(n: int) -> None:
        try:
            for i in range(15):
                with dbm.session_scope() as db:
                    audit.record(db, f"writer-{n}", "test.concurrent", "ok", None, {"i": i})
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=writer, args=(n,)) for n in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors, errors[:1]
    with dbm.session_scope() as db:
        v = audit.verify(db)
    assert v["ok"] and v["checked"] >= 90
