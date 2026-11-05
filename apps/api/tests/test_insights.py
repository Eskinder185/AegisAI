"""Derived views must reflect stored records only and keep hypotheses distinct from observations."""
from .conftest import run_all
from .test_api_workflows import full_flow


def _run(api, slug):
    t = api.target(slug)
    api.post("/jobs", json={"target_id": t["id"]})
    run_all()
    return api.get("/runs?limit=1").json()["items"][0]["id"]


def test_agents_reflect_real_execution_and_never_invent_usage(analyst):
    empty = analyst.get("/agents").json()
    assert all(a["executions"] == 0 and a["history"] == [] for a in empty["agents"])
    _run(analyst, "demo-web")
    d = analyst.get("/agents").json()
    red = next(a for a in d["agents"] if a["name"] == "Red Analyst")
    blue = next(a for a in d["agents"] if a["name"] == "Blue Analyst")
    assert red["executions"] == 1 and blue["executions"] == 1 and blue["allowed_tools"] == ["log_replay"]
    assert all(a["tokens"] is None and a["cost"] is None for a in d["agents"])
    assert any(s["decision"] == "allowed" for s in red["history"][0]["steps"])
    assert d["controls"]["pause"] is False
    assert d["agent_under_test"]["guardrails"]


def test_graph_separates_observed_from_hypothesis(analyst):
    rid = _run(analyst, "demo-aws-iam")
    g = analyst.get(f"/runs/{rid}/graph").json()
    by = {n["id"]: n for n in g["nodes"]}
    hyp = [n for n in g["nodes"] if n["status"] == "hypothetical"]
    assert hyp and all(n["evidence_kind"] == "INFERRED" for n in hyp)
    # exposure paths are never marked confirmed
    path_edges = [e for e in g["edges"] if "possible exposure path" in e["label"]]
    assert path_edges and all(e["confirmed"] is False for e in path_edges)
    for e in g["edges"]:
        assert e["from"] in by and e["to"] in by
    assert g["label"] == "SIMULATED" and "never demonstrates" in g["legend"]
    vul = next(n for n in g["nodes"] if n["type"] == "vulnerability" and n["status"] == "observed")
    assert vul["evidence_ids"] and vul["fix"]


def test_graph_shows_controls_after_fix(analyst):
    c, _ = full_flow(analyst, "demo-aws-iam")
    g = analyst.get(f"/runs/{c['case']['retest_run_id']}/graph").json()
    assert any(n["type"] == "control" for n in g["nodes"]) and not any(n["type"] == "vulnerability" for n in g["nodes"])


def test_replay_is_reconstruction_ordered_and_marks_detection(analyst):
    rid = _run(analyst, "demo-auth-logs")
    r = analyst.get(f"/runs/{rid}/replay").json()
    ts = [f["t"] for f in r["frames"]]
    assert ts == sorted(ts) and r["frames"][0]["i"] == 0
    dets = [f for f in r["frames"] if f["kind"] == "detection"]
    assert dets and "Nothing is being executed" in r["note"]
    first_attack_t = min(f["t"] for f in r["frames"] if f.get("tag") == "brute-force-admin")
    assert dets[0]["t"] >= first_attack_t
    obs = analyst.get(f"/runs/{_run(analyst, 'demo-aws-iam')}/replay").json()
    assert obs["frames"][0]["kind"] == "observation"


def test_notifications_and_search_are_derived_and_bounded(analyst):
    assert analyst.get("/notifications").json()["items"] == []
    _run(analyst, "demo-web")
    n = analyst.get("/notifications").json()["items"]
    assert any(i["title"].startswith("Job succeeded") for i in n)
    assert not any("finding open" in i["title"] for i in n)  # web findings are medium: no alert-level noise
    _run(analyst, "demo-aws-iam")
    assert any(i["title"] == "Critical finding open" for i in analyst.get("/notifications").json()["items"])
    s = analyst.get("/search?q=Content-Security").json()["results"]
    assert s and s[0]["type"] == "Finding" and s[0]["link"].startswith("/app/findings/")
    assert analyst.get("/search?q=a").json()["results"] == []
    assert len(analyst.get("/search?q=" + "x" * 500).json()["results"]) == 0


def test_insight_endpoints_require_auth_and_404_cleanly(api):
    for p in ("/agents", "/notifications", "/search?q=abc", "/runs/x/graph", "/runs/x/replay"):
        assert api.get(p).status_code == 401
    api.login("viewer")
    assert api.get("/runs/nope/graph").status_code == 404
    assert api.get("/agents").status_code == 200
