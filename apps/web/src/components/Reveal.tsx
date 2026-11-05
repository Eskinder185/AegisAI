import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

/** Reveals children when scrolled into view. Reveals immediately under reduced motion. */
export function useInView<T extends Element>(once = true, threshold = 0.18) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          if (once) io.disconnect()
        } else if (!once) setSeen(false)
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once, threshold])
  return [ref, seen] as const
}

export function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  const [ref, seen] = useInView<HTMLElement>()
  return (
    <Tag ref={ref} className={`reveal${seen ? ' in' : ''} ${className}`} style={{ ['--d' as string]: `${delay}ms` }}>
      {children}
    </Tag>
  )
}
