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

  // The reading list. Text that isn't a web address is refused, in red under the field, and kept for fixing.
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

  // Items are ticked off as they are read (perhaps elsewhere), and that is remembered.
  const readBox = page.getByRole('checkbox', { name: /^Read: Fake title for example\.org/ })
  await expect(readBox).not.toBeChecked()
  await readBox.check()
  await expect(readBox).toBeChecked()
  await page.reload()
  await expect(readBox).toBeChecked()

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

  // Brainstorming has its own page (see brainstorm.spec.ts); from here it is a link.
  await expect(page.getByRole('link', { name: 'Brainstorm' })).toBeVisible()

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

  // The drafts can be put in a different order, from the keyboard or by dragging, and it stays.
  const draftTitles = async () =>
    (await drafts.getByRole('listitem').allInnerTexts()).map((t) => t.match(/Part \d/)![0])
  const moveUp = drafts.getByRole('button', { name: 'Move Part 2: the oxbow up' })
  await moveUp.focus()
  await page.keyboard.press('Enter')
  await expect.poll(draftTitles).toEqual(['Part 2', 'Part 1'])
  await expect(drafts.getByRole('button', { name: 'Move Part 2: the oxbow down' })).toBeFocused()
  await drafts
    .getByRole('listitem')
    .first()
    .getByTestId('grip')
    .dragTo(drafts.getByRole('listitem').nth(1), { targetPosition: { x: 40, y: 40 } })
  await expect.poll(draftTitles).toEqual(['Part 1', 'Part 2'])
  await page.getByRole('button', { name: 'Move Part 2: the oxbow up' }).click()
  await expect.poll(draftTitles).toEqual(['Part 2', 'Part 1'])
  await page.reload()
  await expect.poll(draftTitles).toEqual(['Part 2', 'Part 1'])

  // Notes: the one typed when the idea was created is a card; more can be added, edited, ordered and removed.
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByRole('listitem')).toHaveCount(1)
  await expect(notes.getByRole('listitem').first()).toContainText('Added by Ida')
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByLabel('Add a note').fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  await expect(notes.getByLabel('Add a note')).toHaveValue('')
  await noViolations(page, 'idea page with notes')

  await notes.getByRole('button', { name: /^Move note “Oxbow lakes.*up/ }).click()
  await expect(notes.getByRole('listitem').nth(1)).toContainText('Oxbow lakes')
  await notes.getByRole('button', { name: /^Edit note “Erosion on the outside/ }).click()
  await notes
    .getByLabel(/^Text of note/)
    .fill('Erosion on the outside of each bend, deposition inside.')
  await notes.getByRole('button', { name: 'Save note' }).click()
  await expect(
    notes.getByText('Erosion on the outside of each bend, deposition inside.'),
  ).toBeVisible()
  // Deleting takes a deliberate hold: a click or a short press does nothing; holding for a second does it.
  const remove = notes.getByRole('button', { name: /^Delete note “Deposition on the inside/ })
  await remove.hover()
  await page.mouse.down()
  await expect(page.getByTestId('hold-ring')).toBeVisible()
  await page.waitForTimeout(300)
  await page.mouse.up()
  await expect(page.getByTestId('hold-ring')).toHaveCount(0)
  await expect(notes.getByText('Deposition on the inside.')).toBeVisible()
  await remove.hover()
  await page.mouse.down()
  await expect(notes.getByText('Deposition on the inside.')).toHaveCount(0, { timeout: 4000 })
  await page.mouse.up()

  // The list layout is a choice that sticks; the order and edits are saved.
  await notes.getByRole('button', { name: 'List' }).click()
  await noViolations(page, 'idea page with notes as a list')
  await page.reload()
  await expect(notes.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
  await expect(notes.getByRole('listitem')).toHaveText([
    /Erosion on the outside of each bend, deposition inside\./,
    /Oxbow lakes form when a loop is cut off\./,
  ])

  // The profile lists it.
  await page.getByRole('link', { name: '← Back to the profile' }).click()
  await expect(page.getByRole('link', { name: /Why rivers meander/ })).toContainText('2 drafts')

  // Removing a link and deleting the idea both work, and deleting asks first.
  await page.getByRole('link', { name: /Why rivers meander/ }).click()
  await page.getByRole('button', { name: 'Remove link to Fake title for example.org' }).click()
  await page.getByRole('button', { name: 'Remove link to Fake title for example.net' }).click()
  await expect(page.getByText('Nothing on the reading list yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete idea' }).click()
  await noViolations(page, 'delete dialog')
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByText('No ideas yet')).toBeVisible()
})

test('pulls notes into a draft from the side, keeping where the words came from', async ({
  page,
}) => {
  await signUpWithProfile(page)
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await page.getByLabel('Expand on your idea here').fill('Erosion on the outside of each bend.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  const notes = page.getByRole('region', { name: 'Notes' })
  await notes.getByLabel('Add a note').fill('Deposition on the inside.')
  await notes.getByRole('button', { name: 'Add note' }).click()
  await expect(notes.getByRole('listitem')).toHaveCount(2)

  await page.getByRole('button', { name: 'Add a draft' }).click()
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('My opening paragraph.')

  // On a wide screen the notes sit beside the draft.
  const side = page.getByRole('complementary')
  await expect(side.getByText('Erosion on the outside of each bend.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Notes', exact: true })).toBeHidden()
  await noViolations(page, 'drafting page with notes beside it')

  // Adding a note puts its words after the paragraph you are in, saves the draft, and sets the note aside.
  await side.getByRole('button', { name: /^Add note “Erosion on the outside/ }).click()
  await expect(body).toContainText('Erosion on the outside of each bend.')
  await expect(side.getByText('Erosion on the outside of each bend.')).toHaveCount(0)
  await expect(body.locator('p').first()).toHaveText('My opening paragraph.')

  // Where the words came from is recorded, and says whether they are still as they were put in.
  const provenance = page.getByText(/Where some of the words came from \(1\)/)
  await provenance.click()
  await expect(page.getByText('Added by Ida ·')).toBeVisible()
  await expect(page.getByText('Still as inserted')).toBeVisible()
  await noViolations(page, 'drafting page with the record of where words came from')

  await body.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Rewritten entirely.')
  await expect(page.getByText('Edited or removed since')).toBeVisible()

  // Added notes stay hidden unless asked for, and can be put back.
  await side.getByLabel('Show notes already added (1)').check()
  await side.getByRole('button', { name: /^Put note “Erosion on the outside/ }).click()
  await expect(
    side.getByRole('button', { name: /^Add note “Erosion on the outside/ }),
  ).toBeVisible()

  // The record survives a reload.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByText(/Where some of the words came from \(1\)/)).toBeVisible()
})

test('on a phone the notes slide in over the draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithProfile(page)
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('Tides')
  await page.getByLabel('Expand on your idea here').fill('The moon pulls the sea.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  await page.getByRole('button', { name: 'Add a draft' }).click()

  const open = page.getByRole('button', { name: 'Notes', exact: true })
  await expect(page.getByRole('complementary')).toBeHidden()
  await open.click()
  const side = page.getByRole('complementary')
  await expect(side.getByText('The moon pulls the sea.')).toBeVisible()
  await noViolations(page, 'notes drawer open on a phone')
  await side.getByRole('button', { name: /^Add note “The moon/ }).click()
  await page.getByRole('button', { name: 'Close notes' }).click()
  await expect(page.getByRole('complementary')).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toContainText(
    'The moon pulls the sea.',
  )
})
