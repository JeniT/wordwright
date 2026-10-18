import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, goTo, goToIdeas, leaveSettings, openFeeds, showReadItems, test } from './fixtures'

async function signUpWithPublication(page: Page) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.goto('/register')
  await page.getByLabel('What should we call you?').fill('Pia')
  await page.getByLabel('Username').fill(`u${id}`)
  await page.getByLabel('Email').fill(`pia-${id}@example.com`)
  await page.getByLabel('Password').fill('a perfectly good password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Gathering')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
}

const noViolations = async (page: Page, what: string) =>
  expect((await new AxeBuilder({ page }).analyze()).violations, what).toEqual([])

test('reads and takes notes before there is an idea: a publication reading list and notes', async ({
  page,
}) => {
  await signUpWithPublication(page)

  // The publication's own reading list is step 02, Read.
  await goTo(page, 'Read')
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Reading list' })).toBeVisible()
  await expect(page.getByText(/Nothing to read yet/)).toBeVisible()
  await noViolations(page, 'empty publication reading list')

  const address = page.getByLabel('Web address', { exact: true })
  await address.fill('rubbish')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(page.getByText('Enter a web address, like https://example.com')).toBeVisible()
  await address.fill('example.org/meanders')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toHaveAttribute('href', /\/reading\//)
  await expect(
    page.getByRole('link', { name: /^example\.org Fake title for example\.org/ }),
  ).toHaveAttribute('href', 'https://example.org/meanders')
  await expect(address).toHaveValue('')
  await address.fill('http://www.example.org/meanders/')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(
    page.getByText('That link is already in this publication’s reading list.'),
  ).toBeVisible()
  await noViolations(page, 'publication reading list')

  // Read it, and take a note and a quotation from it.
  await page.getByRole('link', { name: /^Fake title for / }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: /Fake title for example\.org/ }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Back to the reading list/ })).toBeVisible()
  await page.getByLabel('Note', { exact: true }).fill('Rivers tire of straight lines.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Rivers tire of straight lines.')).toBeVisible()
  await page.getByLabel('Note', { exact: true }).fill('Erosion outside, deposition inside.')
  await page.getByRole('checkbox', { name: /quotation/ }).check()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Erosion outside, deposition inside.')).toBeVisible()
  await noViolations(page, 'publication reading page')

  // The list has no limit, and unkept items go after a month: a tick keeps one.
  await page.getByRole('link', { name: /Back to the reading list/ }).click()
  await showReadItems(page) // taking notes marked it read
  const keep = page.getByRole('switch', { name: /^Keep: Fake title for example\.org/ })
  await expect(keep).toBeChecked() // a link the writer added is kept from the start
  await expect(page.getByText('Kept forever')).toBeVisible()
  await keep.uncheck()
  await expect(page.getByText(/^Kept until /)).toBeVisible()
  await page.reload()
  await showReadItems(page)
  await expect(keep).not.toBeChecked()
  await page.getByRole('link', { name: /^Fake title for / }).click()

  // Taking a note marks it read.
  await page.getByRole('link', { name: /Back to the reading list/ }).click()
  await showReadItems(page)
  await expect(
    page.getByRole('switch', { name: /^Read: Fake title for example\.org/ }),
  ).toBeChecked()

  // The notes are the publication's own, naming where each came from, and are not on any idea.
  await goTo(page, 'Notes')
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  const quote = page
    .getByRole('listitem')
    .filter({ hasText: 'Erosion outside, deposition inside.' })
  await expect(quote).toContainText('From Fake title for example.org')
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Rivers tire of straight lines.' }),
  ).toContainText('From Fake title for example.org')

  // Add one of their own: it goes to the top, under the form, and stays there.
  await page.getByLabel('Note', { exact: true }).fill('A thought of my own')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(page.getByRole('main').getByRole('listitem').first()).toContainText(
    'A thought of my own',
  )
  await page.reload()
  await expect(page.getByRole('main').getByRole('listitem').first()).toContainText(
    'A thought of my own',
  )
  await noViolations(page, 'publication notes')
})

