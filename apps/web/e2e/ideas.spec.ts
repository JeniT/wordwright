import type { Page } from '@playwright/test'
import {
  expect,
  addFilterTag,
  goTo,
  openFilters,
  holdToConfirm,
  showArrowsFor,
  test,
  createIdea,
  noViolations,
  signUpWithPublication,
  startDraft,
  startIdea,
} from './fixtures'

test('captures an idea, and its first note is kept as a note', async ({ page }) => {
  await signUpWithPublication(page)
  await expect(page.getByText('No ideas yet')).toBeVisible()
  await noViolations(page, 'publication page')

  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')

  // Brainstorming has its own step, Refine (see brainstorm.spec.ts).
  await expect(
    page.getByRole('navigation', { name: 'Idea' }).getByRole('link', { name: 'Refine' }),
  ).toBeVisible()

  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  // The one typed when the idea was created is a card.
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByRole('listitem')).toHaveCount(1)
  await expect(notes.getByRole('listitem').first()).toContainText('Added')
  await expect(notes.getByRole('listitem').first().getByText('Ida', { exact: true })).toBeVisible()
})

test('develops an idea into a linked set of drafts, in an order that can be changed', async ({
  page,
}) => {
  await startIdea(page)

  // Two drafts make a linked set; each opens in the editor and links back.
  await startDraft(page)
  await page.getByLabel('Title', { exact: true }).fill('Part 1: the bend')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await page.getByRole('link', { name: '← All drafts' }).click()
  await startDraft(page)
  await page.getByLabel('Title', { exact: true }).fill('Part 2: the oxbow')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await page.getByRole('link', { name: '← All drafts' }).click()

  const drafts = page.getByRole('main').getByRole('list').filter({ hasText: 'Part 1: the bend' })
  await expect(drafts.getByRole('listitem')).toHaveText([/Part 1: the bend/, /Part 2: the oxbow/])
  await noViolations(page, 'idea page')

  // The drafts can be put in a different order, from the keyboard or by dragging, and it stays.
  const draftTitles = async () =>
    (await drafts.getByRole('listitem').allInnerTexts()).map((t) => t.match(/Part \d/)![0])
  const moveUp = drafts.getByRole('button', { name: 'Move Part 2: the oxbow up' })
  // The arrows appear when a row's grip is pressed.
  await expect(moveUp).toHaveCount(0)
  await showArrowsFor(drafts, 'Reorder Part 2: the oxbow')
  await moveUp.focus()
  await page.keyboard.press('Enter')
  await expect.poll(draftTitles).toEqual(['Part 2', 'Part 1'])
  await expect(drafts.getByRole('button', { name: 'Move Part 2: the oxbow down' })).toBeFocused()
  await drafts
    .getByRole('listitem')
    .first()
    .getByTestId('rail')
    .dragTo(drafts.getByRole('listitem').nth(1), {
      sourcePosition: { x: 3, y: 3 },
      targetPosition: { x: 40, y: 80 },
    })
  await expect.poll(draftTitles).toEqual(['Part 1', 'Part 2'])
  // Dragging puts the grips back; a click on a rail asks for the arrows again.
  await showArrowsFor(drafts, /^Reorder Part 1/)
  await page.getByRole('button', { name: 'Move Part 2: the oxbow up' }).click()
  await expect.poll(draftTitles).toEqual(['Part 2', 'Part 1'])
  await page.reload()
  await expect.poll(draftTitles).toEqual(['Part 2', 'Part 1'])

  // The publication lists the idea with its drafts.
  await page.getByRole('link', { name: '← Weekly letters' }).click()
  await expect(
    page.getByRole('main').getByRole('link', { name: /Why rivers meander.*drafts/ }),
  ).toContainText('2 drafts')
})

