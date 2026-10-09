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
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  return email
}

/** From the profile list, opens the profile every new account starts with. */
async function openFirstProfile(page: Page) {
  await page
    .getByRole('main')
    .getByRole('link', { name: /writing/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Drafts' })).toBeVisible()
}

/** The first profile's settings page, where it is shared. */
async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Long-form Writing Assistant' }).click()
  await openFirstProfile(page)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
}

test('redirects signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('register, write, save and request a critique', async ({ page }) => {
  await registerUser(page)
  await openFirstProfile(page)

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

  await page.getByRole('link', { name: 'Long-form Writing Assistant' }).click()
  await openFirstProfile(page)
  await page.getByRole('link', { name: 'Why rivers meander' }).click()
  await page.getByRole('button', { name: 'Critique' }).click()
  await expect(page.getByRole('heading', { name: 'Critique' })).toBeVisible()
  await expect(page.getByText('Fake response to:')).toBeVisible()
})

test('sign out and back in, and the session survives a reload', async ({ page }) => {
  const email = await registerUser(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('the wrong password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()

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
  await openSettings(page)
  await expect(page.getByText('Confirm your email address to invite people')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)

  const link = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')!
  await page.goto(link)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()
  await expect(banner).toHaveCount(0)

  // Opening the link again (a mail scanner, a double click) is harmless.
  await page.goto(link)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()

  await page.getByRole('link', { name: 'Continue writing' }).click()
  await openSettings(page)
  await expect(page.getByRole('button', { name: 'Send invitation' })).toBeVisible()
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

/** Ada (signed in, confirmed) invites `email` from her account page, and we read the email they get. */
async function invite(page: Page, email: string, inviter = 'Ada') {
  await openSettings(page)
  await page
    .getByLabel(/Invite someone to/)
    .first()
    .fill(email)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await expect(page.getByText(`emailed an invitation to ${email}`)).toBeVisible()
  const mail = await waitForEmail(email, `${inviter} invited you to write together`)
  const link = linkIn(mail, '/accept-invite')
  expect(link, 'invitation link in the email').toBeTruthy()
  return link!
}

test('invites someone who has no account yet: they register from the email and join', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const newbieEmail = `newbie-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const link = await invite(page, newbieEmail)
  await expect(page.getByText('Waiting for a reply')).toBeVisible()
  await expect(page.getByText(newbieEmail).first()).toBeVisible()

  // The invitee has no account and opens the link in their own browser.
  const newbie = await (await browser.newContext()).newPage()
  const newbieProblems = watchForProblems(newbie)
  await newbie.goto(link)
  await expect(newbie.getByText('has invited you to write together')).toBeVisible()
  expect(
    (await new AxeBuilder({ page: newbie }).analyze()).violations,
    'accessibility of invitation page',
  ).toEqual([])
  await newbie.getByRole('link', { name: 'Create an account' }).click()
  await expect(newbie.getByLabel('Email')).toHaveValue(newbieEmail) // prefilled from the invitation
  await newbie.getByLabel('Name').fill('Newbie')
  await newbie.getByLabel('Password').fill(PASSWORD)
  await newbie.getByRole('button', { name: 'Create account' }).click()

  // Registering brings them straight back to the invitation, where they choose to join.
  await newbie.getByRole('button', { name: /^Join / }).click()
  await expect(newbie.getByRole('heading', { name: 'Drafts' })).toBeVisible()
  // Accepting proved they own the address, so there is no "please confirm" banner.
  await expect(newbie.getByRole('region', { name: 'Email confirmation' })).toHaveCount(0)
  await expect(newbie.getByLabel('Profile').locator('option', { hasText: '(shared)' })).toHaveCount(
    1,
  )

  // Ada now sees them as a member, and the invitation is no longer pending.
  await page.reload()
  await expect(page.getByText(new RegExp(`${newbieEmail}, editor`))).toBeVisible()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)
  expect(newbieProblems, "Newbie's browser problems").toEqual([])
})

test('invites someone who already has an account; the link only works for that address', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobPage = await (await browser.newContext()).newPage()
  const malloryPage = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bobPage)
  const bobEmail = await registerUser(bobPage, 'Bob')
  await registerUser(malloryPage, 'Mallory')

  const link = await invite(page, bobEmail)

  // Someone signed in as a different person is told so, and can't join.
  await malloryPage.goto(link)
  await expect(malloryPage.getByRole('alert')).toContainText(`sent to ${bobEmail}`)
  await expect(malloryPage.getByRole('button', { name: /^Join / })).toHaveCount(0)

  await bobPage.goto(link)
  await bobPage.getByRole('button', { name: /^Join / }).click()
  await expect(bobPage.getByRole('heading', { name: 'Drafts' })).toBeVisible()
  await expect(
    bobPage.getByLabel('Profile').locator('option', { hasText: '(shared)' }),
  ).toHaveCount(1)
  await expect(bobPage.getByText('Shared with 1 person')).toBeVisible()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('revoking an invitation stops its link working', async ({ page, browser }) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const email = `revoked-${Date.now()}@example.com`
  const link = await invite(page, email)
  await page.getByRole('button', { name: `Revoke invitation to ${email}` }).click()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  const guest = await (await browser.newContext()).newPage()
  await guest.goto(link)
  await expect(guest.getByRole('alert')).toContainText('invalid or has expired')
})

test('unconfirmed owners are told to confirm before inviting', async ({ page }) => {
  await registerUser(page, 'Ada')
  await openSettings(page)
  await expect(page.getByText('Confirm your email address to invite people')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
})

test('changes the password: other devices are signed out, a notice is emailed', async ({
  page,
  browser,
}) => {
  const email = await registerUser(page)
  const phone = await (await browser.newContext()).newPage()
  const phoneProblems = watchForProblems(phone)
  await phone.goto('/login')
  await phone.getByLabel('Email').fill(email)
  await phone.getByLabel('Password').fill(PASSWORD)
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(phone.getByRole('heading', { name: 'Your profiles' })).toBeVisible()

  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  // A wrong current password is explained and changes nothing.
  await page.getByLabel('Current password').fill('definitely not it')
  await page.getByLabel('New password').fill('my brand new password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert')).toContainText('current password is incorrect')

  await page.getByLabel('Current password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('signed out your other devices')).toBeVisible()
  await waitForEmail(email, 'Your password was changed')

  // The phone's session is gone; this device stays signed in.
  await phone.reload()
  await expect(phone.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()

  // Old password dead, new one works.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Password').fill('my brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  expect(phoneProblems, "The phone's browser problems").toEqual([])
})

test('deletes an account', async ({ page }) => {
  const email = await registerUser(page)
  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await page.getByLabel(/Type your email/).fill(email)
  await page.getByLabel('Password', { exact: true }).and(page.locator('input')).fill(PASSWORD)
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
