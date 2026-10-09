import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

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
  use: { baseURL: 'http://localhost:5174', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API with fake providers and an in-memory database.
      command: `rm -rf "${e2eDb}" "${e2eDb}-wal" "${e2eDb}-shm" "${e2eOutbox}" && pnpm --filter @lfwa/api start`,
      env: {
        PORT: '8788',
        DATABASE_PATH: e2eDb,
        FAKE_LLM: 'true',
        MAIL_TRANSPORT: 'file',
        MAIL_OUTBOX_DIR: e2eOutbox,
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
