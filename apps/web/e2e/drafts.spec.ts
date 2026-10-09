import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('create a draft, write, save and request a critique', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your drafts' })).toBeVisible()

  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title').fill('Why rivers meander')
  await page.getByRole('textbox', { name: 'Draft body' }).fill('Rivers rarely flow straight.')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')

  await page.getByRole('button', { name: 'Critique' }).click()
  await expect(page.getByRole('heading', { name: 'Critique' })).toBeVisible()
  await expect(page.getByText('Fake response to:')).toBeVisible()

  await page.getByRole('link', { name: 'Long-form Writing Assistant' }).click()
  await expect(page.getByRole('link', { name: /Why rivers meander/ })).toBeVisible()
})

test('home page has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your drafts' })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
