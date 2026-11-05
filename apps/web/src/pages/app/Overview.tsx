import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Btn, EmptyState, ErrorState, Label, LoadingBlock, PageHead, Sev, SevBar, Status, fmtTime } from '../../components/ui'
import { errMsg, get, post } from '../../lib/api'
import { useAuth, useToast, useViewMode } from '../../lib/app-context'

export default function Overview() {
  const { user, can } = useAuth()
  const { advanced } = useViewMode()
  const nav = useNavigate()
  const { push } = useToast()
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard'), refetchInterval: 6000 })
  const st = useQuery({ queryKey: ['status'], queryFn: () => get('/system/status') })
  const targets = useQuery({ queryKey: ['targets'], queryFn: () => get('/targets') })
  const demo = useMutation({
    mutationFn: async () => {
      const t = targets.data.find((x: any) => x.slug === 'demo-web')
      return post('/purple/cases', { target_id: t.id })
    },
    onSuccess: (r) => nav(`/app/verify/${r.case.id}`),
    onError: (e) => push(errMsg(e), true),
  })
  if (q.isLoading) return <LoadingBlock label="Loading overview" />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const d = q.data
  const s = st.data
  return (
    <>
      <PageHead title={`Welcome, ${user?.display_name.split(' ')[0]}`}
        actions={<Btn variant="primary" size="lg" disabled={!can('analyst') || demo.isPending || !targets.data} onClick={() => demo.mutate()}>{demo.isPending ? 'Starting…' : 'Run safe demo'}</Btn>}>
        Mission Control: what is protected, what was found, and what has been proven. {advanced ? '' : 'Everything on this page comes from practice fixtures and is labelled as such.'}
      </PageHead>
      {!can('analyst') && <div className="callout warn mb0">You are signed in as a viewer: you can explore everything but cannot start runs.</div>}

      <div className="grid c4 mt">
        <div className="stat"><div className="v">{d.targets.runnable}</div><div className="l">Practice targets ready <Label k="SIMULATED" /></div></div>
        <div className="stat"><div className="v">{d.findings.open}</div><div className="l">Open findings</div></div>
        <div className="stat"><div className="v">{d.findings.verified_fixed}</div><div className="l">Verified fixed (simulated)</div></div>
        <div className="stat"><div className="v">{d.incidents.open}</div><div className="l">Open incidents</div></div>
      </div>

      <div className="grid c2 mt">
        <section className="card" aria-labelledby="journeys">
          <h2 id="journeys" style={{ fontSize: '1.2rem' }}>Your four guided journeys</h2>
          <ul style={{ listStyle: 'none', padding: 0 }} className="mb0">
            {d.scenarios.map((x: any) => (
              <li key={x.scenario_id} className="row between" style={{ padding: '.6rem 0', borderBottom: '1px solid var(--border)' }}>
                <span><span className="chip brand">Demo {x.demo_no}</span> {x.title}</span>
                <span className="row"><Status s={x.status} />
                  <Link className="btn sm" to={x.case_id ? `/app/verify/${x.case_id}` : '/app/verify'}>{x.case_id ? 'Open' : 'Start'}</Link></span>
              </li>))}
          </ul>
        </section>
        <section className="card" aria-labelledby="sev">
          <h2 id="sev" style={{ fontSize: '1.2rem' }}>Open findings by severity</h2>
          <SevBar counts={d.findings.by_severity} />
          <h3 className="mt" style={{ fontSize: '1rem' }}>Highest priority</h3>
          {d.findings.top.length === 0 ? <EmptyState title="Nothing open yet">Run a demo to generate evidence-backed findings.</EmptyState> : (
            <ul className="mb0" style={{ listStyle: 'none', padding: 0 }}>
              {d.findings.top.map((f: any) => (<li key={f.id} className="row" style={{ padding: '.35rem 0' }}><Sev s={f.severity} /><Link to={`/app/findings/${f.id}`}>{f.plain_title}</Link></li>))}
            </ul>)}
        </section>
      </div>

      <div className="grid c3 mt">
        <section className="card" aria-labelledby="inc"><h2 id="inc" style={{ fontSize: '1.1rem' }}>Recent incidents</h2>
          {d.incidents.recent.length === 0 ? <p className="muted small">None yet. Demo 1 and Demo 3 produce simulated alerts.</p> :
            <ul className="small mb0" style={{ paddingLeft: '1.1rem' }}>{d.incidents.recent.map((i: any) => <li key={i.id}><Link to={`/app/investigations/${i.id}`}>{i.title}</Link> <Sev s={i.severity} /></li>)}</ul>}</section>
        <section className="card" aria-labelledby="jobs"><h2 id="jobs" style={{ fontSize: '1.1rem' }}>Recent jobs</h2>
          {d.recent_jobs.length === 0 ? <p className="muted small">No jobs yet.</p> :
            <ul className="small mb0" style={{ listStyle: 'none', padding: 0 }}>{d.recent_jobs.map((j: any) => <li key={j.id} className="row between"><span>{j.params.scenario_id} · {j.params.phase}</span><Status s={j.status} /></li>)}</ul>}</section>
        <section className="card" aria-labelledby="health"><h2 id="health" style={{ fontSize: '1.1rem' }}>Workspace health</h2>
          <dl className="kv small mb0">
            <dt>Worker</dt><dd>{s?.worker.state ?? '…'} ({s?.worker.queued ?? 0} queued)</dd>
            <dt>Policy mode</dt><dd>{s?.mode}</dd>
            <dt>AI model</dt><dd>{s?.model.state === 'UNCONFIGURED' ? <Label k="UNCONFIGURED" /> : s?.model.state}</dd>
            <dt>Approvals waiting</dt><dd>{d.pending_approvals}</dd>
            <dt>Verified cases</dt><dd>{d.purple.verified} / {d.purple.cases}</dd>
          </dl></section>
      </div>
      {advanced && <p className="xs muted mt">Last refreshed {fmtTime(new Date().toISOString())}. Data label: {d.label}. Collectors: none connected (AegisSOC, AWS, Wazuh are <Label k="UNCONFIGURED" />).</p>}
    </>
  )
}
