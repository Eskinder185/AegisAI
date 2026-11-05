import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { RunPipeline } from '../../components/Pipeline'
import GraphView from '../../components/GraphView'
import Replay from '../../components/Replay'
import RunView from '../../components/RunView'
import { Btn, EmptyState, Tabs, ErrorState, Label, LoadingBlock, PageHead, Progress, Status, fmtTime, shortId } from '../../components/ui'
import { errMsg, get, post } from '../../lib/api'
import { useAuth, useToast } from '../../lib/app-context'

export function Assessments() {
  const { can } = useAuth()
  const { push } = useToast()
  const qc = useQueryClient()
  const targets = useQuery({ queryKey: ['targets'], queryFn: () => get('/targets') })
  const jobs = useQuery({
    queryKey: ['jobs'], queryFn: () => get('/jobs?limit=30'),
    refetchInterval: (q) => ((q.state.data as any)?.items ?? []).some((j: any) => ['queued', 'running'].includes(j.status)) ? 900 : 5000,
  })
  const run = useMutation({
    mutationFn: (id: string) => post('/jobs', { target_id: id }),
    onSuccess: (j) => { push(j.deduplicated ? 'A run for this target is already active — showing it.' : 'Assessment queued.'); qc.invalidateQueries({ queryKey: ['jobs'] }) },
    onError: (e) => push(errMsg(e), true),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => post(`/jobs/${id}/cancel`),
    onSuccess: () => { push('Cancel requested.'); qc.invalidateQueries({ queryKey: ['jobs'] }) },
    onError: (e) => push(errMsg(e), true),
  })
  if (targets.isLoading || jobs.isLoading) return <LoadingBlock />
  if (targets.isError || jobs.isError) return <ErrorState error={targets.error ?? jobs.error} retry={() => { targets.refetch(); jobs.refetch() }} />
  const runnable = targets.data.filter((t: any) => t.scenario_id)
  return (
    <>
      <PageHead title="Assessments">Run a one-off assessment of a practice target. Each run is a real queued job: the worker re-checks policy before every step and you can cancel at any time. For the full find → fix → verify loop use <Link to="/app/verify">Verify fixes</Link>.</PageHead>
      <div className="grid c2">
        {runnable.map((t: any) => (
          <div key={t.id} className="card tight row between">
            <div><strong>{t.name}</strong><div className="xs muted">{t.scenario_id}</div></div>
            <Btn size="sm" variant="primary" disabled={!can('analyst') || run.isPending} onClick={() => run.mutate(t.id)} title={!can('analyst') ? 'Viewers cannot run assessments' : undefined}>Run assessment</Btn>
          </div>))}
      </div>
      <h2 className="mt2">Recent jobs</h2>
      {jobs.data.items.length === 0 ? <EmptyState title="No jobs yet">Run an assessment above to see live progress here.</EmptyState> : (
        <div className="table-wrap"><table><thead><tr><th>Job</th><th>Scenario</th><th>Status</th><th>Progress</th><th>Started</th><th /></tr></thead>
          <tbody>{jobs.data.items.map((j: any) => (
            <tr key={j.id}><td><code>{shortId(j.id)}</code></td><td>{j.params.scenario_id}<div className="xs muted">{j.params.phase}</div></td><td><Status s={j.status} />{j.error && <div className="xs err">{j.error}</div>}</td>
              <td style={{ minWidth: 140 }}><Progress done={j.progress_done} total={j.progress_total} label={`Job ${shortId(j.id)} progress`} /><span className="xs muted">{j.current_step ?? `${j.progress_done}/${j.progress_total}`}</span></td>
              <td className="small">{fmtTime(j.created_at)}</td>
              <td className="row">{j.run_id && <Link to={`/app/assessments/runs/${j.run_id}`}>View run</Link>}{['queued', 'running'].includes(j.status) && can('analyst') && <Btn size="sm" onClick={() => cancel.mutate(j.id)}>Cancel</Btn>}</td></tr>))}</tbody></table></div>
      )}
    </>
  )
}

export function RunDetail() {
  const { id = '' } = useParams()
  const q = useQuery({ queryKey: ['run', id], queryFn: () => get(`/runs/${id}`) })
  const v = useQuery({ queryKey: ['manifest', id], queryFn: () => get(`/runs/${id}/verify-manifest`), enabled: !!q.data })
  const [tab, setTab] = useState('results')
  const graph = useQuery({ queryKey: ['graph', id], queryFn: () => get(`/runs/${id}/graph`), enabled: tab === 'graph' })
  const allRuns = useQuery({ queryKey: ['runs-all-sib'], queryFn: () => get('/runs?limit=50'), enabled: tab === 'replay' })
  const plan = useQuery({ queryKey: ['plan', q.data?.scenario_id], queryFn: () => get(`/assistant/plan/${q.data.scenario_id}`), enabled: !!q.data })
  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const r = q.data
  return (
    <>
      <PageHead title={`Run ${shortId(r.id)} · ${r.scenario_id}`} actions={<><Label k={r.evidence_label === 'NONE' ? 'BLOCKED' : 'SIMULATED'} /><Status s={r.phase} /></>}>
        <Link to="/app/assessments">← All assessments</Link>
      </PageHead>
      <div className="row mb0" style={{ marginBottom: 16 }}>
        <a className="btn" href={`/api/v1/reports/runs/${r.id}.html`} target="_blank" rel="noreferrer">Printable report</a>
        <a className="btn" href={`/api/v1/reports/runs/${r.id}.json`}>Download JSON</a>
        {v.data && <span className={`chip ${v.data.signature_valid && v.data.result_hash_matches ? 'ok' : 'danger'}`} title={v.data.note}>Manifest {v.data.signature_valid && v.data.result_hash_matches && v.data.state_hash_matches ? 'signature valid' : 'FAILED verification'}</span>}
      </div>
      {plan.data && (
        <details className="card tight" style={{ marginBottom: 16 }}>
          <summary><strong>Coordinator plan</strong> <span className="xs muted">— who did what</span></summary>
          <ol className="small">{plan.data.steps.map((s: any) => <li key={s.id}>{s.title} — <strong>{s.assigned_to}</strong> <code>{s.action}</code></li>)}</ol>
          <p className="xs muted mb0">{plan.data.note}</p>
        </details>)}
      {!r.result?.aborted && <section className="mb0" style={{ marginBottom: 20 }} aria-label="Recorded orchestration"><p className="section-title">Recorded orchestration</p><RunPipeline run={r} /></section>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'results', label: 'Results' }, { id: 'graph', label: 'Attack path' }, { id: 'replay', label: 'Replay' }]} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'results' && <RunView run={r} verify={r.verifier} />}
        {tab === 'graph' && (r.result?.aborted ? <p className="muted">This run was stopped before producing results.</p> : graph.isLoading ? <LoadingBlock /> : graph.isError ? <ErrorState error={graph.error} /> : <GraphView graph={graph.data} />)}
        {tab === 'replay' && (r.result?.aborted ? <p className="muted">This run was stopped before producing results.</p> : <Replay runId={r.id} siblings={(allRuns.data?.items ?? []).filter((x: any) => x.scenario_id === r.scenario_id && !x.aborted).map((x: any) => ({ id: x.id, label: `${x.phase} · ${shortId(x.id)}` }))} />)}
      </div>
    </>
  )
}
