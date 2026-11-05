"""Reproducible reports grounded in stored facts. HTML is print-ready (Save as PDF from the browser)."""
from __future__ import annotations

from html import escape as e
from typing import Any

from .models import PurpleCase, Run, Target

CSS = """
:root{color-scheme:light}body{font:14px/1.55 Inter,system-ui,Segoe UI,sans-serif;color:#13233a;max-width:880px;margin:2rem auto;padding:0 1.25rem}
h1{font-size:1.7rem;margin:.2rem 0}h2{font-size:1.15rem;border-bottom:1px solid #d6dee8;padding-bottom:.3rem;margin-top:2rem}
h3{font-size:1rem;margin:1.2rem 0 .2rem}.chip{display:inline-block;font:600 .7rem/1 system-ui;letter-spacing:.04em;padding:.25rem .5rem;border-radius:99px;background:#e6f2f1;color:#0b5f5a;border:1px solid #b5dad7}
.sev-critical,.sev-high{background:#fde8e6;color:#9b1c12;border-color:#f5b7b1}.sev-medium{background:#fff3dc;color:#8a5a00;border-color:#f0d08a}.sev-low,.sev-info{background:#eaf0f8;color:#2b4c7e;border-color:#c3d3ea}
table{border-collapse:collapse;width:100%;margin:.6rem 0}th,td{border:1px solid #d6dee8;padding:.4rem .55rem;text-align:left;vertical-align:top}th{background:#f3f6fa}
.meta{color:#4b5d75;font-size:.85rem}.box{border:1px solid #d6dee8;border-radius:8px;padding:.7rem 1rem;margin:.8rem 0;background:#fafcfe}
code,pre{font:12px ui-monospace,Consolas,monospace;background:#f1f4f8;padding:.1rem .3rem;border-radius:4px;overflow-wrap:anywhere}
.good{color:#0b6b3a;font-weight:600}.bad{color:#9b1c12;font-weight:600}.foot{margin-top:2.5rem;font-size:.8rem;color:#4b5d75;border-top:1px solid #d6dee8;padding-top:.8rem}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}.box,tr{break-inside:avoid}}
"""

DISCLAIMER = ("All evidence in this report is <b>SIMULATED</b> against AegisAI-owned fixtures. It demonstrates the workflow and "
              "is not an assessment of any real system, a certification, or a statement of real-world detection accuracy.")


