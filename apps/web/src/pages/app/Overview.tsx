import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Btn, ErrorState, Label, LoadingBlock, Sev, SevBar, Status, fmtTime } from '../../components/ui'
import { errMsg, get, post } from '../../lib/api'
import { useAuth, useToast, useViewMode } from '../../lib/app-context'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Overview() {
  const { user, can } = useAuth()
  const { advanced } = useViewMode()
  const nav = useNavigate()
  const { push } = useToast()
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard'), refetchInterval: 6000 })
  const st = useQuery({ queryKey: ['status'], queryFn: () => get('/system/status') })
  const ag = useQuery({ queryKey: ['agents'], queryFn: () => get('/agents'), refetchInterval: 6000 })
  const nt = useQuery({ queryKey: ['notifications'], queryFn: () => get('/notifications'), refetchInterval: 8000 })
  const targets = useQuery({ queryKey: ['targets'], queryFn: () => get('/targets') })
  const demo = useMutation({
    mutationFn: async () => post('/purple/cases', { target_id: targets.data.find((x: any) => x.slug === 'demo-web').id }),
    onSuccess: (r) => nav(`/app/verify/${r.case.id}`),
    onError: (e) => push(errMsg(e), true),
  })
  if (q.isLoading) return <LoadingBlock label="Loading command center" />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const d = q.data
  const s = st.data
  const top = d.findings.top[0]
  const started = d.scenarios.some((x: any) => x.case_id)

  // Recommended next action: derived only from stored state and the user's permissions.
  let next: { eyebrow: string; title: string; body: string; action: React.ReactNode }
  if (!started) {
    next = { eyebrow: 'Recommended next step', title: 'Run your first demo',
      body: 'Start the web-hardening scenario: a bounded check finds a gap in a fixture, you approve a fixture-only fix, and a re-run proves it.',
      action: <Btn variant="primary" size="lg" disabled={!can('analyst') || demo.isPending || !targets.data} onClick={() => demo.mutate()}>{demo.isPending ? 'Starting…' : 'Run safe demo'}</Btn> }
  } else if (d.pending_approvals > 0) {
    next = { eyebrow: 'Needs a decision', title: `${d.pending_approvals} approval${d.pending_approvals > 1 ? 's' : ''} waiting`,
      body: 'An approval was granted but the change has not been applied. Approvals expire after 15 minutes.', action: <Link className="btn primary" to="/app/verify">Open Verify Fixes</Link> }
  } else if (top) {
    next = { eyebrow: `Highest priority · ${top.severity}`, title: top.plain_title,
      body: 'Review the evidence, then take the fix through approval and re-run.', action: <Link className="btn primary" to={`/app/findings/${top.id}`}>Review finding</Link> }
  } else {
    next = { eyebrow: 'All clear in the lab', title: 'No open findings',
      body: 'Every finding from your runs is verified fixed in the simulation. Export the evidence, or start another scenario.', action: <Link className="btn primary" to="/app/reports">Open reports</Link> }
  }
  const activity = (nt.data?.items ?? []).slice(0, 6)
  const dotCls = (l: string) => (l === 'danger' ? 'bad' : l === 'warn' ? 'warn' : l === 'ok' ? 'ok' : '')
  return (
    <>
      <div className="cc-hero">
        <div>
          <p className="eyebrow">Command center</p>
          <h1>{greeting()}, {user?.display_name.split(' ')[0]}.</h1>
          <p className="muted" style={{ maxWidth: '52ch' }}>What is in scope, what was found, and what has been proven. {advanced ? '' : 'Everything here comes from practice fixtures and is labelled Simulated.'}</p>
          <div className="row mt2" style={{ gap: 0 }}>
            <div className="stat"><div className="v">{d.targets.runnable}</div><div className="l">lab targets</div></div>
            <div className="stat"><div className="v">{d.findings.open}</div><div className="l">open findings</div></div>
            <div className="stat"><div className="v">{d.findings.verified_fixed}</div><div className="l">verified fixed</div></div>
            <div className="stat"><div className="v">{d.incidents.open}</div><div className="l">open incidents</div></div>
          </div>
        </div>
        <div className="next-action">
          <span className="eyebrow">{next.eyebrow}</span>
          <h2 style={{ fontSize: '1.4rem', marginBottom: 8 }}>{next.title}</h2>
          <p className="muted small">{next.body}</p>
          {next.action}
          {!can('analyst') && <p className="xs muted mt mb0">Viewer role: exploring only.</p>}
        </div>
      </div>

      <div className="cc-grid">
        <div>
          <p className="section-title">Guided journeys</p>
          <div>
            {d.scenarios.map((x: any) => (
              <div key={x.scenario_id} className="journey">
                <span className="n">0{x.demo_no}</span>
                <div><strong style={{ fontWeight: 550 }}>{x.title}</strong></div>
                <span className="row"><Status s={x.status} /><Link className="btn sm" to={x.case_id ? `/app/verify/${x.case_id}` : '/app/verify'}>{x.case_id ? 'Open' : 'Start'}</Link></span>
              </div>))}
          </div>

          <p className="section-title" style={{ marginTop: 40 }}>Recent activity <span style={{ textTransform: 'none', letterSpacing: 0 }}>· from stored jobs, approvals and findings</span></p>
          {activity.length === 0 ? <p className="muted small">Nothing yet. Start a journey to see activity here.</p> : (
            <div className="rail">{activity.map((i: any) => (
              <Link key={i.id} to={i.link} className="rail-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className={`dot ${dotCls(i.level)}`} /><div><div style={{ fontWeight: 520 }}>{i.title}</div>{i.detail && <div className="small muted">{i.detail}</div>}</div><span className="xs muted">{fmtTime(i.at)}</span>
              </Link>))}</div>)}
        </div>

        <div className="col" style={{ gap: 36 }}>
          <section aria-labelledby="oc-f">
            <p className="section-title" id="oc-f">Open findings</p>
            <SevBar counts={d.findings.by_severity} />
            <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
              {d.findings.top.slice(0, 4).map((f: any) => (<li key={f.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'nowrap', alignItems: 'flex-start' }}><Sev s={f.severity} /><Link to={`/app/findings/${f.id}`} style={{ textDecoration: 'none' }}>{f.plain_title}</Link></li>))}
            </ul>
            {d.findings.open > 4 && <Link className="small" to="/app/findings">All {d.findings.open} findings →</Link>}
          </section>
          <section aria-labelledby="oc-a">
            <p className="section-title" id="oc-a">Agents</p>
            {ag.data ? (<ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{ag.data.agents.map((a: any) => (
              <li key={a.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span><span className={`dot ${a.status === 'active' ? 'ok' : ''}`} /> {a.name}</span><span className="xs muted">{a.executions} run{a.executions === 1 ? '' : 's'}</span></li>))}</ul>) : <p className="muted small">Loading…</p>}
            <Link className="small" to="/app/agents">Agent control center →</Link>
          </section>
          <section aria-labelledby="oc-h">
            <p className="section-title" id="oc-h">Environment</p>
            <dl className="kv small mb0">
              <dt>Worker</dt><dd>{s?.worker.state ?? '…'} · {s?.worker.queued ?? 0} queued</dd>
              <dt>Policy mode</dt><dd>{s?.mode}</dd>
              <dt>AI model</dt><dd>{s?.model.state === 'UNCONFIGURED' ? <Label k="UNCONFIGURED" /> : s?.model.state}</dd>
              <dt>Integrations</dt><dd><Label k="UNCONFIGURED" /> none connected</dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  )
}
