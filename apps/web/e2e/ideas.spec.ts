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

  // Related work. Text that isn't a web address is refused, in red under the field, and kept for fixing.
  const address = page.getByLabel('Web address', { exact: true })
  const add = page.getByRole('button', { name: 'Add link' })
  for (const bad of ['rubbish', 'not a web address']) {
    await address.fill(bad)
    await add.click()
    await expect(page.getByText('Enter a web address, like https://example.com')).toBeVisible()
    await expect(address).toHaveValue(bad)
  }
  await address.fill('https://nonexistent.example.org/')
  await add.click()
  await expect(page.getByText(/couldn't find a website at that address/)).toBeVisible()

  // A good one is tidied up and shown by the title found at that address.
  await address.fill('example.org/meanders')
  await add.click()
  const paper = page.getByRole('link', { name: /Fake title for example\.org/ })
  await expect(paper).toHaveAttribute('href', 'https://example.org/meanders')
  await expect(address).toHaveValue('')

  // The same page twice is refused, however it is written, and what was typed stays put.
  await address.fill('http://www.example.org/meanders/')
  await add.click()
  await expect(page.getByText('That link is already in this idea.')).toBeVisible()
  await expect(address).toHaveValue('http://www.example.org/meanders/')
  await noViolations(page, 'idea page with an error showing')

  // A page with no title is listed by its address.
  await address.fill('https://example.com/untitled')
  await add.click()
  await expect(page.getByRole('link', { name: /^https:\/\/example\.com\/untitled/ })).toBeVisible()

  // Links can be edited: a better title, then a different address, with the same checks as adding.
  await page.getByRole('button', { name: /Edit link to https:\/\/example\.com\/untitled/ }).click()
  await page.getByLabel('Title of this link (optional)').fill('The untitled one')
  await noViolations(page, 'editing a link')
  await page.getByRole('button', { name: 'Save link' }).click()
  await expect(page.getByRole('link', { name: /The untitled one/ })).toBeVisible()

  await page.getByRole('button', { name: 'Edit link to The untitled one' }).click()
  const editAddress = page.getByLabel('Web address of this link')
  await editAddress.fill('example.org/meanders') // already in the list
  await page.getByRole('button', { name: 'Save link' }).click()
  await expect(page.getByText('That link is already in this idea.')).toBeVisible()
  await editAddress.fill('https://example.net/other')
  await page.getByLabel('Title of this link (optional)').fill('')
  await page.getByRole('button', { name: 'Save link' }).click()
  // A cleared title is looked up again, for the new address.
  await expect(page.getByRole('link', { name: /Fake title for example\.net/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save link' })).toHaveCount(0)

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
  await page.getByRole('button', { name: 'Remove link to Fake title for example.org' }).click()
  await page.getByRole('button', { name: 'Remove link to Fake title for example.net' }).click()
  await expect(page.getByText('No links yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete idea' }).click()
  await noViolations(page, 'delete dialog')
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByText('No ideas yet')).toBeVisible()
})