def _head(title: str) -> str:
    return (f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{e(title)}</title><style>{CSS}</style></head><body>")


def _finding_block(f: dict[str, Any]) -> str:
    ev = "".join(f"<li><code>{e(x)}</code></li>" for x in f.get("observed", []))
    inf = "".join(f"<li>{e(x)}</li>" for x in f.get("inferred", []))
    return (f"<h3>{e(f['title'])} <span class='chip sev-{e(f['severity'])}'>{e(f['severity'].upper())}</span> "
            f"<span class='chip'>{e(f.get('evidence_kind', 'SIMULATED'))}</span></h3>"
            f"<div class='box'><p><b>What happened?</b> {e(f['what'])}</p><p><b>Why does it matter?</b> {e(f['why'])}</p>"
            f"<p><b>How do I fix it?</b> {e(f['fix'])}</p><p><b>How will we know it worked?</b> {e(f['verify'])}</p>"
            f"<p class='meta'>Observed:</p><ul>{ev or '<li>none</li>'}</ul>"
            + (f"<p class='meta'>Inferred (hypothesis, not confirmed):</p><ul>{inf}</ul>" if inf else "") + "</div>")


def run_report_html(run: Run, target: Target, verifier: dict[str, Any]) -> str:
    r = run.result
    m = run.metrics
    rows = "".join(f"<tr><td>{e(str(k))}</td><td>{e(str(v))}</td></tr>" for k, v in m.items() if not isinstance(v, (dict, list)))
    steps = "".join(f"<tr><td>{e(s['title'])}</td><td>{e(s['action'])}</td><td>{'allowed' if s['policy']['allowed'] else 'DENIED'} "
                    f"({e(s['policy']['code'])})</td></tr>" for s in run.steps)
    fnd = "".join(_finding_block(f) for f in r.get("findings", [])) or "<p>No findings in this run.</p>"
    dets = "".join(f"<tr><td>{e(d['rule_id'])} v{d.get('rule_version', 1)}</td><td>{e(d['title'])}</td><td>"
                   f"{'true positive' if d.get('true_positive') else 'false positive'}</td><td>{e(d.get('note', ''))}</td></tr>"
                   for d in r.get("detections", []))
    checks = "".join(f"<tr><td>{e(c['check'])}</td><td>{'PASS' if c['passed'] else 'FAIL'}</td></tr>" for c in verifier["checks"])
    h = _head(f"AegisAI run report {run.id[:8]}")
    h += (f"<span class='chip'>SIMULATED</span> <span class='chip'>{e(run.phase.upper())}</span><h1>{e(target.name)}</h1>"
          f"<p class='meta'>Scenario {e(run.scenario_id)} v{e(run.scenario_version)} · Run {e(run.id)} · fixture hash <code>{e(run.state_hash[:16])}</code></p>"
          f"<div class='box'>{DISCLAIMER}</div><h2>Summary metrics</h2><table>{rows}</table><h2>Findings</h2>{fnd}")
    if dets:
        h += f"<h2>Blue-team detections</h2><table><tr><th>Rule</th><th>Alert</th><th>Result</th><th>Note</th></tr>{dets}</table>"
    h += (f"<h2>Policy trail</h2><table><tr><th>Step</th><th>Action</th><th>Decision</th></tr>{steps}</table>"
          f"<h2>Verifier checks</h2><table>{checks}</table><h2>Reproducibility</h2>"
          f"<p>Manifest signature (HMAC-SHA256, workspace key): <code>{e(run.manifest_signature)}</code></p>"
          f"<p>Result hash: <code>{e(str(run.manifest.get('result_hash')))}</code></p>"
          f"<div class='foot'>Generated by AegisAI (provisional name). Re-running scenario v{e(run.scenario_version)} on the same fixture yields the same result hash.</div></body></html>")
    return h


def case_report_html(case: PurpleCase, target: Target, base: Run | None, retest: Run | None) -> str:
    cmp_ = case.comparison or {}
    h = _head(f"AegisAI verification report {case.id[:8]}")
    h += (f"<span class='chip'>SIMULATED</span> <span class='chip'>PURPLE TEAM</span><h1>Verify fix: {e(target.name)}</h1>"
          f"<p class='meta'>Case {e(case.id)} · Scenario {e(case.scenario_id)} v{e(case.scenario_version)} · Status <b>{e(case.status)}</b></p>"
          f"<div class='box'>{DISCLAIMER}</div>")
    if not cmp_:
        h += "<p>No retest has been completed yet, so there is no before/after comparison.</p>"
    else:
        verdict = cmp_["verdict"]
        cls = "good" if verdict == "verified" else "bad"
        h += f"<h2>Verdict</h2><p class='{cls}'>{e(verdict.upper())}</p>"
        rows = ""
        for r in cmp_["rows"]:
            mark = "✔" if r["improved"] else ("✖" if r["improved"] is False else "–")
            rows += f"<tr><td>{e(r['label'])}</td><td>{e(str(r['before']))}</td><td>{e(str(r['after']))}</td><td>{mark}</td></tr>"
        h += f"<h2>Before vs. after (same scenario version)</h2><table><tr><th>Measure</th><th>Before</th><th>After</th><th></th></tr>{rows}</table>"
        for title, key in (("Resolved findings", "resolved_titles"), ("Remaining findings", "remaining_titles"), ("New findings", "new_titles")):
            items = cmp_.get(key) or {}
            if items:
                h += f"<h3>{title}</h3><ul>" + "".join(f"<li><code>{e(k)}</code> {e(v)}</li>" for k, v in items.items()) + "</ul>"
        for n in cmp_.get("regression_notes", []):
            h += f"<p class='bad'>{e(n)}</p>"
    for label, run in (("Baseline", base), ("Retest", retest)):
        if run:
            h += (f"<h2>{label} run</h2><p class='meta'>Run {e(run.id)} · fixture hash <code>{e(run.state_hash[:16])}</code> · "
                  f"signature <code>{e(run.manifest_signature[:24])}…</code></p>")
            h += "".join(_finding_block(f) for f in run.result.get("findings", [])) or "<p>No findings.</p>"
    h += "<div class='foot'>Generated by AegisAI. Metrics are computed from stored run results, not by a language model.</div></body></html>"
    return h


def workspace_report_html(data: dict[str, Any]) -> str:
    h = _head("AegisAI executive summary")
    h += ("<span class='chip'>SIMULATED</span><h1>Executive summary</h1>"
          f"<div class='box'>{DISCLAIMER}</div>"
          f"<table><tr><th>Open findings</th><td>{data['open']}</td></tr><tr><th>Verified fixed (simulated)</th><td>{data['fixed']}</td></tr>"
          f"<tr><th>Open incidents</th><td>{data['incidents']}</td></tr><tr><th>Verified purple-team cases</th><td>{data['verified_cases']}</td></tr></table>"
          "<h2>Open findings by priority</h2>")
    for f in data["top"]:
        h += f"<p><span class='chip sev-{e(f['severity'])}'>{e(f['severity'].upper())}</span> {e(f['plain_title'])} <span class='meta'>({e(f['stable_id'])})</span></p>"
    h += ("<h2>Method</h2><p>Severity is assigned by transparent AegisAI rules (critical, high, medium, low). No CVSS score is claimed. "
          "'Exposure points' sum severity weights (critical 10, high 7, medium 4, low 1) and are only comparable within this tool.</p>"
          "</body></html>")
    return h
