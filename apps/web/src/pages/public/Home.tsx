import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Constellation from '../../components/three/Constellation'
import { Reveal, useInView } from '../../components/Reveal'
import { AGENT_MODULES, prefersReducedMotion } from '../../lib/agents'
import { useAuth } from '../../lib/app-context'

export const useTitle = (t: string) =>
  useEffect(() => {
    document.title = `${t} — AegisAI`
  }, [t])

/* ---------------- hero ---------------- */
function Hero({ cta }: { cta: string }) {
  const [sel, setSel] = useState(2)
  const a = AGENT_MODULES[sel]
  return (
    <section className="hero2" aria-labelledby="hero-h">
      <div className="container wrap">
        <div>
          <p className="eyebrow reveal in">Lab-bound AI security validation</p>
          <h1 id="hero-h" className="reveal in" style={{ ['--d' as string]: '80ms' }}>Safely test your <span className="grad-text">defenses.</span></h1>
          <p className="lead reveal in" style={{ ['--d' as string]: '160ms' }}>
            Understand every finding. Verify every improvement. Five specialised agent modules find, detect and verify — inside disposable labs, under human approval, with every result labelled for what it is.
          </p>
          <div className="row reveal in" style={{ ['--d' as string]: '240ms' }}>
            <Link to={cta} className="btn primary lg">Open the demo lab</Link>
            <a href="#platform" className="btn lg">Explore the platform</a>
          </div>
          <p className="small muted mt">No API key, cloud account, GPU or network scanning required. All evidence is simulated against built-in fixtures.</p>
        </div>
        <div>
          <Constellation selected={sel} onSelect={setSel} />
          <div aria-live="polite" className="card tight" style={{ marginTop: 8 }}>
            <div className="row between"><strong>{a.name}</strong><span className="chip">deterministic module · model optional</span></div>
            <p className="small muted" style={{ margin: '6px 0 10px' }}><b style={{ color: 'var(--text)' }}>{a.role}.</b> {a.does}</p>
            <Link className="btn sm" to={a.link}>{a.linkLabel} →</Link>
          </div>
          <ul className="agent-list compact" style={{ marginTop: 8 }} aria-label="Agent modules (accessible alternative to the 3D scene)">
            {AGENT_MODULES.map((m, i) => (
              <li key={m.id}><button type="button" className="agent-btn" aria-label={m.name} aria-pressed={sel === i} onClick={() => setSel(i)}>
                <span className="sw" style={{ background: m.color }} aria-hidden="true" /><span>{m.short}</span></button></li>))}
          </ul>
          <p className="xs muted" style={{ marginTop: 8 }}>Interactive illustration: click a node or use the buttons. Not live data.</p>
        </div>
      </div>
    </section>
  )
}

/* ---------------- problem ---------------- */
function Problem() {
  return (
    <section className="section" aria-labelledby="prob-h">
      <div className="container split">
        <Reveal><p className="eyebrow">The problem</p><h2 id="prob-h">Security that is claimed is not security that is proven.</h2></Reveal>
        <div className="statement">
          <Reveal delay={80}><p><b>AI agents act on text they did not write.</b> A document, a tool result or a log line can carry instructions. Defences against that need to be tested, repeatedly, not assumed.</p></Reveal>
          <Reveal delay={160}><p><b>Detections drift.</b> A rule that catches one attack can miss its quieter sibling. You only find out by replaying both.</p></Reveal>
          <Reveal delay={240}><p><b>Fixes are rarely re-checked.</b> Teams change a setting and move on. AegisAI re-runs the same versioned scenario and shows what actually changed.</p></Reveal>
        </div>
      </div>
    </section>
  )
}

