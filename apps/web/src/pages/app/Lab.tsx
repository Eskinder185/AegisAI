import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Btn, EmptyState, ErrorState, Label, LoadingBlock, Modal, PageHead, Status } from '../../components/ui'
import { errMsg, get, patch, post } from '../../lib/api'
import { useAuth, useToast, useViewMode } from '../../lib/app-context'

const ACTIONS = ['passive_http_check', 'config_analysis', 'log_replay', 'agent_eval', 'apply_fixture_change', 'rollback_fixture_change']

function ScopeReview({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['scope', id], queryFn: () => get(`/targets/${id}/scope-review`) })
  const [action, setAction] = useState('passive_http_check')
  const [dest, setDest] = useState('')
  const check = useMutation({ mutationFn: () => post(`/targets/${id}/policy-check`, { action, destination: dest || null }) })
  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} />
  return (
    <div className="col">
      <p className="small muted">Mode <strong>{q.data.mode}</strong>{q.data.kill_switch && ' · kill switch ENGAGED'}. Each action below shows whether the policy engine would permit it right now, and why.</p>
      <div className="table-wrap"><table><thead><tr><th>Action</th><th>Decision</th><th>Reason</th></tr></thead>
        <tbody>{q.data.actions.map((a: any) => (
          <tr key={a.action}><td><code>{a.action}</code></td><td>{a.allowed ? <span className="chip ok">allowed{a.requires_approval ? ' + approval' : ''}</span> : <span className="chip danger">blocked</span>}</td><td className="small">{a.reason}</td></tr>))}</tbody></table></div>
      <form className="card flat tight" onSubmit={(e) => { e.preventDefault(); check.mutate() }} aria-label="Policy tester">
        <h3 style={{ fontSize: '1rem' }}>Policy tester (dry run — no network is contacted)</h3>
        <div className="grid c2">
          <div className="field mb0"><label htmlFor={`pa-${id}`}>Action</label><select id={`pa-${id}`} value={action} onChange={(e) => setAction(e.target.value)}>{[...ACTIONS, 'exploit', 'network_scan'].map((a) => <option key={a}>{a}</option>)}</select></div>
          <div className="field mb0"><label htmlFor={`pd-${id}`}>Destination (optional)</label><input id={`pd-${id}`} type="text" placeholder="e.g. http://169.254.169.254/ or fixture://demo-web.fixture/" value={dest} onChange={(e) => setDest(e.target.value)} /></div>
        </div>
        <Btn type="submit" className="mt" size="sm" disabled={check.isPending}>Check</Btn>
        <div aria-live="polite" className="mt">{check.data && <div className={`callout ${check.data.allowed ? 'ok' : 'danger'}`}><strong>{check.data.allowed ? 'Allowed' : 'Blocked'}</strong> <code>{check.data.code}</code><div>{check.data.reason}</div></div>}
          {check.isError && <p className="err">{errMsg(check.error)}</p>}</div>
      </form>
    </div>
  )
}

function NewTarget({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { push } = useToast()
  const [f, setF] = useState({ slug: '', name: '', owner: '', purpose: '', environment: 'lab_container', hosts: '', cidrs: '172.28.0.0/24', actions: ['passive_http_check'] as string[] })
  const m = useMutation({
    mutationFn: () => post('/targets', { slug: f.slug, name: f.name, owner: f.owner, purpose: f.purpose, environment: f.environment, kind: 'web', hosts: f.hosts.split(',').map((s) => s.trim()).filter(Boolean), cidrs: f.cidrs.split(',').map((s) => s.trim()).filter(Boolean), allowed_actions: f.actions, window_hours: 24 }),
    onSuccess: () => { push('Target registered as pending. It cannot run until approved and the mode allows it.'); qc.invalidateQueries({ queryKey: ['targets'] }); onClose() },
  })
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal title="Register a lab target" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" type="submit" form="nt" disabled={m.isPending}>Register (pending approval)</Btn></>}>
      <form id="nt" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate() }}>
        <p className="callout warn small">New targets start <strong>pending</strong>. In this version only fixtures run; lab containers also need LOCAL_LAB mode, and external hosts are refused.</p>
        <div className="grid c2">
          <div className="field"><label htmlFor="n-slug">Short id</label><input id="n-slug" type="text" required pattern="[a-z0-9][a-z0-9-]{1,58}" value={f.slug} onChange={set('slug')} /><div className="hint">lowercase, digits, hyphens</div></div>
          <div className="field"><label htmlFor="n-name">Name</label><input id="n-name" type="text" required value={f.name} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="n-owner">Owner</label><input id="n-owner" type="text" required value={f.owner} onChange={set('owner')} /></div>
          <div className="field"><label htmlFor="n-env">Environment</label><select id="n-env" value={f.environment} onChange={set('environment')}><option value="fixture">fixture</option><option value="lab_container">lab_container</option><option value="external">external (always blocked)</option></select></div>
        </div>
        <div className="field"><label htmlFor="n-purpose">Purpose</label><input id="n-purpose" type="text" required minLength={3} value={f.purpose} onChange={set('purpose')} /></div>
        <div className="grid c2">
          <div className="field"><label htmlFor="n-hosts">Allowed hosts</label><input id="n-hosts" type="text" placeholder="lab-web" value={f.hosts} onChange={set('hosts')} /><div className="hint">Bare container names, comma-separated</div></div>
          <div className="field"><label htmlFor="n-cidrs">Scope CIDRs</label><input id="n-cidrs" type="text" value={f.cidrs} onChange={set('cidrs')} /><div className="hint">Private ranges only, /16 or smaller</div></div>
        </div>
        {m.isError && <p className="err" role="alert">{errMsg(m.error)}</p>}
      </form>
    </Modal>
  )
}

