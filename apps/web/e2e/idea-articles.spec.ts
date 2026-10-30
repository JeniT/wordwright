import {
  expect,
  goTo,
  showReadItems,
  addFilterTag,
  openFilters,
  test,
  createIdea,
  noViolations,
  signUpWithPublication,
  startDraft,
  startIdea,
} from './fixtures'

test('keeps a list of articles for the idea: adds, ticks off, edits and checks links', async ({
  page,
}) => {
  await startIdea(page)
  await goTo(page, 'Read')
  // The articles. Text that isn't a web address is refused, in red under the field, and kept for fixing.
  const address = page.getByLabel('Web address', { exact: true })
  const add = page.getByRole('button', { name: 'Add article' })
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
  await expect(paper).toHaveAttribute('href', /\/articles\//) // the title opens the item's page for notes
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

test('reads an article and takes notes from it, on a phone too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Note')
  await expect(page.getByRole('heading', { level: 1, name: 'Note' })).toBeVisible()
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add article' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()

  await page.getByRole('link', { name: /^Fake title for / }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: /Fake title for example\.org/ }),
  ).toBeVisible()
  await expect(page.getByText(/No notes from this page yet/)).toBeVisible()

  // Another page found on this one goes straight onto the articles, and can be read next.
  await page.getByRole('tab', { name: 'Add article' }).click()
  await page.getByLabel('Web address', { exact: true }).fill('rubbish')
  await page.getByRole('button', { name: 'Add article' }).click()
  await expect(page.getByText('Enter a web address, like https://example.com')).toBeVisible()
  await page.getByLabel('Web address', { exact: true }).fill('example.org/authored')
  await page.getByRole('button', { name: 'Add article' }).click()
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
  const box = page.getByRole('textbox', { name: 'Note', exact: true })
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
  await page.getByRole('link', { name: '← Back to the articles' }).click()
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

test('tags articles, one or several at once, and filters the list by a tag', async ({ page }) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander', 'Erosion on the outside of each bend.')
  await expect(page).toHaveURL(/\/ideas\/(?!new)[^/]+$/) // the idea's own page
  await goTo(page, 'Read')
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  for (const address of ['example.org/meanders', 'example.net/oxbows']) {
    await page.getByLabel('Web address', { exact: true }).fill(address)
    await page.getByRole('button', { name: 'Add article' }).click()
    await expect(
      page.getByRole('link', { name: new RegExp(`^Fake title for ${address.split('/')[0]}`) }),
    ).toBeVisible()
  }
  // No filter until something is tagged.
  const filter = page.getByRole('combobox', { name: 'Filter by tag' })
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
  await addFilterTag(filter, 'part 1')
  await expect(
    page.getByRole('link', { name: 'Fake title for example.net', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Stop filtering by part 1' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.net', exact: true }),
  ).toBeVisible()
  // Tab completes a typed start of a tag, and leaves focus in the box.
  await filter.fill('back')
  await filter.press('Tab')
  await expect(page.getByRole('button', { name: 'Stop filtering by background' })).toBeVisible()
  await expect(filter).toBeFocused()
  await page.getByRole('button', { name: 'Stop filtering by background' }).click()
  await page.reload()
  await expect(page.getByRole('list', { name: 'Tags' }).getByText('background')).toBeVisible()
  await noViolations(page, 'articles with tags')

  // Several at once: tick both, add a tag to them together, then take the first tag off both.
  await page.getByRole('checkbox', { name: 'Select Fake title for example.org' }).check()
  await page.getByRole('checkbox', { name: 'Select Fake title for example.net' }).check()
  await page.getByRole('button', { name: 'Tag…' }).click()
  await page.getByLabel('Add a tag', { exact: true }).fill('shared')
  await page.getByLabel('Add a tag', { exact: true }).press('Enter')
  await noViolations(page, 'articles with the tag panel open')
  await page.getByRole('button', { name: 'Tag 2 items' }).click()
  await expect(page.getByLabel('Add a tag', { exact: true })).toHaveCount(0)
  await openFilters(page)
  await addFilterTag(page.getByRole('combobox', { name: 'Filter by tag' }), 'shared')
  await expect(
    page.getByRole('link', { name: 'Fake title for example.net', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()
})

/** A new account has tutorial mode on, which writes tips out instead of showing their icons; these tests are about the icons. */

test('a link to something in the articles goes in only once it has been read', async ({ page }) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add article' }).click()
  const title = /Fake title for example\.org/
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('Rivers never run straight, as ')
  const side = page.getByRole('complementary')
  await side.getByRole('tab', { name: 'Articles' }).click()
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
  await expect(reading).toHaveURL(/\/ideas\/[^/]+\/articles\//)
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

  // From now on it goes straight in, and the idea's articles shows it ticked.
  await insert.click()
  await expect(dialog).toHaveCount(0)
  await expect(body).toContainText(/Fake title for example\.org.*Fake title for example\.org/)
  await goTo(page, 'Read')
  await showReadItems(page)
  await expect(page.getByRole('switch', { name: /^Read: Fake title/ })).toBeChecked()
})

test('an article is added to the draft as a link that says who wrote it', async ({ page }) => {
  await signUpWithPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/authored')
  await page.getByRole('button', { name: 'Add article' }).click()
  await expect(page.getByText(/Added “/)).toBeVisible()

  await startDraft(page)
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('Rivers never run straight, as ')
  const side = page.getByRole('complementary')
  await side.getByRole('tab', { name: 'Articles' }).click()
  await expect(side.getByText('by Ada Author and Bo Writer')).toBeVisible()
  await noViolations(page, 'drafting page, articles')

  await side.getByRole('button', { name: /^Insert at cursor: “.*”$/ }).click()
  await page
    .getByRole('dialog', { name: 'You haven’t marked this as read' })
    .getByRole('button', { name: 'Mark as read' })
    .click()
  await expect(body.locator('a')).toHaveAttribute('href', 'https://example.org/authored')
  await expect(body).toContainText('by Ada Author and Bo Writer')
})
