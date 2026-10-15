import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// Each worktree gets its own pair of ports, so sessions working side by side can run e2e at the same
// time. They come from a hash of where this file lives rather than from "whatever is free": Playwright
// loads this config in every worker process too, and they must all agree. CI has one checkout and
// keeps fixed ports. E2E_WEB_PORT / E2E_API_PORT override either.
const slot =
  parseInt(
    createHash('sha1')
      .update(fileURLToPath(import.meta.url))
      .digest('hex')
      .slice(0, 6),
    16,
  ) % 500
const webPort = process.env.E2E_WEB_PORT ?? (process.env.CI ? '5174' : String(5200 + slot))
const apiPort = process.env.E2E_API_PORT ?? (process.env.CI ? '8788' : String(8800 + slot))

// Kept out of `test-results`, which Playwright empties at the start of every run, even one that then
// fails because a run is already going in this worktree: that would delete the first run's data.
// A real file (not :memory:) so the e2e run exercises migrations and WAL mode like production does.
const e2eDb = fileURLToPath(new URL('./.e2e-data/e2e.sqlite', import.meta.url))
// Emails are written here as JSON files; tests read them like an inbox.
export const e2eOutbox = fileURLToPath(new URL('./.e2e-data/outbox', import.meta.url))

// Servers are never reused: one already on these ports is somebody else's (another worktree's, or this
// one's before you edited it), and testing against it would test the wrong code. A taken port fails loudly.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Sessions in several worktrees run e2e at once on one machine, so each takes three workers, not half the cores.
  // CI has a runner to itself. A wait is allowed longer than the default 5s for when the machine is busy.
  workers: process.env.CI ? undefined : 3,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${webPort}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API with fake providers and an in-memory database.
      command: `rm -rf "${e2eDb}" "${e2eDb}-wal" "${e2eDb}-shm" "${e2eOutbox}" && pnpm --filter @wordwright/api start`,
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
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${webPort} --strictPort`,
      env: { API_URL: `http://localhost:${apiPort}` },
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
    },
  ],
})
