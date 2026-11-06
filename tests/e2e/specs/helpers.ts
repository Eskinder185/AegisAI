import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export const PASSWORD = process.env.AEGIS_DEV_SEED_PASSWORD ?? 'aegis-demo-2026!'

export async function login(page: Page, who: 'admin' | 'analyst' | 'viewer' = 'analyst', skipOnboarding = true) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(`${who}@aegis.local`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app/)
  if (skipOnboarding) {
    const skip = page.getByRole('button', { name: 'Skip' })
    // locator.isVisible() is instantaneous (its timeout option does not wait).
    // Wait briefly for the asynchronous onboarding modal before proceeding;
    // otherwise it can appear later and block screenshot/navigation clicks.
    const shown = await skip.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
    if (shown) {
      await skip.click()
      await expect(page.getByRole('dialog')).toBeHidden()
    }
  }
}

/** Fails on serious/critical axe violations. */
export async function expectAccessible(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // also exercises our reduced-motion support; avoids sampling mid-transition
  await page.waitForTimeout(150)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes) ${v.nodes[0]?.target.join(' ')}`), `axe: ${label}`).toEqual([])
}

export async function resetDemo(baseURL = 'http://127.0.0.1:5173') {
  const login = await fetch(`${baseURL}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@aegis.local', password: PASSWORD }),
  })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const { csrf_token } = await login.json()
  const r = await fetch(`${baseURL}/api/v1/settings/reset-demo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf_token },
    body: JSON.stringify({ confirm: 'RESET DEMO DATA' }),
  })
  if (!r.ok) throw new Error(`reset failed ${r.status}`)
  await fetch(`${baseURL}/api/v1/system/kill-switch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf_token },
    body: JSON.stringify({ engaged: false }),
  })
}

/** Sets a development user's preferences through the API (e.g. to re-show onboarding). */
export async function setPrefs(who: string, prefs: Record<string, unknown>, baseURL = 'http://127.0.0.1:5173') {
  const l = await fetch(`${baseURL}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${who}@aegis.local`, password: PASSWORD }),
  })
  const cookie = (l.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const { csrf_token } = await l.json()
  const r = await fetch(`${baseURL}/api/v1/auth/preferences`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf_token },
    body: JSON.stringify(prefs),
  })
  if (!r.ok) throw new Error(`prefs failed ${r.status}`)
}
