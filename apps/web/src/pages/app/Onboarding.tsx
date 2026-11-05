import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Btn, Modal } from '../../components/ui'
import { useAuth } from '../../lib/app-context'

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState<'demo' | 'explain' | 'connect'>('demo')
  const nav = useNavigate()
  const { savePrefs } = useAuth()
  const finish = async () => {
    await savePrefs({ start_choice: choice, onboarded: true, view_mode: choice === 'explain' ? 'guided' : undefined })
    onDone()
    nav(choice === 'demo' ? '/app/verify' : choice === 'explain' ? '/app' : '/app/lab')
  }
  return (
    <Modal
      title={step === 0 ? 'Welcome to AegisAI' : step === 1 ? 'How would you like to start?' : 'What to expect'}
      onClose={onDone}
      footer={
        <>
          <Btn variant="ghost" onClick={onDone}>Skip</Btn>
          {step > 0 && <Btn onClick={() => setStep(step - 1)}>Back</Btn>}
          {step < 2 ? <Btn variant="primary" onClick={() => setStep(step + 1)}>Next</Btn> : <Btn variant="primary" onClick={finish}>Get started</Btn>}
        </>
      }
    >
      {step === 0 && (
        <>
          <p>AegisAI helps you <strong>find</strong> weaknesses, <strong>understand</strong> them, <strong>fix</strong> them and <strong>prove</strong> the fix worked.</p>
          <p className="callout brand">Everything here runs on built-in practice fixtures. <strong>Nothing real is scanned or changed</strong>, and every result is labelled <em>Simulated</em>.</p>
        </>
      )}
      {step === 1 && (
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend className="sr-only">Starting point</legend>
          {([
            ['demo', 'Run the demo lab', 'Walk through a full find → fix → verify loop in a few minutes.'],
            ['explain', 'Explain the concepts first', 'Stay in Guided view with plain-English explanations and a glossary.'],
            ['connect', 'Connect an authorized lab', 'Review scope and approvals. Real integrations stay disabled until approved — none ship in this version.'],
          ] as const).map(([id, t, d]) => (
            <label key={id} className="card tight" style={{ display: 'flex', gap: 12, marginBottom: 8, cursor: 'pointer', fontWeight: 400 }}>
              <input type="radio" name="start" checked={choice === id} onChange={() => setChoice(id)} />
              <span><strong>{t}</strong><br /><span className="muted small">{d}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      {step === 2 && (
        <ul>
          <li><strong>Permissions.</strong> Viewers can look; analysts can run and approve fixture changes; admins manage scope and safety controls.</li>
          <li><strong>Safety.</strong> A policy engine checks every step. The kill switch in the top bar stops everything.</li>
          <li><strong>Views.</strong> Guided shows plain English first; Analyst shows technical detail. Switch any time in the top bar.</li>
          <li><strong>AI.</strong> Optional and off by default. It can explain but never decides.</li>
        </ul>
      )}
    </Modal>
  )
}
