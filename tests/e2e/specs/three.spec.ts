import { expect, test } from '@playwright/test'

test.describe('3D intelligence core', () => {
  test('mounts a WebGL canvas, selection works by list, and links into the real app', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await expect(page.locator('.scene')).toHaveAttribute('data-scene', 'webgl', { timeout: 20_000 })
    await expect(page.locator('.scene canvas')).toBeVisible()
    const box = await page.locator('.scene canvas').boundingBox()
    expect(box!.width).toBeGreaterThan(200)
    await page.getByRole('button', { name: 'Cloud Security Agent' }).click()
    const detail = page.locator('[aria-live=polite]', { hasText: 'Cloud Security Agent' })
    await expect(detail.getByText(/never calls AWS/)).toBeVisible()
    await detail.getByRole('link', { name: /Open Cloud Checks/ }).click()
    await expect(page).toHaveURL(/\/login|\/app\/cloud/) // signed out -> routed through login, not a dead link
    expect(errors).toEqual([])
  })

  test('canvas is actually drawing (screenshot differs with the canvas hidden)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.scene')).toHaveAttribute('data-scene', 'webgl', { timeout: 20_000 })
    await page.waitForTimeout(1200)
    const withCanvas = await page.locator('.scene').screenshot()
    await page.addStyleTag({ content: '.scene canvas { visibility: hidden !important }' })
    const without = await page.locator('.scene').screenshot()
    expect(withCanvas.equals(without)).toBe(false)
    expect(withCanvas.length).toBeGreaterThan(without.length + 5_000) // the scene adds substantial image detail
  })

  test('falls back to the static constellation when WebGL is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...a: any[]) {
        return /webgl/.test(type) ? null : (orig as any).call(this, type, ...a)
      } as any
    })
    await page.goto('/')
    await expect(page.locator('.scene')).toHaveAttribute('data-scene', 'static')
    await expect(page.locator('.scene canvas')).toHaveCount(0)
    await expect(page.getByRole('img', { name: /Constellation of five agent modules/ })).toBeVisible()
    await page.getByRole('button', { name: 'Red Team Agent' }).click()
    await expect(page.getByText(/policy-checked checks against fixtures/).first()).toBeVisible()
  })

  test('recovers gracefully from WebGL context loss', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.scene')).toHaveAttribute('data-scene', 'webgl', { timeout: 20_000 })
    await page.evaluate(() => {
      const c = document.querySelector('.scene canvas') as HTMLCanvasElement
      const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext
      gl.getExtension('WEBGL_lose_context')!.loseContext()
    })
    await expect(page.locator('.scene')).toHaveAttribute('data-scene', 'static')
    await expect(page.getByRole('img', { name: /Constellation of five agent modules/ })).toBeVisible()
  })

  test('reduced motion: content is visible immediately, scene still renders', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('.scene')).toHaveAttribute('data-scene', 'webgl', { timeout: 20_000 })
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter((e) => getComputedStyle(e).opacity !== '1').length)
    expect(hidden).toBe(0)
  })

  test('scene pauses rendering when scrolled out of view', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.scene')).toHaveAttribute('data-scene', 'webgl', { timeout: 20_000 })
    const frames = async () => page.evaluate(() => new Promise<number>((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 600) requestAnimationFrame(f); else res(n) }; requestAnimationFrame(f) }))
    // R3F frameloop='never' off-screen means the page does less work; assert via the canvas not repainting.
    const snap = () => page.evaluate(() => { const c = document.querySelector('.scene canvas') as HTMLCanvasElement; return c.toDataURL().length })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(700)
    const a = await snap(); await page.waitForTimeout(500); const b = await snap()
    expect(await frames()).toBeGreaterThan(5)
    expect(a === b || Math.abs(a - b) < 50).toBeTruthy()
  })
})

test('app workflows do not depend on WebGL', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = (() => null) as any })
  await page.goto('/login')
  await page.getByLabel('Email').fill('analyst@aegis.local')
  await page.getByLabel('Password').fill(process.env.AEGIS_DEV_SEED_PASSWORD ?? 'aegis-demo-2026!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app/)
  await expect(page.getByText(/Command center/)).toBeVisible()
})
