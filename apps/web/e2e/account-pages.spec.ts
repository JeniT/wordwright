import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Account settings are six short pages with their own level in the side menu (#210).

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

async function signUp(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Una')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`una-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
}

const PAGES = [
  ['Your details', '/account/details'],
  ['Your AI', '/account/ai'],
  ['Display', '/account/display'],
  ['Sign-in and security', '/account/security'],
  ['Download your writing', '/account/download'],
  ['Delete account', '/account/delete'],
] as const

test('the gear opens the account level, the menu moves between its pages, and /account redirects', async ({
  page,
}) => {
  await signUp(page)
  const gear = page.getByRole('banner').getByRole('link', { name: 'Account settings' })
  await gear.click()
  await expect(page).toHaveURL(/\/account\/details$/)
  await expect(gear).toHaveAttribute('aria-current', 'page')

  const menu = page.getByRole('navigation', { name: 'Account settings' })
  for (const [label, path] of PAGES) {
    await menu.getByRole('link', { name: label }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
    await expect(menu.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    await expect(gear).toHaveAttribute('aria-current', 'page') // current across the group
  }

  // The delete page's way to the download page.
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Download your writing', exact: true })
    .click()
  await expect(page).toHaveURL(/\/account\/download$/)

  await page.goto('/account')
  await expect(page).toHaveURL(/\/account\/details$/)

  await page.getByRole('banner').getByRole('link', { name: '← All publications' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('each page is accessible in light, in dark and on a phone, with no sideways scroll', async ({
  page,
}) => {
  test.slow() // about 25s on its own, so a busy machine passes the 30s default
  await signUp(page)
  for (const [label, path] of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
    await noViolations(page, `${label}, light`)
  }
  // Reduced motion ends the colour transitions at once; axe measuring contrast halfway through one is a flake.
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  for (const [label, path] of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
    // The dev server adds each stylesheet as its script runs; on a busy machine axe could measure the page
    // with some of them missing (dark background, black links). Idle network means they have all arrived.
    await page.waitForLoadState('networkidle')
    await noViolations(page, `${label}, dark`)
  }
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/account/details')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Display' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Display' })).toBeVisible()
  for (const [label, path] of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await noViolations(page, `${label}, phone`)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, `${label}: no sideways scroll at 390px`).toBe(false)
  }
})

test('Your AI leads with the key, keeps the long advice on help pages, and links to them', async ({
  page,
}) => {
  await signUp(page)
  await page.goto('/account/ai')
  const key = page.getByRole('heading', { level: 2, name: 'Your AI key' })
  const limit = page.getByRole('heading', { level: 2, name: 'Critique limit' })
  await expect(key).toBeVisible()
  expect((await key.boundingBox())!.y, 'the key comes first').toBeLessThan(
    (await limit.boundingBox())!.y,
  )
  await expect(page.getByPlaceholder('sk-ant-...')).toBeVisible()
  await expect(page.getByText('Protect what you write')).toHaveCount(0)
  await expect(page.getByText('turns into a spinner')).toHaveCount(0)

  // The info icon beside the heading holds the way to the help page.
  await page.getByRole('button', { name: 'About your AI key' }).hover()
  await page.getByRole('link', { name: 'Your AI settings' }).click()
  await expect(page).toHaveURL(/\/help\/ai-settings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Your AI settings' })).toBeVisible()
  await noViolations(page, 'Your AI settings help page')
  await page.getByRole('link', { name: 'Critique limit' }).click()
  await expect(page).toHaveURL(/\/account\/ai$/)

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/help/ai-settings')
  await noViolations(page, 'Your AI settings help page, dark')
  await page.setViewportSize({ width: 390, height: 800 })
  await noViolations(page, 'Your AI settings help page, phone')
})

test('"Saved" shows only while the form matches what was saved', async ({ page }) => {
  await signUp(page)
  await page.goto('/account/details')
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  const save = page.getByRole('button', { name: 'Save name' })
  const saved = page.getByText('Saved', { exact: true })
  await expect(save).toBeDisabled() // nothing to save yet
  await name.fill('Una Second')
  await save.click()
  await expect(saved).toBeVisible()
  await name.fill('Una Third')
  await expect(saved).toBeHidden() // edited and not saved
  await expect(save).toBeEnabled()
  await name.fill('Una Second')
  await expect(saved).toBeVisible() // back to what was saved
  await name.fill('Una Third')
  await save.click()
  await expect(saved).toBeVisible()
  await noViolations(page, 'details after saving')
})
