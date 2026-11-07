import { defineConfig, devices } from '@playwright/test'

const PORT = 8799

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Pixel 7'], trace: 'off' },
  webServer: {
    command: `npx vite build && tsx server/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test', PORT: String(PORT), TOPUP_PROVIDER: 'mock', PGLITE_DIR: 'memory',
      PUBLIC_APP_URL: `http://localhost:${PORT}`, SUPPORT_EMAIL: 'help@loadup.test',
    },
  },
})
