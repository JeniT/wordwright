import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, goTo, test } from './fixtures'

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

  // The profile's own reading list is part of Inspiration (step 01).
  await goTo(page, 'Inspiration')
  await expect(page.getByRole('heading', { level: 1, name: 'Inspiration' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Reading list' })).toBeVisible()
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
  await expect(page.getByRole('link', { name: /Back to the reading list/ })).toBeVisible()
  await page.getByLabel('Add a note from this page').fill('Rivers tire of straight lines.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Rivers tire of straight lines.')).toBeVisible()
  await page.getByLabel('Add a note from this page').fill('Erosion outside, deposition inside.')
  await page.getByRole('checkbox', { name: /direct quote/ }).check()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Erosion outside, deposition inside.')).toBeVisible()
  await noViolations(page, 'profile reading page')

  // The list has no limit, and unkept items go after a month: a tick keeps one.
  await page.getByRole('link', { name: /Back to the profile’s reading list/ }).click()
  await expect(page.getByText(/There is no limit to the list/)).toBeVisible()
  await page.getByRole('checkbox', { name: /^Show read items/ }).check() // taking notes marked it read
  const keep = page.getByRole('checkbox', { name: /^Keep: Fake title for example\.org/ })
  await expect(keep).not.toBeChecked()
  await keep.check()
  await page.reload()
  await page.getByRole('checkbox', { name: /^Show read items/ }).check()
  await expect(keep).toBeChecked()
  await page.getByRole('link', { name: 'Take notes' }).click()

  // Taking a note marks it read.
  await page.getByRole('link', { name: /Back to the reading list/ }).click()
  await expect(page.getByText('1 read item is hidden.')).toBeVisible()
  await page.getByRole('checkbox', { name: /^Show read items/ }).check()
  await expect(
    page.getByRole('checkbox', { name: /^Read: Fake title for example\.org/ }),
  ).toBeChecked()

  // The notes are the profile's own, naming where each came from, and are not on any idea.
  await goTo(page, 'Notes')
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
    .poll(async () =>
      (await page.getByRole('main').getByRole('listitem').first().innerText()).includes(
        'A thought',
      ),
    )
    .toBe(true)
  await page.reload()
  await expect(page.getByRole('main').getByRole('listitem').first()).toContainText(
    'A thought of my own',
  )
  await noViolations(page, 'profile notes')
})

test('adds recent posts from the feeds to the profile’s reading list, or ignores them', async ({
  page,
}) => {
  await signUpWithProfile(page)
  await goTo(page, 'Inspiration')
  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('read.example/feed')
  await feeds.getByRole('button', { name: 'Add source' }).click()
  await expect(
    feeds.getByRole('listitem').filter({ hasText: 'Feed of read.example' }),
  ).toBeVisible()

  // The newest posts, with a decision to make about each.
  const recent = page.getByRole('region', { name: 'Recent posts' })
  const title = 'A post in Feed of read.example'
  await expect(recent.getByRole('link', { name: new RegExp(title) })).toBeVisible()
  await noViolations(page, 'recent posts with decisions to make')
  await recent.getByRole('button', { name: `Add to the reading list: ${title}` }).click()
  await expect(recent.getByRole('img', { name: 'On a reading list' })).toBeVisible()
  await expect(recent.getByRole('button', { name: /^Add to the reading list/ })).toHaveCount(0)
  await noViolations(page, 'recent posts after adding')

  // It is on the profile's reading list, on the same page, marked as from a feed.
  const item = page
    .getByRole('region', { name: 'Reading list' })
    .getByRole('listitem')
    .filter({ hasText: title })
  await expect(item).toContainText('From a feed')

  // Reconsidering takes it off again.
  await recent.getByRole('button', { name: `Reconsider: ${title}` }).click()
  await expect(
    recent.getByRole('button', { name: `Add to the reading list: ${title}` }),
  ).toBeVisible()

  // Ignoring is remembered, and can be taken back.
  await recent.getByRole('button', { name: `Ignore: ${title}` }).click()
  await expect(recent.getByRole('img', { name: 'Ignored' })).toBeVisible()
  await page.reload()
  await expect(recent.getByRole('img', { name: 'Ignored' })).toBeVisible()
  await recent.getByRole('button', { name: `Reconsider: ${title}` }).click()
  await expect(recent.getByRole('button', { name: `Ignore: ${title}` })).toBeVisible()
})

