import AxeBuilder from '@axe-core/playwright'
import {
  PASSWORD,
  expect,
  fillSignUp,
  linkIn,
  openSettings,
  registerUser,
  test,
  uniqueUsername,
  waitForEmail,
  watchForProblems,
} from './fixtures'

test('redirects signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('sign out and back in, and the session survives a reload', async ({ page }) => {
  const email = await registerUser(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('the wrong password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.goto(link!)
  await page.getByLabel('New password').fill('yet another password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert')).toContainText('invalid or has expired')
})

test('changes the email address once the new one is confirmed', async ({ page }) => {
  const oldEmail = await registerUser(page)
  const newEmail = `changed-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your details' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
  await page.getByLabel('New email address').fill(newEmail)
  await page.getByLabel('Password', { exact: true }).fill('the wrong password')
  await page.getByRole('button', { name: 'Send confirmation link' }).click()
  await expect(page.getByRole('alert')).toContainText('password is incorrect')

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Send confirmation link' }).click()
  await expect(page.getByRole('status').filter({ hasText: newEmail })).toBeVisible()

  // Nothing has changed until the link is opened.
  await expect(page.getByLabel('New email address')).toHaveAttribute('placeholder', oldEmail)
  const link = linkIn(
    await waitForEmail(newEmail, 'Confirm your new email address'),
    '/confirm-email-change',
  )
  expect(link, 'confirmation link in the email').toBeTruthy()
  await page.goto(link!)
  await expect(page.getByText('your email address has been changed')).toBeVisible()
  await page.getByRole('link', { name: 'Back to your account' }).click()
  await expect(page.getByLabel('New email address')).toHaveAttribute('placeholder', newEmail)
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
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
})

test('"this wasn\'t me" puts the old address back and forces a new password', async ({ page }) => {
  const oldEmail = await registerUser(page)
  const newEmail = `intruder-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your details' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
  await page.getByLabel('New email address').fill(newEmail)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Send confirmation link' }).click()
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
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
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
  await expect(phone.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Sign-in and security' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign-in and security' })).toBeVisible()
  // A wrong current password is explained and changes nothing.
  await page.getByLabel('Current password').fill('definitely not it')
  await page.getByLabel('New password').fill('my brand new password')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('alert')).toContainText('current password is incorrect')

  await page.getByLabel('Current password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('signed out your other devices')).toBeVisible()
  await waitForEmail(email, 'Your password was changed')

  // The phone's session is gone; this device stays signed in.
  await phone.reload()
  await expect(phone.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign-in and security' })).toBeVisible()

  // Old password dead, new one works.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Password').fill('my brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  expect(phoneProblems, "The phone's browser problems").toEqual([])
})

test('a new account chooses a username, connects an API key, then creates its first publication', async ({
  page,
  browser,
}) => {
  const taken = uniqueUsername()
  await registerUser(page, 'Grace', { withPublication: false })

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
  await expect(other.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  const third = await (await browser.newContext()).newPage()
  await third.goto('/register')
  await third.getByLabel('Username').fill(taken)
  await expect(third.getByText('That username is already taken. Try another.')).toBeVisible()
  await expect(third.getByRole('button', { name: 'Create account' })).toBeDisabled()

  // No publication was made for them. The landing page explains how to get a key, with a field for it.
  await expect(page.getByRole('heading', { name: 'Connect your AI key (Anthropic)' })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'How to get an API key (opens in a new tab)' }),
  ).toHaveAttribute('href', '/help/api-key')
  await expect(page.getByRole('link', { name: /privacy advice/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Create your first publication' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '01' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '02' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'landing page').toEqual([])

  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-onboarding-key-4321')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText(/Your Anthropic key is saved/)
  await expect(page.getByLabel('Anthropic API key')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'New publication' })).toBeVisible()

  // Then they create (and set up) their first publication; the checklist is gone when they come back.
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Grace letters')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(
    page.getByRole('banner').getByText('Grace letters').filter({ visible: true }).first(),
  ).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Get started/ })).toHaveCount(0)
})

test('first-run steps can be done in the other order', async ({ page }) => {
  await registerUser(page, 'Katherine', { withPublication: false })
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Orbits')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await page.goto('/')
  await expect(page.getByText('Create your first publication · done')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'half-done').toEqual([])
  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-order-key-4321')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText(/Your Anthropic key is saved/)
  await expect(page.getByRole('link', { name: /Orbits/ })).toBeVisible()
})

test('the sign-up form explains a problem the server finds, in words', async ({ page }) => {
  await page.goto('/register')
  await fillSignUp(page, 'Hopper')
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toHaveText('Use at least 8 characters')
  await expect(page.getByText('[object Object]')).toHaveCount(0)
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
  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your AI' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your AI' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your AI key' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
