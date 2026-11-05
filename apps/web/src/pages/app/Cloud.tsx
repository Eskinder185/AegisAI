import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FindingCard } from '../../components/RunView'
import { Btn, ErrorState, Label, LoadingBlock, PageHead, SevBar } from '../../components/ui'
import { errMsg, get, post } from '../../lib/api'
import { useAuth } from '../../lib/app-context'

const KINDS: [string, string][] = [['iam', 'IAM permissions policy'], ['iam_trust', 'IAM role trust policy'], ['terraform', 'Terraform snippet']]

export default function Cloud() {
  const { can } = useAuth()
  const samples = useQuery({ queryKey: ['samples'], queryFn: () => get('/cloud/samples') })
  const [kind, setKind] = useState('iam')
  const [text, setText] = useState('')
  const run = useMutation({ mutationFn: () => post('/cloud/analyze', { kind, text, label: samples.data?.[kind === 'terraform' ? 'terraform' : kind]?.label ?? 'Pasted input' }) })
  const load = (k: string) => { setKind(k); setText(samples.data?.[k]?.text ?? '') }
  if (samples.isLoading) return <LoadingBlock />
  if (samples.isError) return <ErrorState error={samples.error} />
  const r = run.data
  return (
    <>
      <PageHead title="Cloud Checks">Paste an AWS IAM policy or a Terraform snippet. AegisAI reads the <strong>text you provide</strong> and points to the exact lines that grant too much. It never calls AWS and never asks for credentials.</PageHead>
      <div className="grid c2">
        <form className="card" onSubmit={(e) => { e.preventDefault(); run.mutate() }}>
          <div className="field"><label htmlFor="ck">What are you pasting?</label><select id="ck" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="row small"><span className="muted">Load a sample:</span>{KINDS.map(([v, l]) => <Btn key={v} size="sm" onClick={() => load(v)}>{l}</Btn>)}</div>
          <div className="field mt"><label htmlFor="ct">Policy or snippet (max 64 KiB)</label><textarea id="ct" required value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={16} aria-describedby="ct-h" /><div id="ct-h" className="hint">Do not paste real credentials. Obvious secrets are redacted from AI prompts and logs, but the safest input is a sanitised policy.</div></div>
          <Btn type="submit" variant="primary" disabled={!can('analyst') || run.isPending || text.length < 2} title={!can('analyst') ? 'Viewers cannot run analyses' : undefined}>{run.isPending ? 'Analysing…' : 'Analyse'}</Btn>
          {run.isError && <p className="err mt" role="alert">{errMsg(run.error)}</p>}
        </form>
        <section className="card" aria-labelledby="cr" aria-live="polite">
          <h2 id="cr" style={{ fontSize: '1.2rem' }}>Results <Label k="SIMULATED" /></h2>
          {!r ? <p className="muted">Load a sample on the left to see line-level findings. Try the Terraform sample for public bucket, open SSH and public database examples.</p> : (
            <>
              <SevBar counts={r.summary} />
              <p className="xs muted">{r.note}</p>
              {r.findings.length === 0 && <div className="callout ok">No findings from the built-in rules. That is not proof the configuration is safe — only that these specific checks passed.</div>}
              <div className="col mt">{r.findings.map((f: any) => (
                <div key={f.rule_id + f.line}><div className="xs muted">Line {f.line}</div><FindingCard f={{ ...f, stable_id: undefined }} /></div>))}</div>
            </>)}
        </section>
      </div>
    </>
  )
}
