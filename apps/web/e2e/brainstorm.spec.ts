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

const say = async (page: Page, text: string) => {
  await page.getByLabel('Your message').fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

test('brainstorms an idea: the editor asks, suggests, and nothing changes until accepted', async ({
  page,
}) => {
  await setUp(page)

  // Brainstorm from the idea page starts at once, with the editor's questions.
  await page.getByRole('link', { name: 'Brainstorm' }).click()
  await expect(page.getByText('Brainstorm started by Pru')).toBeVisible()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()
  await expect(page.getByLabel('Your message')).toBeEnabled()
  await noViolations(page, 'brainstorm page')

  // A suggestion arrives as a card; the idea itself is untouched until it is accepted.
  await say(page, 'Please suggest a title')
  const card = page.getByRole('region', { name: 'Suggested change to this idea' })
  await expect(card).toBeVisible()
  await expect(card.getByText('A sharper title for this idea')).toBeVisible()
  await expect(card.getByText('Why rivers meander')).toBeVisible() // what it would replace
  await noViolations(page, 'brainstorm page with a suggestion')
  await page.getByRole('link', { name: '← Back to the idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()

  // Back in the same conversation (it was kept), accepting changes the idea.
  await page.getByRole('link', { name: 'Continue brainstorming' }).click()
  await page.getByRole('button', { name: /^Accept:/ }).click()
  await expect(page.getByText('Accepted by Pru.')).toBeVisible()
  await page.getByRole('link', { name: '← Back to the idea' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'A sharper title for this idea' }),
  ).toBeVisible()

  // The conversation survives a reload.
  await page.getByRole('link', { name: 'Continue brainstorming' }).click()
  await page.reload()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()
  await expect(page.getByText('Accepted by Pru.')).toBeVisible()
})

test('a suggestion made against older notes says so, and can still be applied', async ({
  page,
}) => {
  await setUp(page)
  await page.getByRole('link', { name: 'Brainstorm' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()
  await say(page, 'Please suggest notes')
  const card = page.getByRole('region', { name: 'Suggested change to this idea' })
  // The notes are shown as a difference: what goes and what comes, in words as well as colour.
  await expect(card.getByText('Removed:').first()).toBeVisible()
  await expect(card.getByText('Added:').first()).toBeVisible()

  // Meanwhile the person edits the notes themselves.
  await page.getByRole('link', { name: '← Back to the idea' }).click()
  await page.getByLabel('Expand on your idea here').fill('My own rewrite of the notes.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')

  await page.getByRole('link', { name: 'Continue brainstorming' }).click()
  await expect(page.getByText(/The idea has changed since this was suggested/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Accept:/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^Apply anyway:/ }).click()
  await expect(page.getByText('Accepted by Pru.')).toBeVisible()
  await page.getByRole('link', { name: '← Back to the idea' }).click()
  await expect(page.getByLabel('Expand on your idea here')).toHaveValue(
    /Claim: rivers meander because of erosion/,
  )
})

test('a spin-off idea can be accepted and opened, and a suggestion can be dismissed', async ({
  page,
}) => {
  await setUp(page)
  await page.getByRole('link', { name: 'Brainstorm' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await say(page, 'Please suggest a title')
  await page.getByRole('button', { name: /^Dismiss:/ }).click()
  await expect(page.getByText('Dismissed by Pru.')).toBeVisible()

  await say(page, 'Could you suggest a new idea from that?')
  const card = page.getByRole('region', { name: 'Suggested new idea' })
  await card.getByRole('button', { name: /^Accept:/ }).click()
  await card.getByRole('link', { name: 'Open the new idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'A spin-off idea' })).toBeVisible()
  await expect(page.getByLabel('Expand on your idea here')).toHaveValue(
    'Came out of a conversation.',
  )
})

test('start again clears the conversation, after asking', async ({ page }) => {
  await setUp(page)
  await page.getByRole('link', { name: 'Brainstorm' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await page.getByRole('button', { name: 'Start again' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start the conversation again?' })
  await noViolations(page, 'start again dialog')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await page.getByRole('button', { name: 'Start again' }).click()
  await dialog.getByRole('button', { name: 'Yes, start again' }).click()
  await expect(page.getByRole('button', { name: 'Start brainstorming' })).toBeVisible()
  await page.getByRole('button', { name: 'Start brainstorming' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()
})

test('without an AI key, says where to add one and keeps the way open to try again', async ({
  page,
}) => {
  await setUp(page, { withKey: false })
  await page.getByRole('link', { name: 'Brainstorm' }).click()
  await expect(page.getByRole('alert')).toContainText('Add your Anthropic API key')
  await expect(page.getByRole('link', { name: 'Go to account settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start brainstorming' })).toBeVisible()
  await noViolations(page, 'brainstorm page asking for a key')
})
