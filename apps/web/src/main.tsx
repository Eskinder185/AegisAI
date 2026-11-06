import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider, ToastProvider } from './lib/app-context'
import { ApiError } from './lib/api'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles.css'
import './design.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      refetchOnWindowFocus: false,
      retry: (n, e) => !(e instanceof ApiError && [401, 403, 404, 422].includes(e.status)) && n < 1,
    },
  },
})

// GitHub Pages uses hash routing so deep links work without a server rewrite.
const PublicRouter = import.meta.env.VITE_STATIC_DEMO === 'true' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <PublicRouter>
        <ToastProvider>
          <AuthProvider>
            <>
                {import.meta.env.VITE_STATIC_DEMO === 'true' && <div role="status" style={{ padding: '8px 16px', background: '#163047', color: '#fff', textAlign: 'center', fontSize: 13, position: 'relative', zIndex: 100 }}> Public frontend preview using demonstration content. Login and backend-dependent app features are not available on this static site. </div>}
                <App />
              </>
          </AuthProvider>
        </ToastProvider>
      </PublicRouter>
    </QueryClientProvider>
  </StrictMode>,
)
