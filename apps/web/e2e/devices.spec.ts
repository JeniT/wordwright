import AxeBuilder from '@axe-core/playwright'
import { expect, test, watchForProblems } from './fixtures'

const PASSWORD = 'a perfectly good password'
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'

test('sees where they are signed in, ends the other device, and is asked before ending the rest', async ({
  page,
  browser,
}) => {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const email = `pru-${id}@example.com`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Pru')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Sign-in and security' })
    .click()

  const section = page.getByRole('region', { name: "Where you're signed in" })
  await expect(section.getByText('Only this device is signed in')).toBeVisible()
  await expect(section.getByText('This device', { exact: true })).toBeVisible()

  // Two more places: a phone-width Firefox on Linux, and a browser that says nothing useful.
  const signIn = async (userAgent?: string) => {
    const context = await browser.newContext({ userAgent })
    const other = await context.newPage()
    const problems = watchForProblems(other)
    await other.goto('/login')
    await other.getByLabel('Email').fill(email)
    await other.getByLabel('Password').fill(PASSWORD)
    await other.getByRole('button', { name: 'Sign in' }).click()
    await expect(
      other.getByRole('banner').getByRole('link', { name: 'Account settings' }),
    ).toBeVisible()
    return { other, problems }
  }
  const second = await signIn(FIREFOX)
  const third = await signIn('curl/8.4.0')

  await page.reload()
  await expect(section.getByRole('listitem')).toHaveCount(3)
  await expect(section.getByText('Firefox on Linux')).toBeVisible()
  await expect(section.getByText('Unknown device')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'account page').toEqual([])

  // Ending one device is at once; that device is signed out the next time it asks.
  await section.getByRole('button', { name: /^Sign out Firefox on Linux/ }).click()
  await expect(section.getByRole('status')).toHaveText('Signed out of Firefox on Linux')
  await expect(section.getByRole('listitem')).toHaveCount(2)
  await second.other.reload()
  await expect(second.other.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  // ...while the other one is still signed in.
  await third.other.reload()
  await expect(
    third.other.getByRole('banner').getByRole('link', { name: 'Account settings' }),
  ).toBeVisible()

  // Everything else asks first, and can be cancelled.
  await section.getByRole('button', { name: 'Sign out everywhere else' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign out everywhere else?' })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(section.getByRole('listitem')).toHaveCount(2)
  await section.getByRole('button', { name: 'Sign out everywhere else' }).click()
  await dialog.getByRole('button', { name: 'Sign out everywhere else' }).click()
  await expect(section.getByRole('status')).toHaveText('Signed out of 1 other device')
  await expect(section.getByText('Only this device is signed in')).toBeVisible()
  await third.other.reload()
  await expect(third.other.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  // This device never signed itself out, and the section fits a phone.
  await page.setViewportSize({ width: 390, height: 800 })
  await expect(section.getByText('This device', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect((await new AxeBuilder({ page }).analyze()).violations, 'account page, phone').toEqual([])
  await page.emulateMedia({ colorScheme: 'dark' })
  expect((await new AxeBuilder({ page }).analyze()).violations, 'account page, dark').toEqual([])

  expect(second.problems.filter((p) => !p.includes('401'))).toEqual([])
  expect(third.problems.filter((p) => !p.includes('401'))).toEqual([])
})
