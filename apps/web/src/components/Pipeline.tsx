import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api'

type S = { id: string; title: string; role: string; state: 'done' | 'active' | 'pending' | 'denied'; note?: string }

export function Pipeline({ steps, label }: { steps: S[]; label: string }) {
  return (
    <div>
      <div className="pipe" role="list" aria-label={label}>
        {steps.map((s, i) => (
          <div key={s.id} style={{ display: 'contents' }}>
            <div role="listitem" className={`pipe-node ${s.state}`} aria-current={s.state === 'active' ? 'step' : undefined}>
              <div className="role">{s.role}</div>
              <div className="small" style={{ fontWeight: 550 }}>{s.title}</div>
              <div className="xs muted" style={{ marginTop: 4 }}>{s.state === 'done' ? 'done' : s.state === 'active' ? 'running now' : s.state === 'denied' ? 'denied by policy' : 'pending'}{s.note ? ` · ${s.note}` : ''}</div>
            </div>
            {i < steps.length - 1 && <div className={`pipe-link ${s.state === 'done' ? 'done' : s.state === 'active' ? 'active' : ''}`} aria-hidden="true" />}
          </div>))}
      </div>
    </div>
  )
}

function usePlan(scenarioId?: string) {
  return useQuery({ queryKey: ['plan', scenarioId], queryFn: () => get(`/assistant/plan/${scenarioId}`), enabled: !!scenarioId })
}

/** Live pipeline for a real queued/running job: states come from the job's persisted progress. */
export function JobPipeline({ scenarioId, job }: { scenarioId: string; job: { status: string; progress_done: number } }) {
  const plan = usePlan(scenarioId)
  if (!plan.data) return null
  const steps: S[] = plan.data.steps.map((s: any, i: number) => {
    const last = i === plan.data.steps.length - 1
    let state: S['state'] = 'pending'
    if (job.status === 'succeeded') state = 'done'
    else if (job.status === 'running') state = last ? 'pending' : i < job.progress_done ? 'done' : i === job.progress_done ? 'active' : 'pending'
    else if (job.status === 'blocked' && i === job.progress_done) state = 'denied'
    else if (!last && i < job.progress_done) state = 'done'
    return { id: s.id, title: s.title, role: s.assigned_to, state }
  })
  return <Pipeline steps={steps} label="Agent orchestration for the current job (live state)" />
}

/** Recorded pipeline for a finished run: every state is taken from the stored policy trail. */
export function RunPipeline({ run }: { run: any }) {
  const plan = usePlan(run?.scenario_id)
  if (!plan.data || !run?.steps) return null
  const byId: Record<string, any> = Object.fromEntries(run.steps.map((s: any) => [s.step, s]))
  const steps: S[] = plan.data.steps.map((s: any) => {
    if (s.id === 'verify') return { id: s.id, title: s.title, role: s.assigned_to, state: run.verifier ? (run.verifier.passed ? 'done' : 'denied') : 'pending', note: run.verifier ? (run.verifier.passed ? 'all checks passed' : 'a check failed') : undefined }
    const r = byId[s.id]
    return { id: s.id, title: s.title, role: s.assigned_to, state: !r ? 'pending' : r.policy.allowed ? 'done' : 'denied', note: r ? r.policy.code : undefined }
  })
  return <Pipeline steps={steps} label="Recorded agent orchestration for this run" />
}
