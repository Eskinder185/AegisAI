import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ApiError } from '../lib/api'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

/* Evidence / status labels. Used sparingly and always truthfully. */
const LABELS: Record<string, { cls: string; text: string; tip: string }> = {
  SIMULATED: { cls: 'simulated', text: 'Simulated', tip: 'Produced against a made-up fixture. No real system was touched.' },
  MEASURED: { cls: 'ok', text: 'Measured', tip: 'Measured from a real run on this machine.' },
  INFERRED: { cls: 'warn', text: 'Inferred', tip: 'A reasoned hypothesis, not confirmed.' },
  VERIFIED: { cls: 'verified', text: 'Verified (simulated)', tip: 'A re-run of the same scenario no longer shows the problem.' },
  VERIFIED_FIXED: { cls: 'verified', text: 'Verified (simulated)', tip: 'A re-run of the same scenario no longer shows the problem.' },
  VERIFIED_PRESENT: { cls: 'danger', text: 'Still present', tip: 'A re-run still shows the problem.' },
  UNVERIFIED: { cls: 'unconfigured', text: 'Not yet verified', tip: 'No re-run has confirmed the outcome yet.' },
  UNCONFIGURED: { cls: 'unconfigured', text: 'Not configured', tip: 'This optional integration is not set up.' },
  NEEDS_APPROVAL: { cls: 'needs-approval', text: 'Needs approval', tip: 'A human must approve before this can proceed.' },
  DETERMINISTIC: { cls: 'brand', text: 'Deterministic', tip: 'Computed by fixed rules, not by an AI model.' },
  AI_INTERPRETATION: { cls: 'warn', text: 'AI interpretation', tip: 'Written by a model. Not independent validation.' },
  READY: { cls: 'ok', text: 'Ready', tip: '' },
  ONLINE: { cls: 'ok', text: 'Online', tip: '' },
  OFFLINE: { cls: 'danger', text: 'Offline', tip: '' },
  BLOCKED: { cls: 'danger', text: 'Blocked', tip: '' },
}
export function Label({ k }: { k: string }) {
  const l = LABELS[k] ?? { cls: '', text: k, tip: '' }
  return (
    <span className={cx('chip', l.cls)} title={l.tip || undefined}>
      {l.text}
    </span>
  )
}
export function Sev({ s }: { s: string }) {
  return <span className={cx('chip', s)}>{s}</span>
}
export function Status({ s }: { s: string }) {
  const cls = ['succeeded', 'verified', 'resolved', 'fixed', 'approved', 'granted', 'consumed'].includes(s)
    ? 'ok'
    : ['failed', 'blocked', 'cancelled', 'revoked', 'not_improved', 'regression'].includes(s)
      ? 'danger'
      : ['running', 'queued', 'pending', 'investigating', 'remediated', 'baseline_done', 'partial'].includes(s)
        ? 'warn'
        : ''
  return <span className={cx('chip', cls)}>{s.replace(/_/g, ' ')}</span>
}

export function Btn({
  variant,
  size,
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost'; size?: 'sm' | 'lg' }) {
  return <button type="button" {...p} className={cx('btn', variant, size, className)} />
}

export function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: string }) {
  return <div className="skel" style={{ height: h, width: w }} aria-hidden="true" />
}
export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="col">
      <span className="sr-only">{label}…</span>
      <Skeleton h={28} w="40%" />
      <Skeleton h={90} />
      <Skeleton h={90} />
    </div>
  )
}
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const e = error instanceof ApiError ? error : null
  const denied = e?.status === 403
  const offline = e?.code === 'offline'
  return (
    <div className={cx('callout', denied ? 'warn' : 'danger')} role="alert">
      <strong>{denied ? 'Permission denied' : offline ? 'API unavailable' : 'Something went wrong'}</strong>
      <p className="mb0">{e?.message ?? (error instanceof Error ? error.message : 'Unexpected error')}</p>
      {e?.requestId && <p className="xs muted mb0">Request id: {e.requestId}</p>}
      {retry && !denied && (
        <Btn size="sm" className="mt" onClick={retry}>
          Try again
        </Btn>
      )}
    </div>
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current!
    const focusables = () => el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const f = focusables()
        if (!f.length) return
        const first = f[0],
          last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        {children}
        {footer && <div className="row mt2" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          className="tab"
          type="button"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function PageHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head row between">
      <div>
        <h1 style={{ fontSize: 'clamp(1.6rem,1.2rem + 1.4vw,2.1rem)' }}>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  )
}

