import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { login, resetDemo } from './helpers'
import { fullFlow, runScenario } from './run-helper'

// Visual QA: captures every key page at five widths in dark and light, and regenerates the homepage product previews
// from the running app. Run: npx playwright test specs/design-qa.spec.ts
const out = path.resolve(__dirname, '../../../docs/design/screenshots')
const previews = path.resolve(__dirname, '../../../apps/web/public/previews')
let caseId = '', iamRun = '', authRun = ''

test.beforeAll(async () => {
  fs.mkdirSync(out, { recursive: true })
  fs.mkdirSync(previews, { recursive: true })
  await resetDemo()
  caseId = await fullFlow('demo-web')
  await fullFlow('demo-auth-logs')
  iamRun = await runScenario('demo-aws-iam')
  authRun = await runScenario('demo-auth-logs')
  await runScenario('demo-ai-agent')
})

type Shot = [string, string, (p: Page) => Promise<void>]
const nothing = async () => {}
const pages = (): Shot[] => [
  ['overview', '/app', nothing],
  ['case', `/app/verify/${caseId}`, nothing],
  ['attack-paths', `/app/assessments/runs/${iamRun}`, async (p) => { await p.getByRole('tab', { name: 'Attack path' }).click(); await p.getByRole('button', { name: /hypothesis/ }).first().click().catch(() => {}) }],
  ['replay', `/app/assessments/runs/${authRun}`, async (p) => { await p.getByRole('tab', { name: 'Replay' }).click(); await p.getByRole('button', { name: 'Jump to first detection' }).click() }],
  ['agents', '/app/agents', nothing],
  ['ai-security', '/app/ai-security', nothing],
  ['findings', '/app/findings', nothing],
  ['cloud', '/app/cloud', nothing],
  ['settings', '/app/settings', nothing],
]

test('regenerate product previews from the running app', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 })
  await page.addInitScript(() => localStorage.setItem('aegis-theme', 'dark'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page)
  for (const [name, url, act] of pages().filter((p) => ['overview', 'case', 'attack-paths', 'replay', 'agents'].includes(p[0]))) {
    await page.goto(url)
    await page.locator('h1').first().waitFor()
    await act(page)
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(previews, `${name}.png`) })
  }
})

const widths = [375, 768, 1280, 1440, 1920]
for (const theme of ['dark', 'light'] as const) {
  for (const w of widths) {
    if (theme === 'light' && ![375, 1440].includes(w)) continue
    test(`design QA ${theme} ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w < 500 ? 812 : 900 })
      await page.addInitScript((t) => localStorage.setItem('aegis-theme', t), theme)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      // public home, full page
      await page.goto('/')
      await page.locator('h1').first().waitFor()
      await page.waitForTimeout(1800) // allow the 3D scene to mount
      await page.screenshot({ path: path.join(out, `home-${theme}-${w}.png`), fullPage: true })
      await login(page)
      for (const [name, url, act] of pages()) {
        await page.goto(url)
        await page.locator('h1').first().waitFor()
        await act(page)
        await page.waitForTimeout(500)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${name} ${theme} ${w}px horizontal overflow`).toBeLessThanOrEqual(1)
        await page.screenshot({ path: path.join(out, `${name}-${theme}-${w}.png`), fullPage: name === 'overview' || name === 'case' })
      }
    })
  }
}
