import { useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Btn, ErrorState, LoadingBlock } from '../../components/ui'
import { errMsg, get, post } from '../../lib/api'
import { useTitle } from './Home'

function Page({ title, eyebrow, lead, children }: { title: string; eyebrow: string; lead: string; children?: ReactNode }) {
  useTitle(title)
  return (
    <>
      <section className="hero" style={{ paddingBottom: '1.5rem' }}>
        <div className="container">
          <p className="eyebrow">{eyebrow}</p>
          <h1 style={{ maxWidth: '22ch' }}>{title}</h1>
          <p className="lead">{lead}</p>
        </div>
      </section>
      <section className="section" style={{ paddingTop: '1rem' }}>
        <div className="container">{children}</div>
      </section>
    </>
  )
}

function Avail({ s }: { s: 'working' | 'planned' | 'optional' }) {
  const t = { working: ['ok', 'Working in demo (simulated)'], planned: ['unconfigured', 'Planned — not built'], optional: ['unconfigured', 'Optional — off by default'] }[s]
  return <span className={`chip ${t[0]}`}>{t[1]}</span>
}

const CtaRow = () => (
  <div className="row mt2">
    <Link to="/login" className="btn primary lg">Open the demo lab</Link>
    <Link to="/docs" className="btn lg">Read the docs</Link>
  </div>
)

export function Product() {
  return (
    <Page title="One loop for finding, fixing and proving" eyebrow="Product" lead="AegisAI keeps red-team checks, blue-team detection, AI-agent testing and cloud posture in a single evidence-backed workflow.">
      <div className="grid c3">
        {[
          ['Mission Control', 'Open findings, incidents, approvals and your progress, with a clear “Run safe demo” action.', 'working'],
          ['My Lab & scope', 'A target registry with owners, scope, allowed actions and blocked-action reasons you can test.', 'working'],
          ['Assessments', 'Real queued jobs with step-by-step policy decisions, live progress and cancel.', 'working'],
          ['Investigations', 'Incident queue, timelines, evidence citations and a safe detection-rule sandbox.', 'working'],
          ['Verify fixes', 'Baseline → approve → apply → re-run → compare, with signed run manifests.', 'working'],
          ['AI security', 'A versioned prompt-injection suite against a mock agent with a synthetic canary.', 'working'],
          ['Cloud checks', 'Offline IAM and Terraform analysis with exact line evidence.', 'working'],
          ['Reports', 'Printable HTML and JSON exports grounded in stored facts.', 'working'],
          ['Live collectors & AegisSOC link', 'Connectors to real telemetry. The contract is documented; nothing is connected.', 'optional'],
        ].map(([t, d, a]) => (
          <div key={t} className="card"><h3>{t}</h3><p className="muted">{d}</p><Avail s={a as any} /></div>
        ))}
      </div>
      <CtaRow />
    </Page>
  )
}

export function HowItWorks() {
  return (
    <Page title="How AegisAI works" eyebrow="How it works" lead="A deterministic engine produces the evidence. AI, when you enable it, only helps explain.">
      <ol className="steps">
        <li><strong>Pick a lab target.</strong> Targets declare an owner, purpose, scope and allowed actions. Anything else is refused.</li>
        <li><strong>Plan.</strong> The Coordinator turns a scenario into allowlisted steps. The plan is data — there are no free-form commands.</li>
        <li><strong>Policy check, then run.</strong> A worker re-checks policy before every step, honouring the kill switch and cancel requests.</li>
        <li><strong>Observe → finding → verification.</strong> Observations carry source, time and confidence; findings separate what was observed from what is inferred.</li>
        <li><strong>Approve and apply a fixture-only fix.</strong> A named analyst approves the exact change. It expires and can be used once.</li>
        <li><strong>Re-run and compare.</strong> The same versioned scenario runs again. Metrics are computed from stored results.</li>
      </ol>
      <div className="callout brand mt2">Every result is labelled <strong>Simulated</strong>, <strong>Measured</strong>, <strong>Inferred</strong>, <strong>Not configured</strong> or <strong>Verified</strong> so you always know how much to trust it.</div>
      <CtaRow />
    </Page>
  )
}

