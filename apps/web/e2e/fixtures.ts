import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { e2eOutbox } from '../playwright.config'
import { expect, test as base, type Browser, type Locator, type Page } from '@playwright/test'
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
 * Goes to a step of the publication or idea you are in, from the side menu (the menu follows you, so "Note" means the
 * notes of whichever you are in).
 */
export async function goTo(page: Page, step: string) {
  const link = page
    .locator('nav[aria-label="Idea"], nav[aria-label="Publication"]')
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

/**
 * Makes an idea in the publication whose page (or a page beneath it) is open, and opens it. Without `notes` it goes
 * the way a person does, through Quick add's New idea tab; with them it asks the API (Quick add takes a name alone).
 */
export async function createIdea(page: Page, name: string, notes?: string) {
  // (Right after creating a publication the address may not have changed yet.)
  await expect(page).toHaveURL(/\/p\/[^/]+/)
  const publicationId = new URL(page.url()).pathname.split('/')[2]
  if (notes === undefined) {
    await page.goto(`/p/${publicationId}`)
    await page.getByRole('tab', { name: 'New idea' }).click()
    await page.getByLabel('Idea name').fill(name)
    await page.getByRole('button', { name: 'Create idea' }).click()
  } else {
    const made = await page.request.post(`/api/publications/${publicationId}/ideas`, {
      data: { name, notes },
    })
    expect(made.ok(), await made.text()).toBe(true)
    await page.goto(`/p/${publicationId}/ideas/${((await made.json()) as { id: string }).id}`)
  }
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
}

/** Back to the publication's own page, where its ideas are listed, from any page beneath it. */
export async function goToIdeas(page: Page) {
  await page.goto(`/p/${new URL(page.url()).pathname.split('/')[2]}`)
  await expect(page.getByRole('region', { name: 'Ideas', exact: true })).toBeVisible()
}

export { expect }

/** From any page of a publication: Scan, then its way to the feeds in the settings. */
export async function openFeeds(page: Page) {
  await goTo(page, 'Scan')
  await page.getByRole('link', { name: /^(Set up feeds →|Manage feeds)$/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Feeds' })).toBeVisible()
}

/** From a page of the publication's settings: back up to the publication's own page. */
export async function leaveSettings(page: Page) {
  await page.getByRole('banner').getByRole('link', { name: /^← / }).click()
}

/** Opens one page of the publication's settings from its menu (the gear has already been pressed). */
export async function openSettingsPage(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Publication settings' })
    .getByRole('link', { name, exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()
}

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

/** Shows the read items of a list of articles, which the filters fold away by default. */
export async function showReadItems(page: Page) {
  await openFilters(page)
  await page.getByRole('switch', { name: /^Show read items/ }).check()
}

/** Adds a tag to a list's tag filter the way a person does: type it, press Return; the box keeps focus. */
export async function addFilterTag(filter: Locator, tag: string) {
  await filter.fill(tag)
  await filter.press('Enter')
  await expect(filter).toBeFocused()
}

// Shared by the account, auth, drafts, reviews and sharing specs.
export const PASSWORD = 'a perfectly good password'

/** Usernames are unique across the whole database, and tests run in parallel. */
export const uniqueUsername = () =>
  `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Fills in the sign-up form (without submitting). Returns the email used. */
export async function fillSignUp(page: Page, name: string, username = uniqueUsername()) {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  return email
}

/** From the landing page, creates a publication named "<name>'s writing" and opens it. */
export async function createFirstPublication(page: Page, name: string) {
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill(`${name}'s writing`)
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
}

/**
 * Each test registers its own user, so tests are independent and can run in parallel. Most tests
 * are about what happens after set-up, so this also creates a first publication, "<name>'s writing".
 */
export async function registerUser(
  page: Page,
  name = 'Ada Lovelace',
  { withPublication = true } = {},
) {
  await page.goto('/register')
  const email = await fillSignUp(page, name)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  if (withPublication) await createFirstPublication(page, name)
  return email
}

/** From the publication list, opens the first publication ("<name>'s writing"). */
export async function openFirstPublication(page: Page) {
  // Scoped to the publications list: Home's Keep writing rows also have "writing" in their link names, once loaded.
  await page
    .getByRole('region', { name: 'Your publications' })
    .getByRole('link', { name: /writing/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
}

/** One of the first publication's settings pages: Sharing, where it is shared, unless another is named. */
export async function openSettings(page: Page, name = 'Sharing') {
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await openFirstPublication(page)
  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await openSettingsPage(page, name)
}

export type Mail = { to: string; subject: string; text: string }

/** Reads the "inbox": waits for an email to `to` with this subject, as the file mailer wrote it. */
export async function waitForEmail(to: string, subject: string): Promise<Mail> {
  let found: Mail | undefined
  await expect
    .poll(
      () => {
        const files = existsSync(e2eOutbox) ? readdirSync(e2eOutbox).sort() : []
        const emails = files.map(
          (f) => JSON.parse(readFileSync(join(e2eOutbox, f), 'utf8')) as Mail,
        )
        found = emails.filter((e) => e.to === to && e.subject === subject).at(-1)
        return found !== undefined
      },
      { message: `an email "${subject}" to ${to}` },
    )
    .toBe(true)
  return found!
}

export const linkIn = (mail: Mail, path: string) =>
  mail.text.match(new RegExp(`https?://\\S+${path}\\?token=[\\w-]+`))?.[0]

/** Follows the confirmation link from the signup email, then returns to the app. */
export async function confirmEmail(page: Page, email: string) {
  const link = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')
  expect(link, 'confirmation link in the email').toBeTruthy()
  await page.goto(link!)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()
  await page.getByRole('link', { name: 'Continue writing' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
}

/** Ada (signed in, confirmed) invites `email` from her account page, and we read the email they get. */
export async function invite(page: Page, email: string, inviter = 'Ada') {
  await openSettings(page)
  await page.getByLabel('Email address').first().fill(email)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible()
  const mail = await waitForEmail(email, `${inviter} invited you to write together`)
  const link = linkIn(mail, '/accept-invite')
  expect(link, 'invitation link in the email').toBeTruthy()
  return link!
}

/** Invites a new person from `page` and has them register and join in their own browser; returns their page. */
export async function joinFrom(
  page: Page,
  browser: Browser,
  name: string,
  email = `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
) {
  const link = await invite(page, email)
  const them = await (await browser.newContext()).newPage()
  await them.goto(link)
  await them.getByRole('link', { name: 'Create an account' }).click()
  await them.getByLabel('What should we call you?').fill(name)
  await them.getByLabel('Username').fill(uniqueUsername())
  await them.getByLabel('Password').fill(PASSWORD)
  await them.getByRole('button', { name: 'Create account' }).click()
  await expect(them.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  return them
}
