import AxeBuilder from '@axe-core/playwright'
import { createIdea, expect, goTo, openFirstPublication, registerUser, test } from './fixtures'

test('a new draft is titled with its idea, and a long title wraps on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await registerUser(page)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  const title = page.getByLabel('Title', { exact: true })
  await expect(title).toHaveValue('Why rivers meander')

  const long = 'Why rivers meander across flat plains instead of running straight to the sea'
  await title.fill(long)
  const box = await title.boundingBox()
  expect(box!.height, 'the long title wraps onto several lines').toBeGreaterThan(60)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'no sideways scrolling',
  ).toBe(true)

  await title.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toBeFocused()
  await expect(title).toHaveValue(long) // Return added no line break
})

test('on a phone the formatting toolbar is pinned to the bottom of the screen, clear of the text (#380)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await registerUser(page)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await page.keyboard.type(Array.from({ length: 40 }, (_, i) => `Line ${i + 1}.`).join('\n\n'))

  const toolbar = page.getByRole('toolbar', { name: 'Formatting' })
  const box = (await toolbar.boundingBox())!
  expect(box.y + box.height, 'the toolbar sits at the bottom of the screen').toBeGreaterThan(660)
  await expect(page.getByTestId('word-count'), 'the word count stays at the top').toBeInViewport()
  expect((await page.getByTestId('word-count').boundingBox())!.y).toBeLessThan(120)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const last = (await body.locator('p').last().boundingBox())!
  expect(last.y + last.height, 'the last line scrolls clear of the toolbar').toBeLessThanOrEqual(
    (await toolbar.boundingBox())!.y,
  )
})

