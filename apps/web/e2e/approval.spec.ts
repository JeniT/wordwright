import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APPROVAL_ADMIN_EMAIL, approvalOutbox } from '../playwright.config'
import { expect, test, watchForProblems } from './fixtures'

// The private alpha (#328): a new account waits, the owner approves it, and then it gets in. These run against a
// second pair of servers where approval is required (see playwright.config.ts).

const PASSWORD = 'a perfectly good password'
const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

type Mail = { to: string; subject: string; text: string }

async function waitForEmail(to: string, subject: string): Promise<Mail> {
  let found: Mail | undefined
  await expect
    .poll(
      () => {
        const files = existsSync(approvalOutbox) ? readdirSync(approvalOutbox).sort() : []
        found = files
          .map((f) => JSON.parse(readFileSync(join(approvalOutbox, f), 'utf8')) as Mail)
          .filter((e) => e.to === to && e.subject === subject)
          .at(-1)
        return found !== undefined
      },
      { message: `an email "${subject}" to ${to}` },
    )
    .toBe(true)
  return found!
}

async function signUp(page: Page, name: string, email: string) {
  const id = Math.random().toString(36).slice(2, 10)
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill(name)
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
}

test('sign up, wait, get approved by the owner, and get in', async ({ page, browser }) => {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const email = `bea-${id}@example.com`

  // The new person sees the waiting page, whatever they ask for.
  await signUp(page, 'Bea Newcomer', email)
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting for approval' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await page.goto('/p/anything')
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting for approval' })).toBeVisible()
  await noViolations(page, 'waiting page')
  await page.getByRole('link', { name: 'Why is there a wait?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting for approval' })).toBeVisible()
  await page.goBack()

  // The owner: confirms the address from the email, then opens the accounts.
  const ownerContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const ownerProblems = watchForProblems(owner)
  await signUp(owner, 'Olive Owner', APPROVAL_ADMIN_EMAIL)
  const confirm = (
    await waitForEmail(APPROVAL_ADMIN_EMAIL, 'Confirm your email address')
  ).text.match(/https?:\/\/\S+\/verify-email\?token=[\w-]+/)![0]
  await owner.goto(confirm)
  await expect(owner.getByText('Thanks, your email address is confirmed.')).toBeVisible()
  await owner.goto('/admin')
  await expect(owner.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible()
  const waiting = owner.getByRole('list', { name: 'Accounts waiting for approval' })
  const card = waiting.getByRole('listitem').filter({ hasText: email })
  await expect(card).toBeVisible()
  await noViolations(owner, 'admin page')
  await card.getByRole('button', { name: 'Approve Bea Newcomer' }).click()
  await expect(waiting.getByText(email)).toHaveCount(0)

  // They are told, and they are in.
  const mail = await waitForEmail(email, 'You’re in')
  expect(mail.text).toContain('/login')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toHaveCount(0)
  await expect(
    page
      .getByRole('navigation', { name: 'Publications' })
      .or(page.getByRole('banner').getByRole('link', { name: 'Account settings' }))
      .first(),
  ).toBeVisible()

  // Nothing of the admin area for them.
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0)
  expect(ownerProblems).toEqual([])
  await ownerContext.close()
})

test('the waiting page fits a phone and offers a way out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUp(page, 'Cy Phone', `cy-${Date.now().toString(36)}@example.com`)
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting for approval' })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'no sideways scrolling',
  ).toBe(true)
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
})
