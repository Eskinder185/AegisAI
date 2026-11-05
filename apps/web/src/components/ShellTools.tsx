import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { get } from '../lib/api'
import { useAuth, useToast, useTheme, useViewMode } from '../lib/app-context'
import { Modal, fmtTime } from './ui'

export const PAGES: [string, string, string][] = [
  ['/app', 'Overview', 'o'], ['/app/lab', 'My Lab', 'l'], ['/app/assessments', 'Assessments', 'a'],
  ['/app/investigations', 'Investigations', 'i'], ['/app/verify', 'Verify Fixes', 'v'], ['/app/agents', 'AI Agents', 'e'],
  ['/app/attack-paths', 'Attack Paths', 'p'], ['/app/ai-security', 'AI Security', 't'], ['/app/cloud', 'Cloud Checks', 'c'],
  ['/app/findings', 'Findings', 'f'], ['/app/reports', 'Reports', 'r'], ['/app/settings', 'Settings', 's'],
]

/* ---------------- breadcrumbs ---------------- */
const LABEL: Record<string, string> = { app: 'Home', lab: 'My Lab', assessments: 'Assessments', runs: 'Run', investigations: 'Investigations', verify: 'Verify Fixes', agents: 'AI Agents', 'attack-paths': 'Attack Paths', 'ai-security': 'AI Security', cloud: 'Cloud Checks', findings: 'Findings', reports: 'Reports', settings: 'Settings' }
export function Breadcrumbs() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length <= 1) return null
  let acc = ''
  const crumbs = parts.map((p, i) => {
    acc += `/${p}`
    const isId = /^[0-9a-f-]{20,}$/.test(p)
    return { to: acc, label: isId ? p.slice(0, 8) : (LABEL[p] ?? p), last: i === parts.length - 1, skip: p === 'runs' }
  }).filter((c) => !c.skip)
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>{crumbs.map((c) => <li key={c.to}>{c.last ? <span aria-current="page">{c.label}</span> : <Link to={c.to}>{c.label}</Link>}</li>)}</ol>
    </nav>
  )
}

/* ---------------- copyable identifier ---------------- */
export function CopyId({ id, label }: { id: string; label?: string }) {
  const { push } = useToast()
  return (
    <button type="button" className="btn sm ghost" style={{ minHeight: 28, padding: '0 .4rem' }} aria-label={`Copy ${label ?? 'identifier'} ${id}`}
      onClick={() => navigator.clipboard?.writeText(id).then(() => push(`Copied ${id}`), () => push('Copy is not available in this browser.', true))}>
      <code>{id}</code> <span aria-hidden="true">⧉</span>
    </button>
  )
}

