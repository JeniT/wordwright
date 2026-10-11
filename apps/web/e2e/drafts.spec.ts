import AxeBuilder from '@axe-core/playwright'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { e2eOutbox } from '../playwright.config'
import { expect, goTo, test, watchForProblems } from './fixtures'

const PASSWORD = 'a perfectly good password'

/** Usernames are unique across the whole database, and tests run in parallel. */
const uniqueUsername = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Fills in the sign-up form (without submitting). Returns the email used. */
async function fillSignUp(page: Page, name: string, username = uniqueUsername()) {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  return email
}

/** From the landing page, creates a profile named "<name>'s writing" and opens it. */
async function createFirstProfile(page: Page, name: string) {
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill(`${name}'s writing`)
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
}

/**
 * Each test registers its own user, so tests are independent and can run in parallel. Most tests
 * are about what happens after set-up, so this also creates a first profile, "<name>'s writing".
 */
async function registerUser(page: Page, name = 'Ada Lovelace', { withProfile = true } = {}) {
  await page.goto('/register')
  const email = await fillSignUp(page, name)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  if (withProfile) await createFirstProfile(page, name)
  return email
}

/** From the profile list, opens the first profile ("<name>'s writing"). */
async function openFirstProfile(page: Page) {
  await page
    .getByRole('main')
    .getByRole('link', { name: /writing/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
}

/** The first profile's settings page, where it is shared. */
async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await openFirstProfile(page)
  await page.getByRole('link', { name: 'Profile settings' }).click()
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

  // Every draft develops an idea, so writing starts from one.
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await page.getByRole('button', { name: 'Save idea' }).click()
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'Add a draft' }).click()
  await expect(page.getByRole('link', { name: '← All drafts' })).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill('Why rivers meander')
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

  await page.getByRole('link', { name: 'Wordwright' }).click()
  await openFirstProfile(page)
  await page.getByRole('link', { name: /Why rivers meander/ }).click()
  await goTo(page, 'Draft')
  await page.getByRole('link', { name: 'Why rivers meander' }).click()
  await page.getByRole('button', { name: 'Critique' }).click()

  // The comments come beside the draft, in the tab that opens for them.
  const side = page.getByRole('complementary')
  await expect(side.getByRole('tab', { name: /^Comments/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(side.getByText('A fake critique: one thing to look at.')).toBeVisible()
  const comment = side.getByRole('button', { name: /Fake critique: the opening could say/ })
  await expect(comment).toContainText('Rivers rarely flow straight.')

  // The point is marked beside the paragraph it is about, and the page is still accessible with the marks in.
  const mark = page.getByRole('button', { name: 'Critique point 1' })
  await expect(mark).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (const tab of ['Notes', 'Reading list', 'Comments']) {
    await side.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations, tab).toEqual([])
  }

  // Pressing the mark opens its comment; pressing a comment shows its paragraph, with no separate button.
  await side.getByRole('tab', { name: 'Notes' }).click()
  await mark.click()
  await expect(side.getByRole('tab', { name: /^Comments/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(comment).toBeFocused()
  await expect(side.getByRole('button', { name: /Show in draft/ })).toHaveCount(0)
  await comment.click()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toBeFocused()

  // It is kept with the draft: after a reload it is still there (under Comments), and nothing was asked again.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Critique point 1' })).toBeVisible()
  await page
    .getByRole('complementary')
    .getByRole('tab', { name: /^Comments/ })
    .click()
  await expect(page.getByText('A fake critique: one thing to look at.')).toBeVisible()

  // Rewriting the paragraph takes the mark away and moves the point to its own list.
  await page.getByRole('textbox', { name: 'Draft body' }).fill('Meanders come from erosion.')
  await expect(page.getByRole('button', { name: 'Critique point 1' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'This passage has changed' })).toBeVisible()

  // The writer can set a point aside, and bring it back.
  await page.getByRole('button', { name: /^Set aside/ }).click()
  await expect(page.getByText('Set aside (1)')).toBeVisible()
  await page.getByText('Set aside (1)').click()
  await page.getByRole('button', { name: /^Bring back/ }).click()
  await expect(page.getByRole('heading', { name: 'This passage has changed' })).toBeVisible()

  // Looks are rationed: one used so far of the three suggested, and the writer can lower the limit.
  await expect(page.getByText('1 of 3 looks used')).toBeVisible()
  await page.goto('/account')
  await page.getByLabel('Critiques each draft gets').selectOption('1')
  await page
    .getByRole('region', { name: 'Critiques of a draft' })
    .getByRole('button', { name: 'Save' })
    .click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await page.goBack()
  await expect(page.getByText(/You have had your 1 look at this draft/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Critique', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'publish it' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  // On a phone nothing spills sideways.
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  // There the comments are in the drawer, and pressing one shows its paragraph and gets the drawer out of the way.
  await page.getByRole('button', { name: 'Notes and comments' }).click()
  const drawer = page.getByRole('complementary')
  await drawer.getByRole('tab', { name: /^Comments/ }).click()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'comments in the drawer').toEqual(
    [],
  )
  await drawer.getByRole('button', { name: /Fake critique: the opening could say/ }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toBeFocused()
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

test('changes the email address once the new one is confirmed', async ({ page }) => {
  const oldEmail = await registerUser(page)
  const newEmail = `changed-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await page.getByLabel('New email address').fill(newEmail)
  await page.getByLabel('Confirm with your password').fill('the wrong password')
  await page.getByRole('button', { name: 'Email me a link to confirm' }).click()
  await expect(page.getByRole('alert')).toContainText('password is incorrect')

  await page.getByLabel('Confirm with your password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Email me a link to confirm' }).click()
  await expect(page.getByRole('status').filter({ hasText: newEmail })).toBeVisible()

  // Nothing has changed until the link is opened.
  await expect(page.getByText(`Ada Lovelace · ${oldEmail}`)).toBeVisible()
  const link = linkIn(
    await waitForEmail(newEmail, 'Confirm your new email address'),
    '/confirm-email-change',
  )
  expect(link, 'confirmation link in the email').toBeTruthy()
  await page.goto(link!)
  await expect(page.getByText('your email address has been changed')).toBeVisible()
  await page.getByRole('link', { name: 'Back to your account' }).click()
  await expect(page.getByText(`Ada Lovelace · ${newEmail}`)).toBeVisible()
  await waitForEmail(oldEmail, 'Your email address was changed')

  // The new address signs in; the old one no longer does.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.goto('/login')
  await page.getByLabel('Email').fill(oldEmail)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Email').fill(newEmail)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
})

test('"this wasn\'t me" puts the old address back and forces a new password', async ({ page }) => {
  const oldEmail = await registerUser(page)
  const newEmail = `intruder-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await page.getByLabel('New email address').fill(newEmail)
  await page.getByLabel('Confirm with your password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Email me a link to confirm' }).click()
  const confirm = linkIn(
    await waitForEmail(newEmail, 'Confirm your new email address'),
    '/confirm-email-change',
  )!
  await page.goto(confirm)
  await expect(page.getByText('your email address has been changed')).toBeVisible()

  // The owner, from the notice at the old address.
  const undo = linkIn(
    await waitForEmail(oldEmail, 'Your email address was changed'),
    '/undo-email-change',
  )!
  await page.goto(undo)
  await page.getByRole('button', { name: "Yes, this wasn't me" }).click()
  await expect(page.getByRole('status')).toContainText('old email address is back')

  const reset = linkIn(await waitForEmail(oldEmail, 'Reset your password'), '/reset-password')!
  await page.goto(reset)
  await page.getByLabel('New password').fill('my brand new password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Your password has been changed')).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Email').fill(oldEmail)
  await page.getByLabel('Password').fill('my brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
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
  await newbie.getByLabel('What should we call you?').fill('Newbie')
  await newbie.getByLabel('Username').fill(uniqueUsername())
  await newbie.getByLabel('Password').fill(PASSWORD)
  await newbie.getByRole('button', { name: 'Create account' }).click()

  // Registering brings them straight back to the invitation, where they choose to join.
  await newbie.getByRole('button', { name: /^Join / }).click()
  await expect(newbie.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  // Accepting proved they own the address, so there is no "please confirm" banner.
  await expect(newbie.getByRole('region', { name: 'Email confirmation' })).toHaveCount(0)
  await expect(newbie.getByText('Shared with 1 person')).toBeVisible()

  // Ada now sees them as a member, and the invitation is no longer pending.
  await page.reload()
  await expect(page.getByText(new RegExp(`${newbieEmail}, editor`))).toBeVisible()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)
  expect(newbieProblems, "Newbie's browser problems").toEqual([])
})

test('declining and blocking an inviter from the email, then lifting the block', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobEmail = `bob-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await invite(page, bobEmail)
  await expect(page.getByText('Waiting for a reply')).toBeVisible()

  // Bob has no account. He declines from the email and stops invitations from Ada.
  const bob = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bob)
  const declineLink = linkIn(
    await waitForEmail(bobEmail, 'Ada invited you to write together'),
    '/decline-invite',
  )!
  expect(declineLink, 'decline link in the email').toBeTruthy()
  await bob.goto(declineLink)
  await expect(bob.getByText("They won't be told that you declined")).toBeVisible()
  expect(
    (await new AxeBuilder({ page: bob }).analyze()).violations,
    'accessibility of decline page',
  ).toEqual([])
  await bob.getByLabel('Also stop invitations from Ada').check()
  await bob.getByRole('button', { name: 'Decline' }).click()
  await expect(bob.getByRole('status')).toContainText('from this person again')

  // Ada isn't told; the invitation just stops waiting, and a second attempt quietly does nothing.
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)
  await page
    .getByLabel(/Invite someone to/)
    .first()
    .fill(bobEmail)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await expect(page.getByText(`emailed an invitation to ${bobEmail}`)).toBeVisible()
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  // Bob signs up later with that address, confirms it, and sees the block on his account page.
  await bob.goto('/register')
  await bob.getByLabel('What should we call you?').fill('Bob')
  await bob.getByLabel('Username').fill(uniqueUsername())
  await bob.getByLabel('Email').fill(bobEmail)
  await bob.getByLabel('Password').fill(PASSWORD)
  await bob.getByRole('button', { name: 'Create account' }).click()
  await expect(bob.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  await bob.goto(
    linkIn(await waitForEmail(bobEmail, 'Confirm your email address'), '/verify-email')!,
  )
  await expect(bob.getByText('your email address is confirmed')).toBeVisible()
  await bob.goto('/account')
  await expect(bob.getByText('Ada', { exact: true })).toBeVisible()
  expect(
    (await new AxeBuilder({ page: bob }).analyze()).violations,
    'accessibility of account page',
  ).toEqual([])
  await bob.getByRole('button', { name: 'Unblock Ada' }).click()
  await expect(bob.getByText("You haven't blocked anyone")).toBeVisible()
  expect(bobProblems).toEqual([])

  // With the block lifted, Ada's invitation goes through again.
  await page
    .getByLabel(/Invite someone to/)
    .first()
    .fill(bobEmail)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toBeVisible()
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
  await expect(bobPage.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
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

test('a new account chooses a username, connects an API key, then creates its first profile', async ({
  page,
  browser,
}) => {
  const taken = uniqueUsername()
  await registerUser(page, 'Grace', { withProfile: false })

  // Sign-up asks what to call them, and checks the username against everyone else's.
  const other = await (await browser.newContext()).newPage()
  await other.goto('/register')
  const name = other.getByLabel('What should we call you?')
  await expect(name).toHaveAttribute('autocomplete', 'given-name')
  await name.fill('Someone')
  await other.getByLabel('Username').fill('Not Valid!')
  await expect(other.getByText('Use only letters and numbers in your username')).toBeVisible()
  await other.getByLabel('Username').fill(taken)
  await expect(other.getByText(`“${taken}” is available`)).toBeVisible()
  await expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([])
  await other.getByLabel('Email').fill(`dup-${Date.now()}@example.com`)
  await other.getByLabel('Password').fill(PASSWORD)
  await other.getByRole('button', { name: 'Create account' }).click()
  await expect(other.getByRole('heading', { name: 'Your profiles' })).toBeVisible()

  const third = await (await browser.newContext()).newPage()
  await third.goto('/register')
  await third.getByLabel('Username').fill(taken)
  await expect(third.getByText('That username is already taken. Try another.')).toBeVisible()
  await expect(third.getByRole('button', { name: 'Create account' })).toBeDisabled()

  // No profile was made for them. The landing page explains how to get a key, with a field for it.
  await expect(page.getByText('Welcome, Grace')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'First, connect your AI assistant' }),
  ).toBeVisible()
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(5)
  await expect(page.getByText('Next, create your first profile')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'landing page').toEqual([])

  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-onboarding-key-4321')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText(/Your Anthropic key is saved/)
  await expect(page.getByLabel('Anthropic API key')).toHaveCount(0)

  // Then they create (and set up) their first profile.
  await page.getByRole('link', { name: 'Create your first profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Grace letters')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(
    page.getByRole('banner').getByText('Grace letters').filter({ visible: true }).first(),
  ).toBeVisible()
})

test('the sign-up form explains a problem the server finds, in words', async ({ page }) => {
  await page.goto('/register')
  await fillSignUp(page, 'Hopper')
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toHaveText('Use at least 10 characters')
  await expect(page.getByText('[object Object]')).toHaveCount(0)
})

test('deletes an account', async ({ page }) => {
  const email = await registerUser(page)
  await page.getByRole('link', { name: 'Ada Lovelace', exact: true }).click()
  await page.getByLabel(/Type your email/).fill(email)
  await page.getByLabel('Password', { exact: true }).and(page.locator('input')).fill(PASSWORD)
  await page.getByRole('button', { name: 'Delete my account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await dialog.getByRole('button', { name: 'Yes, delete my account' }).click()
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