test('a post that is added or ignored moves to the end of the recent posts', async ({ page }) => {
  await signUpWithProfile(page)
  await page.getByRole('link', { name: 'Inspiration' }).click()
  const feeds = page.getByRole('region', { name: 'Feeds' })
  for (const feed of ['one.example/feed', 'two.example/feed', 'three.example/feed']) {
    await feeds.getByLabel('Add a feed').fill(feed)
    await feeds.getByRole('button', { name: 'Add source' }).click()
    await expect(
      feeds.getByRole('listitem').filter({ hasText: `Feed of ${feed.split('/')[0]}` }),
    ).toBeVisible()
  }
  const recent = page.getByRole('region', { name: 'Recent posts' })
  const rows = recent.getByRole('listitem')
  await expect(rows).toHaveCount(3)

  // Whichever is on top is dealt with, and goes to the bottom, with the others still waiting above it.
  const first = (await rows.first().innerText()).match(/A post in Feed of (\w+)\.example/)![1]!
  await recent
    .getByRole('button', { name: new RegExp(`^Add to the reading list: .*${first}`) })
    .click()
  await expect(rows.last()).toContainText(`A post in Feed of ${first}.example`)
  await expect(rows.last()).toContainText('on a reading list')
  await expect(rows.first()).not.toContainText(first)

  // The next one ignored goes to the very end, after the one added.
  const next = (await rows.first().innerText()).match(/A post in Feed of (\w+)\.example/)![1]!
  await recent.getByRole('button', { name: new RegExp(`^Ignore: .*${next}`) }).click()
  await expect(rows.last()).toContainText(`A post in Feed of ${next}.example`)
  await expect(rows.last()).toContainText('ignored')
  await expect(rows.nth(1)).toContainText(first)
})

