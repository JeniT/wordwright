import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Tutorial mode (#198, #314): on for a new account, and switched either way from the menu, which is always in view.

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

test('is on for a new account, can be turned off and on again from the menu, and survives a reload', async ({
  page,
}) => {
  await signUp(page)
  const mode = () => page.getByRole('switch', { name: 'Tutorial' })
  await expect(mode()).toBeChecked()
  await page.goto('/')
  await mode().click()
  await expect(mode()).not.toBeChecked()
  await page.reload()
  await expect(mode()).not.toBeChecked()

  await mode().click()
  await expect(mode()).toBeChecked()
  await page.reload()
  await expect(mode()).toBeChecked()
})

test('the menu row and the help page are accessible in light, dark and on a phone', async ({
  page,
}) => {
  await signUp(page)
  await page.goto('/account/display')
  await expect(page.getByRole('region', { name: 'Email confirmation' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Tutorial' })).toBeVisible()
  await noViolations(page, 'account, light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page, 'account, dark')

  await page.setViewportSize({ width: 390, height: 800 })
  await noViolations(page, 'account, phone')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Tutorial' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await noViolations(page, 'menu with the Tutorial switch, phone, dark')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow, 'no sideways scroll at 390px').toBe(false)
  await page.keyboard.press('Escape')

  await page.goto('/help/tutorial-mode')
  await expect(page.getByRole('heading', { level: 1, name: 'About tutorial mode' })).toBeVisible()
  await noViolations(page, 'help page, phone, dark')
})