test('adds recent posts from the feeds to the publication’s reading list, or ignores them', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await openFeeds(page)
  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('read.example/feed')
  await feeds.getByRole('button', { name: 'Add feed' }).click()
  await expect(
    feeds.getByRole('listitem').filter({ hasText: 'Feed of read.example' }),
  ).toBeVisible()
  await leaveSettings(page)
  await goTo(page, 'Search')

  // The newest posts, with a decision to make about each.
  const recent = page.getByRole('region', { name: 'Recent posts' })
  const title = 'A post in Feed of read.example'
  await expect(recent.getByRole('link', { name: new RegExp(title) })).toBeVisible()
  await noViolations(page, 'recent posts with decisions to make')
  await recent.getByRole('button', { name: `Add to the reading list: ${title}` }).click()
  await expect(recent.getByRole('img', { name: 'In the reading list' })).toBeVisible()
  await expect(recent.getByRole('button', { name: /^Add to the reading list/ })).toHaveCount(0)
  await noViolations(page, 'recent posts after adding')

  // It is on the publication's reading list (on Read), with no chip: most items come from a feed.
  await goTo(page, 'Read')
  const item = page
    .getByRole('region', { name: 'Reading list' })
    .getByRole('listitem')
    .filter({ hasText: title })
  await expect(item).toBeVisible()
  await expect(item).not.toContainText('From a feed')
  await goTo(page, 'Search')

  // Reconsidering takes it off again.
  await recent.getByRole('button', { name: `Take off the reading list: ${title}` }).click()
  await expect(
    recent.getByRole('button', { name: `Add to the reading list: ${title}` }),
  ).toBeVisible()

  // Ignoring is remembered, and can be taken back.
  await recent.getByRole('button', { name: `Ignore: ${title}` }).click()
  await expect(recent.getByRole('img', { name: 'Ignored' })).toBeVisible()
  await page.reload()
  await expect(recent.getByRole('img', { name: 'Ignored' })).toBeVisible()
  await recent.getByRole('button', { name: `Stop ignoring: ${title}` }).click()
  await expect(recent.getByRole('button', { name: `Ignore: ${title}` })).toBeVisible()
})

test('the publication’s own page summarises the feeds and the reading list, and adds to the list', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await openFeeds(page)
  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('read.example/feed')
  await feeds.getByRole('button', { name: 'Add feed' }).click()
  await expect(
    feeds.getByRole('listitem').filter({ hasText: 'Feed of read.example' }),
  ).toBeVisible()

  // The publication's page shows what is waiting in the feeds, and leads to Search.
  await leaveSettings(page)
  const search = page.getByRole('region', { name: 'Search' })
  await expect(search.getByRole('link', { name: /A post in Feed of read\.example/ })).toBeVisible()
  await expect(search.getByRole('link', { name: 'See all posts' })).toBeVisible()

  // A link can be added to the reading list from here, and is on the Read step too.
  const read = page.getByRole('region', { name: 'Read' })
  await expect(read.getByText('Nothing on the reading list yet.')).toBeVisible()
  await page.getByRole('tab', { name: 'Add something to read' }).click()
  await page.getByLabel('Web address').fill('https://example.org/meanders')
  await page.getByRole('button', { name: 'Add something to read' }).click()
  const item = read.getByRole('link', { name: /Fake title for example\.org/ })
  await expect(item).toBeVisible()
  await noViolations(page, 'publication page with feeds and reading list')
  await item.click()
  await expect(
    page.getByRole('heading', { level: 1, name: /Fake title for example\.org/ }),
  ).toBeVisible()
  await page.goBack()
  await read.getByRole('link', { name: /See the reading list/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()
})

test('a post can be added or ignored from the publication’s own page, and the Search page agrees', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await openFeeds(page)
  const feeds = page.getByRole('region', { name: 'Feeds' })
  for (const feed of ['one.example/feed', 'two.example/feed']) {
    await feeds.getByLabel('Add a feed').fill(feed)
    await feeds.getByRole('button', { name: 'Add feed' }).click()
    await expect(
      feeds.getByRole('listitem').filter({ hasText: `Feed of ${feed.split('/')[0]}` }),
    ).toBeVisible()
  }

  // The same rows as the Search page, with icon buttons.
  await leaveSettings(page)
  const search = page.getByRole('region', { name: 'Search' })
  const rows = search.getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await noViolations(page, 'publication page with posts to decide')
  const first = (await rows.first().innerText()).match(/A post in Feed of (\w+)\.example/)![1]!
  const title = `A post in Feed of ${first}.example`
  await search.getByRole('button', { name: `Add to the reading list: ${title}` }).click()
  await expect(search.getByRole('link', { name: title })).toHaveCount(0)
  await expect(rows).toHaveCount(1)

  // Search knows, and so does the reading list.
  await goTo(page, 'Search')
  const recent = page.getByRole('region', { name: 'Recent posts' })
  await expect(recent.getByRole('img', { name: 'In the reading list' })).toBeVisible()
  await goTo(page, 'Read')
  await expect(
    page
      .getByRole('region', { name: 'Reading list' })
      .getByRole('listitem')
      .filter({ hasText: title }),
  ).toBeVisible()
})

