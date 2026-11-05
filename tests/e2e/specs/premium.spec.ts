import { expect, test } from '@playwright/test'
import { expectAccessible, login, resetDemo } from './helpers'
import { runScenario } from './run-helper'

let iamRun = ''
let authRun = ''
test.beforeAll(async () => {
  await resetDemo()
  iamRun = await runScenario('demo-aws-iam')
  authRun = await runScenario('demo-auth-logs')
})

test.describe('shell: palette, shortcuts, notifications, breadcrumbs', () => {
  test('command palette searches real records and navigates by keyboard', async ({ page }) => {
    await login(page)
    await page.keyboard.press('Control+k')
    const dlg = page.getByRole('dialog', { name: 'Command palette' })
    await expect(dlg).toBeVisible()
    const box = dlg.getByRole('combobox')
    await expect(box).toBeFocused()
    await box.fill('Cloud Checks')
    await box.press('Enter')
    await expect(page).toHaveURL(/\/app\/cloud/)
    await page.keyboard.press('Control+k')
    await page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox').fill('Allow Action')
    await expect(page.getByRole('option', { name: /This permission lets the holder do anything/ }).first()).toBeVisible() // a real finding from the IAM run
    await expectAccessible(page, 'palette with results')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/findings\/[0-9a-f-]{36}/)
    await page.keyboard.press('Control+k')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0)
  })

  test('g-chords and ? help work, and are ignored while typing', async ({ page }) => {
    await login(page)
    await page.keyboard.press('g')
    await page.keyboard.press('v')
    await expect(page).toHaveURL(/\/app\/verify$/)
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.goto('/app/findings')
    await page.getByLabel('Search').fill('gv')
    await expect(page).toHaveURL(/\/app\/findings$/)
  })

  test('notification center shows real job and finding activity, read state persists', async ({ page }) => {
    await login(page)
    const bell = page.getByRole('button', { name: /Notifications, \d+ unread/ })
    await expect(bell).toBeVisible()
    await bell.click()
    const panel = page.getByRole('region', { name: 'Notifications' })
    await expect(panel.getByText(/Job succeeded: iam-least-privilege/)).toBeVisible()
    await expect(panel.getByText('Critical finding open').first()).toBeVisible()
    await panel.getByRole('button', { name: 'Mark all read' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Notifications, 0 unread' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Notifications, 0 unread' })).toBeVisible()
  })

  test('breadcrumbs and deep links work with back/forward', async ({ page }) => {
    await login(page)
    await page.goto(`/app/assessments/runs/${iamRun}`)
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs.getByRole('link', { name: 'Assessments' })).toBeVisible()
    await crumbs.getByRole('link', { name: 'Assessments' }).click()
    await expect(page).toHaveURL(/\/app\/assessments$/)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(iamRun))
    await page.goForward()
    await expect(page).toHaveURL(/\/app\/assessments$/)
  })

  test('sidebar collapse persists', async ({ page }) => {
    await login(page)
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await page.reload()
    await expect(page.locator('.shell.collapsed')).toHaveCount(1)
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.locator('.shell.collapsed')).toHaveCount(0)
  })
})

test.describe('AI agent control center', () => {
  test('shows roles, scope and real history; never invents usage', async ({ page }) => {
    await login(page)
    await page.goto('/app/agents')
    const blue = page.locator('article', { has: page.getByRole('heading', { name: 'Blue Analyst' }) })
    await expect(blue.getByText('log_replay').first()).toBeVisible()
    await expect(blue.getByText(/Not available: deterministic roles use no model tokens/)).toBeVisible()
    await blue.getByText(/Execution history/).click()
    await expect(blue.getByText(/Replay events through enabled detection rules/).first()).toBeVisible()
    await expect(page.getByText('Per-agent pause is not implemented')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Pause/ })).toHaveCount(0) // no control without a backend
    await expectAccessible(page, 'agents')
  })
})

test.describe('attack-path graph', () => {
  test('hypotheses are distinct from observations, filterable, selectable and keyboard accessible', async ({ page }) => {
    await login(page)
    await page.goto(`/app/assessments/runs/${iamRun}`)
    await page.getByRole('tab', { name: 'Attack path' }).click()
    await expect(page.getByText(/dashed = hypothesis/)).toBeVisible()
    const hypNode = page.getByRole('button', { name: /hypothesis/ }).first()
    await hypNode.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('This is a hypothesis, not a confirmed compromise.')).toBeVisible()
    await expect(page.getByText('Recommended action')).toBeVisible()
    await page.getByLabel('show hypotheses').uncheck()
    await expect(page.getByRole('button', { name: /hypothesis/ })).toHaveCount(0)
    await page.getByRole('button', { name: /vulnerability: .*critical/ }).first().click()
    await expect(page.getByRole('button', { name: /Copy evidence id OBS-/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Show as accessible list' }).click()
    await expect(page.getByRole('table', { name: 'Nodes and their relationships' })).toBeVisible()
    await expectAccessible(page, 'graph list')
    await page.getByRole('button', { name: 'Show graph' }).click()
    await expectAccessible(page, 'graph')
  })

  test('zoom controls change the view and the standalone page works', async ({ page }) => {
    await login(page)
    await page.goto('/app/attack-paths')
    const svg = page.getByRole('group', { name: /Attack-path graph/ })
    await expect(svg).toBeVisible()
    const before = await svg.getAttribute('viewBox')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    expect(await svg.getAttribute('viewBox')).not.toBe(before)
    await page.getByRole('button', { name: 'Reset' }).click()
    expect(await svg.getAttribute('viewBox')).toBe(before)
    await expectAccessible(page, 'attack paths page')
  })
})

test.describe('simulation replay', () => {
  test('scrubbing reconstructs recorded events and finds the detection', async ({ page }) => {
    await login(page)
    await page.goto(`/app/assessments/runs/${authRun}`)
    await page.getByRole('tab', { name: 'Replay' }).click()
    await expect(page.getByText(/Replay of recorded data/)).toBeVisible()
    await expect(page.getByText(/Nothing is being executed/)).toBeVisible()
    await expect(page.getByText(/No detection yet in this replay/)).toBeVisible()
    await page.getByRole('button', { name: 'Jump to first detection' }).click()
    await expect(page.getByText('Detection fired')).toBeVisible()
    await expect(page.getByText(/First detection occurred at frame/)).toBeVisible()
    const slider = page.getByRole('slider', { name: 'Replay position' })
    await slider.press('Home')
    await expect(page.getByText(/Frame 1 \/ /)).toBeVisible()
    await slider.press('End')
    await expect(page.getByText(/Frame (\d+) \/ \1 /)).toBeVisible()
    await page.getByRole('button', { name: 'Restart' }).click()
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByText(/Frame ([2-9]|\d{2,}) \/ /)).toBeVisible()
    await page.getByRole('button', { name: 'Pause' }).click()
    await expectAccessible(page, 'replay')
  })
})