test('notes on an idea can be added, ordered, edited and deleted, and it is all saved', async ({
  page,
}) => {
  await startIdea(page)
  await goTo(page, 'Note')
  // Notes: the one typed when the idea was created is a card; more can be added, edited, ordered and removed.
  const notes = page.getByRole('region', { name: 'Notes' })
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByRole('textbox', { name: 'Note', exact: true }).fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  await expect(notes.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('')
  await noViolations(page, 'idea page with notes')

  // A note added in the form goes to the top, so the last one added is first.
  await expect(notes.getByRole('listitem').first()).toContainText('Oxbow lakes')
  await showArrowsFor(notes, /^Reorder note “Oxbow lakes/)
  await notes.getByRole('button', { name: /^Move note “Oxbow lakes.*down/ }).click()
  await notes.getByRole('button', { name: /^Move note “Oxbow lakes.*down/ }).click()
  await expect(notes.getByRole('listitem').nth(2)).toContainText('Oxbow lakes')
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

  // The order and edits are saved.
  await noViolations(page, 'idea page with notes')
  await page.reload()
  await expect(notes.getByRole('listitem')).toHaveText([
    /Erosion on the outside of each bend, deposition inside\./,
    /Oxbow lakes form when a loop is cut off\./,
  ])
})

test('removes links and deletes an idea, which asks first', async ({ page }) => {
  await startIdea(page)
  await goTo(page, 'Read')
  const address = page.getByLabel('Web address', { exact: true })
  for (const link of ['example.org/meanders', 'example.net/other']) {
    await address.fill(link)
    await page.getByRole('button', { name: 'Add article' }).click()
    await expect(
      page.getByRole('link', {
        name: new RegExp(`^Fake title for ${link.split('/')[0]!.replace('.', '\\.')}`),
      }),
    ).toBeVisible()
  }
  await holdToConfirm(page, page.getByRole('button', { name: 'Remove Fake title for example.org' }))
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toHaveCount(0)
  await holdToConfirm(page, page.getByRole('button', { name: 'Remove Fake title for example.net' }))
  await expect(page.getByText(/Nothing to read yet/)).toBeVisible()
  await page.getByRole('banner').getByRole('link', { name: 'Idea settings' }).click()
  await page.getByRole('button', { name: 'Delete idea' }).click()
  await noViolations(page, 'delete dialog')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete idea' }).click()
  await expect(page.getByText('No ideas yet')).toBeVisible()
})

async function turnTutorialModeOff(page: Page) {
  const res = await page.request.put('/api/account/tutorial', { data: { on: false } })
  expect(res.ok()).toBe(true)
  await page.reload()
}

test('with tutorial mode on, a tip is written out on the page instead of behind an icon', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/)
  await goTo(page, 'Note')
  const notes = page.getByRole('region', { name: 'Notes' })
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByRole('textbox', { name: 'Note', exact: true }).fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  await notes.getByRole('checkbox', { name: /^Select note “Erosion/ }).check()
  await notes.getByRole('checkbox', { name: /^Select note “Deposition/ }).check()
  await notes.getByRole('button', { name: 'Tag…' }).click()
  await expect(notes.getByText(/up to 10 each/)).toBeVisible()
  await expect(notes.getByRole('button', { name: 'About tagging several at once' })).toHaveCount(0)
  await noViolations(page, 'a tip written out')
  await page.setViewportSize({ width: 390, height: 800 })
  await noViolations(page, 'a tip written out, phone')
})

