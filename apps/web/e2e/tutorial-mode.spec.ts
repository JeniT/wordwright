import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Tutorial mode (#198): on for a new account, switchable either way in account settings, and the notice bar above
// the page. No page has tutorial text yet (each page's content crit adds its own), so the offer to turn it off, which
// waits for every such page to be seen, is covered by component tests with a router of its own.

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

async function signUp(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Tess')
  await page.getByLabel('Username').fill(`t${id}`)
  await page.getByLabel('Email').fill(`tess-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('is on for a new account, can be turned off and on again, and survives a reload', async ({
  page,
}) => {
  await signUp(page)
  await page.goto('/account/display')
  const mode = page.getByRole('switch', { name: 'Tutorial mode' })
  await expect(mode).toBeChecked()

  await mode.click()
  await expect(page.getByText('Saved')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Tutorial mode' })).not.toBeChecked()

  await page.getByRole('switch', { name: 'Tutorial mode' }).click()
  await expect(page.getByText('Saved')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Tutorial mode' })).toBeChecked()
})

test('the warn notice, the settings section and the help page are accessible in light, dark and on a phone', async ({
  page,
}) => {
  await signUp(page)
  await page.goto('/account/display')
  await expect(page.getByRole('region', { name: 'Email confirmation' })).toBeVisible()
  await noViolations(page, 'account, light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page, 'account, dark')

  await page.setViewportSize({ width: 390, height: 800 })
  await noViolations(page, 'account, phone')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow, 'no sideways scroll at 390px').toBe(false)

  await page.getByRole('link', { name: 'About tutorial mode' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'About tutorial mode' })).toBeVisible()
  await noViolations(page, 'help page, phone, dark')
})
