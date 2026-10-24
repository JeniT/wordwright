import AxeBuilder from '@axe-core/playwright'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { e2eOutbox } from '../playwright.config'
import {
  expect,
  goTo,
  holdToConfirm,
  createIdea,
  openSettingsPage,
  test,
  watchForProblems,
} from './fixtures'

const PASSWORD = 'a perfectly good password'

/** Usernames are unique across the whole database, and tests run in parallel. */
const uniqueUsername = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Fills in the sign-up form (without submitting). Returns the email used. */
async function fillSignUp(page: Page, name: string, username = uniqueUsername()) {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  return email
}

/** From the landing page, creates a publication named "<name>'s writing" and opens it. */
async function createFirstPublication(page: Page, name: string) {
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill(`${name}'s writing`)
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
}

/**
 * Each test registers its own user, so tests are independent and can run in parallel. Most tests
 * are about what happens after set-up, so this also creates a first publication, "<name>'s writing".
 */
async function registerUser(page: Page, name = 'Ada Lovelace', { withPublication = true } = {}) {
  await page.goto('/register')
  const email = await fillSignUp(page, name)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  if (withPublication) await createFirstPublication(page, name)
  return email
}

/** From the publication list, opens the first publication ("<name>'s writing"). */
async function openFirstPublication(page: Page) {
  // Scoped to the publications list: Home's Keep writing rows also have "writing" in their link names, once loaded.
  await page
    .getByRole('region', { name: 'Your publications' })
    .getByRole('link', { name: /writing/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
}

/** One of the first publication's settings pages: Sharing, where it is shared, unless another is named. */
async function openSettings(page: Page, name = 'Sharing') {
  await page.getByRole('link', { name: 'Wordwright' }).click()
  await openFirstPublication(page)
  await page.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await openSettingsPage(page, name)
}

type Mail = { to: string; subject: string; text: string }

/** Reads the "inbox": waits for an email to `to` with this subject, as the file mailer wrote it. */
async function waitForEmail(to: string, subject: string): Promise<Mail> {
  let found: Mail | undefined
  await expect
    .poll(
      () => {
        const files = existsSync(e2eOutbox) ? readdirSync(e2eOutbox).sort() : []
        const emails = files.map(
          (f) => JSON.parse(readFileSync(join(e2eOutbox, f), 'utf8')) as Mail,
        )
        found = emails.filter((e) => e.to === to && e.subject === subject).at(-1)
        return found !== undefined
      },
      { message: `an email "${subject}" to ${to}` },
    )
    .toBe(true)
  return found!
}

const linkIn = (mail: Mail, path: string) =>
  mail.text.match(new RegExp(`https?://\\S+${path}\\?token=[\\w-]+`))?.[0]

/** Follows the confirmation link from the signup email, then returns to the app. */
async function confirmEmail(page: Page, email: string) {
  const link = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')
  expect(link, 'confirmation link in the email').toBeTruthy()
  await page.goto(link!)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()
  await page.getByRole('link', { name: 'Continue writing' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
}

test('redirects signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

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

  // No key yet: we're pointed at account settings rather than silently failing.
  await page.getByRole('button', { name: 'Critique' }).click()
  await expect(page.getByRole('alert')).toContainText('Your AI needs your key first.')
  await page.getByRole('alert').getByRole('link', { name: 'Add your AI key' }).click()

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
  await page.getByRole('button', { name: 'Open panel' }).click()
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

test('sign out and back in, and the session survives a reload', async ({ page }) => {
  const email = await registerUser(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('the wrong password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
})

test('recovers a forgotten password from the emailed link', async ({ page }) => {
  const email = await registerUser(page)
  await page.getByRole('button', { name: 'Sign out' }).click()

  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText("If there's an account")

  const link = linkIn(await waitForEmail(email, 'Reset your password'), '/reset-password')
  expect(link, 'reset link in the email').toBeTruthy()

  await page.goto(link!)
  await page.getByLabel('New password').fill('my brand new password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Your password has been changed')).toBeVisible()

  // The old password is dead; the new one works; the link can't be reused.
  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Password').fill('my brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.goto(link!)
  await page.getByLabel('New password').fill('yet another password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert')).toContainText('invalid or has expired')
})

test('changes the email address once the new one is confirmed', async ({ page }) => {
  const oldEmail = await registerUser(page)
  const newEmail = `changed-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your details' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
  await page.getByLabel('New email address').fill(newEmail)
  await page.getByLabel('Password', { exact: true }).fill('the wrong password')
  await page.getByRole('button', { name: 'Send confirmation link' }).click()
  await expect(page.getByRole('alert')).toContainText('password is incorrect')

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Send confirmation link' }).click()
  await expect(page.getByRole('status').filter({ hasText: newEmail })).toBeVisible()

  // Nothing has changed until the link is opened.
  await expect(page.getByLabel('New email address')).toHaveAttribute('placeholder', oldEmail)
  const link = linkIn(
    await waitForEmail(newEmail, 'Confirm your new email address'),
    '/confirm-email-change',
  )
  expect(link, 'confirmation link in the email').toBeTruthy()
  await page.goto(link!)
  await expect(page.getByText('your email address has been changed')).toBeVisible()
  await page.getByRole('link', { name: 'Back to your account' }).click()
  await expect(page.getByLabel('New email address')).toHaveAttribute('placeholder', newEmail)
  await waitForEmail(oldEmail, 'Your email address was changed')

  // The new address signs in; the old one no longer does.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.goto('/login')
  await page.getByLabel('Email').fill(oldEmail)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Email').fill(newEmail)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
})

test('"this wasn\'t me" puts the old address back and forces a new password', async ({ page }) => {
  const oldEmail = await registerUser(page)
  const newEmail = `intruder-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your details' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
  await page.getByLabel('New email address').fill(newEmail)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Send confirmation link' }).click()
  const confirm = linkIn(
    await waitForEmail(newEmail, 'Confirm your new email address'),
    '/confirm-email-change',
  )!
  await page.goto(confirm)
  await expect(page.getByText('your email address has been changed')).toBeVisible()

  // The owner, from the notice at the old address.
  const undo = linkIn(
    await waitForEmail(oldEmail, 'Your email address was changed'),
    '/undo-email-change',
  )!
  await page.goto(undo)
  await page.getByRole('button', { name: "Yes, this wasn't me" }).click()
  await expect(page.getByRole('status')).toContainText('old email address is back')

  const reset = linkIn(await waitForEmail(oldEmail, 'Reset your password'), '/reset-password')!
  await page.goto(reset)
  await page.getByLabel('New password').fill('my brand new password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Your password has been changed')).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Email').fill(oldEmail)
  await page.getByLabel('Password').fill('my brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
})

test('confirms an email address from the signup email', async ({ page }) => {
  const email = await registerUser(page)
  const banner = page.getByRole('region', { name: 'Email confirmation' })
  await expect(banner).toContainText(email)

  // Until they confirm, sharing is explained rather than offered.
  await openSettings(page)
  await expect(page.getByText('Confirm your email address to invite people')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)

  const link = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')!
  await page.goto(link)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()
  await expect(banner).toHaveCount(0)

  // Opening the link again (a mail scanner, a double click) is harmless.
  await page.goto(link)
  await expect(page.getByText('your email address is confirmed')).toBeVisible()

  await page.getByRole('link', { name: 'Continue writing' }).click()
  await openSettings(page)
  await expect(page.getByRole('button', { name: 'Send invitation' })).toBeVisible()
})

test('resends the confirmation email, and only the newest link works', async ({ page }) => {
  const email = await registerUser(page)
  const first = linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email')!
  await page.getByRole('button', { name: 'Resend' }).click()
  await expect(page.getByText('Sent. Check your inbox.')).toBeVisible()

  await expect
    .poll(async () =>
      linkIn(await waitForEmail(email, 'Confirm your email address'), '/verify-email'),
    )
    .not.toBe(first)
  await page.goto(first)
  await expect(page.getByRole('alert')).toContainText('invalid or has expired')
})

/** Ada (signed in, confirmed) invites `email` from her account page, and we read the email they get. */
async function invite(page: Page, email: string, inviter = 'Ada') {
  await openSettings(page)
  await page.getByLabel('Email address').first().fill(email)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible()
  const mail = await waitForEmail(email, `${inviter} invited you to write together`)
  const link = linkIn(mail, '/accept-invite')
  expect(link, 'invitation link in the email').toBeTruthy()
  return link!
}

test('invites someone who has no account yet: they register from the email and join', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const newbieEmail = `newbie-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const link = await invite(page, newbieEmail)
  await expect(page.getByText('Waiting for a reply')).toBeVisible()
  await expect(page.getByText(newbieEmail).first()).toBeVisible()

  // The invitee has no account and opens the link in their own browser.
  const newbie = await (await browser.newContext()).newPage()
  const newbieProblems = watchForProblems(newbie)
  await newbie.goto(link)
  await expect(newbie.getByText('has invited you to write together')).toBeVisible()
  expect(
    (await new AxeBuilder({ page: newbie }).analyze()).violations,
    'accessibility of invitation page',
  ).toEqual([])
  await newbie.getByRole('link', { name: 'Create an account' }).click()
  await expect(newbie.getByLabel('Email')).toHaveValue(newbieEmail) // prefilled from the invitation
  await newbie.getByLabel('What should we call you?').fill('Newbie')
  await newbie.getByLabel('Username').fill(uniqueUsername())
  await newbie.getByLabel('Password').fill(PASSWORD)
  await newbie.getByRole('button', { name: 'Create account' }).click()

  // Registering from the invitation page joins them at once: there is no button to press.
  await expect(newbie.getByRole('button', { name: /^Join / })).toHaveCount(0)
  await expect(newbie.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  // Accepting proved they own the address, so there is no "please confirm" banner.
  await expect(newbie.getByRole('region', { name: 'Email confirmation' })).toHaveCount(0)
  await expect(newbie.getByRole('banner').getByText('Shared with')).toHaveCount(0)

  // Ada now sees them as a member, and the invitation is no longer pending.
  await page.reload()
  const people = page.getByRole('list', { name: 'People' })
  await expect(people.getByText('member')).toBeVisible()
  await expect(people).not.toContainText(newbieEmail)
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  // On Home each of them sees their own role beside the sharing line (#228).
  await newbie.goto('/')
  // They joined rather than started a publication, so the only step left is the AI key.
  await expect(newbie.getByRole('heading', { name: 'Create your first publication' })).toHaveCount(
    0,
  )
  await expect(newbie.getByLabel('Anthropic API key')).toBeVisible()
  await expect(newbie.getByRole('link', { name: /Shared with 1 person/ })).toContainText('Member')
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Shared with 1 person/ })).toContainText('Owner')
  expect(newbieProblems, "Newbie's browser problems").toEqual([])
})

/** Invites a new person from `page` and has them register and join in their own browser; returns their page. */
async function joinFrom(
  page: Page,
  browser: Browser,
  name: string,
  email = `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
) {
  const link = await invite(page, email)
  const them = await (await browser.newContext()).newPage()
  await them.goto(link)
  await them.getByRole('link', { name: 'Create an account' }).click()
  await them.getByLabel('What should we call you?').fill(name)
  await them.getByLabel('Username').fill(uniqueUsername())
  await them.getByLabel('Password').fill(PASSWORD)
  await them.getByRole('button', { name: 'Create account' }).click()
  await expect(them.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  return them
}

test('an owner makes a member an owner, then steps down; the last owner cannot', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)
  await openSettings(page)

  // Ada is the only owner, so she can't step down, and is told why.
  await expect(page.getByRole('button', { name: 'Step down as owner' })).toBeDisabled()
  await expect(page.getByText('Make someone else an owner first')).toBeVisible()

  // Making Bob an owner asks first, saying what changes.
  await page.getByRole('button', { name: 'Make owner Bob' }).click()
  const dialog = page.getByRole('dialog', { name: /^Make Bob an owner of / })
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Make Bob an owner' }).click()
  await expect(page.getByText('Bob is now an owner.')).toBeVisible()

  // Bob can now change the publication's details.
  await bob.reload()
  await bob.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await expect(bob.getByRole('button', { name: 'Save details' })).toBeVisible()

  // Ada steps down and loses the owner-only parts of the page.
  await page.getByRole('button', { name: 'Step down as owner' }).click()
  const stepDown = page.getByRole('dialog', { name: /^Step down as owner of / })
  await expect(stepDown).toContainText('Only another owner can give them back')
  await stepDown.getByRole('button', { name: 'Step down as owner' }).click()
  await expect(page.getByText('You are no longer an owner.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
  // A member has no Details page: nothing on it is theirs to change.
  await expect(
    page
      .getByRole('navigation', { name: 'Publication settings' })
      .getByRole('link', { name: 'Details' }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('navigation', { name: 'Publication settings' })
      .getByRole('link', { name: 'Delete publication' }),
  ).toHaveCount(0)

  // Bob is now the only owner.
  await bob.reload()
  await openSettingsPage(bob, 'Sharing')
  await expect(bob.getByRole('button', { name: 'Step down as owner' })).toBeDisabled()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('removing a member and leaving a publication each ask first, saying what happens', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await joinFrom(page, browser, 'Bob')
  const cara = await joinFrom(page, browser, 'Cara')
  const caraProblems = watchForProblems(cara)
  await openSettings(page)

  // Cancelling leaves Bob in place.
  await page.getByRole('button', { name: 'Remove Bob' }).click()
  const dialog = page.getByRole('dialog', { name: /^Remove Bob from / })
  await expect(dialog).toContainText('longest-standing owner')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Remove Bob' })).toBeVisible()

  // Confirming removes him.
  await page.getByRole('button', { name: 'Remove Bob' }).click()
  await dialog.getByRole('button', { name: 'Remove Bob' }).click()
  await expect(page.getByRole('button', { name: 'Remove Bob' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove Cara' })).toBeVisible()

  // Cara leaves from her own page, after being told she needs a new invitation to come back.
  await cara.reload()
  await cara.getByRole('banner').getByRole('link', { name: 'Publication settings' }).click()
  await openSettingsPage(cara, 'Sharing')
  await cara.getByRole('button', { name: 'Leave', exact: true }).click()
  const leaving = cara.getByRole('dialog', { name: /^Leave / })
  await expect(leaving).toContainText('only if an owner invites you again')
  await leaving.getByRole('button', { name: 'Leave', exact: true }).click()
  await expect(cara.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  expect(caraProblems, "Cara's browser problems").toEqual([])
})

test('the only owner of a shared publication cannot delete their account until another owner is chosen', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await joinFrom(page, browser, 'Bob')
  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Delete account' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Delete account' })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).and(page.locator('input')).fill(PASSWORD)
  await page.getByRole('button', { name: 'Delete account' }).click()
  await page
    .getByRole('dialog', { name: 'Delete your account?' })
    .getByRole('button', { name: 'Delete account' })
    .click()
  await expect(page.getByRole('alert')).toContainText('Make someone else an owner first')
})

test('only a draft’s editor can change it: another member sees it read-only', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()

  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)

  // Bob can read the draft, with the editor named, but not change it.
  await bob.goto(draftUrl)
  const banner = bob.getByTestId('read-only')
  await expect(banner).toContainText('Ada')
  await expect(banner).toContainText('is this draft’s editor')
  await expect(bob.getByText('Rivers rarely flow straight.', { exact: true })).toBeVisible()
  await expect(bob.getByLabel('Title', { exact: true })).toHaveAttribute('readonly', '')
  await expect(bob.getByRole('button', { name: 'Critique' })).toHaveCount(0)
  await expect(bob.getByRole('textbox', { name: 'Draft body' })).toHaveAttribute(
    'contenteditable',
    'false',
  )
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // Bob can comment, and sees only his own. Ada, the editor, sees it with his name on it and resolves it.
  const bobSide = bob.getByRole('complementary')
  await bobSide.getByRole('tab', { name: /^Comments/ }).click()
  await expect(bobSide.getByText(/You haven’t commented yet/)).toBeVisible()
  // He has no toolbar: he selects the words, and presses Add comment above the text.
  await bob
    .getByRole('textbox', { name: 'Draft body' })
    .getByText('Rivers rarely')
    .click({ clickCount: 3 })
  await bob.getByRole('button', { name: 'Add comment' }).first().click()
  await expect(bobSide.getByRole('heading', { name: 'Comment on paragraph 1' })).toBeVisible()
  await bobSide.getByLabel('Your comment').fill('Lovely first line.')
  await bobSide.getByRole('button', { name: 'Add comment' }).click()
  await expect(bobSide.getByLabel('Your comment')).toHaveCount(0) // the new card is the confirmation
  await expect(bobSide.getByRole('listitem')).toHaveCount(1)
  await expect(bob.getByRole('button', { name: 'Comment 1', exact: true })).toBeVisible()
  expect((await new AxeBuilder({ page: bob }).analyze()).violations, 'Bob’s comment').toEqual([])

  // The Add comment button at the top of the tab starts a general comment when the caret is not in the text. Its
  // author can reword it (it then says edited) and delete it for good.
  await bobSide.getByRole('button', { name: 'Add comment' }).click()
  await bobSide.getByLabel('Your comment').fill('A second thought.')
  await bobSide.getByRole('button', { name: 'Add comment' }).click()
  const second = bobSide.getByRole('listitem').nth(1)
  await second.getByRole('button', { name: /^Edit comment/ }).click()
  await second.getByLabel('Your comment').fill('A better second thought.')
  await second.getByRole('button', { name: 'Save' }).click()
  await expect(second).toContainText('A better second thought.')
  await expect(second).toContainText('edited')
  expect((await new AxeBuilder({ page: bob }).analyze()).violations, 'an edited comment').toEqual(
    [],
  )
  await second.getByRole('button', { name: /^Delete comment/ }).dblclick()
  await expect(bobSide.getByText('A better second thought.')).toHaveCount(0)
  await expect(bobSide.getByRole('listitem')).toHaveCount(1)

  await page.goto(draftUrl)
  const adaSide = page.getByRole('complementary')
  await adaSide.getByRole('tab', { name: /^Comments/ }).click()
  const bobsComment = adaSide.getByRole('listitem').filter({ hasText: 'Lovely first line.' })
  await expect(bobsComment).toContainText('Bob')
  await adaSide.getByRole('switch', { name: 'Resolved: comment 1' }).click()
  await expect(adaSide.getByText('Lovely first line.')).toHaveCount(0)
  await bob.reload()
  await bob
    .getByRole('complementary')
    .getByRole('tab', { name: /^Comments/ })
    .click()
  await expect(bob.getByText('Lovely first line.')).toHaveCount(0)

  // The editor's changes reach Bob when he reloads.
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('They bend instead.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  await bob.reload()
  await expect(
    bob.getByRole('textbox', { name: 'Draft body' }).getByText('They bend instead.'),
  ).toBeVisible()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('the editor comments from the toolbar on selected words, which are underlined in the text', async ({
  page,
}) => {
  await registerUser(page)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers bend')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  const bodyBox = page.getByRole('textbox', { name: 'Draft body' })
  await bodyBox.click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('They bend instead, over centuries.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // The old form is gone; Comment and Rephrase sit together in the toolbar.
  await expect(page.getByRole('button', { name: 'Add a comment' })).toHaveCount(0)
  const toolbar = page.getByRole('toolbar', { name: 'Formatting' })
  await expect(toolbar.getByRole('button', { name: 'Comment' })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Rephrase' })).toBeVisible()

  // Select two words in the second paragraph (a double click, then Shift+Right to take another word).
  await bodyBox.getByText('They bend instead').dblclick({ position: { x: 10, y: 8 } })
  await toolbar.getByRole('button', { name: 'Comment' }).click()
  const side = page.getByRole('complementary')
  await expect(side.getByRole('heading', { name: 'Comment on paragraph 2' })).toBeVisible()
  await expect(side.getByLabel('Your comment')).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'the composer').toEqual([])
  await side.getByLabel('Your comment').fill('Say why.')
  await side.getByRole('button', { name: 'Add comment' }).click()
  await expect(side.getByLabel('Your comment')).toHaveCount(0)
  await expect(side.getByText('Say why.')).toBeVisible()
  await expect(bodyBox.locator('.comment-quote')).toHaveText('They')

  // A general comment: select the title, then Comment. There is no switch.
  await page.getByLabel('Title').focus()
  await toolbar.getByRole('button', { name: 'Comment' }).click()
  await expect(side.getByRole('heading', { name: 'General comment' })).toBeVisible()
  await expect(side.getByRole('switch', { name: 'General comment' })).toHaveCount(0)
  await side.getByRole('button', { name: 'Cancel' }).click()
  await expect(side.getByLabel('Your comment')).toHaveCount(0)
})

test('the editor offers a draft; the member declines once and accepts the next time', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()
  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)

  const offer = async () => {
    await page.goto(draftUrl)
    await page.getByRole('button', { name: 'Handover draft', exact: true }).click()
    await page.getByLabel('Member', { exact: true }).selectOption({ label: 'Bob' })
    await page.getByRole('dialog').getByRole('button', { name: 'Handover draft' }).click()
    await expect(page.getByText('You stay its editor until they accept')).toBeVisible()
  }

  // Ada offers, then takes it back from the notice, then offers again; she keeps the pen throughout.
  await offer()
  await page.getByRole('button', { name: 'Withdraw the offer' }).click()
  await expect(page.getByRole('button', { name: 'Handover draft', exact: true })).toBeVisible()
  await offer()
  // Bob is told on the draft page and declines.
  await expect(page.getByRole('button', { name: 'Critique' })).toBeVisible()
  await bob.goto(draftUrl)
  const offered = bob.getByTestId('offered-to-me')
  await expect(offered).toContainText('Ada has offered you this draft')
  await offered.getByRole('button', { name: 'Decline' }).click()
  await expect(bob.getByTestId('offered-to-me')).toHaveCount(0)
  // Asking is confirmed first, and a request can be withdrawn from its notice.
  await bob.getByRole('button', { name: 'Ask for this draft' }).click()
  await bob.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toHaveCount(0)
  await bob.getByRole('button', { name: 'Ask for this draft' }).click()
  await bob.getByRole('dialog').getByRole('button', { name: 'Ask for this draft' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toBeVisible()
  await bob.getByRole('button', { name: 'Withdraw my request' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toHaveCount(0)
  await bob.getByRole('button', { name: 'Ask for this draft' }).click()
  await bob.getByRole('dialog').getByRole('button', { name: 'Ask for this draft' }).click()
  await expect(bob.getByText('You have asked Ada for this draft')).toBeVisible()

  // Ada sees the request, offers again, and this time Bob accepts: the pen moves.
  await page.goto(draftUrl)
  await expect(page.getByText('Bob asked for this draft')).toBeVisible()
  await page.getByRole('button', { name: 'Handover draft to Bob' }).click()
  await bob.reload()
  await bob.getByTestId('offered-to-me').getByRole('button', { name: 'Accept' }).click()
  await expect(bob.getByRole('button', { name: 'Critique' })).toBeVisible()
  await expect(bob.getByTestId('read-only')).toHaveCount(0)
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  await page.reload()
  await expect(page.getByTestId('read-only')).toContainText('Bob')
  await expect(page.getByRole('button', { name: 'Critique' })).toHaveCount(0)
  await page.getByRole('button', { name: /Handover history/ }).click()
  await expect(page.getByText(/Ada offered the draft to Bob: accepted/)).toBeVisible()
  await expect(page.getByText(/Ada offered the draft to Bob: declined/)).toBeVisible()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('a member asked to review reads the draft with the full menu, and goes back to Home’s reviews', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobEmail = `bob-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const bob = await joinFrom(page, browser, 'Bob', bobEmail)
  const bobProblems = watchForProblems(bob)

  await page.goto('/')
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await page.getByRole('button', { name: /^Send for review/ }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: /Bob/ }).check()
  await page.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Bob, a member, finds it on Home and opens it: no "Start writing", and the side menu stays.
  await bob.goto('/')
  await bob
    .getByRole('region', { name: 'Drafts to review' })
    .getByRole('link', { name: 'Meanders' })
    .click()
  await expect(bob.getByText('Rivers rarely flow straight.', { exact: true })).toBeVisible()
  await expect(bob.getByRole('link', { name: 'Start writing' })).toHaveCount(0)
  await expect(bob.getByRole('navigation').first()).toBeVisible()
  await bob.getByRole('button', { name: 'Add comment' }).click()
  const dialog = bob.getByRole('dialog', { name: 'Add comment' })
  await dialog.getByLabel('Your comment').fill('Which rivers?')
  await dialog.getByRole('button', { name: 'Add comment' }).click()
  await expect(
    bob.getByRole('tabpanel', { name: 'Comments' }).getByText('Which rivers?'),
  ).toBeVisible()
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // Back goes to Home, at the reviews; /reviews does the same.
  await bob.getByRole('link', { name: '← Back to Home' }).click()
  await expect(bob).toHaveURL(/\/#to-review-heading$/)
  await expect(bob.getByRole('heading', { name: 'Drafts to review' })).toBeInViewport()
  await bob.goto('/reviews')
  await expect(bob).toHaveURL(/\/#to-review-heading$/)
  await expect(
    bob
      .getByRole('heading', { name: 'Drafts to review' })
      .locator('..')
      .getByRole('link', { name: 'Meanders' }),
  ).toBeVisible()
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('the editor sends a snapshot for review; the reviewer comments and ends; the editor sees it and closes', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()

  // Ada sends it for review; the dialog says reviewers read a snapshot.
  const reviewerEmail = `rae-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.getByRole('tab', { name: /^Reviews/ }).click() // Send for review is at the top of this tab
  await page.getByRole('button', { name: /^Send for review/ }).click()
  await expect(page.getByTestId('snapshot-notice')).toContainText('snapshot')
  await page.getByLabel('Email addresses').fill(reviewerEmail)
  await page.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  // The dialog closes and the Reviews tab beside the draft shows who was asked.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /^Reviews/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText(`${reviewerEmail} · waiting for a reply`)).toBeVisible()
  const mail = await waitForEmail(reviewerEmail, 'Ada asked you to review a draft')
  const link = linkIn(mail, '/review-invite')
  expect(link, 'review link in the email').toBeTruthy()

  // Ada keeps writing after sending.
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Added after sending.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // Rae follows the link and makes a reviewer account with a name and password.
  const rae = await (await browser.newContext()).newPage()
  const raeProblems = watchForProblems(rae)
  await rae.goto(link!)
  await expect(rae.getByText('would like your comments on')).toBeVisible()
  expect((await new AxeBuilder({ page: rae }).analyze()).violations).toEqual([])
  await rae.getByLabel('What should we call you?').fill('Rae')
  await rae.getByLabel('Choose a password').fill(PASSWORD)
  await rae.getByRole('button', { name: 'Read the draft' }).click()

  // She lands on the draft she was asked to read, not on a list. Her whole app is her reviews.
  await expect(rae.getByRole('link', { name: 'Account' })).toHaveCount(0)
  await expect(rae.getByText('Rivers rarely flow straight.', { exact: true })).toBeVisible()
  await expect(rae.getByText('Added after sending.')).toHaveCount(0)
  await expect(rae.getByRole('textbox', { name: 'Draft body' })).toHaveAttribute(
    'contenteditable',
    'false',
  )
  await rae.getByRole('button', { name: 'Add comment' }).click()
  const raeDialog = rae.getByRole('dialog', { name: 'Add comment' })
  await expect(raeDialog.getByRole('heading', { name: 'General comment' })).toBeVisible() // nothing selected
  await raeDialog.getByLabel('Your comment').fill('Which rivers do you mean?')
  await raeDialog.getByRole('button', { name: 'Add comment' }).click()
  // Her comments sit beside the draft, in the panel.
  const raePanel = rae.getByRole('tabpanel', { name: 'Comments' })
  await expect(raePanel.getByText('Which rivers do you mean?')).toBeVisible()
  await expect(raePanel.getByText('General')).toBeVisible()
  await expect(rae.getByRole('switch', { name: 'General comment' })).toHaveCount(0)

  // With the title selected, Comment makes a general comment...
  await rae.getByLabel('Title').focus()
  await rae.getByRole('button', { name: 'Add comment' }).click()
  await expect(raeDialog.getByRole('heading', { name: 'General comment' })).toBeVisible()
  await raeDialog.getByLabel('Your comment').fill('Lovely title.')
  await raeDialog.getByRole('button', { name: 'Add comment' }).click()
  await expect(raePanel.getByText('Lovely title.')).toBeVisible()

  // ...and with words in a paragraph selected, one about that paragraph.
  await rae.getByText('Rivers rarely flow straight.', { exact: true }).dblclick()
  await rae.getByRole('button', { name: 'Add comment' }).click()
  await expect(raeDialog.getByRole('heading', { name: 'Comment on paragraph 1' })).toBeVisible()
  await raeDialog.getByLabel('Your comment').fill('Rarely?')
  await raeDialog.getByRole('button', { name: 'Add comment' }).click()
  await expect(raePanel.getByText('Rarely?')).toBeVisible()
  expect((await new AxeBuilder({ page: rae }).analyze()).violations).toEqual([])

  // Ada sees the comment as it is made, labelled with Rae's name, and how far Rae has got.
  await page.goto(draftUrl)
  await page.getByRole('tab', { name: /^Comments/ }).click()
  await expect(page.getByText('Which rivers do you mean?')).toBeVisible()
  await expect(
    page
      .getByRole('tabpanel', { name: /^Comments/ })
      .getByText('Rae', { exact: true })
      .first(),
  ).toBeVisible()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await expect(page.getByText(/Rae · Reading · 3 comments/)).toBeVisible()

  // Rae ends the review: the page stays, read-only, and Ada can see it finished.
  await raePanel.getByRole('button', { name: 'End review' }).click()
  await expect(rae.getByTestId('review-ended')).toContainText('You ended this review')
  await expect(rae.getByText('Which rivers do you mean?')).toBeVisible()
  await expect(rae.getByRole('button', { name: 'End review' })).toHaveCount(0)
  await page.reload()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await expect(page.getByText(/Rae · Finished · 3 comments/)).toBeVisible()
  const finished = await waitForEmail(adaEmail, 'Rae has finished reviewing Meanders')
  expect(finished.text).toContain('left 3 comments')

  // A second reviewer is closed out by the editor before they finish.
  const secondEmail = `sam-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.getByRole('tab', { name: /^Reviews/ }).click() // Send for review is at the top of this tab
  await page.getByRole('button', { name: /^Send for review/ }).click()
  await page.getByLabel('Email addresses').fill(secondEmail)
  await page.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  // The Reviews tab shows the latest request; the first is a page back, and can be named.
  const reviewsTab = page.getByRole('tabpanel', { name: /^Reviews/ })
  await reviewsTab.getByRole('button', { name: 'Previous review' }).click()
  await expect(reviewsTab.getByText(/Rae · Finished/)).toBeVisible()
  await reviewsTab.getByRole('button', { name: 'Rename review' }).click()
  await reviewsTab.getByLabel('Review name').fill('First round')
  await reviewsTab.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(reviewsTab.getByRole('heading', { name: 'First round' })).toBeVisible()
  await reviewsTab.getByRole('button', { name: 'Next review' }).click()
  const second = linkIn(
    await waitForEmail(secondEmail, 'Ada asked you to review a draft'),
    '/review-invite',
  )
  const sam = await (await browser.newContext()).newPage()
  await sam.goto(second!)
  await sam.getByLabel('What should we call you?').fill('Sam')
  await sam.getByLabel('Choose a password').fill(PASSWORD)
  await sam.getByRole('button', { name: 'Read the draft' }).click()
  // Sending again made a new copy, so Sam's includes what Ada added after Rae's was sent.
  await expect(sam.getByText('Added after sending.', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: /^Reviews/ }).click()
  await page.getByRole('button', { name: 'Close these reviews' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close these reviews' }).click()
  await sam.reload()
  await expect(sam.getByTestId('review-ended')).toContainText('closed')
  await expect(sam.getByRole('button', { name: 'Add comment' })).toHaveCount(0)

  // Rae chooses to start writing: a full account, sent to the home page.
  await rae.getByRole('link', { name: '← All your reviews' }).click()
  await rae.getByRole('banner').getByRole('link', { name: 'Start writing' }).click()
  await rae.getByLabel('Username').fill(uniqueUsername())
  await rae.getByRole('button', { name: 'Start writing' }).click()
  await expect(rae.getByRole('link', { name: 'Account' }).first()).toBeVisible()
  expect(raeProblems, "Rae's browser problems").toEqual([])
})

test('the publication’s landing page says what is waiting: an offer, a wait, and finished reviews', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  await openFirstPublication(page)
  const publicationUrl = page.url()
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing
  const draftUrl = page.url()
  const bob = await joinFrom(page, browser, 'Bob')
  const bobProblems = watchForProblems(bob)

  // Nothing is waiting yet.
  await bob.goto(publicationUrl)
  await expect(bob.getByRole('heading', { level: 1, name: /writing$/ })).toBeVisible()
  await expect(bob.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)

  // Ada offers the draft to Bob: she is told she is waiting, he is told it was offered.
  await page.goto(draftUrl)
  await page.getByRole('button', { name: 'Handover draft', exact: true }).click()
  await page.getByLabel('Member', { exact: true }).selectOption({ label: 'Bob' })
  await page.getByRole('dialog').getByRole('button', { name: 'Handover draft' }).click()
  await expect(page.getByText('You stay its editor until they accept')).toBeVisible()
  await page.goto(publicationUrl)
  await expect(page.getByRole('region', { name: 'Waiting for you' })).toContainText(
    'Waiting for Bob to answer your offer of Meanders',
  )
  await bob.goto(publicationUrl)
  const offered = bob.getByRole('region', { name: 'Waiting for you' })
  await expect(offered).toContainText('Ada has offered you the draft Meanders')
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // Ada withdraws from the landing page, and then offers again; Bob accepts there too.
  await page.getByRole('button', { name: 'Withdraw the offer of Meanders' }).click()
  await expect(page.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)
  await bob.reload()
  await expect(bob.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)
  await page.goto(draftUrl)
  await page.getByRole('button', { name: 'Handover draft', exact: true }).click()
  await page.getByLabel('Member', { exact: true }).selectOption({ label: 'Bob' })
  await page.getByRole('dialog').getByRole('button', { name: 'Handover draft' }).click()
  await expect(page.getByText('You stay its editor until they accept')).toBeVisible()
  await bob.reload()
  await bob.getByRole('button', { name: 'Accept Meanders' }).click()
  await expect(bob.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0)

  // Bob, now the editor, sends it for review; the reviewer finishes with a comment.
  const reviewerEmail = `rae-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await bob.goto(draftUrl)
  await bob.getByRole('tab', { name: /^Reviews/ }).click()
  await bob.getByRole('button', { name: /^Send for review/ }).click()
  await bob.getByLabel('Email addresses').fill(reviewerEmail)
  await bob.getByRole('dialog').getByRole('button', { name: 'Send for review' }).click()
  await expect(bob.getByRole('tab', { name: /^Reviews/ })).toHaveAttribute('aria-selected', 'true')
  const link = linkIn(
    await waitForEmail(reviewerEmail, 'Bob asked you to review a draft'),
    '/review-invite',
  )
  const rae = await (await browser.newContext()).newPage()
  await rae.goto(link!)
  await rae.getByLabel('What should we call you?').fill('Rae')
  await rae.getByLabel('Choose a password').fill(PASSWORD)
  await rae.getByRole('button', { name: 'Read the draft' }).click()
  await rae.getByRole('button', { name: 'Add comment' }).click()
  await rae.getByRole('dialog').getByLabel('Your comment').fill('Which rivers?')
  await rae.getByRole('dialog').getByRole('button', { name: 'Add comment' }).click()
  await expect(rae.getByText('Which rivers?')).toBeVisible()

  // While Rae is reading, Bob's landing page lists the draft under Keep writing; once she ends, it says she is done.
  await bob.goto(publicationUrl)
  const keepWriting = bob.getByRole('region', { name: 'Keep writing' })
  await expect(keepWriting).toContainText('0 of 1 reviews complete · 1 unresolved comment')
  await rae.getByRole('button', { name: 'End review' }).first().click()
  await expect(rae.getByTestId('review-ended')).toBeVisible()
  await bob.reload()
  await expect(keepWriting).toContainText('1 of 1 reviews complete · 1 unresolved comment')
  expect((await new AxeBuilder({ page: bob }).analyze()).violations).toEqual([])

  // The draft page says the same per request; resolving the comment clears what is left to answer.
  await bob.goto(draftUrl)
  await bob.getByRole('tab', { name: /^Reviews/ }).click()
  await expect(bob.getByTestId('review-summary')).toContainText(
    '1 of 1 reviews complete · 1 comment',
  )
  await bob.getByRole('tab', { name: /^Comments/ }).click()
  await bob
    .getByRole('switch', { name: /Resolved/ })
    .first()
    .click()
  await bob.goto(publicationUrl)
  await expect(bob.getByRole('region', { name: 'Keep writing' })).toContainText(
    '1 of 1 reviews complete · No unresolved comments',
  )
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('declining and blocking an inviter from the email, then lifting the block', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobEmail = `bob-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await invite(page, bobEmail)
  await expect(page.getByText('Waiting for a reply')).toBeVisible()

  // Bob has no account. He declines from the email and stops invitations from Ada.
  const bob = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bob)
  const declineLink = linkIn(
    await waitForEmail(bobEmail, 'Ada invited you to write together'),
    '/decline-invite',
  )!
  expect(declineLink, 'decline link in the email').toBeTruthy()
  await bob.goto(declineLink)
  await expect(bob.getByText("They won't be told that you declined")).toBeVisible()
  expect(
    (await new AxeBuilder({ page: bob }).analyze()).violations,
    'accessibility of decline page',
  ).toEqual([])
  await bob.getByLabel('Also stop invitations from Ada').check()
  await bob.getByRole('button', { name: 'Decline' }).click()
  await expect(bob.getByRole('status')).toContainText('from this person again')

  // Ada isn't told; the invitation just stops waiting, and a second attempt quietly does nothing.
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)
  await page.getByLabel('Email address').first().fill(bobEmail)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await expect(page.getByText(`Invitation sent to ${bobEmail}`)).toBeVisible()
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  // Bob signs up later with that address, confirms it, and sees the block on his account page.
  await bob.goto('/register')
  await bob.getByLabel('What should we call you?').fill('Bob')
  await bob.getByLabel('Username').fill(uniqueUsername())
  await bob.getByLabel('Email').fill(bobEmail)
  await bob.getByLabel('Password').fill(PASSWORD)
  await bob.getByRole('button', { name: 'Create account' }).click()
  await expect(bob.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  await bob.goto(
    linkIn(await waitForEmail(bobEmail, 'Confirm your email address'), '/verify-email')!,
  )
  await expect(bob.getByText('your email address is confirmed')).toBeVisible()
  await bob.goto('/account/security')
  await expect(bob.getByText('Ada', { exact: true })).toBeVisible()
  expect(
    (await new AxeBuilder({ page: bob }).analyze()).violations,
    'accessibility of account page',
  ).toEqual([])
  await bob.getByRole('button', { name: 'Unblock Ada' }).click()
  await expect(bob.getByText('No one blocked')).toBeVisible()
  expect(bobProblems).toEqual([])

  // With the block lifted, Ada's invitation goes through again.
  await page.getByLabel('Email address').first().fill(bobEmail)
  await page.getByRole('button', { name: 'Send invitation' }).first().click()
  await page.reload()
  await expect(page.getByText('Waiting for a reply')).toBeVisible()
})

test('invites someone who already has an account; the link only works for that address', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobPage = await (await browser.newContext()).newPage()
  const malloryPage = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bobPage)
  const bobEmail = await registerUser(bobPage, 'Bob')
  await registerUser(malloryPage, 'Mallory')

  const link = await invite(page, bobEmail)

  // Someone signed in as a different person is told so, and can't join.
  await malloryPage.goto(link)
  await expect(malloryPage.getByRole('alert')).toContainText(`sent to ${bobEmail}`)
  await expect(malloryPage.getByRole('button', { name: /^Join / })).toHaveCount(0)

  await bobPage.goto(link)
  await bobPage.getByRole('button', { name: /^Join / }).click()
  await expect(bobPage.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await expect(bobPage.getByRole('banner').getByText('Shared with')).toHaveCount(0)
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('an invited person with a confirmed address sees the invitation on Home and joins from there', async ({
  page,
  browser,
}) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const bobPage = await (await browser.newContext()).newPage()
  const bobProblems = watchForProblems(bobPage)
  const bobEmail = await registerUser(bobPage, 'Bob')
  await confirmEmail(bobPage, bobEmail)

  await invite(page, bobEmail)

  // Bob never opens the email: it is waiting on his Home page.
  await bobPage.goto('/')
  const panel = bobPage.getByRole('region', { name: 'Invitations' })
  await expect(panel).toContainText('Ada invited you to write together')
  expect((await new AxeBuilder({ page: bobPage }).analyze()).violations).toEqual([])
  await panel.getByRole('button', { name: /^Join / }).click()
  await expect(bobPage.getByRole('banner')).toContainText("Ada's writing")
  await bobPage.goto('/')
  await expect(bobPage.getByRole('region', { name: 'Invitations' })).toHaveCount(0)
  expect(bobProblems, "Bob's browser problems").toEqual([])
})

test('revoking an invitation stops its link working', async ({ page, browser }) => {
  const adaEmail = await registerUser(page, 'Ada')
  await confirmEmail(page, adaEmail)
  const email = `revoked-${Date.now()}@example.com`
  const link = await invite(page, email)
  await holdToConfirm(page, page.getByRole('button', { name: `Revoke invitation to ${email}` }))
  await expect(page.getByText('Waiting for a reply')).toHaveCount(0)

  const guest = await (await browser.newContext()).newPage()
  await guest.goto(link)
  await expect(guest.getByRole('alert')).toContainText('invalid or has expired')
})

test('unconfirmed owners are told to confirm before inviting', async ({ page }) => {
  await registerUser(page, 'Ada')
  await openSettings(page)
  await expect(page.getByText('Confirm your email address to invite people')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send invitation' })).toHaveCount(0)
})

test('changes the password: other devices are signed out, a notice is emailed', async ({
  page,
  browser,
}) => {
  const email = await registerUser(page)
  const phone = await (await browser.newContext()).newPage()
  const phoneProblems = watchForProblems(phone)
  await phone.goto('/login')
  await phone.getByLabel('Email').fill(email)
  await phone.getByLabel('Password').fill(PASSWORD)
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(phone.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Sign-in and security' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign-in and security' })).toBeVisible()
  // A wrong current password is explained and changes nothing.
  await page.getByLabel('Current password').fill('definitely not it')
  await page.getByLabel('New password').fill('my brand new password')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('alert')).toContainText('current password is incorrect')

  await page.getByLabel('Current password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('signed out your other devices')).toBeVisible()
  await waitForEmail(email, 'Your password was changed')

  // The phone's session is gone; this device stays signed in.
  await phone.reload()
  await expect(phone.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign-in and security' })).toBeVisible()

  // Old password dead, new one works.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await page.getByLabel('Password').fill('my brand new password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  expect(phoneProblems, "The phone's browser problems").toEqual([])
})

test('a new account chooses a username, connects an API key, then creates its first publication', async ({
  page,
  browser,
}) => {
  const taken = uniqueUsername()
  await registerUser(page, 'Grace', { withPublication: false })

  // Sign-up asks what to call them, and checks the username against everyone else's.
  const other = await (await browser.newContext()).newPage()
  await other.goto('/register')
  const name = other.getByLabel('What should we call you?')
  await expect(name).toHaveAttribute('autocomplete', 'given-name')
  await name.fill('Someone')
  await other.getByLabel('Username').fill('Not Valid!')
  await expect(other.getByText('Use only letters and numbers in your username')).toBeVisible()
  await other.getByLabel('Username').fill(taken)
  await expect(other.getByText(`“${taken}” is available`)).toBeVisible()
  await expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([])
  await other.getByLabel('Email').fill(`dup-${Date.now()}@example.com`)
  await other.getByLabel('Password').fill(PASSWORD)
  await other.getByRole('button', { name: 'Create account' }).click()
  await expect(other.getByRole('heading', { name: 'Your publications' })).toBeVisible()

  const third = await (await browser.newContext()).newPage()
  await third.goto('/register')
  await third.getByLabel('Username').fill(taken)
  await expect(third.getByText('That username is already taken. Try another.')).toBeVisible()
  await expect(third.getByRole('button', { name: 'Create account' })).toBeDisabled()

  // No publication was made for them. The landing page explains how to get a key, with a field for it.
  await expect(page.getByRole('heading', { name: 'Connect your AI key (Anthropic)' })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'How to get an API key (opens in a new tab)' }),
  ).toHaveAttribute('href', '/help/api-key')
  await expect(page.getByRole('link', { name: /privacy advice/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Create your first publication' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '01' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '02' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'landing page').toEqual([])

  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-onboarding-key-4321')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText(/Your Anthropic key is saved/)
  await expect(page.getByLabel('Anthropic API key')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'New publication' })).toBeVisible()

  // Then they create (and set up) their first publication; the checklist is gone when they come back.
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Grace letters')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(
    page.getByRole('banner').getByText('Grace letters').filter({ visible: true }).first(),
  ).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your publications' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Get started/ })).toHaveCount(0)
})

test('first-run steps can be done in the other order', async ({ page }) => {
  await registerUser(page, 'Katherine', { withPublication: false })
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Orbits')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await page.goto('/')
  await expect(page.getByText('Create your first publication · done')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations, 'half-done').toEqual([])
  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e-order-key-4321')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText(/Your Anthropic key is saved/)
  await expect(page.getByRole('link', { name: /Orbits/ })).toBeVisible()
})

test('the sign-up form explains a problem the server finds, in words', async ({ page }) => {
  await page.goto('/register')
  await fillSignUp(page, 'Hopper')
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toHaveText('Use at least 8 characters')
  await expect(page.getByText('[object Object]')).toHaveCount(0)
})

test('downloads your writing as a zip from the account page and from a publication', async ({
  page,
}) => {
  await registerUser(page, 'Ada')
  await openFirstPublication(page)
  await createIdea(page, 'Why rivers meander')
  await goTo(page, 'Draft')
  await page.getByRole('button', { name: 'New draft' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Meanders')
  await page.getByRole('textbox', { name: 'Draft body' }).click()
  await page.keyboard.type('Rivers rarely flow straight.')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible() // saves itself a moment after typing

  /** The zip's file names sit uncompressed in its directory, so they can be read without unpacking it. */
  const downloaded = async (page: Page, trigger: () => Promise<void>) => {
    const [download] = await Promise.all([page.waitForEvent('download'), trigger()])
    const path = await download.path()
    const names = readFileSync(path).toString('latin1')
    return { name: download.suggestedFilename(), names }
  }

  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Download your writing' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Download your writing' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Download your writing' })).toBeVisible()
  const account = await downloaded(page, () =>
    page.getByRole('button', { name: 'Download as a zip' }).click(),
  )
  expect(account.name).toMatch(/^wordwright-export-\d{4}-\d{2}-\d{2}\.zip$/)
  expect(account.names.startsWith('PK')).toBe(true)
  expect(account.names).toContain('drafts/meanders.md')
  await expect(page.getByText('Downloaded')).toBeVisible()

  await openSettings(page, 'Download')
  const publication = await downloaded(page, () =>
    page.getByRole('button', { name: 'Download as a zip' }).click(),
  )
  expect(publication.name).toMatch(/^wordwright-.+-\d{4}-\d{2}-\d{2}\.zip$/)
  expect(publication.names).toContain('ideas/why-rivers-meander.md')
})

test('deletes an account', async ({ page }) => {
  const email = await registerUser(page)
  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Delete account' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Delete account' })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).and(page.locator('input')).fill(PASSWORD)
  await expect(page.getByRole('radio', { name: /Keep my display name on my notes/ })).toBeChecked()
  await page.getByRole('radio', { name: /a former member/ }).check()
  await page.getByRole('button', { name: 'Delete account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Delete account' }).click()
  await dialog.getByRole('button', { name: 'Delete account' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
})

test('sign-in and registration pages have no detectable accessibility violations', async ({
  page,
}) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path)
    await expect(page.getByRole('heading').first()).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual([])
  }
})

test('signed-in pages have no detectable accessibility violations', async ({ page }) => {
  await registerUser(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Your AI' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your AI' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your AI key' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
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