export function RedTeam() {
  return (
    <Page title="Lab-bound red-team assistant" eyebrow="Red team" lead="Safe, bounded checks that find weaknesses in fixtures and AegisAI-owned lab services — and explain them in plain English.">
      <div className="grid c2">
        <div className="card"><h3>What it does</h3><ul className="mb0"><li>Passive checks for missing security headers and weak cookie flags.</li><li>Static analysis of IAM policies and Terraform snippets.</li><li>Separates observation, hypothesis and confirmed evidence.</li><li>Shows exposure chains only from known fixture relationships.</li></ul></div>
        <div className="card"><h3>What it will not do</h3><ul className="mb0"><li>No exploitation, credential attacks, persistence, stealth or exfiltration.</li><li>No scanning of your LAN, cloud accounts or the internet.</li><li>No arbitrary commands: tools are typed, allowlisted adapters.</li><li>No AI-chosen targets. Policy code decides.</li></ul></div>
      </div>
      <CtaRow />
    </Page>
  )
}

export function BlueTeam() {
  return (
    <Page title="Blue-team investigation assistant" eyebrow="Blue team" lead="Replay synthetic telemetry, write detection rules, and see exactly what they caught, missed or got wrong.">
      <div className="grid c2">
        <div className="card"><h3>Detection lab</h3><p className="muted">Parameterised, versioned rules run against a labelled synthetic dataset. You see precision, recall, false positives and time to detect — with the dataset size stated.</p></div>
        <div className="card"><h3>Incident queue</h3><p className="muted">Every alert becomes an incident with severity reasoning, a timeline, cited events, affected assets and a suggested next step. If evidence is thin, it says so.</p></div>
      </div>
      <CtaRow />
    </Page>
  )
}

export function PurpleTeam() {
  return (
    <Page title="Purple-team verification" eyebrow="Purple team" lead="The differentiator: fix something, then prove the fix worked by re-running the exact same scenario.">
      <div className="grid c3">
        {['Run baseline', 'Review what was found, detected and missed', 'Preview a fixture-only fix with tradeoffs and rollback', 'Approve and apply', 'Re-run the same version', 'Compare before and after'].map((t, i) => (
          <div className="card tight" key={t}><span className="chip brand">Step {i + 1}</span><p className="mt mb0">{t}</p></div>
        ))}
      </div>
      <p className="mt2 muted">Exports include a hashed, HMAC-signed run manifest so edits to stored results are detectable inside your workspace.</p>
      <CtaRow />
    </Page>
  )
}

export function AISecurity() {
  return (
    <Page title="Test AI agents defensively" eyebrow="AI security testing" lead="A mock agent, harmless tools and a fake canary — so you can study prompt injection without risking anything real.">
      <ul>
        <li>Seven versioned cases: injection via documents, fake system messages, tool escalation, canary disclosure, unsafe tool calls and instruction/data separation.</li>
        <li>Deterministic evaluators decide pass or fail. A model judge, if configured, can never override them.</li>
        <li>Each result keeps the input provenance, tool-call trace, seed and rationale.</li>
      </ul>
      <p className="callout warn">The agent is a deterministic mock. Results show how guardrails behave in this harness; they are not a claim about any particular real model.</p>
      <CtaRow />
    </Page>
  )
}

export function CloudPosture() {
  return (
    <Page title="Cloud posture, offline first" eyebrow="Cloud posture" lead="Paste an IAM policy or Terraform snippet. AegisAI analyses the text — it never calls AWS or asks for credentials.">
      <ul>
        <li>Wildcard actions and resources, public trust policies, NotAction, and escalation pathways (clearly marked as hypotheses).</li>
        <li>Public S3 ACLs, disabled public-access blocks, open admin ports, public or unencrypted databases and volumes.</li>
        <li>Each finding cites the exact line, a safer alternative, and the tradeoff of changing it.</li>
      </ul>
      <p><Avail s="optional" /> A read-only AWS connector and Checkov/Semgrep adapters are future opt-in integrations and are not built.</p>
      <CtaRow />
    </Page>
  )
}