test('tags several notes at once, then takes a tag off them all again', async ({ page }) => {
  await signUpWithPublication(page)
  await turnTutorialModeOff(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByRole('textbox', { name: 'Note', exact: true }).fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }

  // The bulk actions appear once something is selected.
  await expect(notes.getByRole('button', { name: 'Tag…' })).toHaveCount(0)
  await notes.getByRole('checkbox', { name: /^Select note “Erosion/ }).check()
  await notes.getByRole('checkbox', { name: /^Select note “Deposition/ }).check()
  await notes.getByRole('button', { name: 'Tag…' }).click()
  // The form takes over the header: the other actions are gone, a tick and a cross end it, and the explanation
  // sits behind an info icon.
  for (const name of ['Merge', 'Move to…', 'Delete 2'])
    await expect(notes.getByRole('button', { name, exact: true })).toHaveCount(0)
  const aboutTags = notes.getByRole('button', { name: 'About tagging several at once' })
  await aboutTags.hover()
  await expect(notes.getByRole('tooltip')).toContainText('up to 10 each')
  await noViolations(page, 'an info tip showing')
  // The pointer can travel onto the tip without it closing; Escape hides it, and focus stays where it was.
  await notes.getByRole('tooltip').hover()
  await expect(notes.getByRole('tooltip')).toBeVisible()
  await aboutTags.focus()
  await page.keyboard.press('Escape')
  await expect(notes.getByRole('tooltip')).toBeHidden()
  await expect(aboutTags).toBeFocused()
  await page.mouse.move(0, 0)
  await aboutTags.hover()
  await expect(notes.getByRole('tooltip')).toBeVisible()
  await notes.getByRole('button', { name: 'Cancel' }).click()
  await expect(notes.getByRole('button', { name: 'Merge', exact: true })).toBeVisible()
  await notes.getByRole('button', { name: 'Tag…' }).click()
  for (const tag of ['section one', 'intro']) {
    await notes.getByLabel('Add a tag', { exact: true }).fill(tag)
    await notes.getByLabel('Add a tag', { exact: true }).press('Enter')
  }
  await noViolations(page, 'notes with the tag panel open')
  await notes.getByRole('button', { name: 'Tag 2 notes' }).click()
  await expect(notes.getByLabel('Add a tag', { exact: true })).toHaveCount(0)

  // Both notes carry the tags, the third does not, and the tag now filters.
  await openFilters(page)
  const filter = notes.getByRole('combobox', { name: 'Filter by tag' })
  await addFilterTag(filter, 'section one')
  await expect(notes.getByText('Oxbow lakes form')).toHaveCount(0)
  await expect(notes.getByText('Deposition on the inside.')).toBeVisible()
  await notes.getByRole('button', { name: 'Stop filtering by section one' }).click()

  // The tag can be taken off both in one go (a new filter clears the selection, so choose them again).
  await notes.getByRole('checkbox', { name: /^Select note “Erosion/ }).check()
  await notes.getByRole('checkbox', { name: /^Select note “Deposition/ }).check()
  await notes.getByRole('button', { name: 'Tag…' }).click()
  await notes.getByRole('button', { name: 'Remove “intro”' }).click()
  await notes.getByRole('button', { name: 'Tag 2 notes' }).click()
  await filter.fill('intro')
  await expect(notes.getByRole('option')).toHaveCount(0) // nothing carries it now
  await filter.fill('section')
  await expect(notes.getByRole('option', { name: 'section one' })).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Filter/ })).toBeVisible() // the funnel, folded
})

test('tags group notes by draft or section, and filter them on the idea page and beside the draft', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByRole('textbox', { name: 'Note', exact: true }).fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  // No filter until something is tagged.
  await expect(notes.getByRole('combobox', { name: 'Filter by tag' })).toHaveCount(0)

  // One at a time under each note: type a tag, Enter, the next, then the tick.
  const tag = async (noteStart: string, tags: string[]) => {
    await notes.getByRole('button', { name: new RegExp(`^Add tags to note “${noteStart}`) }).click()
    const field = notes.getByLabel(new RegExp(`^Add a tag to note “${noteStart}`))
    for (const t of tags) {
      await field.fill(t)
      await field.press('Enter')
      await expect(
        notes.getByRole('list', { name: 'Tags' }).getByText(t, { exact: true }).first(),
      ).toBeVisible()
    }
    await notes
      .getByRole('button', { name: new RegExp(`^Done tagging note “${noteStart}`) })
      .click()
    await expect(field).toHaveCount(0)
  }
  await tag('Erosion', ['intro', 'part 1'])
  await tag('Deposition', ['part 1'])
  await tag('Oxbow', ['Part 2'])
  await noViolations(page, 'idea page with tagged notes')

  // Show only one tag's notes; they can still be put in order, and "All" brings the rest back.
  await openFilters(page)
  const filter = notes.getByRole('combobox', { name: 'Filter by tag' })
  await addFilterTag(filter, 'part 1')
  await expect(notes.getByText('Oxbow lakes form')).toHaveCount(0)
  await showArrowsFor(notes, /^Reorder note “Erosion/)
  await notes.getByRole('button', { name: /^Move note “Erosion.*up/ }).click()
  await notes.getByRole('button', { name: 'Stop filtering by part 1' }).click()
  await expect(notes.getByRole('listitem').filter({ hasText: 'Deposition' }).first()).toBeVisible()
  await page.reload()
  const after = page.getByRole('region', { name: 'Notes' })
  await expect(after.getByRole('list', { name: 'Tags' }).first()).toBeVisible()

  // Beside the draft, the same tags narrow the list to what belongs in this part.
  await startDraft(page)
  const side = page.getByRole('complementary')
  await addFilterTag(side.getByRole('combobox', { name: 'Filter by tag' }), 'Part 2')
  await expect(side.getByText('Oxbow lakes form')).toBeVisible()
  await expect(side.getByText('Deposition on the inside.')).toHaveCount(0)
  await noViolations(page, 'drafting page filtered by a tag')
})

