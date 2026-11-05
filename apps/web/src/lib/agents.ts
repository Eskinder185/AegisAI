// The five agent modules shown on the public site. They map to real application sections.
// Honesty: each is a deterministic module (a model is optional and off by default), not an autonomous LLM agent.
export type AgentModule = { id: string; name: string; short: string; color: string; role: string; does: string; link: string; linkLabel: string }

export const AGENT_MODULES: AgentModule[] = [
  { id: 'red', name: 'Red Team Agent', short: 'Red', color: '#ff7a70', role: 'Finds weaknesses',
    does: 'Runs bounded, policy-checked checks against fixtures and records observations with source, time and confidence. It proposes; the policy engine decides.',
    link: '/app/assessments', linkLabel: 'Open Assessments' },
  { id: 'blue', name: 'Blue Team Agent', short: 'Blue', color: '#6aa6ff', role: 'Watches and detects',
    does: 'Replays recorded telemetry through versioned detection rules and turns alerts into incidents with cited events and a next step.',
    link: '/app/investigations', linkLabel: 'Open Investigations' },
  { id: 'purple', name: 'Purple Team Agent', short: 'Purple', color: '#b49cff', role: 'Proves the fix',
    does: 'Runs the same versioned scenario before and after an approved fixture change and computes the difference from stored results.',
    link: '/app/verify', linkLabel: 'Open Verify Fixes' },
  { id: 'cloud', name: 'Cloud Security Agent', short: 'Cloud', color: '#59d6c8', role: 'Reads configuration',
    does: 'Analyses IAM policies and Terraform text offline, pointing at the exact line. It never calls AWS and never asks for credentials.',
    link: '/app/cloud', linkLabel: 'Open Cloud Checks' },
  { id: 'eval', name: 'AI Evaluation Agent', short: 'Eval', color: '#f2c46b', role: 'Tests AI agents',
    does: 'Attacks a mock agent with prompt-injection cases and a fake canary; deterministic evaluators, never a model, decide pass or fail.',
    link: '/app/ai-security', linkLabel: 'Open AI Security' },
]

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
