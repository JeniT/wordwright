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

test('reads a reading-list item and takes notes from it, on a phone too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithProfile(page)
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await page.getByLabel('Expand on your idea here').fill('Erosion on the outside of each bend.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByRole('link', { name: /Fake title for example\.org/ })).toBeVisible()

  await page.getByRole('link', { name: 'Take notes' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: /Fake title for example\.org/ }),
  ).toBeVisible()
  await expect(page.getByText(/No notes from this page yet/)).toBeVisible()
  // The page itself opens in its own tab: most sites refuse to be shown inside another page.
  await expect(page.getByRole('link', { name: /Open the page/ })).toHaveAttribute(
    'href',
    'https://example.org/meanders',
  )
  await noViolations(page, 'reading page, no notes yet')

  // A quote, then the writer's own words: both are kept against the page and say where they came from.
  const box = page.getByLabel('Add a note from this page')
  await box.fill('“Meanders grow because the outside of a bend erodes faster.”')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(box).toHaveValue('')
  await box.fill('So the bend moves downstream.')
  await page.getByRole('button', { name: 'Add note' }).click()
  const list = page.getByRole('list')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list).toContainText('From reading “Fake title for example.org')
  await page.getByRole('checkbox', { name: 'I have read this' }).check()
  await noViolations(page, 'reading page with notes')

  // They are remembered, and they join the idea's other notes, still naming the page they came from.
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'I have read this' })).toBeChecked()
  await expect(page.getByText('So the bend moves downstream.')).toBeVisible()
  await page.getByRole('link', { name: /^← Back to “Why rivers meander”/ }).click()
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByText('So the bend moves downstream.')).toBeVisible()
  await expect(
    notes.getByText(/From reading “Fake title for example\.org.*”, by Ida/).first(),
  ).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /^Read: Fake title/ })).toBeChecked()
})

test('tags group notes by draft or section, and filter them on the idea page and beside the draft', async ({
  page,
}) => {
  await signUpWithProfile(page)
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await page.getByLabel('Expand on your idea here').fill('Erosion on the outside of each bend.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  const notes = page.getByRole('region', { name: 'Notes' })
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByLabel('Add a note').fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  // No filter until something is tagged.
  await expect(notes.getByRole('group', { name: 'Show notes with a tag' })).toHaveCount(0)

  const tag = async (noteStart: RegExp, tags: string) => {
    await notes.getByRole('button', { name: noteStart }).click()
    await notes.getByLabel(/^Tags for note/).fill(tags)
    await notes.getByRole('button', { name: 'Save note' }).click()
    await expect(notes.getByRole('button', { name: 'Save note' })).toHaveCount(0)
  }
  await tag(/^Edit note “Erosion/, 'intro, part 1')
  await tag(/^Edit note “Deposition/, 'part 1')
  await tag(/^Edit note “Oxbow/, 'Part 2')
  await noViolations(page, 'idea page with tagged notes')

  // Show only one tag's notes; they can still be put in order, and "All" brings the rest back.
  const filter = notes.getByRole('group', { name: 'Show notes with a tag' })
  await filter.getByRole('button', { name: 'part 1' }).click()
  await expect(notes.getByText('Oxbow lakes form')).toHaveCount(0)
  await notes.getByRole('button', { name: /^Move note “Deposition.*up/ }).click()
  await filter.getByRole('button', { name: 'All' }).click()
  await expect(notes.getByRole('listitem').filter({ hasText: 'Deposition' }).first()).toBeVisible()
  await page.reload()
  const after = page.getByRole('region', { name: 'Notes' })
  await expect(after.getByRole('list', { name: 'Tags' }).first()).toBeVisible()

  // Beside the draft, the same tags narrow the list to what belongs in this part.
  await page.getByRole('button', { name: 'Add a draft' }).click()
  const side = page.getByRole('complementary')
  await side
    .getByRole('group', { name: 'Show notes with a tag' })
    .getByRole('button', { name: 'Part 2' })
    .click()
  await expect(side.getByText('Oxbow lakes form')).toBeVisible()
  await expect(side.getByText('Deposition on the inside.')).toHaveCount(0)
  await noViolations(page, 'drafting page filtered by a tag')
})

test('a direct quote cannot be edited, and goes into a draft as a blockquote with its source', async ({
  page,
}) => {
  await signUpWithProfile(page)
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await page.getByLabel('Expand on your idea here').fill('Erosion on the outside of each bend.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add link' }).click()
  await page.getByRole('link', { name: 'Take notes' }).click()

  await page.getByLabel('Add a note from this page').fill('Meanders grow because banks erode.')
  await page.getByRole('checkbox', { name: /This is a direct quote/ }).check()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByRole('list').locator('blockquote')).toContainText('Meanders grow')
  await noViolations(page, 'reading page with a quotation')

  // On the idea's notes the quotation can be tagged or deleted, but not edited.
  await page.getByRole('link', { name: /^← Back to “Why rivers meander”/ }).click()
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByText(/^Quoted while reading/)).toBeVisible()
  await expect(notes.getByRole('button', { name: /^Edit note “Meanders/ })).toHaveCount(0)
  await expect(notes.getByRole('button', { name: /^Edit note “Erosion/ })).toBeVisible()
  await noViolations(page, 'notes with a quotation')

  // In the draft it is a blockquote that names its source, and the record says where it came from.
  await page.getByRole('button', { name: 'Add a draft' }).click()
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('My opening paragraph.')
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /^Add note “Meanders grow/ })
    .click()
  const quoted = body.locator('blockquote')
  await expect(quoted).toContainText('Meanders grow because banks erode.')
  await expect(quoted.getByRole('link')).toHaveAttribute('href', 'https://example.org/meanders')
  await expect(body.locator('p').first()).toHaveText('My opening paragraph.')
  await page.getByText(/Where some of the words came from \(1\)/).click()
  await expect(page.getByText('Still as inserted')).toBeVisible()
})
