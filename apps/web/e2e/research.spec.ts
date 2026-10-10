import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** Signs up, optionally connects an AI key (any key works with the fake AI), and creates an idea to talk about. */
async function setUp(page: Page, { withKey = true } = {}) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Pru')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`pru-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  if (withKey) {
    await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-brainstorm-key-1234')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText(/Your Anthropic key is saved/)
  }
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Weekly letters')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await page.getByLabel('Expand on your idea here').fill('Erosion loops.\nSecond line.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

test('researches areas, reviews what was found, and adds the ticked pages to the reading list', async ({
  page,
}) => {
  await setUp(page)
  await page.getByRole('link', { name: 'Research', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Research' })).toBeVisible()
  await expect(page.getByText(/Nothing yet/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeDisabled()
  await noViolations(page, 'empty research page')

  await page.getByLabel('What areas do you want to research?').fill('How fast river bends migrate')
  await page.getByRole('button', { name: 'Research', exact: true }).click()
  const run = page.getByRole('article', { name: 'How fast river bends migrate' })
  await expect(run).toBeVisible()
  await expect(page.getByLabel('What areas do you want to research?')).toHaveValue('')

  // A page that checked out, one with no readable title (allowed, with a warning), one that does not exist.
  await expect(run).toContainText('Fake title for research.example.org')
  await expect(run).toContainText('Why the AI suggests it (unchecked):')
  await expect(run).toContainText("couldn't read a title from this page")
  await expect(run).toContainText("Problem: we couldn't find a website at this address")
  await expect(run.getByLabel('A report that has moved')).toBeDisabled()
  await noViolations(page, 'research page with a run to review')

  // Nothing is on the reading list until pages are ticked and added.
  await page.getByRole('link', { name: '← Back to the idea' }).click()
  await expect(
    page.getByRole('link', { name: /Fake title for research\.example\.org/ }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Research', exact: true }).click()

  await run.getByLabel('Fake title for research.example.org').check()
  await run.getByLabel('Notes on channel migration').check()
  await run.getByRole('button', { name: 'Add ticked to the reading list (2)' }).click()
  await expect(run.getByText('Added to the reading list.')).toHaveCount(2)

  // The reading list has them, marked, with the AI's reason kept.
  await page.getByRole('link', { name: '← Back to the idea' }).click()
  await expect(
    page.getByRole('link', { name: /Fake title for research\.example\.org/ }),
  ).toBeVisible()
  await expect(page.getByText('Found by research')).toHaveCount(2)
  await expect(page.getByText('Why the AI suggested it (unchecked):').first()).toBeVisible()
  await noViolations(page, 'idea page with researched items')
})

test('several areas can be researched around one idea, and the research is kept', async ({
  page,
}) => {
  await setUp(page)
  await page.getByRole('link', { name: 'Research', exact: true }).click()
  for (const areas of ['First area', 'Second area']) {
    await page.getByLabel('What areas do you want to research?').fill(areas)
    await page.getByRole('button', { name: 'Research', exact: true }).click()
    await expect(page.getByRole('article', { name: areas })).toBeVisible()
  }
  await page.reload()
  await expect(page.getByRole('article', { name: 'First area' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Second area' })).toBeVisible()

  // Set a page aside, then delete a run after being asked.
  const first = page.getByRole('article', { name: 'First area' })
  await first.getByLabel('Fake title for research.example.org').check()
  await first.getByRole('button', { name: 'Set ticked aside' }).click()
  await expect(first.getByText('Set aside.')).toBeVisible()
  await first.getByRole('button', { name: /^Delete this research/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this research?' })
  await noViolations(page, 'delete research dialog')
  await dialog.getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByRole('article', { name: 'First area' })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Second area' })).toBeVisible()
})

test('without an AI key, says where to add one', async ({ page }) => {
  await setUp(page, { withKey: false })
  await page.getByRole('link', { name: 'Research', exact: true }).click()
  await page.getByLabel('What areas do you want to research?').fill('Anything')
  await page.getByRole('button', { name: 'Research', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('API key')
  await expect(page.getByRole('link', { name: 'Go to account settings' })).toBeVisible()
})
