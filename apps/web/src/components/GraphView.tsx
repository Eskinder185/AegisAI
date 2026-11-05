import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Btn } from './ui'
import { CopyId } from './ShellTools'

type N = { id: string; label: string; type: string; status: string; severity?: string; finding?: string; detail?: string; why?: string; fix?: string; observed?: string[]; inferred?: string[]; evidence_ids?: string[] }
type E = { from: string; to: string; label: string; confirmed: boolean }

const COL: Record<string, number> = { boundary: 0, actor: 0, vulnerability: 1, asset: 2, control: 3 }
const W = 210, H = 46, GX = 280, GY = 70

export default function GraphView({ graph }: { graph: { nodes: N[]; edges: E[]; legend: string } }) {
  const [types, setTypes] = useState<Record<string, boolean>>({ boundary: true, actor: true, vulnerability: true, asset: true, control: true })
  const [hyp, setHyp] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [list, setList] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700) // phones get the list layout by default
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const nodes = useMemo(() => graph.nodes.filter((n) => types[n.type] && (hyp || n.status !== 'hypothetical')), [graph, types, hyp])
  const ids = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && (hyp || e.confirmed))
  const pos = useMemo(() => {
    const cols: Record<number, N[]> = {}
    nodes.forEach((n) => (cols[COL[n.type] ?? 1] ??= []).push(n))
    const m: Record<string, { x: number; y: number }> = {}
    const maxLen = Math.max(1, ...Object.values(cols).map((c) => c.length))
    Object.entries(cols).forEach(([c, arr]) => arr.forEach((n, i) => { m[n.id] = { x: 20 + Number(c) * GX, y: 20 + i * GY + ((maxLen - arr.length) * GY) / 2 } }))
    return m
  }, [nodes])
  const height = Math.max(...Object.values(pos).map((p) => p.y), 0) + H + 40
  const selected = graph.nodes.find((n) => n.id === sel) ?? null
  const rel = selected ? graph.edges.filter((e) => e.from === selected.id || e.to === selected.id) : []
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]))
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * f)) }))
  const onKeyPan = (e: React.KeyboardEvent) => {
    const d = 40
    if (e.key === 'ArrowLeft') setView((v) => ({ ...v, x: v.x + d }))
    else if (e.key === 'ArrowRight') setView((v) => ({ ...v, x: v.x - d }))
    else if (e.key === 'ArrowUp') setView((v) => ({ ...v, y: v.y + d }))
    else if (e.key === 'ArrowDown') setView((v) => ({ ...v, y: v.y - d }))
    else if (e.key === '+' || e.key === '=') zoom(1.2)
    else if (e.key === '-') zoom(1 / 1.2)
    else return
    e.preventDefault()
  }
  return (
    <div className="col">
      <fieldset className="row card flat tight" style={{ border: '1px solid var(--border)' }}>
        <legend className="small"><strong>Filters</strong></legend>
        {Object.keys(types).map((t) => (
          <label key={t} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 500, margin: 0 }}>
            <input type="checkbox" checked={types[t]} onChange={(e) => setTypes({ ...types, [t]: e.target.checked })} /> {t}
          </label>))}
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 500, margin: 0 }}><input type="checkbox" checked={hyp} onChange={(e) => setHyp(e.target.checked)} /> show hypotheses</label>
        <Btn size="sm" onClick={() => setList(!list)} aria-pressed={list}>{list ? 'Show graph' : 'Show as accessible list'}</Btn>
      </fieldset>
      <div className="callout warn small"><strong>Legend.</strong> {graph.legend} <span className="chip warn">dashed = hypothesis</span> <span className="chip ok">solid = observed in fixture</span></div>
      {list ? (
        <div className="table-wrap"><table><caption className="sr-only">Nodes and their relationships</caption><thead><tr><th>Node</th><th>Type</th><th>Status</th><th>Relationships</th></tr></thead>
          <tbody>{nodes.map((n) => (
            <tr key={n.id}><td><button type="button" className="btn sm ghost" onClick={() => setSel(n.id)}>{n.label}</button></td><td>{n.type}</td><td>{n.status.replace('_', ' ')}</td>
              <td className="small">{graph.edges.filter((e) => e.from === n.id || e.to === n.id).map((e, i) => <div key={i}>{byId[e.from]?.label} → {byId[e.to]?.label}: {e.label}{e.confirmed ? '' : ' [hypothesis]'}</div>)}</td></tr>))}</tbody></table></div>
      ) : (
        <div className="graph-wrap">
          <div className="gtools">
            <Btn size="sm" onClick={() => zoom(1.2)} aria-label="Zoom in">+</Btn><Btn size="sm" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</Btn>
            <Btn size="sm" onClick={() => setView({ x: 0, y: 0, k: 1 })}>Reset</Btn>
          </div>
          <svg role="group" aria-label="Attack-path graph. Use arrow keys to pan, plus and minus to zoom, Tab to move between nodes." tabIndex={0} onKeyDown={onKeyPan}
            viewBox={`${-view.x / view.k} ${-view.y / view.k} ${1040 / view.k} ${Math.max(height, 300) / view.k}`} preserveAspectRatio="xMidYMid meet"
            onPointerDown={(e) => { if ((e.target as Element).closest('.gnode')) return; drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as Element).setPointerCapture(e.pointerId) }}
            onPointerMove={(e) => { if (!drag.current) return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY }; setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })) }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => { if (e.ctrlKey || e.shiftKey) zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1) }}>
            <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted)" /></marker></defs>
            {edges.map((e, i) => {
              const a = pos[e.from], b = pos[e.to]
              const ax = a.x + (a.x < b.x ? W : a.x > b.x ? 0 : W / 2), ay = a.y + H / 2
              const bx = b.x + (a.x < b.x ? 0 : a.x > b.x ? W : W / 2), by = b.y + (a.x === b.x ? 0 : H / 2)
              const mx = (ax + bx) / 2
              return <path key={i} className={`gedge${e.confirmed ? '' : ' hyp'}`} d={`M${ax},${ay} C${mx},${ay} ${mx},${by} ${bx},${by}`} markerEnd="url(#arr)"><title>{`${byId[e.from].label} → ${byId[e.to].label}: ${e.label}${e.confirmed ? '' : ' (hypothesis)'}`}</title></path>
            })}
            {nodes.map((n) => (
              <g key={n.id} className={`gnode ${n.type}${n.status === 'hypothetical' ? ' hypothetical' : ''}${sel === n.id ? ' sel' : ''}`} transform={`translate(${pos[n.id].x},${pos[n.id].y})`}
                role="button" tabIndex={0} aria-pressed={sel === n.id} aria-label={`${n.type}: ${n.label}${n.status === 'hypothetical' ? ' (hypothesis)' : ''}${n.severity ? `, ${n.severity}` : ''}`}
                onClick={() => setSel(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(n.id) } }}>
                <rect width={W} height={H} rx="10" />
                <text x="12" y="19">{n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label}</text>
                <text x="12" y="36" style={{ fontWeight: 400, fontSize: 10.5 }}>{n.type}{n.severity ? ` · ${n.severity}` : ''}{n.status === 'hypothetical' ? ' · hypothesis' : ''}</text>
                <title>{n.label}</title>
              </g>))}
          </svg>
        </div>)}
      <section className="card" aria-live="polite" aria-labelledby="gd">
        <h3 id="gd" style={{ fontSize: '1.05rem' }}>{selected ? selected.label : 'Select a node'}</h3>
        {!selected ? <p className="muted mb0">Select a node (click, or Tab then Enter) to see its evidence and the recommended action.</p> : (
          <div className="qa">
            <p><span className="chip">{selected.type}</span> <span className={`chip ${selected.status === 'hypothetical' ? 'warn' : selected.status === 'in_place' ? 'ok' : 'simulated'}`}>{selected.status.replace('_', ' ')}</span>
              {selected.status === 'hypothetical' && <> <strong>This is a hypothesis, not a confirmed compromise.</strong></>}</p>
            {selected.detail && <><h4>Details</h4><p>{selected.detail}</p></>}
            {selected.why && <><h4>Why it matters</h4><p>{selected.why}</p></>}
            {selected.fix && <><h4>Recommended action</h4><p>{selected.fix}</p></>}
            {selected.inferred && selected.inferred.length > 0 && <><h4>Inferred</h4><ul className="small">{selected.inferred.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
            {selected.evidence_ids && selected.evidence_ids.length > 0 && <><h4>Evidence</h4><div>{selected.evidence_ids.map((id) => <CopyId key={id} id={id} label="evidence id" />)}</div></>}
            {rel.length > 0 && <><h4>Relationships</h4><ul className="small">{rel.map((e, i) => <li key={i}>{byId[e.from]?.label} → {byId[e.to]?.label}: {e.label}{e.confirmed ? '' : ' [hypothesis]'}</li>)}</ul></>}
            {selected.finding && <p className="mb0"><Link className="btn sm" to={`/app/findings/${selected.finding}`}>Open finding {selected.finding}</Link></p>}
          </div>)}
      </section>
    </div>
  )
}
