import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Label, LoadingBlock, PageHead, Status, fmtTime, shortId } from '../../components/ui'
import { get } from '../../lib/api'

export default function Reports() {
  const cases = useQuery({ queryKey: ['cases'], queryFn: () => get('/purple/cases') })
  const runs = useQuery({ queryKey: ['runs-all'], queryFn: () => get('/runs?limit=50') })
  if (cases.isLoading || runs.isLoading) return <LoadingBlock />
  if (cases.isError || runs.isError) return <ErrorState error={cases.error ?? runs.error} retry={() => { cases.refetch(); runs.refetch() }} />
  return (
    <>
      <PageHead title="Reports">Printable HTML (use your browser's “Save as PDF”) and JSON exports. Every number comes from stored run results and every report carries the run manifest hash and signature.</PageHead>
      <div className="card"><h2 style={{ fontSize: '1.2rem' }}>Executive summary</h2><p className="muted">Open findings, verified fixes and the scoring method, in plain language for non-technical readers.</p>
        <a className="btn primary" href="/api/v1/reports/workspace.html" target="_blank" rel="noreferrer">Open executive summary</a></div>
      <h2 className="mt2">Verification (before / after) reports</h2>
      {cases.data.length === 0 ? <EmptyState title="No cases yet" action={<Link className="btn primary mt" to="/app/verify">Start a demo</Link>}>Verification reports appear once you have run a case.</EmptyState> : (
        <div className="table-wrap"><table><thead><tr><th>Scenario</th><th>Status</th><th>Created</th><th>Export</th></tr></thead>
          <tbody>{cases.data.map((c: any) => (<tr key={c.id}><td>{c.scenario_id}</td><td><Status s={c.status} /></td><td className="small">{fmtTime(c.created_at)}</td>
            <td className="row"><a href={`/api/v1/reports/cases/${c.id}.html`} target="_blank" rel="noreferrer">HTML</a><a href={`/api/v1/reports/cases/${c.id}.json`}>JSON</a><Link to={`/app/verify/${c.id}`}>Open</Link></td></tr>))}</tbody></table></div>)}
      <h2 className="mt2">Analyst run reports</h2>
      {runs.data.items.length === 0 ? <EmptyState title="No runs yet" /> : (
        <div className="table-wrap"><table><thead><tr><th>Run</th><th>Scenario</th><th>Phase</th><th>Evidence</th><th>Export</th></tr></thead>
          <tbody>{runs.data.items.map((r: any) => (<tr key={r.id}><td><Link to={`/app/assessments/runs/${r.id}`}><code>{shortId(r.id)}</code></Link></td><td>{r.scenario_id} <span className="xs muted">v{r.scenario_version}</span></td><td>{r.phase}</td><td><Label k={r.aborted ? 'BLOCKED' : 'SIMULATED'} /></td>
            <td className="row"><a href={`/api/v1/reports/runs/${r.id}.html`} target="_blank" rel="noreferrer">HTML</a><a href={`/api/v1/reports/runs/${r.id}.json`}>JSON</a></td></tr>))}</tbody></table></div>)}
    </>
  )
}
