import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, goTo, test, createIdea } from './fixtures'

// The side menu follows you: home, then a publication's three steps, then an idea's four. See docs/design.md.

async function signUpWithIdea(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Nia')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`nia-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Garden notes')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await createIdea(page, 'What pruning teaches', 'A cut is a question.')
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()
  await goTo(page, 'Notes')
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

const next = (page: Page, label: RegExp) =>
  page.getByRole('navigation', { name: 'Next step' }).getByRole('link', { name: label })

test('leads through a publication and an idea step by step, without ever locking one', async ({
  page,
}) => {
  await signUpWithIdea(page)

  // In an idea: five steps, in order, the current one marked, each always available.
  const idea = page.getByRole('navigation', { name: 'Idea' })
  await expect(idea.getByRole('listitem')).toHaveCount(5) // the five steps; settings is the gear by the name
  await expect(idea.getByRole('link', { name: 'Notes', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(
    page.getByRole('banner').getByText('What pruning teaches').filter({ visible: true }).first(),
  ).toBeVisible()

  // Every step is reachable from every other (nothing is gated), and each ends with a gentle "next".
  await goTo(page, 'Research')
  await expect(page.getByRole('heading', { level: 1, name: 'Research' })).toBeVisible()
  await noViolations(page, 'Research step')
  await next(page, /Next: 02 Read/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  await noViolations(page, 'Read step')
  await next(page, /Next: 03 Notes/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  await noViolations(page, 'Notes step')
  await next(page, /Next: 04 Refine/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Refine' })).toBeVisible()
  await page.getByRole('button', { name: 'Refine with your AI' }).waitFor() // visiting spends nothing
  await noViolations(page, 'Refine step')
  await next(page, /Next: 05 Draft/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Draft' })).toBeVisible()
  await noViolations(page, 'Draft step, no drafts yet')

  // Start a draft; the menu stays with the idea on the drafting page, with Draft current.
  await page.getByRole('button', { name: 'New draft' }).click()
  await expect(page.getByRole('link', { name: '← All drafts' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Idea' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Idea' }).getByRole('link', { name: 'Draft' }),
  ).toHaveAttribute('aria-current', 'page')
  await page.getByLabel('Title', { exact: true }).fill('A cut is a question')
  const body = page.getByRole('textbox', { name: 'Draft body' })
  await body.click()
  await body.pressSequentially('Take out a third.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')

  // Publishing is done to this draft, at the bottom of its page: copy it as Markdown, title first.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copy as Markdown' }).click()
  await expect(page.getByText(/Copied\. Paste it where you publish/)).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '# A cut is a question\n\nTake out a third.\n',
  )
  await noViolations(page, 'Draft page with its publish section')
  // The old Publish address leads to the idea's drafts.
  const draftsHref = await page.getByRole('link', { name: '← All drafts' }).getAttribute('href')
  await page.goto(draftsHref!.replace(/\/drafts$/, '/publish'))
  await expect(page.getByRole('heading', { level: 1, name: 'Draft' })).toBeVisible()
  await expect(page).toHaveURL(/\/drafts$/)
  await expect(idea.getByRole('link', { name: 'Publish' })).toHaveCount(0)

  // Idea settings are apart from the steps: no step is current there.
  await page.getByRole('banner').getByRole('link', { name: 'Idea settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Idea settings' })).toBeVisible()
  await noViolations(page, 'Idea settings')

  // Up a level: the publication's own page, then its steps.
  await page.getByRole('link', { name: '← Garden notes' }).click()
  const publication = page.getByRole('navigation', { name: 'Publication' })
  await expect(page.getByRole('heading', { level: 1, name: 'Garden notes' })).toBeVisible()
  // The ideas are listed on the publication's own page, not behind a step.
  await expect(publication.getByRole('link', { name: /Ideas/ })).toHaveCount(0)
  await expect(
    page
      .getByRole('region', { name: 'Ideas', exact: true })
      .getByRole('link', { name: /What pruning teaches/ }),
  ).toBeVisible()
  await goTo(page, 'Search')
  await noViolations(page, 'Search step')
  await next(page, /Next: 02 Read/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  await noViolations(page, 'Read step')
  await next(page, /Next: 03 Notes/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  await noViolations(page, 'Publication notes step')

  // Home: the publications, with the account's settings button by the person's name (not a link in the list).
  await page.getByRole('link', { name: '← All publications' }).click()
  const main = page.getByRole('navigation', { name: 'Main' })
  await expect(main.getByRole('link', { name: 'Publications' })).toBeVisible()
  await expect(main.getByRole('link', { name: 'Account settings' })).toHaveCount(0)
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Account settings' }),
  ).toBeVisible()

  // Opening a publication lands on its own page, which is none of the steps.
  await page.getByRole('link', { name: /Garden notes/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Garden notes' })).toBeVisible()
  await expect(publication.locator('[aria-current="page"]')).toHaveCount(0)
  await noViolations(page, 'Publication landing page')

  // A note can be jotted down there, and shows at once, and on the Notes step too.
  await page.getByRole('tab', { name: 'Add a note' }).click()
  await page.getByLabel('Note', { exact: true }).fill('Prune in late winter.')
  await page.getByRole('button', { name: 'Add note' }).click()
  const recent = page.getByRole('list', { name: 'Recent notes' })
  await expect(recent.getByText('Prune in late winter.')).toBeVisible()
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('')
  await page
    .getByRole('region', { name: 'Notes' })
    .getByRole('link', { name: /See all notes/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  await expect(page.getByText('Prune in late winter.')).toBeVisible()

  // Its ideas are listed, and lead on.
  await page.goBack()
  await page
    .locator('#main')
    .getByRole('link', { name: /What pruning teaches/ })
    .click()

  // An idea opens on its own page too, which is none of the steps either.
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Idea' }).locator('[aria-current="page"]'),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeDisabled() // visiting spends nothing
  await noViolations(page, 'Idea landing page')
  // The AI box is always offered, and with no conversation the Refine panel invites one; neither starts by itself.
  await expect(page.getByLabel('What areas do you want to research?')).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Refine' })
      .getByRole('button', { name: 'Refine with your AI' }),
  ).toBeVisible()
  // The reading list is its own step, summarised on the landing page; the research box is always there.
  await page.getByRole('link', { name: 'See the reading list' }).click()
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await expect(page.getByRole('link', { name: /^Fake title for / })).toBeVisible()
  await page.getByRole('banner').getByRole('link', { name: 'What pruning teaches' }).click()
  await expect(page.getByRole('list', { name: 'To read' })).toBeVisible()
  await expect(page.getByLabel('What areas do you want to research?')).toBeVisible()
  await noViolations(page, 'Idea landing page with reading')

  // A note can be jotted down there, then a draft started and opened.
  await page.getByRole('tab', { name: 'Add a note' }).click()
  await page.getByLabel('Note', { exact: true }).fill('Cut above a bud.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(
    page.getByRole('list', { name: 'Recent notes' }).getByText('Cut above a bud.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'New draft' }).click()
  await expect(page.getByRole('link', { name: '← All drafts' })).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole('list', { name: 'Drafts' }).getByRole('link', { name: /Untitled/ }),
  ).toBeVisible()
})

test('looks right, and has no accessibility violations, in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await signUpWithIdea(page)
  await page.getByRole('link', { name: '← Garden notes' }).click()
  await page
    .locator('#main')
    .getByRole('link', { name: /What pruning teaches/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()
  await noViolations(page, 'Idea landing page in dark mode')
  for (const step of ['Research', 'Notes', 'Refine', 'Draft']) {
    await goTo(page, step)
    await expect(page.getByRole('heading', { level: 1, name: step })).toBeVisible()
    await noViolations(page, `${step} step in dark mode`)
  }
  // The system is dark here; choosing Light (on the account page) overrides it, is remembered, and System hands control back.
  await page.getByRole('banner').getByRole('link', { name: 'Account settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Account settings' })
    .getByRole('link', { name: 'Display' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Display' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Display' })).toBeVisible()
  await noViolations(page, 'Account settings in dark mode')
  await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()
  await page.getByRole('radio', { name: 'Light mode' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('radio', { name: 'Light mode' })).toBeChecked()
  await page.getByRole('radio', { name: 'System' }).check()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
})

test('on a phone the menu folds behind a button, and says where you are while closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithIdea(page)
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('navigation', { name: 'Idea' })).toBeHidden()
  await expect(page.getByRole('banner')).toContainText('What pruning teaches')
  await expect(page.getByRole('banner')).toContainText('03 Notes')
  await menuButton.click()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  await noViolations(page, 'phone menu open')
  // The idea's settings button sits by its name in the open menu, big enough to tap.
  const gear = page.getByRole('banner').getByRole('link', { name: 'Idea settings' })
  await expect(gear).toBeVisible()
  const box = await gear.boundingBox()
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44)
  await page.getByRole('navigation', { name: 'Idea' }).getByRole('link', { name: 'Draft' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Draft' })).toBeVisible()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false') // closed by moving on
  // Nothing scrolls sideways, on a step or on the idea's landing page.
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await fits()).toBe(true)
  await menuButton.click()
  await page.getByRole('link', { name: '← Garden notes' }).click()
  await page
    .locator('#main')
    .getByRole('link', { name: /What pruning teaches/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()
  expect(await fits()).toBe(true)
  await noViolations(page, 'idea landing page on a phone')
})

test('an icon-only button says what it does on keyboard focus, inside the viewport, and Escape puts it away', async ({
  page,
}) => {
  const viewport = { width: 390, height: 800 }
  await page.setViewportSize(viewport)
  await signUpWithIdea(page)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  // Tab from the idea's name onto its settings gear, at the menu's right edge where a clipping parent would cut it.
  await page.getByRole('banner').getByRole('link', { name: 'What pruning teaches' }).focus()
  await page.keyboard.press('Tab')
  const gear = page.getByRole('banner').getByRole('link', { name: 'Idea settings' })
  await expect(gear).toBeFocused()
  const tip = page.locator('[data-tip]')
  await expect(tip).toHaveText('Idea settings')
  const box = (await tip.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  await noViolations(page, 'tooltip showing')
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await expect(gear).toBeFocused()
  // Hovering shows it again, and it is gone after the pointer leaves.
  await gear.hover()
  await expect(tip).toHaveText('Idea settings')
  await page.mouse.move(5, 700)
  await expect(tip).toHaveCount(0)
})

test('the menu folds away at every width while reading a source, so two windows fit side by side', async ({
  page,
}) => {
  await signUpWithIdea(page)
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await page.getByRole('link', { name: /^Fake title for / }).click()
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menuButton).toBeVisible() // on a laptop, where it is otherwise hidden
  await expect(page.getByRole('navigation', { name: 'Idea' })).toBeHidden()
  await menuButton.click()
  await expect(
    page.getByRole('navigation', { name: 'Idea' }).getByRole('link', { name: 'Read' }),
  ).toHaveAttribute('aria-current', 'page')
  await noViolations(page, 'reading page with the menu open')
})

test('on a phone the menu is a drawer over the page: the page stays put, the scrim and Escape close it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUpWithIdea(page)
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  const heading = page.getByRole('heading', { level: 1 })
  const before = await heading.boundingBox()
  await menuButton.click()
  const drawer = page.getByRole('dialog', { name: 'Menu' })
  await expect(drawer).toBeVisible()
  await expect.poll(async () => (await drawer.boundingBox())!.x).toBe(0) // once it has slid in
  expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(256)
  expect(await heading.boundingBox()).toEqual(before) // the page did not move
  await expect(drawer.getByRole('navigation', { name: 'Idea' })).toBeVisible()
  await noViolations(page, 'drawer open')

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await page.mouse.click(370, 400) // on the scrim, right of the drawer
  await expect(drawer).toBeHidden()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
})

test('on a page read beside another window the menu is a drawer at laptop width too', async ({
  page,
}) => {
  await signUpWithIdea(page)
  await goTo(page, 'Read')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await page.getByRole('link', { name: /^Fake title for / }).click()
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  await menuButton.click()
  const drawer = page.getByRole('dialog', { name: 'Menu' })
  await expect(drawer).toBeVisible()
  expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(256)
  await noViolations(page, 'drawer open on a compact page')
  await drawer.getByRole('link', { name: 'Notes', exact: true }).click()
  await expect(drawer).toBeHidden()
})
