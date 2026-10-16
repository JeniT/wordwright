import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// The model is chosen from what the provider offers the saved key (#206), so the choice appears only once there is a key.

async function signUp(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Mo')
  await page.getByLabel('Username').fill(`m${id}`)
  await page.getByLabel('Email').fill(`mo-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('offers the provider’s models once a key is saved, and keeps the one chosen', async ({
  page,
}) => {
  await signUp(page)
  await page.goto('/account')
  await expect(page.getByText('Save a key to choose a model.')).toBeVisible()
  await expect(page.getByLabel('Model')).toHaveCount(0)

  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-models-key-1234')
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()

  const model = page.getByLabel('Model')
  await expect(model).toBeVisible()
  await expect(model.getByRole('option')).toHaveCount(3)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await model.selectOption({ label: 'Claude Haiku 5.5' })
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Model')).toHaveValue('claude-haiku-5-5')
})
