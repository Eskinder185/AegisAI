/** Concentric permission-boundary diagram for the mock agent: permitted tools inside the ring, others outside. Data = fixture config. */
export default function PermissionBoundary({ tools, allowed }: { tools: Record<string, { risk: string }>; allowed: string[] }) {
  const names = Object.keys(tools)
  const inside = names.filter((n) => allowed.includes(n))
  const outside = names.filter((n) => !allowed.includes(n))
  const place = (arr: string[], r: number, start: number) => arr.map((n, i) => {
    const a = start + (i / Math.max(1, arr.length)) * Math.PI * 2
    return { n, x: 200 + Math.cos(a) * r, y: 200 + Math.sin(a) * r }
  })
  const risk = (n: string) => (tools[n].risk === 'read' ? 'var(--ok)' : tools[n].risk === 'external' ? 'var(--warn)' : 'var(--danger)')
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox="0 0 400 400" role="img" aria-label={`Permission boundary. Inside the boundary: ${inside.join(', ') || 'none'}. Outside: ${outside.join(', ') || 'none'}.`} style={{ width: '100%', maxWidth: 380 }}>
        <circle cx="200" cy="200" r="150" fill="none" stroke="var(--border)" strokeDasharray="2 6" />
        <circle cx="200" cy="200" r="92" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="1.5" />
        <text x="200" y="196" textAnchor="middle" fill="var(--text)" fontSize="12" fontWeight="600">mock agent</text>
        <text x="200" y="212" textAnchor="middle" fill="var(--muted)" fontSize="10" fontFamily="var(--mono)">permission boundary</text>
        {place(inside, 62, -Math.PI / 2).map((p) => (<g key={p.n}><circle cx={p.x} cy={p.y} r="6" fill={risk(p.n)} /><text x={p.x} y={p.y + 20} textAnchor="middle" fill="var(--text)" fontSize="10" fontFamily="var(--mono)">{p.n}</text></g>))}
        {place(outside, 150, Math.PI / 4).map((p) => (<g key={p.n}><circle cx={p.x} cy={p.y} r="6" fill="none" stroke={risk(p.n)} strokeWidth="2" strokeDasharray="3 2" /><text x={p.x} y={p.y + (p.y > 200 ? 22 : -12)} textAnchor="middle" fill="var(--muted)" fontSize="10" fontFamily="var(--mono)">{p.n}</text></g>))}
      </svg>
      <figcaption className="xs muted">Inside: permitted ({inside.join(', ') || 'none'}). Outside, dashed: not permitted ({outside.join(', ') || 'none'}). Colour = tool risk: green read, amber external, red sensitive.</figcaption>
    </figure>
  )
}
