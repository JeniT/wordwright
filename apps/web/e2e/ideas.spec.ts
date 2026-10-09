import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function signUpWithProfile(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Ida')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`ida-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Weekly letters')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
}

/** Adds a draft from the idea page and waits for the editor, so we don't type into the old page. */
async function startDraft(page: Page) {
  await page.getByRole('button', { name: 'Add a draft' }).click()
  await expect(page.getByRole('link', { name: /Back to “/ })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

test('captures an idea, adds related work, and develops it into a linked set of drafts', async ({
  page,
}) => {
  await signUpWithProfile(page)
  await expect(page.getByText('No ideas yet')).toBeVisible()
  await noViolations(page, 'profile page')

  await page.getByRole('link', { name: 'New idea' }).click()
  await noViolations(page, 'new idea page')
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await page.getByLabel('Expand on your idea here').fill('Erosion on the outside of each bend.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()

  // Related work: the address is tidied up, and bad ones are explained.
  await page.getByLabel('Web address').fill('not a web address')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a web address')
  await page.getByLabel('Web address').fill('example.org/meanders')
  await page.getByLabel('Title (optional)').fill('A paper on meanders')
  await page.getByRole('button', { name: 'Add link' }).click()
  const paper = page.getByRole('link', { name: /A paper on meanders/ })
  await expect(paper).toHaveAttribute('href', 'https://example.org/meanders')

  // Brainstorming isn't built yet, and says so rather than failing silently.
  await expect(page.getByRole('button', { name: 'Brainstorm' })).toBeDisabled()

  // Two drafts make a linked set; each opens in the editor and links back.
  await startDraft(page)
  await page.getByLabel('Title', { exact: true }).fill('Part 1: the bend')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.getByRole('link', { name: /Back to “Why rivers meander”/ }).click()
  await startDraft(page)
  await page.getByLabel('Title', { exact: true }).fill('Part 2: the oxbow')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.getByRole('link', { name: /Back to “Why rivers meander”/ }).click()

  const drafts = page.getByRole('list').filter({ hasText: 'Part 1: the bend' })
  await expect(drafts.getByRole('listitem')).toHaveText([/Part 1: the bend/, /Part 2: the oxbow/])
  await noViolations(page, 'idea page')

  // Edits to the notes persist.
  await page.getByLabel('Expand on your idea here').fill('Now with oxbow lakes.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByLabel('Expand on your idea here')).toHaveValue('Now with oxbow lakes.')

  // The profile lists it.
  await page.getByRole('link', { name: '← Back to the profile' }).click()
  await expect(page.getByRole('link', { name: /Why rivers meander/ })).toContainText('2 drafts')

  // Removing a link and deleting the idea both work, and deleting asks first.
  await page.getByRole('link', { name: /Why rivers meander/ }).click()
  await page.getByRole('button', { name: 'Remove link to A paper on meanders' }).click()
  await expect(page.getByText('No links yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete idea' }).click()
  await noViolations(page, 'delete dialog')
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByText('No ideas yet')).toBeVisible()
})
