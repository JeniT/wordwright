import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// Ports can be overridden so agents working in separate worktrees can run e2e at the same time
// without one silently reusing the other's servers (and so testing the wrong code).
const webPort = process.env.E2E_WEB_PORT ?? '5174'
const apiPort = process.env.E2E_API_PORT ?? '8788'

// A real file (not :memory:) so the e2e run exercises migrations and WAL mode like production does.
const e2eDb = fileURLToPath(new URL('./test-results/e2e.sqlite', import.meta.url))
// Emails are written here as JSON files; tests read them like an inbox.
export const e2eOutbox = fileURLToPath(new URL('./test-results/outbox', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${webPort}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API with fake providers and an in-memory database.
      command: `rm -rf "${e2eDb}" "${e2eDb}-wal" "${e2eDb}-shm" "${e2eOutbox}" && pnpm --filter @lfwa/api start`,
      env: {
        PORT: apiPort,
        DATABASE_PATH: e2eDb,
        FAKE_LLM: 'true',
        FAKE_FEEDS: 'true',
        PAGE_FETCHER: 'fake',
        MAIL_TRANSPORT: 'file',
        MAIL_OUTBOX_DIR: e2eOutbox,
        PUBLIC_URL: `http://localhost:${webPort}`,
      },
      url: `http://localhost:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec vite --port ${webPort} --strictPort`,
      env: { API_URL: `http://localhost:${apiPort}` },
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
