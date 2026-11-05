import { expect, test, type Page } from '@playwright/test'
import { expectAccessible, login, resetDemo, setPrefs } from './helpers'

test.beforeAll(async () => {
  await resetDemo()
})

/** Starts a demo from Verify Fixes, waits for the real baseline job, returns when baseline results are shown. */
async function startDemo(page: Page, title: RegExp) {
  await page.goto('/app/verify')
  const card = page.locator('article', { has: page.getByRole('heading', { name: title }) })
  await card.getByRole('button', { name: /Start/ }).click()
  await expect(page).toHaveURL(/\/app\/verify\/[0-9a-f-]{36}/)
  await expect(page.getByRole('heading', { name: 'Baseline results' })).toBeVisible()
}

async function approveAndRetest(page: Page) {
  await page.getByRole('button', { name: /Review and approve this change/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Approve and apply' })).toBeDisabled() // needs explicit acknowledgement
  await dialog.getByLabel(/I understand this changes the demo fixture only/).check()
  await dialog.getByRole('button', { name: 'Approve and apply' }).click()
  await page.getByRole('button', { name: 'Re-run the same scenario' }).click()
  await expect(page.getByRole('heading', { name: 'Before vs. after' })).toBeVisible()
}

test.describe('public site', () => {
  test('home page states the promise and passes accessibility checks', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Safely test your defenses')
    await expect(page.getByText('Sample values from the built-in Demo 1')).toBeVisible()
    await expectAccessible(page, 'home light')
    await page.getByRole('button', { name: /^Theme:/ }).click()
    await expectAccessible(page, 'home after theme toggle')
  })

  for (const path of ['/product', '/how-it-works', '/red-team', '/blue-team', '/purple-team', '/ai-security', '/cloud-posture', '/docs', '/about', '/faq', '/contact', '/login']) {
    test(`page ${path} renders and is accessible`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      await expectAccessible(page, path)
    })
  }

  test('contact form saves feedback to the local workspace', async ({ page }) => {
    await page.goto('/contact')
    await page.getByLabel('Your feedback').fill('The demo lab is clear. Please add dark charts.')
    await page.getByRole('button', { name: 'Save feedback' }).click()
    await expect(page.getByText('Saved in this workspace')).toBeVisible()
  })
})

