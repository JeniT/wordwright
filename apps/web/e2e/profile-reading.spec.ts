import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function signUpWithProfile(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Pia')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`pia-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New profile' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Gathering')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

test('reads and takes notes before there is an idea: a profile reading list and notes', async ({
  page,
}) => {
  await signUpWithProfile(page)

  // From the profile page to the profile's own reading list.
  await page.getByRole('link', { name: 'Reading list' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Reading list' })).toBeVisible()
  await expect(page.getByText('Nothing on the reading list yet.')).toBeVisible()
  await noViolations(page, 'empty profile reading list')

  const address = page.getByLabel('Web address', { exact: true })
  await address.fill('rubbish')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('Enter a web address, like https://example.com')).toBeVisible()
  await address.fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByRole('link', { name: /Fake title for example\.org/ })).toHaveAttribute(
    'href',
    'https://example.org/meanders',
  )
  await expect(address).toHaveValue('')
  await address.fill('http://www.example.org/meanders/')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('That link is already in this profile’s reading list.')).toBeVisible()
  await noViolations(page, 'profile reading list')

  // Read it, and take a note and a quotation from it.
  await page.getByRole('link', { name: 'Take notes' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: /Fake title for example\.org/ }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Back to the profile’s reading list/ })).toBeVisible()
  await page.getByLabel('Add a note from this page').fill('Rivers tire of straight lines.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Rivers tire of straight lines.')).toBeVisible()
  await page.getByLabel('Add a note from this page').fill('Erosion outside, deposition inside.')
  await page.getByRole('checkbox', { name: /direct quote/ }).check()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Erosion outside, deposition inside.')).toBeVisible()
  await noViolations(page, 'profile reading page')

  // Taking a note marks it read.
  await page.getByRole('link', { name: /Back to the profile’s reading list/ }).click()
  await expect(
    page.getByRole('checkbox', { name: /^Read: Fake title for example\.org/ }),
  ).toBeChecked()

  // The notes are the profile's own, naming where each came from, and are not on any idea.
  await page.getByRole('link', { name: /^← Gathering/ }).click()
  await page.getByRole('link', { name: 'Notes', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  const quote = page
    .getByRole('listitem')
    .filter({ hasText: 'Erosion outside, deposition inside.' })
  await expect(quote).toContainText('Quoted from “Fake title for example.org')
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Rivers tire of straight lines.' }),
  ).toContainText('From reading “Fake title for example.org')

  // Add one of their own, put it first, and it stays that way.
  await page.getByLabel('Add a note').fill('A thought of my own')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const own = page.getByRole('listitem').filter({ hasText: 'A thought of my own' })
  await expect(own).toBeVisible()
  await own.getByRole('button', { name: /Move note “A thought of my own” up/ }).click()
  await own.getByRole('button', { name: /Move note “A thought of my own” up/ }).click()
  await expect
    .poll(async () => (await page.getByRole('listitem').first().innerText()).includes('A thought'))
    .toBe(true)
  await page.reload()
  await expect(page.getByRole('listitem').first()).toContainText('A thought of my own')
  await noViolations(page, 'profile notes')
})
