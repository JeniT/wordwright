import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The help area: open to everyone, linked from the screen that needs it, accessible in both themes and on a phone.

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

async function signUp(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Hana')
  await page.getByLabel('Username').fill(`h${id}`)
  await page.getByLabel('Email').fill(`hana-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('help pages open for someone who is signed out, in light and dark and on a phone', async ({
  page,
}) => {
  await page.goto('/help')
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible()
  await noViolations(page, 'help list')

  await page.getByRole('link', { name: 'How to get an API key' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How to get an API key' })).toBeVisible()
  await expect(page.getByRole('main').locator('ol > li')).toHaveCount(5)
  await noViolations(page, 'key page, light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page, 'key page, dark')

  await page.setViewportSize({ width: 390, height: 800 })
  await noViolations(page, 'key page, phone')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow, 'no sideways scroll at 390px').toBe(false)

  // Back returns to the list; a page that doesn't exist says so.
  await page.getByRole('link', { name: /Back/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible()
  await page.goto('/help/nothing-here')
  await expect(page.getByRole('heading', { level: 1, name: 'No such help page' })).toBeVisible()
  await noViolations(page, 'not found')
})

test('the key screen links to help in a new tab, so a half-typed key is kept', async ({
  page,
  context,
}) => {
  await signUp(page)
  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-help-key-1234')
  const [help] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'How to get an API key (opens in a new tab)' }).click(),
  ])
  await expect(help.getByRole('heading', { level: 1, name: 'How to get an API key' })).toBeVisible()
  await help.close()
  await expect(page.getByLabel('Anthropic API key')).toHaveValue('sk-ant-e2e-help-key-1234')

  // From the list, with the keyboard, to a page and Back to where we were; the other help page is accessible too.
  await page.getByRole('link', { name: 'Help', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('link', { name: 'Privacy and your writing' }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy and your writing' }),
  ).toBeVisible()
  await noViolations(page, 'privacy page, signed in')
  await page.getByRole('link', { name: /Back/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible()
  await page.goto('/')

  // The side menu has Help at every level.
  await page.getByRole('link', { name: 'Help', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible()
  await noViolations(page, 'help list, signed in')
})
