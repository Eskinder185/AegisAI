import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Btn, Logo, Modal } from '../../components/ui'
import { ThemeToggle } from '../public/PublicLayout'
import { errMsg, get, post } from '../../lib/api'
import { useAuth, useToast, useViewMode } from '../../lib/app-context'
import Onboarding from './Onboarding'
import { Breadcrumbs, CommandPalette, NotificationCenter, PAGES, ShortcutsHelp } from '../../components/ShellTools'

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
const NAV: [string, string, string][] = [
  ['/app', 'Overview', 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10'],
  ['/app/lab', 'My Lab', 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3'],
  ['/app/assessments', 'Assessments', 'M9 11l3 3 8-8M4 12v7a1 1 0 0 0 1 1h14'],
  ['/app/investigations', 'Investigations', 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5'],
  ['/app/verify', 'Verify Fixes', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4'],
  ['/app/agents', 'AI Agents', 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8L12 3z'],
  ['/app/attack-paths', 'Attack Paths', 'M5 6a2 2 0 1 0 0-.01M19 6a2 2 0 1 0 0-.01M12 19a2 2 0 1 0 0-.01M7 7l4 10M17 7l-4 10M7 6h10'],
  ['/app/ai-security', 'AI Security', 'M12 8V4M8 4h8M5 8h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM9 13h.01M15 13h.01'],
  ['/app/cloud', 'Cloud Checks', 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7z'],
  ['/app/findings', 'Findings', 'M12 3l9 16H3L12 3zM12 10v4M12 17h.01'],
  ['/app/reports', 'Reports', 'M6 3h9l4 4v14H6V3zM14 3v5h5M9 13h6M9 17h6'],
  ['/app/settings', 'Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L10 21h4l.6-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z'],
]

export default function Shell() {
  const { user, loading, logout, can, savePrefs } = useAuth()
  const { advanced, setMode } = useViewMode()
  const loc = useLocation()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { push } = useToast()
  const [open, setOpen] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('aegis-collapsed') === '1')
  useEffect(() => { localStorage.setItem('aegis-collapsed', collapsed ? '1' : '0') }, [collapsed])
  useEffect(() => {
    let chord = 0
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); return }
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable], [role=dialog]') || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '?') { setHelp(true); return }
      if (e.key === 'g') { chord = Date.now(); return }
      if (chord && Date.now() - chord < 1200) {
        const hit = PAGES.find(([, , k]) => k === e.key)
        chord = 0
        if (hit) nav(hit[0])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [nav])
  const status = useQuery({ queryKey: ['status'], queryFn: () => get('/system/status'), enabled: !!user, refetchInterval: 8000 })
  const kill = useMutation({
    mutationFn: (engaged: boolean) => post('/system/kill-switch', { engaged }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => push(errMsg(e), true),
  })
  const stop = useMutation({
    mutationFn: () => post('/system/emergency-stop'),
    onSuccess: (r) => {
      push(`Emergency stop: kill switch engaged, ${r.jobs_cancelled} job(s) cancelled.`)
      qc.invalidateQueries()
      setConfirmStop(false)
    },
    onError: (e) => push(errMsg(e), true),
  })
  if (loading) return <div className="container" style={{ padding: '4rem 0' }} role="status">Loading…</div>
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  const s = status.data
  const worker = s?.worker?.state ?? 'UNKNOWN'
  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}`}>
      <a className="skip-link" href="#content">Skip to content</a>
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Primary">
        <Link to="/app" className="brand" onClick={() => setOpen(false)}><Logo /> <span className="name">AegisAI</span></Link>
        <nav aria-label="App" onClick={() => setOpen(false)}>
          {NAV.map(([to, label, d]) => (
            <NavLink key={to} to={to} end={to === '/app'} className="nav" aria-label={label} title={label}>{I(d)} <span className="label">{label}</span></NavLink>
          ))}
        </nav>
        <div className="foot">
          <p className="mb0">Signed in as<br /><strong style={{ color: '#fff' }}>{user.display_name}</strong> <span className="chip" style={{ marginLeft: 4 }}>{user.role}</span></p>
          <p><Link to="/" style={{ color: '#9fe7de' }}>Public site</Link></p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon-btn menu-btn" type="button" aria-label="Open menu" onClick={() => setOpen(!open)} aria-expanded={open}>☰</button>
          <span className="chip simulated" title="All evidence is produced against fixtures">Simulated lab</span>
          <span className="chip hide-sm" title="Policy mode. External targets are disabled in this version.">{s?.mode ?? '…'}</span>
          <span className="chip" title={`Worker: ${worker}`}><span className={`dot ${worker === 'ONLINE' ? 'ok' : 'bad'}`} /><span className="hide-sm"> Worker {worker.toLowerCase()}</span><span className="sr-only sm-only"> worker {worker.toLowerCase()}</span></span>
          {s?.kill_switch && <span className="chip danger">Kill switch engaged</span>}
          <button type="button" onClick={() => setCollapsed(!collapsed)} aria-pressed={collapsed} className="btn ghost icon-btn hide-sm" aria-label="Collapse sidebar" title="Collapse sidebar">⇔</button>
          <button type="button" className="btn sm" onClick={() => setPalette(true)} aria-keyshortcuts="Control+K Meta+K">Search <kbd>Ctrl K</kbd></button>
          <span className="grow" />
          <NotificationCenter />
          <button type="button" className="btn ghost icon-btn hide-sm" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}>?</button>
          <div className="row hide-sm" role="group" aria-label="View mode">
            <Btn size="sm" variant={advanced ? undefined : 'primary'} aria-pressed={!advanced} onClick={() => setMode('guided')}>Guided</Btn>
            <Btn size="sm" variant={advanced ? 'primary' : undefined} aria-pressed={advanced} onClick={() => setMode('analyst')}>Analyst</Btn>
          </div>
          <ThemeToggle />
          {can('admin') && (
            s?.kill_switch
              ? <Btn size="sm" onClick={() => kill.mutate(false)}>Release kill switch</Btn>
              : <Btn size="sm" variant="danger" onClick={() => setConfirmStop(true)}>Emergency stop</Btn>
          )}
          <Btn size="sm" variant="ghost" className="hide-sm" onClick={async () => { await logout(); nav('/') }}>Sign out</Btn>
        </header>
        <div className="content" id="content" tabIndex={-1}>
          <Breadcrumbs />
          <Outlet />
        </div>
      </div>
      {confirmStop && (
        <Modal title="Emergency stop" onClose={() => setConfirmStop(false)} footer={<><Btn onClick={() => setConfirmStop(false)}>Keep running</Btn><Btn variant="danger" onClick={() => stop.mutate()} disabled={stop.isPending}>Engage and cancel jobs</Btn></>}>
          <p>This engages the global kill switch and cancels every queued or running job. Nothing new can run until an admin releases it. The action is written to the audit log.</p>
        </Modal>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      {!user.preferences?.onboarded && <Onboarding onDone={() => savePrefs({ onboarded: true })} />}
    </div>
  )
}