test.describe('authentication', () => {
  test('wrong password shows an error and stays signed out', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('analyst@aegis.local')
    await page.getByLabel('Password').fill('definitely-wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('incorrect')
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login/)
  })

  test('onboarding wizard is keyboard operable and persists', async ({ page }) => {
    await setPrefs('viewer', { onboarded: false })
    await login(page, 'viewer', false)
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByRole('heading', { name: 'Welcome to AegisAI' })).toBeVisible()
    await dlg.getByRole('button', { name: 'Next' }).click()
    await dlg.getByLabel(/Explain the concepts first/).check()
    await dlg.getByRole('button', { name: 'Next' }).click()
    await dlg.getByRole('button', { name: 'Get started' }).click()
    await expect(dlg).toBeHidden()
    await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('golden-path demos (real worker jobs, persisted results)', () => {
  test('Demo 1: web hardening — find, approve fixture fix, verify', async ({ page }) => {
    await login(page)
    await startDemo(page, /Web hardening/)
    await expect(page.getByText('Some browser protections are missing', { exact: false }).or(page.getByText(/does not tell browsers/))).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What the blue-team assistant saw' })).toBeVisible()
    await expect(page.getByText('WEB-XSS-PROBE')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Proposed fix/ })).toBeVisible()
    await expectAccessible(page, 'case baseline')
    await approveAndRetest(page)
    await expect(page.getByText(/Verified \(simulated\):/)).toBeVisible()
    const measures = page.getByRole('table', { name: 'Before and after measures' })
    await expect(measures.getByRole('row', { name: /Findings 4 0/ })).toBeVisible()
    await expectAccessible(page, 'case comparison')
    // report export is a real, grounded document
    const [report] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Open printable report' }).click()])
    await expect(report.getByText('VERIFIED', { exact: true }).first()).toBeVisible()
    await expect(report.getByText('SIMULATED').first()).toBeVisible()
    await report.close()
    await page.goto('/app/findings')
    await expect(page.getByText('Verified (simulated)').first()).toBeVisible()
  })

  test('Demo 2: IAM offline — exact statement flagged, least privilege keeps required access', async ({ page }) => {
    await login(page)
    await startDemo(page, /Cloud access/)
    await expect(page.getByText(/Evidence: Line \d+: `?"Action": "\*"/).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Access simulation (fixture behaviour)' })).toBeVisible()
    await expect(page.getByText('Inferred', { exact: true }).first()).toBeVisible()
    await approveAndRetest(page)
    const measures = page.getByRole('table', { name: 'Before and after measures' })
    await expect(measures.getByRole('row', { name: /Required access still works 3\/3 3\/3/ })).toBeVisible()
    await expect(measures.getByRole('row', { name: /Risky access blocked 0\/3 3\/3/ })).toBeVisible()
  })

  test('Demo 3: detection gap — draft rule tested, guided fix, recall improves', async ({ page }) => {
    await login(page)
    await startDemo(page, /Detection gap/)
    await expect(page.getByText('Missed').first()).toBeVisible()
    await page.getByLabel(/Distinct accounts failing/).fill('3')
    await page.getByRole('button', { name: /Test this draft/ }).click()
    await expect(page.getByText(/false-positive alert\(s\)/)).toContainText(/[1-9]\d* false-positive/)
    await page.getByLabel(/Distinct accounts failing/).fill('10')
    await page.getByRole('button', { name: /Test this draft/ }).click()
    await expect(page.getByText(/0 false-positive alert/)).toBeVisible()
    await approveAndRetest(page)
    const measures = page.getByRole('table', { name: 'Before and after measures' })
    await expect(measures.getByRole('row', { name: /Attack campaigns detected \(recall\) 0\.5 1/ })).toBeVisible()
    await page.goto('/app/investigations')
    await expect(page.getByRole('link', { name: /AUTH-SPRAY-002/ }).first()).toBeVisible()
    await page.getByRole('link', { name: /AUTH-SPRAY-002/ }).first().click()
    await expect(page.getByRole('heading', { name: /Timeline/ })).toBeVisible()
    await expect(page.getByText('Suggested next investigation step')).toBeVisible()
  })

  test('Demo 4: AI guardrails — injection succeeds on a weak agent, gates refuse after the fix', async ({ page }) => {
    await login(page)
    await startDemo(page, /AI agent guardrails/)
    await expect(page.getByText('Guardrail tests passed').first()).toBeVisible()
    const first = page.locator('article', { hasText: 'AI-001' }).first()
    await first.getByRole('button', { name: /Show input, trace/ }).click()
    await expect(first.getByText('send_email').first()).toBeVisible()
    await expect(first.getByText('Fail', { exact: true })).toBeVisible()
    await approveAndRetest(page)
    await expect(page.getByText(/Verified \(simulated\):/)).toBeVisible()
    const measures = page.getByRole('table', { name: 'Before and after measures' })
    await expect(measures.getByRole('row', { name: /Guardrail tests passed 1 7/ })).toBeVisible()
    await page.goto('/app/ai-security')
    const c = page.locator('article', { hasText: 'AI-003' }).first()
    await c.getByRole('button', { name: /Show input, trace/ }).click()
    await expect(c.getByText(/separation bypassed/i).first()).toBeVisible() // separation is not a perfect defence...
    await expect(c.getByText(/denied/i).first()).toBeVisible() // ...so the code-enforced gate refuses the tool call
    await expect(c.getByText('tool_allowlist').first()).toBeVisible()
  })
})

test.describe('safety controls and roles', () => {
  test('policy tester blocks metadata address and forbidden capability', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/app/lab')
    const card = page.locator('article', { hasText: 'Lab web container' })
    await card.getByRole('button', { name: 'Scope review' }).click()
    await card.getByLabel('Destination (optional)').fill('http://169.254.169.254/latest/meta-data/')
    await card.getByRole('button', { name: 'Check' }).click()
    await expect(card.getByText('Blocked', { exact: true })).toBeVisible()
    await card.getByLabel('Action').selectOption('exploit')
    await card.getByRole('button', { name: 'Check' }).click()
    await expect(card.getByText('forbidden_capability')).toBeVisible()
  })

  test('viewer can read but cannot start runs', async ({ page }) => {
    await login(page, 'viewer')
    await page.goto('/app/verify')
    await expect(page.getByRole('button', { name: /Start/ }).first()).toBeDisabled()
    await page.goto('/app/settings')
    await page.getByRole('tab', { name: 'People' }).click()
    await expect(page.getByText('limited to admins')).toBeVisible()
  })

  test('kill switch blocks a new run, then can be released', async ({ page }) => {
    await login(page, 'admin')
    await page.getByRole('button', { name: 'Emergency stop' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Engage and cancel jobs' }).click()
    await expect(page.getByText('Kill switch engaged').first()).toBeVisible()
    await page.goto('/app/assessments')
    await page.getByRole('button', { name: 'Run assessment' }).first().click()
    await expect(page.getByText(/kill switch/i).first()).toBeVisible()
    await page.getByRole('button', { name: 'Release kill switch' }).click()
    await expect(page.getByText('Kill switch engaged')).toHaveCount(0)
  })

  test('audit log is verified intact and records the denials', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/app/settings')
    await page.getByRole('tab', { name: 'Data & audit' }).click()
    await expect(page.getByText(/Hash chain intact/)).toBeVisible()
    await expect(page.getByText('kill_switch').first()).toBeVisible()
  })
})

test.describe('cloud checks', () => {
  test('Terraform sample yields line-level findings', async ({ page }) => {
    await login(page)
    await page.goto('/app/cloud')
    await page.getByRole('button', { name: 'Terraform snippet' }).click()
    await page.getByRole('button', { name: 'Analyse' }).click()
    await expect(page.getByText('Port 22 open to the whole internet').first()).toBeVisible()
    await expect(page.getByText(/^Line \d+$/).first()).toBeVisible()
    await expectAccessible(page, 'cloud results')
  })

  test('invalid input shows a validation error', async ({ page }) => {
    await login(page)
    await page.goto('/app/cloud')
    await page.getByLabel(/Policy or snippet/).fill('this is { not json or yaml [')
    await page.getByRole('button', { name: 'Analyse' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  })
})

test.describe('app pages: accessibility, empty/loaded states, responsive layout', () => {
  const pages = ['/app', '/app/lab', '/app/assessments', '/app/investigations', '/app/verify', '/app/ai-security', '/app/cloud', '/app/findings', '/app/reports', '/app/settings']
  for (const p of pages) {
    test(`${p} is accessible (light + dark)`, async ({ page }) => {
      await login(page)
      await page.goto(p)
      await expect(page.locator('h1').first()).toBeVisible()
      await expectAccessible(page, `${p} light`)
      await page.evaluate(() => { localStorage.setItem('aegis-theme', 'dark'); document.documentElement.dataset.theme = 'dark' })
      await expectAccessible(page, `${p} dark`)
    })
  }

  for (const [name, size] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]] as const) {
    test(`no horizontal overflow on ${name}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto('/')
      for (const p of ['/', '/product', '/faq']) {
        await page.goto(p)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `public ${p}`).toBeLessThanOrEqual(1)
      }
      await login(page)
      for (const p of ['/app', '/app/verify', '/app/findings', '/app/lab']) {
        await page.goto(p)
        await expect(page.locator('h1').first()).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `app ${p} on ${name}`).toBeLessThanOrEqual(1)
      }
    })
  }

  test('mobile menu opens and navigates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page)
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('link', { name: 'Findings' }).click()
    await expect(page).toHaveURL(/\/app\/findings/)
  })
})
