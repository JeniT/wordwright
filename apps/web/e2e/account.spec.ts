import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  PASSWORD,
  confirmEmail,
  createIdea,
  expect,
  goTo,
  joinFrom,
  openFirstPublication,
  openSettings,
  registerUser,
  test,
} from './fixtures'

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
  await expect(
    page.getByRole('status').filter({ hasText: 'Your account is deleted' }),
  ).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
})