test('a draft saves itself while you write, and the words are there after a reload', async ({
  page,
}) => {
  await registerUser(page)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await expect(page.getByRole('link', { name: '← All drafts' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)

  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Not saved yet')).toBeVisible()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page.getByTestId('word-count')).toHaveText('4 words') // the body only, not the title
  await page.keyboard.press('ControlOrMeta+K')
  await expect(page.getByRole('dialog', { name: 'Add a link' })).toBeVisible()
  await page.keyboard.press('Escape')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.reload()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Meanders')
  await expect(page.getByText('Rivers rarely flow straight.', { exact: true })).toBeVisible()

  // Typing and leaving at once still keeps the words: the page saves before it goes.
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('They bend instead. ')
  await page.getByRole('link', { name: '← All drafts' }).click()
  await expect(page.getByRole('button', { name: 'New draft' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toContainText(
    'They bend instead.',
  )
})

test('marking a draft published takes it out of Keep writing, and it keeps its place and a green wash in the idea’s list (#311)', async ({
  page,
}) => {
  await registerUser(page)
  await openFirstPublication(page)
  const publicationUrl = page.url()
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  const ideaDraftsUrl = page.url()
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // Until it is marked, the draft is offered on the landing page.
  await page.goto(publicationUrl)
  await expect(page.getByRole('region', { name: 'Keep writing' })).toContainText('Meanders')

  await page.goBack()
  const publish = page.getByRole('region', { name: 'Publish' })
  await publish.getByRole('switch', { name: 'I’ve published this draft' }).click()
  await expect(publish.locator('.chip-ok')).toContainText('Published')
  // The menu no longer counts it as a draft (#346).
  await expect(
    page.getByRole('navigation', { name: 'Idea' }).getByRole('link', { name: /Draft/ }),
  ).toContainText('0 drafts')
  await publish.getByLabel(/Link to the published post/).fill('https://example.com/meanders')
  await publish.getByRole('button', { name: 'Save link' }).click()
  const post = publish.getByRole('link', { name: /View post/ })
  await expect(post).toHaveAttribute('href', 'https://example.com/meanders')
  await expect(post).toHaveAttribute('target', '_blank')
  // With a link saved the form folds away behind an edit button.
  await expect(publish.getByLabel(/Link to the published post/)).toHaveCount(0)
  const edit = publish.getByRole('button', { name: 'Edit link to the published post' })
  await edit.click()
  await expect(publish.getByLabel(/Link to the published post/)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(edit).toBeFocused()

  // Looked at in light, dark and on a phone.
  const violations = async (what: string) =>
    expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])
  await violations('published draft, light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await violations('published draft, dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 390, height: 800 })
  await violations('published draft, phone')
  await page.setViewportSize({ width: 1280, height: 800 })

  // Published, it leaves Keep writing but stays in the idea's list, marked.
  await page.goto(publicationUrl)
  await expect(page.getByRole('heading', { name: 'Keep writing' })).toHaveCount(0)
  await page.goto(ideaDraftsUrl)
  const row = page.getByRole('region', { name: 'Drafts' }).getByRole('listitem').first()
  await expect(row).toContainText('Meanders')
  await expect(row.locator('.chip-ok')).toContainText('Published')
  await expect(row.getByRole('link', { name: /View post/ })).toHaveAttribute(
    'href',
    'https://example.com/meanders',
  )
  await violations('idea’s drafts with a published row, light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await violations('idea’s drafts with a published row, dark')
  await page.emulateMedia({ colorScheme: 'light' })

  // Unmarking brings it back, and takes the link with it.
  await row.getByRole('link', { name: /^Meanders/ }).click()
  await publish.getByRole('switch', { name: 'I’ve published this draft' }).click()
  await expect(publish.getByLabel(/Link to the published post/)).toHaveCount(0)
  await page.goto(publicationUrl)
  await expect(page.getByRole('region', { name: 'Keep writing' })).toContainText('Meanders')
})

test('register, write, save and request a critique', async ({ page }) => {
  test.setTimeout(90_000) // a long flow: a long draft, a critique, the limit, a phone
  await registerUser(page)
  await openFirstPublication(page)

  // Every draft develops an idea, so writing starts from one.
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await expect(page.getByRole('link', { name: '← All drafts' })).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill('Why rivers meander')
  // A long draft, so that a paragraph at its end is well off the bottom of the page.
  const bodyBox = page.getByRole('textbox', { name: 'Draft body' })
  await bodyBox.click()
  await page.keyboard.type('Rivers rarely flow straight.')
  for (let i = 2; i <= 14; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(`Paragraph ${i} of the draft, which says something about meanders.`)
  }
  await page.keyboard.press('Enter')
  await page.keyboard.type('The very last paragraph.')

  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing

  // No key yet: the button waits, and we're pointed at account settings.
  await expect(page.getByRole('button', { name: 'Critique' })).toBeDisabled()
  await page.getByRole('link', { name: 'Add your AI key' }).click()

  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-test-key-1234')
  await page.getByRole('button', { name: 'Save key' }).first().click()
  // The saved key shows elided in the empty field, as the provider's console shows it.
  await expect(page.getByLabel('Anthropic API key')).toHaveAttribute(
    'placeholder',
    'sk-ant-e2e-tes...1234',
  )
  await expect(page.getByText('Leave as is to keep the current one')).toBeVisible()

  await page.getByRole('link', { name: 'Wordwright' }).click()
  await openFirstPublication(page)
  await page.getByRole('link', { name: /^Why rivers meander \d+ drafts?$/ }).click()
  await goTo(page, 'Draft')
  await page.getByRole('link', { name: /^Why rivers meander .*Last changed/ }).click()
  await page.getByRole('button', { name: 'Critique' }).click()

  // The comments come beside the draft, in the tab that opens for them.
  const side = page.getByRole('complementary')
  await expect(side.getByRole('tab', { name: /^Comments/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(side.getByText('A fake critique: one thing to look at.')).toBeVisible()
  const comment = side.getByRole('button', { name: /Fake critique: the opening could say/ })
  await expect(comment).toContainText('Your AI')
  await expect(comment).not.toContainText('Rivers rarely flow straight.') // no excerpt: it is on the page

  // The point is marked beside the paragraph it is about, and the page is still accessible with the marks in.
  const mark = page.getByRole('button', { name: 'Comment 1', exact: true })
  await expect(mark).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (const tab of ['Notes', 'Articles', 'Comments']) {
    await side.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations, tab).toEqual([])
  }

  // The comment about the last paragraph is far down the page. Pressing it puts that paragraph at the top of the
  // window, and the comment at the top of its area, side by side.
  const ending = side.getByRole('button', { name: /the ending could land harder/ })
  await page.evaluate(() => window.scrollTo(0, 0))
  await ending.click()
  const last = page
    .getByRole('textbox', { name: 'Draft body' })
    .getByText('The very last paragraph.')
  await expect.poll(async () => (await last.boundingBox())?.y ?? 9999).toBeLessThan(120)
  await expect.poll(async () => (await last.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0)
  await expect
    .poll(async () =>
      Math.abs(((await ending.boundingBox())?.y ?? 9999) - (await last.boundingBox())!.y),
    )
    .toBeLessThan(120)

  // Pressing the mark opens its comment; pressing a comment shows its paragraph, with no separate button.
  await side.getByRole('tab', { name: 'Notes' }).click()
  await mark.click()
  await expect(side.getByRole('tab', { name: /^Comments/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(comment).toBeFocused()
  await expect(side.getByRole('button', { name: /Show in draft/ })).toHaveCount(0)
  await comment.click()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toBeFocused()

  // It is kept with the draft: after a reload it is still there (under Comments), and nothing was asked again.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Comment 1', exact: true })).toBeVisible()
  await page
    .getByRole('complementary')
    .getByRole('tab', { name: /^Comments/ })
    .click()
  await expect(page.getByText('A fake critique: one thing to look at.')).toBeVisible()

  // Rewriting the paragraph takes the mark away; the comment stays in the list with a Text changed button, which
  // shows the old paragraph beside the (now missing) new one.
  await page.getByRole('textbox', { name: 'Draft body' }).fill('Meanders come from erosion.')
  await expect(page.getByRole('button', { name: 'Comment 1', exact: true })).toHaveCount(0)
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Text changed: comment 1' })
    .click()
  const changed = page.getByRole('dialog', { name: 'Text changed' })
  await expect(changed.getByText('This paragraph isn’t in the draft now.')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the Text changed dialog').toEqual(
    [],
  )
  await page.keyboard.press('Escape')

  // The editor resolves a comment when they have dealt with it. It is hidden, not deleted, and stays out of the list.
  const side2 = page.getByRole('complementary')
  await side2.getByRole('switch', { name: 'Resolved: comment 1' }).click()
  await expect(side2.getByRole('switch', { name: 'Resolved: comment 1' })).toHaveCount(0)
  await side2.getByRole('switch', { name: 'Show resolved (1)' }).check()
  await expect(side2.getByRole('switch', { name: 'Resolved: comment 1' })).toBeChecked()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'a resolved comment').toEqual([])
  await side2.getByRole('switch', { name: 'Resolved: comment 1' }).uncheck()
  await expect(side2.getByRole('button', { name: 'Text changed: comment 1' })).toBeVisible()

  // Looks are rationed: one used so far of the three suggested, and the writer can lower the limit.
  await expect(page.getByText('1 of 3 looks used')).toBeVisible()
  await page.goto('/account/ai')
  await page.getByLabel('Critiques per draft').selectOption('1')
  await page
    .getByRole('region', { name: 'Critique limit' })
    .getByRole('button', { name: 'Save limit' })
    .click()
  await expect(
    page.getByRole('region', { name: 'Critique limit' }).getByText('Saved', { exact: true }),
  ).toBeVisible()
  await page.goBack()
  // The page reloads on the way back, which can be slow on a busy machine.
  await expect(page.getByText(/You have had your 1 look at this draft/)).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByRole('button', { name: 'Critique', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'publish it' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  // The rewrite was saved as it was typed. Putting the opening back brings its comment's mark back.
  await page.getByRole('textbox', { name: 'Draft body' }).fill('Rivers rarely flow straight.')
  await expect(page.getByRole('button', { name: 'Comment 1', exact: true })).toBeVisible()

  // On a phone nothing spills sideways.
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  // The publish buttons are at the bottom of the draft, and the closed notes drawer does not cover them.
  const copy = page.getByRole('button', { name: 'Copy as Markdown' })
  await copy.scrollIntoViewIfNeeded()
  await expect(copy).toBeVisible()
  const box = (await copy.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeInViewport()
  const topmost = await copy.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  })
  expect(topmost).toBe(true)

  // There the comments are in the drawer, and pressing one shows its paragraph and gets the drawer out of the way.
  await page.getByRole('button', { name: 'Draft panel' }).click()
  const drawer = page.getByRole('complementary')
  await drawer.getByRole('tab', { name: /^Comments/ }).click()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'comments in the drawer').toEqual(
    [],
  )
  await drawer.getByRole('button', { name: /Fake critique: the opening could say/ }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Draft body' })).toBeFocused()
})

test('rephrases a passage: select words, state an aim, choose and edit an option, use it', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await registerUser(page)
  await page.goto('/account/ai')
  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-rephrase-key-5678')
  await page.getByRole('button', { name: 'Save key' }).first().click()
  await expect(page.getByLabel('Anthropic API key')).toHaveAttribute('placeholder', /\.\.\.5678$/)
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers bend')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Why rivers bend')
  const bodyBox = page.getByRole('textbox', { name: 'Draft body' })
  await bodyBox.click()
  await page.keyboard.type('The river bends because the outside bank erodes faster.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('It drifts across the valley over centuries.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing

  // Nothing selected: the button is unavailable (but reachable), and says why when pressed.
  const rephrase = page.getByRole('button', { name: 'Rephrase', exact: true })
  await expect(rephrase).toHaveAttribute('aria-disabled', 'true')
  await rephrase.click({ force: true }) // Playwright treats aria-disabled as disabled; a person can press it
  await expect(page.getByText('Select some of your draft to rephrase it.')).toBeVisible()

  // Select a paragraph (a triple click) and ask.
  await bodyBox.getByText('The river bends').click({ clickCount: 3 })
  await expect(rephrase).not.toHaveAttribute('aria-disabled')
  await rephrase.click()
  const dialog = page.getByRole('dialog', { name: 'Rephrase this passage' })
  await expect(dialog.getByLabel('Current wording')).toHaveValue(
    'The river bends because the outside bank erodes faster.',
  )
  await expect(dialog.getByLabel('What should it do?')).toBeFocused()
  const generate = dialog.getByRole('button', { name: 'Generate options' })
  await expect(generate).toBeDisabled()
  await dialog.getByLabel('What should it do?').fill('Shorter, with the cause first')
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the dialog before asking').toEqual(
    [],
  )
  await generate.click()
  const list = dialog.getByRole('list', { name: 'Options' })
  await expect(list.getByRole('listitem')).toHaveCount(8)
  await expect(dialog.getByText('Round 1 of 3', { exact: true })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the dialog with options').toEqual(
    [],
  )

  // Another round needs a changed aim.
  await expect(generate).toBeDisabled()
  await dialog.getByLabel('What should it do?').fill('Warmer, like speaking to a friend')
  await generate.click()
  await expect(dialog.getByText('Round 2 of 3', { exact: true })).toBeVisible()
  await expect(list.getByRole('listitem').first()).toContainText('round 2')

  // Dark mode and a phone: the window fits and passes the checks.
  await page.emulateMedia({ colorScheme: 'dark' })
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the dialog in dark').toEqual([])
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 1280, height: 800 })

  // Choose an option, change it, use it: it replaces just the selected words.
  await list
    .getByRole('listitem')
    .nth(1)
    .getByRole('button', { name: /Replace the wording/ })
    .click()
  await expect(dialog.getByLabel('Current wording')).toHaveValue('Fake option 2 of round 2.')
  await dialog.getByLabel('Current wording').fill('Fake option 2 of round 2, in my words.')
  await dialog.getByRole('button', { name: 'Use this' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(bodyBox).toContainText('Fake option 2 of round 2, in my words.')
  await expect(bodyBox).toContainText('It drifts across the valley over centuries.')
  await expect(bodyBox).not.toContainText('outside bank erodes')
  await expect(rephrase).toHaveAttribute('aria-disabled', 'true') // the selection is gone

  // It is saved.
  await page.reload()
  await expect(bodyBox).toContainText('Fake option 2 of round 2, in my words.')
})

test('rephrases the title once the draft is long enough, and records the option used', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await registerUser(page)
  await page.goto('/account/ai')
  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-title-key-5678')
  await page.getByRole('button', { name: 'Save key' }).first().click()
  await expect(page.getByLabel('Anthropic API key')).toHaveAttribute('placeholder', /\.\.\.5678$/)
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers bend')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  const titleField = page.getByLabel('Title', { exact: true })
  await titleField.fill('Why rivers bend')
  const bodyBox = page.getByRole('textbox', { name: 'Draft body' })
  await bodyBox.click()
  await page.keyboard.type('The river bends because the outside bank erodes faster.')

  // Too little written: the button waits and says what to do.
  const rephraseTitle = page.getByRole('button', { name: 'Rephrase title' })
  await expect(rephraseTitle).toBeDisabled()
  await expect(
    page.getByText('Write at least 300 words first. Options for a title come from'),
  ).toBeVisible()

  // Enough written (typing 300 words one key at a time is slow, so paste them in).
  const words = Array.from({ length: 310 }, (_, i) => `word${i}`).join(' ')
  await bodyBox.evaluate((el, text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  }, words)
  await expect(rephraseTitle).toBeEnabled()
  await rephraseTitle.click()

  const dialog = page.getByRole('dialog', { name: 'Rephrase the title' })
  await expect(dialog.getByLabel('Current wording')).toHaveValue('Why rivers bend')
  await dialog.getByLabel('What should it do?').fill('Curious, and promising an answer')
  await dialog.getByRole('button', { name: 'Generate options' }).click()
  const list = dialog.getByRole('list', { name: 'Options' })
  await expect(list.getByRole('listitem')).toHaveCount(8)
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the title window').toEqual([])
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await list
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /Replace the wording/ })
    .click()
  await dialog.getByRole('button', { name: 'Use this' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(titleField).toHaveValue('Fake option 1 of round 1.')
  await expect(rephraseTitle).toBeFocused()

  // The title is saved.
  await page.reload()
  await expect(titleField).toHaveValue('Fake option 1 of round 1.')
})

test('closing the Rephrase window with Escape changes nothing and returns to the button', async ({
  page,
}) => {
  await registerUser(page)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers bend')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  const bodyBox = page.getByRole('textbox', { name: 'Draft body' })
  await bodyBox.click()
  await page.keyboard.type('The river bends because the outside bank erodes faster.')
  await bodyBox.getByText('The river bends').click({ clickCount: 3 })
  const rephrase = page.getByRole('button', { name: 'Rephrase', exact: true })
  await rephrase.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(rephrase).toBeFocused()
  await expect(bodyBox).toContainText('The river bends because the outside bank erodes faster.')
})

test('formats a draft with the toolbar, adds a link in a dialog, and edits it as Markdown', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1500, height: 900 }) // wide enough for every button, with Comment and Rephrase
  await registerUser(page)
  await openFirstPublication(page)
  await createIdea(page, 'Formatting')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Formatting')
  const bodyBox = page.getByRole('textbox', { name: 'Draft body', exact: true })
  await bodyBox.click()
  await page.keyboard.type('A heading')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Some words to link and to make bold.')

  // The toolbar is one tab stop, named buttons with the arrow keys along it.
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' })
  await expect(toolbar).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the toolbar').toEqual([])
  await page.getByRole('button', { name: 'Paragraph' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Heading 2' })).toBeFocused()

  // The heading control.
  await bodyBox.getByText('A heading').click()
  await page.getByRole('button', { name: 'Heading 2' }).click()
  await expect(bodyBox.getByRole('heading', { level: 2, name: 'A heading' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Bold, by the button.
  await bodyBox.getByText('Some words').click({ clickCount: 3 })
  await page.getByRole('button', { name: 'Bold' }).click()
  await expect(bodyBox.locator('strong')).toHaveText('Some words to link and to make bold.')

  // A link, from a dialog that takes the focus and gives it back.
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a link' })
  await expect(dialog.getByLabel('Link address')).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the link dialog').toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await dialog.getByLabel('Link address').fill('example.com/words')
  await dialog.getByRole('button', { name: 'Add link' }).click()
  await expect(bodyBox.locator('a')).toHaveAttribute('href', 'https://example.com/words')

  // Markdown: the same words, plain, and back; the toggle is remembered in this browser.
  await page.getByRole('button', { name: 'Edit as Markdown' }).click()
  const source = page.getByRole('textbox', { name: 'Draft body, as Markdown' })
  await expect(source).toBeFocused()
  await expect(source).toHaveValue(
    /^## A heading\n\n\[\*\*Some words to link and to make bold\.\*\*\]/,
  )
  await expect(page.getByRole('button', { name: 'Bold' })).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the Markdown box').toEqual([])
  await source.press('End')
  await source.press('Control+End')
  await page.keyboard.type('\n\nAdded as Markdown.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await page.getByRole('tab', { name: /^Comments/ }).click()
  await expect(
    page.getByText('Comments are hidden while you edit Markdown. Switch back to see them.'),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Draft body, as Markdown' })).toHaveValue(
    /Added as Markdown\./,
  )
  await page.getByRole('button', { name: 'Edit as Markdown' }).click()
  await expect(bodyBox.getByRole('heading', { level: 2, name: 'A heading' })).toBeVisible()
  await expect(bodyBox).toContainText('Added as Markdown.')

  // Dark mode, and a phone: the buttons that do not fit move into a More menu, with no sideways scroll.
  await page.emulateMedia({ colorScheme: 'dark' })
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the toolbar in dark').toEqual([])
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 390, height: 800 })
  const more = page.getByRole('button', { name: 'More formatting' })
  await expect(more).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await more.click()
  await expect(
    page
      .getByRole('group', { name: 'More formatting' })
      .getByRole('button', { name: 'Link', exact: true }),
  ).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the More menu').toEqual([])
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
})
