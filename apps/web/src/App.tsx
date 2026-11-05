import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { LoadingBlock } from './components/ui'
import PublicLayout from './pages/public/PublicLayout'
import Home from './pages/public/Home'
import { About, AISecurity, BlueTeam, CloudPosture, Contact, Docs, Faq, HowItWorks, Product, PurpleTeam, RedTeam } from './pages/public/Marketing'
import Login from './pages/app/Login'
import Shell from './pages/app/Shell'

const Overview = lazy(() => import('./pages/app/Overview'))
const Lab = lazy(() => import('./pages/app/Lab'))
const Assessments = lazy(() => import('./pages/app/Assessments').then((m) => ({ default: m.Assessments })))
const RunDetail = lazy(() => import('./pages/app/Assessments').then((m) => ({ default: m.RunDetail })))
const Investigations = lazy(() => import('./pages/app/Investigations').then((m) => ({ default: m.Investigations })))
const IncidentDetail = lazy(() => import('./pages/app/Investigations').then((m) => ({ default: m.IncidentDetail })))
const VerifyList = lazy(() => import('./pages/app/Verify').then((m) => ({ default: m.VerifyList })))
const CaseView = lazy(() => import('./pages/app/Verify'))
const AiSecurityPage = lazy(() => import('./pages/app/AiSecurity'))
const Cloud = lazy(() => import('./pages/app/Cloud'))
const Findings = lazy(() => import('./pages/app/Findings').then((m) => ({ default: m.Findings })))
const FindingDetail = lazy(() => import('./pages/app/Findings').then((m) => ({ default: m.FindingDetail })))
const Reports = lazy(() => import('./pages/app/Reports'))
const Settings = lazy(() => import('./pages/app/Settings'))

function NotFound() {
  return (
    <main className="container" style={{ padding: '4rem 0' }}>
      <h1>Page not found</h1>
      <p className="muted">That address does not exist.</p>
      <Link className="btn primary" to="/">Go home</Link>
    </main>
  )
}

export default function App() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: '3rem 0' }}><LoadingBlock /></div>}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="product" element={<Product />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="red-team" element={<RedTeam />} />
          <Route path="blue-team" element={<BlueTeam />} />
          <Route path="purple-team" element={<PurpleTeam />} />
          <Route path="ai-security" element={<AISecurity />} />
          <Route path="cloud-posture" element={<CloudPosture />} />
          <Route path="docs" element={<Docs />} />
          <Route path="about" element={<About />} />
          <Route path="faq" element={<Faq />} />
          <Route path="contact" element={<Contact />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="app" element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="lab" element={<Lab />} />
          <Route path="assessments" element={<Assessments />} />
          <Route path="assessments/runs/:id" element={<RunDetail />} />
          <Route path="investigations" element={<Investigations />} />
          <Route path="investigations/:id" element={<IncidentDetail />} />
          <Route path="verify" element={<VerifyList />} />
          <Route path="verify/:id" element={<CaseView />} />
          <Route path="ai-security" element={<AiSecurityPage />} />
          <Route path="cloud" element={<Cloud />} />
          <Route path="findings" element={<Findings />} />
          <Route path="findings/:id" element={<FindingDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
