import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { JobPipeline } from '../../components/Pipeline'
import RunView from '../../components/RunView'
import { BeforeAfterBars, Btn, Diff, EmptyState, ErrorState, Label, LoadingBlock, Modal, PageHead, Progress, Status, fmtTime } from '../../components/ui'
import { errMsg, get, post } from '../../lib/api'
import { useAuth, useToast } from '../../lib/app-context'

const STEPS = ['Baseline', 'Review', 'Fix', 'Re-run', 'Compare']

export function VerifyList() {
  const nav = useNavigate()
  const { can } = useAuth()
  const { push } = useToast()
  const qc = useQueryClient()
  const sc = useQuery({ queryKey: ['scenarios'], queryFn: () => get('/scenarios') })
  const targets = useQuery({ queryKey: ['targets'], queryFn: () => get('/targets') })
  const cases = useQuery({ queryKey: ['cases'], queryFn: () => get('/purple/cases') })
  const start = useMutation({
    mutationFn: (targetId: string) => post('/purple/cases', { target_id: targetId }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['cases'] }); nav(`/app/verify/${r.case.id}`) },
    onError: (e) => push(errMsg(e), true),
  })
  if (sc.isLoading || targets.isLoading || cases.isLoading) return <LoadingBlock />
  if (sc.isError || targets.isError || cases.isError) return <ErrorState error={sc.error ?? targets.error ?? cases.error} retry={() => { sc.refetch(); targets.refetch(); cases.refetch() }} />
  return (
    <>
      <PageHead title="Verify fixes">Pick a practice scenario. We run it, you review what was found and detected, approve a fixture-only fix, then re-run the same version and compare.</PageHead>
      <div className="grid c2">
        {sc.data.map((s: any) => {
          const t = targets.data.find((x: any) => x.slug === s.target_slug)
          const mine = cases.data.filter((c: any) => c.scenario_id === s.id)
          return (
            <article className="card" key={s.id} aria-labelledby={`sc-${s.id}`}>
              <div className="row between"><span className="chip brand">Demo {s.demo_no}</span><Label k="SIMULATED" /></div>
              <h2 id={`sc-${s.id}`} className="mt" style={{ fontSize: '1.25rem' }}>{s.title}</h2>
              <p className="muted">{s.plain_summary}</p>
              <div className="row">
                <Btn variant="primary" disabled={!can('analyst') || start.isPending || !t} onClick={() => t && start.mutate(t.id)} title={!can('analyst') ? 'Viewers cannot start runs' : undefined}>
                  {start.isPending ? 'Starting…' : mine.length ? 'Start a new run' : 'Start this demo'}
                </Btn>
                {mine[0] && <Link to={`/app/verify/${mine[0].id}`} className="btn">Continue latest ({mine[0].status.replace(/_/g, ' ')})</Link>}
              </div>
              {!can('analyst') && <p className="xs muted mt mb0">Your role is viewer: you can open existing runs but not start new ones.</p>}
            </article>
          )
        })}
      </div>
      <h2 className="mt2">Your verification cases</h2>
      {cases.data.length === 0 ? <EmptyState title="No cases yet">Start a demo above to create your first case.</EmptyState> : (
        <div className="table-wrap"><table><thead><tr><th>Scenario</th><th>Status</th><th>Started</th><th /></tr></thead>
          <tbody>{cases.data.map((c: any) => (
            <tr key={c.id}><td>{c.scenario_id} <span className="xs muted">v{c.scenario_version}</span></td><td><Status s={c.status} /></td><td className="small">{fmtTime(c.created_at)}</td><td><Link to={`/app/verify/${c.id}`}>Open</Link></td></tr>))}</tbody></table></div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------------------------------------ */
function RuleEditor({ value, onChange }: { value: { distinct_users: number; window_seconds: number }; onChange: (v: any) => void }) {
  return (
    <fieldset className="card flat tight">
      <legend className="small"><strong>Rule parameters</strong> (validated server-side; no free-form code)</legend>
      <div className="grid c2">
        <div className="field mb0"><label htmlFor="du">Distinct accounts failing from one source</label><input id="du" type="number" min={2} max={200} value={value.distinct_users} onChange={(e) => onChange({ ...value, distinct_users: Number(e.target.value) })} /><div className="hint">Lower catches more but risks false alarms on shared networks.</div></div>
        <div className="field mb0"><label htmlFor="ws">Time window (seconds)</label><input id="ws" type="number" min={30} max={3600} value={value.window_seconds} onChange={(e) => onChange({ ...value, window_seconds: Number(e.target.value) })} /></div>
      </div>
    </fieldset>
  )
}

function DraftTest({ rule }: { rule: any }) {
  const rules = useQuery({ queryKey: ['rules'], queryFn: () => get('/detection/rules') })
  const m = useMutation({ mutationFn: () => post('/detection/test', { rules: [...(rules.data?.rules ?? []).filter((r: any) => r.id !== rule.id), rule] }) })
  const s = m.data?.score
  return (
    <div className="mt">
      <Btn size="sm" onClick={() => m.mutate()} disabled={m.isPending || !rules.data}>{m.isPending ? 'Replaying…' : 'Test this draft before applying'}</Btn>
      <div aria-live="polite">
        {m.isError && <p className="err mt">{errMsg(m.error)}</p>}
        {s && (
          <div className="callout brand mt">
            <strong>Draft replay (nothing saved):</strong> recall {s.recall}, precision {s.precision ?? 'n/a'}, {s.false_positive_alerts} false-positive alert(s), {s.campaigns.filter((c: any) => c.detected).length}/{s.campaigns.length} campaigns detected.
            {s.false_positive_alerts > 0 && <div className="bad">Caveat: this draft fires on harmless activity (for example a shared office network).</div>}
            <div className="xs muted">{m.data.caveat}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Comparison({ cmp, caseId, scenarioTitle }: { cmp: any; caseId: string; scenarioTitle: string }) {
  const num = cmp.rows.filter((r: any) => typeof r.before === 'number' && typeof r.after === 'number' && (r.label === 'Findings' || r.label.startsWith('Exposure')))
  const ok = cmp.verdict === 'verified'
  return (
    <section aria-labelledby="cmp-h" className="col">
      <h2 id="cmp-h">Before vs. after</h2>
      <div className={`callout ${ok ? 'ok' : cmp.verdict === 'partial' ? 'warn' : 'danger'}`} role="status">
        <strong>{ok ? 'Verified (simulated): ' : cmp.verdict === 'partial' ? 'Partly improved: ' : cmp.verdict === 'regression' ? 'Regression: ' : 'Not improved: '}</strong>
        {ok ? `all ${cmp.resolved.length} baseline finding(s) no longer appear when the same versioned scenario is re-run.` : cmp.remaining.length ? `${cmp.remaining.length} finding(s) remain.` : ''}
        {cmp.regression_notes.map((n: string) => <div key={n}>{n}</div>)}
        <div className="xs muted mt">Same scenario version on both runs: {cmp.same_scenario_version ? 'yes' : 'NO'} (v{cmp.scenario_version}). Evidence label: {cmp.evidence_label}. Metrics are computed by code from stored runs.</div>
      </div>
      <div className="grid c2">
        <div className="card"><h3>At a glance</h3>{num.length > 0 && <BeforeAfterBars rows={num.map((r: any) => ({ label: r.label, before: r.before, after: r.after }))} />}</div>
        <div className="card">
          <h3>Measures</h3>
          <div role="table" aria-label="Before and after measures">
            <div className="cmp head" role="row"><span role="columnheader">Measure</span><span role="columnheader">Before</span><span role="columnheader">After</span><span role="columnheader"><span className="sr-only">Change</span></span></div>
            {cmp.rows.map((r: any) => (
              <div className="cmp" role="row" key={r.label}>
                <span role="cell">{r.label}</span><span role="cell">{String(r.before ?? '—')}</span><span role="cell"><strong>{String(r.after ?? '—')}</strong></span>
                <span role="cell" className={r.improved ? 'good' : r.improved === false ? 'bad' : 'muted'} aria-label={r.improved ? 'improved' : r.improved === false ? 'worse' : 'unchanged'}>{r.improved ? '▲ better' : r.improved === false ? '▼ worse' : '='}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid c2">
        {(['resolved_titles', 'remaining_titles', 'new_titles'] as const).map((k) => {
          const items = Object.entries(cmp[k] ?? {})
          if (!items.length) return null
          return (<div className="card tight" key={k}><h3 style={{ fontSize: '1rem' }}>{k === 'resolved_titles' ? 'Resolved' : k === 'remaining_titles' ? 'Still present' : 'New after the change'}</h3><ul className="small mb0">{items.map(([id, t]) => <li key={id}><code>{id}</code> {String(t)}</li>)}</ul></div>)
        })}
      </div>
      <div className="row">
        <a className="btn" href={`/api/v1/reports/cases/${caseId}.html`} target="_blank" rel="noreferrer">Open printable report</a>
        <a className="btn" href={`/api/v1/reports/cases/${caseId}.json`}>Download JSON</a>
        <a className="btn" href={`/api/v1/runs/${cmp.retest_run_id}/verify-manifest`} target="_blank" rel="noreferrer">Verify signed manifest</a>
      </div>
      <span className="sr-only">{scenarioTitle}</span>
    </section>
  )
}

export default function CaseView() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { can } = useAuth()
  const { push } = useToast()
  const [modal, setModal] = useState<null | 'apply' | 'rollback'>(null)
  const [ack, setAck] = useState(false)
  const [rule, setRule] = useState({ distinct_users: 10, window_seconds: 600 })
  const [guards, setGuards] = useState<string[]>(['instruction_data_separation', 'tool_allowlist_enforced', 'output_validation', 'canary_egress_filter'])
  const q = useQuery({
    queryKey: ['case', id],
    queryFn: () => get(`/purple/cases/${id}`),
    refetchInterval: (query) => ((query.state.data as any)?.jobs ?? []).some((j: any) => ['queued', 'running'].includes(j.status)) ? 900 : false,
  })
  const d = q.data
  const baseId = d?.baseline?.id
  const base = useQuery({ queryKey: ['run', baseId], queryFn: () => get(`/runs/${baseId}`), enabled: !!baseId })
  const retId = d?.retest?.id
  const ret = useQuery({ queryKey: ['run', retId], queryFn: () => get(`/runs/${retId}`), enabled: !!retId })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['case', id] }); qc.invalidateQueries({ queryKey: ['run'] }); qc.invalidateQueries({ queryKey: ['findings'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) }
  const params = d?.scenario?.kind === 'auth_logs'
    ? { rule: { id: 'AUTH-SPRAY-002', name: 'Many accounts failing from one source', kind: 'distinct_users_per_ip', version: 1, enabled: true, params: rule, mitre: ['T1110.003 Password Spraying (context)'] } }
    : d?.scenario?.kind === 'ai_agent' ? { enable: guards } : undefined
  const apply = useMutation({
    mutationFn: async () => {
      const a = await post(`/purple/cases/${id}/approve`, { action: modal === 'rollback' ? 'rollback' : 'apply', confirm: true, params: modal === 'rollback' ? undefined : params })
      return modal === 'rollback' ? post(`/purple/cases/${id}/rollback`, { approval_id: a.id }) : post(`/purple/cases/${id}/apply`, { approval_id: a.id })
    },
    onSuccess: () => { push(modal === 'rollback' ? 'Fixture restored to its previous state.' : 'Fixture-only change applied. Re-run the scenario to verify it.'); setModal(null); setAck(false); refresh() },
    onError: (e) => { push(errMsg(e), true); setModal(null) },
  })
  const retest = useMutation({ mutationFn: () => post(`/purple/cases/${id}/retest`), onSuccess: refresh, onError: (e) => push(errMsg(e), true) })

  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const c = d.case
  const active = d.jobs.find((j: any) => ['queued', 'running'].includes(j.status))
  const lastJob = d.jobs[d.jobs.length - 1]
  const step = active ? (active.params.phase === 'retest' ? 3 : 0) : c.status === 'remediated' ? 3 : ['verified', 'not_improved'].includes(c.status) ? 4 : ['baseline_done', 'rolled_back'].includes(c.status) ? 2 : 0
  const remediation = d.scenario.remediation
  const previewLines: string[] = d.scenario.kind === 'auth_logs'
    ? [`+ rule AUTH-SPRAY-002 v1 (distinct_users_per_ip) params={distinct_users: ${rule.distinct_users}, window_seconds: ${rule.window_seconds}}`]
    : d.scenario.kind === 'ai_agent' ? guards.map((g) => `+ guardrail ${g}: off -> on`) : d.remediation_preview.lines
  const canAct = can('analyst')
  return (
    <>
      <PageHead title={d.scenario.title} actions={<><Label k="SIMULATED" /><Status s={c.status} /></>}>{d.scenario.plain_summary}</PageHead>
      <ol className="stepper" aria-label="Progress">
        {STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}><b>Step {i + 1}</b>{s}{i < step && <span className="sr-only"> (complete)</span>}</li>)}
      </ol>

      {active && (
        <div className="card" role="status" aria-live="polite">
          <div className="row between"><strong>{active.params.phase === 'retest' ? 'Re-running the same scenario version…' : 'Running baseline…'}</strong><Status s={active.status} /></div>
          <JobPipeline scenarioId={d.scenario.id} job={active} />
          <Progress done={active.progress_done} total={active.progress_total} label="Job progress" />
          <p className="small muted mt mb0">{active.status === 'queued' ? 'Waiting for the worker to pick up the job. If this does not change, check that the worker is online in the top bar.' : `Step ${active.progress_done + 1} of ${active.progress_total}: ${active.current_step ?? '…'}`}</p>
        </div>
      )}
      {lastJob && ['blocked', 'failed', 'cancelled'].includes(lastJob.status) && !active && (
        <div className="callout danger" role="alert"><strong>The last run was {lastJob.status}.</strong> {lastJob.error}
          <div className="mt">{canAct && c.status !== 'remediated' && <Btn size="sm" onClick={() => post('/purple/cases', { target_id: d.target.id }).then((r) => { window.location.href = `/app/verify/${r.case.id}` })}>Start a fresh case</Btn>}</div></div>
      )}

      {ret.data && c.comparison?.rows && (
        <div className="mt2"><Comparison cmp={c.comparison} caseId={c.id} scenarioTitle={d.scenario.title} />
          <div className="row mt">{c.can_rollback && canAct && <Btn onClick={() => setModal('rollback')}>Roll back this change</Btn>}<Link className="btn" to="/app/verify">Back to scenarios</Link></div></div>
      )}
      {base.data && (
        <section className="mt2" aria-labelledby="base-h">
          <details open={!c.comparison?.rows}>
            <summary><h2 id="base-h" style={{ display: 'inline' }}>Baseline results</h2> <span className="xs muted">(before the fix)</span></summary>
            <div className="mt"><RunView run={base.data} verify={base.data.verifier} /></div>
          </details>
        </section>
      )}

      {!active && ['baseline_done', 'rolled_back', 'not_improved'].includes(c.status) && (
        <section className="mt2 card" aria-labelledby="fix-h">
          <div className="row between"><h2 id="fix-h">Proposed fix <span className="chip">fixture only</span></h2><span className="chip needs-approval">Needs approval</span></div>
          <p><strong>{remediation.title}</strong></p>
          <p className="muted">{remediation.explanation}</p>
          {d.scenario.kind === 'auth_logs' && (<><RuleEditor value={rule} onChange={setRule} /><DraftTest rule={params!.rule} /></>)}
          {d.scenario.kind === 'ai_agent' && (
            <fieldset className="card flat tight"><legend className="small"><strong>Guardrails to enable</strong></legend>
              {['instruction_data_separation', 'tool_allowlist_enforced', 'output_validation', 'canary_egress_filter'].map((g) => (
                <label key={g} style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={guards.includes(g)} onChange={(e) => setGuards(e.target.checked ? [...guards, g] : guards.filter((x) => x !== g))} /> <code>{g}</code></label>))}
            </fieldset>)}
          <h3 className="mt">Preview of the change</h3>
          <Diff lines={previewLines} />
          <div className="grid c2 mt">
            <div><h3 style={{ fontSize: '1rem' }}>Tradeoffs</h3><ul className="small">{remediation.tradeoffs.map((t: string) => <li key={t}>{t}</li>)}</ul></div>
            <div><h3 style={{ fontSize: '1rem' }}>Rollback</h3><p className="small">{remediation.rollback}</p></div>
          </div>
          <Btn variant="primary" disabled={!canAct || (d.scenario.kind === 'ai_agent' && guards.length === 0)} onClick={() => setModal('apply')}>Review and approve this change…</Btn>
          {!canAct && <p className="xs muted mt mb0">Only analysts and admins can approve changes.</p>}
        </section>
      )}

      {!active && c.status === 'remediated' && (
        <section className="mt2 card">
          <h2>Change applied — now prove it</h2>
          <p>The fixture has been modified (version {d.target.fixture_version}). Re-run the same versioned scenario to see whether the problem is really gone.</p>
          <div className="row"><Btn variant="primary" disabled={!canAct || retest.isPending} onClick={() => retest.mutate()}>{retest.isPending ? 'Queuing…' : 'Re-run the same scenario'}</Btn>{c.can_rollback && canAct && <Btn onClick={() => setModal('rollback')}>Roll back the change</Btn>}</div>
        </section>
      )}

      {ret.data && c.comparison?.rows && (
        <section className="mt2"><details><summary><h2 style={{ display: 'inline' }}>Re-run results</h2> <span className="xs muted">(after the fix)</span></summary>
          <div className="mt"><RunView run={ret.data} verify={ret.data.verifier} /></div></details></section>
      )}
      {!base.data && !active && !base.isLoading && !lastJob && <EmptyState title="Waiting for the baseline run" />}

      {modal && (
        <Modal title={modal === 'apply' ? 'Approve this fixture-only change' : 'Approve rollback'} onClose={() => { setModal(null); setAck(false) }}
          footer={<><Btn onClick={() => { setModal(null); setAck(false) }}>Cancel</Btn><Btn variant="primary" disabled={!ack || apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? 'Applying…' : modal === 'apply' ? 'Approve and apply' : 'Approve and roll back'}</Btn></>}>
          <p>{modal === 'apply' ? remediation.title : 'Restore the fixture to exactly how it was before the change.'}</p>
          {modal === 'apply' && <Diff lines={previewLines} />}
          <ul className="small mt">
            <li>Approved by you ({'analyst/admin'}), recorded in the audit log with this exact change.</li>
            <li>The approval is single-use and expires in 15 minutes.</li>
            <li>It changes the <strong>demo fixture only</strong>. No real system, firewall, cloud or network setting is touched.</li>
          </ul>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand this changes the demo fixture only.</label>
        </Modal>
      )}
    </>
  )
}