/* ---------------- agents ---------------- */
function Agents() {
  return (
    <section className="section alt" aria-labelledby="ag-h">
      <div className="container">
        <Reveal><p className="eyebrow">Agent modules</p><h2 id="ag-h">Five specialists. One policy engine above them.</h2>
          <p className="sub">Each module has a narrow job and an explicit tool allowlist. None can widen its own scope; a deny-by-default policy engine checks every step.</p></Reveal>
        <div className="agents-grid mt2">
          {AGENT_MODULES.map((m, i) => (
            <Reveal key={m.id} delay={i * 60}>
              <Link to={m.link} className="card card-link" style={{ height: '100%', borderTop: `2px solid ${m.color}` }}>
                <span className="eyebrow tint-text" style={{ ['--tint' as string]: m.color }}>{m.short}</span>
                <h3 style={{ marginTop: 8 }}>{m.name}</h3>
                <p className="small muted mb0">{m.does}</p>
              </Link>
            </Reveal>))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- platform previews (real screenshots of the working app) ---------------- */
const SHOTS: [string, string, string, string][] = [
  ['overview', 'Command center', 'Next action, journeys, agent status and findings by priority.', 'Overview'],
  ['case', 'Verify a fix', 'Baseline, approved fixture change, re-run and a before/after comparison.', 'Verify Fixes'],
  ['attack-paths', 'Attack paths', 'Observed relationships solid, hypotheses dashed, evidence on selection.', 'Attack Paths'],
  ['replay', 'Replay', 'Scrub recorded events and jump to the moment of detection.', 'Replay'],
  ['agents', 'Agents', 'Roles, permission boundaries and real execution history.', 'AI Agents'],
]
function Platform() {
  const [i, setI] = useState(0)
  const [id, title, text, label] = SHOTS[i]
  return (
    <section className="section" id="platform" aria-labelledby="pl-h">
      <div className="container">
        <Reveal><p className="eyebrow">Platform experience</p><h2 id="pl-h">The actual product, not a mock-up.</h2>
          <p className="sub">Screenshots of the running demo application (dark theme, simulated data).</p></Reveal>
        <div role="tablist" aria-label="Product views" className="tabs mt2">
          {SHOTS.map((s, k) => <button key={s[0]} role="tab" type="button" className="tab" aria-selected={k === i} id={`pv-${s[0]}`} aria-controls="pv-panel" onClick={() => setI(k)}>{s[1]}</button>)}
        </div>
        <div id="pv-panel" role="tabpanel" aria-labelledby={`pv-${id}`} className="preview-split">
          <div><h3 style={{ fontSize: '1.5rem' }}>{title}</h3><p className="muted">{text}</p><span className="chip simulated">simulated data</span></div>
          <div className="device"><div className="bar" aria-hidden="true"><i /><i /><i /><span className="xs muted" style={{ marginLeft: 8 }}>AegisAI · {label}</span></div>
            <img key={id} src={`/previews/${id}.png`} width={1360} height={900} alt={`Screenshot of the ${title} view in the AegisAI demo application`} loading="lazy" className="page-enter" /></div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- red vs blue (illustrative playback of the Demo 3 fixture) ---------------- */
const TMIN = 3950, TMAX = 5700
const pos = (t: number) => (t - TMIN) / (TMAX - TMIN)
const brute = Array.from({ length: 14 }, (_, k) => 4000 + k * 10)
const spray = Array.from({ length: 30 }, (_, k) => 5000 + k * 18)
function RedBlue() {
  const [mode, setMode] = useState<'v1' | 'v2'>('v1')
  const [ref, seen] = useInView<HTMLDivElement>(false, 0.3)
  const [p, setP] = useState(0)
  useEffect(() => {
    if (!seen) { setP(0); return }
    if (prefersReducedMotion()) { setP(1); return }
    let raf = 0, t0 = 0
    const loop = (t: number) => { t0 = t0 || t; const k = Math.min(1, (t - t0) / 6500); setP(k); if (k < 1) raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [seen, mode])
  const cur = TMIN + p * (TMAX - TMIN)
  const det = (t: number) => cur >= t
  return (
    <section className="section alt" aria-labelledby="rb-h">
      <div className="container" ref={ref}>
        <Reveal><p className="eyebrow">Red team × blue team</p><h2 id="rb-h">An attack that goes unnoticed is a finding.</h2>
          <p className="sub">Two synthetic attack campaigns, replayed through detection rules. Rule v1 catches the loud one. The quiet one slips past until the rule set is improved.</p></Reveal>
        <div className="row mt2" role="group" aria-label="Rule version">
          <button type="button" className="btn sm" aria-pressed={mode === 'v1'} onClick={() => setMode('v1')}>Rule set v1</button>
          <button type="button" className="btn sm" aria-pressed={mode === 'v2'} onClick={() => setMode('v2')}>v2 (adds spray rule)</button>
          <span className="chip simulated">illustrative playback of the Demo 3 fixture · synthetic data</span>
        </div>
        <div className="col mt" role="img" aria-label={mode === 'v1' ? 'Brute force detected after 70 simulated seconds; password spraying not detected.' : 'Brute force detected after 70 simulated seconds; password spraying detected after 162 simulated seconds.'}>
          <div className="lane"><span className="tag">Brute force on one account</span>
            {brute.map((t) => <i key={t} className={`ev${cur >= t ? ' show' : ''}`} style={{ left: `${pos(t) * 100}%`, background: 'var(--danger)' }} />)}
            <span className={`chip ok`} style={{ position: 'absolute', right: 10, top: 10, opacity: det(4070) ? 1 : 0, transition: 'opacity .3s' }}>detected · t+70s</span></div>
          <div className="lane"><span className="tag">Password spraying, many accounts</span>
            {spray.map((t) => <i key={t} className={`ev${cur >= t ? ' show' : ''}`} style={{ left: `${pos(t) * 100}%`, background: 'var(--warn)' }} />)}
            <span className={`chip ${mode === 'v2' ? 'ok' : 'danger'}`} style={{ position: 'absolute', right: 10, top: 10, opacity: cur >= 5162 ? 1 : 0, transition: 'opacity .3s' }}>{mode === 'v2' ? 'detected · t+162s' : 'not detected'}</span></div>
        </div>
        <div className="grid c2 mt2">
          <div className="card tight"><p className="section-title">Recall on this dataset</p><div className="bar-row"><span>Rule v1</span><div className="bar-track"><div className="bar-fill" style={{ ['--w' as string]: '50%', width: '50%', background: 'var(--danger)' }} /></div><span>0.5</span></div>
            <div className="bar-row"><span>Rule v2</span><div className="bar-track"><div className="bar-fill" style={{ ['--w' as string]: '100%', width: '100%', background: 'var(--ok)' }} /></div><span>1.0</span></div></div>
          <div className="card tight"><p className="section-title">Caveat</p><p className="small muted mb0">Two campaigns on a small labelled dataset. This shows the workflow, not real-world detection accuracy.</p></div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- purple lifecycle ---------------- */
const LIFE: [string, string][] = [['Baseline', 'Run the versioned scenario.'], ['Review', 'See what was found, detected and missed.'], ['Approve', 'A named analyst approves the exact change.'], ['Re-run', 'Same version, changed fixture.'], ['Compare', 'Before/after, computed from stored results.']]
function Purple() {
  const [ref, seen] = useInView<HTMLOListElement>(false, 0.4)
  const [n, setN] = useState(-1)
  useEffect(() => {
    if (!seen) { setN(-1); return }
    if (prefersReducedMotion()) { setN(LIFE.length - 1); return }
    let k = -1
    const t = setInterval(() => { k = k >= LIFE.length - 1 ? 0 : k + 1; setN(k) }, 1500)
    setN(0); k = 0
    return () => clearInterval(t)
  }, [seen])
  return (
    <section className="section" aria-labelledby="pu-h">
      <div className="container">
        <Reveal><p className="eyebrow">Purple-team verification</p><h2 id="pu-h">Fix it. Then prove it.</h2>
          <p className="sub">Every change is applied to a fixture only, behind a single-use, expiring approval. Nothing is called "fixed" until the same scenario says so.</p></Reveal>
        <ol className="stepper2 mt2" ref={ref}>{LIFE.map(([t, d], i) => <li key={t} className={i <= n && n >= 0 ? (i === n ? 'on' : '') : ''} aria-current={i === n ? 'step' : undefined}><h3>{t}</h3><p>{d}</p></li>)}</ol>
      </div>
    </section>
  )
}

/* ---------------- AI evaluation ---------------- */
const CASES = ['Control', 'Doc injection', 'Fake SYSTEM', 'Tool escalation', 'Canary ask', 'Unsafe tool', 'Reply hijack']
function Evaluation() {
  const [guard, setGuard] = useState(false)
  const pass = (i: number) => guard || i === 0
  const n = CASES.filter((_, i) => pass(i)).length
  return (
    <section className="section alt" aria-labelledby="ev-h">
      <div className="container split">
        <Reveal><p className="eyebrow">AI security evaluation</p><h2 id="ev-h">Test the agent, not just the model.</h2>
          <p className="sub">A mock agent with harmless tools and a fake canary faces seven versioned cases. Code-enforced gates and deterministic evaluators decide pass or fail; a model judge can never override them.</p>
          <div className="row mt"><button type="button" className="btn sm" aria-pressed={!guard} onClick={() => setGuard(false)}>Weak agent</button><button type="button" className="btn sm" aria-pressed={guard} onClick={() => setGuard(true)}>Guardrails on</button></div></Reveal>
        <Reveal delay={100}>
          <div className="card">
            <p className="section-title">Demo 4 results · synthetic cases · seed 1337</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} aria-label="Test cases">
              {CASES.map((c, i) => <li key={c} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><span className="small">AI-00{i} · {c}</span><span className={`chip ${pass(i) ? 'ok' : 'danger'}`}>{pass(i) ? 'pass' : 'fail'}</span></li>)}
            </ul>
            <div className="bar-row" style={{ gridTemplateColumns: '80px 1fr 56px' }}><span>Pass rate</span><div className="bar-track"><div className="bar-fill go" style={{ ['--w' as string]: `${(n / 7) * 100}%`, background: guard ? 'var(--ok)' : 'var(--danger)' }} /></div><span>{n}/7</span></div>
            <p className="xs muted mb0">Passing a limited suite does not mean an agent is secure.</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------------- trust ---------------- */
const TRUST: [string, string, string][] = [
  ['01', 'Authorization is code', 'A deny-by-default policy engine runs before every job and every step. External targets are refused at runtime.'],
  ['02', 'Isolation', 'Checks run against built-in fixtures. Metadata, link-local and public addresses can never be in scope.'],
  ['03', 'Human approval', 'Changes need a named analyst: single-use, 15-minute, bound to the exact change.'],
  ['04', 'Evidence', 'Every finding cites observations with source, time and confidence; hypotheses are labelled as such.'],
  ['05', 'Tamper-evidence', 'A hash-chained audit log and HMAC-signed run manifests make edits detectable inside a workspace.'],
  ['06', 'AI cannot authorize', 'An optional model may explain. Its output is checked against stored evidence and it has no path into policy.'],
]
function Trust() {
  return (
    <section className="section" aria-labelledby="tr-h">
      <div className="container split">
        <Reveal><p className="eyebrow">Engineering and trust</p><h2 id="tr-h">Safe by construction, honest about limits.</h2>
          <p className="sub">AegisAI is an early build. It is not certified, not independently reviewed and not production-hardened. The threat model lists what it does not defend against.</p>
          <Link className="btn mt" to="/docs">Read the docs</Link></Reveal>
        <Reveal delay={100}><ul className="trust-list boundary">{TRUST.map(([n, t, d]) => <li key={n}><span className="ic">{n}</span><div><strong>{t}</strong><div className="small muted">{d}</div></div></li>)}</ul></Reveal>
      </div>
    </section>
  )
}

function Explore({ cta }: { cta: string }) {
  return (
    <section className="section" aria-labelledby="ex-h">
      <div className="container">
        <Reveal><div className="cta-band">
          <p className="eyebrow">Product exploration</p>
          <h2 id="ex-h" style={{ maxWidth: '16ch' }}>Run the whole loop in a few minutes.</h2>
          <p className="sub">Sign in to the local demo lab, start a scenario and watch real queued jobs produce evidence you can inspect, fix and re-verify.</p>
          <div className="row mt2"><Link to={cta} className="btn primary lg">Open the demo lab</Link><Link to="/how-it-works" className="btn lg">How it works</Link></div>
        </div></Reveal>
      </div>
    </section>
  )
}

export default function Home() {
  const { user } = useAuth()
  useTitle('Safely test your defenses')
  const cta = user ? '/app' : '/login'
  return (
    <>
      <Hero cta={cta} />
      <Problem />
      <Agents />
      <Platform />
      <RedBlue />
      <Purple />
      <Evaluation />
      <Trust />
      <Explore cta={cta} />
    </>
  )
}
