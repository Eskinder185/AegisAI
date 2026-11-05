import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { AGENT_MODULES, prefersReducedMotion, webglAvailable } from '../../lib/agents'

const CoreScene = lazy(() => import('./CoreScene'))

/** Static, accessible SVG constellation. Used as the loading state and as the fallback when WebGL is unavailable or lost. */
export function StaticConstellation({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  const pts = AGENT_MODULES.map((_, i) => {
    const a = (i / AGENT_MODULES.length) * Math.PI * 2 - Math.PI / 2
    return { x: 200 + Math.cos(a) * 140, y: 200 + Math.sin(a) * 140 }
  })
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label="Constellation of five agent modules around a central core. Use the list beside it to choose an agent." style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <circle cx="200" cy="200" r="150" fill="none" stroke="var(--border)" strokeDasharray="2 6" />
      {pts.map((p, i) => <line key={i} x1="200" y1="200" x2={p.x} y2={p.y} stroke="var(--border-strong)" />)}
      <circle cx="200" cy="200" r="46" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="24" fill="var(--brand)" opacity="0.8" />
      {pts.map((p, i) => (
        <g key={i} onClick={() => onSelect(i)} style={{ cursor: 'pointer' }}>
          <circle cx={p.x} cy={p.y} r={selected === i ? 19 : 13} fill={AGENT_MODULES[i].color} opacity={selected === i ? 1 : 0.8} />
          <text x={p.x} y={p.y + (p.y > 200 ? 34 : -24)} textAnchor="middle" fill="var(--muted)" fontSize="12" fontFamily="var(--mono)">{AGENT_MODULES[i].short}</text>
        </g>))}
    </svg>
  )
}

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  componentDidCatch() { this.props.onFail() }
  render() { return this.state.bad ? null : this.props.children }
}

export default function Constellation({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  const [mode, setMode] = useState<'loading' | '3d' | 'static'>('loading')
  const [ready, setReady] = useState(false)
  const reduced = prefersReducedMotion()
  useEffect(() => {
    // Keep first paint instant: decide after mount; critical content never depends on WebGL.
    setMode(webglAvailable() ? '3d' : 'static')
  }, [])
  return (
    <div className="scene" data-scene={mode === '3d' && ready ? 'webgl' : 'static'}>
      {!(mode === '3d' && ready) && <StaticConstellation selected={selected} onSelect={onSelect} />}
      {mode === '3d' && (
        <Boundary onFail={() => setMode('static')}>
          <Suspense fallback={null}>
            <CoreScene selected={selected} onSelect={onSelect} onFail={() => { setReady(false); setMode('static') }} onReady={() => setReady(true)} reduced={reduced} />
          </Suspense>
        </Boundary>
      )}
    </div>
  )
}