test('moves reading items, with their notes, between the profile and an idea, and back', async ({
  page,
}) => {
  await signUpWithProfile(page)
  await page.getByRole('link', { name: 'Reading list' }).click()
  const address = page.getByLabel('Web address', { exact: true })
  for (const url of ['example.org/rivers', 'example.com/lakes']) {
    await address.fill(url)
    await page.getByRole('button', { name: 'Add link' }).click()
    await expect(
      page.getByRole('link', { name: new RegExp(`Fake title for ${url.split('/')[0]}`) }),
    ).toBeVisible()
    await expect(address).toHaveValue('')
  }
  // A note taken from the first (which marks it read, so it is hidden until shown).
  await page.getByRole('link', { name: 'Take notes' }).first().click()
  await page.getByLabel('Add a note from this page').fill('Rivers tire of straight lines.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Rivers tire of straight lines.')).toBeVisible()
  await page.getByRole('link', { name: /Back to the profile’s reading list/ }).click()
  await page.getByRole('checkbox', { name: /^Show read items/ }).check()

  // Move both to a new idea. The note goes with its item, and the message says what moved.
  await page.getByRole('button', { name: 'Move items' }).click()
  await page.getByRole('checkbox', { name: /^Select to move: Fake title for example\.org/ }).check()
  await page.getByRole('checkbox', { name: /^Select to move: Fake title for example\.com/ }).check()
  await page.getByLabel('Move to').selectOption({ label: 'A new idea…' })
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await noViolations(page, 'choosing where to move reading items')
  await page.getByRole('button', { name: 'Move 2 items' }).click()
  await expect(page.getByText('Moved 2 items and 1 note to “Why rivers meander”.')).toBeVisible()
  await expect(page.getByText('Nothing on the reading list yet.')).toBeVisible()

  // They are on the idea, with the note.
  await page.getByRole('link', { name: /^← Gathering/ }).click()
  await page.getByRole('link', { name: /Why rivers meander/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
  await page.getByRole('checkbox', { name: /^Show read items/ }).check()
  await expect(page.getByRole('link', { name: /Fake title for example\.org/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Fake title for example\.com/ })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByText('Rivers tire of straight lines.')).toBeVisible()

  // And one goes back to the profile's own list, then back again with Undo.
  await page.getByRole('button', { name: 'Move items' }).click()
  await page.getByRole('checkbox', { name: /^Select to move: Fake title for example\.com/ }).check()
  await page.getByLabel('Move to').selectOption({ label: 'The profile’s reading list' })
  await page.getByRole('button', { name: 'Move 1 item' }).click()
  await expect(
    page.getByText('Moved 1 item to the profile’s reading list.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Fake title for example\.com/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Moved back.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Fake title for example\.com/ })).toBeVisible()
})

test('from a post in a feed to a new idea: read, take notes, then gather the notes into an idea', async ({
  page,
}) => {
  await signUpWithProfile(page)
  // A feed, and its newest post added to the reading list.
  await page.getByRole('link', { name: 'Inspiration' }).click()
  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('read.example/feed')
  await feeds.getByRole('button', { name: 'Add source' }).click()
  const recent = page.getByRole('region', { name: 'Recent posts' })
  const title = 'A post in Feed of read.example'
  await recent.getByRole('button', { name: `Add to the reading list: ${title}` }).click()
  await expect(recent.getByRole('img', { name: 'On a reading list' })).toBeVisible()

  // Read it, taking two notes, and jot one down of the writer's own.
  await page.getByRole('link', { name: 'Gathering', exact: true }).click()
  await page.getByRole('link', { name: 'Reading list' }).click()
  await page.getByRole('link', { name: 'Take notes' }).click()
  for (const text of ['The feed made me think about erosion.', 'Bends migrate downstream.']) {
    await page.getByLabel('Add a note from this page').fill(text)
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText(text)).toBeVisible()
  }
  await page.getByRole('link', { name: /Back to the profile’s reading list/ }).click()
  await page.getByRole('link', { name: /^← Gathering/ }).click()
  await page.getByRole('link', { name: 'Notes', exact: true }).click()
  await page.getByLabel('Add a note', { exact: true }).fill('An unrelated thought')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(page.getByText('An unrelated thought')).toBeVisible()

  // Choose the two notes from the post, and say plainly what will happen before doing it.
  await page.getByRole('button', { name: 'Move notes' }).click()
  await page
    .getByRole('checkbox', { name: /^Select note “The feed made me think.*to move/ })
    .check()
  await page.getByRole('checkbox', { name: /^Select note “Bends migrate.*to move/ }).check()
  await page.getByLabel('Move to').selectOption({ label: 'A new idea…' })
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await expect(page.getByText('2 notes will move to “Why rivers meander”.')).toBeVisible()
  await expect(page.getByText(/The page they were taken from will be copied/)).toBeVisible()
  await noViolations(page, 'moving notes to a new idea')
  await page.getByRole('button', { name: 'Move 2 notes' }).click()
  await expect(page.getByText(/^Moved 2 notes to “Why rivers meander”\./)).toBeVisible()
  await expect(page.getByText('An unrelated thought')).toBeVisible() // the other stays
  await expect(page.getByText('Bends migrate downstream.')).toHaveCount(0)

  // The idea has the notes, and the post they came from on its reading list (the original is still on the profile's).
  await page.getByRole('link', { name: /^← Gathering/ }).click()
  await page.getByRole('link', { name: /Why rivers meander/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByText('Bends migrate downstream.')).toBeVisible()
  await expect(
    notes.getByText(/From reading “A post in Feed of read.example”/).first(),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: /^Show read items/ }).check()
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()

  // And a note can go on to another place: back to the profile, with Undo to put it where it was.
  await page.getByRole('button', { name: 'Move notes' }).click()
  await page.getByRole('checkbox', { name: /^Select note “Bends migrate.*to move/ }).check()
  await page.getByLabel('Move to').selectOption({ label: 'The profile’s notes' })
  await page.getByRole('button', { name: 'Move 1 note' }).click()
  await expect(page.getByText(/^Moved 1 note to the profile’s notes\./)).toBeVisible()
  await expect(notes.getByText('Bends migrate downstream.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(/^Moved back\./)).toBeVisible()
  await expect(notes.getByText('Bends migrate downstream.')).toBeVisible()
})
