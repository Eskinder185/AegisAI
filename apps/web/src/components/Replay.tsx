import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Btn, ErrorState, LoadingBlock } from './ui'
import { get } from '../lib/api'
import { CopyId } from './ShellTools'

type F = { i: number; t: number; kind: string; id: string; label: string; tag?: string; actor?: string; evidence?: string[] }

function useReplay(runId?: string) {
  return useQuery({ queryKey: ['replay', runId], queryFn: () => get(`/runs/${runId}/replay`), enabled: !!runId })
}

export default function Replay({ runId, siblings }: { runId: string; siblings?: { id: string; label: string }[] }) {
  const q = useReplay(runId)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [other, setOther] = useState('')
  const cmp = useReplay(other || undefined)
  const frames: F[] = useMemo(() => q.data?.frames ?? [], [q.data])
  useEffect(() => { setIdx(0); setPlaying(false) }, [runId])
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setIdx((i) => { if (i >= frames.length - 1) { setPlaying(false); return i } return i + 1 }), 700 / speed)
    return () => clearInterval(t)
  }, [playing, speed, frames.length])
  const dets = useMemo(() => frames.filter((f) => f.kind === 'detection'), [frames])
  if (q.isLoading) return <LoadingBlock label="Loading recorded events" />
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  if (!frames.length) return <p className="muted">This run recorded no events to replay.</p>
  const cur = frames[Math.min(idx, frames.length - 1)]
  const firstDet = dets[0]
  const win = frames.slice(Math.max(0, idx - 7), idx + 1)
  const firstOf = (fs: F[]) => fs.find((f) => f.kind === 'detection')
  const od = cmp.data ? firstOf(cmp.data.frames) : undefined
  return (
    <div className="col">
      <div className="callout brand small"><strong>Replay of recorded data.</strong> {q.data.note} Times are on the scenario's simulated clock.</div>
      <div className="row">
        <Btn onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? 'Pause' : idx >= frames.length - 1 ? 'Replay' : 'Play'}</Btn>
        <Btn size="sm" onClick={() => { setIdx(0); setPlaying(false) }}>Restart</Btn>
        <Btn size="sm" onClick={() => setIdx(Math.max(0, idx - 1))} aria-label="Previous frame">◀</Btn>
        <Btn size="sm" onClick={() => setIdx(Math.min(frames.length - 1, idx + 1))} aria-label="Next frame">▶</Btn>
        <label className="row small" style={{ margin: 0, fontWeight: 500 }}>Speed
          <select style={{ width: 'auto', minHeight: 36 }} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={4}>4×</option><option value={12}>12×</option></select></label>
        {firstDet && <Btn size="sm" onClick={() => { setPlaying(false); setIdx(firstDet.i) }}>Jump to first detection</Btn>}
      </div>
      <div className="replay-track">
        {dets.map((d) => <span key={d.i} className="tick" aria-hidden="true" style={{ left: `calc(${(d.i / Math.max(1, frames.length - 1)) * 100}% - 2px)` }} />)}
        <input type="range" min={0} max={frames.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
          aria-label="Replay position" aria-valuetext={`Frame ${idx + 1} of ${frames.length}, t plus ${cur.t} seconds`} />
        <div className="row between xs muted"><span>t+0s</span><span>Frame {idx + 1} / {frames.length} · t+{cur.t}s</span><span>t+{q.data.duration}s</span></div>
      </div>
      <div className="grid c2">
        <section className="card" aria-live="polite" aria-labelledby="rp-cur">
          <h3 id="rp-cur" style={{ fontSize: '1.05rem' }}>Current frame</h3>
          <div className={`frame ${cur.kind}`}><strong>{cur.kind === 'detection' ? 'Detection fired' : cur.kind}</strong> · t+{cur.t}s<div>{cur.label}</div>
            {cur.tag && <span className="chip mt">{cur.tag}</span>}</div>
          <p className="xs mt mb0"><CopyId id={cur.id} label="frame id" /></p>
          {cur.evidence && <p className="xs muted">Evidence events: {cur.evidence.join(', ')}</p>}
          {firstDet && <p className="small mb0 mt">{idx >= firstDet.i ? <span className="good">First detection occurred at frame {firstDet.i + 1} (t+{firstDet.t}s).</span> : <span className="muted">No detection yet in this replay (first one at t+{firstDet.t}s).</span>}</p>}
          {!firstDet && <p className="small bad mb0 mt">This run recorded no detections.</p>}
        </section>
        <section className="card" aria-labelledby="rp-log"><h3 id="rp-log" style={{ fontSize: '1.05rem' }}>Recent frames</h3>
          {win.map((f) => <div key={f.i} className={`frame ${f.kind}`}><span className="xs muted">t+{f.t}s</span> {f.label}</div>)}</section>
      </div>
      {siblings && siblings.length > 1 && (
        <section className="card" aria-labelledby="rp-cmp"><h3 id="rp-cmp" style={{ fontSize: '1.05rem' }}>Compare with another run</h3>
          <label htmlFor="rp-other" className="sr-only">Run to compare</label>
          <select id="rp-other" value={other} onChange={(e) => setOther(e.target.value)}><option value="">Choose a run…</option>{siblings.filter((s) => s.id !== runId).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          {other && cmp.data && (
            <div className="table-wrap mt"><table><thead><tr><th /><th>This run</th><th>Other run</th></tr></thead><tbody>
              <tr><td>Recorded frames</td><td>{frames.length}</td><td>{cmp.data.frames.length}</td></tr>
              <tr><td>Detections</td><td>{dets.length}</td><td>{cmp.data.frames.filter((f: F) => f.kind === 'detection').length}</td></tr>
              <tr><td>First detection (simulated clock)</td><td>{firstDet ? `t+${firstDet.t}s` : 'none'}</td><td>{od ? `t+${od.t}s` : 'none'}</td></tr></tbody></table></div>)}
        </section>)}
    </div>
  )
}
