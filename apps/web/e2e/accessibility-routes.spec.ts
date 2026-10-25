import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, startDraft, startIdea, test } from './fixtures'

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
  '/help/accessibility',
  '/help/waiting-for-approval',
  '/help/nothing-here',
]

test('every page for someone who is signed out passes axe, in both themes and on a phone', async ({
  page,
}) => {
  test.setTimeout(240_000)
  for (const path of SIGNED_OUT) await auditEverywhere(page, path)
})

test('every page for someone who is signed in passes axe, in both themes and on a phone', async ({
  page,
}) => {
  test.setTimeout(480_000)
  await startIdea(page)
  const [, , publicationId, , ideaId] = new URL(page.url()).pathname.split('/')
  await startDraft(page)
  const draftId = new URL(page.url()).pathname.split('/').pop()
  const pub = `/p/${publicationId}`
  const idea = `${pub}/ideas/${ideaId}`

  const paths = [
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
    pub,
    `${pub}/scan`,
    `${pub}/read`,
    `${pub}/notes`,
    `${pub}/settings/details`,
    `${pub}/settings/description`,
    `${pub}/settings/feeds`,
    `${pub}/settings/sharing`,
    `${pub}/settings/download`,
    `${pub}/settings/delete`,
    idea,
    `${idea}/research`,
    `${idea}/read`,
    `${idea}/notes`,
    `${idea}/refine`,
    `${idea}/drafts`,
    `${idea}/settings`,
    `${pub}/drafts/${draftId}`,
  ]
  for (const path of paths) await auditEverywhere(page, path)
})
