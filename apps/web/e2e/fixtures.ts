import { expect, test as base, type Page } from '@playwright/test'

/**
 * Watches a page for problems a user would hit but a plain assertion might not notice:
 * uncaught exceptions, `console.error`, requests that failed outright, and server errors (5xx).
 * Expected 4xx responses (wrong password, "add your key") are surfaced in the UI and asserted there.
 */
export function watchForProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('pageerror', (err) => problems.push(`uncaught exception: ${err.message}`))
  page.on('console', (msg) => {
    // The browser also logs every non-2xx response as an error; those are covered by the response check.
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
      problems.push(`console.error: ${msg.text()}`)
    }
  })
  page.on('requestfailed', (req) =>
    problems.push(`request failed: ${req.method()} ${req.url()} (${req.failure()?.errorText})`),
  )
  page.on('response', (res) => {
    if (res.status() >= 500)
      problems.push(`server error: ${res.status()} ${res.request().method()} ${res.url()}`)
  })
  return problems
}

export const test = base.extend<{ problems: string[] }>({
  // Applies to every test automatically; the test fails if the page misbehaved.
  problems: [
    async ({ page }, use) => {
      const problems = watchForProblems(page)
      await use(problems)
      expect(problems, 'browser problems').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
