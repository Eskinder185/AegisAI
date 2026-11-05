import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CaseResult } from '../../components/RunView'
import { EmptyState, ErrorState, Label, LoadingBlock, PageHead, Sev, Trend } from '../../components/ui'
import { get } from '../../lib/api'

export default function AiSecurity() {
  const cases = useQuery({ queryKey: ['ai-cases'], queryFn: () => get('/ai-lab/cases') })
  const runs = useQuery({ queryKey: ['runs-ai'], queryFn: () => get('/runs?limit=50') })
  const runList = (runs.data?.items ?? []).filter((r: any) => r.scenario_id === 'ai-prompt-injection' && !r.aborted).reverse()
  const latestId = runList[runList.length - 1]?.id
  const latest = useQuery({ queryKey: ['run', latestId], queryFn: () => get(`/runs/${latestId}`), enabled: !!latestId })
  if (cases.isLoading || runs.isLoading) return <LoadingBlock />
  if (cases.isError) return <ErrorState error={cases.error} retry={() => cases.refetch()} />
  const gr = latest.data?.result?.guardrails ?? {}
  return (
    <>
      <PageHead title="AI Security" actions={<Link className="btn primary" to="/app/verify">Run Demo 4</Link>}>
        Defensive testing for AI agents. A <strong>mock agent</strong> with harmless tools and a <strong>fake canary</strong> is attacked with seven versioned prompt-injection cases. Code-enforced gates and deterministic evaluators decide pass or fail — never a model.
      </PageHead>
      <div className="callout warn small">Results describe how guardrails behave in this deterministic harness (seed {cases.data.seed}). They are not a claim about any real model. {cases.data.canary_note}</div>
      <div className="grid c2 mt">
        <section className="card" aria-labelledby="gs"><h2 id="gs" style={{ fontSize: '1.2rem' }}>Guardrail state (latest run)</h2>
          {latestId ? <ul className="mb0" style={{ listStyle: 'none', padding: 0 }}>{cases.data.guardrails.map((g: string) => <li key={g} className="row between" style={{ padding: '.3rem 0' }}><code>{g}</code><span className={`chip ${gr[g] ? 'ok' : 'danger'}`}>{gr[g] ? 'on' : 'off'}</span></li>)}</ul>
            : <p className="muted">No run yet, so no guardrail state to show.</p>}
          {latest.data && <div className="bar-row" style={{ gridTemplateColumns: '90px 1fr 48px', marginTop: 16 }}><span>Pass rate</span><div className="bar-track"><div className="bar-fill go" style={{ ['--w' as string]: `${(latest.data.metrics.pass_rate ?? 0) * 100}%`, background: latest.data.metrics.pass_rate === 1 ? 'var(--ok)' : 'var(--danger)' }} /></div><span>{latest.data.metrics.tests_passed}/{latest.data.metrics.tests_total}</span></div>}</section>
        <section className="card" aria-labelledby="tr"><h2 id="tr" style={{ fontSize: '1.2rem' }}>Pass-rate trend</h2>
          <Trend points={runList.map((r: any) => r.metrics.tests_passed)} label="Guardrail tests passed per run, oldest to newest" />
          <p className="xs muted mb0">{runList.length} run(s) · {runList.length ? runList[runList.length - 1].metrics.sample_size_note : 'Seven synthetic cases per run.'}</p></section>
      </div>
      <h2 className="mt2">The seven test cases</h2>
      <div className="table-wrap"><table><thead><tr><th>Case</th><th>What it simulates</th><th>Severity if it fails</th></tr></thead>
        <tbody>{cases.data.cases.map((c: any) => (<tr key={c.id}><td><code>{c.id}</code> {c.title}</td><td className="small">{c.plain}</td><td><Sev s={c.severity} /></td></tr>))}</tbody></table></div>
      <h2 className="mt2">Latest results <Label k="SIMULATED" /></h2>
      {!latestId ? <EmptyState title="No results yet" action={<Link className="btn primary mt" to="/app/verify">Start Demo 4</Link>}>Run the AI guardrail scenario to see pass/fail results with tool-call traces.</EmptyState>
        : latest.isLoading ? <LoadingBlock /> : <div className="col">{latest.data.result.guardrail_cases.map((c: any) => <CaseResult key={c.case_id} c={c} />)}</div>}
    </>
  )
}
