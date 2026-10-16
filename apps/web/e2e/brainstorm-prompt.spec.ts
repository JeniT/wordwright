import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

test('edits, saves and resets the brainstorming prompt on the account page', async ({ page }) => {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Pru')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`pru-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()

  const section = page.getByRole('region', { name: 'Brainstorming prompt' })
  const prompt = section.getByLabel('Prompt')
  const save = section.getByRole('button', { name: 'Save' })

  // Everyone starts on the default, which is a writing coach.
  await expect(section.getByText('You are using the default prompt.')).toBeVisible()
  await expect(prompt).toHaveValue(/writing coach/)
  await expect(save).toBeDisabled()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'account page').toEqual([])

  // Changing it makes it theirs, and it is still theirs after a reload.
  await prompt.fill('You are a gentle writing coach. Ask me one question at a time.')
  await expect(section.getByText(/\d+ of 8,000 characters/)).toBeVisible()
  await save.click()
  await expect(section.getByText('You are using your own version of the prompt.')).toBeVisible()
  await expect(section.getByRole('status')).toHaveText('Saved.')
  await page.reload()
  await expect(prompt).toHaveValue('You are a gentle writing coach. Ask me one question at a time.')

  // An empty prompt is refused, and what they typed stays.
  await prompt.fill('   ')
  await save.click()
  await expect(section.getByRole('alert')).toHaveText('Write a prompt, or reset to the default one')
  await expect(prompt).toHaveValue('   ')

  // Resetting asks first, then brings the default back.
  await prompt.fill('Another idea')
  await section.getByRole('button', { name: 'Reset to default' }).click()
  const dialog = page.getByRole('dialog', { name: 'Go back to the default prompt?' })
  expect((await new AxeBuilder({ page }).analyze()).violations, 'reset dialog').toEqual([])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(prompt).toHaveValue('Another idea')
  await section.getByRole('button', { name: 'Reset to default' }).click()
  await dialog.getByRole('button', { name: 'Yes, reset it' }).click()
  await expect(section.getByText('You are using the default prompt.')).toBeVisible()
  await expect(prompt).toHaveValue(/writing coach/)
})
