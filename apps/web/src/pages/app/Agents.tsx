import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Label, LoadingBlock, PageHead, Status, fmtTime } from '../../components/ui'
import { CopyId } from '../../components/ShellTools'
import { get } from '../../lib/api'
import { useViewMode } from '../../lib/app-context'

export default function Agents() {
  const q = useQuery({ queryKey: ['agents'], queryFn: () => get('/agents'), refetchInterval: 5000 })
  const { advanced } = useViewMode()
  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const d = q.data
  const t = d.agent_under_test
  return (
    <>
      <PageHead title="AI Agents">The assistants that work on your assessments, what each is allowed to do, and exactly what it did. Everything shown comes from execution records — nothing is inferred about hidden reasoning.</PageHead>
      <div className="callout ai small">
        <Label k={d.model.state === 'UNCONFIGURED' ? 'UNCONFIGURED' : 'READY'} /> <strong>Model provider: {d.model.provider}.</strong> {d.model.detail} The four roles below are <strong>deterministic</strong> and work without any model, so no token or cost figures exist.
      </div>
      <div className="grid c2 mt">
        {d.agents.map((a: any) => (
          <article key={a.id} className="card agent-card" aria-labelledby={`ag-${a.id}`}>
            <div className="row between"><h2 id={`ag-${a.id}`} style={{ fontSize: '1.2rem', margin: 0 }}>{a.name}</h2>
              <span className="row"><span className="chip agent">{a.type.split(' (')[0]}</span><Status s={a.status} /></span></div>
            <p className="muted mt">{a.responsibility}</p>
            <dl className="kv small">
              <dt>Current task</dt><dd>{a.current_task ?? 'None'}</dd>
              <dt>Last activity</dt><dd>{fmtTime(a.last_activity)}</dd>
              <dt>Executions</dt><dd>{a.executions} · {a.evidence_count} observation(s) recorded</dd>
              <dt>Allowed tools</dt><dd>{a.allowed_tools.length ? a.allowed_tools.map((x: string) => <code key={x} style={{ marginRight: 4 }}>{x}</code>) : 'None (read-only over stored data)'}</dd>
              <dt>Human approval</dt><dd>{a.approval}</dd>
              <dt>Tokens / cost</dt><dd className="muted">{a.usage_note}</dd>
            </dl>
            <details className="mt"><summary><strong>Execution history</strong> ({a.history.length})</summary>
              {a.history.length === 0 ? <p className="muted small mt">No executions yet. <Link to="/app/verify">Start a demo</Link>.</p> : a.history.map((h: any) => (
                <div key={h.run_id + a.id} className="card flat tight mt">
                  <div className="row between"><span><Link to={`/app/assessments/runs/${h.run_id}`}>{h.scenario}</Link> <span className="xs muted">v{h.version} · {h.phase}</span></span><span className="xs muted">{fmtTime(h.at)}</span></div>
                  <ol className="small" style={{ margin: '.5rem 0' }}>{h.steps.map((s: any, i: number) => <li key={i}>{s.title} <code>{s.action}</code> <span className={`chip ${s.decision === 'denied' || s.decision === 'failed' ? 'danger' : 'ok'}`}>{s.decision}</span></li>)}</ol>
                  <p className="small mb0"><strong>Outcome:</strong> {h.outcome} {advanced && <CopyId id={h.run_id} label="run id" />}</p>
                </div>))}
            </details>
          </article>))}
      </div>

      <h2 className="mt2">Agent under test</h2>
      {!t ? <EmptyState title="No agent configured" /> : (
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>{t.name}</h3><span className="row"><span className="chip ai">mock agent</span><Label k="SIMULATED" /></span></div>
          <p className="muted small mt">{t.note}</p>
          <div className="grid c2">
            <div><h4 className="xs muted" style={{ textTransform: 'uppercase' }}>Permission scope</h4>
              <ul className="small">{Object.entries(t.all_tools as Record<string, any>).map(([name, spec]) => (
                <li key={name}><code>{name}</code> — {spec.risk} risk · {t.allowed_tools.includes(name) ? <span className="good">permitted</span> : <span className="bad">not permitted</span>}</li>))}</ul></div>
            <div><h4 className="xs muted" style={{ textTransform: 'uppercase' }}>Guardrails (current fixture state)</h4>
              <ul className="small">{Object.entries(t.guardrails as Record<string, boolean>).map(([k, v]) => <li key={k}><code>{k}</code> <span className={`chip ${v ? 'ok' : 'danger'}`}>{v ? 'on' : 'off'}</span></li>)}</ul></div>
          </div>
          <Link className="btn" to="/app/ai-security">Open AI Security lab</Link>
        </div>)}
      <div className="callout mt small"><strong>Controls.</strong> {d.controls.note} Approvals are granted per change inside <Link to="/app/verify">Verify Fixes</Link>. Jobs can be cancelled from <Link to="/app/assessments">Assessments</Link>.</div>
    </>
  )
}
