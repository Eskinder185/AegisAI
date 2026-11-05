import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Btn, Logo } from '../../components/ui'
import { errMsg } from '../../lib/api'
import { useAuth } from '../../lib/app-context'
import { useTitle } from '../public/Home'

const DEV = [
  ['admin@aegis.local', 'Admin', 'manage scope, safety controls and users'],
  ['analyst@aegis.local', 'Analyst', 'run assessments and approve fixture changes'],
  ['viewer@aegis.local', 'Viewer', 'read-only'],
]

export default function Login() {
  useTitle('Sign in')
  const { user, login } = useAuth()
  const [email, setEmail] = useState('analyst@aegis.local')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  if (user) return <Navigate to={loc.state?.from ?? '/app'} replace />
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await login(email, pw)
      nav(loc.state?.from ?? '/app', { replace: true })
    } catch (e2) {
      setErr(errMsg(e2))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem 0' }}>
      <div style={{ width: 'min(960px,100%)' }} className="grid c2">
        <form onSubmit={submit} className="card" aria-labelledby="login-h">
          <Link to="/" className="brand" style={{ marginBottom: 16 }}><Logo /> AegisAI</Link>
          <h1 id="login-h" style={{ fontSize: '1.6rem' }}>Sign in to the demo lab</h1>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby={err ? 'login-err' : undefined} />
          </div>
          {err && <p id="login-err" className="err" role="alert">{err}</p>}
          <Btn type="submit" variant="primary" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
        </form>
        <aside className="card flat">
          <span className="chip warn">Development accounts</span>
          <p className="mt">These accounts exist only because you ran the local seed script. They are never created in a production environment.</p>
          <ul className="mb0" style={{ listStyle: 'none', padding: 0 }}>
            {DEV.map(([e, r, d]) => (
              <li key={e} className="mt">
                <Btn size="sm" onClick={() => setEmail(e)} aria-label={`Use ${r} account`}>{r}</Btn> <code>{e}</code>
                <div className="xs muted">{d}</div>
              </li>
            ))}
          </ul>
          <p className="small muted mt">The password is the value of <code>AEGIS_DEV_SEED_PASSWORD</code> in your <code>.env</code> (see <code>.env.example</code>).</p>
        </aside>
      </div>
    </main>
  )
}