export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* tiny accessible SVG charts, each with a text equivalent */
export function BeforeAfterBars({ rows }: { rows: { label: string; before: number; after: number }[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.before, r.after]))
  const W = 240
  return (
    <figure style={{ margin: 0 }}>
      <svg role="img" aria-label="Before and after bars" viewBox={`0 0 340 ${rows.length * 66 + 8}`} width="100%">
        {rows.map((r, i) => {
          const bw = Math.max(3, (r.before / max) * W), aw = Math.max(3, (r.after / max) * W)
          return (
            <g key={r.label} transform={`translate(0 ${i * 66 + 4})`}>
              <text x="0" y="13" fontSize="13" fill="var(--muted)">{r.label}</text>
              <rect x="0" y="21" height="14" rx="4" width={bw} fill="var(--danger)" opacity="0.8" />
              <text x={bw + 8} y="32" fontSize="13" fill="var(--text)">{r.before} before</text>
              <rect x="0" y="40" height="14" rx="4" width={aw} fill="var(--brand)" />
              <text x={aw + 8} y="51" fontSize="13" fill="var(--text)">{r.after} after</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="sr-only">{rows.map((r) => `${r.label}: ${r.before} before, ${r.after} after.`).join(' ')}</figcaption>
    </figure>
  )
}

export function Trend({ points, label }: { points: number[]; label: string }) {
  if (points.length < 2) return <p className="muted small">Run the suite at least twice to see a trend.</p>
  const w = 260, h = 70
  const max = Math.max(...points, 1)
  const xs = points.map((_, i) => 8 + (i * (w - 16)) / (points.length - 1))
  const ys = points.map((p) => h - 10 - (p / max) * (h - 20))
  return (
    <figure style={{ margin: 0 }}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: 320 }}>
        <polyline fill="none" stroke="var(--brand)" strokeWidth="2.5" points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')} />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r="3.5" fill="var(--brand)" />
        ))}
      </svg>
      <figcaption className="sr-only">{label}: {points.join(', ')}</figcaption>
    </figure>
  )
}

export function SevBar({ counts }: { counts: Record<string, number> }) {
  const order = ['critical', 'high', 'medium', 'low']
  const color: Record<string, string> = { critical: 'var(--danger)', high: '#e0663c', medium: 'var(--warn)', low: 'var(--info)' }
  const total = order.reduce((n, k) => n + (counts[k] ?? 0), 0)
  if (!total) return <p className="muted small mb0">No open findings.</p>
  return (
    <div>
      <div className="sev-bar" role="img" aria-label={order.map((k) => `${counts[k] ?? 0} ${k}`).join(', ')}>
        {order.map((k) => (
          <span key={k} style={{ width: `${((counts[k] ?? 0) / total) * 100}%`, background: color[k] }} />
        ))}
      </div>
      <p className="xs muted mt mb0">{order.map((k) => `${counts[k] ?? 0} ${k}`).join(' · ')}</p>
    </div>
  )
}

export function Diff({ lines }: { lines: string[] }) {
  return (
    <div className="diff" role="group" aria-label="Preview of the change">
      {lines.map((l, i) => (
        <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'chg'}>
          {l}
        </div>
      ))}
    </div>
  )
}

export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—')
export const shortId = (s?: string | null) => (s ? s.slice(0, 8) : '—')

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0b1b2e" />
      <path d="M16 5l9 3.5v7c0 5.2-3.6 9-9 11.5C10.6 24.5 7 20.7 7 15.5v-7L16 5z" fill="none" stroke="#2fd1c0" strokeWidth="2" />
      <path d="M12 16l3 3 5-6" fill="none" stroke="#2fd1c0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
