import { defineConfig, devices } from '@playwright/test'

// Servers: reuse running dev servers (scripts/dev.ps1) or start them. DB is reset at the start of the run.
const root = '../..'
const py = process.platform === 'win32' ? `${root}/apps/api/.venv/Scripts/python.exe` : `${root}/apps/api/.venv/bin/python`
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } }],
  webServer: [
    { command: `${py} -m uvicorn aegis.main:app --port 8000`, cwd: `${root}/apps/api`, url: 'http://127.0.0.1:8000/api/v1/health', reuseExistingServer: true, timeout: 60_000 },
    { command: `${py} services/worker/worker.py`, cwd: root, url: 'http://127.0.0.1:8000/api/v1/health', reuseExistingServer: true },
    { command: 'npm run dev -- --host 127.0.0.1', cwd: `${root}/apps/web`, url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60_000 },
  ],
})
