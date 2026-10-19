import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, goTo, test, createIdea } from './fixtures'

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

/** Refining (step 03) is a conversation. Visiting the step spends nothing; this begins it, with your AI's questions. */
async function startBrainstorming(page: Page) {
  await goTo(page, 'Refine')
  await page.getByRole('button', { name: 'Refine with your AI' }).click()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

const say = async (page: Page, text: string) => {
  await page.getByLabel('Your message').fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

test('refines an idea: your AI asks, suggests, and nothing changes until accepted', async ({
  page,
}) => {
  await setUp(page)

  // Refining starts only when asked, with your AI's questions.
  await startBrainstorming(page)
  await expect(page.getByText('Refine started by Pru')).toBeVisible()
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
  await goTo(page, 'Notes')
  await expect(
    page.getByRole('banner').getByText('Why rivers meander').filter({ visible: true }).first(),
  ).toBeVisible()

  // Back in the same conversation (it was kept), accepting changes the idea.
  await goTo(page, 'Refine')
  await page.getByRole('button', { name: /^Accept:/ }).click()
  await expect(page.getByText('Accepted by Pru.')).toBeVisible()
  await goTo(page, 'Notes')
  await expect(
    page
      .getByRole('banner')
      .getByText('A sharper title for this idea')
      .filter({ visible: true })
      .first(),
  ).toBeVisible()

  // The conversation survives a reload.
  await goTo(page, 'Refine')
  await page.reload()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()
  await expect(page.getByText('Accepted by Pru.')).toBeVisible()
})

test('the writer can go on to draft whenever they have enough, by the next step', async ({
  page,
}) => {
  await setUp(page)
  await startBrainstorming(page)
  await expect(page.getByLabel('Your message')).toBeEnabled()
  await page.getByRole('link', { name: 'Next: 05 Draft' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Draft' })).toBeVisible()
})

test('the points made in the chat are added to the idea as notes, as they are made', async ({
  page,
}) => {
  await setUp(page)
  await startBrainstorming(page)
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await say(page, 'Please note that oxbow lakes are loops that have been cut off.')
  const recorded = page.getByRole('list', { name: 'Notes recorded in this reply' })
  await expect(recorded).toContainText(
    'Added to your notes: “oxbow lakes are loops that have been cut off.”',
  )
  await noViolations(page, 'brainstorm page with a recorded note')

  // Saying the same thing again doesn't add it twice.
  await say(page, 'Please note that Oxbow lakes are loops that have been cut off')
  await expect(page.getByText('Already in your notes:')).toBeVisible()

  // The notes are on the idea, from brainstorming, and can be deleted like any other.
  await goTo(page, 'Notes')
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByRole('listitem')).toHaveCount(2)
  await expect(notes.getByRole('listitem').nth(1)).toContainText(
    'oxbow lakes are loops that have been cut off.',
  )
  await expect(notes.getByRole('listitem').nth(1)).toContainText('From brainstorming')
  await expect(notes.getByRole('listitem').nth(1).getByText('Pru', { exact: true })).toBeVisible()

  // Hold the Delete button from the keyboard, which works the same way.
  await notes.getByRole('button', { name: /^Delete note “oxbow lakes/ }).focus()
  await page.keyboard.down('Enter')
  await expect(notes.getByText(/oxbow lakes are loops/)).toHaveCount(0, { timeout: 4000 })
  await page.keyboard.up('Enter')
  await goTo(page, 'Refine')
  await expect(page.getByText('Noted, then deleted:')).toBeVisible()
})

test('a spin-off idea can be accepted and opened, and a suggestion can be dismissed', async ({
  page,
}) => {
  await setUp(page)
  await startBrainstorming(page)
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await say(page, 'Please suggest a title')
  await page.getByRole('button', { name: /^Dismiss:/ }).click()
  await expect(page.getByText('Dismissed by Pru.')).toBeVisible()

  await say(page, 'Could you suggest a new idea from that?')
  const card = page.getByRole('region', { name: 'Suggested new idea' })
  await card.getByRole('button', { name: /^Accept:/ }).click()
  await card.getByRole('link', { name: 'Open the new idea' }).click()
  await expect(
    page.getByRole('banner').getByText('A spin-off idea').filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Notes' })).toContainText(
    'Came out of a conversation.',
  )
})

test('your AI passes on an address the writer gave: it is checked, shown beside its real title, and added only when accepted', async ({
  page,
}) => {
  await setUp(page)
  await startBrainstorming(page)
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await say(page, 'Please add https://example.org/river-physics to my reading list')
  const card = page.getByRole('region', { name: /^Suggested reading/ })
  await expect(card).toContainText("The page's own title:")
  await expect(card).toContainText('Fake title for example.org')
  await expect(card).not.toContainText('The page you gave me') // what your AI called it is not shown
  await expect(card.getByText(/Highlighted text is your AI’s reason/)).toBeVisible()
  await noViolations(page, 'brainstorm page with a reading suggestion')

  // Nothing is on the reading list until it is accepted.
  await goTo(page, 'Read')
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toHaveCount(0)

  await goTo(page, 'Refine')
  await page.getByRole('button', { name: /^Accept: / }).click()
  await expect(page.getByText('Added to the reading list by Pru.')).toBeVisible()
  await goTo(page, 'Read')
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('You said it bears on this idea.')).toBeVisible()
})

test('asked to do research, your AI points to the Research tool and suggests nothing', async ({
  page,
}) => {
  await setUp(page)
  await startBrainstorming(page)
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await say(page, 'Can you research this for me?')
  await expect(page.getByText(/The Research tool on the idea page does that/)).toBeVisible()
  await expect(page.getByRole('region', { name: /^Suggested reading/ })).toHaveCount(0)
})

test('deleting the conversation asks first, then offers a fresh start', async ({ page }) => {
  await setUp(page)
  await startBrainstorming(page)
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await page.getByRole('button', { name: 'Delete conversation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete the conversation?' })
  await noViolations(page, 'delete conversation dialog')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  await page.getByRole('button', { name: 'Delete conversation' }).click()
  await dialog.getByRole('button', { name: 'Delete conversation' }).click()
  await expect(page.getByRole('button', { name: 'Refine with your AI' })).toBeVisible()
  await page.getByRole('button', { name: 'Refine with your AI' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()
})

test('keeps several conversations on an idea: start another, page between them, delete one', async ({
  page,
}) => {
  await setUp(page)
  await startBrainstorming(page)
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()
  await say(page, 'First conversation point')
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText(
    'First conversation point',
  )

  // A second one beside it; the AI speaks first and it is the one on screen.
  await page.getByRole('button', { name: 'New conversation' }).click()
  await expect(page.getByText('Conversation 2 of 2').first()).toBeVisible()
  await expect(page.getByRole('log', { name: 'Conversation' })).not.toContainText(
    'First conversation point',
  )
  await noViolations(page, 'refine page with two conversations')

  // Back to the earlier one.
  await page
    .getByRole('navigation', { name: 'Conversations, above the thread' })
    .getByRole('button', { name: 'Earlier conversation' })
    .click()
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText(
    'First conversation point',
  )

  // Deleting it leaves the other one.
  await page.getByRole('button', { name: 'Delete conversation' }).click()
  await page
    .getByRole('dialog', { name: 'Delete the conversation?' })
    .getByRole('button', { name: 'Delete conversation' })
    .click()
  await expect(page.getByRole('log', { name: 'Conversation' })).not.toContainText(
    'First conversation point',
  )
  await expect(page.getByRole('navigation', { name: /^Conversations, / })).toHaveCount(0)
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible()
})

test('without an AI key, says where to add one and keeps the way open to try again', async ({
  page,
}) => {
  await setUp(page, { withKey: false })
  await startBrainstorming(page)
  await expect(page.getByRole('alert')).toContainText('Add your Anthropic API key')
  await expect(page.getByRole('alert').getByRole('link', { name: 'Add your AI key' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refine with your AI' })).toBeVisible()
  await noViolations(page, 'brainstorm page asking for a key')
})

test('the idea’s page starts the conversation, and carries a reply into it', async ({ page }) => {
  await setUp(page)
  await page.getByRole('banner').getByRole('link', { name: 'Why rivers meander' }).click()
  const refine = page.getByRole('region', { name: 'Refine' })
  await expect(refine.getByRole('button', { name: 'Refine with your AI' })).toBeVisible() // nothing started by looking
  await refine.getByRole('button', { name: 'Refine with your AI' }).click()
  await expect(page.getByText(/What is the one claim this piece makes/)).toBeVisible()

  // Back on the idea's page your AI's last message is there, with a box to answer it.
  await page.getByRole('banner').getByRole('link', { name: 'Why rivers meander' }).click()
  await expect(refine.getByText(/What is the one claim this piece makes/)).toBeVisible()
  await noViolations(page, 'idea page with a conversation')
  await refine.getByLabel('Your reply').fill('Rivers are lazy')
  await refine.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Refine' })).toBeVisible()
  // In the thread, sent from there (the live and saved copies can both show for a moment).
  await expect(
    page.getByRole('log', { name: 'Conversation' }).getByText('Rivers are lazy').first(),
  ).toBeVisible()
  await expect(page).not.toHaveURL(/lazy/)
})

test('without an AI key, a reply from the idea’s page lands where the key is asked for', async ({
  page,
}) => {
  await setUp(page, { withKey: false })
  await page.getByRole('banner').getByRole('link', { name: 'Why rivers meander' }).click()
  await page
    .getByRole('region', { name: 'Refine' })
    .getByRole('button', { name: 'Refine with your AI' })
    .click()
  await expect(page.getByRole('alert')).toContainText(/API key/)
  await expect(page.getByRole('alert').getByRole('link', { name: 'Add your AI key' })).toBeVisible()
})
