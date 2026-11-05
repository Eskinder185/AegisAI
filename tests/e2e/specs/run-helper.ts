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
