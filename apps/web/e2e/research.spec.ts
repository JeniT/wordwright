import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, goTo, holdToConfirm, test, createIdea } from './fixtures'

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
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Weekly letters')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await createIdea(page, 'Why rivers meander', 'Erosion loops.\nSecond line.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Notes')
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
}

/** From wherever you are in the idea: Research (step 01), then into the tool that searches the web. */
async function openResearchTool(page: Page) {
  await goTo(page, 'Research')
  await page.getByRole('link', { name: 'Start research' }).click()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

test('researches areas, reviews what was found, and adds pages to the reading list', async ({
  page,
}) => {
  await setUp(page)
  await openResearchTool(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Research' })).toBeVisible()
  await expect(page.getByText(/Nothing yet/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeDisabled()
  // The button says it spends the writer's own key, and it is the only kind of button that does.
  await expect(
    page.getByRole('button', { name: 'Research', exact: true }),
  ).toHaveAccessibleDescription('Uses your Anthropic key, so it costs tokens')
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
  await expect(
    run.getByRole('button', { name: 'Add to reading list: A report that has moved' }),
  ).toBeDisabled()
  await noViolations(page, 'research page with a run to review')

  // Nothing is on the reading list until pages are added.
  await page.getByRole('link', { name: '← Back to the reading list' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for research.example.org', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Start research' }).click()

  // One click each: added pages collapse to a green tick, ignored ones to a red cross.
  await run
    .getByRole('button', { name: 'Add to reading list: Fake title for research.example.org' })
    .click()
  await expect(run.getByRole('img', { name: 'Added to the reading list' })).toHaveCount(1)
  await run.getByRole('button', { name: 'Add to reading list: Notes on channel migration' }).click()
  await expect(run.getByRole('img', { name: 'Added to the reading list' })).toHaveCount(2)
  await run.getByRole('button', { name: 'Ignore: A report that has moved' }).click()
  await expect(run.getByRole('img', { name: 'Ignored' })).toHaveCount(1)
  await expect(run.getByText('Why the AI suggests it (unchecked):')).toHaveCount(0) // all collapsed
  await noViolations(page, 'research page with decided pages')

  // The reading list has them, marked, with the AI's reason kept.
  await page.getByRole('link', { name: '← Back to the reading list' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for research.example.org', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Found by research')).toHaveCount(2)
  await expect(page.getByText('Why the AI suggested it (unchecked):').first()).toBeVisible()
  await noViolations(page, 'reading list with researched items')
})

test('several areas can be researched around one idea, and the research is kept', async ({
  page,
}) => {
  await setUp(page)
  await openResearchTool(page)
  for (const areas of ['First area', 'Second area']) {
    await page.getByLabel('What areas do you want to research?').fill(areas)
    await page.getByRole('button', { name: 'Research', exact: true }).click()
    await expect(page.getByRole('article', { name: areas })).toBeVisible()
  }
  await page.reload()
  await expect(page.getByRole('article', { name: 'First area' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Second area' })).toBeVisible()

  // Ignore one page and add another with their own buttons; reconsidering the addition takes it off the list.
  const first = page.getByRole('article', { name: 'First area' })
  await first.getByRole('button', { name: 'Ignore: Fake title for research.example.org' }).click()
  await expect(first.getByRole('img', { name: 'Ignored' })).toBeVisible()
  await first
    .getByRole('button', { name: 'Add to reading list: Notes on channel migration' })
    .click()
  await expect(first.getByRole('img', { name: 'Added to the reading list' })).toBeVisible()
  await page.getByRole('link', { name: '← Back to the reading list' }).click()
  await expect(page.getByRole('link', { name: /Notes on channel migration/ })).toBeVisible()
  await page.getByRole('link', { name: 'Start research' }).click()
  await first.getByRole('button', { name: 'Reconsider: Notes on channel migration' }).click()
  await expect(
    first.getByRole('button', { name: 'Add to reading list: Notes on channel migration' }),
  ).toBeVisible() // expanded again
  await page.getByRole('link', { name: '← Back to the reading list' }).click()
  await expect(page.getByRole('link', { name: /Notes on channel migration/ })).toHaveCount(0)
  await page.getByRole('link', { name: 'Start research' }).click()

  await holdToConfirm(page, first.getByRole('button', { name: /^Delete this research/ }))
  await expect(page.getByRole('article', { name: 'First area' })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Second area' })).toBeVisible()
})

test('without an AI key, says where to add one', async ({ page }) => {
  await setUp(page, { withKey: false })
  await openResearchTool(page)
  await page.getByLabel('What areas do you want to research?').fill('Anything')
  await page.getByRole('button', { name: 'Research', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('API key')
  await expect(page.getByRole('link', { name: 'Go to account settings' })).toBeVisible()
})
