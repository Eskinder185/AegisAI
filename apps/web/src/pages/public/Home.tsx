import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BeforeAfterBars, Label } from '../../components/ui'
import { useAuth } from '../../lib/app-context'

export const useTitle = (t: string) =>
  useEffect(() => {
    document.title = `${t} — AegisAI`
  }, [t])

export default function Home() {
  const { user } = useAuth()
  useTitle('Safely test your defenses')
  const cta = user ? '/app' : '/login'
  return (
    <>
      <section className="hero">
        <div className="container grid c2" style={{ alignItems: 'center' }}>
          <div>
            <p className="eyebrow">Lab-bound security validation</p>
            <h1>Safely test your defenses.</h1>
            <p className="lead">
              Understand every finding. Verify every improvement. AegisAI connects red-team checks, blue-team detection and a before/after
              verification loop — all inside disposable, clearly labelled demo labs.
            </p>
            <div className="row">
              <Link to={cta} className="btn primary lg">Open the demo lab</Link>
              <Link to="/how-it-works" className="btn lg">See how it works</Link>
            </div>
            <p className="small muted mt">Works with no API key, no cloud account, no GPU and no network scanning.</p>
          </div>
          <div className="preview-frame" aria-label="Product preview built from sample data">
            <div className="bar"><i /><i /><i /><span className="xs muted" style={{ marginLeft: 8 }}>Verify a fix — SAMPLE DATA</span></div>
            <div style={{ padding: '1rem 1.25rem' }}>
              <div className="row between">
                <strong>Missing browser protections</strong>
                <span className="row"><Label k="SIMULATED" /><Label k="VERIFIED" /></span>
              </div>
              <p className="small muted">Before and after applying a fixture-only change, same scenario version.</p>
              <BeforeAfterBars rows={[{ label: 'Findings', before: 4, after: 0 }, { label: 'Exposure points', before: 15, after: 0 }]} />
              <p className="xs muted mb0">Sample values from the built-in Demo 1. Open the lab to run it yourself.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <p className="eyebrow">The loop</p>
          <h2>Find → understand → defend → verify</h2>
          <ol className="steps">
            <li><strong>Find.</strong> Bounded, policy-checked checks run against fixtures and lab services. Every observation records its source, method, time and confidence.</li>
            <li><strong>Understand.</strong> Each finding answers four questions: what happened, why it matters, how to fix it, and how we will know it worked.</li>
            <li><strong>Defend.</strong> Review a fixture-only fix with a plain-English preview and rollback. A named human approves it.</li>
            <li><strong>Verify.</strong> Re-run the same versioned scenario and compare before and after — numbers computed by code, never invented by a model.</li>
          </ol>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <p className="eyebrow">What you can run today</p>
          <h2>Four complete demonstrations</h2>
          <div className="grid c2">
            {[
              ['Web hardening', 'A fixture website is missing browser protections. Find it, fix it, prove it.', '/red-team'],
              ['Cloud access (offline)', 'An over-broad IAM policy is flagged line by line, shrunk to least privilege, and re-tested. No AWS calls.', '/cloud-posture'],
              ['Detection gap', 'Replay synthetic sign-ins. One attack slips past the alert rules; tune a rule and measure the difference.', '/blue-team'],
              ['AI agent guardrails', 'Hide instructions in a document and watch a mock agent obey — then enable gates and see them refuse.', '/ai-security'],
            ].map(([t, d, to]) => (
              <Link key={t} to={to} className="card card-link">
                <h3>{t}</h3>
                <p className="muted mb0">{d}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container grid c2">
          <div>
            <p className="eyebrow">Safety is code, not a disclaimer</p>
            <h2>Deny-by-default controls enforced in software</h2>
            <ul>
              <li>A scope policy engine is evaluated before every job and again before every step.</li>
              <li>Simulation-only mode by default; external targets are refused at runtime.</li>
              <li>Metadata, link-local and public addresses can never be in scope.</li>
              <li>Changes need a time-limited, single-use human approval tied to the exact change.</li>
              <li>A global kill switch and emergency stop; a tamper-evident audit log.</li>
              <li>An AI model can explain, never authorize. Its output is checked against stored evidence.</li>
            </ul>
          </div>
          <div className="card">
            <h3>What AegisAI is not</h3>
            <ul className="mb0">
              <li>Not a scanner for your real network or cloud accounts.</li>
              <li>Not certified, audited or production-hardened.</li>
              <li>Not a measure of real-world detection accuracy — benchmarks use small synthetic datasets and say so.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
