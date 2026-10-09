import AxeBuilder from '@axe-core/playwright'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { e2eOutbox } from '../playwright.config'
import { expect, test, watchForProblems } from './fixtures'

const PASSWORD = 'a perfectly good password'

/** Each test registers its own user, so tests are independent and can run in parallel. */
async function registerUser(page: Page, name = 'Ada Lovelace') {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Your drafts' })).toBeVisible()
  return email
}

type Mail = { to: string; subject: string; text: string }

/** Reads the "inbox": waits for an email to `to` with this subject, as the file mailer wrote it. */
async function waitForEmail(to: string, subject: string): Promise<Mail> {
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

const linkIn = (mail: Mail, path: string) =>
  mail.text.match(new RegExp(`https?://\\S+${path}\\?token=[\\w-]+`))?.[0]

/** Follows the confirmation link from the signup email, then returns to the app. */
async function confirmEmail(page: Page, email: string) {
  const link = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')
  expect(link, 'confirmation link in the email').toBeTruthy()
  await page.goto(link!)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()
  await page.getByRole('link', { name: 'Continue writing' }).click()
  await expect(page.getByRole('heading', { name: 'Your drafts' })).toBeVisible()
}

test('redirects signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('register, write, save and request a critique', async ({ page }) => {
  await registerUser(page)

  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title').fill('Why rivers meander')
  await page.getByRole('textbox', { name: 'Draft body' }).fill('Rivers rarely flow straight.')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')

  // No key yet: we're pointed at account settings rather than silently failing.
  await page.getByRole('button', { name: 'Critique' }).click()
  await expect(page.getByRole('alert')).toContainText('Add your Anthropic API key')
  await page.getByRole('link', { name: 'Go to account settings' }).click()

  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-test-key-1234')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Anthropic key saved (…1234)' }),
  ).toBeVisible()
  await expect(page.getByLabel('Anthropic API key')).toHaveCount(0) // field now says "Replace…"

  await page
    .getByRole('link', { name: /Lovelace.s writing/ })
    .first()
    .click()
  await page.getByRole('link', { name: 'Why rivers meander' }).click()
  await page.getByRole('button', { name: 'Critique' }).click()
  await expect(page.getByRole('heading', { name: 'Critique' })).toBeVisible()
  await expect(page.getByText('Fake response to:')).toBeVisible()
})

test('sign out and back in, and the session survives a reload', async ({ page }) => {
  const email = await registerUser(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your drafts' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('the wrong password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your drafts' })).toBeVisible()
})

test('recovers a forgotten password from the emailed link', async ({ page }) => {
  const email = await registerUser(page)
  await page.getByRole('button', { name: 'Sign out' }).click()

  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText("If there's an account")

  const link = linkIn(await waitForEmail(email, 'Reset your password'), '/reset-password')
  expect(link, 'reset link in the email').toBeTruthy()

  await page.goto(link!)
  await page.getByLabel('New password').fill('my brand new password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Your password has been changed')).toBeVisible()

  // The old password is dead; the new one works; the link can't be reused.
  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Password').fill('my brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your drafts' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.goto(link!)
  await page.getByLabel('New password').fill('yet another password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert')).toContainText('invalid or has expired')
})

test('confirms an email address from the signup email', async ({ page }) => {
  const email = await registerUser(page)
  const banner = page.getByRole('region', { name: 'Email confirmation' })
  await expect(banner).toContainText(email)

  // Until they confirm, sharing is explained rather than offered.
  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await expect(page.getByText('Confirm your email address to share this profile')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0)

  const link = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')!
  await page.goto(link)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()
  await expect(banner).toHaveCount(0)

  // Opening the link again (a mail scanner, a double click) is harmless.
  await page.goto(link)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()

  await page.getByRole('link', { name: 'Continue writing' }).click()
  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
})

test('resends the confirmation email, and only the newest link works', async ({ page }) => {
  const email = await registerUser(page)
  const first = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')!
  await page.getByRole('button', { name: 'Resend' }).click()
  await expect(page.getByText('Sent. Check your inbox.')).toBeVisible()

  await expect
    .poll(async () =>
      linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email'),
    )
    .not.toBe(first)
  await page.goto(first)
  await expect(page.getByRole('alert')).toContainText('invalid or has expired')
})

test('shares a profile with another user', async ({ page, browser }) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobPage = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bobPage)
  const bobEmail = await registerUser(bobPage, 'Bob')
  await confirmEmail(bobPage, bobEmail)

  await page.getByRole('link', { name: 'Ada', exact: true }).click()
  await page.getByLabel(/Share/).first().fill(bobEmail)
  await page.getByRole('button', { name: 'Share' }).first().click()
  await expect(page.getByText(new RegExp(`${bobEmail}, editor`))).toBeVisible()

  await bobPage.reload()
  await expect(
    bobPage.getByLabel('Profile').locator('option', { hasText: '(shared)' }),
  ).toHaveCount(1)
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('deletes an account', async ({ page }) => {
  const email = await registerUser(page)
  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await page.getByLabel(/Type your email/).fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
})

test('sign-in and registration pages have no detectable accessibility violations', async ({
  page,
}) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path)
    await expect(page.getByRole('heading').first()).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual([])
  }
})

test('signed-in pages have no detectable accessibility violations', async ({ page }) => {
  await registerUser(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'AI assistant' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
