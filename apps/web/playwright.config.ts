import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:5174', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API with fake providers and an in-memory database.
      command: 'pnpm --filter @lfwa/api start',
      env: {
        PORT: '8788',
        DATABASE_PATH: ':memory:',
        FAKE_LLM: 'true',
        PUBLIC_URL: 'http://localhost:5174',
      },
      url: 'http://localhost:8788/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec vite --port 5174 --strictPort',
      env: { API_URL: 'http://localhost:8788' },
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