test('a post that is added or ignored moves to the end of the recent posts', async ({ page }) => {
  await signUpWithPublication(page)
  await openFeeds(page)
  const feeds = page.getByRole('region', { name: 'Feeds' })
  for (const feed of ['one.example/feed', 'two.example/feed', 'three.example/feed']) {
    await feeds.getByLabel('Add a feed').fill(feed)
    await feeds.getByRole('button', { name: 'Add feed' }).click()
    await expect(
      feeds.getByRole('listitem').filter({ hasText: `Feed of ${feed.split('/')[0]}` }),
    ).toBeVisible()
  }
  await leaveSettings(page)
  await goTo(page, 'Search')
  const recent = page.getByRole('region', { name: 'Recent posts' })
  const rows = recent.getByRole('listitem')
  await expect(rows).toHaveCount(3)

  // Whichever is on top is dealt with, and goes to the bottom, with the others still waiting above it.
  const first = (await rows.first().innerText()).match(/A post in Feed of (\w+)\.example/)![1]!
  await recent
    .getByRole('button', { name: new RegExp(`^Add to the reading list: .*${first}`) })
    .click()
  await expect(rows.last()).toContainText(`A post in Feed of ${first}.example`)
  await expect(rows.last()).toContainText('in the reading list')
  await expect(rows.first()).not.toContainText(first)

  // The next one ignored goes to the very end, after the one added.
  const next = (await rows.first().innerText()).match(/A post in Feed of (\w+)\.example/)![1]!
  await recent.getByRole('button', { name: new RegExp(`^Ignore: .*${next}`) }).click()
  await expect(rows.last()).toContainText(`A post in Feed of ${next}.example`)
  await expect(rows.last()).toContainText('ignored')
  await expect(rows.nth(1)).toContainText(first)
})

