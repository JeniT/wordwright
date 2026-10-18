import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Home once there is a publication: Quick add, then Pick up (#192).

async function signUpWithPublication(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Hana')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`hana-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Garden notes')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Quick add' })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

test('adds an idea, a note and something to read from Home, then continues a draft', async ({
  page,
}) => {
  await signUpWithPublication(page)
  // Nothing to pick up yet, so no section for it.
  await expect(page.getByRole('heading', { name: 'Pick up' })).toHaveCount(0)
  // New idea is the tab showing first.
  await expect(page.getByRole('tab', { name: 'New idea' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: 'Add a note' }).click()
  await page.getByRole('textbox', { name: 'Note' }).fill('Prune in late winter.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Added to Garden notes’s notes.')).toBeVisible()

  await page.getByRole('tab', { name: 'Add to reading list' }).click()
  await page.getByLabel('Web address').fill('https://example.com/pruning')
  await page.getByRole('button', { name: 'Add to reading list' }).click()
  await expect(page.getByText('Added to Garden notes’s reading list.')).toBeVisible()

  // The note and the item are in the publication's own lists.
  await page.getByRole('link', { name: 'Open the reading list' }).click()
  await expect(
    page.getByRole('link', { name: /^example\.com Fake title for example\.com/ }),
  ).toHaveAttribute('href', 'https://example.com/pruning')

  await page.goto('/')
  await page.getByLabel('Idea name').fill('What pruning teaches')
  await page.getByRole('button', { name: 'Create idea' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'What pruning teaches' })).toBeVisible()

  await page.getByRole('button', { name: 'Start a draft' }).click()
  await page.goto('/')
  const pickUp = page.getByRole('region', { name: 'Pick up' })
  await expect(pickUp).toContainText('What pruning teaches · Garden notes')
  await pickUp.getByRole('link', { name: /Continue/ }).click()
  await expect(page).toHaveURL(/\/drafts\//)
})

test('is usable by keyboard and has no accessibility problems, in light, dark and on a phone', async ({
  page,
}) => {
  await signUpWithPublication(page)
  // Arrow keys move between the tabs and show each one's form.
  await page.getByRole('tab', { name: 'New idea' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Add a note' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused()

  await page.getByRole('tab', { name: 'Add a note' }).click()
  await noViolations(page, 'home, light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page, 'home, dark')
  await page.setViewportSize({ width: 390, height: 800 })
  await noViolations(page, 'home, phone')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow, 'no sideways scroll at 390px').toBe(false)
})

test('role chips on shared publications are accessible in light, dark and on a phone (#228)', async ({
  page,
}) => {
  await signUpWithPublication(page)
  // Sharing is covered end to end in drafts.spec.ts; here only the look is under test.
  const [mine] = (await (await page.request.get('/api/publications')).json()) as Record<
    string,
    unknown
  >[]
  const person = (userId: string, role: string) => ({
    userId,
    name: userId,
    handle: `${userId}user`,
    role,
  })
  const shared = [
    { ...mine, members: [person('a', 'owner'), person('b', 'member')] },
    {
      ...mine,
      id: 'theirs',
      name: 'Their long publication name',
      role: 'member',
      members: [person('c', 'owner'), person('a', 'member')],
    },
  ]
  await page.route('**/api/publications', (route) => route.fulfill({ json: shared }))
  await page.goto('/')
  await expect(page.getByText('Owner')).toBeVisible()
  await expect(page.getByText('Member')).toBeVisible()
  await noViolations(page, 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page, 'dark')
  await page.setViewportSize({ width: 390, height: 800 })
  await noViolations(page, 'phone')
})
