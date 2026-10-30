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
// A second pair, where new accounts wait for approval (the private alpha, #328), for the one spec about that. Every
// other spec runs where accounts are approved at once.
const approvalWebPort =
  process.env.E2E_APPROVAL_WEB_PORT ?? (process.env.CI ? '5175' : String(6200 + slot))
const approvalApiPort =
  process.env.E2E_APPROVAL_API_PORT ?? (process.env.CI ? '8789' : String(9800 + slot))

// Kept out of `test-results`, which Playwright empties at the start of every run, even one that then
// fails because a run is already going in this worktree: that would delete the first run's data.
// A real file (not :memory:) so the e2e run exercises migrations and WAL mode like production does.
const e2eDb = fileURLToPath(new URL('./.e2e-data/e2e.sqlite', import.meta.url))
// Emails are written here as JSON files; tests read them like an inbox.
export const e2eOutbox = fileURLToPath(new URL('./.e2e-data/outbox', import.meta.url))
// A third pair: the built app under the production Content-Security-Policy (`vite preview`), for csp.spec.ts.
const cspWebPort = process.env.E2E_CSP_WEB_PORT ?? (process.env.CI ? '5176' : String(7200 + slot))
const cspApiPort = process.env.E2E_CSP_API_PORT ?? (process.env.CI ? '8790' : String(10800 + slot))
const cspDb = fileURLToPath(new URL('./.e2e-data/csp.sqlite', import.meta.url))

const approvalDb = fileURLToPath(new URL('./.e2e-data/approval.sqlite', import.meta.url))
export const approvalOutbox = fileURLToPath(new URL('./.e2e-data/approval-outbox', import.meta.url))
/** The owner of the approval servers: confirmed, this address becomes an admin. */
export const APPROVAL_ADMIN_EMAIL = 'owner@approval.example'

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
  projects: [
    {
      name: 'chromium',
      testIgnore: /(approval|csp)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'approval',
      testMatch: /approval\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${approvalWebPort}` },
    },
    {
      name: 'csp',
      testMatch: /csp\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${cspWebPort}` },
    },
  ],
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
        ACCOUNT_APPROVAL: 'open',
        SIGNUPS_PER_HOUR: '10000', // every spec signs up its own person
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
    {
      command: `rm -rf "${approvalDb}" "${approvalDb}-wal" "${approvalDb}-shm" "${approvalOutbox}" && pnpm --filter @wordwright/api start`,
      env: {
        PORT: approvalApiPort,
        DATABASE_PATH: approvalDb,
        FAKE_LLM: 'true',
        FAKE_FEEDS: 'true',
        PAGE_FETCHER: 'fake',
        MAIL_TRANSPORT: 'file',
        MAIL_OUTBOX_DIR: approvalOutbox,
        PUBLIC_URL: `http://localhost:${approvalWebPort}`,
        ACCOUNT_APPROVAL: 'required',
        ADMIN_EMAILS: APPROVAL_ADMIN_EMAIL,
      },
      url: `http://localhost:${approvalApiPort}/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${approvalWebPort} --strictPort`,
      env: { API_URL: `http://localhost:${approvalApiPort}` },
      url: `http://localhost:${approvalWebPort}`,
      reuseExistingServer: false,
    },
    {
      command: `rm -rf "${cspDb}" "${cspDb}-wal" "${cspDb}-shm" && pnpm --filter @wordwright/api start`,
      env: {
        PORT: cspApiPort,
        DATABASE_PATH: cspDb,
        FAKE_LLM: 'true',
        FAKE_FEEDS: 'true',
        PAGE_FETCHER: 'fake',
        MAIL_TRANSPORT: 'file',
        MAIL_OUTBOX_DIR: fileURLToPath(new URL('./.e2e-data/csp-outbox', import.meta.url)),
        PUBLIC_URL: `http://localhost:${cspWebPort}`,
        ACCOUNT_APPROVAL: 'open',
      },
      url: `http://localhost:${cspApiPort}/health`,
      reuseExistingServer: false,
    },
    {
      // Built into its own folder, so a dev build in dist/ is left alone.
      command: `pnpm exec vite build --outDir .e2e-data/csp-dist --emptyOutDir && pnpm exec vite preview --outDir .e2e-data/csp-dist --port ${cspWebPort} --strictPort`,
      env: { API_URL: `http://localhost:${cspApiPort}` },
      url: `http://localhost:${cspWebPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
