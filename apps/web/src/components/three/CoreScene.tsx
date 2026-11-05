import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { AGENT_MODULES } from '../../lib/agents'

// Original "intelligence core": a faceted computational core, thin orbital rings, five agent nodes on connection
// paths, light travelling along the paths, and a sparse particle shell. Decorative illustration, not live data.

const R = 2.15
const nodePos = AGENT_MODULES.map((_, i) => {
  const a = (i / AGENT_MODULES.length) * Math.PI * 2 + 0.4
  const y = [0.9, -0.5, 1.2, -1.2, 0.2][i]
  return new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R)
})

function Core({ reduced }: { reduced: boolean }) {
  const outer = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)
  const ring1 = useRef<THREE.Mesh>(null)
  const ring2 = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    if (reduced) return
    const t = s.clock.elapsedTime
    if (outer.current) { outer.current.rotation.y = t * 0.18; outer.current.rotation.x = Math.sin(t * 0.2) * 0.2 }
    if (inner.current) { const k = 1 + Math.sin(t * 1.4) * 0.035; inner.current.scale.setScalar(k) }
    if (ring1.current) ring1.current.rotation.z = t * 0.25
    if (ring2.current) ring2.current.rotation.z = -t * 0.18
  })
  return (
    <group>
      <mesh ref={outer}><icosahedronGeometry args={[1.15, 1]} /><meshBasicMaterial color="#7ba2ff" wireframe transparent opacity={0.55} /></mesh>
      <mesh ref={inner}><icosahedronGeometry args={[0.72, 2]} /><meshStandardMaterial color="#14205a" emissive="#4f7dff" emissiveIntensity={1.15} roughness={0.35} metalness={0.4} flatShading /></mesh>
      <mesh ref={ring1} rotation={[1.2, 0.2, 0]}><torusGeometry args={[1.65, 0.006, 8, 160]} /><meshBasicMaterial color="#9bb8ff" transparent opacity={0.7} /></mesh>
      <mesh ref={ring2} rotation={[0.35, 1.1, 0]}><torusGeometry args={[1.95, 0.005, 8, 160]} /><meshBasicMaterial color="#b9a8ff" transparent opacity={0.55} /></mesh>
    </group>
  )
}

function Links({ selected, reduced }: { selected: number; reduced: boolean }) {
  const pulses = useRef<THREE.Mesh[]>([])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pts: number[] = []
    nodePos.forEach((p) => pts.push(0, 0, 0, p.x, p.y, p.z))
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  useFrame((s) => {
    const t = reduced ? 0.5 : s.clock.elapsedTime
    pulses.current.forEach((m, i) => {
      if (!m) return
      const k = (t * (i === selected ? 0.55 : 0.28) + i * 0.37) % 1
      m.position.copy(nodePos[i]).multiplyScalar(k)
      ;(m.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * (i === selected ? 1 : 0.6)
    })
  })
  return (
    <group>
      <lineSegments geometry={geo}><lineBasicMaterial color="#6f86c8" transparent opacity={0.4} /></lineSegments>
      {nodePos.map((_, i) => (
        <mesh key={i} ref={(m) => { if (m) pulses.current[i] = m }}><sphereGeometry args={[0.05, 12, 12]} /><meshBasicMaterial color={AGENT_MODULES[i].color} transparent opacity={0.8} /></mesh>
      ))}
    </group>
  )
}

function AgentNode({ i, selected, onSelect, reduced }: { i: number; selected: boolean; onSelect: (i: number) => void; reduced: boolean }) {
  const m = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  const [hover, setHover] = useState(false)
  const col = AGENT_MODULES[i].color
  useFrame((s) => {
    const target = selected ? 1.55 : hover ? 1.3 : 1
    if (m.current) m.current.scale.lerp(new THREE.Vector3(target, target, target), 0.18)
    if (halo.current) {
      const t = reduced ? 0 : s.clock.elapsedTime
      const k = (selected ? 1.9 : 1.4) + Math.sin(t * 2 + i) * 0.08
      halo.current.scale.setScalar(k)
      ;(halo.current.material as THREE.MeshBasicMaterial).opacity = selected ? 0.5 : hover ? 0.35 : 0.16
    }
  })
  return (
    <group position={nodePos[i]}>
      <mesh ref={halo}><ringGeometry args={[0.2, 0.225, 48]} /><meshBasicMaterial color={col} transparent opacity={0.2} side={THREE.DoubleSide} /></mesh>
      <mesh ref={m} onClick={(e) => { e.stopPropagation(); onSelect(i) }} onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}>
        <sphereGeometry args={[0.15, 24, 24]} /><meshStandardMaterial color={col} emissive={col} emissiveIntensity={selected ? 1.6 : 0.75} roughness={0.3} />
      </mesh>
    </group>
  )
}

function Particles({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = 140
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 2.8 + ((i * 7919) % 100) / 100 * 1.4 // deterministic pseudo-random shell
      const th = ((i * 2654435761) % 1000) / 1000 * Math.PI * 2
      const ph = Math.acos(1 - 2 * (((i * 40503) % 1000) / 1000))
      a.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3)
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3))
    return g
  }, [])
  useFrame((s) => { if (!reduced && ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.04 })
  return <points ref={ref} geometry={geo}><pointsMaterial color="#a9bfff" size={0.028} sizeAttenuation transparent opacity={0.65} /></points>
}

function Rig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (!g.current || reduced) return
    g.current.rotation.y += (s.pointer.x * 0.35 - g.current.rotation.y) * 0.05
    g.current.rotation.x += (-s.pointer.y * 0.2 - g.current.rotation.x) * 0.05
  })
  return <group ref={g}>{children}</group>
}

function Frameloop({ reduced, selected }: { reduced: boolean; selected: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => { if (reduced) invalidate() }, [reduced, selected, invalidate])
  return null
}

export default function CoreScene({ selected, onSelect, onFail, onReady, reduced }: { selected: number; onSelect: (i: number) => void; onFail: () => void; onReady: () => void; reduced: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = wrap.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 })
    io.observe(el)
    const vis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.3, 9.6], fov: 38 }} frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { onReady(); gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onFail() }) }}
        aria-hidden="true">
        <ambientLight intensity={0.5} />
        <pointLight position={[4, 4, 5]} intensity={40} color="#9bb8ff" />
        <pointLight position={[-5, -2, 3]} intensity={26} color="#b9a8ff" />
        <Rig reduced={reduced}>
          <Core reduced={reduced} />
          <Links selected={selected} reduced={reduced} />
          {AGENT_MODULES.map((_, i) => <AgentNode key={i} i={i} selected={selected === i} onSelect={onSelect} reduced={reduced} />)}
          <Particles reduced={reduced} />
        </Rig>
        <Frameloop reduced={reduced} selected={selected} />
      </Canvas>
    </div>
  )
}
