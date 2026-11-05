import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '../../components/ui'
import { useAuth, useTheme } from '../../lib/app-context'

const LINKS = [
  ['/product', 'Product'],
  ['/how-it-works', 'How it works'],
  ['/red-team', 'Red team'],
  ['/blue-team', 'Blue team'],
  ['/purple-team', 'Purple team'],
  ['/ai-security', 'AI security'],
  ['/cloud-posture', 'Cloud'],
  ['/docs', 'Docs'],
  ['/faq', 'FAQ'],
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  return (
    <button className="btn ghost icon-btn" type="button" onClick={() => setTheme(next)} aria-label={`Theme: ${theme}. Switch to ${next}`} title={`Theme: ${theme}`}>
      <span aria-hidden="true">{theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️'}</span>
    </button>
  )
}

export default function PublicLayout() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const loc = useLocation()
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="pub-header">
        <div className="inner">
          <Link to="/" className="brand" aria-label="AegisAI home">
            <Logo /> AegisAI
          </Link>
          <button className="btn ghost nav-toggle" type="button" aria-expanded={open} aria-controls="pubnav" onClick={() => setOpen(!open)}>
            Menu
          </button>
          <nav id="pubnav" aria-label="Main" className={`nav-links${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
            {LINKS.map(([to, label]) => (
              <NavLink key={to} to={to}>{label}</NavLink>
            ))}
          </nav>
          <div className="actions row" style={{ marginLeft: 'auto' }}>
            <ThemeToggle />
            <Link className="btn primary" to={user ? '/app' : '/login'}>{user ? 'Open app' : 'Open demo lab'}</Link>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} key={loc.pathname}>
        <Outlet />
      </main>
      <footer className="pub-footer">
        <div className="container grid c3">
          <div>
            <strong>AegisAI</strong> <span className="chip">provisional name</span>
            <p className="small">A local-first, lab-bound security validation platform. All demo evidence is simulated against fixtures.</p>
          </div>
          <div className="small">
            <strong>Honest limits</strong>
            <p>Not certified, not production-hardened, no real-world scanning. See <Link to="/docs">docs</Link> and the in-repo threat model.</p>
          </div>
          <div className="small">
            <strong>Explore</strong>
            <p><Link to="/about">About</Link> · <Link to="/contact">Contact &amp; feedback</Link> · <Link to="/faq">FAQ</Link></p>
          </div>
        </div>
      </footer>
    </>
  )
}
