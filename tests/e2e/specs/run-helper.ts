import { PASSWORD } from './helpers'

/** Runs a scenario end-to-end through the real API + worker and returns the run id. */
export async function runScenario(slug: string, baseURL = 'http://127.0.0.1:5173'): Promise<string> {
  const l = await fetch(`${baseURL}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'analyst@aegis.local', password: PASSWORD }),
  })
  const cookie = (l.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const { csrf_token } = await l.json()
  const h = { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf_token }
  const targets = await (await fetch(`${baseURL}/api/v1/targets`, { headers: h })).json()
  const t = targets.find((x: any) => x.slug === slug)
  let job = await (await fetch(`${baseURL}/api/v1/jobs`, { method: 'POST', headers: h, body: JSON.stringify({ target_id: t.id }) })).json()
  for (let i = 0; i < 60 && !['succeeded', 'failed', 'blocked', 'cancelled'].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 500))
    job = await (await fetch(`${baseURL}/api/v1/jobs/${job.id}`, { headers: h })).json()
  }
  if (job.status !== 'succeeded') throw new Error(`job ${job.status}: ${job.error}`)
  return job.run_id as string
}

/** Completes the whole find -> approve -> apply -> retest loop through the real API; returns the case id. */
export async function fullFlow(slug: string, baseURL = 'http://127.0.0.1:5173'): Promise<string> {
  const l = await fetch(`${baseURL}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'analyst@aegis.local', password: PASSWORD }),
  })
  const cookie = (l.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const { csrf_token } = await l.json()
  const h = { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf_token }
  const call = async (m: string, p: string, b?: unknown) => (await fetch(`${baseURL}/api/v1${p}`, { method: m, headers: h, body: b === undefined ? undefined : JSON.stringify(b) })).json()
  const wait = async (id: string) => { for (let i = 0; i < 80; i++) { const j = await call('GET', `/jobs/${id}`); if (['succeeded', 'failed', 'blocked', 'cancelled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 400)) } throw new Error('job timeout') }
  const t = (await call('GET', '/targets')).find((x: any) => x.slug === slug)
  const created = await call('POST', '/purple/cases', { target_id: t.id })
  await wait(created.job.id)
  const a = await call('POST', `/purple/cases/${created.case.id}/approve`, { action: 'apply', confirm: true })
  await call('POST', `/purple/cases/${created.case.id}/apply`, { approval_id: a.id })
  const rj = await call('POST', `/purple/cases/${created.case.id}/retest`)
  await wait(rj.id)
  return created.case.id as string
}