test('moves reading items, with their notes, between the publication and an idea, and back', async ({
  page,
}) => {
  await signUpWithPublication(page)
  await goTo(page, 'Read')
  // The publication's own page has an add-a-link box too: wait for the Read page, or what is typed goes into that one.
  await expect(page.getByRole('heading', { level: 1, name: 'Read' })).toBeVisible()
  const address = page.getByLabel('Web address', { exact: true })
  for (const url of ['example.org/rivers', 'example.com/lakes']) {
    await address.fill(url)
    await page.getByRole('button', { name: 'Add item' }).click()
    await expect(
      page.getByRole('link', { name: new RegExp(`^Fake title for ${url.split('/')[0]}`) }),
    ).toBeVisible()
    await expect(address).toHaveValue('')
  }
  // A note taken from the first (which marks it read, so it is hidden until shown).
  await page
    .getByRole('link', { name: /^Fake title for / })
    .first()
    .click()
  await page.getByLabel('Note', { exact: true }).fill('Rivers tire of straight lines.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Rivers tire of straight lines.')).toBeVisible()
  await page.getByRole('link', { name: /Back to the reading list/ }).click()
  await showReadItems(page)

  // Move both to a new idea. The note goes with its item, and the message says what moved.
  await page.getByRole('checkbox', { name: /^Select Fake title for example\.org/ }).check()
  await page.getByRole('checkbox', { name: /^Select Fake title for example\.com/ }).check()
  await page.getByRole('button', { name: 'Move to…' }).click()
  await page.getByLabel(/^Move( .*)? to$/).selectOption({ label: 'A new idea…' })
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await noViolations(page, 'choosing where to move reading items')
  await page.getByRole('button', { name: 'Move 2 items' }).click()
  await expect(page.getByText('Moved 2 items and 1 note to “Why rivers meander”.')).toBeVisible()
  await expect(page.getByText(/Nothing to read yet/)).toBeVisible()

  // They are on the idea, with the note.
  await goToIdeas(page)
  await page
    .getByRole('region', { name: 'Ideas', exact: true })
    .getByRole('link', { name: /Why rivers meander/ })
    .click()
  // Wait for the idea itself: until then the menu is still the publication's, and its Notes link goes to the wrong place.
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
  await goTo(page, 'Notes')
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByText('Rivers tire of straight lines.')).toBeVisible()
  await goTo(page, 'Research')
  await showReadItems(page)
  await expect(
    page.getByRole('link', { name: 'Fake title for example.org', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.com', exact: true }),
  ).toBeVisible()

  // And one goes back to the publication's own list, then back again with Undo.
  await page.getByRole('checkbox', { name: /^Select Fake title for example\.com/ }).check()
  await page.getByRole('button', { name: 'Move to…' }).click()
  await page.getByLabel(/^Move( .*)? to$/).selectOption({ label: 'The publication’s reading list' })
  await page.getByRole('button', { name: 'Move 1 item' }).click()
  await expect(
    page.getByText('Moved 1 item to the publication’s reading list.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.com', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Moved back.')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Fake title for example.com', exact: true }),
  ).toBeVisible()
})

