import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const PASSWORD = 'a perfectly good password'

// A real 1x1 PNG, so the browser actually decodes what we upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function registerUser(page: Page, name: string) {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
}

/** A different name each time, because handles are shared between parallel tests. */
const uniqueName = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`

const noViolations = async (page: Page) =>
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

test('creates a profile with a website and picture, and opens its page', async ({ page }) => {
  const person = uniqueName('Pat')
  await registerUser(page, person)
  const handle = person.toLowerCase()

  await page.getByRole('link', { name: 'New profile' }).click()
  await expect(page.getByRole('heading', { name: 'New profile' })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('My Substack')
  // The shareable address is previewed as you type.
  await expect(page.getByText(`/p/${handle}-my-substack`)).toBeVisible()
  await page.getByLabel(/Website/).fill('pat.substack.com')
  await page
    .getByLabel(/Picture/)
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await noViolations(page)
  await page.getByRole('button', { name: 'Create profile' }).click()

  // Lands on the profile page at its readable address.
  await expect(page).toHaveURL(new RegExp(`/p/${handle}-my-substack$`))
  await expect(page.getByRole('heading', { level: 1, name: 'My Substack' })).toBeVisible()
  const site = page.getByRole('link', { name: /pat\.substack\.com/ })
  await expect(site).toHaveAttribute('href', 'https://pat.substack.com')
  const image = page.getByRole('main').locator('img')
  await expect(image).toBeVisible()
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await noViolations(page)

  // And it appears on the list.
  await page.getByRole('link', { name: 'Long-form Writing Assistant' }).click()
  const card = page.getByRole('main').getByRole('link', { name: /My Substack/ })
  await expect(card).toContainText('pat.substack.com')
  await expect(card.locator('img')).toBeVisible()
})

test('edits details, changes and removes the picture, and deletes the profile', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Quinn'))
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Draft venue')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Draft venue' })).toBeVisible()
  await expect(page.getByRole('main').locator('img')).toHaveCount(0) // monogram placeholder

  await page.getByRole('link', { name: 'Settings' }).click()
  await noViolations(page)
  await page.getByLabel('Name', { exact: true }).fill('Final venue')
  await page.getByLabel('Website').fill('not a url')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a web address')
  await page.getByLabel('Website').fill('final.example.com')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await expect(page.getByLabel('Website')).toHaveValue('https://final.example.com')

  // A non-image is refused with a reason; a real one is accepted.
  await page.getByLabel('Choose a picture').setInputFiles({
    name: 'notes.txt',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toContainText('not a PNG, JPEG, WebP or GIF')
  await page
    .getByLabel('Choose a picture')
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('main').locator('img')).toBeVisible()
  await page.getByRole('button', { name: 'Remove picture' }).click()
  await expect(page.getByRole('main').locator('img')).toHaveCount(0)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete this profile' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: /Final venue/ })).toHaveCount(0)
})

test('two people can each have a profile called "Substack", with different addresses', async ({
  page,
  browser,
}) => {
  const ada = uniqueName('Ada')
  const bob = uniqueName('Bob')
  await registerUser(page, ada)
  const bobPage = await (await browser.newContext()).newPage()
  await registerUser(bobPage, bob)

  for (const [p, who] of [
    [page, ada],
    [bobPage, bob],
  ] as const) {
    await p.getByRole('link', { name: 'New profile' }).click()
    await p.getByLabel('Name', { exact: true }).fill('Substack')
    await p.getByRole('button', { name: 'Create profile' }).click()
    await expect(p).toHaveURL(new RegExp(`/p/${who.toLowerCase()}-substack$`))
  }

  // One person's profile address doesn't open for the other.
  await bobPage.goto(`/p/${ada.toLowerCase()}-substack`)
  await expect(bobPage.getByRole('alert')).toContainText("couldn't find that profile")
  await noViolations(bobPage)
})

test('profile pages for a signed-in user have no detectable accessibility violations', async ({
  page,
}) => {
  await registerUser(page, uniqueName('Sam'))
  await noViolations(page) // the list
  await page
    .getByRole('main')
    .getByRole('link', { name: /writing/ })
    .click()
  await expect(page.getByRole('heading', { name: 'Drafts' })).toBeVisible()
  await noViolations(page) // the profile page
})