/* ---------------- command palette ---------------- */
type Item = { group: string; title: string; sub?: string; run: () => void }
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const { theme, setTheme } = useTheme()
  const { advanced, setMode } = useViewMode()
  const { logout } = useAuth()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listId = useId()
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(t) }, [q])
  const found = useQuery({ queryKey: ['search', debounced], queryFn: () => get(`/search?q=${encodeURIComponent(debounced)}`), enabled: debounced.length >= 2 })
  const go = (to: string) => () => { onClose(); nav(to) }
  const items: Item[] = useMemo(() => {
    const base: Item[] = [
      ...PAGES.map(([to, label, k]): Item => ({ group: 'Go to', title: label, sub: `g then ${k}`, run: go(to) })),
      { group: 'Actions', title: 'Run safe demo (Demo 1)', run: go('/app/verify') },
      { group: 'Actions', title: `Switch to ${advanced ? 'Guided' : 'Analyst'} view`, run: () => { onClose(); setMode(advanced ? 'guided' : 'analyst') } },
      { group: 'Actions', title: 'Sign out', run: () => { onClose(); logout().then(() => nav('/')) } },
      { group: 'Actions', title: `Theme: switch to ${theme === 'dark' ? 'light' : 'dark'}`, run: () => { onClose(); setTheme(theme === 'dark' ? 'light' : 'dark') } },
    ]
    const ql = q.trim().toLowerCase()
    const filtered = ql ? base.filter((i) => i.title.toLowerCase().includes(ql)) : base
    const remote: Item[] = (found.data?.results ?? []).map((r: any) => ({ group: r.type, title: r.title, sub: r.sub, run: go(r.link) }))
    return [...remote, ...filtered]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, found.data, advanced, theme, logout])
  useEffect(() => { setSel(0) }, [q, found.data])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run() }
    else if (e.key === 'Escape') onClose()
  }
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  useEffect(() => { document.getElementById(`${listId}-${sel}`)?.scrollIntoView?.({ block: 'nearest' }) }, [sel, listId])
  let last = ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input ref={ref} type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={items[sel] ? `${listId}-${sel}` : undefined}
          aria-autocomplete="list" placeholder="Search findings, incidents, runs, or jump to a page…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} aria-label="Search or run a command" />
        <ul id={listId} role="listbox" aria-label="Results">
          {items.map((it, i) => {
            const head = it.group !== last ? <li key={`g${i}`} className="grp" role="presentation">{it.group}</li> : null
            last = it.group
            return (<span key={i} style={{ display: 'contents' }}>{head}<li id={`${listId}-${i}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={it.run}><span>{it.title}</span>{it.sub && <span className="xs muted">{it.sub}</span>}</li></span>)
          })}
          {items.length === 0 && <li role="presentation" className="muted">{found.isFetching ? 'Searching…' : 'No matches.'}</li>}
        </ul>
        <p className="xs muted" style={{ padding: '0 1rem .6rem', margin: 0 }}><kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</p>
      </div>
    </div>
  )
}

/* ---------------- notification center ---------------- */
export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState<string[]>(() => JSON.parse(localStorage.getItem('aegis-seen') ?? '[]'))
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => get('/notifications'), refetchInterval: 8000 })
  const items: any[] = q.data?.items ?? []
  const unread = items.filter((i) => !seen.includes(i.id))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  const markAll = () => { const ids = items.map((i) => i.id).slice(0, 200); setSeen(ids); localStorage.setItem('aegis-seen', JSON.stringify(ids)) }
  return (
    <div className="bell" ref={ref}>
      <button type="button" className="btn ghost icon-btn" aria-expanded={open} aria-haspopup="true" aria-label={`Notifications, ${unread.length} unread`} onClick={() => setOpen(!open)}><span aria-hidden="true">🔔</span></button>
      {unread.length > 0 && <span className="count" aria-hidden="true">{unread.length}</span>}
      {open && (
        <div className="popover" role="region" aria-label="Notifications">
          <div className="row between"><strong>Notifications</strong><button type="button" className="btn sm ghost" onClick={markAll} disabled={!unread.length}>Mark all read</button></div>
          <p className="xs muted">Derived from live jobs, approvals, findings and incidents. Read state is stored in this browser only.</p>
          {items.length === 0 ? <p className="muted small">Nothing yet. Start a demo to see activity.</p> : items.map((i) => (
            <Link key={i.id} to={i.link} className={`item ${i.level}${seen.includes(i.id) ? '' : ' unread'}`} onClick={() => setOpen(false)}>
              <strong>{i.title}</strong>{i.detail && <div className="small muted">{i.detail}</div>}<div className="xs muted">{fmtTime(i.at)}</div>
            </Link>))}
        </div>)}
    </div>
  )
}

/* ---------------- shortcuts ---------------- */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} footer={<button className="btn" type="button" onClick={onClose}>Close</button>}>
      <dl className="kv">
        <dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd></dt><dd>Command palette and global search</dd>
        <dt><kbd>?</kbd></dt><dd>This help</dd>
        {PAGES.map(([, label, k]) => <div key={k} style={{ display: 'contents' }}><dt><kbd>g</kbd> then <kbd>{k}</kbd></dt><dd>{label}</dd></div>)}
      </dl>
    </Modal>
  )
}
