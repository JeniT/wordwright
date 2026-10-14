import { expect, test as base, type Page } from '@playwright/test'
import { HOLD_MS } from '../src/lib/hold-settings'

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

const settlers = new WeakMap<Page, () => Promise<void>>()

/**
 * Makes leaving a page safe after a change. The app shows a change at once and saves it in the background, so a test
 * that sees the change and then reloads can reload before the save was answered, and find the old state. This counts
 * the requests that change data (anything but GET) and makes `reload`, `goBack` and `goto` wait until they have been
 * answered. It waits at most a few seconds, so a request that never ends (a streamed reply) can't hang a test.
 */
function trackSaves(page: Page) {
  let saving = 0
  const isSave = (r: { method(): string }) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method())
  page.on('request', (r) => isSave(r) && saving++)
  page.on('requestfinished', (r) => isSave(r) && saving--)
  page.on('requestfailed', (r) => isSave(r) && saving--)
  const settled = async () => {
    await expect
      .poll(() => saving, { timeout: 5000 })
      .toBe(0)
      .catch(() => undefined)
    await page.waitForLoadState('networkidle').catch(() => undefined)
  }
  settlers.set(page, settled)
  for (const method of ['reload', 'goBack', 'goto'] as const) {
    const original = page[method].bind(page) as (...args: unknown[]) => Promise<unknown>
    ;(page as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      await settled()
      return original(...args)
    }
  }
}

/** Waits until the changes the page has made have been saved (see `trackSaves`), for a step that isn't a navigation. */
export const savesAnswered = (page: Page) => settlers.get(page)?.() ?? Promise.resolve()

export const test = base.extend<{ problems: string[] }>({
  // Applies to every test automatically; the test fails if the page misbehaved.
  problems: [
    async ({ page }, use) => {
      const problems = watchForProblems(page)
      trackSaves(page)
      await use(problems)
      expect(problems, 'browser problems').toEqual([])
    },
    { auto: true },
  ],
})

/**
 * Goes to a step of the profile or idea you are in, from the side menu (the menu follows you, so "Notes" means the
 * notes of whichever you are in).
 */
export async function goTo(page: Page, step: string) {
  const link = page
    .locator('nav[aria-label="Idea"], nav[aria-label="Profile"]')
    .getByRole('link', { name: step, exact: true })
  // On a phone (and on pages read beside another window) the menu is folded behind a button. Wait for the page to
  // show either the link or that button first, so a page that is still changing isn't clicked halfway.
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(link.or(menu).first()).toBeVisible()
  // The menu closes itself when the route changes, so a click that lands just before the page settles is undone:
  // try again until the link is there.
  await expect(async () => {
    if (!(await link.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false') {
      await menu.click()
    }
    await expect(link).toBeVisible({ timeout: 1500 })
  }).toPass()
  // Wait for the page to be the step's, not just for the click: the page we leave (a landing page has a Notes
  // section with its own "Add a note" box, say) is still there until the route changes, and a test that types into
  // it straight away loses what it typed when the new page replaces it.
  const href = await link.getAttribute('href')
  await link.click()
  if (href) await expect(page).toHaveURL((url) => url.pathname === href)
}

export { expect }

/** Presses and holds a hold-to-confirm button (deleting or removing something) until it fires, with the mouse. */
export async function holdToConfirm(page: Page, button: ReturnType<Page['locator']>) {
  await button.hover()
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS + 200)
  await page.mouse.up()
}

/**
 * Clicks the dotted left rail of a reorderable row, which shows its up/down arrows. `reorder` is the accessible name
 * of the row's hidden Reorder button ("Reorder note “…”"), which finds the rail. The click is in the rail's corner,
 * away from its checkbox.
 */
export async function showArrowsFor(
  scope: Page | ReturnType<Page['locator']>,
  reorder: string | RegExp,
) {
  const page = 'goto' in scope ? scope : scope.page()
  // `has` is matched inside each rail, so it is built from the page, not from the scope.
  await scope
    .getByTestId('rail')
    .filter({ has: page.getByRole('button', { name: reorder }) })
    .click({ position: { x: 3, y: 3 } })
}

/** Opens the row of filters under a list's header (the funnel button), if it isn't open already. */
export async function openFilters(page: Page) {
  const funnel = page.getByRole('button', { name: /^Filter/ })
  await expect(funnel).toBeVisible()
  if ((await funnel.getAttribute('aria-expanded')) !== 'true') await funnel.click()
}

/** Shows the read items of a reading list, which the filters fold away by default. */
export async function showReadItems(page: Page) {
  await openFilters(page)
  await page.getByRole('switch', { name: /^Show read items/ }).check()
}
