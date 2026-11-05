import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Btn, ErrorState, Label, LoadingBlock, Modal, PageHead, Tabs, fmtTime } from '../../components/ui'
import { errMsg, get, patch, post, put } from '../../lib/api'
import { useAuth, useToast } from '../../lib/app-context'

function Workspace() {
  const { can } = useAuth()
  const { push } = useToast()
  const qc = useQueryClient()
  const st = useQuery({ queryKey: ['status'], queryFn: () => get('/system/status') })
  const mode = useMutation({ mutationFn: (m: string) => put('/system/mode', { mode: m }), onSuccess: () => { push('Policy mode updated.'); qc.invalidateQueries() }, onError: (e) => push(errMsg(e), true) })
  const kill = useMutation({ mutationFn: (e: boolean) => post('/system/kill-switch', { engaged: e }), onSuccess: () => qc.invalidateQueries(), onError: (e) => push(errMsg(e), true) })
  if (st.isLoading) return <LoadingBlock />
  if (st.isError) return <ErrorState error={st.error} />
  const s = st.data
  return (
    <div className="grid c2">
      <section className="card"><h2 style={{ fontSize: '1.15rem' }}>Policy mode</h2>
        <p className="small muted">SIMULATION_ONLY runs fixtures only. LOCAL_LAB additionally allows AegisAI-managed lab containers (none ship in this version). EXTERNAL_AUTHORIZED is designed but disabled.</p>
        <div className="field"><label htmlFor="mode">Mode</label><select id="mode" value={s.mode} disabled={!can('admin') || mode.isPending} onChange={(e) => mode.mutate(e.target.value)}><option>SIMULATION_ONLY</option><option>LOCAL_LAB</option><option value="EXTERNAL_AUTHORIZED">EXTERNAL_AUTHORIZED (disabled)</option></select>{!can('admin') && <div className="hint">Admins only.</div>}</div></section>
      <section className="card"><h2 style={{ fontSize: '1.15rem' }}>Kill switch</h2>
        <p className="small muted">Stops all running jobs at their next step and blocks new ones until released.</p>
        <p>Status: {s.kill_switch ? <span className="chip danger">ENGAGED</span> : <span className="chip ok">released</span>}</p>
        <Btn variant={s.kill_switch ? undefined : 'danger'} disabled={!can('admin') || kill.isPending} onClick={() => kill.mutate(!s.kill_switch)}>{s.kill_switch ? 'Release kill switch' : 'Engage kill switch'}</Btn></section>
      <section className="card"><h2 style={{ fontSize: '1.15rem' }}>AI model provider</h2>
        <p><Label k={s.model.state === 'UNCONFIGURED' ? 'UNCONFIGURED' : s.model.state === 'READY' ? 'READY' : 'BLOCKED'} /> <strong>{s.model.provider}</strong></p>
        <p className="small muted">{s.model.detail}</p>
        <p className="xs muted mb0">Configure with environment variables (<code>AEGIS_MODEL_PROVIDER=ollama</code>). Secret values are never displayed. With no provider, every feature still works.</p></section>
      <section className="card"><h2 style={{ fontSize: '1.15rem' }}>Integrations</h2>
        <ul className="mb0" style={{ listStyle: 'none', padding: 0 }}>{s.integrations.map((i: any) => (<li key={i.id} style={{ padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}><div className="row between"><strong>{i.name}</strong><Label k={i.state} /></div><div className="xs muted">{i.detail}</div></li>))}</ul></section>
    </div>
  )
}

function People() {
  const { user } = useAuth()
  const { push } = useToast()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['users'], queryFn: () => get('/users') })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ email: '', display_name: '', role: 'viewer', password: '' })
  const upd = useMutation({ mutationFn: (v: { id: string; b: any }) => patch(`/users/${v.id}`, v.b), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError: (e) => push(errMsg(e), true) })
  const add = useMutation({ mutationFn: () => post('/users', f), onSuccess: () => { setOpen(false); push('User created.'); qc.invalidateQueries({ queryKey: ['users'] }) } })
  if (user?.role !== 'admin') return <div className="callout warn">User management is limited to admins.</div>
  if (q.isLoading) return <LoadingBlock />
  if (q.isError) return <ErrorState error={q.error} />
  return (
    <>
      <div className="row between"><p className="muted small">Roles: <strong>admin</strong> manages scope and safety; <strong>analyst</strong> runs and approves fixture changes; <strong>viewer</strong> is read-only.</p><Btn onClick={() => setOpen(true)}>Add user</Btn></div>
      <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Active</th><th /></tr></thead>
        <tbody>{q.data.map((u: any) => (<tr key={u.id}><td><strong>{u.display_name}</strong><div className="xs muted">{u.email}{u.dev_seeded && ' · development seed account'}</div></td>
          <td><label className="sr-only" htmlFor={`r-${u.id}`}>Role for {u.email}</label><select id={`r-${u.id}`} style={{ width: 'auto' }} value={u.role} disabled={u.id === user.id} onChange={(e) => upd.mutate({ id: u.id, b: { role: e.target.value } })}>{['admin', 'analyst', 'viewer'].map((r) => <option key={r}>{r}</option>)}</select></td>
          <td>{u.is_active ? 'Yes' : 'No'}</td><td>{u.id !== user.id && <Btn size="sm" onClick={() => upd.mutate({ id: u.id, b: { is_active: !u.is_active } })}>{u.is_active ? 'Disable' : 'Enable'}</Btn>}</td></tr>))}</tbody></table></div>
      {open && (
        <Modal title="Add a user" onClose={() => setOpen(false)} footer={<><Btn onClick={() => setOpen(false)}>Cancel</Btn><Btn variant="primary" type="submit" form="nu" disabled={add.isPending}>Create user</Btn></>}>
          <form id="nu" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
            <div className="field"><label htmlFor="ue">Email</label><input id="ue" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="un">Display name</label><input id="un" type="text" required value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
            <div className="field"><label htmlFor="ur">Role</label><select id="ur" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>viewer</option><option>analyst</option><option>admin</option></select></div>
            <div className="field"><label htmlFor="up">Password (12+ characters)</label><input id="up" type="password" autoComplete="new-password" minLength={12} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            {add.isError && <p className="err" role="alert">{errMsg(add.error)}</p>}
          </form>
        </Modal>)}
    </>
  )
}