export function Docs() {
  useTitle('Docs')
  const q = useQuery({ queryKey: ['glossary'], queryFn: () => get<{ term: string; definition: string }[]>('/glossary') })
  return (
    <Page title="Documentation" eyebrow="Docs" lead="Start here, then browse the glossary. Full architecture, threat model and decision records live in the repository's docs folder.">
      <div className="grid c2">
        <div className="card">
          <h3>Quick start</h3>
          <pre>{`# one-time setup\npowershell scripts/setup.ps1\n\n# run API + worker + web\npowershell scripts/dev.ps1\n\n# open http://localhost:5173`}</pre>
          <p className="small muted mb0">Sign in with a development account created by the seed script (see the sign-in page).</p>
        </div>
        <div className="card">
          <h3>Where things are</h3>
          <ul className="mb0 small"><li><code>docs/security/THREAT_MODEL.md</code></li><li><code>docs/architecture/ARCHITECTURE.md</code></li><li><code>docs/ai/FEATURE_MATRIX.md</code></li><li>API reference at <code>/api/docs</code> when the API is running</li></ul>
        </div>
      </div>
      <h2 className="mt2">Glossary</h2>
      {q.isLoading ? <LoadingBlock /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <dl className="kv" style={{ gridTemplateColumns: 'minmax(140px,max-content) 1fr', rowGap: '.8rem' }}>
          {q.data!.map((g) => (<div key={g.term} style={{ display: 'contents' }}><dt><strong>{g.term}</strong></dt><dd>{g.definition}</dd></div>))}
        </dl>
      )}
    </Page>
  )
}

export function About() {
  return (
    <Page title="About AegisAI" eyebrow="About" lead="An independent, local-first project exploring how AI can help people find, understand and verify security improvements safely.">
      <div className="grid c2">
        <div className="card"><h3>Principles</h3><ul className="mb0"><li>Deterministic evidence first; AI explains.</li><li>Honest labels over impressive claims.</li><li>Safe by construction, not by disclaimer.</li><li>Useful to experts and to people learning.</li></ul></div>
        <div className="card"><h3>Status</h3><p>Early development build. The name <strong>AegisAI</strong> is provisional. No testimonials, customers, certifications or pricing exist, so none are shown.</p><p className="mb0 small muted">Related projects (NetShield, AegisSOC) are separate; optional connector contracts are documented only.</p></div>
      </div>
    </Page>
  )
}

export function Faq() {
  const items: [string, string][] = [
    ['Does it scan my network or cloud?', 'No. v1 runs only against built-in fixtures. A policy engine refuses anything else, and external mode is disabled at runtime.'],
    ['Do I need an API key or GPU?', 'No. All findings and numbers come from deterministic code. An optional local model (Ollama) can add explanations.'],
    ['Can the AI approve or run things?', 'No. The model has no path into the policy engine. Its text is discarded if it cites evidence that does not exist.'],
    ['Are the results real?', 'They are real outputs of the engine against synthetic fixtures, and are always labelled Simulated.'],
    ['Is it production ready?', 'No. It has not been independently reviewed. See the threat model for known limitations.'],
    ['Where is my data stored?', 'In a local SQLite database by default (PostgreSQL is supported via DATABASE_URL). Nothing leaves your machine unless you configure an external model provider.'],
  ]
  return (
    <Page title="Frequently asked questions" eyebrow="FAQ" lead="Straight answers, including about limitations.">
      <div className="faq">{items.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}</div>
    </Page>
  )
}

export function Contact() {
  const [text, setText] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [msg, setMsg] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      await post('/public/feedback', { message: text, contact: email || null })
      setState('ok')
      setText('')
    } catch (err) {
      setMsg(errMsg(err))
      setState('err')
    }
  }
  return (
    <Page title="Contact & feedback" eyebrow="Contact" lead="This is a local-first project with no hosted service. Feedback you submit here is stored in your own workspace for the maintainer to read.">
      <form onSubmit={submit} className="card" style={{ maxWidth: 640 }} aria-describedby="fb-hint">
        <div className="field"><label htmlFor="fb-msg">Your feedback</label><textarea id="fb-msg" required minLength={5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'var(--font)' }} /><div id="fb-hint" className="hint">Do not include passwords or personal data. 1000 characters max.</div></div>
        <div className="field"><label htmlFor="fb-email">Email (optional)</label><input id="fb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <Btn variant="primary" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Saving…' : 'Save feedback'}</Btn>
        <div aria-live="polite" className="mt">
          {state === 'ok' && <div className="callout ok">Saved in this workspace. Thank you.</div>}
          {state === 'err' && <div className="callout danger">{msg}</div>}
        </div>
      </form>
    </Page>
  )
}
