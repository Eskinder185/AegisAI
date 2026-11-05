import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Btn, EmptyState, ErrorState, Label, LoadingBlock, PageHead, Sev, Status, Tabs, fmtTime } from '../../components/ui'
import { errMsg, get, patch, post } from '../../lib/api'
import { useAuth, useToast } from '../../lib/app-context'

function DetectionLab() {
  const rules = useQuery({ queryKey: ['rules'], queryFn: () => get('/detection/rules') })
  const [kind, setKind] = useState('distinct_users_per_ip')
  const [du, setDu] = useState(10)
  const [win, setWin] = useState(600)
  const [thr, setThr] = useState(8)
  const [grp, setGrp] = useState('user')
  const draft = kind === 'distinct_users_per_ip'
    ? { id: 'DRAFT-001', name: 'Draft rule', kind, version: 1, enabled: true, params: { distinct_users: du, window_seconds: win } }
    : { id: 'DRAFT-001', name: 'Draft rule', kind, version: 1, enabled: true, params: { group_by: grp, threshold: thr, window_seconds: win } }
  const test = useMutation({ mutationFn: () => post('/detection/test', { rules: [...(rules.data?.rules ?? []), draft] }) })
  const base = useMutation({ mutationFn: () => post('/detection/test', { rules: rules.data.rules }) })
  if (rules.isLoading) return <LoadingBlock />
  if (rules.isError) return <ErrorState error={rules.error} />
  const show = (r: any, title: string) => r && (
    <div className="card tight"><h3 style={{ fontSize: '1rem' }}>{title}</h3>
      <dl className="kv small"><dt>Recall</dt><dd>{r.score.recall}</dd><dt>Precision</dt><dd>{r.score.precision ?? 'n/a (no alerts)'}</dd><dt>False-positive alerts</dt><dd className={r.score.false_positive_alerts ? 'bad' : ''}>{r.score.false_positive_alerts}</dd><dt>Mean time to detect</dt><dd>{r.score.mean_time_to_detect_seconds ?? '—'} s (simulated)</dd></dl>
      <ul className="small mb0">{r.score.campaigns.map((c: any) => <li key={c.campaign}>{c.title}: {c.detected ? <span className="good">detected</span> : <span className="bad">missed</span>}</li>)}</ul>
      <p className="xs muted mt mb0">{r.caveat}</p></div>)
  return (
    <div className="col">
      <div className="callout brand small">A safe sandbox. Rules run only against the labelled synthetic dataset <code>{rules.data.rules.length ? 'auth-2026-01-15' : ''}</code>; nothing is saved here. To adopt a rule, use <Link to="/app/verify">Verify fixes</Link> (Demo 3) so the change is approved, applied and re-tested.</div>
      <div className="grid c2">
        <div className="card">
          <h3>Current rule set</h3>
          <ul className="small">{rules.data.rules.map((r: any) => <li key={r.id}><strong>{r.name}</strong> <code>{r.id}</code> v{r.version}<div className="muted">{r.kind} {JSON.stringify(r.params)}</div></li>)}</ul>
          <Btn size="sm" onClick={() => base.mutate()}>Score current rules</Btn>
          <div className="mt" aria-live="polite">{show(base.data, 'Current rules')}</div>
        </div>
        <form className="card" onSubmit={(e) => { e.preventDefault(); test.mutate() }}>
          <h3>Draft a rule</h3>
          <div className="field"><label htmlFor="rk">Rule type</label><select id="rk" value={kind} onChange={(e) => setKind(e.target.value)}><option value="distinct_users_per_ip">Many accounts failing from one source</option><option value="failed_login_threshold">Repeated failures for one account / source</option></select></div>
          {kind === 'distinct_users_per_ip' ? (
            <div className="field"><label htmlFor="rdu">Distinct accounts</label><input id="rdu" type="number" min={2} max={200} value={du} onChange={(e) => setDu(Number(e.target.value))} /></div>
          ) : (<><div className="field"><label htmlFor="rg">Group by</label><select id="rg" value={grp} onChange={(e) => setGrp(e.target.value)}><option value="user">account</option><option value="source_ip">source address</option></select></div>
            <div className="field"><label htmlFor="rt">Failures needed</label><input id="rt" type="number" min={2} max={200} value={thr} onChange={(e) => setThr(Number(e.target.value))} /></div></>)}
          <div className="field"><label htmlFor="rw">Window (seconds)</label><input id="rw" type="number" min={30} max={3600} value={win} onChange={(e) => setWin(Number(e.target.value))} /></div>
          <Btn type="submit" variant="primary" disabled={test.isPending}>{test.isPending ? 'Replaying…' : 'Test draft'}</Btn>
          <div className="mt" aria-live="polite">{test.isError && <p className="err" role="alert">{errMsg(test.error)}</p>}{show(test.data, 'Current rules + your draft')}</div>
        </form>
      </div>
    </div>
  )
}