test('notes can be merged into one, and one note cut in two', async ({ page }) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByRole('textbox', { name: 'Note', exact: true }).fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  const cards = notes.getByRole('listitem')
  await expect(cards).toHaveCount(3)

  // The newest note is first. Merge: tick two, press Merge; they become one, at the first one's place, as paragraphs.
  await notes.getByRole('checkbox', { name: /^Select note “Erosion/ }).check()
  await notes.getByRole('checkbox', { name: /^Select note “Oxbow/ }).check()
  await noViolations(page, 'notes with two chosen to merge')
  await notes.getByRole('button', { name: 'Merge', exact: true }).click()
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Oxbow lakes form when a loop is cut off.')
  await expect(cards.first()).toContainText('Erosion on the outside of each bend.')
  await expect(cards.nth(1)).toContainText('Deposition on the inside.')

  // Split: put the cursor between the two paragraphs, and the note becomes two again.
  await notes.getByRole('button', { name: /^Edit note “Oxbow/ }).click()
  const box = notes.getByLabel(/^Text of note “Oxbow/)
  await box.fill('Oxbow lakes form when a loop is cut off. Erosion on the outside of each bend.')
  await box.evaluate((el: HTMLTextAreaElement) => {
    const at = el.value.indexOf(' Erosion')
    el.focus()
    el.setSelectionRange(at, at)
  })
  await notes.getByRole('button', { name: /^Split note “Oxbow.*at the cursor/ }).click()
  await expect(cards).toHaveCount(3)
  await expect(cards.first()).toContainText('Oxbow lakes form when a loop is cut off.')
  await expect(cards.first()).not.toContainText('Erosion')
  await expect(cards.nth(1)).toContainText('Erosion on the outside of each bend.')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Notes' }).getByRole('listitem')).toHaveCount(3)
})

test('moves an idea with its draft to another publication, and opens it there', async ({
  page,
}) => {
  await startIdea(page)
  await startDraft(page)
  const idOf = () => new URL(page.url()).pathname.split('/')[2]!
  const first = idOf()

  // Someone with one publication is not offered a move.
  await page.goto(`/p/${first}/ideas`)
  await expect(page.getByRole('button', { name: 'Move Why rivers meander' })).toHaveCount(0)

  // A second publication to move to.
  await page.goto('/')
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Elsewhere')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  const second = idOf()

  await page.goto(`/p/${first}/ideas`)
  await page.getByRole('button', { name: 'Move Why rivers meander' }).click()
  await page.getByLabel('Move to').selectOption({ label: 'Elsewhere' })
  await expect(
    page.getByText('1 idea, 1 draft, 1 note, 0 articles will move to “Elsewhere”.'),
  ).toBeVisible()
  await noViolations(page, 'confirming a move of an idea')
  await page.getByRole('button', { name: 'Move idea' }).click()

  // It opens where it is now, with its draft.
  await expect(page).toHaveURL(new RegExp(`/p/${second}/ideas/[^/]+$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
  await goTo(page, 'Draft')
  await expect(page.getByRole('main').getByRole('list').getByRole('listitem')).toHaveCount(1)

  // And the first publication has no ideas left.
  await page.goto(`/p/${first}/ideas`)
  await expect(page.getByText('No ideas yet')).toBeVisible()
})
