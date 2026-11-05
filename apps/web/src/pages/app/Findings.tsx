import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { QA } from '../../components/RunView'
import { Btn, EmptyState, ErrorState, Label, LoadingBlock, PageHead, Sev, Status, fmtTime } from '../../components/ui'
import { errMsg, get, patch, post } from '../../lib/api'
import { useAuth, useToast, useViewMode } from '../../lib/app-context'

export function Findings() {
  const [sev, setSev] = useState('')
  const [status, setStatus] = useState('')
  const [ver, setVer] = useState('')
  const [text, setText] = useState('')
  const { advanced } = useViewMode()
  const qs = new URLSearchParams({ limit: '100', ...(sev && { severity: sev }), ...(status && { status }), ...(ver && { verification: ver }), ...(text && { q: text }) }).toString()
  const q = useQuery({ queryKey: ['findings', qs], queryFn: () => get(`/findings?${qs}`) })
  return (
    <>
      <PageHead title="Findings">Everything the tests have noticed, in priority order. Each one explains what happened, why it matters, how to fix it and how we will know it worked.</PageHead>
      <form className="card tight grid c4" role="search" aria-label="Filter findings" onSubmit={(e) => e.preventDefault()}>
        <div className="field mb0"><label htmlFor="fq">Search</label><input id="fq" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="title or id" /></div>
        <div className="field mb0"><label htmlFor="fs">Severity</label><select id="fs" value={sev} onChange={(e) => setSev(e.target.value)}><option value="">All</option>{['critical', 'high', 'medium', 'low'].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field mb0"><label htmlFor="ft">Triage status</label><select id="ft" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['open', 'triaged', 'accepted', 'false_positive', 'fixed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
        <div className="field mb0"><label htmlFor="fv">Verification</label><select id="fv" value={ver} onChange={(e) => setVer(e.target.value)}><option value="">All</option><option value="UNVERIFIED">Not yet verified</option><option value="VERIFIED_FIXED">Verified fixed (simulated)</option></select></div>
      </form>
      <div className="mt" aria-live="polite">
        {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data.items.length === 0 ? (
          <EmptyState title="No findings match" action={<Link className="btn primary mt" to="/app/verify">Run a demo</Link>}>Findings appear after you run a scenario. Try clearing the filters.</EmptyState>
        ) : (
          <>
            <p className="small muted">{q.data.total} finding(s)</p>
            <div className="table-wrap"><table><thead><tr><th>Severity</th><th>Finding</th><th>Status</th><th>Evidence</th>{advanced && <th>Id</th>}</tr></thead>
              <tbody>{q.data.items.map((f: any) => (
                <tr key={f.id}><td><Sev s={f.severity} /></td><td><Link to={`/app/findings/${f.id}`}><strong>{f.plain_title}</strong></Link>{advanced && <div className="xs muted">{f.title}</div>}</td>
                  <td><Status s={f.status} /> {f.verification === 'VERIFIED_FIXED' && <Label k="VERIFIED" />}</td><td><Label k={f.evidence_kind} /></td>{advanced && <td><code>{f.stable_id}</code></td>}</tr>))}</tbody></table></div>
          </>
        )}
      </div>
    </>
  )
}

export function FindingDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const { push } = useToast()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['finding', id], queryFn: () => get(`/findings/${id}`) })
  const triage = useMutation({
    mutationFn: (status: string) => patch(`/findings/${id}`, { status }),
    onSuccess: () => { push('Triage status saved.'); qc.invalidateQueries({ queryKey: ['finding', id] }); qc.invalidateQueries({ queryKey: ['findings'] }) },
    onError: (e) => push(errMsg(e), true),
  })
  const explain = useMutation({ mutationFn: () => post(`/findings/${id}/explain`) })
  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const f = q.data
  const ai = explain.data?.ai
  return (
    <>
      <PageHead title={f.plain_title} actions={<><Sev s={f.severity} /><Label k={f.evidence_kind} />{f.verification !== 'UNVERIFIED' && <Label k={f.verification} />}</>}>
        <Link to="/app/findings">← All findings</Link> · <code>{f.stable_id}</code> · {f.title}
      </PageHead>
      <div className="grid c2">
        <section className="card" aria-labelledby="qa-h"><h2 id="qa-h" style={{ fontSize: '1.2rem' }}>Plain-English explanation</h2><QA f={f} />
          <p className="xs muted mb0">Confidence: {f.confidence}. {f.explanation?.deterministic.confidence_statement}</p></section>
        <section className="card" aria-labelledby="ev-h"><h2 id="ev-h" style={{ fontSize: '1.2rem' }}>Evidence</h2>
          <h3 style={{ fontSize: '.95rem' }}>Observed</h3><ul className="small">{f.observed.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul>
          {f.inferred.length > 0 && <><h3 style={{ fontSize: '.95rem' }}>Inferred (not confirmed)</h3><ul className="small">{f.inferred.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul></>}
          {f.evidence.map((e: any) => (<div key={e.id} className="card flat tight mt"><div className="row between"><code>{e.id}</code><Label k={e.label} /></div><p className="small mb0 mt">{e.excerpt}</p>
            <p className="xs muted mb0">Source {e.source} · method {e.method} · {fmtTime(e.timestamp)} · reproducible: {String(e.reproducible)} · confidence {e.confidence}</p></div>))}
        </section>
      </div>
      <div className="grid c2 mt">
        <section className="card" aria-labelledby="tr-h"><h2 id="tr-h" style={{ fontSize: '1.2rem' }}>Triage</h2>
          <div className="row"><Status s={f.status} />
            {can('analyst') ? (<><label htmlFor="tri" className="sr-only">Set triage status</label><select id="tri" style={{ width: 'auto' }} value={f.status === 'fixed' ? 'open' : f.status} onChange={(e) => triage.mutate(e.target.value)}>{['open', 'triaged', 'accepted', 'false_positive'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></>) : <span className="muted small">Viewers cannot triage.</span>}</div>
          <h3 className="mt" style={{ fontSize: '.95rem' }}>History</h3>
          <ul className="tl small">{f.history.map((h: any, i: number) => <li key={i}><strong>{h.event}</strong> {h.phase && `(${h.phase})`} <span className="muted">{fmtTime(h.at)}</span></li>)}</ul></section>
        <section className="card" aria-labelledby="ai-h"><h2 id="ai-h" style={{ fontSize: '1.2rem' }}>Ask the assistant to explain</h2>
          <p className="small muted">The deterministic explanation on this page is always the source of truth. If you enable a model, it may add an <em>interpretation</em> that is checked against the stored evidence.</p>
          <Btn onClick={() => explain.mutate()} disabled={explain.isPending}>{explain.isPending ? 'Asking…' : 'Get AI interpretation'}</Btn>
          <div aria-live="polite" className="mt">
            {explain.isError && <p className="err">{errMsg(explain.error)}</p>}
            {ai && ai.state === 'OK' && <div className="callout warn"><Label k="AI_INTERPRETATION" /><p className="mt mb0">{ai.text}</p><p className="xs muted mb0 mt">{ai.note}</p></div>}
            {ai && ai.state !== 'OK' && <div className="callout"><Label k={ai.state === 'UNCONFIGURED' ? 'UNCONFIGURED' : 'BLOCKED'} /><p className="small mt mb0">{ai.state === 'UNCONFIGURED' ? 'No AI model is configured, so nothing was generated. Everything shown above is deterministic.' : ai.note}</p>{ai.state === 'UNCONFIGURED' && ai.note && <p className="xs muted mb0">{ai.note}</p>}</div>}
          </div></section>
      </div>
    </>
  )
}