export function Investigations() {
  const [tab, setTab] = useState('queue')
  const [status, setStatus] = useState('')
  const q = useQuery({ queryKey: ['incidents', status], queryFn: () => get(`/incidents?limit=100${status ? `&status=${status}` : ''}`) })
  return (
    <>
      <PageHead title="Investigations">Alerts from the blue-team assistant become incidents here, each with a timeline, cited evidence and a suggested next step.</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Incident queue' }, { id: 'lab', label: 'Detection lab' }]} />
      {tab === 'lab' ? <div role="tabpanel" id="panel-lab" aria-labelledby="tab-lab"><DetectionLab /></div> : (
        <div role="tabpanel" id="panel-queue" aria-labelledby="tab-queue">
          <div className="field" style={{ maxWidth: 240 }}><label htmlFor="is">Status</label><select id="is" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['open', 'investigating', 'resolved', 'false_positive'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
          {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data.items.length === 0 ? (
            <EmptyState title="No incidents" action={<Link className="btn primary mt" to="/app/verify">Run Demo 3 (detection gap)</Link>}>Incidents are created when a detection rule fires during a run.</EmptyState>
          ) : (
            <div className="table-wrap"><table><thead><tr><th>Severity</th><th>Incident</th><th>Status</th><th>Owner</th><th>Created</th></tr></thead>
              <tbody>{q.data.items.map((i: any) => (<tr key={i.id}><td><Sev s={i.severity} /></td><td><Link to={`/app/investigations/${i.id}`}><strong>{i.title}</strong></Link></td><td><Status s={i.status} /></td><td>{i.owner ?? '—'}</td><td className="small">{fmtTime(i.created_at)}</td></tr>))}</tbody></table></div>
          )}
        </div>)}
    </>
  )
}

export function IncidentDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const { push } = useToast()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const q = useQuery({ queryKey: ['incident', id], queryFn: () => get(`/incidents/${id}`) })
  const upd = useMutation({
    mutationFn: (b: any) => patch(`/incidents/${id}`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incident', id] }); qc.invalidateQueries({ queryKey: ['incidents'] }); setNote('') },
    onError: (e) => push(errMsg(e), true),
  })
  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const i = q.data
  return (
    <>
      <PageHead title={i.title} actions={<><Sev s={i.severity} /><Status s={i.status} /><Label k="SIMULATED" /></>}><Link to="/app/investigations">← Incident queue</Link> · <code>{i.stable_id}</code></PageHead>
      <div className="grid c2">
        <section className="card"><h2 style={{ fontSize: '1.15rem' }}>Summary <Label k="DETERMINISTIC" /></h2>
          <p>{i.summary.text}</p>{i.summary.insufficient_evidence && <div className="callout warn">Insufficient evidence: no events are cited, so no conclusion is drawn.</div>}
          <h3 style={{ fontSize: '1rem' }}>Why this severity</h3><p className="small">{i.severity_reason}</p>
          <h3 style={{ fontSize: '1rem' }}>Suggested next investigation step</h3><p className="small">{i.next_step}</p>
          {i.mitre.length > 0 && <p className="xs muted">Context labels (not a verdict): {i.mitre.join('; ')}</p>}
          <h3 style={{ fontSize: '1rem' }}>Affected assets</h3><p className="small">{i.affected_assets.map((a: string) => <code key={a} style={{ marginRight: 4 }}>{a}</code>)}</p></section>
        <section className="card"><h2 style={{ fontSize: '1.15rem' }}>Work this incident</h2>
          {can('analyst') ? (<>
            <div className="field"><label htmlFor="ist">Status</label><select id="ist" value={i.status} onChange={(e) => upd.mutate({ status: e.target.value })}>{['open', 'investigating', 'resolved', 'false_positive'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
            <div className="field"><label htmlFor="iow">Owner</label><input id="iow" type="text" defaultValue={i.owner ?? ''} onBlur={(e) => e.target.value !== (i.owner ?? '') && upd.mutate({ owner: e.target.value })} /></div>
            <form onSubmit={(e) => { e.preventDefault(); if (note) upd.mutate({ note }) }}><div className="field"><label htmlFor="inote">Add note</label><input id="inote" type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div><Btn type="submit" size="sm" disabled={!note}>Add note</Btn></form></>) : <p className="muted small">Viewers cannot change incidents.</p>}
          <ul className="small mt">{i.notes.map((n: any, k: number) => <li key={k}><strong>{n.by}</strong>: {n.text} <span className="muted">{fmtTime(n.at)}</span></li>)}</ul></section>
      </div>
      <section className="card mt"><h2 style={{ fontSize: '1.15rem' }}>Timeline (cited events)</h2>
        {i.timeline.length === 0 ? <p className="muted">No events cited.</p> : <ol className="tl">{i.timeline.map((e: any) => <li key={e.event_id}><code>{e.event_id}</code> — {e.text} <span className="xs muted">(t+{e.t}s simulated)</span></li>)}</ol>}
        {i.evidence_event_ids.length > i.timeline.length && <p className="xs muted">Showing the first {i.timeline.length} of {i.evidence_event_ids.length} cited events.</p>}</section>
    </>
  )
}
