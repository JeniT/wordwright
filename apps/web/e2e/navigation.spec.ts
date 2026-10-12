import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, goTo, test } from './fixtures'

// The side menu follows you: home, then a profile's three steps, then an idea's five. See docs/design.md.

async function signUpWithIdea(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Nia')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`nia-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Garden notes')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('link', { name: 'New idea' }).click()
  await page.getByLabel("What's your core idea?").fill('What pruning teaches')
  await page.getByLabel('Expand on your idea here').fill('A cut is a question.')
  await page.getByRole('button', { name: 'Save idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

const next = (page: Page, label: RegExp) =>
  page.getByRole('navigation', { name: 'Next step' }).getByRole('link', { name: label })

test('leads through a profile and an idea step by step, without ever locking one', async ({
  page,
}) => {
  await signUpWithIdea(page)

  // In an idea: five steps, in order, the current one marked, each always available.
  const idea = page.getByRole('navigation', { name: 'Idea' })
  await expect(idea.getByRole('listitem')).toHaveCount(5 + 1) // five steps and Idea settings
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
  await next(page, /Next: 02 Notes/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  await noViolations(page, 'Notes step')
  await next(page, /Next: 03 Refine/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Refine' })).toBeVisible()
  await page.getByRole('button', { name: 'Start brainstorming' }).waitFor() // visiting spends nothing
  await noViolations(page, 'Refine step')
  await next(page, /Next: 04 Draft/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Draft' })).toBeVisible()
  await noViolations(page, 'Draft step, no drafts yet')

  // Start a draft; the menu stays with the idea on the drafting page, with Draft current.
  await page.getByRole('button', { name: 'Add a draft' }).click()
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

  // Publish: copy the draft as Markdown, title first.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await goTo(page, 'Publish')
  await expect(page.getByRole('heading', { level: 1, name: 'Publish' })).toBeVisible()
  await page.getByRole('button', { name: 'Copy Markdown' }).click()
  await expect(page.getByText(/Copied\. Paste it where you publish/)).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '# A cut is a question\n\nTake out a third.\n',
  )
  await noViolations(page, 'Publish step')

  // Idea settings are apart from the steps: no step is current there.
  await page.getByRole('link', { name: 'Idea settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Idea settings' })).toBeVisible()
  await noViolations(page, 'Idea settings')

  // Up a level: the profile's own page, then its steps, Ideas being the choice of what to work on next.
  await page.getByRole('link', { name: '← Garden notes' }).click()
  const profile = page.getByRole('navigation', { name: 'Profile' })
  await expect(page.getByRole('heading', { level: 1, name: 'Garden notes' })).toBeVisible()
  await goTo(page, 'Ideas')
  await expect(profile.getByRole('link', { name: /^Ideas/ })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('heading', { level: 1, name: 'Ideas' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Next step' })).toHaveCount(0) // a choice, not a next
  await expect(profile.getByText('1 idea')).toBeVisible()
  await noViolations(page, 'Ideas step')
  await goTo(page, 'Search')
  await noViolations(page, 'Search step')
  await next(page, /Next: 02 Read/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  await noViolations(page, 'Read step')
  await next(page, /Next: 03 Notes/).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  await noViolations(page, 'Profile notes step')

  // Home: profiles and account settings.
  await page.getByRole('link', { name: '← All profiles' }).click()
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Account settings' }),
  ).toBeVisible()

  // Opening a profile lands on its own page, which is none of the steps.
  await page.getByRole('link', { name: /Garden notes/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Garden notes' })).toBeVisible()
  await expect(profile.locator('[aria-current="page"]')).toHaveCount(0)
  await noViolations(page, 'Profile landing page')

  // A note can be jotted down there, and shows at once, and on the Notes step too.
  await page.getByLabel('Add a note').fill('Prune in late winter.')
  await page.getByRole('button', { name: 'Add note' }).click()
  const recent = page.getByRole('list', { name: 'Recent notes' })
  await expect(recent.getByText('Prune in late winter.')).toBeVisible()
  await expect(page.getByLabel('Add a note')).toHaveValue('')
  await page.getByRole('link', { name: /See all notes/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  await expect(page.getByText('Prune in late winter.')).toBeVisible()

  // Its ideas are listed, and lead on.
  await page.goBack()
  await page.getByRole('link', { name: /What pruning teaches/ }).click()

  // An idea opens on its own page too, which is none of the steps either.
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Idea' }).locator('[aria-current="page"]'),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeDisabled() // visiting spends nothing
  await noViolations(page, 'Idea landing page')

  // A note can be jotted down there, then a draft started and opened.
  await page.getByLabel('Add a note').fill('Cut above a bud.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(
    page.getByRole('list', { name: 'Recent notes' }).getByText('Cut above a bud.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Start a draft' }).click()
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
  await page.getByRole('link', { name: /What pruning teaches/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()
  await noViolations(page, 'Idea landing page in dark mode')
  for (const step of ['Research', 'Notes', 'Refine', 'Draft', 'Publish']) {
    await goTo(page, step)
    await expect(page.getByRole('heading', { level: 1, name: step })).toBeVisible()
    await noViolations(page, `${step} step in dark mode`)
  }
  // The choice made with the button is remembered, and overrides the system.
  await page.getByRole('button', { name: 'Dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
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
  await expect(page.getByRole('banner')).toContainText('02 Notes')
  await menuButton.click()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  await noViolations(page, 'phone menu open')
  await page.getByRole('navigation', { name: 'Idea' }).getByRole('link', { name: 'Draft' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Draft' })).toBeVisible()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false') // closed by moving on
  // Nothing scrolls sideways, on a step or on the idea's landing page.
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await fits()).toBe(true)
  await menuButton.click()
  await page.getByRole('link', { name: '← Garden notes' }).click()
  await page.getByRole('link', { name: /What pruning teaches/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()
  expect(await fits()).toBe(true)
  await noViolations(page, 'idea landing page on a phone')
})

test('the menu folds away at every width while reading a source, so two windows fit side by side', async ({
  page,
}) => {
  await signUpWithIdea(page)
  await goTo(page, 'Research')
  await page.getByLabel('Web address', { exact: true }).fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add link' }).click()
  await page.getByRole('link', { name: 'Take notes' }).click()
  const menuButton = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(menuButton).toBeVisible() // on a laptop, where it is otherwise hidden
  await expect(page.getByRole('navigation', { name: 'Idea' })).toBeHidden()
  await menuButton.click()
  await expect(
    page.getByRole('navigation', { name: 'Idea' }).getByRole('link', { name: 'Research' }),
  ).toHaveAttribute('aria-current', 'page')
  await noViolations(page, 'reading page with the menu open')
})
