import fs from 'node:fs'
import path from 'node:path'
import { test } from '@playwright/test'
import { login, resetDemo } from './helpers'
import { runScenario } from './run-helper'

// Records visual QA evidence into docs/qa/screenshots. Run: npx playwright test specs/screenshots.spec.ts
const out = path.resolve(__dirname, '../../../docs/qa/screenshots')
let iam = '', auth = ''
test.beforeAll(async () => {
  fs.mkdirSync(out, { recursive: true })
  await resetDemo()
  iam = await runScenario('demo-aws-iam')
  auth = await runScenario('demo-auth-logs')
  await runScenario('demo-web')
})

const shots = (): [string, string, (p: import('@playwright/test').Page) => Promise<void>][] => [
  ['overview', '/app', async () => {}],
  ['agents', '/app/agents', async () => {}],
  ['attack-paths', `/app/assessments/runs/${iam}`, async (p) => { await p.getByRole('tab', { name: 'Attack path' }).click(); await p.getByRole('button', { name: /hypothesis/ }).first().click() }],
  ['replay', `/app/assessments/runs/${auth}`, async (p) => { await p.getByRole('tab', { name: 'Replay' }).click(); await p.getByRole('button', { name: 'Jump to first detection' }).click() }],
  ['findings', '/app/findings', async () => {}],
  ['verify', '/app/verify', async () => {}],
]

for (const [name, vp, theme] of [['desktop-light', { width: 1360, height: 900 }, 'light'], ['desktop-dark', { width: 1360, height: 900 }, 'dark'], ['phone-light', { width: 390, height: 844 }, 'light']] as const) {
  test(`screenshots ${name}`, async ({ page }) => {
    await page.setViewportSize(vp)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript((t) => localStorage.setItem('aegis-theme', t), theme)
    await login(page)
    for (const [label, url, act] of shots()) {
      await page.goto(url)
      await page.locator('h1').first().waitFor()
      await act(page)
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(out, `${name}-${label}.png`), fullPage: false })
    }
    if (name === 'desktop-light') {
      await page.goto('/')
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(out, 'desktop-light-public-home.png') })
    }
  })
}
