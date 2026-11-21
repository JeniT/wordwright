import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { createPublication, expect, signUp, test } from './fixtures'

// The accessibility review (#319): every route is checked against WCAG 2.2 AA with axe, in light and dark and at phone
// width, and must not scroll sideways at 320px (the width of 400% zoom). Redirect-only routes are covered by the pages
// they land on. Routes that need an article or a review to exist are checked in the specs that make one.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

async function audit(page: Page, what: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    what,
  ).toEqual([])
}

async function auditEverywhere(page: Page, path: string) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(path)
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  await audit(page, `${path}, light`)

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.waitForTimeout(400) // let colour transitions finish before axe measures contrast
  await audit(page, `${path}, dark`)

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await audit(page, `${path}, ${width}px`)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, `${path}: no sideways scroll at ${width}px`).toBe(false)
  }
}

const SIGNED_OUT = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/confirm-email-change',
  '/undo-email-change',
  '/decline-invite',
  '/accept-invite',
  '/review-invite',
  '/help',
  '/help/api-key',
  '/help/privacy',
  '/help/ai-settings',
  '/help/tutorial-mode',
  '/help/description',
  '/help/feeds',
  '/help/formatting',
  '/help/drafting',
  '/help/account',
  '/help/privacy-notice',
  '/help/terms',
  '/help/cookies',
  '/help/accessibility',
  '/help/waiting-for-approval',
  '/help/nothing-here',
]

// One test per page, so the pages are checked side by side rather than one after another in a single long test.
for (const path of SIGNED_OUT) {
  test(`every page for someone who is signed out passes axe, in both themes and on a phone: ${path}`, async ({
    page,
  }) => {
    await auditEverywhere(page, path)
  })
}

// `:publication`, `:idea` and `:draft` are filled in from what each test makes.
const SIGNED_IN = [
  '/',
  '/waiting',
  '/reviews',
  '/reviews/start',
  '/account/details',
  '/account/ai',
  '/account/display',
  '/account/security',
  '/account/download',
  '/account/delete',
  '/publications/new',
  '/p/:publication',
  '/p/:publication/scan',
  '/p/:publication/read',
  '/p/:publication/notes',
  '/p/:publication/settings/details',
  '/p/:publication/settings/description',
  '/p/:publication/settings/feeds',
  '/p/:publication/settings/sharing',
  '/p/:publication/settings/download',
  '/p/:publication/settings/delete',
  '/p/:publication/ideas/:idea',
  '/p/:publication/ideas/:idea/research',
  '/p/:publication/ideas/:idea/read',
  '/p/:publication/ideas/:idea/notes',
  '/p/:publication/ideas/:idea/refine',
  '/p/:publication/ideas/:idea/drafts',
  '/p/:publication/ideas/:idea/settings',
  '/p/:publication/drafts/:draft',
]

/** Every signed-in page is checked with the same things to show: a publication with an idea, a note and a draft. */
async function signUpWithADraft(page: Page) {
  await signUp(page, 'Ida')
  const publication = await createPublication(page, 'Weekly letters')
  const made = async (path: string, data: object) => {
    const res = await page.request.post(`/api/publications/${publication}${path}`, { data })
    expect(res.ok(), await res.text()).toBe(true)
    return ((await res.json()) as { id: string }).id
  }
  const idea = await made('/ideas', {
    name: 'Why rivers meander',
    notes: 'Erosion on the outside of each bend.',
  })
  const draft = await made(`/ideas/${idea}/drafts`, {})
  return { publication, idea, draft }
}

for (const route of SIGNED_IN) {
  test(`every page for someone who is signed in passes axe, in both themes and on a phone: ${route}`, async ({
    page,
  }) => {
    const ids = await signUpWithADraft(page)
    await auditEverywhere(
      page,
      route.replace(/:(publication|idea|draft)/g, (_, key: keyof typeof ids) => ids[key]),
    )
  })
}
