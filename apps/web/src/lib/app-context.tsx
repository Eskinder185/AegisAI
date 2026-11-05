import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, get, patch, post, setCsrf } from './api'

export type User = { id: string; email: string; display_name: string; role: 'admin' | 'analyst' | 'viewer'; preferences: Record<string, any> }

/* ---------- theme ---------- */
type Theme = 'light' | 'dark' | 'system'
const applyTheme = (t: Theme) => {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('aegis-theme') as Theme) || 'dark')
  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('aegis-theme', theme)
    if (theme !== 'system') return
    const m = matchMedia('(prefers-color-scheme: dark)')
    const f = () => applyTheme('system')
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [theme])
  return { theme, setTheme }
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; bad?: boolean }
const ToastCtx = createContext<{ push: (t: string, bad?: boolean) => void }>({ push: () => {} })
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random()
    setList((l) => [...l, { id, text, bad }])
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 5500)
  }, [])
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- auth ---------- */
type AuthState = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  savePrefs: (p: Record<string, any>) => Promise<void>
  can: (role: 'analyst' | 'admin') => boolean
}
const AuthCtx = createContext<AuthState>(null as unknown as AuthState)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const r = await get('/auth/me')
        setCsrf(r.csrf_token)
        return r.user as User
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    retry: false,
    staleTime: 60_000,
  })
  const login = useCallback(
    async (email: string, password: string) => {
      const r = await post('/auth/login', { email, password })
      setCsrf(r.csrf_token)
      qc.setQueryData(['me'], r.user)
    },
    [qc],
  )
  const logout = useCallback(async () => {
    try {
      await post('/auth/logout')
    } finally {
      setCsrf('')
      qc.clear()
      qc.setQueryData(['me'], null)
    }
  }, [qc])
  const savePrefs = useCallback(
    async (p: Record<string, any>) => {
      const u = await patch('/auth/preferences', p)
      qc.setQueryData(['me'], u)
    },
    [qc],
  )
  const user = q.data ?? null
  const can = useCallback(
    (role: 'analyst' | 'admin') => (!user ? false : role === 'admin' ? user.role === 'admin' : user.role !== 'viewer'),
    [user],
  )
  const value = useMemo(() => ({ user, loading: q.isLoading, login, logout, savePrefs, can }), [user, q.isLoading, login, logout, savePrefs, can])
  if (q.isError) {
    return (
      <div className="container" style={{ padding: '4rem 0' }}>
        <div className="callout danger" role="alert">
          <strong>Cannot reach the AegisAI API.</strong>
          <p className="mb0">Start it with <code>scripts\dev.ps1</code> (or see the README), then reload this page.</p>
        </div>
      </div>
    )
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useViewMode = () => {
  const { user, savePrefs } = useAuth()
  const mode: 'guided' | 'analyst' = user?.preferences?.view_mode ?? 'guided'
  return { mode, advanced: mode === 'analyst', setMode: (m: 'guided' | 'analyst') => savePrefs({ view_mode: m }) }
}
