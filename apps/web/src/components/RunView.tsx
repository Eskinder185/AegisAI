import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Label, Sev, fmtTime } from './ui'
import { useViewMode } from '../lib/app-context'

export function QA({ f }: { f: any }) {
  return (
    <div className="qa">
      <h4>What happened?</h4><p>{f.what}</p>
      <h4>Why does it matter?</h4><p>{f.why}</p>
      <h4>How do I fix it?</h4><p>{f.fix}</p>
      <h4>How will we know it worked?</h4><p>{f.verify}</p>
    </div>
  )
}

export function FindingCard({ f, link }: { f: any; link?: boolean }) {
  const { advanced } = useViewMode()
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <article className="card tight" aria-labelledby={id}>
      <div className="row between">
        <h3 id={id} style={{ margin: 0 }}>{f.plain_title}</h3>
        <span className="row"><Sev s={f.severity} /><Label k={f.evidence_kind} />{f.verification && f.verification !== 'UNVERIFIED' && <Label k={f.verification} />}</span>
      </div>
      <p className="small muted mt mb0">{advanced ? f.title : 'Technical name'}: {f.title}{f.stable_id && <> · <code>{f.stable_id}</code></>}</p>
      {f.observed?.[0] && <p className="small mt mb0"><strong>Evidence:</strong> {f.observed[0]}</p>}
      <div className="mt" />
      <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Show what / why / fix'}</button>
      {link && f.stable_id && <Link className="btn sm ghost" to={`/app/findings/${f.id}`}>Open finding</Link>}
      {open && (
        <div className="mt">
          <QA f={f} />
          {f.observed?.length > 0 && (<><h4 className="xs muted" style={{ textTransform: 'uppercase' }}>Observed</h4><ul className="small">{f.observed.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul></>)}
          {f.inferred?.length > 0 && (<><h4 className="xs muted" style={{ textTransform: 'uppercase' }}>Inferred — a hypothesis, not confirmed</h4><ul className="small">{f.inferred.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul></>)}
          {advanced && f.evidence_refs?.length > 0 && <p className="xs muted">Evidence: {f.evidence_refs.map((e: string) => <code key={e} style={{ marginRight: 4 }}>{e}</code>)}</p>}
          {advanced && f.mapping?.length > 0 && <p className="xs muted">Context labels: {f.mapping.join('; ')}</p>}
        </div>
      )}
    </article>
  )
}

function Metric({ v, l }: { v: any; l: string }) {
  return <div className="stat"><div className="v">{v ?? '—'}</div><div className="l">{l}</div></div>
}

export default function RunView({ run, verify }: { run: any; verify?: any }) {
  const { advanced } = useViewMode()
  const r = run.result ?? {}
  const m = run.metrics ?? {}
  if (r.aborted) {
    return <div className="callout danger" role="alert"><strong>Run {r.aborted}.</strong> {r.reason}<p className="xs mb0 mt">Policy trail below shows the exact step that was stopped.</p><Trail steps={run.steps} /></div>
  }
  const tiles: [string, string][] = ([
    ['findings_total', 'Findings'], ['exposure_points', 'Exposure points'], ['detections_triggered', 'Detections'],
    ['recall', 'Recall (synthetic data)'], ['precision', 'Precision (synthetic data)'], ['mean_time_to_detect_seconds', 'Mean time to detect (s, simulated)'],
    ['tests_passed', 'Guardrail tests passed'], ['unsafe_tool_calls_executed', 'Unsafe tool calls executed'], ['policy_denials', 'Policy-gate denials'],
    ['required_access_working', 'Required access still works'], ['risky_access_blocked', 'Risky access blocked'],
  ] as [string, string][]).filter(([k]) => m[k] !== undefined)
  return (
    <div className="col">
      <div className="grid c4">{tiles.map(([k, l]) => <Metric key={k} v={String(m[k])} l={l} />)}</div>
      {m.dataset_note && <p className="xs muted">{m.dataset_note}</p>}
      {m.sample_size_note && <p className="xs muted">{m.sample_size_note}</p>}

      <section aria-labelledby="rv-f">
        <h3 id="rv-f">What the red-team assistant found</h3>
        {r.findings?.length ? <div className="col">{r.findings.map((f: any) => <FindingCard key={f.rule_id + f.location} f={f} />)}</div>
          : <div className="callout ok">No findings in this run. That means these specific checks did not find a problem in the fixture — not that nothing could be wrong.</div>}
      </section>

      {r.campaigns && (
        <section aria-labelledby="rv-c">
          <h3 id="rv-c">Attack campaigns in the synthetic data</h3>
          <div className="table-wrap"><table><thead><tr><th>Campaign</th><th>Detected?</th><th>Time to detect</th><th>Before attacker succeeded?</th></tr></thead>
            <tbody>{r.campaigns.map((c: any) => (
              <tr key={c.campaign}><td><strong>{c.title}</strong><div className="xs muted">{c.plain}</div></td>
                <td>{c.detected ? <span className="good">Yes — {c.rule}</span> : <span className="bad">Missed</span>}</td>
                <td>{c.latency_seconds != null ? `${c.latency_seconds}s (simulated clock)` : '—'}</td>
                <td>{c.detected ? (c.alert_before_success ? 'Yes' : 'No') : '—'}</td></tr>))}</tbody></table></div>
        </section>
      )}

      <section aria-labelledby="rv-d">
        <h3 id="rv-d">What the blue-team assistant saw</h3>
        {r.detections?.length ? (
          <div className="table-wrap"><table><thead><tr><th>Rule</th><th>Alert</th><th>Assessment</th><th>Evidence</th></tr></thead>
            <tbody>{r.detections.map((d: any, i: number) => (
              <tr key={i}><td><code>{d.rule_id}</code> v{d.rule_version}</td><td>{d.title}</td>
                <td>{d.rule_id.startsWith('GATE-') ? <span className="chip ok">Blocked</span> : d.true_positive ? <span className="chip ok">True positive</span> : <span className="chip warn">False positive</span>}<div className="xs muted">{d.note}</div></td>
                <td className="small">{d.event_ids?.length ? `${d.event_ids.length} events` : '—'}</td></tr>))}</tbody></table></div>
        ) : <p className="muted">No detections fired in this run.</p>}
      </section>

      {r.access_checks && (
        <section aria-labelledby="rv-a">
          <h3 id="rv-a">Access simulation (fixture behaviour)</h3>
          <div className="table-wrap"><table><thead><tr><th>Action</th><th>Purpose</th><th>Expected</th><th>Actual</th></tr></thead>
            <tbody>{r.access_checks.map((c: any, i: number) => (
              <tr key={i}><td><code>{c.action}</code></td><td>{c.purpose}</td><td>{c.expected}</td><td className={c.ok ? 'good' : 'bad'}>{c.actual} {c.ok ? '✓' : '✗ mismatch'}</td></tr>))}</tbody></table></div>
        </section>
      )}

      {r.guardrail_cases && (
        <section aria-labelledby="rv-g">
          <h3 id="rv-g">Guardrail test cases</h3>
          <div className="col">{r.guardrail_cases.map((c: any) => <CaseResult key={c.case_id} c={c} />)}</div>
        </section>
      )}

      {advanced && (
        <section aria-labelledby="rv-o">
          <h3 id="rv-o">Observations</h3>
          <div className="table-wrap"><table><thead><tr><th>Id</th><th>Method</th><th>Observation</th><th>Conf.</th></tr></thead>
            <tbody>{r.observations?.map((o: any) => <tr key={o.id}><td><code>{o.id}</code></td><td className="small">{o.method}</td><td className="small">{o.text}</td><td>{o.confidence}</td></tr>)}</tbody></table></div>
        </section>
      )}

      <section aria-labelledby="rv-t">
        <h3 id="rv-t">Policy trail</h3>
        <p className="small muted">Each step was checked by the policy engine immediately before it ran.</p>
        <Trail steps={run.steps} />
      </section>

      {verify && (
        <section aria-labelledby="rv-v">
          <h3 id="rv-v">Verifier checks</h3>
          <ul className="mb0">{verify.checks.map((c: any) => <li key={c.check}>{c.passed ? <span className="good">✓</span> : <span className="bad">✗</span>} {c.check}</li>)}</ul>
        </section>
      )}
      <p className="xs muted">Run <code>{run.id}</code> · scenario {run.scenario_id} v{run.scenario_version} · fixture hash <code>{run.state_hash?.slice(0, 12)}</code> · {fmtTime(run.started_at)}</p>
    </div>
  )
}

export function Trail({ steps }: { steps: any[] }) {
  return (
    <div className="table-wrap"><table><thead><tr><th>Step</th><th>Action</th><th>Destination</th><th>Policy decision</th></tr></thead>
      <tbody>{steps.map((s) => (
        <tr key={s.step}><td>{s.title}</td><td><code>{s.action}</code></td><td className="small mono">{s.destination ?? '—'}</td>
          <td>{s.policy.allowed ? <span className="chip ok">allowed</span> : <span className="chip danger">denied</span>} <span className="xs muted">{s.policy.reason}</span></td></tr>))}</tbody></table></div>
  )
}

export function CaseResult({ c }: { c: any }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="card tight">
      <div className="row between">
        <div><strong>{c.case_id}</strong> — {c.title}<div className="xs muted">{c.plain}</div></div>
        <span className="row"><span className={`chip ${c.passed ? 'ok' : 'danger'}`}>{c.passed ? 'Pass' : 'Fail'}</span><span className="chip">confidence {c.confidence}</span></span>
      </div>
      <p className="small mt mb0"><strong>Evaluator rationale:</strong> {c.rationale}</p>
      <button type="button" className="btn sm mt" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide trace' : 'Show input, trace & output'}</button>
      {open && (
        <div className="mt small">
          <dl className="kv">
            <dt>User input</dt><dd>{c.provenance.user_input}</dd>
            <dt>Retrieved document</dt><dd><code>{c.provenance.retrieved_document || '—'}</code></dd>
            <dt>Tool result</dt><dd><code>{c.provenance.tool_result || '—'}</code></dd>
            <dt>Expected</dt><dd><code>{JSON.stringify(c.expected)}</code></dd>
            <dt>Tools executed</dt><dd>{c.observed.executed_tools.join(', ') || 'none'}</dd>
            <dt>Final answer</dt><dd>{c.observed.answer}</dd>
            <dt>Seed</dt><dd>{c.seed}</dd>
          </dl>
          <h4 className="xs muted mt" style={{ textTransform: 'uppercase' }}>Tool-call trace</h4>
          {c.trace.length === 0 ? <p className="muted">No gate events.</p> : c.trace.map((t: any, i: number) => (
            <div key={i} className={`trace ${t.event}`}><strong>{t.event.replace(/_/g, ' ')}</strong>{t.tool && <> · <code>{t.tool}</code></>}{t.gate && <> · gate <code>{t.gate}</code></>}{t.channel && <> · from {t.channel}</>}{t.detail && <div className="muted">{t.detail}</div>}</div>
          ))}
        </div>
      )}
    </article>
  )
}
