import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import GraphView from '../../components/GraphView'
import { EmptyState, ErrorState, Label, LoadingBlock, PageHead } from '../../components/ui'
import { get } from '../../lib/api'

export default function AttackPaths() {
  const runs = useQuery({ queryKey: ['runs-graph'], queryFn: () => get('/runs?limit=50') })
  const [pick, setPick] = useState('')
  const list = (runs.data?.items ?? []).filter((r: any) => !r.aborted)
  const rid = pick || list[0]?.id
  const g = useQuery({ queryKey: ['graph', rid], queryFn: () => get(`/runs/${rid}/graph`), enabled: !!rid })
  if (runs.isLoading) return <LoadingBlock />
  if (runs.isError) return <ErrorState error={runs.error} retry={() => runs.refetch()} />
  return (
    <>
      <PageHead title="Attack paths">An exposure map built from a stored run: assets, weaknesses, trust boundaries and the controls that are in place. Observed relationships are solid; anything that is only a possibility is dashed and labelled as a hypothesis.</PageHead>
      {list.length === 0 ? <EmptyState title="No runs to map yet" action={<Link className="btn primary mt" to="/app/verify">Start a demo</Link>}>Run an assessment, then come back to explore it.</EmptyState> : (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <div className="field mb0" style={{ minWidth: 280 }}><label htmlFor="gr">Run</label>
              <select id="gr" value={rid} onChange={(e) => setPick(e.target.value)}>{list.map((r: any) => <option key={r.id} value={r.id}>{r.scenario_id} · {r.phase} · {r.id.slice(0, 8)}</option>)}</select></div>
            <Label k="SIMULATED" />
          </div>
          {g.isLoading ? <LoadingBlock /> : g.isError ? <ErrorState error={g.error} /> : <GraphView graph={g.data} />}
        </>)}
    </>
  )
}
