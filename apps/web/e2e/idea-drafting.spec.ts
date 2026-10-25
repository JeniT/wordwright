import {
  expect,
  goTo,
  test,
  createIdea,
  noViolations,
  signUpWithPublication,
  startDraft,
} from './fixtures'

test('pulls notes into a draft from the side, keeping where the words came from', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  await notes.getByRole('textbox', { name: 'Note', exact: true }).fill('Deposition on the inside.')
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
  await side
    .getByRole('button', { name: /^Insert at cursor: note “Erosion on the outside/ })
    .click()
  await expect(body).toContainText('Erosion on the outside of each bend.')
  await expect(side.getByText('Erosion on the outside of each bend.', { exact: true })).toHaveCount(
    0,
  )
  await expect(body.locator('p').first()).toHaveText('My opening paragraph.')

  await noViolations(page, 'drafting page after adding a note')

  await body.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Rewritten entirely.')

  // Added notes stay hidden unless asked for, and can be put back.
  await side.getByLabel('Show added (1)').check()
  await side.getByRole('button', { name: /^Put note “Erosion on the outside/ }).click()
  await expect(
    side.getByRole('button', { name: /^Insert at cursor: note “Erosion on the outside/ }),
  ).toBeVisible()

  // The record survives a reload.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await page.reload()
  await expect(body).toContainText('Rewritten entirely.')
})

test('on a phone the notes slide in over the draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithPublication(page)
  await createIdea(page, 'Tides', 'The moon pulls the sea.')
  await startDraft(page)

  const open = page.getByRole('button', { name: 'Draft panel' })
  await expect(page.getByRole('complementary')).toBeHidden()
  await open.click()
  const side = page.getByRole('complementary')
  await expect(side.getByText('The moon pulls the sea.')).toBeVisible()
  await noViolations(page, 'notes drawer open on a phone')
  await side.getByRole('button', { name: /^Insert at cursor: note “The moon/ }).click()
  await page.getByRole('button', { name: 'Close panel' }).click()
  await expect(page.getByRole('complementary')).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toContainText(
    'The moon pulls the sea.',
  )
})

test('on a phone the top bar stays put while the draft scrolls, and the breadcrumb leads up', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithPublication(page)
  await createIdea(page, 'Tides', 'The moon pulls the sea.')
  await startDraft(page)
  const open = page.getByRole('button', { name: 'Draft panel' })
  const side = page.getByRole('complementary')

  // The bar sticks: scrolled well down, its tabs are still there, with the chevrons turning with the drawer.
  await page.getByRole('textbox', { name: 'Draft body' }).fill('Line one.\n'.repeat(80))
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(open).toBeInViewport()
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  await open.click()
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  await expect(side).toBeVisible()
  await open.click()
  await expect(side).toBeHidden()
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menu).toBeInViewport()
  await menu.click()
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
  await menu.click()

  // The breadcrumb is under the bar: Weekly letters › Tides, each a link; the mark leads home.
  await page.evaluate(() => window.scrollTo(0, 0))
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' }).filter({ visible: true })
  await expect(crumbs.getByRole('link')).toHaveText(['Weekly letters', 'Tides'])
  await crumbs.getByRole('link', { name: 'Tides' }).click()
  await expect(page).toHaveURL(/\/ideas\/[^/]+$/)
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await expect(page).toHaveURL(/\/$/)
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
  await page.getByRole('button', { name: 'Add article' }).click()
  await page.getByRole('link', { name: /^Fake title for / }).click()

  // Pasting into the empty box ticks "This is a quotation" (and says why); typing does not.
  const noteBox = page.getByRole('textbox', { name: 'Note', exact: true })
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
  await page.getByRole('link', { name: '← Back to the articles' }).click()
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
    .getByRole('button', { name: /^Insert at cursor: note “Meanders grow/ })
    .click()
  const quoted = body.locator('blockquote')
  await expect(quoted).toContainText('Meanders grow because banks erode.')
  await expect(quoted.getByRole('link')).toHaveAttribute('href', 'https://example.org/meanders')
  await expect(quoted.getByRole('link')).toHaveCSS('text-decoration-line', 'underline')
  await expect(body.locator('p').first()).toHaveText('My opening paragraph.')
})

test('a note taken from a source goes into the draft with a real link to it, which looks like one', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add article' }).click()
  await page.getByRole('link', { name: /^Fake title for / }).click()
  await page
    .getByRole('textbox', { name: 'Note', exact: true })
    .fill('Meanders grow because banks erode.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Meanders grow because banks erode.')).toBeVisible()
  await page.getByRole('link', { name: '← Back to the articles' }).click()

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /^Insert at cursor: note “Meanders grow/ })
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

test('a note dragged from the side bar lands in the draft where it is dropped', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  await notes.getByRole('textbox', { name: 'Note', exact: true }).fill('Deposition on the inside.')
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

  // Dropped on the start of the last paragraph, the note goes between the two. x is 1px in: the drop lands on the
  // nearest character boundary, so a few pixels in is already past the first letter.
  const note = side
    .getByText('Deposition on the inside.', { exact: true })
    .locator('xpath=ancestor::li[1]')
  await note.getByTestId('rail').dragTo(paragraphs.nth(1), { targetPosition: { x: 1, y: 4 } })
  await expect(paragraphs).toHaveText([
    'First paragraph.',
    'Deposition on the inside.',
    'Last paragraph.',
  ])
  await expect(side.getByText('Deposition on the inside.', { exact: true })).toHaveCount(0) // set aside
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
    .getByRole('button', { name: /^Insert at cursor: note “Erosion/ })
    .click()
  await expect(body).toContainText('Erosion on the outside of each bend.')
})