export default function Lab() {
  const { can } = useAuth()
  const { advanced } = useViewMode()
  const { push } = useToast()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['targets'], queryFn: () => get('/targets') })
  const [sel, setSel] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const approve = useMutation({
    mutationFn: (v: { id: string; s: string }) => patch(`/targets/${v.id}`, { approval_status: v.s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['targets'] }),
    onError: (e) => push(errMsg(e), true),
  })
  const reset = useMutation({
    mutationFn: (id: string) => post(`/targets/${id}/reset-fixture`),
    onSuccess: () => { push('Fixture restored to its original state.'); qc.invalidateQueries() },
    onError: (e) => push(errMsg(e), true),
  })
  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  return (
    <>
      <PageHead title="My Lab" actions={can('admin') ? <Btn onClick={() => setCreating(true)}>Register target</Btn> : undefined}>
        Everything AegisAI is allowed to touch. Anything not listed here — or not approved — is blocked.
      </PageHead>
      {q.data.length === 0 ? <EmptyState title="No targets">Run the seed script to create the demo targets.</EmptyState> : (
        <div className="grid c2">
          {q.data.map((t: any) => (
            <article key={t.id} className="card" aria-labelledby={`t-${t.id}`}>
              <div className="row between"><h2 id={`t-${t.id}`} style={{ fontSize: '1.15rem', margin: 0 }}>{t.name}</h2>
                <span className="row">{t.environment === 'fixture' && <Label k="SIMULATED" />}<Status s={t.approval_status} /></span></div>
              <p className="small muted mt">{t.purpose}</p>
              <dl className="kv small">
                <dt>Environment</dt><dd>{t.environment}</dd><dt>Owner</dt><dd>{t.owner}</dd><dt>Criticality</dt><dd>{t.criticality}</dd>
                {advanced && <><dt>Hosts</dt><dd><code>{t.hosts.join(', ') || '—'}</code></dd><dt>CIDRs</dt><dd><code>{t.cidrs.join(', ') || '—'}</code></dd><dt>Allowed actions</dt><dd>{t.allowed_actions.join(', ')}</dd><dt>Rate limit</dt><dd>{t.rate_limit_per_min}/min</dd><dt>Fixture version</dt><dd>{t.fixture_version}</dd></>}
              </dl>
              {t.tags.map((x: string) => <span key={x} className="chip" style={{ marginRight: 4 }}>{x}</span>)}
              <div className="row mt">
                <Btn size="sm" aria-expanded={sel === t.id} onClick={() => setSel(sel === t.id ? null : t.id)}>{sel === t.id ? 'Hide scope review' : 'Scope review'}</Btn>
                {can('admin') && t.scenario_id && <Btn size="sm" onClick={() => reset.mutate(t.id)} disabled={reset.isPending}>Reset fixture</Btn>}
                {can('admin') && !t.scenario_id && t.approval_status !== 'approved' && <Btn size="sm" onClick={() => approve.mutate({ id: t.id, s: 'approved' })}>Approve scope</Btn>}
                {can('admin') && !t.scenario_id && t.approval_status === 'approved' && <Btn size="sm" onClick={() => approve.mutate({ id: t.id, s: 'revoked' })}>Revoke</Btn>}
              </div>
              {sel === t.id && <div className="mt"><ScopeReview id={t.id} /></div>}
            </article>
          ))}
        </div>
      )}
      {creating && <NewTarget onClose={() => setCreating(false)} />}
    </>
  )
}