function DataAudit() {
  const { can } = useAuth()
  const { push } = useToast()
  const qc = useQueryClient()
  const [reset, setReset] = useState(false)
  const [txt, setTxt] = useState('')
  const set = useQuery({ queryKey: ['settings'], queryFn: () => get('/settings') })
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => get('/audit?limit=50'), enabled: can('analyst') })
  const ver = useQuery({ queryKey: ['audit-verify'], queryFn: () => get('/audit/verify'), enabled: can('analyst') })
  const doReset = useMutation({ mutationFn: () => post('/settings/reset-demo', { confirm: 'RESET DEMO DATA' }), onSuccess: () => { push('Demo data reset. Audit log kept.'); setReset(false); setTxt(''); qc.invalidateQueries() }, onError: (e) => push(errMsg(e), true) })
  const ret = useMutation({ mutationFn: (d: number) => put('/settings/retention', { days: d }), onSuccess: () => { push('Retention saved.'); qc.invalidateQueries({ queryKey: ['settings'] }) }, onError: (e) => push(errMsg(e), true) })
  const purge = useMutation({ mutationFn: () => post('/settings/purge-expired'), onSuccess: (r) => push(`${r.runs_deleted} expired run(s) deleted.`), onError: (e) => push(errMsg(e), true) })
  if (set.isLoading) return <LoadingBlock />
  if (set.isError) return <ErrorState error={set.error} />
  return (
    <div className="col">
      <div className="grid c2">
        <section className="card"><h2 style={{ fontSize: '1.15rem' }}>Retention</h2>
          <div className="field"><label htmlFor="ret">Keep run records for (days)</label><input id="ret" type="number" min={1} max={3650} defaultValue={set.data.retention_days} disabled={!can('admin')} onBlur={(e) => can('admin') && Number(e.target.value) !== set.data.retention_days && ret.mutate(Number(e.target.value))} /></div>
          <Btn size="sm" disabled={!can('admin')} onClick={() => purge.mutate()}>Delete runs older than this now</Btn></section>
        <section className="card"><h2 style={{ fontSize: '1.15rem' }}>Export & reset</h2>
          <div className="row"><a className="btn" aria-disabled={!can('admin')} href={can('admin') ? '/api/v1/settings/export' : undefined}>Safe config export</a><a className="btn" aria-disabled={!can('admin')} href={can('admin') ? '/api/v1/settings/export-data' : undefined}>Export demo data</a></div>
          <p className="xs muted">Config export contains policy and structure only — no secrets or password hashes.</p>
          <Btn variant="danger" disabled={!can('admin')} onClick={() => setReset(true)}>Reset demo data…</Btn></section>
      </div>
      <section className="card"><div className="row between"><h2 style={{ fontSize: '1.15rem' }}>Audit log</h2>
        {ver.data && <span className={`chip ${ver.data.ok ? 'ok' : 'danger'}`}>{ver.data.ok ? `Hash chain intact (${ver.data.checked} entries)` : `Chain BROKEN at entry ${ver.data.broken_at}`}</span>}</div>
        {!can('analyst') ? <p className="muted">Audit access requires analyst or admin.</p> : audit.isLoading ? <LoadingBlock /> : audit.isError ? <ErrorState error={audit.error} /> : (
          <div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Outcome</th><th>Target</th></tr></thead>
            <tbody>{audit.data.items.map((a: any) => (<tr key={a.id}><td className="small">{fmtTime(a.ts)}</td><td className="small">{a.actor}</td><td><code>{a.action}</code></td><td><span className={`chip ${a.outcome === 'denied' || a.outcome === 'error' ? 'danger' : 'ok'}`}>{a.outcome}</span></td><td className="small">{a.target_ref ?? ''}</td></tr>))}</tbody></table></div>)}</section>
      {reset && (<Modal title="Reset demo data" onClose={() => setReset(false)} footer={<><Btn onClick={() => setReset(false)}>Cancel</Btn><Btn variant="danger" disabled={txt !== 'RESET DEMO DATA' || doReset.isPending} onClick={() => doReset.mutate()}>Delete demo data</Btn></>}>
        <p>This deletes runs, findings, incidents, cases and approvals and restores every fixture. The audit log is append-only and is kept.</p>
        <div className="field"><label htmlFor="rc">Type <code>RESET DEMO DATA</code> to confirm</label><input id="rc" type="text" value={txt} onChange={(e) => setTxt(e.target.value)} /></div></Modal>)}
    </div>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('workspace')
  return (
    <>
      <PageHead title="Settings">Safety controls, people, integrations, data retention and the audit trail.</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'workspace', label: 'Safety & integrations' }, { id: 'people', label: 'People' }, { id: 'data', label: 'Data & audit' }]} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{tab === 'workspace' ? <Workspace /> : tab === 'people' ? <People /> : <DataAudit />}</div>
    </>
  )
}