test('from a post in a feed to a new idea: read, take notes, then gather the notes into an idea', async ({
  page,
}) => {
  await signUpWithPublication(page)
  // A feed, and its newest post added to the reading list.
  await openFeeds(page)
  const feeds = page.getByRole('region', { name: 'Feeds' })
  await feeds.getByLabel('Add a feed').fill('read.example/feed')
  await feeds.getByRole('button', { name: 'Add feed' }).click()
  await expect(
    feeds.getByRole('listitem').filter({ hasText: 'Feed of read.example' }),
  ).toBeVisible()
  await leaveSettings(page)
  await goTo(page, 'Search')
  const recent = page.getByRole('region', { name: 'Recent posts' })
  const title = 'A post in Feed of read.example'
  await recent.getByRole('button', { name: `Add to the reading list: ${title}` }).click()
  await expect(recent.getByRole('img', { name: 'In the reading list' })).toBeVisible()
  await goTo(page, 'Read')

  // Read it, taking two notes, and jot one down of the writer's own.
  await page.getByRole('link', { name: title, exact: true }).click()
  for (const text of ['The feed made me think about erosion.', 'Bends migrate downstream.']) {
    await page.getByLabel('Note', { exact: true }).fill(text)
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText(text)).toBeVisible()
  }
  await page.getByRole('link', { name: /Back to the reading list/ }).click()
  await goTo(page, 'Notes')
  await page.getByLabel('Note', { exact: true }).fill('An unrelated thought')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(page.getByText('An unrelated thought')).toBeVisible()

  // Choose the two notes from the post, and say plainly what will happen before doing it.
  await page.getByRole('checkbox', { name: /^Select note “The feed made me think/ }).check()
  await page.getByRole('checkbox', { name: /^Select note “Bends migrate/ }).check()
  await page.getByRole('button', { name: 'Move to…' }).click()
  await page.getByLabel(/^Move( .*)? to$/).selectOption({ label: 'A new idea…' })
  await page.getByLabel("What's your core idea?").fill('Why rivers meander')
  await expect(
    page.getByText('The page they were taken from will be copied to its reading list.'),
  ).toBeVisible()
  await noViolations(page, 'moving notes to a new idea')
  await page.getByRole('button', { name: 'Move 2 notes' }).click()
  await expect(page.getByText(/^Moved 2 notes to “Why rivers meander”\./)).toBeVisible()
  await expect(page.getByText('An unrelated thought')).toBeVisible() // the other stays
  await expect(page.getByText('Bends migrate downstream.')).toHaveCount(0)

  // The idea has the notes, and the post they came from on its reading list (the original is still on the publication's).
  await goToIdeas(page)
  await page
    .getByRole('region', { name: 'Ideas', exact: true })
    .getByRole('link', { name: /Why rivers meander/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Why rivers meander' })).toBeVisible()
  await goTo(page, 'Notes')
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  const notes = page.getByRole('region', { name: 'Notes' })
  await expect(notes.getByText('Bends migrate downstream.')).toBeVisible()
  await expect(
    notes.getByRole('link', { name: /A post in Feed of read.example/ }).first(),
  ).toBeVisible()
  await goTo(page, 'Research')
  await showReadItems(page)
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
  await goTo(page, 'Notes')

  // And a note can go on to another place: back to the publication, with Undo to put it where it was.
  await page.getByRole('checkbox', { name: /^Select note “Bends migrate/ }).check()
  await page.getByRole('button', { name: 'Move to…' }).click()
  await page.getByLabel(/^Move( .*)? to$/).selectOption({ label: 'The publication’s notes' })
  await page.getByRole('button', { name: 'Move 1 note' }).click()
  await expect(page.getByText(/^Moved 1 note to the publication’s notes\./)).toBeVisible()
  await expect(notes.getByText('Bends migrate downstream.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(/^Moved back\./)).toBeVisible()
  await expect(notes.getByText('Bends migrate downstream.')).toBeVisible()
})

test('moves a note into another of the writer’s publications, and puts it back', async ({
  page,
}) => {
  await signUpWithPublication(page)
  const idOf = () => new URL(page.url()).pathname.split('/')[2]!
  const first = idOf()
  await goTo(page, 'Notes')
  await page.getByLabel('Note', { exact: true }).fill('Belongs elsewhere')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(page.getByText('Belongs elsewhere')).toBeVisible()

  // A second publication, so that "Another publication…" is offered.
  await page.goto('/')
  await page.getByRole('link', { name: 'New publication' }).click()
  await page.getByLabel('Publication name', { exact: true }).fill('Elsewhere')
  await page.getByRole('button', { name: 'Create publication' }).click()
  await expect(page.getByRole('heading', { name: 'Ideas', exact: true })).toBeVisible()
  const second = idOf()

  await page.goto(`/p/${first}/notes`)
  await page.getByRole('button', { name: /^Move note “Belongs elsewhere/ }).click()
  await page.getByLabel(/^Move( .*)? to$/).selectOption({ label: 'Another publication…' })
  await page.getByLabel('Which publication').selectOption({ label: 'Elsewhere' })
  await page.getByLabel('Move into').selectOption({ label: '“Elsewhere”’s notes' })
  await noViolations(page, 'choosing another publication to move to')
  await page.getByRole('dialog').getByRole('button', { name: 'Move 1 note' }).click()
  await expect(page.getByText(/^Moved 1 note to “Elsewhere”’s notes\./)).toBeVisible()
  await expect(page.getByText('Belongs elsewhere')).toHaveCount(0)

  // Undo asks the publication it went to to send it back.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(/^Moved back\./)).toBeVisible()
  await expect(page.getByText('Belongs elsewhere')).toBeVisible()

  // Moved again, it is there.
  await page.getByRole('button', { name: /^Move note “Belongs elsewhere/ }).click()
  await page.getByLabel(/^Move( .*)? to$/).selectOption({ label: 'Another publication…' })
  await page.getByLabel('Which publication').selectOption({ label: 'Elsewhere' })
  await page.getByLabel('Move into').selectOption({ label: '“Elsewhere”’s notes' })
  await page.getByRole('dialog').getByRole('button', { name: 'Move 1 note' }).click()
  await expect(page.getByText(/^Moved 1 note to “Elsewhere”’s notes\./)).toBeVisible()
  await page.goto(`/p/${second}/notes`)
  await expect(page.getByText('Belongs elsewhere')).toBeVisible()
})
