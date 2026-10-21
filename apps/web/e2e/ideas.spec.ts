import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import {
  expect,
  goTo,
  openFilters,
  showReadItems,
  holdToConfirm,
  showArrowsFor,
  test,
  createIdea,
} from './fixtures'

async function signUpWithPublication(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Ida')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`ida-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Weekly letters')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
}

/** Goes to the Draft step, adds a draft and waits for the editor, so we don't type into the old page. */
async function startDraft(page: Page) {
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await expect(page.getByRole('link', { name: '← All drafts' })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

/** Signs up with a publication and creates the idea "Why rivers meander" (with its first note), ending on the idea's page. */
async function startIdea(page: Page) {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
}

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

test('keeps a reading list for the idea: adds, ticks off, edits and checks links', async ({
  page,
}) => {
  await startIdea(page)
  await goTo(page, 'Read')
  // The reading list. Text that isn't a web address is refused, in red under the field, and kept for fixing.
  const address = page.getByLabel('Web address', { exact: true })
  const add = page.getByRole('button', { name: 'Add to reading list' })
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
  const paper = page.getByRole('link', { name: 'Fake title for example.org', exact: true })
  await expect(paper).toHaveAttribute('href', /\/reading\//) // the title opens the item's page for notes
  await expect(
    page.getByRole('link', { name: /^example\.org Fake title for example\.org/ }),
  ).toHaveAttribute('href', 'https://example.org/meanders') // the host opens the article
  await expect(address).toHaveValue('')

  // Items are ticked off as they are read (perhaps elsewhere), and that is remembered.
  const readBox = page.getByRole('switch', { name: /^Read: Fake title for example\.org/ })
  await expect(readBox).not.toBeChecked()
  await readBox.check()
  await expect(readBox).toBeChecked() // still in view, so it can be unticked
  await page.reload()
  // Read items are out of the way until asked for.
  await expect(readBox).toHaveCount(0)
  await showReadItems(page)
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
  await page.getByRole('button', { name: /Edit https:\/\/example\.com\/untitled/ }).click()
  await page.getByLabel('Title of this item (optional)').fill('The untitled one')
  await noViolations(page, 'editing a link')
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(page.getByRole('link', { name: 'The untitled one', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Edit The untitled one' }).click()
  const editAddress = page.getByLabel('Web address of this item')
  await editAddress.fill('example.org/meanders') // already in the list
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(page.getByText('That link is already in this idea.')).toBeVisible()
  await editAddress.fill('https://example.net/other')
  await page.getByLabel('Title of this item (optional)').fill('')
  await page.getByRole('button', { name: 'Save item' }).click()
  // A cleared title is looked up again, for the new address.
  await expect(
    page.getByRole('link', { name: 'Fake title for example.net', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save item' })).toHaveCount(0)
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
    await notes.getByLabel('Note', { exact: true }).fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  await expect(notes.getByLabel('Note', { exact: true })).toHaveValue('')
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
    await page.getByRole('button', { name: 'Add to reading list' }).click()
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

test('pulls notes into a draft from the side, keeping where the words came from', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  await notes.getByLabel('Note', { exact: true }).fill('Deposition on the inside.')
  await notes.getByRole('button', { name: 'Add note' }).click()
  await expect(notes.getByRole('listitem')).toHaveCount(2)

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('My opening paragraph.')

  // On a wide screen the notes sit beside the draft.
  const side = page.getByRole('complementary')
  await expect(
    side.getByText('Erosion on the outside of each bend.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open panel' })).toBeHidden()
  await noViolations(page, 'drafting page with notes beside it')

  // Adding a note puts its words after the paragraph you are in, saves the draft, and sets the note aside.
  await side.getByRole('button', { name: /^Add note “Erosion on the outside/ }).click()
  await expect(body).toContainText('Erosion on the outside of each bend.')
  await expect(side.getByText('Erosion on the outside of each bend.', { exact: true })).toHaveCount(
    0,
  )
  await expect(body.locator('p').first()).toHaveText('My opening paragraph.')

  // Where the words came from is recorded, and says whether they are still as they were put in.
  const provenance = page.getByText(/Where some of the words came from \(1\)/)
  await provenance.click()
  await expect(page.getByText('Ida', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('Still as inserted')).toBeVisible()
  await noViolations(page, 'drafting page with the record of where words came from')

  await body.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Rewritten entirely.')
  await expect(page.getByText('Edited or removed since')).toBeVisible()

  // Added notes stay hidden unless asked for, and can be put back.
  await side.getByLabel('Show added (1)').check()
  await side.getByRole('button', { name: /^Put note “Erosion on the outside/ }).click()
  await expect(
    side.getByRole('button', { name: /^Add note “Erosion on the outside/ }),
  ).toBeVisible()

  // The record survives a reload.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await page.reload()
  await expect(page.getByText(/Where some of the words came from \(1\)/)).toBeVisible()
})

test('on a phone the notes slide in over the draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithPublication(page)
  await createIdea(page, 'Tides', 'The moon pulls the sea.')
  await startDraft(page)

  const open = page.getByRole('button', { name: 'Open panel' })
  await expect(page.getByRole('complementary')).toBeHidden()
  await open.click()
  const side = page.getByRole('complementary')
  await expect(side.getByText('The moon pulls the sea.')).toBeVisible()
  await noViolations(page, 'notes drawer open on a phone')
  await side.getByRole('button', { name: /^Add note “The moon/ }).click()
  await page.getByRole('button', { name: 'Close panel' }).click()
  await expect(page.getByRole('complementary')).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toContainText(
    'The moon pulls the sea.',
  )
})

test('reads a reading-list item and takes notes from it, on a phone too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()

  await page.getByRole('link', { name: /^Fake title for / }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: /Fake title for example\.org/ }),
  ).toBeVisible()
  await expect(page.getByText(/No notes from this page yet/)).toBeVisible()

  // Another page found on this one goes straight onto the reading list, and can be read next.
  await page.getByRole('tab', { name: 'Add to reading list' }).click()
  await page.getByLabel('Web address', { exact: true }).fill('rubbish')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await expect(page.getByText('Enter a web address, like https://example.com')).toBeVisible()
  await page.getByLabel('Web address', { exact: true }).fill('example.org/authored')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await expect(page.getByText(/Added “/)).toBeVisible()
  // The authors the page names are found along with its title.
  await page.getByRole('link', { name: /^Open “/ }).click()
  await expect(page.getByText('By Ada Author and Bo Writer')).toBeVisible()
  await page.goBack()
  await noViolations(page, 'reading page after adding another page')
  // The page itself opens in its own tab: most sites refuse to be shown inside another page.
  await expect(page.getByRole('link', { name: /Open the page/ })).toHaveAttribute(
    'href',
    'https://example.org/meanders',
  )
  // The title can be corrected here, which matters when it couldn't be found from the page.
  await page.getByRole('button', { name: 'Edit title and authors' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders, explained')
  await page.getByLabel('Authors', { exact: true }).fill('Pat Writer, Quinn Scribe')
  await noViolations(page, 'reading page, editing the title and authors')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Meanders, explained' })).toBeVisible()
  await expect(page.getByText('By Pat Writer and Quinn Scribe')).toBeVisible()
  await noViolations(page, 'reading page, no notes yet')

  // A quote, then the writer's own words: both are kept against the page and say where they came from.
  const box = page.getByLabel('Note', { exact: true })
  await box.fill('“Meanders grow because the outside of a bend erodes faster.”')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(box).toHaveValue('')
  await box.fill('So the bend moves downstream.')
  await page.getByRole('button', { name: 'Add note' }).click()
  const list = page.getByRole('main').getByRole('list')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  // The newest is first, right under the box, so a note just added is in sight.
  await expect(list.getByRole('listitem').first()).toContainText('So the bend moves downstream.')
  await expect(list).toContainText('From Meanders, explained')
  await expect(list).not.toContainText('Pat Writer') // the page's authors are on the page, not on each note
  await expect(list).not.toContainText('by Ida') // the chip is who took the note, not who wrote the page
  // Taking notes from a page marks it read (it can still be unticked).
  await expect(page.getByRole('switch', { name: 'Read' })).toBeChecked()
  await noViolations(page, 'reading page with notes')

  // They are remembered, and they join the idea's other notes, still naming the page they came from.
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Read' })).toBeChecked()
  await expect(page.getByText('So the bend moves downstream.')).toBeVisible()
  await page.getByRole('link', { name: '← Back to the reading list' }).click()
  // (the first item; the second, added from the reading page, is unread; read items are hidden until shown)
  await expect(page.getByRole('switch', { name: 'Read: Meanders, explained' })).toHaveCount(0)
  await showReadItems(page)
  await expect(page.getByRole('switch', { name: 'Read: Meanders, explained' })).toBeChecked()
  await expect(page.getByRole('switch', { name: /^Read: / })).toHaveCount(2)
  // Read items go last: the unread page found while reading comes first, the one just read after it.
  await expect(page.getByRole('switch', { name: /^Read: / }).first()).not.toBeChecked()
  await expect(page.getByRole('switch', { name: /^Read: / }).last()).toBeChecked()
  await goTo(page, 'Note')
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByText('So the bend moves downstream.')).toBeVisible()
  await expect(notes.getByRole('link', { name: /^Meanders, explained/ }).first()).toBeVisible()
  await expect(notes.getByText('Ida', { exact: true }).first()).toBeVisible()
})

test('tags reading-list items, one or several at once, and filters the list by a tag', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Read')
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  for (const address of ['example.org/meanders', 'example.net/oxbows']) {
    await page.getByLabel('Web address', { exact: true }).fill(address)
    await page.getByRole('button', { name: 'Add to reading list' }).click()
    await expect(
      page.getByRole('link', { name: new RegExp(`^Fake title for ${address.split('/')[0]}`) }),
    ).toBeVisible()
  }
  // No filter until something is tagged.
  const filter = page.getByRole('group', { name: 'Show items with a tag' })
  await expect(page.getByRole('button', { name: /^Filter/ })).toHaveCount(0) // no funnel yet

  // Tags go in one at a time under the link: type, Enter, type, Enter, then the tick.
  await page.getByRole('button', { name: 'Add tags to Fake title for example.org' }).click()
  const tagField = page.getByLabel('Add a tag to Fake title for example.org')
  await tagField.fill('background')
  await tagField.press('Enter')
  await expect(tagField).toBeFocused() // still open for the next one
  await tagField.fill('part 1')
  await tagField.press('Enter')
  await expect(page.getByRole('list', { name: 'Tags' }).getByText('part 1')).toBeVisible()
  await noViolations(page, 'tagging a link')
  await page.getByRole('button', { name: 'Done tagging Fake title for example.org' }).click()
  await expect(tagField).toHaveCount(0)

  // Show only that tag's items, then all again; the tag survives a reload.
  await openFilters(page)
  await filter.getByRole('button', { name: 'part 1' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.net', exact: true }),
  ).toHaveCount(0)
  await filter.getByRole('button', { name: 'All' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.net', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('list', { name: 'Tags' }).getByText('background')).toBeVisible()
  await noViolations(page, 'reading list with tags')

  // Several at once: tick both, add a tag to them together, then take the first tag off both.
  await page.getByRole('checkbox', { name: 'Select Fake title for example.org' }).check()
  await page.getByRole('checkbox', { name: 'Select Fake title for example.net' }).check()
  await page.getByRole('button', { name: 'Tag…' }).click()
  await page.getByLabel('Add a tag', { exact: true }).fill('shared')
  await page.getByLabel('Add a tag', { exact: true }).press('Enter')
  await noViolations(page, 'reading list with the tag panel open')
  await page.getByRole('button', { name: 'Tag 2 items' }).click()
  await expect(page.getByLabel('Add a tag', { exact: true })).toHaveCount(0)
  await openFilters(page)
  await page
    .getByRole('group', { name: 'Show items with a tag' })
    .getByRole('button', { name: 'shared' })
    .click()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.net', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()
})

/** A new account has tutorial mode on, which writes tips out instead of showing their icons; these tests are about the icons. */
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
    await notes.getByLabel('Note', { exact: true }).fill(text)
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
    await notes.getByLabel('Note', { exact: true }).fill(text)
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
  const filter = notes.getByRole('group', { name: 'Show notes with a tag' })
  await filter.getByRole('button', { name: 'section one' }).click()
  await expect(notes.getByText('Oxbow lakes form')).toHaveCount(0)
  await expect(notes.getByText('Deposition on the inside.')).toBeVisible()
  await filter.getByRole('button', { name: 'All' }).click()

  // The tag can be taken off both in one go (a new filter clears the selection, so choose them again).
  await notes.getByRole('checkbox', { name: /^Select note “Erosion/ }).check()
  await notes.getByRole('checkbox', { name: /^Select note “Deposition/ }).check()
  await notes.getByRole('button', { name: 'Tag…' }).click()
  await notes.getByRole('button', { name: 'Remove “intro”' }).click()
  await notes.getByRole('button', { name: 'Tag 2 notes' }).click()
  await expect(filter.getByRole('button', { name: 'intro' })).toHaveCount(0)
  await expect(filter.getByRole('button', { name: 'section one' })).toBeVisible()
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
    await notes.getByLabel('Note', { exact: true }).fill(text)
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByText(text)).toBeVisible()
  }
  // No filter until something is tagged.
  await expect(notes.getByRole('group', { name: 'Show notes with a tag' })).toHaveCount(0)

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
  const filter = notes.getByRole('group', { name: 'Show notes with a tag' })
  await filter.getByRole('button', { name: 'part 1' }).click()
  await expect(notes.getByText('Oxbow lakes form')).toHaveCount(0)
  await showArrowsFor(notes, /^Reorder note “Erosion/)
  await notes.getByRole('button', { name: /^Move note “Erosion.*up/ }).click()
  await filter.getByRole('button', { name: 'All' }).click()
  await expect(notes.getByRole('listitem').filter({ hasText: 'Deposition' }).first()).toBeVisible()
  await page.reload()
  const after = page.getByRole('region', { name: 'Notes' })
  await expect(after.getByRole('list', { name: 'Tags' }).first()).toBeVisible()

  // Beside the draft, the same tags narrow the list to what belongs in this part.
  await startDraft(page)
  const side = page.getByRole('complementary')
  await side
    .getByRole('group', { name: 'Show notes with a tag' })
    .getByRole('button', { name: 'Part 2' })
    .click()
  await expect(side.getByText('Oxbow lakes form')).toBeVisible()
  await expect(side.getByText('Deposition on the inside.')).toHaveCount(0)
  await noViolations(page, 'drafting page filtered by a tag')
})

test('a quotation cannot be edited, and goes into a draft as a blockquote with its source', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await page.getByRole('link', { name: /^Fake title for / }).click()

  // Pasting into the empty box ticks "This is a quotation" (and says why); typing does not.
  const noteBox = page.getByLabel('Note', { exact: true })
  const quoteBox = page.getByRole('checkbox', { name: /This is a quotation/ })
  await noteBox.fill('Typed words')
  await expect(quoteBox).not.toBeChecked()
  await noteBox.fill('')
  await noteBox.evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text', 'Meanders grow because banks erode.')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(quoteBox).toBeChecked()
  await expect(page.getByText(/Ticked because you pasted it/)).toBeVisible()
  await noteBox.fill('Meanders grow because banks erode.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByRole('main').getByRole('list').locator('blockquote')).toContainText(
    'Meanders grow',
  )
  await noViolations(page, 'reading page with a quotation')

  // On the idea's notes the quotation can be tagged or deleted, but not edited.
  await page.getByRole('link', { name: '← Back to the reading list' }).click()
  await goTo(page, 'Note')
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.locator('blockquote')).toBeVisible()
  await expect(notes.getByRole('button', { name: /^Edit note “Meanders/ })).toHaveCount(0)
  await expect(notes.getByRole('button', { name: /^Edit note “Erosion/ })).toBeVisible()
  await noViolations(page, 'notes with a quotation')

  // In the draft it is a blockquote that names its source, and the record says where it came from.
  await startDraft(page)
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
  await expect(quoted.getByRole('link')).toHaveCSS('text-decoration-line', 'underline')
  await expect(body.locator('p').first()).toHaveText('My opening paragraph.')
  await page.getByText(/Where some of the words came from \(1\)/).click()
  await expect(page.getByText('Still as inserted')).toBeVisible()
})

test('a link to something on the reading list goes in only once it has been read', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  const title = /Fake title for example\.org/
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('Rivers never run straight, as ')
  const side = page.getByRole('complementary')
  await side.getByRole('tab', { name: 'Reading list' }).click()
  const insert = side.getByRole('button', { name: title })

  // Unread: the writer is asked, and cancelling inserts nothing.
  await insert.click()
  const dialog = page.getByRole('dialog', { name: 'You haven’t marked this as read' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await noViolations(page, 'the unread-source dialog')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(body.locator('a')).toHaveCount(0)

  // "Read it now" opens the item's reading page in a new tab and leaves this draft as it is.
  await insert.click()
  const [reading] = await Promise.all([
    page.context().waitForEvent('page'),
    dialog.getByRole('button', { name: 'Read it now' }).click(),
  ])
  await expect(reading).toHaveURL(/\/ideas\/[^/]+\/reading\//)
  await reading.close()
  await expect(body.locator('a')).toHaveCount(0)
  await expect(body).toContainText('Rivers never run straight, as')

  // "Mark as read" marks it and puts the link in the line being written.
  await insert.click()
  await dialog.getByRole('button', { name: 'Mark as read' }).click()
  await expect(body.locator('a')).toHaveAttribute('href', 'https://example.org/meanders')
  await expect(body.locator('a')).toHaveCSS('text-decoration-line', 'underline')
  await expect(body.locator('p')).toHaveCount(1)
  await expect(side.getByText('Not marked as read')).toHaveCount(0)

  // From now on it goes straight in, and the idea's reading list shows it ticked.
  await insert.click()
  await expect(dialog).toHaveCount(0)
  await expect(body).toContainText(/Fake title for example\.org.*Fake title for example\.org/)
  await goTo(page, 'Read')
  await showReadItems(page)
  await expect(page.getByRole('switch', { name: /^Read: Fake title/ })).toBeChecked()
})

test('notes can be merged into one, and one note cut in two', async ({ page }) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  for (const text of ['Deposition on the inside.', 'Oxbow lakes form when a loop is cut off.']) {
    await notes.getByLabel('Note', { exact: true }).fill(text)
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

test('a note taken from a source goes into the draft with a real link to it, which looks like one', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await page.getByRole('link', { name: /^Fake title for / }).click()
  await page.getByLabel('Note', { exact: true }).fill('Meanders grow because banks erode.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Meanders grow because banks erode.')).toBeVisible()
  await page.getByRole('link', { name: '← Back to the reading list' }).click()

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /^Add note “Meanders grow/ })
    .click()
  // The source is a link in the words ("… (Title)"), not just its title in brackets: it is underlined, and
  // it is in the saved Markdown as [Title](address).
  const link = body.getByRole('link', { name: 'Fake title for example.org', exact: true })
  await expect(link).toHaveAttribute('href', 'https://example.org/meanders')
  await expect(link).toHaveCSS('text-decoration-line', 'underline')
  await expect(body).toContainText(
    /Meanders grow because banks erode\. \(Fake title for example\.org.*\)/,
  )
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await page.reload()
  await expect(
    page.getByRole('textbox', { name: 'Draft body' }).getByRole('link', { name: /Fake title/ }),
  ).toHaveAttribute('href', 'https://example.org/meanders')
})

test('a reading item is added to the draft as a link that says who wrote it', async ({ page }) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/authored')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await expect(page.getByText(/Added “/)).toBeVisible()

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('Rivers never run straight, as ')
  const side = page.getByRole('complementary')
  await side.getByRole('tab', { name: 'Reading list' }).click()
  await expect(side.getByText('by Ada Author and Bo Writer')).toBeVisible()
  await noViolations(page, 'drafting page, reading list')

  await side.getByRole('button', { name: /^Add a link to .* to the draft$/ }).click()
  await page
    .getByRole('dialog', { name: 'You haven’t marked this as read' })
    .getByRole('button', { name: 'Mark as read' })
    .click()
  await expect(body.locator('a')).toHaveAttribute('href', 'https://example.org/authored')
  await expect(body).toContainText('by Ada Author and Bo Writer')
})

test('a note dragged from the side bar lands in the draft where it is dropped', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  await notes.getByLabel('Note', { exact: true }).fill('Deposition on the inside.')
  await notes.getByRole('button', { name: 'Add note' }).click()
  await expect(notes.getByRole('listitem')).toHaveCount(2)

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await page.keyboard.type('First paragraph.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Last paragraph.')
  const side = page.getByRole('complementary')
  const paragraphs = body.locator('p')
  await expect(paragraphs).toHaveCount(2)

  // Dropped on the start of the last paragraph, the note goes between the two.
  const note = side
    .getByText('Deposition on the inside.', { exact: true })
    .locator('xpath=ancestor::li[1]')
  await note.getByTestId('rail').dragTo(paragraphs.nth(1), { targetPosition: { x: 4, y: 4 } })
  await expect(paragraphs).toHaveText([
    'First paragraph.',
    'Deposition on the inside.',
    'Last paragraph.',
  ])
  await expect(side.getByText('Deposition on the inside.', { exact: true })).toHaveCount(0) // set aside
  await expect(page.getByText(/Where some of the words came from \(1\)/)).toBeVisible()
  await noViolations(page, 'drafting page after a drop')

  // The draft was saved with it, and the other note can still go in with the button.
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Draft body' }).locator('p')).toHaveText([
    'First paragraph.',
    'Deposition on the inside.',
    'Last paragraph.',
  ])
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /^Add note “Erosion/ })
    .click()
  await expect(body).toContainText('Erosion on the outside of each bend.')
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
    page.getByText('1 idea, 1 draft, 1 note, 0 links will move to “Elsewhere”.'),
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
